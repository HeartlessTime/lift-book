// Pure helpers over the state object S (ported 1:1 from the vanilla app).
import { todayISO, isoOf, weekKey, fmtNum, uid } from './format.js'
import { isCardio, isBodyweightEq } from './exercises.js'
import { t } from './i18n.js'

// How an exercise is logged (issue #16). This used to be derived from the body part alone,
// which meant a plank or a farmer's carry could only be timed by filing it under cardio.
// A routine entry can now say so explicitly:
//   reps   — weight × reps      sets look like { w, r }
//   time   — a work duration    sets look like { sec, w }   (w = 0 for bodyweight)
//   cardio — a treadmill walk   sets look like { min, dist, vft }
// An entry without `mode` behaves exactly as before, so every existing plan, workout and
// plan file is read unchanged and nothing needs migrating.
export function modeOf(cfg) {
  const m = cfg && cfg.mode
  if (m === 'reps' || m === 'time' || m === 'cardio') return m
  return isCardio(cfg && cfg.id) ? 'cardio' : 'reps'
}
export const isTimed = cfg => modeOf(cfg) === 'time'

// Two flags that ride on top of a mode rather than making new ones (issues #31/#32), because
// "bodyweight" and "per side" are true of a rep set and of a timed hold alike:
//   bodyweight — the exercise carries no load of its own, so `w` means *added* weight and is
//                asked for only once you say there is some. Seeded from the equipment field.
//                Spelled out rather than `bw`, which a workout already uses for the weigh-in
//                it was logged at — two different things one letter apart is a bug waiting.
//   side       — the exercise is unilateral. You still log what you did: 16, the total across
//                both sides. The split is derived for planning ("8 per side"), never entered
//                — a number that sometimes means one side and sometimes both is the thing
//                that made this ambiguous in the first place, and one rep count that always
//                means the same thing beats two that need a legend.
// Both are absent on every plan, workout and backup written before they existed, and absent
// reads as false, so nothing needs migrating.
export const isBw = cfg => (cfg && cfg.bodyweight != null ? !!cfg.bodyweight : isBodyweightEq(cfg && cfg.id))
export const isPerSide = cfg => !!(cfg && cfg.side)
// What one side did, for display only. Half of an odd total is shown as it falls (8.5) rather
// than rounded away: it means the sides were not even, which is worth seeing.
export const sideReps = reps => (reps || 0) / 2
// Unilateral work moves in pairs, so its rep target steps by two — 16, 18, 20 — and a total
// that stayed odd would put a rep on one side and not the other.
export const repStep = cfg => (isPerSide(cfg) ? 2 : 1)

// ---------- cardio units (issue: treadmill logging) ----------
// Cardio numbers are copied off a treadmill console, so they have to be in the units the
// console is showing. The profile's weight unit is the only unit setting there is, and it
// already says which world you live in: lb → miles and vertical feet, kg → km and metres.
export const isImperial = unit => unit !== 'kg'
export const distUnit = unit => (isImperial(unit) ? 'mi' : 'km')
export const vertUnit = unit => (isImperial(unit) ? 'vt ft' : 'vt m')
export const speedUnit = unit => (isImperial(unit) ? 'mph' : 'km/h')
// Average speed is derived, never typed — distance ÷ time is the pace actually held, and it
// is one fewer number to copy, and it comes out in the profile's own units because the
// distance was entered in them. Sets logged before distance existed keep their own `speed`,
// which the stepper that wrote it only ever spoke in km/h: that stored number is converted
// to whatever the profile shows now, at display time. The row itself is never rewritten —
// 8 stays 8 on disk and reads as "5 mph" on a lb profile.
const MI_PER_KM = 0.621371
export const speedOf = (s, unit) => (s && s.dist > 0 && s.min > 0
  ? Math.round((s.dist / (s.min / 60)) * 10) / 10
  : Math.round(((s && s.speed) || 0) * (isImperial(unit) ? MI_PER_KM : 1) * 10) / 10)
// Climb is the number the owner actually wants out of a warm-up walk, so it is what a cardio
// set is summarised by. It is read straight off the console rather than computed from an
// incline: the console knows what the incline was doing minute to minute and a single
// typed grade does not.
export const vertOf = s => (s && s.vft) || 0

// mm:ss for a work duration — seconds alone read badly past a minute ("90 s" vs "1:30").
export function fmtSec(sec) {
  const n = Math.max(0, Math.round(Number(sec) || 0))
  return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0')
}

