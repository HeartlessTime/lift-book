import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr, workedGroups } from '../lib/exercises.js'
import { effectiveRoutine, cleanupSg, lastEntryFor, lastNoteFor, bestWeightFor, buildSets, setsDoneActive, supersetUnits, unitOf, setLabel, setTiming, fmtSec, modeOf, isBw, isPerSide, sideReps, repStep, EFFORT, effortOf, stepEffort, capEffort, distUnit, vertUnit } from '../lib/history.js'
import { fmtNum, fmtDate, todayISO, exCount, DAYN } from '../lib/format.js'
import { beep } from '../lib/sound.js'
import { tap, commit, celebrate } from '../lib/haptics.js'
import { is1RMRecord } from '../lib/onerm.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import Media from '../components/Media.jsx'
import { startFlow, exercisePicker, exConfigSheet, exerciseDetailSheet, topWeightSheet, exNoteSheet, finishWorkout, workoutCompleteSheet, confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { openTrainer } from '../components/Trainer.jsx'
import { openSwap } from '../components/Swap.jsx'
import { Button, Check, NumberField, Row } from '../components/ui.jsx'
import { nextPrescription, applyPrescription } from '../lib/progression.js'
import { glyphOf } from '../lib/glyphs.js'
import { forwardPlan, restAfterTick } from '../lib/workoutCard.js'

/* ---------- start chooser (no active workout) ---------- */
function StartChooser() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const todayR = effectiveRoutine(S, todayISO())
  const todayOvr = S.dayPlan[todayISO()] !== undefined
  const others = S.routines.filter(r => r !== todayR)
  return <div className="narrow">
    <div className="hdr"><div><h1>{t('Start workout')}</h1><div className="sub">{t(DAYN[new Date().getDay()])} — {todayR ? t('today is {0}', todayR.name) : t('rest day, but no one’s stopping you')}</div></div></div>
    {todayR && <div className="glow">
      <span className="eyebrow"><Icon name="calendar" />{t("Today's plan")}{todayOvr ? ' · ' + t('rescheduled') : ''}</span>
      <div className="row between" style={{ margin: '8px 0 14px' }}>
        <div style={{ minWidth: 0 }}><div className="glow-title" style={{ fontSize: 24 }}>{todayR.name}</div><div className="glow-detail">{exCount(todayR.ex.length)}</div></div>
        <span className="lrow-i" style={{ width: 38, height: 38, borderRadius: 9, fontSize: 22 }}><Icon name={glyphOf(todayR.emoji)} /></span>
      </div>
      <Button variant="primary" icon="play" onClick={() => startFlow(todayR.id)}>{t('Start {0}', todayR.name)}</Button>
    </div>}
    {others.length > 0 && <><h4 className="sec">{t('Other routines')}</h4>
      <div className="list">{others.map(r => <div key={r.id} className="item" onClick={() => startFlow(r.id)}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        <span className="tag acc">{t('Start')}</span></div>)}</div></>}
    <div style={{ height: 14 }} />
    <Button icon="shuffle" onClick={() => startFlow(null)}>{t('Freestyle workout (pick as you go)')}</Button>
    {!S.routines.length && <><div style={{ height: 10 }} /><Button variant="primary" onClick={() => nav('/plan')}>{t('Build a plan first')}</Button></>}
  </div>
}

/* How long a set counts as "just landed".
   The whole beat is spent in 290ms; the extra 110ms is slack so a render that arrives a
   frame or two late still carries the classes the animations are gated on. Nothing reads
   this after the animation has run, so erring long costs nothing and erring short costs the
   entire beat. See styles/workout-motion.css for why the gate exists at all. */
const LAND_MS = 400

/* Matches --pr-ttl in styles/reward-motion.css. If one moves, move the other: the banner's
   enter/hold/exit is one animation across this whole duration, so a mismatch either unmounts
   it mid-sentence or leaves an invisible box sitting over the header. */
const PR_MS = 2000

/* ---------- the personal-record banner ----------
   Subscribes to the celebration slot itself rather than taking it as a prop, for the same
   reason Elapsed below owns its own clock: reading useUI from ActiveWorkout would re-render
   every set row in the session twice per record.

   `key` on the celebration id is what makes a second record actually replay — without it
   React reuses the node, the animation never restarts, and the second banner is invisible.
   It can only happen after the first has ended (the queue guarantees that), so this is a
   fresh element every time, not a restart of a running one. */
function PrBanner() {
  const c = useUI(s => s.celebration)
  if (!c || c.kind !== 'pr') return null
  return <div className="prbanner" role="status" aria-live="polite" key={c.id}>
    <span className="prbanner-m"><Icon name="trophy" /></span>
    <div className="grow">
      <div className="prbanner-t">{t('Personal record')}</div>
      <div className="prbanner-s">{c.name} · {t('est. 1RM {0} {1}', fmtNum(c.est), c.unit)}{c.prev > 0 ? ' · ' + t('was {0}', fmtNum(c.prev)) : ''}</div>
    </div>
  </div>
}

