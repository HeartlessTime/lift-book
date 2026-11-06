// "Tell my trainer" — the thread between the owner and the trainer that answers inside the app.
// Server side: /api/trainer/* in api/server.js. This module holds everything that is logic rather
// than layout (unread, drafts, applying a proposal) so it can be tested without a DOM.
import { create } from 'zustand'
import { api } from './api.js'
import { t } from './i18n.js'
import { cleanupSg, buildSets, defaultConfig, toggleSuperset, setPlanDay, slideWeek, effectiveRoutineId } from './history.js'
import { isBodyweightEq, registerCustom } from './exercises.js'
import { todayISO } from './format.js'
import { nextPrescription, applyPrescription } from './progression.js'
import { resolveRoutine } from './variety.js'

// The contract's fixed set, in the order the chips show. Labels are English source strings (i18n keys).
export const TAGS = [
  ['gear', "Can't do this on my gear"],
  ['setup', 'Setup took too long'],
  ['pain', 'Hurt or felt wrong'],
  ['dislike', "Don't like it"],
  ['easy', 'Too easy'],
  ['hard', 'Too hard'],
  ['other', 'Other']
]
export const tagLabel = id => t((TAGS.find(x => x[0] === id) || [id, id])[1])
export const MAX_TEXT = 2000

/* ------------------------------------------------------------------ storage ---- */
// Per-device conveniences only: when he last looked at the thread, and an unsent draft. Every
// access is wrapped — private mode, eviction or a test runner without localStorage must never
// stop the thread from working.
const SEEN_KEY = 'gym_trainer_seen'
const DRAFT_KEY = 'gym_trainer_draft'
const ls = () => { try { return globalThis.localStorage || null } catch { return null } }
export function getSeen() { try { return +(ls()?.getItem(SEEN_KEY)) || 0 } catch { return 0 } }
export function setSeen(ts) { try { if (ts > getSeen()) ls()?.setItem(SEEN_KEY, String(ts)) } catch { /* */ } }
// Drafts are kept per context (one per exercise / workout / the plain thread), so opening the
// sheet from another exercise neither shows nor overwrites the note he started about this one.
export const ctxKey = c => ['workoutId', 'exId', 'routineId'].map(k => (c && c[k]) || '').join('|')
function readDrafts() {
  try { const d = JSON.parse(ls()?.getItem(DRAFT_KEY) || 'null'); return d && typeof d === 'object' && !Array.isArray(d) ? d : {} } catch { return {} }
}
export function loadDraft(context) {
  const d = readDrafts()[ctxKey(context)]
  return d && typeof d === 'object' ? { text: String(d.text || ''), tags: Array.isArray(d.tags) ? d.tags : [] } : null
}
export function saveDraft(context, d) {
  try {
    const all = readDrafts()
    const k = ctxKey(context)
    delete all[k]
    if (d && (String(d.text || '').trim() || (d.tags || []).length)) all[k] = { text: d.text || '', tags: d.tags || [], at: Date.now() }
    // keep the newest 20 — a draft per exercise ever touched would grow forever
    const keep = Object.entries(all).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 20)
    if (keep.length) ls()?.setItem(DRAFT_KEY, JSON.stringify(Object.fromEntries(keep)))
    else ls()?.removeItem(DRAFT_KEY)
  } catch { /* */ }
}

/* ------------------------------------------------------------------- unread ---- */
// Trainer messages newer than his last look.
export const unreadCount = (messages, seen) => (messages || []).filter(m => m.from === 'trainer' && (m.ts || 0) > (seen || 0)).length
export const latestTs = messages => Math.max(0, ...(messages || []).map(m => m.ts || 0))
// His messages the trainer hasn't answered yet ("your trainer is looking at this").
export function awaitingReply(messages) {
  const answered = new Set((messages || []).filter(m => m.from === 'trainer' && m.replyTo).map(m => m.replyTo))
  return new Set((messages || []).filter(m => m.from === 'me' && !answered.has(m.id)).map(m => m.id))
}

