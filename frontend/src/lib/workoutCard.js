import { exOr } from './exercises.js'
import { supersetUnits, setLabel, setsDoneActive, modeOf, isBw, isPerSide, sideReps, fmtSec, cardioLabel } from './history.js'
import { fmtNum } from './format.js'
import { t } from './i18n.js'

/* The lock-screen workout card, described as data. Pure on purpose: everything the card shows
   and every tap it can make is decided here, where it can be tested, and the native side only
   ever draws it and walks a cursor through it.

   One card for the whole session. It is live from the moment a workout starts until it is
   finished or discarded, and it has three faces: the set to do now, the rest before the next
   one, and "that's everything". See ios/App/RestTimerWidget/ for the card itself. */

// A session left open overnight is not a workout in progress, and neither its card nor its
// index-keyed taps should land on anything. Same horizon the merge has always used.
export const STALE_MS = 12 * 60 * 60 * 1000

// One global rest never fit both a heavy squat and a cable flye. The per-exercise number is an
// override, so anything without one keeps following the single Settings value.
export const restFor = (S, e) => (e && e.target && e.target.rest > 0 ? e.target.rest : S.restSec)

// A set nobody is going to do: ticked off, or skipped from the lock screen. A skipped set stays
// in the session unticked (it did not happen), it just stops being offered as the next thing.
const open = x => x && !x.done && !x.skip

/* What the set asks for, as a lifter reads it off a card: "82.5 lb × 8", "40 lb × 8/side",
   "12 reps", "0:45". Units always shown — this line is read on its own, across a gym, with
   nothing around it to say which units the numbers are in. */
export function setTarget(en, x, unit) {
  const cfg = { ...(en.target || {}), id: en.id }
  const mode = modeOf(cfg)
  if (mode === 'cardio') return cardioLabel(x, unit)
  if (mode === 'time') return fmtSec(x.sec) + (x.w > 0 ? ` · ${fmtNum(x.w)} ${unit}` : '')
  const r = x.r || 0
  const reps = isPerSide(cfg) ? t('{0}/side', fmtNum(sideReps(r))) : String(r)
  if (isBw(cfg)) return x.w > 0 ? `+${fmtNum(x.w)} ${unit} × ${reps}` : (isPerSide(cfg) ? reps : t('{0} reps', r))
  return `${fmtNum(x.w || 0)} ${unit} × ${reps}`
}

/* Everything still to do, in the order it will actually be trained — so `plan[0]` is the set
   up now (or the one a running rest is buying time for). A superset alternates, so this is
   not simply the rows below.

   `draftIdx`/`draft` let the workout ask mid-tick: the set was checked off a line ago and the
   store has not caught up yet.

   `restSec` is the rest the app itself would start once that set is ticked (midRound above):
   between sets, before the next exercise, and once per superset round. The lock screen
   follows the same rule, so the card and the app never disagree about whether he should be
   resting.

   Past the last exercise it wraps round to anything earlier still open: trained out of order
   (a rack taken, a machine busy), those are what is left, and stopping at the end had the card
   announce "Workout complete" over three untouched exercises. */
// The one rest rule, shared by the app and the lock screen so they never disagree: after a set
// of lift `ui` (set index `j`), rest, unless another lift of the same superset still has its set
// of this round (or an earlier one) open, i.e. the round isn't finished. `open` lists the sets
// still to do in that superset as { ui, j }. A lone exercise therefore rests between sets and
// before the next exercise; a superset rests once per round, after whichever lift closes it,
// whatever the set counts and whatever order the sets are ticked in.
export const midRound = (open, ui, j) => open.some(x => x.ui !== ui && x.j <= j)

// What the app should start when set `i` of entry `idx` has just been ticked (`draft` is that
// entry with the tick applied): `{ sec, label }`, sec 0 = no rest. Same answer as the card's
// restSec for that set.
export function restAfterTick(S, idx, i, draft) {
  const A = S.active
  const plan = forwardPlan(S, { draftIdx: idx, draft })
  if (!plan.length) return { sec: 0, label: '', done: true }
  const unit = supersetUnits(A.entries).find(u => u.includes(idx)) || [idx]
  const en = k => (k === idx ? draft : A.entries[k])
  const open = unit.flatMap(k => en(k).sets.map((x, j) => ({ ui: k, j, x })).filter(o => !o.x.done && !o.x.skip))
  if (midRound(open, idx, i)) return { sec: 0, label: '', done: false }
  const nx = plan[0]
  const sameEx = nx.exercise === exOr(draft.id).n
  return {
    sec: Math.max(...unit.map(k => restFor(S, en(k)))),
    label: (!sameEx && !nx.setLine.startsWith(nx.exercise) ? nx.exercise + ' · ' : '') + nx.setLine,
    done: false
  }
}

