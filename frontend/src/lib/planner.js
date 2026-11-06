// The setup-aware planner (trainer contract, 2026-10-19).
//
// the owner: "I don't want to rack all the weights for a workout and the next one I'm putting them
// all back on." So a routine is judged the way it is actually lived: walk it lift by lift with
// the real plate pile, keep track of what is sitting on every station, and count what has to be
// taken off, put on, moved or swapped. Plates on one station are not available to another, so
// the plate budget is checked at every moment of the session, not lift by lift.
//
// Everything is a pure function of (routine, state). Nothing here writes.

import { exerciseNeeds, gearOf, plateTarget, plateCombos, fmtPlates, ATTACH_NAME, limitsOf } from './gear.js'
import { nextPrescription } from './progression.js'
import { EXIDX, isCardio } from './exercises.js'
import { supersetUnits, modeOf } from './history.js'

const nameOf = id => (EXIDX[id] && EXIDX[id].n) || id
const HORN_NAME = { hornL: 'left cable', hornR: 'right cable' }
const KEY_NAME = { smith: 'Smith', barbell: 'barbell', landmine: 'landmine', ...HORN_NAME }
const r2 = v => Math.round(v * 100) / 100

/**
 * The load a lift will actually be done at: what the progression engine will prescribe next,
 * else the "start here" weight the app pre-fills, else the last logged top weight, else the plan.
 */
// A caller that asks about one frozen state many times (the weekly variety search) can hang a
// Map on it under this key; loads are then worked out once per exercise config.
export const LOAD_CACHE = Symbol('loadCache')
export function loadFor(cfg, S, routine) {
  if (!cfg || isCardio(cfg.id) || modeOf(cfg) === 'cardio') return 0
  const cache = S && S[LOAD_CACHE]
  if (cache) {
    const k = JSON.stringify(cfg) + '|' + ((routine && routine.prog) || '')
    if (!cache.has(k)) cache.set(k, loadUncached(cfg, S, routine))
    return cache.get(k)
  }
  return loadUncached(cfg, S, routine)
}
function loadUncached(cfg, S, routine) {
  try {
    const p = nextPrescription(S, cfg, routine)
    if (p && p.weight != null) return p.weight
  } catch (e) { /* fall through to the cache */ }
  const conf = (S.exWeights || {})[cfg.id]
  if (conf && conf.w > 0) return conf.w
  return cfg.weight || 0
}

/* ------------------------------------------------------------ plate pile -- */
const count = list => { const m = {}; list.forEach(p => { m[p] = (m[p] || 0) + 1 }); return m }
// Multiset difference a − b, as a list (heaviest first).
function minus(a, b) {
  const left = count(b)
  const out = []
  a.forEach(p => { if (left[p] > 0) left[p]--; else out.push(p) })
  return out.sort((x, y) => y - x)
}
const overlap = (a, b) => a.length - minus(a, b).length
const isPair = key => key === 'smith' || key === 'barbell'

/**
 * Walk the routine in its current order. Returns one record per exercise with what happened at
 * every station, plus the totals the order is judged by.
 */
