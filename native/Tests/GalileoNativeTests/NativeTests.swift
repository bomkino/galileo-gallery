import XCTest
import AppKit
import CoreImage
import AVFoundation
import ImageIO
import GalileoCore
@testable import GalileoNative

final class NativeTests:XCTestCase {
    func testNativePackageRoundTripAndTamperRejection()throws {
        let (p,w)=try VerificationFixtures.workspace()
        let destination=w.root.appendingPathComponent("Round trip.galileo",isDirectory:true)
        try NativeDocumentIO.writePackage(project:p,workspace:w,to:destination)
        let (read,owned)=try NativeDocumentIO.readPackage(destination)
        XCTAssertEqual(read,p)
        for item in read.items {XCTAssertEqual(try Workspace.fingerprint(owned.url(for:item)),item.sha256)}
        let first=destination.appendingPathComponent("Assets").appendingPathComponent(p.items[0].asset)
        try Data("corrupt".utf8).write(to:first)
        XCTAssertThrowsError(try NativeDocumentIO.readPackage(destination))
    }
    @MainActor func testCompleteUndoRedoAndGroupedGesture()throws {
        let (p,w)=try VerificationFixtures.workspace();let session=try EditorSession(project:p,workspace:w)
        let manager=UndoManager();manager.groupsByEvent=false;session.undoManager=manager
        session.selection=[p.items[0].id];session.removeSelection();XCTAssertEqual(session.project.items.count,2)
        manager.undo();XCTAssertEqual(session.project,p);manager.redo();XCTAssertEqual(session.project.items.count,2)
        manager.undo();session.beginGesture("Change scale")
        for value in [0.3,0.4,0.5,0.6] {session.commit("Change scale"){$0.scene.scale=value}}
        session.endGesture();XCTAssertEqual(session.project.scene.scale,0.6)
        manager.undo();XCTAssertEqual(session.project,p);manager.redo();XCTAssertEqual(session.project.scene.scale,0.6)
        session.commit("Change scene"){$0.scene=SceneCatalog.defaults(for:"slide-fan")};manager.undo();XCTAssertEqual(session.project.scene.scale,0.6)
    }
    func testAllNativeSceneRendersContainActualPixels()throws {
        let (base,w)=try VerificationFixtures.workspace();let renderer=NativeRenderer()
        for variant in SceneCatalog.variants {
            var p=base;p.scene=SceneCatalog.defaults(for:variant.id);p.scene.shadow=0;p.canvas.background = .transparent
            let snapshot=try RenderSnapshot(project:p,workspace:w)
            let image=try renderer.image(snapshot:snapshot,frame:12)
            XCTAssertEqual(image.width,640);XCTAssertEqual(image.height,360)
            let rgba=try pixels(image)
            let alpha=rgba.enumerated().filter{$0.offset%4==3}.map{$0.element}
            XCTAssertTrue(alpha.contains{$0>240},"\(variant.id) rendered no artwork")
            XCTAssertTrue(alpha.contains{$0==0},"\(variant.id) lost the transparent background")
        }
    }
    func testPreviewAndExportUseSameComposition()throws {
        let (p,w)=try VerificationFixtures.workspace();let renderer=NativeRenderer();let snapshot=try RenderSnapshot(project:p,workspace:w)
        let a=try renderer.image(snapshot:snapshot,frame:8),b=try renderer.image(snapshot:snapshot,frame:8,maximumDimension:640)
        XCTAssertEqual(try pixels(a),try pixels(b))
        NSApp?.appearance=NSAppearance(named:.darkAqua)
        XCTAssertEqual(try pixels(a),try pixels(renderer.image(snapshot:snapshot,frame:8)))
    }
    func testH264AndProResAreDecodedAndCounted() async throws {
        let (base,w)=try VerificationFixtures.workspace()
        for format in [OutputFormat.h264,.proRes422,.proRes4444] {
            var p=base;p.canvas.width=320;p.canvas.height=180;p.export.format=format;p.export.frameRate=FrameRate(30000,1001)
            if format == .proRes4444 {p.canvas.background = .transparent}
            let snapshot=try RenderSnapshot(project:p,workspace:w),url=w.root.appendingPathComponent("movie-\(format.rawValue).\(format.fileExtension)")
            let receipt=try await NativeExport.run(snapshot:snapshot,destination:ExportDestination(url:url),stillFrame:0){_,_ in}
            XCTAssertEqual(receipt.scheduledFrames,snapshot.plan.schedule.totalFrames);XCTAssertEqual(receipt.decodedFrames,Int(snapshot.plan.schedule.totalFrames))
            XCTAssertEqual(receipt.sha256,try Workspace.fingerprint(url))
        }
    }
    func testSourceVideoCanBeImportedAndSought() async throws {
        var (p,w)=try VerificationFixtures.workspace();p.canvas.width=320;p.canvas.height=180;p.export.format = .h264
        let file=w.root.appendingPathComponent("source.mp4"),snapshot=try RenderSnapshot(project:p,workspace:w)
        _=try await NativeExport.run(snapshot:snapshot,destination:ExportDestination(url:file),stillFrame:0){_,_ in}
        let item=try await AssetImporter.inspect(file,workspace:w)
        XCTAssertEqual(item.kind,.video);XCTAssertNotNil(item.duration);XCTAssertEqual(item.width,320)
        p.items=[item];p.scene=SceneCatalog.defaults(for:"vitrine");p.timing.durationMilliseconds=2000
        let video=try RenderSnapshot(project:p,workspace:w),renderer=NativeRenderer()
        let first=try pixels(renderer.image(snapshot:video,frame:1)),middle=try pixels(renderer.image(snapshot:video,frame:14))
        XCTAssertNotEqual(first,middle)
        XCTAssertEqual(middle,try pixels(renderer.image(snapshot:video,frame:14)))
    }
    func testCancellationAndConcurrentDestinationChangePreserveOriginal() async throws {
        var (p,w)=try VerificationFixtures.workspace();p.export.format = .h264;p.timing.durationMilliseconds=10000
        let output=w.root.appendingPathComponent("existing.mp4"),original=Data("old output must survive".utf8)
        try original.write(to:output)
        let destination=try ExportDestination(url:output),snapshot=try RenderSnapshot(project:p,workspace:w)
        let task=Task {try await NativeExport.run(snapshot:snapshot,destination:destination,stillFrame:0){_,_ in}}
        task.cancel()
        do {_=try await task.value;XCTFail("A cancelled export succeeded")}catch{}
        XCTAssertEqual(try Data(contentsOf:output),original)
        let stale=try ExportDestination(url:output),staged=w.root.appendingPathComponent("staged.mp4")
        try Data("candidate".utf8).write(to:staged);try Data("another application changed it".utf8).write(to:output)
        XCTAssertThrowsError(try stale.publish(staged));XCTAssertEqual(try Data(contentsOf:output),Data("another application changed it".utf8))
    }
    func testUnsupportedInputDoesNotCreateReadyProxy() async throws {
        let w=try Workspace(),file=w.root.appendingPathComponent("broken.mov");try Data("not video".utf8).write(to:file)
        do {_=try await AssetImporter.inspect(file,workspace:w);XCTFail("A corrupt movie was accepted")}catch{}
    }
    func testMultiframeStillAndAnimatedTimingAreDistinct() {
        XCTAssertNil(ImageSequenceTiming.delay(properties:[kCGImagePropertyTIFFDictionary:[:]]))
        XCTAssertEqual(ImageSequenceTiming.delay(properties:[kCGImagePropertyGIFDictionary:[kCGImagePropertyGIFUnclampedDelayTime:0.025]]),0.025)
        XCTAssertEqual(ImageSequenceTiming.delay(properties:[kCGImagePropertyPNGDictionary:[kCGImagePropertyAPNGUnclampedDelayTime:0.3]]),0.3)
    }
    func testPNGStillAndSequenceAreActualFiles() async throws {
        var (p,w)=try VerificationFixtures.workspace();p.canvas.width=320;p.canvas.height=180
        for format in [OutputFormat.png,.pngSequence] {
            p.export.format=format
            let snapshot=try RenderSnapshot(project:p,workspace:w)
            let url=w.root.appendingPathComponent(format == .png ? "still.png":"sequence")
            let receipt=try await NativeExport.run(snapshot:snapshot,destination:ExportDestination(url:url),stillFrame:7)
            if format == .png {
                XCTAssertEqual(receipt.decodedFrames,1);try NativeExport.verifyPNG(url,width:320,height:180)
            } else {
                let files=try FileManager.default.contentsOfDirectory(at:url,includingPropertiesForKeys:nil).filter{$0.pathExtension=="png"}
                XCTAssertEqual(files.count,Int(snapshot.plan.schedule.totalFrames))
                for file in files {try NativeExport.verifyPNG(file,width:320,height:180)}
            }
        }
    }
    @MainActor func testCancelledImportCannotCommitIntoAnotherDocumentState() async throws {
        let (p,w)=try VerificationFixtures.workspace(),session=try EditorSession()
        let url=try w.url(for:p.items[0])
        session.importURLs([url]);session.cancelImport()
        var next=GalleryProject();next.name="Replacement document"
        try session.load(project:next,workspace:Workspace())
        try await Task.sleep(nanoseconds:200_000_000)
        XCTAssertEqual(session.project,next);XCTAssertFalse(session.importing)
    }
    private func pixels(_ image:CGImage)throws->[UInt8] {
        var data=[UInt8](repeating:0,count:image.width*image.height*4)
        try data.withUnsafeMutableBytes { bytes in
            guard let ctx=CGContext(data:bytes.baseAddress,width:image.width,height:image.height,bitsPerComponent:8,bytesPerRow:image.width*4,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue|CGBitmapInfo.byteOrder32Big.rawValue) else{throw GalleryError.invalid("Pixel inspection allocation failed.")}
            ctx.draw(image,in:CGRect(x:0,y:0,width:image.width,height:image.height))
        };return data
    }
}
