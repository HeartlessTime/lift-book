import { describe, it, expect, beforeEach } from 'vitest'
import {
  unreadCount, latestTs, awaitingReply, applyProposal, reviewProposal, mergeMessages,
  loadDraft, saveDraft, getSeen, setSeen, ctxKey, TAGS, applyToState, applyAll, proposalsOf
} from './trainer.js'
import { todayISO } from './format.js'
import { EXIDX } from './exercises.js'

// node has no localStorage; a tiny Map-backed one is enough for the draft/seen helpers
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
}
beforeEach(() => store.clear())

const me = (id, ts) => ({ id, from: 'me', text: 'x', tags: [], context: {}, ts })
const coach = (id, ts, replyTo, extra = {}) => ({ id, from: 'trainer', text: 'y', tags: [], context: {}, ts, replyTo, ...extra })
const routine = () => ({ id: 'r1', name: 'Push', ex: [
  { id: 'a', sets: 3, reps: 10, weight: 50 },
  { id: 'b', sets: 3, reps: 12, weight: 0, sg: 's1' },
  { id: 'c', sets: 3, reps: 12, weight: 0, sg: 's1' }
] })

describe('tags', () => {
  it('is the contract set, in order', () => {
    expect(TAGS.map(x => x[0])).toEqual(['gear', 'setup', 'pain', 'dislike', 'easy', 'hard', 'other'])
  })
})

describe('unread', () => {
  const msgs = [me('1', 100), coach('2', 200, '1'), me('3', 300), coach('4', 400, '3')]
  it('counts only trainer messages newer than the last look', () => {
    expect(unreadCount(msgs, 0)).toBe(2)
    expect(unreadCount(msgs, 200)).toBe(1)
    expect(unreadCount(msgs, 400)).toBe(0)
  })
  it('his own new messages never count', () => {
    expect(unreadCount([me('1', 999)], 0)).toBe(0)
  })
  it('seen only moves forward', () => {
    setSeen(400); setSeen(100)
    expect(getSeen()).toBe(400)
    expect(latestTs(msgs)).toBe(400)
  })
  it('awaitingReply lists his messages with no trainer answer', () => {
    expect([...awaitingReply([me('1', 1), coach('2', 2, '1'), me('3', 3)])]).toEqual(['3'])
  })
})

describe('mergeMessages', () => {
  it('upserts by id and keeps oldest first', () => {
    const out = mergeMessages([me('1', 1), coach('2', 3, '1', { proposalState: 'open' })], [coach('2', 3, '1', { proposalState: 'applied' }), me('0', 0)])
    expect(out.map(m => m.id)).toEqual(['0', '1', '2'])
    expect(out[2].proposalState).toBe('applied')
  })
})

describe('drafts', () => {
  it('are kept per context and cleared on send', () => {
    const a = { exId: 'a', workoutId: 'w' }, b = { exId: 'b', workoutId: 'w' }
    saveDraft(a, { text: 'shoulder', tags: ['pain'] })
    saveDraft(b, { text: 'too easy', tags: [] })
    expect(loadDraft(a)).toEqual({ text: 'shoulder', tags: ['pain'] })
    expect(loadDraft(b).text).toBe('too easy')
    saveDraft(a, null)
    expect(loadDraft(a)).toBe(null)
    expect(loadDraft(b).text).toBe('too easy')
    expect(ctxKey({})).toBe(ctxKey(undefined))
  })
  it('survives a corrupt store', () => {
    localStorage.setItem('gym_trainer_draft', '{nope')
    expect(loadDraft({})).toBe(null)
  })
})

