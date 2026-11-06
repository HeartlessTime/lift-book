// Native shell (Capacitor / WKWebView) — runtime detection, not a build flag.
//
// The same bundle runs in a browser and inside the iOS app; `Capacitor.isNativePlatform()`
// answers from the native bridge, so it is true only when the webview really is the app.
// This deliberately replaces the old build-time VITE_MOBILE constant: a build flag meant the
// app could be pointed at a bundle that was compiled as "web", silently killing every native
// path. A runtime check cannot be got wrong that way.
//
// The native app is NOT standalone — it talks to the same backend the web app does. What the
// native side adds is durability and OS integration: a JSON mirror of the state in the app's
// private data directory (WKWebView localStorage is evicted under storage pressure), local
// notifications for the workout reminder, and the OS share sheet for exports.
import { Capacitor } from '@capacitor/core'
import { t } from './i18n.js'
import { effectiveRoutineId } from './history.js'

export const NATIVE = Capacitor.isNativePlatform()

const FILE = 'liftbook-state.json'

export async function nativeLoad() {
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const r = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 })
    return JSON.parse(r.data)
  } catch (e) { return null }   // first launch, or unreadable — localStorage copy takes over
}

export async function nativeSave(state) {
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    await Filesystem.writeFile({ path: FILE, directory: Directory.Data, data: JSON.stringify(state), encoding: Encoding.UTF8 })
  } catch (e) { /* keep the localStorage copy */ }
}

// The signed-in profile, mirrored beside the state file and for the same reason. The everyday
// copy lives in localStorage, which iOS evicts wholesale — and an eviction landing while the
// server happens to be unreachable would leave the app holding a full training log it cannot
// attribute to anybody: the sign-in screen, with the data sitting right there on disk. The device
// token is the actual credential; this is only the name and id to render with until the server
// confirms, and a 401 still clears it.
const USER_FILE = 'liftbook-user.json'

export async function nativeLoadUser() {
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const r = await Filesystem.readFile({ path: USER_FILE, directory: Directory.Data, encoding: Encoding.UTF8 })
    return JSON.parse(r.data)
  } catch (e) { return null }
}

export async function nativeSaveUser(user) {
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    if (!user) return void await Filesystem.deleteFile({ path: USER_FILE, directory: Directory.Data }).catch(() => {})
    await Filesystem.writeFile({ path: USER_FILE, directory: Directory.Data, data: JSON.stringify(user), encoding: Encoding.UTF8 })
  } catch (e) { /* the localStorage copy still stands */ }
}

// Notification ids. Workout reminders and weigh-in nudges are each one per day of the coming week
// (100…106 and 110…116). Disjoint ranges, so cancelling one kind never takes the other down with it.
const DAY_IDS = [0, 1, 2, 3, 4, 5, 6].map(d => 100 + d)
const WEIGH_IDS = [0, 1, 2, 3, 4, 5, 6].map(d => 110 + d)

const dateKey = d =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

/* The workout reminder, one one-shot per DATE for the coming week (trainer plan 2026-10-19).

   It used to be one repeating rule per weekday, which could not follow a session moved with the
   missed-day banner and fired even after he had trained. Now each of the next seven days asks the
   same question the Home screen does — effectiveRoutineId(), so a dayPlan move or a rest day
   wins over the weekly plan — and a day with a workout already logged gets no reminder. Same
   shape as weighInSchedule() and for the same reason: syncReminder() runs after every state
   change, so finishing a workout withdraws today's alert straight away. Takes `now` for tests. */
export function workoutSchedule(S, now = new Date()) {
  if (!S.reminder?.on) return []
  const [hour, minute] = (S.reminder.time || '08:00').split(':').map(Number)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return []
  const trained = new Set((S.workouts || []).map(w => w.d))
  const out = []
  for (let i = 0; i < DAY_IDS.length; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute, 0, 0)
    if (at <= now) continue
    const iso = dateKey(at)
    if (trained.has(iso)) continue
    const rid = effectiveRoutineId({ routines: S.routines || [], week: S.week || {}, dayPlan: S.dayPlan || {} }, iso)
    const r = rid && (S.routines || []).find(x => x.id === rid)
    if (!r) continue
    out.push({
      id: DAY_IDS[i],
      title: t('Workout day'),
      body: t('{0} is on the plan today', r.name),
      schedule: { at, allowWhileIdle: true },
    })
  }
  return out
}

