// Weekly exercise variety and muscle coverage (fitness.md hard rules 10–12, 2026-10-19).
//
// the owner: "If I have two chest workouts for the week, I don't want them both to be incline, or
// both flat. One day incline, another flat, the other cable flies." And: every muscle group at
// least twice a week.
//
// So a routine entry can be a SLOT: one movement pattern with a pool of variants.
//
//   { slot: 'chest', pool: ['0757', '0179', '0748', '0188'], id: '0757', sets: 3, reps: 12, ...,
//     opts: { '0179': { weight: 25 }, '0748': { weight: 185 } } }
//
// `id` is always a real exercise (the pool's first) so every screen that predates slots still
// reads a valid entry. `opts` holds per-variant settings (start weight, reps, per-side), laid over
// the slot's own when that variant is picked.
//
// The pick is made on the device, per ISO week, as a pure function of (routines, weekly plan,
// week). Nothing is written each week, so there is nothing for two devices to fight over. The
// whole week is resolved together: every slot of the same name takes the next variant along its
// pool (week index + how many slots of that name came before it this week), and no exercise is
// used twice in one week. Next week everything moves one step, so each slot changes week to week.
// Progression is per exercise id, so a variant picked again two weeks later resumes at its own
// last weight (from `since` on, like any restart).

import { exerciseNeeds } from './gear.js'
import { checkRoutine, orderRoutine, setupPlan, loadFor, setupPossible, LOAD_CACHE } from './planner.js'
import { EXIDX, isCardio } from './exercises.js'
import { supersetUnits, modeOf, effectiveRoutineId } from './history.js'
import { isoOf } from './format.js'

export const isSlot = cfg => !!(cfg && cfg.slot && Array.isArray(cfg.pool) && cfg.pool.length)
export const hasSlots = routine => !!(routine && (routine.ex || []).some(isSlot))
const nameOf = id => (EXIDX[id] && EXIDX[id].n) || id

/* ------------------------------------------------------------------ weeks -- */
const DAY = 86400000
const noon = iso => new Date(iso + 'T12:00:00')
const addDays = (iso, n) => { const d = noon(iso); d.setDate(d.getDate() + n); return isoOf(d) }
/** The Monday of the ISO week holding `iso`. */
export function mondayOf(iso) {
  const d = noon(iso)
  const back = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - back)
  return isoOf(d)
}
// Weeks since Monday 1970-01-05. Only differences matter; it just has to step by one a week.
export const weekIndex = iso => Math.round((noon(mondayOf(iso)).getTime() - noon('1970-01-05').getTime()) / (7 * DAY))
export const weekDates = weekStart => Array.from({ length: 7 }, (_, i) => addDays(mondayOf(weekStart), i))

// The weekly plan's routines in training order (Mon → Sun), each once. A routine started on a day
// it isn't planned for still resolves the same way: the plan order, not the date, sets the picks.
const PLAN_DAYS = [1, 2, 3, 4, 5, 6, 0]
export function planOrder(S) {
  const out = []
  PLAN_DAYS.forEach(d => { const id = (S.week || {})[d]; if (id && !out.includes(id) && (S.routines || []).some(r => r.id === id)) out.push(id) })
  return out
}

/* --------------------------------------------------------------- resolve -- */
// Two lifts can be supersetted only if neither has to touch the other's station between rounds.
function pairOk(a, b, S) {
  const na = exerciseNeeds(a, S); const nb = exerciseNeeds(b, S)
  if (na.station === 'cable' && nb.station === 'cable') return (na.horns || 1) + (nb.horns || 1) <= 2
  const loaded = ['smith', 'landmine', 'barbell', 'rack']
  return !(na.station === nb.station && loaded.includes(na.station))
}

/** The variant one entry resolves to, as a plain routine entry (no pool/opts). */
export function variantCfg(cfg, exId) {
  if (!isSlot(cfg)) return cfg
  const { pool, opts, ...rest } = cfg
  return { ...rest, ...((opts || {})[exId] || {}), id: exId, slot: cfg.slot }
}

