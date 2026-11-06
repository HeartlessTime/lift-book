import Foundation
import Capacitor
import HealthKit
import UIKit
import WatchConnectivity

/* Lift Book's sessions in Apple Health (build 46).

   1. Start: `start` launches the Lift Book watch app with a Traditional Strength Training
      configuration (`startWatchApp(toHandle:)`). The watch runs a real HKWorkoutSession, which
      is what earns heart rate, calories and Exercise-ring credit (GymWatch/WorkoutManager.swift).
   2. Finish / discard: `finish` and `discard` tell the watch to end (and save or throw away).
   3. Fallback, always on: when the watch never acknowledged the session (app not installed,
      watch unreachable, or the launch failed), `finish` saves the workout itself from the
      phone, with the real start/end and the active energy the watch already measured in that
      window. It never saves over a workout Health already has for that time (any source), so a
      watch-saved session or a workout he started by hand is never doubled.

   A finish the app is killed in the middle of is kept in UserDefaults and retried at the next
   launch. */
@objc(WatchWorkoutPlugin)
public class WatchWorkoutPlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "WatchWorkoutPlugin"
    public let jsName = "WatchWorkout"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise)
    ]

    private let store = HKHealthStore()
    private let defaults = UserDefaults.standard
    private static let startedKey = "ogw.started"      // [session: epoch s] we asked the watch to start
    private static let ackKey = "ogw.ack"              // [session: epoch s] the watch said it is running
    private static let savedKey = "ogw.saved"          // [session: "watch" | "phone" | "existing"]
    private static let pendingKey = "ogw.pending"      // [[session, start, end]] fallbacks not yet done
    private static let contextKey = "ogw.context"      // the last state sent to the watch
    private static let apiKey = "ogw.api"              // [apiBase, token] for the song the watch asks for
    /// What the watch screen shows of the set up now; `start` and `update` carry it.
    private static let nowFields = ["exercise", "detail", "setNo", "setOf", "restEndsAt", "restTotal"]

    /// How long a finish waits before checking Health, so a workout the watch (or the Workout
    /// app) saved has time to arrive on the phone.
    private static let settleSeconds: UInt64 = 15

    override public func load() {
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
        // Finishes the app did not live to complete.
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in self?.drainPending() }
    }

    // MARK: JS API

    @objc func authorize(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { call.resolve(["available": false]); return }
        let share: Set<HKSampleType> = [HKObjectType.workoutType(), HKQuantityType(.bodyMass)]
        let read: Set<HKObjectType> = [HKObjectType.workoutType(), HKQuantityType(.activeEnergyBurned),
                                       HKQuantityType(.heartRate), HKQuantityType(.bodyMass)]
        store.requestAuthorization(toShare: share, read: read) { ok, err in
            call.resolve(["available": true, "ok": ok, "error": err?.localizedDescription ?? ""])
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        let s = WCSession.isSupported() ? WCSession.default : nil
        call.resolve([
            "paired": s?.isPaired ?? false,
            "installed": s?.isWatchAppInstalled ?? false,
            "reachable": s?.isReachable ?? false,
            "saved": defaults.dictionary(forKey: Self.savedKey) ?? [:]
        ])
    }

    @objc func start(_ call: CAPPluginCall) {
        guard let sid = call.getString("session") else { call.reject("session required"); return }
        let startedAt = call.getDouble("startedAt") ?? Date().timeIntervalSince1970 * 1000
        var started = defaults.dictionary(forKey: Self.startedKey) as? [String: Double] ?? [:]
        if started[sid] != nil { call.resolve(["already": true]); return }
        started[sid] = Date().timeIntervalSince1970
        defaults.set(prune(started), forKey: Self.startedKey)

        rememberAPI(call)
        var ctx: [String: Any] = ["cmd": "state", "active": true, "session": sid, "startedAt": startedAt,
                                  "name": call.getString("name") ?? ""]
        for k in Self.nowFields { if let v = call.options[k] { ctx[k] = v } }
        sendState(ctx)
        guard HKHealthStore.isHealthDataAvailable() else { call.resolve(["watch": false, "reason": "no health"]); return }
        let s = WCSession.isSupported() ? WCSession.default : nil
        if let s, s.activationState == .activated, !s.isPaired || !s.isWatchAppInstalled {
            call.resolve(["watch": false, "reason": s.isPaired ? "watch app not installed" : "no watch"]); return
        }
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor
        store.startWatchApp(with: config) { ok, err in
            call.resolve(["watch": ok, "reason": err?.localizedDescription ?? ""])
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard let sid = call.getString("session") else { call.resolve(); return }
        var ctx = defaults.dictionary(forKey: Self.contextKey) ?? [:]
        guard (ctx["session"] as? String) == sid, (ctx["active"] as? Bool) == true else { call.resolve(); return }
        rememberAPI(call)
        for k in Self.nowFields { if let v = call.options[k] { ctx[k] = v } }
        sendState(ctx)
        call.resolve()
    }

    private func rememberAPI(_ call: CAPPluginCall) {
        guard let base = call.getString("apiBase"), !base.isEmpty, let token = call.getString("token") else { return }
        defaults.set([base, token], forKey: Self.apiKey)
    }

    /// The song playing on Spotify, for the watch screen: `{title, artist}`, or empty when nothing is
    /// playing or the server can't be reached. Runs with the app in the background, woken by the
    /// watch's message.
    private func nowPlaying(_ reply: @escaping ([String: Any]) -> Void) {
        guard let api = defaults.stringArray(forKey: Self.apiKey), api.count == 2,
              let url = URL(string: api[0] + "/api/now-playing") else { reply([:]); return }
        var req = URLRequest(url: url, timeoutInterval: 6)
        req.setValue("Bearer " + api[1], forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: req) { data, _, _ in
            let j = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
            guard (j["playing"] as? Bool) == true else { reply(["song": ""]); return }
            reply(["song": j["title"] as? String ?? "", "artist": j["artist"] as? String ?? ""])
        }.resume()
    }

    @objc func discard(_ call: CAPPluginCall) {
        guard let sid = call.getString("session") else { call.resolve(); return }
        endOnWatch(sid, endedAt: Date().timeIntervalSince1970 * 1000, discard: true)
        call.resolve()
    }

    @objc func finish(_ call: CAPPluginCall) {
        guard let sid = call.getString("session"), let s = call.getDouble("startedAt"), let e = call.getDouble("endedAt"), e > s else {
            call.reject("session, startedAt and endedAt required"); return
        }
        endOnWatch(sid, endedAt: e, discard: false)
        var pending = defaults.array(forKey: Self.pendingKey) as? [[String: Any]] ?? []
        pending.removeAll { ($0["session"] as? String) == sid }
        pending.append(["session": sid, "start": s, "end": e])
        defaults.set(pending, forKey: Self.pendingKey)
        runFallback(sid: sid, start: s, end: e) { result in call.resolve(result) }
    }

    // MARK: Watch messages

    private func sendState(_ ctx: [String: Any]) {
        defaults.set(ctx, forKey: Self.contextKey)
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        guard s.activationState == .activated, s.isPaired, s.isWatchAppInstalled else { return }
        try? s.updateApplicationContext(ctx)
        if s.isReachable { s.sendMessage(ctx, replyHandler: nil, errorHandler: nil) }
    }

    /// `context: false` sends only the end message and leaves the shared context alone (a late
    /// discard for an old session must not overwrite the state of a session running now).
    private func endOnWatch(_ sid: String, endedAt: Double, discard: Bool, context: Bool = true) {
        let msg: [String: Any] = ["cmd": "end", "session": sid, "endedAt": endedAt, "discard": discard]
        if context { sendState(["cmd": "state", "active": false, "session": sid, "endedAt": endedAt, "discard": discard]) }
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        guard s.activationState == .activated, s.isPaired, s.isWatchAppInstalled else { return }
        if s.isReachable { s.sendMessage(msg, replyHandler: nil, errorHandler: nil) }
        s.transferUserInfo(msg)
    }

    private func handleWatch(_ m: [String: Any]) -> [String: Any]? {
        if m["ask"] as? String == "state" { return defaults.dictionary(forKey: Self.contextKey) ?? [:] }
        if let sid = m["ack"] as? String {
            var ack = defaults.dictionary(forKey: Self.ackKey) as? [String: Double] ?? [:]
            ack[sid] = Date().timeIntervalSince1970
            defaults.set(prune(ack), forKey: Self.ackKey)
            // A late ack for a session this phone already saved itself: the watch must throw its
            // copy away, or Health ends up with two.
            if savedBy(sid) == "phone" { endOnWatch(sid, endedAt: Date().timeIntervalSince1970 * 1000, discard: true, context: false) }
        }
        if let sid = m["saved"] as? String {
            // Both saved after all (messages crossed): keep the watch's, which has heart rate.
            if savedBy(sid) == "phone" { deletePhoneCopy(sid) }
            markSaved(sid, "watch")
        }
        return nil
    }

    private func savedBy(_ sid: String) -> String? { (defaults.dictionary(forKey: Self.savedKey) as? [String: String])?[sid] }

    /// Deletes the workout this app saved from the phone for `sid` (only ours: the source is
    /// this app and the external id is the session's).
    private func deletePhoneCopy(_ sid: String) {
        let pred = NSCompoundPredicate(andPredicateWithSubpredicates: [
            HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyExternalUUID, allowedValues: [sid]),
            HKQuery.predicateForObjects(from: HKSource.default())
        ])
        store.deleteObjects(of: .workoutType(), predicate: pred) { _, n, err in
            print("Lift Book watch: removed \(n) phone copy of \(sid) \(err?.localizedDescription ?? "")")
        }
    }

    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    public func sessionDidBecomeInactive(_ session: WCSession) {}
    public func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        DispatchQueue.main.async { _ = self.handleWatch(message) }
    }
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        if message["ask"] as? String == "song" { nowPlaying(replyHandler); return }
        DispatchQueue.main.async { replyHandler(self.handleWatch(message) ?? [:]) }
    }
    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        DispatchQueue.main.async { _ = self.handleWatch(userInfo) }
    }

    // MARK: Fallback save

    private func markSaved(_ sid: String, _ how: String) {
        var saved = defaults.dictionary(forKey: Self.savedKey) as? [String: String] ?? [:]
        saved[sid] = how
        if saved.count > 60 { saved = Dictionary(uniqueKeysWithValues: saved.suffix(60).map { ($0.key, $0.value) }) }
        defaults.set(saved, forKey: Self.savedKey)
        var pending = defaults.array(forKey: Self.pendingKey) as? [[String: Any]] ?? []
        pending.removeAll { ($0["session"] as? String) == sid }
        defaults.set(pending, forKey: Self.pendingKey)
    }

    private func drainPending() {
        let pending = defaults.array(forKey: Self.pendingKey) as? [[String: Any]] ?? []
        for p in pending {
            guard let sid = p["session"] as? String, let s = p["start"] as? Double, let e = p["end"] as? Double else { continue }
            // Two days on, a missing workout is history; never act on it.
            if Date().timeIntervalSince1970 * 1000 - e > 2 * 86_400_000 { markSaved(sid, "expired"); continue }
            runFallback(sid: sid, start: s, end: e) { _ in }
        }
    }

    private func runFallback(sid: String, start: Double, end: Double, done: @escaping ([String: Any]) -> Void) {
        let app = UIApplication.shared
        var task = UIBackgroundTaskIdentifier.invalid
        task = app.beginBackgroundTask(withName: "Liftbook.health") { app.endBackgroundTask(task); task = .invalid }
        Task {
            let result = await self.fallback(sid: sid, start: Date(timeIntervalSince1970: start / 1000), end: Date(timeIntervalSince1970: end / 1000))
            DispatchQueue.main.async {
                done(result)
                if task != .invalid { app.endBackgroundTask(task); task = .invalid }
            }
        }
    }

    private func fallback(sid: String, start: Date, end: Date) async -> [String: Any] {
        if let how = (defaults.dictionary(forKey: Self.savedKey) as? [String: String])?[sid], how != "expired" {
            return ["saved": false, "by": how]
        }
        guard HKHealthStore.isHealthDataAvailable() else { return ["saved": false, "by": "no health"] }
        try? await Task.sleep(nanoseconds: Self.settleSeconds * 1_000_000_000)
        let acked = (defaults.dictionary(forKey: Self.ackKey) as? [String: Double])?[sid] != nil
        // The watch ran the session: it saves it. Give it the rest of a minute, then look.
        if acked { try? await Task.sleep(nanoseconds: 30 * 1_000_000_000) }

        let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let existing: [HKWorkout] = await withCheckedContinuation { cont in
            let q = HKSampleQuery(sampleType: .workoutType(), predicate: pred, limit: 50, sortDescriptors: nil) { _, s, _ in
                cont.resume(returning: (s as? [HKWorkout]) ?? [])
            }
            store.execute(q)
        }
        let span = end.timeIntervalSince(start)
        let clash = existing.contains { w in
            let o = min(w.endDate, end).timeIntervalSince(max(w.startDate, start))
            return o > 0 && o >= 0.3 * min(span, max(w.duration, 1))
        }
        if clash { markSaved(sid, "existing"); return ["saved": false, "by": "existing"] }
        // Acked but nothing in Health a minute on: the watch lost the session (an app update
        // mid-workout kills it). Save the phone's copy; if the watch's turns up after all, its
        // `saved` message deletes this one (handleWatch), so Health never keeps two.

        // Active energy the watch measured in this window anyway (all sources, de-duplicated by
        // HealthKit). Only the total is put on the workout: no new energy samples, so the Move
        // ring is never counted twice.
        let kcal: Double = await withCheckedContinuation { cont in
            let q = HKStatisticsQuery(quantityType: HKQuantityType(.activeEnergyBurned), quantitySamplePredicate: pred,
                                      options: .cumulativeSum) { _, st, _ in
                cont.resume(returning: st?.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0)
            }
            store.execute(q)
        }
        let meta: [String: Any] = [HKMetadataKeyExternalUUID: sid, HKMetadataKeyIndoorWorkout: true, "LiftbookSavedBy": "iPhone"]
        let workout = HKWorkout(activityType: .traditionalStrengthTraining, start: start, end: end, duration: span,
                                totalEnergyBurned: kcal > 0 ? HKQuantity(unit: .kilocalorie(), doubleValue: kcal) : nil,
                                totalDistance: nil, metadata: meta)
        do {
            try await store.save(workout)
            markSaved(sid, "phone")
            return ["saved": true, "by": "phone", "kcal": kcal]
        } catch {
            return ["saved": false, "by": "error", "error": error.localizedDescription]
        }
    }

    private func prune(_ d: [String: Double]) -> [String: Double] {
        let cutoff = Date().timeIntervalSince1970 - 3 * 86_400
        return d.filter { $0.value > cutoff }
    }
}
