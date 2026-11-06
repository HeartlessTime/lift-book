// What the gym can actually do (trainer contract, 2026-10-19).
//
// Two jobs live here. First, knowing what one exercise needs: which station, how many cable
// horns, which attachment, which bench position, which muscle it is really for and whether it is
// a heavy lift. The library's equipment tags are coarse ("cable", "smith machine"), so the
// exercises the owner uses and their likely swaps carry an explicit entry below, and everything
// else is derived from the tag and the name — conservatively: when the derivation can't tell,
// the answer is "not feasible" with a reason, never a guess that sends him to a machine he
// doesn't own.
//
// Second, plate math with the plates that really exist. The Smith bar and any barbell load in
// symmetric pairs, one of each per side; a landmine and each cable horn are a single stack. All
// of them draw from one shared pile, which is why the planner has to know what is still sitting
// on the other stations.

import { EXIDX, EXDB } from './exercises.js'
import { AUDIT } from './exercise-audit.js'

export const DEFAULT_GEAR = {
  plates: { 45: 4, 25: 2, 10: 2, 5: 2, 2.5: 2 },
  smithBar: 45, barbell: 45, cableRatio: 2,
  stations: ['smith', 'cable', 'rack', 'landmine', 'pullup', 'bench', 'treadmill', 'bodyweight'],
  bench: ['flat', 'incline'],
  attachments: ['rope', 'flatbar', 'handle', 'ankle', 'vhandle'],
  // His standing rules (hard constraints 0 and "3 sets, reps ≤ 12"). They live with the
  // gear because they are about this gym and this lifter; a profile without a gear block keeps the
  // app's generic progression untouched.
  limits: { maxReps: 12, maxSets: 3, shoulderLb: 135 }
}

export const gearOf = S => {
  const g = (S && S.gear) || {}
  return { ...DEFAULT_GEAR, ...g, plates: { ...(g.plates || DEFAULT_GEAR.plates) }, limits: g.limits === null ? null : { ...DEFAULT_GEAR.limits, ...(g.limits || {}) } }
}
// The limits are only enforced on a profile that has a gear block (the owner's is seeded by the
// store migration). Progression for everyone else behaves exactly as it always did.
export const limitsOf = S => (S && S.gear ? gearOf(S).limits : null)

export const ATTACH_NAME = { rope: 'rope', flatbar: 'flat bar', handle: 'single handle', ankle: 'ankle strap', vhandle: 'V-handle' }
export const STATION_NAME = {
  smith: 'Smith', cable: 'cable', rack: 'rack', landmine: 'landmine', barbell: 'barbell',
  pullup: 'pull-up bar', bench: 'bench', treadmill: 'treadmill', bodyweight: 'floor'
}

// Plate-math kind per station: symmetric pairs, a single stack, or nothing to load.
export const KIND = { smith: 'smith', barbell: 'barbell', rack: 'barbell', landmine: 'landmine', cable: 'horn' }

