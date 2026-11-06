// Apple Health -> Lift Book. Runs in the iOS app only (a browser has no HealthKit).
//
// On launch and whenever the app comes back to the front, read the days since the last sync
// (plus three days of overlap, because the watch delivers samples late) and POST them to
// /api/vitals. The server upserts by day, so resending is harmless — which is also why nothing
// here tries to be clever about "what changed".
//
// Every value is keyed by the SAMPLE'S OWN local date, never by "today". A weigh-in from last
// Tuesday is Tuesday's weight even if the app was not opened until Friday (the stale-weight lesson
// from the old Shortcut route).
//
// Body weight goes into the profile's existing S.bodyweight, not into the vitals file, so the
// Stats chart, the coach and the trainer all see it. A day he logged by hand in the app keeps his
// number; Health only fills days that are empty or that Health filled before.
import { NATIVE } from './native.js'
import { api } from './api.js'
import { isoOf, todayISO } from './format.js'
import { exOr } from './exercises.js'
import { authorizeWorkouts } from './watchNative.js'

export const READ_TYPES = [
  'steps', 'calories', 'exerciseTime', 'heartRate', 'restingHeartRate',
  'heartRateVariability', 'vo2Max', 'weight', 'workouts'
]
const LAST_KEY = 'gym_health_sync'       // { day: 'YYYY-MM-DD', at: epoch ms } of the last good sync
const ERR_KEY = 'gym_health_err'         // { error, at } of the last failed one, shown on the Health screen
const MIN_GAP_MS = 10 * 60000            // coming back to the front twice in a minute is not news
const FIRST_DAYS = 400                   // first run: a year of history for the Y view, and some
const OVERLAP_DAYS = 3
const KG_TO_LB = 2.2046226218
const PUSH_KEY = 'gym_health_wpush'      // { 'YYYY-MM-DD': weight } hand weigh-ins already in Health

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const midnight = iso => new Date(iso + 'T00:00:00')
const dayOf = s => isoOf(new Date(s))
const round1 = n => Math.round(n * 10) / 10

function readLast() { try { return JSON.parse(localStorage.getItem(LAST_KEY)) || null } catch { return null } }

let running = null

// Main lifts' display names, so the server-side summary can say "Bench Press" and not "0025".
function liftNames(S) {
  const names = {}
  const since = addDays(todayISO(), -120)
  for (const w of S.workouts || []) {
    if (w.d < since) continue
    for (const e of w.entries || []) if (!names[e.id]) { const n = exOr(e.id)?.n; if (n) names[e.id] = n }
  }
  return names
}

// This app's own bundle id. A Health sample with this source is a hand weigh-in this phone wrote
// (pushWeights); reading it back would resurrect a weigh-in he has since edited or deleted.
export const OWN_SOURCE = 'com.example.liftbook'

// Put Health's weigh-ins into S.bodyweight. Pure, exported for the test.
// `samples` are { startDate, value (kg), sourceId }. The latest sample of each day wins. Samples
// Lift Book wrote itself never come back in (no loop).
export function mergeHealthWeights(bodyweight, samples, unit) {
  const perDay = {}
  for (const s of samples || []) {
    const t = Date.parse(s.startDate)
    if (!Number.isFinite(t) || !(s.value > 0) || s.sourceId === OWN_SOURCE) continue
    const d = dayOf(t)
    if (!perDay[d] || perDay[d].t < t) perDay[d] = { t, kg: s.value }
  }
  const out = [...(bodyweight || [])]
  let changed = 0
  for (const [d, { t, kg }] of Object.entries(perDay)) {
    const w = round1(unit === 'kg' ? kg : kg * KG_TO_LB)
    if (w < 40 || w > 700) continue
    const i = out.findIndex(b => b.d === d)
    if (i >= 0 && out[i].src !== 'health') continue             // his own entry stands
    if (i >= 0 && out[i].w === w) continue
    const row = { d, w, t, src: 'health' }
    if (i >= 0) out[i] = row; else out.push(row)
    changed++
  }
  out.sort((a, b) => (a.d < b.d ? -1 : 1))
  return { bodyweight: out, changed }
}

// Lift Book -> Apple Health: the weigh-ins he typed in by hand that Health does not have yet.
// Pure, exported for the test. `bodyweight` rows tagged src 'health' came FROM Health and are
// never sent back (no loop). A day Health already holds within a quarter pound of his number,
// from any source (his scale, or this app last time), counts as there. `pushed` is the
// { day: weight } record of what this phone already wrote, so an unchanged row is never re-sent.
// Returns { push: [{ d, w, kg, at }], seen: { day: weight } } where `seen` should be merged into
// `pushed` once the writes succeed.
export function weightsToPush(bodyweight, samples, unit, pushed = {}, sinceDay = '0000-00-00') {
  const lbOf = kg => (unit === 'kg' ? kg : kg * KG_TO_LB)
  const health = {}
  for (const s of samples || []) {
    const t = Date.parse(s.startDate)
    if (!Number.isFinite(t) || !(s.value > 0)) continue
    ;(health[dayOf(t)] = health[dayOf(t)] || []).push(lbOf(s.value))
  }
  const push = [], seen = {}
  for (const b of bodyweight || []) {
    if (!b || b.src === 'health' || !(b.w > 0) || !b.d || b.d < sinceDay) continue
    if (pushed[b.d] === b.w) continue
    const tol = unit === 'kg' ? 0.11 : 0.25
    if ((health[b.d] || []).some(v => Math.abs(v - b.w) <= tol)) { seen[b.d] = b.w; continue }
    const at = b.t && dayOf(b.t) === b.d ? b.t : new Date(b.d + 'T08:00:00').getTime()
    push.push({ d: b.d, w: b.w, kg: Math.round((unit === 'kg' ? b.w : b.w / KG_TO_LB) * 1000) / 1000, at })
    seen[b.d] = b.w
  }
  return { push, seen }
}

