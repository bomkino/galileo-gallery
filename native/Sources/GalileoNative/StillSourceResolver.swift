import Foundation
import AVFoundation
import CoreImage
import ImageIO
import GalileoCore

public struct ResolvedStillFrame: Sendable, Equatable {
    public let interval: SourceInterval
    public let sampleIdentity: String
    public let trackID: Int32
    public let imageIndex: Int?
}

/// Cooperative limits; a codec call already executing cannot be forcibly interrupted.
public enum StillResolutionLimits {
    public static let interactiveSeconds=30.0
    public static let exportSeconds=120.0
    public static let maximumInspectedSamples=1_000_000
}

private final class StillResolutionBox: NSObject {
    let value:ResolvedStillFrame
    init(_ value:ResolvedStillFrame) {self.value=value}
}

/// Shared immutable results; cold readers are confined to the caller's worker.
/// One cold metadata scan and two still-image jobs across all consumers.
public final class StillSourceResolver: @unchecked Sendable {
    public static let shared=StillSourceResolver()
    private let metadataJobs=StillJobs<ResolvedStillFrame>(concurrency:1)
    private let imageJobs=StillJobs<DecodedSourceFrame>(concurrency:2)
    private let resolutions=NSCache<NSString,StillResolutionBox>()
    private var images:NSCache<NSString,ImageBox> {RenderResources.shared.decoded}
    private var pressure:DispatchSourceMemoryPressure?
    private let countLock=NSLock()
    private var scans=0,samples=0,bitmaps=0,hits=0
    public var counters:[String:Int] {countLock.lock();defer{countLock.unlock()};return ["metadataScans":scans,"inspectedSamples":samples,"materializedFrames":bitmaps,"cacheHits":hits,"pendingMetadata":metadataJobs.pending,"pendingImages":imageJobs.pending]}
    private init() {
        resolutions.countLimit=512
        let source=DispatchSource.makeMemoryPressureSource(eventMask:[.warning,.critical],queue:.global(qos:.utility))
        source.setEventHandler {[weak self] in self?.clear()};source.resume();pressure=source
    }
    public func clear() {resolutions.removeAllObjects();images.removeAllObjects()}
    private func count(scan:Int=0,sample:Int=0,bitmap:Int=0,hit:Int=0) {countLock.lock();scans+=scan;samples+=sample;bitmaps+=bitmap;hits+=hit;countLock.unlock()}
    private func check(deadline:Double,count:Int)throws {
        guard ProcessInfo.processInfo.systemUptime < deadline,count <= StillResolutionLimits.maximumInspectedSamples else {
            throw GalleryError.invalid("Source-frame resolution reached its work limit. Retry, or shorten the source trim.")
        }
    }
    private func key(item:MediaItem,selection:StillFrameSelection,range:SourceRange)throws->String {
        let data=try JSONEncoder().encode(selection)
        return "\(item.sha256):\(item.originalSHA256 ?? ""): \(item.derivation ?? "native"):\(item.kind.rawValue):\(range.start.bitPattern):\(range.end.bitPattern):\(data.base64EncodedString())"
    }
    public func resolve(item:MediaItem,selection:StillFrameSelection,range:SourceRange,workspace:Workspace,export:Bool=false,nearestTo:SourceTime?=nil)throws->ResolvedStillFrame {
        try Task.checkCancellation()
        guard item.kind != .image,item.unavailable == nil else {throw GalleryError.missing("This item has no available time-based source.")}
        if nearestTo == nil {try selection.validate(in:range,duration:item.duration ?? 0)}
        let url=try workspace.url(for:item)
        guard try workspace.verifiedFingerprint(url)==item.sha256 else {throw GalleryError.invalid("The source changed before frame selection.")}
        let key=(try key(item:item,selection:selection,range:range)) + (nearestTo.map{"nearest:\($0.value)/\($0.timescale)"} ?? "") as NSString
        if let cached=resolutions.object(forKey:key) {count(hit:1);return cached.value}
        return try metadataJobs.run(key:key as String,timeout:export ? StillResolutionLimits.exportSeconds:StillResolutionLimits.interactiveSeconds) { [self,workspace] checkSubscribers in
        defer {withExtendedLifetime(workspace) {}}
        let deadline=ProcessInfo.processInfo.systemUptime+StillResolutionLimits.exportSeconds
        if let cached=resolutions.object(forKey:key) {count(hit:1);return cached.value}
        count(scan:1)
        var selector=try StillIntervalSelector(selection:nearestTo == nil ? selection:.last,range:range)
        var closest:(SourceInterval,CMTime)?
        func inspect(_ interval:SourceInterval)throws {
            guard let anchor=nearestTo else {try selector.inspect(interval);return}
            guard interval.intersects(range) else {return}
            let distance:CMTime
            if anchor<interval.start {distance=CMTimeSubtract(interval.start.cmTime,anchor.cmTime)}
            else if anchor>=interval.end {distance=CMTimeSubtract(anchor.cmTime,interval.end.cmTime)}
            else {distance = .zero}
            guard distance.isNumeric,!distance.flags.contains(.hasBeenRounded) else {throw GalleryError.invalid("The frame adjustment exceeds source-time precision.")}
            if let prior=closest {
                let order=CMTimeCompare(distance,prior.1)
                if order>0 || (order==0 && interval.start>=prior.0.start) {return}
            }
            closest=(interval,distance)
        }
        func finish()throws->SourceInterval {
            if nearestTo != nil {
                guard let closest else {throw GalleryError.invalid("No valid source picture intersects the new trim.")}
                return closest.0
            }
            return try selector.finish()
        }
        let result:ResolvedStillFrame
        if item.kind == .video {
            let asset=AVURLAsset(url:url)
            guard let track=asset.tracks(withMediaType:.video).first else {throw GalleryError.invalid("The source has no video track.")}
            // Native sample-table navigation stays in presentation order and reads
            // declared durations without decoding an entire movie's pictures.
            guard let cursor=track.makeSampleCursorAtFirstSampleInDecodeOrder() else {
                throw GalleryError.invalid("This source cannot provide exact sample timing.")
            }
            _=cursor.stepInPresentationOrder(byCount: -Int64.max)
            var inspected=0
            repeat {
                inspected+=1;try checkSubscribers();try check(deadline:deadline,count:inspected)
                try inspect(VideoPresentationTiming.interval(track:track,pts:cursor.presentationTimeStamp,duration:cursor.currentSampleDuration))
            } while cursor.stepInPresentationOrder(byCount:1)==1
            count(sample:inspected)
            let interval=try finish()
            result=ResolvedStillFrame(interval:interval,sampleIdentity:"\(item.sha256):track\(track.trackID):\(interval.start.value)/\(interval.start.timescale)",trackID:track.trackID,imageIndex:nil)
        } else {
            let index=try ImageFrameIndex(url:url,animated:true)
            let intervals=try index.exactIntervals()
            for (number,interval) in intervals.enumerated() {try checkSubscribers();try check(deadline:deadline,count:number);try inspect(interval)}
            count(sample:intervals.count)
            let interval=try finish()
            guard let number=intervals.firstIndex(of:interval) else {throw GalleryError.invalid("The animation picture could not be identified.")}
            result=ResolvedStillFrame(interval:interval,sampleIdentity:"\(item.sha256):image\(number)",trackID:0,imageIndex:number)
        }
        try checkSubscribers();try check(deadline:deadline,count:0)
        resolutions.setObject(StillResolutionBox(result),forKey:key);return result
        }
    }
    func image(item:MediaItem,resolved:ResolvedStillFrame,workspace:Workspace,maximumDimension:Int,context:CIContext,export:Bool=false)throws->DecodedSourceFrame {
        try Task.checkCancellation()
        let url=try workspace.url(for:item)
        guard try workspace.verifiedFingerprint(url)==item.sha256 else {throw GalleryError.invalid("The selected source changed before decoding.")}
        let key="\(resolved.sampleIdentity):m\(maximumDimension)" as NSString
        if let cached=images.object(forKey:key) {count(hit:1);return DecodedSourceFrame(image:cached.image,identity:key as String)}
        return try imageJobs.run(key:key as String,timeout:export ? StillResolutionLimits.exportSeconds:StillResolutionLimits.interactiveSeconds) { [self,workspace] checkSubscribers in
        defer {withExtendedLifetime(workspace) {}}
        let deadline=ProcessInfo.processInfo.systemUptime+StillResolutionLimits.exportSeconds
        if let cached=images.object(forKey:key) {count(hit:1);return DecodedSourceFrame(image:cached.image,identity:key as String)}
        let image:CGImage
        if let number=resolved.imageIndex {
            guard let source=CGImageSourceCreateWithURL(url as CFURL,[kCGImageSourceShouldCache:false] as CFDictionary),
                  let bitmap=CGImageSourceCreateThumbnailAtIndex(source,number,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:maximumDimension,kCGImageSourceShouldCacheImmediately:true] as CFDictionary) else {throw GalleryError.invalid("The selected animation picture could not be decoded.")}
            image=bitmap
        } else {
            let asset=AVURLAsset(url:url)
            guard let track=asset.tracks(withMediaType:.video).first,track.trackID==resolved.trackID else {throw GalleryError.invalid("The source picture track changed.")}
            let reader=try AVAssetReader(asset:asset),output=AVAssetReaderTrackOutput(track:track,outputSettings:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA])
            output.alwaysCopiesSampleData=false
            guard reader.canAdd(output) else {throw GalleryError.invalid("The selected video track could not be decoded.")}
            reader.add(output)
            // Seek to the checked sample's PTS, never duration minus epsilon.
            let target=resolved.interval.start.cmTime
            reader.timeRange=CMTimeRange(start:target,end:asset.duration)
            guard reader.startReading() else {throw reader.error ?? GalleryError.invalid("Selected-picture decoding could not start.")}
            defer{reader.cancelReading()}
            guard let sample=output.copyNextSampleBuffer(),CMTimeCompare(CMSampleBufferGetPresentationTimeStamp(sample),target)==0,
                  let buffer=CMSampleBufferGetImageBuffer(sample) else {throw GalleryError.invalid("The decoder did not return the exact selected source picture.")}
            image=try prepareSourceBitmap(buffer:buffer,transform:track.preferredTransform,maximumDimension:maximumDimension,context:context)
        }
        try checkSubscribers();try check(deadline:deadline,count:0);count(bitmap:1)
        images.setObject(ImageBox(image),forKey:key,cost:image.bytesPerRow*image.height)
        return DecodedSourceFrame(image:image,identity:key as String)
        }
    }
}

