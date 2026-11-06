// The gear check under a routine: what the planner thinks of this order (problems), a one-tap
// "Best order", and the setup steps — what to load where, and what comes off between lifts.
import { useMemo, useState } from 'react'
import { checkRoutine, orderRoutine, setupPlan } from '../lib/planner.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

export default function GearCheck({ routine, S, onApply }) {
  const [open, setOpen] = useState(false)
  // Re-run only when the exercises, the history the loads come from, or the gear change — not on
  // every keystroke in the routine name.
  const res = useMemo(() => {
    if (!routine || !routine.ex.length) return null
    return { check: checkRoutine(routine, S), best: orderRoutine(routine, S), steps: setupPlan(routine, S) }
    // update() deep-clones the state, so identities change on every edit: key on content instead.
    // History only moves when a workout is finished, so its length stands in for it.
  }, [JSON.stringify(routine && routine.ex), routine && routine.prog, (S.workouts || []).length, JSON.stringify(S.exWeights), JSON.stringify(S.gear), S.unit])
  if (!res) return null
  const { check, best, steps } = res
  const better = best.changes.length > 0 && !!onApply

  return <div className="card" style={{ marginTop: 12 }}>
    <div className="row between" style={{ alignItems: 'center' }}>
      <span className="eyebrow"><Icon name="plate" />{t('Gear check')}</span>
      <span className={'tag' + (check.ok ? ' acc' : '')}>
        <Icon name={check.ok ? 'checkCircle' : 'info'} />
        {check.ok ? t('Ready on your gear') : t('{0} to fix', check.problems.length)}
      </span>
    </div>

    {check.problems.length > 0 && <ul className="small" style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {check.problems.map((p, i) => <li key={i}>{p.message}</li>)}
    </ul>}

    {better && <div style={{ marginTop: 12 }}>
      <Button size="sm" variant="tinted" icon="shuffle" onClick={() => onApply(best.routine.ex)}>{t('Best order')}</Button>
      <div className="small dim" style={{ marginTop: 6 }}>{best.changes.map(c => c.text).join(' · ')}</div>
    </div>}

    <button className="btn ghost dim" style={{ marginTop: 12 }} onClick={() => setOpen(o => !o)}>
      {open ? t('Hide setup') : t('Show setup ({0} steps)', steps.length)}
    </button>
    {open && <ol className="small" style={{ margin: '8px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {steps.map((s, i) => <li key={i}>{s.text}</li>)}
    </ol>}
  </div>
}

// A one-glance count for a list row: '' when the routine is clean.
export function gearNote(routine, S) {
  try {
    if (!routine || !routine.ex.length) return ''
    const c = checkRoutine(routine, S)
    return c.ok ? '' : t('{0} gear notes', c.problems.length)
  } catch (e) { return '' }
}
