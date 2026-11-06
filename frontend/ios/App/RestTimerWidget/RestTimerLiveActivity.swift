import ActivityKit
import WidgetKit
import SwiftUI
import AppIntents

/* The lock-screen workout card and its Dynamic Island. Up for the whole session, with three
   faces: the set to do now, the rest before the next one, and "that's everything".

   Everything here is drawn by iOS from the ContentState; there is no network access and no timer
   of our own. The elapsed clock and the rest countdown are `Text(timerInterval:)` between fixed
   dates, which the system ticks itself — and the rest face turns back into the set face at the
   stale date, so a rest running out needs nothing from the app either.

   🔴 Every date range in this file is built from two STORED dates, never from `.now`. A Swift
   `ClosedRange` traps when its upper bound is below its lower one, and a range ending at
   `endsAt` built from `.now` inverts the instant the rest runs out — that crashed the widget on
   every rest for five days (build 6), drawn by iOS as the greyed last frame with a spinner. */
struct RestTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            CardFace(card: Card(context))
                .activityBackgroundTint(Color(hex: 0x0B0B0D).opacity(0.94))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let card = Card(context)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Glyph(card: card, size: 42)
                        .padding(.leading, 4)
                        .padding(.top, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    IslandTrailing(card: card)
                        .padding(.trailing, 4)
                        .padding(.top, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    IslandCenter(card: card)
                        .padding(.top, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 10) {
                        ProgressLine(card: card)
                        Actions(card: card, compact: true)
                    }
                    .padding(.horizontal, 4)
                    .padding(.top, 6)
                }
            } compactLeading: {
                Image(systemName: card.symbol)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(card.accent)
            } compactTrailing: {
                CompactTrailing(card: card)
            } minimal: {
                Minimal(card: card)
            }
            .keylineTint(card.accent)
        }
        .onTheWatch()
    }
}

/* iOS 18 can draw the card on a paired Apple Watch, in the Smart Stack, from this same extension
   — no watch app involved. Without this the watch shows its own mirror of the compact island
   views: glanceable, but no buttons. Deployment is iOS 17, where none of this exists, so the
   whole thing is one availability branch and iOS 17 gets exactly the configuration above. */
private extension WidgetConfiguration {
    func onTheWatch() -> some WidgetConfiguration {
        if #available(iOS 18.0, *) {
            return supplementalActivityFamilies([.small])
        } else {
            return self
        }
    }
}

/// The lock-screen presentation, which on iOS 18 is also the watch's: `.small` is the watch,
/// `.medium` the phone. iOS 17 only ever has the phone.
private struct CardFace: View {
    let card: Card

    var body: some View {
        if #available(iOS 18.0, *) {
            FamilyCard(card: card)
        } else {
            LockScreenCard(card: card)
        }
    }
}

@available(iOS 18.0, *)
private struct FamilyCard: View {
    let card: Card
    @Environment(\.activityFamily) private var family

    var body: some View {
        switch family {
        case .small: WatchCard(card: card)
        case .medium: LockScreenCard(card: card)
        @unknown default: LockScreenCard(card: card)
        }
    }
}

// MARK: - the model the views read

/* One reading of the context, shared by every presentation, so the island and the lock screen
   can never disagree about which face is showing. */
struct Card {
    enum Face { case work, rest(ClosedRange<Date>), done }

    let state: RestTimerAttributes.ContentState
    let routine: String
    let started: Date?
    let face: Face
    let accent: Color
    let onAccent: Color

    init(_ context: ActivityViewContext<RestTimerAttributes>) {
        state = context.state
        routine = context.attributes.routine
        started = context.attributes.startedAt
        (accent, onAccent) = Palette.of(state.accent)
        switch state.phase {
        case .done:
            face = .done
        case .rest:
            // `isStale` is the system flipping the card at the stale date; the end date is the
            // truth that costs nothing to check. Either one says the rest is over.
            if !context.isStale, let range = Card.restRange(state), range.upperBound > .now {
                face = .rest(range)
            } else {
                face = .work
            }
        case .work:
            face = .work
        }
    }

