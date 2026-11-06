// the owner's slot routines (2026-10-19): Full Body A Mon, B Tue, C Thu (Wed is the backup day).
// Used by scripts/variety-routines.mjs to write his plan and by variety.test.js to prove it.
//
// Every pool member is gear-feasible (lib/gear.js) and obeys his hard rules: 3 sets, reps ≤ 12
// (per side for unilateral work, stored as the total), nothing over 135 lb on the shoulders,
// rows seated, overhead pressing seated on the Smith, no loaded spinal flexion, cable lateral
// raises every week. Two slots of the same name share one rotation, so in any week they are
// different movements, and each slot moves one variant along every week.
//
// Weekly coverage (hits = target, or the main helper of a compound):
//   chest   A Smith press (incline/flat) + C cable fly (low/middle/incline), both rotate weekly
//   back    A vertical pull + B seated row          biceps   both pulls + B curl
//   shoulders  B Smith seated press + A lateral raise + C rear-delt/cuff/traps accessory
//   triceps A + C direct (pushdowns / one-arm rope / overhead) + both presses
//   quads, glutes  A + C squat pattern + hinges     hamstrings  B + C (RDL / leg curl / pull-through / hip ext.)
//   calves  A + B                                   core     B + C (Pallof / dead bug / plank tap / plank)
// Each session: 4 lifts + 1 superset of two small lifts on separate stations, about 59 min
// with his ~3.6 min a set. The walk is optional and not counted.

const D = { sets: 3, mode: 'reps', prog: 'double', reps: 12, repsMin: 8 }
const SIDE = { side: true, reps: 24, repsMin: 16 }

export function SLOT_ROUTINES(since) {
  const walk = { id: '3666', sets: 1, min: 15 }
  // A fixed lift.
  const lift = (id, weight, extra) => ({ id, ...D, weight, ...(weight > 0 ? { since } : {}), ...(extra || {}) })
  // A slot: pool order is the rotation order. opts carry each variant's own start weight etc.
  const slot = (name, pool, opts, extra) => {
    const o = {}
    pool.forEach(id => { o[id] = { ...(opts[id] || {}) } })
    return { slot: name, pool, id: pool[0], ...D, since, ...(extra || {}), opts: o }
  }
  // Pools (shared between days where the slot name repeats).
  // Chest: a Smith press on A (incline / flat, alternating) and a cable fly on C (low / middle /
  // incline, rotating). A two-horn fly can't share a session with a heavy press AND three other
  // cable lifts on 265 lb of plates, and this way every week has one press and one fly anyway.
  const press = ['0757', '0748']                            // Smith incline · Smith flat
  const pressOpts = { '0757': { weight: 190 }, '0748': { weight: 185 } }
  const fly = ['0179', '0188', '0171']                      // cable low fly · cable middle fly · cable incline fly
  const flyOpts = { '0179': { weight: 25, repsMin: 10 }, '0188': { weight: 35, repsMin: 10 }, '0171': { weight: 25, repsMin: 10 } }
  const quads = ['0770', '0768', '3142']                    // Smith squat · Smith split squat · Smith sumo squat
  const quadOpts = { '0770': { weight: 135, since: '' }, '0768': { weight: 95, ...SIDE }, 3142: { weight: 95 } }
  const tri = ['0201', '1723', '1724', '0241']              // flat-bar pushdown · one-arm rope pushdown · overhead rope ext. · V-handle pushdown
  const triOpts = { '0201': { weight: 90, repsMin: 10 }, 1723: { weight: 40, ...SIDE, repsMin: 20 }, 1724: { weight: 60, repsMin: 10 }, '0241': { weight: 100, repsMin: 10 } }
  // Hamstrings twice a week: landmine RDL · standing cable leg curl (ankle strap) · cable
  // pull-through · standing cable hip extension (ankle strap, upright: glutes + hamstrings).
  const ham = ['clandminerdl', '0795', '0196', '0228']
  const hamOpts = { clandminerdl: { weight: 90, repsMin: 10 }, '0795': { weight: 25, ...SIDE }, '0196': { weight: 80, repsMin: 10 }, '0228': { weight: 25, ...SIDE } }
  // Core twice a week, never loaded flexion: Pallof (anti-rotation) · dead bug (anti-extension) ·
  // kneeling plank shoulder tap (anti-rotation) · power point plank (anti-extension).
  const core = ['cpallofpress', '0276', '3239', '3665']
  const coreOpts = { cpallofpress: { weight: 55, ...SIDE }, '0276': { weight: 0, ...SIDE, bodyweight: true }, 3239: { weight: 0, ...SIDE, bodyweight: true }, 3665: { weight: 0, ...SIDE, bodyweight: true } }
  // Cable standing calf raises (1375/1376) are archived: no equipment for them (2026-10-29).
  const calf = ['csmithcalfbehind', '1387']                 // Smith calf (bar behind back) · one-leg floor calf
  const calfOpts = { csmithcalfbehind: { weight: 0, repsMin: 10 }, 1387: { weight: 0, ...SIDE, repsMin: 20, bodyweight: true } }
  return [
    {
      id: 'mtfullbodya01', name: 'Full Body A', day: 1, prog: 'double',
      note: 'Mon. Walk optional. Short version: the first 2 lifts. Variants rotate weekly.',
      ex: [
        walk,
        slot('chest press', press, pressOpts),
        slot('quads', quads, quadOpts),
        slot('vertical pull', ['0652', '3563', '1326'], { '0652': { weight: 0, repsMin: 8, reps: 10 }, 3563: { weight: 60 }, 1326: { weight: 0, repsMin: 8, reps: 10 } }),
        slot('triceps', tri, triOpts),
        slot('lateral raise', ['0178', '0192'], { '0178': { weight: 12.5, repsMin: 10 }, '0192': { weight: 10, ...SIDE, repsMin: 20 } }),
        slot('calves', calf, calfOpts)   // no superset: he turned A's down (2026-10-29)
      ]
    },
    {
      id: 'mtfullbodyb01', name: 'Full Body B', day: 2, prog: 'double',
      note: 'Tue. Walk optional. Short version: the first 2 lifts. Variants rotate weekly.',
      ex: [
        walk,
        lift('0765', 105),                                    // Smith seated press: his only overhead press (rule 6)
        slot('row', ['0214', '1323', '0861'], { '0214': { weight: 125 }, 1323: { weight: 110 }, '0861': { weight: 140 } }),
        slot('hamstrings', ham, hamOpts),
        slot('biceps', ['0165', '0868', '0190'], { '0165': { weight: 105 }, '0868': { weight: 70 }, '0190': { weight: 30, ...SIDE } }),
        slot('core', core, coreOpts, { sg: 'ssb' }),
        slot('calves', calf, calfOpts, { sg: 'ssb' })
      ]
    },
    {
      id: 'mtfullbodyc01', name: 'Full Body C', day: 4, prog: 'double',
      note: 'Thu (Wed is the backup day). Walk optional. Short version: the first 2 lifts. Variants rotate weekly.',
      ex: [
        walk,
        slot('chest fly', fly, flyOpts),
        slot('quads', quads, quadOpts),
        slot('triceps', tri, triOpts),
        slot('hamstrings', ham, hamOpts),
        slot('core', core, coreOpts, { sg: 'ssc' }),
        slot('accessory', ['0225', '0220', '0235'], { '0225': { weight: 25, repsMin: 10 }, '0220': { weight: 145, repsMin: 10 }, '0235': { weight: 12.5, ...SIDE, repsMin: 20 } }, { sg: 'ssc' })
      ]
    }
  ]
}
