import { useEffect, useRef } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bindUI } from './components/ui.jsx'
import { ACCENTS } from './lib/format.js'
import { setLang, useLang } from './lib/i18n.js'
import { setNav } from './lib/nav.js'
import { onNotificationTap, NATIVE } from './lib/native.js'
import { useWakeLock } from './lib/wakelock.js'
import { startFlow, bwSheet } from './sheets.jsx'
import Icon from './components/Icon.jsx'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Modals from './components/Modals.jsx'
import Toast from './components/Toast.jsx'
import RestTimer from './components/RestTimer.jsx'
import Login from './views/Login.jsx'
import Home from './views/Home.jsx'
import Plan from './views/Plan.jsx'
import RoutineEdit from './views/RoutineEdit.jsx'
import Workout from './views/Workout.jsx'
import Stats from './views/Stats.jsx'
import History from './views/History.jsx'
import Library from './views/Library.jsx'
import Settings from './views/Settings.jsx'
import Admin from './views/Admin.jsx'
import Health from './views/Health.jsx'
import { syncHealth } from './lib/healthSync.js'

bindUI(useUI)   // lets the shared controls open sheets without importing the store at module scope

function applyPrefs(theme, accent) {
  const de = document.documentElement
  de.dataset.theme = theme === 'light' ? 'light' : 'dark'
  de.dataset.accent = ACCENTS[accent] ? accent : 'lime'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = de.dataset.theme === 'light' ? '#f2f2f7' : '#000000'
}

/* ---------------------------------------------------------- route direction --
   Which way a view should enter from. nav-motion.css owns the animation; this
   owns the question of whether a route change went forward or back, which is the
   part the CSS cannot possibly know.

   THERE ARE TWO AXES, AND THEY ARE NOT THE SAME AXIS. The app's screens are laid
   out both ways at once:

     · The tabs are a flat peer row. Home, Plan, Stats, Exercises sit side by side
       in the bar with nothing beneath them, and the only sensible reading of
       "forward" between two peers is the direction your eye already travels — so
       left-to-right in the bar is forward, and Exercises back to Home comes in
       from the left even though it was a history PUSH.

     · /plan → /plan/r/:id is a genuine stack. So is Stats → History and Home →
       Settings, both of which the tab bar already treats as belonging to their
       parent tab (`on()` keeps Stats lit on /history, Home lit on /settings).
       Deeper is forward regardless of which column you are standing in.

   Collapsing those onto one integer does not work, and it is worth saying why so
   nobody tries it again: a flat ordering that puts Settings after Home to make
   Home → Settings forward also puts Settings after Plan, which would make
   Settings → Plan come in backwards when Plan is a column to the right. So each
   route carries both a column and a depth, and depth is asked first — a push or a
   pop is a stronger statement about where you are going than a sideways move, and
   the sideways answer is only meaningful between two screens standing at the same
   level.

   Everything falls back to 'none' — the plain existing fade — rather than
   guessing. A cold start has nothing to come from; /workout and /admin belong to
   no column, so a move between one of them and a same-depth screen has no
   sideways reading; and two routines under the same parent are the same screen
   with different contents. Inventing a direction for any of those would be lying
   about the shape of the app, and a fade is an honest way to say "sideways, no
   opinion".

   The column numbers below are the tab bar's visual order and have to stay in
   step with the order TabBar.jsx renders its buttons in. -------------------- */
const TAB_COLUMN = { home: 0, settings: 0, plan: 1, stats: 2, history: 2, health: 2, library: 3 }
// Routes that are already a level down when you arrive at them: pushed out of the
// tab that owns them. /workout is deeper still — it is reachable from every tab
// via the raised button, so leaving it always reads as coming back up.
const HEAD_DEPTH = { settings: 1, history: 1, health: 1, admin: 1, workout: 2 }

function axis(pathname) {
  const seg = pathname.split('/').filter(Boolean)
  const head = seg[0] || 'home'
  // A second segment is always a detail of the first — /plan/r/:id is the only one
  // today, but the rule is the shape of the URL rather than a list to maintain.
  return { col: TAB_COLUMN[head], depth: (HEAD_DEPTH[head] || 0) + (seg.length > 1 ? 1 : 0) }
}

function direction(from, to) {
  if (!from || from === to) return 'none'
  const a = axis(from)
  const b = axis(to)
  if (a.depth !== b.depth) return b.depth > a.depth ? 'fwd' : 'back'
  if (a.col == null || b.col == null || a.col === b.col) return 'none'
  return b.col > a.col ? 'fwd' : 'back'
}