/* ---------- elapsed clock (isolated so the workout tree doesn't re-render every second) ---------- */
function Elapsed({ start }) {
  const [t, setT] = useState('0:00')
  useEffect(() => {
    const tick = () => { const s = Math.floor((Date.now() - start) / 1000); setT(Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')) }
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv)
  }, [start])
  return <span>{t}</span>
}

/* ---------- one exercise block (reps: weight×reps · time: a held duration · cardio: time+distance+climb) ---------- */
function ExerciseBlock({ entryIdx, compact, nextKey, onToggle, onField, onAddSet, onRemoveSet, onStartTimed, onDrop }) {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)                // guest / demo: no trainer to ask
  const update = useStore(s => s.update)
  const working = useUI(s => s.work)
  const entry = S.active.entries[entryIdx]
  const ex = exOr(entry.id)
  const mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const cardio = mode === 'cardio'
  const timed = mode === 'time'
  // All three walk every workout, every entry and every set, so they are computed once per
  // exercise rather than on every stepper tap and every keystroke. S.workouts only changes
  // identity when history itself does — logging into the live session leaves it alone.
  const hist = useMemo(() => ({
    last: lastEntryFor(S, entry.id),
    note: lastNoteFor(S, entry.id),
    best: bestWeightFor(S, entry.id)
  }), [S.workouts, entry.id])
  const last = hist.last
  // What you wrote about this exercise: today's note if there is one, otherwise the last one
  // you wrote and when. Showing it here is the whole point — a note you only ever see by
  // digging through history is a diary, not a training cue.
  const prevNote = entry.note ? null : hist.note
  // The same number the "confirm your working weight" sheet calls your best, so the two
  // never disagree inside one session: heaviest logged set, or the working weight you kept.
  const best = cardio ? 0 : Math.max(hist.best, (S.exWeights[entry.id] || {}).w || 0)
  // What the progression policy decided for this session, and why (issue #17). Computed when
  // the session was built so the reason matches the numbers already in the rows.
  const plan = entry.plan
  // A bodyweight set has no weight to type, so the column is not there (issue #32) — one
  // stepper instead of two, which is the whole point of the flag. Adding a belt weight in the
  // config brings it back, now labelled as the addition it is.
  const cfg = { ...(entry.target || {}), id: entry.id }
  const bw = !cardio && isBw(cfg)
  const added = bw && entry.sets.some(s => s.w > 0)
  const loadCol = { f: 'w', step: 2.5, dec: true, hd: bw ? t('Added ({0})', S.unit) : t('Weight ({0})', S.unit) }
  // The reps column is the total in every mode, unilateral included — the stepper walks in
  // twos there so the number you land on is one you can actually split evenly.
  const repCol = { f: 'r', step: repStep(cfg), dec: false, hd: t('Reps') }
  const col1 = cardio ? { f: 'min', step: 1, dec: false, hd: t('Minutes') }
    : timed ? { f: 'sec', step: 5, dec: false, hd: t('Seconds') }
      : (bw && !added) ? repCol : loadCol
  // The three numbers a treadmill console shows when you step off, in the order it shows
  // them. Speed is not among them: it is distance ÷ time, so typing it would be typing the
  // same fact twice, and the one you would get wrong.
  const col2 = cardio ? { f: 'dist', step: 0.1, dec: true, hd: t('Distance ({0})', distUnit(S.unit)) }
    : timed ? ((bw && !added) ? null : loadCol)
      : (bw && !added) ? null : repCol
  // Effort (RIR or RPE, whichever the profile logs) only makes sense for weighted rep sets,
  // not cardio/timed holds, and is opt-in since it adds a third stepper to every row. `opt`
  // because an unlogged effort is not the same as 0 — RIR 0 says the set went to failure.
  const kind = effortOf(S)
  const eff = EFFORT[kind]
  const col3 = cardio ? { f: 'vft', step: 10, dec: false, hd: t('Climb ({0})', vertUnit(S.unit)) }
    : mode === 'reps' && eff ? { ...eff, eff: kind, dec: true, opt: true, hd: t(eff.hd) } : null
  // The effort column walks its own scale — see stepEffort. Weight and reps step up from 0
  // with no ceiling, as they always did.
  const bump = (s, i, col, dir) => {
    if (col.eff) return onField(i, col.f, stepEffort(col.eff, s[col.f], dir))
    onField(i, col.f, Math.max(0, Math.round(((s[col.f] || 0) + dir * col.step) * 100) / 100))
  }
  // Uses the shared stepper markup so a set row picks up the same control styling
  // as every other +/- field in the app.
  const cell = (s, i, col, cls) => (
    <div className={'stp ' + cls}>
      <button aria-label="Decrease" onClick={() => bump(s, i, col, -1)}><Icon name="minus" /></button>
      {/* a typed effort is capped — there is no RPE 12, and 12 reps in reserve is a warm-up */}
      <span className="val"><NumberField decimal={col.dec} nullable={col.opt} value={s[col.f] ?? ''}
        onChange={v => onField(i, col.f, col.eff ? capEffort(col.eff, v) : v)} /></span>
      <button aria-label="Increase" onClick={() => bump(s, i, col, 1)}><Icon name="plus" /></button>
    </div>
  )
  // The card compresses once when the exercise closes out. Same 400ms window as the rows,
  // read off the latest tick in the entry — so it fires on the set that finished the
  // exercise and not on the one that un-ticked and re-ticked it a minute later.
  const exLanded = entry.sets.length > 0 && entry.sets.every(x => x.done) &&
    Date.now() - Math.max(0, ...entry.sets.map(x => x.t || 0)) < LAND_MS
  // The same settings sheet the routine editor opens, mid-session. A saved change lands on
  // today's entry and on the routine, so a per-side flag switched off here stays off next week.
  // Ticked sets are history and are left alone; the unticked ones pick up a changed rep target
  // and set count.
  const editConfig = () => exConfigSheet(ex, { ...(entry.target || {}) }, cfg => update(s => {
    const e = s.active.entries[entryIdx]
    const old = e.target || {}
    e.target = { ...cfg, ...(old.id ? { id: old.id } : {}) }
    if (modeOf({ ...cfg, id: e.id }) === 'reps') {
      if (cfg.reps !== old.reps) e.sets.forEach(x => { if (!x.done) x.r = cfg.reps })
      while (e.sets.length < cfg.sets) { const l = e.sets[e.sets.length - 1]; e.sets.push({ w: l ? l.w : 0, r: cfg.reps, done: false }) }
      while (e.sets.length > cfg.sets && !e.sets[e.sets.length - 1].done) e.sets.pop()
    }
    const r = s.routines.find(x => x.id === s.active.routineId)
    const i = r ? r.ex.findIndex(x => x.id === e.id || (x.slot && (x.pool || []).includes(e.id))) : -1
    if (i >= 0 && r.ex[i].slot && Array.isArray(r.ex[i].pool)) {
      // A slot: the change belongs to this week's variant only — its own settings in `opts`.
      const { id: _id, sg: _sg, slot: _slot, pool: _pool, opts: _opts, ...own } = cfg
      const opts = { ...(r.ex[i].opts || {}) }
      opts[e.id] = { ...(opts[e.id] || {}), ...own }
      r.ex[i] = { ...r.ex[i], opts }
    } else if (i >= 0) r.ex[i] = { id: r.ex[i].id, sg: r.ex[i].sg, ...cfg }
  }), null, S.routines.find(r => r.id === S.active.routineId))
  return <>
    <Media ex={ex} key={entry.id} compact={compact} minimizable />
    <div className="row between" style={{ marginBottom: 6 }}>
      <div style={{ fontSize: compact ? 17 : 20, fontWeight: 600, letterSpacing: '-.02em', textTransform: 'capitalize', lineHeight: 1.2 }}>{ex.n}</div>
      {/* Everything but the trainer lives behind one button: four look-alike circles hid the one
          he reaches for mid-set. */}
      <button className="iconbtn" aria-label={t('More')} onClick={() => useUI.getState().openSheet(close => <>
        <h3 className="capitalize">{ex.n}</h3>
        <div className="sect-b">
          <Row icon="pencil" title={entry.note ? t('Edit note') : t('Add note')} onClick={() => { close(); exNoteSheet(entryIdx) }} />
          <Row icon="gear" title={t('Sets, reps & rest')} onClick={() => { close(); editConfig() }} />
          <Row icon="info" title={t('How to do it')} onClick={() => { close(); exerciseDetailSheet(ex) }} />
          {onDrop && <Row icon="trash" danger title={t('Remove from this workout')} onClick={() => { close(); onDrop() }} />}
        </div>
      </>)}><Icon name="more" /></button>
    </div>
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
      {cardio && <span className="tag acc"><Icon name="figureRun" />{t('Cardio')}</span>}
      {/* You log the total; this is the split, so the set in front of you is unambiguous
          without the rep count having to mean two different things (issue #31). */}
      {!cardio && !timed && isPerSide(cfg) && <span className="tag acc nocap"><Icon name="shuffle" />{t('{0} per side', fmtNum(sideReps(entry.sets.find(s => !s.done)?.r ?? entry.sets[0]?.r)))}</span>}
      {workedGroups(ex).map(m => <span key={m} className="tag">{t(m)}</span>)}
      {ex.eq && <span className="tag">{t(ex.eq)}</span>}
      {best > 0 && <span className="tag nocap">{t('Best:')} {fmtNum(best)} {S.unit}</span>}
    </div>
    {/* Always offered: sets already logged on the lift stay in the session (lib/swap.js). */}
    <div className="ex-acts">
      <Button variant="gray" size="sm" icon="shuffle" onClick={() => openSwap(entryIdx)}>{t('Swap')}</Button>
      {user && <Button variant="tinted" size="sm" icon="personCircle"
        onClick={() => openTrainer({ workoutId: S.active.id, exId: entry.id, routineId: S.active.routineId })}>{t('Ask trainer')}</Button>}
    </div>
    {last && <div className="small dim" style={{ marginBottom: 4 }}>{t('Last time')} ({fmtDate(last.d)}): {last.sets.map(s => setLabel(entry.id, s, last.target, S.unit)).join(', ')}</div>}
    {(entry.note || prevNote) && <button className={'noteline' + (prevNote ? ' old' : '')} onClick={() => exNoteSheet(entryIdx)}>
      <Icon name="pencil" />
      <span className="grow">{entry.note || prevNote.note}</span>
      {prevNote && <em>{fmtDate(prevNote.d)}</em>}
    </button>}
    {plan && plan.why && plan.kind !== 'off' && <div className={'progline' + (plan.kind === 'deload' ? ' warn' : '')}>
      <Icon name={plan.kind === 'up' ? 'arrowUp' : plan.kind === 'deload' ? 'arrowDown' : 'lightbulb'} />
      <span>{t(...plan.why)}</span>
    </div>}
    <div className={'card' + (exLanded ? ' exland' : '')} style={{ marginTop: 10, marginBottom: 0 }}>
      {/* the header carries the same eff3 sizing as the rows, or the labels drift off their columns */}
      <div className={'sethead' + (col3 ? ' eff3' : '')}><span className="n-sp" /><span className="w-sp">{col1.hd}</span>{col2 && <span className="r-sp">{col2.hd}</span>}{col3 && <span className="eff-sp">{col3.hd}</span>}{timed && <span className="ck-sp" />}<span className="ck-sp" /></div>
      {entry.sets.map((s, i) => {
        // The rest the session actually recorded, shown where it happened. `rest` is the
        // buzzer-to-tick recovery; without it (a rest that was skipped, or an old workout)
        // `gap` — tick to tick — is the only honest number, and it is labelled differently
        // because it also contains the set itself.
        const tm = s.done ? setTiming(entry.sets, i) : null
        const restTxt = tm && tm.rest != null ? t('{0} rest', fmtSec(tm.rest))
          : tm && tm.gap != null ? t('{0} between sets', fmtSec(tm.gap)) : null
        // Gate for the landing animations. The set already carries the moment it was ticked
        // (`t`, stamped in toggle), so the beat needs no state and no timer of its own: the
        // render that follows the tick is the only one inside the window, and any render
        // after it drops the class again. Everything else that could add a class here —
        // remounting the block with Prev, coming back from another tab — falls outside the
        // window and gets the finished state with no animation, which is the point.
        const landed = s.done && s.t > 0 && Date.now() - s.t < LAND_MS
        // the set that is up now (lib/workoutCard.js forwardPlan) — in a superset, whose turn it is
        const up = nextKey === entryIdx + ':' + i
        return <div key={i} data-setkey={entryIdx + ':' + i} className={'setwrap' + (s.done ? ' done' : '') + (landed ? ' land' : '') + (up ? ' up' : '')}>
          {/* Stays for the rest of the session — a record of what happened, not a flourish.
              Sits on the wrapper so the row's .45 opacity can't dim it. */}
          {s.pr && <span className="setpr" aria-label={t('Heaviest set so far')} title={t('Heaviest set so far')}><Icon name="medal" /></span>}
          <div className={'setrow' + (s.done ? ' done' : '') + (col3 ? ' eff3' : '')}>
            <div className="n">{i + 1}</div>
            {cell(s, i, col1, 'w')}
            {col2 && cell(s, i, col2, 'r')}
            {col3 && cell(s, i, col3, 'eff')}
            {/* A timed set is started, not typed: the timer counts the hold down and checks the
                set off itself. The checkbox stays for anyone who timed it on their own watch. */}
            {timed && <button className="setgo" aria-label={t('Start set')} disabled={s.done || !!working}
              onClick={() => onStartTimed(i)}><Icon name="play" /></button>}
            {/* The haptic has to fire on pointerdown: waiting for onChange puts it behind a
                store write and a re-render of every row in the exercise, which is far enough
                past the finger (>30ms) that it stops reading as "the thing I touched" and
                starts reading as the phone buzzing on its own. Check fires it on its own
                pointerdown; this only chooses the intent. Committing a finished set is the
                heaviest thing in a session and gets commit(); un-ticking is a correction, not
                a record, so it gets the lighter tap(). */}
            <Check checked={s.done} haptic={s.done ? tap : commit} onChange={() => onToggle(i)} />
          </div>
          {restTxt && <div className="settime"><Icon name="timer" />{restTxt}</div>}
        </div>
      })}
      <div style={{ height: 8 }} />
      <div className="row">
        <Button variant="gray" size="sm" icon="minus" className="grow" disabled={entry.sets.length <= 1} onClick={onRemoveSet}>{t('Remove set')}</Button>
        <Button variant="tinted" size="sm" icon="plus" className="grow" onClick={onAddSet}>{t('Add set')}</Button>
      </div>
    </div>
  </>
}