// Fold the plugin's raw answers into one row per day. Pure, exported for the test.
export function buildDays({ steps = [], calories = [], rhr = [], hr = [], hrv = [], vo2 = [], exercise = [], hours = {} }) {
  const days = {}
  const row = d => (days[d] = days[d] || { d })
  for (const s of steps) if (s.value > 0) row(dayOf(s.startDate)).steps = Math.round(s.value)
  for (const s of calories) if (s.value > 0) row(dayOf(s.startDate)).active = Math.round(s.value)
  for (const s of rhr) if (s.value > 0) row(dayOf(s.startDate)).rhr = round1(s.value)
  for (const s of hr) {
    const v = s.values || {}
    if (!(v.average > 0)) continue
    const r = row(dayOf(s.startDate))
    r.hrAvg = round1(v.average); if (v.min > 0) r.hrMin = round1(v.min); if (v.max > 0) r.hrMax = round1(v.max)
  }
  // Discrete samples (HRV, VO2 max): average of the day's readings.
  const avgInto = (list, key) => {
    const acc = {}
    for (const s of list) if (s.value > 0) { const d = dayOf(s.startDate); (acc[d] = acc[d] || []).push(s.value) }
    for (const [d, xs] of Object.entries(acc)) row(d)[key] = round1(xs.reduce((a, b) => a + b, 0) / xs.length)
  }
  avgInto(hrv, 'hrv')
  avgInto(vo2, 'vo2')
  // Exercise minutes arrive as many small samples; only the watch writes them, so a sum is right.
  const ex = {}
  for (const s of exercise) if (s.value > 0) { const d = dayOf(s.startDate); ex[d] = (ex[d] || 0) + s.value }
  for (const [d, m] of Object.entries(ex)) row(d).exercise = Math.round(m)
  // Hourly detail for the D view (today and yesterday only).
  for (const [d, list] of Object.entries(hours)) if (list.length) row(d).h = list
  return Object.values(days).sort((a, b) => (a.d < b.d ? -1 : 1))
}

function buildHours({ steps = [], calories = [], hr = [] }) {
  const out = {}
  const cell = (s) => {
    const dt = new Date(s.startDate), d = isoOf(dt), h = dt.getHours()
    const list = (out[d] = out[d] || [])
    let c = list.find(x => x.h === h)
    if (!c) { c = { h }; list.push(c) }
    return c
  }
  for (const s of steps) if (s.value > 0) cell(s).steps = Math.round(s.value)
  for (const s of calories) if (s.value > 0) cell(s).active = Math.round(s.value)
  for (const s of hr) { const v = s.values || {}; if (v.min > 0 && v.max > 0) { const c = cell(s); c.hrMin = round1(v.min); c.hrMax = round1(v.max) } }
  for (const list of Object.values(out)) list.sort((a, b) => a.h - b.h)
  return out
}

function toWorkout(w) {
  if (!w.platformId) return null
  return {
    id: w.platformId, type: w.workoutType, start: w.startDate, end: w.endDate, d: dayOf(w.startDate),
    dur: w.duration, kcal: w.totalEnergyBurned, dist: w.totalDistance, src: w.sourceName
  }
}

