// Rolling numbers — a headline figure counts to its new value instead of snapping.
//
// WHY HAND-ROLLED: @number-flow/react is 6.1 kB gzip and does far more than this app needs
// (per-digit DOM, plural-aware formatting, its own layout engine). Everything here is one
// rAF loop writing textContent — the digits already sit in a tabular-nums column, so the
// glyphs never reflow and there is nothing to lay out. ~60 lines beats 6 kB.
//
// WHEN IT ROLLS — the decision that matters:
//   Only on a change the user is present for. The first value a node ever shows is written
//   by React and left alone; the roll starts at the *second* value. Home and Stats are
//   routes, so switching tabs unmounts them and coming back is a first mount again: the
//   figures are simply there, the way an iOS app's are. What does roll is a change you
//   caused while looking at it — logging a weigh-in on Home, or dragging the range segment
//   on a Stats card from 30d to 1Y. A number that re-counts every time you open a tab is a
//   loading spinner wearing a costume, and reads as one.
//
// CALL-SITE CONTRACT — the ref'd node's only child must be the formatted number:
//     const ref = useRoll(bw.w, fmtNum)
//     <span ref={ref}>{fmtNum(bw.w)}</span>
//
//   Only, because the loop writes `textContent` and that replaces every child. A unit or an
//   icon sharing the node would be wiped for the length of the tween. Pass the same
//   formatter you render with, so the tween's final frame is character-identical to what
//   React already put there and the handoff back is invisible.
import { useEffect, useRef } from 'react'
import { reducedMotion } from './motion.js'

// Long enough to read as counting, short enough that a range tap never feels like a wait
// (house rule 5). Every figure that rolls sits above a range segment, so this is squarely on
// the interactive path: at 420ms it was the slowest thing in the app that a tap could start,
// and the tile had visibly not settled by the time you reached for the next segment.
export const ROLL_MS = 260

const easeOut = p => 1 - Math.pow(1 - p, 3)

/**
 * useRoll(value, format) -> ref
 * `value` is the number; pass null/undefined/NaN for "no reading" and the node is left to
 * React (an em dash, usually). `format` turns a number into the exact string rendered.
 */
export function useRoll(value, format = String, ms = ROLL_MS) {
  const ref = useRef(null)
  const from = useRef(value)   // what the node is currently showing, numerically
  const raf = useRef(0)
  // Call sites pass `v => fmtNum(v) + ' ' + S.unit` inline, so the formatter is a new
  // function on every render. Held in a ref rather than a dependency: as a dependency it
  // would re-run the effect on every render and the cleanup would cancel a tween that was
  // still mid-count. The value is the only thing worth reacting to.
  const fmt = useRef(format)
  fmt.current = format

  useEffect(() => {
    const node = ref.current
    const a = from.current, b = value
    from.current = b
    if (!node) return

    // Nothing to animate: unchanged, unreadable at either end, or the user asked for less
    // motion. Reduced motion still gets the new value instantly — the figure changing IS
    // the information, it is only the counting that is decoration (motion.js).
    const can = Number.isFinite(a) && Number.isFinite(b) && a !== b && !reducedMotion()
    if (!can) return

    // A backgrounded tab freezes rAF, so a tween that starts and then loses the foreground
    // would thaw mid-count, or worse sit on a half-value forever. Refuse to start hidden,
    // and if we lose visibility mid-flight, jump to the end and stop.
    if (document.hidden) return

    const t0 = performance.now()
    const step = now => {
      const p = Math.min(1, (now - t0) / ms)
      node.textContent = fmt.current(a + (b - a) * easeOut(p))
      if (p < 1) raf.current = requestAnimationFrame(step)
      else raf.current = 0
    }
    const stop = () => {
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = 0
      node.textContent = fmt.current(b)   // always land exactly on the real value
    }
    const onHide = () => { if (document.hidden) stop() }

    raf.current = requestAnimationFrame(step)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = 0
      // No final write on unmount: the node is on its way out, and on a *re*-render React
      // owns the text again anyway.
    }
  }, [value, ms])

  return ref
}
