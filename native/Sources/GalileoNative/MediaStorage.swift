import Foundation
import Darwin
import GalileoCore

public struct FileStamp: Equatable, Sendable {
    let identity: String
    public let size: Int64
    public init(_ url: URL) throws {
        var value = stat()
        let result = url.path.withCString { lstat($0, &value) }
        guard result == 0, value.st_mode & S_IFMT == S_IFREG else {
            throw GalleryError.missing("\(url.lastPathComponent) is not an available regular file.")
        }
        size = Int64(value.st_size)
        identity = "\(value.st_dev):\(value.st_ino):\(value.st_size):\(value.st_mtimespec.tv_sec):\(value.st_mtimespec.tv_nsec):\(value.st_ctimespec.tv_sec):\(value.st_ctimespec.tv_nsec)"
    }
}

/// Cached hashes are valid only for an identical, freshly-read filesystem stamp.
/// The cache is workspace-owned; external files never inherit this trust.
final class IntegrityCache: @unchecked Sendable {
    private let lock = NSLock()
    private var entries: [String: (FileStamp, String)] = [:]
    func fingerprint(_ url: URL) throws -> String {
        let before = try FileStamp(url)
        lock.lock(); let cached = entries[url.path]; lock.unlock()
        if let cached, cached.0 == before { return cached.1 }
        let hash = try Workspace.fingerprint(url)
        guard try FileStamp(url) == before else { throw GalleryError.invalid("The source changed while it was being checked.") }
        lock.lock(); entries[url.path] = (before, hash); lock.unlock()
        return hash
    }
}

extension Workspace {
    public func verifiedFingerprint(_ url: URL) throws -> String { try integrity.fingerprint(url) }
    /// APFS clones are independent copy-on-write files, not hard links. A copy
    /// fallback remains available for external/non-APFS volumes.
    @discardableResult public static func copyOwned(_ source: URL, to destination: URL) throws -> Bool {
        let result = source.path.withCString { a in destination.path.withCString { b in clonefile(a, b, 0) } }
        if result == 0 { return true }
        try FileManager.default.copyItem(at: source, to: destination)
        return false
    }
    public func managedSizes(project: GalleryProject, additions: Workspace? = nil) throws -> [String: Int64] {
        var names = Set(project.items.filter { $0.unavailable == nil }.map(\.asset))
        names.formUnion(project.items.filter { $0.unavailable == nil }.compactMap(\.originalAsset))
        if project.legacyManifestFilename != nil {
            let mapping = try NativeDocumentIO.legacyMapping(self)
            names.formUnion(mapping.values)
        }
        var result: [String: Int64] = [:]
        for name in names {
            guard GalleryProject.safeAssetName(name) else { throw GalleryError.invalid("The managed asset path is invalid.") }
            let own = assets.appendingPathComponent(name)
            let url = FileManager.default.fileExists(atPath: own.path) ? own : (additions?.assets.appendingPathComponent(name) ?? own)
            result[name] = try FileStamp(url).size
        }
        return result
    }
    @discardableResult public func validateBudget(project: GalleryProject, additions: Workspace? = nil, limit: Int64 = MediaBudget.maximumProjectBytes) throws -> Int64 {
        try MediaBudget.total(managedSizes(project: project, additions: additions), limit: limit)
    }
}

public struct RecoverableMediaError: LocalizedError, CustomNSError {
    public static var errorDomain: String { "dog.pitch.galileo.recoverable-media" }
    public var errorCode: Int { 1 }
    public var errorUserInfo: [String: Any] { [NSLocalizedDescriptionKey: errorDescription ?? "Missing media"] }
    public let names: [String]
    public var errorDescription: String? { "Some media is missing or damaged. Open a recovery copy to locate or replace it. The original is unchanged." }
}