// The state as it stood when the week began: the loads every pick in the week is judged by. No
// lift repeats inside a week, so a session logged on Monday changes no load Thursday uses — and
// judging by the week-start copy keeps every pick stable for the whole week.
function asOf(S, mon) {
  const Sw = { ...S, workouts: (S.workouts || []).filter(w => w.d < mon) }
  Object.defineProperty(Sw, LOAD_CACHE, { value: new Map(), enumerable: false })
  return Sw
}
// The order-free rules (gear, sets, reps, shoulder cap) on the flat list, then: is there any
// clean order? orderRoutine picks the best one later; this only has to know that one exists.
const ORDER_RULES = ['setup', 'budget', 'order', 'superset']
// The slot was set up during this week (or later): there is no last week to compare it with.
const born = (e, mon) => !!(e && e.since && e.since >= mon)
const flatOf = (routine, ids) => ({ ...routine, ex: routine.ex.map((e, i) => variantCfg(e, ids[i])) })
// Memo per history cutoff: the same session is asked about again by the second pass, and by the
// chained weeks before it whenever they share the same history (every week from today on).
const SETUP_MEMO = new Map()
function setupOk(routine, ids, S) {
  const ws = S.workouts || []
  const k = JSON.stringify([routine.id, ids, ws.length, ws.length && ws[ws.length - 1].id, routine.ex, S.gear, S.exWeights, S.unit])
  if (SETUP_MEMO.has(k)) return SETUP_MEMO.get(k)
  const v = setupCheck(routine, ids, S)
  SETUP_MEMO.set(k, v)
  if (SETUP_MEMO.size > 2000) SETUP_MEMO.delete(SETUP_MEMO.keys().next().value)
  return v
}
function setupCheck(routine, ids, S) {
  const flat = flatOf(routine, ids)
  if (checkRoutine(flat, S).problems.some(p => !ORDER_RULES.includes(p.rule))) return false
  return setupPossible(flat, S)
}

/**
 * Resolve every slot in the week. Returns `{ week, picks: { [routineId]: [exId per entry] } }`.
 * Routines not in the weekly plan but named in `extra` are resolved after the plan's.
 *
 * Each slot takes the next variant along its pool (rotation). When that leaves a session that
 * can't be set up cleanly on his plates (checkRoutine), the other variants of its slots are tried
 * — one slot changed, then two — keeping last week's pick for last, and the first clean session
 * wins. `setup: false` is the bare rotation.
 */
