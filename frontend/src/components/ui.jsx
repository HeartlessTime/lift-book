// Lift Book control set.
//
// Every input in the app is built here rather than styled on top of a native
// widget. Native controls are the single loudest "unfinished" tell: a checkbox
// renders blue on iOS and grey on Android, a range slider paints its own white
// track that no theme reaches, and a <select> opens a system list that ignores
// dark mode entirely. Rebuilding them means one visual language and one focus
// treatment across every platform.
//
// Shared rules:
//   · every control is driven by (value, onChange) — no internal source of truth
//   · hit targets are ≥44px even when the painted control is smaller
//   · :active gives a scale/tint response so touch feels acknowledged
//   · focus-visible draws a ring; pointer interaction never does
//   · every control fires its haptic on POINTERDOWN, never in onClick or an
//     effect. onClick lands after React has re-rendered the control, which on a
//     busy screen is 30-60ms behind the finger — far enough that the buzz stops
//     reading as "the thing I touched" and starts reading as the phone twitching
//     on its own. The intent is chosen by what the control MEANS: select() for a
//     value moving through a series (stepper, slider detent, segmented cell),
//     tap() for a discrete one-shot (button, switch, checkbox).
//   · the PRESS VISUAL is not wired here. lib/press.js already marks every
//     button/.chk/.stp button/.sw on pointerdown via one delegated listener, and
//     _motion.css paints it. Only the haptic is missing from that path, because
//     press.js is a passive listener and has to stay one.

import { useRef, useState, useEffect, useCallback, forwardRef } from 'react'
import Icon from './Icon.jsx'
import { tap, select } from '../lib/haptics.js'
import { dur } from '../lib/motion.js'

/* ============================ text ============================ */

// Numeric input accepting "," as decimal separator — iOS decimal keypads in many
// locales only offer a comma, and type="number" reports "" for it (value snaps to
// 0). Keeps a local string draft while focused so partial input like "33," survives.
// `nullable` is for fields where "nothing entered" and 0 mean different things (RIR: a
// logged 0 is a set taken to failure). Those clear back to null instead of snapping to 0.
export function NumberField({ value, onChange, decimal = true, nullable = false, className = '', ...rest }) {
  const [draft, setDraft] = useState(null)
  const committed = useRef(null)
  // null and undefined are the same "empty" here — a nullable field's key is dropped once cleared.
  if (draft !== null && (committed.current ?? null) !== (value ?? null)) { setDraft(null); committed.current = null }
  const commit = raw => {
    let s = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '')
    const i = s.indexOf('.')
    if (i !== -1) s = decimal ? s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '') : s.slice(0, i)
    const n = s === '' || s === '.' ? (nullable ? null : 0) : Math.max(0, parseFloat(s))
    committed.current = n
    setDraft(s)
    onChange(n)
  }
  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      className={'num ' + className}
      value={draft ?? (value ?? '')}
      onFocus={e => e.target.select()}
      onChange={e => commit(e.target.value)}
      onBlur={() => { setDraft(null); committed.current = null }}
      {...rest}
    />
  )
}

// forwardRef so callers can focus it or read its value imperatively
export const TextField = forwardRef(function TextField({ className = '', ...rest }, ref) {
  return <input ref={ref} className={'field ' + className} {...rest} />
})

export function TextArea({ className = '', ...rest }) {
  return <textarea className={'field area ' + className} {...rest} />
}

export function SearchField({ value, onChange, onClear, ...rest }) {
  return (
    <div className="searchf">
      <Icon name="magnifier" className="lead" />
      <input className="field" value={value} onChange={onChange} {...rest} />
      {!!value && (
        <button className="clear" onClick={onClear} aria-label="Clear">
          <Icon name="xmark" />
        </button>
      )}
    </div>
  )
}

/* ============================ switch ============================ */

export function Switch({ checked, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={!!checked}
      disabled={disabled}
      className={'sw' + (checked ? ' on' : '')}
      // A toggle is a discrete one-shot, so tap() rather than select() — and it
      // fires here, a frame before the knob starts moving, so the buzz and the
      // throw are the same event.
      onPointerDown={() => { if (!disabled) tap() }}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  )
}

