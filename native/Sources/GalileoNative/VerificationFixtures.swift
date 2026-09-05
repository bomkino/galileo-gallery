import Foundation
import AVFoundation
import CoreGraphics
import CoreText
import GalileoCore

/// Original, deterministic test artwork. No customer media or bundled fonts.
public enum VerificationFixtures {
    public static func image(width:Int=640,height:Int=400,index:Int=0,alpha:Bool=false)throws->CGImage {
        let colorSpace=CGColorSpace(name:CGColorSpace.sRGB)!
        guard let ctx=CGContext(data:nil,width:width,height:height,bitsPerComponent:8,bytesPerRow:0,space:colorSpace,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else {throw GalleryError.invalid("Fixture allocation failed.")}
        let palette:[RGBA]=[RGBA(hex:"E7E3D7"),RGBA(hex:"B65439"),RGBA(hex:"2B514B"),RGBA(hex:"DBB548")]
        let color=palette[index%palette.count]
        if !alpha {ctx.setFillColor(CGColor(colorSpace:colorSpace,components:[color.r,color.g,color.b,1])!);ctx.fill(CGRect(x:0,y:0,width:width,height:height))}
        let short=Double(min(width,height)),inset=short*0.09
        ctx.setFillColor(CGColor(gray:alpha ? 0.9:0.08,alpha:1))
        ctx.fillEllipse(in:CGRect(x:Double(width)*0.47,y:Double(height)*0.28,width:short*0.52,height:short*0.52))
        ctx.setStrokeColor(CGColor(gray:index==0 ? 0.15:0.93,alpha:0.85));ctx.setLineWidth(max(1,short*0.004))
        ctx.stroke(CGRect(x:inset,y:inset,width:Double(width)-inset*2,height:Double(height)-inset*2))
        let font=CTFontCreateUIFontForLanguage(.system,short*0.07,nil)!
        let text=["FIELD NOTES","AFTER HOURS","STILL / MOVING","A SMALL STUDY"][index%4]
        let line=CTLineCreateWithAttributedString(NSAttributedString(string:text,attributes:[NSAttributedString.Key(kCTFontAttributeName as String):font,NSAttributedString.Key(kCTForegroundColorAttributeName as String):CGColor(gray:index==0 ? 0.08:0.97,alpha:1)]))
        ctx.textPosition=CGPoint(x:inset*1.5,y:Double(height)-inset*2.2);CTLineDraw(line,ctx)
        guard let image=ctx.makeImage() else{throw GalleryError.invalid("Fixture rendering failed.")};return image
    }
    public static func workspace(count:Int=3)throws->(GalleryProject,Workspace) {
        let workspace=try Workspace();var project=GalleryProject();project.name="Studio study"
        project.canvas.width=640;project.canvas.height=360;project.timing.durationMilliseconds=1000;project.scene.shadow=0
        for index in 0..<count {
            let size=[(640,400),(360,480),(640,270),(400,400)][index%4]
            let temporary=workspace.root.appendingPathComponent("source-\(index).png")
            try NativeExport.writePNG(image(width:size.0,height:size.1,index:index),to:temporary)
            let acquired=try workspace.acquire(temporary)
            project.items.append(MediaItem(name:["Field notes.png","After hours.png","Still moving.png","A small study.png"][index%4],asset:acquired.url.lastPathComponent,sha256:acquired.hash,kind:.image,width:size.0,height:size.1))
            try FileManager.default.removeItem(at:temporary)
        }
        return(project,workspace)
    }
}

extension VerificationFixtures {
    /// Three independent, literal colour seconds: red, green, blue. This fixture
    /// is written directly with AVFoundation, not by the compositor under test.
    public static func loopingVideo(workspace: Workspace) async throws -> MediaItem {
        let url = workspace.root.appendingPathComponent("three-second-source.mp4")
        let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 320, AVVideoHeightKey: 180,
            AVVideoCompressionPropertiesKey: [AVVideoAllowFrameReorderingKey: false]
        ])
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: 320, kCVPixelBufferHeightKey as String: 180,
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
        ])
        guard writer.canAdd(input) else { throw GalleryError.invalid("Fixture encoder unavailable.") }
        writer.add(input)
        guard writer.startWriting() else { throw GalleryError.invalid("Fixture encoder could not start.") }
        writer.startSession(atSourceTime: .zero)
        do {
            for frame in 0..<90 {
                let start = Date()
                while !input.isReadyForMoreMediaData {
                    guard writer.status == .writing, Date().timeIntervalSince(start) < 10 else {
                        throw GalleryError.invalid("Fixture encoder stalled.")
                    }
                    try await Task.sleep(nanoseconds: 1_000_000)
                }
                guard let pool = adaptor.pixelBufferPool else { throw GalleryError.invalid("No fixture pixel pool.") }
                var buffer: CVPixelBuffer?
                guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer) == kCVReturnSuccess, let buffer else {
                    throw GalleryError.invalid("Fixture pixel allocation failed.")
                }
                CVPixelBufferLockBaseAddress(buffer, [])
                let width = CVPixelBufferGetWidth(buffer), height = CVPixelBufferGetHeight(buffer)
                let stride = CVPixelBufferGetBytesPerRow(buffer)
                let bytes = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
                for y in 0..<height {
                    for x in 0..<width {
                        let offset = y * stride + x * 4
                        bytes[offset] = frame >= 60 ? 240 : 16
                        bytes[offset+1] = (30..<60).contains(frame) ? 240 : 16
                        bytes[offset+2] = frame < 30 ? 240 : 16
                        bytes[offset+3] = 255
                    }
                }
                CVPixelBufferUnlockBaseAddress(buffer, [])
                guard adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(frame), timescale: 30)) else {
                    throw GalleryError.invalid("Fixture frame was rejected.")
                }
            }
            writer.endSession(atSourceTime: CMTime(value: 90, timescale: 30))
            input.markAsFinished()
            await withCheckedContinuation { continuation in writer.finishWriting { continuation.resume() } }
            guard writer.status == .completed else { throw GalleryError.invalid("Fixture encoding failed.") }
            return try await AssetImporter.inspect(url, workspace: workspace)
        } catch { writer.cancelWriting(); throw error }
    }
}