    /// The rest as a range of two stored dates, or nil if they don't make one.
    static func restRange(_ s: RestTimerAttributes.ContentState) -> ClosedRange<Date>? {
        guard let end = s.restEndsAt else { return nil }
        let start = s.restStartedAt ?? end.addingTimeInterval(-90)
        return start < end ? start...end : nil
    }

    var isRest: Bool { if case .rest = face { return true } else { return false } }
    var isDone: Bool { if case .done = face { return true } else { return false } }
    /// Done because nothing was planned: a freestyle workout before its first exercise is
    /// added. Nothing to finish yet, so it offers nothing.
    var isEmpty: Bool { isDone && state.total == 0 }

    var symbol: String {
        switch face {
        case .work: return "dumbbell.fill"
        case .rest: return "timer"
        case .done: return isEmpty ? "plus" : "flag.checkered"
        }
    }

    /// Sets logged out of the session, 0…1.
    var progress: Double { state.total > 0 ? min(1, Double(state.done) / Double(state.total)) : 0 }

    /// Twelve hours of headroom: far past the eight a Live Activity can live, and a fixed upper
    /// bound means the range can never invert.
    var elapsedRange: ClosedRange<Date>? { started.map { $0...$0.addingTimeInterval(12 * 3600) } }

    var title: String {
        if isDone { return isEmpty ? "No exercises yet" : "Workout complete" }
        return state.exercise.isEmpty ? routine : state.exercise
    }
}

// MARK: - lock screen

private struct LockScreenCard: View {
    let card: Card
    @Environment(\.isLuminanceReduced) private var dim

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Header(card: card)
            HStack(alignment: .center, spacing: 12) {
                Info(card: card)
                Spacer(minLength: 0)
                Hero(card: card)
            }
            Actions(card: card, compact: false)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 13)
        .background { CardBackground(accent: card.accent, dim: dim) }
    }
}

/* Dark, with the accent glowing in from the top corner and a hairline diagonal texture — the
   sort of surface that reads as designed rather than defaulted. All of it goes in Always-On,
   where the screen wants as little lit as possible. */
private struct CardBackground: View {
    let accent: Color
    let dim: Bool

    var body: some View {
        if dim {
            Color.black
        } else {
            ZStack {
                LinearGradient(colors: [Color(hex: 0x1A1B1F), Color(hex: 0x0B0B0D)], startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [accent.opacity(0.38), accent.opacity(0.08), .clear],
                               center: .topTrailing, startRadius: 4, endRadius: 280)
                RadialGradient(colors: [accent.opacity(0.10), .clear],
                               center: .bottomLeading, startRadius: 0, endRadius: 220)
                Hatch()
                    .stroke(Color.white.opacity(0.035), lineWidth: 0.75)
            }
        }
    }
}

/// Diagonal hairlines, 10pt apart.
private struct Hatch: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let step: CGFloat = 10
        var x = -rect.height
        while x < rect.width {
            p.move(to: CGPoint(x: x, y: rect.height))
            p.addLine(to: CGPoint(x: x + rect.height, y: 0))
            x += step
        }
        return p
    }
}

/// ROUTINE ···· ▬▬▬▬── 12/20 · 23:14
private struct Header: View {
    let card: Card

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 5) {
                Image(systemName: "figure.strengthtraining.traditional")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(card.accent)
                Text(card.routine)
                    .font(.system(size: 12, weight: .semibold))
                    .textCase(.uppercase)
                    .tracking(0.6)
                    .foregroundStyle(.white.opacity(0.72))
                    .lineLimit(1)
            }
            .layoutPriority(-1)
            Spacer(minLength: 4)
            MiniBar(value: card.progress, accent: card.accent)
                .frame(width: 40, height: 4)
            Text("\(card.state.done)/\(card.state.total)")
                .font(.system(size: 12, weight: .semibold, design: .rounded).monospacedDigit())
                .foregroundStyle(.white.opacity(0.9))
                .contentTransition(.numericText(value: Double(card.state.done)))
                .fixedSize()
            if let range = card.elapsedRange {
                Text("·").font(.system(size: 12, weight: .bold)).foregroundStyle(.white.opacity(0.35))
                Text(timerInterval: range, countsDown: false)
                    .font(.system(size: 12, weight: .medium, design: .rounded).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.6))
                    .multilineTextAlignment(.trailing)
                    .frame(width: 50, alignment: .trailing)
            }
        }
    }
}