/* ---------- rest buzzer, recorded (no tap, no UI) ----------
   Two `t` stamps a set apart lump together the rest, the next set and however long you stood
   about between them, and nothing can pull that number back apart afterwards. Knowing when the
   buzzer actually went splits it. useUI owns the countdown and clears it the instant it fires,
   so this watches the timer disappearing rather than asking to be told: gone at or after its
   endsAt means it ran out; gone early means Skip, and a skipped rest has no expiry to report.
   endsAt follows the ±15s buttons, so a rest that was extended is stamped when it really
   finished. Subscribed at module scope rather than in an effect — the buzzer can go while
   you're off looking at Stats, and the stamp has to survive that.
   `pendingRest` is the set the running rest follows, noted when that set is ticked off. */
let pendingRest = null
// Superset lifts whose weight confirm is waiting for the end of the round (entry indexes).
let pendingTop = []
useUI.subscribe((s, p) => {
  if (!p.timer || s.timer || !pendingRest) return
  const { idx, i } = pendingRest
  pendingRest = null
  // half a second of slack: the tick fires on the last whole second, marginally early
  if (Date.now() < p.timer.endsAt - 500) return
  useStore.getState().updateEntry(idx, e => {
    const x = e.sets?.[i]
    // the rest can outlive the set that started it — un-ticked, or the exercise skipped
    if (x && x.done) x.rt = p.timer.endsAt
  })
})