/* The evening weigh-in nudge.

   The server used to decide this nightly and simply not send the push if a weight for that day
   was already logged. A notification living on the phone has to be laid down in advance, so the
   same judgement is made up front instead: one one-shot per day for the coming week, leaving out
   any date already on the scale and any moment already past.

   syncReminder() runs after every state change, so logging tonight's weight withdraws tonight's
   nudge straight away and the week rolls forward on its own. A single repeating daily rule would
   have been less code, but iOS gives no way to skip one occurrence of it — which is the whole
   behaviour worth keeping. Seven days deep so the reminders survive a stretch where the app is
   never opened; exported for the tests, which is why it takes `now` rather than reading the clock.
*/
export function weighInSchedule(S, now = new Date()) {
  if (!S.weighIn?.on) return []
  const [hour, minute] = (S.weighIn.time || '21:00').split(':').map(Number)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return []
  const logged = new Set((S.bodyweight || []).map(b => b.d))
  const out = []
  for (let i = 0; i < WEIGH_IDS.length; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute, 0, 0)
    if (at <= now) continue                  // that moment has already gone by
    if (logged.has(dateKey(at))) continue    // he already stood on the scale that day
    out.push({
      id: WEIGH_IDS[i],
      title: t('Time to weigh in'),
      body: t('Log today’s weight before bed.'),
      extra: { open: 'weight' },
      schedule: { at, allowWhileIdle: true },
    })
  }
  return out
}

// (Re)schedule both reminders. Cheap enough to run after any state change — the plan, either
// reminder time, or today's weigh-in may just have changed. `interactive` gates the OS permission
// prompt to the Settings toggles; a background resync never pops a dialog.
export async function syncReminder(S, interactive = false) {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.cancel({ notifications: [...DAY_IDS, ...WEIGH_IDS].map(id => ({ id })) }).catch(() => {})
    if (!S.reminder?.on && !S.weighIn?.on) return true
    let perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted' && interactive) perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return false
    const notifications = [
      ...workoutSchedule(S),
      ...weighInSchedule(S),
    ]
    if (notifications.length) await LocalNotifications.schedule({ notifications })
    return true
  } catch (e) { return false }
}

// A tapped weigh-in nudge opens the scale sheet. This replaces the old Web Push route, where the
// service worker carried a ?log=weight query into the page; the app has no query string to carry,
// so the notification's own `extra` says what it was for. iOS delivers the tap that launched the
// app once a listener exists, so registering on mount is early enough. No-ops off-device.
export async function onNotificationTap(handler) {
  if (!NATIVE) return () => {}
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const sub = await LocalNotifications.addListener('localNotificationActionPerformed', ev => {
      const open = ev?.notification?.extra?.open
      if (open) handler(open)
    })
    return () => { try { sub.remove() } catch (e) { /* already torn down */ } }
  } catch (e) { return () => {} }
}

// WKWebView can't do blob-URL downloads, so the backup goes out through the OS share sheet
// (Files, AirDrop, mail, …) from a temp file instead.
//
// Returns true when the file actually went somewhere, false when the sheet was dismissed, and
// throws for anything else. Callers need all three: "backup exported" after a dismissal is a
// harmless lie, but the same toast after a write failure is the dangerous kind — it tells you a
// backup exists when none does. The plugin rejects a dismissal with the literal message
// "Share canceled" (SharePlugin.swift: completionWithItemsHandler, completed === false) and a
// genuine failure with "Error sharing item" or a "can't share right now" string, so the two are
// only separable by message. Matched loosely on /cancel/ so a wording change downgrades a
// dismissal to a spurious error rather than silencing a real one.
export async function shareExport(json, filename) {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')
  const w = await Filesystem.writeFile({ path: filename, directory: Directory.Cache, data: json, encoding: Encoding.UTF8 })
  try {
    await Share.share({ title: filename, url: w.uri })
    return true
  } catch (e) {
    if (/cancel/i.test(e?.message || '')) return false
    throw e
  }
}
