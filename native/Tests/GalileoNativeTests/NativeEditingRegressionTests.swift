import XCTest
import AVFoundation
import ImageIO
import CoreGraphics
import GalileoCore
@testable import GalileoNative

final class NativeEditingRegressionTests:XCTestCase {
    @MainActor func testOverBudgetImportKeepsExistingDocumentAndAcceptedImportSaves() async throws {
        let (p,ws)=try VerificationFixtures.workspace()
        var initial=p;initial.items=Array(p.items.prefix(1))
        let editor=try EditorSession(project:initial,workspace:ws)
        editor.importBudgetLimit=try ws.validateBudget(project:initial)
        editor.importURLs([try ws.url(for:p.items[1])])
        try await wait{!editor.importing}
        XCTAssertEqual(editor.project,initial);XCTAssertNotNil(editor.issue)
        editor.importBudgetLimit=MediaBudget.maximumProjectBytes;editor.issue=nil
        editor.importURLs([try ws.url(for:p.items[1])])
        try await wait{!editor.importing}
        XCTAssertNil(editor.issue);XCTAssertEqual(editor.project.items.count,2)
        let saved=ws.root.appendingPathComponent("Accepted.galileo")
        try NativeDocumentIO.writePackage(project:editor.project,workspace:ws,to:saved)
        XCTAssertEqual(try NativeDocumentIO.readPackage(saved).0,editor.project)
    }
    @MainActor func testRecoveryCopyRelinksWithoutLosingSpotlightAndDoesNotTouchOriginal() async throws {
        var (p,ws)=try VerificationFixtures.workspace();p.items[0].spotlight=Spotlight();p.items[0].sourceRate=0.5
        let package=ws.root.appendingPathComponent("Broken.galileo")
        try NativeDocumentIO.writePackage(project:p,workspace:ws,to:package)
        let originalManifest=try Data(contentsOf:package.appendingPathComponent("project.json"))
        try FileManager.default.removeItem(at:package.appendingPathComponent("Assets").appendingPathComponent(p.items[0].asset))
        XCTAssertThrowsError(try NativeDocumentIO.readPackage(package))
        let (copy,recovery)=try NativeDocumentIO.readPackage(package,allowRecovery:true)
        XCTAssertNotNil(copy.items[0].unavailable);XCTAssertEqual(copy.items[0].spotlight,p.items[0].spotlight)
        let snapshot=try RenderSnapshot(project:copy,workspace:recovery)
        _=try NativeRenderer().image(snapshot:snapshot,frame:0,maximumDimension:320)
        do {
            _=try await NativeExport.run(snapshot:snapshot,destination:ExportDestination(url:ws.root.appendingPathComponent("should-not-export.mp4")),stillFrame:0)
            XCTFail("Missing media was silently exported")
        } catch { }
        let editor=try EditorSession(project:copy,workspace:recovery)
        editor.importURLs([try ws.url(for:p.items[0])],replacing:p.items[0].id,expectedFingerprint:p.items[0].sha256)
        try await wait{!editor.importing}
        XCTAssertNil(editor.issue);XCTAssertNil(editor.project.items[0].unavailable)
        XCTAssertEqual(editor.project.items[0].id,p.items[0].id);XCTAssertEqual(editor.project.items[0].spotlight,p.items[0].spotlight)
        let saved=ws.root.appendingPathComponent("Recovered.galileo")
        try NativeDocumentIO.writePackage(project:editor.project,workspace:recovery,to:saved)
        XCTAssertEqual(try NativeDocumentIO.readPackage(saved).0,editor.project)
        XCTAssertEqual(try Data(contentsOf:package.appendingPathComponent("project.json")),originalManifest)
    }
    func testSavedAssetsAreIndependentAndCachedIntegrityDetectsChanges() throws {
        let (p,ws)=try VerificationFixtures.workspace(),file=try ws.url(for:p.items[0])
        let expected=try ws.verifiedFingerprint(file)
        let package=ws.root.appendingPathComponent("Independent.galileo")
        try NativeDocumentIO.writePackage(project:p,workspace:ws,to:package)
        let stored=package.appendingPathComponent("Assets").appendingPathComponent(p.items[0].asset)
        var bytes=try Data(contentsOf:stored);bytes[bytes.count-1] ^= 1;try bytes.write(to:stored)
        XCTAssertEqual(try Workspace.fingerprint(file),expected,"A saved file must not be a hard link to the editing source")
        let old=try ws.verifiedFingerprint(stored)
        bytes[bytes.count-2] ^= 1;try bytes.write(to:stored)
        XCTAssertNotEqual(try ws.verifiedFingerprint(stored),old)
    }
    func testPDFSelectedPagesRetainOriginalAndGeometry() async throws {
        let ws=try Workspace(),pdf=ws.root.appendingPathComponent("Deck.pdf")
        var bounds=CGRect(x:0,y:0,width:800,height:450)
        let consumer=try XCTUnwrap(CGDataConsumer(url:pdf as CFURL))
        let context=try XCTUnwrap(CGContext(consumer:consumer,mediaBox:&bounds,nil))
        for page in 0..<3 {
            context.beginPDFPage(nil);context.setFillColor(CGColor(red:Double(page)/3,green:0.5,blue:0.2,alpha:1))
            context.fill(CGRect(x:30,y:30,width:200,height:100));context.endPDFPage()
        }
        context.closePDF()
        XCTAssertEqual(try PDFImporter.pageCount(pdf),3)
        let imported=try await PDFImporter.importPages(pdf,workspace:ws,options:PDFImportOptions(pages:[0,2],maximumDimension:800,transparent:true))
        XCTAssertEqual(imported.count,2);XCTAssertEqual(imported[0].width,800);XCTAssertEqual(imported[0].height,450)
        XCTAssertEqual(imported[0].originalAsset,imported[1].originalAsset)
        var p=GalleryProject();p.items=imported
        XCTAssertEqual(try ws.managedSizes(project:p).count,3)
        let package=ws.root.appendingPathComponent("PDF.galileo")
        try NativeDocumentIO.writePackage(project:p,workspace:ws,to:package)
        let (restored,copy)=try NativeDocumentIO.readPackage(package)
        XCTAssertEqual(restored,p)
        XCTAssertEqual(try Workspace.fingerprint(copy.assets.appendingPathComponent(imported[0].originalAsset!)),imported[0].originalSHA256)
    }
    func testPreviewScalesPreparationBeforeRasterAndExportRangeStartsAtZero() async throws {
        var (p,ws)=try VerificationFixtures.workspace();p.canvas.width=3840;p.canvas.height=2160;p.scene=SceneCatalog.defaults(for:"vitrine");p.scene.shadow=0
        let renderer=NativeRenderer(),snapshot=try RenderSnapshot(project:p,workspace:ws)
        let start=ProcessInfo.processInfo.systemUptime
        for f in 0..<12 {_=try autoreleasepool{try renderer.image(snapshot:snapshot,frame:Int64(f),maximumDimension:640)}}
        let elapsed=ProcessInfo.processInfo.systemUptime-start
        XCTAssertLessThanOrEqual(renderer.largestPreparedLayer,640*640)
        print("PREVIEW MEASUREMENT 3840x2160→640: 12 frames, \(elapsed) seconds; largest prepared layer \(renderer.largestPreparedLayer) pixels; \(renderer.backend)")
        p.canvas.width=320;p.canvas.height=180;p.timing.durationMilliseconds=1000;p.export.format = .h264
        let output=try RenderSnapshot(project:p,workspace:ws),range=try ExportRange(start:5,end:15,total:output.plan.schedule.totalFrames)
        let movie=ws.root.appendingPathComponent("Range.mp4")
        let receipt=try await NativeExport.run(snapshot:output,destination:ExportDestination(url:movie),stillFrame:0,range:range)
        XCTAssertEqual(receipt.scheduledFrames,10);XCTAssertEqual(receipt.decodedFrames,10);XCTAssertEqual(receipt.sourceStartFrame,5)
        let audio=try await AVURLAsset(url:movie).loadTracks(withMediaType:.audio)
        XCTAssertTrue(audio.isEmpty,"Sound is not part of Galileo")
    }
    @MainActor func testQueueCompletesDistinctStillExportsSerially() async throws {
        var (p,ws)=try VerificationFixtures.workspace();p.canvas.width=320;p.canvas.height=180;p.export.format = .png
        let snapshot=try RenderSnapshot(project:p,workspace:ws),queue=ExportCenter()
        for name in ["One.png","Two.png"] {queue.start(snapshot:snapshot,destination:try ExportDestination(url:ws.root.appendingPathComponent(name)),stillFrame:0)}
        try await wait{!queue.busy && queue.pending.isEmpty}
        XCTAssertEqual(queue.history.count,2);XCTAssertTrue(queue.history.allSatisfy{$0.error==nil && $0.result != nil})
        for name in ["One.png","Two.png"] {try NativeExport.verifyPNG(ws.root.appendingPathComponent(name),width:320,height:180)}
    }
    @MainActor private func wait(_ predicate:()->Bool) async throws {
        let deadline=Date().addingTimeInterval(20)
        while !predicate() {if Date()>deadline {throw GalleryError.invalid("The operation stalled")};try await Task.sleep(nanoseconds:10_000_000)}
    }
}
