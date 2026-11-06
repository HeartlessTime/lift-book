import { create } from 'zustand'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { localTZ } from '../lib/format.js'
import { registerCustom } from '../lib/exercises.js'
import { DEFAULT_GEAR } from '../lib/gear.js'
import { DEMO, DEMO_SEEDED } from '../lib/demo.js'
import { NATIVE, nativeLoad, nativeSave, nativeLoadUser, nativeSaveUser, syncReminder } from '../lib/native.js'

const KEY = 'gym_state_v1'
export const DEF = {
  unit: 'kg', restSec: 90, sound: true, keepAwake: true, lang: 'en',
  theme: 'dark', accent: 'lime', body: 'male', targetW: null,
  bodyweight: [], routines: [], week: {}, dayPlan: {},
  exWeights: {}, workouts: [], active: null, customEx: [], gifSize: 'full',
  // effort: which per-set effort scale is logged — 'none' | 'rir' | 'rpe'. null, not 'none', so
  // that a profile which never chose (loaded state is overlaid on DEF, on every path: local,
  // server pull, backup import) still falls back to the `showRir` boolean this replaced and
  // keeps the column it had. See effortOf.
  reminder: { on: false, time: '08:00', tz: null },
  // Nightly weigh-in nudge. Separate from `reminder` on purpose: that one fires on training
  // mornings, this one fires every night whether you trained or not.
  weighIn: { on: false, time: '21:00', tz: null }, effort: null,
  // The gym's gear and his standing limits (lib/gear.js). Loaded state is always overlaid on DEF
  // (localStorage, server pull, merge, backup import), so a profile saved before this existed is
  // seeded with it on its next load — that overlay is the migration.
  gear: DEFAULT_GEAR
}
const clone = o => JSON.parse(JSON.stringify(o))

function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return Object.assign(clone(DEF), JSON.parse(raw))
  } catch (e) { /* ignore */ }
  return clone(DEF)
}

const hasData = st => !!((st.workouts || []).length || (st.routines || []).length || (st.bodyweight || []).length)

// The stored _ts this device last saw from the server. Sent back with every push so the server can
// refuse a write from a device that never read its newest copy, and used here to tell "I have edits
// the server hasn't got" apart from "the server has a write I haven't got" — the two questions the
// old sync answered with one timestamp comparison, which is how a phone's cached copy could revert
// a weigh-in the scale had already posted. Kept in localStorage so it survives a reload.
const BASE_KEY = 'gym_base_ts'
const baseTs = () => { const n = +localStorage.getItem(BASE_KEY); return n > 0 ? n : null }
const setBaseTs = ts => { if (ts > 0) localStorage.setItem(BASE_KEY, String(ts)); else localStorage.removeItem(BASE_KEY) }

// useUI imports this module, so a static import would close the loop — this only ever runs from an
// async handler, by which time the module is long since evaluated.
const notify = msg => { import('./useUI.js').then(m => m.useUI.getState().toast(msg)).catch(() => {}) }

/* ------------------------------------------------------------------- merge ---- */

// Union two lists by a record key, keeping the order of `older` and appending what only `newer` has.
// Where both sides carry the same record the newer state's copy wins. Records with no key at all
// (nothing the app writes today) are kept from both sides rather than dropped.
function unionBy(key, older, newer) {
  const fresh = new Map()
  ;(newer || []).forEach(x => { if (x && x[key] != null) fresh.set(x[key], x) })
  const seen = new Set()
  const out = []
  ;(older || []).forEach(x => {
    if (!x) return
    if (x[key] == null) { out.push(x); return }
    seen.add(x[key])
    out.push(fresh.get(x[key]) || x)
  })
  ;(newer || []).forEach(x => {
    if (!x) return
    if (x[key] == null || !seen.has(x[key])) out.push(x)
  })
  return out
}
const byDate = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)

/**
 * Merge two versions of the state that have genuinely diverged — this device edited offline while
 * another device (or the scale) wrote to the server.
 *
 * The rule is: never drop a record. Workouts, routines and custom exercises union by id, weigh-ins
 * union by date, and where the same record exists on both sides the newer state's copy wins, as do
 * plain settings. The cost is that deleting something on one device while the other is offline can
 * bring it back — that is the trade on purpose: a resurrected routine is a nuisance you can delete
 * again, a lost workout is gone for good.
 */