/* ---------------------------------------------------------------- proposals ---- */
// The routine as it would be after the proposal, or null when the proposal no longer fits it
// (the exercise it names has since been removed or swapped). Never mutates its input.
export function applyProposal(routine, p) {
  if (!routine || !p || !Array.isArray(routine.ex)) return null
  const ex = routine.ex.map(e => ({ ...e }))
  // A weekly-variety slot (lib/variety.js) answers to any of its variants: the trainer sees the
  // variant he actually did, which need not be the slot's stored default.
  const inSlot = (e, id) => !!(e.slot && Array.isArray(e.pool) && e.pool.includes(id))
  const at = id => ex.findIndex(e => e.id === id || inSlot(e, id))
  if (p.kind === 'swap') {
    const i = at(p.fromEx)
    // A lift already in the routine, or already in that slot's pool, is no swap: inside a pool it
    // would only drop the old variant and wipe the new one's weight (the 10-27 low fly -> middle fly).
    if (i < 0 || !p.toEx || at(p.toEx) >= 0) return null
    if (inSlot(ex[i], p.fromEx)) {
      // Swap that one variant inside the pool; it starts from its own history.
      const pool = ex[i].pool.map(x => (x === p.fromEx ? p.toEx : x)).filter((x, j, a) => a.indexOf(x) === j)
      const opts = { ...(ex[i].opts || {}) }
      delete opts[p.fromEx]
      opts[p.toEx] = { ...(opts[p.toEx] || {}), weight: 0, ...(isBodyweightEq(p.toEx) ? { bodyweight: true } : {}) }
      ex[i] = { ...ex[i], pool, opts, id: pool[0] }
      return { ...routine, ex }
    }
    // Same sets and reps, but the old lift's load means nothing on the new one — it starts from
    // its own history instead.
    const next = { ...ex[i], id: p.toEx, weight: 0 }
    delete next.bodyweight
    if (isBodyweightEq(p.toEx)) next.bodyweight = true
    ex[i] = next
  } else if (p.kind === 'edit') {
    const i = at(p.exId)
    if (i < 0) return null
    const ch = {}
    for (const k of ['sets', 'reps', 'weight']) if (Number.isFinite(p.changes?.[k])) ch[k] = p.changes[k]
    if (!Object.keys(ch).length) return null
    if (inSlot(ex[i], p.exId)) ex[i] = { ...ex[i], opts: { ...(ex[i].opts || {}), [p.exId]: { ...((ex[i].opts || {})[p.exId] || {}), ...ch } } }
    else Object.assign(ex[i], ch)
  } else if (p.kind === 'add') {
    if (!p.exId || at(p.exId) >= 0) return null
    let pos = ex.length
    if (p.after) { const j = at(p.after); if (j < 0) return null; pos = j + 1 }
    // never wedge a lift between two superset partners
    while (pos < ex.length && pos > 0 && ex[pos].sg && ex[pos].sg === ex[pos - 1].sg) pos++
    ex.splice(pos, 0, newCfg(p.exId, p.reps))
  } else if (p.kind === 'remove') {
    const i = at(p.exId)
    if (i < 0) return null
    if (inSlot(ex[i], p.exId) && ex[i].pool.length > 1) {
      // One variant out of a rotating slot; the slot keeps the rest.
      const pool = ex[i].pool.filter(x => x !== p.exId)
      const opts = { ...(ex[i].opts || {}) }
      delete opts[p.exId]
      ex[i] = { ...ex[i], pool, opts, id: pool.includes(ex[i].id) ? ex[i].id : pool[0] }
    } else {
      ex.splice(i, 1)
      cleanupSg(ex)
    }
  } else if (p.kind === 'superset') {
    // The routine editor's link button, on whichever of the two sits lower.
    const i = at(p.exId), j = at(p.withEx)
    if (i < 0 || j < 0 || Math.abs(i - j) !== 1) return null
    if (ex[i].sg && ex[i].sg === ex[j].sg) return null
    toggleSuperset(ex, Math.max(i, j))
  } else if (p.kind === 'unsuperset') {
    // Takes the lift out of its superset; cleanupSg then drops the pairing from a partner left
    // on its own, the same cleanup the routine editor runs after an unlink.
    const i = at(p.exId)
    if (i < 0 || !ex[i].sg) return null
    delete ex[i].sg
    cleanupSg(ex)
  } else if (p.kind === 'reorder') {
    if (!Array.isArray(p.order) || !p.order.length) return null
    const left = ex.slice()
    const out = []
    for (const id of p.order) {
      const j = left.findIndex(e => e.id === id || inSlot(e, id))
      if (j < 0) return null            // names something not in the routine any more
      out.push(left.splice(j, 1)[0])
    }
    out.push(...left)                   // anything the proposal didn't mention keeps its place at the end
    cleanupSg(out)
    return { ...routine, ex: out }
  } else return null
  return { ...routine, ex }
}

