import XCTest
@testable import GalileoCore

final class CoreTests: XCTestCase {
    func project(_ count:Int=5)->GalleryProject {
        var p=GalleryProject()
        p.items=(0..<count).map { i in
            var item=MediaItem(name:"Frame \(i)",asset:"\(i).png",sha256:String(repeating:"a",count:64),kind:.image,width:i%2==0 ? 1920:1080,height:1080)
            item.id="item-\(i)"; return item
        }
        return p
    }
    func testRoundTripRetainsEveryField() throws {
        var p=project();p.scene.variantID="slide-fan";p.timing.reverse=true;p.export.frameRate=FrameRate(24000,1001)
        p.export.format = .proRes4444;p.items[1].crop.width=0.6;p.items[2].caption="文字 · Café · Caption";p.items[3].included=false
        XCTAssertEqual(try GalleryProject.decode(p.encoded()),p)
    }
    func testRejectsInvalidStateBeforeCommit() throws {
        var p=project();p.canvas.width=777;XCTAssertThrowsError(try p.validate())
        p=project();p.items[0].crop.x=0.9;XCTAssertThrowsError(try p.validate())
        p=project();p.scene.scale = .nan;XCTAssertThrowsError(try p.validate())
        p=project();p.items[0].asset="../secret";XCTAssertThrowsError(try p.validate())
        p=project();p.items[0].id=p.items[1].id;XCTAssertThrowsError(try p.validate())
        p=project();p.schemaVersion=4;XCTAssertThrowsError(try p.validate())
        p=project();p.scene.variantID="unknown";XCTAssertThrowsError(try p.validate())
    }
    func testR01OnceDoesNotForceEndpoint() throws {
        var p=project()
        for variant in SceneCatalog.variants {
            p.scene=SceneCatalog.defaults(for:variant.id)
            let plan=try RenderPlan(project:p)
            let a=plan.evaluate(frame:0),b=plan.evaluate(frame:plan.schedule.cycleFrames/2)
            XCTAssertFalse(a.isEmpty,variant.id)
            if variant.id != "contact-sheet" { XCTAssertNotEqual(a,b,variant.id) }
        }
    }
    func testR25OneIntegerSchedule() throws {
        var t=Timing();t.durationMilliseconds=1001
        let schedule=try FrameSchedule(timing:t,rate:FrameRate(30))
        XCTAssertEqual(schedule.totalFrames,31);XCTAssertEqual(schedule.duration,31.0/30,accuracy:1e-12)
        XCTAssertEqual(schedule.sample(frame:30).localFrame,30)
        XCTAssertLessThan(schedule.sample(frame:30).progress,1)
        t.playMode = .repeatCount;t.repeats=3
        let repeated=try FrameSchedule(timing:t,rate:FrameRate(30))
        XCTAssertEqual(repeated.totalFrames,93)
        XCTAssertEqual(repeated.sample(frame:70).cycleIndex,2)
        XCTAssertEqual(repeated.sample(frame:70).localFrame,8)
    }
    func testR11ResumeKeepsAbsoluteRepeatPosition() throws {
        var t=Timing();t.playMode = .repeatCount;t.repeats=4
        let s=try FrameSchedule(timing:t,rate:FrameRate())
        var transport=Transport();transport.seek(750,schedule:s);transport.play(now:100,schedule:s)
        transport.tick(now:101,schedule:s,loop:false)
        XCTAssertEqual(transport.frame,780)
        XCTAssertEqual(s.sample(frame:transport.frame).cycleIndex,2)
        transport.pause();transport.tick(now:500,schedule:s,loop:false);XCTAssertEqual(transport.frame,780)
    }
    func testFractionalRatesAndBoundaries() throws {
        for rate in FrameRate.supported {
            let schedule=try FrameSchedule(timing:Timing(),rate:rate)
            for i in [Int64(0),1,schedule.totalFrames/2,schedule.totalFrames-1] {
                XCTAssertEqual(schedule.frame(at:schedule.seconds(for:i)),i)
            }
            XCTAssertEqual(schedule.sample(frame:-100).absoluteFrame,0)
            XCTAssertEqual(schedule.sample(frame:Int64.max).absoluteFrame,schedule.totalFrames-1)
        }
    }
    func testSourceTimeTrimFreezeAndLoop() {
        var item=MediaItem(name:"Clip",asset:"clip.mov",sha256:String(repeating:"a",count:64),kind:.video,width:1920,height:1080,duration:5)
        item.trimStart=1;item.trimEnd=3
        XCTAssertEqual(item.sourceTime(at:3),2)
        item.sourceLoops=false;XCTAssertLessThan(item.sourceTime(at:3),3);XCTAssertGreaterThan(item.sourceTime(at:3),2.99)
        item.sourcePlays=false;XCTAssertEqual(item.sourceTime(at:300),1)
    }
    func testR03AllIncludedSourcesArePresented() throws {
        for count in [1,2,13,25,128] {
            var p=project(count)
            for variant in SceneCatalog.variants {
                p.scene=SceneCatalog.defaults(for:variant.id)
                let plan=try RenderPlan(project:p)
                var seen=Set<String>()
                for frame in 0..<plan.schedule.totalFrames {
                    for card in plan.evaluate(frame:frame) { seen.insert(card.itemID) }
                }
                XCTAssertEqual(seen,Set(p.items.map(\.id)),"\(variant.id), count \(count)")
            }
        }
    }
    func testR09ExcludedSourcesCannotBecomeOpeningOrFinale() throws {
        var p=project();p.items[0].included=false;p.items[0].opening=true
        for variant in SceneCatalog.variants {
            p.scene=SceneCatalog.defaults(for:variant.id)
            let plan=try RenderPlan(project:p)
            for frame in stride(from:Int64(0),to:plan.schedule.totalFrames,by:17) {
                XCTAssertFalse(plan.evaluate(frame:frame).contains { $0.itemID==p.items[0].id },variant.id)
            }
        }
    }
    func testGeometryFiniteAcrossShapesAndCapacity() throws {
        for shape in [(1920,1080),(1080,1920),(1080,1080),(2576,1080)] {
            var p=project(25);p.canvas.width=shape.0;p.canvas.height=shape.1
            p.items[0].width=10000;p.items[0].height=100
            for v in SceneCatalog.variants {
                p.scene=SceneCatalog.defaults(for:v.id)
                let plan=try RenderPlan(project:p)
                for frame in stride(from:Int64(0),to:plan.schedule.totalFrames,by:23) {
                    let cards=plan.evaluate(frame:frame)
                    XCTAssertLessThanOrEqual(cards.count,13)
                    XCTAssertEqual(Set(cards.map(\.instanceID)).count,cards.count)
                    for c in cards {
                        XCTAssertTrue([c.center.x,c.center.y,c.width,c.height,c.sourceTime].allSatisfy(\.isFinite))
                        XCTAssertGreaterThan(c.width,0);XCTAssertGreaterThan(c.height,0)
                        XCTAssertTrue(c.quad(perspective:Double(shape.0)*2).allSatisfy { $0.x.isFinite && $0.y.isFinite })
                    }
                }
            }
        }
    }
    func testPresetValidationDoesNotTouchMedia() throws {
        var p=project();p.scene.variantID="the-stack"
        let preset=ScenePreset(name:"Calm",project:p);try preset.validate()
        let bytes=try JSONEncoder().encode(preset)
        let restored=try JSONDecoder().decode(ScenePreset.self,from:bytes)
        XCTAssertEqual(preset,restored)
        var bad=preset;bad.scene.scale=100;XCTAssertThrowsError(try bad.validate())
    }
    func testCatalogIdentityIsNotNavigationCount() {
        XCTAssertEqual(Set(SceneCatalog.variants.map(\.id)).count,29)
        XCTAssertEqual(SceneFamily.allCases.count,10)
        XCTAssertEqual(SceneCatalog.variant("quiet-carousel")?.id,"cms-slideshow")
        for family in SceneFamily.allCases { XCTAssertFalse(SceneCatalog.variants(in:family).isEmpty) }
    }
}