extension SourceTime {
    init(_ time:CMTime)throws {
        guard time.isNumeric,!time.flags.contains(.hasBeenRounded) else {throw GalleryError.invalid("The source returned an inexact timestamp.")}
        try self.init(value:time.value,timescale:time.timescale)
    }
    var cmTime:CMTime {CMTime(value:value,timescale:timescale)}
    /// Recover a compact rational from native animation-delay metadata.
    static func nativeDelay(_ seconds:Double)throws->SourceTime {
        guard seconds.isFinite,seconds>0,seconds<=86400 else {throw GalleryError.invalid("The animation has an invalid frame delay.")}
        var x=seconds,n0:Int64=0,n1:Int64=1,d0:Int64=1,d1:Int64=0
        for _ in 0..<32 {
            let whole=floor(x)
            guard whole<=Double(Int32.max) else {break}
            let a=Int64(whole),p=a.multipliedReportingOverflow(by:n1),q=a.multipliedReportingOverflow(by:d1)
            if p.overflow || q.overflow {break}
            let np=p.partialValue.addingReportingOverflow(n0),dq=q.partialValue.addingReportingOverflow(d0)
            if np.overflow || dq.overflow || dq.partialValue>Int32.max {break}
            let n=np.partialValue,d=dq.partialValue
            if d>0,Double(n)/Double(d)==seconds {return try SourceTime(value:n,timescale:Int32(d))}
            (n0,n1,d0,d1)=(n1,n,d1,d)
            let fraction=x-whole;if fraction==0 {break};x=1/fraction
        }
        throw GalleryError.invalid("The animation delay cannot be represented exactly by native source time.")
    }
}

