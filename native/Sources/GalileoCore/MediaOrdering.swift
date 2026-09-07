import Foundation

/// A drop denotes a gap in the captured list, never an index after removing rows.
/// Validation is atomic: callers receive a complete order or an error, never a partial move.
public enum MediaOrdering {
    public static func moving(_ ids: [String], selected: Set<String>, toGap gap: Int) throws -> [String] {
        try validate(ids, selected: selected)
        guard (0...ids.count).contains(gap) else {
            throw GalleryError.invalid("The media drop position is no longer valid.")
        }
        let moved = ids.filter { selected.contains($0) }
        let remaining = ids.filter { !selected.contains($0) }
        let insertion = ids.prefix(gap).filter { !selected.contains($0) }.count
        return Array(remaining.prefix(insertion)) + moved + Array(remaining.dropFirst(insertion))
    }

    /// Keyboard moves shift each selected block by one; discontiguous blocks are not gathered.
    public static func stepping(_ ids: [String], selected: Set<String>, direction: Int) throws -> [String] {
        try validate(ids, selected: selected)
        guard direction == -1 || direction == 1 else {
            throw GalleryError.invalid("Move media one position earlier or later.")
        }
        var result = ids
        if direction < 0 {
            for i in result.indices.dropFirst() where selected.contains(result[i]) && !selected.contains(result[i - 1]) {
                result.swapAt(i, i - 1)
            }
        } else if result.count > 1 {
            for i in (0..<(result.count - 1)).reversed() where selected.contains(result[i]) && !selected.contains(result[i + 1]) {
                result.swapAt(i, i + 1)
            }
        }
        return result
    }

    private static func validate(_ ids: [String], selected: Set<String>) throws {
        guard Set(ids).count == ids.count, !ids.contains(where: \.isEmpty),
              !selected.isEmpty, selected.isSubset(of: Set(ids)) else {
            throw GalleryError.invalid("The selected media changed. Select it again before moving.")
        }
    }
}
