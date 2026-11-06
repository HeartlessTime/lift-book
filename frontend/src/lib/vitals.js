// Health dashboard maths — pure, no React, so it is tested on its own (vitals.test.js).
//
// Inputs: the vitals days from GET /api/vitals ({ 'YYYY-MM-DD': { steps, rhr, ... } }), the
// profile's own S.bodyweight, and S.workouts for the lifts. Output: chart series per range and
// the plain-language highlight lines.
import { isoOf } from './format.js'
import { exOr } from './exercises.js'
import { exerciseNeeds } from './gear.js'

// Apple Health's category colours (system colours, light / dark).
export const CATS = {
  heart: { light: '#ff2d55', dark: '#ff375f', icon: 'heart', name: 'Heart' },
  activity: { light: '#ff9500', dark: '#ff9f0a', icon: 'flame', name: 'Activity' },
  body: { light: '#af52de', dark: '#bf5af2', icon: 'scale', name: 'Body measurements' },
  fitness: { light: '#34c759', dark: '#30d158', icon: 'bolt', name: 'Cardio fitness' },
  strength: { light: '#007aff', dark: '#0a84ff', icon: 'barbell', name: 'Strength' }
}

// kind: sum = a daily total (bars, headline is the daily average); avg = a reading (dots/line,
// headline is the average); range = heart rate's min-max band.
// better: which way is good news, for the highlight wording. 0 = neither.
export const METRICS = {
  weight: { label: 'Weight', cat: 'body', kind: 'avg', chart: 'line', dp: 1, better: 0 },
  rhr: { label: 'Resting heart rate', short: 'resting heart rate', cat: 'heart', unit: 'bpm', kind: 'avg', chart: 'line', dp: 0, better: -1 },
  hrv: { label: 'Heart rate variability', short: 'HRV', cat: 'heart', unit: 'ms', kind: 'avg', chart: 'line', dp: 0, better: 1 },
  vo2: { label: 'Cardio fitness', short: 'VO2 max', cat: 'fitness', unit: 'VO2 max', kind: 'avg', chart: 'line', dp: 1, better: 1 },
  steps: { label: 'Steps', short: 'steps', cat: 'activity', unit: 'steps', kind: 'sum', chart: 'bar', dp: 0, better: 1 },
  active: { label: 'Active energy', short: 'active energy', cat: 'activity', unit: 'kcal', kind: 'sum', chart: 'bar', dp: 0, better: 1 },
  exercise: { label: 'Exercise minutes', short: 'exercise', cat: 'activity', unit: 'min', kind: 'sum', chart: 'bar', dp: 0, better: 1 },
  hr: { label: 'Heart rate', cat: 'heart', unit: 'bpm', kind: 'range', chart: 'band', dp: 0, better: 0 }
}
export const FAVOURITES = ['weight', 'rhr', 'hrv', 'vo2', 'steps']
export const MORE = ['active', 'exercise', 'hr']
export const RANGES = ['D', 'W', 'M', '6M', 'Y']

export const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const avg = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
export const roundTo = (v, dp) => (v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp)

// One value per day for a metric, as [{ d, v }] (or { d, lo, hi } for heart rate), oldest first.
export function daily(key, days, bodyweight) {
  if (key === 'weight') return (bodyweight || []).filter(b => b && b.d && b.w > 0).map(b => ({ d: b.d, v: b.w }))
  const out = []
  for (const d of Object.keys(days || {}).sort()) {
    const r = days[d]
    if (key === 'hr') { if (r.hrMin > 0 && r.hrMax > 0) out.push({ d, lo: r.hrMin, hi: r.hrMax, v: r.hrAvg ?? (r.hrMin + r.hrMax) / 2 }) }
    else if (typeof r[key] === 'number') out.push({ d, v: r[key] })
  }
  return out
}