describe('applyProposal', () => {
  it('swap keeps the prescription, drops the old load, leaves the input alone', () => {
    const r = routine()
    const out = applyProposal(r, { kind: 'swap', routineId: 'r1', fromEx: 'a', toEx: 'z' })
    expect(out.ex[0]).toEqual({ id: 'z', sets: 3, reps: 10, weight: 0 })
    expect(r.ex[0].id).toBe('a')
  })
  it('edit changes only sets/reps/weight', () => {
    const out = applyProposal(routine(), { kind: 'edit', routineId: 'r1', exId: 'b', changes: { reps: 8, junk: 1 } })
    expect(out.ex[1]).toEqual({ id: 'b', sets: 3, reps: 8, weight: 0, sg: 's1' })
  })
  it('reorder follows the order, appends the unnamed, and unlinks broken supersets', () => {
    const out = applyProposal(routine(), { kind: 'reorder', routineId: 'r1', order: ['b', 'a'] })
    expect(out.ex.map(e => e.id)).toEqual(['b', 'a', 'c'])
    expect(out.ex.some(e => e.sg)).toBe(false)
  })
  it('unsuperset takes the lift out and frees a partner left alone', () => {
    const r = routine()
    const out = applyProposal(r, { kind: 'unsuperset', routineId: 'r1', exId: 'c' })
    expect(out.ex.map(e => e.sg)).toEqual([undefined, undefined, undefined])
    expect(r.ex[2].sg).toBe('s1')                      // input untouched
    const three = { ...r, ex: [...r.ex, { id: 'd', sets: 3, reps: 12, sg: 's1' }] }
    const split = applyProposal(three, { kind: 'unsuperset', routineId: 'r1', exId: 'b' })
    expect(split.ex.map(e => e.sg)).toEqual([undefined, undefined, 's1', 's1'])
  })
  it('unsuperset is null for a lift with no superset or one that is gone', () => {
    expect(applyProposal(routine(), { kind: 'unsuperset', routineId: 'r1', exId: 'a' })).toBeNull()
    expect(applyProposal(routine(), { kind: 'unsuperset', routineId: 'r1', exId: 'zz' })).toBeNull()
  })
  it('is null when the routine has moved on', () => {
    expect(applyProposal(routine(), { kind: 'swap', fromEx: 'gone', toEx: 'z' })).toBe(null)
    expect(applyProposal(routine(), { kind: 'reorder', order: ['a', 'gone'] })).toBe(null)
    expect(applyProposal(routine(), { kind: 'edit', exId: 'a', changes: {} })).toBe(null)
    expect(applyProposal(null, { kind: 'edit', exId: 'a', changes: { reps: 1 } })).toBe(null)
  })
})

describe('reviewProposal', () => {
  const S = { routines: [routine()] }
  const msg = (state = 'open') => coach('9', 9, '1', { proposal: { kind: 'edit', routineId: 'r1', exId: 'a', changes: { reps: 8 } }, proposalState: state })
  it('offers Apply only when checkRoutine passes', () => {
    expect(reviewProposal(msg(), S, () => ({ ok: true, problems: [] })).status).toBe('ok')
    const blocked = reviewProposal(msg(), S, r => (r.ex[0].reps === 8 ? { ok: false, problems: [{ exId: 'a', rule: 'cap', message: 'over 135' }] } : { ok: true, problems: [] }))
    expect(blocked.status).toBe('blocked')
    expect(blocked.problems[0].message).toBe('over 135')
  })
  it('a problem the routine already had does not block the change', () => {
    const old = { exId: 'z', rule: 'setup', message: 'reload' }
    const fresh = { exId: 'a', rule: 'reps', message: '8 reps' }
    const chk = r => ({ ok: false, problems: r.ex[0].reps === 8 ? [old, fresh] : [old] })
    expect(reviewProposal(msg(), S, chk).problems).toEqual([fresh])
    expect(reviewProposal(msg(), S, r => ({ ok: false, problems: [old] })).status).toBe('ok')
  })
  it('checks the routine as it would be after the change', () => {
    let seen
    reviewProposal(msg(), S, r => { seen = r; return { ok: true, problems: [] } })
    expect(seen.ex[0].reps).toBe(8)
  })
  it('no checker, or a throwing one, means no Apply', () => {
    expect(reviewProposal(msg(), S, null).status).toBe('unchecked')
    expect(reviewProposal(msg(), S, () => { throw new Error('x') }).status).toBe('unchecked')
  })
  it('settled and stale proposals', () => {
    expect(reviewProposal(msg('applied'), S, () => ({ ok: true })).status).toBe('applied')
    expect(reviewProposal(msg('dismissed'), S, () => ({ ok: true })).status).toBe('dismissed')
    expect(reviewProposal(msg(), { routines: [] }, () => ({ ok: true })).status).toBe('stale')
    expect(reviewProposal(coach('1', 1, 'x'), S, null)).toBe(null)
  })
})

