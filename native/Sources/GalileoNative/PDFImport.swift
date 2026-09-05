import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import GalileoCore

public struct PDFImportOptions: Sendable {
    public var pages: [Int]? // Zero-based; nil imports every page, subject to limits.
    public var maximumDimension: Int
    public var transparent: Bool
    public init(pages: [Int]? = nil, maximumDimension: Int = 3840, transparent: Bool = false) {
        self.pages = pages; self.maximumDimension = maximumDimension; self.transparent = transparent
    }
}
public enum PDFImporter {
    public static func pageCount(_ url: URL) throws -> Int {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let document = CGPDFDocument(url as CFURL), !document.isEncrypted || document.isUnlocked else {
            throw GalleryError.unsupported("This PDF is locked or unreadable. Export an unlocked copy first.")
        }
        return document.numberOfPages
    }
    public static func importPages(_ url: URL, workspace: Workspace, options: PDFImportOptions) async throws -> [MediaItem] {
        guard (512...7680).contains(options.maximumDimension) else { throw GalleryError.invalid("Choose a PDF rendering size from 512 to 7,680 pixels.") }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let original = try workspace.acquire(url)
        guard let document = CGPDFDocument(original.url as CFURL), !document.isEncrypted || document.isUnlocked else {
            throw GalleryError.unsupported("The PDF cannot be read without a password.")
        }
        let indexes = try options.pages ?? PDFPageSelection.parse("", pageCount: document.numberOfPages)
        guard !indexes.isEmpty, indexes.count <= 512, indexes.allSatisfy({ $0 >= 0 && $0 < document.numberOfPages }) else {
            throw GalleryError.invalid("The PDF page selection is invalid.")
        }
        var items: [MediaItem] = []
        for index in indexes.sorted() {
            try Task.checkCancellation()
            let file = workspace.root.appendingPathComponent("page-\(UUID().uuidString).png")
            defer { try? FileManager.default.removeItem(at: file) }
            try autoreleasepool {
                guard let page = document.page(at: index+1) else { throw GalleryError.invalid("A PDF page is unavailable.") }
                let box = page.getBoxRect(.cropBox)
                guard box.width.isFinite, box.height.isFinite, box.width > 0, box.height > 0 else { throw GalleryError.invalid("The PDF page bounds are invalid.") }
                let rotated = abs(page.rotationAngle)%180 == 90
                let size = rotated ? CGSize(width: box.height, height: box.width) : box.size
                let factor = Double(options.maximumDimension)/max(size.width,size.height)
                let width = max(1,Int((size.width*factor).rounded())), height = max(1,Int((size.height*factor).rounded()))
                guard width*height <= 33_177_600, let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { throw GalleryError.invalid("The PDF page exceeds the rendering budget.") }
                let rect = CGRect(x: 0, y: 0, width: width, height: height)
                if !options.transparent { context.setFillColor(CGColor(gray: 1, alpha: 1)); context.fill(rect) }
                context.concatenate(page.getDrawingTransform(.cropBox, rect: rect, rotate: 0, preserveAspectRatio: true))
                context.drawPDFPage(page)
                guard let image = context.makeImage() else { throw GalleryError.invalid("The PDF page could not be drawn.") }
                try NativeExport.writePNG(image, to: file)
            }
            let raster = try workspace.acquire(file)
            var item = try await AssetImporter.metadata(raster.url, name: "\(url.deletingPathExtension().lastPathComponent) — page \(index+1)", hash: raster.hash)
            item.originalAsset = original.url.lastPathComponent; item.originalSHA256 = original.hash
            items.append(item)
            let sizes = try workspace.managedSizes(project: { var p = GalleryProject(); p.items = items; return p }())
            _ = try MediaBudget.total(sizes)
        }
        return items
    }
}
