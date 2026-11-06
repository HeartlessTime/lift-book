import { useEffect, useRef } from 'react'
import { useUI } from '../store/useUI.js'

// One bottom sheet (or centered dialog) with swipe-to-dismiss.
function Sheet({ sheet }) {
  // closeSheet alone: taking the whole UI store re-rendered every open sheet once a second
  // while a rest countdown was running.
  const closeSheet = useUI(s => s.closeSheet)
  const ref = useRef(null)
  const drag = useRef({ startY: null, delta: 0 })

  const onTouchStart = e => {
    const el = ref.current
    // a gesture that begins on a slider (or opted-out control) belongs to that control,
    // not to the sheet's swipe-to-dismiss — so it keeps working while you drag
    if (e.target.closest && e.target.closest('input[type=range], [data-nodrag]')) {
      drag.current = { startY: null, delta: 0 }
      return
    }
    // Nor one inside a scroller of its own (the trainer thread) that isn't at its top: pulling
    // down there scrolls the list back, it doesn't drag the sheet away.
    for (let n = e.target; n && n !== el; n = n.parentElement) {
      if (n.scrollTop > 0) { drag.current = { startY: null, delta: 0 }; return }
    }
    drag.current = { startY: el.scrollTop <= 0 ? e.touches[0].clientY : null, delta: 0 }
  }
  const onTouchMove = e => {
    const el = ref.current, d = drag.current
    if (d.startY === null) return
    d.delta = e.touches[0].clientY - d.startY
    if (d.delta > 0 && el.scrollTop <= 0) {
      e.preventDefault()
      // The entrance keyframe would otherwise outrank the transform the drag writes — a CSS
      // animation beats a normal declaration, inline style included. Killed here rather than
      // on touchstart, so tapping a button inside a still-arriving sheet does not snap it, and
      // never restored, because restoring the name replays the entrance on release.
      el.style.animation = 'none'
      el.style.transition = 'none'
      el.style.transform = `translateY(${d.delta}px)`
    } else d.delta = 0
  }
  const onTouchEnd = () => {
    const el = ref.current, d = drag.current
    if (d.startY === null) return
    // Past the threshold the gesture carried real momentum, so the sheet keeps going on the
    // same inline transform rather than snapping back to 0 for the CSS exit to replay — the
    // `closing` flag the store sets still fades the backdrop out underneath it, and the store
    // unmounts both together. Under the threshold it springs back to rest.
    if (d.delta > 90 && !sheet.locked) {
      el.style.transition = `transform var(--t-exit) var(--ease-in)`
      el.style.transform = 'translateY(110%)'
      closeSheet(sheet.id)
    } else {
      el.style.transition = `transform var(--t-med) var(--ease-spring)`
      el.style.transform = ''
    }
    d.startY = null
  }

  // non-passive touchmove so preventDefault works (bottom sheets only; centered dialogs have no ref)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  const close = () => closeSheet(sheet.id)
  // `closing` is set by the store and cleared by unmounting, --t-exit later. It is the only
  // thing the exit animations key off, so a sheet dismissed by the backdrop, by a button and
  // by a swipe all leave the same way.
  const x = sheet.closing ? ' closing' : ''
  // A backdrop tap during the exit would queue a second close; the store guards it, but not
  // taking the tap at all is one less thing that can go wrong under a fat thumb.
  const backdrop = () => { if (!sheet.locked && !sheet.closing) close() }
  if (sheet.kind === 'center') {
    return (
      <div>
        <div className={'mback' + x} onClick={backdrop} />
        <div className={'center' + x}>{sheet.render(close)}</div>
      </div>
    )
  }
  return (
    <div>
      <div className={'mback' + x} onClick={backdrop} />
      <div className={'sheet' + x} ref={ref} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="grab" />
        {sheet.render(close)}
      </div>
    </div>
  )
}

export default function Modals() {
  const sheets = useUI(s => s.sheets)

  // lock the page behind any open sheet (iOS-safe)
  useEffect(() => {
    if (!sheets.length) return
    const y = window.scrollY || 0
    // Which screen that scroll position belongs to. The restore below used to be
    // unconditional, and it was harmless only while closing a sheet unmounted it on the
    // same frame: `close(); nav('/home')` ran the restore first and the route change's own
    // scrollTo(0, 0) second, so the page landed at the top. Deferring the unmount by
    // --t-exit so the sheet can be seen leaving reversed those two, and the finish summary
    // — which closes and navigates in one handler — started dropping Home in at the top and
    // then jerking it down to wherever the workout had been scrolled to, a fifth of a
    // second later. A scroll position is only worth restoring to the screen it was taken on.
    const route = window.location.hash
    const b = document.body.style
    b.position = 'fixed'; b.top = -y + 'px'; b.left = '0'; b.right = '0'; b.width = '100%'
    return () => {
      b.position = b.top = b.left = b.right = b.width = ''
      if (window.location.hash === route) window.scrollTo(0, y)
    }
  }, [sheets.length > 0])

  // iOS never shrinks the layout viewport for the keyboard, so a sheet pinned to the bottom
  // stays put and the keys land on top of whatever you are typing into. visualViewport is the
  // only thing that reports how much is actually covered — publish it as --kb and let the CSS
  // lift the sheet by that much. Browsers without it (and desktop, where nothing is covered)
  // simply keep the 0px default.
  useEffect(() => {
    const vv = window.visualViewport
    if (!sheets.length || !vv) return
    const root = document.documentElement
    // offsetTop matters too: Safari scrolls the visual viewport to chase the focused field
    const sync = () => root.style.setProperty('--kb', Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px')
    sync()
    vv.addEventListener('resize', sync); vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync); vv.removeEventListener('scroll', sync)
      root.style.removeProperty('--kb')
    }
  }, [sheets.length > 0])

  if (!sheets.length) return null
  return (
    <div id="modal-root" className="open">
      {sheets.map(s => <Sheet key={s.id} sheet={s} />)}
    </div>
  )
}
