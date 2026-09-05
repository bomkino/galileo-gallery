import AppKit
import Foundation
import GalileoCore
import GalileoNative

@MainActor enum ApplicationSmoke {
    static func run(directory:URL,documents:GalleryDocumentController) async throws {
        let fm=FileManager.default
        try fm.createDirectory(at:directory,withIntermediateDirectories:true)
        guard try fm.contentsOfDirectory(atPath:directory.path).isEmpty else {throw GalleryError.invalid("Smoke evidence directory must be empty.")}
        let (fixture,sourceWorkspace)=try VerificationFixtures.workspace()
        let document=GalleryDocument();documents.addDocument(document);document.makeWindowControllers();document.showWindows()
        guard let editor=document.editor,let playback=document.playback,let window=document.windowForSheet else{throw GalleryError.invalid("The native document window did not open.")}
        editor.importURLs(try fixture.items.map{try sourceWorkspace.url(for:$0)})
        try await wait { !editor.importing }
        guard editor.project.items.count==3 else{throw GalleryError.invalid(editor.issue ?? "The actual editor import failed.")}
        let imported=editor.project
        editor.undoManager?.undo();guard editor.project.items.isEmpty else{throw GalleryError.invalid("Native import undo failed.")}
        editor.undoManager?.redo();guard editor.project==imported else{throw GalleryError.invalid("Native import redo failed.")}
        editor.commit("Set study composition") {p in
            p.name="Studio study";p.canvas.width=1920;p.canvas.height=1080;p.canvas.color=RGBA(hex:"ECE9E1")
            p.scene=SceneCatalog.defaults(for:"the-stack");p.scene.shadow=0.25;p.timing.durationMilliseconds=3000
        }
        let expected=editor.project
        guard document.isDocumentEdited else { throw GalleryError.invalid("A real document edit was not registered for save/recovery.") }
        let projectURL=directory.appendingPathComponent("Studio study.galileo",isDirectory:true)
        try await withCheckedThrowingContinuation { (continuation:CheckedContinuation<Void,Error>) in
            document.save(to:projectURL,ofType:GalleryDocument.typeName,for:.saveAsOperation) { error in
                if let error{continuation.resume(throwing:error)}else{continuation.resume(returning:())}
            }
        }
        guard !document.isDocumentEdited else{throw GalleryError.invalid("The document remains dirty after a completed save.")}
        document.close()
        let reopened:NSDocument=try await withCheckedThrowingContinuation { continuation in
            documents.openDocument(withContentsOf:projectURL,display:true) { doc,_,error in
                if let error{continuation.resume(throwing:error)}else if let doc{continuation.resume(returning:doc)}else{continuation.resume(throwing:GalleryError.invalid("No reopened document."))}
            }
        }
        guard let reopened=reopened as? GalleryDocument,let restored=reopened.editor,let transport=reopened.playback,let restoredWindow=reopened.windowForSheet else{throw GalleryError.invalid("The saved native document did not reopen.")}
        guard restored.project==expected else{throw GalleryError.invalid("Document save/reopen changed authored state.")}
        restored.selection=[]
        transport.seek(restored.snapshot.plan.schedule.cycleFrames/2)
        try await wait { findPreview(restoredWindow.contentView)?.committedFrame==transport.frame }
        for mode in [NSAppearance.Name.aqua,.darkAqua] {
            NSApp.appearance=NSAppearance(named:mode)
            try await Task.sleep(nanoseconds:200_000_000)
            try capture(restoredWindow,to:directory.appendingPathComponent(mode == .aqua ? "studio-light.png":"studio-dark.png"))
        }
        let original=restored.project.scene
        restored.commit("Change scene"){$0.scene=SceneCatalog.defaults(for:"orbit-ring")}
        restored.undoManager?.undo();guard restored.project.scene==original else{throw GalleryError.invalid("Scene undo failed.")}
        restored.undoManager?.redo();guard restored.project.scene.variantID=="orbit-ring" else{throw GalleryError.invalid("Scene redo failed.")}
        let samples=directory.appendingPathComponent("scenes",isDirectory:true);try fm.createDirectory(at:samples,withIntermediateDirectories:true)
        let workspace=restored.workspace,base=restored.project
        let visualEvidence=try await Task.detached(priority:.userInitiated) { ()throws->[String:Any] in
            let renderer=NativeRenderer();var frames=0
            for variant in SceneCatalog.variants {
                var p=base;p.canvas.width=640;p.canvas.height=360;p.scene=SceneCatalog.defaults(for:variant.id);p.scene.shadow=0.15
                let snapshot=try RenderSnapshot(project:p,workspace:workspace)
                for (index,portion) in [0.05,0.27,0.53,0.81,0.98].enumerated() {
                    let frame=Int64(Double(snapshot.plan.schedule.cycleFrames)*portion)
                    let image=try renderer.image(snapshot:snapshot,frame:frame)
                    try NativeExport.writePNG(image,to:samples.appendingPathComponent("\(variant.id)-\(index).png"));frames+=1
                }
            }
            return ["renderedSceneFrames":frames,"renderer":renderer.backend]
        }.value
        var movieProject=restored.project;movieProject.canvas.width=640;movieProject.canvas.height=360;movieProject.timing.durationMilliseconds=1001;movieProject.timing.playMode = .repeatCount;movieProject.timing.repeats=2
        movieProject.export.format = .h264;movieProject.export.frameRate=FrameRate(30)
        let snapshot=try RenderSnapshot(project:movieProject,workspace:workspace),movieURL=directory.appendingPathComponent("native-export.mp4")
        let receipt=try await Task.detached {try await NativeExport.run(snapshot:snapshot,destination:ExportDestination(url:movieURL),stillFrame:0){_,_ in}}.value
        guard receipt.scheduledFrames==62,receipt.decodedFrames==62 else{throw GalleryError.invalid("The actual native movie failed its frame count proof.")}
        try JSONEncoder().encode(receipt).write(to:directory.appendingPathComponent("export-receipt.json"))
        let summary:[String:Any]=["documentRoundTrip":true,"importUndoRedo":true,"sceneUndoRedo":true,"nativeMovieDecodedFrames":62,"sceneSamples":visualEvidence,"operatingSystem":ProcessInfo.processInfo.operatingSystemVersionString,"version":Bundle.main.infoDictionary?["CFBundleShortVersionString"] ?? "development"]
        try JSONSerialization.data(withJSONObject:summary,options:[.prettyPrinted,.sortedKeys]).write(to:directory.appendingPathComponent("journey.json"))
        _=window;_=playback
        print("NATIVE JOURNEY PASS: import, undo, redo, edit, save, close, reopen, scrub, render, export, decode")
    }
    private static func wait(_ predicate:()->Bool) async throws {
        let start=Date()
        while !predicate() {guard Date().timeIntervalSince(start)<30 else{throw GalleryError.invalid("The native editor did not reach the requested state.")};try await Task.sleep(nanoseconds:30_000_000)}
    }
    private static func findPreview(_ view:NSView?)->PreviewSurface? {
        guard let view else{return nil};if let preview=view as? PreviewSurface{return preview}
        for child in view.subviews {if let result=findPreview(child){return result}};return nil
    }
    private static func capture(_ window:NSWindow,to url:URL)throws {
        guard let view=window.contentView,let bitmap=view.bitmapImageRepForCachingDisplay(in:view.bounds) else{throw GalleryError.invalid("The populated native window could not be captured.")}
        view.displayIfNeeded();view.cacheDisplay(in:view.bounds,to:bitmap)
        guard let data=bitmap.representation(using:.png,properties:[:]) else{throw GalleryError.invalid("Window capture encoding failed.")}
        try data.write(to:url)
    }
}
