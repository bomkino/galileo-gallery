import XCTest
@testable import GalileoCore

final class MediaOrderingTests: XCTestCase {
    func testDocumentedGapsAndSelectedNoOps() throws {
        let ids = ["A", "B", "C", "D", "E", "F"]
        XCTAssertEqual(try MediaOrdering.moving(ids, selected: ["B", "D"], toGap: 5), ["A", "C", "E", "B", "D", "F"])
        XCTAssertEqual(try MediaOrdering.moving(ids, selected: ["B", "D"], toGap: 6), ["A", "C", "E", "F", "B", "D"])
        for gap in 1...3 { XCTAssertEqual(try MediaOrdering.moving(ids, selected: ["B", "C"], toGap: gap), ids) }
        for gap in 0...6 { XCTAssertEqual(try MediaOrdering.moving(ids, selected: Set(ids), toGap: gap), ids) }
    }
    func testEverySubsetAndGapAgainstIndependentSpliceOracle() throws {
        // This exercises the production Swift method, not a Python transcription of it.
        for count in 1...9 {
            let ids = (0..<count).map(String.init)
            for bits in 1..<(1 << count) {
                let selected = Set(ids.enumerated().compactMap { bits & (1 << $0.offset) == 0 ? nil : $0.element })
                for gap in 0...count {
                    var expected = ids
                    let gathered = ids.enumerated().filter { bits & (1 << $0.offset) != 0 }.map(\.element)
                    // Insert a unique sentinel at the original gap, remove selected rows,
                    // then replace the sentinel. This does not call the production algorithm.
                    expected.insert("SENTINEL", at: gap)
                    expected.removeAll { selected.contains($0) }
                    let marker = try XCTUnwrap(expected.firstIndex(of: "SENTINEL"))
                    expected.replaceSubrange(marker...marker, with: gathered)
                    let result = try MediaOrdering.moving(ids, selected: selected, toGap: gap)
                    XCTAssertEqual(result, expected)
                    XCTAssertEqual(Set(result), Set(ids))
                    XCTAssertEqual(result.count, ids.count)
                    XCTAssertEqual(result.filter { selected.contains($0) }, gathered)
                    XCTAssertEqual(result.filter { !selected.contains($0) }, ids.filter { !selected.contains($0) })
                }
            }
        }
    }
    func testBadRequestsCannotPartiallyMove() {
        for selected: Set<String> in [[], ["foreign"], ["A", "foreign"]] {
            XCTAssertThrowsError(try MediaOrdering.moving(["A", "B"], selected: selected, toGap: 1))
        }
        for gap in [-1, 3, Int.max, Int.min] {
            XCTAssertThrowsError(try MediaOrdering.moving(["A", "B"], selected: ["A"], toGap: gap))
        }
        XCTAssertThrowsError(try MediaOrdering.moving(["A", "A"], selected: ["A"], toGap: 0))
        XCTAssertThrowsError(try MediaOrdering.moving(["", "B"], selected: ["B"], toGap: 0))
        XCTAssertThrowsError(try MediaOrdering.stepping(["A", "B"], selected: ["A"], direction: 0))
        XCTAssertThrowsError(try MediaOrdering.stepping(["A", "B"], selected: ["A"], direction: Int.max))
    }
    func testKeyboardPreservesDiscontiguousBlocksAndBoundaries() throws {
        let ids = ["A", "B", "C", "D", "E", "F"]
        XCTAssertEqual(try MediaOrdering.stepping(ids, selected: ["B", "D"], direction: -1), ["B", "A", "D", "C", "E", "F"])
        XCTAssertEqual(try MediaOrdering.stepping(ids, selected: ["B", "D"], direction: 1), ["A", "C", "B", "E", "D", "F"])
        XCTAssertEqual(try MediaOrdering.stepping(ids, selected: ["A", "B"], direction: -1), ids)
        XCTAssertEqual(try MediaOrdering.stepping(ids, selected: ["E", "F"], direction: 1), ids)
    }
}
