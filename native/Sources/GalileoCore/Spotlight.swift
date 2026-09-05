import Foundation

/// A cue adds presentation time. It never squeezes the original motion or rewinds
/// a video. All ranges are half-open, integer frame ranges at the document rate.
public struct SpotlightCue: Equatable, Sendable {
    public let itemID: String
    public let motionFrame: Int64
    public let startFrame: Int64
    public let transitionFrames: Int64
    public let holdFrames: Int64
    public let scale: Double
    public var closing: Bool = false
    public var frameCount: Int64 { transitionFrames * (closing ? 1 : 2) + holdFrames }
    public var holdStartFrame: Int64 { startFrame + transitionFrames }
    public var holdEndFrame: Int64 { holdStartFrame + holdFrames }
    public var endFrame: Int64 { startFrame + frameCount }

    static func compile(items: [MediaItem], variant: SceneVariant, timing: Timing,
                        motion: FrameSchedule) -> [SpotlightCue] {
        func frames(_ milliseconds: Int64) -> Int64 {
            let divisor = 1000 * motion.rate.denominator
            return max(1, (milliseconds * motion.rate.numerator + divisor - 1) / divisor)
        }
        let anchors = items.enumerated().compactMap { index, item -> (Int, MediaItem, Int64)? in
            guard item.spotlight?.enabled == true || (item.closing == true && timing.playMode != .loop) else { return nil }
            if item.closing == true && timing.playMode != .loop { return (index, item, motion.cycleFrames) }
            let phase = anchor(index: index, count: items.count, variant: variant, hold: timing.holdFraction)
            return (index, item, min(motion.cycleFrames - 1, max(0, Int64(floor(phase * Double(motion.cycleFrames))))))
        }.sorted { $0.2 == $1.2 ? $0.0 < $1.0 : $0.2 < $1.2 }
        var added: Int64 = 0
        return anchors.map { _, item, anchor in
            let setting = item.spotlight ?? Spotlight()
            let transition = max(2, frames(setting.transitionMilliseconds ?? 450))
            let cue = SpotlightCue(itemID: item.id, motionFrame: anchor,
                                   startFrame: anchor + added, transitionFrames: transition,
                                   holdFrames: frames(setting.holdMilliseconds), scale: setting.scale,
                                   closing: item.closing == true && timing.playMode != .loop)
            added += cue.frameCount
            return cue
        }
    }

    /// Choose a readable point in the existing authored route, not its endpoint.
    private static func anchor(index: Int, count: Int, variant: SceneVariant, hold: Double) -> Double {
        let i = Double(index), n = Double(max(1, count))
        switch variant.family {
        case .carousel, .stack, .vitrine: return (i + hold * 0.5) / n
        case .reel:
            return (i + (variant.controls.contains(.hold) ? hold * 0.5 : 0.1)) / n
        case .orbit:
            if variant.id == "the-orrery", index > 0, count > 13 { return (i - 1) / (n - 1) }
            return (i + 0.1) / n
        case .fan:
            let pages = (count + 9) / 10
            return (Double(index / 10) + 0.5) / Double(pages)
        case .table:
            let strip = variant.id == "deck-contact-strip", pageSize = strip ? 5 : 12
            let pages = (count + pageSize - 1) / pageSize, page = index / pageSize
            let mounted = min(pageSize, count - page * pageSize)
            let phase = strip || variant.id == "light-table"
                ? (Double(index % pageSize) + hold * 0.5) / Double(mounted) : hold * 0.5
            return (Double(page) + phase) / Double(pages)
        case .compare:
            return (Double(index / 2) + (index % 2 == 0 ? 0 : 0.5)) / Double((count + 1) / 2)
        case .build: return (i + min(0.98, hold + 0.02)) / n
        case .hang: return (Double(index / 8) + 0.5) / Double((count + 7) / 8)
        }
    }

    static func present(_ cue: SpotlightCue, offset: Int64, cards: [SceneCard],
                        items: [MediaItem], canvas: Canvas, sourceSeconds: Double) -> [SceneCard] {
        guard let item = items.first(where: { $0.id == cue.itemID }) else { return cards }
        func smooth(_ x: Double) -> Double {
            let x = bounded(x, 0, 1)
            return x * x * x * (x * (x * 6 - 15) + 10)
        }
        let weight: Double
        if offset < cue.transitionFrames {
            weight = smooth(Double(offset) / Double(cue.transitionFrames - 1))
        } else if offset < cue.transitionFrames + cue.holdFrames {
            weight = 1
        } else {
            weight = 1 - smooth(Double(offset - cue.transitionFrames - cue.holdFrames) / Double(cue.transitionFrames - 1))
        }
        let w = Double(canvas.width), h = Double(canvas.height)
        let targetHeight = min(h * cue.scale, w * cue.scale / item.ratio)
        let targetWidth = targetHeight * item.ratio
        var result = cards
        var matching = result.indices.filter { result[$0].itemID == cue.itemID }
        if matching.isEmpty {
            // At extremely short motion durations an item may fall between two
            // sampled poses. Bring that source in from off-canvas, never silently
            // omit the requested spotlight or substitute another source.
            result.append(SceneCard(item: item, instance: "-spotlight", x: w + targetWidth,
                                    y: h / 2, width: targetWidth, height: targetHeight, seconds: sourceSeconds))
            matching = [result.count - 1]
        }
        // An assembled source can consist of several clipped parts. Move those
        // together. Otherwise lift only its frontmost instance, not every clone.
        let fragments = matching.allSatisfy { result[$0].slice != nil }
        let primary = matching.max { a, b in
            let left = result[a], right = result[b]
            if left.z != right.z { return left.z < right.z }
            return hypot(left.center.x-w/2, left.center.y-h/2) > hypot(right.center.x-w/2, right.center.y-h/2)
        }!
        if !fragments { matching = [primary] }
        let highest = (cards.map(\.z).max() ?? 0) + 10
        func mix(_ from: Double, _ to: Double) -> Double { from + (to - from) * weight }
        for index in matching {
            var card = result[index]
            card.center = Point(mix(card.center.x, w/2),
                                mix(card.center.y, h/2))
            card.width = mix(card.width, targetWidth)
            card.height = mix(card.height, targetHeight)
            card.angle = mix(card.angle, 0); card.yaw = mix(card.yaw, 0); card.pitch = mix(card.pitch, 0)
            card.z = mix(card.z, highest + Double(index-primary) * 0.001)
            if let reveal = card.reveal { card.reveal = mix(reveal, 1) }
            result[index] = card
        }
        return result.sorted { $0.z == $1.z ? $0.instanceID < $1.instanceID : $0.z < $1.z }
    }
}
