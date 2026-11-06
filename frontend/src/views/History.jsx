import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { WorkoutRow, workoutDetailSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { useListEnter, listClass } from '../components/ui.jsx'

export default function History() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const entering = useListEnter()
  return <>
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/stats')} aria-label={t('Stats')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 12 }}><h1>{t('History')}</h1><div className="sub">{t('{0} workouts', S.workouts.length)}</div></div></div>
    {/* WorkoutRow lives in sheets.jsx and takes no className, so the entry wrapper
        goes round the outside. It would go there anyway: the wrapper does arrival,
        the .item inside it does press, and neither can overwrite the other's
        transform. `--i` is the plain row index — list-motion.css caps it at 8. */}
    {S.workouts.length ? <div className={listClass(entering)}>{[...S.workouts].reverse().map((w, i) =>
      <div key={w.id} className="ls-i" style={{ '--i': i }}><WorkoutRow w={w} onClick={() => workoutDetailSheet(w)} /></div>)}</div>
      : <div className="empty"><div className="ico"><Icon name="history" /></div>{t('No workouts yet.')}</div>}
  </>
}