const monthKey = iso => iso.slice(0, 7)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Buckets for a range, ending today. Each bucket: { key, label, from, to, v, lo, hi, n }.
// D = 24 hours of today (sum metrics and heart rate only; readings show the day's one value),
// W = 7 days, M = 30 days, 6M = 26 weeks, Y = 12 months. Bucket values are the day values'
// average (Apple's "daily average" for a week or month), or min/max for heart rate.
export function series(key, range, days, bodyweight, today) {
  const m = METRICS[key]
  const pts = daily(key, days, bodyweight)
  const byDay = Object.fromEntries(pts.map(p => [p.d, p]))
  const fold = (b, list) => {
    if (!list.length) return { ...b, v: null, n: 0 }
    if (m.kind === 'range') return { ...b, lo: Math.min(...list.map(p => p.lo)), hi: Math.max(...list.map(p => p.hi)), v: avg(list.map(p => p.v)), n: list.length }
    return { ...b, v: avg(list.map(p => p.v)), n: list.length }
  }
  if (range === 'D') {
    const h = days?.[today]?.h || []
    if (m.kind === 'sum' && (key === 'steps' || key === 'active')) {
      return Array.from({ length: 24 }, (_, i) => {
        const c = h.find(x => x.h === i)
        return { key: today + 'T' + i, label: i % 6 === 0 ? (i === 0 ? '12a' : i === 12 ? '12p' : (i % 12) + (i < 12 ? 'a' : 'p')) : '', from: today, to: today, v: c && c[key] != null ? c[key] : null, n: c ? 1 : 0 }
      })
    }
    if (m.kind === 'range') {
      return Array.from({ length: 24 }, (_, i) => {
        const c = h.find(x => x.h === i)
        return c && c.hrMin ? { key: today + 'T' + i, label: i % 6 === 0 ? String(i) : '', from: today, to: today, lo: c.hrMin, hi: c.hrMax, v: (c.hrMin + c.hrMax) / 2, n: 1 }
          : { key: today + 'T' + i, label: i % 6 === 0 ? String(i) : '', from: today, to: today, v: null, n: 0 }
      })
    }
    const p = byDay[today]
    return [p ? { key: today, label: 'Today', from: today, to: today, ...p, n: 1 } : { key: today, label: 'Today', from: today, to: today, v: null, n: 0 }]
  }
  if (range === 'W' || range === 'M') {
    const n = range === 'W' ? 7 : 30
    return Array.from({ length: n }, (_, i) => {
      const d = addDays(today, i - n + 1)
      const dt = new Date(d + 'T12:00:00')
      const label = range === 'W' ? DOW[dt.getDay()] : (i % 7 === (n - 1) % 7 ? String(dt.getDate()) : '')
      return fold({ key: d, label, from: d, to: d }, byDay[d] ? [byDay[d]] : [])
    })
  }
  if (range === '6M') {
    return Array.from({ length: 26 }, (_, i) => {
      const to = addDays(today, -7 * (25 - i)), from = addDays(to, -6)
      const dt = new Date(from + 'T12:00:00')
      const label = dt.getDate() <= 7 ? MON[dt.getMonth()] : ''
      return fold({ key: from, label, from, to }, pts.filter(p => p.d >= from && p.d <= to))
    })
  }
  // Y
  const end = new Date(today + 'T12:00:00')
  return Array.from({ length: 12 }, (_, i) => {
    const dt = new Date(end.getFullYear(), end.getMonth() - 11 + i, 1, 12)
    const k = isoOf(dt).slice(0, 7)
    return fold({ key: k, label: MON[dt.getMonth()][0], from: k + '-01', to: k + '-31' }, pts.filter(p => monthKey(p.d) === k))
  })
}

// The big number above a chart: average (or total for one day), or a min–max range.
export function headline(key, buckets, range) {
  const m = METRICS[key]
  const have = buckets.filter(b => b.v != null)
  if (!have.length) return null
  if (m.kind === 'range') return { kind: 'range', lo: Math.min(...have.map(b => b.lo)), hi: Math.max(...have.map(b => b.hi)) }
  if (m.kind === 'sum' && range === 'D') return { kind: 'total', v: have.reduce((a, b) => a + b.v, 0) }
  return { kind: m.kind === 'sum' ? 'daily' : 'avg', v: avg(have.map(b => b.v)) }
}

// Latest value + when, for a Summary card.
export function latestOf(key, days, bodyweight) {
  const pts = daily(key, days, bodyweight)
  return pts.length ? pts[pts.length - 1] : null
}

// Mean of a metric's day values between two dates (inclusive).
export function meanBetween(key, days, bodyweight, from, to) {
  const xs = daily(key, days, bodyweight).filter(p => p.d >= from && p.d <= to).map(p => p.v)
  return { v: avg(xs), n: xs.length }
}

const fmtV = (v, dp) => roundTo(v, dp).toLocaleString()

// "Your resting heart rate averaged 58 bpm this week, 3 lower than the month before."
// Compares the last 7 days against the 30 days before them. Returns null without enough data.
export function trendOf(key, days, bodyweight, today, unitOverride) {
  const m = METRICS[key]
  const unit = unitOverride || m.unit
  const wk = meanBetween(key, days, bodyweight, addDays(today, -6), today)
  const base = meanBetween(key, days, bodyweight, addDays(today, -36), addDays(today, -7))
  const minWk = key === 'vo2' || key === 'weight' ? 1 : 3
  if (wk.n < minWk || base.n < minWk) return null
  const diff = wk.v - base.v
  const rel = base.v ? Math.abs(diff) / Math.abs(base.v) : 0
  const step = 10 ** -m.dp
  const name = key === 'weight' ? 'weight' : (m.short || m.label.toLowerCase())
  const verb = m.kind === 'sum' ? 'averaged' : 'averaged'
  const per = m.kind === 'sum' ? ' a day' : ''
  const head = `Your ${name} ${verb} ${fmtV(wk.v, m.dp)} ${unit}${per} this week`
  const flat = Math.abs(diff) < step || rel < 0.015
  const text = flat
    ? `${head}, about the same as the month before.`
    : `${head}, ${fmtV(Math.abs(diff), m.dp)} ${diff < 0 ? 'lower' : 'higher'} than the month before.`
  const good = flat || !m.better ? 0 : Math.sign(diff) === m.better ? 1 : -1
  return { key, text, diff, rel: flat ? 0 : rel, good, wk: wk.v, base: base.v }
}