describe('applyProposal on a weekly-variety slot', () => {
  const slotR = () => ({ id: 'r', name: 'R', ex: [{ slot: 'triceps', pool: ['0201', '1723', '1724'], id: '0201', sets: 3, reps: 12, opts: { 1723: { weight: 40, side: true, reps: 24 } } }] })
  it('swaps one variant inside the pool, whichever one he did this week', () => {
    const next = applyProposal(slotR(), { kind: 'swap', routineId: 'r', fromEx: '1723', toEx: '0200' })
    expect(next.ex[0].pool).toEqual(['0201', '0200', '1724'])
    expect(next.ex[0].opts['1723']).toBeUndefined()
    expect(next.ex[0].opts['0200']).toMatchObject({ weight: 0 })
    expect(next.ex[0].slot).toBe('triceps')
  })
  it('edits only that variant’s own settings', () => {
    const next = applyProposal(slotR(), { kind: 'edit', routineId: 'r', exId: '1723', changes: { weight: 35 } })
    expect(next.ex[0].opts['1723']).toMatchObject({ weight: 35, side: true, reps: 24 })
    expect(next.ex[0].weight).toBeUndefined()
  })
})

describe('applyToState', () => {
  const S0 = () => {
    const r = routine()
    return { routines: [r], workouts: [], unit: 'kg', exWeights: {}, gear: {},
      active: { id: 'w', d: '2026-10-20', routineId: 'r1', cur: 1, entries: r.ex.map(c => ({ id: c.id, sg: c.sg, target: { ...c }, sets: [{ w: c.weight, r: c.reps, done: false }] })) } }
  }
  it('swaps the lift in the running session and keeps the current position', () => {
    const S = S0(); const before = S.routines[0]
    const after = applyProposal(before, { kind: 'swap', routineId: 'r1', fromEx: 'a', toEx: 'z' })
    applyToState(S, 'r1', after.ex)
    expect(S.active.entries.map(e => e.id)).toEqual(after.ex.map(e => e.id))
    expect(S.active.entries[S.active.cur].id).toBe('b')
  })
  it('keeps logged sets of a lift the change took out', () => {
    const S = S0(); const before = S.routines[0]
    S.active.entries[0].sets[0].done = true
    const after = applyProposal(before, { kind: 'swap', routineId: 'r1', fromEx: 'a', toEx: 'z' })
    applyToState(S, 'r1', after.ex)
    expect(S.active.entries.some(e => e.id === 'a' && e.sets[0].done)).toBe(true)
  })
  it('re-targets an edited lift, logged sets first', () => {
    const S = S0(); const before = S.routines[0]
    S.active.entries[0].sets[0].done = true
    const after = applyProposal(before, { kind: 'edit', routineId: 'r1', exId: 'a', changes: { sets: 5 } })
    applyToState(S, 'r1', after.ex)
    const a = S.active.entries.find(e => e.id === 'a')
    expect(a.target.sets).toBe(5)
    expect(a.sets.length).toBe(5)
    expect(a.sets[0].done).toBe(true)
  })
  it('leaves another routine’s session alone', () => {
    const S = S0(); S.active.routineId = 'other'; const was = JSON.stringify(S.active)
    applyToState(S, 'r1', applyProposal(S.routines[0], { kind: 'swap', routineId: 'r1', fromEx: 'a', toEx: 'z' }).ex)
    expect(JSON.stringify(S.active)).toBe(was)
  })
})

// ---- build 41: today-only, schedule, add/remove, superset, custom lifts, several at once ----
const okCheck = () => ({ ok: true, problems: [] })
const live = () => {
  const r = routine()
  return { routines: [r, { id: 'r2', name: 'Pull', ex: [{ id: 'q', sets: 3, reps: 12, weight: 0 }] }], workouts: [], unit: 'lb', exWeights: {}, gear: {},
    week: {}, dayPlan: {}, customEx: [],
    active: { id: 'w', d: todayISO(), routineId: 'r1', cur: 1, entries: r.ex.map(c => ({ id: c.id, ...(c.sg ? { sg: c.sg } : {}), target: { ...c }, sets: [{ w: c.weight, r: c.reps, done: false }] })) } }
}
const offer = (list, extra = {}) => coach('m', 1, '1', { ...(list.length === 1 ? { proposal: list[0] } : { proposals: list }), proposalState: 'open', ...extra })
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

