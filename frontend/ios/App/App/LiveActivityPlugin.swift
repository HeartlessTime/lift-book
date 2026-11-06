import Foundation
import Capacitor
import ActivityKit

/* Bridges the workout to its lock-screen card, in both directions.

   Outbound, `sync` is handed the whole card as data (lib/workoutCard.js) whenever the workout
   changes, and `end` takes it down. The web app remains the source of truth for the workout;
   the elapsed clock and any rest countdown go over as dates, so iOS renders every tick itself.

   Inbound is the interesting half. The card's buttons walk the stored plan in the app's
   background process while the webview is suspended (see RestTimerBridge.swift), and `pending`
   is how the web layer collects what happened the moment it wakes up. */
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pending", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        // A lock-screen tap that lands while this process is alive: tell JS, so the merge does
        // not wait for the next foreground.
        NotificationCenter.default.addObserver(
            forName: .LiftbookCardChanged, object: nil, queue: .main
        ) { [weak self] _ in
            self?.notifyListeners("change", data: [:])
        }
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
    }

    /// The card, described in full. Starts it if it is not up (only ever from the foreground,
    /// which is the only place JS calls this); otherwise updates the one that is.
    @objc func sync(_ call: CAPPluginCall) {
        guard let id = call.getString("session") else { return call.reject("no session") }
        let session = CardSession(
            id: id,
            routine: call.getString("routine") ?? "Lift Book",
            startedAt: call.getDouble("startedAt") ?? Date().timeIntervalSince1970 * 1000,
            accent: call.getString("accent") ?? "lime",
            done: call.getInt("done") ?? 0,
            total: call.getInt("total") ?? 0)
        let plan = (call.getArray("plan") as? [[String: Any]] ?? []).compactMap { row -> PlannedSet? in
            guard let key = row["key"] as? String else { return nil }
            return PlannedSet(
                key: key,
                exercise: row["exercise"] as? String ?? "",
                setLine: row["setLine"] as? String ?? "",
                restSec: (row["restSec"] as? NSNumber)?.intValue ?? 0,
                detail: row["detail"] as? String,
                setNo: (row["setNo"] as? NSNumber)?.intValue,
                setOf: (row["setOf"] as? NSNumber)?.intValue)
        }
        let rest = call.getObject("rest")
        RestBridge.load(
            session: session, plan: plan,
            restStartedAt: (rest?["startedAt"] as? NSNumber)?.doubleValue ?? 0,
            restEndsAt: (rest?["endsAt"] as? NSNumber)?.doubleValue ?? 0)
        Task {
            let shown = await RestBridge.render(mayStart: true)
            call.resolve(["shown": shown])
        }
    }

    /// The workout is over. Every card goes, not just the newest: a stray left standing is how a
    /// stack builds.
    @objc func end(_ call: CAPPluginCall) {
        RestBridge.clear()
        Task {
            await RestBridge.endAll()
            call.resolve()
        }
    }

    /// Everything the web layer missed while it was suspended. Draining is the point: each tap
    /// is handed over exactly once, so a merge can never double-log.
    @objc func pending(_ call: CAPPluginCall) {
        let events = RestBridge.drainQueue().map { e -> [String: Any] in
            var o: [String: Any] = ["key": e.key, "at": e.at, "kind": e.kind ?? "done"]
            if let s = e.session { o["session"] = s }
            return o
        }
        call.resolve([
            "events": events,
            "session": RestBridge.session?.id ?? "",
            "restEndsAt": RestBridge.restEndsAt,
            "restStartedAt": RestBridge.restStartedAt,
            "finishAt": RestBridge.drainFinish(),
            "showing": RestBridge.live != nil
        ])
    }
}
