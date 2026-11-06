// "Tell my trainer": one sheet that is both the thread (like a chat) and the composer.
// Opened from an exercise in the live workout, from the finish summary, or from Home.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, dateLocale } from '../lib/i18n.js'
import { exOr } from '../lib/exercises.js'
import { fmtNum } from '../lib/format.js'
import {
  TAGS, tagLabel, MAX_TEXT, loadDraft, saveDraft, awaitingReply, unreadCount, reviewProposal, loadChecker,
  postMessage, postProposalState, useTrainer, applyAll
} from '../lib/trainer.js'
import '../styles/trainer.css'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

const POLL_MS = 10000
const exName = id => (id ? exOr(id).n || id : '')

// `context` is { workoutId?, exId?, routineId? }; empty for the plain thread from Home.
export function openTrainer(context = {}) {
  useUI.getState().openSheet(close => <Trainer context={context} close={close} />)
}

function when(ts) {
  const d = new Date(ts)
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' })
}

const dayName = iso => new Date(iso + 'T12:00:00').toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'short' })

function describe(p, S) {
  const r = (S.routines || []).find(x => x.id === p.routineId)
  const where = r ? r.name : t('a routine you no longer have')
  if (p.kind === 'swap') return t('{0}: swap {1} for {2}', where, exName(p.fromEx), exName(p.toEx))
  if (p.kind === 'edit') {
    const c = p.changes || {}
    const bits = [c.sets != null && t('{0} sets', fmtNum(c.sets)), c.reps != null && t('{0} reps', fmtNum(c.reps)),
      c.weight != null && fmtNum(c.weight) + ' ' + S.unit].filter(Boolean).join(' · ')
    return t('{0}: {1} → {2}', where, exName(p.exId), bits)
  }
  if (p.kind === 'unsuperset') return t('{0}: {1} out of its superset', where, exName(p.exId))
  if (p.kind === 'superset') return t('{0}: superset {1} with {2}', where, exName(p.exId), exName(p.withEx))
  if (p.kind === 'add') return t('{0}: add {1}', where, exName(p.exId))
  if (p.kind === 'remove') return t('{0}: take out {1}', where, exName(p.exId))
  if (p.kind === 'reorder') return t('{0}: new order — {1}', where, p.order.map(exName).join(', '))
  if (p.kind === 'custom') return r ? t('New exercise {0}, added to {1}', p.ex?.n || '', where) : t('New exercise {0}', p.ex?.n || '')
  if (p.kind === 'today') {
    if (p.action === 'skip') return t('Today only: skip {0}', exName(p.exId))
    if (p.action === 'swap') return t('Today only: {0} instead of {1}', exName(p.toEx), exName(p.exId))
    if (p.action === 'add') return t('Today only: add {0}', exName(p.exId))
  }
  if (p.kind === 'schedule') {
    const what = p.routineId === 'rest' ? t('rest day') : where
    return t('{0}: {1}', dayName(p.date), what) + (p.slide ? ' · ' + t('the rest of the week moves back a day') : '')
  }
  return ''
}

