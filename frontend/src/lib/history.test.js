import { describe, it, expect } from 'vitest'
import { modeOf, lastNoteFor, bestWeightFor, isTimed, fmtSec, setLabel, setTiming, defaultConfig, buildSets, exLine, workoutVolume, effortOf, stepEffort, capEffort, isBw, isPerSide, sideReps, repStep, speedOf, vertOf, distUnit, vertUnit, missedSession, slideWeek, moveMissed, restDay, supersetUnits, moveInRoutine, toggleSuperset } from './history.js'
import { EXDB } from './exercises.js'

// Real ids out of the shipped catalogue, so the body-part fallback is exercised for real.
const CARDIO = EXDB.find(e => e.bp === 'cardio').id
// A *loaded* lift: the catalogue's first non-cardio entry is a sit-up, which since issue #32
// defaults to bodyweight and would quietly send every label test down the other path.
const LIFT = EXDB.find(e => e.bp !== 'cardio' && e.eq !== 'body weight').id
const BW = EXDB.find(e => e.eq === 'body weight').id

describe('modeOf', () => {
  it('falls back to the body part when a plan has no mode — every existing plan keeps working', () => {
    expect(modeOf({ id: CARDIO })).toBe('cardio')
    expect(modeOf({ id: LIFT })).toBe('reps')
    expect(modeOf({ id: 'no-such-exercise' })).toBe('reps')
    expect(modeOf({})).toBe('reps')
    expect(modeOf(null)).toBe('reps')
    expect(modeOf(undefined)).toBe('reps')
  })

  it('lets an explicit mode win over the body part', () => {
    expect(modeOf({ id: LIFT, mode: 'time' })).toBe('time')
    expect(modeOf({ id: CARDIO, mode: 'reps' })).toBe('reps')
    expect(modeOf({ id: CARDIO, mode: 'time' })).toBe('time')
  })

  it('ignores a mode it does not know rather than trusting a bad file', () => {
    expect(modeOf({ id: LIFT, mode: 'nonsense' })).toBe('reps')
    expect(modeOf({ id: CARDIO, mode: '' })).toBe('cardio')
  })

  it('exposes the timed check', () => {
    expect(isTimed({ id: LIFT, mode: 'time' })).toBe(true)
    expect(isTimed({ id: LIFT })).toBe(false)
  })
})

describe('fmtSec', () => {
  it('reads as a clock, not a pile of seconds', () => {
    expect(fmtSec(0)).toBe('0:00')
    expect(fmtSec(9)).toBe('0:09')
    expect(fmtSec(45)).toBe('0:45')
    expect(fmtSec(60)).toBe('1:00')
    expect(fmtSec(90)).toBe('1:30')
    expect(fmtSec(605)).toBe('10:05')
  })
  it('is defensive about junk input', () => {
    expect(fmtSec(-5)).toBe('0:00')
    expect(fmtSec(undefined)).toBe('0:00')
    expect(fmtSec(null)).toBe('0:00')
    expect(fmtSec(NaN)).toBe('0:00')
    expect(fmtSec(44.6)).toBe('0:45')
  })
})

describe('cardio — time, distance, climb (treadmill logging)', () => {
  it('reads back the three numbers off the console, in the profile\'s units', () => {
    const s = { min: 24, dist: 1.2, vft: 380 }
    expect(setLabel(CARDIO, s, null, 'lb')).toBe('24 min · 1.2 mi · 380 vt ft')
    expect(setLabel(CARDIO, s, null, 'kg')).toBe('24 min · 1.2 km · 380 vt m')
  })

  it('drops distance and climb when they were not logged', () => {
    expect(setLabel(CARDIO, { min: 30, dist: 1.5 }, null, 'lb')).toBe('30 min · 1.5 mi')
    expect(setLabel(CARDIO, { min: 30, vft: 200 }, null, 'lb')).toBe('30 min · 200 vt ft')
  })

  it('still reads a set logged before distance existed', () => {
    expect(setLabel(CARDIO, { min: 20, speed: 9 }, null, 'kg')).toBe('20 min @ 9 km/h')
    // The stepper that wrote `speed` only ever spoke km/h, so a lb profile shows the same
    // walk converted — 8 km/h is 5 mph, not "8 mph", which would be a different walk.
    expect(setLabel(CARDIO, { min: 20, speed: 8 }, null, 'lb')).toBe('20 min @ 5 mph')
    expect(setLabel(CARDIO, { min: 20, speed: 8 }, null, 'kg')).toBe('20 min @ 8 km/h')
  })

  // The regression: buildSets seeds cardio with dist 0 / vft 0 and nothing prescribes a
  // speed any more, so the ordinary "ticked the treadmill warm-up off" set used to claim a
  // pace of 0 that was never held and never typed.
  it('labels a walk logged with no distance by its duration alone, never "0 mph"', () => {
    const s = { min: 10, dist: 0, vft: 0, done: true }
    expect(setLabel(CARDIO, s, null, 'lb')).toBe('10 min')
    expect(setLabel(CARDIO, s, null, 'kg')).toBe('10 min')
    expect(setLabel(CARDIO, { min: 20 }, null, 'lb')).toBe('20 min')
    expect(setLabel(CARDIO, {}, null, 'lb')).toBe('0 min')
    expect(setLabel(CARDIO, null, null, 'lb')).toBe('0 min')
  })

  it('derives average speed from distance and time rather than asking for it', () => {
    // Distance was entered in the profile's own unit, so the pace is already in it.
    expect(speedOf({ min: 24, dist: 1.2 }, 'lb')).toBe(3)
    expect(speedOf({ min: 30, dist: 2 }, 'kg')).toBe(4)
    // A walk with no distance falls back to the speed the old set carried, in km/h.
    expect(speedOf({ min: 20, speed: 8 }, 'kg')).toBe(8)
    expect(speedOf({ min: 20, speed: 8 }, 'lb')).toBe(5)
    // No time is not a divide-by-zero, it is simply nothing to report.
    expect(speedOf({ min: 0, dist: 1.2 }, 'lb')).toBe(0)
    expect(speedOf(null, 'lb')).toBe(0)
    expect(speedOf(null, 'kg')).toBe(0)
    expect(speedOf({ min: 10, dist: 0, vft: 0 }, 'lb')).toBe(0)
  })

  it('reports climb, defaulting to none rather than undefined', () => {
    expect(vertOf({ vft: 380 })).toBe(380)
    expect(vertOf({ min: 20 })).toBe(0)
    expect(vertOf(null)).toBe(0)
  })

  it('names units off the profile weight unit, since that is the only one there is', () => {
    expect(distUnit('lb')).toBe('mi')
    expect(distUnit('kg')).toBe('km')
    expect(vertUnit('lb')).toBe('vt ft')
    expect(vertUnit('kg')).toBe('vt m')
  })
})

