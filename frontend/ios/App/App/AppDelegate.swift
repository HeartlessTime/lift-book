import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Shaking the phone mid-set must never pop an "Undo Typing" alert.
        application.applicationSupportsShakeToEdit = false
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.

        // He has just locked the phone or swiped away, quite possibly mid-rest. The web layer's
        // beeper goes with it, so hand the rest-over alert to a local notification.
        RestBridge.appActive = false
        if RestBridge.restEndsAt > Date().timeIntervalSince1970 * 1000 {
            RestBridge.armRest(endsAt: RestBridge.restEndsAt)
        }
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.

        // Back on screen: the rest timer in the app does its own beeping from here, so stand the
        // notification down rather than letting the two go off together.
        RestBridge.appActive = true
        RestBridge.cancelAlert()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// iOS 27 SDK: UIKit traps at launch unless the app adopts the scene lifecycle (build 20 crash,
// 2026-10-15). Under scenes the app-level background/active callbacks above stop firing, so the
// scene forwards them, and URL opens come in here rather than through application(_:open:).
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        if let ctx = connectionOptions.urlContexts.first {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: ctx.url, options: [:])
        }
        if let activity = connectionOptions.userActivities.first {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let ctx = URLContexts.first else { return }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: ctx.url, options: [:])
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }

    private var app: AppDelegate? { UIApplication.shared.delegate as? AppDelegate }

    func sceneWillResignActive(_ scene: UIScene) { app?.applicationWillResignActive(UIApplication.shared) }
    func sceneDidEnterBackground(_ scene: UIScene) { app?.applicationDidEnterBackground(UIApplication.shared) }
    func sceneWillEnterForeground(_ scene: UIScene) { app?.applicationWillEnterForeground(UIApplication.shared) }
    func sceneDidBecomeActive(_ scene: UIScene) { app?.applicationDidBecomeActive(UIApplication.shared) }
}
