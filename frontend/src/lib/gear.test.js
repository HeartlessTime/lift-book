import { describe, it, expect } from 'vitest'
import { exerciseNeeds, platesFor, plateCombos, gearOf, limitsOf, DEFAULT_GEAR, OVERRIDES, ATTACH_NAME, archivedIds } from './gear.js'
import { AUDIT } from './exercise-audit.js'
import { EXIDX, workedGroups } from './exercises.js'

const S = { gear: DEFAULT_GEAR }

describe('exerciseNeeds', () => {
  it('knows his Smith lifts, their bench and the bar on the shoulders', () => {
    expect(exerciseNeeds('0757', S)).toMatchObject({ station: 'smith', bench: 'incline', primary: 'chest', heavy: true, feasible: true, sh: false })
    expect(exerciseNeeds('0770', S)).toMatchObject({ station: 'smith', primary: 'quads', heavy: true, sh: true, kind: 'smith' })
    expect(exerciseNeeds('0765', S)).toMatchObject({ bench: 'upright', primary: 'shoulders' })
  })

  it('counts cable horns and attachments', () => {
    expect(exerciseNeeds('0165', S)).toMatchObject({ station: 'cable', horns: 1, attachment: 'rope', kind: 'horn' })
    expect(exerciseNeeds('0188', S)).toMatchObject({ horns: 2, primary: 'chest', heavy: false })
    expect(exerciseNeeds('0795', S)).toMatchObject({ station: 'cable', attachment: 'ankle', primary: 'hamstrings' })
  })

  it('rules out what his hard rules forbid, with a reason', () => {
    for (const id of ['clandminesquat', '0774', '0752']) {
      const n = exerciseNeeds(id, S)
      expect(n.feasible).toBe(false)
      expect(n.why).toBeTruthy()
    }
  })

  it('derives the rest conservatively from the library', () => {
    // dumbbell, leverage machine, two-arm pulldown, loaded crunch, bent-over row
    const dumbbell = exerciseNeeds('0294', S)
    expect(dumbbell.feasible).toBe(false)
    const ids = { pulldown: '0198', crunch: '0175', bentRow: '1359' }
    Object.values(ids).forEach(id => expect(exerciseNeeds(id, S).feasible).toBe(false))
    expect(exerciseNeeds('nope-not-an-id', S)).toMatchObject({ feasible: false, why: 'Unknown exercise.' })
  })

  it('follows the gear list when it changes', () => {
    const noRope = { gear: { ...DEFAULT_GEAR, attachments: ['handle'] } }
    expect(exerciseNeeds('0165', noRope)).toMatchObject({ feasible: false })
    expect(exerciseNeeds('0165', noRope).why).toMatch(/rope/)
  })
})

describe('platesFor — the real pile', () => {
  const g = DEFAULT_GEAR
  it('loads the Smith in pairs after the 45 lb bar', () => {
    expect(platesFor(190, 'smith', g)).toEqual([45, 25, 2.5])
    expect(platesFor(135, 'smith', g)).toEqual([45])
    expect(platesFor(45, 'smith', g)).toEqual([])
  })
  it('loads one horn as a single stack', () => {
    expect(platesFor(145, 'horn', g)).toEqual([45, 45, 45, 10])   // fewest plates
    expect(platesFor(17.5, 'horn', g)).toEqual([10, 5, 2.5])
  })
  it('says no when the plates cannot make it', () => {
    expect(platesFor(175, 'smith', g)).toBeNull()      // 65 a side: no pair makes it
    expect(platesFor(320, 'smith', g)).toBeNull()      // more than the pile
    expect(platesFor(30, 'smith', g)).toBeNull()       // under the bar
    expect(platesFor(1, 'horn', g)).toBeNull()
  })
  it('landmine counts the bar too, plates on one end', () => {
    expect(platesFor(90, 'landmine', g)).toEqual([45])
  })
  it('enumerates every way to make a load', () => {
    const combos = plateCombos(50, false, g.plates)
    expect(combos).toContainEqual([45, 5])
    expect(combos).toContainEqual([25, 25])
  })
})

describe('limits', () => {
  it('applies only to a profile that has a gear block', () => {
    expect(limitsOf({})).toBeNull()
    expect(limitsOf(S)).toMatchObject({ maxReps: 12, maxSets: 3, shoulderLb: 135 })
    expect(gearOf({}).plates).toEqual(DEFAULT_GEAR.plates)
  })
})

describe('exercise audit table', () => {
  const GROUPS = ['chest', 'shoulders', 'back', 'traps', 'biceps', 'triceps', 'forearms', 'quads', 'glutes', 'hamstrings', 'calves', 'core', 'lower back', 'hips', 'cardio']
  const STATIONS = ['smith', 'cable', 'rack', 'landmine', 'barbell', 'pullup', 'bench', 'treadmill', 'bodyweight']
  it('every row names a library exercise and speaks the gear vocab', () => {
    for (const [id, a] of Object.entries(AUDIT)) {
      expect(EXIDX[id], id).toBeTruthy()
      expect(GROUPS, id).toContain(a.primary)
      if (a.ok) {
        expect(STATIONS, id).toContain(a.station)
        if (a.attachment) expect(Object.keys(ATTACH_NAME), id).toContain(a.attachment)
      } else expect(a.why, id).toBeTruthy()
    }
  })
  it('archives what the audit rules out and keeps what it clears', () => {
    const S = { gear: { ...DEFAULT_GEAR } }
    const arch = archivedIds(S)
    for (const [id, a] of Object.entries(AUDIT)) if (!OVERRIDES[id]) expect(arch.has(id), id).toBe(!a.ok)
    expect(archivedIds({})).toEqual(new Set())          // no gear block: nothing is hidden
  })
  it('names every group a compound works, main one first', () => {
    expect(workedGroups(EXIDX['0025'])).toEqual(['chest', 'triceps', 'shoulders'])     // barbell bench press
    expect(workedGroups(EXIDX['0043']).slice(0, 2)).toEqual(['quads', 'glutes'])      // barbell full squat
  })
})
