import { describe, it, expect, beforeEach, vi } from 'vitest'

// The store touches localStorage and document the moment it is imported, and jsdom isn't a
// dependency here, so stand up the handful of browser bits it actually uses first, then pull it in.
const mem = new Map()
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
  clear: () => mem.clear()
}
const docListeners = {}
globalThis.document = { addEventListener(t, f) { (docListeners[t] = docListeners[t] || []).push(f) }, removeEventListener() {}, visibilityState: 'visible' }
const fireVisibility = state => { document.visibilityState = state; (docListeners.visibilitychange || []).forEach(f => f()) }
if (!globalThis.navigator) globalThis.navigator = { userAgent: 'node' }

const { useStore, DEF, mergeStates } = await import('./useStore.js')

const clone = o => JSON.parse(JSON.stringify(o))
const st = (over = {}) => Object.assign(clone(DEF), over)
const wk = (id, d, name = id) => ({ id, d, name, entries: [], vol: 100 })

/* ---------------------------------------------------------------- fake API ---- */
// Mirrors the freshness rule in api/server.js `PUT /api/data` (that file has no test harness of
// its own), so these tests exercise the real client/server contract rather than a friendlier one.
let server = null            // the stored state object, or null for "nothing on file"
let calls = []
let offline = false

const reply = (status, body) => ({ ok: status < 400, status, json: async () => body })

const fetchImpl = async (path, opts = {}) => {
  if (offline) throw new Error('offline')
  const method = opts.method || 'GET'
  calls.push(method + ' ' + path)
  if (path !== '/api/data') return reply(404, { error: 'not found' })
  if (method === 'GET') return reply(200, { state: server })
  const body = JSON.parse(opts.body)
  const curTs = (server && server._ts) || 0
  const base = Number(body.baseTs)
  const inTs = body.state._ts || 0
  const stale = base > 0 ? base < curTs : inTs > 0 && inTs < curTs
  if (curTs && stale) return reply(409, { error: 'stale write', stale: true, ts: curTs })
  server = clone(body.state)
  delete server.active
  return reply(200, { ok: true, ts: inTs })
}
globalThis.fetch = vi.fn(fetchImpl)

const setLocal = S => useStore.setState({ S: clone(S) })
const local = () => useStore.getState().S

beforeEach(() => {
  mem.clear()
  calls = []
  offline = false
  server = null
  globalThis.fetch.mockImplementation(fetchImpl)
  useStore.setState({ user: { id: 'u1', name: 'Test' }, S: clone(DEF) })
})

/* ------------------------------------------------------------------ merge ---- */

