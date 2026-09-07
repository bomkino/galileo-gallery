import XCTest
@testable import PitchdogStudioUI

final class StudioPaletteTests: XCTestCase {
    func testTextAndEssentialControlBoundaries() {
        for appearance in [StudioAppearance.light, .dark] {
            for high in [false, true] {
                let theme = StudioTheme(appearance: appearance, increasedContrast: high)
                for surface in [theme.window, theme.panel, theme.well, theme.hover, theme.pressed] {
                    XCTAssertGreaterThanOrEqual(theme.text.contrast(with: surface), 4.5)
                    XCTAssertGreaterThanOrEqual(theme.secondary.contrast(with: surface), 4.5)
                }
                for surface in [theme.panel, theme.well] {
                    XCTAssertGreaterThanOrEqual(theme.border.contrast(with: surface), 3)
                    XCTAssertGreaterThanOrEqual(theme.error.contrast(with: surface), 4.5)
                }
            }
        }
    }
    func testActualAccentChoosesReadableForeground() {
        for r in stride(from: UInt32(0), through: 255, by: 17) {
            for g in stride(from: UInt32(0), through: 255, by: 17) {
                for b in stride(from: UInt32(0), through: 255, by: 17) {
                    let color = StudioRGB(hex: (r << 16) | (g << 8) | b)
                    XCTAssertGreaterThanOrEqual(color.contrast(with: color.readableForeground), 4.5)
                }
            }
        }
    }
    func testFocusSurvivesLowContrastSystemAccents() {
        for accent in [UInt32(0xFFFF00),0xFFFFFF,0x000000,0xAAAAAA,0xFFAA00,0x2864DA] {
            for appearance in [StudioAppearance.light, .dark] {
                let theme=StudioTheme(appearance:appearance,accent:StudioRGB(hex:accent))
                for surface in [theme.window,theme.panel,theme.well,theme.hover,theme.pressed] {
                    XCTAssertGreaterThanOrEqual(theme.focus.contrast(with:surface),3)
                }
            }
        }
    }
    func testArtworkSurroundIsNeutralAndNotAccentDerived() {
        for appearance in [StudioAppearance.light, .dark] {
            let a = StudioTheme(appearance: appearance, accent: StudioRGB(hex: 0xFFAA00))
            let b = StudioTheme(appearance: appearance, accent: StudioRGB(hex: 0xAA00FF))
            XCTAssertEqual(a.surround.red, a.surround.green)
            XCTAssertEqual(a.surround.green, a.surround.blue)
            XCTAssertEqual(a.surround, b.surround)
            XCTAssertEqual(a.panel, b.panel)
        }
    }
}