/* ---------- active workout ---------- */
function ActiveWorkout() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const updateEntry = useStore(s => s.updateEntry)
  // Selected one at a time on purpose: subscribing to the whole UI store would re-render the
  // entire active workout on every tick of the rest countdown.
  const startRest = useUI(s => s.startRest)
  const stopRest = useUI(s => s.stopRest)
  const A = S.active
  const units = supersetUnits(A.entries)
  const cur = Math.min(A.cur, Math.max(0, A.entries.length - 1))
  const unit = A.entries.length ? unitOf(units, cur) : []
  const unitIdx = units.findIndex(u => u === unit)
  const isSuperset = unit.length > 1
  const nextKey = (forwardPlan(S)[0] || {}).key || ''
  // In a superset both lifts are stacked and the partner's rows sit below the fold: after each
  // tick, bring the set that is up now into view (only if it isn't already, so nothing jumps).
  useEffect(() => {
    if (!isSuperset || !nextKey) return
    const el = document.querySelector('[data-setkey="' + nextKey + '"]')
    if (!el) return
    const r = el.getBoundingClientRect()
    const bottomCover = document.body.classList.contains('resting') ? 190 : 110   // rest bar + tab bar
    if (r.top < 60 || r.bottom > window.innerHeight - bottomCover) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [nextKey, isSuperset])

  const total = A.entries.reduce((n, e) => n + e.sets.length, 0)
  const done = setsDoneActive(A)

  const mutEntry = (idx, fn) => updateEntry(idx, fn, true)
  // Clearing an optional field drops the key rather than storing null, so a set only carries
  // what was actually logged — in the session, in history and in a backup.
  const setField = (idx, i, field, v) => mutEntry(idx, e => {
    if (v == null) delete e.sets[i][field]; else e.sets[i][field] = v
  })
  const modeAt = idx => modeOf({ ...(A.entries[idx].target || {}), id: A.entries[idx].id })
  const addSet = idx => mutEntry(idx, e => {
    const l = e.sets[e.sets.length - 1]
    const m = modeOf({ ...(e.target || {}), id: e.id })
    if (m === 'cardio') e.sets.push({ min: l ? l.min : (e.target.min || 20), dist: 0, vft: 0, done: false })
    else if (m === 'time') e.sets.push({ sec: l ? l.sec : (e.target.sec || 45), w: l ? (l.w || 0) : (e.target.weight || 0), done: false })
    else e.sets.push({ w: l ? l.w : 0, r: l ? l.r : e.target.reps, done: false })
  })
  const removeSet = idx => mutEntry(idx, e => { if (e.sets.length > 1) e.sets.pop() })

  // A warm-up you decided against should leave no trace. Walking past it with Next would file
  // an entry with no ticked sets — a treadmill walk of zero minutes, sitting in history and
  // dragging "3/4 exercises" onto the finish button. Skipping drops it from the session.
  // Offered only while nothing in it is logged, so this can never be the button that deletes
  // work, and never on a superset, where removing one half orphans the other mid-pair.
  const canSkip = !isSuperset && A.entries.length > 1 && !(A.entries[cur] || {}).sets?.some(x => x.done)
  const skipEx = () => {
    const name = exOr(A.entries[cur].id).n
    update(s => {
      s.active.entries.splice(cur, 1)
      s.active.cur = Math.min(cur, s.active.entries.length - 1)
    })
    // a rest already running belongs to the set before; skipping the next lift doesn't end it
    pendingTop = []
    useUI.getState().toast(t('Skipped {0}', name))
  }

  // Skip is off inside a superset, so each lift in one carries its own remove: nothing logged on
  // it, and the pair it leaves behind (or the lone lift) carries on as the session's next unit.
  const dropEx = idx => {
    const name = exOr(A.entries[idx].id).n
    update(s => {
      const keep = s.active.entries[unit.find(j => j !== idx)]
      s.active.entries.splice(idx, 1)
      cleanupSg(s.active.entries)
      s.active.cur = Math.max(0, keep ? s.active.entries.indexOf(keep) : 0)
    })
    pendingTop = []
    useUI.getState().toast(t('Removed {0}', name))
  }

  // A timed set is held, not typed. The work timer records what was actually held — an early
  // finish logs 0:38 of a 0:45 target rather than crediting the full prescription — and then
  // checks the set off through the normal path, so rest, supersets and the finish prompt all
  // behave exactly as they do for a reps set.
  const startTimed = (idx, i) => {
    const e = A.entries[idx]
    useUI.getState().startWork(e.sets[i].sec || 45, exOr(e.id).n, elapsed => {
      mutEntry(idx, en => { en.sets[i].sec = elapsed })
      if (!useStore.getState().S.active.entries[idx].sets[i].done) toggle(idx, i)
    })
  }


  const toggle = (idx, i) => {
    const m = modeAt(idx)
    const cardioEntry = m === 'cardio'
    const ent = A.entries[idx]
    // The bar to beat, read before the tick: everything logged in past sessions, plus anything
    // already done in this one, so a third set at the same weight doesn't re-announce itself.
    const prevBest = bestWeightFor(S, ent.id)
    const barToBeat = Math.max(prevBest, ...ent.sets.filter(x => x.done).map(x => x.w || 0))
    // The estimated-1RM bar, read the same way and for the same reason. is1RMRecord takes the
    // best estimate across a whole entry's done sets, so once one set in this session has set
    // a record every later set in it would report one too; reading the entry as it stands
    // before the tick gives the high-water mark this set actually has to beat.
    const e1Before = is1RMRecord(S, ent.id, ent)
    let askTop = false, exJustDone = false, workoutDone = false, prWeight = 0, e1rec = null
    mutEntry(idx, e => {
      e.sets[i].done = !e.sets[i].done
      if (e.sets[i].done) {
        e.sets[i].t = Date.now()
        delete e.sets[i].skip   // skipped from the lock screen, then done after all
        // The haptic moved to the checkbox's own pointerdown — from here it would land after
        // the store write and the re-render, which is exactly the lag lib/haptics.js exists
        // to prevent. The beep stays: it is audio, it has no such budget, and it is the cue
        // you get when the phone is face-down on the bench.
        beep(S.sound, 1040, 0.12)
        // A heaviest-ever set is worth saying so in the moment, not three taps deep in history
        // afterwards. Loaded reps only — "heaviest push-up" is not a thing — and never on the
        // first time an exercise is ever logged, where every set would be a record.
        if (m === 'reps' && prevBest > 0 && !isBw({ ...(e.target || {}), id: e.id }) && (e.sets[i].w || 0) > barToBeat) {
          prWeight = e.sets[i].w
          // Flagged on the set itself, not held in component state, because the medal has to
          // survive walking away to another exercise and back. It rides into history with the
          // rest of the set, which is honest: the set *was* a record when it happened.
          e.sets[i].pr = true
        }
        // ...and the louder one. A new best estimated 1RM is the app's strongest claim that
        // you are stronger than you have ever been, and it is the same call doFinishWorkout
        // makes to build e1prs — so the banner and the end-of-workout summary can never
        // disagree about what happened. `prev > 0` mirrors the `prevBest > 0` guard above:
        // the first time an exercise is ever logged, every set would be a record.
        const rec = is1RMRecord(S, e.id, e)
        if (rec && rec.prev > 0 && (!e1Before || rec.est > e1Before.est)) e1rec = rec
        // noted after startRest, never before: startRest stops any rest still running, and
        // that stop belongs to the previous set, not this one
        // One rule with the lock screen (lib/workoutCard.js restAfterTick): rest between sets,
        // before the next exercise and once per superset round, never mid-round.
        pendingRest = null
        const rest = restAfterTick(S, idx, i, e)
        if (rest.sec) { startRest(rest.sec, rest.label); pendingRest = { idx, i } }
        else if (rest.done) stopRest()
        if (rest.done) workoutDone = true      // nothing left open anywhere → done
        // Only loaded reps training has a "working weight" worth confirming — a bodyweight
        // plank has nothing to put in that slider, and neither does a set of push-ups
        // (issue #32: the fewest taps that still record what happened).
        const loaded = m === 'reps' && !(isBw({ ...(e.target || {}), id: e.id }) && !e.sets.some(x => x.w > 0))
        if (e.sets.every(x => x.done)) { exJustDone = true; if (loaded && !e.asked) { e.asked = true; askTop = true } }
      // Un-ticking takes the stamps with it: a set logged at 18:04 and then un-ticked did not
      // happen at 18:04, and a stale timestamp is worse than none at all.
      } else { delete e.sets[i].t; delete e.sets[i].rt; delete e.sets[i].pr }
    })
    // reps: topWeight first (it chains into the finish/continue prompt on the last unit).
    // cardio/timed or already-confirmed: go straight to the prompt.
    // A heaviest-ever set is the quiet one. It happens most weeks on any linear progression,
    // and the medal that just pinned itself to the row says it better than a toast does — it
    // says *which set*, and it is still there in ten minutes. The commit() on pointerdown has
    // already been felt. (This replaced a '🏆 New best' toast; the record is still announced,
    // just on the row that earned it and in the finish summary.)
    //
    // A personal record is the loud one, and it is the only thing in the app that gets a
    // banner. Queued rather than shown, because the set that earns it can be the last set of
    // the session — in which case workoutCompleteSheet fires from three lines down and the
    // two would land on the same frame.
    if (e1rec) {
      celebrate()
      useUI.getState().queueCelebration({
        kind: 'pr', ttl: PR_MS, name: exOr(ent.id).n, unit: S.unit, est: e1rec.est, prev: e1rec.prev
      })
    }
    // Mid-superset, the weight confirm waits: popping up after A's last set, with B's still to
    // do, broke the round. Queued lifts are confirmed one after another once the round is over.
    const unitOpen = unit.some(k => (k === idx ? null : A.entries[k])?.sets.some(x => !x.done && !x.skip))
    if (askTop && unitOpen) pendingTop.push(idx)
    else if (askTop || (pendingTop.length && !unitOpen)) {
      const q = [...pendingTop.filter(k => unit.includes(k)), ...(askTop ? [idx] : [])]
      pendingTop = pendingTop.filter(k => !unit.includes(k))
      if (q.length) topWeightSheet(q[0], q.slice(1))
      else if (workoutDone) workoutCompleteSheet()
    }
    else if (workoutDone) workoutCompleteSheet()
    else if (exJustDone && cardioEntry) useUI.getState().toast(t('Cardio logged'))
    else if (exJustDone && m === 'time') useUI.getState().toast(t('Hold logged'))
  }

  // Live-presence heartbeat so the admin dashboard can show who's training now. Signed-in only —
  // guests have no server session. Reads fresh state each tick so progress stays current.
  useEffect(() => {
    if (!useStore.getState().user) return
    let stopped = false
    const ping = active => {
      const A2 = useStore.getState().S.active
      if (!A2) return
      const u = supersetUnits(A2.entries)
      const c = Math.min(A2.cur, Math.max(0, A2.entries.length - 1))
      const ui = u.findIndex(x => x.includes(c))
      const tot = A2.entries.reduce((n, e) => n + e.sets.length, 0)
      api('/api/activity', { method: 'POST', body: JSON.stringify({
        active, name: A2.name, exIdx: ui + 1, exTotal: u.length,
        setsDone: setsDoneActive(A2), setsTotal: tot, startedAt: A2.start
      }) }).catch(() => {})
    }
    ping(true)
    const iv = setInterval(() => { if (!stopped) ping(true) }, 20000)
    return () => {
      stopped = true; clearInterval(iv)
      // best-effort "left" signal: sendBeacon survives a tab close, fetch covers in-app nav
      try { navigator.sendBeacon?.('/api/activity', new Blob([JSON.stringify({ active: false })], { type: 'application/json' })) } catch { /* */ }
      api('/api/activity', { method: 'POST', body: JSON.stringify({ active: false }) }).catch(() => {})
    }
  }, [])

  return <div className="narrow">
    <PrBanner />
    <div className="hdr">
      <button className="iconbtn" aria-label={t('Discard')} onClick={() => confirmSheet({ title: t('Discard workout?'), message: t('The sets you logged in this session will be lost.'), confirmText: t('Discard'), danger: true, onConfirm: () => { update(s => { s.active = null }); stopRest(); useUI.getState().clearCelebrations(); nav('/home') } })}><Icon name="xmark" /></button>
      <div style={{ textAlign: 'center', minWidth: 0 }}><div className="t-head">{A.entries.length ? (isSuperset ? t('Superset {0} / {1}', unitIdx + 1, units.length) : t('Exercise {0} / {1}', unitIdx + 1, units.length)) : A.name}</div></div>
      <button className="iconbtn" style={{ color: 'var(--acc)' }} aria-label={t('Finish')} onClick={finishWorkout}><Icon name="check" /></button>
    </div>
    {/* The lock-screen card's work face, read from the same forwardPlan() the card is built
        from, so the app and the lock screen always name the same set. Display only. */}
    {(() => {
      const plan = forwardPlan(S)
      const now = plan[0], then = plan[1]
      return <div className="glow wface">
        <div className="glow-head">
          <span className="who"><Icon name="dumbbell" /><span>{A.name}</span></span>
          <span className="capsule" aria-hidden="true"><i style={{ width: (total ? done / total * 100 : 0) + '%' }} /></span>
          <span className="cnt">{done}/{total}</span>
          <span className="sep">·</span>
          <span className="clk"><Elapsed start={A.start} /></span>
        </div>
        <div className="glow-body">
          <div className="info">
            <div className="glow-title">{now ? now.exercise : A.entries.length ? t("That's the whole workout!") : A.name}</div>
            {now ? <div className="glow-detail">{now.detail}</div>
              : <div className="glow-detail">{t('{0} sets', done + '/' + total)}</div>}
            {then && <div className="glow-foot">{t('Next')}: {then.exercise !== now.exercise ? then.exercise + ' · ' : ''}{then.detail}</div>}
          </div>
          <div className="glow-hero">
            {now ? <>
              <span className="eyebrow"><Icon name="dumbbell" />{t('Set')}</span>
              <div className="hero-num">{now.setNo}<small>/{now.setOf}</small></div>
            </> : <Icon name="checkCircle" />}
          </div>
        </div>
      </div>
    })()}

    {A.entries.length ? <>
      {isSuperset ? (
        <div className="ss-card">
          <div className="ss-hd"><Icon name="link" />{t('Superset · do these back-to-back, rest after both')}</div>
          {unit.map((idx, k) => <div key={idx} className="ss-ex">
            {k > 0 && <div className="ss-amp">+</div>}
            <ExerciseBlock entryIdx={idx} compact nextKey={nextKey}
              onToggle={i => toggle(idx, i)} onField={(i, f, v) => setField(idx, i, f, v)} onAddSet={() => addSet(idx)} onRemoveSet={() => removeSet(idx)} onStartTimed={i => startTimed(idx, i)}
              onDrop={A.entries[idx].sets.some(x => x.done) ? null : () => dropEx(idx)} />
          </div>)}
        </div>
      ) : (
        <ExerciseBlock entryIdx={cur} nextKey={nextKey} onToggle={i => toggle(cur, i)} onField={(i, f, v) => setField(cur, i, f, v)} onAddSet={() => addSet(cur)} onRemoveSet={() => removeSet(cur)} onStartTimed={i => startTimed(cur, i)} />
      )}
    </> : <div className="empty"><div className="ico"><Icon name="shuffle" /></div>{t('Freestyle workout — add your first exercise.')}</div>}

    <div style={{ height: 12 }} />
    {/* Next is the move he makes forty times a session, so it is the big solid one; Prev and Skip
        are the small gray ones beside it. */}
    <div className="wk-nav">
      <Button variant="gray" icon="chevronLeft" aria-label={t('Prev')} disabled={unitIdx <= 0} onClick={() => update(s => { s.active.cur = units[unitIdx - 1][0] })} />
      {/* the same glyph the plan editor already uses for "rest / skip this day", so skipping looks like skipping wherever you meet it */}
      {canSkip && <Button variant="gray" icon="moon" onClick={skipEx}>{t('Skip')}</Button>}
      <Button variant="primary" className="wk-next" trailingIcon="chevronRight" disabled={unitIdx < 0 || unitIdx >= units.length - 1} onClick={() => update(s => { s.active.cur = units[unitIdx + 1][0] })}>{t('Next')}</Button>
    </div>
    <div style={{ height: 10 }} />
    <Button onClick={() => exercisePicker(ex => exConfigSheet(ex, null, cfg => update(s => {
      const full = { ...cfg, id: ex.id }
      const plan = nextPrescription(s, full, s.routines.find(r => r.id === s.active.routineId))
      s.active.entries.push({ id: ex.id, target: { ...cfg }, plan, sets: applyPrescription(buildSets(s, full), plan) })
      s.active.cur = s.active.entries.length - 1
    }), null, S.routines.find(r => r.id === A.routineId)))} variant="gray" icon="plus">{t('Add exercise')}</Button>
    <div style={{ height: 10 }} />
    {(() => {
      const exDone = A.entries.filter(e => e.sets.length && e.sets.every(s => s.done)).length
      const allDone = A.entries.length > 0 && exDone === A.entries.length
      return <button className={allDone ? 'btn primary' : 'btn outline'} onClick={finishWorkout}>
        {allDone ? t('Finish workout') : t('Finish workout early · {0} exercises', exDone + '/' + A.entries.length)}
      </button>
    })()}
    <div style={{ height: 40 }} />
  </div>
}

export default function Workout() {
  const active = useStore(s => s.S.active)
  return active ? <ActiveWorkout /> : <StartChooser />
}
