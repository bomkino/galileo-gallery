// Drift background identities and parameters. No runtime dependency on Drift.
import Foundation

public enum DriftFamily: String, Codable, CaseIterable, Sendable {
    case solid, gradient, aura, paper, void, cuttingMap = "cutting-map", grid, wave, atelier
    public var label: String {
        switch self {
        case .solid: return "Solid field"
        case .gradient: return "Gradient weather"
        case .aura: return "Luminous aura"
        case .paper: return "Printed matter"
        case .void: return "Darkroom void"
        case .cuttingMap: return "Cutting map"
        case .grid: return "Quiet grid"
        case .wave: return "Tidal wave"
        case .atelier: return "Atelier"
        }
    }
    public var mode: Double { Double(Self.allCases.firstIndex(of: self)!) }
}
public struct DriftPalette: Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let colorA: RGBA
    public let colorB: RGBA
    public let accent: RGBA
}
public struct DriftStudy: Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let family: DriftFamily
    public let paletteID: String
    public let composition: Int
    public let variation: Int
    public let intensity: Double
    public let motion: Double
    public let grain: Double
    public let vignette: Double
    public var settings: DriftBackground {
        let palette = DriftBackgroundCatalog.palettes.first { $0.id == paletteID }!
        var value = DriftBackground(studyID: id)
        value.colorA = palette.colorA; value.colorB = palette.colorB; value.accent = palette.accent
        value.variation = variation; value.intensity = intensity; value.motion = motion
        value.grain = grain; value.vignette = vignette
        return value
    }
}
/// Parameters are stored, not re-derived from a preset when reopening a project.
/// The algorithm version prevents a future shader rewrite from changing old work silently.
public struct DriftBackground: Codable, Equatable, Sendable {
    public var algorithmVersion = 1
    public var studyID: String
    public var colorA = RGBA(hex: "060606")
    public var colorB = RGBA(hex: "242424")
    public var accent = RGBA(hex: "d9d8d4")
    public var variation = 7
    public var intensity = 0.28
    public var motion = 0.04
    public var grain = 0.08
    public var vignette = 0.42
    public var animated = true
    public init(studyID: String = "black-leader") { self.studyID = studyID }
    public var study: DriftStudy? { DriftBackgroundCatalog.studies.first { $0.id == studyID } }
    public var seed: Int { 10000 + variation * 8 + (study?.composition ?? 0) }
    public var paletteID: String? {
        DriftBackgroundCatalog.palettes.first { $0.colorA == colorA && $0.colorB == colorB && $0.accent == accent }?.id
    }
    public mutating func apply(_ palette: DriftPalette) {
        colorA = palette.colorA; colorB = palette.colorB; accent = palette.accent
    }
    public func validate() throws {
        guard algorithmVersion == 1, study != nil else {
            throw GalleryError.unsupported("This Drift background needs a different version of Galileo. The original was not changed.")
        }
        guard (0..<100).contains(variation), intensity.isFinite, (0...1).contains(intensity),
              motion.isFinite, (0...1).contains(motion), grain.isFinite, (0...0.6).contains(grain),
              vignette.isFinite, (0...1).contains(vignette) else {
            throw GalleryError.invalid("The Drift background settings are outside their supported range.")
        }
        for c in [colorA, colorB, accent] {
            guard [c.r,c.g,c.b,c.a].allSatisfy({ $0.isFinite && (0...1).contains($0) }), c.a == 1 else {
                throw GalleryError.invalid("Drift background colours must be opaque sRGB values.")
            }
        }
    }
    /// Explicit integer frame authority. No wall clock, random state or seek history.
    /// Motion closes once per authored Galileo cycle, including spotlight holds.
    public func time(frame: Int64, schedule: FrameSchedule) -> (phase: Double, grainFrame: Double) {
        guard animated else { return (0,0) }
        let local = max(0,frame) % schedule.cycleFrames
        return (Double(local) / Double(schedule.cycleFrames) * 2 * .pi,
                floor(Double(local) * Double(schedule.rate.denominator) * 12 / Double(schedule.rate.numerator)))
    }
}
