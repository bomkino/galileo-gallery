import Foundation

/// One budget for import adoption, recovery, save and reopening. Callers pass
/// unique asset names, including preserved PDF/legacy resources, not item count.
public enum MediaBudget {
    public static let maximumFileBytes: Int64 = 512 * 1024 * 1024
    public static let maximumProjectBytes: Int64 = 4 * 1024 * 1024 * 1024
    public static func total(_ sizes: [String: Int64], limit: Int64 = maximumProjectBytes) throws -> Int64 {
        var total: Int64 = 0
        for (name, size) in sizes {
            guard GalleryProject.safeAssetName(name), size >= 0, size <= maximumFileBytes else {
                throw GalleryError.invalid("A source exceeds the 512 MiB per-file limit or is invalid.")
            }
            guard size <= limit, total <= limit - size else {
                throw GalleryError.invalid("This collection exceeds the 4 GiB managed-media budget. No items from this batch were added.")
            }
            total += size
        }
        return total
    }
}

public enum Replacement {
    /// Preserve intent where it remains valid. A shorter clip gets an explicit
    /// adjustment notice; undo retains the complete prior source and settings.
    public static func preserving(_ old: MediaItem, with source: MediaItem) -> (MediaItem, String?) {
        var item = source
        item.id = old.id; item.caption = old.caption; item.fit = old.fit
        item.crop = old.crop; item.focal = old.focal; item.displayRatio = old.displayRatio
        item.included = old.included; item.opening = old.opening; item.closing = old.closing
        item.spotlight = old.spotlight; item.sourcePlays = old.sourcePlays
        item.sourceLoops = old.sourceLoops; item.sourceRate = old.sourceRate
        item.unavailable = nil
        guard source.kind != .image, let duration = source.duration else {
            return (item, old.kind == .image ? nil : "The replacement is a still image; its video trim does not apply.")
        }
        let oldEnd = old.trimEnd ?? old.duration ?? duration
        let minimumSpan = min(0.02, duration / 2)
        item.trimEnd = min(duration, oldEnd)
        item.trimStart = min(old.trimStart, max(0, item.trimEnd! - minimumSpan))
        let adjusted = abs(item.trimStart - old.trimStart) > 1e-8 || oldEnd > duration
        return (item, adjusted ? "The replacement is shorter. Its trim was shortened to the available video; rate, framing and spotlight were retained." : nil)
    }
}

public struct ExportRange: Equatable, Sendable {
    public let start: Int64
    public let end: Int64 // Exclusive; output starts at timestamp zero.
    public var count: Int64 { end - start }
    public init(start: Int64, end: Int64, total: Int64) throws {
        guard start >= 0, end > start, end <= total else {
            throw GalleryError.invalid("Choose an export range inside the document, with the end after the start.")
        }
        self.start = start; self.end = end
    }
}

public enum PDFPageSelection {
    /// One-based user input. Duplicates are removed; document order is retained.
    public static func parse(_ text: String, pageCount: Int) throws -> [Int] {
        guard pageCount > 0, pageCount <= 10000 else { throw GalleryError.invalid("The PDF page count is unsupported.") }
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            guard pageCount <= 512 else { throw GalleryError.invalid("Select at most 512 PDF pages.") }
            return Array(0..<pageCount)
        }
        guard text.count <= 4096 else { throw GalleryError.invalid("The page selection is too long.") }
        var pages = Set<Int>()
        for part in text.split(separator: ",", omittingEmptySubsequences: false) {
            let bounds = part.trimmingCharacters(in: .whitespaces).split(separator: "-", omittingEmptySubsequences: false)
            guard (1...2).contains(bounds.count), let first = Int(bounds[0].trimmingCharacters(in: .whitespaces)),
                  let last = Int(bounds.last!.trimmingCharacters(in: .whitespaces)), first > 0, last >= first, last <= pageCount,
                  last - first < 512 else { throw GalleryError.invalid("Use page numbers such as 1, 3–5 (type a hyphen), within this PDF.") }
            pages.formUnion(first...last)
            guard pages.count <= 512 else { throw GalleryError.invalid("Select at most 512 PDF pages.") }
        }
        return pages.sorted().map { $0 - 1 }
    }
}

extension SceneCard {
    /// Clip in the source plane before perspective, exactly as the compositor
    /// clips slices and wipes. Hidden parts are not selectable.
    public func visibleQuad(perspective: Double) -> [Point] {
        var crop = slice ?? Crop()
        if let reveal {
            let endX = min(crop.x + crop.width, verticalReveal ? 1 : reveal)
            let endY = min(crop.y + crop.height, verticalReveal ? reveal : 1)
            crop.width = max(0, endX - crop.x); crop.height = max(0, endY - crop.y)
        }
        guard crop.width > 1e-9, crop.height > 1e-9 else { return [] }
        return [Point(crop.x, crop.y), Point(crop.x + crop.width, crop.y),
                Point(crop.x + crop.width, crop.y + crop.height), Point(crop.x, crop.y + crop.height)].map { unit in
            let x = (unit.x - 0.5) * width, y = (unit.y - 0.5) * height
            let a = angle * .pi / 180, py = pitch * .pi / 180, yw = yaw * .pi / 180
            let xx = x * cos(yw), zz = -x * sin(yw)
            let yy = y * cos(py) - zz * sin(py), z2 = y * sin(py) + zz * cos(py)
            let f = perspective / max(perspective * 0.2, perspective - z2)
            return Point(center.x + (xx * cos(a) - yy * sin(a)) * f,
                         center.y + (xx * sin(a) + yy * cos(a)) * f)
        }
    }
    public func contains(_ point: Point, perspective: Double) -> Bool {
        let polygon = visibleQuad(perspective: perspective)
        guard polygon.count >= 3 else { return false }
        var inside = false
        var j = polygon.count - 1
        for i in polygon.indices {
            let a = polygon[i], b = polygon[j]
            if (a.y > point.y) != (b.y > point.y),
               point.x < (b.x-a.x) * (point.y-a.y) / (b.y-a.y) + a.x { inside.toggle() }
            j = i
        }
        return inside
    }
    public func intersects(width canvasWidth: Double, height canvasHeight: Double, margin: Double = 0) -> Bool {
        let q = visibleQuad(perspective: canvasWidth * 2)
        guard !q.isEmpty else { return false }
        return q.map(\.x).max()! >= -margin && q.map(\.x).min()! <= canvasWidth + margin &&
               q.map(\.y).max()! >= -margin && q.map(\.y).min()! <= canvasHeight + margin
    }
}