/* ------------------------------------------------------------ the table ---- */
// s station · h horns · a attachment · b bench position (flat | incline | upright) ·
// p primary muscle group · hv heavy · sh load rests on the shoulders · no reason it's off
const O = (s, h, a, b, p, hv, extra) => ({ station: s, horns: h, attachment: a, bench: b, primary: p, heavy: hv, ...(extra || {}) })
const NO = why => ({ no: why })
export const OVERRIDES = {
  // conditioning
  3666: O('treadmill', 0, null, null, 'cardio', false),
  // chest
  '0757': O('smith', 0, null, 'incline', 'chest', true),
  '0748': O('smith', 0, null, 'flat', 'chest', true),
  1308: O('smith', 0, null, 'flat', 'chest', true),
  '0025': O('rack', 0, null, 'flat', 'chest', true),
  '0188': O('cable', 2, 'handle', null, 'chest', false),
  '0179': O('cable', 2, 'handle', null, 'chest', false),
  '0227': O('cable', 2, 'handle', null, 'chest', false),
  1269: O('cable', 2, 'handle', null, 'chest', false),
  1270: O('cable', 2, 'handle', null, 'chest', false),
  '0171': O('cable', 2, 'handle', 'incline', 'chest', false),
  '0169': O('cable', 2, 'handle', 'incline', 'chest', true),
  '0151': O('cable', 2, 'handle', 'flat', 'chest', true),
  2144: O('cable', 2, 'handle', 'upright', 'chest', true),
  // shoulders
  '0765': O('smith', 0, null, 'upright', 'shoulders', true),
  '0178': O('cable', 1, 'handle', null, 'shoulders', false),
  '0225': O('cable', 2, 'handle', null, 'shoulders', false),
  '0235': O('cable', 1, 'handle', null, 'shoulders', false),
  '0192': O('cable', 1, 'handle', null, 'shoulders', false),
  // back
  '0652': O('pullup', 0, null, null, 'back', true),
  1326: O('pullup', 0, null, null, 'back', true),
  '0214': O('cable', 1, 'handle', null, 'back', true),
  '0239': O('cable', 1, 'vhandle', null, 'back', true),
  '0861': O('cable', 1, 'vhandle', null, 'back', true),
  1323: O('cable', 1, 'rope', null, 'back', true),
  3563: O('cable', 1, 'handle', null, 'back', true),
  '0220': O('cable', 1, 'flatbar', null, 'traps', false),
  '0767': O('smith', 0, null, null, 'traps', false),
  // arms
  '0241': O('cable', 1, 'vhandle', null, 'triceps', false),
  '0201': O('cable', 1, 'flatbar', null, 'triceps', false),
  '0200': O('cable', 1, 'rope', null, 'triceps', false),
  1724: O('cable', 1, 'rope', null, 'triceps', false),
  // One arm at a time on the rope (the owner, 2026-10-19: "with the cable rope, one arm at a time").
  1723: O('cable', 1, 'rope', null, 'triceps', false),
  '0194': O('cable', 1, 'rope', null, 'triceps', false),
  '0165': O('cable', 1, 'rope', null, 'biceps', false),
  '0868': O('cable', 1, 'flatbar', null, 'biceps', false),
  '0190': O('cable', 1, 'handle', null, 'biceps', false),
  '0031': O('barbell', 0, null, null, 'biceps', false),
  // legs
  '0770': O('smith', 0, null, null, 'quads', true, { sh: true }),
  '0768': O('smith', 0, null, null, 'quads', true, { sh: true }),
  3142: O('smith', 0, null, null, 'quads', true, { sh: true }),
  '0773': O('smith', 0, null, null, 'calves', false, { sh: true }),
  // 1375 / 1376 cable standing calf raises: archived in the audit (no equipment for them, 2026-10-29).
  // Both legs on the Smith, bar held in the hands behind the back, torso upright: nothing on the shoulders.
  csmithcalfbehind: O('smith', 0, null, null, 'calves', false),
  1387: O('bodyweight', 0, null, null, 'calves', false),
  clandminerdl: O('landmine', 0, null, null, 'hamstrings', true),
  '0795': O('cable', 1, 'ankle', null, 'hamstrings', false),
  '0196': O('cable', 1, 'rope', null, 'glutes', true),
  '0710': O('cable', 1, 'ankle', null, 'hips', false),
  2368: O('bodyweight', 0, null, null, 'quads', false),
  // core
  cpallofpress: O('cable', 1, 'handle', null, 'core', false),
  // Anti-extension / anti-rotation, no spinal flexion.
  '0276': O('bodyweight', 0, null, null, 'core', false),
  3239: O('bodyweight', 0, null, null, 'core', false),
  3665: O('bodyweight', 0, null, null, 'core', false),
  '0228': O('cable', 1, 'ankle', null, 'glutes', false),
  // ruled out by his hard rules
  clandminesquat: NO('Landmine squats are out — awkward and unsafe as the weight goes up (rule 0).'),
  '0766': NO('Overhead pressing is seated with the back upright — use the Smith seated shoulder press (rule 6).'),
  '0774': NO('Overhead pressing is seated with the back upright (rule 6).'),
  '0772': NO('Overhead pressing is seated with the back upright (rule 6).'),
  '0747': NO('Overhead pressing is seated with the back upright (rule 6).'),
  '0752': NO('Heavy deadlifts load the lower back — the landmine RDL is his hinge (rule 1).'),
  '0749': NO('Good mornings load the spine under a bar — off the bad-back list (rule 1).'),
  '0760': NO('A Smith "leg press" is not something the G3 does safely.'),
  '0762': NO('Bent-over pulling means the back holds the torso — rows are seated or chest-supported (rule 5).'),
  '0761': NO('Bent-over pulling means the back holds the torso — rows are seated or chest-supported (rule 5).')
}

