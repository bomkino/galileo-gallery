import Foundation
import GalileoCore

/// Synchronous render workers and async UI callers share jobs without waiting on
/// a Swift cooperative-pool task. Each caller owns a separate cancellable lease.
final class StillJobs<Value>: @unchecked Sendable {
    private final class Job: @unchecked Sendable {
        let condition=NSCondition()
        var subscribers=0
        var result:Result<Value,Error>?
        weak var operation:Operation?
        func check()throws {
            condition.lock();defer{condition.unlock()}
            if subscribers==0 {throw CancellationError()}
        }
    }
    private let lock=NSLock()
    private var jobs:[String:Job]=[:]
    private let queue:OperationQueue
    init(concurrency:Int) {
        queue=OperationQueue();queue.maxConcurrentOperationCount=concurrency
        queue.qualityOfService = .userInitiated
    }
    var subscribers:Int {
        lock.lock();defer{lock.unlock()}
        return jobs.values.reduce(0) { count,job in
            job.condition.lock();defer{job.condition.unlock()};return count+job.subscribers
        }
    }
    var pending:Int {lock.lock();defer{lock.unlock()};return jobs.count}
    func run(key:String,timeout:Double,work:@escaping (@escaping ()throws->Void)throws->Value)throws->Value {
        try Task.checkCancellation()
        let deadline=ProcessInfo.processInfo.systemUptime+timeout
        lock.lock()
        let existing=jobs[key],job=existing ?? Job()
        job.condition.lock();job.subscribers+=1;job.condition.unlock()
        jobs[key]=job;lock.unlock()
        if existing==nil {
            let operation=BlockOperation {
                let result=Result {try job.check();return try work {try job.check()}}
                job.condition.lock();job.result=result;job.condition.broadcast();job.condition.unlock()
            }
            job.condition.lock();job.operation=operation;job.condition.unlock()
            queue.addOperation(operation)
        }
        defer {
            lock.lock();job.condition.lock();job.subscribers-=1
            if job.subscribers==0 {
                job.operation?.cancel()
                if jobs[key]===job {jobs[key]=nil}
            }
            job.condition.unlock();lock.unlock()
        }
        while true {
            try Task.checkCancellation()
            guard ProcessInfo.processInfo.systemUptime<deadline else {
                throw GalleryError.invalid("Source-frame resolution reached its work limit. Retry, or shorten the source trim.")
            }
            job.condition.lock()
            if let result=job.result {job.condition.unlock();return try result.get()}
            _=job.condition.wait(until:Date().addingTimeInterval(0.025));job.condition.unlock()
        }
    }
}
