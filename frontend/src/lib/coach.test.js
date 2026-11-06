import { describe, it, expect } from 'vitest'
import {
  liftSessions, stallOf, stalledLifts, weighIns, bodyweightTrend, liftDirections,
  fuelCheck, muscleWeek, STALL_DAYS, MIN_SESSIONS, MIN_WEIGH_INS, MIN_COVER_WORKOUTS
} from './coach.js'
import { isConditioning } from './muscles.js'
import { EXIDX } from './exercises.js'
import { isoOf } from './format.js'

const BENCH = '0025'       // chest — pectorals, with triceps and shoulders behind it
const RAISE = '0178'       // shoulders, nothing below the waist
const TREADMILL = '3666'   // the warm-up walk, which the dataset hands quads/hams/calves
const STEPMILL = '2311'    // a second cardio machine, to prove nothing is keyed to one id

const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d }
// A workout n days back. `bw` is the weigh-in it was started with, left off when there was none.
const W = (n, entries, bw) => {
  const d = daysAgo(n)
  return { id: 'w' + n, d: isoOf(d), start: +d, bw, entries }
}
// One exercise as it is logged: every set ticked off at the same weight and reps.
const E = (id, w, r, sets = 3) => ({
  id, target: { id, sets, reps: r, weight: 0 },
  sets: Array.from({ length: sets }, () => ({ w, r, done: true }))
})
const S = (...workouts) => ({ unit: 'lb', bodyweight: [], workouts })

describe('liftSessions', () => {
  it('reads the top working set and the reps done at it', () => {
    const st = S(W(7, [{ id: BENCH, target: { id: BENCH, sets: 3, reps: 8 }, sets: [
      { w: 135, r: 8, done: true }, { w: 165, r: 8, done: true }, { w: 165, r: 6, done: true }] }]))
    expect(liftSessions(st, BENCH)).toEqual([expect.objectContaining({ w: 165, reps: 14 })])
  })

  it('ignores sets that were never checked off', () => {
    const st = S(W(7, [{ id: BENCH, target: { id: BENCH, sets: 3, reps: 8 }, sets: [
      { w: 165, r: 8, done: true }, { w: 185, r: 0, done: false }] }]))
    expect(liftSessions(st, BENCH)[0].w).toBe(165)
  })

  it('takes topW as the working weight when it sits above every set on file', () => {
    const st = S(W(7, [{ id: BENCH, topW: 185, target: { id: BENCH, sets: 3, reps: 8 }, sets: [{ w: 165, r: 8, done: true }] }]))
    expect(liftSessions(st, BENCH)[0].w).toBe(185)
  })

  it('leaves the treadmill out — a walk does not progress in pounds', () => {
    const st = S(W(7, [{ id: TREADMILL, target: { id: TREADMILL, sets: 1, min: 10 }, sets: [{ min: 15, dist: 0.5, vft: 280, done: true }] }]))
    expect(liftSessions(st, TREADMILL)).toEqual([])
  })
})

describe('stallOf', () => {
  const at = (n, w, reps) => ({ d: isoOf(daysAgo(n)), t: +daysAgo(n), w, reps })

  it('dates the stall from the last session that beat everything before it', () => {
    const s = stallOf([at(60, 155, 24), at(40, 165, 24), at(20, 165, 24), at(0, 165, 24)])
    expect(s.days).toBe(40)
    expect(s.w).toBe(165)
  })

  it('counts extra reps at the same weight as progress', () => {
    // 3×8 to 3×10 at 165 is a better session, and calling it a stall would be wrong.
    expect(stallOf([at(40, 165, 24), at(20, 165, 24), at(0, 165, 30)]).days).toBe(0)
  })

  it('counts a bodyweight lift by its reps alone, since the load never changes', () => {
    expect(stallOf([at(40, 0, 45), at(20, 0, 45), at(0, 0, 45)]).days).toBe(40)
    expect(stallOf([at(40, 0, 45), at(0, 0, 51)]).days).toBe(0)
  })

  it('dates a history that never improved from its first session', () => {
    expect(stallOf([at(35, 165, 24), at(15, 165, 24)]).days).toBe(20)
  })
})