/* ----------------------------------------------------------- derivation ---- */
const NO_EQ = {
  dumbbell: 'No dumbbells in the gym.', kettlebell: 'No kettlebells.', 'leverage machine': 'No leverage machines.',
  'sled machine': 'No sled.', band: 'No bands.', 'resistance band': 'No bands.', 'medicine ball': 'No medicine ball.',
  'stability ball': 'No stability ball.', 'bosu ball': 'No BOSU ball.', 'ez barbell': 'No EZ bar.', 'trap bar': 'No trap bar.',
  'olympic barbell': 'Olympic lifts are off with the back.', weighted: 'No dip belt or weight vest.', assisted: 'No assisted machine.',
  roller: 'No foam roller.', 'wheel roller': 'No ab wheel.', tire: 'No tire.', hammer: 'No sledgehammer.',
  'upper body ergometer': 'No arm ergometer.', 'skierg machine': 'No SkiErg.', 'stationary bike': 'No bike.',
  'elliptical machine': 'No elliptical.', 'stepmill machine': 'No stepmill.', rope: 'No battle rope.'
}
const PRIMARY = {
  pectorals: 'chest', 'serratus anterior': 'chest', delts: 'shoulders', lats: 'back', 'upper back': 'back',
  traps: 'traps', 'levator scapulae': 'traps', biceps: 'biceps', triceps: 'triceps', forearms: 'forearms',
  quads: 'quads', quadriceps: 'quads', glutes: 'glutes', hamstrings: 'hamstrings', hamstring: 'hamstrings',
  calves: 'calves', abs: 'core', obliques: 'core', spine: 'lower back', abductors: 'hips', adductors: 'hips',
  'cardiovascular system': 'cardio'
}
const HEAVY_RE = /press|squat|\brow\b|pull-?up|chin-?up|deadlift|\brdl\b|lunge|dip\b|pulldown|hip thrust|pull through/