function Shell() {
  const navigate = useNavigate()
  const loc = useLocation()
  // Narrow selectors: subscribing to the store object itself re-rendered the whole app on
  // every write, including each set logged during a workout.
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const ready = useStore(s => s.ready)
  const isGuest = useStore(s => s.isGuest())
  const langV = useLang()   // re-renders the whole shell when the language (pack) changes

  // Direction is derived from the route change itself, during render, rather than
  // set by whoever called navigate(). That is the only version that covers every
  // way this app moves: a tab tap, a nav() fired from a sheet flow after a workout
  // is saved, the weigh-in notification, the catch-all redirect, and a back out of
  // history — none of which share a call site to hook into. It is also why the
  // keyed remount below is the right carrier rather than a wrapped navigate(): the
  // element that animates is the one React has just created, so it cannot get the
  // attribute of a navigation it is not the result of.
  //
  // Mutating a ref during render is the documented way to derive state from a
  // changed prop without a second render pass. The pathname guard is what makes it
  // safe under StrictMode's double invocation — the second pass sees the pathname
  // already stored and keeps the answer the first pass worked out, instead of
  // comparing the route against itself and flattening every transition to 'none'.
  const prevPath = useRef(null)
  const dirRef = useRef('none')
  if (prevPath.current !== loc.pathname) {
    dirRef.current = direction(prevPath.current, loc.pathname)
    prevPath.current = loc.pathname
  }

  useEffect(() => { setNav(navigate) }, [navigate])
  useEffect(() => { applyPrefs(S.theme, S.accent) }, [S.theme, S.accent])
  useEffect(() => { setLang(S.lang || 'en') }, [S.lang])
  useEffect(() => { document.documentElement.lang = S.lang || 'en' }, [langV, S.lang])
  // every tab/route change starts at the top of the page
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  // bound to the workout, not to the route — checking Stats mid-session keeps the screen on
  useWakeLock(!!S.active && S.keepAwake !== false)

  const authed = user || isGuest

  // Apple Health -> Lift Book, in the iOS app: once the profile is loaded, and again every time the
  // app comes back to the front (syncHealth throttles itself to one run per ten minutes).
  useEffect(() => {
    if (!NATIVE || !ready || !user) return
    const run = () => syncHealth({ getS: () => useStore.getState().S, update: fn => useStore.getState().update(fn) })
      .then(r => { if (r && !r.skipped && !r.error) window.dispatchEvent(new Event('vitals-updated')) })
    run()
    const onVis = () => { if (document.visibilityState === 'visible') run() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [ready, user?.id])

  // A tapped weigh-in nudge lands here, whether the app was already running or the tap launched
  // it. The scale sheet is the whole point of the notification, so it opens straight away.
  useEffect(() => {
    if (!authed) return
    let off = () => {}
    let dead = false
    onNotificationTap(open => { if (open === 'weight') bwSheet() }).then(fn => { dead ? fn() : (off = fn) })
    return () => { dead = true; off() }
  }, [authed])

  if (!ready && !authed) return (
    <div id="app">
      <div style={{ paddingTop: '44vh', display: 'flex', justifyContent: 'center', fontSize: 34, color: 'var(--label-3)' }}>
        <Icon name="dumbbell" />
      </div>
    </div>
  )

  return (
    <>
      {/* keyed on the route: a view that throws is contained, and switching tabs
          re-mounts the boundary, so the tab bar is always a way out. The key is
          untouched and that property is unchanged — the remount is now also what
          carries the transition, because it hands nav-motion.css a fresh element
          per route whose enter animation restarts on its own. `data-dir` only
          picks which of the three enter animations that element plays. */}
      <div id="app" className="vfade" data-dir={dirRef.current} key={loc.pathname}>
        <ErrorBoundary>
          {!authed ? <Login /> : (
            <Routes>
              <Route path="/home" element={<Home />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/plan/r/:id" element={<RoutineEdit />} />
              <Route path="/workout" element={<Workout />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/history" element={<History />} />
              <Route path="/health" element={<Health />} />
              <Route path="/health/:metric" element={<Health />} />
              <Route path="/library" element={<Library />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin" element={user?.admin ? <Admin /> : <Navigate to="/home" replace />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          )}
        </ErrorBoundary>
      </div>
      <TabBar onStart={startFlow} />
      <RestTimer />
      <Modals />
      <Toast />
    </>
  )
}

export default function App() {
  const boot = useStore(s => s.boot)
  useEffect(() => { boot() }, [boot])
  return <HashRouter><Shell /></HashRouter>
}