export function simulate(routine, S) {
  const g = gearOf(S)
  const ex = (routine && routine.ex) || []
  const st = {}            // station key → plates (per side for Smith/barbell)
  const loadedOnce = {}    // station key → it has had plates put on this session
  const att = {}           // horn → attachment on it
  let bench = null         // { where, pos }
  const recs = []
  let lastStation = null
  const visited = new Set()
  const tot = { moves: 0, benchMoves: 0, swaps: 0, revisits: 0, reloads: 0, budget: 0 }

  // Which station keys are used from position i onwards (to know what may be stripped freely).
  const stationKeys = need => (need.kind === 'horn' ? (need.horns === 2 ? ['hornL', 'hornR'] : ['horn']) : need.kind ? [need.kind === 'barbell' ? 'barbell' : need.kind] : [])
  const needs = ex.map(cfg => exerciseNeeds(cfg.id, S))
  // Superset partners alternate set by set, so a lift may not take or strip its partner's
  // station: both stay loaded for all three rounds.
  const units = supersetUnits(ex)
  let busy = new Set()
  const loads = ex.map(cfg => loadFor(cfg, S, routine))
  const usedLater = i => {
    const s = new Set()
    for (let j = i + 1; j < ex.length; j++) stationKeys(needs[j]).forEach(k => { if (k === 'horn') { s.add('hornL'); s.add('hornR') } else s.add(k) })
    return s
  }
  const freePile = except => {
    const pile = { ...g.plates }
    Object.entries(st).forEach(([k, list]) => {
      if (except.includes(k)) return
      list.forEach(p => { pile[p] = (pile[p] || 0) - (isPair(k) ? 2 : 1) })
    })
    return pile
  }

  // The loads still to come on each kind of station (per side for Smith/barbell), so a load can
  // be built from plates the lighter lifts after it can be peeled from (lookahead).
  const targets = ex.map((cfg, i) => (needs[i].feasible && needs[i].kind && loads[i] > 0 ? plateTarget(loads[i], needs[i].kind, g) : null))
  const futureFor = (key, i) => {
    const kind = key.startsWith('horn') ? 'horn' : key
    const out = []
    for (let j = i + 1; j < ex.length; j++) if (targets[j] && (needs[j].kind === kind || (kind === 'barbell' && needs[j].kind === 'barbell'))) out.push(targets[j].total)
    return out
  }
  const makeable = (t, list) => plateCombos(t, false, count(list), [...new Set(list)].sort((a, b) => b - a)).length > 0
  let curIdx = 0

  // Plan loading `total` onto one station, without committing. Returns the ops it would take.
  function planLoad(key, tgt, later) {
    if (busy.has(key)) return null
    const cur = st[key] || []
    const others = Object.keys(st).filter(k => k !== key && !busy.has(k) && (st[k] || []).length)
    const tryWith = stripped => {
      // Everything not on another (unstripped) station — this station's own plates included.
      const pile = freePile([key, ...stripped])
      Object.keys(pile).forEach(p => { if (pile[p] < 0) pile[p] = 0 })
      const combos = plateCombos(tgt.total, tgt.perSide, pile, Object.keys(g.plates).map(Number).sort((a, b) => b - a))
      if (!combos.length) return null
      // Lookahead only among the combos that keep what is already on (it never adds a reason to
      // strip): then prefer the one the most later lighter loads can be peeled from.
      const fut = futureFor(key, curIdx).filter(t => t <= tgt.total + 1e-6)
      const cover = c => (fut.length ? fut.filter(t => makeable(t, c)).length : 0)
      const sc = combos.map(c => ({ c, o: overlap(c, cur), v: cover(c) }))
      sc.sort((a, b) => (b.o - a.o) || (b.v - a.v) || (a.c.length - b.c.length))
      return sc[0].c
    }
    const idle = others.filter(k => !later.has(k))
    const attempts = [[], idle, others]
    for (const stripped of attempts) {
      const combo = tryWith(stripped)
      if (combo) {
        return {
          key, combo, removed: minus(cur, combo), added: minus(combo, cur),
          strips: stripped.map(k => ({ key: k, removed: st[k].slice(), reload: later.has(k) }))
        }
      }
    }
    return null
  }
  const costOf = plan => {
    if (!plan) return 1e6
    const mul = isPair(plan.key) ? 2 : 1
    let c = (plan.removed.length + plan.added.length) * mul
    // Stripping a station that is finished for the day is racking it early — it would come off at
    // the end anyway — so only a strip of a station needed again costs anything.
    plan.strips.forEach(s => { if (s.reload) c += s.removed.length * (isPair(s.key) ? 2 : 1) + 100 })
    if (plan.added.length && loadedOnce[plan.key]) c += 100
    return c
  }
  function commit(plan, rec) {
    plan.strips.forEach(s => {
      st[s.key] = []
      if (s.reload) { tot.moves += s.removed.length * (isPair(s.key) ? 2 : 1); tot.reloads++; rec.reload = true }
      rec.ops.push({ type: 'strip', key: s.key, removed: s.removed, reload: s.reload })
    })
    const reload = plan.added.length > 0 && !!loadedOnce[plan.key]
    if (reload) { tot.reloads++; rec.reload = true }
    tot.moves += (plan.removed.length + plan.added.length) * (isPair(plan.key) ? 2 : 1)
    if (plan.removed.length || plan.added.length) rec.ops.push({ type: 'load', key: plan.key, removed: plan.removed, added: plan.added, combo: plan.combo, reload, first: !loadedOnce[plan.key] && !(st[plan.key] || []).length })
    st[plan.key] = plan.combo.slice()
    if (plan.added.length) loadedOnce[plan.key] = true
  }

  ex.forEach((cfg, i) => {
    const need = needs[i]
    const load = loads[i]
    curIdx = i
    const rec = { exId: cfg.id, name: nameOf(cfg.id), need, load, ops: [], keys: [], reload: false, budget: false }
    recs.push(rec)
    const unit = units.find(u => u.includes(i)) || [i]
    busy = new Set(unit.filter(j => j < i).flatMap(j => recs[j].keys || []))
    if (!need.feasible) return
    if (busy.size) {
      const want = need.kind === 'horn' ? (need.horns === 2 ? ['hornL', 'hornR'] : null) : need.kind ? [need.kind] : []
      rec.clash = want ? want.some(k => busy.has(k)) : (busy.has('hornL') && busy.has('hornR'))
    }
    const later = usedLater(i)

    // Plates.
    if (need.kind && load > 0) {
      const kind = need.kind
      const tgt = plateTarget(load, kind, g)
      if (!tgt) { rec.budget = true; tot.budget++; rec.why = 'under the empty bar' }
      else if (kind === 'horn') {
        if (need.horns === 2) {
          const pL = planLoad('hornL', tgt, later)
          if (pL) commit(pL, rec)
          const pR = pL && planLoad('hornR', tgt, later)
          if (pR) commit(pR, rec)
          if (!pL || !pR) { rec.budget = true; tot.budget++ }
          rec.keys = ['hornL', 'hornR']
        } else {
          // One horn: take whichever is cheaper to get there; prefer one already wearing the
          // right attachment, then the left.
          const opts = ['hornL', 'hornR'].map(k => ({ k, plan: planLoad(k, tgt, later) }))
          opts.forEach(o => { o.cost = costOf(o.plan) + (att[o.k] === need.attachment ? 0 : 0.5) })
          opts.sort((a, b) => a.cost - b.cost)
          if (opts[0].plan) { commit(opts[0].plan, rec); rec.keys = [opts[0].k] } else { rec.budget = true; tot.budget++ }
        }
      } else {
        const key = kind
        const plan = planLoad(key, tgt, later)
        if (plan) commit(plan, rec); else { rec.budget = true; tot.budget++ }
        rec.keys = [key]
      }
    } else if (need.kind === 'horn') {
      const free = ['hornL', 'hornR'].filter(k => !busy.has(k))
      rec.keys = [free.find(k => att[k] === need.attachment) || free[0] || 'hornL']
      if (need.horns === 2) rec.keys = ['hornL', 'hornR']
    } else if (need.kind) rec.keys = [need.kind]

    // Attachments.
    if (need.attachment) {
      rec.keys.filter(k => k.startsWith('horn')).forEach(k => {
        if (att[k] !== need.attachment) {
          rec.ops.push({ type: 'attach', key: k, from: att[k] || null, to: need.attachment })
          att[k] = need.attachment
          tot.swaps++
        }
      })
    }

    // Bench.
    const where = need.station === 'smith' ? 'smith' : need.station === 'cable' ? 'cable' : need.station === 'rack' ? 'rack' : null
    if (need.bench) {
      if (!bench || bench.where !== where || bench.pos !== need.bench) {
        rec.ops.push({ type: 'bench', where, pos: need.bench, from: bench })
        bench = { where, pos: need.bench }
        tot.benchMoves++
      }
    } else if (bench && where && bench.where === where && (where === 'smith' || where === 'rack')) {
      // Squats, calf raises and shrugs need the space under the bar.
      rec.ops.push({ type: 'bench', where: null, pos: null, from: bench })
      bench = { where: 'aside', pos: bench.pos }
      tot.benchMoves++
    }

    // Station grouping: walking back to a station you already left is a setup cost of its own.
    const setupStation = ['smith', 'cable', 'rack', 'landmine', 'barbell'].includes(need.station) ? need.station : null
    if (setupStation) {
      if (setupStation !== lastStation && visited.has(setupStation)) tot.revisits++
      visited.add(setupStation)
      lastStation = setupStation
    }
  })

  const finish = Object.entries(st).filter(([, list]) => list.length).map(([key, list]) => ({ key, plates: list }))
  return { recs, tot, finish }
}