describe('setLabel', () => {
  it('describes each mode in its own terms', () => {
    expect(setLabel(LIFT, { w: 60, r: 10 })).toBe('60×10')
    expect(setLabel(CARDIO, { min: 24, dist: 1.2, vft: 380 }, null, 'lb')).toBe('24 min · 1.2 mi · 380 vt ft')
    expect(setLabel(LIFT, { sec: 45, w: 0 }, { mode: 'time' })).toBe('0:45')
    expect(setLabel(LIFT, { sec: 90, w: 20 }, { mode: 'time' })).toBe('1:30 · 20')
  })

  it('reads a legacy set with no config exactly as before', () => {
    expect(setLabel(LIFT, { w: 0, r: 0 })).toBe('0×0')
    // A legacy set is one that carries a speed; an empty one has only its duration to give.
    expect(setLabel(CARDIO, { min: 20, speed: 9 }, null, 'kg')).toBe('20 min @ 9 km/h')
    expect(setLabel(CARDIO, {}, null, 'kg')).toBe('0 min')
  })

  it('appends RIR when present, including a valid 0', () => {
    expect(setLabel(LIFT, { w: 60, r: 10, rir: 2 })).toBe('60×10 (RIR 2)')
    expect(setLabel(LIFT, { w: 60, r: 10, rir: 1.5 })).toBe('60×10 (RIR 1.5)')
    expect(setLabel(LIFT, { w: 60, r: 10, rir: 0 })).toBe('60×10 (RIR 0)')
  })

  it('says nothing about RIR on a set that never logged one', () => {
    expect(setLabel(LIFT, { w: 60, r: 10 })).toBe('60×10')
    // cleared in the UI: the key is dropped, but a null must read the same as absent
    expect(setLabel(LIFT, { w: 60, r: 10, rir: null })).toBe('60×10')
  })

  it('appends RPE for a set logged on that scale', () => {
    expect(setLabel(LIFT, { w: 60, r: 10, rpe: 8 })).toBe('60×10 (RPE 8)')
    expect(setLabel(LIFT, { w: 60, r: 10, rpe: 9.5 })).toBe('60×10 (RPE 9.5)')
    expect(setLabel(LIFT, { w: 60, r: 10, rpe: null })).toBe('60×10')
  })

  it('keeps each set on the scale it was logged with', () => {
    // switching the setting must not rewrite history: an old RIR set still reads as RIR
    expect(setLabel(LIFT, { w: 60, r: 10, rir: 2 })).toBe('60×10 (RIR 2)')
    // and a set that somehow carries both is described once, by the one it was logged with
    expect(setLabel(LIFT, { w: 60, r: 10, rir: 2, rpe: 8 })).toBe('60×10 (RIR 2)')
  })
})

