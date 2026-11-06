#!/usr/bin/env node
// The weekly variety scan (fitness.md rules 10–12): resolve one week of the owner's plan exactly as
// the app will (frontend/src/lib/variety.js weekCheck) and report whether it holds up.
//
//   node scripts/week-check.mjs --state <path> --week this|next|YYYY-MM-DD [--json]
//
// Exit code: 0 = ok, 1 = the week has problems, 2 = bad arguments / unreadable state.
// Read-only: nothing is written, no server is started (Vite's SSR loader in middleware mode, so
// the app's own lib runs unchanged — it reads import.meta.env).
//
// --json prints ONE object (stable shape; fields are only ever added, never renamed):
// {
//   "ok": true,                       // no problems at all
//   "weekStart": "2026-10-26",        // the Monday
//   "days": [{
//     "date": "2026-10-26", "routineId": "mtfullbodya01", "name": "Full Body A",
//     "minutes": 58.8,                // estimate, walk excluded: 3.6 min a set, supersets share the rest
//     "exercises": [{ "id": "0757", "name": "smith incline bench press", "slot": "chest press"|null,
//                     "sg": "ssa"|null (superset group), "sets": 3, "reps": 12, "repsMin": 8,
//                     "side": false (true: reps are the total of both sides), "min": null (cardio minutes),
//                     "mode": "reps"|"time"|"cardio", "load": 190 (lb as logged; 0 = bodyweight) }],
//     "setup": ["Start — ...: load the Smith with 45 + 25 each side (185 lb).", ...],
//     "ok": true, "problems": [{ "exId", "rule", "message" }]   // this session's checkRoutine
//   }],
//   "coverage": { "chest": 2, ..., "side delts": 1, "rear delts": 0, "traps": 1 },  // hits a week
//   "direct": { "biceps": 1, ... },   // lifts whose TARGET is the group
//   "repeats": [{ "exId", "name", "dates": [] }],          // same lift on two different days
//   "sameAsLastWeek": [{ "routineId", "slot", "exId", "name" }],
//   "problems": [{ "rule": "coverage"|"direct"|"repeat"|"rotation"|"time"|<checkRoutine rule>,
//                  "message": "...", "date"?: "...", "exId"?: "..." }]
// }
// Without --json it prints the same as plain text for a human.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FRONT = path.join(ROOT, 'frontend')
const args = process.argv.slice(2)
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const STATE = opt('--state')
const WEEK = opt('--week') || 'this'
const JSON_OUT = args.includes('--json')
const fail = msg => { console.error(msg); process.exit(2) }
if (!STATE) fail('usage: node scripts/week-check.mjs --state <path> --week this|next|YYYY-MM-DD [--json]')

let S
try { S = JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch (e) { fail('Can’t read ' + STATE + ': ' + e.message) }
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
const plus = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const day = WEEK === 'this' ? today : WEEK === 'next' ? plus(today, 7) : /^\d{4}-\d{2}-\d{2}$/.test(WEEK) ? WEEK : fail('--week must be this, next or YYYY-MM-DD')

const { createServer } = await import(path.join(FRONT, 'node_modules', 'vite', 'dist', 'node', 'index.js'))
const vite = await createServer({ root: FRONT, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
const load = p => vite.ssrLoadModule(path.join(FRONT, 'src', 'lib', p))
const { registerCustom } = await load('exercises.js')
const { DEFAULT_GEAR } = await load('gear.js')
const { weekCheck } = await load('variety.js')
registerCustom(S.customEx)
// The app overlays loaded state on its defaults; the fields weekCheck reads need the same.
S = { unit: 'kg', routines: [], week: {}, dayPlan: {}, exWeights: {}, workouts: [], gear: DEFAULT_GEAR, ...S }
const wk = weekCheck(S, day)
await vite.close()

const report = {
  ok: wk.ok, weekStart: wk.weekStart,
  days: wk.days.map(d => ({ date: d.date, routineId: d.routineId, name: d.name, minutes: d.minutes, exercises: d.exercises, setup: d.setup, ok: d.check.ok, problems: d.check.problems })),
  coverage: wk.coverage, direct: wk.direct, repeats: wk.repeats, sameAsLastWeek: wk.sameAsLastWeek, problems: wk.problems
}
if (JSON_OUT) { console.log(JSON.stringify(report, null, 2)); process.exit(wk.ok ? 0 : 1) }

const out = [`Week of ${wk.weekStart}: ${wk.ok ? 'ok' : wk.problems.length + ' problem' + (wk.problems.length === 1 ? '' : 's')}`]
report.days.forEach(d => {
  out.push(`\n${d.date} ${d.name} · about ${d.minutes} min`)
  d.exercises.forEach(e => {
    if (e.mode === 'cardio') { out.push(`  walk ${e.min || ''} min (optional)`); return }
    const reps = e.mode === 'time' ? 'timed' : e.side ? `${e.repsMin / 2}–${e.reps / 2}/side` : `${e.repsMin || e.reps}–${e.reps}`
    out.push(`  ${e.sg ? '[superset] ' : ''}${e.name} · ${e.sets} x ${reps} · ${e.load > 0 ? e.load + ' lb' : 'bodyweight'}`)
  })
})
out.push('\nHits this week: ' + Object.entries(report.coverage).map(([g, n]) => `${g} ${n}`).join(', '))
if (report.problems.length) { out.push('\nProblems:'); report.problems.forEach(p => out.push('  - ' + p.message)) }
console.log(out.join('\n'))
process.exit(wk.ok ? 0 : 1)
