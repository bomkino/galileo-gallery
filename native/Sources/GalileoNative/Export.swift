import Foundation
import Darwin
import AVFoundation
import CoreImage
import ImageIO
import UniformTypeIdentifiers
import GalileoCore

public struct ExportReceipt: Codable, Sendable {
    public let documentID:String
    public let variantID:String
    public let format:String
    public let width:Int
    public let height:Int
    public let scheduledFrames:Int64
    public let decodedFrames:Int?
    public let duration:Double
    public let sha256:String?
    public let backend:String
    public let outputPath:String
}
public struct ExportDestination: @unchecked Sendable {
    public let url:URL
    private let existed:Bool
    private let identity:String?
    public init(url:URL) throws {
        guard url.isFileURL else { throw GalleryError.invalid("Choose a local export destination.") }
        self.url=url;existed=FileManager.default.fileExists(atPath:url.path)
        identity=try Self.identity(url)
        if existed && identity==nil { throw GalleryError.invalid("The destination is not a replaceable regular file. Choose another name.") }
    }
    private static func identity(_ url:URL)throws->String? {
        // URL resource values can remain cached after another process changes a file.
        // Read the filesystem identity afresh at both authorisation and commit.
        var value=stat()
        let result=url.path.withCString { lstat($0,&value) }
        if result != 0 {
            if errno==ENOENT { return nil }
            throw GalleryError.invalid("The export destination could not be inspected.")
        }
        guard value.st_mode & S_IFMT == S_IFREG else {
            throw GalleryError.invalid("The export destination is not a regular file.")
        }
        return "\(value.st_dev):\(value.st_ino):\(value.st_mode):\(value.st_size):\(value.st_mtimespec.tv_sec):\(value.st_mtimespec.tv_nsec):\(value.st_ctimespec.tv_sec):\(value.st_ctimespec.tv_nsec)"
    }
    public func publish(_ staged:URL) throws {
        try Task.checkCancellation()
        guard FileManager.default.fileExists(atPath:url.path)==existed,try Self.identity(url)==identity else { throw GalleryError.invalid("The destination changed during export. The existing file was not replaced.") }
        if existed { _=try FileManager.default.replaceItemAt(url,withItemAt:staged,backupItemName:nil,options:[]) }
        else { try FileManager.default.moveItem(at:staged,to:url) }
    }
}
public enum NativeExport {
    public static func run(snapshot:RenderSnapshot,destination:ExportDestination,stillFrame:Int64=0,
                           progress:@escaping @Sendable (Double,String)->Void = {_,_ in}) async throws -> ExportReceipt {
        let plan=snapshot.plan,project=plan.project,format=project.export.format
        guard !plan.items.isEmpty else { throw GalleryError.invalid("Add at least one included media item before exporting.") }
        guard format.supportsAlpha || project.canvas.background != .transparent else { throw GalleryError.unsupported("Use ProRes 4444 or PNG for a transparent canvas.") }
        guard plan.schedule.totalFrames<=216000 || format == .png else { throw GalleryError.unsupported("This export exceeds 216,000 frames. Shorten the duration or repeat count.") }
        let parent=destination.url.deletingLastPathComponent()
        let staged=parent.appendingPathComponent(".galileo-\(UUID().uuidString)"+(format.fileExtension.isEmpty ? "":"."+format.fileExtension))
        let scoped=parent.startAccessingSecurityScopedResource()
        defer { if scoped { parent.stopAccessingSecurityScopedResource() };try? FileManager.default.removeItem(at:staged) }
        let renderer=NativeRenderer()
        progress(0,"Checking media")
        var checked=Set<String>()
        for item in plan.items where checked.insert(item.asset).inserted {
            try Task.checkCancellation()
            guard try Workspace.fingerprint(snapshot.workspace.url(for:item))==item.sha256 else { throw GalleryError.invalid("\(item.name) changed. Export stopped without replacing the destination.") }
        }
        var decoded:Int?=nil
        if format == .png {
            let image=try renderer.image(snapshot:snapshot,frame:stillFrame)
            try writePNG(image,to:staged);try verifyPNG(staged,width:project.canvas.width,height:project.canvas.height)
            decoded=1
        } else if format == .pngSequence {
            try FileManager.default.createDirectory(at:staged,withIntermediateDirectories:false)
            for frame in 0..<plan.schedule.totalFrames {
                try Task.checkCancellation()
                try autoreleasepool {
                    let image=try renderer.image(snapshot:snapshot,frame:frame)
                    try writePNG(image,to:staged.appendingPathComponent(String(format:"frame-%06lld.png",frame)))
                }
                progress(Double(frame+1)/Double(plan.schedule.totalFrames)*0.94,"Rendering \(frame+1) / \(plan.schedule.totalFrames)")
            }
            for f in Set([Int64(0),plan.schedule.totalFrames/2,plan.schedule.totalFrames-1]) {
                try verifyPNG(staged.appendingPathComponent(String(format:"frame-%06lld.png",f)),width:project.canvas.width,height:project.canvas.height)
            }
            let info:[String:Any]=["frameCount":plan.schedule.totalFrames,"firstFrame":0,"frameRateNumerator":plan.schedule.rate.numerator,"frameRateDenominator":plan.schedule.rate.denominator,"width":project.canvas.width,"height":project.canvas.height,"colourSpace":"sRGB","alpha":"straight PNG encoding from premultiplied working pixels"]
            try JSONSerialization.data(withJSONObject:info,options:[.prettyPrinted,.sortedKeys]).write(to:staged.appendingPathComponent("sequence.json"),options:.atomic)
        } else {
            try await movie(snapshot:snapshot,renderer:renderer,to:staged,progress:progress)
            progress(0.96,"Checking output")
            decoded=try await verifyMovie(staged,schedule:plan.schedule,width:project.canvas.width,height:project.canvas.height)
        }
        try Task.checkCancellation()
        let hash=format == .pngSequence ? nil:try Workspace.fingerprint(staged)
        progress(0.99,"Saving export")
        try destination.publish(staged)
        // Publishing is the commit point. Cancellation after this point does not undo a valid file.
        progress(1,"Exported")
        return ExportReceipt(documentID:project.id,variantID:project.scene.variantID,format:format.rawValue,
                             width:project.canvas.width,height:project.canvas.height,
                             scheduledFrames:format == .png ? 1:plan.schedule.totalFrames,decodedFrames:decoded,
                             duration:format == .png ? 0:plan.schedule.duration,sha256:hash,backend:renderer.backend,outputPath:destination.url.path)
    }
    public static func writePNG(_ image:CGImage,to url:URL)throws {
        guard let destination=CGImageDestinationCreateWithURL(url as CFURL,UTType.png.identifier as CFString,1,nil) else { throw GalleryError.invalid("The PNG destination could not be created.") }
        CGImageDestinationAddImage(destination,image,nil)
        guard CGImageDestinationFinalize(destination) else { throw GalleryError.invalid("The PNG could not be written. Check available disk space.") }
    }
    public static func verifyPNG(_ url:URL,width:Int,height:Int)throws {
        guard let source=CGImageSourceCreateWithURL(url as CFURL,nil),let image=CGImageSourceCreateImageAtIndex(source,0,nil),image.width==width,image.height==height else { throw GalleryError.invalid("The rendered PNG failed verification.") }
    }
    private static func movie(snapshot:RenderSnapshot,renderer:NativeRenderer,to url:URL,progress:@escaping @Sendable(Double,String)->Void) async throws {
        let project=snapshot.plan.project,schedule=snapshot.plan.schedule,format=project.export.format
        let writer=try AVAssetWriter(outputURL:url,fileType:format == .h264 ? .mp4:.mov)
        let codec:AVVideoCodecType=format == .h264 ? .h264:format == .proRes422 ? .proRes422:.proRes4444
        var settings:[String:Any]=[
            AVVideoCodecKey:codec,AVVideoWidthKey:project.canvas.width,AVVideoHeightKey:project.canvas.height,
            AVVideoColorPropertiesKey:[AVVideoColorPrimariesKey:AVVideoColorPrimaries_ITU_R_709_2,
                                      AVVideoTransferFunctionKey:AVVideoTransferFunction_ITU_R_709_2,
                                      AVVideoYCbCrMatrixKey:AVVideoYCbCrMatrix_ITU_R_709_2]
        ]
        if format == .h264 { settings[AVVideoCompressionPropertiesKey]=[
            AVVideoAverageBitRateKey:max(2_000_000,min(100_000_000,Int(Double(project.canvas.width*project.canvas.height)*schedule.rate.value*0.24))),
            AVVideoProfileLevelKey:AVVideoProfileLevelH264HighAutoLevel,AVVideoAllowFrameReorderingKey:false
        ] }
        guard writer.canApply(outputSettings:settings,forMediaType:.video) else { throw GalleryError.unsupported("This Mac cannot encode the selected format at this size.") }
        let input=AVAssetWriterInput(mediaType:.video,outputSettings:settings);input.expectsMediaDataInRealTime=false
        let adaptor=AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:[
            kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String:project.canvas.width,kCVPixelBufferHeightKey as String:project.canvas.height,
            kCVPixelBufferCGImageCompatibilityKey as String:true,kCVPixelBufferCGBitmapContextCompatibilityKey as String:true,
            kCVPixelBufferIOSurfacePropertiesKey as String:[:]
        ])
        guard writer.canAdd(input) else { throw GalleryError.unsupported("The video writer could not accept this format.") }
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? GalleryError.invalid("The video writer could not start.") }
        writer.startSession(atSourceTime:.zero)
        let rec709=CGColorSpace(name:CGColorSpace.itur_709)!
        do {
            for frame in 0..<schedule.totalFrames {
                try Task.checkCancellation()
                let waiting=Date()
                while !input.isReadyForMoreMediaData {
                    try Task.checkCancellation()
                    if writer.status == .failed { throw writer.error ?? GalleryError.invalid("Encoding failed.") }
                    guard Date().timeIntervalSince(waiting)<30 else { throw GalleryError.invalid("The video encoder stopped responding.") }
                    try await Task.sleep(nanoseconds:2_000_000)
                }
                try autoreleasepool {
                    guard let pool=adaptor.pixelBufferPool else { throw GalleryError.invalid("The video pixel buffer pool is unavailable.") }
                    var pixelBuffer:CVPixelBuffer?
                    guard CVPixelBufferPoolCreatePixelBuffer(nil,pool,&pixelBuffer)==kCVReturnSuccess,let buffer=pixelBuffer else { throw GalleryError.invalid("Not enough memory for the video frame.") }
                    CVPixelBufferLockBaseAddress(buffer,[]);defer { CVPixelBufferUnlockBaseAddress(buffer,[]) }
                    let image=try renderer.image(snapshot:snapshot,frame:frame,colorSpace:rec709)
                    guard let ctx=CGContext(data:CVPixelBufferGetBaseAddress(buffer),width:project.canvas.width,height:project.canvas.height,bitsPerComponent:8,bytesPerRow:CVPixelBufferGetBytesPerRow(buffer),space:rec709,bitmapInfo:CGImageAlphaInfo.premultipliedFirst.rawValue|CGBitmapInfo.byteOrder32Little.rawValue) else { throw GalleryError.invalid("The encoder frame buffer could not be created.") }
                    ctx.draw(image,in:CGRect(x:0,y:0,width:project.canvas.width,height:project.canvas.height))
                    let timestamp=CMTime(value:frame*schedule.rate.denominator,timescale:Int32(schedule.rate.numerator))
                    guard adaptor.append(buffer,withPresentationTime:timestamp) else { throw writer.error ?? GalleryError.invalid("The video frame could not be encoded.") }
                }
                progress(Double(frame+1)/Double(schedule.totalFrames)*0.94,"Rendering \(frame+1) / \(schedule.totalFrames)")
            }
            input.markAsFinished()
            writer.endSession(atSourceTime:CMTime(value:schedule.totalFrames*schedule.rate.denominator,timescale:Int32(schedule.rate.numerator)))
            let finished=WriterCompletion()
            writer.finishWriting { finished.markFinished() }
            let deadline=ProcessInfo.processInfo.systemUptime+60
            while !finished.isFinished {
                try Task.checkCancellation()
                guard ProcessInfo.processInfo.systemUptime<deadline else { throw GalleryError.invalid("The video encoder did not finish. The destination was not changed.") }
                try await Task.sleep(nanoseconds:10_000_000)
            }
            guard writer.status == .completed else { throw writer.error ?? GalleryError.invalid("The movie was not finalised.") }
        } catch { writer.cancelWriting();throw error }
    }
    public static func verifyMovie(_ url:URL,schedule:FrameSchedule,width:Int,height:Int) async throws -> Int? {
        let asset=AVURLAsset(url:url),tracks=try await asset.loadTracks(withMediaType:.video)
        guard tracks.count==1,let track=tracks.first else { throw GalleryError.invalid("The exported movie has an invalid video track.") }
        let size=try await track.load(.naturalSize),duration=try await asset.load(.duration)
        guard Int(size.width)==width,Int(size.height)==height,abs(duration.seconds-schedule.duration)<=max(0.002,1/schedule.rate.value) else { throw GalleryError.invalid("The exported size or duration does not match the document.") }
        let reader=try AVAssetReader(asset:asset)
        defer { if reader.status == .reading { reader.cancelReading() } }
        let output=AVAssetReaderTrackOutput(track:track,outputSettings:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA])
        output.alwaysCopiesSampleData=false
        guard reader.canAdd(output) else { throw GalleryError.invalid("The exported movie could not be verified.") }
        reader.add(output)
        guard reader.startReading() else { throw reader.error ?? GalleryError.invalid("The exported movie could not be read.") }
        var count=0
        while let sample=output.copyNextSampleBuffer() {
            try Task.checkCancellation()
            let pts=CMSampleBufferGetPresentationTimeStamp(sample)
            guard abs(pts.seconds-schedule.seconds(for:Int64(count)))<=0.002 else {
                throw GalleryError.invalid("The exported timestamps are inconsistent.")
            }
            count+=1
            if count%60==0 { await Task.yield() }
        }
        guard reader.status == .completed,Int64(count)==schedule.totalFrames else { throw GalleryError.invalid("The exported frame count does not match the schedule.") }
        return count
    }
}

private final class WriterCompletion:@unchecked Sendable {
    private let lock=NSLock()
    private var finished=false
    func markFinished() { lock.lock();finished=true;lock.unlock() }
    var isFinished:Bool { lock.lock();defer{lock.unlock()};return finished }
}