describe('effortOf', () => {
  it('reads the scale a profile logs', () => {
    expect(effortOf({ effort: 'rpe' })).toBe('rpe')
    expect(effortOf({ effort: 'rir' })).toBe('rir')
    expect(effortOf({ effort: 'none' })).toBe('none')
    expect(effortOf({})).toBe('none')
  })

  it('keeps the column for a profile still carrying the old showRir flag', () => {
    expect(effortOf({ showRir: true })).toBe('rir')
    // what a stored profile actually looks like once it is overlaid on DEF
    expect(effortOf({ effort: null, showRir: true })).toBe('rir')
    expect(effortOf({ effort: null })).toBe('none')
    expect(effortOf({ showRir: false })).toBe('none')
    // once the new setting is chosen it wins, whatever the old flag said
    expect(effortOf({ showRir: true, effort: 'rpe' })).toBe('rpe')
    expect(effortOf({ showRir: true, effort: 'none' })).toBe('none')
  })

  // The store cannot be imported here (it reaches for `navigator` at module load), so the
  // overlay it performs is reproduced literally: stored profile spread over the defaults.
  // DEF.effort is null precisely so this lands on the showRir fallback rather than on 'none'.
  const overlay = stored => ({ unit: 'kg', effort: null, ...stored })

  it('survives the overlay every load path performs', () => {
    // upgrading with the column on: local state, a server pull and a restored backup all
    // arrive as a stored object spread over the defaults, and all must keep the column
    expect(effortOf(overlay({ showRir: true }))).toBe('rir')
    expect(effortOf(overlay({ showRir: false }))).toBe('none')
    // a profile predating the RIR feature entirely
    expect(effortOf(overlay({}))).toBe('none')
    // and one written by this version
    expect(effortOf(overlay({ effort: 'rpe' }))).toBe('rpe')
    // an old backup restored over a profile that had already chosen: the file wins, because
    // an import replaces state wholesale rather than merging
    expect(effortOf(overlay({ showRir: true, effort: undefined }))).toBe('rir')
  })

  it('is not fooled by a junk value', () => {
    expect(effortOf({ effort: 'rpe10' })).toBe('none')
    expect(effortOf({ effort: 'RIR' })).toBe('none')
    expect(effortOf({ effort: 'f' })).toBe('none')
    expect(effortOf(null)).toBe('none')
    expect(effortOf(undefined)).toBe('none')
    // a junk value with the old flag still set falls back rather than showing nothing
    expect(effortOf({ effort: 'nope', showRir: true })).toBe('rir')
  })
})

describe('stepEffort', () => {
  it('starts at the bottom of the scale and walks up', () => {
    // the first + on an empty cell lands on the lowest value, not on some "typical" middle:
    // the stepper counts up from the floor the way every other stepper in the app does
    expect(stepEffort('rir', null, 1)).toBe(0)
    expect(stepEffort('rpe', null, 1)).toBe(6)
    // and then in even steps
    expect(stepEffort('rir', 0, 1)).toBe(0.5)
    expect(stepEffort('rir', 0.5, 1)).toBe(1)
    expect(stepEffort('rpe', 6, 1)).toBe(6.5)
  })

  it('leaves an untouched cell unlogged when stepped down', () => {
    // one stray − on a fresh row must not stamp "(RIR 0)" — went to failure — on the set
    expect(stepEffort('rir', null, -1)).toBe(null)
    expect(stepEffort('rpe', null, -1)).toBe(null)
    expect(stepEffort('rir', undefined, -1)).toBe(null)
  })

  it('clears the cell again when stepped back off the floor', () => {
    // so a mistap is undoable rather than sticking at the floor for good
    expect(stepEffort('rir', 0, -1)).toBe(null)
    expect(stepEffort('rpe', 6, -1)).toBe(null)
    // but a step that stays inside the scale is an ordinary step
    expect(stepEffort('rir', 0.5, -1)).toBe(0)
    expect(stepEffort('rpe', 6.5, -1)).toBe(6)
  })

  it('stops at the top of the scale', () => {
    expect(stepEffort('rir', 9.5, 1)).toBe(10)
    expect(stepEffort('rir', 10, 1)).toBe(10)
    expect(stepEffort('rpe', 10, 1)).toBe(10)
  })

  it('keeps halves clean instead of drifting into float dust', () => {
    let v = null
    for (let i = 0; i < 6; i++) v = stepEffort('rpe', v, 1)
    expect(v).toBe(8.5)
    expect(stepEffort('rir', 0.1 + 0.2, 1)).toBe(0.8)
  })

  it('steps evenly from a value typed below the floor rather than snapping', () => {
    // nothing stops someone typing RPE 3; the stepper must not jump them to 6 on one tap
    expect(stepEffort('rpe', 3, 1)).toBe(3.5)
    // stepping down out of the scale from there just clears it
    expect(stepEffort('rpe', 3, -1)).toBe(null)
  })

  it('does nothing when the profile logs no effort at all', () => {
    expect(stepEffort('none', null, 1)).toBe(null)
    expect(stepEffort('none', 2, 1)).toBe(2)
    expect(stepEffort(undefined, 2, -1)).toBe(2)
  })
})

