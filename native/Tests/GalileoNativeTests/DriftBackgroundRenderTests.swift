import XCTest
import AVFoundation
import CoreImage
import GalileoCore
@testable import GalileoNative

final class DriftBackgroundRenderTests: XCTestCase {
    func testAllImportedStudiesRenderAndUseSRGBWithoutChangingTransparency() throws {
        let w=try Workspace(),renderer=NativeRenderer()
        var p=GalleryProject();p.canvas.width=160;p.canvas.height=90;p.canvas.background = .drift
        for study in DriftBackgroundCatalog.studies {
            p.canvas.drift=study.settings
            let image=try renderer.image(snapshot:RenderSnapshot(project:p,workspace:w),frame:0)
            let data=try pixels(image)
            XCTAssertTrue(stride(from:3,to:data.count,by:4).allSatisfy{data[$0]==255},study.id)
            XCTAssertTrue(data.enumerated().contains{$0.offset%4<3 && $0.element>0},"Blank background: \(study.id)")
        }
        p.canvas.drift=DriftBackgroundCatalog.studies[0].settings
        p.canvas.drift?.colorA=RGBA(0.2,0.4,0.6);p.canvas.drift?.vignette=0;p.canvas.drift?.grain=0
        let data=try pixels(renderer.image(snapshot:RenderSnapshot(project:p,workspace:w),frame:0))
        for (i,value) in [51.0,102.0,153.0].enumerated() {XCTAssertEqual(Double(data[i]),value,accuracy:2)}
        p.canvas.background = .transparent
        let transparent=try pixels(renderer.image(snapshot:RenderSnapshot(project:p,workspace:w),frame:0))
        XCTAssertTrue(stride(from:3,to:transparent.count,by:4).allSatisfy{transparent[$0]==0})
    }
    func testMotionScrubRepeatFreezeAndLogicalGrainHaveOneClock() throws {
        let w=try Workspace(),r=NativeRenderer()
        var p=GalleryProject();p.canvas.width=320;p.canvas.height=180;p.canvas.background = .drift
        p.canvas.drift=DriftBackgroundCatalog.studies.first{$0.id=="verdigris-fresco-study"}!.settings
        p.timing.durationMilliseconds=2000;p.timing.playMode = .repeatCount
        let s=try RenderSnapshot(project:p,workspace:w)
        let first=try pixels(r.image(snapshot:s,frame:4)),later=try pixels(r.image(snapshot:s,frame:24))
        XCTAssertNotEqual(first,later)
        XCTAssertEqual(first,try pixels(r.image(snapshot:s,frame:4)))
        XCTAssertEqual(first,try pixels(r.image(snapshot:s,frame:4+s.plan.schedule.cycleFrames)))
        p.canvas.drift?.animated=false
        let frozen=try RenderSnapshot(project:p,workspace:w)
        XCTAssertEqual(try pixels(r.image(snapshot:frozen,frame:4)),try pixels(r.image(snapshot:frozen,frame:24)))
        XCTAssertEqual(try pixels(r.image(snapshot:s,frame:24,maximumDimension:320)),later)
    }
    func testBackgroundSurvivesPackageAndDecodedMovie() async throws {
        var (p,w)=try VerificationFixtures.workspace()
        p.canvas.width=320;p.canvas.height=180;p.canvas.background = .drift
        p.canvas.drift=DriftBackgroundCatalog.studies.first{$0.id=="saffron-anatomy-study"}!.settings
        p.items=Array(p.items.prefix(1));p.scene=SceneCatalog.defaults(for:"cms-slideshow");p.scene.scale=0.2;p.scene.shadow=0
        p.timing.durationMilliseconds=1000;p.export.format = .h264;p.export.frameRate=FrameRate(30)
        let package=w.root.appendingPathComponent("Background.galileo")
        try NativeDocumentIO.writePackage(project:p,workspace:w,to:package)
        let (restored,owned)=try NativeDocumentIO.readPackage(package);XCTAssertEqual(restored,p)
        let snapshot=try RenderSnapshot(project:restored,workspace:owned),r=NativeRenderer()
        let output=w.root.appendingPathComponent("background.mp4")
        let receipt=try await NativeExport.run(snapshot:snapshot,destination:ExportDestination(url:output),stillFrame:0)
        XCTAssertEqual(receipt.decodedFrames,30)
        let asset=AVURLAsset(url:output),tracks=try await asset.loadTracks(withMediaType:.video)
        let reader=try AVAssetReader(asset:asset),track=try XCTUnwrap(tracks.first)
        let channel=AVAssetReaderTrackOutput(track:track,outputSettings:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA])
        reader.add(channel);XCTAssertTrue(reader.startReading())
        let context=CIContext(options:[.useSoftwareRenderer:true])
        var count=0
        while let sample=channel.copyNextSampleBuffer() {
            defer{count+=1}
            guard [0,12,24].contains(count) else {continue}
            let buffer=try XCTUnwrap(CMSampleBufferGetImageBuffer(sample)),ci=CIImage(cvPixelBuffer:buffer)
            let actual=try pixels(XCTUnwrap(context.createCGImage(ci,from:ci.extent)))
            let expected=try pixels(r.image(snapshot:snapshot,frame:Int64(count)))
            // Inspect background corners, independently decoded from the actual H.264 file.
            for (x,y) in [(8,8),(310,8),(8,170),(310,170)] {
                for c in 0..<3 {let i=(y*320+x)*4+c;XCTAssertEqual(Double(actual[i]),Double(expected[i]),accuracy:15,"Background differs at frame \(count), \(x),\(y)")}
            }
        }
        XCTAssertEqual(count,30);XCTAssertEqual(reader.status,.completed)
    }
    private func pixels(_ image:CGImage)throws->[UInt8] {
        var result=[UInt8](repeating:0,count:image.width*image.height*4)
        try result.withUnsafeMutableBytes { b in
            guard let c=CGContext(data:b.baseAddress,width:image.width,height:image.height,bitsPerComponent:8,bytesPerRow:image.width*4,
                space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue|CGBitmapInfo.byteOrder32Big.rawValue) else {throw GalleryError.invalid("Pixel read failed")}
            c.draw(image,in:CGRect(x:0,y:0,width:image.width,height:image.height))
        };return result
    }
}