describe('the 10-27 no-op swap', () => {
  const slotC = () => ({ id: 'c', name: 'C', ex: [{ slot: 'chest fly', pool: ['0179', '0188', '0171'], id: '0179', sets: 3, reps: 12, opts: { '0179': { weight: 25 }, '0188': { weight: 35 } } }] })
  it('a swap to a lift already in that slot’s pool is rejected, not a pool that loses a variant', () => {
    expect(applyProposal(slotC(), { kind: 'swap', routineId: 'c', fromEx: '0179', toEx: '0188' })).toBe(null)
  })
  it('a swap to a lift already elsewhere in the routine is rejected', () => {
    expect(applyProposal(routine(), { kind: 'swap', routineId: 'r1', fromEx: 'a', toEx: 'b' })).toBe(null)
  })
  it('a change that would leave everything as it is shows as noop, never Apply', () => {
    const S = live()
    const r = reviewProposal(offer([{ kind: 'edit', routineId: 'r1', exId: 'a', changes: { reps: 10 } }]), S, okCheck)
    expect(r.status).toBe('noop')
  })
})

describe('today-only changes', () => {
  it('skip takes the lift out of the session and leaves the routine alone', () => {
    const S = live(); const was = JSON.stringify(S.routines)
    expect(applyAll(S, [{ kind: 'today', action: 'skip', exId: 'b' }]).status).toBe('ok')
    expect(S.active.entries.map(e => e.id)).toEqual(['a', 'c'])
    expect(S.active.entries[1].sg).toBeUndefined()     // its partner is on its own now
    expect(JSON.stringify(S.routines)).toBe(was)
  })
  it('swap puts the new lift in that place for today only, from its own history', () => {
    const S = live(); const was = JSON.stringify(S.routines)
    expect(applyAll(S, [{ kind: 'today', action: 'swap', exId: 'a', toEx: 'z' }]).status).toBe('ok')
    expect(S.active.entries[0].id).toBe('z')
    expect(S.active.entries[0].target.weight).toBe(0)
    expect(S.active.entries[0].sets.length).toBe(3)
    expect(JSON.stringify(S.routines)).toBe(was)
  })
  it('add appends a 3-set lift capped at 12 reps', () => {
    const S = live()
    applyAll(S, [{ kind: 'today', action: 'add', exId: 'z', reps: 15 }])
    const z = S.active.entries.at(-1)
    expect(z.id).toBe('z')
    expect(z.target).toMatchObject({ sets: 3, reps: 12 })
  })
  it('is stale with no session, on a logged lift, or a lift not in it', () => {
    const S = live(); S.active.entries[0].sets[0].done = true
    expect(applyAll(S, [{ kind: 'today', action: 'skip', exId: 'a' }]).status).toBe('stale')
    expect(applyAll(live(), [{ kind: 'today', action: 'skip', exId: 'gone' }]).status).toBe('stale')
    expect(applyAll({ ...live(), active: null }, [{ kind: 'today', action: 'skip', exId: 'a' }]).status).toBe('stale')
  })
  it('the gear check reads the session as it would be', () => {
    let seen = []
    reviewProposal(offer([{ kind: 'today', action: 'swap', exId: 'a', toEx: 'z' }]), live(), r => { seen.push(r.ex.map(e => e.id)); return okCheck() })
    expect(seen).toContainEqual(['z', 'b', 'c'])
    const blocked = reviewProposal(offer([{ kind: 'today', action: 'swap', exId: 'a', toEx: 'z' }]), live(),
      r => (r.ex.some(e => e.id === 'z') ? { ok: false, problems: [{ rule: 'gear', message: 'no gear' }] } : okCheck()))
    expect(blocked.status).toBe('blocked')
  })
})

