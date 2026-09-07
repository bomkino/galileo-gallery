import Foundation

/// Immutable chrome values. No project, media, preferences or application lifecycle.
public struct StudioRGB: Equatable, Hashable, Sendable {
    public let red: Double
    public let green: Double
    public let blue: Double
    public init(hex: UInt32) {
        red = Double((hex >> 16) & 255) / 255
        green = Double((hex >> 8) & 255) / 255
        blue = Double(hex & 255) / 255
    }
    public var luminance: Double {
        func linear(_ x: Double) -> Double { x <= 0.04045 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4) }
        return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
    }
    public func contrast(with other: StudioRGB) -> Double {
        (max(luminance, other.luminance) + 0.05) / (min(luminance, other.luminance) + 0.05)
    }
    public var readableForeground: StudioRGB {
        let black = StudioRGB(hex: 0), white = StudioRGB(hex: 0xFFFFFF)
        return contrast(with: black) >= contrast(with: white) ? black : white
    }
}

public enum StudioAppearance: String, Sendable { case light, dark }
public struct StudioTheme: Equatable, Sendable {
    public let appearance: StudioAppearance
    public var accent: StudioRGB
    public var increasedContrast: Bool
    public var reduceMotion: Bool
    public var isActive: Bool
    public init(appearance: StudioAppearance, accent: StudioRGB = StudioRGB(hex: 0x2864DA),
                increasedContrast: Bool = false, reduceMotion: Bool = false, isActive: Bool = true) {
        self.appearance = appearance; self.accent = accent
        self.increasedContrast = increasedContrast; self.reduceMotion = reduceMotion; self.isActive = isActive
    }
    public var window: StudioRGB { color(0xF5F5F3, 0x121416) }
    public var panel: StudioRGB { color(0xFAFAF8, 0x191C1F) }
    public var well: StudioRGB { color(0xFFFFFF, 0x252A2E) }
    public var hover: StudioRGB { color(0xEDEFEF, 0x333B43) }
    public var pressed: StudioRGB { color(0xE0E4E7, 0x36404A) }
    public var text: StudioRGB { color(0x202326, 0xF1F3F5) }
    public var secondary: StudioRGB { color(0x5F666D, 0xA7AFB7) }
    public var border: StudioRGB { increasedContrast ? secondary : color(0x858C92, 0x7B8792) }
    public var separator: StudioRGB { increasedContrast ? secondary : color(0xD9DEDF, 0x394148) }
    public var surround: StudioRGB { color(0xE6E6E6, 0x101010) }
    public var error: StudioRGB { color(0xAA2533, 0xFFA2A8) }
    public var lineWidth: Double { increasedContrast ? 1.5 : 0.75 }
    private func color(_ light: UInt32, _ dark: UInt32) -> StudioRGB {
        StudioRGB(hex: appearance == .dark ? dark : light)
    }
}
