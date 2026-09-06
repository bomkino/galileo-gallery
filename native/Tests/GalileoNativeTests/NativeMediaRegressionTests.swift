import XCTest
import AVFoundation
import ImageIO
import CoreImage
import GalileoCore
@testable import GalileoNative

final class NativeMediaRegressionTests:XCTestCase {
    private func fixture(_ name:String)throws->URL {
        try XCTUnwrap(Bundle.module.resourceURL?.appendingPathComponent("Fixtures/"+name))
    }
    private func rgba(_ image:CGImage)throws->[UInt8] {
        var bytes=[UInt8](repeating:0,count:image.width*image.height*4)
        try bytes.withUnsafeMutableBytes { raw in
            let context=try XCTUnwrap(CGContext(data:raw.baseAddress,width:image.width,height:image.height,bitsPerComponent:8,bytesPerRow:image.width*4,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue|CGBitmapInfo.byteOrder32Big.rawValue))
            context.draw(image,in:CGRect(x:0,y:0,width:image.width,height:image.height))
        }
        return bytes
    }
    func testWebPStillOrientationAnimationDisposalAndTransparency() async throws {
        let workspace=try Workspace(),renderer=NativeRenderer()
        let still=try await AssetImporter.inspect(fixture("still-alpha.webp"),workspace:workspace)
        XCTAssertEqual(still.kind,.image);XCTAssertTrue(still.hasAlpha)
        let image=try renderer.sourcePreview(item:still,seconds:0,workspace:workspace)
        XCTAssertEqual(image.width,160);XCTAssertEqual(image.height,96)
        let bytes=try rgba(image);XCTAssertEqual(bytes[3],0)
        let oriented=try await AssetImporter.inspect(fixture("oriented.webp"),workspace:workspace)
        XCTAssertEqual(oriented.width,96);XCTAssertEqual(oriented.height,160)
        let animation=try await AssetImporter.inspect(fixture("animated-alpha.webp"),workspace:workspace)
        XCTAssertEqual(animation.kind,.animatedImage);XCTAssertEqual(animation.duration ?? 0,1.65,accuracy:0.002)
        for (index,time) in [0.1,0.5,0.8,1.4].enumerated() {
            let picture=try renderer.sourcePreview(item:animation,seconds:time,workspace:workspace)
            let source=try XCTUnwrap(CGImageSourceCreateWithURL(fixture("webp-frame-\(index).png") as CFURL,nil))
            let expected=try rgba(XCTUnwrap(CGImageSourceCreateImageAtIndex(source,0,nil))),actual=try rgba(picture)
            XCTAssertEqual(actual.count,expected.count)
            let mean=zip(actual,expected).reduce(0.0){$0+Double(abs(Int($1.0)-Int($1.1)))}/Double(expected.count)
            XCTAssertLessThan(mean,1.5,"Animation frame \(index) was not reconstructed with its disposal/blend state")
        }
    }
    func testWebMCodecsOriginalPreservationAlphaAndVariableFrameTimestamps() async throws {
        for name in ["vp8.webm","vp9.webm","vp9-alpha.webm","vfr.webm"] {
            let workspace=try Workspace(),original=try fixture(name)
            let item=try await AssetImporter.inspect(original,workspace:workspace)
            XCTAssertEqual(item.kind,.video);XCTAssertEqual(item.derivation,MediaCompatibility.recipe)
            XCTAssertEqual(try Workspace.fingerprint(original),item.originalSHA256)
            XCTAssertEqual(try Workspace.fingerprint(workspace.assets.appendingPathComponent(XCTUnwrap(item.originalAsset))),item.originalSHA256)
            let movie=try workspace.url(for:item),asset=AVURLAsset(url:movie)
            let tracks=try await asset.loadTracks(withMediaType:.video),reader=try AVAssetReader(asset:asset)
            let output=AVAssetReaderTrackOutput(track:try XCTUnwrap(tracks.first),outputSettings:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA])
            reader.add(output);XCTAssertTrue(reader.startReading());var times=[Double]()
            while let sample=output.copyNextSampleBuffer() {times.append(CMSampleBufferGetPresentationTimeStamp(sample).seconds)}
            XCTAssertEqual(reader.status,.completed)
            let expected=name=="vfr.webm" ? [0.0,0.4,0.6,1.2,1.64]:[0.0,0.5,1.0,1.5,2.0,2.5]
            XCTAssertEqual(times.count,expected.count)
            for (actual,wanted) in zip(times,expected) {XCTAssertEqual(actual,wanted,accuracy:0.003)}
            if name=="vp9-alpha.webm" {
                XCTAssertTrue(item.hasAlpha)
                let image=try NativeRenderer().sourcePreview(item:item,seconds:0.2,workspace:workspace)
                let bytes=try rgba(image);XCTAssertLessThan(bytes[3],3)
                XCTAssertGreaterThan(bytes[(image.height/2*image.width+image.width/2)*4+3],250)
            }
        }
    }
    func testCoveringVideoFramesAreReusedAndBackwardSeeksDoNotReuseStalePixels() async throws {
        let workspace=try Workspace(),item=try await AssetImporter.inspect(fixture("vp9.webm"),workspace:workspace)
        let renderer=NativeRenderer();var first=[UInt8]()
        for i in 0..<15 {
            let image=try renderer.sourcePreview(item:item,seconds:Double(i)/30,workspace:workspace)
            if i==0 {first=try rgba(image)}else{XCTAssertEqual(try rgba(image),first)}
        }
        XCTAssertLessThanOrEqual(renderer.preparedSourceFrames,1,"Fifteen output requests re-decoded one covering source frame")
        XCTAssertLessThanOrEqual(renderer.decodedVideoSamples,2,"Covering samples were redundantly decoded instead of retained")
        let second=try rgba(renderer.sourcePreview(item:item,seconds:0.7,workspace:workspace))
        XCTAssertNotEqual(second,first)
        XCTAssertEqual(try rgba(renderer.sourcePreview(item:item,seconds:0.1,workspace:workspace)),first)
        print("SOURCE FRAME REUSE: 15 output requests, \(renderer.preparedSourceFrames) prepared frames and \(renderer.decodedVideoSamples) decoded samples including forward and backward seeks")
    }
    @MainActor func testMixedImportKeepsGoodFilesAndStaleDropCannotEnterNewDocument() async throws {
        let editor=try EditorSession();let generation=editor.importGeneration
        editor.cancelImport();editor.importURLs([try fixture("still-alpha.webp")],expectedGeneration:generation)
        XCTAssertFalse(editor.importing);XCTAssertTrue(editor.project.items.isEmpty)
        editor.importURLs([try fixture("malformed.webp"),try fixture("still-alpha.webp")])
        try await wait{!editor.importing}
        XCTAssertEqual(editor.project.items.count,1);XCTAssertNotNil(editor.issue)
        let target=editor.workspace.root.appendingPathComponent("Mixed.galileo")
        try NativeDocumentIO.writePackage(project:editor.project,workspace:editor.workspace,to:target)
        XCTAssertEqual(try NativeDocumentIO.readPackage(target).0.items,editor.project.items)
    }
    @MainActor func testLiveAppearanceRateChangeAndAuditionPositionOwnership() async throws {
        var (project,workspace)=try VerificationFixtures.workspace()
        project.timing.durationMilliseconds=6000
        let playback=PlaybackModel(schedule:try RenderPlan(project:project).schedule)
        playback.update(try RenderPlan(project:project));playback.seek(90);playback.play()
        project.canvas.color=RGBA(0.3,0.4,0.5);playback.update(try RenderPlan(project:project))
        XCTAssertTrue(playback.playing)
        project.export.frameRate=FrameRate(60);playback.update(try RenderPlan(project:project))
        XCTAssertFalse(playback.playing);XCTAssertEqual(playback.frame,180)
        project.items[0].spotlight=Spotlight();playback.update(try RenderPlan(project:project));playback.seek(100)
        let cue=try XCTUnwrap(RenderSnapshot(project:project,workspace:workspace).plan.spotlights.first)
        playback.preview(cue);playback.pause();XCTAssertEqual(playback.frame,100)
        let ephemeral=PlaybackModel(schedule:try RenderPlan(project:project).schedule,persist:false)
        ephemeral.update(try RenderPlan(project:project));ephemeral.seek(5);ephemeral.pause()
        XCTAssertEqual(UserDefaults.standard.integer(forKey:"playhead-"+project.id),100)
        UserDefaults.standard.removeObject(forKey:"playhead-"+project.id)
    }
    func testMissingPDFArchiveDoesNotDiscardItsUsablePage() async throws {
        var (project,workspace)=try VerificationFixtures.workspace(count:1)
        let original=workspace.assets.appendingPathComponent("preserved.pdf")
        try Data("%PDF synthetic archived-source test".utf8).write(to:original)
        project.items[0].originalAsset=original.lastPathComponent;project.items[0].originalSHA256=try Workspace.fingerprint(original)
        let target=workspace.root.appendingPathComponent("Pages.galileo")
        try NativeDocumentIO.writePackage(project:project,workspace:workspace,to:target)
        try FileManager.default.removeItem(at:target.appendingPathComponent("Assets/preserved.pdf"))
        XCTAssertThrowsError(try NativeDocumentIO.readPackage(target))
        let (copy,owned)=try NativeDocumentIO.readPackage(target,allowRecovery:true)
        XCTAssertNil(copy.items[0].unavailable);XCTAssertNotNil(copy.items[0].originalUnavailable)
        XCTAssertEqual(try Workspace.fingerprint(owned.url(for:copy.items[0])),project.items[0].sha256)
        let saved=workspace.root.appendingPathComponent("Recovery.galileo")
        try NativeDocumentIO.writePackage(project:copy,workspace:owned,to:saved)
        XCTAssertNil(try NativeDocumentIO.readPackage(saved).0.items[0].unavailable)
    }
    @MainActor private func wait(_ predicate:()->Bool) async throws {
        let deadline=Date().addingTimeInterval(30)
        while !predicate() {guard Date()<deadline else{throw GalleryError.invalid("Operation stalled")};try await Task.sleep(nanoseconds:10_000_000)}
    }
}