private struct MiniBar: View {
    let value: Double
    let accent: Color

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.16))
                Capsule()
                    .fill(LinearGradient(colors: [accent.opacity(0.75), accent], startPoint: .leading, endPoint: .trailing))
                    .frame(width: max(value > 0 ? g.size.height : 0, g.size.width * value))
            }
        }
    }
}

/// The exercise, what it asks for, and what comes after.
private struct Info: View {
    let card: Card

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(card.title)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            if card.isDone {
                Text(summary)
                    .font(.system(size: 15, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(card.accent)
                    .lineLimit(1)
            } else {
                Text(card.state.detail)
                    .font(.system(size: 15, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(card.accent)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .contentTransition(.numericText())
            }
            Text(footnote)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.5))
                .lineLimit(1)
        }
    }

    private var summary: String {
        card.isEmpty ? "Add one in the app" : "\(card.state.done) of \(card.state.total) sets logged"
    }

    /// "Set 3 of 4 · then 82.5 lb × 8" — during a rest the title and this line describe the set
    /// coming up, and the hero's REST says so.
    private var footnote: String {
        if card.isEmpty { return "The clock is running" }
        if card.isDone { return "Tap Finish to save it" }
        let lead = "Set \(card.state.setNo) of \(card.state.setOf)"
        if let then = card.state.then { return "\(lead)  ·  then \(then)" }
        return "\(lead)  ·  last one"
    }
}

/// The one number that matters right now: the rest countdown, or which set this is.
private struct Hero: View {
    let card: Card

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            switch card.face {
            case .rest(let range):
                Label("REST", systemImage: "timer")
                    .labelStyle(EyebrowLabel(color: card.accent))
                Text(timerInterval: range, countsDown: true)
                    .font(.system(size: 32, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 92, alignment: .trailing)
                ProgressView(timerInterval: range, countsDown: true) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .progressViewStyle(.linear)
                .tint(card.accent)
                .frame(width: 84)
            case .work:
                Label("SET", systemImage: "dumbbell.fill")
                    .labelStyle(EyebrowLabel(color: card.accent))
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    Text("\(card.state.setNo)")
                        .font(.system(size: 32, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(.white)
                        .contentTransition(.numericText(value: Double(card.state.setNo)))
                    Text("/\(card.state.setOf)")
                        .font(.system(size: 18, weight: .semibold, design: .rounded).monospacedDigit())
                        .foregroundStyle(.white.opacity(0.45))
                }
            case .done:
                Image(systemName: card.isEmpty ? "plus.circle.fill" : "checkmark.seal.fill")
                    .font(.system(size: 38, weight: .semibold))
                    .foregroundStyle(card.accent)
                    .symbolRenderingMode(.hierarchical)
            }
        }
        .fixedSize()
    }
}

private struct EyebrowLabel: LabelStyle {
    let color: Color
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 3) {
            configuration.icon
            configuration.title
        }
        .font(.system(size: 10, weight: .bold))
        .tracking(0.8)
        .foregroundStyle(color)
    }
}

// MARK: - buttons

/* The fewest taps that cover a set with the phone locked: do it, skip it, or — resting — buy
   15 seconds, or be ready now. Each runs in the app's process (LiveActivityIntent) without
   opening it, except Finish, which opens the app to show the summary. */
private struct Actions: View {
    let card: Card
    let compact: Bool

