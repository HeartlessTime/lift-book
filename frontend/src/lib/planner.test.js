import { describe, it, expect } from 'vitest'
import { checkRoutine, orderRoutine, setupPlan, simulate, loadFor } from './planner.js'
import { DEFAULT_GEAR } from './gear.js'

const base = () => ({ unit: 'lb', gear: JSON.parse(JSON.stringify(DEFAULT_GEAR)), workouts: [], exWeights: {}, routines: [] })
const lift = (id, weight, extra) => ({ id, sets: 3, reps: 12, repsMin: 8, mode: 'reps', prog: 'double', weight, since: '2026-10-19', ...(extra || {}) })
const R = ex => ({ id: 'r1', name: 'Test', ex })

describe('loadFor', () => {
  it('uses the restart weight, else the start-here cache, else the plan', () => {
    const S = base()
    expect(loadFor(lift('0757', 190), S)).toBe(190)
    S.exWeights['0241'] = { w: 140 }
    expect(loadFor({ id: '0241', sets: 3, reps: 12, weight: 0 }, S)).toBe(140)
    expect(loadFor({ id: '3666', sets: 1, min: 15 }, S)).toBe(0)
  })
})

describe('checkRoutine', () => {
  it('passes a clean, low-setup routine', () => {
    const r = R([{ id: '3666', sets: 1, min: 15 }, lift('0757', 190), lift('0770', 135, { since: undefined, weight: 135 }), lift('0652', 0), lift('cpallofpress', 55, { side: true, reps: 24, repsMin: 16 })])
    const c = checkRoutine(r, base())
    expect(c.problems).toEqual([])
    expect(c.ok).toBe(true)
  })

  it('flags two heavy lifts for the same muscle back to back', () => {
    const c = checkRoutine(R([lift('0757', 190), lift('0748', 185)]), base())
    expect(c.problems.map(p => p.rule)).toContain('order')
  })

  it('lets light isolation follow its compound', () => {
    const c = checkRoutine(R([lift('0757', 190), lift('0188', 45)]), base())
    expect(c.problems.map(p => p.rule)).not.toContain('order')
  })

  it('flags strip-and-reload (lighter Smith lift before a heavier one)', () => {
    const c = checkRoutine(R([lift('0770', 135), lift('0652', 0), lift('0757', 190)]), base())
    expect(c.problems.map(p => p.rule)).toContain('setup')
  })

  it('flags gear it cannot do, loads it cannot make and the hard rules', () => {
    const rules = checkRoutine(R([
      lift('clandminesquat', 95),
      lift('0757', 175),                          // 65 a side is not makeable
      lift('0770', 155),                          // over the 135 cap on the shoulders
      lift('0165', 100, { sets: 4 }),             // never a 4th set
      lift('0241', 100, { reps: 15 })             // nothing above 12
    ]), base()).problems.map(p => p.rule)
    expect(rules).toEqual(expect.arrayContaining(['gear', 'budget', 'cap', 'sets', 'reps']))
  })

  it('checks the budget across stations loaded at the same time', () => {
    // 270 on the Smith leaves 45 + 45 + 25 + 25 + ... gone: a 145 shrug on a horn cannot also fit.
    const S = base()
    const sim = simulate(R([lift('0757', 290), lift('0220', 145), lift('0757', 290)]), S)
    expect(sim.tot.reloads + sim.tot.budget).toBeGreaterThan(0)
  })
})

describe('orderRoutine', () => {
  it('puts the heavier Smith load first so plates only come off', () => {
    const S = base()
    const r = R([{ id: '3666', sets: 1, min: 15 }, lift('0770', 135), lift('0757', 190), lift('0652', 0)])
    const { routine, changes } = orderRoutine(r, S)
    expect(routine.ex[0].id).toBe('3666')                       // the walk stays first
    expect(routine.ex.map(e => e.id).indexOf('0757')).toBeLessThan(routine.ex.map(e => e.id).indexOf('0770'))
    expect(changes.length).toBeGreaterThan(0)
    expect(checkRoutine(routine, S).ok).toBe(true)
  })

  it('separates two heavy chest lifts', () => {
    const S = base()
    const { routine } = orderRoutine(R([lift('0757', 190), lift('0748', 185), lift('0770', 135)]), S)
    expect(checkRoutine(routine, S).problems.filter(p => p.rule === 'order')).toEqual([])
  })

  it('keeps a superset together', () => {
    const S = base()
    const r = R([lift('0165', 100, { sg: 'a' }), lift('0241', 100, { sg: 'a' }), lift('0757', 190)])
    const ids = orderRoutine(r, S).routine.ex.map(e => e.id)
    expect(Math.abs(ids.indexOf('0165') - ids.indexOf('0241'))).toBe(1)
  })
})

describe('setupPlan', () => {
  it('says what to load and what comes off between lifts', () => {
    const steps = setupPlan(R([lift('0757', 190), lift('0770', 135)]), base()).map(s => s.text)
    expect(steps[0]).toMatch(/load the Smith with 45 \+ 25 \+ 2\.5 each side/)
    expect(steps[1]).toMatch(/take 25 \+ 2\.5 off the Smith each side \(now 135 lb\)/)
    expect(steps[1]).toMatch(/bench out/)
    expect(steps[steps.length - 1]).toMatch(/rack it/)
  })

  it('reuses one horn and swaps the attachment', () => {
    const steps = setupPlan(R([lift('0165', 105), lift('0241', 100)]), base()).map(s => s.text)
    expect(steps[1]).toMatch(/take 5 off the left cable/)
    expect(steps[1]).toMatch(/swap the rope for the V-handle/)
  })
})