// How hard a set felt, if the profile logs it at all. Two scales for the same thing, kept in
// their own fields: RIR counts the reps still in the tank, RPE reads the same effort off a
// 10-point scale from the top (RPE 8 ≈ RIR 2). A set logged on one scale is never silently
// rewritten as the other — switching the setting changes what new sets ask for, nothing else.
// `min`..`max` is the range the stepper walks. RIR bottoms out at 0 (a set taken to failure);
// RPE bottoms out at 6, since the scale is only meaningful for working sets and anything
// lighter is a warm-up nobody rates.
export const EFFORT = {
  rir: { f: 'rir', hd: 'RIR', step: 0.5, min: 0, max: 10 },
  rpe: { f: 'rpe', hd: 'RPE', step: 0.5, min: 6, max: 10 }
}
// One tap of an effort stepper. Empty is not 0 — an unlogged effort must not become "went to
// failure" from one stray tap — so − on an empty cell leaves it empty, and + starts at the
// bottom of the scale and walks up from there in even steps. Stepping back off the bottom
// clears the cell again, so a mistap is undoable. null means "nothing logged"; the caller
// stores that by dropping the key rather than writing a null.
export function stepEffort(kind, cur, dir) {
  const e = EFFORT[kind]
  if (!e) return cur ?? null
  if (cur == null) return dir < 0 ? null : e.min
  const n = Math.round((cur + dir * e.step) * 100) / 100
  if (dir < 0 && n < e.min) return null
  // only the ceiling is enforced on the way up: a value typed below the floor (nothing stops
  // someone entering RPE 3) still steps in even increments instead of snapping to the floor.
  return dir > 0 ? Math.min(e.max, n) : Math.max(e.min, n)
}
// A typed effort is capped but not floored — clamping up while someone types "10" would turn
// the first keystroke into the floor and fight the input.
export const capEffort = (kind, v) =>
  (v == null || !EFFORT[kind] ? v : Math.min(EFFORT[kind].max, v))
// Which scale a profile logs. `showRir` is the boolean this replaced and is only consulted
// when the profile has no answer of its own — an explicit 'none' has to win over it, or a
// backup or another device that still carries the old flag would switch the column back on.
export const effortOf = S => {
  const e = S && S.effort
  return e === 'none' || EFFORT[e] ? e : (S && S.showRir ? 'rir' : 'none')
}
// The "(RIR 2)" / "(RPE 8)" tail on a set summary, empty when nothing was logged.
const effortTail = s => {
  const k = s.rir != null ? 'rir' : s.rpe != null ? 'rpe' : null
  return k ? ` (${EFFORT[k].hd} ${fmtNum(s[k])})` : ''
}

// A logged walk reads as the three numbers off the console, in that order: how long, how
// far, how much climb. Distance and climb are dropped when they were not logged, so a set
// recorded before this existed still reads as "20 min @ 8 km/h" rather than sprouting zeros.
export function cardioLabel(s, unit) {
  const min = `${(s && s.min) || 0} min`
  const parts = []
  if (s && s.dist > 0) parts.push(`${fmtNum(s.dist)} ${distUnit(unit)}`)
  if (s && s.vft > 0) parts.push(`${fmtNum(s.vft)} ${vertUnit(unit)}`)
  // Only a set that actually carries a `speed` gets the old shape — those are the sets
  // written before distance existed, and they keep reading exactly as they always did.
  // A modern walk ticked off without a distance has one true number, the duration, and
  // "10 min @ 0 mph" would be a pace nobody held and nobody typed.
  if (!parts.length && s && s.speed > 0) return `${min} @ ${fmtNum(speedOf(s, unit))} ${speedUnit(unit)}`
  return [min, ...parts].join(' · ')
}
// One-line summary of a logged set. `cfg` carries the mode when the caller has it (a routine
// entry or a workout entry); passing an id alone keeps the old body-part behaviour.
export function setLabel(id, s, cfg, unit) {
  const c = cfg || { id }
  const mode = modeOf(c)
  if (mode === 'cardio') return cardioLabel(s, unit)
  if (mode === 'time') return fmtSec(s.sec) + (s.w > 0 ? ` · ${fmtNum(s.w)}` : '')
  // Bodyweight reads as what you did — "12", or "+10 × 12" once there is a belt involved —
  // rather than "0×12", which says a set was performed with no weight and means nothing.
  // A per-side set needs no mark here: the number logged is the total, the same as every
  // other set in the app.
  const reps = s.r || 0
  if (isBw({ ...c, id: c.id ?? id })) {
    const load = s.w > 0 ? `+${fmtNum(s.w)} × ` : ''
    return `${load}${reps}` + effortTail(s)
  }
  return `${fmtNum(s.w || 0)}×${reps}` + effortTail(s)
}
// ---------- set timing (recorded, never typed) ----------
// A set ticked off carries `t`: the wall clock at the tick. If the rest timer that followed it
// ran all the way to the buzzer, it also carries `rt`. Both are optional and always will be —
// every workout logged before they existed has neither, and a rest that was skipped never
// buzzed — so each figure is null when it cannot be known, rather than 0 or NaN.
//   rest  — t → rt, the recovery actually taken
//   after — rt → the next set's t: the set itself plus however long you took to start it
//   gap   — t → the next set's t, the whole cycle, and all an untimed workout can ever say
// Seconds, like every other duration in the app. Within one entry only: the rest after an
// exercise's last set runs into a different exercise, which is a different question.
const secsBetween = (a, b) => (a == null || b == null || b < a ? null : Math.round((b - a) / 1000))
export function setTiming(sets, i) {
  const s = sets && sets[i]
  if (!s || s.t == null) return null
  // the next set that was actually logged — an unticked row in the middle is not a rest
  const nt = (sets.slice(i + 1).find(x => x.done && x.t != null) || {}).t
  return { rest: secsBetween(s.t, s.rt), after: secsBetween(s.rt, nt), gap: secsBetween(s.t, nt) }
}