// A lift the trainer adds: always 3 sets, never above 12 reps, double progression like the rest
// of his plan. Timed and cardio lifts keep their own default shape.
const MAX_REPS = 12
function newCfg(id, reps) {
  const cfg = { id, ...defaultConfig(id) }
  if (cfg.mode !== 'reps') return cfg
  const r = Number.isFinite(reps) && reps > 0 ? Math.min(Math.round(reps), MAX_REPS) : MAX_REPS
  return { ...cfg, sets: 3, reps: r, repsMin: Math.min(8, r), prog: 'double' }
}

// Applies a proposal's routine to the draft S, and when that routine is the one being trained
// right now, to the session too, not only next time. The session is rebuilt from the changed
// routine (as it resolves for the session's date), keeping every set already logged and every
// lift added by hand; a routine lift the change took out goes, unless something was logged on
// it. "Before" is resolved ahead of the change: resolving reads the routines out of S, so once
// r.ex is replaced it would only ever see the new one.
const SAME_KEYS = ['sets', 'reps', 'weight', 'sec', 'min', 'bodyweight']
export function applyToState(S, routineId, ex) {
  const routine = (S.routines || []).find(x => x.id === routineId)
  if (!routine) return
  const A = S.active
  const live = A && A.routineId === routineId
  const was = live ? new Set(resolveRoutine(S, routine, A.d).ex.map(e => e.id)) : null
  routine.ex = ex
  if (!live) return
  const r = resolveRoutine(S, routine, A.d)
  const curId = A.entries[A.cur]?.id
  const left = A.entries.slice()
  const take = id => { const j = left.findIndex(e => e.id === id); return j < 0 ? null : left.splice(j, 1)[0] }
  const entries = r.ex.map(cfg => {
    const old = take(cfg.id)
    if (old && SAME_KEYS.every(k => (old.target || {})[k] === cfg[k])) return { ...old, sg: cfg.sg }
    const plan = nextPrescription(S, cfg, r)
    const fresh = { id: cfg.id, sg: cfg.sg, target: { ...cfg }, plan, sets: applyPrescription(buildSets(S, cfg), plan) }
    if (!old) return fresh
    const done = old.sets.filter(x => x.done)
    return { ...old, ...fresh, sets: [...done, ...fresh.sets.slice(done.length)] }
  })
  entries.push(...left.filter(e => !was.has(e.id) || e.sets.some(x => x.done)).map(e => ({ ...e, sg: undefined })))
  for (const e of entries) if (e.sg === undefined) delete e.sg
  A.entries = entries
  const i = entries.findIndex(e => e.id === curId)
  A.cur = i >= 0 ? i : Math.max(0, Math.min(A.cur || 0, entries.length - 1))
}

// A1's planner (lib/planner.js) owns the gear/rules check. Loaded through a glob so this module
// still builds if the file is absent; then `checker` resolves to null and no Apply is offered.
const plannerMods = import.meta.glob('./planner.js')
let checkerP = null
export function loadChecker() {
  if (!checkerP) {
    const load = plannerMods['./planner.js']
    checkerP = load ? load().then(m => (typeof m.checkRoutine === 'function' ? m.checkRoutine : null)).catch(() => null) : Promise.resolve(null)
  }
  return checkerP
}

// A message's proposals as a list: new messages may carry several (`proposals`), older ones one.
export const proposalsOf = msg => (Array.isArray(msg?.proposals) && msg.proposals.length ? msg.proposals
  : msg?.proposal ? [msg.proposal] : [])