/* ============================ segmented ============================ */

// options: [{ value, label, icon? }]  — the selected pill slides between cells.
export function Segmented({ options, value, onChange, className = '' }) {
  const i = Math.max(0, options.findIndex(o => o.value === value))
  return (
    <div className={'seg ' + className} style={{ '--n': options.length, '--i': i }}>
      <span className="seg-sel" aria-hidden="true" />
      {options.map(o => (
        <button
          key={o.value}
          className={o.value === value ? 'on' : ''}
          aria-pressed={o.value === value}
          // Only a cell that will actually MOVE the value gets a detent. Tapping
          // the cell that is already selected changes nothing, and a haptic for
          // nothing is how a control starts feeling random.
          onPointerDown={() => { if (o.value !== value) select() }}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} />}
          {o.label && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  )
}

/* ============================ stepper ============================ */

export function Stepper({ value, step = 1, onChange, decimal = true, className = '', label, unit }) {
  const set = v => onChange(Math.max(0, Math.round((v || 0) * 100) / 100))
  // set() clamps at zero, so minus on a value of 0 is a no-op — and a no-op must
  // not buzz. Held down, the stepper is the fastest-repeating control in the app,
  // which is exactly why it gets select() (the faint picker detent) and not tap().
  const bump = d => { if (Math.max(0, (+value || 0) + d) !== (+value || 0)) select() }
  const inner = (
    <div className={'stp ' + className}>
      <button onPointerDown={() => bump(-step)} onClick={() => set((+value || 0) - step)} aria-label="Decrease"><Icon name="minus" /></button>
      <span className="val">
        <NumberField value={value} decimal={decimal} onChange={onChange} />
        {unit && <i>{unit}</i>}
      </span>
      <button onPointerDown={() => bump(step)} onClick={() => set((+value || 0) + step)} aria-label="Increase"><Icon name="plus" /></button>
    </div>
  )
  if (!label) return inner
  return <div className="stp-w"><span className="stp-l">{label}</span>{inner}</div>
}

/* ============================ slider ============================ */

// Pointer-driven so the fill, track and thumb are all ours — no ::-webkit-*
// pseudo-elements, which is the only way the control looks identical on every
// platform and can pick up the accent colour.
export function Slider({ value, min = 0, max = 100, step = 1, onChange, className = '' }) {
  const ref = useRef(null)
  const [drag, setDrag] = useState(false)
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))

  // Detent state. `lastV` is the value the last tick was played for, `lastT` is when.
  const lastV = useRef(null)
  const lastT = useRef(0)
  // The slider is the one control here that is dragged rather than tapped, so it is
  // the one that can machine-gun. Two guards, and both are needed:
  //   1. only when the SNAPPED value changes — a pointermove that lands inside the
  //      same step is not a detent, and on a coarse step most moves are exactly that.
  //   2. never more than one per 45ms. Fine steps over a wide track still change the
  //      value on nearly every frame, and at 60fps that is 60 calls a second; the
  //      Taptic Engine coalesces anything that dense into one continuous smear, so
  //      the extra calls cost battery and actively destroy the effect they are for.
  const detent = v => {
    if (v === lastV.current) return
    lastV.current = v
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    if (now - lastT.current < 45) return
    lastT.current = now
    select()
  }

  const posToValue = useCallback(clientX => {
    const el = ref.current
    if (!el) return value
    const r = el.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const raw = min + f * (max - min)
    const snapped = Math.round(raw / step) * step
    // step can be fractional (0.1) — round away binary noise
    return Math.min(max, Math.max(min, Math.round(snapped * 1000) / 1000))
  }, [min, max, step, value])

  useEffect(() => {
    if (!drag) return
    const move = e => {
      e.preventDefault()
      const v = posToValue(e.touches ? e.touches[0].clientX : e.clientX)
      detent(v)
      onChange(v)
    }
    const up = () => setDrag(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [drag, onChange, posToValue])

  const key = e => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0
    if (!d) return
    e.preventDefault()
    onChange(Math.min(max, Math.max(min, Math.round((value + d) * 1000) / 1000)))
  }

  return (
    <div
      ref={ref}
      className={'sld' + (drag ? ' dragging' : '') + ' ' + className}
      role="slider"
      tabIndex={0}
      aria-valuenow={value} aria-valuemin={min} aria-valuemax={max}
      data-nodrag                                  /* keeps the sheet from swipe-dismissing */
      onKeyDown={key}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        setDrag(true)
        const v = posToValue(e.clientX)
        // Seed the detent with the value the grab itself jumps to, so the first
        // move inside that same step stays silent instead of double-ticking.
        lastV.current = null
        detent(v)
        onChange(v)
      }}
    >
      {/* width and left used to carry these, rewritten on every pointermove — a
          layout pass per frame on the control you are physically holding. Both are
          transforms now; see the .sld block in list-motion.css for why the knob
          needs a rail rather than a percentage translate of its own. */}
      <span className="sld-track"><span className="sld-fill" style={{ transform: 'scaleX(' + (pct / 100) + ')' }} /></span>
      <span className="sld-knobw" style={{ transform: 'translateX(' + pct + '%)' }}>
        <span className="sld-knob" />
      </span>
    </div>
  )
}

