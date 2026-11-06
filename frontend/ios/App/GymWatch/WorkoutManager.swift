import Foundation
import HealthKit
import WatchConnectivity
import WatchKit

/* The wrist half of a Lift Book session (build 46).

   Tapping Start in Lift Book calls `HKHealthStore.startWatchApp(toHandle:)` on the phone. watchOS
   launches this app and hands `WatchDelegate.handle(_:)` a Traditional Strength Training
   configuration; `start` turns that into a real HKWorkoutSession + HKLiveWorkoutBuilder, so the
   session earns heart rate, active calories and Exercise-ring credit exactly like Apple's
   Workout app. The phone ends it: finishing in Lift Book sends `end`, discarding sends `end` with
   `discard`. The End button here also works, and a four-hour backstop catches the session nobody
   ended.

   Phone <-> watch messages (WatchConnectivity), all plain dictionaries:
     phone -> watch  {cmd:"state", active, session, startedAt(ms), name, exercise}   (context)
                     {cmd:"end", session, endedAt(ms), discard}                        (message,
                                                                    userInfo and context)
     watch -> phone  {ack: session, startedAt}    the session is running on the wrist
                     {saved: session, uuid}       the workout is in Health (watch-saved)
   The phone's fallback (WatchWorkoutPlugin.swift) only saves a workout itself when no `ack`
   came back for that session, and even then not over one already in Health. */
@MainActor
final class WorkoutManager: NSObject, ObservableObject {
    static let shared = WorkoutManager()

    enum Phase: Equatable { case idle, running, paused, saving, ended }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var startDate: Date?
    @Published private(set) var heartRate: Double = 0
    @Published private(set) var activeKcal: Double = 0
    @Published private(set) var routine = ""
    @Published private(set) var exercise = ""
    /// The set up now, as the phone's workout card reads it: "40 lb × 12", set 2 of 3.
    @Published private(set) var detail = ""
    @Published private(set) var setNo = 0
    @Published private(set) var setOf = 0
    /// A running rest from the phone (0 = none): counted down here from the end date.
    @Published private(set) var restEndsAt: Date?
    @Published private(set) var restTotal: Double = 0
    /// What Spotify is playing, asked of the phone every 15 s while the session runs.
    @Published private(set) var song = ""
    @Published private(set) var artist = ""
    @Published private(set) var summary: (duration: TimeInterval, kcal: Double)?

    static let backstopHours: Double = 4

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var sessionId: String?
    private var phoneStartedAt: Date?
    private var backstop: Task<Void, Never>?
    private var songPoll: Task<Void, Never>?
    /// An `end` that arrived before the session finished starting.
    private var pendingEnd: (date: Date, discard: Bool)?
    /// True from `start` until the session is running (requestAuthorization + beginCollection).
    private var starting = false
    /// Sessions the phone has already ended, whatever channel told us. A watch launch that loses
    /// the race with a quick finish/discard must not then run a session nobody will stop.
    private var endedOnPhone: [String: (date: Date, discard: Bool)] = [:]
    /// The last session this watch acked, persisted so a recovered session (watchOS relaunch)
    /// still knows the phone is relying on the watch to save it.
    private static let ackedKey = "ogw.ackedSession"
    private func isAcked(_ sid: String?) -> Bool { sid != nil && UserDefaults.standard.string(forKey: Self.ackedKey) == sid }

    // MARK: Connectivity

    func activate() {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        s.activate()
    }

    private func send(_ msg: [String: Any]) {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        guard s.activationState == .activated else { return }
        if s.isReachable { s.sendMessage(msg, replyHandler: nil, errorHandler: nil) }
        s.transferUserInfo(msg)   // queued, survives the phone being asleep
    }

    /// One place every phone dictionary lands, whatever channel it came by.
    func handlePhone(_ m: [String: Any]) {
        let cmd = m["cmd"] as? String
        let sid = m["session"] as? String
        let endDate = (m["endedAt"] as? Double).map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()
        let discard = (m["discard"] as? Bool) ?? false
        if cmd == "state" {
            let active = m["active"] as? Bool
            if active == true {
                if let name = m["name"] as? String { routine = name }
                takeNow(m)
                if let ms = m["startedAt"] as? Double { phoneStartedAt = Date(timeIntervalSince1970: ms / 1000) }
                // Learn the session id whenever the phone says one is running, including while this
                // app is still idle or starting: the state usually lands BEFORE startWatchApp's
                // configuration does, and without the id the watch could never ack (and the phone
                // would then save a second copy of the workout).
                if let sid, sessionId == nil || (phase == .idle && !starting) { sessionId = sid }
                adoptPhoneSession()
            } else if active == false {
                // A context saying the session is over is an `end` that came the slow way.
                phoneEnded(sid, at: endDate, discard: discard)
            }
        } else if cmd == "end" {
            phoneEnded(sid, at: endDate, discard: discard)
        }
    }