const SESSION_KINDS = ['today']
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// "Just today": skip, swap or add a lift in the session in progress. The routine is not touched.
// Returns false when there is no session or the change no longer fits it.
function applyToday(S, p) {
  const A = S.active
  if (!A || !Array.isArray(A.entries) || !p.exId) return false
  const j = A.entries.findIndex(e => e.id === p.exId)
  const logged = j >= 0 && A.entries[j].sets.some(x => x.done)
  const routine = (S.routines || []).find(r => r.id === A.routineId) || { ex: [] }
  const fresh = (cfg, sg) => {
    const plan = nextPrescription(S, cfg, routine)
    return { id: cfg.id, ...(sg ? { sg } : {}), target: { ...cfg }, plan, sets: applyPrescription(buildSets(S, cfg), plan) }
  }
  const curId = A.entries[A.cur]?.id
  if (p.action === 'skip') {
    if (j < 0 || logged) return false
    A.entries.splice(j, 1)
  } else if (p.action === 'swap') {
    if (j < 0 || logged || !p.toEx || A.entries.some(e => e.id === p.toEx)) return false
    const cfg = { ...A.entries[j].target, id: p.toEx, weight: 0 }
    delete cfg.bodyweight
    if (isBodyweightEq(p.toEx)) cfg.bodyweight = true
    A.entries[j] = fresh(cfg, A.entries[j].sg)
    return true
  } else if (p.action === 'add') {
    if (j >= 0) return false
    A.entries.push(fresh(newCfg(p.exId, p.reps)))
  } else return false
  cleanupSg(A.entries)
  const i = A.entries.findIndex(e => e.id === curId)
  A.cur = i >= 0 ? i : Math.max(0, Math.min(A.cur || 0, A.entries.length - 1))
  return true
}

// One proposal applied to the draft S. 'ok', or why it can't be: 'stale' (it no longer fits)
// or 'noop' (it would change nothing — never offered as an Apply).
function applyOne(S, p) {
  if (!p || typeof p !== 'object') return 'stale'
  if (p.kind === 'today') return applyToday(S, p) ? 'ok' : 'stale'
  if (p.kind === 'schedule') {
    const today = todayISO()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '') || p.date < today) return 'stale'
    const id = p.routineId === 'rest' ? null : p.routineId
    if (id && !(S.routines || []).some(r => r.id === id)) return 'stale'
    if (!p.slide && (effectiveRoutineId(S, p.date) || null) === id) return 'noop'
    const before = S.dayPlan || {}
    S.dayPlan = p.slide ? slideWeek({ ...S, dayPlan: before }, p.date, id).dayPlan : setPlanDay({ ...S, dayPlan: before }, p.date, id)
    return same(before, S.dayPlan) ? 'noop' : 'ok'
  }
  if (p.kind === 'custom') {
    const c = p.ex
    if (!c || !c.id || !c.n) return 'stale'
    S.customEx = S.customEx || []
    const have = S.customEx.find(x => x.id === c.id)
    if (have && have.n !== c.n) return 'stale'
    if (!have) S.customEx.push({ id: c.id, n: c.n, bp: c.bp || '', tg: c.tg || '', eq: 'custom', custom: true, ...(c.uses ? { uses: c.uses } : {}), desc: c.desc || '', sm: [] })
    if (!p.routineId) return have ? 'noop' : 'ok'
    return applyOne(S, { kind: 'add', routineId: p.routineId, exId: c.id, after: p.after })
  }
  const routine = (S.routines || []).find(r => r.id === p.routineId)
  const next = applyProposal(routine, p)
  if (!next) return 'stale'
  if (same(next.ex, routine.ex)) return 'noop'
  applyToState(S, routine.id, next.ex)
  return 'ok'
}

// Every proposal of a message, in order, onto S (mutated — pass the store's draft, or a copy).
// All or nothing: the first one that doesn't fit stops the lot and is named by index.
export function applyAll(S, list) {
  for (let i = 0; i < list.length; i++) {
    const status = applyOne(S, list[i])
    if (status !== 'ok') return { status, index: i }
  }
  return { status: 'ok' }
}