describe('mergeStates', () => {
  it('keeps workouts from both sides, in date order', () => {
    const a = st({ _ts: 100, workouts: [wk('w1', '2026-01-01')] })
    const b = st({ _ts: 200, workouts: [wk('w2', '2026-01-02')] })
    expect(mergeStates(a, b).workouts.map(w => w.id)).toEqual(['w1', 'w2'])
    // symmetric — which argument is "local" must not decide what survives
    expect(mergeStates(b, a).workouts.map(w => w.id)).toEqual(['w1', 'w2'])
  })

  it('lets the newer side win a workout both sides have, without duplicating it', () => {
    const a = st({ _ts: 100, workouts: [{ ...wk('w1', '2026-01-01'), vol: 10 }] })
    const b = st({ _ts: 200, workouts: [{ ...wk('w1', '2026-01-01'), vol: 99 }] })
    const out = mergeStates(a, b).workouts
    expect(out).toHaveLength(1)
    expect(out[0].vol).toBe(99)
  })

  it('unions weigh-ins by date and keeps them sorted', () => {
    const a = st({ _ts: 200, bodyweight: [{ d: '2026-01-01', w: 80 }, { d: '2026-01-03', w: 81 }] })
    const b = st({ _ts: 100, bodyweight: [{ d: '2026-01-02', w: 79 }] })
    expect(mergeStates(a, b).bodyweight).toEqual([
      { d: '2026-01-01', w: 80 }, { d: '2026-01-02', w: 79 }, { d: '2026-01-03', w: 81 }
    ])
  })

  it('keeps the newer entry when both sides weighed in on the same day', () => {
    const a = st({ _ts: 100, bodyweight: [{ d: '2026-01-01', w: 80 }] })
    const b = st({ _ts: 200, bodyweight: [{ d: '2026-01-01', w: 82 }] })
    expect(mergeStates(a, b).bodyweight).toEqual([{ d: '2026-01-01', w: 82 }])
  })

  it('unions routines and custom exercises by id', () => {
    const a = st({ _ts: 100, routines: [{ id: 'r1', name: 'Push' }], customEx: [{ id: 'c1', n: 'sled' }] })
    const b = st({ _ts: 200, routines: [{ id: 'r2', name: 'Pull' }], customEx: [{ id: 'c2', n: 'yoke' }] })
    const out = mergeStates(a, b)
    expect(out.routines.map(r => r.id)).toEqual(['r1', 'r2'])
    expect(out.customEx.map(c => c.id)).toEqual(['c1', 'c2'])
  })

  it('keeps the heaviest entry in the weight cache', () => {
    const a = st({ _ts: 200, exWeights: { bench: { w: 100, d: '2026-01-02' }, squat: { w: 60, d: '2026-01-02' } } })
    const b = st({ _ts: 100, exWeights: { bench: { w: 120, d: '2026-01-01' } } })
    const out = mergeStates(a, b).exWeights
    expect(out.bench.w).toBe(120)
    expect(out.squat.w).toBe(60)
  })

  it('unions the weekly plan and per-day overrides', () => {
    const a = st({ _ts: 100, week: { 1: 'r1' }, dayPlan: { '2026-01-01': 'rest' } })
    const b = st({ _ts: 200, week: { 2: 'r2' }, dayPlan: { '2026-01-02': 'r2' } })
    const out = mergeStates(a, b)
    expect(out.week).toEqual({ 1: 'r1', 2: 'r2' })
    expect(out.dayPlan).toEqual({ '2026-01-01': 'rest', '2026-01-02': 'r2' })
  })

  it('takes settings from the newer side but keeps a setting only the older side has', () => {
    const a = st({ _ts: 100, unit: 'lb', targetW: 75 })
    const b = st({ _ts: 200, unit: 'kg' })
    delete b.targetW
    const out = mergeStates(a, b)
    expect(out.unit).toBe('kg')
    expect(out.targetW).toBe(75)
  })
})

/* ----------------------------------------------------------------- pullState ---- */

