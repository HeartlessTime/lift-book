import { describe, it, expect } from 'vitest'
import { series, headline, trendOf, highlights, daily } from './vitals.js'
import { buildDays, mergeHealthWeights, OWN_SOURCE } from './healthSync.js'
import { isoOf } from './format.js'

const T = '2026-11-03'
const back = n => { const d = new Date(T + 'T12:00:00'); d.setDate(d.getDate() - n); return isoOf(d) }
const days = {}
for (let i = 0; i < 40; i++) days[back(i)] = { steps: i < 7 ? 10000 : 6000, rhr: i < 7 ? 56 : 60, hrMin: 50, hrMax: 140 + i }

describe('vitals series', () => {
  it('W is seven daily buckets ending today', () => {
    const b = series('steps', 'W', days, [], T)
    expect(b).toHaveLength(7)
    expect(b[6].from).toBe(T)
    expect(b.every(x => x.v === 10000)).toBe(true)
  })
  it('6M averages each week, Y each month', () => {
    expect(series('rhr', '6M', days, [], T)).toHaveLength(26)
    const y = series('rhr', 'Y', days, [], T)
    expect(y).toHaveLength(12)
    expect(y[11].key).toBe('2026-11')
  })
  it('heart rate keeps the band', () => {
    const h = headline('hr', series('hr', 'W', days, [], T), 'W')
    expect(h).toEqual({ kind: 'range', lo: 50, hi: 146 })
  })
  it('weight comes from S.bodyweight', () => {
    expect(daily('weight', days, [{ d: T, w: 175 }])).toEqual([{ d: T, v: 175 }])
  })
})

describe('highlights', () => {
  it('says resting heart rate went down this week', () => {
    const h = trendOf('rhr', days, [], T)
    expect(h.text).toBe('Your resting heart rate averaged 56 bpm this week, 4 lower than the month before.')
    expect(h.good).toBe(1)
  })
  it('returns at most three, biggest move first', () => {
    const list = highlights(days, [], T, 'lb')
    expect(list.length).toBeLessThanOrEqual(3)
    expect(list[0].key).toBe('steps')
  })
})

describe('health sync folding', () => {
  it('keys a day by the sample date and averages HRV readings', () => {
    const out = buildDays({
      steps: [{ startDate: '2026-11-01T05:00:00.000Z', value: 1234 }],
      hrv: [{ startDate: '2026-11-02T15:00:00', value: 40 }, { startDate: '2026-11-02T20:00:00', value: 50 }]
    })
    const d = out.find(x => x.d === '2026-11-02')
    expect(d.hrv).toBe(45)
  })
  it('Health weight fills empty days but never overwrites a hand-logged one', () => {
    const bw = [{ d: '2026-11-01', w: 176, t: 1 }]
    const { bodyweight, changed } = mergeHealthWeights(bw, [
      { startDate: '2026-11-01T14:00:00', value: 80 },
      { startDate: '2026-11-02T14:00:00', value: 79.4 }
    ], 'lb')
    expect(changed).toBe(1)
    expect(bodyweight).toHaveLength(2)
    expect(bodyweight[0]).toEqual({ d: '2026-11-01', w: 176, t: 1 })
    expect(bodyweight[1].w).toBe(175)
    expect(bodyweight[1].src).toBe('health')
  })
  // Backend audit 2026-11-03: a hand weigh-in Lift Book wrote to Health came back in as a "Health"
  // row once he deleted or changed it in Lift Book.
  it('never reads back a weigh-in Lift Book itself wrote to Health', () => {
    const { bodyweight, changed } = mergeHealthWeights([], [
      { startDate: '2026-11-01T08:00:00', value: 80, sourceId: OWN_SOURCE },
      { startDate: '2026-11-02T08:00:00', value: 79.4, sourceId: 'com.withings.wiScaleNG' }
    ], 'lb')
    expect(changed).toBe(1)
    expect(bodyweight.map(b => b.d)).toEqual(['2026-11-02'])
  })
})