extension ImageFrameIndex {
    func exactIntervals()throws->[SourceInterval] {
        var start=CMTime.zero,result=[SourceInterval]()
        for number in 0..<CGImageSourceGetCount(source) {
            let properties=CGImageSourceCopyPropertiesAtIndex(source,number,nil) as? [CFString:Any] ?? [:]
            let delay=try SourceTime.nativeDelay(ImageSequenceTiming.delay(properties:properties) ?? 0.1)
            let end=CMTimeAdd(start,delay.cmTime)
            result.append(try SourceInterval(start:SourceTime(start),end:SourceTime(end)));start=end
        }
        return result
    }
}

extension SourceInterval {
    /// Anchor inside both half-open ranges; never save a rounded endpoint outside the trim.
    public func anchor(in range:SourceRange,preferred:SourceTime?=nil)throws->SourceTime {
        if let preferred,range.contains(preferred),contains(preferred) {return preferred}
        let lower=max(range.start,start.seconds),upper=min(range.end,end.seconds)
        guard lower<upper else {throw GalleryError.invalid("The selected picture no longer intersects the trim.")}
        let useEnd=preferred.map{$0.compared(to:upper) != .orderedAscending} ?? false
        let raw=CMTime(seconds:useEnd ? upper:lower,preferredTimescale:600_000_000)
        for adjustment:Int64 in useEnd ? [0,-1]:[0,1] {
            let time=try SourceTime(value:raw.value+adjustment,timescale:raw.timescale)
            if range.contains(time),contains(time) {return time}
        }
        throw GalleryError.invalid("This trim is too narrow to store an exact in-range frame anchor. Widen it slightly.")
    }
}

extension SourceInterval {
    public func anchor(in range:SourceRange,preferredSeconds:Double)throws->SourceTime {
        guard preferredSeconds.isFinite else {throw GalleryError.invalid("The source position is invalid.")}
        let time=CMTime(seconds:preferredSeconds,preferredTimescale:600_000_000)
        return try anchor(in:range,preferred:SourceTime(value:time.value,timescale:time.timescale))
    }
}