describe('pullState', () => {
  it('merges instead of overwriting when this device is dirty and the server has moved on', async () => {
    // Device A edited offline; device B logged a whole workout in the meantime.
    setLocal(st({ _ts: 500, workouts: [wk('a1', '2026-01-01')] }))
    localStorage.setItem('gym_dirty', '1')
    localStorage.setItem('gym_base_ts', '400')
    server = st({ _ts: 900, workouts: [wk('a1', '2026-01-01'), wk('b1', '2026-01-02')] })

    await useStore.getState().pullState()

    expect(local().workouts.map(w => w.id)).toEqual(['a1', 'b1'])
    expect(server.workouts.map(w => w.id)).toEqual(['a1', 'b1'])   // and the merge went back up
    expect(localStorage.getItem('gym_dirty')).toBe(null)
  })

  it('never drops the local-only workout of a dirty device, even with no sync token yet', async () => {
    setLocal(st({ _ts: 500, workouts: [wk('a1', '2026-01-01')] }))
    localStorage.setItem('gym_dirty', '1')                          // first sync after an update
    server = st({ _ts: 900, workouts: [wk('b1', '2026-01-02')] })

    await useStore.getState().pullState()

    expect(local().workouts.map(w => w.id)).toEqual(['a1', 'b1'])
  })

  it('takes the server copy when this device has nothing unsent, without re-dating it', async () => {
    setLocal(st({ _ts: 500, workouts: [wk('a1', '2026-01-01')] }))
    localStorage.setItem('gym_base_ts', '500')
    server = st({ _ts: 900, workouts: [wk('a1', '2026-01-01'), wk('b1', '2026-01-02')] })

    await useStore.getState().pullState()

    expect(local().workouts.map(w => w.id)).toEqual(['a1', 'b1'])
    expect(local()._ts).toBe(900)                                   // adopted, not re-stamped
    expect(localStorage.getItem('gym_base_ts')).toBe('900')
    expect(calls).toEqual(['GET /api/data'])                        // nothing to send back
  })

  it('pushes when only this device has moved on', async () => {
    setLocal(st({ _ts: 900, workouts: [wk('a1', '2026-01-01')] }))
    localStorage.setItem('gym_base_ts', '500')
    server = st({ _ts: 500 })

    await useStore.getState().pullState()

    expect(server.workouts.map(w => w.id)).toEqual(['a1'])
    expect(localStorage.getItem('gym_base_ts')).toBe('900')
  })

  it('takes the server copy on a device with no data of its own', async () => {
    setLocal(st({ _ts: 900 }))
    server = st({ _ts: 100, workouts: [wk('b1', '2026-01-02')] })

    await useStore.getState().pullState()

    expect(local().workouts.map(w => w.id)).toEqual(['b1'])
  })

  it('pushes when the server has nothing on file yet', async () => {
    setLocal(st({ _ts: 900, workouts: [wk('a1', '2026-01-01')] }))
    server = null

    await useStore.getState().pullState()

    expect(server.workouts.map(w => w.id)).toEqual(['a1'])
  })

  it('keeps local state untouched when the request fails', async () => {
    const mine = st({ _ts: 900, workouts: [wk('a1', '2026-01-01')] })
    setLocal(mine)
    offline = true

    await useStore.getState().pullState()

    expect(local().workouts.map(w => w.id)).toEqual(['a1'])
    expect(local()._ts).toBe(900)
  })
})

/* ----------------------------------------------------------------- pushState ---- */

describe('pushState', () => {
  it('sends the sync token so the server can refuse a blind overwrite', async () => {
    setLocal(st({ _ts: 900, workouts: [wk('a1', '2026-01-01')] }))
    localStorage.setItem('gym_base_ts', '500')
    server = st({ _ts: 500 })

    await useStore.getState().pushState()

    expect(JSON.parse(globalThis.fetch.mock.calls.at(-1)[1].body).baseTs).toBe(500)
    expect(localStorage.getItem('gym_base_ts')).toBe('900')
    expect(localStorage.getItem('gym_dirty')).toBe(null)
  })

  it('rescues a weigh-in the server recorded while this device held an older copy', async () => {
    // The live incident: the scale posts at 21:00, then the phone — which never read that write —
    // toggles a setting and pushes contents that predate it, carrying a *newer* _ts.
    localStorage.setItem('gym_base_ts', '500')
    server = st({ _ts: 900, workouts: [wk('a1', '2026-01-01')], bodyweight: [{ d: '2026-01-02', w: 80 }] })
    setLocal(st({ _ts: 1000, unit: 'lb', workouts: [wk('a1', '2026-01-01')] }))

    await useStore.getState().pushState()

    expect(server.bodyweight).toEqual([{ d: '2026-01-02', w: 80 }])   // the weigh-in survived
    expect(server.unit).toBe('lb')                                    // and so did the toggle
    expect(local().bodyweight).toEqual([{ d: '2026-01-02', w: 80 }])
    expect(localStorage.getItem('gym_dirty')).toBe(null)
  })

  it('gives up after one reconcile rather than looping, and keeps the work queued', async () => {
    localStorage.setItem('gym_base_ts', '500')
    server = st({ _ts: 900, workouts: [wk('b1', '2026-01-02')] })
    setLocal(st({ _ts: 1000, workouts: [wk('a1', '2026-01-01')] }))
    // Something else writes to the server between every read and write this device makes.
    const bump = () => { server = { ...server, _ts: server._ts + 1000 } }
    globalThis.fetch.mockImplementation((...args) => {
      const r = fetchImpl(...args)
      bump()
      return r
    })

    await useStore.getState().pushState()

    expect(localStorage.getItem('gym_dirty')).toBe('1')
    expect(calls.filter(c => c.startsWith('PUT')).length).toBeLessThanOrEqual(2)
    expect(local().workouts.map(w => w.id)).toEqual(['a1', 'b1'])     // nothing lost locally
    globalThis.fetch.mockImplementation(fetchImpl)
  })

  it('flags the state as unsent when the network is down', async () => {
    setLocal(st({ _ts: 900, workouts: [wk('a1', '2026-01-01')] }))
    offline = true

    await useStore.getState().pushState()

    expect(localStorage.getItem('gym_dirty')).toBe('1')
  })

  it('does nothing for a signed-out device', async () => {
    useStore.setState({ user: null })
    await useStore.getState().pushState()
    expect(calls).toEqual([])
  })
})