export function mergeStates(a, b) {
  const [older, newer] = (b._ts || 0) >= (a._ts || 0) ? [a, b] : [b, a]
  // Settings and anything not handled below come from the newer side, but a key only the older
  // side has (a preference the newer copy predates) survives instead of being reset to a default.
  const out = Object.assign(clone(DEF), clone(older), clone(newer))
  out.workouts = unionBy('id', older.workouts, newer.workouts).sort(byDate)
  out.bodyweight = unionBy('d', older.bodyweight, newer.bodyweight).sort(byDate)
  out.routines = unionBy('id', older.routines, newer.routines)
  out.customEx = unionBy('id', older.customEx, newer.customEx)
  // Per-day plan and weekly schedule: union of both sides' entries, newer wins a clash — so two
  // devices each planning a different day end up with both days planned.
  out.week = { ...(older.week || {}), ...(newer.week || {}) }
  out.dayPlan = { ...(older.dayPlan || {}), ...(newer.dayPlan || {}) }
  // "Start here next time" cache: the heaviest wins, matching every other place that writes it.
  out.exWeights = { ...(older.exWeights || {}) }
  Object.entries(newer.exWeights || {}).forEach(([id, v]) => {
    const cur = out.exWeights[id]
    if (!cur || (v?.w || 0) > (cur.w || 0)) out.exWeights[id] = v
  })
  return out
}

