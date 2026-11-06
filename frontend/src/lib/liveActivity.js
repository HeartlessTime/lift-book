import { Capacitor, registerPlugin } from '@capacitor/core'

/* The bridge to the lock-screen workout card (and its Dynamic Island), in both directions.

   Outbound is one call: `syncCard(snapshot)` hands native the whole card as data (see
   lib/workoutCard.js), and native draws it. Nothing here ticks — the elapsed clock and the
   rest countdown are dates iOS counts itself, so an hour-long session costs one call per real
   change rather than one a second.

   Inbound: the card's buttons run natively while the webview is suspended, and
   `pendingNative()` collects what they did the next time the app comes forward.

   No-ops on the web and in Safari's PWA, and never throws: a card that fails to appear must
   not take the workout down with it. */

const Native = registerPlugin('LiveActivity')

// Capacitor answers isPluginAvailable from the native bridge, so this is false in every browser.
export const cardAvailable = () => Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('LiveActivity')

let warned = false
const ready = () => {
  if (cardAvailable()) return true
  // Deliberately noisy on iOS only: a plugin missing from packageClassList fails silently
  // everywhere else, and this line is what found it the first time. See scripts/register-native-plugins.mjs.
  if (Capacitor.getPlatform() === 'ios' && !warned) { warned = true; console.warn('[Lift Book] LiveActivity plugin not registered') }
  return false
}

/// Show (or update) the card for this session. Starts one if none is up; never stacks a second.
export function syncCard(snapshot) {
  if (!ready()) return
  Native.sync(snapshot).catch(() => {})
}

/// The workout is over: take the card down.
export function endCard() {
  if (!ready()) return
  Native.end().catch(() => {})
}

/// Whatever the lock screen did while we were asleep, handed over exactly once.
export async function pendingNative() {
  if (!ready()) return null
  try { return await Native.pending() } catch { return null }
}

/// Called when a lock-screen tap lands while this process is alive, so it is merged as soon
/// as the webview runs again rather than waiting for the next foreground.
export function onNativeChange(fn) {
  if (!ready()) return
  Native.addListener('change', fn).catch(() => {})
}
