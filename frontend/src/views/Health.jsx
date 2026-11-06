// Health — everything from the Apple Watch (via Apple Health) next to what Lift Book already knows:
// weight, lifts, resting heart rate, HRV, VO2 max, steps, energy, exercise, workouts.
//
// Deliberately styled after the iOS Health app rather than the rest of Lift Book (the owner,
// 2026-11-03): a grouped list of white/#1C1C1E cards, Apple's category colours, a D/W/M/6M/Y
// detail chart and plain-language highlights. Its stylesheet is styles/health.css, scoped under
// .hx so none of it leaks into the other screens.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { NATIVE } from '../lib/native.js'
import { todayISO, fmtDur } from '../lib/format.js'
import {
  CATS, METRICS, FAVOURITES, MORE, RANGES, series, headline, latestOf, trendOf, highlights,
  mainLifts, liftSeries, roundTo, addDays
} from '../lib/vitals.js'
import { syncHealth, lastHealthError } from '../lib/healthSync.js'
import HealthChart, { Spark } from '../components/HealthChart.jsx'
import Icon from '../components/Icon.jsx'
import '../styles/health.css'

/* ------------------------------------------------------------------ data -- */

let cache = null            // { days, workouts, updated } — survives moving between the screens
const listeners = new Set()
let inflight = null
let namesSent = false
function loadVitals() {
  if (!inflight) {
    inflight = api('/api/vitals?from=' + addDays(todayISO(), -400))
      .then(r => { cache = { days: r.days || {}, workouts: r.workouts || [], updated: r.updated || null } })
      .catch(() => { cache = cache || { days: {}, workouts: [], updated: null, offline: true } })
      .finally(() => { inflight = null; listeners.forEach(fn => fn(cache)) })
  }
  return inflight
}
if (typeof window !== 'undefined') window.addEventListener('vitals-updated', () => loadVitals())

function useVitals() {
  const [v, setV] = useState(cache)
  useEffect(() => {
    listeners.add(setV)
    loadVitals()
    return () => listeners.delete(setV)
  }, [])
  return v
}

// Light/dark follows the app's own theme switch.
function useDark() {
  const S = useStore(s => s.S)
  return S.theme !== 'light'
}
const catColor = (cat, dark) => CATS[cat][dark ? 'dark' : 'light']

// The page background is Health's grouped grey, not Lift Book's, while this screen is up.
function usePageBg() {
  useEffect(() => {
    document.documentElement.classList.add('hx-page')
    return () => document.documentElement.classList.remove('hx-page')
  }, [])
}

/* --------------------------------------------------------------- helpers -- */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function whenLabel(d, today) {
  if (!d) return ''
  if (d === today) return 'Today'
  if (d === addDays(today, -1)) return 'Yesterday'
  const dt = new Date(d + 'T12:00:00')
  return MON[dt.getMonth()] + ' ' + dt.getDate()
}
function clock(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
const fmt = (v, dp) => (v == null ? '—' : roundTo(v, dp).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp }))
// Lift weights keep a half plate (12.5) but drop a trailing .0.
const wt = v => (v == null ? '—' : roundTo(v, 1).toLocaleString(undefined, { maximumFractionDigits: 1 }))
const dayText = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
// "+2.5 lb since Oct 4", "No change since Sep 10", "New" (one session so far).
const changeText = (l, unit) => (l.delta == null ? 'New' : (l.delta === 0 ? 'No change' : `${l.delta > 0 ? '+' : '−'}${wt(Math.abs(l.delta))} ${unit}`) + ' since ' + dayText(l.since))
// Exercise names are stored lower-case ("smith incline bench press"); RDL and friends stay as typed.
const title = n => String(n).replace(/(^|\s)(\S)/g, (m, sp, c) => sp + c.toUpperCase())
// "Your Smith Incline Bench working weight is up 10 lb this month, to 185 lb × 8."
const liftLine = (l, unit) => {
  const name = title(l.name)
  return l.delta == null
  ? `Your ${name} working weight is ${wt(l.w)} ${unit} × ${l.r}. Keep logging it to see a trend.`
  : l.delta === 0 ? `Your ${name} working weight is holding at ${wt(l.w)} ${unit} × ${l.r}, no change since ${dayText(l.since)}.`
    : `Your ${name} working weight is ${l.delta > 0 ? 'up' : 'down'} ${wt(Math.abs(l.delta))} ${unit} this month, to ${wt(l.w)} ${unit} × ${l.r}.`
}
const unitOf = (key, S) => (key === 'weight' ? S.unit : METRICS[key].unit)

