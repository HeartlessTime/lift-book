import { describe, it, expect } from 'vitest'
import { forwardPlan, restAfterTick, applyNativeEvents } from './workoutCard.js'
import { watchNow } from './watchNative.js'
import { supersetUnits } from './history.js'
import { EXDB } from './exercises.js'

/* Supersets walked end to end against an independent oracle: whatever order the sets are
   ticked in, the app's highlighted row, the lock-screen card, the watch and the rest after each
   tick must all match what a lifter means by "a set of each at a time". */

const LIFTS = EXDB.filter(e => e.bp !== 'cardio' && e.eq !== 'body weight').slice(0, 6).map(e => e.id)
const NOW = Date.UTC(2026, 10, 3, 18, 0, 0)

const entry = (k, n, sg, rest) => ({
  id: LIFTS[k], ...(sg ? { sg } : {}), target: { reps: 8, weight: 100, ...(rest ? { rest } : {}) },
  sets: Array.from({ length: n }, (_, j) => ({ w: 100 + j, r: 8, done: false }))
})
const state = (entries, cur = 0) => ({
  unit: 'lb', restSec: 90,
  active: { id: 's1', name: 'Full Body B', start: NOW - 600e3, cur, entries }
})
const open = x => !x.done && !x.skip
const restOf = (S, e) => (e.target && e.target.rest > 0 ? e.target.rest : S.restSec)

// The oracle. Next set: in the unit he is on (then the ones after it, wrapping), the open set
// with the lowest set number, first lift first on a tie.
function oracleNext(S) {
  const A = S.active
  const units = supersetUnits(A.entries)
  const home = units.findIndex(u => u.includes(A.cur))
  for (let k = 0; k < units.length; k++) {
    const unit = units[(home + k) % units.length]
    let best = null
    unit.forEach(ui => A.entries[ui].sets.forEach((x, j) => {
      if (open(x) && (!best || j < best.j)) best = { ui, j }
    }))
    if (best) return best.ui + ':' + best.j
  }
  return ''
}
// Rest after ticking set j of lift ui: only once every other lift of the superset has done its
// set of that round (or skipped it); the longest rest of the superset; none after the last set.
function oracleRest(S, ui, j) {
  const A = S.active
  if (!A.entries.some(e => e.sets.some(open))) return 0
  const unit = supersetUnits(A.entries).find(u => u.includes(ui))
  const roundOpen = unit.some(k => k !== ui && A.entries[k].sets.some((x, jj) => open(x) && jj <= j))
  return roundOpen ? 0 : Math.max(...unit.map(k => restOf(S, A.entries[k])))
}

// Ticks set `key` the way Workout.jsx does: restAfterTick on the draft, then the store write.
function tick(S, key) {
  const [idx, i] = key.split(':').map(Number)
  const draft = structuredClone(S.active.entries[idx])
  draft.sets[i].done = true
  const rest = restAfterTick(S, idx, i, draft)
  S.active.entries[idx] = draft
  return rest
}

// Every screen agrees with the oracle about what is up now.
function checkNext(S) {
  const plan = forwardPlan(S)
  const want = oracleNext(S)
  expect(plan[0] ? plan[0].key : '').toBe(want)               // app highlight + lock-screen card
  if (want) {
    const [ui, j] = want.split(':').map(Number)
    expect(watchNow(S, null, NOW)).toMatchObject({ setNo: j + 1, setOf: S.active.entries[ui].sets.length })
  }
  return plan
}

// Runs a whole workout, ticking in the order `pick` chooses, checking every step.
function run(S, pick) {
  const log = []
  for (let guard = 0; guard < 200; guard++) {
    const plan = checkNext(S)
    if (!plan.length) break
    const key = pick(S, plan)
    const [ui, j] = key.split(':').map(Number)
    // The card's own restSec for the set he follows the plan on must be the app's rest.
    const planned = plan.find(p => p.key === key)
    const rest = tick(S, key)
    expect(rest.sec).toBe(oracleRest(S, ui, j))
    if (planned && key === plan[0].key) expect(planned.restSec).toBe(rest.sec)
    log.push(key + (rest.sec ? ' rest ' + rest.sec : ''))
  }
  return log
}

const follow = (S, plan) => plan[0].key

