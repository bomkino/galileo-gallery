import Foundation
import CoreImage
import GalileoCore

/// One immutable, lazy-loaded native kernel shared by preview, thumbnails and export.
/// Shipping builds use the precompiled metallib; SwiftPM tests compile the same source once.
public enum DriftBackgroundRenderer {
    private static let kernel: Result<CIKernel, Error> = Result {
        if let url = Bundle.main.url(forResource: "DriftBackgrounds", withExtension: "metallib") {
            return try CIKernel(functionName: "driftBackground", fromMetalLibraryData: Data(contentsOf: url))
        }
        guard Bundle.main.bundleURL.pathExtension != "app" else {
            throw GalleryError.missing("The native Drift background renderer is missing. Reinstall Galileo Gallery.")
        }
        guard let url = Bundle.module.url(forResource: "DriftBackgrounds", withExtension: "metal", subdirectory: "Resources") else {
            throw GalleryError.missing("The native Drift background renderer is missing. Reinstall Galileo Gallery.")
        }
        // Core Image runtime compilation requires stitchable linkage; the shipping
        // metallib uses -fcikernel instead. Keep the equations identical in both paths.
        var source = try String(contentsOf: url, encoding: .utf8)
        let linkage = "extern \"C\" { namespace coreimage {"
        guard source.contains(linkage), source.hasSuffix("}}\n") else {
            throw GalleryError.invalid("The native background kernel has an unsupported entry point.")
        }
        source = source.replacingOccurrences(of: linkage, with: "using namespace coreimage;")
        source.removeLast(3)
        source = source.replacingOccurrences(of: "float4 driftBackground(", with: "[[stitchable]] float4 driftBackground(")
        let kernels = try CIKernel.kernels(withMetalString: source)
        guard let kernel = kernels.first else { throw GalleryError.invalid("The native background kernel could not be loaded.") }
        return kernel
    }
    public static func image(settings: DriftBackground, extent: CGRect, logicalSize: CGSize,
                             frame: Int64, schedule: FrameSchedule) throws -> CIImage {
        try settings.validate()
        guard extent.width > 0, extent.height > 0, logicalSize.width > 0, logicalSize.height > 0,
              let study = settings.study else { throw GalleryError.invalid("The background dimensions are invalid.") }
        let time = settings.time(frame: frame, schedule: schedule)
        func vector(_ c: RGBA) -> CIVector { CIVector(x:c.r, y:c.g, z:c.b, w:1) }
        let args: [Any] = [CIVector(x:extent.width,y:extent.height), CIVector(x:logicalSize.width,y:logicalSize.height),
                           vector(settings.colorA), vector(settings.colorB), vector(settings.accent),
                           CIVector(x:settings.intensity,y:settings.motion,z:settings.grain,w:settings.vignette),
                           CIVector(x:study.family.mode,y:time.phase,z:Double(settings.seed),w:time.grainFrame)]
        guard let image = try kernel.get().apply(extent: extent, roiCallback: { _, rect in rect }, arguments: args) else {
            throw GalleryError.invalid("The selected Drift background could not be rendered.")
        }
        return image
    }
}

/// Static browser thumbnails. No timer per tile and no full-size bitmap cache.
public actor DriftBackgroundThumbnails {
    public static let shared = DriftBackgroundThumbnails()
    private final class Box: NSObject { let image: CGImage; init(_ image: CGImage) { self.image = image } }
    private let cache = NSCache<NSString,Box>()
    private let renderer = NativeRenderer()
    public init() { cache.totalCostLimit = 12 * 1024 * 1024; cache.countLimit = 72 }
    public func image(for study: DriftStudy) throws -> CGImage {
        if let value = cache.object(forKey:study.id as NSString) { return value.image }
        try Task.checkCancellation()
        var p = GalleryProject(); p.canvas.width = 240; p.canvas.height = 136
        p.canvas.background = .drift; p.canvas.drift = study.settings
        let snapshot = try RenderSnapshot(project:p,workspace:Workspace())
        let image = try renderer.image(snapshot:snapshot,frame:0)
        cache.setObject(Box(image),forKey:study.id as NSString,cost:image.bytesPerRow * image.height)
        return image
    }
}
