import XCTest
@testable import GalileoCore

final class StillFrameSelectionTests: XCTestCase {
    private func time(_ value:Int64,_ scale:Int32=100)throws->SourceTime {try SourceTime(value:value,timescale:scale)}
    private func interval(_ a:Int64,_ b:Int64)throws->SourceInterval {try SourceInterval(start:time(a),end:time(b))}
    private func select(_ choice:StillFrameSelection,_ range:SourceRange,_ samples:[SourceInterval])throws->SourceInterval {
        var selector=try StillIntervalSelector(selection:choice,range:range)
        for sample in samples {try selector.inspect(sample)}
        return try selector.finish()
    }
    func testTemporalChoicesAndBlackTerminalInterval() throws {
        let samples=try [interval(0,4),interval(4,12),interval(12,50),interval(50,55)]
        let full=try SourceRange(start:0,end:0.55)
        XCTAssertEqual(try select(.first,full,samples),samples[0])
        XCTAssertEqual(try select(.middle,full,samples),samples[2])
        XCTAssertEqual(try select(.last,full,samples),samples[3])
        XCTAssertEqual(try select(.last,full,samples.reversed()),samples[3],"Decode order must not define Last")
        let halfOpen=try SourceRange(start:0,end:0.5)
        XCTAssertEqual(try select(.last,halfOpen,samples),samples[2],"A frame at the exclusive end is excluded")
    }
    func testCoveringSampleCanBeginBeforeTrimAndCustomAnchor() throws {
        let sample=try interval(40,80),range=try SourceRange(start:0.5,end:0.75)
        XCTAssertEqual(try select(.first,range,[sample]),sample)
        XCTAssertEqual(try select(.custom(time(60)),range,[sample]),sample)
        XCTAssertThrowsError(try StillFrameSelection.custom(time(75)).validate(in:range,duration:1))
        XCTAssertNoThrow(try StillFrameSelection.custom(time(60)).validate(in:range,duration:1))
    }
    func testGapsAndDuplicateIntervalsFailWithoutPlaceholder() throws {
        let range=try SourceRange(start:0.5,end:0.75)
        XCTAssertThrowsError(try select(.first,range,[interval(0,40),interval(60,80)]))
        XCTAssertThrowsError(try select(.first,range,[interval(40,80),interval(40,80)]))
        XCTAssertThrowsError(try select(.legacyFrozen(0.5),range,[interval(40,80)]))
    }
    func testExactRationalComparisonDoesNotRoundTrimMembership() throws {
        let tenth=try SourceTime(value:1,timescale:10)
        XCTAssertEqual(tenth.compared(to:0.1),.orderedAscending,"The stored binary Double 0.1 is greater than exact 1/10")
        XCTAssertEqual(tenth.compared(to:0.1.nextDown),.orderedDescending)
        let half=try SourceTime(value:1,timescale:2)
        XCTAssertEqual(half.compared(to:0.5),.orderedSame)
        XCTAssertEqual(half.compared(to:Double.leastNonzeroMagnitude),.orderedDescending)
        XCTAssertEqual(half.compared(to:Double.greatestFiniteMagnitude),.orderedAscending)
        XCTAssertEqual(try SourceTime(value:-1,timescale:2).compared(to:-0.5),.orderedSame)
        XCTAssertEqual(try SourceTime(value:1_000_000_000,timescale:2_000_000_000),half)
        XCTAssertLessThan(try SourceTime(value:185_000_000_000_000,timescale:2_147_483_647),try SourceTime(value:86_400,timescale:1))
    }
    func testTaggedPayloadIsStrictAndRoundTrips() throws {
        for value in [StillFrameSelection.first,.middle,.last,.custom(try time(60)),.legacyFrozen(0.399999999)] {
            XCTAssertEqual(try JSONDecoder().decode(StillFrameSelection.self,from:JSONEncoder().encode(value)),value)
        }
        for invalid in [#"{"tag":"last","anchor":{"value":1,"timescale":2}}"#,#"{"tag":"custom"}"#,#"{"tag":"future"}"#,#"{"tag":"custom","anchor":{"value":1,"timescale":0}}"#,#"{"tag":"custom","anchor":{"value":9223372036854775807,"timescale":1}}"#] {
            XCTAssertThrowsError(try JSONDecoder().decode(StillFrameSelection.self,from:Data(invalid.utf8)))
        }
    }
}
