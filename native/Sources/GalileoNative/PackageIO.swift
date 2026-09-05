import Foundation
import GalileoCore

extension NativeDocumentIO {
    static func legacyMapping(_ workspace: Workspace) throws -> [String: String] {
        let url = workspace.root.appendingPathComponent("legacy-assets.json")
        guard FileManager.default.fileExists(atPath: url.path) else { return [:] }
        guard let map = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: String] else {
            throw GalleryError.invalid("The preserved legacy asset map is invalid.")
        }
        let kept = map.filter { !$0.key.hasPrefix("project/audio/") }
        guard kept.values.allSatisfy(GalleryProject.safeAssetName) else { throw GalleryError.invalid("A preserved legacy asset path is invalid.") }
        return kept
    }
    public static func readPackage(_ url: URL, allowRecovery: Bool = false) throws -> (GalleryProject, Workspace) {
        let fm = FileManager.default, scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let root = try url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
        guard root.isDirectory == true, root.isSymbolicLink != true else { throw GalleryError.invalid("This is not a native Galileo document package.") }
        let manifest = url.appendingPathComponent("project.json")
        let size = try FileStamp(manifest).size
        guard size <= 8*1024*1024 else { throw GalleryError.invalid("The document manifest is too large.") }
        var project = try GalleryProject.decode(Data(contentsOf: manifest))
        let workspace = try Workspace()
        let allowed = Set(["project.json", "Assets", "legacy-manifest.json", "legacy-assets.json", ".DS_Store"])
        for file in try fm.contentsOfDirectory(at: url, includingPropertiesForKeys: nil) {
            guard allowed.contains(file.lastPathComponent) else { throw GalleryError.unsupported("Unsupported document resource: \(file.lastPathComponent).") }
            if file.lastPathComponent.hasPrefix("legacy-") {
                guard try FileStamp(file).size <= 8*1024*1024 else { throw GalleryError.invalid("The preserved metadata is too large.") }
                try Workspace.copyOwned(file, to: workspace.root.appendingPathComponent(file.lastPathComponent))
            }
        }
        let mapping = try legacyMapping(workspace)
        let assets = url.appendingPathComponent("Assets", isDirectory: true)
        var available: [String: URL] = [:], sizes: [String: Int64] = [:]
        if fm.fileExists(atPath: assets.path) {
            let directory = try assets.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            guard directory.isDirectory == true, directory.isSymbolicLink != true else { throw GalleryError.invalid("The asset directory is invalid.") }
            let files = try fm.contentsOfDirectory(at: assets, includingPropertiesForKeys: nil)
            guard files.count <= 2048 else { throw GalleryError.invalid("The document has too many resources.") }
            for file in files where file.lastPathComponent != ".DS_Store" {
                let name = file.lastPathComponent
                guard GalleryProject.safeAssetName(name) else { throw GalleryError.invalid("An asset path is invalid.") }
                sizes[name] = try FileStamp(file).size; available[name] = file
            }
        }
        _ = try MediaBudget.total(sizes)
        var needed = Set(project.items.map(\.asset))
        needed.formUnion(project.items.compactMap(\.originalAsset)); needed.formUnion(mapping.values)
        for name in needed {
            try Task.checkCancellation()
            if let source = available[name] { try Workspace.copyOwned(source, to: workspace.assets.appendingPathComponent(name)) }
        }
        var failures: [String] = []
        for index in project.items.indices {
            let item = project.items[index]
            var valid = (try? workspace.verifiedFingerprint(workspace.url(for: item))) == item.sha256
            if let original = item.originalAsset {
                valid = valid && (try? workspace.verifiedFingerprint(workspace.assets.appendingPathComponent(original))) == item.originalSHA256
            }
            if !valid {
                if item.unavailable == nil { failures.append(item.name) }
                project.items[index].unavailable = "Missing or damaged source"
                // Do not adopt corrupt bytes into the recovery copy.
                try? fm.removeItem(at: workspace.assets.appendingPathComponent(item.asset))
            }
        }
        let missingLegacy = mapping.filter { !fm.fileExists(atPath: workspace.assets.appendingPathComponent($0.value).path) }
        if !missingLegacy.isEmpty { failures.append("Preserved legacy media") }
        if !failures.isEmpty, !allowRecovery { throw RecoverableMediaError(names: failures) }
        if allowRecovery {
            project.name += " — Recovery"
            project.migrationNotes.append("Recovery copy: locate, replace or exclude the missing media before export. The original document was not changed.")
        }
        if project.legacyManifestFilename != nil {
            let kept = mapping.filter { fm.fileExists(atPath: workspace.assets.appendingPathComponent($0.value).path) }
            try JSONSerialization.data(withJSONObject: kept, options: [.sortedKeys]).write(to: workspace.root.appendingPathComponent("legacy-assets.json"), options: .atomic)
        }
        return (project, workspace)
    }
    public static func writePackage(project: GalleryProject, workspace: Workspace, to destination: URL) throws {
        try project.validate()
        let fm = FileManager.default, parent = destination.deletingLastPathComponent()
        let sizes = try workspace.managedSizes(project: project)
        let total = try MediaBudget.total(sizes)
        // Conservative space check applies to the copy fallback too.
        if let available = try? parent.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage,
           available < total + 16*1024*1024 { throw GalleryError.invalid("There is not enough free space to save this document safely.") }
        let staging = parent.appendingPathComponent(".galileo-save-\(UUID().uuidString)", isDirectory: true)
        defer { try? fm.removeItem(at: staging) }
        try fm.createDirectory(at: staging.appendingPathComponent("Assets"), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        var expected: [String: String] = [:]
        for item in project.items where item.unavailable == nil {
            expected[item.asset] = item.sha256
            if let original = item.originalAsset { expected[original] = item.originalSHA256 }
        }
        for name in sizes.keys {
            try Task.checkCancellation()
            let source = workspace.assets.appendingPathComponent(name)
            let before = try FileStamp(source), hash = try workspace.verifiedFingerprint(source)
            if let wanted = expected[name], wanted != hash { throw GalleryError.invalid("A source changed. The saved document was not replaced.") }
            let target = staging.appendingPathComponent("Assets").appendingPathComponent(name)
            let cloned = try Workspace.copyOwned(source, to: target)
            guard try FileStamp(source) == before else { throw GalleryError.invalid("A source changed during saving.") }
            // An APFS clone is an independent snapshot of the checked file. A
            // regular copy is checked independently before it can be published.
            if !cloned, try Workspace.fingerprint(target) != hash { throw GalleryError.invalid("A copied source failed its integrity check.") }
        }
        try project.encoded().write(to: staging.appendingPathComponent("project.json"), options: .atomic)
        if project.legacyManifestFilename != nil {
            try Workspace.copyOwned(workspace.root.appendingPathComponent("legacy-manifest.json"), to: staging.appendingPathComponent("legacy-manifest.json"))
            try JSONSerialization.data(withJSONObject: legacyMapping(workspace), options: [.sortedKeys]).write(to: staging.appendingPathComponent("legacy-assets.json"), options: .atomic)
        }
        if fm.fileExists(atPath: destination.path) {
            let meta = try destination.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            guard meta.isDirectory == true, meta.isSymbolicLink != true else { throw GalleryError.invalid("A native document cannot replace this destination.") }
            _ = try fm.replaceItemAt(destination, withItemAt: staging)
        } else { try fm.moveItem(at: staging, to: destination) }
    }
}