    var body: some View {
        HStack(spacing: 8) {
            switch card.face {
            case .work:
                Pill(intent: SkipSetIntent(), symbol: "forward.end.fill", title: "Skip", card: card, primary: false, compact: compact)
                    .frame(width: compact ? 88 : 96)
                Pill(intent: CompleteSetIntent(), symbol: "checkmark", title: "Complete set", card: card, primary: true, compact: compact)
            case .rest:
                Pill(intent: AddRestIntent(), symbol: "plus", title: "15s", card: card, primary: false, compact: compact)
                    .frame(width: compact ? 70 : 76)
                Pill(intent: SkipRestIntent(), symbol: "forward.fill", title: "Skip rest", card: card, primary: false, compact: compact)
                Pill(intent: CompleteSetIntent(), symbol: "checkmark", title: "Done", card: card, primary: true, compact: compact)
            case .done:
                if !card.isEmpty {
                    Pill(intent: FinishWorkoutIntent(), symbol: "flag.checkered", title: "Finish workout", card: card, primary: true, compact: compact)
                }
            }
        }
    }
}

private struct Pill<I: AppIntent>: View {
    let intent: I
    let symbol: String
    let title: String
    let card: Card
    let primary: Bool
    let compact: Bool
    @Environment(\.isLuminanceReduced) private var dim

    var body: some View {
        Button(intent: intent) {
            HStack(spacing: 5) {
                Image(systemName: symbol)
                    .font(.system(size: 12, weight: .bold))
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(primary && !dim ? card.onAccent : .white)
            .frame(maxWidth: .infinity)
            .frame(height: compact ? 32 : 34)
            .background {
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .fill(fill)
                    .overlay {
                        RoundedRectangle(cornerRadius: 11, style: .continuous)
                            .strokeBorder(Color.white.opacity(primary ? 0 : 0.08), lineWidth: 0.5)
                    }
            }
        }
        .buttonStyle(.plain)
    }

    private var fill: AnyShapeStyle {
        if primary {
            return dim ? AnyShapeStyle(card.accent.opacity(0.35))
                : AnyShapeStyle(LinearGradient(colors: [card.accent, card.accent.opacity(0.82)], startPoint: .top, endPoint: .bottom))
        }
        return AnyShapeStyle(Color.white.opacity(0.13))
    }
}

// MARK: - Apple Watch

/* The card on his wrist, in the Smart Stack. The whole face is a widget slot — 152×70pt on the
   smallest watch, 191×82 on the Ultra (Apple's HIG table) — so it is one glance and one or two
   buttons: the set and a big Complete; the rest countdown with +15 and Skip; then "done".
   Skip-set stays on the phone, since a second button next to Complete would squeeze the
   exercise name to nothing.

   The buttons are the phone card's own `LiveActivityIntent`s; a tap on the watch runs them in the
   app on the phone, exactly like a lock-screen tap. Finish is not a button here: it has to open
   the app, and from a watch that means the phone — so the done face says to finish there (a tap
   on the card itself offers "open on iPhone").

   The same guards as the phone card: every range from two stored dates, via `Card`. Wrist down
   (reduced luminance) goes flat black and the accent fills dim. */
private struct WatchCard: View {
    let card: Card
    @Environment(\.isLuminanceReduced) private var dim

    var body: some View {
        HStack(alignment: .center, spacing: 6) {
            WatchInfo(card: card)
            Spacer(minLength: 0)
            WatchControls(card: card)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background { WatchBackground(accent: card.accent, dim: dim) }
    }
}

/// The phone card's glow, darker: the watch is OLED, and black is the frame it sits in.
private struct WatchBackground: View {
    let accent: Color
    let dim: Bool

