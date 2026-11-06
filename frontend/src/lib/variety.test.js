import { describe, it, expect } from 'vitest'
import { weekCheck, resolveWeek, resolveRoutine, variantCfg, mondayOf, weekIndex, sessionMinutes, GROUPS, isSlot, hitsOf } from './variety.js'
import { SLOT_ROUTINES } from './variety-plan.js'
import { checkRoutine, simulate, loadFor } from './planner.js'
import { exerciseNeeds, DEFAULT_GEAR } from './gear.js'
import { EXIDX, registerCustom } from './exercises.js'

// His three custom lifts live in his state, not the library; the app registers them on load.
registerCustom([
  { id: 'clandminerdl', n: 'Landmine RDL', bp: 'upper legs', tg: 'hamstring', eq: 'custom', custom: true },
  { id: 'cpallofpress', n: 'Cable Pallof Press', bp: 'waist', tg: 'obliques', eq: 'custom', custom: true },
  { id: 'csmithcalfbehind', n: 'Smith Calf Raise (bar behind back)', bp: 'lower legs', tg: 'calves', eq: 'custom', custom: true }
])

const SINCE = '2026-10-19'
const plan = () => {
  const routines = SLOT_ROUTINES(SINCE)
  const week = {}
  routines.forEach(r => { week[r.day] = r.id; delete r.day })
  return { unit: 'lb', restSec: 120, gear: JSON.parse(JSON.stringify(DEFAULT_GEAR)), workouts: [], exWeights: {}, dayPlan: {}, routines, week }
}
const addWeeks = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 7 * n); return d.toISOString().slice(0, 10) }
const FIRST = '2026-10-26'
const WEEKS = Array.from({ length: 12 }, (_, i) => addWeeks(FIRST, i))
const S0 = plan()
const checks = WEEKS.map(w => weekCheck(S0, w))
const idsOn = (wk, rid) => wk.days.find(d => d.routineId === rid).exercises.map(e => e.id)

describe('weeks', () => {
  it('mondayOf and weekIndex step one a week', () => {
    expect(mondayOf('2026-10-22')).toBe('2026-10-19')
    expect(mondayOf('2026-10-25')).toBe('2026-10-19')
    expect(mondayOf('2026-10-19')).toBe('2026-10-19')
    expect(weekIndex('2026-10-26') - weekIndex('2026-10-21')).toBe(1)
  })
})

describe('the slot plan itself', () => {
  const S = plan()
  it('every pool member exists, fits his gear and obeys the set/rep rules', () => {
    S.routines.forEach(r => r.ex.forEach(e => {
      ;(isSlot(e) ? e.pool : [e.id]).forEach(id => {
        expect(EXIDX[id], id).toBeTruthy()
        expect(exerciseNeeds(id, S).feasible, id + ' ' + exerciseNeeds(id, S).why).toBe(true)
        const cfg = variantCfg(e, id)
        if (cfg.id === '3666') return
        expect(cfg.sets).toBe(3)
        expect(cfg.side ? cfg.reps / 2 : cfg.reps).toBeLessThanOrEqual(12)
      })
    }))
  })
  it('no core variant flexes the spine', () => {
    const core = S.routines.flatMap(r => r.ex).filter(e => e.slot === 'core').flatMap(e => e.pool)
    core.forEach(id => expect(EXIDX[id].n).not.toMatch(/crunch|sit-?up|side bend|twist|v-up|leg raise/))
  })
  it('keeps the routine ids, so the week plan and history still point at them', () => {
    expect(S.routines.map(r => r.id)).toEqual(['mtfullbodya01', 'mtfullbodyb01', 'mtfullbodyc01'])
  })
})