// How many weeks back "last week's pick" is followed through the real (setup-checked) picks
// before falling back to the bare rotation. Deep enough that a swap two weeks ago is still seen.
export const CHAIN = 3
export function resolveWeek(S, weekStart, extra, { setup = true, depth = CHAIN } = {}) {
  const mon = mondayOf(weekStart)
  const key = setup ? cacheKey(S, mon, extra) + '|' + depth : null
  if (key && CACHE.has(key)) return CACHE.get(key)
  const w = weekIndex(mon)
  const order = planOrder(S)
  ;(extra || []).forEach(id => { if (id && !order.includes(id)) order.push(id) })
  const Sw = asOf(S, mon)
  const last = setup ? resolveWeek(S, addDays(mon, -7), extra, { setup: depth > 0, depth: depth - 1 }).picks : {}
  const used = new Set()
  const seen = {}
  const picks = {}
  // Fixed exercises are claimed first, so a slot never lands on a lift the week already has.
  order.forEach(rid => {
    const r = (S.routines || []).find(x => x.id === rid)
    ;((r && r.ex) || []).forEach(e => { if (!isSlot(e) && !isCardio(e.id)) used.add(e.id) })
  })
  order.forEach(rid => {
    const r = (S.routines || []).find(x => x.id === rid)
    const ex = (r && r.ex) || []
    const out = ex.map(e => e.id)
    const cands = {}
    ex.forEach((e, i) => {
      if (!isSlot(e)) return
      const k = seen[e.slot] || 0
      seen[e.slot] = k + 1
      const n = e.pool.length
      const start = ((w + k) % n + n) % n
      const rot = Array.from({ length: n }, (_, j) => e.pool[(start + j) % n])
      // A slot that only started this week (its `since`) had no last week to differ from.
      const prevPick = born(e, mon) ? null : last[rid] && last[rid][i]
      // Search order when this pick has to change: this week's, then the ones neither week next
      // to it uses, then next week's (taking it would just push the clash a week on), then last
      // week's.
      const nextPick = rot[1 % n]
      cands[i] = [rot[0], ...rot.slice(2).filter(id => id !== prevPick), ...(n > 1 && nextPick !== prevPick ? [nextPick] : []), ...(rot.includes(prevPick) && prevPick !== rot[0] ? [prevPick] : [])]
      const partner = i > 0 && e.sg && ex[i - 1].sg === e.sg ? out[i - 1] : null
      const fits = id => exerciseNeeds(id, S).feasible && (!partner || pairOk(partner, id, S))
      const pick = rot.find(id => fits(id) && !used.has(id)) || rot.find(fits) || rot[0]
      out[i] = pick
      used.add(pick)
    })
    const repeatsLast = ids => Object.keys(cands).some(i => cands[i].length > 1 && !born(ex[i], mon) && last[rid] && last[rid][i] === ids[i])
    const baseOk = setup && r && Object.keys(cands).length ? setupOk(r, out, Sw) : true
    if (setup && r && Object.keys(cands).length && (!baseOk || repeatsLast(out))) {
      const mine = new Set(Object.keys(cands).map(i => out[i]))
      const free = id => !used.has(id) || mine.has(id)
      const valid = ids => {
        if (new Set(Object.keys(cands).map(i => ids[i])).size !== Object.keys(cands).length) return false
        return ex.every((e, i) => !(i > 0 && e.sg && ex[i - 1].sg === e.sg) || pairOk(ids[i - 1], ids[i], S))
      }
      const slots = Object.keys(cands).map(Number)
      const prevAt = i => (born(ex[i], mon) ? null : last[rid] && last[rid][i])
      let found = null
      let strict = true
      const tryIds = ids => { if (!found && valid(ids) && !(strict && repeatsLast(ids)) && setupOk(r, ids, Sw)) found = ids }
      // Change one slot, then two, then three. Pass 1 never brings back last week's pick; pass 2
      // allows it as the last resort.
      const combos = (k, from = 0) => (k === 0 ? [[]] : slots.slice(from).flatMap((x, j) => combos(k - 1, from + j + 1).map(c => [x, ...c])))
      for (const allowPrev of baseOk ? [false] : [false, true]) {
        strict = !allowPrev
        const ok = (i, id) => free(id) && exerciseNeeds(id, S).feasible && (allowPrev || id !== prevAt(i))
        for (let k = 1; k <= Math.min(allowPrev ? 3 : 4, slots.length) && !found; k++) {
          for (const set of combos(k)) {
            if (found) break
            const walk = (j, ids) => {
              if (found) return
              if (j === set.length) { if (set.some(i => ids[i] !== out[i])) tryIds(ids); return }
              const i = set[j]
              for (const id of cands[i]) {
                if (id === out[i] || !ok(i, id)) continue
                const next = ids.slice(); next[i] = id; walk(j + 1, next)
                if (found) return
              }
            }
            walk(0, out.slice())
          }
        }
        if (found) break
      }
      if (found) {
        mine.forEach(id => used.delete(id))
        slots.forEach(i => { out[i] = found[i]; used.add(found[i]) })
      }
    }
    picks[rid] = out
  })
  const res = { week: w, picks }
  if (key) { CACHE.set(key, res); if (CACHE.size > 40) CACHE.delete(CACHE.keys().next().value) }
  return res
}

// Resolving is a search; the Plan screen and the workout ask for the same week many times.
const CACHE = new Map()
function cacheKey(S, mon, extra) {
  const ws = (S.workouts || []).filter(w => w.d < mon)
  const lastW = ws[ws.length - 1]
  return JSON.stringify([mon, extra || [], S.week, S.routines, S.gear, S.unit, S.exWeights, ws.length, lastW && lastW.id])
}