function rangeText(buckets, range, today) {
  if (!buckets.length) return ''
  if (range === 'D') return 'Today'
  const a = buckets[0].from, b = buckets[buckets.length - 1].to > today ? today : buckets[buckets.length - 1].to
  const f = iso => { const d = new Date(iso + 'T12:00:00'); return MON[d.getMonth()] + ' ' + d.getDate() }
  const yr = iso => iso.slice(0, 4)
  return f(a) + (yr(a) !== yr(b) ? ', ' + yr(a) : '') + ' – ' + f(b) + ', ' + yr(b)
}
function bucketText(b, range) {
  if (!b) return ''
  const d = new Date(b.from + 'T12:00:00')
  if (range === 'D') { const h = +b.key.split('T')[1]; return (h % 12 || 12) + (h < 12 ? ' AM' : ' PM') }
  if (range === 'Y') return MON[d.getMonth()] + ' ' + d.getFullYear()
  if (range === '6M') return 'Week of ' + MON[d.getMonth()] + ' ' + d.getDate()
  return MON[d.getMonth()] + ' ' + d.getDate()
}

/* ------------------------------------------------------------ components -- */

function Glass({ back, title, onBack }) {
  return (
    <div className="hx-bar">
      <button className="hx-back" onClick={onBack}><Icon name="chevronLeft" />{title ? <span className="sr">{back}</span> : <span>{back}</span>}</button>
      {title && <div className="hx-bar-title">{title}</div>}
    </div>
  )
}

function CatLabel({ cat, label, dark, right }) {
  return (
    <div className="hx-cat">
      <span className="hx-cat-l" style={{ color: catColor(cat, dark) }}><Icon name={CATS[cat].icon} />{label}</span>
      {right && <span className="hx-cat-r">{right}<Icon name="chevronRight" /></span>}
    </div>
  )
}

// The card's mini chart: the last week (sums) or two (averages). A sparse metric such as VO2
// max, read a few times a year, has nothing in that window, so it widens to six months and then
// a year until there are at least two readings to draw a line through.
function sparkBuckets(k, m, days, bodyweight, today) {
  const tries = m.kind === 'avg' ? [['M', -14], ['6M', 0], ['Y', 0]] : [['W', -7]]
  let out = []
  for (const [range, cut] of tries) {
    const b = series(k, range, days, bodyweight, today)
    out = cut ? b.slice(cut) : b
    if (out.filter(x => x.v != null).length >= 2) break
  }
  return out
}

function MetricCard({ k, S, days, today, dark, onOpen, updated }) {
  const m = METRICS[k]
  const last = latestOf(k, days, S.bodyweight)
  const sp = sparkBuckets(k, m, days, S.bodyweight, today)
  const when = last ? (last.d === today && updated && k !== 'weight' ? clock(updated) : whenLabel(last.d, today)) : ''
  return (
    <button className="hx-card" onClick={onOpen}>
      <CatLabel cat={m.cat} label={m.label} dark={dark} right={when} />
      <div className="hx-card-body">
        <div className="hx-val">
          {!last ? <span className="hx-none">No data</span>
            : k === 'hr' ? <>{fmt(last.lo, 0)}<span className="hx-dash">–</span>{fmt(last.hi, 0)}<span className="hx-unit">bpm</span></>
              : <>{fmt(last.v, m.dp)}<span className="hx-unit">{unitOf(k, S)}</span></>}
        </div>
        <Spark buckets={sp} type={m.chart} color={catColor(m.cat, dark)} />
      </div>
    </button>
  )
}

