// Instant press feedback, app-wide.
//
// `:active` is not good enough on iOS. WKWebView deliberately withholds it for a beat to work
// out whether the touch is going to become a scroll, so a tap that IS a tap gets its highlight
// late — which is most of the difference between "native app" and "website" on a phone. This
// listens for `pointerdown` and marks the element immediately, then takes the mark away if the
// finger turns out to be scrolling. Same bargain a UIButton makes.
//
// One delegated listener on the document rather than handlers on several hundred elements: the
// app re-renders set rows dozens of times a session and this must cost nothing per render.
//
// The stylesheet reads `[data-press]`; every rule that paints it sits beside its component's
// own `:active` rule in _motion.css, so the two can never disagree.

// Anything the app treats as tappable. `.sld` is deliberately absent — the slider captures the
// pointer itself and has its own knob response.
const TAPPABLE = [
  'button', '[role="button"]', '[role="switch"]', '[role="checkbox"]',
  '.item', '.lrow.tap', '.chip', '.tile.tappable', '.wday', '.cal-d',
  '.swatch', '.glyph-cell', '.today-row', '.hm-c', '.noteline',
].join(',')

const SLOP = 10        // px of drift before the touch is read as a scroll, not a press
let held = null
let origin = null

function release() {
  if (held) { delete held.dataset.press; held = null }
  origin = null
}

function down(e) {
  // Secondary buttons and synthetic events never count; a two-finger gesture isn't a press.
  if (e.button != null && e.button > 0) return
  release()
  const el = e.target && e.target.closest && e.target.closest(TAPPABLE)
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return
  held = el
  origin = { x: e.clientX, y: e.clientY }
  el.dataset.press = '1'
}

function move(e) {
  if (!held || !origin) return
  if (Math.abs(e.clientX - origin.x) > SLOP || Math.abs(e.clientY - origin.y) > SLOP) release()
}

let bound = false
export function bindPress() {
  if (bound || typeof document === 'undefined') return
  bound = true
  // Capture phase so a component calling stopPropagation can't swallow the highlight, and
  // passive so none of this can ever hold up a scroll.
  const opts = { capture: true, passive: true }
  document.addEventListener('pointerdown', down, opts)
  document.addEventListener('pointermove', move, opts)
  document.addEventListener('pointerup', release, opts)
  document.addEventListener('pointercancel', release, opts)
  // A sheet opening under the finger, or a row that re-renders away mid-press, would otherwise
  // leave the mark behind on a detached node.
  window.addEventListener('blur', release)
  document.addEventListener('visibilitychange', release)
  window.addEventListener('scroll', release, { passive: true, capture: true })
}