    /// The phone finished or discarded `sid`. A session this watch never acked is DISCARDED, never
    /// saved: with no ack the phone saves the workout itself, so saving here too would double it.
    private func phoneEnded(_ sid: String?, at date: Date, discard: Bool) {
        if let sid { endedOnPhone[sid] = (date, discard) }
        guard matches(sid) else { return }
        let drop = discard || (sid != nil && !isAcked(sid))
        if phase == .running || phase == .paused { end(at: date, discard: drop) }
        else if starting || session != nil { pendingEnd = (date, discard) }
    }

    /// Once the session is running and its id is known: ack it, unless the phone already ended it
    /// (then throw it away; the phone saves it, since it never got an ack).
    private func adoptPhoneSession() {
        guard phase == .running || phase == .paused, let sid = sessionId, !isAcked(sid) else { return }
        if let e = endedOnPhone[sid] { end(at: e.date, discard: true); return }
        UserDefaults.standard.set(sid, forKey: Self.ackedKey)
        sendAck()
    }

    /// An `end` for another session never touches this one; one with no id, or for a session
    /// started here by hand (no id), does.
    private func matches(_ sid: String?) -> Bool { sid == nil || sessionId == nil || sid == sessionId }

    private func sendAck() {
        guard let sessionId else { return }
        send(["ack": sessionId, "startedAt": (startDate ?? Date()).timeIntervalSince1970 * 1000])
    }

    // MARK: Session

