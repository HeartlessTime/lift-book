// Haptics — named intents, not raw styles.
//
// Callers say what the tap MEANS ("this committed a set"), never which Taptic pattern to
// play. That is the only way the whole app stays consistent when one intent is retuned, and
// it stops the plugin's worst default from leaking out: `Haptics.impact()` with no argument
// is HEAVY, which on a set-complete tick feels like the phone fell over. Nothing in here
// calls impact() without an explicit style.
//
// Four rules this module exists to enforce:
//   1. Fire on pointerdown, never after a React state update. Past roughly 30ms from the
//      visual, the buzz stops reading as "the thing I touched" and starts reading as the
//      phone doing something of its own.
//   2. Never the only feedback. Low Power Mode, Settings ▸ Sounds & Haptics, and every iPad
//      ever made swallow these silently — so every call site also has a visual change.
//   3. Never throws, never returns a promise anyone has to await. A missing Taptic Engine or
//      an unregistered plugin must not be able to interrupt a set.
//   4. `navigator.vibrate` does not exist in iOS WKWebView. It is kept only as the browser
//      fallback; inside the app every call goes through the Capacitor plugin.
import { NATIVE } from './native.js'

// Resolved once and reused. The dynamic import keeps the plugin out of the browser bundle,
// but awaiting it on the first tap would put the buzz ~40ms behind the press — so the module
// is warmed at load time inside the native shell, and every later call hits the cache.
let plugin = null
let warming = null
function warm() {
  if (plugin || warming) return warming
  warming = import('@capacitor/haptics')
    .then(m => { plugin = m; return m })
    .catch(() => { warming = null; return null })
  return warming
}
if (NATIVE) warm()

// Fire-and-forget. `fn(module)` runs as soon as the plugin is in hand — synchronously on
// every call after the first.
function fire(fn) {
  try {
    if (!NATIVE) return
    if (plugin) { Promise.resolve(fn(plugin)).catch(() => {}); return }
    warm()?.then(m => { if (m) try { fn(m) } catch (e) { /* */ } }).catch(() => {})
  } catch (e) { /* */ }
}

// Browser fallback only — Android Chrome and desktop dev. iOS never reaches this.
function web(pattern) {
  try { if (!NATIVE && navigator.vibrate) navigator.vibrate(pattern) } catch (e) { /* */ }
}

/* ------------------------------------------------------------------ intents -- */

// A discrete tap that changed something: tab switch, toggle, plain button.
export function tap() {
  fire(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
  web(10)
}

// A value moved through a series — stepper, slider detent, segmented cell. This is the one
// iOS itself uses for pickers, and it is deliberately fainter than a tap: it fires often.
export function select() {
  fire(({ Haptics }) => Haptics.selectionChanged())
  web(8)
}

// Something was recorded. The set-complete tick — the most-felt haptic in the app.
export function commit() {
  fire(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Medium }))
  web(18)
}

// A whole thing finished — workout saved, import landed.
export function success() {
  fire(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success }))
  web([18, 60, 18])
}

// Something needs looking at, but nothing broke. Also what the rest-over alarm uses.
export function warn() {
  fire(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Warning }))
  web([28, 80, 28])
}

// A personal record. iOS has no arbitrary-duration vibration, so a "pattern" is a short
// sequence of real haptics rather than a buzz of a chosen length — success, then two rising
// impacts. Spaced wide enough (90ms) that the Taptic Engine actually plays all three instead
// of coalescing them into one thud.
export function celebrate() {
  fire(({ Haptics, ImpactStyle, NotificationType }) => {
    Haptics.notification({ type: NotificationType.Success }).catch(() => {})
    setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}), 90)
    setTimeout(() => Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {}), 180)
  })
  web([20, 70, 20, 70, 40])
}

// Back-compat for lib/sound.js's `vibrate(p)`: a number is a tap, an array is the rest-over
// pattern. Kept so the four existing call sites keep working unchanged.
export function legacy(p) {
  if (Array.isArray(p)) return warn()
  const ms = Number(p) || 0
  if (ms >= 100) return warn()
  if (ms >= 50) return commit()
  return tap()
}

export default { tap, select, commit, success, warn, celebrate, legacy }
