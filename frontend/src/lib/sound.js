import { legacy } from './haptics.js'
// WebAudio beeps + haptics (ported from the vanilla app). `enabled` gates sound.

let audioCtx = null
export function beep(enabled, freq, dur, when) {
  if (!enabled) return
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    const o = audioCtx.createOscillator(), g = audioCtx.createGain()
    o.connect(g); g.connect(audioCtx.destination)
    o.frequency.value = freq || 880; o.type = 'sine'
    const t0 = audioCtx.currentTime + (when || 0)
    g.gain.setValueAtTime(0.001, t0)
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + (dur || 0.18))
    o.start(t0); o.stop(t0 + (dur || 0.18) + 0.05)
  } catch (e) { /* */ }
}

// Kept as the back-compat shim it now is: haptics.js owns the Taptic Engine, and it takes
// named intents rather than a duration. Everything new should import from there directly —
// 'a tap' and 'a set was committed' are different things, and a millisecond count cannot
// say which one you meant. `legacy` maps the old number/array argument onto the closest intent.
//
// Never throws and never returns a promise a caller has to think about: a missing Taptic
// Engine or a plugin that failed to register must not be able to interrupt a set.
export function vibrate(p) {
  try { legacy(p) } catch (e) { /* */ }
}
