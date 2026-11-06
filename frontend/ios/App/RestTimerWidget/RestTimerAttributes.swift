import Foundation
import ActivityKit

/* The lock-screen workout card, as data. Compiled into BOTH the app and the widget extension.
   That shared type is how ActivityKit matches the activity the app starts to the widget that
   draws it — if the two targets ever disagree about this shape, the card silently fails to
   render.

   (Still called RestTimer* from when the card only lived through a rest. It now lives for the
   whole workout; the name stayed because renaming the type would orphan any card already on a
   phone at the moment of the update.) */
struct RestTimerAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        enum Phase: String, Codable, Hashable {
            /// A set is up. The card offers Complete and Skip.
            case work
            /// Resting before the set described. Flips to `work` by itself at `restEndsAt`
            /// (the stale date), with no update from us.
            case rest
            /// Nothing left to do: the card offers Finish.
            case done
        }

        var phase: Phase
        /// The set up now, or the one the rest is buying time for.
        var exercise: String
        /// What it asks for, as a lifter reads it: "82.5 lb × 8", "40 lb × 8/side", "0:45".
        var detail: String
        var setNo: Int
        var setOf: Int
        /// The set after that, for the "Then" line. Nil on the last set.
        var then: String?
        /// Sets logged out of the whole session, for the progress bar.
        var done: Int
        var total: Int
        /// The rest, as two dates iOS counts between by itself — so a running rest costs zero
        /// updates. Both nil outside a rest.
        var restStartedAt: Date?
        var restEndsAt: Date?
        /// The app's accent colour key ("lime", "sky", …), so the card matches his theme.
        var accent: String
    }

    /// Fixed for the life of the card — the routine being trained.
    var routine: String
    /// The workout this card belongs to. Optional so a card left by an older build still
    /// decodes; one without it is never taken for the current session and is replaced.
    var session: String?
    /// When the workout began: the elapsed clock counts up from here.
    var startedAt: Date?
}

/* Every field read with a default. ActivityKit decodes the state of every card on screen,
   including one left over from a build with a different shape, and a synthesised decoder
   fails outright on a single missing key — which for a Live Activity means the failed-render
   placeholder on his lock screen. An old card should draw something plain and then be
   replaced, never crash. In an extension so the memberwise initialiser survives. */
extension RestTimerAttributes.ContentState {
    enum CodingKeys: String, CodingKey {
        case phase, exercise, detail, setNo, setOf, then, done, total, restStartedAt, restEndsAt, accent
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        phase = (try? c.decodeIfPresent(Phase.self, forKey: .phase)) ?? .work
        exercise = (try? c.decodeIfPresent(String.self, forKey: .exercise)) ?? ""
        detail = (try? c.decodeIfPresent(String.self, forKey: .detail)) ?? ""
        setNo = (try? c.decodeIfPresent(Int.self, forKey: .setNo)) ?? 0
        setOf = (try? c.decodeIfPresent(Int.self, forKey: .setOf)) ?? 0
        then = try? c.decodeIfPresent(String.self, forKey: .then)
        done = (try? c.decodeIfPresent(Int.self, forKey: .done)) ?? 0
        total = (try? c.decodeIfPresent(Int.self, forKey: .total)) ?? 0
        restStartedAt = try? c.decodeIfPresent(Date.self, forKey: .restStartedAt)
        restEndsAt = try? c.decodeIfPresent(Date.self, forKey: .restEndsAt)
        accent = (try? c.decodeIfPresent(String.self, forKey: .accent)) ?? "lime"
    }
}