function LiftsCard({ lifts, dark, onOpen, unit }) {
  const color = catColor('strength', dark)
  return (
    <button className="hx-card" onClick={onOpen}>
      <CatLabel cat="strength" label="Working weight" dark={dark} right=" " />
      {!lifts.length ? <div className="hx-val"><span className="hx-none">Log a few weighted sets to see this</span></div>
        : <div className="hx-lifts">
          {lifts.slice(0, 4).map(l => <div key={l.id} className="hx-lift">
            <div className="hx-lift-n">{l.name}</div>
            <div className="hx-lift-v" style={{ color }}>{wt(l.w)}<span className="hx-unit">{unit} × {l.r}</span></div>
            <div className={'hx-delta ' + (l.delta > 0 ? 'up' : l.delta < 0 ? 'down' : '')}>
              {l.delta == null ? 'New' : <>{l.delta !== 0 && <Icon name={l.delta > 0 ? 'arrowUp' : 'arrowDown'} />}{l.delta === 0 ? 'No change' : `${wt(Math.abs(l.delta))} ${unit}`} since {dayText(l.since)}</>}
            </div>
          </div>)}
        </div>}
    </button>
  )
}

function WorkoutsCard({ S, vit, today, dark, onOpen }) {
  const since = addDays(today, -6)
  const hk = (vit?.workouts || []).filter(w => (w.d || w.start.slice(0, 10)) >= since)
  const gym = S.workouts.filter(w => w.d >= since)
  const mins = Math.round(hk.reduce((a, w) => a + (w.dur || 0), 0) / 60)
  return (
    <button className="hx-card" onClick={onOpen}>
      <CatLabel cat="activity" label="Workouts" dark={dark} right="Last 7 days" />
      <div className="hx-val">{gym.length}<span className="hx-unit">gym {gym.length === 1 ? 'session' : 'sessions'}</span>
        {hk.length > 0 && <span className="hx-val-2">{hk.length}<span className="hx-unit">watch · {mins} min</span></span>}</div>
    </button>
  )
}

// Shown when no watch data has reached the server yet: one calm card instead of empty charts.
function ConnectCard() {
  const [busy, setBusy] = useState(false)
  return (
    <div className="hx-card hx-empty hx-connect">
      <span className="hx-connect-i"><Icon name="heart" /></span>
      <div>
        <div className="hx-connect-t">Connect Apple Health</div>
        <p>{NATIVE ? 'Allow Lift Book to read Health data when iOS asks. Heart rate, steps and the rest fill in on their own.' : 'Open Lift Book on the iPhone and allow Health access. Heart rate, steps and the rest fill in on their own; weight and lifts already come from Lift Book.'}</p>
        {NATIVE && <button className="hx-link" disabled={busy} onClick={async () => {
          setBusy(true)
          await syncHealth({ getS: () => useStore.getState().S, update: fn => useStore.getState().update(fn), force: true })
          window.dispatchEvent(new Event('vitals-updated'))
          setBusy(false)
        }}>{busy ? 'Connecting…' : 'Connect'}</button>}
      </div>
    </div>
  )
}

function SyncNote({ vit }) {
  const [busy, setBusy] = useState(false)
  const getS = () => useStore.getState().S
  const update = fn => useStore.getState().update(fn)
  if (!NATIVE) {
    return <p className="hx-foot">{vit?.updated ? 'Watch data last synced from the iPhone app at ' + new Date(vit.updated).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '.' : 'Watch data arrives when the iPhone app is opened.'}</p>
  }
  const err = lastHealthError()
  return <p className="hx-foot">
    {err && <>{/entitlement/i.test(err) ? 'Apple Health access is not switched on in this build yet. ' : 'Could not read Apple Health (' + err + '). '}</>}
    {vit?.updated ? 'Synced from Apple Health at ' + clock(vit.updated) + '. ' : 'Reads from Apple Health when the app opens. '}
    <button className="hx-link" disabled={busy} onClick={async () => {
      setBusy(true)
      await syncHealth({ getS, update, force: true })
      window.dispatchEvent(new Event('vitals-updated'))
      setBusy(false)
    }}>{busy ? 'Syncing…' : 'Sync now'}</button>
  </p>
}