// Default config for a freshly added exercise.
export function defaultConfig(id, mode) {
  const m = mode || modeOf({ id })
  if (m === 'cardio') return { sets: 1, min: 20 }
  // Written only when it is true, so a barbell config is byte-for-byte what it was before
  // the flag existed and a plan file gains nothing it does not need.
  const bw = isBodyweightEq(id) ? { bodyweight: true } : {}
  if (m === 'time') return { sets: 3, sec: 45, weight: 0, mode: 'time', ...bw }
  return { sets: 3, reps: 10, weight: 0, mode: 'reps', ...bw }
}
// One-line summary of a planned exercise ("3 × 10 · 60 kg"), shared by the routine editor
// and the plan export so a mode is described the same way everywhere.
export function exLine(cfg, unit) {
  const mode = modeOf(cfg)
  const n = cfg.sets || 1
  // Added weight reads as added: "+10 kg" on a dip belt, "60 kg" on a barbell.
  const load = cfg.weight ? ' · ' + (isBw(cfg) ? '+' : '') + fmtNum(cfg.weight) + ' ' + unit : ''
  if (mode === 'cardio') return `${n} × ${cfg.min || 20} min`
  if (mode === 'time') return `${n} × ${fmtSec(cfg.sec || 45)}${load}`
  // This is the line with room for it, so the split is spelled out: "3 × 16 · 8/side".
  const split = isPerSide(cfg) ? ' · ' + t('{0}/side', fmtNum(sideReps(cfg.reps))) : ''
  return `${n} × ${cfg.reps}${load}${split}`
}

// Drop superset ids that no longer have an adjacent partner (after unlink/reorder/remove).
// Routine editor moves (mutate `ex`, return src: new index → old index, for the row animation).
// Inside a superset a lift swaps with its partner. Anywhere else a superset moves as one block
// and a lone lift hops over a whole superset, so moving never quietly breaks a pairing; leaving
// a superset is the link button's job.
export function moveInRoutine(ex, i, dir) {
  const units = supersetUnits(ex)
  const ui = units.findIndex(u => u.includes(i))
  const j = i + dir
  if (j < 0 || j >= ex.length) return null
  if (units[ui].includes(j)) {
    ;[ex[i], ex[j]] = [ex[j], ex[i]]
    return k => (k === i ? j : k === j ? i : k)
  }
  const uj = ui + dir
  const order = units.map((u, k) => k).map(k => (k === ui ? uj : k === uj ? ui : k)).flatMap(k => units[k])
  const moved = order.map(k => ex[k])
  ex.splice(0, ex.length, ...moved)
  return k => order[k]
}

// The link button on lift `i` ("superset with the one above"). Linking joins i's whole group
// (it may already have partners below) onto the group above; unlinking splits the group at i,
// so the lifts above and below keep their own pairings: in A+B+C, unlinking B leaves A on its
// own and B+C still a superset.
export function toggleSuperset(ex, i) {
  if (i < 1 || i >= ex.length) return
  const cur = ex[i], prev = ex[i - 1]
  if (cur.sg && prev.sg && cur.sg === prev.sg) {
    const old = cur.sg, gid = 'sg' + uid()
    for (let k = i; k < ex.length && ex[k].sg === old; k++) ex[k].sg = gid
  } else {
    const gid = prev.sg || ('sg' + uid())
    prev.sg = gid
    const old = cur.sg
    for (let k = i; k < ex.length && (k === i || (old && ex[k].sg === old)); k++) ex[k].sg = gid
  }
  cleanupSg(ex)
}