describe('capEffort', () => {
  it('caps a typed value at the top of the scale', () => {
    expect(capEffort('rir', 12)).toBe(10)
    expect(capEffort('rpe', 99)).toBe(10)
    expect(capEffort('rpe', 8)).toBe(8)
  })

  it('does not floor a typed value, so typing "10" survives its first keystroke', () => {
    // clamping up would turn the "1" of "10" into 6 and fight the input
    expect(capEffort('rpe', 1)).toBe(1)
    expect(capEffort('rir', 0)).toBe(0)
  })

  it('passes an emptied field through untouched', () => {
    expect(capEffort('rir', null)).toBe(null)
    expect(capEffort('rpe', undefined)).toBe(undefined)
    expect(capEffort('none', 12)).toBe(12)
  })
})

// End-to-end on the data, not the pixels: what a set carries after the taps a real session
// makes, and what it reads back as afterwards.
describe('logging effort across a session', () => {
  it('logs a working set on the chosen scale', () => {
    // four + taps from empty on an RPE profile: 6, 6.5, 7, 7.5
    let v = null
    for (let i = 0; i < 4; i++) v = stepEffort('rpe', v, 1)
    expect(setLabel(LIFT, { w: 80, r: 5, rpe: v })).toBe('80×5 (RPE 7.5)')
  })

  it('a set taken to failure is logged, not left blank', () => {
    const v = stepEffort('rir', null, 1)      // one + on an RIR profile
    expect(v).toBe(0)
    expect(setLabel(LIFT, { w: 100, r: 3, rir: v })).toBe('100×3 (RIR 0)')
  })

  it('switching the setting mid-history rewrites nothing', () => {
    const old = { w: 60, r: 10, rir: 2 }      // logged while the profile was on RIR
    const fresh = { w: 60, r: 10, rpe: 8 }    // logged after switching to RPE
    expect(effortOf({ effort: 'rpe' })).toBe('rpe')
    expect(setLabel(LIFT, old)).toBe('60×10 (RIR 2)')
    expect(setLabel(LIFT, fresh)).toBe('60×10 (RPE 8)')
    // turning the column off entirely hides the control but keeps both sets readable
    expect(effortOf({ effort: 'none' })).toBe('none')
    expect(setLabel(LIFT, old)).toBe('60×10 (RIR 2)')
  })

  it('never attaches effort to a mode that has no place for it', () => {
    // cardio and timed sets have no third stepper, and their labels ignore the field even
    // if an import or an old file put one there
    expect(setLabel(CARDIO, { min: 20, dist: 1, vft: 100, rpe: 8 }, null, 'lb')).toBe('20 min · 1 mi · 100 vt ft')
    expect(setLabel(LIFT, { sec: 45, rir: 2 }, { id: LIFT, mode: 'time' })).toBe('0:45')
  })
})

describe('defaultConfig', () => {
  it('gives each mode a sensible starting point', () => {
    expect(defaultConfig(LIFT)).toEqual({ sets: 3, reps: 10, weight: 0, mode: 'reps' })
    expect(defaultConfig(CARDIO)).toEqual({ sets: 1, min: 20 })
    expect(defaultConfig(LIFT, 'time')).toEqual({ sets: 3, sec: 45, weight: 0, mode: 'time' })
  })
  it('seeds the bodyweight flag from the catalogue, and only when it is true', () => {
    expect(defaultConfig(BW)).toEqual({ sets: 3, reps: 10, weight: 0, mode: 'reps', bodyweight: true })
    expect(defaultConfig(BW, 'time')).toEqual({ sets: 3, sec: 45, weight: 0, mode: 'time', bodyweight: true })
    expect('bodyweight' in defaultConfig(LIFT)).toBe(false)
  })
})

/* ---------- bodyweight and per side (issues #31/#32/#33) ---------- */

describe('isBw', () => {
  it('defaults from the catalogue so an existing plan needs no flag', () => {
    expect(isBw({ id: BW })).toBe(true)
    expect(isBw({ id: LIFT })).toBe(false)
  })
  it('lets the config win in both directions — a belt on a dip, a flag on a machine', () => {
    expect(isBw({ id: BW, bodyweight: false })).toBe(false)
    expect(isBw({ id: LIFT, bodyweight: true })).toBe(true)
  })
})

describe('sideReps', () => {
  it('halves the logged total, because the total is what was logged', () => {
    expect(sideReps(16)).toBe(8)
    expect(sideReps(0)).toBe(0)
  })
  it('shows an odd total as it falls rather than rounding the imbalance away', () => {
    expect(sideReps(17)).toBe(8.5)
  })
})

describe('exLine — per side never reaches a timed hold', () => {
  it('ignores a stale side flag on a hold, which has no reps to split', () => {
    expect(exLine({ id: LIFT, sets: 3, sec: 45, mode: 'time', side: true }, 'kg')).toBe('3 × 0:45')
  })
})

describe('repStep', () => {
  it('steps unilateral work in twos so the total stays splittable', () => {
    expect(repStep({ side: true })).toBe(2)
    expect(repStep({})).toBe(1)
    expect(repStep(null)).toBe(1)
  })
})

