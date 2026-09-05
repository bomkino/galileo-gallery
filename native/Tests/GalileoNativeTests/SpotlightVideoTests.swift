import XCTest
import AVFoundation
import CoreImage
import GalileoCore
@testable import GalileoNative

final class SpotlightVideoTests: XCTestCase {
    func testThreeSecondVideoLoopsDuringEightSecondCentreHoldInSavedAndExportedProject() async throws {
        var (project, workspace) = try VerificationFixtures.workspace()
        let video = try await VerificationFixtures.loopingVideo(workspace: workspace)
        XCTAssertEqual(video.duration ?? 0, 3, accuracy: 0.04)
        project.items.insert(video, at: 1)
        var spotlight = Spotlight(); spotlight.holdMilliseconds = 8000; spotlight.scale = 0.85
        project.items[1].spotlight = spotlight
        project.canvas.width = 320; project.canvas.height = 180
        project.scene = SceneCatalog.defaults(for: "swipe-stack")
        project.scene.shadow = 0; project.scene.radius = 0
        project.timing.durationMilliseconds = 3000
        project.export.frameRate = FrameRate(30); project.export.format = .h264
        let package = workspace.root.appendingPathComponent("Video spotlight.galileo")
        try NativeDocumentIO.writePackage(project: project, workspace: workspace, to: package)
        let (restored, restoredWorkspace) = try NativeDocumentIO.readPackage(package)
        XCTAssertEqual(restored, project)
        let snapshot = try RenderSnapshot(project: restored, workspace: restoredWorkspace)
        let cue = try XCTUnwrap(snapshot.plan.spotlights.first)
        XCTAssertEqual(cue.holdFrames, 240)
        let renderer = NativeRenderer()
        // Stay away from colour boundaries and test beyond one complete source loop.
        let sampleFrames = [cue.holdStartFrame + 5, cue.holdStartFrame + 35,
                            cue.holdStartFrame + 95, cue.holdEndFrame - 5]
        var preview = [Int64: [UInt8]]()
        for frame in sampleFrames {
            preview[frame] = try centre(renderer.image(snapshot: snapshot, frame: frame))
            let source = try XCTUnwrap(snapshot.plan.evaluate(frame: frame).first { $0.itemID == video.id })
            let expectedChannel = min(2, Int(source.sourceTime))
            let actual = try XCTUnwrap(preview[frame])
            XCTAssertGreaterThan(Int(actual[expectedChannel]), 180, "The held video stopped playing.")
            for other in 0..<3 where other != expectedChannel { XCTAssertLessThan(Int(actual[other]), 60) }
        }
        XCTAssertNotEqual(preview[sampleFrames[0]], preview[sampleFrames[1]])
        XCTAssertEqual(preview[sampleFrames[0]], preview[sampleFrames[2]])
        let movie = workspace.root.appendingPathComponent("spotlight.mp4")
        let receipt = try await NativeExport.run(snapshot: snapshot, destination: ExportDestination(url: movie), stillFrame: 0)
        XCTAssertEqual(receipt.decodedFrames, Int(snapshot.plan.schedule.totalFrames))
        // Independent AVFoundation decoding of the finished movie, not the render hash.
        let asset = AVURLAsset(url: movie), reader = try AVAssetReader(asset: asset)
        let track = try XCTUnwrap(try await asset.loadTracks(withMediaType: .video).first)
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ])
        reader.add(output); XCTAssertTrue(reader.startReading())
        let context = CIContext(options: [.useSoftwareRenderer: true])
        var seen = Set<Int64>()
        while let sample = output.copyNextSampleBuffer() {
            let timestamp = CMSampleBufferGetPresentationTimeStamp(sample)
            let frame = Int64((CMTimeGetSeconds(timestamp) * 30).rounded())
            guard let expected = preview[frame] else { continue }
            let buffer = try XCTUnwrap(CMSampleBufferGetImageBuffer(sample))
            let image = CIImage(cvPixelBuffer: buffer)
            let cgImage = try XCTUnwrap(context.createCGImage(image, from: image.extent))
            let actual = try centre(cgImage)
            for channel in 0..<3 {
                XCTAssertEqual(Int(actual[channel]), Int(expected[channel]), accuracy: 18,
                               "Export and preview disagree on the held video at frame \(frame).")
            }
            seen.insert(frame)
        }
        XCTAssertEqual(reader.status, .completed)
        XCTAssertEqual(seen, Set(sampleFrames))
    }

    @MainActor func testSpotlightEditsAreUndoableAndReplacementRetainsIntent() async throws {
        let (project, workspace) = try VerificationFixtures.workspace()
        let editor = try EditorSession(project: project, workspace: workspace)
        let manager = UndoManager(); manager.groupsByEvent = false; editor.undoManager = manager
        editor.selection = [project.items[0].id]
        editor.editSelected("Spotlight") { $0.spotlight = Spotlight() }
        manager.undo(); XCTAssertEqual(editor.project, project)
        manager.redo(); XCTAssertTrue(editor.project.items[0].spotlight?.enabled == true)
        editor.editSelected("Hold") { $0.spotlight?.holdMilliseconds = 8000 }
        let setting = editor.project.items[0].spotlight
        editor.importURLs([try workspace.url(for: project.items[1])], replacing: project.items[0].id)
        let deadline = Date().addingTimeInterval(10)
        while editor.importing {
            guard Date() < deadline else { return XCTFail("Replacement stalled.") }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTAssertNil(editor.issue)
        XCTAssertEqual(editor.project.items[0].spotlight, setting)
        XCTAssertEqual(editor.project.items[0].sha256, project.items[1].sha256)
        manager.undo(); XCTAssertEqual(editor.project.items[0].sha256, project.items[0].sha256)
        XCTAssertEqual(editor.project.items[0].spotlight, setting)
    }

    private func centre(_ image: CGImage) throws -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
        try bytes.withUnsafeMutableBytes { buffer in
            guard let context = CGContext(data: buffer.baseAddress, width: image.width, height: image.height,
                                          bitsPerComponent: 8, bytesPerRow: image.width * 4,
                                          space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)
            else { throw GalleryError.invalid("Pixel test allocation failed.") }
            context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        }
        let offset = ((image.height / 2) * image.width + image.width / 2) * 4
        return Array(bytes[offset..<offset+3])
    }
}
