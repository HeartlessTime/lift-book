// The monthly coaching read (issue #34): the three questions a saved log can answer that the
// workout screen cannot. What has stopped moving, whether the scale is the reason it stopped,
// and which muscles a week of training keeps walking past.
//
// Everything here is a pure function of the history, like lib/progression.js — nothing is
// stored, so a corrected set immediately produces a corrected reading. And everything refuses
// to answer off too little history: a stall called from two sessions in one week, or a weight
// trend fitted through four days of scale noise, is a confident number about nothing.
// lib/effort.js draws that line with MIN_RATED and shows a dash below it; the constants here
// are the same idea, one per question.

import { EXIDX, exOr } from './exercises.js'
import { modeOf } from './history.js'
import { musclesOf, isConditioning, MUSCLES } from './muscles.js'

// "About a month" — four weeks is roughly four attempts at a lift he trains once a week, and
// the point at which "it felt easy again" stops being a bad day and starts being the plan.
export const STALL_DAYS = 28
// Two sessions is a coincidence. Three is the smallest history where "it has not moved" is a
// statement about the lift rather than about how few times it has been done.
export const MIN_SESSIONS = 3
// Weigh-ins needed before a trend line is drawn through them, and the span they have to
// cover. Body weight swings a couple of pounds day to day on water alone: five readings over
// a fortnight is the least that can tell a direction from that noise.
export const MIN_WEIGH_INS = 5
export const MIN_TREND_DAYS = 14
// Lifts needed before "the lifts are stuck" is a claim about training rather than about one
// exercise having a bad month.
export const MIN_TREND_LIFTS = 3
// Below this many sessions a per-muscle tally is one workout's exercise list, not a picture
// of a week — three of his four training days is the least that reads as one.
export const MIN_COVER_WORKOUTS = 3

const DAY = 86400000
const round1 = v => Math.round(v * 10) / 10
// Imported history has no clock, so the date stands in for the timestamp — same fallback the
// rest of the stats use.
const tOf = w => w.start || new Date(w.d).getTime()
const inWin = (t, days, now) => !days || t > now - days * DAY

// ---------- 1. stalled lifts ----------

/**
 * One exercise's finished sessions, oldest first: what the top working set weighed and how
 * many reps were done at that weight.
 *
 * Reps are carried alongside the weight because they are the other way a session can be
 * better than the last one — 3×8 to 3×10 at the same 165 is progress that a weight-only read
 * draws as a flat line, and calling that a stall would be wrong. `topW` is the working weight
 * confirmed after the exercise and can sit above every set still on file, so it is the floor
 * for "what did this lift", not an alternative to the sets.
 *
 * Only reps-mode training is read. A treadmill walk and a plank both progress, but not in
 * pounds, and neither belongs in a list about adding weight to the bar.
 */
export function liftSessions(S, exId) {
  const out = []
  ;(S.workouts || []).forEach(w => {
    const e = (w.entries || []).find(x => x.id === exId)
    if (!e) return
    if (modeOf({ ...(e.target || {}), id: exId }) !== 'reps') return
    const done = (e.sets || []).filter(s => s.done)
    if (!done.length) return
    const top = Math.max(0, ...done.map(s => s.w || 0), e.topW || 0)
    const reps = done.reduce((n, s) => n + ((s.w || 0) >= top ? (s.r || 0) : 0), 0)
    out.push({ d: w.d, t: tOf(w), w: top, reps })
  })
  return out.sort((a, b) => a.t - b.t)
}

// Is this session better than that one? More weight, or the same weight for more total reps.
// Bodyweight work logs 0 kg forever, so on those the rep count is the whole comparison.
const beats = (a, b) => a.w > b.w || (a.w === b.w && a.reps > b.reps)

/**
 * How long a lift has been standing still: the most recent session that beat everything
 * before it, and the days from there to the last time it was trained. A history that has
 * never improved dates from its first session — that is the baseline it never left.
 */
