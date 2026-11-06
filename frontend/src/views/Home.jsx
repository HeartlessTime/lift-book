import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { effectiveRoutine, effectiveRoutineId, streakWeeks, lastBW, setsDoneActive, missedSession, moveMissed, restDay } from '../lib/history.js'
import { fmtNum, fmtDate, todayISO, isoOf, weekKey, DAYS, exCount } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { bwSheet, goalSheet, dayOverrideSheet, calendarSheet, startFlow, loadStarterPlan, bwDeltaColor } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { TrainerCard } from '../components/Trainer.jsx'
import { glyphOf } from '../lib/glyphs.js'
import { useRoll } from '../lib/roll.js'

// Home = what to do now + a quick glance. Deep charts & history live in Stats.
export default function Home() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const [weekOffset, setWeekOffset] = useState(0)
  // The one figure on this screen that changes while you are looking at it: the weigh-in
  // sheet closes over a Home that never unmounted, so the new weight arrives under your
  // eyes and counting to it says "this went up by that much" in a way a swap cannot.
  // Everything else here (the streak, the week's count) only ever changes behind a route
  // change, where roll.js correctly stays silent.

  const today = new Date()
  const routine = effectiveRoutine(S, todayISO())
  const todayOvr = S.dayPlan[todayISO()] !== undefined
  const bw = lastBW(S)
  const prevBW = S.bodyweight.length > 1 ? S.bodyweight[S.bodyweight.length - 2] : null
  const delta = bw && prevBW ? bw.w - prevBW.w : null

  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7)
  const doneDays = new Set(S.workouts.map(w => w.d))
  const strip = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    const iso = isoOf(d)
    const eff = effectiveRoutineId(S, iso), ovr = S.dayPlan[iso] !== undefined, done = doneDays.has(iso)
    const dot = done ? ' done' : ovr && eff ? ' ovr' : eff ? ' plan' : ''
    strip.push(<div key={i} className={'wday' + (iso === todayISO() ? ' today' : '')} onClick={() => dayOverrideSheet(iso)}>
      <div className="lbl">{t(DAYS[d.getDay()])}</div><div className="num">{d.getDate()}</div><div className={'dot' + dot} /></div>)
  }
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  const wkLabel = weekOffset === 0 ? t('This week') : `${monday.getDate()} ${monday.toLocaleDateString(dateLocale(), { month: 'short' })} – ${sunday.getDate()} ${sunday.toLocaleDateString(dateLocale(), { month: 'short' })}`

  const wThisWeek = S.workouts.filter(w => weekKey(w.d) === weekKey(todayISO())).length
  const plannedPerWeek = Object.keys(S.week).filter(k => S.week[k]).length
  const bwRoll = useRoll(bw ? bw.w : null, fmtNum)
  const activeDone = S.active ? setsDoneActive(S.active) : 0
  const activeTotal = S.active ? S.active.entries.reduce((n, e) => n + e.sets.length, 0) : 0
  const bwPoints = S.bodyweight.slice(-30).map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d }))

  // today's session shown right under the week strip
  const onToday = () => { if (S.active) nav('/workout'); else if (routine) startFlow(routine.id); else dayOverrideSheet(todayISO()) }

  // A planned day that came and went: offer to move it rather than make him re-plan by hand.
  const update = useStore(s => s.update), toast = useUI(s => s.toast)
  const miss = S.active ? null : missedSession(S)
  const moveMiss = slide => {
    const today = todayISO(), r = moveMissed(S, miss, today, slide)
    update(s => { s.dayPlan = moveMissed(s, miss, today, slide).dayPlan })
    const dropped = r.dropped && S.routines.find(x => x.id === r.dropped)
    toast(!slide ? t('{0} moved to today', miss.routine.name)
      : dropped ? t('{0} moved to today · {1} slid past Sunday and drops off this week', miss.routine.name, dropped.name)
      : t('{0} moved to today · the rest of the week slid back a day', miss.routine.name))
  }
  const skipMiss = () => { update(s => { s.dayPlan = restDay(s, miss.iso) }); toast(t('{0} set to rest', fmtDate(miss.iso))) }

  return <div className="narrow">
    <div className="hdr">
      <div><h1>{user ? t('Hi {0}', user.name) : 'Lift Book'}</h1><div className="sub">{today.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="gear" /></button>
    </div>

    {/* Today's session as the lock-screen card: what to do now gets the glow, the rest of
        Home stays calm. Same tap target and the same three outcomes as before. */}
    <div className="today-row glow" role="button" onClick={onToday}>
      <div className="glow-head">
        <span className="who"><Icon name={S.active ? 'timer' : routine ? glyphOf(routine.emoji) : 'moon'} /><span>{t('Today')}</span></span>
        {plannedPerWeek > 0 && <>
          <span className="capsule" aria-hidden="true"><i style={{ width: Math.min(100, wThisWeek / plannedPerWeek * 100) + '%' }} /></span>
          <span className="cnt">{wThisWeek}/{plannedPerWeek}</span>
          <span className="sep">·</span>
          <span className="clk">{t('This week')}</span>
        </>}
      </div>
      <div className="glow-body">
        <div className="info">
          <div className="glow-title">{S.active ? S.active.name : routine ? routine.name : t('Rest day')}</div>
          <div className="glow-detail">{S.active ? t('{0} sets', activeDone + '/' + activeTotal)
            : routine ? exCount(routine.ex.length) : t('Rest day')}</div>
          {(S.active || (todayOvr && routine)) && <div className="glow-foot">{S.active ? t('{0} — in progress', S.active.name) : t('rescheduled')}</div>}
        </div>
        <div className="glow-hero">
          {routine && !S.active && <Button size="xs" variant="ghost" className="chg" onClick={e => { e.stopPropagation(); dayOverrideSheet(todayISO()) }}>{t('Change')}</Button>}
          {S.active ? <span className="glow-pill"><Icon name="play" />{t('Resume')}</span>
            : routine ? <span className="glow-pill"><Icon name="play" />{t('Start')}</span>
            : <span className="glow-pill quiet"><Icon name="plus" /></span>}
        </div>
      </div>
    </div>

    <div className="card">
      <div className="row between" style={{ marginBottom: 8 }}>
        <button className="iconbtn" style={{ width: 36, height: 36, fontSize: 16 }} onClick={() => setWeekOffset(w => w - 1)} aria-label="Previous week"><Icon name="chevronLeft" /></button>
        <div className="small muted" style={{ fontWeight: 500 }}>{wkLabel}</div>
        <button className="iconbtn" style={{ width: 36, height: 36, fontSize: 16 }} onClick={() => setWeekOffset(w => w + 1)} aria-label="Next week"><Icon name="chevronRight" /></button>
      </div>
      <div className="week">{strip}</div>
    </div>

    {miss && <div className="card">
      <div className="row between" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 9, minWidth: 0 }}>
          <span className="lrow-i" style={{ color: 'var(--orange)' }}><Icon name={glyphOf(miss.routine.emoji)} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="tt" style={{ fontWeight: 500 }}>{t('Missed {0}', miss.routine.name)} · {fmtDate(miss.iso, true)}</div>
            <div className="small dim">{t('Move it to today?')}</div>
          </div>
        </div>
        <button className="iconbtn" style={{ width: 36, height: 36, fontSize: 16 }} onClick={skipMiss} aria-label={t('Skip it')}><Icon name="xmark" /></button>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <Button size="sm" variant="tinted" style={{ flex: 1 }} onClick={() => moveMiss(false)}>{t('Do it today')}</Button>
        <Button size="sm" icon="shuffle" style={{ flex: 1 }} onClick={() => moveMiss(true)}>{t('Slide the week')}</Button>
      </div>
    </div>}

    <TrainerCard />

    {!S.routines.length && !S.active && (
      <div className="card">
        <div className="row" style={{ gap: 10, marginBottom: 6 }}>
          <span className="lrow-i"><Icon name="dumbbell" /></span>
          <div className="big" style={{ fontSize: 22 }}>{t('Set up your week')}</div>
        </div>
        <div className="muted small" style={{ marginBottom: 12 }}>{t('Set up your weekly routine to get going — or load a ready-made Push / Pull / Legs plan.')}</div>
        <Button variant="primary" icon="clipboard" onClick={loadStarterPlan}>{t('Load starter plan (PPL)')}</Button>
        <div style={{ height: 8 }} /><Button onClick={() => nav('/plan')}>{t('Build my own plan')}</Button>
      </div>
    )}

    <div className="card">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{t('Body weight')}</h2>
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" icon="target" style={S.targetW ? { color: 'var(--yellow)' } : undefined} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
          <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
        </div>
      </div>
      {bw ? <>
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          {/* The number gets its own span because the roll writes textContent, which would
              otherwise take the unit beside it with it (see lib/roll.js). */}
          <div className="big"><span ref={bwRoll}>{fmtNum(bw.w)}</span> <span className="muted" style={{ fontSize: '1rem' }}>{S.unit}</span></div>
          {/* only when it actually moved — an unchanged weight used to read as "− 0" */}
          {!!delta && (
            <span className="small row" style={{ gap: 2, fontWeight: 500, color: bwDeltaColor(delta, bw.w) }}>
              <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} style={{ fontSize: 12 }} />
              {fmtNum(Math.abs(delta))}
            </span>
          )}
          <span className="dim small" style={{ marginLeft: 'auto' }}>{fmtDate(bw.d, true)}</span>
        </div>
        {S.targetW && (
          <div className="small row" style={{ color: 'var(--yellow)', marginTop: 4, gap: 5 }}>
            <Icon name="target" style={{ fontSize: 13 }} />
            <span>{t('Goal')} {fmtNum(S.targetW)} {S.unit} · {Math.abs(S.targetW - bw.w) < 0.05 ? t('reached') : t(S.targetW > bw.w ? '{0} to gain' : '{0} to lose', fmtNum(Math.abs(S.targetW - bw.w)) + ' ' + S.unit)}</span>
          </div>
        )}
        <div className="chart" style={{ marginTop: 8 }}><LineChart points={bwPoints} h={130} unit={S.unit} goal={S.targetW} /></div>
      </> : <div className="muted small">{t("No entries yet — log your weight to start the curve. It's also asked before every workout.")}</div>}
    </div>

    <div className="card tappable" style={{ cursor: 'pointer' }} onClick={() => calendarSheet()}>
      <div className="row between">
        <div>
          <div className="row num-r" style={{ gap: 8, fontSize: 22, fontWeight: 600 }}>
            <Icon name="flame" style={{ color: 'var(--orange)' }} />
            {t('{0} week streak', streakWeeks(S))}
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>{wThisWeek}{plannedPerWeek ? ' / ' + plannedPerWeek : ''} {t('this week')} · {t(S.workouts.length === 1 ? '{0} workout total' : '{0} workouts total', S.workouts.length)}</div>
        </div>
        <Icon name="calendar" className="chev" style={{ fontSize: 20 }} />
      </div>
    </div>
  </div>
}