export function forwardPlan(S, { draftIdx = -1, draft = null } = {}) {
  const A = S && S.active
  if (!A || !A.entries || !A.entries.length) return []
  const units = supersetUnits(A.entries)
  const cur = Math.min(A.cur || 0, A.entries.length - 1)
  const home = Math.max(0, units.findIndex(x => x.includes(cur)))
  const out = []
  for (let k = 0; k < units.length; k++) {
    const unit = units[(home + k) % units.length]
    const rows = unit.map(ui => {
      const en = ui === draftIdx ? draft : A.entries[ui]
      return { ui, en, pending: en ? en.sets.map((x, j) => ({ x, j })).filter(o => open(o.x)) : [] }
    })
    // round by round, because a superset is trained a set of each at a time. The round is the
    // set's own number, not its place among the sets still open: with set 1 of the first lift
    // ticked, set 1 of the second lift is next, not set 2 of the first.
    const order = rows.flatMap((r, ri) => r.pending.map(o => ({ r, o, ri })))
      .sort((a, b) => a.o.j - b.o.j || a.ri - b.ri)
    // A round's rest is the longest any of its lifts asks for.
    const roundRest = Math.max(...unit.map(ui => restFor(S, ui === draftIdx ? draft : A.entries[ui])))
    order.forEach(({ r, o }, k) => {
      const name = exOr(r.en.id).n
      const who = unit.length > 1 ? name + ' · ' : ''
      const later = order.slice(k + 1).map(x => ({ ui: x.r.ui, j: x.o.j }))
      out.push({
        key: r.ui + ':' + o.j,
        exercise: name,
        detail: setTarget(r.en, o.x, S.unit),
        setNo: o.j + 1,
        setOf: r.en.sets.length,
        restSec: midRound(later, r.ui, o.j) ? 0 : roundRest,
        // The in-app rest bar's "Next:" line, and the rest-over notification's body.
        setLine: who + setLabel(r.en.id, o.x, r.en.target, S.unit) + ' · ' + t('set {0} of {1}', o.j + 1, r.en.sets.length)
      })
    })
  }
  // nothing after the very last set, so nothing to rest for
  if (out.length) out[out.length - 1].restSec = 0
  return out
}

// A card only holds what fits on it. Sixty sets is several workouts' worth.
const PLAN_CAP = 60

/* The whole card in one object, or null when there should be no card. The native side stores
   it and renders from it; the web layer re-sends it whenever it changes. Nothing in here
   ticks — the elapsed clock and the rest countdown are dates the system counts itself. */
export function cardSnapshot(S, timer, now = Date.now()) {
  const A = S && S.active
  if (!A || !A.entries) return null
  if (!(A.start > now - STALE_MS)) return null
  return {
    session: A.id,
    routine: A.name || 'Lift Book',
    startedAt: A.start,
    accent: S.accent || 'lime',
    done: setsDoneActive(A),
    total: A.entries.reduce((n, e) => n + e.sets.length, 0),
    plan: forwardPlan(S).slice(0, PLAN_CAP),
    // `total` grows with every ±15s alongside `endsAt`, so this start date holds still and
    // the card's rest bar drains smoothly rather than refilling on each tap.
    rest: timer ? { endsAt: timer.endsAt, startedAt: timer.endsAt - timer.total * 1000 } : null
  }
}

/* Lands the workout on the exercise he was last working on from the lock screen, not on the
   first unfinished thing in it. Those differ the moment anything earlier was left part-done —
   a warm-up never ticked, a set added and not used — and scanning from the top threw him
   backwards to it. In the app a tick never moves him at all; this is the closest honest
   equivalent for taps that happened while he was away. Past the end it wraps the way
   forwardPlan does, so the app opens on the exercise the card was showing. */
function land(A, lastIdx) {
  const units = supersetUnits(A.entries)
  const home = units.findIndex(u => u.includes(lastIdx))
  if (home < 0) return
  const unfinished = u => u.some(ui => A.entries[ui].sets.some(open))
  for (let k = 0; k < units.length; k++) {
    const u = units[(home + k) % units.length]
    if (unfinished(u)) { A.cur = u[0]; return }
  }
  A.cur = units[home][0]   // nothing left anywhere — stay put
}

/* Applies the lock screen's taps to the live session (a draft — mutate freely). Each event
   arrives exactly once, because native empties its queue as it hands it over; this is the
   other half of that guarantee, and it never double-logs even if one did come twice.

   - `done`: the set is logged as planned, at the moment it was tapped.
   - `skip`: the set is left unticked and stops being offered as next.
   Events carry the session they were tapped in, and anything from another session is
   dropped: keys are "entry:set" indices and would land on whatever happens to be at that
   position now. Events queued by a build that did not stamp a session fall back to age. */
export function applyNativeEvents(A, events, now = Date.now()) {
  let done = 0, skipped = 0, lastIdx = -1
  for (const ev of events || []) {
    if (!ev) continue
    if (ev.session ? ev.session !== A.id : !(ev.at > now - STALE_MS)) continue
    const [idx, i] = String(ev.key).split(':').map(Number)
    const x = A.entries[idx] && A.entries[idx].sets[i]
    // Already ticked in the app, or the exercise was removed while he was away — either way
    // there is nothing left to do here.
    if (!x || x.done) continue
    if (ev.kind === 'skip') {
      if (x.skip) continue
      x.skip = true
      skipped++
    } else {
      x.done = true
      x.t = Math.round(ev.at)
      delete x.skip
      done++
    }
    lastIdx = idx
  }
  if (lastIdx >= 0) land(A, lastIdx)
  return { done, skipped }
}
