import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutine } from '../lib/history.js'
import { todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { tap } from '../lib/haptics.js'
import Icon from './Icon.jsx'

// The buzz goes on pointerdown, not on the click. A tab tap navigates, which unmounts and
// rebuilds the whole view under a keyed boundary — by the time an onClick handler runs, the
// finger has been down for 30-60ms and a haptic arriving then no longer reads as "the thing I
// touched", it reads as the phone doing something of its own afterwards. haptics.js exists so
// this is the same tap() the rest of the app fires, retuned in one place if it is ever retuned.
//
// It fires even when the tab tapped is the one already selected. Nothing navigates in that
// case, but a finger still landed on a control, and a control that answers sometimes is worse
// than one that always does. The guards match press.js's: a secondary button or a second
// finger is a gesture, not a press.
function press(e) {
  if (e.button > 0 || e.isPrimary === false) return
  tap()
}

// Hoisted to module scope deliberately. Declared inside TabBar's body — where it used to live —
// this is a brand new component type on every render, so React cannot match it against the
// previous tree and tears the buttons down and rebuilds them instead of updating them. That was
// invisible while the bar's only state was a text colour. It stops being invisible the moment
// the icons carry an animation (a remount restarts it, so every unrelated re-render of the shell
// would make all four icons pop) and the moment the highlight measures the DOM (it would be
// measuring nodes that are about to be replaced).
function Tab({ icon, label, active, onGo }) {
  return (
    <button className={active ? 'on' : ''} onPointerDown={press} onClick={onGo}>
      <Icon name={icon} /><span>{label}</span>
    </button>
  )
}

// Hands the travelling highlight its geometry. See the long note at the top of nav-motion.css
// for why this is measured rather than computed from percentages, and why it is offsetLeft
// rather than getBoundingClientRect.
//
// A route that no tab owns (/workout, /admin) has no `.on` button to measure. The pill is told
// to hide and is deliberately NOT moved: leaving the last transform in place means that coming
// back to a tab it fades in already sitting where it belongs, having done its travelling while
// it was invisible.
function measure(bar) {
  const el = bar.querySelector('button.on')
  if (!el) { bar.dataset.ind = 'off'; return }
  bar.style.setProperty('--tab-x', el.offsetLeft + 'px')
  bar.style.setProperty('--tab-y', el.offsetTop + 'px')
  bar.style.setProperty('--tab-w', el.offsetWidth + 'px')
  bar.style.setProperty('--tab-h', el.offsetHeight + 'px')
  bar.dataset.ind = 'on'
}

export default function TabBar({ onStart }) {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  const barRef = useRef(null)

  const cur = loc.pathname.split('/')[1] || 'home'
  const on = k => cur === k || (cur === 'history' && k === 'stats') || (cur === 'settings' && k === 'home')
  const authed = !!(user || isGuest)

  // Before paint, always: the highlight must be under the right tab in the first frame it is
  // visible in, never slid there afterwards. Keyed on `cur` rather than on a tap, so a
  // programmatic nav() — finishing a workout, a tapped weigh-in notification, the catch-all
  // redirect — moves it exactly as a tap does.
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    // A route no tab owns (/workout, /admin) leaves the pill hidden and parked at the last
    // tab it lit. Coming back it has to REAPPEAR at the new tab, not travel there — which
    // is what the note on `measure` claims and what the bar did not do: the `data-ind` flip
    // and the new `--tab-x` land in the same style resolution, so the transform transition
    // was live and you watched the pill glide the width of the bar while fading in.
    // Finishing a workout hits this every session. `data-jump` narrows the transition to
    // opacity for the one frame the move happens on, so the travel is suppressed and the
    // fade — which is a real event and should be seen — is not.
    const wasHidden = bar.dataset.ind !== 'on'
    if (wasHidden) bar.dataset.jump = '1'
    measure(bar)
    if (bar.dataset.jump) {
      // Set before the measurement so the new --tab-x resolves in the same pass as the
      // narrowed transition and therefore lands with no travel; cleared two frames later,
      // by which time the pill is already at rest and restoring the transition has nothing
      // to animate.
      const id = requestAnimationFrame(() => requestAnimationFrame(() => { delete bar.dataset.jump }))
      return () => cancelAnimationFrame(id)
    }
  }, [cur, authed])

  // `authed` is in the deps because this component returns null before the user is known, so on
  // a cold start the bar's first few renders have no DOM at all and a mount-only effect would
  // bind to nothing and never run again.
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    let raf = 0
    // Two frames, not one. The layout effect above sets the transform before the first paint,
    // but a single rAF callback still runs inside that same frame — the browser would then see
    // the transition and the new transform in one style resolution and animate the pill in from
    // the far left of the bar. Letting one whole frame paint un-armed gives the transition a
    // settled starting value, which is the position it is already in.
    const arm = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => { bar.dataset.armed = '1' })
      })
    }
    arm()
    // A rotation, or the bar turning into a floating pill at the wide breakpoint, changes every
    // slot's width at once. That is a relayout, not a selection, so it goes through the same
    // disarm-measure-rearm cycle as the first paint and lands instantly instead of sliding.
    const relayout = () => { delete bar.dataset.armed; measure(bar); arm() }
    window.addEventListener('resize', relayout)
    window.addEventListener('orientationchange', relayout)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', relayout)
      window.removeEventListener('orientationchange', relayout)
    }
  }, [authed])

  if (!authed) return null

  const startWorkout = () => {
    if (!S.active) {
      const r = effectiveRoutine(S, todayISO())
      if (r && r.ex.length) { onStart(r.id); return }
    }
    nav('/workout')
  }

  // Both halves of the Start/Resume state are always rendered and cross-faded by nav-motion.css
  // rather than swapped, so the disc never has an empty frame and the label cannot reflow the
  // row. `aria-hidden` on the half that is faded out keeps the button's accessible name a single
  // word — without it the control announces itself as "Start Resume".
  const rec = !!S.active
  return (
    <nav id="tabbar" ref={barRef} data-ind="off">
      <span className="tabbar__ind" aria-hidden="true" />
      <Tab icon="house" label={t('Home')} active={on('home')} onGo={() => nav('/home')} />
      <Tab icon="calendar" label={t('Plan')} active={on('plan')} onGo={() => nav('/plan')} />
      <button className={'start' + (rec ? ' rec' : '')} onPointerDown={press} onClick={startWorkout}>
        <span className="cir">
          <span className="tabbar__glyph" data-show={rec ? '0' : '1'} aria-hidden="true"><Icon name="dumbbell" /></span>
          <span className="tabbar__glyph" data-show={rec ? '1' : '0'} aria-hidden="true"><Icon name="play" /></span>
        </span>
        <span className="tabbar__label">
          <span data-show={rec ? '0' : '1'} aria-hidden={rec || undefined}>{t('Start')}</span>
          <span data-show={rec ? '1' : '0'} aria-hidden={!rec || undefined}>{t('Resume')}</span>
        </span>
      </button>
      <Tab icon="chart" label={t('Stats')} active={on('stats')} onGo={() => nav('/stats')} />
      <Tab icon="list" label={t('Exercises')} active={on('library')} onGo={() => nav('/library')} />
    </nav>
  )
}
