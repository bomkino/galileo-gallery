import XCTest
import GalileoCore
final class BoundaryTests:XCTestCase {
    func testExtremeTimesCannotOverflowFrameConversion()throws {
        let schedule=try FrameSchedule(timing:Timing(),rate:FrameRate(30000,1001))
        XCTAssertEqual(schedule.frame(at:Double.greatestFiniteMagnitude),schedule.totalFrames-1)
        XCTAssertEqual(schedule.frame(at:-Double.greatestFiniteMagnitude),0)
        XCTAssertEqual(schedule.frame(at:.nan),0)
        XCTAssertEqual(schedule.frame(at:.infinity),0)
        XCTAssertTrue(schedule.seconds(for:Int64.max).isFinite)
        XCTAssertFalse(schedule.label(frame:Int64.max).isEmpty)
        var transport=Transport();transport.play(now:0,schedule:schedule)
        transport.tick(now:Double.greatestFiniteMagnitude,schedule:schedule,loop:true)
        XCTAssertTrue((0..<schedule.totalFrames).contains(transport.frame))
    }
    func testTransportDoesNotResumePastTheEnd()throws {
        let schedule=try FrameSchedule(timing:Timing(),rate:FrameRate(30))
        var transport=Transport();transport.seek(schedule.totalFrames-1,schedule:schedule)
        transport.play(now:5,schedule:schedule);transport.tick(now:5,schedule:schedule,loop:false)
        XCTAssertEqual(transport.frame,0)
        transport.tick(now:Double.greatestFiniteMagnitude,schedule:schedule,loop:false)
        XCTAssertEqual(transport.frame,schedule.totalFrames-1);XCTAssertFalse(transport.playing)
    }
}
