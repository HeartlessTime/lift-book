import { Capacitor, registerPlugin } from '@capacitor/core'
import { STALE_MS, forwardPlan } from './workoutCard.js'

// The WatchWorkout native plugin (ios/App/App/WatchWorkoutPlugin.swift). Kept apart from
// watchWorkout.js so healthSync.js can ask for permissions without importing the store.
export const WatchNative = registerPlugin('WatchWorkout')
export const watchWorkoutAvailable = () =>
  Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('WatchWorkout')

export const callWatch = (fn, arg) => Promise.resolve(WatchNative[fn](arg))
  .catch(e => { console.log(`watch: ${fn} failed`, e?.message || e); return null })

// The Health permissions the watch path and the weight writes need (workouts and body weight to
// write; workouts, energy, heart rate, weight to read). iOS asks once; silent after that.
export function authorizeWorkouts() {
  return watchWorkoutAvailable() ? callWatch('authorize', {}) : Promise.resolve(null)
}

// What the change from `prev` to `next` means for the watch. Pure, exported for the test.
// A session that leaves `active` and shows up in `workouts` was finished; one that just
// disappears was discarded. A session older than the stale horizon is not started.
export function watchEvents(prev, next, now = Date.now()) {
  const a = prev && prev.active, b = next && next.active
  const out = []
  if (a && (!b || b.id !== a.id)) {
    const w = ((next && next.workouts) || []).find(x => x.id === a.id)
    out.push(w && w.end > w.start
      ? { kind: 'finish', session: a.id, startedAt: w.start, endedAt: w.end }
      : { kind: 'discard', session: a.id })
  }
  if (b && (!a || a.id !== b.id) && b.start > now - STALE_MS) {
    out.push({ kind: 'start', session: b.id, startedAt: b.start, name: b.name || '' })
  }
  return out
}

// The watch's whole screen, minus what it measures itself. Pure, exported for the test.
export function watchNow(S, timer, now = Date.now()) {
  let p = {}
  try { p = forwardPlan(S)[0] || {} } catch { /* no plan, blank screen */ }
  const resting = timer && timer.endsAt > now
  return {
    exercise: p.exercise || '', detail: p.detail || '', setNo: p.setNo || 0, setOf: p.setOf || 0,
    restEndsAt: resting ? timer.endsAt : 0, restTotal: resting ? timer.total : 0
  }
}