function derive(ex) {
  const n = String(ex.n || '').toLowerCase()
  // A custom lift the trainer made names the gear it runs on (`uses`), so it gets the same
  // station and rules as a catalog lift on that gear.
  const eq = (ex.eq === 'custom' && ex.uses) || ex.eq || ''
  const primary = PRIMARY[String(ex.tg || '').toLowerCase()] || null
  const no = why => ({ station: null, horns: 0, attachment: null, bench: null, primary, heavy: false, feasible: false, why })
  if (NO_EQ[eq]) return no(NO_EQ[eq])
  if (/stability ball|exercise ball|bosu|on ball/.test(n)) return no('Needs a ball he does not have.')
  if (/crunch|sit-?up|side bend|jack ?knife|v-up|toes to bar/.test(n)) return no('Spinal flexion is off the bad-back list — core work is anti-rotation (Pallof).')
  if (/twist|russian|judo flip|wood ?chop|standing lift/.test(n)) return no('Loaded rotation is not cleared for the back — use the Pallof press.')
  if (/bent[- ]over|\bt-bar\b|pendlay|yates/.test(n)) return no('Bent-over pulling means the back holds the torso — rows are seated or chest-supported (rule 5).')
  if (/deadlift|good morning|hyperextension|back extension/.test(n) && !/romanian|rdl/.test(n)) return no('Loads the lower back — not cleared (rule 1).')
  if (/pulldown/.test(n) && !/one arm|single arm|straight arm|standing/.test(n)) return no('Too tall for the pulldown seat — kneeling one-arm pulldowns only (rule 4).')
  if (/standing|behind (the )?neck|military|push press/.test(n) && /press/.test(n) && /shoulder|military|overhead|behind/.test(n)) return no('Overhead pressing is seated with the back upright (rule 6).')
  if (/decline/.test(n)) return no('His bench goes flat and incline, not decline.')
  if (/landmine squat/.test(n)) return no('Landmine squats are out (rule 0).')

  const bench = /incline/.test(n) ? 'incline' : /seated/.test(n) ? 'upright' : /lying|bench|floor press/.test(n) ? 'flat' : null
  const heavy = HEAVY_RE.test(n)
  const sh = /squat|lunge|calf raise|split|step-?up/.test(n) && !/seated|floor|one leg floor/.test(n)
  if (eq === 'cable') {
    const horns = /cross-?over|\bfly\b|crossovers|two arm|both/.test(n) ? 2 : 1
    const attachment = /rope/.test(n) ? 'rope' : /v-bar|v bar/.test(n) ? 'vhandle'
      : /ankle|kickback|hip|leg curl|abduction|adduction|glute/.test(n) ? 'ankle'
        : /\bbar\b|straight bar|pushdown|shrug/.test(n) ? 'flatbar' : 'handle'
    return { station: 'cable', horns, attachment, bench, primary, heavy, feasible: !!primary, why: primary ? undefined : 'Unknown target muscle — check it before programming.' }
  }
  if (eq === 'smith machine') return { station: 'smith', horns: 0, attachment: null, bench, primary, heavy, sh, feasible: !!primary, why: primary ? undefined : 'Unknown target muscle.' }
  if (eq === 'barbell') return { station: bench ? 'rack' : 'barbell', horns: 0, attachment: null, bench, primary, heavy, sh, feasible: !!primary, why: primary ? undefined : 'Unknown target muscle.' }
  if (eq === 'body weight') {
    if (/pull-?up|chin-?up/.test(n)) return { station: 'pullup', horns: 0, attachment: null, bench: null, primary: primary || 'back', heavy: true, feasible: true }
    if (/dip|ring|hanging|muscle up|suspension|trx|box|step|towel|parallel bar|handstand|bench/.test(n)) return no('Needs equipment the gym may not have (dip bars, box, rings…) — confirm first.')
    return { station: 'bodyweight', horns: 0, attachment: null, bench: null, primary, heavy: false, feasible: !!primary, why: primary ? undefined : 'Unknown target muscle.' }
  }
  if (ex.bp === 'cardio') {
    if (/walk|run|jog|treadmill/.test(n)) return { station: 'treadmill', horns: 0, attachment: null, bench: null, primary: 'cardio', heavy: false, feasible: true }
    return no('The only cardio machine is the treadmill.')
  }
  return no('Not sure this can be done on his gear — confirm before programming it.')
}

// The whole-library audit (lib/exercise-audit.js) answers for every exercise it reviewed;
// OVERRIDES above still win, derive() covers the clear-cut rest (dumbbells, bands, …).
function fromAudit(a) {
  if (a.ok === false) return { station: null, horns: 0, attachment: null, bench: null, primary: a.primary || null, heavy: false, feasible: false, why: a.why }
  return { station: a.station, horns: a.horns || 0, attachment: a.attachment || null, bench: a.bench || null, primary: a.primary,
    heavy: !!a.heavy, sh: !!a.sh, ...(a.focus ? { focus: a.focus } : {}), ...(a.secondary ? { secondary: a.secondary } : {}), feasible: true }
}

/**
 * What one exercise needs, and whether this gym can do it.
 * `{ station, horns, attachment, bench, primary, heavy, sh, kind, feasible, why? }`
 */
export function exerciseNeeds(exId, S) {
  const g = gearOf(S)
  const ex = EXIDX[exId]
  const o = OVERRIDES[exId]
  let r
  if (o && o.no) r = { station: null, horns: 0, attachment: null, bench: null, primary: ex ? (PRIMARY[String(ex.tg).toLowerCase()] || null) : null, heavy: false, feasible: false, why: o.no }
  // a hand-written override still takes the audit's finer muscle detail along with it
  else if (o) { const a = AUDIT[exId]; r = { sh: false, ...(a && a.ok ? { focus: a.focus, secondary: a.secondary } : {}), ...o, feasible: true } }
  else if (AUDIT[exId]) r = fromAudit(AUDIT[exId])
  else if (!ex) r = { station: null, horns: 0, attachment: null, bench: null, primary: null, heavy: false, feasible: false, why: 'Unknown exercise.' }
  else r = derive(ex)
  r.sh = !!r.sh
  r.kind = KIND[r.station] || null
  // The gear block may be edited later (an attachment lost, a dumbbell set bought): check the
  // derived needs against what is actually listed.
  if (r.feasible) {
    const stations = g.stations || []
    const st = r.station === 'barbell' ? 'rack' : r.station
    if (st && !stations.includes(st) && !(r.station === 'barbell' && stations.includes('landmine'))) {
      r.feasible = false; r.why = 'No ' + (STATION_NAME[r.station] || r.station) + ' in the gear list.'
    } else if (r.attachment && !(g.attachments || []).includes(r.attachment)) {
      r.feasible = false; r.why = 'Needs a ' + (ATTACH_NAME[r.attachment] || r.attachment) + ' — not in the gear list.'
    } else if (r.bench && !(g.bench || []).includes(r.bench === 'upright' ? 'incline' : r.bench)) {
      r.feasible = false; r.why = 'Needs a ' + r.bench + ' bench.'
    }
  }
  return r
}

