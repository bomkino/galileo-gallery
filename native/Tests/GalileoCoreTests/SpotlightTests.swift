import XCTest
@testable import GalileoCore

final class SpotlightTests: XCTestCase {
    private func project(_ count: Int = 3) -> GalleryProject {
        var p = GalleryProject()
        p.timing.durationMilliseconds = 3000
        p.items = (0..<count).map { index in
            var item = MediaItem(name: "Slide \(index)", asset: "\(index).png", sha256: String(repeating: "a", count: 64),
                                 kind: .image, width: 1600, height: 900)
            item.id = "slide-\(index)"
            return item
        }
        return p
    }
    private func geometry(_ cards: [SceneCard]) -> [SceneCard] {
        cards.map { var card = $0; card.sourceTime = 0; return card }
    }
    func testHeldVideoStaysCentredWhileSourceLoopsThenReturnsExactly() throws {
        var p = project()
        p.items[1].kind = .video; p.items[1].duration = 3
        p.items[1].spotlight = Spotlight(); p.items[1].spotlight?.holdMilliseconds = 8000
        let plan = try RenderPlan(project: p), cue = try XCTUnwrap(plan.spotlights.first)
        XCTAssertEqual(cue.holdFrames, 240)
        var plain = p; plain.items[1].spotlight = nil
        let original = try RenderPlan(project: plain)
        XCTAssertEqual(plan.schedule.cycleFrames, original.schedule.cycleFrames + cue.frameCount)
        let first = plan.evaluate(frame: cue.holdStartFrame)
        for frame in [cue.holdStartFrame, cue.holdStartFrame+30, cue.holdStartFrame+90, cue.holdEndFrame-1] {
            let cards = plan.evaluate(frame: frame), held = try XCTUnwrap(cards.last)
            XCTAssertEqual(held.itemID, p.items[1].id)
            XCTAssertEqual(held.center, Point(960, 540))
            XCTAssertEqual(geometry(cards), geometry(first))
            XCTAssertEqual(held.sourceTime, p.items[1].sourceTime(at: plan.schedule.seconds(for: frame)), accuracy: 1e-9)
        }
        XCTAssertNotEqual(first.last?.sourceTime, plan.evaluate(frame: cue.holdStartFrame+30).last?.sourceTime)
        XCTAssertEqual(first.last!.sourceTime, plan.evaluate(frame: cue.holdStartFrame+90).last!.sourceTime, accuracy: 1e-9)
        XCTAssertEqual(geometry(plan.evaluate(frame: cue.startFrame)), geometry(original.evaluate(frame: cue.motionFrame)))
        XCTAssertEqual(geometry(plan.evaluate(frame: cue.endFrame-1)), geometry(plan.evaluate(frame: cue.endFrame)))
        XCTAssertEqual(geometry(plan.evaluate(frame: cue.endFrame+1)), geometry(original.evaluate(frame: cue.motionFrame+1)))
    }
    func testEveryFamilyCanSpotlightASelectedSourceIncludingPagedAndShortRoutes() throws {
        for count in [1, 17] {
            for variant in SceneCatalog.variants {
                var p = project(count); p.scene = SceneCatalog.defaults(for: variant.id)
                p.items[count-1].spotlight = Spotlight()
                let plan = try RenderPlan(project: p), cue = try XCTUnwrap(plan.spotlights.first)
                let cards = plan.evaluate(frame: cue.holdStartFrame+1), front = try XCTUnwrap(cards.last)
                XCTAssertEqual(front.itemID, p.items[count-1].id, variant.id)
                XCTAssertEqual(front.center.x, 960, accuracy: 1e-8, variant.id)
                XCTAssertEqual(front.center.y, 540, accuracy: 1e-8, variant.id)
                XCTAssertEqual(front.angle, 0, accuracy: 1e-8, variant.id)
                XCTAssertEqual(front.yaw, 0, accuracy: 1e-8, variant.id)
            }
        }
        var p = project(512); p.timing.durationMilliseconds = 1000; p.items[510].spotlight = Spotlight()
        let plan = try RenderPlan(project: p), cue = try XCTUnwrap(plan.spotlights.first)
        XCTAssertEqual(plan.evaluate(frame: cue.holdStartFrame).last?.itemID, "slide-510")
    }
    func testSpotlightsFollowInclusionOrderAndRepeatWithoutChangingBaseTiming() throws {
        var p = project(5)
        for i in p.items.indices { p.items[i].spotlight = Spotlight() }
        p.items[1].included = false; p.items[4].opening = true
        p.timing.reverse = true; p.timing.playMode = .repeatCount; p.timing.repeats = 2
        let plan = try RenderPlan(project: p)
        XCTAssertEqual(plan.spotlights.map(\.itemID), p.activeItems.map(\.id))
        XCTAssertFalse(plan.spotlights.contains { $0.itemID == p.items[1].id })
        for cue in plan.spotlights {
            XCTAssertEqual(geometry(plan.evaluate(frame: cue.holdStartFrame)),
                           geometry(plan.evaluate(frame: cue.holdStartFrame + plan.schedule.cycleFrames)))
        }
        var disabled = p
        for i in disabled.items.indices { disabled.items[i].spotlight?.enabled = false }
        let without = try RenderPlan(project: disabled)
        XCTAssertTrue(without.spotlights.isEmpty)
        XCTAssertEqual(without.schedule, try FrameSchedule(timing: p.timing, rate: p.export.frameRate))
    }
    func testSpotlightPersistenceAndVersionThreeCompatibility() throws {
        var p = project(); p.items[0].spotlight = Spotlight(); p.items[0].spotlight?.scale = 0.9
        XCTAssertEqual(try GalleryProject.decode(p.encoded()), p)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: p.encoded()) as? [String: Any])
        json["schemaVersion"] = 3
        var items = try XCTUnwrap(json["items"] as? [[String: Any]])
        for i in items.indices { items[i].removeValue(forKey: "spotlight") }
        json["items"] = items
        let old = try GalleryProject.decode(JSONSerialization.data(withJSONObject: json))
        XCTAssertEqual(old.schemaVersion, 4); XCTAssertTrue(old.items.allSatisfy { $0.spotlight == nil })
        p.items[0].spotlight?.holdMilliseconds = 0; XCTAssertThrowsError(try p.validate())
        p.items[0].spotlight?.holdMilliseconds = 3000; p.items[0].spotlight?.scale = .nan
        XCTAssertThrowsError(try p.validate())
    }
    func testFractionalRatesKeepHoldEndpointsAndSourceFreezeIndependent() throws {
        for rate in [FrameRate(24000,1001), FrameRate(60000,1001)] {
            var p = project(); p.export.frameRate = rate
            p.items[0].kind = .video; p.items[0].duration = 5; p.items[0].trimStart = 1
            p.items[0].sourcePlays = false; p.items[0].spotlight = Spotlight()
            let plan = try RenderPlan(project: p), cue = try XCTUnwrap(plan.spotlights.first)
            XCTAssertGreaterThanOrEqual(Double(cue.holdFrames)/rate.value, 3)
            XCTAssertLessThan(Double(cue.holdFrames)/rate.value, 3+1/rate.value)
            XCTAssertEqual(plan.evaluate(frame: cue.holdStartFrame).last?.sourceTime, 1)
            XCTAssertEqual(plan.evaluate(frame: cue.holdEndFrame-1).last?.sourceTime, 1)
        }
    }
}
