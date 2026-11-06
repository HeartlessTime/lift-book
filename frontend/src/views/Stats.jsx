import { memo, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { EXIDX } from '../lib/exercises.js'
import { lastBW, streakWeeks, setLabel, modeOf, effortOf, vertOf, vertUnit } from '../lib/history.js'
import { fmtNum, fmtDate, fmtVol, todayISO, weekKey } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { bwSheet, goalSheet, calendarSheet, workoutDetailSheet, WorkoutRow, bwDeltaColor } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Heatmap from '../components/Heatmap.jsx'
import Icon from '../components/Icon.jsx'
import BodyMap, { BodyMapLegend } from '../components/BodyMap.jsx'
import { loadOfWorkouts, rankOf, MUSCLE_NAME } from '../lib/muscles.js'
import { stalledLifts, fuelCheck, muscleWeek, STALL_DAYS, MIN_WEIGH_INS } from '../lib/coach.js'
import { e1rmSeries, best1RM } from '../lib/onerm.js'
import {
  hasEffort, displayScale, scaleName, toScale, avgRir, effortSummary, effortWeeks,
  effortHistogram, isHardSet, HARD_RIR
} from '../lib/effort.js'
import { Button, Segmented, SelectRow, useListEnter, enterClass } from '../components/ui.jsx'
import { useRoll } from '../lib/roll.js'

const int = v => String(Math.round(v))

// Which muscles the training in a window actually hit — and, the point of the card,
// which ones it keeps missing. Shading is relative within the window (lib/muscles.js).
function MuscleBalanceBody({ S }) {
  const [win, setWin] = useState(7)
  const [hard, setHard] = useState(false)
  const [sel, setSel] = useState(null)
  const now = Date.now()
  const inWin = S.workouts.filter(w =>
    win === 0 ? true
      : win === 7 ? weekKey(w.d) === weekKey(todayISO())
        : (w.start || new Date(w.d).getTime()) > now - win * 86400000)
  // Counting only the sets taken near failure turns the map from "where did the volume go"
  // into "where did the stimulus go" — a muscle can lead on sets and still never be trained
  // hard. Offered only when the window holds ratings at all, since with none the hard map
  // would just be empty and read as "you trained nothing".
  const rated = inWin.some(w => w.entries.some(e => e.sets.some(s => s.done && isHardSet(s))))
  const on = hard && rated
  const load = loadOfWorkouts(inWin, on ? isHardSet : null)
  const { worked, missed } = rankOf(load)
  const top = worked.slice(0, 4)
  const max = worked.length ? load[worked[0]] : 0
  const sets = m => Math.round((load[m] || 0) * 10) / 10
  // The bar rows below stagger in while the card is arriving and never again — see the
  // `.ls-enter .mrow` note in styles/data-motion.css. Selecting a muscle unmounts the whole
  // top-four list and dismissing the selection mounts it back, so ungated this card played
  // its entrance every time you tapped the body map.
  const entering = useListEnter()

  return <div className={enterClass(entering, 'card')}>
    <div className="row between" style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0 }}>{t('Muscle balance')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {on ? t('by hard sets') : t('by sets worked')}</span></h2>
      {rated && <Button size="sm" icon="flame" style={on ? { color: 'var(--yellow)' } : undefined}
        onClick={() => { setHard(h => !h); setSel(null) }}>{on ? t('Hard') : t('All')}</Button>}
    </div>
    <Segmented className="seg-range" value={win} onChange={v => { setWin(v); setSel(null) }}
      options={[{ value: 7, label: t('Week') }, { value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 0, label: t('All') }]} />
    {inWin.length ? <>
      <BodyMap className="tappable" load={load} body={S.body} selected={sel}
        onMuscle={m => setSel(s => (s === m ? null : m))} />
      <BodyMapLegend />
      {sel && <div className="mrow" style={{ borderTop: 'var(--hair) solid var(--sep)', marginTop: 4, paddingTop: 10 }}>
        <span className="nm"><b>{t(MUSCLE_NAME[sel])}</b></span>
        <span className="v">{sets(sel) ? t('{0} sets', sets(sel)) : on ? t('no hard sets') : t('not trained')}</span>
      </div>}
      {!sel && top.map((m, i) => <div key={m} className="mrow" style={{ '--row-i': i }}>
        <span className="nm">{t(MUSCLE_NAME[m])}</span>
        <span className="bar"><i style={{ width: Math.round(load[m] / max * 100) + '%', background: on ? 'var(--yellow)' : undefined }} /></span>
        <span className="v">{t('{0} sets', sets(m))}</span>
      </div>)}
      {missed.length > 0 && <>
        <h4 className="sec" style={{ marginTop: 12 }}>{on ? t('No hard sets in this period') : t('Not trained in this period')}</h4>
        <div className="mchips">{missed.map(m => <span key={m} className="mchip miss">{t(MUSCLE_NAME[m])}</span>)}</div>
      </>}
      {!missed.length && worked.length > 0 &&
        <div className="muted small" style={{ marginTop: 10 }}>{on
          ? t('Every muscle group got at least one hard set in this period.')
          : t('Every muscle group got some work in this period.')}</div>}
    </> : <div className="muted small">{t('No workouts in this period yet.')}</div>}
  </div>
}

