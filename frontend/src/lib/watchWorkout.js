import { watchWorkoutAvailable, callWatch as call, watchEvents, watchNow } from './watchNative.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { API_BASE, DEVICE_TOKEN } from './api.js'

/* Lift Book sessions in Apple Health (build 46). See ios/App/App/WatchWorkoutPlugin.swift.

   Start a workout here and the Lift Book watch app starts a Traditional Strength Training
   session on the wrist (full heart rate, calories, Exercise ring). Finish here and the watch
   saves it; discard and the watch throws it away. If the watch never ran it, the phone saves
   the workout to Health itself on finish, never over one Health already has for that time.

   This file only watches `S.active` and says what happened. Native owns every decision about
   the watch and the de-duplication, so a bug here can at worst miss a session, never double
   one.

   The watch screen shows the set up now (lift, set N of M, weight × reps) and the rest, so every
   change to either is re-sent as `now`. The API base and device token go along so the phone can
   answer the watch's "what song is on" from the background (GET /api/now-playing). */

let lastNow = ''
export function watchWorkouts() {
  if (!watchWorkoutAvailable()) return
  const api = { apiBase: API_BASE, token: DEVICE_TOKEN }
  const handle = (S, P) => {
    for (const ev of watchEvents(P, S)) {
      if (ev.kind === 'start') {
        const n = watchNow(S, useUI.getState().timer)
        lastNow = JSON.stringify(n)
        call('start', { ...ev, ...n, ...api }).then(r => r && console.log('watch: start', JSON.stringify(r)))
      } else if (ev.kind === 'finish') {
        call('finish', ev).then(r => r && console.log('watch: finish', JSON.stringify(r)))
      } else {
        call('discard', ev)
      }
    }
    send(S)
  }
  const send = S => {
    if (!S.active) return
    const n = watchNow(S, useUI.getState().timer)
    const key = JSON.stringify(n)
    if (key !== lastNow) { lastNow = key; call('update', { session: S.active.id, ...n, ...api }) }
  }
  const go = () => {
    // A workout already running when the app opens: native ignores a session it already started.
    handle(useStore.getState().S, null)
    useStore.subscribe((s, p) => { if (s.S !== p.S) handle(s.S, p.S) })
    useUI.subscribe((u, p) => { if (u.timer?.endsAt !== p.timer?.endsAt) send(useStore.getState().S) })
  }
  if (useStore.getState().ready) go()
  else { const un = useStore.subscribe(s => { if (s.ready) { un(); go() } }) }
}