/* ============================ checkbox ============================ */

// `haptic` is the intent the tick carries, and it is a prop because a checkbox does
// not know what it means. Everywhere in the app a check is a discrete one-shot, so
// tap() is the default — but the one in a workout's set row is the user committing a
// set they just finished, which is the heaviest thing they do all session and wants
// commit(). Passing the intent in beats wrapping the control from outside: a wrapper
// fires on the way back up and the button's own handler has already fired on the way
// down, so the two stack into a double buzz.
export function Check({ checked, onChange, className = '', size, haptic }) {
  return (
    <button
      role="checkbox"
      aria-checked={!!checked}
      className={'chk' + (checked ? ' on' : '') + ' ' + className}
      style={size ? { width: size, height: size } : null}
      // Discrete, like the switch. The tick's spring (list-motion.css) lands on
      // roughly the same beat, so the buzz and the mark arrive together.
      onPointerDown={() => (haptic || tap)()}
      onClick={() => onChange(!checked)}
    >
      <Icon name="check" />
    </button>
  )
}

/* ============================ list entry ============================ */

// How the staggered list entry is tuned, in one place so the views and the
// stylesheet cannot drift apart. The 28ms step and the 6-row cap are also written
// into `.ls-enter > .ls-i` in list-motion.css; these constants exist so the JS
// knows how long the whole arrival takes.
const STAGGER_STEP = 28
const STAGGER_CAP = 6
const ENTRY_MS = STAGGER_CAP * STAGGER_STEP + 200   // + --t-med, the row's own duration

// Returns true for as long as a freshly mounted list is still arriving.
//
// This is the whole answer to "the stagger must not replay". React's keying stops
// rows that SURVIVE a filter from re-animating — they keep their DOM node, and a
// CSS animation only runs when a node is inserted. What keying cannot help with is
// a row that is genuinely new: tapping a body-part chip in the Library replaces
// nearly the whole list, and every one of those fresh nodes ran the entry animation
// with a stagger delay in front of it.
//
// So the container owns the entry animation outright, not just its delay, and it
// only claims it while the view is genuinely arriving. After ENTRY_MS the class
// comes off and every row that mounts from then on — a search hit, the next page of
// "Show more", an exercise just added to a routine — is simply there. Arrival
// animates; a change does not (the long note in list-motion.css has the argument).
//
// Dropping the class mid-flight would snap the unfinished rows to their end state,
// so the timer is deliberately the FULL window rather than a guess at it. Under
// reduced motion dur() collapses it, which is correct: _motion.css has already
// zeroed the delays, so there is nothing left to wait for.
export function useListEnter() {
  const [entering, setEntering] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setEntering(false), dur(ENTRY_MS))
    return () => clearTimeout(id)
  }, [])
  return entering
}

// The container class. Views spell it this way so the "am I still arriving?"
// question is asked once per list and never inlined as a ternary in JSX.
export const listClass = (entering, extra = '') =>
  'list' + (entering ? ' ls-enter' : '') + (extra ? ' ' + extra : '')

