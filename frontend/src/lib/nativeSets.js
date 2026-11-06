import { pendingNative, syncCard, endCard, onNativeChange, cardAvailable } from './liveActivity.js'
import { cardSnapshot, applyNativeEvents, forwardPlan } from './workoutCard.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { finishWorkout } from '../sheets.jsx'
import { t } from './i18n.js'

/* Keeps the lock-screen workout card and the live session in step, both ways.

   Out: whenever the workout or the rest timer changes, the card is re-sent (coalesced, and only
   when it actually changed). The card follows `S.active`: it goes up when a workout starts or
   the app opens on one already running, and comes down on finish or discard.

   In: with the phone locked the webview is suspended, so the card's buttons act natively
   (ios/App/RestTimerWidget/RestTimerBridge.swift) and are collected here the moment the app
   comes forward. Draining is one-way and one-time: native hands each tap over exactly once.

   The two directions must not cross. While the lock screen's taps are being merged, nothing is
   sent out — otherwise a tick of the in-app timer racing the merge would push the web layer's
   stale view over what he just did on the lock screen. So `holding` pauses the outbound side,
   and the merge ends by sending the merged card. */

// A lock-screen "Finish" opens the app to finish. Honoured only if it is fresh: a flag found
// hours later must never end a workout he has since carried on with.
const FINISH_FRESH_MS = 2 * 60 * 1000

let busy = false
let holding = true      // until the first merge after launch — see watchNativeSets
let pushTm = null
let lastSent = null

const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible'

function flush() {
  clearTimeout(pushTm); pushTm = null
  if (holding) return
  const snap = cardSnapshot(useStore.getState().S, useUI.getState().timer)
  const key = snap ? JSON.stringify(snap) : ''
  if (key === lastSent) return
  lastSent = key
  if (snap) syncCard(snap); else endCard()
}

function schedule() {
  // A lock-screen tap can wake this process in the background, and a webview hydrating in the
  // dark must not push its own idea of the workout over the tap it was woken for.
  if (!visible()) return
  clearTimeout(pushTm)
  pushTm = setTimeout(flush, 120)
}

export async function syncNativeSets() {
  if (busy || !useStore.getState().ready) return
  busy = true
  holding = true
  // A change still waiting to go out means native is behind us, so its rest is not news.
  const behind = pushTm != null
  try {
    const res = await pendingNative()
    const A0 = useStore.getState().S.active
    if (!res || !A0) return   // nothing live to merge into; the queue is dropped

    let got = { done: 0, skipped: 0 }
    if ((res.events || []).length) {
      useStore.getState().update(s => { if (s.active) got = applyNativeEvents(s.active, res.events) })
    }

    // The rest, as the lock screen left it: stretched with +15s, skipped, or started by a set
    // ticked there. Native only knows about this session if we told it, and only has the last
    // word if nothing newer is still on its way to it.
    if (res.session === A0.id && !behind) {
      const ui = useUI.getState()
      const tm = ui.timer
      const ends = res.restEndsAt || 0
      if (ends > Date.now() + 500) {
        if (!tm || Math.abs(tm.endsAt - ends) > 1000) {
          const S = useStore.getState().S
          const next = (forwardPlan(S)[0] || {}).setLine || ''
          const began = res.restStartedAt > 0 && res.restStartedAt < ends ? res.restStartedAt : Date.now()
          ui.startRest(Math.round((ends - Date.now()) / 1000), next,
            { endsAt: ends, total: Math.round((ends - began) / 1000) })
        }
      } else if (tm) {
        // Skipped on the lock screen, or the set that ended it was the last of an exercise
        // (the app never rests between exercises).
        ui.stopRest()
      }
    }

    if (got.done || got.skipped) {
      useUI.getState().toast(got.done === 1
        ? t('Logged 1 set from the lock screen')
        : got.done > 1 ? t('Logged {0} sets from the lock screen', got.done) : t('Updated from the lock screen'))
    }
    if (res.finishAt > Date.now() - FINISH_FRESH_MS && useStore.getState().S.active) finishWorkout()
  } catch { /* the lock screen is a convenience; it must never break the app */ }
  finally {
    busy = false
    holding = false
    // Always re-sent after a merge, even unchanged: iOS ends a Live Activity after eight hours
    // and he can swipe one away, and this is where a workout still running gets its card back.
    lastSent = null
    flush()
  }
}

/// Runs on every foreground, and once the store has finished loading.
export function watchNativeSets() {
  if (!cardAvailable()) return
  const run = () => { if (visible()) syncNativeSets() }
  document.addEventListener('visibilitychange', () => {
    // Going to the background with a change still queued: send it now, while we still can.
    // That is the set he ticked on his way to locking the phone.
    if (!visible()) { if (pushTm && !busy) flush(); return }
    run()
  })
  window.addEventListener('focus', run)
  onNativeChange(run)

  useStore.subscribe((s, p) => { if (s.S !== p.S) schedule() })
  useUI.subscribe((s, p) => {
    const a = s.timer, b = p.timer
    if (!a !== !b || (a && (a.endsAt !== b.endsAt || a.total !== b.total))) schedule()
  })

  if (useStore.getState().ready) run()
  else {
    const un = useStore.subscribe(s => { if (s.ready) { un(); run() } })
  }
}