// `getS` / `update` are the store's, passed in so this file never imports the store (it is
// imported by the store's consumers, and a cycle there has bitten before).
export function syncHealth({ getS, update, force = false } = {}) {
  if (!NATIVE) return Promise.resolve({ skipped: 'not native' })
  if (running) return running
  const last = readLast()
  if (!force && last && Date.now() - last.at < MIN_GAP_MS) return Promise.resolve({ skipped: 'recent' })
  running = (async () => {
    const { Health } = await import('@capgo/capacitor-health')
    const av = await Health.isAvailable()
    if (!av.available) return { skipped: av.reason || 'unavailable' }
    // iOS shows the permission sheet the first time and answers silently after that. HealthKit
    // never says whether READ access was granted (privacy), so a denial just reads as no data.
    // Build 46 also writes: workouts (the watch / phone fallback) and his hand weigh-ins.
    await authorizeWorkouts()
    await Health.requestAuthorization({ read: READ_TYPES, write: ['weight'] })

    const today = todayISO()
    const from = last?.day ? addDays(last.day, -OVERLAP_DAYS) : addDays(today, -FIRST_DAYS)
    const startDate = midnight(from).toISOString()
    const endDate = new Date().toISOString()
    const hourStart = midnight(addDays(today, -1)).toISOString()

    const q = async (fn) => { try { return await fn() } catch (e) { console.log('health: query failed', e?.message || e); return null } }
    const agg = (dataType, aggregation, bucket = 'day', start = startDate) =>
      q(() => Health.queryAggregated({ dataType, startDate: start, endDate, bucket, aggregation })).then(r => r?.samples || [])
    const samples = (dataType, limit) =>
      q(() => Health.readSamples({ dataType, startDate, endDate, limit, ascending: true })).then(r => r?.samples || [])

    const [steps, calories, rhr, hr, hrv, vo2, exercise, weight, hSteps, hCal, hHr, wk] = await Promise.all([
      agg('steps', 'sum'), agg('calories', 'sum'), agg('restingHeartRate', 'average'),
      agg('heartRate', ['average', 'min', 'max']),
      samples('heartRateVariability', 20000), samples('vo2Max', 2000), samples('exerciseTime', 200000),
      samples('weight', 5000),
      agg('steps', 'sum', 'hour', hourStart), agg('calories', 'sum', 'hour', hourStart),
      agg('heartRate', ['min', 'max'], 'hour', hourStart),
      q(() => Health.queryWorkouts({ startDate, endDate, limit: 1000, ascending: true })).then(r => r?.workouts || [])
    ])

    const days = buildDays({ steps, calories, rhr, hr, hrv, vo2, exercise, hours: buildHours({ steps: hSteps, calories: hCal, hr: hHr }) })
    const workouts = wk.map(toWorkout).filter(Boolean)
    const S = getS ? getS() : null
    let sent = 0
    for (let i = 0; i < Math.max(days.length, 1); i += 200) {
      const r = await api('/api/vitals', {
        method: 'POST',
        body: JSON.stringify({ days: days.slice(i, i + 200), workouts: i === 0 ? workouts : [], liftNames: i === 0 && S ? liftNames(S) : {} })
      })
      sent += r.days || 0
    }
    let weights = 0
    if (S && update && weight.length) {
      const { changed } = mergeHealthWeights(S.bodyweight, weight, S.unit)
      if (changed) {
        update(s => { const r = mergeHealthWeights(s.bodyweight, weight, s.unit); s.bodyweight = r.bodyweight })
        weights = changed
      }
    }
    const wrote = S ? await pushWeights(Health, useStoreS(getS), weight, q, today) : 0
    try { localStorage.setItem(LAST_KEY, JSON.stringify({ day: today, at: Date.now() })) } catch {}
    try { localStorage.removeItem(ERR_KEY) } catch {}
    console.log(`health: synced ${sent} days, ${workouts.length} workouts, ${weights} weigh-ins from ${from}, wrote ${wrote} weigh-ins`)
    return { days: sent, workouts: workouts.length, weights, wrote }
  })().catch(e => {
    const error = String(e?.message || e)
    console.log('health: sync failed', error)
    try { localStorage.setItem(ERR_KEY, JSON.stringify({ error, at: Date.now() })) } catch {}
    return { error }
  })
    .finally(() => { running = null })
  return running
}

const useStoreS = getS => (getS ? getS() : null)

// Writes the hand weigh-ins Health lacks. The first run looks back a full year (and reads that
// year of Health weights to de-duplicate against); after that, only the sync window.
async function pushWeights(Health, S, recent, q, today) {
  if (!S) return 0
  let pushed = null
  try { pushed = JSON.parse(localStorage.getItem(PUSH_KEY)) } catch {}
  let samples = recent, since = addDays(today, -(OVERLAP_DAYS + 1))
  if (!pushed) {
    since = addDays(today, -FIRST_DAYS)
    const r = await q(() => Health.readSamples({ dataType: 'weight', startDate: midnight(since).toISOString(), endDate: new Date().toISOString(), limit: 5000, ascending: true }))
    if (!r) return 0                         // could not read Health, so cannot de-duplicate: wait
    samples = r.samples || []
    pushed = {}
  }
  const { push, seen } = weightsToPush(S.bodyweight, samples, S.unit, pushed, since)
  let n = 0
  for (const p of push) {
    try {
      await Health.saveSample({ dataType: 'weight', value: p.kg, unit: 'kilogram', startDate: new Date(p.at).toISOString(), endDate: new Date(p.at).toISOString(), metadata: { liftbook: 'hand-logged' } })
      n++
    } catch (e) { console.log('health: weight write failed', e?.message || e); delete seen[p.d] }
  }
  try { localStorage.setItem(PUSH_KEY, JSON.stringify({ ...pushed, ...seen })) } catch {}
  return n
}

// The last sync failure, if the most recent attempt failed. Without the HealthKit entitlement
// (the App ID has to carry the capability) every attempt fails with "Missing
// com.apple.developer.healthkit entitlement", which is worth saying on screen.
export function lastHealthError() {
  try { return JSON.parse(localStorage.getItem(ERR_KEY))?.error || null } catch { return null }
}
