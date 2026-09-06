import AppKit
import AVFoundation
import ImageIO
import GalileoCore
import GalileoNative

/// This journey uses the packaged decoder and the editor's actual document and
/// export queue. Independent movie decoding checks what reaches the saved file.
@MainActor enum MediaApplicationSmoke {
    static func run(directory:URL,documents:GalleryDocumentController) async throws -> [String:Any] {
        guard let path=ProcessInfo.processInfo.environment["GALILEO_MEDIA_FIXTURES"] else {
            throw GalleryError.invalid("Set GALILEO_MEDIA_FIXTURES to the checked-in synthetic fixture directory for the media journey.")
        }
        let fixtures=URL(fileURLWithPath:path,isDirectory:true),fm=FileManager.default
        guard let resources=Bundle.main.resourceURL,
              fm.isExecutableFile(atPath:resources.appendingPathComponent("MediaTools/ffmpeg").path),
              fm.isExecutableFile(atPath:resources.appendingPathComponent("MediaTools/ffprobe").path) else {
            throw GalleryError.invalid("The installed bundle does not contain its offline WebM decoder.")
        }
        let folder=directory.appendingPathComponent("media-journey",isDirectory:true)
        try fm.createDirectory(at:folder,withIntermediateDirectories:true)
        let document=GalleryDocument();documents.addDocument(document);document.makeWindowControllers();document.showWindows()
        guard let editor=document.editor,let window=document.windowForSheet else {throw GalleryError.invalid("The media document did not open.")}
        editor.importURLs([fixtures.appendingPathComponent("vp9-alpha.webm"),fixtures.appendingPathComponent("animated-alpha.webp")])
        try await ApplicationSmoke.wait{!editor.importing}
        guard editor.project.items.count==2,let video=editor.project.items.first(where:{$0.kind == .video}),
              let animation=editor.project.items.first(where:{$0.kind == .animatedImage}),video.hasAlpha,
              video.originalSHA256 == (try Workspace.fingerprint(fixtures.appendingPathComponent("vp9-alpha.webm"))) else {
            throw GalleryError.invalid(editor.issue ?? "The packaged application did not import transparent WebM and animated WebP.")
        }
        editor.commit("Author the media spotlight") {p in
            p.name="WebM and WebP study";p.canvas.width=320;p.canvas.height=180
            p.scene=SceneCatalog.defaults(for:"cms-slideshow");p.scene.shadow=0;p.scene.radius=0
            p.canvas.background = .drift;p.canvas.drift=DriftBackgroundCatalog.studies.first{$0.id=="verdigris-fresco-study"}!.settings
            p.canvas.drift?.animated=false;p.canvas.drift?.grain=0
            p.timing.durationMilliseconds=2400;p.timing.playMode = .once;p.export.format = .h264;p.export.frameRate=FrameRate(24)
            for i in p.items.indices {
                p.items[i].sourcePlays=true;p.items[i].sourceLoops=true;p.items[i].sourceRate=1
                if p.items[i].id==video.id {var hold=Spotlight();hold.holdMilliseconds=8000;hold.scale=0.8;p.items[i].spotlight=hold}
            }
        }
        let expected=editor.project,url=folder.appendingPathComponent("Media study.galileo",isDirectory:true)
        try await withCheckedThrowingContinuation { (continuation:CheckedContinuation<Void,Error>) in
            document.save(to:url,ofType:GalleryDocument.typeName,for:.saveAsOperation) {error in
                if let error {continuation.resume(throwing:error)}else{continuation.resume()}
            }
        }
        guard !document.isDocumentEdited else {throw GalleryError.invalid("Saving the media project left unsaved changes.")}
        document.close()
        let reopened:NSDocument=try await withCheckedThrowingContinuation {continuation in
            documents.openDocument(withContentsOf:url,display:true) {doc,_,error in
                if let error {continuation.resume(throwing:error)}else if let doc{continuation.resume(returning:doc)}
                else{continuation.resume(throwing:GalleryError.invalid("The media project did not reopen."))}
            }
        }
        guard let restored=reopened as? GalleryDocument,let session=restored.editor,let playback=restored.playback,
              let restoredWindow=restored.windowForSheet,session.project==expected,
              let cue=session.snapshot.plan.spotlights.first(where:{$0.itemID==video.id}) else {
            throw GalleryError.invalid("Reopening changed the media or spotlight settings.")
        }
        session.selection=[video.id];playback.seek(cue.holdStartFrame+3)
        try await ApplicationSmoke.wait{ApplicationSmoke.findPreview(restoredWindow.contentView)?.committedFrame==playback.frame}
        try ApplicationSmoke.capture(restoredWindow,to:folder.appendingPathComponent("webm-centre-hold.png"))
        // On-demand audition is reversible and must not write its temporary playhead.
        session.previewMediaID=video.id
        try await ApplicationSmoke.wait{restoredWindow.attachedSheet != nil}
        try await Task.sleep(nanoseconds:700_000_000)
        if let sheet=restoredWindow.attachedSheet {try ApplicationSmoke.capture(sheet,to:folder.appendingPathComponent("source-clip-preview.png"))}
        session.previewMediaID=nil
        try await ApplicationSmoke.wait{restoredWindow.attachedSheet==nil}
        guard session.project==expected,!restored.isDocumentEdited else {throw GalleryError.invalid("Cancelling source preview modified the saved project.")}
        let snapshot=session.snapshot,output=folder.appendingPathComponent("eight-second-webm-hold.mp4")
        let range=try ExportRange(start:cue.holdStartFrame,end:cue.holdEndFrame,total:snapshot.plan.schedule.totalFrames)
        let exports=ExportCenter.shared
        guard exports.start(snapshot:snapshot,destination:try ExportDestination(url:output),stillFrame:range.start,range:range) else {
            throw GalleryError.invalid(exports.error ?? "The media export did not start.")
        }
        // A queued export owns the document snapshot and media after its window closes.
        restored.close()
        try await ApplicationSmoke.wait{!exports.busy}
        guard let receipt=exports.result,receipt.documentID==expected.id,receipt.scheduledFrames==192,receipt.decodedFrames==192 else {
            throw GalleryError.invalid(exports.error ?? "The media range export has the wrong document or frame count.")
        }
        try JSONEncoder().encode(receipt).write(to:folder.appendingPathComponent("export-receipt.json"))
        let comparison=try await Task.detached { () async throws -> [String:Double] in
            let asset=AVURLAsset(url:output),generator=AVAssetImageGenerator(asset:asset)
            generator.appliesPreferredTrackTransform=true;generator.requestedTimeToleranceBefore = .zero;generator.requestedTimeToleranceAfter = .zero
            guard try await asset.loadTracks(withMediaType:.audio).isEmpty else {throw GalleryError.invalid("A silent export unexpectedly contains an audio track.")}
            let renderer=NativeRenderer();var decoded:[[UInt8]]=[];var maxDifference=0.0
            for (index,offset) in [Int64(6),30,78,102].enumerated() {
                let time=CMTime(value:offset,timescale:24)
                let image=try await generator.image(at:time).image
                let preview=try renderer.image(snapshot:snapshot,frame:range.start+offset)
                try NativeExport.writePNG(image,to:folder.appendingPathComponent("decoded-\(index).png"))
                try NativeExport.writePNG(preview,to:folder.appendingPathComponent("preview-\(index).png"))
                let a=try pixels(image),b=try pixels(preview)
                guard a.count==b.count else{throw GalleryError.invalid("Preview and movie picture dimensions disagree.")}
                let error=zip(a,b).reduce(0.0){$0+Double(abs(Int($1.0)-Int($1.1)))}/Double(a.count)/255
                guard error<0.04 else{throw GalleryError.invalid("The encoded WebM hold differs materially from its preview (\(error)).")}
                maxDifference=max(maxDifference,error);decoded.append(a)
            }
            let pixel=(90*320+160)*4
            func centreDistance(_ a:Int,_ b:Int)->Double {
                (0..<3).reduce(0.0){$0+Double(abs(Int(decoded[a][pixel+$1])-Int(decoded[b][pixel+$1])))}/(255*3)
            }
            guard centreDistance(0,2)<0.04,centreDistance(1,3)<0.04,centreDistance(0,1)>0.2 else {
                throw GalleryError.invalid("The source video did not continue looping through the centre hold.")
            }
            guard let webp=snapshot.plan.project.items.first(where:{$0.id==animation.id}) else {throw GalleryError.invalid("The reopened animation is missing.")}
            let a=try renderer.sourcePreview(item:webp,seconds:0.1,workspace:snapshot.workspace)
            let b=try renderer.sourcePreview(item:webp,seconds:0.8,workspace:snapshot.workspace)
            guard try pixels(a) != pixels(b) else {throw GalleryError.invalid("Reopening froze the animated WebP.")}
            return ["maximumPreviewMovieMeanError":maxDifference,"holdDurationSeconds":receipt.duration]
        }.value
        _=window
        return ["packagedWebMDecoder":true,"webmAndAnimatedWebPReopened":true,"originalWebMPreserved":true,
                "sourcePreviewCancelPreservesDocument":true,"transparentWebMHeldAndLooped":true,"exportSurvivesDocumentClose":true,
                "mediaMovieDecodedFrames":192,"mediaExportSilent":true,"mediaComparison":comparison]
    }
    nonisolated private static func pixels(_ image:CGImage)throws->[UInt8] {
        var bytes=[UInt8](repeating:0,count:image.width*image.height*4)
        try bytes.withUnsafeMutableBytes { raw in
            guard let context=CGContext(data:raw.baseAddress,width:image.width,height:image.height,bitsPerComponent:8,bytesPerRow:image.width*4,
                  space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue|CGBitmapInfo.byteOrder32Big.rawValue) else {
                throw GalleryError.invalid("The independent movie comparison could not prepare pixels.")
            }
            context.draw(image,in:CGRect(x:0,y:0,width:image.width,height:image.height))
        }
        return bytes
    }
}
