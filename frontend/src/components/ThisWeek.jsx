// "This week" on the Plan tab: how many times each muscle group is hit (two is the floor, rule 12)
// and what each training day actually holds once this week's variants are picked (lib/variety.js).
import { useMemo } from 'react'
import { weekCheck, GROUPS, MIN_HITS } from '../lib/variety.js'
import { todayISO, DAYN } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

const GROUP_NAME = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', core: 'Core'
}

export default function ThisWeek({ S }) {
  const today = todayISO()
  const wk = useMemo(() => {
    try { return weekCheck(S, today) } catch (e) { return null }
    // The week only changes when the plan, the gear or the history does.
  }, [today, JSON.stringify(S.routines), JSON.stringify(S.week), JSON.stringify(S.dayPlan), (S.workouts || []).length, JSON.stringify(S.gear), S.unit])
  if (!wk || !wk.days.length) return null
  const small = wk.problems.filter(p => p.rule !== 'coverage')

  return <div className="card" style={{ marginTop: 12 }}>
    <div className="row between" style={{ alignItems: 'center' }}>
      <span className="eyebrow"><Icon name="calendar" />{t('This week')}</span>
      <span className={'tag' + (wk.ok ? ' acc' : '')}>
        <Icon name={wk.ok ? 'checkCircle' : 'info'} />
        {wk.ok ? t('Every muscle twice') : t('{0} to fix', wk.problems.length)}
      </span>
    </div>
    <div className="mchips" style={{ marginTop: 10 }}>
      {GROUPS.map(g => <span key={g} className={'mchip' + ((wk.coverage[g] || 0) < MIN_HITS ? ' miss' : '')}>{t(GROUP_NAME[g])} {wk.coverage[g] || 0}</span>)}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
      {wk.days.map(d => <div key={d.date}>
        <div className="row between small" style={{ fontWeight: 600 }}>
          <span>{t(DAYN[new Date(d.date + 'T12:00:00').getDay()])} · {d.name}</span>
          <span className="dim" style={{ fontWeight: 400 }}>{t('~{0} min', Math.round(d.minutes))}</span>
        </div>
        <div className="small dim capitalize" style={{ lineHeight: 1.45 }}>
          {d.exercises.filter(e => e.mode !== 'cardio').map((e, i, list) => {
            const paired = e.sg && list[i - 1] && list[i - 1].sg === e.sg
            return <span key={i}>{i ? (paired ? ' + ' : ' · ') : ''}{e.name}</span>
          })}
        </div>
      </div>)}
    </div>
    {small.length > 0 && <ul className="small" style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {small.map((p, i) => <li key={i}>{p.message}</li>)}
    </ul>}
  </div>
}
