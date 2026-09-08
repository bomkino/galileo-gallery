import XCTest
import AVFoundation
import CoreImage
import GalileoCore
@testable import GalileoNative

final class StillSourceResolverTests:XCTestCase {
    func testExactLastCoveringSampleAndImmutableTierReuse() async throws {
        let workspace=try Workspace(),item=try await VerificationFixtures.loopingVideo(workspace:workspace)
        let resolver=StillSourceResolver.shared,context=CIContext(options:[.useSoftwareRenderer:true])
        let range=try SourceRange(start:0,end:3)
        let first=try resolver.resolve(item:item,selection:.first,range:range,workspace:workspace)
        let middle=try resolver.resolve(item:item,selection:.middle,range:range,workspace:workspace)
        let last=try resolver.resolve(item:item,selection:.last,range:range,workspace:workspace)
        XCTAssertEqual(first.interval.start,try SourceTime(value:0,timescale:1))
        XCTAssertEqual(middle.interval.start,try SourceTime(value:3,timescale:2))
        XCTAssertEqual(last.interval.start,try SourceTime(value:89,timescale:30))
        // Fixture independently declares red, green and blue one-second segments.
        for (resolved,channel) in [(first,0),(middle,1),(last,2)] {
            let picture=try resolver.image(item:item,resolved:resolved,workspace:workspace,maximumDimension:64,context:context)
            let pixel=try centre(picture.image)
            XCTAssertGreaterThan(pixel[channel],180)
            for other in 0..<3 where other != channel {XCTAssertLessThan(pixel[other],60)}
        }
        let cached=resolver.counters
        XCTAssertEqual(try resolver.resolve(item:item,selection:.last,range:range,workspace:workspace),last)
        _=try resolver.image(item:item,resolved:last,workspace:workspace,maximumDimension:64,context:context)
        XCTAssertEqual(resolver.counters["metadataScans"],cached["metadataScans"])
        XCTAssertEqual(resolver.counters["materializedFrames"],cached["materializedFrames"])
        let exclusive=try resolver.resolve(item:item,selection:.last,range:SourceRange(start:0,end:2),workspace:workspace)
        XCTAssertEqual(exclusive.interval.start,try SourceTime(value:59,timescale:30),"The frame at exclusive end must not win")
        let partial=try SourceRange(start:0.01,end:0.02)
        XCTAssertEqual(try resolver.resolve(item:item,selection:.first,range:partial,workspace:workspace).interval.start,first.interval.start)
        XCTAssertEqual(try resolver.resolve(item:item,selection:.custom(SourceTime(value:15,timescale:1000)),range:partial,workspace:workspace).interval.start,first.interval.start)
        let custom=try StillFrameSelection.custom(SourceTime(value:15,timescale:1000))
        let customScans=resolver.counters["metadataScans"]
        for _ in 0..<8 {_=try resolver.resolve(item:item,selection:custom,range:partial,workspace:workspace)}
        XCTAssertEqual(resolver.counters["metadataScans"],customScans,"Equivalent Custom payloads must have one stable cache key")
        // An independent audition cursor keeps playing after terminal extraction.
        let renderer=NativeRenderer()
        _=try renderer.sourcePreview(item:item,seconds:0.1,workspace:workspace,maximumDimension:64)
        let decoded=renderer.decodedVideoSamples
        _=try resolver.image(item:item,resolved:last,workspace:workspace,maximumDimension:128,context:context)
        _=try renderer.sourcePreview(item:item,seconds:0.11,workspace:workspace,maximumDimension:64)
        XCTAssertEqual(renderer.decodedVideoSamples,decoded,"A frozen duplicate must not disturb the playing reader")
    }
    func testCacheCannotHideChangedSourceBytes() async throws {
        let workspace=try Workspace(),item=try await VerificationFixtures.loopingVideo(workspace:workspace)
        let resolver=StillSourceResolver.shared,range=try SourceRange(start:0,end:3)
        _=try resolver.resolve(item:item,selection:.last,range:range,workspace:workspace)
        try Data("damaged".utf8).write(to:workspace.url(for:item))
        XCTAssertThrowsError(try resolver.resolve(item:item,selection:.last,range:range,workspace:workspace))
    }
    func testNativeAnimationDelayRationals() throws {
        for (seconds,value,scale):(Double,Int64,Int32) in [(0.04,1,25),(0.1,1,10),(1.0/30,1,30),(1.65,33,20)] {
            XCTAssertEqual(try SourceTime.nativeDelay(seconds),try SourceTime(value:value,timescale:scale))
        }
        XCTAssertThrowsError(try SourceTime.nativeDelay(.nan))
        XCTAssertThrowsError(try SourceTime.nativeDelay(0))
    }
    private func centre(_ image:CGImage)throws->[UInt8] {
        var bytes=[UInt8](repeating:0,count:4)
        try bytes.withUnsafeMutableBytes { raw in
            let context=try XCTUnwrap(CGContext(data:raw.baseAddress,width:1,height:1,bitsPerComponent:8,bytesPerRow:4,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue|CGBitmapInfo.byteOrder32Big.rawValue))
            context.draw(image,in:CGRect(x:0,y:0,width:1,height:1))
        }
        return Array(bytes.prefix(3))
    }
}