describe('supersets, end to end', () => {
  it('two lifts, three sets each: A1 B1 rest, A2 B2 rest, A3 B3', () => {
    const S = state([entry(0, 3, 'x'), entry(1, 3, 'x')])
    expect(run(S, follow)).toEqual(['0:0', '1:0 rest 90', '0:1', '1:1 rest 90', '0:2', '1:2'])
  })

  it('the bug he hit: after A set 1 the next set is B set 1, everywhere', () => {
    const S = state([entry(0, 3, 'x'), entry(1, 3, 'x')])
    expect(tick(S, '0:0').sec).toBe(0)
    expect(forwardPlan(S)[0].key).toBe('1:0')
    expect(watchNow(S, null, NOW)).toMatchObject({ setNo: 1, setOf: 3 })
  })

  it('uneven sets: the longer lift finishes alone, resting between its own sets', () => {
    const S = state([entry(0, 4, 'x'), entry(1, 2, 'x', 120)])
    expect(run(S, follow)).toEqual(['0:0', '1:0 rest 120', '0:1', '1:1 rest 120', '0:2 rest 120', '0:3'])
  })

  it('uneven the other way round', () => {
    const S = state([entry(0, 2, 'x'), entry(1, 4, 'x')])
    expect(run(S, follow)).toEqual(['0:0', '1:0 rest 90', '0:1', '1:1 rest 90', '1:2 rest 90', '1:3'])
  })

  it('a three-lift giant set rests once per round', () => {
    const S = state([entry(0, 2, 'x'), entry(1, 2, 'x'), entry(2, 2, 'x')])
    expect(run(S, follow)).toEqual(['0:0', '1:0', '2:0 rest 90', '0:1', '1:1', '2:1'])
  })

  it('a superset between straight sets: rest into it, through it, and out of it', () => {
    const S = state([entry(0, 2), entry(1, 2, 'x'), entry(2, 2, 'x'), entry(3, 1)])
    expect(run(S, follow)).toEqual([
      '0:0 rest 90', '0:1 rest 90',
      '1:0', '2:0 rest 90', '1:1', '2:1 rest 90',
      '3:0'
    ])
  })

  it('two supersets back to back stay apart', () => {
    const S = state([entry(0, 2, 'x'), entry(1, 2, 'x'), entry(2, 2, 'y'), entry(3, 2, 'y')])
    expect(run(S, follow)).toEqual([
      '0:0', '1:0 rest 90', '0:1', '1:1 rest 90',
      '2:0', '3:0 rest 90', '2:1', '3:1'
    ])
  })

  it('B done before A in a round: A is next, then the rest', () => {
    const S = state([entry(0, 2, 'x'), entry(1, 2, 'x')])
    expect(tick(S, '1:0').sec).toBe(0)
    expect(checkNext(S)[0].key).toBe('0:0')
    expect(tick(S, '0:0').sec).toBe(90)
    expect(checkNext(S)[0].key).toBe('0:1')
  })

  it('A raced ahead two sets: B catches up before A goes on', () => {
    const S = state([entry(0, 3, 'x'), entry(1, 3, 'x')])
    tick(S, '0:0'); tick(S, '0:1')
    expect(checkNext(S)[0].key).toBe('1:0')
  })

  it('a set skipped from the lock screen is passed over, and the round still closes', () => {
    const S = state([entry(0, 2, 'x'), entry(1, 2, 'x')])
    S.active.entries[1].sets[0].skip = true
    expect(tick(S, '0:0').sec).toBe(90)
    expect(checkNext(S)[0].key).toBe('0:1')
  })

  it('on the second lift of a superset, the plan still starts from the superset', () => {
    const S = state([entry(0, 2), entry(1, 2, 'x'), entry(2, 2, 'x')], 2)
    expect(checkNext(S)[0].key).toBe('1:0')
  })

  it('lock-screen Completes walking the plan land on the same sets the app would', () => {
    const S = state([entry(0, 3, 'x'), entry(1, 3, 'x')])
    const plan = forwardPlan(S)
    // The native card walks a cursor through the plan: three Completes on the lock screen.
    const events = plan.slice(0, 3).map((p, k) => ({ kind: 'done', key: p.key, session: 's1', at: NOW + k }))
    expect(events.map(e => e.key)).toEqual(['0:0', '1:0', '0:1'])
    applyNativeEvents(S.active, events, NOW + 10)
    expect(checkNext(S)[0].key).toBe('1:1')
  })

  it('fuzz: any tick order, any shape, every screen and every rest matches the oracle', () => {
    // mulberry32: a plain LCG's low bits alternate, which never put two neighbours in one superset
    let seed = 7
    const rnd = n => {
      seed = (seed + 0x6D2B79F5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return (((t ^ (t >>> 14)) >>> 0) % n)
    }
    let supersets = 0
    for (let trial = 0; trial < 400; trial++) {
      const entries = []
      const n = 1 + rnd(5)
      for (let k = 0; k < n; k++) {
        const sg = rnd(3) ? ['x', 'y'][rnd(2)] : null
        entries.push(entry(k, 1 + rnd(4), sg, rnd(3) ? 0 : 60 + 30 * rnd(4)))
      }
      if (supersetUnits(entries).some(u => u.length > 1)) supersets++
      const S = state(entries, rnd(n))
      // Some sets skipped up front, as if from the lock screen.
      for (const e of entries) for (const x of e.sets) if (!rnd(8)) x.skip = true
      run(S, (S2, plan) => (rnd(3) ? plan[0].key : plan[rnd(plan.length)].key))
    }
    expect(supersets).toBeGreaterThan(80)   // the fuzz is about supersets; make sure it makes them
  })
})