describe('weekCheck over 12 consecutive weeks of his plan', () => {
  // Full Body A runs about 65 min since he turned down its lateral raise + calf superset
  // (2026-10-29); the week check reports that, and it is the only thing it may report.
  const aOverHour = x => x.rule === 'time' && /^Full Body A /.test(x.message)
  it('every week is ok', () => {
    checks.forEach(wk => expect(wk.problems.filter(x => !aOverHour(x)), wk.weekStart).toEqual([]))
  })
  it('three sessions, Mon/Tue/Thu', () => {
    checks.forEach(wk => expect(wk.days.map(d => new Date(d.date + 'T12:00:00').getDay())).toEqual([1, 2, 4]))
  })
  it('no lift twice in a week', () => {
    checks.forEach(wk => {
      expect(wk.repeats).toEqual([])
      const all = wk.days.flatMap(d => d.exercises.filter(e => e.mode !== 'cardio').map(e => e.id))
      expect(new Set(all).size, wk.weekStart).toBe(all.length)
    })
  })
  it('every slot changes from last week', () => {
    checks.forEach(wk => expect(wk.sameAsLastWeek, wk.weekStart).toEqual([]))
    for (let i = 1; i < checks.length; i++) {
      const a = resolveWeek(S0, WEEKS[i - 1]).picks; const b = resolveWeek(S0, WEEKS[i]).picks
      S0.routines.forEach(r => r.ex.forEach((e, j) => { if (isSlot(e)) expect(b[r.id][j], r.name + ' ' + e.slot + ' ' + WEEKS[i]).not.toBe(a[r.id][j]) }))
    }
  })
  it('every muscle group gets at least 2 hits, and the small ones a direct lift', () => {
    checks.forEach(wk => {
      GROUPS.forEach(g => expect(wk.coverage[g], g + ' ' + wk.weekStart).toBeGreaterThanOrEqual(2))
      ;['biceps', 'triceps', 'calves', 'core', 'side delts'].forEach(g => expect(wk.direct[g], g + ' ' + wk.weekStart).toBeGreaterThanOrEqual(1))
    })
  })
  it('a cable lateral raise every week (rule 10)', () => {
    checks.forEach(wk => {
      const all = wk.days.flatMap(d => d.exercises.map(e => e.id))
      expect(all.some(id => ['0178', '0192'].includes(id)), wk.weekStart).toBe(true)
    })
  })
  it('every session is under an hour and passes checkRoutine', () => {
    checks.forEach(wk => wk.days.forEach(d => {
      expect(d.minutes).toBeLessThanOrEqual(d.routineId === 'mtfullbodya01' ? 65 : 60)
      expect(d.check.problems, d.date).toEqual([])
      expect(d.setup.length).toBeGreaterThan(2)
    }))
  })
  it('chest: one Smith press and one cable fly each week, and both change week to week', () => {
    const presses = new Set(); const flies = new Set()
    checks.forEach(wk => {
      const a = idsOn(wk, 'mtfullbodya01'); const c = idsOn(wk, 'mtfullbodyc01')
      const p = a.find(id => ['0757', '0748'].includes(id)); const f = c.find(id => ['0179', '0188', '0171'].includes(id))
      expect(p, wk.weekStart).toBeTruthy(); expect(f, wk.weekStart).toBeTruthy()
      presses.add(p); flies.add(f)
    })
    expect([...presses].sort()).toEqual(['0748', '0757'])
    expect(flies.size).toBe(3)
  })
  it('triceps: two different direct lifts a week, and all four variants come round', () => {
    const TRI = ['0201', '1723', '1724', '0241']
    const seen = new Set()
    let barAndRope = false
    checks.forEach(wk => {
      const t = wk.days.flatMap(d => d.exercises.map(e => e.id)).filter(id => TRI.includes(id))
      expect(t.length, wk.weekStart).toBe(2)
      expect(new Set(t).size).toBe(2)
      t.forEach(id => seen.add(id))
      if (t.includes('0201') && t.includes('1723')) barAndRope = true
    })
    expect(seen.size).toBe(4)
    // His example: straight-bar pushdown and one-arm rope pushdown in the same week.
    expect(barAndRope).toBe(true)
  })
  it('supersets never share a station', () => {
    checks.forEach(wk => wk.days.forEach(d => {
      const r = S0.routines.find(x => x.id === d.routineId)
      const resolved = resolveRoutine(S0, r, d.date)
      const sim = simulate(resolved, S0)
      resolved.ex.forEach((e, i) => {
        if (i && e.sg && resolved.ex[i - 1].sg === e.sg) {
          const a = sim.recs[i - 1].keys; const b = sim.recs[i].keys
          expect(a.filter(k => b.includes(k)), d.date).toEqual([])
        }
      })
    }))
  })
})

describe('resolving', () => {
  it('lays the variant’s own settings over the slot’s', () => {
    const e = { slot: 'x', pool: ['0201', '1723'], id: '0201', sets: 3, reps: 12, repsMin: 8, opts: { 1723: { weight: 40, side: true, reps: 24 } } }
    expect(variantCfg(e, '1723')).toMatchObject({ id: '1723', slot: 'x', weight: 40, side: true, reps: 24, sets: 3 })
    expect(variantCfg(e, '1723').pool).toBeUndefined()
    expect(variantCfg({ id: '0757', sets: 3 }, '0757')).toEqual({ id: '0757', sets: 3 })
  })
  it('leaves a routine without slots exactly as it is', () => {
    const S = plan()
    const r = { id: 'x', name: 'X', ex: [{ id: '0757', sets: 3, reps: 8 }] }
    expect(resolveRoutine(S, r, '2026-10-27')).toBe(r)
  })
  it('a moved session resolves the same as on its planned day', () => {
    const S = plan()
    const b = S.routines.find(r => r.id === 'mtfullbodyb01')
    expect(resolveRoutine(S, b, '2026-10-28').ex.map(e => e.id)).toEqual(resolveRoutine(S, b, '2026-10-27').ex.map(e => e.id))
  })
  it('picks stay put for the rest of the week after Monday is logged', () => {
    const S = plan()
    const before = resolveWeek(S, '2026-11-02').picks
    const a = resolveRoutine(S, S.routines[0], '2026-11-02')
    S.workouts.push({ id: 'w1', d: '2026-11-02', routineId: 'mtfullbodya01', entries: a.ex.map(e => ({ id: e.id, target: e, sets: [1, 2, 3].map(() => ({ w: e.weight || 0, r: e.reps, done: true })) })) })
    expect(resolveWeek(S, '2026-11-02').picks).toEqual(before)
  })
  it('a variant picked again later resumes from its own last session', () => {
    const S = plan()
    const slotE = S.routines[0].ex.find(e => e.slot === 'chest press')
    // Flat press done at 185 × 12 × 3 two weeks ago: next time it goes up, not back to the start.
    S.workouts.push({ id: 'w', d: '2026-10-27', entries: [{ id: '0748', target: variantCfg(slotE, '0748'), sets: [1, 2, 3].map(() => ({ w: 185, r: 12, done: true })) }] })
    expect(loadFor(variantCfg(slotE, '0748'), S, S.routines[0])).toBe(190)
    // The incline was never done since the restart, so it starts at its own plan weight.
    expect(loadFor(variantCfg(slotE, '0757'), S, S.routines[0])).toBe(190)
  })
})

