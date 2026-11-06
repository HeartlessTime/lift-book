import Foundation
import ActivityKit
import AppIntents
import UserNotifications

/* The lock-screen workout card's controls, and the state they need in order to work with nobody
   home.

   While the phone is locked the WKWebView is suspended, so a tap on the lock screen cannot reach
   the JavaScript that owns the workout. A `LiveActivityIntent` runs in the *app's* process instead
   — the system wakes it in the background — so every tap lands here, in native state, and is
   merged back the moment the app comes forward again (lib/nativeSets.js).

   The web layer describes the session — the sets still to do, in order, and any rest running —
   and this walks a cursor through it, queueing what was done so it can be merged exactly once.
   The Apple Watch has exactly this problem, so it is written as a general bridge rather than
   anything lock-screen shaped.

   Compiled into BOTH targets. The widget needs the intent types to draw its buttons; the bodies
   only ever run in the app — but the state they touch lives in the App Group suite regardless, so
   an extension-side read gets the real plan rather than an empty container. */

/// One upcoming set, exactly as the web layer described it.
struct PlannedSet: Codable, Hashable {
    /// Opaque handle from the web layer — "entryIndex:setIndex" within the live session.
    let key: String
    let exercise: String
    /// e.g. "82.5×8 · set 3 of 4" — the rest-over notification's body.
    let setLine: String
    /// Rest to run once this set is ticked off. Zero where the app would not rest (between
    /// exercises), so the card and the app agree.
    let restSec: Int
    /// Optional so a plan stored by an older build still decodes.
    var detail: String?
    var setNo: Int?
    var setOf: Int?
}

/// A tap the web layer has not seen yet.
struct CompletedSet: Codable, Hashable {
    let key: String
    /// Epoch milliseconds — so it merges as the moment it happened, not the moment he reopened.
    let at: Double
    /// "done" or "skip". Nil on anything queued by an older build, which only ever logged sets.
    var kind: String?
    /// The workout it was tapped in; the web layer drops anything from another one.
    var session: String?
}

/// The workout the card belongs to — what does not change set to set.
struct CardSession: Codable, Hashable {
    var id: String
    var routine: String
    /// Epoch milliseconds.
    var startedAt: Double
    var accent: String
    var done: Int
    var total: Int
}

/* The one store both processes read.

   `RestTimerBridge.swift` is compiled into the app *and* the widget extension, which are separate
   processes with separate `UserDefaults.standard` containers. Anything read on one side and
   written on the other has to go through the App Group suite or it silently reads back empty —
   the classic "the widget shows nothing" bug. */
enum SharedStore {
    static let suiteName = "group.com.example.liftbook"

    // Every key that crosses the app/extension boundary, declared once here so the migration
    // manifest below cannot drift away from the accessors that use them.
    static let planKey = "Liftbook.plan"
    static let cursorKey = "Liftbook.planCursor"
    static let doneKey = "Liftbook.completed"
    static let endsAtKey = "Liftbook.restEndsAt"
    static let routineKey = "Liftbook.routine"
    static let activeKey = "Liftbook.appActive"
    static let sessionKey = "Liftbook.session"
    static let restStartKey = "Liftbook.restStartedAt"
    static let finishKey = "Liftbook.finishAt"

    static let sharedKeys = [planKey, cursorKey, doneKey, endsAtKey, routineKey, activeKey]
    private static let migratedKey = "Liftbook.migratedToAppGroup"

    static let shared: UserDefaults = {
        // Nil only when the entitlement is missing or the container is unavailable. Falling back
        // to `.standard` keeps the app working rather than crashing.
        guard let suite = UserDefaults(suiteName: suiteName) else { return .standard }
        migrateIfNeeded(into: suite)
        return suite
    }()

    /// One-time lift of any in-flight state out of `.standard` and into the suite (build 8).
    private static func migrateIfNeeded(into suite: UserDefaults) {
        guard !suite.bool(forKey: migratedKey) else { return }
        let legacy = UserDefaults.standard
        for key in sharedKeys where suite.object(forKey: key) == nil {
            if let value = legacy.object(forKey: key) { suite.set(value, forKey: key) }
        }
        suite.set(true, forKey: migratedKey)
    }
}

extension Notification.Name {
    /// Posted after a lock-screen tap changes the workout, so a live app process can tell JS.
    static let LiftbookCardChanged = Notification.Name("Liftbook.cardChanged")
}

