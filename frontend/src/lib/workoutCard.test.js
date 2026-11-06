import { describe, it, expect } from 'vitest'
import { forwardPlan, restAfterTick, cardSnapshot, applyNativeEvents, setTarget, STALE_MS } from './workoutCard.js'
import { EXDB } from './exercises.js'

const LIFT = EXDB.find(e => e.bp !== 'cardio' && e.eq !== 'body weight').id
const LIFT2 = EXDB.filter(e => e.bp !== 'cardio' && e.eq !== 'body weight')[1].id
const NOW = Date.UTC(2026, 8, 30, 18, 0, 0)

const sets = (n, w = 100, r = 8) => Array.from({ length: n }, () => ({ w, r, done: false }))
const entry = (id, n, extra = {}) => ({ id, target: { reps: 8, weight: 100, ...extra }, sets: sets(n) })
const state = (entries, extra = {}) => ({
  unit: 'lb', restSec: 90, accent: 'lime',
  active: { id: 'sess1', name: 'Push Day', start: NOW - 20 * 60e3, cur: 0, entries },
  ...extra
})

describe('forwardPlan', () => {
  it('lists what is left in training order, resting between sets and before the next exercise', () => {
    const S = state([entry(LIFT, 2), entry(LIFT2, 2, { rest: 120 })])
    S.active.entries[0].sets[0].done = true
    const plan = forwardPlan(S)
    expect(plan.map(p => p.key)).toEqual(['0:1', '1:0', '1:1'])
    // last set of the first exercise rests too (the walk to the next one); the final set doesn't
    expect(plan.map(p => p.restSec)).toEqual([90, 120, 0])
    expect(plan[0]).toMatchObject({ setNo: 2, setOf: 2, detail: '100 lb × 8' })
  })

  it('alternates a superset and rests only after the round', () => {
    const a = { ...entry(LIFT, 2), sg: 'x' }
    const b = { ...entry(LIFT2, 2), sg: 'x' }
    const plan = forwardPlan(state([a, b]))
    expect(plan.map(p => p.key)).toEqual(['0:0', '1:0', '0:1', '1:1'])
    expect(plan.map(p => p.restSec)).toEqual([0, 90, 0, 0])
  })

  it('after set 1 of the first superset lift, set 1 of the second is up next', () => {
    const a = { ...entry(LIFT, 3), sg: 'x' }
    const b = { ...entry(LIFT2, 3), sg: 'x' }
    const S = state([a, b])
    S.active.entries[0].sets[0].done = true
    expect(forwardPlan(S).map(p => p.key)).toEqual(['1:0', '0:1', '1:1', '0:2', '1:2'])
  })
  it('rests once per round when a superset has uneven sets, the longest rest of the pair', () => {
    const a = { ...entry(LIFT, 4), sg: 'x' }
    const b = { ...entry(LIFT2, 3, { rest: 120 }), sg: 'x' }
    const plan = forwardPlan(state([a, b, entry(LIFT, 1)]))
    expect(plan.map(p => p.key)).toEqual(['0:0', '1:0', '0:1', '1:1', '0:2', '1:2', '0:3', '2:0'])
    // A's 4th set closes its own round and leads into the next exercise: it rests
    expect(plan.map(p => p.restSec)).toEqual([0, 120, 0, 120, 0, 120, 120, 0])
  })

  it('agrees with the app: no rest mid-round, whichever lift is ticked first', () => {
    const a = { ...entry(LIFT, 2), sg: 'x' }
    const b = { ...entry(LIFT2, 2), sg: 'x' }
    const S = state([a, b, entry(LIFT, 1)])
    const tick = (idx, i) => { const d = JSON.parse(JSON.stringify(S.active.entries[idx])); d.sets[i].done = true; const r = restAfterTick(S, idx, i, d); S.active.entries[idx] = d; return r.sec }
    expect(tick(1, 0)).toBe(0)        // B first: A's set of this round is still open
    expect(tick(0, 0)).toBe(90)       // A closes the round
    expect(tick(0, 1)).toBe(0)
    expect(tick(1, 1)).toBe(90)       // round over, next exercise ahead
    const last = tick(2, 0)
    expect(last).toBe(0)              // nothing left: no rest
  })

  it('stops offering a set skipped from the lock screen', () => {
    const S = state([entry(LIFT, 3)])
    S.active.entries[0].sets[0].skip = true
    expect(forwardPlan(S).map(p => p.key)).toEqual(['0:1', '0:2'])
  })

  it('comes back round to exercises skipped past, rather than calling the workout done', () => {
    const S = state([entry(LIFT, 1), entry(LIFT2, 1)])
    S.active.cur = 1
    S.active.entries[1].sets[0].done = true
    expect(forwardPlan(S).map(p => p.key)).toEqual(['0:0'])
  })

  it('says the per-side split, not the logged total', () => {
    expect(setTarget({ id: LIFT, target: { side: true } }, { w: 40, r: 16 }, 'lb')).toBe('40 lb × 8/side')
  })
})

