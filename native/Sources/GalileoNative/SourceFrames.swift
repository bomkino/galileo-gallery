import Foundation
import AVFoundation
import CoreImage
import ImageIO
import GalileoCore

struct DecodedSourceFrame {
    let image: CGImage
    let identity: String
    let interval: SourceInterval?
    init(image:CGImage,identity:String,interval:SourceInterval?=nil) {self.image=image;self.identity=identity;self.interval=interval}
}

/// Renderer-confined readers borrow Drift's covering-sample ownership model.
/// One clock supplies requests; decoders never run independent playback loops.
final class VideoFrameCursor {
    private let asset: AVURLAsset
    private let track: AVAssetTrack
    private let transform: CGAffineTransform
    private let context: CIContext
    private let maximumDimension: Int
    private var reader: AVAssetReader?
    private var output: AVAssetReaderTrackOutput?
    private var current: CMSampleBuffer?
    private var next: CMSampleBuffer?
    private var cached: DecodedSourceFrame?
    private var previousRequest: Double = -.infinity
    private(set) var decodedSamples=0
    private(set) var materializedFrames=0
    var estimatedBytes: Int { Int(abs(track.naturalSize.width*track.naturalSize.height))*8 }
    init(url: URL, maximumDimension: Int, context: CIContext) throws {
        asset=AVURLAsset(url:url); self.context=context;self.maximumDimension=maximumDimension
        guard let track=asset.tracks(withMediaType:.video).first else {throw GalleryError.invalid("The video has no decodable picture track.")}
        self.track=track;transform=track.preferredTransform
    }
    deinit { reader?.cancelReading() }
    private func read() throws -> CMSampleBuffer? {
        try Task.checkCancellation()
        let sample=output?.copyNextSampleBuffer()
        if let sample {
            guard CMSampleBufferGetPresentationTimeStamp(sample).seconds.isFinite,
                  CMSampleBufferGetImageBuffer(sample) != nil else {throw GalleryError.invalid("The decoder returned an invalid video sample.")}
            decodedSamples+=1
        } else if reader?.status == .failed {throw reader?.error ?? GalleryError.invalid("Video decoding failed.")}
        return sample
    }
    private func reset(at seconds:Double) throws {
        reader?.cancelReading();current=nil;next=nil;cached=nil
        let reader=try AVAssetReader(asset:asset)
        let output=AVAssetReaderTrackOutput(track:track,outputSettings:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA])
        output.alwaysCopiesSampleData=false
        guard reader.canAdd(output) else {throw GalleryError.invalid("The native decoder could not attach the picture track.")}
        reader.add(output)
        if seconds>2 {
            // Decode from before the target to retain the covering VFR sample.
            let start=max(0,seconds-2)
            reader.timeRange=CMTimeRange(start:CMTime(seconds:start,preferredTimescale:600000),end:asset.duration)
        }
        self.reader=reader;self.output=output
        guard reader.startReading() else {throw reader.error ?? GalleryError.invalid("The native video reader could not start.")}
        current=try read();next=try read()
    }
    func frame(at seconds:Double, fingerprint:String, exact:Bool=false) throws -> DecodedSourceFrame {
        let target=max(0,seconds)
        if current==nil || target+1e-8 < CMSampleBufferGetPresentationTimeStamp(current!).seconds || target-previousRequest>2 {
            try reset(at:target)
        }
        if exact,let current,try SourceTime(CMSampleBufferGetPresentationTimeStamp(current)).compared(to:target) == .orderedDescending {try reset(at:0)}
        previousRequest=target
        let deadline=ProcessInfo.processInfo.systemUptime+StillResolutionLimits.interactiveSeconds
        var inspected=0
        func atOrBefore(_ sample:CMSampleBuffer)throws->Bool {
            if exact {return try SourceTime(CMSampleBufferGetPresentationTimeStamp(sample)).compared(to:target) != .orderedDescending}
            return CMSampleBufferGetPresentationTimeStamp(sample).seconds<=target+1e-8
        }
        while let lookahead=next,try atOrBefore(lookahead) {
            inspected+=1
            if exact, inspected>StillResolutionLimits.maximumInspectedSamples || ProcessInfo.processInfo.systemUptime>deadline {throw GalleryError.invalid("Source audition reached its work limit. Retry the seek.")}
            current=lookahead;cached=nil;next=try read()
        }
        guard let sample=current,let buffer=CMSampleBufferGetImageBuffer(sample) else {
            throw GalleryError.invalid("The video did not produce a frame at the requested time.")
        }
        let pts=CMSampleBufferGetPresentationTimeStamp(sample)
        guard pts.seconds <= target+0.002 else {throw GalleryError.invalid("The video contains a gap at the requested time.")}
        let duration=CMSampleBufferGetDuration(sample)
        var interval:SourceInterval?
        if exact {interval=try VideoPresentationTiming.interval(track:track,pts:pts,duration:duration)}
        else if duration.isNumeric,CMTimeCompare(duration,.zero)>0 {interval=try? SourceInterval(start:SourceTime(pts),end:SourceTime(CMTimeAdd(pts,duration)))}
        if exact,interval?.contains(seconds:target) != true {throw GalleryError.invalid("No source picture covers this audition time.")}
        if let cached {return cached}
        let bitmap=try prepareSourceBitmap(buffer:buffer,transform:transform,maximumDimension:maximumDimension,context:context)
        let result=DecodedSourceFrame(image:bitmap,identity:"\(fingerprint):v\(pts.value)/\(pts.timescale):m\(maximumDimension)",interval:interval)
        cached=result;materializedFrames+=1;return result
    }
}

final class ImageFrameIndex {
    let source: CGImageSource
    let ends:[Double]
    init(url:URL,animated:Bool) throws {
        guard let source=CGImageSourceCreateWithURL(url as CFURL,[kCGImageSourceShouldCache:false] as CFDictionary) else {throw GalleryError.invalid("The image source could not be opened.")}
        self.source=source
        var end=0.0,ends=[Double]()
        if animated {
            for index in 0..<CGImageSourceGetCount(source) {
                let properties=CGImageSourceCopyPropertiesAtIndex(source,index,nil) as? [CFString:Any] ?? [:]
                end+=ImageSequenceTiming.delay(properties:properties) ?? 0.1;ends.append(end)
            }
        }
        self.ends=ends
    }
    func index(at seconds:Double)->Int {
        guard !ends.isEmpty else{return 0}
        var low=0,high=ends.count
        while low<high {let mid=(low+high)/2;if seconds<ends[mid] {high=mid}else{low=mid+1}}
        return min(ends.count-1,low)
    }
}

func prepareSourceBitmap(buffer:CVPixelBuffer,transform:CGAffineTransform,maximumDimension:Int,context:CIContext)throws->CGImage {
        var image=CIImage(cvPixelBuffer:buffer).transformed(by:transform)
        image=image.transformed(by:CGAffineTransform(translationX:-image.extent.minX,y:-image.extent.minY))
        let factor=min(1,Double(maximumDimension)/max(image.extent.width,image.extent.height))
        if factor<1 {image=image.applyingFilter("CILanczosScaleTransform",parameters:[kCIInputScaleKey:factor,kCIInputAspectRatioKey:1])}
        guard let bitmap=context.createCGImage(image,from:image.extent.integral,format:.RGBA8,colorSpace:CGColorSpace(name:CGColorSpace.sRGB)) else {
            throw GalleryError.invalid("The decoded video sample could not be prepared.")
        }
    return bitmap
}
