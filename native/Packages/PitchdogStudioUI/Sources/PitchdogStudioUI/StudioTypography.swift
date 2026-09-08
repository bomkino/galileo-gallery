#if os(macOS)
import SwiftUI
import CoreText

/// Native projection of canonical UI roles at the apps' existing v13 pin.
/// Generated from pitchdog.system.tokens.json at 786b4a2b671182319320f922b8de8f927ea3a002.
/// Font files and loading lifecycle remain owned by each application.
public enum StudioTextRole: String, CaseIterable {
    case display, pageTitle, sectionTitle, panelTitle, body, bodyCompact, label, action, input, caption, badge, metadata, data, code
    struct Spec {
        let family: String
        let size: CGFloat
        let weight: Double
        let width: Double
        let lineHeight: CGFloat
        let tracking: CGFloat
    }
    var spec: Spec {
        switch self {
        case .display: return Spec(family: "head", size: 38, weight: 500, width: 100, lineHeight: 0.98, tracking: -0.026)
        case .pageTitle: return Spec(family: "body", size: 28, weight: 700, width: 100, lineHeight: 1.08, tracking: -0.021)
        case .sectionTitle: return Spec(family: "body", size: 21, weight: 600, width: 100, lineHeight: 1.16, tracking: -0.013)
        case .panelTitle: return Spec(family: "body", size: 17, weight: 600, width: 100, lineHeight: 1.2, tracking: -0.008)
        case .body: return Spec(family: "body", size: 16, weight: 400, width: 100, lineHeight: 1.48, tracking: 0)
        case .bodyCompact: return Spec(family: "body", size: 15, weight: 400, width: 100, lineHeight: 1.42, tracking: 0.001)
        case .label: return Spec(family: "body", size: 14, weight: 600, width: 100, lineHeight: 1.22, tracking: 0.006)
        case .action: return Spec(family: "body", size: 15, weight: 600, width: 100, lineHeight: 1.1, tracking: -0.002)
        case .input: return Spec(family: "body", size: 16, weight: 400, width: 100, lineHeight: 1.25, tracking: 0)
        case .caption: return Spec(family: "body", size: 13, weight: 400, width: 100, lineHeight: 1.38, tracking: 0.004)
        case .badge: return Spec(family: "eyebrow", size: 11, weight: 600, width: 87.5, lineHeight: 1.0, tracking: 0.055)
        case .metadata: return Spec(family: "eyebrow", size: 12, weight: 500, width: 87.5, lineHeight: 1.25, tracking: 0.04)
        case .data: return Spec(family: "eyebrow", size: 13, weight: 500, width: 87.5, lineHeight: 1.25, tracking: 0.006)
        case .code: return Spec(family: "eyebrow", size: 13, weight: 400, width: 87.5, lineHeight: 1.45, tracking: 0)
        }
    }
}

public struct StudioTypography {
    private let faces: [StudioTextRole: CTFont]
    /// Load exact app-owned files, avoiding installed-name collisions (v13 Eyebrow is "Untitled").
    public init(fontDirectory: URL) throws {
        var graphics: [String: CGFont] = [:]
        for (family, file) in [("body", "pd-body-roman.ttf"), ("head", "pd-head.ttf"), ("eyebrow", "pd-eyebrow-full.ttf")] {
            let url = fontDirectory.appendingPathComponent(file)
            guard let provider = CGDataProvider(url: url as CFURL), let font = CGFont(provider) else {
                throw NSError(domain: "PitchdogStudioTypography", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "The bundled interface font \(file) is missing or damaged. Reinstall the app."])
            }
            graphics[family] = font
        }
        var result: [StudioTextRole: CTFont] = [:]
        for role in StudioTextRole.allCases {
            let spec = role.spec
            var axes: [NSNumber: NSNumber] = [0x77676874: NSNumber(value: spec.weight)]
            if spec.family == "eyebrow" { axes[0x77647468] = NSNumber(value: spec.width); axes[0x6974616C] = 0 }
            if spec.family == "head" { axes[0x6974616C] = 0 }
            let descriptor = CTFontDescriptorCreateWithAttributes([kCTFontVariationAttribute: axes] as CFDictionary)
            result[role] = CTFontCreateWithGraphicsFont(graphics[spec.family]!, spec.size, nil, descriptor)
        }
        faces = result
    }
    private init() { faces = [:] }
    public static let systemFallback = StudioTypography()
    public func nativeFont(for role: StudioTextRole) -> CTFont? { faces[role] }
    func font(for role: StudioTextRole) -> Font {
        if let font = faces[role] { return Font(font) }
        return .system(size: role.spec.size, weight: role.spec.weight >= 600 ? .semibold : .regular)
    }
}
private struct StudioTypographyKey: EnvironmentKey {
    static let defaultValue = StudioTypography.systemFallback
}
public extension EnvironmentValues {
    var studioTypography: StudioTypography {
        get { self[StudioTypographyKey.self] }
        set { self[StudioTypographyKey.self] = newValue }
    }
}
public extension View {
    func studioTypography(_ typography: StudioTypography) -> some View { environment(\.studioTypography, typography) }
    func studioType(_ role: StudioTextRole) -> some View { modifier(StudioType(role: role)) }
}
private struct StudioType: ViewModifier {
    @Environment(\.studioTypography) private var typography
    let role: StudioTextRole
    func body(content: Content) -> some View {
        content.font(typography.font(for: role)).tracking(role.spec.tracking * role.spec.size)
    }
}
#endif
