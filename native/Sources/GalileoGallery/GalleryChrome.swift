import AppKit
import SwiftUI
import PitchdogStudioUI

/// Application-local adapter. Theme is UI state, never a GalleryProject edit.
struct GalleryChrome: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.controlActiveState) private var active
    @State private var colorRevision = 0
    private var theme: StudioTheme {
        _ = colorRevision
        let color = NSColor.controlAccentColor.usingColorSpace(.sRGB) ?? NSColor.systemBlue
        func channel(_ v: CGFloat) -> UInt32 { UInt32((min(1, max(0, v)) * 255).rounded()) }
        let rgb = channel(color.redComponent) << 16 | channel(color.greenComponent) << 8 | channel(color.blueComponent)
        return StudioTheme(appearance: scheme == .dark ? .dark : .light, accent: StudioRGB(hex: rgb),
                           increasedContrast: contrast == .increased, reduceMotion: reduceMotion, isActive: active != .inactive)
    }
    func body(content: Content) -> some View {
        content.studioTheme(theme)
            .buttonStyle(StudioButtonStyle())
            .onReceive(NotificationCenter.default.publisher(for: NSColor.systemColorsDidChangeNotification)) { _ in colorRevision += 1 }
    }
}
