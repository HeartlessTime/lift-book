import { describe, it, expect } from 'vitest'
import { EXDB } from './exercises.js'
import { watchEvents, watchNow } from './watchNative.js'
import { weightsToPush } from './healthSync.js'
import { mainLifts, workingSet, workingChange } from './vitals.js'

const NOW = Date.parse('2026-11-03T18:00:00')
const A = { id: 'w1', start: NOW - 3600e3, name: 'Full Body A', entries: [] }

describe('watch workout events', () => {
  it('starts the watch when a fresh session appears', () => {
    expect(watchEvents({ active: null, workouts: [] }, { active: A, workouts: [] }, NOW))
      .toEqual([{ kind: 'start', session: 'w1', startedAt: A.start, name: 'Full Body A' }])
  })
  it('a session that lands in workouts was finished, with its real start and end', () => {
    const w = { id: 'w1', start: A.start, end: NOW }
    expect(watchEvents({ active: A, workouts: [] }, { active: null, workouts: [w] }, NOW))
      .toEqual([{ kind: 'finish', session: 'w1', startedAt: A.start, endedAt: NOW }])
  })
  it('a session that just disappears was discarded', () => {
    expect(watchEvents({ active: A, workouts: [] }, { active: null, workouts: [] }, NOW))
      .toEqual([{ kind: 'discard', session: 'w1' }])
  })
  it('nothing for an unchanged session, and no start for a stale one', () => {
    expect(watchEvents({ active: A }, { active: { ...A, cur: 2 } }, NOW)).toEqual([])
    expect(watchEvents(null, { active: { ...A, start: NOW - 13 * 3600e3 } }, NOW)).toEqual([])
  })
})

describe('hand weigh-ins to Apple Health', () => {
  const kg = lb => lb / 2.2046226218
  it('sends hand entries Health lacks, never ones that came from Health', () => {
    const bw = [{ d: '2026-11-01', w: 175.2, t: Date.parse('2026-11-01T07:10:00') }, { d: '2026-11-02', w: 175, src: 'health' }]
    const { push, seen } = weightsToPush(bw, [], 'lb', {}, '2026-10-01')
    expect(push.map(p => p.d)).toEqual(['2026-11-01'])
    expect(push[0].kg).toBeCloseTo(kg(175.2), 2)
    expect(push[0].at).toBe(Date.parse('2026-11-01T07:10:00'))
    expect(seen).toEqual({ '2026-11-01': 175.2 })
  })
  it('skips a day Health already has (any source) and one already pushed', () => {
    const bw = [{ d: '2026-11-01', w: 175.2 }, { d: '2026-11-02', w: 175 }]
    const samples = [{ startDate: '2026-11-01T13:00:00', value: kg(175.3) }]
    const { push, seen } = weightsToPush(bw, samples, 'lb', { '2026-11-02': 175 }, '2026-10-01')
    expect(push).toEqual([])
    expect(seen).toEqual({ '2026-11-01': 175.2 })
  })
  it('re-sends a day whose hand number changed, and ignores days before the window', () => {
    const bw = [{ d: '2026-09-01', w: 170 }, { d: '2026-11-02', w: 176 }]
    const { push } = weightsToPush(bw, [], 'lb', { '2026-11-02': 175 }, '2026-10-30')
    expect(push.map(p => p.d)).toEqual(['2026-11-02'])
  })
})

describe('main lifts ranking', () => {
  it('puts compound lifts ahead of a more-trained cable isolation lift', () => {
    const set = (w, r) => ({ w, r, done: true })
    const wk = (d) => ({ d, entries: [
      { id: '0178', sets: [set(21, 12)] },                 // cable lateral raise, every session
      { id: '0025', sets: [set(185, 5)] }                  // barbell bench press
    ] })
    const S = { workouts: [wk('2026-10-20'), wk('2026-10-27'), { d: '2026-11-01', entries: [{ id: '0178', sets: [set(21, 12)] }] }] }
    const lifts = mainLifts(S, '2026-11-03')
    expect(lifts[0].id).toBe('0025')
    expect(lifts.map(l => l.id)).toEqual(['0025', '0178'])
  })
})