export const useStore = create((set, get) => {
  let pushTm = null
  let saveTm = null
  // The pull in flight when the app comes back to the foreground. A push queued meanwhile waits
  // for it: the server may hold a write this device never saw (routines applied from the Studio,
  // a scale weigh-in), and pushing first would only earn a 409 and a merge in which this
  // device's newer clock wins every record both sides have.
  let pullP = null
  const afterPull = fn => (pullP ? pullP.then(fn, fn) : fn())

  // Native app: mirror the state into a file in the app's data directory (survives WebView
  // storage eviction) and keep the native reminder schedule in step with the weekly plan.
  // The server is still the source of truth — this is a durability net under localStorage,
  // not a second copy anything syncs against.
  const nativePersist = () => {
    clearTimeout(saveTm)
    saveTm = setTimeout(() => { saveTm = null; nativeSave(get().S); syncReminder(get().S) }, 800)
  }

  // Writing to localStorage re-serialises the entire training log, and on a stepper tap that is
  // the most expensive thing left on the main thread. So it is coalesced exactly the way the
  // native mirror above already is: the write reads the latest S when it fires, so the newest
  // copy is always what lands, and anything still pending is flushed on the way out (below).
  let lsTm = null
  const saveLocal = () => {
    if (lsTm) return                    // already scheduled — it will pick up this state too
    lsTm = setTimeout(() => { lsTm = null; localStorage.setItem(KEY, JSON.stringify(get().S)) }, 400)
  }
  const flushLocal = () => {
    if (!lsTm) return
    clearTimeout(lsTm)
    lsTm = null
    localStorage.setItem(KEY, JSON.stringify(get().S))
  }

  // `stamp: false` keeps a version's own _ts. Adopting the server's copy must not re-date it, or
  // this device immediately looks newer than the thing it just copied and pushes it straight back.
  const persist = (S, push = true, stamp = true) => {
    if (stamp || !S._ts) S._ts = Date.now()
    registerCustom(S.customEx)
    set({ S })
    saveLocal()
    if (NATIVE) nativePersist()
    if (push && get().user) {
      clearTimeout(pushTm)
      pushTm = setTimeout(() => { pushTm = null; afterPull(() => get().pushState()) }, 1500)
    }
  }

  // Reload, tab close, app backgrounded — whatever is going, the pending localStorage write has
  // to land first. Notably `update(...)` followed straight by `location.reload()` (the error
  // screen's "discard the running workout"), which would otherwise come back to the old copy.
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('pagehide', flushLocal)

  // A setting changed right before switching away/closing the tab must not get lost mid-debounce
  // (e.g. setting the reminder time then immediately backgrounding to test it). In the native
  // app the same applies to the file mirror — backgrounding is often the last thing before the
  // OS kills it.
  document.addEventListener('visibilitychange', () => {
    // Back in front: the app used to pull only at launch, so a phone left open in the background
    // for a day kept a stale copy and pushed its next edit on top of whatever changed since.
    if (document.visibilityState === 'visible') { get().resume(); return }
    if (document.visibilityState !== 'hidden') return
    flushLocal()
    if (NATIVE && saveTm) {
      clearTimeout(saveTm)
      saveTm = null
      nativeSave(get().S)
    }
    if (pushTm) {
      clearTimeout(pushTm)
      pushTm = null
      afterPull(() => get().pushState())
    }
  })

  // Everything a sign-out leaves behind on this device, whichever way it was triggered.
  const clearLocalSession = () => {
    get().setUser(null)
    localStorage.removeItem('gym_guest')
    localStorage.removeItem('gym_dirty')
    localStorage.removeItem(BASE_KEY)
    localStorage.removeItem(KEY)
    persist(clone(DEF), false)
  }

  return {
    S: (() => { const s = loadState(); registerCustom(s.customEx); return s })(),
    user: (() => { try { return JSON.parse(localStorage.getItem('gym_user')) || null } catch { return null } })(),
    ready: false,

    // Mutate a draft of S via producer fn, then persist + schedule sync.
    update(mut, push = true) {
      const S = clone(get().S)
      mut(S)
      persist(S, push)
    },
    // The live session's hot path: a stepper tap, a keystroke, a set ticked off. Same contract as
    // update() — the producer gets a private draft to mutate — but only the one exercise is
    // copied instead of the whole state. Cloning all of history on every tap is what made the
    // steppers lag, and keeping the identity of everything off the mutated path is what lets the
    // views memoise on S.workouts.
    updateEntry(idx, mut, push = true) {
      const S = get().S
      const A = S.active
      const entry = A && A.entries && A.entries[idx]
      if (!entry) return
      const next = clone(entry)
      mut(next)
      const entries = A.entries.slice()
      entries[idx] = next
      persist({ ...S, active: { ...A, entries } }, push)
    },
    replaceState(S, push = false) { persist(clone(S), push) },

    // Foreground again: reconcile with the server before anything is pushed. One pull at a time;
    // a second call while one is running shares it.
    resume() {
      if (DEMO || !get().user || !get().ready) return Promise.resolve()
      if (!pullP) pullP = get().pullState().finally(() => { pullP = null })
      return pullP
    },

    isGuest: () => localStorage.getItem('gym_guest') === '1',
    setGuest(v) { if (v) localStorage.setItem('gym_guest', '1'); else localStorage.removeItem('gym_guest'); set({}) },

    setUser(u) {
      // Switching profiles: the sync token belongs to the old one and would make the next push
      // look like a conflict against someone else's file — which would merge two people's data.
      if (!u || u.id !== get().user?.id) setBaseTs(null)
      if (u) { localStorage.setItem('gym_user', JSON.stringify(u)); localStorage.removeItem('gym_guest') }
      else localStorage.removeItem('gym_user')
      if (NATIVE) nativeSaveUser(u)   // survives a localStorage eviction; see native.js
      set({ user: u })
    },

    // Send this device's copy up. `baseTs` makes it a compare-and-set: the server refuses the write
    // if it holds something this device never read (a scale weigh-in, another phone) instead of
    // letting us overwrite it. `retry` is the one-shot guard on the reconcile below — never a loop.
    async pushState(retry = true) {
      if (!get().user) return
      clearTimeout(pushTm)
      const ts = get().S._ts || null
      try {
        await api('/api/data', { method: 'PUT', body: JSON.stringify({ state: get().S, baseTs: baseTs() }) })
        localStorage.removeItem('gym_dirty')
        setBaseTs(ts)
      } catch (e) {
        // Flag first, whatever went wrong: a set left unsent has to be retried on the next sync.
        localStorage.setItem('gym_dirty', '1')
        if (e.status !== 409) return                    // offline / server down — nothing to resolve
        // Refused as stale. Pull what the server has, merge it in, push the result — pullState()
        // does all three and swallows its own errors. Not retried a second time: another conflict
        // means something else is writing right now, and both copies are safe on disk regardless.
        if (retry) return get().pullState(false)
        notify(t('Couldn’t sync — your changes are safe on this device'))
      }
    },
    // Reconcile with the server. Three outcomes, decided by what each side has changed since the
    // last successful sync (baseTs), not by whose clock reads higher: take the server's copy, push
    // ours, or — when both moved — merge. Merging is what keeps a workout logged on one phone while
    // another was offline; picking a winner there deletes real training history.
    async pullState(retry = true) {
      try {
        const { state } = await api('/api/data')
        const S = get().S
        const srv = state?._ts || 0
        const mine = S._ts || 0
        const base = baseTs()
        const adopt = next => {
          const active = S.active                       // in-progress workout is device-local
          const merged = Object.assign(clone(DEF), next)
          if (active) merged.active = active
          return merged
        }
        if (!state) {                                   // nothing on the server yet
          if (hasData(S)) await get().pushState(retry)
          return
        }
        if (!hasData(S)) {                              // empty device — nothing here to lose
          setBaseTs(srv)
          persist(adopt(state), false, false)
          return
        }
        const dirty = localStorage.getItem('gym_dirty') === '1'
        // With a known base both questions are exact and immune to the two clocks disagreeing.
        // Without one (fresh install, or the first sync after this device updated) fall back to
        // comparing timestamps, plus the dirty flag for edits we know never reached the server.
        const localAhead = base ? (dirty || mine !== base) : (dirty || mine > srv)
        const serverAhead = base ? srv !== base : srv >= mine
        if (!localAhead) {
          if (serverAhead) { setBaseTs(srv); persist(adopt(state), false, false) }
          return
        }
        if (!serverAhead) { await get().pushState(retry); return }
        // Both sides moved on independently.
        setBaseTs(srv)
        persist(adopt(mergeStates(S, state)), false)
        await get().pushState(retry)
        notify(t('Merged changes from another device'))
      } catch (e) { /* offline — keep local */ }
    },

    async signOut() {
      try { await get().pushState(); await api('/api/logout', { method: 'POST', body: '{}' }) } catch (e) { /* */ }
      clearLocalSession()
    },

    // "Sign out everywhere": the server bumps this profile's session version, which kills every
    // session it has on any device — this browser included, so the app has to end up exactly
    // where a normal signOut leaves it. Unlike signOut the request is NOT swallowed: if it fails
    // the sessions elsewhere are all still valid, and wiping this device's copy of the data
    // would sign the user out of the one place the bump didn't reach. Caller reports the error.
    async signOutAll() {
      await get().pushState()   // never throws — stores gym_dirty and moves on when offline
      await api('/api/logout/all', { method: 'POST', body: '{}' })
      clearLocalSession()
    },

    // Demo build only: drop the seeded example profile back in (Settings → "Reset demo data").
    // Dynamic import so the generator never ships in a self-hosted bundle.
    async resetDemo() {
      const { buildDemoState } = await import('../lib/demoSeed.js')
      localStorage.removeItem('gym_dirty')
      persist(Object.assign(clone(DEF), buildDemoState()), false)
    },

    // Boot: ask the server who we are, then pull.
    async boot() {
      // Native app: fold the file mirror back in first. It is the durable local copy —
      // WKWebView localStorage can have been evicted since the last run, and the server may be
      // unreachable at launch (home server asleep, no signal), so without this the app would
      // come up empty. Adopted only when it is at least as new as what localStorage holds, and
      // never re-stamped (`stamp: false`), so the normal pull below still decides against the
      // server on _ts exactly as it does on the web. The mirror never wins over newer server
      // state; it only stops the device from starting out blank.
      if (NATIVE) {
        const saved = await nativeLoad()
        const S = get().S
        if (saved && (!hasData(S) || (saved._ts || 0) >= (S._ts || 0))) {
          persist(Object.assign(clone(DEF), saved), false, false)
        } else if (hasData(S)) {
          nativeSave(S)   // first run after an update from a file-less version: seed the mirror
        }
        // Same idea for the identity: without it an evicted device that also can't reach the
        // server comes up at the sign-in screen instead of at his training log. The pull below
        // still has the last word — a 401 clears the user exactly as it always did.
        if (!get().user) {
          const savedUser = await nativeLoadUser()
          if (savedUser) get().setUser(savedUser)
        }
        syncReminder(get().S)
      }
      // Demo build (GitHub Pages): no backend at all — seed once, stay in guest mode.
      if (DEMO) {
        if (!localStorage.getItem(DEMO_SEEDED)) {
          localStorage.setItem(DEMO_SEEDED, '1')
          await get().resetDemo()
        }
        get().setGuest(true)
        set({ ready: true })
        return
      }
      try {
        const me = await api('/api/me')
        get().setUser(me.user)
        await get().pullState()
        // Re-stamp the reminder's timezone on every load — keeps it correct if you're travelling,
        // without needing to revisit Settings.
        const tz = localTZ()
        if (get().S.reminder?.on && get().S.reminder.tz !== tz) {
          get().update(s => { s.reminder = { ...s.reminder, tz } })
        }
      } catch (e) {
        if (e.status === 401) get().setUser(null)
      }
      set({ ready: true })
    }
  }
})

export { hasData }
