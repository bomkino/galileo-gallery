import XCTest
@testable import GalileoCore

final class MediaAndTimingRegressionTests: XCTestCase {
    private func project() -> GalleryProject {
        var p=GalleryProject();p.items=(0..<3).map { i in
            MediaItem(name:String(i),asset:"\(i).png",sha256:String(repeating:"a",count:64),kind:.image,width:1920,height:1080)
        };return p
    }
    func testManifestWriterCannotPublishUnreadableMetadata() throws {
        var p=project();let text=String(repeating:"🧭",count:4000)
        p.items=(0..<512).map { i in var item=p.items[0];item.id="\(i)";item.caption=text;return item }
        try p.validate()
        XCTAssertThrowsError(try p.encoded())
        p.items=Array(p.items.prefix(2));let data=try p.encoded()
        XCTAssertEqual(try GalleryProject.decode(data),p)
    }
    func testReversePreservesTheExplicitOpeningInEveryMode() throws {
        for mode in PlayMode.allCases {for reverse in [false,true] {
            var p=project();p.items[1].opening=true;p.timing.playMode=mode;p.timing.reverse=reverse
            XCTAssertEqual(p.activeItems.first?.id,p.items[1].id)
            p.items[2].closing=true;XCTAssertEqual(p.activeItems.first?.id,p.items[1].id)
        }}
    }
    func testRepeatClosingStartsFromTheLastMotionPoseNotTheOpening() throws {
        for mode in [PlayMode.once,.repeatCount] {
            var p=project();p.timing.playMode=mode;p.items[2].closing=true;p.items[2].spotlight=Spotlight()
            let plan=try RenderPlan(project:p),cue=try XCTUnwrap(plan.spotlights.last)
            let offset=(plan.schedule.cycles-1)*plan.schedule.cycleFrames
            let before=plan.evaluate(frame:offset+cue.startFrame-1),start=plan.evaluate(frame:offset+cue.startFrame)
            let last=try XCTUnwrap(before.first{$0.itemID==p.items[2].id})
            let takeover=try XCTUnwrap(start.first{$0.itemID==p.items[2].id})
            XCTAssertEqual(last.center.x,takeover.center.x,accuracy:0.0001)
            XCTAssertEqual(takeover.center.x,Double(p.canvas.width)/2,accuracy:0.0001)
            XCTAssertFalse(start.contains{$0.itemID==p.items[0].id})
        }
    }
    func testShortReelKeepsTheVisibleOutgoingInstance() throws {
        var p=project();p.scene=SceneCatalog.defaults(for:"wave-ticker");p.timing.playMode = .loop
        let plan=try RenderPlan(project:p),boundary=plan.schedule.cycleFrames/3
        let a=plan.evaluate(frame:boundary-1).filter{$0.intersects(width:1920,height:1080)}
        let b=plan.evaluate(frame:boundary)
        for card in a {
            let nearest=b.filter{$0.itemID==card.itemID}.map{hypot($0.center.x-card.center.x,$0.center.y-card.center.y)}.min()
            XCTAssertLessThan(try XCTUnwrap(nearest),100,"A visible source jumped at a recycling boundary")
        }
    }
    func testFractionalReadoutIsElapsedTimeAndUnique() throws {
        let schedule=try FrameSchedule(timing:Timing(),rate:FrameRate(30000,1001))
        XCTAssertEqual(schedule.label(frame:30),"00:00:01.001")
        let labels=(Int64(0)..<schedule.totalFrames).map{schedule.label(frame:$0)}
        XCTAssertEqual(Set(labels).count,labels.count)
    }
    func testLockedCropGeometryAndBackgroundReselectionPreserveIntent() throws {
        var crop=Crop();crop.width=0.7;crop.height=0.3
        let locked=CropGeometry.constrained(crop,sourceAspect:2,ratio:1)
        XCTAssertEqual(locked.width*2/locked.height,1,accuracy:1e-10)
        var typed=locked;typed.height=0.6
        let edited=CropGeometry.constrained(typed,sourceAspect:2,ratio:1,preferHeight:true)
        XCTAssertEqual(edited.width*2/edited.height,1,accuracy:1e-10)
        let dragged=CropGeometry.resized(edited,corner:3,x:0.9,y:0.7,sourceAspect:2,ratio:1)
        XCTAssertEqual(dragged.width*2/dragged.height,1,accuracy:1e-10)
        for aspect in [0.1,1.0,2.0,10.0] {for ratio in [0.25,1.0,4.0] {
            var edge=Crop();edge.x=0.9998;edge.y=0.9998;edge.width=0.0001;edge.height=0.0001
            let result=CropGeometry.constrained(edge,sourceAspect:aspect,ratio:ratio)
            XCTAssertEqual(result.width*aspect/result.height,ratio,accuracy:1e-8)
            XCTAssertLessThanOrEqual(result.x+result.width,1.000000001)
            XCTAssertLessThanOrEqual(result.y+result.height,1.000000001)
        }}
        var background=DriftBackgroundCatalog.studies[3].settings
        background.colorA=RGBA(0.2,0.3,0.4);background.grain=0.42;background.motion=0.37
        XCTAssertEqual(background.choosing(DriftBackgroundCatalog.studies[3],keepingPalette:false),background)
        let other=background.choosing(DriftBackgroundCatalog.studies[10],keepingPalette:true)
        XCTAssertEqual(other.colorA,background.colorA);XCTAssertNotEqual(other.studyID,background.studyID)
    }
}
