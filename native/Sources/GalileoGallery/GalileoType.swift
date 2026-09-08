import Foundation
import PitchdogStudioUI

@MainActor enum GalileoType {
    private(set) static var typography = StudioTypography.systemFallback
    static func load() throws {
        guard let resources = Bundle.main.resourceURL else { throw CocoaError(.fileReadNoSuchFile) }
        typography = try StudioTypography(fontDirectory: resources.appendingPathComponent("StudioFonts"))
    }
}