// The three cards below are the monthly read on the log — what to change in the program, and
// what not to. All the arithmetic lives in lib/coach.js; each card's job is to say plainly
// what it found, or say plainly that it has not seen enough training to find anything yet.

// Lifts that have stopped moving. "Moving" is weight *or* reps, because both are progress —
// and a lift that has been the same weight for the same reps for a month was too easy for
// most of that month, which is precisely the thing you notice by feel far too late.
function StallCardBody({ S }) {
  const { watched, stalled, ready } = stalledLifts(S)
  const weeks = d => Math.max(1, Math.round(d / 7))

  return <div className="card">
    <h2>{t('Stalled lifts')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {t('nothing added in {0} weeks', STALL_DAYS / 7)}</span></h2>
    {!ready
      ? <div className="muted small">{watched.length
        ? t('Watching {0} lifts. A stall only shows after about a month of one being in the plan — keep logging.', watched.length)
        : t('Not enough history yet — a lift needs three sessions before this can say anything about it.')}</div>
      : stalled.length ? <>
        {stalled.map(l => <div key={l.id} className="row between small" style={{ padding: '7px 0', borderBottom: 'var(--hair) solid var(--sep)' }}>
          <span>{l.name}</span>
          <span className="muted">{l.w > 0
            ? t('{0} weeks at {1}', weeks(l.days), fmtNum(l.w) + ' ' + S.unit)
            : t('{0} weeks at {1} reps', weeks(l.days), l.reps)}</span>
        </div>)}
        <div className="small" style={{ color: 'var(--yellow)', marginTop: 10 }}>
          {t('Same weight and the same reps for a month means the load stopped being hard. Add weight, add a rep, or swap the exercise.')}
        </div>
      </> : <div className="muted small">
        {t('Every lift in the plan has gone up in the last {0} weeks — weight or reps.', STALL_DAYS / 7)}
      </div>}
  </div>
}

// Body weight and strength on one card, because apart they give opposite advice. Lifts stuck
// while the scale falls is a food problem and rewriting the program is the one fix guaranteed
// not to work; the same stall at a steady weight really is the program. So the two numbers sit
// next to each other and the sentence underneath is the reading of the pair.
function FuelCardBody({ S }) {
  const [win, setWin] = useState(90)
  const { bw, lift, ready, moving, note } = fuelCheck(S, win)
  const pts = bw.pts.map(p => ({ t: p.t, y: p.w, d: p.d }))
  // Rolls when the window segment is tapped, which is the whole reason it is worth doing
  // here: 30d and 1Y are two readings of the same scale, and watching the trend travel
  // between them is the comparison. The lifts figure next to it is left alone — "4 / 11"
  // is a pair, and two numbers counting at once is a slot machine, not a readout.
  const perWeekRoll = useRoll(bw.perWeek, v => (v > 0 ? '+' : '') + fmtNum(v) + ' ' + S.unit)

  return <div className="card">
    <h2>{t('Weight & strength')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {t('are you eating enough')}</span></h2>
    <Segmented className="seg-range" value={win} onChange={setWin}
      options={[{ value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
    <div className="row between" style={{ alignItems: 'flex-end', gap: 12 }}>
      <div>
        <div className="stat-v" ref={perWeekRoll} style={{ color: bw.dir === 'down' ? 'var(--orange)' : 'inherit' }}>
          {bw.perWeek == null ? '—' : (bw.perWeek > 0 ? '+' : '') + fmtNum(bw.perWeek) + ' ' + S.unit}
        </div>
        <div className="small dim">{t('body weight per week')}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="stat-v">{lift.n ? lift.up + ' / ' + lift.n : '—'}</div>
        <div className="small dim">{t('lifts still going up')}</div>
      </div>
    </div>
    {note && <div className="small" style={{ color: moving ? 'var(--label)' : 'var(--yellow)', marginTop: 10 }}>{t(...note)}</div>}
    {!ready && <div className="small dim" style={{ marginTop: 10 }}>
      {bw.n < MIN_WEIGH_INS
        ? t('A weight trend needs at least {0} weigh-ins — {1} so far in this period. Keep stepping on the scale.', MIN_WEIGH_INS, bw.n)
        : bw.perWeek == null
          ? t('{0} weigh-ins, all inside {1} days. A fortnight of them tells a direction from the day-to-day swing; this cannot yet.', bw.n, bw.span)
          : t('A few more lifts with two sessions behind them and the strength half of this will mean something.')}
    </div>}
    {pts.length > 1 && <div className="chart" style={{ marginTop: 10 }}>
      <LineChart points={pts} h={130} unit={S.unit} goal={S.targetW} />
    </div>}
  </div>
}

// What a week of training actually covers, muscle by muscle — the list a weak-points day gets
// built from. The warm-up walk is excluded (lib/coach.js): the dataset calls it quads,
// hamstrings and calves, so counted at face value the treadmill at the top of every routine
// would credit legs on every training day and hide the exact gaps this card exists to show.
function CoverageCardBody({ S }) {
  const [win, setWin] = useState(7)
  const { worked, missed, warmup, workouts, ready } = muscleWeek(S, win)
  const light = [...worked].reverse().slice(0, 6)
  const max = worked.length ? worked[0].sets : 0
  const entering = useListEnter()

  return <div className={enterClass(entering, 'card')}>
    <h2>{t('Muscle coverage')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {t('sets per week')}</span></h2>
    <Segmented className="seg-range" value={win} onChange={setWin}
      options={[{ value: 7, label: t('Week') }, { value: 14, label: '2 wk' }, { value: 28, label: '4 wk' }]} />
    {!ready ? <div className="muted small">{t('Only {0} workouts in this period — too few to read a week of training from.', workouts)}</div> : <>
      <div className="stat-v">{t('{0} of {1}', worked.length, worked.length + missed.length)}</div>
      <div className="small dim">{t('muscle groups trained')}</div>
      {missed.length > 0 && <>
        <h4 className="sec" style={{ marginTop: 12 }}>{t('Nothing at all')}</h4>
        <div className="mchips">{missed.map(m => <span key={m} className="mchip miss">{t(MUSCLE_NAME[m])}</span>)}</div>
      </>}
      {light.length > 0 && <>
        {/* Sorted lightest first: on a full week the bottom of the list is the weak-points
            day, and on a thin one it is simply everything that got trained. */}
        <h4 className="sec" style={{ marginTop: 12 }}>{worked.length > light.length ? t('Least work') : t('Sets per muscle')}</h4>
        {light.map((r, i) => <div key={r.m} className="mrow" style={{ '--row-i': i }}>
          <span className="nm">{t(MUSCLE_NAME[r.m])}</span>
          <span className="bar"><i style={{ width: Math.round(r.sets / max * 100) + '%' }} /></span>
          <span className="v">{t('{0} sets', r.sets)}</span>
        </div>)}
      </>}
      <div className="small dim" style={{ marginTop: 10 }}>
        {warmup > 0
          ? t('The warm-up walk is left out — it would otherwise credit your legs on every training day.')
          : t('A supporting muscle counts as part of a set, so these come out fractional.')}
      </div>
    </>}
  </div>
}

// How hard the training was — the half of the picture a volume chart cannot show. Everything
// is computed in RIR (lib/effort.js) and converted to whichever scale this profile reads.
// Every number carries how much of the training it speaks for: rating is optional and off by
// default, so a partly rated history is the normal case, and an average without its
// denominator would quietly speak for sets that were never rated.
function EffortCardBody({ S }) {
  const [win, setWin] = useState(90)
  const kind = displayScale(S)
  const hd = scaleName(kind)
  const sum = effortSummary(S, win)
  const weeks = effortWeeks(S, win)
  const hist = effortHistogram(S, win)
  const maxBin = Math.max(1, ...hist.map(b => b.n))
  // The week's set count rides along in the tooltip, because the pair is the reading:
  // volume up with effort up is fatigue piling up, volume up with effort flat is adaptation.
  const pts = weeks.map(w => ({ t: w.t, y: toScale(kind, w.rir), note: t('{0} sets', w.sets) }))
  // Bins run hardest-first in both scales: RIR 0 and RPE 10 are the same set.
  const binLabel = b => kind === 'rpe' ? (b.tail ? '≤ 6' : String(10 - b.rir)) : (b.tail ? b.rir + '+' : String(b.rir))
  // Both roll on a window change. Average effort in particular barely moves between 30d and
  // 90d, and a figure that slides a tenth of a point is far easier to believe than one that
  // blinks — the movement is the evidence that the window did anything at all.
  const avgRoll = useRoll(sum.avg == null ? null : toScale(kind, sum.avg), v => fmtNum(v) + ' ' + hd)
  const hardRoll = useRoll(sum.hardPct == null ? null : sum.hardPct * 100, v => Math.round(v) + '%')
  const entering = useListEnter()

  return <div className={enterClass(entering, 'card')}>
    <h2>{t('Effort')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {t('how close to failure')}</span></h2>
    <Segmented className="seg-range" value={win} onChange={setWin}
      options={[{ value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
    {sum.rated === 0 ? <div className="muted small">{t('No rated sets in this period.')}</div> : <>
      <div className="row between" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div>
          <div className="stat-v" ref={avgRoll}>{sum.avg == null ? '—' : fmtNum(toScale(kind, sum.avg)) + ' ' + hd}</div>
          <div className="small dim">{t('average effort')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="stat-v" ref={hardRoll} style={{ color: 'var(--yellow)' }}>{sum.hardPct == null ? '—' : Math.round(sum.hardPct * 100) + '%'}</div>
          <div className="small dim">{t('at {0} {1} or harder', hd, fmtNum(toScale(kind, HARD_RIR)))}</div>
        </div>
      </div>
      <div className="small dim" style={{ marginTop: 8 }}>{t('{0} of {1} finished sets rated', sum.rated, sum.done)}</div>
      {effortOf(S) === 'none' && <div className="small" style={{ color: 'var(--yellow)', marginTop: 4 }}>
        {t('Effort per set is switched off — turn it on in Settings to keep rating.')}
      </div>}
      {pts.length > 1 && <>
        <h4 className="sec" style={{ marginTop: 12 }}>{t('Week by week')}</h4>
        <div className="chart"><LineChart points={pts} h={140} unit={hd} color="var(--yellow)" invert={kind === 'rir'} /></div>
      </>}
      <h4 className="sec" style={{ marginTop: 12 }}>{t('Where the sets land')}</h4>
      {hist.map((b, i) => <div key={b.rir} className="mrow" style={{ '--row-i': i }}>
        <span className="nm">{hd} {binLabel(b)}</span>
        <span className="bar"><i style={{ width: Math.round(b.n / maxBin * 100) + '%', background: b.rir <= HARD_RIR ? 'var(--yellow)' : 'var(--label-3)' }} /></span>
        <span className="v">{b.n ? b.n + ' · ' + Math.round(b.pct * 100) + '%' : '—'}</span>
      </div>)}
      <div className="small dim" style={{ marginTop: 8 }}>
        {t('Most working sets belong close to failure without living there — half at the floor and half at the top average out to a healthy-looking middle.')}
      </div>
    </>}
  </div>
}

/* Memoised on the one prop they take. None of them reads Stats' own view state, so a tap on
   any range segment further down the page must not put every card through its arithmetic
   again — the state object only changes identity when the log itself does. */
const MuscleBalance = memo(MuscleBalanceBody)
const StallCard = memo(StallCardBody)
const FuelCard = memo(FuelCardBody)
const CoverageCard = memo(CoverageCardBody)
const EffortCard = memo(EffortCardBody)

// Stats = the analytics hub: all charts, progress and history live here.
export default function Stats() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [range, setRange] = useState(90)
  const [exId, setExId] = useState(null)
  const [exMetric, setExMetric] = useState('top')
  const now = Date.now()
  const anyEffort = hasEffort(S)
  const kind = displayScale(S)
  const hd = scaleName(kind)

  const bwPts = S.bodyweight.filter(b => range === 0 || (b.t || new Date(b.d).getTime()) > now - range * 86400000)
    .map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d }))
  const bw30 = S.bodyweight.filter(b => (b.t || new Date(b.d).getTime()) > now - 30 * 86400000)
  const bwDelta30 = bw30.length > 1 ? bw30[bw30.length - 1].w - bw30[0].w : null
  const monthW = S.workouts.filter(w => w.d.slice(0, 7) === todayISO().slice(0, 7)).length
  const streak = useMemo(() => streakWeeks(S), [S.workouts])

  // Every exercise ever logged, in name order — a full walk of the log, so it is recomputed
  // only when the log changes rather than on every range/metric tap on this page.
  const exHist = useMemo(() =>
    [...new Set(S.workouts.flatMap(w => w.entries.map(e => e.id)))].filter(id => EXIDX[id]).sort((a, b) => EXIDX[a].n < EXIDX[b].n ? -1 : 1),
  [S.workouts])
  const curEx = exId && exHist.includes(exId) ? exId : exHist[0] || null
  // How this exercise was logged most recently decides what the curve means: top weight,
  // longest hold or vertical climb. Sets logged in another mode lack the field and score 0,
  // so a switched exercise drops its old points instead of mixing seconds into a weight
  // chart. Cardio charts climb rather than speed: on a treadmill warm-up the pace barely
  // moves, and the number that actually goes up over months is the elevation.
  const curMode = useMemo(() => {
    if (!curEx) return 'reps'
    for (let i = S.workouts.length - 1; i >= 0; i--) {
      const en = S.workouts[i].entries.find(e => e.id === curEx)
      if (en) return modeOf({ ...(en.target || {}), id: curEx })
    }
    return modeOf({ id: curEx })
  }, [S.workouts, curEx])
  const curCardio = curMode === 'cardio'
  const curTimed = curMode === 'time'
  // Climb is per-set, and the chart wants the session — so cardio sums its sets where the
  // other modes take the best one. Two 10-minute stretches are one walk, not two attempts.
  const exUnit = curCardio ? vertUnit(S.unit) : curTimed ? 's' : S.unit
  const { exPts, exList, exBest } = useMemo(() => {
    const metric = s => curCardio ? vertOf(s) : curTimed ? (s.sec || 0) : (s.w || 0)
    const pts = []
    let bestV = 0
    if (curEx) {
      S.workouts.forEach(w => {
        const en = w.entries.find(e => e.id === curEx)
        if (en) {
          const done = en.sets.filter(s => s.done)
          const mx = curCardio
            ? done.reduce((n, s) => n + metric(s), 0)
            : Math.max(0, ...done.map(metric), curTimed ? 0 : (en.topW || 0))
          if (mx > 0) { pts.push({ t: w.start, y: mx, d: w.d, sets: en.sets.filter(s => s.done), target: en.target }); if (mx > bestV) bestV = mx } }
      })
    }
    return { exPts: pts, exList: curEx ? pts.slice(-5).reverse() : [], exBest: bestV }
  }, [S.workouts, curEx, curCardio, curTimed])
  // Estimated 1RM (issue #18) — only reps-mode training produces one, so cardio and timed
  // work simply have no points and the toggle stays hidden.
  const e1Pts = useMemo(() => (curEx ? e1rmSeries(S, curEx) : []), [S.workouts, curEx])
  const e1Best = useMemo(() => (curEx ? best1RM(S, curEx) : null), [S.workouts, curEx])
  const showE1 = e1Pts.length > 0
  // Effort on this exercise, per session. It rides on the top-set curve as well as having a
  // curve of its own, because the two only mean something together: the same weight moved
  // with more left in the tank is progress a weight-only chart draws as a flat line.
  const exRir = exPts.map(p => avgRir(p.sets))
  const showEff = exRir.filter(v => v != null).length >= 3
  const effPts = exPts.map((p, i) => (exRir[i] == null ? null : { t: p.t, y: toScale(kind, exRir[i]), d: p.d })).filter(Boolean)
  const onE1 = showE1 && exMetric === 'e1rm'
  const onEff = showEff && exMetric === 'effort'
  const topPts = exPts.map((p, i) => ({
    t: p.t, y: p.y, d: p.d,
    // 0 RIR (nothing left) is a full dot, 4+ a faint one; unrated sessions keep the plain line.
    m: exRir[i] == null ? null : 1 - Math.min(4, Math.max(0, exRir[i])) / 4,
    note: exRir[i] == null ? undefined : hd + ' ' + fmtNum(toScale(kind, exRir[i]))
  }))
  // The four tiles and the best-ever figure. Stats is a route, so a tab away and back is a
  // fresh mount and these are simply there — roll.js only speaks on the second value. What
  // reaches it is a change made in place: finishing a workout in a session that never left
  // this screen, and (for the best figure) picking a different exercise or flipping to
  // Est. 1RM, where the number really does travel from one reading to another.
  const bestV = onE1 ? (e1Best ? e1Best.est : null) : exBest
  const tWorkouts = useRoll(S.workouts.length, int)
  const tMonth = useRoll(monthW, int)
  const tStreak = useRoll(streak, int)
  const tBw30 = useRoll(bwDelta30, v => (v > 0 ? '+' : '') + fmtNum(v) + ' ' + S.unit)
  const bestRoll = useRoll(bestV, fmtNum)

  const exOpts = [{ value: 'top', label: t('Top set') }]
  if (showE1) exOpts.push({ value: 'e1rm', label: t('Est. 1RM') })
  if (showEff) exOpts.push({ value: 'effort', label: t('Effort') })

  return <>
    <div className="hdr"><div><h1>{t('Stats')}</h1><div className="sub">{t('Progress & history')}</div></div>
      <button className="iconbtn" onClick={() => nav('/history')} aria-label={t('History')}><Icon name="history" /></button></div>

    <div className="sect-b" style={{ marginBottom: 16 }}>
      <button className="lrow tap" onClick={() => nav('/health')}>
        <span className="lrow-i" style={{ background: '#ff375f', color: '#fff' }}><Icon name="heart" /></span>
        <span className="lrow-m"><span className="lrow-t">{t('Health')}</span><span className="lrow-s">{t('Weight, heart, steps and lifts from your watch and Lift Book')}</span></span>
        <span className="lrow-c dim"><Icon name="chevronRight" /></span>
      </button>
    </div>

    <div className="tiles">
      <div className="tile glow sm"><div className="l"><Icon name="dumbbell" />{t('Workouts')}</div><div className="v" ref={tWorkouts}>{S.workouts.length}</div></div>
      <div className="tile glow sm"><div className="l"><Icon name="calendar" />{t('This month')}</div><div className="v" ref={tMonth}>{monthW}</div></div>
      <div className="tile glow sm"><div className="l"><Icon name="flame" />{t('Week streak')}</div><div className="v" ref={tStreak}>{streak}</div></div>
      <div className="tile glow sm"><div className="l"><Icon name="scale" />{t('Weight 30d')}</div><div className="v" ref={tBw30} style={{ fontSize: 24, color: bwDelta30 === null ? 'inherit' : bwDeltaColor(bwDelta30, (lastBW(S) || {}).w || 0) }}>{bwDelta30 === null ? '—' : (bwDelta30 > 0 ? '+' : '') + fmtNum(bwDelta30) + ' ' + S.unit}</div></div>
    </div>

    <div className="card">
      <h2>{t('Activity — last 12 months')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {t('by time trained')}</span></h2>
      <Heatmap S={S} onDay={iso => { const ws = S.workouts.filter(w => w.d === iso); if (ws.length === 1) workoutDetailSheet(ws[0]); else if (ws.length) calendarSheet(iso) }} />
    </div>

    {S.workouts.length > 0 && <MuscleBalance S={S} />}
    {S.workouts.length > 0 && <StallCard S={S} />}
    {S.workouts.length > 0 && <FuelCard S={S} />}
    {S.workouts.length > 0 && <CoverageCard S={S} />}
    {anyEffort && <EffortCard S={S} />}

    <div className="cols">
      <div className="card">
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>{t('Body weight')}</h2>
          <div className="row" style={{ gap: 8 }}>
            <Button size="sm" icon="target" style={S.targetW ? { color: 'var(--yellow)' } : undefined} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
            <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
          </div>
        </div>
        <Segmented className="seg-range" value={range} onChange={setRange}
          options={[{ value: 30, label: '1M' }, { value: 90, label: '3M' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
        <div className="chart"><LineChart points={bwPts} h={160} unit={S.unit} goal={S.targetW} /></div>
      </div>

      <div className="card">
        <h2>{t('Exercise progress')}</h2>
        {exHist.length ? <>
          <div className="sect-b" style={{ marginBottom: 10 }}>
            <SelectRow title={t('Exercise')} sheetTitle={t('Exercise progress')} value={curEx} onChange={setExId}
              options={exHist.map(id => ({ value: id, label: EXIDX[id].n }))} />
          </div>
          {exOpts.length > 1 && <Segmented className="seg-range" value={onEff ? 'effort' : onE1 ? 'e1rm' : 'top'} onChange={setExMetric} options={exOpts} />}
          <div className="chart">
            {onEff
              ? <LineChart points={effPts} h={150} unit={hd} color="var(--yellow)" invert={kind === 'rir'} />
              : <LineChart points={onE1 ? e1Pts.map(p => ({ t: p.t, y: p.y, d: p.d })) : topPts} h={150} unit={exUnit} color="var(--blue)" />}
          </div>
          <div style={{ marginTop: 8 }}>{exList.map((p, i) => <div key={i} className="row between small" style={{ padding: '6px 0', borderBottom: 'var(--hair) solid var(--sep)' }}>
            <span className="muted">{fmtDate(p.d, true)}</span><span>{p.sets.map(s => setLabel(curEx, s, p.target, S.unit)).join('  ')}</span></div>)}</div>
          <div className="small dim" style={{ marginTop: 8 }}>
            {onEff ? t('Average effort per workout') : onE1 ? t('Estimated 1RM per workout') : curCardio ? t('Vertical climb per workout') : curTimed ? t('Longest hold per workout') : t('Best set weight per workout')}
            {onEff ? '' : <> · {t('Best:')}{' '}<b className="accent"><span ref={bestRoll}>{fmtNum(bestV)}</span> {onE1 ? S.unit : exUnit}</b></>}
          </div>
          {onE1 && <div className="small dim" style={{ marginTop: 4 }}>
            {t('Best estimate from {0} on {1} — an estimate, not a tested max.', fmtNum(e1Best.w) + ' ' + S.unit + ' × ' + e1Best.r, fmtDate(e1Best.d, true))}
          </div>}
          {!onEff && !onE1 && showEff && <div className="small dim" style={{ marginTop: 4 }}>
            {t('A fuller dot means less left in the tank — the same weight at a lower {0} is progress the line alone does not show.', hd)}
          </div>}
        </> : <div className="muted small">{t('Finish your first workout to see progress curves here.')}</div>}
      </div>
    </div>

    {S.workouts.length > 0 && <>
      <div className="row between" style={{ marginBottom: 10 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Recent workouts')}</h4>
        <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/history')}>{t('All')} {S.workouts.length}</Button>
      </div>
      <div className="list">{[...S.workouts].reverse().slice(0, 6).map(w => <WorkoutRow key={w.id} w={w} onClick={() => workoutDetailSheet(w)} />)}</div>
    </>}
  </>
}
