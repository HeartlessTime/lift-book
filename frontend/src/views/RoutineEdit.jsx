import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { exOr } from '../lib/exercises.js'
import { t } from '../lib/i18n.js'
import { supersetUnits, cleanupSg, exLine, moveInRoutine, toggleSuperset } from '../lib/history.js'
import { Thumb } from '../components/Media.jsx'
import { glyphPicker, exercisePicker, exConfigSheet, confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { glyphOf } from '../lib/glyphs.js'
import { Button, SelectRow, useListEnter, listClass } from '../components/ui.jsx'
import { POLICIES_FOR, POLICY_NAME, POLICY_DESC } from '../lib/progression.js'
import BodyMap from '../components/BodyMap.jsx'
import { loadOfRoutine, rankOf, MUSCLE_NAME } from '../lib/muscles.js'
import { reducedMotion, dur } from '../lib/motion.js'
import GearCheck from '../components/GearCheck.jsx'
import { hasSlots, isSlot, resolveWeek, resolveRoutine } from '../lib/variety.js'
import { todayISO } from '../lib/format.js'

export default function RoutineEdit() {
  const nav = useNavigate()
  const { id } = useParams()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const r = S.routines.find(x => x.id === id)
  useEffect(() => { if (!r) nav('/plan') }, [!!r])
  if (!r) return null

  const edit = fn => update(s => { fn(s.routines.find(x => x.id === id).ex) })

  const entering = useListEnter()
  const listRef = useRef(null)
  // The index currently playing its exit animation. Same bargain useUI now makes
  // for sheets: the row has to stay mounted long enough to be seen leaving, so the
  // store write is held back until the animation is over.
  const [leaving, setLeaving] = useState(null)

  /* ---------------------------------------------------------- content FLIP --
     These rows are keyed by position, because an entry in `r.ex` has no identity
     of its own — the same exercise can legitimately appear twice in one routine,
     so there is nothing unique to key on without changing the stored shape.

     That has a consequence worth being explicit about: on a reorder React never
     MOVES a node. It repaints the node that is already in that slot with the next
     item's content. A textbook FLIP — measure a node, watch it travel — therefore
     measures exactly zero, every time.

     So we FLIP the CONTENT instead. Snapshot where every row sits before the store
     write; afterwards, ask each row where the content it is NOW showing used to
     live, put it back there with a transform, and let it travel home. `src(k)` is
     the only thing that changes between operations:
       · swap i and j  → src = identity, except i↔j
       · delete at i   → src = k >= i ? k + 1 : k   (everything below shifts up one)

     One WAAPI call per row that actually moved, transform only, no library. */
  const flip = src => {
    const el = listRef.current
    if (!el || reducedMotion()) return () => {}
    const before = [...el.children].map(c => c.getBoundingClientRect().top)
    return () => {
      const rows = [...el.children]
      rows.forEach((row, k) => {
        const from = before[src(k)]
        if (from == null) return
        const dy = from - row.getBoundingClientRect().top
        // Sub-pixel drift is not movement; animating it costs a compositor layer
        // for something nobody can see.
        if (Math.abs(dy) < 1) return
        row.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
          { duration: 200, easing: 'cubic-bezier(.32,.72,0,1)' }   // --t-med, --ease-sheet
        )
      })
    }
  }
  // React flushes a discrete event's updates before the browser gets its next
  // frame, so by the time this rAF runs the DOM is new and nothing has painted —
  // the rows are put back and released without ever flashing at the new position.
  const after = play => requestAnimationFrame(play)

  const move = (i, dir) => {
    // A row mid-exit is still in the list and still holding its index, but the splice that
    // will close the gap is already scheduled against that index. Reordering underneath it
    // would leave the pending splice pointing at whatever moved into the slot, and the
    // wrong exercise would be deleted — so the list holds still until the row is gone.
    if (leaving != null) return
    const trial = r.ex.map(e => ({ ...e }))
    const src = moveInRoutine(trial, i, dir)
    if (!src) return
    const play = flip(src)
    edit(ex => { moveInRoutine(ex, i, dir); cleanupSg(ex) })
    after(play)
  }

  // Delete in two beats: the row fades and sinks on its own for --t-exit, then the
  // splice lands and everything below glides up to close the gap. Done in one beat
  // the row simply blinks out of existence and the rest of the list jumps.
  const remove = i => {
    if (leaving != null) return          // one at a time; a second would re-index the first
    setLeaving(i)
    setTimeout(() => {
      const play = flip(k => (k >= i ? k + 1 : k))
      edit(x => { x.splice(i, 1); cleanupSg(x) })
      setLeaving(null)
      after(play)
    }, dur(160))                         // --t-exit, collapsed under reduced motion
  }
  const toggleLink = i => edit(ex => toggleSuperset(ex, i))

  // A slot routine: which variant each slot lands on this week (resolveWeek caches, so this is
  // cheap on every render), and the session as it will really be done, for the checks below.
  const slotted = hasSlots(r)
  const picks = slotted ? (resolveWeek(S, todayISO(), [r.id]).picks[r.id] || []) : []
  const asDone = slotted ? resolveRoutine(S, r, todayISO()) : r

  const units = supersetUnits(r.ex)
  const unitFirst = new Set(units.filter(u => u.length > 1).map(u => u[0]))
  const inSS = new Set(units.filter(u => u.length > 1).flat())

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/plan')} aria-label={t('Plan')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, margin: '0 12px' }}>
        <input className="input" defaultValue={r.name} style={{ fontWeight: 600, fontSize: 20, letterSpacing: '-.021em' }}
          onChange={e => update(s => { s.routines.find(x => x.id === id).name = e.target.value.trim() || t('Routine') })} />
      </div>
      <button className="iconbtn" aria-label={t('Pick an icon')} onClick={() => glyphPicker(r.emoji, g => update(s => { s.routines.find(x => x.id === id).emoji = g }))}><Icon name={glyphOf(r.emoji)} /></button>
    </div>

    <div className="sect-b" style={{ marginBottom: 16 }}>
      <SelectRow icon="chartLine" title={t('Progression')} sheetTitle={t('Progression')}
        value={r.prog || 'linear'} onChange={v => update(s => { s.routines.find(x => x.id === id).prog = v })}
        options={POLICIES_FOR.reps.map(p => ({ value: p, label: t(POLICY_NAME[p]), subtitle: t(POLICY_DESC[p]) }))} />
    </div>
    <div className="small dim" style={{ margin: '-10px 2px 16px' }}>
      {t('Applies to every exercise in this routine that does not set its own rule.')}
    </div>

    {r.ex.length ? <div className={listClass(entering)} ref={listRef}>{r.ex.map((e, i) => {
      // An unresolvable id is shown rather than skipped — hiding it left an entry you
      // could neither see nor delete, but that still turned up in the workout.
      const slot = isSlot(e)
      const ex = exOr(slot ? (picks[i] || e.id) : e.id)
      const linkedPrev = i > 0 && e.sg && r.ex[i - 1].sg === e.sg
      // The wrapper that was already here for the superset label doubles as the
      // entry/exit box — so the arrival transform lives on it and the press scale
      // on the .item inside, and the two can never overwrite each other.
      return <div key={i} className={'ls-i' + (leaving === i ? ' ls-out' : '')} style={{ '--i': i }}>
        {unitFirst.has(i) && <div className="ss-label"><Icon name="link" />{t('Superset')}</div>}
        <div className={'item' + (inSS.has(i) ? ' in-ss' : '')} onClick={() => {
          // A slot keeps its pool and per-variant settings; the sheet edits the shared ones.
          exConfigSheet(ex, e, cfg => edit(x => { x[i] = slot ? { ...x[i], ...cfg, id: x[i].id, sg: x[i].sg, slot: x[i].slot, pool: x[i].pool, opts: x[i].opts } : { id: x[i].id, sg: x[i].sg, ...cfg } }), () => remove(i), r)
        }}>
          <Thumb ex={ex} />
          <div className="grow"><div className="tt capitalize">{ex.n}</div><div className="ss">{exLine(e, S.unit)}</div>
            {slot && <div className="ss"><Icon name="shuffle" style={{ fontSize: 11 }} /> {t('{0} · rotates weekly', e.slot)}: <span className="capitalize">{e.pool.map(p => exOr(p).n).join(' / ')}</span></div>}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 'none', alignItems: 'center' }}>
            {i > 0 && <button className={'iconbtn' + (linkedPrev ? ' on-ss' : '')} title={t('Superset with exercise above')} style={{ width: 32, height: 28, borderRadius: 8, fontSize: 15 }} onClick={ev => { ev.stopPropagation(); toggleLink(i) }}><Icon name="link" /></button>}
            <div style={{ display: 'flex', gap: 2 }}>
              <button className="iconbtn" aria-label="Move up" style={{ width: 28, height: 24, borderRadius: 7, fontSize: 12 }} onClick={ev => { ev.stopPropagation(); move(i, -1) }}><Icon name="chevronUp" /></button>
              <button className="iconbtn" aria-label="Move down" style={{ width: 28, height: 24, borderRadius: 7, fontSize: 12 }} onClick={ev => { ev.stopPropagation(); move(i, 1) }}><Icon name="chevronDown" /></button>
            </div>
          </div>
        </div>
      </div>
    })}</div> : <div className="empty"><div className="ico"><Icon name="dumbbell" /></div>{t('No exercises yet — add your first one.')}</div>}

    {/* Coverage of the routine as planned, so a gap shows up while you're building it
        rather than after a month of training around it. */}
    {r.ex.length > 0 && (() => {
      const load = loadOfRoutine(asDone)
      const { worked } = rankOf(load)
      return <div className="card" style={{ marginTop: 12 }}>
        <h2>{t('What this session hits')}</h2>
        <BodyMap load={load} body={S.body} />
        <div className="mchips">
          {worked.slice(0, 6).map(m => <span key={m} className="mchip">{t(MUSCLE_NAME[m])}</span>)}
        </div>
      </div>
    })()}

    {/* Setup-aware check: can it be done on this gear, in this order, without re-racking? */}
    {/* For a slot routine that is this week's session; its order is set per week, so no "Best order". */}
    <GearCheck routine={asDone} S={S} onApply={slotted ? null : ex => update(s => { s.routines.find(x => x.id === id).ex = ex })} />

    <div className="small dim row" style={{ margin: '10px 2px', gap: 5 }}><Icon name="link" style={{ fontSize: 13 }} />{t('Tap the link button on an exercise to superset it with the one above — you’ll do them back-to-back. Tap it again to split it off. The arrows move a superset as one block.')}</div>
    <Button variant="primary" onClick={() => exercisePicker(ex => exConfigSheet(ex, null, cfg => edit(x => { x.push({ id: ex.id, ...cfg }) }), null, r))} icon="plus">{t('Add exercise')}</Button>
    <div style={{ height: 10 }} />
    <Button variant="danger" onClick={() => confirmSheet({
      title: t('Delete routine?'), message: t('“{0}” and its exercises will be removed.', r.name), confirmText: t('Delete'), danger: true,
      onConfirm: () => {
        update(s => {
          s.routines = s.routines.filter(x => x.id !== id)
          Object.keys(s.week).forEach(k => { if (s.week[k] === id) delete s.week[k] })
          Object.keys(s.dayPlan).forEach(k => { if (s.dayPlan[k] === id) delete s.dayPlan[k] })
        })
        nav('/plan')
      }
    })}>{t('Delete routine')}</Button>
  </div>
}