describe('setLabel — bodyweight', () => {
  it('reads as reps alone, because "0×12" describes nothing', () => {
    expect(setLabel(BW, { w: 0, r: 12 }, { id: BW })).toBe('12')
  })
  it('spells out a belt as an addition', () => {
    expect(setLabel(BW, { w: 10, r: 8 }, { id: BW })).toBe('+10 × 8')
  })
  it('logs a per-side set as the plain total, like every other set in the app', () => {
    expect(setLabel(BW, { w: 0, r: 16 }, { id: BW, side: true })).toBe('16')
    expect(setLabel(LIFT, { w: 20, r: 16 }, { id: LIFT, side: true })).toBe('20×16')
  })
  it('keeps the effort tail', () => {
    expect(setLabel(BW, { w: 0, r: 12, rir: 2 }, { id: BW })).toBe('12 (RIR 2)')
  })
})

describe('exLine', () => {
  it('shows the split where there is room for it, next to the total you log', () => {
    expect(exLine({ id: LIFT, sets: 3, reps: 16, side: true }, 'kg')).toBe('3 × 16 · 8/side')
  })
  it('marks added weight as added', () => {
    expect(exLine({ id: BW, sets: 3, reps: 8, weight: 10 }, 'kg')).toBe('3 × 8 · +10 kg')
  })
  it('summarises a planned exercise per mode', () => {
    expect(exLine({ id: LIFT, sets: 3, reps: 10 }, 'kg')).toBe('3 × 10')
    expect(exLine({ id: LIFT, sets: 3, reps: 10, weight: 60 }, 'kg')).toBe('3 × 10 · 60 kg')
    expect(exLine({ id: LIFT, sets: 3, sec: 45, mode: 'time' }, 'kg')).toBe('3 × 0:45')
    expect(exLine({ id: LIFT, sets: 2, sec: 90, weight: 20, mode: 'time' }, 'kg')).toBe('2 × 1:30 · 20 kg')
    expect(exLine({ id: CARDIO, sets: 1, min: 20 }, 'kg')).toBe('1 × 20 min')
  })
})

const emptyS = { workouts: [], exWeights: {} }

describe('buildSets', () => {
  it('builds reps sets from the plan when there is no history', () => {
    expect(buildSets(emptyS, { id: LIFT, sets: 3, reps: 8, weight: 50 }))
      .toEqual([{ w: 50, r: 8, done: false }, { w: 50, r: 8, done: false }, { w: 50, r: 8, done: false }])
  })

  it('builds timed sets, carrying the planned duration and load', () => {
    expect(buildSets(emptyS, { id: LIFT, mode: 'time', sets: 2, sec: 60, weight: 20 }))
      .toEqual([{ sec: 60, w: 20, done: false }, { sec: 60, w: 20, done: false }])
  })

  it('builds cardio sets with the planned duration and an empty result', () => {
    expect(buildSets(emptyS, { id: CARDIO, sets: 1, min: 25 }))
      .toEqual([{ min: 25, dist: 0, vft: 0, done: false }])
  })

  it('carries last time\'s numbers forward within the same mode', () => {
    const S = { exWeights: {}, workouts: [{ d: '2026-01-01', entries: [{ id: LIFT, target: { mode: 'time' }, sets: [{ sec: 70, w: 10, done: true }] }] }] }
    expect(buildSets(S, { id: LIFT, mode: 'time', sets: 2, sec: 45, weight: 0 }))
      .toEqual([{ sec: 70, w: 10, done: false }, { sec: 70, w: 10, done: false }])
  })

  it('does not seed a duration from a rep count when an exercise switches to time', () => {
    const S = { exWeights: {}, workouts: [{ d: '2026-01-01', entries: [{ id: LIFT, sets: [{ w: 60, r: 10, done: true }] }] }] }
    expect(buildSets(S, { id: LIFT, mode: 'time', sets: 1, sec: 45, weight: 0 }))
      .toEqual([{ sec: 45, w: 0, done: false }])
  })

  it('does not seed reps from a timed set when an exercise switches back', () => {
    const S = { exWeights: {}, workouts: [{ d: '2026-01-01', entries: [{ id: LIFT, target: { mode: 'time' }, sets: [{ sec: 70, w: 10, done: true }] }] }] }
    expect(buildSets(S, { id: LIFT, mode: 'reps', sets: 1, reps: 8, weight: 40 }))
      .toEqual([{ w: 40, r: 8, done: false }])
  })

  it('still prefers the confirmed working weight for reps sets', () => {
    const S = { exWeights: { [LIFT]: { w: 75 } }, workouts: [{ d: '2026-01-01', entries: [{ id: LIFT, sets: [{ w: 60, r: 10, done: true }] }] }] }
    expect(buildSets(S, { id: LIFT, sets: 1, reps: 8, weight: 50 })).toEqual([{ w: 75, r: 10, done: false }])
  })
})