/* ---------------------------------------------------------------- views -- */

function Summary() {
  usePageBg()
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const dark = useDark()
  const vit = useVitals()
  const today = todayISO()
  const days = vit?.days || {}
  const lifts = useMemo(() => mainLifts(S, today), [S.workouts, today])
  const hl = useMemo(() => highlights(days, S.bodyweight, today, S.unit), [vit, S.bodyweight, today, S.unit])
  const liftHl = lifts.filter(l => l.delta).sort((a, b) => Math.abs(b.delta) / b.w - Math.abs(a.delta) / a.w)[0]
  const cards = [...hl.map(h => ({ ...h, cat: METRICS[h.key].cat })),
    ...(hl.length < 3 && liftHl ? [{ key: 'lifts', cat: 'strength', good: liftHl.delta > 0 ? 1 : -1,
      text: liftLine(liftHl, S.unit) }] : [])]
  const empty = !Object.keys(days).length
  // A metric with nothing recorded gets no card (Health does the same); the connect card covers it.
  const has = k => !!latestOf(k, days, S.bodyweight)
  // The server's summary (for briefs) only knows exercise ids; hand it the names of the main lifts.
  useEffect(() => {
    if (namesSent || !lifts.length) return
    namesSent = true
    api('/api/vitals', { method: 'POST', body: JSON.stringify({ liftNames: Object.fromEntries(lifts.map(l => [l.id, l.name])) }) }).catch(() => { namesSent = false })
  }, [lifts])

  return (
    <div className="hx">
      <Glass back="Stats" onBack={() => nav('/stats')} />
      <h1 className="hx-h1">Summary</h1>

      {cards.length > 0 && <section>
        <h2 className="hx-h2">Highlights</h2>
        {cards.map(h => <button key={h.key} className="hx-card hx-hl" onClick={() => nav(h.key === 'lifts' ? '/health/lifts' : '/health/' + h.key)}>
          <CatLabel cat={h.cat} label={h.key === 'lifts' ? 'Strength' : METRICS[h.key].label} dark={dark} right=" " />
          <p className="hx-hl-t">{h.text}</p>
        </button>)}
      </section>}

      {empty && vit && <ConnectCard />}

      <section>
        <h2 className="hx-h2">Favourites</h2>
        {FAVOURITES.filter(has).map(k => <MetricCard key={k} k={k} S={S} days={days} today={today} dark={dark} updated={vit?.updated} onOpen={() => nav('/health/' + k)} />)}
        <LiftsCard lifts={lifts} dark={dark} unit={S.unit} onOpen={() => nav('/health/lifts')} />
      </section>

      <section>
        <h2 className="hx-h2">More</h2>
        {MORE.filter(has).map(k => <MetricCard key={k} k={k} S={S} days={days} today={today} dark={dark} updated={vit?.updated} onOpen={() => nav('/health/' + k)} />)}
        <WorkoutsCard S={S} vit={vit} today={today} dark={dark} onOpen={() => nav('/health/workouts')} />
      </section>
      <SyncNote vit={vit} />
    </div>
  )
}

function RangeControl({ value, onChange, options = RANGES }) {
  const i = Math.max(0, options.indexOf(value))
  return (
    <div className="hx-seg" style={{ '--n': options.length, '--i': i }} role="tablist">
      <span className="hx-seg-sel" aria-hidden="true" />
      {options.map(o => <button key={o} role="tab" aria-selected={o === value} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>{o}</button>)}
    </div>
  )
}

const HEAD_LABEL = { avg: 'Average', daily: 'Daily average', total: 'Total', range: 'Range' }