function Proposal({ msg, checker }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const add = useTrainer(s => s.add)
  const toast = useUI(s => s.toast)
  const [busy, setBusy] = useState(false)
  // undefined = the planner is still loading; don't flash an Apply that may be withdrawn
  const review = checker === undefined && msg.proposalState === 'open' ? { status: 'loading', list: [] } : reviewProposal(msg, S, checker)
  if (!review) return null
  const list = review.list.length ? review.list : (msg.proposals || (msg.proposal ? [msg.proposal] : []))

  const settle = async state => {
    setBusy(true)
    add({ ...msg, proposalState: state })       // optimistic — the routine change below is already local
    try { add(await postProposalState(msg.id, state)) }
    catch (e) { toast(t('Saved here — your trainer will see it once you’re back online')) }
    setBusy(false)
  }
  const apply = () => {
    if (review.status !== 'ok') return
    update(s => { applyAll(s, list) })
    toast(list.every(p => p.kind === 'today') ? t('Today’s workout updated') : list.every(p => p.kind === 'schedule') ? t('Schedule updated') : t('Routine updated'))
    settle('applied')
  }

  return <div className="tr-prop">
    <div className="eyebrow"><Icon name="lightbulb" />{list.length > 1 ? t('{0} suggested changes', list.length) : t('Suggested change')}</div>
    {list.map((p, i) => <div key={i} style={i ? { marginTop: 8 } : null}>
      <div className="tr-prop-what">{describe(p, S)}</div>
      {p.reason && <div className="small muted" style={{ marginTop: 4 }}>{p.reason}</div>}
    </div>)}
    {review.status === 'applied' && <div className="small accent row" style={{ gap: 5, marginTop: 8 }}><Icon name="checkCircle" />{t('Applied')}</div>}
    {review.status === 'dismissed' && <div className="small dim" style={{ marginTop: 8 }}>{t('Not now')}</div>}
    {review.status === 'stale' && <div className="small dim" style={{ marginTop: 8 }}>{list.length > 1 ? t('Change {0} no longer matches your plan, so none of these can be applied.', review.index + 1) : t('This no longer matches your routine.')}</div>}
    {review.status === 'noop' && <div className="small dim" style={{ marginTop: 8 }}>{list.length > 1 ? t('Change {0} would change nothing, so none of these can be applied.', review.index + 1) : t('This would change nothing in your plan.')}</div>}
    {review.status === 'blocked' && <div className="small" style={{ marginTop: 8, color: 'var(--orange)' }}>
      <div style={{ fontWeight: 500 }}>{list.length > 1 ? t('One of these doesn’t fit your gear or rules, so none can be applied:') : t('This doesn’t fit your gear or rules:')}</div>
      {review.problems.map((x, i) => <div key={i}>· {x.message || x.rule}</div>)}
    </div>}
    {review.status === 'unchecked' && <div className="small dim" style={{ marginTop: 8 }}>{t('Can’t check this against your gear yet, so it can’t be applied.')}</div>}
    {['ok', 'blocked', 'unchecked', 'stale', 'noop'].includes(review.status) && <div className="row" style={{ gap: 8, marginTop: 10 }}>
      {review.status === 'ok' && <Button size="sm" variant="primary" style={{ flex: 1 }} disabled={busy} onClick={apply}>{t('Apply')}</Button>}
      <Button size="sm" style={{ flex: 1 }} disabled={busy} onClick={() => settle('dismissed')}>{t('Not now')}</Button>
    </div>}
  </div>
}

function Bubble({ m, waiting, checker }) {
  const mine = m.from === 'me'
  const about = m.context?.exId ? exName(m.context.exId) : ''
  return <div className={'tr-msg ' + (mine ? 'me' : 'coach')}>
    <div className={mine ? 'tr-bubble' : 'tr-bubble glow sm'}>
      {!mine && <div className="eyebrow"><Icon name="personCircle" />{t('Trainer')}</div>}
      {mine && (about || m.tags?.length > 0) && <div className="row" style={{ gap: 5, flexWrap: 'wrap', marginBottom: m.text ? 6 : 0 }}>
        {about && <span className="tag capitalize">{about}</span>}
        {(m.tags || []).map(x => <span key={x} className="tag acc nocap">{tagLabel(x)}</span>)}
      </div>}
      {m.text && <div className="tr-text">{m.text}</div>}
      {!mine && (m.proposal || m.proposals?.length > 0) && <Proposal msg={m} checker={checker} />}
    </div>
    <div className="tr-meta">{when(m.ts)}{waiting ? ' · ' + t('your trainer is on it') : ''}</div>
  </div>
}