enum RestBridge {
    private static var d: UserDefaults { SharedStore.shared }
    private static var nowMs: Double { Date().timeIntervalSince1970 * 1000 }

    private static func read<T: Decodable>(_ type: T.Type, _ key: String) -> T? {
        d.data(forKey: key).flatMap { try? JSONDecoder().decode(type, from: $0) }
    }
    private static func write<T: Encodable>(_ value: T?, _ key: String) {
        if let value, let data = try? JSONEncoder().encode(value) { d.set(data, forKey: key) } else { d.removeObject(forKey: key) }
    }

    // MARK: the session

    static var session: CardSession? {
        get { read(CardSession.self, SharedStore.sessionKey) }
        set { write(newValue, SharedStore.sessionKey) }
    }
    static var plan: [PlannedSet] {
        get { read([PlannedSet].self, SharedStore.planKey) ?? [] }
        set { write(newValue, SharedStore.planKey) }
    }
    static var cursor: Int {
        get { d.integer(forKey: SharedStore.cursorKey) }
        set { d.set(newValue, forKey: SharedStore.cursorKey) }
    }

    /// When the running rest ends / began, epoch ms. Zero means no rest.
    static var restEndsAt: Double {
        get { d.double(forKey: SharedStore.endsAtKey) }
        set { d.set(newValue, forKey: SharedStore.endsAtKey) }
    }
    static var restStartedAt: Double {
        get { d.double(forKey: SharedStore.restStartKey) }
        set { d.set(newValue, forKey: SharedStore.restStartKey) }
    }
    static var resting: Bool { upcoming != nil && restEndsAt > nowMs }

    /// Set by the card's Finish button; the web layer finishes the workout when it opens.
    static var finishAt: Double {
        get { d.double(forKey: SharedStore.finishKey) }
        set { d.set(newValue, forKey: SharedStore.finishKey) }
    }

    /// The set up now — the one Complete ticks off.
    static var upcoming: PlannedSet? { plan.indices.contains(cursor) ? plan[cursor] : nil }
    /// What follows it, for the "Then" line.
    static var after: PlannedSet? { plan.indices.contains(cursor + 1) ? plan[cursor + 1] : nil }

    /// The web layer's description of the workout replaces ours outright: it has merged every
    /// tap we queued by the time it sends one, so there is nothing of ours left to keep.
    static func load(session s: CardSession, plan p: [PlannedSet], restStartedAt start: Double, restEndsAt ends: Double) {
        session = s
        plan = p
        cursor = 0
        restStartedAt = ends > 0 ? start : 0
        armRest(endsAt: ends)
    }

    static func clear() {
        // The tap queue deliberately survives: it is the only record of sets the web layer has
        // not seen yet, and dropping it would silently lose logged work.
        session = nil
        plan = []
        cursor = 0
        restStartedAt = 0
        restEndsAt = 0
        cancelAlert()
    }

    // MARK: the buzzer

    /* The rest running out has to make a noise with the phone locked, and the server cannot do
       it: that alert goes out as a Web Push, which a WKWebView never receives. So the rest arms
       a local notification here instead — natively, because a rest started by a lock-screen tap
       never reaches JavaScript at all. */
    private static let alertID = "Liftbook.restOver"

    /// Written by the app on every foreground transition. While Lift Book is on screen the web
    /// layer does the beeping itself, and a notification on top of it would fire twice.
    static var appActive: Bool {
        get { d.bool(forKey: SharedStore.activeKey) }
        set { d.set(newValue, forKey: SharedStore.activeKey) }
    }

    /// Start, move or clear the rest: remember when it ends and arm the buzzer for that moment.
    static func armRest(endsAt: Double) {
        restEndsAt = endsAt
        let centre = UNUserNotificationCenter.current()
        centre.removePendingNotificationRequests(withIdentifiers: [alertID])
        // Deliberately still recorded above: the deadline is what `applicationDidEnterBackground`
        // re-arms from the moment he locks the phone mid-rest.
        guard !appActive else { return }
        let secs = endsAt / 1000 - Date().timeIntervalSince1970
        guard secs > 0.5 else { return }

        let content = UNMutableNotificationContent()
        content.title = "Rest over 💪"
        content.body = upcoming.map { $0.setLine.isEmpty ? $0.exercise : $0.setLine } ?? "Time for your next set."
        content.sound = .default
        // Ignored without the matching entitlement, which is fine — a plain alert still lands.
        content.interruptionLevel = .timeSensitive
        let request = UNNotificationRequest(
            identifier: alertID, content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: secs, repeats: false))