/* --------------------------------------------------------------- checks -- */
// Two heavy lifts in a row for the same main muscle (rule 8). Cardio is skipped: the walk sits
// between nothing.
export function backToBack(routine, S) {
  const out = []
  let prev = null
  ;((routine && routine.ex) || []).forEach(cfg => {
    if (isCardio(cfg.id)) return
    const n = exerciseNeeds(cfg.id, S)
    if (prev && prev.n.heavy && n.heavy && n.primary && prev.n.primary === n.primary) out.push({ a: prev.id, b: cfg.id, primary: n.primary })
    prev = { id: cfg.id, n }
  })
  return out
}

/**
 * `{ ok, problems: [{ exId, rule, message }] }` — gear, plate budget, back-to-back heavy lifts,
 * strip-and-reload setups, and the hard rules (shoulder cap, 3 sets, reps ≤ 12).
 */
export function checkRoutine(routine, S) {
  const problems = []
  const lim = limitsOf(S) || gearOf(S).limits
  const sim = simulate(routine, S)
  sim.recs.forEach((rec, i) => {
    const cfg = routine.ex[i]
    const n = rec.need
    if (!n.feasible) { problems.push({ exId: rec.exId, rule: 'gear', message: rec.name + ': ' + (n.why || 'not doable on this gear.') }); return }
    if (rec.clash) problems.push({ exId: rec.exId, rule: 'superset', message: rec.name + ': can’t superset with its partner — both need the same station.' })
    else if (rec.budget) problems.push({ exId: rec.exId, rule: 'budget', message: rec.name + ': ' + rec.load + ' lb can’t be made with the plates in the gym' + (rec.why ? ' (' + rec.why + ')' : '') + '.' })
    rec.ops.filter(o => o.reload).forEach(o => problems.push({
      exId: rec.exId, rule: 'setup',
      message: o.type === 'strip'
        ? rec.name + ': the ' + KEY_NAME[o.key] + ' has to be stripped to free plates, then loaded again later.'
        : rec.name + ': plates go back on the ' + KEY_NAME[o.key] + ' after coming off — reorder so it only comes down.'
    }))
    if (isCardio(cfg.id) || modeOf(cfg) === 'cardio') return
    if (lim) {
      if ((cfg.sets || 0) !== lim.maxSets) problems.push({ exId: rec.exId, rule: 'sets', message: rec.name + ': ' + (cfg.sets || 0) + ' sets — always ' + lim.maxSets + '.' })
      const reps = cfg.side ? (cfg.reps || 0) / 2 : (cfg.reps || 0)
      if (modeOf(cfg) === 'reps' && reps > lim.maxReps) problems.push({ exId: rec.exId, rule: 'reps', message: rec.name + ': ' + reps + ' reps' + (cfg.side ? ' a side' : '') + ' — nothing above ' + lim.maxReps + '.' })
      // The plan's own weight counts too: progression would quietly cap it, but a plan that asks
      // for more than the cap is still wrong and should say so.
      const heaviest = Math.max(rec.load || 0, cfg.weight || 0)
      if (n.sh && heaviest > lim.shoulderLb) problems.push({ exId: rec.exId, rule: 'cap', message: rec.name + ': ' + heaviest + ' lb on the shoulders — the cap is ' + lim.shoulderLb + '.' })
    }
  })
  backToBack(routine, S).forEach(b => problems.push({
    exId: b.b, rule: 'order',
    message: nameOf(b.a) + ' then ' + nameOf(b.b) + ': two heavy ' + b.primary + ' lifts back to back.'
  }))
  return { ok: problems.length === 0, problems }
}