function Trainer({ context, close }) {
  const messages = useTrainer(s => s.messages)
  const loaded = useTrainer(s => s.loaded)
  const refresh = useTrainer(s => s.refresh)
  const add = useTrainer(s => s.add)
  const markSeen = useTrainer(s => s.markSeen)
  const toast = useUI(s => s.toast)
  const draft = useRef(loadDraft(context)).current
  const [text, setText] = useState(draft?.text || '')
  const [tags, setTags] = useState(draft?.tags || [])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [checker, setChecker] = useState(undefined)
  const listRef = useRef(null)
  const dirty = useRef(false)

  useEffect(() => { let dead = false; loadChecker().then(c => { if (!dead) setChecker(() => c) }); return () => { dead = true } }, [])
  // Replies come in a minute or two after he sends, so poll while the sheet is up.
  useEffect(() => { refresh(); const iv = setInterval(refresh, POLL_MS); return () => clearInterval(iv) }, [refresh])
  // Jump to the bottom only when a new message lands. The poll hands back a fresh array every
  // 10 s, and keying on that yanked him back down mid-read.
  const lastId = messages.length ? messages[messages.length - 1].id : ''
  useEffect(() => { markSeen() }, [messages, markSeen])
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lastId])
  // Every keystroke is on the phone before it is anywhere else — closing the sheet, losing
  // signal or the app being killed can never cost him what he typed.
  useEffect(() => { if (dirty.current) saveDraft(context, { text, tags }) }, [text, tags])

  const toggle = id => { dirty.current = true; setTags(x => x.includes(id) ? x.filter(y => y !== id) : [...x, id]) }
  const canSend = !sending && (text.trim() || tags.length) && text.length <= MAX_TEXT
  const send = async () => {
    if (!canSend) return
    setSending(true); setError('')
    try {
      const m = await postMessage({ text: text.trim(), tags, context })
      add(m)
      dirty.current = false
      saveDraft(context, null)
      setText(''); setTags([])
      toast(t('Sent to your trainer'))
    } catch (e) {
      // Server said no for a reason worth reading (too long, too many) vs. simply not reachable.
      setError(e.status && e.status !== 502 && e.status !== 503 && e.status !== 504 ? e.message
        : t('Not sent — no connection. Your note is saved on this phone; try again when you’re back online.'))
    }
    setSending(false)
  }

  const waiting = awaitingReply(messages)
  const about = context.exId ? exName(context.exId) : context.workoutId ? t('this workout') : ''

  // Header and composer stay put; only the thread scrolls (.tr-sheet), so the close button and
  // the text box are both on screen without scrolling the sheet.
  return <div className="tr-sheet">
    <div className="row between" style={{ marginBottom: 10 }}>
      <h3 style={{ margin: 0 }}>{t('Tell my trainer')}</h3>
      <button className="iconbtn" aria-label={t('Close')} onClick={close}><Icon name="xmark" /></button>
    </div>
    <div className="tr-thread" ref={listRef}>
      {!loaded && !messages.length && <div className="small dim" style={{ textAlign: 'center', padding: '10px 0' }}>{t('Loading…')}</div>}
      {loaded && !messages.length && <div className="small muted" style={{ textAlign: 'center', padding: '10px 0' }}>
        {t('Something wrong, not what you expected, or you just don’t like it? Say so here — your trainer answers right in the app.')}
      </div>}
      {messages.map(m => <Bubble key={m.id} m={m} waiting={waiting.has(m.id)} checker={checker} />)}
    </div>

    <div className="tr-compose">
      {about && <div className="small dim capitalize" style={{ marginBottom: 6 }}>{t('About: {0}', about)}</div>}
      <div className="chips" style={{ flexWrap: 'wrap', overflow: 'visible', marginBottom: 8 }}>
        {TAGS.map(([id]) => <button key={id} className={'chip nocap' + (tags.includes(id) ? ' on' : '')} aria-pressed={tags.includes(id)} onClick={() => toggle(id)}>{tagLabel(id)}</button>)}
      </div>
      <textarea className="input" rows={3} maxLength={MAX_TEXT} placeholder={t('What happened? (optional)')}
        value={text} onChange={e => { dirty.current = true; setText(e.target.value) }} />
      {error && <div className="small" style={{ color: 'var(--orange)', marginTop: 6 }}>{error}</div>}
      <div style={{ height: 10 }} />
      <Button variant="primary" icon="arrowUp" disabled={!canSend} onClick={send}>{sending ? t('Sending…') : t('Send')}</Button>
    </div>
  </div>
}

// Small entry button for an exercise header or a dialog.
export function TrainerButton({ context, label }) {
  const user = useStore(s => s.user)
  if (!user) return null                 // guest / demo: there is no server to talk to
  return <button className="iconbtn" aria-label={label || t('Tell my trainer')} onClick={() => openTrainer(context)}><Icon name="personCircle" /></button>
}

// Home's entry: the latest word from the trainer and an unread count. Refreshes on mount and
// whenever the app comes back to the foreground; the sheet itself polls while it is open.
export function TrainerCard() {
  const user = useStore(s => s.user)
  const messages = useTrainer(s => s.messages)
  const seen = useTrainer(s => s.seen)
  const refresh = useTrainer(s => s.refresh)
  useEffect(() => {
    if (!user) return
    refresh()
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [user, refresh])
  if (!user) return null
  const unread = unreadCount(messages, seen)
  const lastCoach = [...messages].reverse().find(m => m.from === 'trainer')
  const sub = unread && lastCoach ? lastCoach.text : awaitingReply(messages).size ? t('Your trainer is on it') : t('Something off? Tell your trainer.')
  return <div className="card tappable" role="button" style={{ cursor: 'pointer' }} onClick={() => openTrainer()}>
    <div className="row between" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 9, minWidth: 0 }}>
        <span className="lrow-i"><Icon name="personCircle" /></span>
        <div style={{ minWidth: 0 }}>
          <div className="tt" style={{ fontWeight: 500 }}>{t('Trainer')}</div>
          <div className="small dim" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
        </div>
      </div>
      {unread > 0 ? <span className="tr-badge num-r" aria-label={t('{0} new', unread)}>{unread}</span> : <Icon name="chevronRight" className="chev" />}
    </div>
  </div>
}
