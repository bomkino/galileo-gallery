import Foundation

public enum GalleryError: LocalizedError, Equatable {
    case invalid(String), unsupported(String), missing(String), cancelled
    public var errorDescription: String? {
        switch self {
        case .invalid(let text), .unsupported(let text), .missing(let text): return text
        case .cancelled: return "The operation was cancelled."
        }
    }
}
public func bounded(_ value: Double, _ lower: Double, _ upper: Double) -> Double {
    min(upper, max(lower, value))
}
public struct Point: Codable, Equatable, Sendable {
    public var x: Double; public var y: Double
    public init(_ x: Double = 0.5, _ y: Double = 0.5) { self.x = x; self.y = y }
}
public struct Crop: Codable, Equatable, Sendable {
    public var x: Double = 0; public var y: Double = 0
    public var width: Double = 1; public var height: Double = 1
    public init() {}
}
public struct RGBA: Codable, Equatable, Sendable {
    public var r: Double; public var g: Double; public var b: Double; public var a: Double
    public init(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) {
        self.r = r; self.g = g; self.b = b; self.a = a
    }
    public init(hex: String) {
        let n = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x171817
        self.init(Double((n >> 16) & 255)/255, Double((n >> 8) & 255)/255, Double(n & 255)/255)
    }
}
public enum BackgroundKind: String, Codable, CaseIterable, Sendable { case solid, gradient, transparent }
public struct Canvas: Codable, Equatable, Sendable {
    public var width = 1920; public var height = 1080
    public var background: BackgroundKind = .solid
    public var color = RGBA(hex: "171817")
    public var secondaryColor = RGBA(hex: "4B4943")
    public var gradientAngle: Double = 90
    public init() {}
}
public enum MediaKind: String, Codable, Sendable { case image, video, animatedImage }
public enum MediaFit: String, Codable, CaseIterable, Sendable { case contain, cover }
/// An authored centre hold, independent of source-video playback.
public struct Spotlight: Codable, Equatable, Sendable {
    public var enabled = true
    public var holdMilliseconds: Int64 = 3000
    public var scale = 0.85
    public var transitionMilliseconds: Int64? = nil
    public init() {}
}
public struct MediaItem: Codable, Equatable, Identifiable, Sendable {
    public var id: String = UUID().uuidString
    public var name: String
    public var asset: String
    public var sha256: String
    public var kind: MediaKind
    public var width: Int
    public var height: Int
    public var duration: Double?
    public var hasAlpha: Bool = false
    public var colorSpace: String = "Unknown"
    public var included = true
    public var opening = false
    public var spotlight: Spotlight? = nil
    public var closing: Bool? = nil
    /// Only recovery copies carry this marker. Missing artwork cannot export.
    public var unavailable: String? = nil
    /// PDF pages retain their original document as a separately owned asset.
    public var originalAsset: String? = nil
    public var originalSHA256: String? = nil
    public var caption = ""
    public var fit: MediaFit = .contain
    public var crop = Crop()
    public var focal = Point()
    public var displayRatio: Double? = nil
    public var trimStart: Double = 0
    public var trimEnd: Double? = nil
    public var sourceLoops = true
    public var sourcePlays = true
    public var sourceRate: Double = 1
    public init(name: String, asset: String, sha256: String, kind: MediaKind, width: Int, height: Int, duration: Double? = nil) {
        self.name = name; self.asset = asset; self.sha256 = sha256; self.kind = kind
        self.width = width; self.height = height; self.duration = duration
    }
    public var ratio: Double { displayRatio ?? (Double(width) * crop.width / (Double(height) * crop.height)) }
    public func sourceTime(at seconds: Double) -> Double {
        guard sourcePlays, let duration, duration > 0 else { return trimStart }
        let end = min(duration, trimEnd ?? duration)
        let span = max(0.000001, end - trimStart)
        let elapsed = max(0, seconds) * sourceRate
        return trimStart + (sourceLoops ? elapsed.truncatingRemainder(dividingBy: span) : min(elapsed, max(0, span - 0.000001)))
    }
}
public enum PlayMode: String, Codable, CaseIterable, Sendable { case once, repeatCount, loop }
public struct Timing: Codable, Equatable, Sendable {
    public var durationMilliseconds: Int64 = 10000
    public var playMode: PlayMode = .once
    public var repeats = 3
    public var reverse = false
    public var holdFraction = 0.72
    public init() {}
}
public struct SceneSettings: Codable, Equatable, Sendable {
    public var variantID = "cms-slideshow"
    public var scale = 0.70
    public var spacing = 36.0
    public var depth = 0.35
    public var spread = 120.0
    public var tilt = 5.0
    public var radius = 10.0
    public var shadow = 0.25
    public var captions = false
    public var captionBacking: Bool? = nil
    public var vertical = false
    public init() {}
}
public struct FrameRate: Codable, Equatable, Hashable, Sendable {
    public var numerator: Int64
    public var denominator: Int64
    public init(_ numerator: Int64 = 30, _ denominator: Int64 = 1) {
        self.numerator = numerator; self.denominator = denominator
    }
    public var value: Double { Double(numerator) / Double(denominator) }
    public var label: String { denominator == 1 ? String(numerator) : String(format: "%.3f", value) }
    public static let supported: [FrameRate] = [FrameRate(24000,1001),FrameRate(24),FrameRate(25),FrameRate(30000,1001),FrameRate(30),FrameRate(50),FrameRate(60000,1001),FrameRate(60)]
}
public enum OutputFormat: String, Codable, CaseIterable, Sendable {
    case h264, proRes422, proRes4444, png, pngSequence
    public var label: String {
        switch self {
        case .h264: return "H.264 · MP4"
        case .proRes422: return "ProRes 422 · MOV"
        case .proRes4444: return "ProRes 4444 · MOV"
        case .png: return "Still · PNG"
        case .pngSequence: return "Sequence · PNG"
        }
    }
    public var fileExtension: String { self == .h264 ? "mp4" : self == .png ? "png" : self == .pngSequence ? "" : "mov" }
    public var supportsAlpha: Bool { [.proRes4444,.png,.pngSequence].contains(self) }
}
public struct ExportSettings: Codable, Equatable, Sendable {
    public var frameRate = FrameRate()
    public var format: OutputFormat = .h264
    public init() {}
}
public struct GalleryProject: Codable, Equatable, Sendable {
    public var format = "dog.pitch.galileo.native"
    public var schemaVersion = 5
    public var id = UUID().uuidString
    public var name = "Untitled"
    public var canvas = Canvas()
    public var scene = SceneSettings()
    public var timing = Timing()
    public var export = ExportSettings()
    public var items: [MediaItem] = []
    /// Original manifests and imported assets remain in the package, not in the rendering state.
    public var legacyManifestFilename: String? = nil
    public var migrationNotes: [String] = []
    public init() {}
    public var activeItems: [MediaItem] {
        var result = items.filter(\.included)
        if let opening = result.firstIndex(where: \.opening) { result = Array(result[opening...]) + Array(result[..<opening]) }
        if timing.reverse { result.reverse() }
        if timing.playMode != .loop, let closing = result.firstIndex(where: { $0.closing == true }) {
            result.append(result.remove(at: closing))
        }
        return result
    }
    public func validate() throws {
        func require(_ condition: Bool, _ message: String) throws { if !condition { throw GalleryError.invalid(message) } }
        func finite(_ value: Double, _ range: ClosedRange<Double>, _ label: String) throws {
            try require(value.isFinite && range.contains(value), "\(label) must be between \(range.lowerBound) and \(range.upperBound).")
        }
        try require(format == "dog.pitch.galileo.native" && schemaVersion == 5, "This document needs a different version of Galileo Gallery. The original was not changed.")
        try require(!id.isEmpty && name.count <= 512, "The document identity is invalid.")
        try require((64...7680).contains(canvas.width) && (64...7680).contains(canvas.height), "Canvas dimensions must be 64–7,680 pixels.")
        try require(canvas.width % 2 == 0 && canvas.height % 2 == 0, "Canvas dimensions must be even pixel counts.")
        try require(canvas.width * canvas.height <= 33_177_600, "The canvas exceeds the supported 33-megapixel render budget.")
        for color in [canvas.color, canvas.secondaryColor] { for component in [color.r,color.g,color.b,color.a] { try finite(component, 0...1, "Colour") } }
        try finite(canvas.gradientAngle, -360...360, "Gradient angle")
        try require(SceneCatalog.variant(scene.variantID) != nil, "This scene variant is not supported.")
        try finite(scene.scale, 0.15...1, "Scale"); try finite(scene.spacing, 0...240, "Spacing")
        try finite(scene.depth, 0...1, "Depth"); try finite(scene.spread, 10...170, "Spread")
        try finite(scene.tilt, 0...25, "Tilt"); try finite(scene.radius, 0...96, "Corner radius")
        try finite(scene.shadow, 0...1, "Shadow")
        try require((1000...600000).contains(timing.durationMilliseconds), "A cycle must last 1–600 seconds.")
        try require((1...1000).contains(timing.repeats), "Repeat count must be 1–1,000.")
        try finite(timing.holdFraction, 0.1...0.95, "Hold fraction")
        try require(FrameRate.supported.contains(export.frameRate), "This frame rate is not supported.")
        try require(items.count <= 512, "A document supports at most 512 media items.")
        try require(Set(items.map(\.id)).count == items.count, "Media identities must be unique.")
        for item in items {
            if let asset = item.originalAsset {
                try require(Self.safeAssetName(asset), "The preserved source path is invalid.")
                try require(item.originalSHA256?.count == 64 && item.originalSHA256!.allSatisfy { "0123456789abcdef".contains($0) }, "The preserved source fingerprint is invalid.")
            }
            if let reason = item.unavailable { try require(reason.count <= 1000, "The recovery marker is invalid.") }
            if let spotlight = item.spotlight {
                try require((250...60000).contains(spotlight.holdMilliseconds), "A spotlight hold must last 0.25–60 seconds.")
                try finite(spotlight.scale, 0.25...0.95, "Spotlight scale")
                if let transition = spotlight.transitionMilliseconds { try require((100...5000).contains(transition), "A spotlight transition must last 0.1–5 seconds.") }
            }
            try require(!item.id.isEmpty && item.id.count <= 200 && !item.name.isEmpty && item.name.count <= 512, "A media identity is invalid.")
            try require(Self.safeAssetName(item.asset), "A media path is invalid.")
            try require(item.sha256.count == 64 && item.sha256.allSatisfy({ "0123456789abcdef".contains($0) }), "A media fingerprint is invalid.")
            try require(item.width > 0 && item.height > 0 && item.width <= 100000 && item.height <= 100000, "\(item.name) has invalid dimensions.")
            for value in [item.crop.x,item.crop.y,item.focal.x,item.focal.y] { try finite(value, 0...1, "Crop or focal point") }
            for value in [item.crop.width,item.crop.height] { try finite(value, 0.0001...1, "Crop size") }
            try require(item.crop.x + item.crop.width <= 1.000000001 && item.crop.y + item.crop.height <= 1.000000001, "\(item.name)'s crop extends outside the source.")
            if let ratio = item.displayRatio { try finite(ratio, 0.01...100, "Display ratio") }
            try require(item.caption.count <= 4000, "Captions are limited to 4,000 characters.")
            try finite(item.sourceRate, 0.25...4, "Source playback rate")
            try finite(item.trimStart, 0...86400, "Source in point")
            if item.kind != .image {
                guard let duration = item.duration else { throw GalleryError.invalid("\(item.name) has no decoded duration.") }
                try finite(duration, 0.000001...86400, "Source duration")
                let end = item.trimEnd ?? duration
                try require(end.isFinite && end <= duration && end > item.trimStart, "\(item.name)'s trim range is invalid.")
            }
        }
        if let name = legacyManifestFilename { try require(Self.safeAssetName(name), "The legacy manifest path is invalid.") }
    }
    public static func safeAssetName(_ name: String) -> Bool {
        !name.isEmpty && name.count <= 200 && name != "." && name != ".." && !name.contains("/") && !name.contains("\\") && !name.unicodeScalars.contains(where: { $0.value < 32 })
    }
    public func encoded() throws -> Data {
        try validate()
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted,.sortedKeys,.withoutEscapingSlashes]
        return try encoder.encode(self)
    }
    public static func decode(_ data: Data) throws -> GalleryProject {
        guard data.count <= 8 * 1024 * 1024 else { throw GalleryError.invalid("The document manifest is too large.") }
        var project = try JSONDecoder().decode(Self.self, from: data)
        // v3 had no per-media spotlight. Missing optional values decode as nil.
        if [3, 4].contains(project.schemaVersion) { project.schemaVersion = 5 }
        try project.validate(); return project
    }
}
public struct ScenePreset: Codable, Equatable, Sendable {
    public var format = "dog.pitch.galileo.preset"
    public var version = 1
    public var name: String
    public var scene: SceneSettings
    public var timing: Timing
    public init(name: String, project: GalleryProject) { self.name = name; scene = project.scene; timing = project.timing }
    public func validate() throws {
        guard format == "dog.pitch.galileo.preset", version == 1, !name.isEmpty, name.count <= 200 else { throw GalleryError.invalid("This is not a supported scene preset.") }
        var p = GalleryProject(); p.scene = scene; p.timing = timing; try p.validate()
    }
}
