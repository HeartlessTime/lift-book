// Motion preferences, readable from JS.
//
// The stylesheet honours `prefers-reduced-motion` and `prefers-reduced-transparency` on its
// own, but anything driven from JavaScript — a number roll, a stroke draw-on, a View
// Transition — has to ask. One module so there is one answer.
//
// Reduced motion here does NOT mean "no feedback". A blanket `animation:none` (what this app
// shipped before) deletes the confirmation signal along with the decoration: a set ticks and
// nothing visibly happens. The rule instead is: no travel, no springs, no overshoot, no
// parallax — but keep a short opacity cross-fade so every state change is still visible.
import { useEffect, useState } from 'react'

export const CROSSFADE_MS = 180   // what a reduced-motion transition is allowed to cost

const QUERIES = {
  motion: '(prefers-reduced-motion: reduce)',
  transparency: '(prefers-reduced-transparency: reduce)',
}

function match(q) {
  try { return !!window.matchMedia && window.matchMedia(q).matches } catch (e) { return false }
}

export const reducedMotion = () => match(QUERIES.motion)
export const reducedTransparency = () => match(QUERIES.transparency)

// Duration to actually use. Pass what you wanted; get what the device will tolerate.
export const dur = ms => (reducedMotion() ? Math.min(ms, CROSSFADE_MS) : ms)

function useQuery(q) {
  const [on, setOn] = useState(() => match(q))
  useEffect(() => {
    let mq
    try { mq = window.matchMedia(q) } catch (e) { return }
    const sync = () => setOn(mq.matches)
    sync()
    // Safari only grew addEventListener on MediaQueryList in 14; the app targets far newer,
    // but addListener costs one line and can never be the reason a preference is ignored.
    if (mq.addEventListener) { mq.addEventListener('change', sync); return () => mq.removeEventListener('change', sync) }
    mq.addListener(sync); return () => mq.removeListener(sync)
  }, [q])
  return on
}

export const useReducedMotion = () => useQuery(QUERIES.motion)
export const useReducedTransparency = () => useQuery(QUERIES.transparency)

// NO VIEW-TRANSITION HELPER LIVES HERE, deliberately, and this note is the headstone for the
// one that did. `withViewTransition(fn)` shipped in this file with no caller, because by the
// time the route animation was built the API had already been ruled out twice over — React
// Router 7's `viewTransition` only exists on the data router and this app mounts HashRouter,
// and a hand-rolled `startViewTransition` cannot see a DOM that HashRouter updates inside
// `React.startTransition`. The long version is at the top of styles/nav-motion.css. An
// exported helper that the app has decided against is worse than no helper: the next person
// to want a page transition finds it, uses it, and gets a silent no-op.