/* ----------------------------------------------------------- plate math ---- */
export const PLATE_SIZES = g => Object.keys(g.plates).map(Number).filter(p => g.plates[p] > 0).sort((a, b) => b - a)
const r2 = v => Math.round(v * 100) / 100

// What the plates on a station have to add up to (per side for the symmetric kinds), or null
// when the load is below the empty bar.
export function plateTarget(load, kind, gear) {
  const g = gear || DEFAULT_GEAR
  if (kind === 'smith' || kind === 'barbell') {
    const bar = kind === 'smith' ? g.smithBar : g.barbell
    const rest = r2((load || 0) - bar)
    if (rest < 0) return null
    return { perSide: true, total: r2(rest / 2) }
  }
  if (kind === 'landmine') {
    const rest = r2((load || 0) - g.barbell)
    return rest < 0 ? null : { perSide: false, total: rest }
  }
  if (kind === 'horn') return { perSide: false, total: r2(load || 0) }
  return null
}

/**
 * Every way to make `total` from the pile `avail` ({plate: count}). For a symmetric station each
 * plate is needed twice (one per side), so only half the pile is available to one side.
 * Each result is a list of plates, heaviest first. Small pile, so plain enumeration is fine.
 */
export function plateCombos(total, perSide, avail, sizes) {
  const ps = sizes || Object.keys(avail).map(Number).sort((a, b) => b - a)
  const out = []
  const walk = (i, left, acc) => {
    if (Math.abs(left) < 1e-6) { out.push(acc.slice()); return }
    if (i >= ps.length || left < 0) return
    const p = ps[i]
    const max = Math.floor((avail[p] || 0) / (perSide ? 2 : 1))
    for (let k = Math.min(max, Math.floor(left / p + 1e-6)); k >= 0; k--) {
      for (let j = 0; j < k; j++) acc.push(p)
      walk(i + 1, r2(left - k * p), acc)
      acc.length -= k
    }
  }
  walk(0, r2(total), [])
  return out
}

/**
 * The plates for one load: per side for Smith/barbell, on the stack for a landmine or one cable
 * horn. `kind` is smith | barbell | landmine | horn. Fewest plates wins. null when the real pile
 * can't make it (or it is under the empty bar); [] means the bare bar / an empty horn.
 */
export function platesFor(load, kind, gear, avail) {
  const g = gear || DEFAULT_GEAR
  const tgt = plateTarget(load, kind, g)
  if (!tgt) return null
  const combos = plateCombos(tgt.total, tgt.perSide, avail || g.plates)
  if (!combos.length) return null
  combos.sort((a, b) => a.length - b.length)
  return combos[0]
}

export const fmtPlates = list => (list && list.length ? list.join(' + ') : 'nothing')

/* -------------------------------------------------------------- archive ---- */
// The library exercises his gym can't do (or his rules rule out): hidden from the picker and
// the Exercises tab unless he asks to see them. Only on a profile with a gear block; his own
// custom exercises are never archived. Recomputed when the gear list changes.
let ARCH = { key: null, ids: new Set() }
export function archivedIds(S) {
  if (!S || !S.gear) return new Set()
  const key = JSON.stringify(S.gear)
  if (ARCH.key !== key) ARCH = { key, ids: new Set(EXDB.filter(e => !exerciseNeeds(e.id, S).feasible).map(e => e.id)) }
  return ARCH.ids
}
export const archivedWhy = (id, S) => (archivedIds(S).has(id) ? exerciseNeeds(id, S).why : null)
