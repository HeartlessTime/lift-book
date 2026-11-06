import { describe, it, expect } from 'vitest'
import { swapOptions, swapInSession } from './swap.js'
import { exerciseNeeds, DEFAULT_GEAR } from './gear.js'

const base = () => ({ routines: [], workouts: [], unit: 'lb', exWeights: {}, customEx: [], gear: { ...DEFAULT_GEAR } })

describe('swapOptions', () => {
  it('offers only lifts for the same muscle group that his gear can do', () => {
    const S = base()
    const opts = swapOptions(S, '0757')           // Smith incline press: chest
    expect(opts.length).toBeGreaterThan(0)
    for (const e of opts) {
      const n = exerciseNeeds(e.id, S)
      expect(n.feasible).toBe(true)
      expect(n.primary).toBe('chest')
    }
    expect(opts.map(e => e.id)).not.toContain('0757')
  })
  it('drops what the session already has', () => {
    const S = base()
    const first = swapOptions(S, '0757')[0].id
    expect(swapOptions(S, '0757', [first]).map(e => e.id)).not.toContain(first)
  })
  it('loses a station once it is gone from the gear list', () => {
    const S = base(); S.gear = { ...DEFAULT_GEAR, stations: DEFAULT_GEAR.stations.filter(s => s !== 'smith') }
    for (const e of swapOptions(S, '0757')) expect(exerciseNeeds(e.id, S).station).not.toBe('smith')
  })
})

describe('swapInSession', () => {
  const S0 = () => {
    const S = base()
    S.routines = [{ id: 'r1', name: 'A', ex: [{ id: '0757', sets: 3, reps: 10, weight: 95 }, { id: '0652', sets: 3, reps: 8, weight: 0 }] }]
    S.active = { id: 'w', d: '2026-10-20', routineId: 'r1', cur: 0, entries: S.routines[0].ex.map(c => ({ id: c.id, target: { ...c }, sets: [{ w: c.weight, r: c.reps, done: false }] })) }
    return S
  }
  it('today only: the session changes, the routine does not', () => {
    const S = S0()
    expect(swapInSession(S, 0, '0748', false)).toBe(false)
    expect(S.active.entries.map(e => e.id)).toEqual(['0748', '0652'])
    expect(S.routines[0].ex[0].id).toBe('0757')
    expect(S.active.entries[0].sets.length).toBe(3)
  })
  it('from now on: both change, nothing is stacked', () => {
    const S = S0()
    expect(swapInSession(S, 0, '0748', true)).toBe(true)
    expect(S.active.entries.map(e => e.id)).toEqual(['0748', '0652'])
    expect(S.routines[0].ex[0].id).toBe('0748')
  })
  it('keeps sets already logged, with the new lift next and current', () => {
    for (const always of [false, true]) {
      const S = S0()
      S.active.entries[0].sets = [{ w: 95, r: 10, done: true }, { w: 95, r: 10, done: false }]
      swapInSession(S, 0, '0748', always)
      expect(S.active.entries.map(e => e.id)).toEqual(['0748', '0757', '0652'])
      expect(S.active.entries[1].sets).toEqual([{ w: 95, r: 10, done: true }])
      expect(S.active.entries[S.active.cur].id).toBe('0748')
    }
  })
  it('a logged swap inside a superset keeps the pair together', () => {
    for (const always of [false, true]) {
      const S = S0()
      S.routines[0].ex = [{ id: '3666', sets: 1, min: 10 }, { id: '0757', sets: 3, reps: 10, sg: 's' }, { id: '0652', sets: 3, reps: 8, sg: 's' }]
      S.active.entries = S.routines[0].ex.map(c => ({ id: c.id, ...(c.sg ? { sg: c.sg } : {}), target: { ...c }, sets: [{ done: false }, { done: false }] }))
      S.active.entries[2].sets[0].done = true
      swapInSession(S, 2, '0861', always)
      const ids = S.active.entries.map(e => e.id + ':' + (e.sg || ''))
      expect(ids).toEqual(['3666:', '0757:s', '0861:s', '0652:'])
      expect(S.active.entries[S.active.cur].id).toBe('0861')
    }
  })
})