// The session in progress as a routine, so the gear check can read a "just today" change.
const sessionRoutine = A => ({ id: 'today', name: 'Today', ex: (A?.entries || []).map(e => ({ ...(e.target || {}), id: e.id, ...(e.sg ? { sg: e.sg } : {}) })) })

// Everything the card under a trainer message needs to decide what to show.
//   { status: 'applied'|'dismissed'|'stale'|'noop'|'unchecked'|'blocked'|'ok', list, index?, problems? }
// Every changed routine (and the session, for a today-only change) goes through checkRoutine;
// one change that breaks a rule blocks the whole set.
export function reviewProposal(msg, S, checkRoutine) {
  const list = proposalsOf(msg)
  if (!list.length) return null
  if (msg.proposalState === 'applied' || msg.proposalState === 'dismissed') return { status: msg.proposalState, list }
  if (!S) return { status: 'stale', list }
  const draft = JSON.parse(JSON.stringify(S))
  const res = applyAll(draft, list)
  if (res.status !== 'ok') return { ...res, list }
  if (typeof checkRoutine !== 'function') return { status: 'unchecked', list }
  // A new custom lift has to be known to the gear check while it reads the draft.
  const newCustom = !same(draft.customEx || [], S.customEx || [])
  if (newCustom) registerCustom(draft.customEx)
  try {
    const pairs = []
    for (const r of draft.routines || []) {
      const was = (S.routines || []).find(x => x.id === r.id)
      if (was && !same(was.ex, r.ex)) pairs.push([was, r])
    }
    if (list.some(p => SESSION_KINDS.includes(p.kind))) pairs.push([sessionRoutine(S.active), sessionRoutine(draft.active)])
    const problems = []
    for (const [was, now] of pairs) {
      // Only what the change itself breaks counts. A routine that already trips a rule elsewhere
      // (a reload on another cable, a superset clash) must not lock every suggestion out.
      let before = []
      try { before = (checkRoutine(was, S)?.problems || []).map(x => x.rule + '|' + x.message) } catch { /* */ }
      let out
      try { out = checkRoutine(now, draft) } catch (e) { return { status: 'unchecked', list } }
      if (!out) return { status: 'blocked', list, problems: [] }
      if (!out.ok) problems.push(...(out.problems || []).filter(x => !before.includes(x.rule + '|' + x.message)))
    }
    if (problems.length) return { status: 'blocked', list, problems }
    return { status: 'ok', list }
  } finally {
    if (newCustom) registerCustom(S.customEx)
  }
}

/* --------------------------------------------------------------------- API ---- */
export const fetchThread = () => api('/api/trainer/messages').then(r => r.messages || [])
export const postMessage = ({ text, tags, context }) =>
  api('/api/trainer/messages', { method: 'POST', body: JSON.stringify({ text: text || '', tags: tags || [], context: context || {} }) }).then(r => r.message)
export const postProposalState = (id, state) =>
  api('/api/trainer/messages/' + encodeURIComponent(id) + '/proposal', { method: 'POST', body: JSON.stringify({ state }) }).then(r => r.message)

// Upsert by id, oldest first: a sent message or a changed proposal lands without a refetch.
export function mergeMessages(list, incoming) {
  const map = new Map((list || []).map(m => [m.id, m]))
  for (const m of incoming || []) if (m && m.id) map.set(m.id, m)
  return [...map.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0))
}

// Shared between the Home badge and the sheet, so a reply read in the sheet clears the badge.
export const useTrainer = create((set, get) => ({
  messages: [],
  loaded: false,
  seen: getSeen(),
  async refresh() {
    try { set({ messages: mergeMessages([], await fetchThread()), loaded: true }) }
    catch (e) { /* offline or signed out — keep what we have */ }
  },
  add(m) { set({ messages: mergeMessages(get().messages, [m]) }) },
  markSeen() {
    const ts = latestTs(get().messages)
    if (ts > get().seen) { setSeen(ts); set({ seen: ts }) }
  }
}))
