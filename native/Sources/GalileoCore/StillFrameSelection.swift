import Foundation

/// A source-presentation timestamp, independent of composition/output frame rate.
public struct SourceTime: Codable, Hashable, Sendable, Comparable {
    public let value: Int64
    public let timescale: Int32
    public init(value: Int64, timescale: Int32) throws {
        guard timescale > 0, value.magnitude <= UInt64(timescale) * 86_400 else {
            throw GalleryError.invalid("Invalid source timestamp or timescale.")
        }
        let divisor = Self.gcd(value.magnitude, UInt64(timescale))
        self.value = value / Int64(divisor); self.timescale = timescale / Int32(divisor)
    }
    public var seconds: Double { Double(value) / Double(timescale) }
    private static func gcd(_ a: UInt64, _ b: UInt64) -> UInt64 {
        var a=a, b=b
        while b != 0 { let next=a%b; a=b; b=next }
        return a
    }
    public static func < (a: Self, b: Self) -> Bool {
        let left=a.value.multipliedFullWidth(by:Int64(b.timescale))
        let right=b.value.multipliedFullWidth(by:Int64(a.timescale))
        return left.high == right.high ? left.low < right.low : left.high < right.high
    }
    /// Compare with the exact binary value of an existing Double trim bound.
    /// Converting the rational timestamp to Double first can include a sample at b.
    public func compared(to bound: Double) -> ComparisonResult {
        precondition(bound.isFinite)
        if value == 0 && bound == 0 { return .orderedSame }
        if value < 0 && bound >= 0 { return .orderedAscending }
        if value >= 0 && bound < 0 { return .orderedDescending }
        let order=Self.comparePositive(value.magnitude, UInt64(timescale), abs(bound))
        return value < 0 ? (order == .orderedAscending ? .orderedDescending : order == .orderedDescending ? .orderedAscending : .orderedSame) : order
    }
    private static func comparePositive(_ value: UInt64, _ scale: UInt64, _ bound: Double) -> ComparisonResult {
        if value == 0 { return bound == 0 ? .orderedSame : .orderedAscending }
        if bound == 0 { return .orderedDescending }
        let bits=bound.bitPattern, exponent=Int((bits >> 52) & 0x7ff)
        let mantissa=(bits & 0x000f_ffff_ffff_ffff) | (exponent == 0 ? 0 : 1 << 52)
        let shift=(exponent == 0 ? -1022 : exponent-1023)-52
        let product=mantissa.multipliedFullWidth(by:scale)
        let rightBits=product.high == 0 ? 64-product.low.leadingZeroBitCount : 128-product.high.leadingZeroBitCount
        let leftBits=64-value.leadingZeroBitCount
        let leftShift=max(0,-shift), rightShift=max(0,shift)
        if leftBits+leftShift != rightBits+rightShift {
            return leftBits+leftShift < rightBits+rightShift ? .orderedAscending : .orderedDescending
        }
        // Equal bit widths fit in 128 bits for the validated source duration.
        func shifted(_ high: UInt64, _ low: UInt64, _ n: Int) -> (UInt64,UInt64) {
            if n == 0 { return (high,low) }
            if n >= 64 { return (low << (n-64),0) }
            return ((high << n) | (low >> (64-n)),low << n)
        }
        let l=shifted(0,value,leftShift),r=shifted(product.high,product.low,rightShift)
        if l.0 != r.0 { return l.0 < r.0 ? .orderedAscending : .orderedDescending }
        return l.1 == r.1 ? .orderedSame : l.1 < r.1 ? .orderedAscending : .orderedDescending
    }
    private enum CodingKeys: String, CodingKey { case value, timescale }
    public init(from decoder: Decoder) throws {
        try requireKeys(decoder, allowed:["value","timescale"])
        let values=try decoder.container(keyedBy:CodingKeys.self)
        try self.init(value:values.decode(Int64.self,forKey:.value),timescale:values.decode(Int32.self,forKey:.timescale))
    }
}

public struct SourceRange: Equatable, Hashable, Sendable {
    public let start: Double, end: Double
    public init(start: Double, end: Double) throws {
        guard start.isFinite, end.isFinite, start >= 0, end > start, end <= 86_400 else {
            throw GalleryError.invalid("The source trim has no valid presentation range.")
        }
        self.start=start; self.end=end
    }
    public func contains(_ time: SourceTime) -> Bool {
        time.compared(to:start) != .orderedAscending && time.compared(to:end) == .orderedAscending
    }
}