/**
 * One routine as it will be done in the week holding `iso`: slots replaced by this week's
 * variants, then put in the low-setup order. A routine without slots comes back untouched.
 */
export function resolveRoutine(S, routine, iso) {
  if (!hasSlots(routine)) return routine
  const { picks } = resolveWeek(S, mondayOf(iso), [routine.id])
  const ids = picks[routine.id] || routine.ex.map(e => e.id)
  return orderRoutine(flatOf(routine, ids), S).routine
}

/* -------------------------------------------------------------- coverage -- */
// The groups the week has to hit twice (rule 12), and the small ones that also need a direct lift.
export const GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']
export const DIRECT = ['biceps', 'triceps', 'calves', 'core', 'side delts']
export const EXTRA = ['side delts', 'rear delts', 'traps']
// What a lift hits: its target, plus the major helpers of a compound (triceps on presses, biceps
// on pulls, glutes on squats and hinges). Anything not listed counts its target muscle only.
const PRESS = ['chest', 'triceps']; const PULL = ['back', 'biceps']; const SQUAT = ['quads', 'glutes']
export const HITS = {
  '0757': PRESS, '0748': PRESS, 1308: PRESS, '0025': PRESS, '0169': PRESS, '0151': PRESS, 2144: PRESS,
  '0765': ['shoulders', 'triceps'],
  '0178': ['shoulders', 'side delts'], '0192': ['shoulders', 'side delts'],
  '0225': ['shoulders', 'rear delts'], '0235': ['shoulders'],
  '0652': PULL, 1326: PULL, 3563: PULL, '0214': PULL, '0239': PULL, '0861': PULL, 1323: PULL,
  '0220': ['traps'], '0767': ['traps'],
  '0770': SQUAT, '0768': SQUAT, 3142: SQUAT, 1433: SQUAT, 2368: SQUAT,
  clandminerdl: ['hamstrings', 'glutes'], '0196': ['glutes', 'hamstrings'], '0795': ['hamstrings'],
  '0710': ['glutes'], '0228': ['glutes', 'hamstrings'],
  cpallofpress: ['core'], '0276': ['core'], 3239: ['core'], 3665: ['core']
}
const PRIMARY_GROUP = { hips: 'glutes', 'lower back': null, cardio: null, forearms: null }
export function hitsOf(exId, S) {
  if (HITS[exId]) return HITS[exId]
  const p = exerciseNeeds(exId, S).primary
  const g = p in PRIMARY_GROUP ? PRIMARY_GROUP[p] : p
  return g ? [g] : []
}

/* ------------------------------------------------------------------ time -- */
// His logged pace: about 3.6 min a set, 2 min of it the rest (evidence check, 2026-10-19). A
// superset round is both lifts back to back and one rest.
export const WORK_MIN = 1.6
export const REST_MIN = 2
export function sessionMinutes(routine) {
  const ex = (routine && routine.ex) || []
  let m = 0
  supersetUnits(ex).forEach(u => {
    const items = u.map(i => ex[i]).filter(c => !isCardio(c.id) && modeOf(c) !== 'cardio')
    if (!items.length) return
    const rounds = Math.max(...items.map(c => c.sets || 1))
    m += rounds * (items.length * WORK_MIN + REST_MIN)
  })
  return Math.round(m * 10) / 10
}

/* ------------------------------------------------------------- weekCheck -- */
export const MAX_MIN = 60
export const MIN_HITS = 2

/**
 * The whole week, resolved and checked (the weekly scan's report). Pure.
 *
 * `{ ok, weekStart, week, days: [{ date, routineId, name, exercises, minutes, setup, check }],
 *    coverage: { group: hits }, direct: { group: n }, repeats: [{ exId, name, dates }],
 *    sameAsLastWeek: [{ routineId, slot, exId, name }], problems: [{ rule, message, date? }] }`
 */
