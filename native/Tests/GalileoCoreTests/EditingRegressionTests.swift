import XCTest
@testable import GalileoCore

final class EditingRegressionTests:XCTestCase {
    private func project(_ count:Int,_ variant:String)->GalleryProject {
        var p=GalleryProject();p.canvas.width=1920;p.canvas.height=1080
        p.scene=SceneCatalog.defaults(for:variant);p.timing.durationMilliseconds=10000;p.timing.playMode = .loop
        p.items=(0..<count).map { i in MediaItem(name:"Card \(i)",asset:"\(i).png",sha256:String(repeating:"a",count:64),kind:.image,width:1600,height:900) }
        return p
    }
    func testUniqueMediaBudgetRejectsOverrunWithoutLargeFixtures() throws {
        XCTAssertEqual(try MediaBudget.total(["a.png":7,"b.png":3],limit:10),10)
        XCTAssertThrowsError(try MediaBudget.total(["a.png":7,"b.png":4],limit:10))
        XCTAssertThrowsError(try MediaBudget.total(["../a.png":1],limit:10))
        XCTAssertThrowsError(try MediaBudget.total(["a.png":-1],limit:10))
    }
    func testReplacementRetainsVideoRateTrimAndExplainsShortening() {
        var old=MediaItem(name:"Old",asset:"a.mov",sha256:String(repeating:"a",count:64),kind:.video,width:1600,height:900,duration:10)
        old.sourceRate=0.5;old.trimStart=3;old.trimEnd=8;old.spotlight=Spotlight()
        let longer=MediaItem(name:"New",asset:"b.mov",sha256:String(repeating:"b",count:64),kind:.video,width:1600,height:900,duration:15)
        let kept=Replacement.preserving(old,with:longer)
        XCTAssertEqual(kept.0.sourceRate,0.5);XCTAssertEqual(kept.0.trimStart,3);XCTAssertEqual(kept.0.trimEnd,8);XCTAssertNil(kept.1)
        var shorter=longer;shorter.duration=2
        let adjusted=Replacement.preserving(old,with:shorter)
        XCTAssertLessThan(adjusted.0.trimStart,2);XCTAssertEqual(adjusted.0.trimEnd,2);XCTAssertNotNil(adjusted.1)
        XCTAssertEqual(adjusted.0.spotlight,old.spotlight)
    }
    func testThirteenthOrbitSourceDoesNotJumpAtFormerSlotBoundary() throws {
        for id in ["orbit-ring","proximity-orbit","spin-image-orbit","zoetrope","spiral-image-vortex"] {
            let p=project(13,id),plan=try RenderPlan(project:p)
            let a=Dictionary(uniqueKeysWithValues:plan.evaluate(frame:23).map{($0.itemID,$0)})
            let b=plan.evaluate(frame:24)
            for card in b where a[card.itemID] != nil {
                let previous=a[card.itemID]!
                if previous.intersects(width:1920,height:1080) && card.intersects(width:1920,height:1080) {
                    XCTAssertLessThan(hypot(card.center.x-previous.center.x,card.center.y-previous.center.y),100,id)
                }
            }
        }
    }
    func testOrreryPrimaryNeverBecomesAnOrbitingCopy() throws {
        for count in [13,14,25] {
            let p=project(count,"the-orrery"),plan=try RenderPlan(project:p)
            for frame in [Int64(0),24,100,299] {
                XCTAssertEqual(plan.evaluate(frame:frame).filter{$0.itemID==p.items[0].id}.count,1)
            }
        }
    }
    func testVitrineCompletesExitBeforeRemovingOutgoingArtwork() throws {
        var p=project(3,"vitrine");p.timing.durationMilliseconds=9000
        let plan=try RenderPlan(project:p),id=p.items[0].id
        let leaving=try XCTUnwrap(plan.evaluate(frame:89).first{$0.itemID==id})
        XCTAssertFalse(leaving.intersects(width:1920,height:1080))
        XCTAssertFalse(plan.evaluate(frame:90).contains{$0.itemID==id})
    }
    func testPagedTableHandoffAndLoopReturnMeetSamePoses() throws {
        for id in ["contact-sheet","light-table","deck-contact-strip","the-hang"] {
            let p=project(id=="the-hang" ? 9:13,id),plan=try RenderPlan(project:p)
            let start=plan.evaluate(frame:0),end=plan.evaluate(frame:plan.schedule.totalFrames-1)
            for card in start where card.intersects(width:1920,height:1080) {
                let match=try XCTUnwrap(end.first{$0.itemID==card.itemID},id)
                XCTAssertLessThan(hypot(card.center.x-match.center.x,card.center.y-match.center.y),30,id)
            }
        }
    }
    func testBuildCentreHoldContainsTheEntireAssembledImage() throws {
        var p=project(1,"the-build");p.timing.holdFraction=0.10;p.items[0].spotlight=Spotlight()
        let plan=try RenderPlan(project:p),cue=try XCTUnwrap(plan.spotlights.first)
        let held=plan.evaluate(frame:cue.holdStartFrame+1)
        XCTAssertEqual(held.count,6)
        for card in held {XCTAssertEqual(card.center.x,960,accuracy:0.001);XCTAssertEqual(card.center.y,540,accuracy:0.001)}
        XCTAssertEqual(held.compactMap(\.slice).reduce(0){$0+$1.width},1,accuracy:0.001)
    }
    func testHitTestingRespectsRevealsAndSlices() {
        let item=project(1,"cms-slideshow").items[0]
        var c=SceneCard(item:item,x:100,y:100,width:100,height:100,seconds:0)
        c.reveal=0;XCTAssertFalse(c.contains(Point(100,100),perspective:1000))
        c.reveal=0.5;XCTAssertTrue(c.contains(Point(75,100),perspective:1000));XCTAssertFalse(c.contains(Point(125,100),perspective:1000))
        c.reveal=nil;var slice=Crop();slice.width=0.25;c.slice=slice
        XCTAssertTrue(c.contains(Point(60,100),perspective:1000));XCTAssertFalse(c.contains(Point(100,100),perspective:1000))
    }
    func testClosingDoesNotReorderForeverAndPersistsInFiniteMode() throws {
        var p=project(3,"cms-slideshow");p.items[0].closing=true
        XCTAssertEqual(p.activeItems.map(\.id),p.items.map(\.id))
        XCTAssertFalse(try RenderPlan(project:p).spotlights.contains(where:\.closing))
        p.timing.playMode = .once
        let plan=try RenderPlan(project:p),cue=try XCTUnwrap(plan.spotlights.last)
        XCTAssertTrue(cue.closing);XCTAssertEqual(cue.endFrame,plan.schedule.cycleFrames)
        XCTAssertEqual(plan.items.last?.id,p.items[0].id)
    }
    func testPDFSelectionsAndExportRangesRejectAmbiguity() throws {
        XCTAssertEqual(try PDFPageSelection.parse("1, 3-5, 3",pageCount:8),[0,2,3,4])
        XCTAssertThrowsError(try PDFPageSelection.parse("0,2",pageCount:8))
        XCTAssertThrowsError(try PDFPageSelection.parse("1,",pageCount:8))
        XCTAssertEqual(try ExportRange(start:10,end:20,total:30).count,10)
        XCTAssertThrowsError(try ExportRange(start:20,end:10,total:30))
    }
}