public enum StillFrameSelection: Equatable, Hashable, Sendable, Codable {
    case first, middle, last
    case custom(SourceTime)
    case legacyFrozen(Double)
    public var label: String {
        switch self { case .first:return "First";case .middle:return "Middle";case .last:return "Last";default:return "Custom" }
    }
    public func validate(in range: SourceRange, duration: Double) throws {
        switch self {
        case .custom(let anchor):
            guard range.contains(anchor) else { throw GalleryError.invalid("The selected frame anchor is outside the source trim.") }
        case .legacyFrozen(let seconds):
            guard seconds.isFinite, seconds >= 0, seconds < duration else { throw GalleryError.invalid("Invalid saved legacy frozen time.") }
        default: break
        }
    }
    private enum CodingKeys: String, CodingKey { case tag, anchor, seconds }
    public init(from decoder: Decoder) throws {
        let values=try decoder.container(keyedBy:CodingKeys.self)
        switch try values.decode(String.self,forKey:.tag) {
        case "first": try requireKeys(decoder,allowed:["tag"]);self = .first
        case "middle": try requireKeys(decoder,allowed:["tag"]);self = .middle
        case "last": try requireKeys(decoder,allowed:["tag"]);self = .last
        case "custom": try requireKeys(decoder,allowed:["tag","anchor"]);self = .custom(try values.decode(SourceTime.self,forKey:.anchor))
        case "legacyFrozen":
            try requireKeys(decoder,allowed:["tag","seconds"])
            let seconds=try values.decode(Double.self,forKey:.seconds)
            guard seconds.isFinite, seconds >= 0, seconds <= 86_400 else { throw GalleryError.invalid("Invalid legacy frozen time.") }
            self = .legacyFrozen(seconds)
        default: throw GalleryError.invalid("This source-frame selection is not supported by this version.")
        }
    }
    public func encode(to encoder: Encoder) throws {
        var values=encoder.container(keyedBy:CodingKeys.self)
        switch self {
        case .first:try values.encode("first",forKey:.tag)
        case .middle:try values.encode("middle",forKey:.tag)
        case .last:try values.encode("last",forKey:.tag)
        case .custom(let anchor):try values.encode("custom",forKey:.tag);try values.encode(anchor,forKey:.anchor)
        case .legacyFrozen(let seconds):try values.encode("legacyFrozen",forKey:.tag);try values.encode(seconds,forKey:.seconds)
        }
    }
}

public struct SourceInterval: Equatable, Hashable, Sendable {
    public let start: SourceTime, end: SourceTime
    public init(start: SourceTime, end: SourceTime) throws {
        guard end > start else { throw GalleryError.invalid("A source picture has an invalid display interval.") }
        self.start=start;self.end=end
    }
    public func intersects(_ range: SourceRange) -> Bool {
        start.compared(to:range.end) == .orderedAscending && end.compared(to:range.start) == .orderedDescending
    }
    public func contains(_ time: SourceTime) -> Bool { start <= time && time < end }
    public func contains(seconds: Double) -> Bool {
        start.compared(to:seconds) != .orderedDescending && end.compared(to:seconds) == .orderedDescending
    }
}

/// Streaming semantic selection; decoded packet order is never "Last".
/// Retains one interval, not an unbounded full-movie frame array.
public struct StillIntervalSelector {
    private let selection: StillFrameSelection
    private let range: SourceRange
    private let midpoint: Double
    private let midpointRounding: Double
    private var selected: SourceInterval?
    public init(selection: StillFrameSelection, range: SourceRange) throws {
        if case .legacyFrozen = selection { throw GalleryError.invalid("Legacy frozen pictures use the retained compatibility sampler.") }
        self.selection=selection;self.range=range
        let sum=range.start+range.end, b=sum-range.start
        midpoint=sum/2
        midpointRounding=((range.start-(sum-b))+(range.end-b))/2
    }
    public mutating func inspect(_ interval: SourceInterval) throws {
        guard interval.intersects(range) else { return }
        let matches: Bool
        switch selection {
        case .first: matches=interval.contains(seconds:range.start)
        case .middle:
            if midpointRounding != 0 && [interval.start.seconds,interval.end.seconds].contains(where:{abs($0-midpoint)<=abs(midpointRounding)+midpoint.ulp}) {
                throw GalleryError.invalid("The source midpoint cannot be compared without losing precision. Adjust the trim.")
            }
            matches=interval.contains(seconds:midpoint)
        case .last: matches=true
        case .custom(let time): matches=range.contains(time) && interval.contains(time)
        case .legacyFrozen: matches=false
        }
        guard matches else { return }
        if let selected {
            if selection == .last {
                guard selected.start != interval.start else { throw GalleryError.invalid("The source has duplicate picture timestamps.") }
                if interval.start > selected.start { self.selected=interval }
                return
            }
            throw GalleryError.invalid("The source has overlapping or duplicate picture intervals at the selected time.")
        }
        selected=interval
    }
    public func finish() throws -> SourceInterval {
        guard let selected else { throw GalleryError.invalid("No source picture covers the selected time or trim range.") }
        return selected
    }
}

private struct SourceCodingKey: CodingKey {
    let stringValue: String
    var intValue: Int? { nil }
    init?(stringValue: String) { self.stringValue=stringValue }
    init?(intValue: Int) { return nil }
}
private func requireKeys(_ decoder: Decoder, allowed: Set<String>) throws {
    let values=try decoder.container(keyedBy:SourceCodingKey.self)
    guard Set(values.allKeys.map(\.stringValue)) == allowed else { throw GalleryError.invalid("Malformed source-frame selection payload.") }
}