// The same flag on a container that is not a `.list`. The Stats cards stagger their bar
// rows (`.mrow`, styles/data-motion.css) and need the identical gate: those rows are
// re-created every time a range segment is tapped or a muscle is selected, and without
// the gate the card re-dissolved itself on every one of those.
export const enterClass = (entering, base) => base + (entering ? ' ls-enter' : '')

/* ============================ grouped list ============================ */

// The inset-grouped list is the app's main structural primitive: a titled
// section holding rows separated by hairlines that stop short of the leading
// edge, so the icon column reads as a continuous rail.
export function Section({ title, footer, children, className = '' }) {
  return (
    <section className={'sect ' + className}>
      {title && <h2 className="sect-t">{title}</h2>}
      <div className="sect-b">{children}</div>
      {footer && <p className="sect-f">{footer}</p>}
    </section>
  )
}

export function Row({ icon, iconTint, title, subtitle, value, accessory = 'none', onClick, danger, children, className = '' }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={'lrow' + (onClick ? ' tap' : '') + (danger ? ' danger' : '') + ' ' + className} onClick={onClick}>
      {icon && <span className="lrow-i" style={iconTint ? { '--tint': iconTint } : null}><Icon name={icon} /></span>}
      <span className="lrow-m">
        <span className="lrow-t">{title}</span>
        {subtitle && <span className="lrow-s">{subtitle}</span>}
      </span>
      {children}
      {value != null && <span className="lrow-v">{value}</span>}
      {accessory === 'chevron' && <Icon name="chevronRight" className="lrow-c" />}
      {accessory === 'check' && <Icon name="check" className="lrow-k" />}
    </Tag>
  )
}

/* ============================ picker ============================ */

// Replaces <select>. A native select opens a system list that ignores the app's
// theme entirely — on dark mode it flashes a white sheet — and can't show more
// than a bare label per option. This opens our own sheet with a checkmark on the
// current value, which is also how iOS itself handles a long option list.
export function SelectRow({ icon, iconTint, title, value, options, onChange, sheetTitle }) {
  const cur = options.find(o => o.value === value)
  const open = () => {
    const { openSheet } = require_ui()
    const h = openSheet(close => (
      <>
        <h3>{sheetTitle || title}</h3>
        <div className="sect-b">
          {options.map(o => (
            <button key={o.value} className="lrow tap" onClick={() => { close(); onChange(o.value) }}>
              <span className="lrow-m"><span className="lrow-t">{o.label}</span>
                {o.subtitle && <span className="lrow-s">{o.subtitle}</span>}</span>
              {o.value === value && <Icon name="check" className="lrow-k" />}
            </button>
          ))}
        </div>
        <div style={{ height: 8 }} />
      </>
    ))
    return h
  }
  return (
    <Row icon={icon} iconTint={iconTint} title={title} value={cur ? cur.label : value} accessory="chevron" onClick={open} />
  )
}

// Late import keeps this module free of a cycle at load time (useUI pulls in the
// store, which pulls in helpers that import controls).
let _ui = null
export function bindUI(store) { _ui = store }
function require_ui() {
  if (!_ui) throw new Error('ui store not bound — call bindUI(useUI) once at boot')
  return _ui.getState()
}

/* ============================ buttons ============================ */

export function Button({ variant = 'plain', size, icon, trailingIcon, children, className = '', onPointerDown, disabled, ...rest }) {
  // onPointerDown is pulled out of `...rest` rather than left to be spread, because
  // a caller that passes its own handler would otherwise silently replace the
  // haptic — the kind of loss nobody notices until half the buttons are dead.
  const down = e => { if (!disabled) tap(); onPointerDown && onPointerDown(e) }
  return (
    <button className={`btn ${variant}${size ? ' ' + size : ''} ${className}`} disabled={disabled} onPointerDown={down} {...rest}>
      {icon && <Icon name={icon} />}
      {children && <span>{children}</span>}
      {trailingIcon && <Icon name={trailingIcon} />}
    </button>
  )
}