describe('schedule', () => {
  const today = todayISO(), tomorrow = addDays(todayISO(), 1)
  it('puts another routine on a day, or a rest day, and stores only what differs from the week', () => {
    const S = live(); S.week = { [new Date(today + 'T12:00:00').getDay()]: 'r1' }
    expect(applyAll(S, [{ kind: 'schedule', date: today, routineId: 'r2' }]).status).toBe('ok')
    expect(S.dayPlan[today]).toBe('r2')
    applyAll(S, [{ kind: 'schedule', date: today, routineId: 'r1' }])
    expect(S.dayPlan[today]).toBeUndefined()
    applyAll(S, [{ kind: 'schedule', date: tomorrow, routineId: 'rest' }])
    expect(S.dayPlan[tomorrow]).toBeUndefined()     // tomorrow was already a rest day in this week
  })
  it('slide pushes the rest of the week back a day', () => {
    const S = live(); S.week = { [new Date(today + 'T12:00:00').getDay()]: 'r1' }
    applyAll(S, [{ kind: 'schedule', date: today, routineId: 'rest', slide: true }])
    expect(S.dayPlan[today]).toBe('rest')
    if (new Date(today + 'T12:00:00').getDay() !== 0) expect(S.dayPlan[tomorrow]).toBe('r1')
  })
  it('a day already on that routine is noop, a past day or a missing routine is stale', () => {
    const S = live(); S.week = { [new Date(today + 'T12:00:00').getDay()]: 'r1' }
    expect(applyAll(S, [{ kind: 'schedule', date: today, routineId: 'r1' }]).status).toBe('noop')
    expect(applyAll(S, [{ kind: 'schedule', date: addDays(today, -1), routineId: 'r2' }]).status).toBe('stale')
    expect(applyAll(S, [{ kind: 'schedule', date: today, routineId: 'nope' }]).status).toBe('stale')
  })
})

describe('add, remove and superset in a routine', () => {
  it('add puts a 3 x 12 lift after the one named, never between superset partners', () => {
    expect(applyProposal(routine(), { kind: 'add', routineId: 'r1', exId: 'z', after: 'a' }).ex.map(e => e.id)).toEqual(['a', 'z', 'b', 'c'])
    const mid = applyProposal(routine(), { kind: 'add', routineId: 'r1', exId: 'z', after: 'b' })
    expect(mid.ex.map(e => e.id)).toEqual(['a', 'b', 'c', 'z'])
    expect(mid.ex[1].sg).toBe('s1')
    expect(mid.ex[3]).toMatchObject({ sets: 3, reps: 12, weight: 0 })
    expect(applyProposal(routine(), { kind: 'add', routineId: 'r1', exId: 'z', reps: 20 }).ex[3].reps).toBe(12)
    expect(applyProposal(routine(), { kind: 'add', routineId: 'r1', exId: 'a' })).toBe(null)
  })
  it('remove takes a lift out and frees its partner; in a pool it drops only that variant', () => {
    const r = applyProposal(routine(), { kind: 'remove', routineId: 'r1', exId: 'b' })
    expect(r.ex.map(e => e.id)).toEqual(['a', 'c'])
    expect(r.ex[1].sg).toBeUndefined()
    const pool = { id: 'p', ex: [{ slot: 's', pool: ['x', 'y'], id: 'x', sets: 3, reps: 12, opts: { x: { weight: 5 } } }] }
    const p2 = applyProposal(pool, { kind: 'remove', routineId: 'p', exId: 'x' })
    expect(p2.ex[0]).toMatchObject({ pool: ['y'], id: 'y', opts: {} })
    expect(applyProposal(routine(), { kind: 'remove', routineId: 'r1', exId: 'gone' })).toBe(null)
  })
  it('superset links two neighbours with the editor’s link logic', () => {
    const r = applyProposal(routine(), { kind: 'superset', routineId: 'r1', exId: 'b', withEx: 'a' })
    expect(r.ex[0].sg).toBeTruthy()
    expect(r.ex[0].sg).toBe(r.ex[1].sg)
    const solo = { id: 'r', ex: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }
    const s2 = applyProposal(solo, { kind: 'superset', routineId: 'r', exId: 'a', withEx: 'b' })
    expect(s2.ex[0].sg && s2.ex[0].sg === s2.ex[1].sg).toBe(true)
    expect(s2.ex[2].sg).toBeUndefined()
    expect(applyProposal(solo, { kind: 'superset', routineId: 'r', exId: 'a', withEx: 'c' })).toBe(null)   // not neighbours
    expect(applyProposal(routine(), { kind: 'superset', routineId: 'r1', exId: 'b', withEx: 'c' })).toBe(null) // already paired
  })
})

