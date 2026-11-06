#!/usr/bin/env node
// Build the owner's Full Body A / B / C (trainer plan 2026-10-19) with the gear-aware planner, print
// each routine with its setup steps and checkRoutine result, and optionally apply it to a state file.
//
//   node scripts/trainer-routines.mjs                      # dry run against the live state
//   node scripts/trainer-routines.mjs --state <file>       # dry run against another copy
//   node scripts/trainer-routines.mjs --apply [--force]    # write it (see "Applying" below)
//   node scripts/trainer-routines.mjs --out <file>         # write the result to <file> instead
//
// The lib is the app's own (frontend/src/lib), loaded through Vite's SSR module loader because it
// reads import.meta.env. No server is started: middleware mode, nothing listens.
//
// Applying. The app only pulls the server copy at boot or sign-in. A phone that still has the app
// open pushes its next edit with an old baseTs, gets a 409, and merges — and the merge lets the
// newer _ts (the phone's) win the week, the reminder and same-id routines. So --apply refuses when
// the state was written in the last 30 minutes (he is probably mid-workout); after applying, the
// app must be force-quit and reopened before anything is touched in it.
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
const SINCE = opt('--since') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

const { createServer } = await import(path.join(FRONT, 'node_modules', 'vite', 'dist', 'node', 'index.js'))
const vite = await createServer({ root: FRONT, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
const load = p => vite.ssrLoadModule(path.join(FRONT, 'src', 'lib', p))
const { DEFAULT_GEAR, exerciseNeeds } = await load('gear.js')
const { checkRoutine, orderRoutine, setupPlan, loadFor } = await load('planner.js')
const { EXIDX, registerCustom } = await load('exercises.js')

const S0 = JSON.parse(fs.readFileSync(STATE, 'utf8'))
const S = JSON.parse(JSON.stringify(S0))
registerCustom(S.customEx)
if (!S.gear) S.gear = JSON.parse(JSON.stringify(DEFAULT_GEAR))

// Every loaded lift carries `since` + a weight: a clean start on the new 8–12 double progression
// at a weight taken from his log (restarts lighter where the lift stalled). The Smith squat keeps
// its history on purpose — 135 × 12 × 3 on 10/12, so the cap logic holds it at 135 and builds reps.
const D = { sets: 3, mode: 'reps', prog: 'double' }
const walk = { id: '3666', sets: 1, min: 15 }
const lift = (id, weight, reps, repsMin, extra) => ({ id, ...D, reps, repsMin, weight, ...(weight > 0 && !(extra && extra.keepHistory) ? { since: SINCE } : {}), ...(extra || {}) })
const clean = e => { const o = { ...e }; delete o.keepHistory; return o }

const PLAN = [
  {
    id: 'mtfullbodya01', name: 'Full Body A', from: 'mt6fj1scmwjmp', day: 1,
    note: 'Mon. Walk optional. Short version: the first 2 lifts.',
    ex: [
      walk,
      lift('0770', 135, 12, 8, { keepHistory: true }),          // Smith squat — at the 135 cap, reps only
      lift('0757', 190, 12, 8),                                  // Smith incline — 190 × 8 × 3 on 10/05
      lift('0652', 0, 10, 8),                                    // pull-up — bodyweight, 12 × 3 is the ceiling
      lift('cpallofpress', 55, 24, 16, { side: true }),          // Pallof — 55 on 9/30, 12 a side max
      lift('0178', 12.5, 12, 10)                                 // cable lateral raise — he keeps these (10/19); restart below the stalled 15
    ]
  },
  {
    id: 'mtfullbodyb01', name: 'Full Body B', from: 'mt6fj1sdyub8l', day: 2,
    note: 'Tue. Walk optional. Short version: the first 2 lifts.',
    ex: [
      walk,
      lift('0765', 105, 12, 8),                                  // Smith seated press — restart: fell 140 → 115
      lift('0214', 125, 12, 8),                                  // seated one-arm row — 115 × 14, so 8–12 starts at 125
      lift('clandminerdl', 90, 12, 10),                          // landmine RDL — restart below the 95 best
      lift('0773', 95, 12, 10)                                   // Smith standing calf raise — new, conservative
    ]
  },
  {
    id: 'mtfullbodyc01', name: 'Full Body C', from: 'mt6fj1sd9ft9o', day: 4,
    note: 'Thu (Wed is the backup day). Walk optional. Short version: the first 2 lifts.',
    ex: [
      walk,
      lift('0748', 185, 12, 8),                                  // Smith flat bench — second chest hit; incline is 190 × 8
      lift('0768', 95, 20, 16, { side: true }),                  // Smith split squat — new, under the 135 cap
      lift('0241', 100, 12, 8),                                  // pushdown — restart: stalled at 115–140
      lift('0165', 105, 12, 8)                                   // rope hammer curl — 100 × 12 on 10/13
    ]
  }
]

const lb = n => (n > 0 ? n + ' lb' : 'bodyweight')
const out = []
const built = PLAN.map(p => {
  const old = S.routines.find(r => r.id === p.from)
  const base = { id: p.id, name: p.name, emoji: old ? old.emoji : undefined, prog: 'double', note: p.note, ex: p.ex.map(clean) }
  const { routine, changes } = orderRoutine(base, S)
  const check = checkRoutine(routine, S)
  const steps = setupPlan(routine, S)
  out.push(`\n=== ${routine.name} (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][p.day]}) ===`)
  routine.ex.forEach((e, i) => {
    const n = exerciseNeeds(e.id, S)
    const reps = e.min ? e.min + ' min' : (e.side ? (e.repsMin / 2) + '–' + (e.reps / 2) + '/side' : e.repsMin + '–' + e.reps)
    out.push(`${i}. ${EXIDX[e.id]?.n} · ${e.sets} x ${reps} · ${e.min ? '' : lb(loadFor(e, S, routine))} · ${n.station}${n.horns ? ' (' + n.horns + ' horn' + (n.horns > 1 ? 's' : '') + ', ' + n.attachment + ')' : ''}${n.bench ? ' · bench ' + n.bench : ''} · ${n.primary}${n.heavy ? ' · heavy' : ''}`)
  })
  out.push('order changes: ' + (changes.length ? changes.map(c => c.text).join('; ') : 'none'))
  out.push('setup:')
  steps.forEach(s => out.push('  - ' + s.text))
  out.push('checkRoutine: ' + (check.ok ? 'ok' : 'PROBLEMS'))
  check.problems.forEach(pr => out.push(`  ! [${pr.rule}] ${pr.message}`))
  return { p, routine, check }
})
console.log(out.join('\n'))
await vite.close()

const allOk = built.every(b => b.check.ok)
if (!APPLY && !OUT) { console.log('\n(dry run — nothing written)'); process.exit(allOk ? 0 : 1) }
if (!allOk) { console.error('\nRefusing to write: a routine failed checkRoutine.'); process.exit(1) }

// ---- the new state ----
const N = JSON.parse(JSON.stringify(S0))
N.gear = N.gear || JSON.parse(JSON.stringify(DEFAULT_GEAR))
const newIds = new Set(built.map(b => b.routine.id))
N.routines = N.routines.filter(r => !newIds.has(r.id)).map(r => (/\(old\)$/.test(r.name) ? r : { ...r, name: r.name + ' (old)' }))
built.forEach(b => N.routines.push(b.routine))
N.week = {}
built.forEach(b => { N.week[b.p.day] = b.routine.id })
// Wednesday stays empty on purpose: it is the backup day the missed-session banner moves into.
N.reminder = { ...(N.reminder || {}), time: '17:00' }
N._ts = Date.now()

if (OUT) { fs.writeFileSync(OUT, JSON.stringify(N), { mode: 0o600 }); console.log('\nWrote ' + OUT); process.exit(0) }

const age = Date.now() - (S0._ts || 0)
if (age < 30 * 60 * 1000 && !FORCE) {
  console.error(`\nRefusing to apply: the state was written ${Math.round(age / 60000)} min ago, so the app is probably open (mid-workout?).` +
    '\nIts next push would merge and its newer _ts would win the week, reminder and routine names.' +
    '\nApply when he is done, then force-quit and reopen the app before touching it. --force overrides.')
  process.exit(2)
}
const bak = STATE + '.bak-pretrainer'
if (!fs.existsSync(bak)) fs.copyFileSync(STATE, bak)
const tmp = STATE + '.tmp-trainer'
fs.writeFileSync(tmp, JSON.stringify(N))
fs.renameSync(tmp, STATE)
console.log('\nApplied. Backup: ' + bak + '\nNow: force-quit Lift Book on the phone and reopen it (it pulls only at launch).')