export function weekCheck(S, weekStart) {
  const mon = mondayOf(weekStart)
  const dates = weekDates(mon)
  const planned = dates.map(d => ({ date: d, rid: effectiveRoutineId(S, d) })).filter(x => x.rid)
  const extra = planned.map(x => x.rid)
  const cur = resolveWeek(S, mon, extra)
  const prev = resolveWeek(S, addDays(mon, -7), extra, { depth: CHAIN - 1 })
  const problems = []
  const coverage = Object.fromEntries([...GROUPS, ...EXTRA].map(g => [g, 0]))
  const direct = Object.fromEntries([...GROUPS, ...EXTRA].map(g => [g, 0]))
  const usedOn = {}

  const days = planned.map(({ date, rid }) => {
    const routine = S.routines.find(r => r.id === rid)
    const ids = cur.picks[rid] || routine.ex.map(e => e.id)
    const resolved = hasSlots(routine) ? orderRoutine(flatOf(routine, ids), S).routine : routine
    const check = checkRoutine(resolved, S)
    const minutes = sessionMinutes(resolved)
    const exercises = resolved.ex.map(c => ({
      id: c.id, name: nameOf(c.id), slot: c.slot || null, sg: c.sg || null,
      sets: c.sets || 1, reps: c.reps || null, repsMin: c.repsMin || null, side: !!c.side, min: c.min || null,
      mode: modeOf(c), load: loadFor(c, S, resolved)
    }))
    resolved.ex.forEach(c => {
      if (isCardio(c.id) || modeOf(c) === 'cardio') return
      const h = hitsOf(c.id, S)
      h.forEach(g => { coverage[g] = (coverage[g] || 0) + 1 })
      if (h[0]) direct[h[0]] = (direct[h[0]] || 0) + 1
      h.slice(1).filter(g => EXTRA.includes(g)).forEach(g => { direct[g] = (direct[g] || 0) + 1 })
      ;(usedOn[c.id] = usedOn[c.id] || []).push(date)
    })
    check.problems.forEach(p => problems.push({ rule: p.rule, date, exId: p.exId, message: routine.name + ' (' + date + '): ' + p.message }))
    if (minutes > MAX_MIN) problems.push({ rule: 'time', date, message: routine.name + ' (' + date + '): about ' + minutes + ' min — over the hour.' })
    return { date, routineId: rid, name: routine.name, exercises, minutes, setup: setupPlan(resolved, S).map(s => s.text), check }
  })

  // The same routine done twice in a week (a moved day) is the same session, not a repeat.
  const repeats = Object.entries(usedOn)
    .filter(([, ds]) => new Set(planned.filter(p => ds.includes(p.date)).map(p => p.rid)).size > 1)
    .map(([id, ds]) => ({ exId: id, name: nameOf(id), dates: ds }))
  repeats.forEach(r => problems.push({ rule: 'repeat', exId: r.exId, message: r.name + ' twice this week (' + r.dates.join(', ') + ').' }))

  const sameAsLastWeek = []
  Object.entries(cur.picks).forEach(([rid, ids]) => {
    const routine = S.routines.find(r => r.id === rid)
    if (!routine || !extra.includes(rid)) return
    routine.ex.forEach((e, i) => {
      if (isSlot(e) && e.pool.length > 1 && !born(e, mon) && prev.picks[rid] && prev.picks[rid][i] === ids[i]) sameAsLastWeek.push({ routineId: rid, slot: e.slot, exId: ids[i], name: nameOf(ids[i]) })
    })
  })
  sameAsLastWeek.forEach(s => problems.push({ rule: 'rotation', exId: s.exId, message: s.name + ' (' + s.slot + ') is the same as last week.' }))

  if (planned.length) {
    GROUPS.forEach(g => { if ((coverage[g] || 0) < MIN_HITS) problems.push({ rule: 'coverage', message: g + ': ' + (coverage[g] || 0) + ' hit' + (coverage[g] === 1 ? '' : 's') + ' this week — needs ' + MIN_HITS + '.' }) })
    DIRECT.forEach(g => { if (!(direct[g] > 0)) problems.push({ rule: 'direct', message: g + ': no direct exercise this week.' }) })
  }
  return { ok: problems.length === 0, weekStart: mon, week: cur.week, days, coverage, direct, repeats, sameAsLastWeek, problems }
}
