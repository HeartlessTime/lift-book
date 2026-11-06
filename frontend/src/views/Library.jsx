import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { useStore } from '../store/useStore.js'
import { EXDB, BODYPARTS, allExercises, equipmentOf, workedGroups } from '../lib/exercises.js'
import { bestWeightMap } from '../lib/history.js'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { Thumb } from '../components/Media.jsx'
import { exerciseDetailSheet, addToRoutineSheet, customExSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, useListEnter, listClass } from '../components/ui.jsx'
import { archivedIds, archivedWhy } from '../lib/gear.js'

export default function Library() {
  const S = useStore(s => s.S)
  const [q, setQ] = useState('')
  const [bp, setBp] = useState('')
  const [eq, setEq] = useState('')
  const [shown, setShown] = useState(40)
  // The stagger belongs to arriving at the Library, not to using it. Rows that
  // survive a keystroke keep their DOM node and never re-animate; rows that newly
  // match mount and rise in on their own, but only inside this window do they also
  // inherit a delay. Typing therefore re-filters instantly — a stagger that
  // replayed per keystroke would turn the search field into a slot machine.
  const entering = useListEnter()
  // One pass over history for the whole list. Asked per row it was 40 full scans of the log on
  // every keystroke, on top of re-filtering the exercise database.
  const best = useMemo(() => bestWeightMap(S), [S.workouts])
  const ql = q.toLowerCase().trim()
  const arch = archivedIds(S)
  const [showArch, setShowArch] = useState(false)
  const base = allExercises(S).filter(e => (showArch || !arch.has(e.id)) && (!bp || e.bp === bp) && (!ql || e.n.toLowerCase().includes(ql) || e.tg.includes(ql) || e.eq.includes(ql) || (e.desc || '').toLowerCase().includes(ql)))
  const eqOpts = equipmentOf(base)
  // Drop the equipment filter if the search narrowed it away, so you never hit a dead end.
  const eqOn = eqOpts.includes(eq) ? eq : ''
  const f = eqOn ? base.filter(e => e.eq === eqOn) : base

  // --- chip strip edge fade -------------------------------------------------
  // The app has no sticky chrome anywhere, so there is no nav bar for content to
  // fade under. The one real scroll edge in this view is horizontal: both chip
  // strips overflow, and the overflow was being sliced off with a straight razor
  // line mid-chip. This marks which side still has something past it, and
  // list-motion.css masks that side to a fade.
  //
  // Measured rather than assumed: a permanent fade on the left would grey out the
  // "All" chip while you are sitting at scroll zero, which is the state the strip
  // is in almost all the time.
  const bpChips = useRef(null)
  const eqChips = useRef(null)
  const edge = el => {
    if (!el) return
    const more = el.scrollWidth - el.clientWidth
    // 2px of slack: sub-pixel widths and rubber-band scrolling both overshoot by a
    // fraction, and a fade that flickers on at the end of a scroll is worse than none.
    const start = el.scrollLeft > 2
    const end = el.scrollLeft < more - 2
    el.dataset.edge = more <= 2 ? 'none' : start && end ? 'both' : start ? 'start' : end ? 'end' : 'none'
  }
  const onChipScroll = useCallback(e => edge(e.currentTarget), [])
  // Re-measured when the filters change, because narrowing the search can add or
  // remove the whole equipment strip and always changes how far it can scroll.
  useEffect(() => { edge(bpChips.current); edge(eqChips.current) })

  return <>
    <div className="hdr"><div><h1>{t('Exercises')}</h1><div className="sub">{arch.size ? t('{0} doable on your gear', EXDB.length - arch.size) : t('{0} exercises with animations', EXDB.length)}</div></div></div>
    <div className="search" style={{ marginBottom: 10 }}><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <input className="input" placeholder={t('Search…')} value={q} onChange={e => { setQ(e.target.value); setShown(40) }} /></div>
    <div className="chips" ref={bpChips} onScroll={onChipScroll} style={{ marginBottom: eqOpts.length > 1 ? 8 : 12 }}>
      <button className={'chip nocap' + (!bp ? ' on' : '')} onClick={() => { setBp(''); setEq(''); setShown(40) }}>{t('All')}</button>
      {BODYPARTS.map(b => <button key={b} className={'chip' + (bp === b ? ' on' : '')} onClick={() => { setBp(b); setEq(''); setShown(40) }}>{t(b)}</button>)}
    </div>
    {eqOpts.length > 1 && <div className="chips" ref={eqChips} onScroll={onChipScroll} style={{ marginBottom: 12 }}>
      <button className={'chip nocap' + (!eqOn ? ' on' : '')} onClick={() => { setEq(''); setShown(40) }}>{t('Any equipment')}</button>
      {eqOpts.map(x => <button key={x} className={'chip' + (eqOn === x ? ' on' : '')} onClick={() => { setEq(x); setShown(40) }}>{t(x)}</button>)}
    </div>}
    <div className={listClass(entering)}>
      <div className="ls-i" style={{ '--i': 0 }}>
        <div className="item" onClick={() => customExSheet(null, ex => exerciseDetailSheet(ex), q.trim())}>
          <div className="thumb thumb-x"><Icon name="plus" /></div>
          <div className="grow"><div className="tt">{t('Create your own exercise')}</div><div className="ss">{t('name + body part, no animation')}</div></div><Icon name="plus" className="chev" />
        </div>
      </div>
      {f.slice(0, shown).map((e, i) => {
        const bw = best[e.id] || 0
        // Keyed by exercise id, not by position: that is what lets a row survive a
        // keystroke without restarting its animation, and it is the reason the
        // stagger only ever needs disabling at the container.
        return <div key={e.id} className="ls-i" style={{ '--i': i + 1 }}>
          <div className="item" onClick={() => exerciseDetailSheet(e)}>
            <Thumb ex={e} />
            <div className="grow"><div className="tt capitalize">{e.n}</div><div className="ss capitalize">{workedGroups(e).map(m => t(m)).join(', ')} · {t(e.eq)}</div>
              {arch.has(e.id) && <div className="ss" style={{ color: 'var(--orange)' }}>{t('Archived')} · {archivedWhy(e.id, S)}</div>}</div>
            {bw > 0 && <span className="tag acc">{fmtNum(bw)}</span>}
            <Button size="sm" variant="tinted" icon="plus" onClick={ev => { ev.stopPropagation(); addToRoutineSheet(e) }}>{t('Plan')}</Button>
          </div>
        </div>
      })}
      {f.length === 0 && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
    </div>
    {f.length > shown && <><div style={{ height: 10 }} /><Button onClick={() => setShown(s => s + 40)}>{t('Show more')}</Button></>}
    {arch.size > 0 && <><div style={{ height: 10 }} /><Button variant="gray" icon={showArch ? 'xmark' : 'folder'} onClick={() => { setShowArch(x => !x); setShown(40) }}>
      {showArch ? t('Hide archived') : t('Show {0} archived (not doable on your gear)', arch.size)}</Button></>}
  </>
}
