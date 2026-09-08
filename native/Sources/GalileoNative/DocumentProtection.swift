import Foundation
import GalileoCore

/// Local restoration provenance, never authored project/scene state.
/// Normal saved packages do not carry private source paths or bookmarks.
public struct UpgradeProtection: Codable, Equatable, Sendable {
    public static let maximumBytes = 65_536
    public static let draftFilename = ".galileo-upgrade-draft.json"
    public let originalURL: URL
    private let bookmark: Data
    private let volume: String
    private let inode: UInt64
    public let suggestedName: String

    public init(originalURL: URL) throws {
        let original=Self.canonical(originalURL)
        let identity=try Self.identity(original)
        self.originalURL=original;volume=identity.0;inode=identity.1
        bookmark=try original.bookmarkData(options:.minimalBookmark,includingResourceValuesForKeys:nil,relativeTo:nil)
        let stem=original.deletingPathExtension().lastPathComponent
        var name=stem+" upgraded",number=2
        while FileManager.default.fileExists(atPath:original.deletingLastPathComponent().appendingPathComponent(name+".galileo").path) {
            guard number < 10_000 else { throw GalleryError.invalid("Choose a new name for the upgraded copy.") }
            name=stem+" upgraded \(number)";number+=1
        }
        suggestedName=name
        try validate()
    }
    private static func canonical(_ url:URL)->URL {
        let plain=url.standardizedFileURL.resolvingSymlinksInPath()
        return ((try? URL(resolvingAliasFileAt:plain,options:[.withoutUI,.withoutMounting])) ?? plain).standardizedFileURL.resolvingSymlinksInPath()
    }
    private static func identity(_ url:URL)throws->(String,UInt64) {
        let values=try url.resourceValues(forKeys:[.volumeUUIDStringKey])
        let attributes=try FileManager.default.attributesOfItem(atPath:url.path)
        guard let volume=values.volumeUUIDString,let number=attributes[.systemFileNumber] as? NSNumber else {
            throw GalleryError.invalid("The original document's file identity could not be protected.")
        }
        return (volume,number.uint64Value)
    }
    public func protects(_ destination:URL)->Bool {
        let candidate=Self.canonical(destination)
        if candidate.path.caseInsensitiveCompare(originalURL.path) == .orderedSame { return true }
        var stale=false
        if let resolved=try? URL(resolvingBookmarkData:bookmark,options:[.withoutUI,.withoutMounting],relativeTo:nil,bookmarkDataIsStale:&stale),
           candidate.path.caseInsensitiveCompare(Self.canonical(resolved).path) == .orderedSame { return true }
        if let identity=try? Self.identity(candidate) { return identity.0 == volume && identity.1 == inode }
        return false
    }
    public func validateDestination(_ destination:URL)throws {
        guard !protects(destination) else {
            throw GalleryError.invalid("Save the upgraded copy to a new location. Your original remains protected.")
        }
    }
    private func validate()throws {
        guard originalURL.isFileURL,originalURL.path.utf8.count <= 8192,!bookmark.isEmpty,bookmark.count <= 48*1024,
              !volume.isEmpty,volume.utf8.count <= 256,inode > 0,!suggestedName.isEmpty,suggestedName.utf8.count <= 4096 else {
            throw GalleryError.invalid("The upgraded draft's original-file protection is invalid.")
        }
    }
    public func encoded()throws->Data {
        try validate();let data=try JSONEncoder().encode(self)
        guard data.count <= Self.maximumBytes else { throw GalleryError.invalid("Upgrade restoration metadata is too large.") }
        return data
    }
    public static func decode(_ data:Data)throws->Self {
        guard data.count <= maximumBytes else { throw GalleryError.invalid("Upgrade restoration metadata is too large.") }
        let result=try JSONDecoder().decode(Self.self,from:data);try result.validate();return result
    }
}

public struct NativePackageRead {
    public var project: GalleryProject
    public let workspace: Workspace
    public let loadedSchema: Int
    public let draftProtection: UpgradeProtection?
    public var needsUpgradeCopy: Bool { loadedSchema < GalleryProject.currentSchemaVersion }
}