describe('workoutVolume', () => {
  it('counts reps work and leaves timed/cardio sets out — there is no weight × reps for a hold', () => {
    const w = { entries: [
      { id: LIFT, sets: [{ w: 60, r: 10, done: true }, { w: 60, r: 10, done: false }] },
      { id: LIFT, target: { mode: 'time' }, sets: [{ sec: 60, w: 20, done: true }] },
      { id: CARDIO, sets: [{ min: 20, dist: 1, vft: 200, done: true }] }
    ] }
    expect(workoutVolume(w)).toBe(600)
  })

  it('needs no per-side case — the logged reps are already both sides (issue #31)', () => {
    const w = { entries: [{ id: LIFT, target: { side: true }, sets: [{ w: 20, r: 16, done: true }] }] }
    expect(workoutVolume(w)).toBe(320)
  })

  it('leaves an unloaded bodyweight set at zero volume rather than inventing a number', () => {
    const w = { entries: [{ id: BW, target: { bodyweight: true }, sets: [{ w: 0, r: 20, done: true }] }] }
    expect(workoutVolume(w)).toBe(0)
  })
})

describe('lastNoteFor', () => {
  const W = (d, entries) => ({ id: 'w' + d, d, entries })

  it('returns nothing when no note was ever written', () => {
    expect(lastNoteFor({ workouts: [] }, LIFT)).toBe(null)
    expect(lastNoteFor({ workouts: [W('2026-08-01', [{ id: LIFT, sets: [{ w: 100, r: 5, done: true }] }])] }, LIFT)).toBe(null)
  })

  it('returns the most recent note and the day it was written', () => {
    const S = { workouts: [
      W('2026-08-01', [{ id: LIFT, sets: [], note: 'older' }]),
      W('2026-08-08', [{ id: LIFT, sets: [], note: 'newer' }]),
    ] }
    expect(lastNoteFor(S, LIFT)).toEqual({ d: '2026-08-08', note: 'newer' })
  })

  it('does not confuse one exercise for another', () => {
    const S = { workouts: [W('2026-08-01', [
      { id: LIFT, sets: [], note: 'about the lift' },
      { id: BW, sets: [], note: 'about the bodyweight one' },
    ])] }
    expect(lastNoteFor(S, LIFT).note).toBe('about the lift')
    expect(lastNoteFor(S, BW).note).toBe('about the bodyweight one')
    expect(lastNoteFor(S, CARDIO)).toBe(null)
  })

  // Deliberately looser than lastEntryFor, which skips a session whose sets were never
  // ticked: "shoulder went, stopped after one" is exactly the note worth surfacing.
  it('surfaces a note from a session where nothing was ticked off', () => {
    const S = { workouts: [W('2026-08-01', [{ id: LIFT, sets: [{ w: 100, r: 5, done: false }], note: 'shoulder went' }])] }
    expect(lastNoteFor(S, LIFT).note).toBe('shoulder went')
  })

  it('treats a blank or whitespace-only note as no note', () => {
    const S = { workouts: [
      W('2026-08-01', [{ id: LIFT, sets: [], note: 'real one' }]),
      W('2026-08-08', [{ id: LIFT, sets: [], note: '   ' }]),
    ] }
    expect(lastNoteFor(S, LIFT)).toEqual({ d: '2026-08-01', note: 'real one' })
  })

  it('trims the note it hands back', () => {
    const S = { workouts: [W('2026-08-01', [{ id: LIFT, sets: [], note: '  padded  ' }])] }
    expect(lastNoteFor(S, LIFT).note).toBe('padded')
  })

  // Every workout, backup and CSV written before notes existed has no `note` field at all.
  it('reads a pre-notes history unchanged', () => {
    const S = { workouts: [W('2026-08-01', [{ id: LIFT, sets: [{ w: 100, r: 5, done: true }], topW: 100 }])] }
    expect(lastNoteFor(S, LIFT)).toBe(null)
  })

  // A hand-edited file or a backup restored from a truncated write can hand over a workout
  // with no entries at all. It has nothing to say about this exercise, which is an answer.
  it('reads past a workout with no entries instead of throwing', () => {
    const S = { workouts: [
      W('2026-08-01', [{ id: LIFT, sets: [], note: 'real one' }]),
      { id: 'w2', d: '2026-08-08' },
      { id: 'w3', d: '2026-08-09', entries: null },
      { id: 'w4', d: '2026-08-10', entries: 'not an array' },
    ] }
    expect(lastNoteFor(S, LIFT)).toEqual({ d: '2026-08-01', note: 'real one' })
    expect(lastNoteFor({ workouts: [{ id: 'w1', d: '2026-08-01' }] }, LIFT)).toBe(null)
  })
})

