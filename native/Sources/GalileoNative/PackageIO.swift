import Foundation
import GalileoCore

/// URL-based package I/O keeps original media off the SwiftUI state and avoids
/// loading an entire multi-gigabyte document into a FileWrapper/Data graph.
extension NativeDocumentIO {
    public static func readPackage(_ url:URL)throws->(GalleryProject,Workspace) {
        let fm=FileManager.default,scoped=url.startAccessingSecurityScopedResource()
        defer { if scoped {url.stopAccessingSecurityScopedResource()} }
        let root=try url.resourceValues(forKeys:[.isDirectoryKey,.isSymbolicLinkKey])
        guard root.isDirectory==true,root.isSymbolicLink != true else { throw GalleryError.invalid("This is not a native Galileo document package.") }
        let manifest=url.appendingPathComponent("project.json")
        let manifestInfo=try manifest.resourceValues(forKeys:[.isRegularFileKey,.isSymbolicLinkKey,.fileSizeKey])
        guard manifestInfo.isRegularFile==true,manifestInfo.isSymbolicLink != true,(manifestInfo.fileSize ?? Int.max)<=8*1024*1024 else { throw GalleryError.invalid("The document manifest is invalid.") }
        let project=try GalleryProject.decode(Data(contentsOf:manifest)),workspace=try Workspace()
        let assets=url.appendingPathComponent("Assets",isDirectory:true)
        let directory=try assets.resourceValues(forKeys:[.isDirectoryKey,.isSymbolicLinkKey])
        guard directory.isDirectory==true,directory.isSymbolicLink != true else { throw GalleryError.invalid("The asset directory is invalid.") }
        let files=try fm.contentsOfDirectory(at:assets,includingPropertiesForKeys:[.isRegularFileKey,.isSymbolicLinkKey,.fileSizeKey])
        guard files.count<=2048 else { throw GalleryError.invalid("The document has too many resources.") }
        var total:Int64=0
        for file in files where file.lastPathComponent != ".DS_Store" {
            try Task.checkCancellation()
            let meta=try file.resourceValues(forKeys:[.isRegularFileKey,.isSymbolicLinkKey,.fileSizeKey])
            guard GalleryProject.safeAssetName(file.lastPathComponent),meta.isRegularFile==true,meta.isSymbolicLink != true,let bytes=meta.fileSize,bytes<=512*1024*1024 else { throw GalleryError.invalid("A document resource is invalid.") }
            total+=Int64(bytes);guard total<=4*1024*1024*1024 else { throw GalleryError.invalid("This document exceeds the 4 GB managed-media budget.") }
            try fm.copyItem(at:file,to:workspace.assets.appendingPathComponent(file.lastPathComponent))
        }
        for item in project.items {
            guard try Workspace.fingerprint(workspace.url(for:item))==item.sha256 else { throw GalleryError.invalid("\(item.name) failed its integrity check. The original document is unchanged.") }
        }
        let allowed=Set(["project.json","Assets","legacy-manifest.json","legacy-assets.json",".DS_Store"])
        for file in try fm.contentsOfDirectory(at:url,includingPropertiesForKeys:nil) {
            guard allowed.contains(file.lastPathComponent) else { throw GalleryError.unsupported("This document contains an unsupported resource: \(file.lastPathComponent).") }
            if file.lastPathComponent.hasPrefix("legacy-") {
                let meta=try file.resourceValues(forKeys:[.isRegularFileKey,.isSymbolicLinkKey,.fileSizeKey])
                guard meta.isRegularFile==true,meta.isSymbolicLink != true,(meta.fileSize ?? Int.max)<=8*1024*1024 else { throw GalleryError.invalid("The preserved legacy metadata is invalid.") }
                try fm.copyItem(at:file,to:workspace.root.appendingPathComponent(file.lastPathComponent))
            }
        }
        if project.legacyManifestFilename != nil { try validatePreservedLegacy(workspace) }
        return(project,workspace)
    }
    private static func validatePreservedLegacy(_ workspace:Workspace)throws {
        let data=try Data(contentsOf:workspace.root.appendingPathComponent("legacy-assets.json"))
        guard let mapping=try JSONSerialization.jsonObject(with:data) as? [String:String] else { throw GalleryError.invalid("The preserved legacy asset map is invalid.") }
        for name in mapping.values {
            guard GalleryProject.safeAssetName(name) else { throw GalleryError.invalid("The preserved legacy asset path is invalid.") }
            let meta=try workspace.assets.appendingPathComponent(name).resourceValues(forKeys:[.isRegularFileKey,.isSymbolicLinkKey])
            guard meta.isRegularFile==true,meta.isSymbolicLink != true else { throw GalleryError.missing("A preserved legacy source is missing.") }
        }
    }
    public static func writePackage(project:GalleryProject,workspace:Workspace,to destination:URL)throws {
        try project.validate()
        let fm=FileManager.default,parent=destination.deletingLastPathComponent()
        let staging=parent.appendingPathComponent(".galileo-save-\(UUID().uuidString)",isDirectory:true)
        defer { try? fm.removeItem(at:staging) }
        var names=Set(project.items.map(\.asset))
        if project.legacyManifestFilename != nil {
            try validatePreservedLegacy(workspace)
            let map=try JSONSerialization.jsonObject(with:Data(contentsOf:workspace.root.appendingPathComponent("legacy-assets.json"))) as? [String:String] ?? [:]
            names.formUnion(map.values)
        }
        var total:Int64=0
        for name in names {
            guard GalleryProject.safeAssetName(name) else { throw GalleryError.invalid("A managed media path is invalid.") }
            let meta=try workspace.assets.appendingPathComponent(name).resourceValues(forKeys:[.isRegularFileKey,.isSymbolicLinkKey,.fileSizeKey])
            guard meta.isRegularFile==true,meta.isSymbolicLink != true,let size=meta.fileSize,size<=512*1024*1024 else { throw GalleryError.missing("A managed media file is unavailable.") }
            total+=Int64(size)
        }
        guard total<=4*1024*1024*1024 else { throw GalleryError.invalid("This document exceeds the 4 GB managed-media budget.") }
        if let available=try? parent.resourceValues(forKeys:[.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage,available<total+16*1024*1024 { throw GalleryError.invalid("There is not enough free space to save this document safely.") }
        try fm.createDirectory(at:staging.appendingPathComponent("Assets"),withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        for name in names { try fm.copyItem(at:workspace.assets.appendingPathComponent(name),to:staging.appendingPathComponent("Assets").appendingPathComponent(name)) }
        try project.encoded().write(to:staging.appendingPathComponent("project.json"),options:.atomic)
        if project.legacyManifestFilename != nil { for name in ["legacy-manifest.json","legacy-assets.json"] { try fm.copyItem(at:workspace.root.appendingPathComponent(name),to:staging.appendingPathComponent(name)) } }
        for item in project.items { guard try Workspace.fingerprint(staging.appendingPathComponent("Assets").appendingPathComponent(item.asset))==item.sha256 else { throw GalleryError.invalid("A saved media file failed its integrity check.") } }
        if fm.fileExists(atPath:destination.path) {
            let meta=try destination.resourceValues(forKeys:[.isDirectoryKey,.isSymbolicLinkKey])
            guard meta.isDirectory==true,meta.isSymbolicLink != true else { throw GalleryError.invalid("A native document cannot replace this destination.") }
            _=try fm.replaceItemAt(destination,withItemAt:staging)
        } else { try fm.moveItem(at:staging,to:destination) }
    }
}
