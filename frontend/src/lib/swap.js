// "Swap": the exercises that could stand in for one he doesn't want — same muscle group, and
// doable on the gear he has (gear.js decides; when it can't tell, the lift is left out rather
// than sending him to a machine he doesn't own).
import { allExercises, isCardio } from './exercises.js'
import { exerciseNeeds } from './gear.js'
import { lastEntryFor, buildSets, supersetUnits } from './history.js'
import { nextPrescription, applyPrescription } from './progression.js'
import { applyProposal, applyToState } from './trainer.js'

// Feasibility is a derivation over the whole library; the gear block rarely changes.
const NEEDS = new Map()
const needsOf = (id, S) => {
  const k = id + '|' + JSON.stringify(S.gear || null)
  if (!NEEDS.has(k)) { NEEDS.set(k, exerciseNeeds(id, S)); if (NEEDS.size > 5000) NEEDS.clear() }
  return NEEDS.get(k)
}

// Mobility drills and duplicate library entries ("v. 2", "(female)") are not swaps for a working lift.
const NOT_A_LIFT = /stretch|circles|rotation|\(female\)/i
const base = n => String(n).toLowerCase().replace(/\s*\((male|female)\)|\s*v\.\s*\d+/g, '').trim()
const STOP = new Set(['with', 'on', 'the', 'and', 'one', 'arm', 'leg', 'to', 'of', 'a'])
const words = n => new Set(base(n).split(/[^a-z]+/).filter(w => w.length > 2 && !STOP.has(w)))

// Best first: the closest movement (a lateral raise for a lateral raise, a calf raise for a calf
// raise: shared words in the name), then lifts he has done before, then the same target muscle.
export function swapOptions(S, exId, exclude = []) {
  const from = needsOf(exId, S)
  const all = allExercises(S)
  const orig = all.find(e => e.id === exId)
  if (!orig) return []
  const group = from.primary
  const skip = new Set([exId, ...exclude])
  const mine = words(orig.n)
  const seen = new Set([base(orig.n)])
  const out = []
  for (const e of all) {
    if (skip.has(e.id) || isCardio(e) !== isCardio(orig) || NOT_A_LIFT.test(e.n)) continue
    // A custom exercise has no gear entry; it is his own, so it counts as doable when it matches.
    const custom = (S.customEx || []).some(c => c.id === e.id)
    const n = custom ? null : needsOf(e.id, S)
    if (n && !n.feasible) continue
    const same = group ? (n ? n.primary === group : e.tg === orig.tg) : e.tg === orig.tg
    if (!same || seen.has(base(e.n))) continue
    seen.add(base(e.n))
    let near = 0
    for (const w of words(e.n)) if (mine.has(w)) near++
    out.push({ ex: e, done: !!lastEntryFor(S, e.id), near, tg: e.tg === orig.tg })
  }
  return out.sort((a, b) => (b.near - a.near) || (b.done - a.done) || (b.tg - a.tg) || a.ex.n.localeCompare(b.ex.n)).map(x => x.ex)
}

// Puts `toId` where entry `idx` of the running session is. `always` also changes the routine,
// through the same path a trainer swap takes (slots, supersets and the session all follow).
// A lift that isn't in the routine (added by hand, freestyle) is swapped for today only.
// Sets already logged on the old lift stay in the session as their own (shorter) entry, parked
// right after the superset (or lone slot) the new lift takes over, so a superset never ends up
// split around it. The session is pointed at the new lift. Returns whether the routine was
// changed. Mutates the draft S, as update() producers do.
export function swapInSession(S, idx, toId, always) {
  const A = S.active
  const e = A && A.entries[idx]
  if (!e) return false
  const logged = e.sets.some(x => x.done)
  if (logged) e.sets = e.sets.filter(x => x.done)
  // the old lift's logged sets, moved to just after the unit holding entry `at`
  const park = (old, at) => {
    const from = A.entries.indexOf(old)
    if (from >= 0) A.entries.splice(from, 1)
    delete old.sg
    const j = A.entries.findIndex(x => x.id === at)
    const unit = supersetUnits(A.entries).find(u => u.includes(j)) || [j]
    A.entries.splice(Math.max(...unit) + 1, 0, old)
  }
  if (always && A.routineId) {
    const r = S.routines.find(x => x.id === A.routineId)
    const next = applyProposal(r, { kind: 'swap', routineId: A.routineId, fromEx: e.id, toEx: toId })
    if (next) {
      applyToState(S, A.routineId, next.ex)
      if (logged) { const old = A.entries.find(x => x.id === e.id && x.sets.every(y => y.done)); if (old) park(old, toId) }
      A.cur = Math.max(0, A.entries.findIndex(x => x.id === toId))
      return true
    }
  }
  // Same sets and reps; the old lift's load means nothing on the new one, so it starts from its own history.
  const cfg = { ...(e.target || {}), id: toId, weight: 0 }
  delete cfg.slot; delete cfg.pool; delete cfg.opts; delete cfg.bodyweight
  const r = A.routineId ? S.routines.find(x => x.id === A.routineId) : null
  const plan = nextPrescription(S, cfg, r)
  const fresh = { id: toId, ...(e.sg ? { sg: e.sg } : {}), target: { ...cfg }, plan, sets: applyPrescription(buildSets(S, cfg), plan) }
  A.entries[idx] = fresh
  if (logged) park(e, toId)
  A.cur = A.entries.indexOf(fresh)
  return false
}
