import Foundation
import AppKit
import AVFoundation
import CryptoKit
import ImageIO
import UniformTypeIdentifiers
import GalileoCore

public final class Workspace: @unchecked Sendable {
    let integrity = IntegrityCache()
    public let root: URL
    public var assets: URL { root.appendingPathComponent("Assets",isDirectory:true) }
    public init() throws {
        root=FileManager.default.temporaryDirectory.appendingPathComponent("galileo-\(UUID().uuidString)",isDirectory:true)
        try FileManager.default.createDirectory(at:root.appendingPathComponent("Assets"),withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
    }
    deinit { try? FileManager.default.removeItem(at:root) }
    public func url(for item:MediaItem) throws -> URL {
        guard GalleryProject.safeAssetName(item.asset) else { throw GalleryError.invalid("The media path is invalid.") }
        let url=assets.appendingPathComponent(item.asset)
        let v=try url.resourceValues(forKeys:[.isRegularFileKey,.isSymbolicLinkKey])
        guard v.isRegularFile==true,v.isSymbolicLink != true else { throw GalleryError.missing("\(item.name) is unavailable. Relink this item.") }
        return url
    }
    public static func fingerprint(_ url:URL) throws -> String {
        let f=try FileHandle(forReadingFrom:url);defer { try? f.close() }
        var hash=SHA256()
        while let bytes=try f.read(upToCount:1024*1024),!bytes.isEmpty { try Task.checkCancellation();hash.update(data:bytes) }
        return hash.finalize().map { String(format:"%02x",$0) }.joined()
    }
    public func acquire(_ source:URL) throws -> (url:URL,hash:String) {
        guard try FileStamp(source).size <= MediaBudget.maximumFileBytes else { throw GalleryError.invalid("\(source.lastPathComponent) exceeds the 512 MiB per-file limit.") }
        let staged=root.appendingPathComponent("import-\(UUID().uuidString).\(source.pathExtension)")
        defer { try? FileManager.default.removeItem(at:staged) }
        try Self.copyOwned(source,to:staged)
        guard try FileStamp(staged).size <= MediaBudget.maximumFileBytes else { throw GalleryError.invalid("The source grew beyond the import budget.") }
        try Task.checkCancellation()
        let hash=try Self.fingerprint(staged)
        let ext=source.pathExtension.lowercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }
        let target=assets.appendingPathComponent(hash+"."+(ext.isEmpty ? "asset":String(ext.prefix(12))))
        if !FileManager.default.fileExists(atPath:target.path) { try FileManager.default.moveItem(at:staged,to:target) }
        return (target,hash)
    }
}
public enum AssetImporter {
    public static let extensions=["png","jpg","jpeg","heic","heif","tif","tiff","gif","webp","avif","pdf","mp4","mov","m4v"]
    public static func inspect(_ source:URL,workspace:Workspace) async throws -> MediaItem {
        let scoped=source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        let acquired=try workspace.acquire(source)
        return try await metadata(acquired.url,name:source.lastPathComponent,hash:acquired.hash)
    }
    public static func metadata(_ url:URL,name:String,hash:String) async throws -> MediaItem {
        try Task.checkCancellation()
        if let source=CGImageSourceCreateWithURL(url as CFURL,[kCGImageSourceShouldCache:false] as CFDictionary),CGImageSourceGetCount(source)>0 {
            let count=CGImageSourceGetCount(source)
            guard count<=3000,let props=CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [CFString:Any],
                  let width=props[kCGImagePropertyPixelWidth] as? Int,let height=props[kCGImagePropertyPixelHeight] as? Int,
                  width>0,height>0,Double(width)*Double(height)<=200_000_000 else { throw GalleryError.invalid("\(name) exceeds the image decode budget or has invalid dimensions.") }
            let orientation=(props[kCGImagePropertyOrientation] as? Int) ?? 1
            let swapped=[5,6,7,8].contains(orientation)
            let animated=count>1 && ImageSequenceTiming.delay(properties:props) != nil
            var duration:Double=0
            if animated {
                for index in 0..<count {
                    let properties=CGImageSourceCopyPropertiesAtIndex(source,index,nil) as? [CFString:Any] ?? [:]
                    duration+=ImageSequenceTiming.delay(properties:properties) ?? 0.1
                }
            }
            var item=MediaItem(name:name,asset:url.lastPathComponent,sha256:hash,kind:animated ? .animatedImage:.image,width:swapped ? height:width,height:swapped ? width:height,duration:animated ? duration:nil)
            item.hasAlpha=(props[kCGImagePropertyHasAlpha] as? Bool) ?? false
            item.colorSpace=(props[kCGImagePropertyProfileName] as? String) ?? "sRGB"
            return item
        }
        let asset=AVURLAsset(url:url)
        let tracks=try await asset.loadTracks(withMediaType:.video)
        guard let track=tracks.first else { throw GalleryError.unsupported("\(name) has no supported image or video track.") }
        let duration=try await asset.load(.duration)
        let size=try await track.load(.naturalSize),transform=try await track.load(.preferredTransform)
        let transformed=CGRect(origin:.zero,size:size).applying(transform)
        guard duration.seconds.isFinite,duration.seconds>0,duration.seconds<=86400 else { throw GalleryError.invalid("\(name) has an invalid video duration.") }
        var item=MediaItem(name:name,asset:url.lastPathComponent,sha256:hash,kind:.video,width:max(1,Int(abs(transformed.width))),height:max(1,Int(abs(transformed.height))),duration:duration.seconds)
        item.colorSpace="Video source profile"
        return item
    }
}
public enum NativeDocumentIO {
    public static func read(_ wrapper:FileWrapper) throws -> (GalleryProject,Workspace) {
        guard wrapper.isDirectory,let children=wrapper.fileWrappers,let bytes=children["project.json"]?.regularFileContents else { throw GalleryError.invalid("This is not a native Galileo document.") }
        let project=try GalleryProject.decode(bytes),workspace=try Workspace()
        guard let assets=children["Assets"],assets.isDirectory,let files=assets.fileWrappers,files.count<=2048 else { throw GalleryError.invalid("The document has no valid asset directory.") }
        var sizes=[String:Int64]()
        for (name,file) in files {
            guard GalleryProject.safeAssetName(name),file.isRegularFile,let data=file.regularFileContents,data.count<=512*1024*1024 else { throw GalleryError.invalid("An asset in the document is invalid.") }
            sizes[name]=Int64(data.count)
            _ = try MediaBudget.total(sizes)
            try data.write(to:workspace.assets.appendingPathComponent(name),options:.atomic)
        }
        for item in project.items where item.unavailable == nil {
            let url=try workspace.url(for:item)
            guard try workspace.verifiedFingerprint(url)==item.sha256 else { throw GalleryError.invalid("\(item.name) failed its integrity check. The original document has not been changed.") }
            if let original=item.originalAsset, let expected=item.originalSHA256 {
                guard try workspace.verifiedFingerprint(workspace.assets.appendingPathComponent(original))==expected else {throw GalleryError.invalid("The preserved PDF failed its integrity check.")}
            }
        }
        for (name,file) in children where name != "project.json" && name != "Assets" {
            guard ["legacy-manifest.json","legacy-assets.json"].contains(name),file.isRegularFile,
                  let data=file.regularFileContents,data.count<=8*1024*1024 else { throw GalleryError.unsupported("The document contains an unsupported resource: \(name).") }
            try data.write(to:workspace.root.appendingPathComponent(name),options:.atomic)
        }
        return (project,workspace)
    }
    public static func wrapper(project:GalleryProject,workspace:Workspace) throws -> FileWrapper {
        var children:[String:FileWrapper]=["project.json":FileWrapper(regularFileWithContents:try project.encoded())]
        let assets=FileWrapper(directoryWithFileWrappers:[:])
        let sizes = try workspace.managedSizes(project:project)
        _ = try MediaBudget.total(sizes)
        for item in project.items where item.unavailable == nil {
            guard try workspace.verifiedFingerprint(workspace.url(for:item)) == item.sha256 else { throw GalleryError.invalid("\(item.name) changed before saving.") }
        }
        for name in sizes.keys.sorted() {
            let file=try FileWrapper(url:workspace.assets.appendingPathComponent(name),options:[])
            file.preferredFilename=name;assets.addFileWrapper(file)
        }
        children["Assets"]=assets
        if project.legacyManifestFilename != nil {
            let url=workspace.root.appendingPathComponent("legacy-manifest.json")
            if FileManager.default.fileExists(atPath:url.path) { children["legacy-manifest.json"]=try FileWrapper(url:url,options:[]) }
            children["legacy-assets.json"]=FileWrapper(regularFileWithContents:try JSONEncoder().encode(legacyMapping(workspace)))
        }
        return FileWrapper(directoryWithFileWrappers:children)
    }
}
public enum LegacyImporter {
    public static func open(_ url:URL) async throws -> (GalleryProject,Workspace) {
        let workspace=try Workspace()
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard try FileStamp(url).size <= MediaBudget.maximumProjectBytes else { throw GalleryError.invalid("The legacy archive exceeds 4 GiB.") }
        let archived = workspace.root.appendingPathComponent("legacy-input.zip")
        try Workspace.copyOwned(url, to: archived)
        defer { try? FileManager.default.removeItem(at: archived) }
        let archive=try SafeZIP(data:Data(contentsOf:archived,options:.mappedIfSafe))
        let bytes=try archive.contents(of:"project/project.json")
        guard bytes.count<=8*1024*1024,let raw=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],
              raw["schemaVersion"] as? Int==2,let media=raw["media"] as? [[String:Any]],media.count<=512,
              let oldScene=raw["scene"] as? [String:Any],let oldID=oldScene["id"] as? String,
              let variant=SceneCatalog.variant(oldID) else { throw GalleryError.unsupported("This legacy project version cannot be converted safely. Its original file is unchanged.") }
        guard let version=oldScene["version"] as? Int,(oldID=="vitrine" ? [1,2]:[1]).contains(version) else { throw GalleryError.unsupported("This legacy scene version needs a newer importer.") }
        var project=GalleryProject();project.name=url.deletingPathExtension().lastPathComponent
        project.scene=SceneCatalog.defaults(for:variant.id)
        let canvas=raw["canvas"] as? [String:Any] ?? [:]
        project.canvas.width=canvas["canvasWidth"] as? Int ?? 1920;project.canvas.height=canvas["canvasHeight"] as? Int ?? 1080
        let parameters=oldScene["parameters"] as? [String:Any] ?? [:]
        if let scale=parameters["slideHeight"] as? Double { project.scene.scale=bounded(scale/100,0.15,1) }
        if let radius=parameters["radius"] as? Double { project.scene.radius=bounded(radius,0,96) }
        if let spacing=parameters["gap"] as? Double { project.scene.spacing=bounded(spacing,0,240) }
        if let tilt=parameters["tilt"] as? Double { project.scene.tilt=bounded(abs(tilt),0,25) }
        let look=(raw["look"] as? [String:Any])?["parameters"] as? [String:Any] ?? [:]
        project.canvas.color=RGBA(hex:look["ground"] as? String ?? "171817")
        project.canvas.secondaryColor=RGBA(hex:look["backgroundColor2"] as? String ?? "4B4943")
        project.canvas.background=BackgroundKind(rawValue:look["backgroundStyle"] as? String ?? "solid") ?? .solid
        let timing=raw["timeline"] as? [String:Any] ?? [:]
        project.timing.playMode=(timing["playKind"] as? String)=="loop" ? .loop : (timing["playKind"] as? String)=="repeat" ? .repeatCount:.once
        project.timing.repeats=timing["repeatCount"] as? Int ?? 3
        project.timing.reverse=timing["direction"] as? String == "reverse"
        project.scene.vertical=timing["axis"] as? String == "vertical"
        if let fixed=timing["fixedDurationMs"] as? Double,fixed>=1000,fixed<=600000 { project.timing.durationMilliseconds=Int64(fixed) }
        if project.canvas.background == .transparent { project.export.format = .proRes4444 }
        var mapping:[String:String]=[:],expected=Set(["project/project.json"])
        for entry in media {
            try Task.checkCancellation()
            guard let path=entry["archivePath"] as? String,path.hasPrefix("project/media/"),
                  let hash=entry["sha256"] as? String,let name=entry["name"] as? String,let id=entry["id"] as? String,
                  let frame=entry["frame"] as? [String:Any] else { throw GalleryError.invalid("The legacy media table is incomplete.") }
            let content=try archive.contents(of:path)
            let actual=SHA256.hash(data:content).map { String(format:"%02x",$0) }.joined()
            guard actual==hash,entry["bytes"] as? Int==content.count else { throw GalleryError.invalid("\(name) failed its legacy integrity check.") }
            let filename=hash+"."+URL(fileURLWithPath:path).pathExtension
            guard GalleryProject.safeAssetName(filename) else { throw GalleryError.invalid("The legacy asset path is invalid.") }
            let target=workspace.assets.appendingPathComponent(filename)
            if !FileManager.default.fileExists(atPath:target.path) { try content.write(to:target,options:.atomic) }
            var item=try await AssetImporter.metadata(target,name:name,hash:hash)
            item.id=id;item.caption=frame["caption"] as? String ?? "";item.included = true
            let eligible = !(frame["muted"] as? Bool ?? false)
            let marked = eligible && (frame["spotlight"] as? Bool ?? false) && (parameters["spotlightsEnabled"] as? Bool ?? true)
            if oldID == "vitrine" && version == 2 { item.opening = marked }
            else if marked {
                var cue = Spotlight()
                cue.holdMilliseconds = Int64(bounded(parameters["holdMs"] as? Double ?? 3000,250,60000))
                cue.scale = bounded((parameters["heroSize"] as? Double ?? 85)/100,0.25,0.95)
                item.spotlight = cue
            }
            item.fit=MediaFit(rawValue:frame["fit"] as? String ?? parameters["imageFit"] as? String ?? "contain") ?? .contain
            if let crop=frame["crop"] as? [String:Double] { item.crop.x=crop["x"] ?? 0;item.crop.y=crop["y"] ?? 0;item.crop.width=crop["width"] ?? 1;item.crop.height=crop["height"] ?? 1 }
            if let focal=frame["focal"] as? [String:Double] { item.focal=Point(focal["x"] ?? 0.5,focal["y"] ?? 0.5) }
            if frame["aspectMode"] as? String=="custom",let rw=frame["ratioW"] as? Double,let rh=frame["ratioH"] as? Double,rh>0 { item.displayRatio=rw/rh }
            item.sourcePlays=parameters["autoplayVideos"] as? Bool ?? true;item.sourceLoops=parameters["loopVideos"] as? Bool ?? true
            project.items.append(item);mapping[path]=filename;expected.insert(path)
        }
        let audio=raw["audio"] as? [String:Any] ?? [:]
        for entry in audio["sources"] as? [[String:Any]] ?? [] where entry["role"] as? String != "source-video" {
            guard let path=entry["archivePath"] as? String,path.hasPrefix("project/audio/"),let hash=entry["sha256"] as? String else { throw GalleryError.invalid("A preserved audio source is invalid.") }
            let content=try archive.contents(of:path)
            guard SHA256.hash(data:content).map({String(format:"%02x",$0)}).joined()==hash else { throw GalleryError.invalid("An audio source failed its integrity check.") }
            // Sound is deliberately outside Galileo. Validate the archive entry
            // but do not add standalone audio files to the native document.
            expected.insert(path)
        }
        guard Set(archive.entries.filter{!$0.isDirectory}.map(\.name))==expected else { throw GalleryError.invalid("The legacy project contains unexpected files.") }
        try bytes.write(to:workspace.root.appendingPathComponent("legacy-manifest.json"),options:.atomic)
        try JSONSerialization.data(withJSONObject:mapping,options:[.sortedKeys]).write(to:workspace.root.appendingPathComponent("legacy-assets.json"),options:.atomic)
        project.legacyManifestFilename="legacy-manifest.json"
        project.migrationNotes = [
            "Preserved: original visual media, order, captions, crop, focal points and source play/loop settings.",
            "Translated: marked spotlights become centre holds; Vitrine v2 opening remains an opening. Skip-beat media remains in the visual sequence but is not spotlighted.",
            "Review: scene choreography, legacy finale exchanges and directed tempo segments are not exact native reproductions.",
            "Sound is not imported. The original archive and its soundtrack remain unchanged."
        ]
        if (parameters["finaleEnabled"] as? Bool) == true {
            let eligibleIDs = media.compactMap { entry -> String? in
                guard let frame = entry["frame"] as? [String: Any], (frame["muted"] as? Bool) != true else { return nil }
                return entry["id"] as? String
            }
            if let id = eligibleIDs.last, let i = project.items.firstIndex(where: { $0.id == id }) { project.items[i].closing = true }
            project.migrationNotes.append("Translated: the eligible final source is a native closing hold; compare its timing with the original export.")
        }
        _ = try workspace.validateBudget(project: project)
        try project.validate();return(project,workspace)
    }
}

public enum ImageSequenceTiming {
    /// Multiple TIFF pages and HEIC auxiliary views are not animation.
    public static func delay(properties:[CFString:Any])->Double? {
        let formats:[(CFString,CFString,CFString)]=[
            (kCGImagePropertyGIFDictionary,kCGImagePropertyGIFUnclampedDelayTime,kCGImagePropertyGIFDelayTime),
            (kCGImagePropertyPNGDictionary,kCGImagePropertyAPNGUnclampedDelayTime,kCGImagePropertyAPNGDelayTime),
            (kCGImagePropertyWebPDictionary,kCGImagePropertyWebPUnclampedDelayTime,kCGImagePropertyWebPDelayTime),
            (kCGImagePropertyHEICSDictionary,kCGImagePropertyHEICSUnclampedDelayTime,kCGImagePropertyHEICSDelayTime)
        ]
        for (dictionary,unclamped,clamped) in formats {
            guard let values=properties[dictionary] as? [CFString:Any],
                  let value=(values[unclamped] as? Double) ?? (values[clamped] as? Double) else { continue }
            return value.isFinite && value>0 ? min(600,max(0.001,value)):0.1
        }
        return nil
    }
}
