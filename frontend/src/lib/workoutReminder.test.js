import { describe, it, expect } from 'vitest'
import { workoutSchedule } from './native.js'

// 2026-10-19 is a Monday. Local times, as the scheduler works in.
const at = iso => new Date(iso)
const days = list => list.map(n => {
  const d = n.schedule.at
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
})
const S = (over = {}) => ({
  reminder: { on: true, time: '17:00' },
  routines: [{ id: 'A', name: 'Full Body A', ex: [] }, { id: 'B', name: 'Full Body B', ex: [] }, { id: 'C', name: 'Full Body C', ex: [] }],
  week: { 1: 'A', 2: 'B', 4: 'C' }, dayPlan: {}, workouts: [], ...over
})

describe('workoutSchedule (per-date reminder)', () => {
  it('is empty when the reminder is off', () => {
    expect(workoutSchedule(S({ reminder: { on: false, time: '17:00' } }), at('2026-10-19T08:00'))).toEqual([])
  })

  it('lays one alert per plan date at the reminder time', () => {
    const out = workoutSchedule(S(), at('2026-10-19T08:00'))
    expect(days(out)).toEqual(['2026-10-19', '2026-10-20', '2026-10-22'])
    expect(out[0].schedule.at.getHours()).toBe(17)
    expect(out[0].body).toMatch(/Full Body A/)
    expect(new Set(out.map(n => n.id)).size).toBe(out.length)
  })

  it('follows a moved day and a rest override', () => {
    const out = workoutSchedule(S({ dayPlan: { '2026-10-22': 'rest', '2026-10-21': 'C' } }), at('2026-10-19T08:00'))
    expect(days(out)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21'])
  })

  it('skips a day already trained, and a time already gone', () => {
    expect(days(workoutSchedule(S({ workouts: [{ d: '2026-10-19', entries: [] }] }), at('2026-10-19T08:00')))).toEqual(['2026-10-20', '2026-10-22'])
    expect(days(workoutSchedule(S(), at('2026-10-19T17:30')))).toEqual(['2026-10-20', '2026-10-22'])
  })
})