/* ------------------------------------------------------------- ordering -- */
function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()]
  const out = []
  arr.forEach((x, i) => {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1))
    permutations(rest).forEach(p => out.push([x, ...p]))
  })
  return out
}
const lexLess = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] < b[i] } return false }

/**
 * Reorder for the least setup: heaviest station load first so plates only come off, one station
 * at a time, never two heavy lifts for the same muscle back to back. Cardio (the walk) stays in
 * front. Supersets move as one block. Returns `{ routine, changes: [{ exId, from, to, text }] }`.
 */
export function orderRoutine(routine, S) {
  const ex = (routine && routine.ex) || []
  const units = supersetUnits(ex)
  const fixed = units.filter(u => u.every(i => isCardio(ex[i].id)))
  const free = units.filter(u => !fixed.includes(u))
  const original = units.flat()
  const score = order => {
    const r = { ...routine, ex: order.map(i => ex[i]) }
    const sim = simulate(r, S)
    const viol = backToBack(r, S).length
    // Lighter-before-heavier among plate-loaded lifts: the fallback for "heaviest first".
    const loaded = sim.recs.filter(x => x.need.kind && x.load > 0)
    let inv = 0
    for (let a = 0; a < loaded.length; a++) for (let b = a + 1; b < loaded.length; b++) if (loaded[a].load < loaded[b].load) inv++
    const disp = order.reduce((s, idx, pos) => s + Math.abs(original.indexOf(idx) - pos), 0)
    const t = sim.tot
    return [t.budget, viol, t.reloads, t.moves + 2 * t.benchMoves + t.swaps + 3 * t.revisits, inv, disp]
  }
  let best = original
  let bestScore = score(original)
  // 6 movable blocks is 720 orders — instant. Past that the routine keeps its order.
  if (free.length <= 6) {
    permutations(free).forEach(p => {
      const order = [...fixed.flat(), ...p.flat()]
      const s = score(order)
      if (lexLess(s, bestScore)) { best = order; bestScore = s }
    })
  }
  const changes = []
  best.forEach((idx, pos) => {
    const from = original.indexOf(idx)
    if (from !== pos) changes.push({ exId: ex[idx].id, from, to: pos, text: nameOf(ex[idx].id) + ': ' + (from + 1) + ' → ' + (pos + 1) })
  })
  return { routine: { ...routine, ex: best.map(i => ex[i]) }, changes }
}

