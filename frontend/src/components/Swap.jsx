// The Swap sheet: pick a stand-in for the lift in front of him, from lib/swap.js's list (same
// muscle group, doable on his gear), for today only or from now on.
import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { exOr, workedGroups } from '../lib/exercises.js'
import { lastEntryFor } from '../lib/history.js'
import { swapOptions, swapInSession } from '../lib/swap.js'
import { Thumb } from './Media.jsx'
import Icon from './Icon.jsx'
import { Button, Segmented } from './ui.jsx'

export function openSwap(idx) {
  useUI.getState().openSheet(close => <Swap idx={idx} close={close} />)
}

function Swap({ idx, close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const A = S.active
  const entry = A.entries[idx]
  const inRoutine = !!A.routineId
  const [when, setWhen] = useState(inRoutine ? 'always' : 'today')
  const [shown, setShown] = useState(25)
  const opts = useMemo(() => swapOptions(S, entry.id, A.entries.map(e => e.id)), [S, entry.id, A.entries])
  const from = exOr(entry.id)
  const routine = inRoutine ? (S.routines.find(r => r.id === A.routineId) || {}).name : ''

  const pick = ex => {
    let changed = false
    update(s => { changed = swapInSession(s, idx, ex.id, when === 'always') })
    close()
    useUI.getState().toast(changed ? t('Swapped in {0}', routine) : t('Swapped for today'))
  }

  return <>
    <div className="row between" style={{ marginBottom: 6 }}>
      <h3 style={{ margin: 0 }}>{t('Swap exercise')}</h3>
      <button className="iconbtn" aria-label={t('Close')} onClick={close}><Icon name="xmark" /></button>
    </div>
    <div className="small dim capitalize" style={{ marginBottom: 10 }}>{t('Instead of {0}', from.n)}</div>
    {inRoutine && <Segmented value={when} onChange={setWhen}
      options={[{ value: 'always', label: t('From now on') }, { value: 'today', label: t('Today only') }]} />}
    <div style={{ height: 10 }} />
    {!opts.length && <div className="empty">{t('Nothing else for this muscle fits your gear.')}</div>}
    <div className="list">
      {opts.slice(0, shown).map(e => <div key={e.id} className="item" onClick={() => pick(e)}>
        <Thumb ex={e} /><div className="grow"><div className="tt capitalize">{e.n}</div><div className="ss capitalize">{workedGroups(e).map(m => t(m)).join(', ')} · {t(e.eq)}</div></div>
        {lastEntryFor(S, e.id) && <span className="tag nocap">{t('Done before')}</span>}<Icon name="chevronRight" className="chev" />
      </div>)}
    </div>
    {opts.length > shown && <><div style={{ height: 8 }} /><Button variant="gray" onClick={() => setShown(s => s + 25)}>{t('Show more')}</Button></>}
  </>
}