describe('working weight', () => {
  const set = (w, r, done = true) => ({ w, r, done })
  it('is the weight of most completed sets, a tie going to the heavier', () => {
    expect(workingSet([set(10, 15), set(12.5, 12), set(12.5, 12)])).toEqual({ w: 12.5, r: 12 })
    expect(workingSet([set(185, 8), set(205, 6)])).toEqual({ w: 205, r: 6 })
    expect(workingSet([set(15, 13), set(15, 12), set(15, 12)])).toEqual({ w: 15, r: 12 })
  })
  it('ignores sets not done, warm-ups and zero weight', () => {
    expect(workingSet([set(225, 5, false), set(225, 5, false), set(185, 8)])).toEqual({ w: 185, r: 8 })
    expect(workingSet([{ w: 95, r: 10, done: true, warmup: true }, { w: 95, r: 10, done: true, warm: true }, set(135, 8)])).toEqual({ w: 135, r: 8 })
    expect(workingSet([set(0, 12), set(0, 12)])).toBe(null)
  })
  it('leaves bodyweight-only lifts off the card', () => {
    const S = { workouts: [{ d: '2026-11-01', entries: [{ id: 'pushup', sets: [set(0, 20), set(0, 20)] }, { id: '0025', sets: [set(185, 5)] }] }] }
    expect(mainLifts(S, '2026-11-03').map(l => l.id)).toEqual(['0025'])
  })
  it('compares with the latest session on or before 30 days ago', () => {
    const pts = [['2026-09-20', 175], ['2026-10-01', 180], ['2026-10-10', 185], ['2026-11-01', 190]].map(([d, w]) => ({ d, w, y: w, r: 8 }))
    expect(workingChange(pts, '2026-11-03')).toEqual({ delta: 10, since: '2026-10-01' })
    expect(workingChange(pts.slice(2), '2026-11-03')).toEqual({ delta: 5, since: '2026-10-10' })   // short history: the first session
    expect(workingChange(pts.slice(3), '2026-11-03')).toEqual({ delta: null, since: null })
  })
  it('reads no change since the start of the run at that weight (his cable lateral raise)', () => {
    const S = { workouts: [['2026-08-24', [10, 12.5, 12.5]], ['2026-08-31', [17.5, 17.5, 17.5]], ['2026-09-10', [15, 15, 15]],
      ['2026-09-21', [15, 15, 15]], ['2026-10-05', [15, 15, 15]], ['2026-10-29', [15, 15, 15]]]
      .map(([d, ws]) => ({ d, entries: [{ id: '0178', sets: ws.map(w => set(w, 12)) }] })) }
    const [l] = mainLifts(S, '2026-11-03')
    expect([l.w, l.r, l.delta, l.since]).toEqual([15, 12, 0, '2026-09-10'])
  })
})

describe('the watch screen', () => {
  const LIFT = EXDB.find(e => e.bp !== 'cardio' && e.eq !== 'body weight')
  const S = {
    unit: 'lb', restSec: 90,
    active: { id: 'w1', start: NOW - 600e3, cur: 0, entries: [{ id: LIFT.id, target: {}, sets: [
      { w: 40, r: 12, done: true }, { w: 40, r: 12, done: false }, { w: 40, r: 10, done: false }] }] }
  }
  it('shows the set up now: lift, set N of M, weight x reps', () => {
    expect(watchNow(S, null, NOW)).toEqual({ exercise: LIFT.n, detail: '40 lb × 12', setNo: 2, setOf: 3, restEndsAt: 0, restTotal: 0 })
  })
  it('carries a running rest, and drops one that is over', () => {
    expect(watchNow(S, { endsAt: NOW + 60e3, total: 90 }, NOW)).toMatchObject({ restEndsAt: NOW + 60e3, restTotal: 90 })
    expect(watchNow(S, { endsAt: NOW - 1, total: 90 }, NOW)).toMatchObject({ restEndsAt: 0, restTotal: 0 })
  })
  it('a blank screen, not a crash, with no session', () => {
    expect(watchNow({ active: null }, null, NOW).exercise).toBe('')
  })
})