describe('time and coverage helpers', () => {
  it('4 lifts and one superset pair is about 59 minutes; the walk is not counted', () => {
    const l = (id, sg) => ({ id, sets: 3, reps: 12, ...(sg ? { sg } : {}) })
    expect(sessionMinutes({ ex: [{ id: '3666', sets: 1, min: 15 }, l('0757'), l('0770'), l('0652'), l('0241'), l('0178', 's'), l('1375', 's')] })).toBe(58.8)
    expect(sessionMinutes({ ex: [l('0757'), l('0770'), l('0652'), l('0241'), l('0178'), l('1375')] })).toBe(64.8)
  })
  it('counts the main helpers of compounds', () => {
    expect(hitsOf('0757', plan())).toEqual(['chest', 'triceps'])
    expect(hitsOf('0652', plan())).toEqual(['back', 'biceps'])
    expect(hitsOf('0770', plan())).toEqual(['quads', 'glutes'])
  })
  it('flags the build-23 plan: hamstrings, calves and core only once a week', () => {
    const S = plan()
    const L = (id, w, x) => ({ id, sets: 3, reps: 12, repsMin: 8, mode: 'reps', prog: 'double', weight: w, since: SINCE, ...(x || {}) })
    S.routines = [
      { id: 'a', name: 'A', ex: [L('0757', 190), L('0770', 135), L('0652', 0), L('cpallofpress', 55, { side: true, reps: 24 }), L('0178', 12.5)] },
      { id: 'b', name: 'B', ex: [L('0765', 105), L('0214', 125), L('clandminerdl', 90), L('0773', 95)] },
      { id: 'c', name: 'C', ex: [L('0748', 185), L('0768', 95, { side: true, reps: 20 }), L('0241', 100), L('0165', 105)] }
    ]
    S.week = { 1: 'a', 2: 'b', 4: 'c' }
    const wk = weekCheck(S, '2026-10-26')
    expect(wk.ok).toBe(false)
    expect(wk.problems.filter(p => p.rule === 'coverage').map(p => p.message.split(':')[0]).sort()).toEqual(['calves', 'core', 'hamstrings'])
  })
  it('flags an exercise on two different days, and a session over the hour', () => {
    const S = plan()
    const L = id => ({ id, sets: 3, reps: 10, mode: 'reps' })
    S.routines = [{ id: 'a', name: 'A', ex: ['0757', '0770', '0652', '0241', '0178', '0214'].map(L) }, { id: 'b', name: 'B', ex: [L('0241')] }]
    S.week = { 1: 'a', 3: 'b' }
    const wk = weekCheck(S, '2026-10-26')
    expect(wk.repeats.map(r => r.exId)).toEqual(['0241'])
    expect(wk.problems.map(p => p.rule)).toContain('time')
  })
})

describe('supersets in the planner', () => {
  const S = plan()
  const L = (id, w, sg) => ({ id, sets: 3, reps: 12, repsMin: 8, mode: 'reps', prog: 'double', weight: w, since: SINCE, ...(sg ? { sg } : {}) })
  it('puts two cable lifts of a pair on different horns', () => {
    const r = { id: 'x', ex: [L('0241', 100), L('0178', 12.5, 's'), L('1375', 120, 's')] }
    const sim = simulate(r, S)
    expect(sim.recs[1].keys).not.toEqual(sim.recs[2].keys)
    expect(checkRoutine(r, S).problems.map(p => p.rule)).not.toContain('superset')
  })
  it('refuses a pair that needs the same station', () => {
    const r = { id: 'x', ex: [L('0768', 95, 's'), L('0773', 95, 's')] }
    expect(checkRoutine(r, S).problems.map(p => p.rule)).toContain('superset')
    const r2 = { id: 'x', ex: [L('0225', 25, 's'), L('cpallofpress', 55, 's')] }
    expect(checkRoutine(r2, S).problems.map(p => p.rule)).toContain('superset')
  })
})
