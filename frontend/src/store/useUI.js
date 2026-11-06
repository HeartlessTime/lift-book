import { create } from 'zustand'
import { uid } from '../lib/format.js'
import { beep } from '../lib/sound.js'
import { warn, tap } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'
import { useStore } from './useStore.js'

// On the iOS shell this timer is mirrored onto the lock-screen workout card by lib/nativeSets.js,
// which watches `timer` — nothing here talks to native, so a failed card cannot stop a rest.

let toastTm = null
let celebTm = null
let timerInt = null
let timerTick = null
let workInt = null
let workTick = null
let workDone = null

// Matches --t-exit in styles/_motion.css. If one moves, move the other.
export const EXIT_MS = 160

// Puts a celebration in the slot and starts its clock. Module scope rather than a store
// action because both queueCelebration and endCelebration need it and neither is the
// natural owner.
function startCeleb(set, get, item) {
  set({ celebration: item })
  // A celebration is decoration around something that already happened. If whatever it
  // wants to open throws, the set is still logged and the workout still ends — so this can
  // report nothing and must interrupt nothing.
  try { if (item.onStart) item.onStart() } catch (e) { /* */ }
  if (item.ttl) celebTm = setTimeout(() => get().endCelebration(item.id), item.ttl)
}

export const useUI = create((set, get) => ({
  sheets: [],          // { id, render:(close)=>JSX, kind:'sheet'|'center', locked, closing }
  toastMsg: '',
  timer: null,         // rest countdown between sets — { left, total, endsAt }
  work: null,          // work countdown DURING a timed set (issue #16) — { left, total, endsAt, label }

  openSheet(render, { kind = 'sheet', locked = false } = {}) {
    const id = uid()
    set(s => ({ sheets: [...s.sheets, { id, render, kind, locked }] }))
    const close = () => get().closeSheet(id)
    return { id, close, lock: v => set(s => ({ sheets: s.sheets.map(x => x.id === id ? { ...x, locked: v } : x) })) }
  },
  // Closing is two steps, not one. A sheet that is simply spliced out of this array
  // disappears on the next frame — no slide, no fade, the single loudest "this is a web
  // page" tell the app had. So it is marked `closing` first, which is what the CSS animates
  // against, and only removed EXIT_MS later. Modals.jsx already did exactly this by hand for
  // swipe-to-dismiss; this is that mechanism generalised rather than a second one beside it.
  // Callers are unchanged: close() still means close.
  closeSheet(id) {
    const cur = get().sheets.find(x => x.id === id)
    if (!cur || cur.closing) return          // a double tap on the backdrop must not queue two
    set(s => ({ sheets: s.sheets.map(x => x.id === id ? { ...x, closing: true } : x) }))
    setTimeout(() => set(s => ({ sheets: s.sheets.filter(x => x.id !== id) })), EXIT_MS)
  },
  closeAll() {
    if (!get().sheets.length) return
    set(s => ({ sheets: s.sheets.map(x => ({ ...x, closing: true })) }))
    // Only the sheets that were open when closeAll ran: one opened during the exit (a flow
    // that closes one sheet and immediately opens the next) must survive.
    const ids = new Set(get().sheets.map(x => x.id))
    setTimeout(() => set(s => ({ sheets: s.sheets.filter(x => !ids.has(x.id)) })), EXIT_MS)
  },

  /* ---- celebration queue ----
     One tap can earn two moments at once: the last set of the session is also a personal
     record, so the PR banner and the end-of-workout sheet both fire on the same frame, and
     the banner lands on top of the dialog. Apple's answer in Fitness is to cancel the
     Activity-ring fireworks outright when two collide, which is honest but throws away a
     moment nobody got to see. This takes turns instead.

     One slot, one FIFO behind it. Whatever is at the front runs; the next only starts when
     that one ends. A celebration with a `ttl` ends itself on a clock — that is the banner,
     which is a sentence with a reading time. One without ends when its own close handler
     says so. `onStart` is what actually opens the thing, and it runs when the item reaches
     the front rather than when it was earned, which is the entire point.

     Every celebration carries a ttl in practice, including the ones that open a dialog: a
     dialog waits for a tap, and a tap that never comes would leave the slot occupied for the
     rest of the app's life and silently swallow every record in every later session. The ttl
     there is the length of the *moment*, not of the dialog — the sheet stays up after its
     celebration has ended, which is correct, because by then there is nothing left to
     collide with.
  */
  celebration: null,   // the one playing now — { id, kind, ttl, onStart, ...payload }
  celebQueue: [],      // earned but waiting, oldest first

  queueCelebration(c) {
    const item = { ...c, id: uid() }
    if (get().celebration) { set(s => ({ celebQueue: [...s.celebQueue, item] })); return item.id }
    startCeleb(set, get, item)
    return item.id
  },
  // `id` is a guard, not a lookup: a stale timer, or a banner unmounting after its
  // replacement has already started, must not be able to end someone else's moment. Called
  // with no id it means "end whatever is current", which is what a close handler wants.
  endCelebration(id) {
    const cur = get().celebration
    if (!cur || (id && cur.id !== id)) return
    clearTimeout(celebTm); celebTm = null
    const [next, ...rest] = get().celebQueue
    set({ celebration: null, celebQueue: rest })
    if (next) startCeleb(set, get, next)
  },
  // Everything still pending is now moot — the workout was discarded, or the finish summary
  // is about to open and is a bigger moment than anything queued behind it. Clearing first
  // and queueing second is how the summary gets the slot with no wait: making it line up
  // behind a banner would put a two-second lag on a button press, and a delay you caused by
  // tapping is worse than an overlap you didn't.
  clearCelebrations() {
    clearTimeout(celebTm); celebTm = null
    set({ celebration: null, celebQueue: [] })
  },

  toast(msg) {
    set({ toastMsg: msg })
    clearTimeout(toastTm)
    toastTm = setTimeout(() => set({ toastMsg: '' }), 2200)
  },

  // `next` describes the set the rest is buying time for ("82.5 × 8 · set 3 of 4"). It is the
  // one thing worth reading from across the garage with the phone propped up, and the bar had
  // no idea what came next. Optional: an old caller passing only seconds still works.
  // `meta.endsAt`/`meta.total` pick up a rest already running — one started or stretched from
  // the lock screen — so the bar resumes part-drained rather than starting over.
  startRest(sec, next, meta) {
    get().stopRest()
    const endsAt = (meta && meta.endsAt) || Date.now() + sec * 1000
    const total = Math.max(sec, (meta && meta.total) || sec)
    set({ timer: { left: sec, total, endsAt, next: next || '' } })
    timerTick = () => {
      const tm = get().timer
      if (!tm) return
      const left = Math.max(0, Math.round((tm.endsAt - Date.now()) / 1000))
      if (left === tm.left) return
      const snd = useStore.getState().S.sound
      if (left <= 0) {
        beep(snd, 880, 0.15); beep(snd, 880, 0.15, 0.25); beep(snd, 1320, 0.4, 0.5)
        warn(); get().toast(t('Rest over — next set')); get().stopRest(); return
      }
      if (left <= 3) beep(snd, 660, 0.1)
      set({ timer: { ...tm, left } })
    }
    timerInt = setInterval(timerTick, 1000)
    document.addEventListener('visibilitychange', timerTick)
  },
  addRest(sec) {
    const tm = get().timer
    if (!tm) return
    const left = tm.left + sec
    // taking off more than is left means "I'm ready now" — same as skipping, and it keeps a
    // negative duration out of both the progress bar and the lock-screen card
    if (left <= 0) { get().stopRest(); return }
    const endsAt = tm.endsAt + sec * 1000
    set({ timer: { ...tm, left, total: tm.total + sec, endsAt } })
  },
  stopRest() {
    if (timerInt) clearInterval(timerInt); timerInt = null
    if (timerTick) document.removeEventListener('visibilitychange', timerTick); timerTick = null
    set({ timer: null })
  },

  /* ---- work timer (issue #16) ----
     Times the set itself, not the recovery after it. Kept separate from the rest timer on
     purpose: the two mean opposite things, they must never run together, and a work set is
     something you are watching — so it gets no lock-screen card ("rest over" is the wrong
     thing to say, and a plank does not need a notification you are staring at anyway).
     `onDone(elapsedSec)` is called both when the countdown reaches zero and on an early
     finish; the elapsed time is what actually gets logged, so stopping at 0:38 of a 0:45
     hold records 0:38 rather than crediting the full target. */
  startWork(sec, label, onDone) {
    get().stopWork()
    get().stopRest()
    const total = Math.max(1, Math.round(sec) || 1)
    const endsAt = Date.now() + total * 1000
    workDone = onDone
    set({ work: { left: total, total, endsAt, label } })
    workTick = () => {
      const wk = get().work
      if (!wk) return
      const left = Math.max(0, Math.round((wk.endsAt - Date.now()) / 1000))
      if (left === wk.left) return
      const snd = useStore.getState().S.sound
      if (left <= 0) {
        beep(snd, 880, 0.15); beep(snd, 880, 0.15, 0.25); beep(snd, 1320, 0.4, 0.5)
        warn()
        const done = workDone
        get().stopWork()
        if (done) done(wk.total)
        return
      }
      if (left <= 3) beep(snd, 660, 0.1)
      set({ work: { ...wk, left } })
    }
    workInt = setInterval(workTick, 1000)
    document.addEventListener('visibilitychange', workTick)
  },
  // Ended the hold early — log what was actually held.
  finishWorkEarly() {
    const wk = get().work
    if (!wk) return
    const elapsed = Math.max(1, wk.total - wk.left)
    const done = workDone
    tap()
    get().stopWork()
    if (done) done(elapsed)
  },
  // Abandon without logging anything.
  stopWork() {
    if (workInt) clearInterval(workInt); workInt = null
    if (workTick) document.removeEventListener('visibilitychange', workTick); workTick = null
    workDone = null
    set({ work: null })
  }
}))