/**
 * Whether ANY order of the routine sets up cleanly (no plate budget miss, no back-to-back heavy
 * pair, no strip-and-reload, no superset clash). Same search as orderRoutine, but it stops at the
 * first clean order — the weekly variety search asks this many times.
 */
export function setupPossible(routine, S) {
  const ex = (routine && routine.ex) || []
  const units = supersetUnits(ex)
  const fixed = units.filter(u => u.every(i => isCardio(ex[u[0]].id)))
  const free = units.filter(u => !fixed.includes(u))
  if (free.length > 6) return checkRoutine(routine, S).ok
  for (const p of permutations(free)) {
    const r = { ...routine, ex: [...fixed.flat(), ...p.flat()].map(i => ex[i]) }
    const sim = simulate(r, S)
    if (sim.tot.budget || sim.tot.reloads || sim.recs.some(x => x.clash || !x.need.feasible)) continue
    if (backToBack(r, S).length) continue
    return true
  }
  return false
}

/* ---------------------------------------------------------------- steps -- */
const each = key => (isPair(key) ? ' each side' : '')
const totalOn = (key, plates, g) => {
  const sum = plates.reduce((s, p) => s + p, 0)
  if (key === 'smith') return g.smithBar + 2 * sum
  if (key === 'barbell') return g.barbell + 2 * sum
  if (key === 'landmine') return g.barbell + sum
  return sum
}
const BENCH_WHERE = { smith: 'under the Smith', cable: 'between the cables', rack: 'in the rack' }