function Detail({ k }) {
  usePageBg()
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const dark = useDark()
  const vit = useVitals()
  const today = todayISO()
  const m = METRICS[k]
  const [range, setRange] = useState(m.kind === 'avg' ? 'M' : 'W')
  const [sel, setSel] = useState(null)
  const days = vit?.days || {}
  const buckets = useMemo(() => series(k, range, days, S.bodyweight, today), [k, range, vit, S.bodyweight, today])
  const head = headline(k, buckets, range)
  const color = catColor(m.cat, dark)
  const unit = unitOf(k, S)
  const b = sel != null ? buckets[sel] : null
  const trend = trendOf(k, days, S.bodyweight, today, k === 'weight' ? S.unit : undefined)
  const chartType = range === 'D' && m.kind === 'avg' ? 'line' : m.chart

  let label, big, sub
  if (b) {
    label = m.kind === 'range' ? 'Range' : m.kind === 'sum' ? (range === 'D' || range === 'W' || range === 'M' ? 'Total' : 'Daily average') : 'Average'
    big = m.kind === 'range' ? <>{fmt(b.lo, 0)}<span className="hx-dash">–</span>{fmt(b.hi, 0)}</> : fmt(b.v, m.dp)
    sub = bucketText(b, range)
  } else if (head) {
    label = HEAD_LABEL[head.kind]
    big = head.kind === 'range' ? <>{fmt(head.lo, 0)}<span className="hx-dash">–</span>{fmt(head.hi, 0)}</> : fmt(head.v, m.dp)
    sub = rangeText(buckets, range, today)
  }

  return (
    <div className="hx">
      <Glass back="Summary" title={m.label} onBack={() => nav('/health')} />
      <div className="hx-sticky"><RangeControl value={range} onChange={r => { setRange(r); setSel(null) }} /></div>
      <div className="hx-card hx-detail">
        <div className="hx-head">
          <div className="hx-head-l">{label || HEAD_LABEL[m.kind === 'sum' ? 'daily' : m.kind] || 'Average'}</div>
          <div className="hx-head-v">{big != null ? <>{big}<span className="hx-unit">{unit}</span></> : <span className="hx-head-none">No data</span>}</div>
          <div className="hx-head-s">{sub || rangeText(buckets, range, today)}</div>
        </div>
        <HealthChart buckets={buckets} type={chartType} color={color} sel={sel} onSel={setSel} />
      </div>
      <h2 className="hx-h2">Highlights</h2>
      <div className="hx-card"><p className="hx-hl-t">{trend ? trend.text : 'Not enough readings yet to compare this week with the month before.'}</p></div>
      <p className="hx-foot">{ABOUT[k]}</p>
    </div>
  )
}

const ABOUT = {
  weight: 'From Lift Book weigh-ins and Apple Health. A weight you log in Lift Book wins over Health for that day.',
  rhr: 'Your lowest steady heart rate while awake and still, measured by the watch through the day. Lower usually means fitter.',
  hrv: 'Variation between heartbeats (SDNN), from the watch’s background readings. Higher usually means better recovered. It moves a lot day to day, so watch the trend.',
  vo2: 'Estimated from outdoor walks, runs and hikes with the watch on. Higher is better.',
  steps: 'Steps from the iPhone and the watch, counted once.',
  active: 'Energy burned by movement, on top of what you burn at rest.',
  exercise: 'Minutes of brisk activity or more, as the watch counts them.',
  hr: 'Lowest to highest heart rate the watch recorded in each period.'
}