describe('stalledLifts', () => {
  const flat = (id, w, r) => S(W(35, [E(id, w, r)]), W(21, [E(id, w, r)]), W(7, [E(id, w, r)]))

  it('flags a lift that has not moved in four weeks', () => {
    const { stalled, ready } = stalledLifts(flat(BENCH, 165, 8))
    expect(ready).toBe(true)
    expect(stalled.map(l => l.id)).toEqual([BENCH])
    expect(stalled[0].days).toBeGreaterThanOrEqual(STALL_DAYS)
    expect(stalled[0].name).toBe(EXIDX[BENCH].n)
  })

  it('says nothing about a lift done once or twice', () => {
    const st = S(W(35, [E(BENCH, 165, 8)]), W(7, [E(BENCH, 165, 8)]))
    expect(liftSessions(st, BENCH).length).toBeLessThan(MIN_SESSIONS)
    expect(stalledLifts(st).stalled).toEqual([])
  })

  it('holds off entirely until some lift has been in the plan long enough to stall', () => {
    // Five workouts inside a fortnight — the real starting point. Nothing here has had the
    // time to stall, and answering "no stalls" would be a claim the log cannot support.
    const st = S(W(12, [E(BENCH, 165, 8)]), W(9, [E(BENCH, 165, 8)]), W(6, [E(BENCH, 165, 8)]))
    const r = stalledLifts(st)
    expect(r.ready).toBe(false)
    expect(r.stalled).toEqual([])
    expect(r.watched.length).toBe(1)
  })

  it('does not flag a lift that was dropped from the plan months ago', () => {
    const st = S(W(120, [E(BENCH, 165, 8)]), W(100, [E(BENCH, 165, 8)]), W(80, [E(BENCH, 165, 8)]))
    expect(stalledLifts(st).stalled).toEqual([])
  })

  it('leaves a lift alone while either the weight or the reps keep going up', () => {
    const up = S(W(35, [E(BENCH, 155, 8)]), W(21, [E(BENCH, 165, 8)]), W(7, [E(BENCH, 165, 10)]))
    expect(stalledLifts(up).stalled).toEqual([])
    expect(stalledLifts(up).ready).toBe(true)
  })
})

describe('weighIns', () => {
  it('merges the scale log with the weigh-in a workout was started with', () => {
    const st = { unit: 'lb', bodyweight: [{ d: isoOf(daysAgo(3)), w: 173, t: +daysAgo(3) }], workouts: [W(1, [], 174)] }
    expect(weighIns(st, 30).map(p => p.w)).toEqual([173, 174])
  })

  it('keeps one reading per day rather than counting the same morning twice', () => {
    const d = isoOf(daysAgo(2))
    const st = { unit: 'lb', bodyweight: [{ d, w: 173, t: +daysAgo(2) }], workouts: [W(2, [], 173)] }
    expect(weighIns(st, 30).length).toBe(1)
  })
})

describe('bodyweightTrend', () => {
  const log = rows => ({ unit: 'lb', workouts: [], bodyweight: rows.map(([n, w]) => ({ d: isoOf(daysAgo(n)), w, t: +daysAgo(n) })) })

  it('refuses a direction off a handful of weigh-ins', () => {
    const r = bodyweightTrend(log([[20, 175], [15, 174], [10, 173]]), 90)
    expect(r.n).toBeLessThan(MIN_WEIGH_INS)
    expect(r.perWeek).toBe(null)
    expect(r.dir).toBe(null)
  })

  it('refuses a direction off a few days, however many readings there are', () => {
    // Six weigh-ins in a week is plenty of numbers and no information: the spread is water.
    const r = bodyweightTrend(log([[5, 175.4], [4, 174.4], [3, 173], [2, 175.3], [1, 172.7], [0, 174]]), 90)
    expect(r.n).toBe(6)
    expect(r.perWeek).toBe(null)
  })

  it('reads a slow loss through day-to-day noise', () => {
    const r = bodyweightTrend(log([[28, 178], [21, 175.9], [14, 176.4], [7, 174.8], [0, 174.2]]), 90)
    expect(r.dir).toBe('down')
    expect(r.perWeek).toBeLessThan(0)
    expect(r.last).toBe(174.2)
  })

  it('calls a fortnight of drift flat rather than a trend', () => {
    expect(bodyweightTrend(log([[28, 173], [21, 173.4], [14, 172.8], [7, 173.2], [0, 173.1]]), 90).dir).toBe('flat')
  })
})

describe('liftDirections', () => {
  it('needs two sessions in the window before a lift has a direction at all', () => {
    expect(liftDirections(S(W(5, [E(BENCH, 165, 8)])), 90).n).toBe(0)
  })

  it('sorts the lifts into going up, stuck and going backwards', () => {
    const st = S(
      W(30, [E(BENCH, 155, 8), E(RAISE, 17.5, 12)]),
      W(3, [E(BENCH, 165, 8), E(RAISE, 15, 12)]))
    expect(liftDirections(st, 90)).toEqual({ up: 1, flat: 0, down: 1, n: 2 })
  })
})