describe('cardSnapshot', () => {
  it('is nothing without a workout, or for one left open overnight', () => {
    expect(cardSnapshot({ active: null }, null, NOW)).toBe(null)
    const S = state([entry(LIFT, 1)])
    S.active.start = NOW - STALE_MS - 1
    expect(cardSnapshot(S, null, NOW)).toBe(null)
  })

  it('carries the rest as dates, anchored to when it began', () => {
    const S = state([entry(LIFT, 3)])
    S.active.entries[0].sets[0].done = true
    const snap = cardSnapshot(S, { endsAt: NOW + 60e3, total: 105, left: 60 }, NOW)
    expect(snap).toMatchObject({ session: 'sess1', routine: 'Push Day', done: 1, total: 3 })
    expect(snap.rest).toEqual({ endsAt: NOW + 60e3, startedAt: NOW + 60e3 - 105e3 })
    expect(snap.plan[0].key).toBe('0:1')
  })
})

describe('applyNativeEvents', () => {
  it('logs a done set at the moment it was tapped, and marks a skip without logging it', () => {
    const A = state([entry(LIFT, 3)]).active
    const r = applyNativeEvents(A, [
      { key: '0:0', at: NOW - 5000, session: 'sess1' },
      { key: '0:1', at: NOW - 1000, session: 'sess1', kind: 'skip' }
    ], NOW)
    expect(r).toEqual({ done: 1, skipped: 1 })
    expect(A.entries[0].sets[0]).toMatchObject({ done: true, t: NOW - 5000 })
    expect(A.entries[0].sets[1]).toMatchObject({ done: false, skip: true })
  })

  it('never logs a set twice, and never lands a tap from another session', () => {
    const A = state([entry(LIFT, 2)]).active
    A.entries[0].sets[0].done = true
    A.entries[0].sets[0].t = 1
    const r = applyNativeEvents(A, [
      { key: '0:0', at: NOW, session: 'sess1' },
      { key: '0:1', at: NOW, session: 'older' },
      { key: '5:0', at: NOW, session: 'sess1' }
    ], NOW)
    expect(r).toEqual({ done: 0, skipped: 0 })
    expect(A.entries[0].sets[0].t).toBe(1)
    expect(A.entries[0].sets[1].done).toBe(false)
  })

  it('falls back to age for taps queued before sessions were stamped', () => {
    const A = state([entry(LIFT, 2)]).active
    applyNativeEvents(A, [{ key: '0:0', at: NOW - STALE_MS - 1 }, { key: '0:1', at: NOW - 1000 }], NOW)
    expect(A.entries[0].sets.map(x => x.done)).toEqual([false, true])
  })

  it('moves on to the next exercise once the last set of this one is dealt with', () => {
    const A = state([entry(LIFT, 1), entry(LIFT2, 2)]).active
    applyNativeEvents(A, [{ key: '0:0', at: NOW, session: 'sess1', kind: 'skip' }], NOW)
    expect(A.cur).toBe(1)
  })

  it('lands on an earlier exercise still open when the last one is finished', () => {
    const A = state([entry(LIFT, 1), entry(LIFT2, 1)]).active
    A.cur = 1
    applyNativeEvents(A, [{ key: '1:0', at: NOW, session: 'sess1' }], NOW)
    expect(A.cur).toBe(0)
  })
})