function Lifts() {
  usePageBg()
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const dark = useDark()
  const today = todayISO()
  const lifts = useMemo(() => mainLifts(S, today, 8), [S.workouts, today])
  const [id, setId] = useState(null)
  const [range, setRange] = useState('M')
  const [sel, setSel] = useState(null)
  const cur = lifts.find(l => l.id === id) || lifts[0]
  const buckets = cur ? liftSeries(cur.pts, range, today) : []
  const color = catColor('strength', dark)
  const have = buckets.filter(b => b.v != null)
  const b = sel != null ? buckets[sel] : null
  // The headline: the tapped session, else the latest one in view.
  const shown = b && b.v != null ? b : have[have.length - 1] || null

  return (
    <div className="hx">
      <Glass back="Summary" title="Strength" onBack={() => nav('/health')} />
      <div className="hx-sticky"><RangeControl value={range} options={['W', 'M', '6M', 'Y']} onChange={r => { setRange(r); setSel(null) }} /></div>
      {!cur ? <div className="hx-card hx-empty"><p>No weighted sets in the last 90 days.</p></div> : <>
        <div className="hx-chips">
          {lifts.map(l => <button key={l.id} className={'hx-chip' + (l.id === cur.id ? ' on' : '')} style={l.id === cur.id ? { background: color } : undefined}
            onClick={() => { setId(l.id); setSel(null) }}>{l.name}</button>)}
        </div>
        <div className="hx-card hx-detail">
          <div className="hx-head">
            <div className="hx-head-l">Working weight</div>
            <div className="hx-head-v">{wt(shown?.v)}<span className="hx-unit">{S.unit}{shown?.r ? ` × ${shown.r}` : ''}</span></div>
            <div className="hx-head-s">{b ? bucketText(b, range) : changeText(cur, S.unit)}</div>
          </div>
          <HealthChart buckets={buckets} type="line" color={color} sel={sel} onSel={setSel} />
        </div>
        <h2 className="hx-h2">Highlights</h2>
        <div className="hx-card"><p className="hx-hl-t">{liftLine(cur, S.unit)}</p></div>
        <p className="hx-foot">Working weight is the weight you used for most of your completed sets each session. The change compares your latest session with one about a month earlier.</p>
      </>}
    </div>
  )
}

const WTYPE = { traditionalStrengthTraining: 'Strength training', functionalStrengthTraining: 'Functional strength', walking: 'Walk', running: 'Run', cycling: 'Ride', hiking: 'Hike', highIntensityIntervalTraining: 'HIIT', golf: 'Golf', other: 'Workout' }
const wName = t => WTYPE[t] || t.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())

function Workouts() {
  usePageBg()
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const dark = useDark()
  const vit = useVitals()
  const today = todayISO()
  const since = addDays(today, -29)
  const rows = [
    ...(vit?.workouts || []).filter(w => (w.d || w.start.slice(0, 10)) >= since)
      .map(w => ({ k: 'h' + w.id, d: w.d || w.start.slice(0, 10), t: Date.parse(w.start), name: wName(w.type), meta: [w.dur ? fmtDur(w.dur * 1000) : null, w.kcal ? Math.round(w.kcal) + ' kcal' : null, w.src].filter(Boolean).join(' · '), cat: 'activity' })),
    ...S.workouts.filter(w => w.d >= since)
      .map(w => ({ k: 'g' + w.id, d: w.d, t: w.start || 0, name: w.name || 'Workout', meta: ['Lift Book', w.end && w.start ? fmtDur(w.end - w.start) : null, w.entries.length + ' lifts'].filter(Boolean).join(' · '), cat: 'strength' }))
  ].sort((a, b) => b.t - a.t)
  return (
    <div className="hx">
      <Glass back="Summary" title="Workouts" onBack={() => nav('/health')} />
      <h2 className="hx-h2">Last 30 days</h2>
      {!rows.length ? <div className="hx-card hx-empty"><p>No workouts in the last 30 days.</p></div>
        : <div className="hx-card hx-list">{rows.map(r => <div key={r.k} className="hx-row">
          <span className="hx-row-i" style={{ background: catColor(r.cat, dark) }}><Icon name={r.cat === 'strength' ? 'dumbbell' : 'figureRun'} /></span>
          <span className="hx-row-m"><span className="hx-row-n">{r.name}</span><span className="hx-row-s">{r.meta}</span></span>
          <span className="hx-row-d">{whenLabel(r.d, today)}</span>
        </div>)}</div>}
    </div>
  )
}

export default function Health() {
  const { metric } = useParams()
  if (!metric) return <Summary />
  if (metric === 'lifts') return <Lifts />
  if (metric === 'workouts') return <Workouts />
  if (METRICS[metric]) return <Detail k={metric} />
  return <Summary />
}