export function cleanupSg(ex) {
  ex.forEach((e, i) => {
    if (e.sg && !(ex[i - 1]?.sg === e.sg || ex[i + 1]?.sg === e.sg)) delete e.sg
  })
}

// A workout can reach here without entries — a hand-edited file, a half-finished import, a
// backup restored from a truncated write. "What did I last note about this?" has an answer
// for such a workout (nothing), so it must not be a crash for every caller behind it.
const entriesOf = w => (w && Array.isArray(w.entries) ? w.entries : [])

export function lastEntryFor(S, exId) {
  for (let i = S.workouts.length - 1; i >= 0; i--) {
    const en = S.workouts[i].entries.find(e => e.id === exId)
    // `target` is what the session prescribed; finished workouts carry it so labels and the
    // progression engine can read a session back the way it was logged. Older workouts have
    // none — modeOf() falls back to the body part for them, which is what they were.
    if (en && en.sets.some(s => s.done)) return { d: S.workouts[i].d, sets: en.sets.filter(s => s.done), target: en.target || null }
  }
  return null
}
// The last thing you wrote about this exercise, and when. Deliberately looser than
// lastEntryFor: that one skips a session whose sets were never ticked, but "shoulder went,
// stopped after one set" is exactly the note you want in front of you next time. A note that
// is only whitespace is no note.
export function lastNoteFor(S, exId) {
  for (let i = S.workouts.length - 1; i >= 0; i--) {
    const en = entriesOf(S.workouts[i]).find(e => e.id === exId)
    const note = en && en.note && en.note.trim()
    if (note) return { d: S.workouts[i].d, note }
  }
  return null
}
export function bestWeightFor(S, exId) {
  let best = 0
  S.workouts.forEach(w => entriesOf(w).forEach(e => {
    if (e.id === exId) {
      e.sets.forEach(s => { if (s.done && s.w > best) best = s.w })
      if (e.topW && e.topW > best) best = e.topW
    }
  }))
  return best
}
// The same rule as bestWeightFor, for every exercise at once. A list screen that asks per row
// walks the whole log once per row; this walks it once.
export function bestWeightMap(S) {
  const out = {}
  S.workouts.forEach(w => entriesOf(w).forEach(e => {
    e.sets.forEach(s => { if (s.done && s.w > (out[e.id] || 0)) out[e.id] = s.w })
    if (e.topW && e.topW > (out[e.id] || 0)) out[e.id] = e.topW
  }))
  return out
}
export function effectiveRoutineId(S, iso) {
  const ov = S.dayPlan[iso]
  if (ov === 'rest') return null
  if (ov && S.routines.some(r => r.id === ov)) return ov
  const wd = new Date(iso + 'T12:00:00').getDay()
  return S.week[wd] || null
}
export function effectiveRoutine(S, iso) {
  const id = effectiveRoutineId(S, iso)
  return id ? S.routines.find(r => r.id === id) || null : null
}

