import { describe, it, expect } from 'vitest'
import { weighInSchedule } from './native.js'

// 2026-09-03 is a Thursday. Times below are local, which is what the scheduler works in.
const at = (iso) => new Date(iso)
const S = (over = {}) => ({ weighIn: { on: true, time: '21:00' }, bodyweight: [], ...over })
// Local date, deliberately not toISOString(): an evening slot converts to the next UTC day in
// any western timezone, which would make these assertions test the runner's offset.
const days = (list) => list.map(n => {
  const d = n.schedule.at
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
})

describe('weighInSchedule', () => {
  it('lays down nothing at all when the reminder is off', () => {
    expect(weighInSchedule(S({ weighIn: { on: false, time: '21:00' } }), at('2026-09-03T08:00'))).toEqual([])
    expect(weighInSchedule({}, at('2026-09-03T08:00'))).toEqual([])
  })

  it('covers a week from today when tonight is still ahead', () => {
    const out = weighInSchedule(S(), at('2026-09-03T08:00'))
    expect(days(out)).toEqual([
      '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06',
      '2026-09-07', '2026-09-08', '2026-09-09',
    ])
    expect(out[0].schedule.at.getHours()).toBe(21)
    expect(out[0].schedule.at.getMinutes()).toBe(0)
  })

  // The nightly server version simply didn't send once the time had passed. A schedule laid down
  // in advance has to drop that slot itself, or iOS fires it the moment it is set.
  it('drops tonight once the hour has gone by, and starts tomorrow', () => {
    const out = weighInSchedule(S(), at('2026-09-03T22:30'))
    expect(days(out)[0]).toBe('2026-09-04')
    expect(days(out)).toHaveLength(6)
  })

  // The behaviour worth keeping from the old push: don't nag a man who already weighed in.
  it('skips a day that already has a weight logged', () => {
    const out = weighInSchedule(S({ bodyweight: [{ d: '2026-09-03', w: 180 }, { d: '2026-09-05', w: 179 }] }),
      at('2026-09-03T08:00'))
    expect(days(out)).not.toContain('2026-09-03')
    expect(days(out)).not.toContain('2026-09-05')
    expect(days(out)).toContain('2026-09-04')
    expect(days(out)).toHaveLength(5)
  })

  it('keeps the weigh-in ids clear of the workout-day range, and unique', () => {
    const ids = weighInSchedule(S(), at('2026-09-03T08:00')).map(n => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toBeGreaterThanOrEqual(110)
  })

  it('says what it is for, so the tap can open the scale sheet', () => {
    expect(weighInSchedule(S(), at('2026-09-03T08:00'))[0].extra).toEqual({ open: 'weight' })
  })

  it('refuses a malformed time rather than scheduling at NaN', () => {
    expect(weighInSchedule(S({ weighIn: { on: true, time: 'half past nine' } }), at('2026-09-03T08:00'))).toEqual([])
  })

  it('falls back to the default hour when the time is missing entirely', () => {
    const out = weighInSchedule(S({ weighIn: { on: true } }), at('2026-09-03T08:00'))
    expect(out[0].schedule.at.getHours()).toBe(21)
  })
})
