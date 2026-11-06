// Keeps the display on while a workout is running, so nobody has to unlock their phone
// between sets. Two implementations behind one API, picked at runtime.
//
// Native (iOS shell): a one-line `UIApplication.isIdleTimerDisabled` flag — see
// ios/App/App/KeepAwakePlugin.swift. Nothing to hold, nothing to re-acquire; iOS keeps it
// across backgrounding and the plugin re-asserts on foreground for the cases where it doesn't.
//
// Web: the Screen Wake Lock API. The browser drops the lock on its own whenever the document
// stops being visible (tab switch, app backgrounded, screen locked by hand). A one-shot request
// therefore works exactly once and then silently dies, which is why `wanted` is kept as our own
// intent and the lock is re-acquired on every visibilitychange for as long as it holds. That
// path is also what runs in WKWebView if the plugin ever goes missing from packageClassList.
import { useEffect } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'

const Native = registerPlugin('KeepAwake')

// Same check liveActivity.js uses: Capacitor answers isPluginAvailable from the native bridge,
// so this is false in every browser and false in the app too if registration was missed.
const nativeAvailable = () => Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('KeepAwake')

// Settings uses this to decide whether to offer the "Keep screen awake" toggle at all, so the
// native flag has to count as support — otherwise the row disappears on the one platform where
// the feature works best.
export const wakeLockSupported = () => nativeAvailable() || 'wakeLock' in navigator

let sentinel = null       // the live WakeLockSentinel, null when we hold nothing
let wanted = false        // do we currently want the screen to stay on?
let pending = false       // a request() is in flight — don't stack a second one

async function acquire() {
  if (!wanted || sentinel || pending || !('wakeLock' in navigator)) return
  if (document.visibilityState !== 'visible') return   // request() rejects on a hidden document
  pending = true
  try {
    const s = await navigator.wakeLock.request('screen')
    if (!wanted) { s.release().catch(() => {}); return }   // released while we were awaiting
    sentinel = s
    s.addEventListener('release', () => { if (sentinel === s) sentinel = null })
  } catch (e) {
    // iOS refuses in Low Power Mode, and some browsers refuse on low battery. Nothing to
    // do about it and nothing the user could act on — stay quiet and try again next time
    // the document becomes visible.
    sentinel = null
  } finally { pending = false }
}

const onVisible = () => { if (document.visibilityState === 'visible') acquire() }

export function requestWakeLock() {
  if (wanted) return
  wanted = true
  // A screen lock that fails must never take the workout down with it, so the promise is
  // swallowed exactly like the Live Activity calls are.
  if (nativeAvailable()) { Native.enable().catch(() => {}); return }
  document.addEventListener('visibilitychange', onVisible)
  acquire()
}

export function releaseWakeLock() {
  wanted = false
  // Unconditional on purpose: a disable must always land, even if our idea of the state has
  // drifted (hot reload, a second caller), or the screen stays pinned on after the workout.
  if (nativeAvailable()) Native.disable().catch(() => {})
  document.removeEventListener('visibilitychange', onVisible)
  const s = sentinel
  sentinel = null
  if (s) s.release().catch(() => {})
}

// Holds the lock for as long as `enabled` stays true.
export function useWakeLock(enabled) {
  useEffect(() => {
    if (!enabled) return
    requestWakeLock()
    return releaseWakeLock
  }, [enabled])
}