export function stallOf(sessions) {
  if (!sessions.length) return null
  let best = sessions[0], since = sessions[0]
  sessions.forEach(s => { if (beats(s, best)) { best = s; since = s } })
  const last = sessions[sessions.length - 1]
  return {
    since: since.d, w: last.w, reps: last.reps, last: last.d,
    days: Math.round((last.t - since.t) / DAY),
    span: Math.round((last.t - sessions[0].t) / DAY),
    sessions: sessions.length
  }
}

/**
 * Every lift currently in the rotation, and which of them have not moved in STALL_DAYS.
 *
 * A lift dropped from the plan is not stalled — you cannot fail to progress something you
 * stopped doing — so anything untrained for longer than the stall window drops out entirely.
 * `ready` is the honest-answer flag: it is only true once some lift has been in the plan long
 * enough that a stall *could* have shown up. Below that "no stalls" would be a claim the
 * history cannot support, and the card says so instead.
 */
export function stalledLifts(S, now = Date.now()) {
  const ids = [...new Set((S.workouts || []).flatMap(w => (w.entries || []).map(e => e.id)))]
  const watched = []
  ids.forEach(id => {
    const ss = liftSessions(S, id)
    const last = ss[ss.length - 1]
    if (ss.length < MIN_SESSIONS || !last || now - last.t > STALL_DAYS * DAY) return
    watched.push({ id, name: exOr(id).n, ...stallOf(ss) })
  })
  const stalled = watched.filter(l => l.days >= STALL_DAYS).sort((a, b) => b.days - a.days)
  return { watched, stalled, ready: watched.some(l => l.span >= STALL_DAYS) }
}

// ---------- 2. body weight against strength ----------

/**
 * Every weigh-in in the window, one per day, oldest first. The scale log is the record and a
 * workout's own weigh-in (`w.bw`) fills the days it never reached — they are the same number
 * written by two different screens, and a trend drawn off one of them alone has gaps the
 * other could have filled.
 */
export function weighIns(S, days, now = Date.now()) {
  const byDay = new Map()
  ;(S.workouts || []).forEach(w => { if (w.bw > 0) byDay.set(w.d, { d: w.d, t: tOf(w), w: w.bw }) })
  ;(S.bodyweight || []).forEach(b => { if (b.w > 0) byDay.set(b.d, { d: b.d, t: b.t || new Date(b.d).getTime(), w: b.w }) })
  return [...byDay.values()].filter(p => inWin(p.t, days, now)).sort((a, b) => a.t - b.t)
}

// Least-squares slope in weight per day. First-against-last would do the same job in one line
// and be wrong: two pounds of water on the last morning would flip the direction, and the
// whole point of the card is that the direction is the finding.
function slopePerDay(pts) {
  const n = pts.length
  const mx = pts.reduce((a, p) => a + p.t, 0) / n / DAY
  const my = pts.reduce((a, p) => a + p.w, 0) / n
  let num = 0, den = 0
  pts.forEach(p => { const dx = p.t / DAY - mx; num += dx * (p.w - my); den += dx * dx })
  return den ? num / den : 0
}
// Under this much a week the scale is drifting, not trending. A pound a fortnight is inside
// the noise of when you last ate; in kg the same band is smaller because the numbers are.
const flatBand = unit => (unit === 'kg' ? 0.1 : 0.25)

/** Which way body weight is going, in weight per week. `perWeek` is null when it cannot say. */
export function bodyweightTrend(S, days, now = Date.now()) {
  const pts = weighIns(S, days, now)
  const span = pts.length > 1 ? (pts[pts.length - 1].t - pts[0].t) / DAY : 0
  const out = { pts, n: pts.length, span: Math.round(span), perWeek: null, dir: null, last: pts.length ? pts[pts.length - 1].w : null }
  if (pts.length < MIN_WEIGH_INS || span < MIN_TREND_DAYS) return out
  const per = round1(slopePerDay(pts) * 7)
  const band = flatBand(S.unit)
  return { ...out, perWeek: per, dir: per <= -band ? 'down' : per >= band ? 'up' : 'flat' }
}

/**
 * Which way each lift went inside the window — first session against last, on the same
 * "weight or reps" reading a stall uses. A lift trained only once in the window has no
 * direction and is not counted: it would otherwise land in whichever bucket makes the
 * summary look worse.
 */