describe('bestWeightFor', () => {
  it('reports the heaviest weight ever logged, counting an imported top set', () => {
    const S = { workouts: [
      { id: 'w1', d: '2026-08-01', entries: [{ id: LIFT, sets: [{ w: 60, r: 5, done: true }, { w: 80, r: 1, done: false }] }] },
      { id: 'w2', d: '2026-08-08', entries: [{ id: LIFT, sets: [{ w: 70, r: 5, done: true }], topW: 100 }] },
    ] }
    expect(bestWeightFor(S, LIFT)).toBe(100)
    expect(bestWeightFor(S, BW)).toBe(0)
  })

  it('skips a workout with no entries instead of throwing', () => {
    const S = { workouts: [
      { id: 'w1', d: '2026-08-01' },
      { id: 'w2', d: '2026-08-08', entries: null },
      { id: 'w3', d: '2026-08-09', entries: [{ id: LIFT, sets: [{ w: 90, r: 3, done: true }] }] },
    ] }
    expect(bestWeightFor(S, LIFT)).toBe(90)
    expect(bestWeightFor({ workouts: [{ id: 'w1', d: '2026-08-01' }] }, LIFT)).toBe(0)
  })
})

describe('setTiming — what the session recorded without being asked', () => {
  // A tick at 18:00:00, the buzzer 92s later, the next set ticked 48s after that.
  const T = 1735740000000
  const TIMED = [
    { w: 60, r: 10, done: true, t: T, rt: T + 92000 },
    { w: 60, r: 10, done: true, t: T + 140000, rt: T + 232000 },
    { w: 60, r: 8, done: true, t: T + 290000 }
  ]

  it('splits the cycle into the rest actually taken and everything after the buzzer', () => {
    expect(setTiming(TIMED, 0)).toEqual({ rest: 92, after: 48, gap: 140 })
    expect(setTiming(TIMED, 1)).toEqual({ rest: 92, after: 58, gap: 150 })
  })

  it('has nothing to compare a last set against', () => {
    expect(setTiming(TIMED, 2)).toEqual({ rest: null, after: null, gap: null })
  })

  it('reports the whole gap but no rest when the buzzer never went (rest skipped)', () => {
    const sets = [{ w: 60, r: 10, done: true, t: T }, { w: 60, r: 10, done: true, t: T + 70000 }]
    expect(setTiming(sets, 0)).toEqual({ rest: null, after: null, gap: 70 })
  })

  // Every workout logged before these stamps existed has neither field, on every set.
  it('returns null for a set with no stamps rather than NaN', () => {
    const legacy = [{ w: 60, r: 10, done: true }, { w: 60, r: 10, done: true }]
    expect(setTiming(legacy, 0)).toBe(null)
    expect(setTiming(legacy, 1)).toBe(null)
  })

  it('reads a whole pre-stamp workout without producing a single number it cannot know', () => {
    const w = { entries: [{ id: LIFT, sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }], topW: 100 }] }
    const out = w.entries.flatMap(e => e.sets.map((_, i) => setTiming(e.sets, i)))
    expect(out).toEqual([null, null])
  })

  it('is defensive about a set that is not there', () => {
    expect(setTiming(undefined, 0)).toBe(null)
    expect(setTiming([], 0)).toBe(null)
    expect(setTiming(TIMED, 9)).toBe(null)
  })

  // An un-ticked row in the middle is a set that was never done, not a five-minute rest.
  it('measures to the next set that was actually logged', () => {
    const sets = [
      { w: 60, r: 10, done: true, t: T, rt: T + 90000 },
      { w: 60, r: 10, done: false },
      { w: 60, r: 10, done: true, t: T + 150000 }
    ]
    expect(setTiming(sets, 0)).toEqual({ rest: 90, after: 60, gap: 150 })
  })

  // Ticking sets out of order would otherwise report a negative rest, which is not a fact.
  it('refuses to report time running backwards', () => {
    const sets = [{ w: 60, r: 10, done: true, t: T + 60000 }, { w: 60, r: 10, done: true, t: T }]
    expect(setTiming(sets, 0)).toEqual({ rest: null, after: null, gap: null })
  })
})

describe('the timing stamps ride along without changing anything', () => {
  const T = 1735740000000
  const stamped = { w: 60, r: 10, done: true, t: T, rt: T + 90000 }

  it('leaves a set summary reading exactly as it did before', () => {
    expect(setLabel(LIFT, stamped, null, 'kg')).toBe(setLabel(LIFT, { w: 60, r: 10, done: true }, null, 'kg'))
  })

  it('leaves volume alone', () => {
    expect(workoutVolume({ entries: [{ id: LIFT, sets: [stamped] }] })).toBe(600)
  })

  // Last session's stamps must not seed this session's rows — a set that has not happened yet
  // cannot carry the wall clock of one that did.
  it('never carries a stamp into the next session', () => {
    const S = { exWeights: {}, workouts: [{ d: '2026-01-01', entries: [{ id: LIFT, sets: [stamped] }] }] }
    expect(buildSets(S, { id: LIFT, sets: 2, reps: 10, weight: 60 }))
      .toEqual([{ w: 60, r: 10, done: false }, { w: 60, r: 10, done: false }])
  })
})