    var body: some View {
        if dim {
            Color.black
        } else {
            ZStack {
                LinearGradient(colors: [Color(hex: 0x141417), .black], startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [accent.opacity(0.30), accent.opacity(0.06), .clear],
                               center: .topTrailing, startRadius: 2, endRadius: 150)
            }
        }
    }
}

private struct WatchInfo: View {
    let card: Card

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            switch card.face {
            case .work:
                Text(card.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text(card.state.detail)
                    .font(.system(size: 17, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(card.accent)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .contentTransition(.numericText())
                HStack(spacing: 4) {
                    Text("Set \(card.state.setNo)/\(card.state.setOf)")
                        .foregroundStyle(.white.opacity(0.7))
                        .contentTransition(.numericText(value: Double(card.state.setNo)))
                        .minimumScaleFactor(0.75)
                    if let range = card.elapsedRange {
                        Text("·").foregroundStyle(.white.opacity(0.3))
                        Text(timerInterval: range, countsDown: false)
                            .foregroundStyle(.white.opacity(0.5))
                            .frame(width: 44, alignment: .leading)
                    }
                }
                .font(.system(size: 11, weight: .medium, design: .rounded).monospacedDigit())
                .lineLimit(1)
            case .rest(let range):
                Text(timerInterval: range, countsDown: true)
                    .font(.system(size: 28, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(width: 80, alignment: .leading)
                ProgressView(timerInterval: range, countsDown: true) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .progressViewStyle(.linear)
                .tint(card.accent)
                .padding(.vertical, 2)
                // The weight first, so a long exercise name is what truncates.
                Text("\(Text("Next").foregroundStyle(card.accent))  \(card.state.detail) · \(card.title)")
                    .font(.system(size: 11, weight: .medium, design: .rounded).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.65))
                    .lineLimit(1)
            case .done:
                Text(card.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text(card.isEmpty ? "Add one in the app" : "\(card.state.done) of \(card.state.total) sets")
                    .font(.system(size: 13, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(card.accent)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(card.isEmpty ? "The clock is running" : "Finish on your iPhone")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.5))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
    }
}

private struct WatchControls: View {
    let card: Card
    @Environment(\.isLuminanceReduced) private var dim

    var body: some View {
        switch card.face {
        case .work:
            // Complete, ringed by how much of the session is logged.
            Button(intent: CompleteSetIntent()) {
                ZStack {
                    Circle().stroke(Color.white.opacity(0.14), lineWidth: 3)
                    Circle()
                        .trim(from: 0, to: card.progress)
                        .stroke(card.accent.opacity(dim ? 0.5 : 1), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Circle()
                        .fill(fill(primary: true))
                        .padding(6)
                    Image(systemName: "checkmark")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(dim ? .white : card.onAccent)
                }
                .frame(width: 48, height: 48)
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
        case .rest:
            VStack(spacing: 4) {
                chip(AddRestIntent(), primary: false) {
                    Text("+15")
                        .font(.system(size: 13, weight: .semibold, design: .rounded).monospacedDigit())
                }
                chip(SkipRestIntent(), primary: true) {
                    Image(systemName: "forward.fill")
                        .font(.system(size: 12, weight: .bold))
                }
            }
        case .done:
            Image(systemName: card.isEmpty ? "plus.circle.fill" : "checkmark.seal.fill")
                .font(.system(size: 32, weight: .semibold))
                .foregroundStyle(card.accent.opacity(dim ? 0.6 : 1))
                .symbolRenderingMode(.hierarchical)
        }
    }

    private func chip<I: AppIntent, Label: View>(_ intent: I, primary: Bool, @ViewBuilder label: () -> Label) -> some View {
        Button(intent: intent) {
            label()
                .foregroundStyle(primary && !dim ? card.onAccent : .white)
                .frame(width: 46, height: 28)
                .background(Capsule().fill(fill(primary: primary)))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func fill(primary: Bool) -> AnyShapeStyle {
        if primary {
            return dim ? AnyShapeStyle(card.accent.opacity(0.35))
                : AnyShapeStyle(LinearGradient(colors: [card.accent, card.accent.opacity(0.82)], startPoint: .top, endPoint: .bottom))
        }
        return AnyShapeStyle(Color.white.opacity(0.15))
    }
}

// MARK: - Dynamic Island

private struct Glyph: View {
    let card: Card
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle().fill(card.accent.opacity(0.18))
            if case .rest(let range) = card.face {
                ProgressView(timerInterval: range, countsDown: true) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .progressViewStyle(.circular)
                .tint(card.accent)
            }
            Image(systemName: card.symbol)
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(card.accent)
        }
        .frame(width: size, height: size)
    }
}

private struct IslandCenter: View {
    let card: Card

    var body: some View {
        VStack(spacing: 1) {
            Text(card.title)
                .font(.system(size: 15, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(card.isEmpty ? "Add one in the app" : card.isDone ? "\(card.state.done) of \(card.state.total) sets" : card.state.detail)
                .font(.system(size: 13, weight: .semibold, design: .rounded).monospacedDigit())
                .foregroundStyle(card.accent)
                .lineLimit(1)
        }
    }
}

private struct IslandTrailing: View {
    let card: Card

    var body: some View {
        switch card.face {
        case .rest(let range):
            Text(timerInterval: range, countsDown: true)
                .font(.system(size: 26, weight: .semibold, design: .rounded).monospacedDigit())
                .foregroundStyle(card.accent)
                .multilineTextAlignment(.trailing)
                .frame(width: 76, alignment: .trailing)
        case .work:
            VStack(alignment: .trailing, spacing: 0) {
                Text("SET")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(.secondary)
                Text("\(card.state.setNo)/\(card.state.setOf)")
                    .font(.system(size: 22, weight: .bold, design: .rounded).monospacedDigit())
                    .contentTransition(.numericText(value: Double(card.state.setNo)))
            }
        case .done:
            if let range = card.elapsedRange {
                Text(timerInterval: range, countsDown: false)
                    .font(.system(size: 17, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 76, alignment: .trailing)
            }
        }
    }
}

/// The bar under the island: the rest draining, or the session filling up.
private struct ProgressLine: View {
    let card: Card

    var body: some View {
        if case .rest(let range) = card.face {
            ProgressView(timerInterval: range, countsDown: true) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .progressViewStyle(.linear)
            .tint(card.accent)
        } else {
            HStack(spacing: 8) {
                MiniBar(value: card.progress, accent: card.accent)
                    .frame(height: 4)
                Text("\(card.state.done)/\(card.state.total) sets")
                    .font(.system(size: 11, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.secondary)
                    .fixedSize()
            }
        }
    }
}

private struct CompactTrailing: View {
    let card: Card

    var body: some View {
        switch card.face {
        case .rest(let range):
            Text(timerInterval: range, countsDown: true)
                .font(.system(size: 15, weight: .semibold, design: .rounded).monospacedDigit())
                .foregroundStyle(card.accent)
                .multilineTextAlignment(.trailing)
                .frame(width: 44, alignment: .trailing)
        case .work:
            Text("\(card.state.setNo)/\(card.state.setOf)")
                .font(.system(size: 15, weight: .semibold, design: .rounded).monospacedDigit())
                .foregroundStyle(card.accent)
        case .done:
            Image(systemName: card.isEmpty ? "plus" : "checkmark")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(card.accent)
        }
    }
}

/* The minimal presentation — a circle barely wider than a glyph, and what the Dynamic Island
   falls back to whenever something else is also live (music in the garage, usually). Digits do
   not fit, so a rest becomes a ring the system drains by itself. */
private struct Minimal: View {
    let card: Card

    var body: some View {
        if case .rest(let range) = card.face {
            ProgressView(timerInterval: range, countsDown: true) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .progressViewStyle(.circular)
            .tint(card.accent)
        } else {
            Image(systemName: card.symbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(card.accent)
        }
    }
}

// MARK: - colour

/* The app's own accents (src/index.css, dark theme) and the text colour each takes on top, so
   the card is the same colour as the app he chose. */
enum Palette {
    static func of(_ key: String) -> (Color, Color) {
        switch key {
        case "sky": return (Color(hex: 0x0A84FF), .white)
        case "orange": return (Color(hex: 0xFF9F0A), .black)
        case "violet": return (Color(hex: 0xBF5AF2), .white)
        case "pink": return (Color(hex: 0xFF375F), .white)
        case "red": return (Color(hex: 0xFF453A), .white)
        case "teal": return (Color(hex: 0x40C8E0), .black)
        case "gold": return (Color(hex: 0xFFD60A), .black)
        default: return (Color(hex: 0x30D158), .black)   // lime, the default
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: 1)
    }
}