export function liftDirections(S, days, now = Date.now()) {
  const ids = [...new Set((S.workouts || []).flatMap(w => (w.entries || []).map(e => e.id)))]
  const out = { up: 0, flat: 0, down: 0, n: 0 }
  ids.forEach(id => {
    const ss = liftSessions(S, id).filter(s => inWin(s.t, days, now))
    if (ss.length < 2) return
    const first = ss[0], last = ss[ss.length - 1]
    out.n++
    if (beats(last, first)) out.up++
    else if (beats(first, last)) out.down++
    else out.flat++
  })
  return out
}

/**
 * The two trends side by side, and the sentence that only makes sense with both.
 *
 * A stall while the scale is falling is a food problem — the training did not stop working,
 * the fuel ran out — and rewriting the program is the one fix guaranteed not to help. The
 * same stall at a steady body weight really is the program. Same symptom, opposite answer,
 * which is why neither number is shown on its own. `note` is a translatable template + args,
 * the same shape lib/progression.js explains its prescriptions with.
 */
export function fuelCheck(S, days = 90, now = Date.now()) {
  const bw = bodyweightTrend(S, days, now)
  const lift = liftDirections(S, days, now)
  const stuck = lift.flat + lift.down
  const ready = bw.perWeek != null && lift.n >= MIN_TREND_LIFTS
  const moving = lift.up > stuck
  let note = null
  if (ready) {
    if (bw.dir === 'down' && !moving) note = ['Your weight is drifting down and most lifts have stopped moving. That is a food problem, not a training one — eat more before you change a single set.']
    else if (bw.dir === 'down') note = ['You are still adding weight to the bar while the scale falls. That works for a while — if the lifts flatten out, the fix is more food, not a new routine.']
    else if (!moving && bw.dir === 'up') note = ['Weight is going up but the lifts are not following. The food is there — this one is the program.']
    else if (!moving) note = ['Body weight is holding steady, so a stall here is the program, not the plate. Change the sets, the reps or the exercise.']
    else note = ['Weight steady or climbing and the lifts with it — nothing here needs changing.']
  }
  return { bw, lift, stuck, moving, ready, note }
}

// ---------- 3. weekly muscle coverage ----------

/**
 * Sets per muscle for a week of training, as a weekly rate so 7, 14 and 28 day windows read
 * against each other. Weighted the way lib/muscles.js weights everything: a supporting muscle
 * counts 0.4 of a set, so "sets" here is effective sets and comes out fractional.
 *
 * The warm-up walk is left out, and that exclusion is the whole reason this exists as its own
 * tally. The treadmill opens all four routines and the dataset hands it quadriceps, hamstrings
 * and calves as secondary muscles, so counted at face value it credits legs on every single
 * training day — and buries exactly the gaps a coverage list is for. Skipped by kind, never by
 * id: any cardio exercise, and any entry logged in cardio mode, drops out the same way.
 */
export function muscleWeek(S, days = 7, now = Date.now()) {
  const ws = (S.workouts || []).filter(w => inWin(tOf(w), days, now))
  const load = {}
  let warmup = 0
  ws.forEach(w => (w.entries || []).forEach(e => {
    const sets = (e.sets || []).filter(s => s.done).length
    if (!sets) return
    const ex = EXIDX[e.id]
    if (isConditioning(ex) || modeOf({ ...(e.target || {}), id: e.id }) === 'cardio') { warmup += sets; return }
    const m = musclesOf(ex)
    for (const slug in m) load[slug] = (load[slug] || 0) + m[slug] * sets
  }))
  const weeks = Math.max(1, days) / 7
  const rows = MUSCLES.map(m => ({ m, sets: round1((load[m] || 0) / weeks) }))
  return {
    workouts: ws.length, warmup, days,
    ready: ws.length >= MIN_COVER_WORKOUTS,
    worked: rows.filter(r => r.sets > 0).sort((a, b) => b.sets - a.sets),
    missed: rows.filter(r => !r.sets).map(r => r.m)
  }
}