// Moving sessions around the week. A plan is a sequence: miss a day and everything after it
// slides. Every helper here returns a new dayPlan that holds only the days that differ from the
// weekly plan, so a week that slides back into line leaves no overrides behind.
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const dow = iso => new Date(iso + 'T12:00:00').getDay()
function planDay(S, dayPlan, iso, id) {
  if ((id || null) === (S.week[dow(iso)] || null)) delete dayPlan[iso]
  else dayPlan[iso] = id || 'rest'
  return dayPlan
}
export const restDay = (S, iso) => planDay(S, { ...S.dayPlan }, iso, null)
// `id` (null = rest) on one day, nothing else moves: the trainer's "Full Body B today, not C".
export const setPlanDay = (S, iso, id) => planDay(S, { ...S.dayPlan }, iso, id)
// Put `id` (null = rest) on `from` and push every day from there to Sunday back one. Sunday's
// session falls off the end — next week starts clean from the weekly plan — and comes back as
// `dropped` so the caller can say so.
export function slideWeek(S, from, id) {
  const dayPlan = { ...S.dayPlan }, end = addDays(from, (7 - dow(from)) % 7)
  let carry = id || null
  for (let iso = from; iso <= end; iso = addDays(iso, 1)) {
    const was = effectiveRoutineId(S, iso)
    planDay(S, dayPlan, iso, carry)
    carry = was
  }
  return { dayPlan, dropped: carry }
}
// The most recent planned day this week that came and went with nothing logged, and nothing
// logged since — a session trained after it means the week already moved on without it.
export function missedSession(S, today = todayISO()) {
  const done = new Set(S.workouts.map(w => w.d))
  if (done.has(today)) return null
  const monday = addDays(today, -((dow(today) + 6) % 7))
  for (let iso = addDays(today, -1); iso >= monday; iso = addDays(iso, -1)) {
    if (done.has(iso)) return null
    const r = effectiveRoutine(S, iso)
    if (r) return { iso, routine: r }
  }
  return null
}
// The missed session moves to today. With `slide`, today..Sunday shift back one to make room;
// without it only today changes. Either way the missed day (and any empty day since) turns to
// rest, so the same miss is not offered twice.
export function moveMissed(S, miss, today, slide) {
  const r = slide ? slideWeek(S, today, miss.routine.id) : { dayPlan: planDay(S, { ...S.dayPlan }, today, miss.routine.id), dropped: null }
  for (let iso = miss.iso; iso < today; iso = addDays(iso, 1)) planDay(S, r.dayPlan, iso, null)
  return r
}
export function buildSets(S, cfg) {
  const last = lastEntryFor(S, cfg.id)
  const n = Math.max(1, cfg.sets || 1)
  const mode = modeOf(cfg)
  const sets = []
  // Last time's set at the same position, falling back to its final set when the plan grew.
  const prevAt = i => (last ? (last.sets[i] || last.sets[last.sets.length - 1]) : null)

  if (mode === 'cardio') {
    for (let i = 0; i < n; i++) {
      const prev = prevAt(i)
      // Duration is the prescription and carries over; distance and climb are what the
      // console reports afterwards, so they start empty rather than pre-claiming a result.
      sets.push({ min: prev ? prev.min : (cfg.min || 20), dist: 0, vft: 0, done: false })
    }
    return sets
  }
  if (mode === 'time') {
    for (let i = 0; i < n; i++) {
      // Only carry a previous value over when it came from a timed set — switching an
      // exercise from reps to time must not seed the duration from a rep count.
      const prev = prevAt(i)
      const carried = prev && prev.sec > 0 ? prev : null
      sets.push({ sec: carried ? carried.sec : (cfg.sec || 45), w: carried ? (carried.w || 0) : (cfg.weight || 0), done: false })
    }
    return sets
  }
  const conf = S.exWeights[cfg.id]
  for (let i = 0; i < n; i++) {
    const prev = prevAt(i)
    const usable = prev && prev.r > 0 ? prev : null
    const w = conf && conf.w > 0 ? conf.w : (usable ? usable.w : cfg.weight)
    sets.push({ w, r: usable ? usable.r : cfg.reps, done: false })
  }
  return sets
}
export function workoutVolume(w) {
  let v = 0
  // No special case for unilateral work: a per-side set logs its total, so both sides are
  // already in the rep count that arrives here.
  w.entries.forEach(e => e.sets.forEach(s => { if (s.done) v += (s.w || 0) * (s.r || 0) }))
  return v
}
export function setsDone(w) {
  let n = 0
  w.entries.forEach(e => e.sets.forEach(s => { if (s.done) n++ }))
  return n
}
export function setsDoneActive(A) {
  let n = 0
  if (A) A.entries.forEach(e => e.sets.forEach(s => { if (s.done) n++ }))
  return n
}
export const lastBW = S => (S.bodyweight.length ? S.bodyweight[S.bodyweight.length - 1] : null)

// Group consecutive items sharing a superset id (sg) into "units" of indices.
// items may be routine exercises ({sg}) or active-workout entries ({sg}).
export function supersetUnits(items) {
  const units = []
  items.forEach((e, i) => {
    const prev = items[i - 1]
    if (i > 0 && e.sg && prev && prev.sg && e.sg === prev.sg) units[units.length - 1].push(i)
    else units.push([i])
  })
  return units
}
export function unitOf(units, idx) { return units.find(u => u.includes(idx)) || [idx] }

export function streakWeeks(S) {
  if (!S.workouts.length) return 0
  const weeks = new Set(S.workouts.map(w => weekKey(w.d)))
  let streak = 0
  const cur = new Date()
  for (let i = 0; i < 520; i++) {
    const wk = weekKey(isoOf(cur))
    if (weeks.has(wk)) streak++
    else if (i > 0) break
    cur.setDate(cur.getDate() - 7)
  }
  return streak
}
