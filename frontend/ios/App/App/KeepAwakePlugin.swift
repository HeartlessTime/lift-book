import Foundation
import Capacitor
import UIKit

/* Keeps the display awake for the length of a workout.

   This is the native answer to the web Screen Wake Lock API, which WKWebView's support for is
   patchy and version-dependent — and when it is missing it fails silently, which in a gym means
   the screen dies between sets. `isIdleTimerDisabled` has none of that: one flag, no permission,
   no sentinel to hold, and nothing to re-acquire when the app is backgrounded and comes back.

   UIKit insists the flag is only touched from the main thread; Capacitor calls plugin methods on
   its own queue, so every write hops to the main queue. */
@objc(KeepAwakePlugin)
public class KeepAwakePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KeepAwakePlugin"
    public let jsName = "KeepAwake"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise)
    ]

    /// Our own intent, kept because the flag itself is not reliably ours to read back: iOS clears
    /// it on some backgrounding paths, so returning to the foreground has to re-assert it. Only
    /// ever touched on the main queue (see `apply`), which is also where the notification lands.
    private var wanted = false

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(reassert),
            name: UIApplication.didBecomeActiveNotification,
            object: nil)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    @objc func enable(_ call: CAPPluginCall) {
        apply(true)
        call.resolve()
    }

    @objc func disable(_ call: CAPPluginCall) {
        apply(false)
        call.resolve()
    }

    /// Foreground re-assert. Guarded by `wanted`, so a workout that has already ended never pins
    /// the screen back on: the last `disable` cleared the intent along with the flag.
    @objc private func reassert() {
        if wanted { UIApplication.shared.isIdleTimerDisabled = true }
    }

    private func apply(_ disabled: Bool) {
        DispatchQueue.main.async {
            self.wanted = disabled
            UIApplication.shared.isIdleTimerDisabled = disabled
        }
    }
}