/* ---------------------------------------------------------------- resume ---- */
describe('coming back to the foreground', () => {
  const R = (id, name) => ({ id, name, ex: [] })

  it('pulls a change the server got while the app sat in the background', async () => {
    setLocal(st({ _ts: 500, routines: [R('a', 'Full Body A')], workouts: [wk('w1', '2026-10-19')] }))
    localStorage.setItem('gym_base_ts', '500')
    server = st({ _ts: 900, routines: [R('a', 'Full Body A (slots)')], workouts: [wk('w1', '2026-10-19')] })
    useStore.setState({ ready: true })

    fireVisibility('visible')
    await useStore.getState().resume()

    expect(calls).toEqual(['GET /api/data'])
    expect(local().routines[0].name).toBe('Full Body A (slots)')
    expect(localStorage.getItem('gym_base_ts')).toBe('900')
  })

  it('so the next edit lands on top of the server change instead of reverting it', async () => {
    setLocal(st({ _ts: 500, routines: [R('a', 'old')], workouts: [wk('w1', '2026-10-19')] }))
    localStorage.setItem('gym_base_ts', '500')
    server = st({ _ts: 900, routines: [R('a', 'new')], workouts: [wk('w1', '2026-10-19')] })
    useStore.setState({ ready: true })

    await useStore.getState().resume()
    useStore.getState().update(s => { s.weighIn = { ...s.weighIn, on: true } }, false)
    await useStore.getState().pushState()

    expect(calls).toEqual(['GET /api/data', 'PUT /api/data'])     // no 409, no merge
    expect(server.routines[0].name).toBe('new')
    expect(server.weighIn.on).toBe(true)
  })

  it('holds a queued push until the pull has answered', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      setLocal(st({ _ts: 500, routines: [R('a', 'old')], workouts: [wk('w1', '2026-10-19')] }))
      localStorage.setItem('gym_base_ts', '500')
      server = st({ _ts: 900, routines: [R('a', 'new'), R('b', 'added')], workouts: [wk('w1', '2026-10-19')] })
      useStore.setState({ ready: true })
      let release
      const gate = new Promise(r => { release = r })
      globalThis.fetch.mockImplementation(async (path, opts = {}) => {
        if ((opts.method || 'GET') === 'GET') { calls.push('GET ' + path); await gate; return reply(200, { state: server }) }
        return fetchImpl(path, opts)
      })

      const p = useStore.getState().resume()                       // pull in flight
      useStore.getState().update(s => { s.weighIn = { ...s.weighIn, on: true } })   // queues a push
      vi.advanceTimersByTime(2000)                                 // the push timer fires…
      await Promise.resolve()
      expect(calls).toEqual(['GET /api/data'])                     // …but waits for the pull

      release()
      await p
      await vi.runAllTimersAsync()
      expect(calls[0]).toBe('GET /api/data')
      expect(calls.slice(1).every(c => c === 'PUT /api/data')).toBe(true)
      expect(server.routines.map(r => r.id).sort()).toEqual(['a', 'b'])
      expect(server.weighIn.on).toBe(true)
    } finally { vi.useRealTimers() }
  })

  it('does nothing before boot has finished, or for a signed-out device', async () => {
    useStore.setState({ ready: false })
    await useStore.getState().resume()
    useStore.setState({ ready: true, user: null })
    await useStore.getState().resume()
    expect(calls).toEqual([])
  })
})