// the owner's real week: Mon Push, Tue Pull, Wed Legs, Fri Weak Points. 2026-09-28 is a Monday.
describe('moving a missed session', () => {
  const plan = (dayPlan = {}, workouts = []) => ({
    week: { 1: 'push', 2: 'pull', 3: 'legs', 5: 'weak' }, dayPlan, workouts,
    routines: ['push', 'pull', 'legs', 'weak'].map(id => ({ id, name: id }))
  })
  const MON = '2026-09-28', TUE = '2026-09-29', WED = '2026-09-30', THU = '2026-10-01', FRI = '2026-10-02', SAT = '2026-10-03', SUN = '2026-10-04'

  it('finds the last planned day that came and went, and only while nothing was logged since', () => {
    expect(missedSession(plan(), WED)).toMatchObject({ iso: TUE, routine: { id: 'pull' } })
    expect(missedSession(plan({}, [{ d: TUE }]), WED)).toBe(null)       // trained on it
    expect(missedSession(plan({}, [{ d: WED }]), WED)).toBe(null)       // already trained today
    expect(missedSession(plan({ [TUE]: 'rest' }, [{ d: MON }]), WED)).toBe(null)   // Monday done, Tuesday off
    expect(missedSession(plan({ [TUE]: 'rest' }), WED)).toMatchObject({ iso: MON })  // looks past a rest day
    expect(missedSession(plan(), MON)).toBe(null)                        // nothing earlier this week
  })

  it('slides the rest of the week back one day, rest days included', () => {
    const S = plan()
    const { dayPlan, dropped } = moveMissed(S, missedSession(S, WED), WED, true)
    expect(dayPlan).toEqual({ [TUE]: 'rest', [WED]: 'pull', [THU]: 'legs', [FRI]: 'rest', [SAT]: 'weak' })
    expect(dropped).toBe(null)
    expect(S.dayPlan).toEqual({})   // pure: the state it was handed is untouched
  })

  it('does it today without touching the rest of the week', () => {
    const S = plan()
    expect(moveMissed(S, missedSession(S, WED), WED, false)).toEqual({ dayPlan: { [TUE]: 'rest', [WED]: 'pull' }, dropped: null })
  })

  it('turns every empty day since the miss to rest and keeps existing overrides in the sequence', () => {
    const S = plan({ [TUE]: 'rest', [SUN]: 'push' })
    const { dayPlan, dropped } = moveMissed(S, missedSession(S, WED), WED, true)
    expect(dayPlan).toEqual({ [MON]: 'rest', [TUE]: 'rest', [WED]: 'push', [THU]: 'legs', [FRI]: 'rest', [SAT]: 'weak' })
    expect(dropped).toBe('push')   // Sunday's session falls off the week
  })

  it('drops overrides that slide back into line with the weekly plan', () => {
    expect(slideWeek(plan({ [THU]: 'weak' }), THU, null)).toEqual({ dayPlan: { [SAT]: 'weak' }, dropped: null })
    expect(restDay(plan({ [THU]: 'push' }), THU)).toEqual({})
    expect(restDay(plan(), FRI)).toEqual({ [FRI]: 'rest' })
  })
})

describe('routine editor supersets', () => {
  const R = () => [{ id: 'w' }, { id: 'a', sg: 's' }, { id: 'b', sg: 's' }, { id: 'c' }]
  const show = ex => ex.map(e => e.id + (e.sg ? '*' + e.sg : '')).join(' ')
  const groups = ex => supersetUnits(ex).map(u => u.map(i => ex[i].id).join('+')).join(' | ')
  it('a lone lift hops over a whole superset, which keeps its pairing', () => {
    const ex = R(); moveInRoutine(ex, 3, -1)
    expect(groups(ex)).toBe('w | c | a+b')
    const ex2 = R(); moveInRoutine(ex2, 0, 1)
    expect(groups(ex2)).toBe('a+b | w | c')
  })
  it('a superset lift moved out of its group takes the group with it', () => {
    const ex = R(); moveInRoutine(ex, 1, -1)
    expect(groups(ex)).toBe('a+b | w | c')
  })
  it('inside a superset, partners swap', () => {
    const ex = R(); moveInRoutine(ex, 1, 1)
    expect(groups(ex)).toBe('w | b+a | c')
  })
  it('the animation map points every new row at its old row', () => {
    const ex = R(); const before = ex.map(e => e.id); const src = moveInRoutine(ex, 3, -1)
    expect(ex.map((e, k) => before[src(k)])).toEqual(ex.map(e => e.id))
  })
  it('unlinking the middle of a 3-way keeps the lifts below paired', () => {
    const ex = [{ id: 'a', sg: 's' }, { id: 'b', sg: 's' }, { id: 'c', sg: 's' }]
    toggleSuperset(ex, 1)
    expect(groups(ex)).toBe('a | b+c')
  })
  it('linking a pair onto the lift above makes one 3-way superset', () => {
    const ex = [{ id: 'a' }, { id: 'b', sg: 's' }, { id: 'c', sg: 's' }]
    toggleSuperset(ex, 1)
    expect(groups(ex)).toBe('a+b+c')
    expect(show(ex)).not.toContain('undefined')
  })
})