/** Human steps, in order: `[{ exId|null, text }]`. What to load where, and what changes between lifts. */
export function setupPlan(routine, S) {
  const g = gearOf(S)
  const sim = simulate(routine, S)
  const steps = []
  sim.recs.forEach((rec, i) => {
    const parts = []
    if (!rec.need.feasible) { steps.push({ exId: rec.exId, text: rec.name + ': can’t be done here — ' + (rec.need.why || 'not on this gear') }); return }
    if (rec.need.station === 'treadmill') { steps.push({ exId: rec.exId, text: 'Optional: ' + rec.name + ' first (skip it on a short day).' }); return }
    rec.ops.forEach(o => {
      if (o.type === 'strip') parts.push('strip the ' + KEY_NAME[o.key] + ' (' + fmtPlates(o.removed) + each(o.key) + ')' + (o.reload ? ' — it gets loaded again later' : ''))
      else if (o.type === 'load') {
        const now = totalOn(o.key, o.combo, g)
        if (o.first) parts.push('load the ' + KEY_NAME[o.key] + ' with ' + fmtPlates(o.added) + each(o.key) + ' (' + r2(now) + ' lb)')
        else if (!o.added.length) parts.push('take ' + fmtPlates(o.removed) + ' off the ' + KEY_NAME[o.key] + each(o.key) + ' (now ' + r2(now) + ' lb)')
        else if (!o.removed.length) parts.push('add ' + fmtPlates(o.added) + each(o.key) + ' to the ' + KEY_NAME[o.key] + ' (now ' + r2(now) + ' lb)')
        else parts.push(KEY_NAME[o.key] + ': off ' + fmtPlates(o.removed) + ', on ' + fmtPlates(o.added) + each(o.key) + ' (now ' + r2(now) + ' lb)')
      } else if (o.type === 'attach') parts.push((o.from ? 'swap the ' + ATTACH_NAME[o.from] + ' for the ' : 'clip the ') + ATTACH_NAME[o.to] + ' on the ' + KEY_NAME[o.key])
      else if (o.type === 'bench') {
        if (!o.pos) parts.push('move the bench out of the ' + (o.from.where === 'smith' ? 'Smith' : 'rack'))
        else if (o.from && o.from.where === o.where) parts.push('set the bench to ' + o.pos)
        else parts.push('bench ' + (BENCH_WHERE[o.where] || 'in place') + ', ' + o.pos)
      }
    })
    const on = rec.keys.filter(k => k.startsWith('horn'))
    const label = (i === 0 || steps.length === 0 ? 'Start — ' : '') + rec.name + (rec.load > 0 ? ' @ ' + rec.load + ' lb' : '')
    steps.push({ exId: rec.exId, text: label + ': ' + (parts.length ? parts.join('; ') : 'nothing to change') + (on.length === 1 && rec.need.horns === 1 ? ' [' + KEY_NAME[on[0]] + ']' : '') + '.' })
  })
  if (sim.finish.length) steps.push({ exId: null, text: 'Done — rack it: ' + sim.finish.map(f => KEY_NAME[f.key] + ' ' + fmtPlates(f.plates) + each(f.key)).join(', ') + '.' })
  return steps
}
