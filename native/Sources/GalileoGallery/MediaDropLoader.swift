import AppKit
import UniformTypeIdentifiers
import GalileoCore

/// NSItemProvider callbacks can arrive twice, late, or never. One bounded
/// completion owns each provider; the caller separately checks its document.
enum MediaDropLoader {
    private final class Completion: @unchecked Sendable {
        private let lock=NSLock()
        private var continuation:CheckedContinuation<Data,Error>?
        private var completed=false
        private var result:Result<Data,Error>?
        private var progress:Progress?
        func attach(_ value:Progress) {
            lock.lock();progress=value;let ended=completed;lock.unlock()
            if ended {value.cancel()}
        }
        func cancel() {lock.lock();let value=progress;lock.unlock();value?.cancel();finish(.failure(CancellationError()))}
        func install(_ continuation:CheckedContinuation<Data,Error>) {
            lock.lock()
            if let result {lock.unlock();continuation.resume(with:result)}
            else {self.continuation=continuation;lock.unlock()}
        }
        func finish(_ result:Result<Data,Error>) {
            lock.lock();guard !completed else{lock.unlock();return};completed=true;self.result=result
            let target=continuation;continuation=nil;lock.unlock();target?.resume(with:result)
        }
    }
    static func urls(_ providers:[NSItemProvider]) async throws->[URL] {
        guard providers.count<=512 else{throw GalleryError.invalid("Drop up to 512 files at a time.")}
        var result:[URL]=[]
        for provider in providers {
            try Task.checkCancellation()
            let completion=Completion()
            let data=try await withTaskCancellationHandler(operation: {
                try await withCheckedThrowingContinuation { continuation in
                    completion.install(continuation)
                    completion.attach(provider.loadDataRepresentation(forTypeIdentifier:UTType.fileURL.identifier) {data,error in
                        if let data,data.count<=64*1024 {completion.finish(.success(data))}
                        else {completion.finish(.failure(error ?? GalleryError.invalid("The dropped file could not be resolved.")))}
                    })
                    DispatchQueue.global().asyncAfter(deadline:.now()+15) {
                        completion.finish(.failure(GalleryError.invalid("The dropped file took too long to resolve. Add it with the file picker.")))
                    }
                }
            },onCancel:{completion.cancel()})
            guard let url=URL(dataRepresentation:data,relativeTo:nil),url.isFileURL else{throw GalleryError.invalid("Only local files can be dropped here.")}
            result.append(url)
        }
        return result
    }
}
