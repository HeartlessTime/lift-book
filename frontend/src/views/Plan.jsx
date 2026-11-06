import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { DAYN, uid, exCount } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { dayAssignSheet, loadStarterPlan, planToolsSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, useListEnter, listClass } from '../components/ui.jsx'
import { glyphOf, DEFAULT_GLYPH } from '../lib/glyphs.js'
import { gearNote } from '../components/GearCheck.jsx'
import ThisWeek from '../components/ThisWeek.jsx'

export default function Plan() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  // One flag for both lists on the page. They are stacked in a single column on a
  // phone, so continuing the count from the week schedule into the routines would
  // be right — but the cap lands at 8 and the week is 7 rows, so in practice every
  // routine would sit at the cap anyway. Each list restarting at 0 keeps the two
  // groups reading as two groups.
  const entering = useListEnter()

  const addRoutine = () => {
    const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
    update(s => { s.routines.push(r) })
    nav('/plan/r/' + r.id)
  }

  return <>
    <div className="hdr">
      <div><h1>{t('Plan')}</h1><div className="sub">{t('Your weekly routine')}</div></div>
      <button className="iconbtn" onClick={planToolsSheet} aria-label={t('Share your plan')} title={t('Share your plan')}><Icon name="upload" /></button>
    </div>
    <div className="cols"><div>
      <h4 className="sec">{t('Week schedule')}</h4>
      <div className={listClass(entering)} style={{ display: 'flex', flexDirection: 'column' }}>
        {[1, 2, 3, 4, 5, 6, 0].map((d, i) => {
          const r = S.routines.find(x => x.id === S.week[d])
          return <div key={d} className="ls-i" style={{ '--i': i }}>
            <div className="item" onClick={() => dayAssignSheet(d)}>
              <div className="grow"><div className="tt">{t(DAYN[d])}</div></div>
              {r ? <span className="tag acc"><Icon name={glyphOf(r.emoji)} />{r.name}</span> : <span className="tag">{t('Rest')}</span>}
              <Icon name="chevronRight" className="chev" /></div>
          </div>
        })}
      </div>
      <ThisWeek S={S} />
    </div><div>
      <div className="row between" style={{ marginTop: 22, marginBottom: 10 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Routines')}</h4>
        <Button size="sm" variant="tinted" icon="plus" onClick={addRoutine}>{t('New')}</Button>
      </div>
      {S.routines.length ? <div className={listClass(entering)}>{S.routines.map((r, i) =>
        <div key={r.id} className="ls-i" style={{ '--i': i }}>
          <div className="item" onClick={() => nav('/plan/r/' + r.id)}>
            <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
            <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}{gearNote(r, S) ? ' · ' + gearNote(r, S) : ''}</div></div>
            <Icon name="chevronRight" className="chev" /></div>
        </div>)}</div> : <>
        <div className="empty"><div className="ico"><Icon name="clipboard" /></div>{t('No routines yet.')}<br />{t('Create one or load the starter plan.')}</div>
        <Button icon="clipboard" onClick={loadStarterPlan}>{t('Load starter plan (Push / Pull / Legs)')}</Button>
      </>}
    </div></div>
  </>
}