describe('custom exercise', () => {
  const custom = (extra = {}) => ({ kind: 'custom', ex: { id: 'cwallsit', n: 'Cable Wall Sit', tg: 'quads', bp: 'upper legs', desc: 'Back on the wall.', uses: 'cable' }, ...extra })
  it('is added to customEx like the existing ones, and into a routine when one is named', () => {
    const S = live()
    expect(applyAll(S, [custom({ routineId: 'r2' })]).status).toBe('ok')
    expect(S.customEx[0]).toMatchObject({ id: 'cwallsit', n: 'Cable Wall Sit', eq: 'custom', custom: true, tg: 'quads', uses: 'cable' })
    expect(S.routines[1].ex.map(e => e.id)).toEqual(['q', 'cwallsit'])
    expect(S.routines[1].ex[1]).toMatchObject({ sets: 3, reps: 12 })
  })
  it('the gear check sees the new lift while it reviews, and forgets it after', () => {
    let known = false
    const r = reviewProposal(offer([custom({ routineId: 'r2' })]), live(), () => { known = !!EXIDX.cwallsit; return okCheck() })
    expect(r.status).toBe('ok')
    expect(known).toBe(true)
    expect(EXIDX.cwallsit).toBeUndefined()
  })
  it('an id taken by a different lift is stale', () => {
    const S = live(); S.customEx = [{ id: 'cwallsit', n: 'Something else' }]
    expect(applyAll(S, [custom()]).status).toBe('stale')
  })
})

describe('several changes in one reply', () => {
  it('reads both the new list and an old single proposal', () => {
    expect(proposalsOf({ proposal: { kind: 'swap' } })).toHaveLength(1)
    expect(proposalsOf({ proposals: [{ kind: 'swap' }, { kind: 'edit' }] })).toHaveLength(2)
    expect(proposalsOf({ proposal: null })).toEqual([])
  })
  it('applies all of them with one Apply', () => {
    const S = live()
    const list = [{ kind: 'unsuperset', routineId: 'r1', exId: 'b' }, { kind: 'swap', routineId: 'r2', fromEx: 'q', toEx: 'z' }, { kind: 'today', action: 'skip', exId: 'a' }]
    expect(reviewProposal(offer(list), S, okCheck).status).toBe('ok')
    expect(applyAll(S, list).status).toBe('ok')
    expect(S.routines[0].ex.some(e => e.sg)).toBe(false)
    expect(S.routines[1].ex[0].id).toBe('z')
    expect(S.active.entries.some(e => e.id === 'a')).toBe(false)
  })
  it('one that does not fit blocks the whole set and says which', () => {
    const list = [{ kind: 'swap', routineId: 'r2', fromEx: 'q', toEx: 'z' }, { kind: 'remove', routineId: 'r1', exId: 'gone' }]
    expect(reviewProposal(offer(list), live(), okCheck)).toMatchObject({ status: 'stale', index: 1 })
    const gear = r => (r.ex.some(e => e.id === 'z') ? { ok: false, problems: [{ rule: 'gear', message: 'z: no gear' }] } : okCheck())
    const both = [{ kind: 'unsuperset', routineId: 'r1', exId: 'b' }, { kind: 'swap', routineId: 'r2', fromEx: 'q', toEx: 'z' }]
    expect(reviewProposal(offer(both), live(), gear)).toMatchObject({ status: 'blocked', problems: [{ message: 'z: no gear' }] })
  })
  it('reviewing never touches his state', () => {
    const S = live(); const was = JSON.stringify(S)
    reviewProposal(offer([{ kind: 'today', action: 'skip', exId: 'a' }, { kind: 'schedule', date: todayISO(), routineId: 'r2' }]), S, okCheck)
    expect(JSON.stringify(S)).toBe(was)
  })
})