        centre.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .notDetermined:
                // Asked at the first rest rather than at launch: the prompt makes sense with a
                // countdown on screen, and means nothing on the home screen of a new install.
                centre.requestAuthorization(options: [.alert, .sound]) { ok, _ in if ok { centre.add(request) } }
            case .denied:
                break
            default:
                centre.add(request)
            }
        }
    }

    static func cancelAlert() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [alertID])
    }

    // MARK: the tap queue

    static func record(_ kind: String, _ set: PlannedSet) {
        var q = queued
        q.append(CompletedSet(key: set.key, at: nowMs, kind: kind, session: session?.id))
        write(q, SharedStore.doneKey)
    }
    static var queued: [CompletedSet] { read([CompletedSet].self, SharedStore.doneKey) ?? [] }
    static func drainQueue() -> [CompletedSet] {
        let q = queued
        d.removeObject(forKey: SharedStore.doneKey)
        return q
    }
    static func drainFinish() -> Double {
        let at = finishAt
        d.removeObject(forKey: SharedStore.finishKey)
        return at
    }

    // MARK: the card

    /* Which cards are *on the lock screen*. `Activity.activities` also hands back cards the
       system has finished with, but a card past its **stale date** is not one of those: it is
       still on screen with live buttons. Counting only `.active` treated those as gone, and the
       next request stacked a second card on top (build 13: three cards on his lock screen).

       Phrased as "not dead" rather than "active or stale" deliberately: `.stale` is iOS 17.2 and
       the deployment target is 17.0. */
    static var onScreen: [Activity<RestTimerAttributes>] {
        Activity<RestTimerAttributes>.activities
            .filter { $0.activityState != .ended && $0.activityState != .dismissed }
    }

    /// The card for this workout, if it is up. A card from another session (or from a build that
    /// did not stamp one) is never it.
    static var live: Activity<RestTimerAttributes>? {
        guard let id = session?.id else { return nil }
        return onScreen.first { $0.attributes.session == id }
    }

    /// End every card but the one for this workout.
    static func endStrays() async {
        let keep = live?.id
        for card in onScreen where card.id != keep {
            await card.end(nil, dismissalPolicy: .immediate)
        }
    }

    static func endAll() async {
        for card in onScreen {
            await card.end(nil, dismissalPolicy: .immediate)
        }
    }

    /// The card as it should look right now, from the stored session, plan and rest.
    static func contentState() -> RestTimerAttributes.ContentState {
        let s = session
        let up = upcoming
        let phase: RestTimerAttributes.ContentState.Phase = up == nil ? .done : (resting ? .rest : .work)
        var then: String?
        if let up, let next = after {
            // Same exercise again needs only the numbers; a new one leads with its name.
            then = next.exercise == up.exercise
                ? (next.detail ?? next.setLine)
                : "\(next.exercise) · \(next.detail ?? next.setLine)"
        }
        let rest = phase == .rest
        return RestTimerAttributes.ContentState(
            phase: phase,
            exercise: up?.exercise ?? "",
            detail: up.map { $0.detail ?? $0.setLine } ?? "",
            setNo: up?.setNo ?? 0,
            setOf: up?.setOf ?? 0,
            then: then,
            done: s?.done ?? 0,
            total: s?.total ?? 0,
            restStartedAt: rest ? Date(timeIntervalSince1970: (restStartedAt > 0 ? restStartedAt : nowMs) / 1000) : nil,
            restEndsAt: rest ? Date(timeIntervalSince1970: restEndsAt / 1000) : nil,
            accent: s?.accent ?? "lime")
    }

    /* Redraw the card from stored state. Always reads the activity from ActivityKit rather than
       a held handle: a background launch for an intent is a fresh process that never held one.

       `mayStart` is only ever true from the app in the foreground — iOS refuses to start a Live
       Activity from the background, and that is also where a card that iOS ended (the eight-hour
       limit) or that he swiped away is put back while the workout is still going.

       A new card is requested FIRST and the strays swept after. The other order suspends
       between "is ours up?" and the request, and two syncs a moment apart (the relaunch merge,
       then the server pull landing) both found nothing up and both requested: two cards. This
       way the sweep that follows every render keeps exactly one, whoever got there first. */
    @discardableResult
    static func render(mayStart: Bool) async -> Bool {
        guard let s = session else { await endAll(); return false }
        let state = contentState()
        // The stale date IS the end of the rest: it flips the card from the countdown back to
        // the set without the app having to be awake at that moment.
        let content = ActivityContent(state: state, staleDate: state.restEndsAt, relevanceScore: 100)
        if let card = live {
            await card.update(content)
        } else {
            guard mayStart, ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
            let attributes = RestTimerAttributes(
                routine: s.routine, session: s.id, startedAt: Date(timeIntervalSince1970: s.startedAt / 1000))
            do {
                _ = try Activity.request(attributes: attributes, content: content, pushType: nil)
            } catch {
                return false
            }
        }
        await endStrays()
        return true
    }

    /// After a tap: redraw, and tell a live app process so it can merge straight away.
    static func tapped() async {
        await render(mayStart: false)
        NotificationCenter.default.post(name: .LiftbookCardChanged, object: nil)
    }
}