// The top-of-page Highlights: the two or three biggest moves, good or bad.
export function highlights(days, bodyweight, today, unit) {
  const list = ['rhr', 'hrv', 'steps', 'vo2', 'exercise', 'weight', 'active']
    .map(k => trendOf(k, days, bodyweight, today, k === 'weight' ? unit : undefined))
    .filter(Boolean)
  const moved = list.filter(h => h.rel > 0).sort((a, b) => b.rel - a.rel)
  return (moved.length ? moved : list).slice(0, 3)
}

/* ---------------------------------------------------------------- lifts -- */

// Working weight (the owner, 2026-11-03: "show how much my weight has changed in general for
// regular reps instead of showing a 1RM"). A session's working weight is the weight used for most
// of its completed sets (a tie goes to the heavier), with the reps most of those sets got. Sets not
// marked done, warm-ups and zero-weight sets do not count, so a bodyweight lift has none.
// The API (api/vitals.js) does the same sum for Vitals; keep the two in step.
export function workingSet(sets) {
  const ok = (sets || []).filter(s => s && s.done && !s.warm && !s.warmup && Number(s.w) > 0 && Math.round(Number(s.r)) >= 1)
  if (!ok.length) return null
  const modeOf = xs => {
    const n = new Map()
    for (const x of xs) n.set(x, (n.get(x) || 0) + 1)
    return [...n].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]))[0][0]
  }
  const w = modeOf(ok.map(s => Number(s.w)))
  const r = modeOf(ok.filter(s => Number(s.w) === w).map(s => Math.round(Number(s.r))))
  return { w, r }
}

// One point per session that has a working weight, oldest first.
export function workingSeries(S, exId) {
  const pts = []
  for (const w of [...(S.workouts || [])].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.start || 0) - (b.start || 0)))) {
    const e = (w.entries || []).find(x => x.id === exId)
    const ws = e && workingSet(e.sets)
    if (ws) pts.push({ d: w.d, t: w.start, y: ws.w, w: ws.w, r: ws.r })
  }
  return pts
}

// The change: the latest session against the latest one on or before 30 days ago (or the first
// session, for a shorter history). delta null = only one session so far. `since` is the date it is
// measured from; when nothing changed it runs back to the first session of the unbroken run at
// that weight ("No change since Sep 10").
export function workingChange(pts, today) {
  if (!pts.length) return { delta: null, since: null }
  const last = pts[pts.length - 1], monthAgo = addDays(today, -30)
  let i = pts.length - 1
  while (i >= 0 && pts[i].d > monthAgo) i--
  if (i < 0) i = 0
  if (i === pts.length - 1) return { delta: null, since: null }
  const delta = Math.round((last.w - pts[i].w) * 10) / 10
  if (delta === 0) while (i > 0 && pts[i - 1].w === last.w) i--
  return { delta, since: pts[i].d }
}

// Main lifts: the big compounds (gear.js `heavy`: presses, squats, rows, pulldowns, deadlifts)
// first, most-trained in the last 90 days, the heavier working weight breaking a tie. Isolation
// work (cable lateral raises, flyes, curls) only fills in after every compound, so a lateral raise
// he does every session never heads the card.
const isCompound = (id, S) => { try { return !!exerciseNeeds(id, S).heavy } catch { return false } }
export function mainLifts(S, today, max = 5) {
  const since = addDays(today, -90)
  const count = {}
  for (const w of S.workouts || []) {
    if (w.d < since) continue
    for (const e of w.entries || []) if (workingSet(e.sets)) count[e.id] = (count[e.id] || 0) + 1
  }
  return Object.keys(count).map(id => {
    const pts = workingSeries(S, id)
    if (!pts.length) return null
    const last = pts[pts.length - 1]
    return {
      id, name: exOr(id)?.n || id, pts, w: last.w, r: last.r, d: last.d, sessions: count[id], compound: isCompound(id, S),
      ...workingChange(pts, today)
    }
  }).filter(Boolean)
    .sort((a, b) => (b.compound - a.compound) || (b.sessions - a.sessions) || (b.w - a.w))
    .slice(0, max)
}

// A lift's working weight per bucket for a range: the last session in each bucket (a step line).
export function liftSeries(pts, range, today) {
  const n = { W: 7, M: 30 }[range]
  if (n) {
    return Array.from({ length: n }, (_, i) => {
      const d = addDays(today, i - n + 1)
      const hits = pts.filter(p => p.d === d)
      const dt = new Date(d + 'T12:00:00')
      return { key: d, from: d, to: d, label: range === 'W' ? DOW[dt.getDay()] : (i % 7 === (n - 1) % 7 ? String(dt.getDate()) : ''), v: hits.length ? hits[hits.length - 1].y : null, r: hits.length ? hits[hits.length - 1].r : null }
    })
  }
  const buckets = series('weight', range === 'D' ? 'W' : range, {}, [], today)
  return buckets.map(b => {
    const hits = pts.filter(p => p.d >= b.from && p.d <= b.to)
    return { ...b, v: hits.length ? hits[hits.length - 1].y : null, r: hits.length ? hits[hits.length - 1].r : null }
  })
}
