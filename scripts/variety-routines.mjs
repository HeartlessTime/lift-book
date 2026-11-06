#!/usr/bin/env node
// Rebuild the owner's Full Body A / B / C as SLOT routines (weekly variety, fitness.md rules 10–12,
// 2026-10-19): each movement pattern carries a pool of gear-feasible variants and the app picks
// this week's variant on the device (frontend/src/lib/variety.js). Prints the resolved plan and
// the weekCheck report for the next weeks, and optionally applies it to a state file.
//
//   node scripts/variety-routines.mjs                    # dry run against the live state
//   node scripts/variety-routines.mjs --state <file>     # dry run against another copy
//   node scripts/variety-routines.mjs --weeks 12         # how many weeks to check (default 8)
//   node scripts/variety-routines.mjs --apply [--force]  # write it (backup: <state>.bak-prevariety)
//   node scripts/variety-routines.mjs --out <file>       # write the result to <file> instead
//
// The routine ids (mtfullbodya01/b01/c01) are reused, so the weekly plan, the workout history and
// anything that points at them keeps working. Nothing in the workout log is touched.
//
// Applying: the app pulls the server copy at launch and (from build 24) whenever it comes back to
// the foreground, before pushing. --apply still refuses when the state was written in the last
// 30 minutes (he may be mid-workout) unless --force.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FRONT = path.join(ROOT, 'frontend')
const args = process.argv.slice(2)
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const STATE = opt('--state') || path.join(ROOT, 'data', 'state-mzUn1bXuRIUtpv6k.json')
const APPLY = args.includes('--apply')
const FORCE = args.includes('--force')
const OUT = opt('--out')
const WEEKS = +(opt('--weeks') || 8)
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
const SINCE = opt('--since') || TODAY

const { createServer } = await import(path.join(FRONT, 'node_modules', 'vite', 'dist', 'node', 'index.js'))
const vite = await createServer({ root: FRONT, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
const load = p => vite.ssrLoadModule(path.join(FRONT, 'src', 'lib', p))
const { DEFAULT_GEAR, exerciseNeeds } = await load('gear.js')
const { registerCustom } = await load('exercises.js')
const { weekCheck, mondayOf } = await load('variety.js')
const { SLOT_ROUTINES } = await load('variety-plan.js')

const S0 = JSON.parse(fs.readFileSync(STATE, 'utf8'))
registerCustom(S0.customEx)
const routines = SLOT_ROUTINES(SINCE)

// Every pool member has to exist and be doable on his gear before anything else is looked at.
const S = JSON.parse(JSON.stringify(S0))
if (!S.gear) S.gear = JSON.parse(JSON.stringify(DEFAULT_GEAR))
const bad = []
routines.forEach(r => r.ex.forEach(e => (e.pool || [e.id]).forEach(id => { const n = exerciseNeeds(id, S); if (!n.feasible) bad.push(r.name + ' / ' + id + ': ' + n.why) })))
if (bad.length) { console.error('Not doable on his gear:\n  ' + bad.join('\n  ')); await vite.close(); process.exit(1) }

const ids = new Set(routines.map(r => r.id))
const N = JSON.parse(JSON.stringify(S))
N.routines = N.routines.filter(r => !ids.has(r.id)).concat(routines)
N.week = { ...(N.week || {}) }
routines.forEach(r => { N.week[r.day] = r.id })
N.routines.forEach(r => { delete r.day })

const out = []
let allOk = true
for (let k = 0; k < WEEKS; k++) {
  const d = new Date(mondayOf(TODAY) + 'T12:00:00'); d.setDate(d.getDate() + 7 * k)
  const wk = weekCheck(N, d.toISOString().slice(0, 10))
  allOk = allOk && wk.ok
  out.push(`\n=== week of ${wk.weekStart} — ${wk.ok ? 'ok' : 'PROBLEMS'} ===`)
  wk.days.forEach(day => {
    out.push(`${day.date} ${day.name} · ~${day.minutes} min`)
    day.exercises.forEach(e => {
      if (e.mode === 'cardio') { out.push(`   walk ${e.min} min (optional)`); return }
      const reps = e.side ? `${e.repsMin / 2}–${e.reps / 2}/side` : `${e.repsMin || e.reps}–${e.reps}`
      out.push(`   ${e.sg ? '[ss] ' : ''}${e.name} · ${e.sets} x ${reps} · ${e.load > 0 ? e.load + ' lb' : 'bodyweight'}${e.slot ? ' · ' + e.slot : ''}`)
    })
  })
  out.push('coverage: ' + Object.entries(wk.coverage).map(([g, n]) => g + ' ' + n).join(', '))
  wk.problems.forEach(p => out.push('  ! [' + p.rule + '] ' + p.message))
}
console.log(out.join('\n'))
await vite.close()

if (!APPLY && !OUT) { console.log('\n(dry run — nothing written)'); process.exit(allOk ? 0 : 1) }
if (!allOk) { console.error('\nRefusing to write: a week failed weekCheck.'); process.exit(1) }
N._ts = Date.now()
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(N), { mode: 0o600 }); console.log('\nWrote ' + OUT); process.exit(0) }

const age = Date.now() - (S0._ts || 0)
if (age < 30 * 60 * 1000 && !FORCE) {
  console.error(`\nRefusing to apply: the state was written ${Math.round(age / 60000)} min ago, so the app is probably open. --force overrides.`)
  process.exit(2)
}
// Re-read right before writing: anything the phone pushed while this ran must not be lost.
const now = JSON.parse(fs.readFileSync(STATE, 'utf8'))
if ((now._ts || 0) !== (S0._ts || 0)) { console.error('\nThe state changed while this ran — run it again.'); process.exit(3) }
const bak = STATE + '.bak-prevariety'
if (!fs.existsSync(bak)) fs.copyFileSync(STATE, bak)
const tmp = STATE + '.tmp-variety'
fs.writeFileSync(tmp, JSON.stringify(N))
fs.chmodSync(tmp, fs.statSync(STATE).mode & 0o777)   // keep the live file's mode (the API container reads it)
fs.renameSync(tmp, STATE)
console.log('\nApplied. Backup: ' + bak)