/* ---------- the buttons ----------
   Every one is `isDiscoverable = false`: they belong to the card and nowhere else. Offered in
   Shortcuts or Spotlight, one is a button that silently changes a live workout. */

/// Logs the set up now, as planned, and rolls the card into the rest after it (if the app would
/// rest there) or straight on to the next set.
struct CompleteSetIntent: AppIntent, LiveActivityIntent {
    static var title: LocalizedStringResource = "Complete set"
    static var description = IntentDescription("Log the current set and start the rest after it.")
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false

    func perform() async throws -> some IntentResult {
        guard let up = RestBridge.upcoming else { return .result() }
        RestBridge.record("done", up)
        RestBridge.cursor += 1
        if var s = RestBridge.session { s.done = min(s.total, s.done + 1); RestBridge.session = s }
        if RestBridge.upcoming != nil && up.restSec > 0 {
            let now = Date().timeIntervalSince1970 * 1000
            RestBridge.restStartedAt = now
            RestBridge.armRest(endsAt: now + Double(up.restSec) * 1000)
        } else {
            RestBridge.armRest(endsAt: 0)
        }
        await RestBridge.tapped()
        return .result()
    }
}

/// Moves past the set up now without logging it.
struct SkipSetIntent: AppIntent, LiveActivityIntent {
    static var title: LocalizedStringResource = "Skip set"
    static var description = IntentDescription("Skip the current set without logging it.")
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false

    func perform() async throws -> some IntentResult {
        guard let up = RestBridge.upcoming else { return .result() }
        RestBridge.record("skip", up)
        RestBridge.cursor += 1
        RestBridge.armRest(endsAt: 0)
        await RestBridge.tapped()
        return .result()
    }
}

/// Another 15 seconds, same as the in-app control.
struct AddRestIntent: AppIntent, LiveActivityIntent {
    static var title: LocalizedStringResource = "More rest"
    static var description = IntentDescription("Add 15 seconds to the rest.")
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false

    func perform() async throws -> some IntentResult {
        let now = Date().timeIntervalSince1970 * 1000
        // Counting from *now* once the rest has already run out, so the button always buys a
        // full 15 seconds rather than extending a countdown that finished minutes ago.
        if RestBridge.restEndsAt <= now { RestBridge.restStartedAt = now }
        RestBridge.armRest(endsAt: max(RestBridge.restEndsAt, now) + 15_000)
        await RestBridge.tapped()
        return .result()
    }
}

/// Ends the rest now — "I'm ready".
struct SkipRestIntent: AppIntent, LiveActivityIntent {
    static var title: LocalizedStringResource = "Skip rest"
    static var description = IntentDescription("End the rest and go to the set.")
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false

    func perform() async throws -> some IntentResult {
        RestBridge.armRest(endsAt: 0)
        await RestBridge.tapped()
        return .result()
    }
}

/// Opens the app to finish the workout. Finishing shows the summary and may ask to confirm, so
/// it happens in the app; this only leaves a note that he asked.
struct FinishWorkoutIntent: AppIntent, LiveActivityIntent {
    static var title: LocalizedStringResource = "Finish workout"
    static var description = IntentDescription("Open Lift Book to finish the workout.")
    static var openAppWhenRun: Bool = true
    static var isDiscoverable: Bool = false

    func perform() async throws -> some IntentResult {
        RestBridge.finishAt = Date().timeIntervalSince1970 * 1000
        NotificationCenter.default.post(name: .LiftbookCardChanged, object: nil)
        return .result()
    }
}
