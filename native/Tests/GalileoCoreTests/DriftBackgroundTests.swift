import XCTest
@testable import GalileoCore

final class DriftBackgroundTests:XCTestCase {
    func testImportedCatalogAndStoredSettingsRoundTrip() throws {
        XCTAssertEqual(DriftBackgroundCatalog.studies.count,72)
        XCTAssertEqual(DriftBackgroundCatalog.palettes.count,28)
        XCTAssertEqual(Set(DriftBackgroundCatalog.studies.map(\.id)).count,72)
        for family in DriftFamily.allCases {
            XCTAssertEqual(Set(DriftBackgroundCatalog.studies.filter{$0.family==family}.map(\.composition)),Set(0..<8))
        }
        for study in DriftBackgroundCatalog.studies {
            var p=GalleryProject();p.canvas.background = .drift;p.canvas.drift=study.settings
            XCTAssertEqual(try GalleryProject.decode(p.encoded()),p)
        }
    }
    func testVersionFiveCanvasStaysUnchangedAndInvalidBackgroundsAreRejected() throws {
        var p=GalleryProject();p.canvas.background = .gradient;p.canvas.gradientAngle = 37
        var json=try XCTUnwrap(JSONSerialization.jsonObject(with:p.encoded()) as? [String:Any])
        json["schemaVersion"]=5
        let restored=try GalleryProject.decode(JSONSerialization.data(withJSONObject:json))
        XCTAssertEqual(restored.canvas,p.canvas);XCTAssertNil(restored.canvas.drift)
        p.canvas.background = .drift;XCTAssertThrowsError(try p.validate())
        p.canvas.drift=DriftBackground(studyID:"unknown");XCTAssertThrowsError(try p.validate())
        p.canvas.drift=DriftBackground();p.canvas.drift?.motion = .infinity;XCTAssertThrowsError(try p.validate())
    }
    func testBackgroundClockRepeatsAndFreezeIsIndependentOfVideoTime() throws {
        var timing=Timing();timing.playMode = .repeatCount
        let schedule=try FrameSchedule(timing:timing,rate:FrameRate(30000,1001),additionalCycleFrames:240)
        var s=DriftBackgroundCatalog.studies[10].settings
        XCTAssertEqual(s.time(frame:31,schedule:schedule).phase,s.time(frame:31+schedule.cycleFrames,schedule:schedule).phase)
        XCTAssertEqual(s.time(frame:31,schedule:schedule).grainFrame,s.time(frame:31+schedule.cycleFrames,schedule:schedule).grainFrame)
        s.animated=false
        XCTAssertEqual(s.time(frame:135,schedule:schedule).phase,0)
        XCTAssertEqual(s.time(frame:135,schedule:schedule).grainFrame,0)
    }
}