    nonisolated static var strength: HKWorkoutConfiguration {
        let c = HKWorkoutConfiguration()
        c.activityType = .traditionalStrengthTraining
        c.locationType = .indoor
        return c
    }

    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let share: Set<HKSampleType> = [HKObjectType.workoutType(), HKQuantityType(.activeEnergyBurned), HKQuantityType(.heartRate)]
        let read: Set<HKObjectType> = [HKQuantityType(.heartRate), HKQuantityType(.activeEnergyBurned), HKObjectType.workoutType()]
        _ = try? await store.requestAuthorization(toShare: share, read: read)
    }

    func start(configuration: HKWorkoutConfiguration = WorkoutManager.strength) {
        guard session == nil, !starting, HKHealthStore.isHealthDataAvailable() else { return }
        starting = true
        Task {
            defer { starting = false }
            await requestAuthorization()
            do {
                let session = try HKWorkoutSession(healthStore: store, configuration: configuration)
                let builder = session.associatedWorkoutBuilder()
                builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: configuration)
                session.delegate = self
                builder.delegate = self
                self.session = session
                self.builder = builder
                // The phone's Start time when it is close by: the lift started when he tapped
                // Start, not when the watch woke up a few seconds later.
                let now = Date()
                var begin = now
                let fromContext = contextStart()
                if let p = phoneStartedAt ?? fromContext, p < now, now.timeIntervalSince(p) < 15 * 60 { begin = p }
                session.startActivity(with: begin)
                try await builder.beginCollection(at: begin)
                startDate = begin
                phase = .running
                summary = nil
                startBackstop()
                startSongPoll()
                askPhoneForState()
                if let p = pendingEnd {
                    pendingEnd = nil
                    end(at: p.date, discard: p.discard || !isAcked(sessionId))
                } else {
                    adoptPhoneSession()
                }
            } catch {
                self.session = nil
                self.builder = nil
                phase = .idle
            }
        }
    }

    private func contextStart() -> Date? {
        guard WCSession.isSupported() else { return nil }
        let c = WCSession.default.receivedApplicationContext
        guard (c["active"] as? Bool) == true, let ms = c["startedAt"] as? Double else { return nil }
        if let sid = c["session"] as? String, sessionId == nil { sessionId = sid }
        if let n = c["name"] as? String { routine = n }
        takeNow(c)
        return Date(timeIntervalSince1970: ms / 1000)
    }

    /// The set-up-now fields of a phone state dictionary (see WatchWorkoutPlugin `nowFields`).
    private func takeNow(_ m: [String: Any]) {
        if let v = m["exercise"] as? String { exercise = v }
        if let v = m["detail"] as? String { detail = v }
        if let v = m["setNo"] as? Int { setNo = v }
        if let v = m["setOf"] as? Int { setOf = v }
        if let v = m["restEndsAt"] as? Double { restEndsAt = v > 0 ? Date(timeIntervalSince1970: v / 1000) : nil }
        if let v = m["restTotal"] as? Double { restTotal = v }
    }

    private func startSongPoll() {
        songPoll?.cancel()
        songPoll = Task {
            while !Task.isCancelled {
                askPhoneForSong()
                try? await Task.sleep(nanoseconds: 15_000_000_000)
            }
        }
    }

    /// The phone answers from the server, waking in the background if it has to. Out of reach,
    /// the last song stays up rather than blanking on every Bluetooth hiccup.
    private func askPhoneForSong() {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated, WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["ask": "song"], replyHandler: { r in
            let title = r["song"] as? String, by = r["artist"] as? String ?? ""
            Task { @MainActor in
                guard let title else { return }
                WorkoutManager.shared.song = title
                WorkoutManager.shared.artist = by
            }
        }, errorHandler: nil)
    }

    private func askPhoneForState() {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated, WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["ask": "state"], replyHandler: { reply in
            Task { @MainActor in WorkoutManager.shared.handlePhone(reply) }
        }, errorHandler: nil)
    }

    func togglePause() {
        guard let session else { return }
        if phase == .running { session.pause() } else if phase == .paused { session.resume() }
    }

    func end(at date: Date = Date(), discard: Bool = false) {
        guard let session, let builder, phase == .running || phase == .paused else { return }
        backstop?.cancel(); backstop = nil
        songPoll?.cancel(); songPoll = nil
        phase = .saving
        let end = max(date, startDate ?? date)
        session.stopActivity(with: end)
        session.end()
        let sid = sessionId
        Task {
            do {
                try await builder.endCollection(at: end)
                if discard {
                    builder.discardWorkout()
                    self.summary = nil
                } else {
                    var meta: [String: Any] = [HKMetadataKeyIndoorWorkout: true]
                    if let sid { meta[HKMetadataKeyExternalUUID] = sid }
                    try await builder.addMetadata(meta)
                    let w = try await builder.finishWorkout()
                    let kcal = w?.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? self.activeKcal
                    self.summary = (w?.duration ?? end.timeIntervalSince(self.startDate ?? end), kcal)
                    if let sid { self.send(["saved": sid, "uuid": w?.uuid.uuidString ?? ""]) }
                }
            } catch {
                self.summary = nil
            }
            self.session = nil
            self.builder = nil
            self.sessionId = nil
            self.phoneStartedAt = nil
            self.phase = discard ? .idle : .ended
            WKInterfaceDevice.current().play(.success)
        }
    }

    func dismissSummary() {
        phase = .idle; summary = nil; heartRate = 0; activeKcal = 0; startDate = nil; exercise = ""; routine = ""
        detail = ""; setNo = 0; setOf = 0; restEndsAt = nil; restTotal = 0; song = ""; artist = ""
    }

    /// watchOS relaunched us mid-workout (crash, reboot): pick the session back up.
    func recover() {
        Task {
            guard let s = try? await store.recoverActiveWorkoutSession() else { return }
            session = s
            builder = s.associatedWorkoutBuilder()
            s.delegate = self
            builder?.delegate = self
            startDate = builder?.startDate ?? s.startDate
            phase = s.state == .paused ? .paused : .running
            _ = contextStart()
            startBackstop()
            startSongPoll()
            // The phone may have ended it while we were down.
            let c = WCSession.isSupported() ? WCSession.default.receivedApplicationContext : [:]
            // Only for the session this watch acked: an older session's "over" must not stop this one.
            if (c["active"] as? Bool) == false, let csid = c["session"] as? String, isAcked(csid) {
                sessionId = csid
                handlePhone(c)
            } else { adoptPhoneSession() }
        }
    }

    private func startBackstop() {
        backstop?.cancel()
        let from = startDate ?? Date()
        backstop = Task {
            let left = Self.backstopHours * 3600 - Date().timeIntervalSince(from)
            try? await Task.sleep(nanoseconds: UInt64(max(1, left) * 1_000_000_000))
            guard !Task.isCancelled else { return }
            // Nobody ended it. Never acked means the phone saved (or will save) it: discard.
            self.end(at: Date(), discard: !self.isAcked(self.sessionId))
        }
    }

    #if DEBUG
    /// `-OGW_DEMO` on the simulator: a mid-workout screen for the screenshot, nothing real.
    func demo() {
        routine = "Full Body A"; exercise = "Barbell Bench Press"; detail = "185 lb × 8"; setNo = 2; setOf = 4
        restEndsAt = Date().addingTimeInterval(64); restTotal = 90; song = "Planet Caravan"; artist = "Black Sabbath"
        startDate = Date().addingTimeInterval(-(23 * 60 + 41)); heartRate = 128; activeKcal = 164
        phase = .running
    }
    #endif
}

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState,
                                    from fromState: HKWorkoutSessionState, date: Date) {
        Task { @MainActor in
            let m = WorkoutManager.shared
            if toState == .paused, m.phase == .running { m.phase = .paused }
            if toState == .running, m.phase == .paused { m.phase = .running }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {}
}

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let hr = workoutBuilder.statistics(for: HKQuantityType(.heartRate))?.mostRecentQuantity()?
            .doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
        let kcal = workoutBuilder.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie())
        Task { @MainActor in
            let m = WorkoutManager.shared
            if let hr { m.heartRate = hr }
            if let kcal { m.activeKcal = kcal }
        }
    }
}

extension WorkoutManager: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        let ctx = session.receivedApplicationContext
        Task { @MainActor in if !ctx.isEmpty { WorkoutManager.shared.handlePhone(ctx) } }
    }
    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in WorkoutManager.shared.handlePhone(applicationContext) }
    }
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in WorkoutManager.shared.handlePhone(message) }
    }
    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        Task { @MainActor in WorkoutManager.shared.handlePhone(userInfo) }
    }
}
