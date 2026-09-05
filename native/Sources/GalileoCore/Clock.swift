import Foundation

/// Integer frame indices are authoritative. There is no ambiguous terminal flag.
public struct FrameSchedule: Equatable, Sendable {
    public let rate: FrameRate
    public let cycleFrames: Int64
    public let cycles: Int64
    public let totalFrames: Int64
    public init(timing: Timing, rate: FrameRate) throws {
        guard FrameRate.supported.contains(rate), (1000...600000).contains(timing.durationMilliseconds), (1...1000).contains(timing.repeats) else {
            throw GalleryError.invalid("The frame schedule is invalid.")
        }
        self.rate = rate
        let divisor = 1000 * rate.denominator
        cycleFrames = max(1, (timing.durationMilliseconds * rate.numerator + divisor - 1) / divisor)
        cycles = timing.playMode == .repeatCount ? Int64(timing.repeats) : 1
        totalFrames = cycleFrames * cycles
    }
    public var duration: Double { Double(totalFrames * rate.denominator) / Double(rate.numerator) }
    public var cycleDuration: Double { Double(cycleFrames * rate.denominator) / Double(rate.numerator) }
    public func seconds(for frame: Int64) -> Double { Double(frame) * Double(rate.denominator) / Double(rate.numerator) }
    public func frame(at seconds: Double) -> Int64 {
        guard seconds.isFinite else { return 0 }
        if seconds<=0 { return 0 }
        if seconds>=duration { return totalFrames-1 }
        return min(totalFrames-1,Int64(floor(seconds*rate.value+1e-8)))
    }
    public func sample(frame: Int64) -> TimeSample {
        let frame = min(totalFrames - 1, max(0, frame))
        let local = frame % cycleFrames
        return TimeSample(absoluteFrame: frame, cycleIndex: frame / cycleFrames,
                          localFrame: local, seconds: seconds(for: frame), localSeconds: seconds(for: local),
                          progress: Double(local) / Double(cycleFrames), isLastCycle: frame / cycleFrames == cycles - 1)
    }
    public func label(frame: Int64) -> String {
        let seconds = self.seconds(for: min(totalFrames,max(0, frame)))
        let whole = Int(seconds)
        let sub = Int(floor((seconds - Double(whole)) * rate.value + 1e-6))
        return String(format: "%02d:%02d:%02d:%02d", whole / 3600, (whole / 60) % 60, whole % 60, sub)
    }
}
public struct TimeSample: Equatable, Sendable {
    public let absoluteFrame: Int64; public let cycleIndex: Int64; public let localFrame: Int64
    public let seconds: Double; public let localSeconds: Double; public let progress: Double
    public let isLastCycle: Bool
}
public struct Transport: Sendable {
    public private(set) var frame: Int64 = 0
    public private(set) var playing = false
    private var anchorSeconds: Double = 0
    private var anchorFrame: Int64 = 0
    public init() {}
    public mutating func seek(_ value: Int64, schedule: FrameSchedule) {
        frame = min(schedule.totalFrames - 1, max(0, value)); playing = false
    }
    public mutating func play(now: Double, schedule: FrameSchedule) {
        if frame >= schedule.totalFrames - 1 { frame = 0 }
        guard now.isFinite else { return }
        anchorSeconds = now; anchorFrame = frame; playing = true
    }
    public mutating func pause() { playing = false }
    public mutating func tick(now: Double, schedule: FrameSchedule, loop: Bool) {
        guard playing,now.isFinite else { return }
        let elapsed=max(0,now-anchorSeconds)
        guard elapsed.isFinite else { playing=false;return }
        if loop {
            let local=elapsed.truncatingRemainder(dividingBy:schedule.duration)
            let advanced=Int64(floor(local*schedule.rate.value))
            frame=(anchorFrame+advanced)%schedule.totalFrames
        } else if elapsed>=schedule.seconds(for:schedule.totalFrames-anchorFrame) {
            frame=schedule.totalFrames-1;playing=false
        } else {
            frame=min(schedule.totalFrames-1,anchorFrame+Int64(floor(elapsed*schedule.rate.value)))
        }
    }
}