describe('fuelCheck', () => {
  // Three lifts standing still, over the same weeks the scale is doing something.
  const stuck = bw => ({
    unit: 'lb',
    bodyweight: bw.map(([n, w]) => ({ d: isoOf(daysAgo(n)), w, t: +daysAgo(n) })),
    workouts: [35, 21, 7].map(n => W(n, [E(BENCH, 165, 8), E(RAISE, 15, 12), E('0239', 180, 20)]))
  })

  it('blames the food when the lifts stall while the scale falls', () => {
    const r = fuelCheck(stuck([[28, 178], [21, 176.4], [14, 175.9], [7, 174.6], [0, 173]]), 90)
    expect(r.ready).toBe(true)
    expect(r.bw.dir).toBe('down')
    expect(r.moving).toBe(false)
    expect(r.note[0]).toMatch(/food problem/)
    expect(r.note[0]).not.toMatch(/program/)
  })

  it('blames the program when the same stall happens at a steady body weight', () => {
    const r = fuelCheck(stuck([[28, 173], [21, 173.3], [14, 172.9], [7, 173.2], [0, 173]]), 90)
    expect(r.bw.dir).toBe('flat')
    expect(r.note[0]).toMatch(/program/)
  })

  it('says nothing at all off a fortnight of history', () => {
    const r = fuelCheck(S(W(5, [E(BENCH, 165, 8)]), W(2, [E(BENCH, 165, 8)])), 90)
    expect(r.ready).toBe(false)
    expect(r.note).toBe(null)
  })
})

describe('muscleWeek', () => {
  const upperDay = n => W(n, [
    { id: TREADMILL, target: { id: TREADMILL, sets: 1, min: 10 }, sets: [{ min: 15, dist: 0.5, vft: 280, done: true }] },
    E(BENCH, 165, 8), E(RAISE, 15, 12)
  ])

  it('leaves the warm-up walk out, so legs read as untrained when they were', () => {
    const r = muscleWeek(S(upperDay(6), upperDay(4), upperDay(1)), 7)
    expect(r.ready).toBe(true)
    expect(r.warmup).toBe(3)                       // three walks seen, none of them counted
    expect(r.missed).toContain('quadriceps')
    expect(r.missed).toContain('hamstring')
    expect(r.missed).toContain('calves')
    expect(r.worked.map(w => w.m)).toContain('chest')
  })

  it('would have credited legs every session if the walk were counted', () => {
    // The trap, stated as a test: the dataset really does hand this exercise three leg
    // muscles, so the exclusion is doing work rather than guarding against nothing.
    expect(EXIDX[TREADMILL].sm).toEqual(['quadriceps', 'hamstrings', 'calves'])
    expect(isConditioning(EXIDX[TREADMILL])).toBe(true)
  })

  it('drops cardio by kind, not by the one id in his routines', () => {
    const day = n => W(n, [
      { id: STEPMILL, target: { id: STEPMILL, sets: 1, min: 10 }, sets: [{ min: 12, dist: 0.4, vft: 200, done: true }] },
      E(BENCH, 165, 8)
    ])
    const r = muscleWeek(S(day(5), day(3), day(1)), 7)
    expect(r.warmup).toBe(3)
    expect(r.missed).toContain('quadriceps')
    expect(r.missed).toContain('gluteal')
  })

  it('drops an entry logged as cardio even on an exercise that is not filed under it', () => {
    const day = n => W(n, [
      { id: RAISE, target: { id: RAISE, sets: 1, mode: 'cardio', min: 10 }, sets: [{ min: 10, dist: 0.4, done: true }] },
      E(BENCH, 165, 8)
    ])
    const r = muscleWeek(S(day(5), day(3), day(1)), 7)
    const by = Object.fromEntries(r.worked.map(w => [w.m, w.sets]))
    expect(r.missed).toContain('trapezius')        // only the raise trains traps, and it did not count
    expect(by.deltoids).toBe(3.6)                  // what the three benches lend them, and nothing else
  })

  it('counts supporting muscles at their share of a set, not a whole one', () => {
    // One session of 3 × bench: chest is the target (3 sets), triceps ride along at 0.4.
    const r = muscleWeek(S(W(5, [E(BENCH, 165, 8)]), W(3, [E(BENCH, 165, 8)]), W(1, [E(BENCH, 165, 8)])), 7)
    const by = Object.fromEntries(r.worked.map(w => [w.m, w.sets]))
    expect(by.chest).toBe(9)
    expect(by.triceps).toBe(3.6)
  })

  it('reports a longer window as a weekly rate, so the windows read against each other', () => {
    const st = S(W(20, [E(BENCH, 165, 8)]), W(13, [E(BENCH, 165, 8)]), W(6, [E(BENCH, 165, 8)]))
    const by = Object.fromEntries(muscleWeek(st, 28).worked.map(w => [w.m, w.sets]))
    expect(by.chest).toBe(2.3)                     // 9 sets over four weeks
  })

  it('will not tally a week off one workout', () => {
    const r = muscleWeek(S(upperDay(2)), 7)
    expect(r.workouts).toBeLessThan(MIN_COVER_WORKOUTS)
    expect(r.ready).toBe(false)
  })
})
