import XCTest
@testable import GalileoNative

final class StillJobsTests:XCTestCase {
    func testCancellingOneSubscriberKeepsSharedWorkAlive() async throws {
        let jobs=StillJobs<Int>(concurrency:1),gate=DispatchSemaphore(value:0)
        let first=Task.detached {try jobs.run(key:"same",timeout:2) {check in
            while gate.wait(timeout:.now()+0.01) != .success {try check()}
            try check();return 42
        }}
        while jobs.subscribers<1 {try await Task.sleep(nanoseconds:1_000_000)}
        let second=Task.detached {try jobs.run(key:"same",timeout:2) {_ in XCTFail("Must reuse the in-flight job");return -1}}
        while jobs.subscribers<2 {try await Task.sleep(nanoseconds:1_000_000)}
        first.cancel()
        do {_=try await first.value;XCTFail("Cancelled subscriber received a result")} catch is CancellationError {} catch {throw error}
        XCTAssertEqual(jobs.subscribers,1)
        gate.signal()
        let result=try await second.value;XCTAssertEqual(result,42);XCTAssertEqual(jobs.pending,0)
    }
    func testLastSubscriberTimeoutCancelsWorkerAndAllowsRetry() async throws {
        let jobs=StillJobs<Int>(concurrency:1)
        let stopped=expectation(description:"Last lease stops the worker")
        let task=Task.detached {try jobs.run(key:"timeout",timeout:0.04) {check in
            defer {stopped.fulfill()}
            while true {try check();Thread.sleep(forTimeInterval:0.005)}
        }}
        do {_=try await task.value;XCTFail("Expected bounded timeout")} catch {XCTAssertTrue(error.localizedDescription.contains("work limit"))}
        await fulfillment(of:[stopped],timeout:1)
        XCTAssertEqual(jobs.pending,0)
        XCTAssertEqual(try jobs.run(key:"timeout",timeout:1) {_ in 7},7)
    }
}
