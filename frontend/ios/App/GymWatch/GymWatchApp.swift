import SwiftUI
import HealthKit
import WatchKit

@main
struct GymWatchApp: App {
    @WKApplicationDelegateAdaptor(WatchDelegate.self) var delegate

    var body: some Scene {
        WindowGroup {
            WorkoutView().environmentObject(WorkoutManager.shared)
        }
    }
}

final class WatchDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        Task { @MainActor in
            WorkoutManager.shared.activate()
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-OGW_DEMO") { WorkoutManager.shared.demo() }
            #endif
        }
    }

    /// The phone's Start: `startWatchApp(toHandle:)` lands here with the configuration.
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task { @MainActor in
            WorkoutManager.shared.activate()
            WorkoutManager.shared.start(configuration: workoutConfiguration)
        }
    }

    func handleActiveWorkoutRecovery() {
        Task { @MainActor in WorkoutManager.shared.recover() }
    }
}

/* One screen, the whole screen: what he is lifting right now, read off the wrist mid-set. The
   lift, set N of M, the weight × reps, then the rest counting down (or the workout clock when
   there is no rest), heart rate and calories, and the song playing on Spotify. Logging stays on the
   phone, so there are no buttons; a long press is End or Pause, for the session the phone lost. */
struct WorkoutView: View {
    @EnvironmentObject var m: WorkoutManager

    var body: some View {
        switch m.phase {
        case .idle: IdleView()
        case .ended: SummaryView()
        default: WorkoutScreen()
        }
    }
}

private let workoutYellow = Color(red: 0.93, green: 0.98, blue: 0.0)
private let workoutGreen = Color(red: 0.62, green: 0.98, blue: 0.28)

struct WorkoutScreen: View {
    @EnvironmentObject var m: WorkoutManager
    @State private var menu = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let rest = m.restEndsAt.map { $0.timeIntervalSince(ctx.date) } ?? 0
            VStack(alignment: .leading, spacing: 1) {
                Text(m.exercise.isEmpty ? (m.routine.isEmpty ? "Strength" : m.routine) : m.exercise)
                    .font(.system(size: 18, weight: .semibold)).lineLimit(2).minimumScaleFactor(0.7)
                if m.setOf > 0 {
                    Text("SET \(m.setNo) OF \(m.setOf)")
                        .font(.system(size: 13, weight: .bold, design: .rounded)).foregroundStyle(workoutGreen)
                }
                if !m.detail.isEmpty {
                    Text(m.detail)
                        .font(.system(size: 30, weight: .semibold, design: .rounded).monospacedDigit())
                        .lineLimit(1).minimumScaleFactor(0.5)
                }
                if rest > 0 {
                    // The workout clock stays up beside the rest, never pushed off the screen.
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(clock(rest)).font(.system(size: 30, weight: .semibold, design: .rounded).monospacedDigit())
                        Text("REST").font(.system(size: 13, weight: .bold, design: .rounded))
                        Spacer(minLength: 4)
                        Text(clock(m.startDate.map { ctx.date.timeIntervalSince($0) } ?? 0))
                            .font(.system(size: 20, weight: .semibold, design: .rounded).monospacedDigit())
                            .foregroundStyle(.white).lineLimit(1).fixedSize()
                    }
                    .foregroundStyle(workoutYellow)
                    ProgressView(value: m.restTotal > 0 ? min(1, rest / m.restTotal) : 0)
                        .tint(workoutYellow).scaleEffect(x: 1, y: 0.6)
                } else {
                    Text(clock(m.startDate.map { ctx.date.timeIntervalSince($0) } ?? 0))
                        .font(.system(size: 30, weight: .semibold, design: .rounded).monospacedDigit())
                        .foregroundStyle(workoutYellow)
                }
                Spacer(minLength: 0)
                HStack(spacing: 10) {
                    HStack(spacing: 3) {
                        Image(systemName: "heart.fill").foregroundStyle(.red)
                            .symbolEffect(.pulse, isActive: m.phase == .running)
                        Text(m.heartRate > 0 ? "\(Int(m.heartRate.rounded()))" : "--")
                    }
                    Text("\(Int(m.activeKcal.rounded())) CAL")
                }
                .font(.system(size: 15, weight: .medium, design: .rounded).monospacedDigit())
                if !m.song.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "music.note").foregroundStyle(workoutGreen)
                        Text(m.artist.isEmpty ? m.song : "\(m.song) · \(m.artist)").lineLimit(1)
                    }
                    .font(.system(size: 13)).foregroundStyle(.secondary)
                }
                if m.phase == .paused {
                    Text("Paused").font(.system(size: 13, weight: .semibold)).foregroundStyle(workoutYellow)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.horizontal, 4)
        }
        .contentShape(Rectangle())
        .onLongPressGesture { menu = true }
        .confirmationDialog("Workout", isPresented: $menu) {
            Button(m.phase == .paused ? "Resume" : "Pause") { m.togglePause() }
            Button("End", role: .destructive) { m.end() }
        }
    }

    private func clock(_ secs: TimeInterval) -> String {
        let t = max(0, Int(secs.rounded(.up)))
        let h = t / 3600, mm = (t % 3600) / 60, ss = t % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, mm, ss) : String(format: "%d:%02d", mm, ss)
    }
}

struct IdleView: View {
    @EnvironmentObject var m: WorkoutManager

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "figure.strengthtraining.traditional").font(.system(size: 34)).foregroundStyle(workoutGreen)
            Text("Start a workout in Lift Book on your iPhone and it starts here.")
                .font(.system(size: 14)).multilineTextAlignment(.center).foregroundStyle(.secondary)
            Button("Start Strength") { m.start() }.tint(workoutGreen)
        }
        .padding(.horizontal, 6)
    }
}

struct SummaryView: View {
    @EnvironmentObject var m: WorkoutManager

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Workout saved").font(.system(size: 17, weight: .semibold)).foregroundStyle(workoutGreen)
            if let s = m.summary {
                Text(fmt(s.duration)).font(.system(size: 28, weight: .semibold, design: .rounded).monospacedDigit()).foregroundStyle(workoutYellow)
                Text("\(Int(s.kcal.rounded())) ACTIVE CAL").font(.system(size: 17, weight: .medium, design: .rounded))
            }
            Spacer(minLength: 0)
            Button("Done") { m.dismissSummary() }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
    }

    private func fmt(_ d: TimeInterval) -> String {
        let t = Int(d), h = t / 3600, mm = (t % 3600) / 60, ss = t % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, mm, ss) : String(format: "%02d:%02d", mm, ss)
    }
}
