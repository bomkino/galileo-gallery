import Foundation
import AppKit
import Combine
import GalileoCore

@MainActor public final class EditorSession: NSObject, ObservableObject {
    @Published public private(set) var project:GalleryProject
    @Published public private(set) var snapshot:RenderSnapshot
    @Published public private(set) var revision:Int=0
    @Published public var documentName="Untitled"
    @Published public var selection:Set<String>=[]
    @Published public var issue:String?=nil
    @Published public private(set) var importing=false
    @Published public var showSidebar = UserDefaults.standard.object(forKey: "showSidebar") as? Bool ?? true { didSet { UserDefaults.standard.set(showSidebar, forKey: "showSidebar") } }
    @Published public var showInspector = UserDefaults.standard.object(forKey: "showInspector") as? Bool ?? true { didSet { UserDefaults.standard.set(showInspector, forKey: "showInspector") } }
    @Published public var canvasZoom = 0.0
    @Published public var framingMediaID: String? = nil
    @Published public var mediaQuery = ""
    @Published public var choosingScene=false
    @Published public var choosingExport=false
    public private(set) var workspace:Workspace
    public var undoManager:UndoManager?
    public var didEdit:(()->Void)?
    public var didLoad:(()->Void)?
    private var generation=UUID()
    private var importTask:Task<Void,Never>?
    private var gesture=false
    internal var importBudgetLimit=MediaBudget.maximumProjectBytes
    public init(project:GalleryProject=GalleryProject(),workspace:Workspace?=nil)throws {
        let owned=try workspace ?? Workspace()
        self.project=project;self.documentName=project.name;self.workspace=owned;snapshot=try RenderSnapshot(project:project,workspace:owned)
        super.init()
    }
    public var selectedItem:MediaItem? { project.items.first { selection.contains($0.id) } }
    public func commit(_ name:String,_ edit:(inout GalleryProject)->Void) {
        var candidate=project;edit(&candidate)
        do { try apply(candidate,name:name) } catch { issue=error.localizedDescription }
    }
    private func apply(_ candidate:GalleryProject,name:String)throws {
        try candidate.validate()
        guard candidate != project else { return }
        let nextSnapshot = try RenderSnapshot(project: candidate, workspace: workspace)
        let previous=project
        let manager=undoManager
        let explicitGroup = !gesture && !(manager?.isUndoing ?? false) && !(manager?.isRedoing ?? false)
        if explicitGroup { manager?.beginUndoGrouping() }
        manager?.registerUndo(withTarget:self) { session in
            MainActor.assumeIsolated { do { try session.apply(previous,name:name) } catch { session.issue=error.localizedDescription } }
        }
        manager?.setActionName(name)
        project=candidate;snapshot=nextSnapshot;revision+=1
        selection.formIntersection(Set(candidate.items.map(\.id)))
        if explicitGroup { manager?.endUndoGrouping() }
        didEdit?()
    }
    public func beginGesture(_ name:String) {
        guard !gesture else { return };gesture=true;undoManager?.beginUndoGrouping();undoManager?.setActionName(name)
    }
    public func endGesture() { guard gesture else { return };gesture=false;undoManager?.endUndoGrouping() }
    public func load(project:GalleryProject,workspace:Workspace)throws {
        try project.validate();cancelImport();generation=UUID();endGesture();undoManager?.removeAllActions()
        self.project=project;self.workspace=workspace;snapshot=try RenderSnapshot(project:project,workspace:workspace)
        revision+=1;selection=[];issue=nil;didLoad?()
    }
    public func editSelected(_ name:String,_ edit:(inout MediaItem)->Void) {
        editItems(selection, name: name, edit)
    }
    public func editItems(_ ids: Set<String>, name: String, _ edit: (inout MediaItem) -> Void) {
        commit(name) { p in for i in p.items.indices where ids.contains(p.items[i].id) { edit(&p.items[i]) } }
    }
    public func removeSelection() { let ids=selection;commit("Remove media"){$0.items.removeAll{ids.contains($0.id)}} }
    public func duplicateSelection() {
        let ids=selection;var newIDs=Set<String>()
        commit("Duplicate media") { p in
            p.items=p.items.flatMap { item -> [MediaItem] in
                guard ids.contains(item.id) else { return [item] }
                var copy=item;copy.id=UUID().uuidString;copy.opening=false;copy.closing=false;newIDs.insert(copy.id)
                return [item,copy]
            }
        }
        selection=newIDs.intersection(Set(project.items.map(\.id)))
    }
    public func move(from offsets:IndexSet,to destination:Int) {
        commit("Reorder media") { p in
            let moved=offsets.sorted().compactMap { p.items.indices.contains($0) ? p.items[$0]:nil }
            let insertion=destination-offsets.filter{$0<destination}.count
            for i in offsets.sorted(by:>) where p.items.indices.contains(i) { p.items.remove(at:i) }
            p.items.insert(contentsOf:moved,at:min(p.items.count,max(0,insertion)))
        }
    }
    public func moveSelection(by offset:Int) {
        let ids=selection
        commit("Reorder media") { p in
            let indexes=offset<0 ? Array(p.items.indices):Array(p.items.indices.reversed())
            for i in indexes where ids.contains(p.items[i].id) {
                let j=i+offset
                if p.items.indices.contains(j),!ids.contains(p.items[j].id) { p.items.swapAt(i,j) }
            }
        }
    }
    public func markOpening(_ id:String) {
        commit("Set opening") { p in for i in p.items.indices { p.items[i].opening=p.items[i].id==id } }
    }
    public func markClosing(_ id: String) {
        commit("Set closing") { p in
            for index in p.items.indices {
                p.items[index].closing = p.items[index].id == id
                if p.items[index].id == id, p.items[index].spotlight == nil { p.items[index].spotlight = Spotlight() }
            }
        }
    }
    public func importURLs(_ urls:[URL],replacing:String?=nil, expectedFingerprint: String? = nil, pdfOptions: [String: PDFImportOptions] = [:]) {
        guard !importing else { issue="An import is already running. Finish or cancel it before adding more media.";return }
        guard !urls.isEmpty else { return }
        guard urls.count+(replacing==nil ? project.items.count:project.items.count-1)<=512 else { issue="A document supports at most 512 media items.";return }
        let token=generation;importing=true
        importTask=Task.detached(priority:.userInitiated) { [weak self] in
            guard let self else { return }
            do {
                let staging=try Workspace();var items:[MediaItem]=[],failures:[String]=[]
                for url in urls {
                    try Task.checkCancellation()
                    do {
                        if url.pathExtension.lowercased() == "pdf" {
                            items += try await PDFImporter.importPages(url, workspace: staging, options: pdfOptions[url.path] ?? PDFImportOptions())
                        } else { items.append(try await AssetImporter.inspect(url,workspace:staging)) }
                        guard items.count <= 512 else { throw GalleryError.invalid("The batch exceeds 512 media items.") }
                        var imported = GalleryProject(); imported.items = items
                        _ = try staging.validateBudget(project: imported)
                    }
                    catch is CancellationError { throw CancellationError() }
                    catch { failures.append(error.localizedDescription) }
                }
                try Task.checkCancellation()
                let completedItems=items,completedFailures=failures
                await MainActor.run {
                    guard self.generation==token,!Task.isCancelled else { return }
                    do {
                        var candidate=self.project
                        var replacementNotice: String?
                        if let expectedFingerprint, completedItems.first?.sha256 != expectedFingerprint {
                            throw GalleryError.invalid("This is not the original file. Use Replace media to choose different artwork.")
                        }
                        if replacing != nil && completedItems.count != 1 { throw GalleryError.invalid("Replace one source with exactly one image, video or selected PDF page.") }
                        if let replacing,let index=candidate.items.firstIndex(where:{$0.id==replacing}),var replacement=completedItems.first {
                            let result = Replacement.preserving(candidate.items[index], with: replacement)
                            replacement = result.0; replacementNotice = result.1
                            candidate.items[index]=replacement
                        } else if replacing==nil { candidate.items+=completedItems }
                        try candidate.validate()
                        _ = try self.workspace.validateBudget(project: candidate, additions: staging, limit: self.importBudgetLimit)
                        var unique=Set<String>()
                        for item in completedItems {
                            for name in [item.asset, item.originalAsset].compactMap({ $0 }) where unique.insert(name).inserted {
                                let source = staging.assets.appendingPathComponent(name), destination = self.workspace.assets.appendingPathComponent(name)
                                if !FileManager.default.fileExists(atPath: destination.path) { try Workspace.copyOwned(source, to: destination) }
                            }
                        }
                        try self.apply(candidate,name:replacing==nil ? "Add media":"Replace media")
                        if replacing==nil { self.selection=Set(completedItems.map(\.id)) }
                        let notices = completedFailures + [replacementNotice].compactMap { $0 }
                        if !notices.isEmpty { self.issue=notices.joined(separator:"\n") }
                    } catch { self.issue=error.localizedDescription }
                    self.importing=false;self.importTask=nil
                }
            } catch {
                let message=(error is CancellationError) ? nil:error.localizedDescription
                await MainActor.run {
                    guard self.generation==token else { return }
                    self.importing=false;self.importTask=nil
                    if let message { self.issue=message }
                }
            }
        }
    }
    public func cancelImport() { importTask?.cancel();importTask=nil;importing=false;generation=UUID() }
    public func close() { cancelImport();endGesture();didEdit=nil;didLoad=nil }
}

@MainActor public final class PlaybackModel: ObservableObject {
    @Published public private(set) var frame:Int64=0
    @Published public private(set) var playing=false
    private var transport=Transport()
    private var schedule:FrameSchedule
    private var loop=false
    private var timer:Timer?
    private var stoppingFrame: Int64?
    private var documentID: String?
    public init(schedule:FrameSchedule) { self.schedule=schedule }
    deinit { timer?.invalidate() }
    public func update(_ plan:RenderPlan) {
        let firstLoad = documentID != plan.project.id
        pause();schedule=plan.schedule;loop=plan.project.timing.playMode == .loop
        documentID = plan.project.id
        if firstLoad { frame = Int64(UserDefaults.standard.integer(forKey: "playhead-" + plan.project.id)) }
        transport.seek(frame,schedule:schedule);frame=transport.frame
    }
    public func seek(_ frame:Int64) { pause();transport.seek(frame,schedule:schedule);self.frame=transport.frame;persistPosition() }
    private func persistPosition() { if let documentID { UserDefaults.standard.set(frame,forKey:"playhead-"+documentID) } }
    public func step(_ amount:Int64) { seek(frame+amount) }
    public func restart() { seek(0);play() }
    public func toggle() { playing ? pause():play() }
    public func pause() {
        timer?.invalidate();timer=nil;transport.pause();playing=false;stoppingFrame=nil
        if let documentID { UserDefaults.standard.set(frame, forKey: "playhead-" + documentID) }
    }
    public func preview(_ cue: SpotlightCue, cycle: Int64 = 0) {
        let offset = cycle * schedule.cycleFrames
        seek(cue.startFrame + offset); play(); stoppingFrame = min(schedule.totalFrames-1, cue.endFrame-1 + offset)
    }
    public func jumpCue(_ cues: [SpotlightCue], direction: Int) {
        guard !cues.isEmpty else { return }
        let local = frame % schedule.cycleFrames, offset = frame / schedule.cycleFrames * schedule.cycleFrames
        let target = direction > 0 ? cues.first(where: { $0.holdStartFrame > local }) ?? cues[0]
            : cues.last(where: { $0.holdStartFrame < local }) ?? cues[cues.count-1]
        seek(offset + target.holdStartFrame)
    }
    public func play() {
        transport.play(now:ProcessInfo.processInfo.systemUptime,schedule:schedule);playing=true
        timer?.invalidate()
        let newTimer=Timer(timeInterval:1/60,repeats:true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.transport.tick(now:ProcessInfo.processInfo.systemUptime,schedule:self.schedule,loop:self.loop)
                if let stop = self.stoppingFrame, self.transport.frame >= stop { self.seek(stop); return }
                if self.frame != self.transport.frame { self.frame=self.transport.frame }
                if !self.transport.playing { self.pause() }
            }
        }
        timer=newTimer;RunLoop.main.add(newTimer,forMode:.common)
    }
}
public struct QueuedExport: Identifiable, @unchecked Sendable {
    public let id = UUID()
    public let snapshot: RenderSnapshot
    public let destination: ExportDestination
    public let stillFrame: Int64
    public let range: ExportRange?
    public var name: String { destination.url.lastPathComponent }
}
public struct ExportHistory: Identifiable {
    public let id: UUID
    public let name: String
    public let result: ExportReceipt?
    public let error: String?
}
@MainActor public final class ExportCenter: ObservableObject {
    public static let shared=ExportCenter()
    @Published public private(set) var busy=false
    @Published public private(set) var progress=0.0
    @Published public private(set) var status=""
    @Published public private(set) var result:ExportReceipt?
    @Published public private(set) var error:String?
    @Published public private(set) var pending: [QueuedExport] = []
    @Published public private(set) var history: [ExportHistory] = []
    private var task:Task<Void,Never>?
    private var jobID=UUID()
    private var activePath: String?
    public init() {}
    @discardableResult public func start(snapshot:RenderSnapshot,destination:ExportDestination,stillFrame:Int64,range:ExportRange?=nil) -> Bool {
        let path=destination.url.standardizedFileURL.path
        guard path != activePath, !pending.contains(where: { $0.destination.url.standardizedFileURL.path == path }) else {
            error="That destination is already queued. Choose another filename.";return false
        }
        guard pending.count<4 else {error="The export queue is full. Finish or remove a queued export first.";return false}
        let job=QueuedExport(snapshot:snapshot,destination:destination,stillFrame:stillFrame,range:range)
        if busy { pending.append(job) } else { execute(job) }
        return true
    }
    private func execute(_ job:QueuedExport) {
        let id=job.id;jobID=id;busy=true;progress=0;status="Preparing \(job.name)";error=nil;result=nil
        activePath=job.destination.url.standardizedFileURL.path
        task=Task.detached(priority:.userInitiated) { [weak self] in
            guard let self else {return}
            do {
                let receipt=try await NativeExport.run(snapshot:job.snapshot,destination:job.destination,stillFrame:job.stillFrame,range:job.range) { value,label in
                    Task { @MainActor [weak self] in guard let self,self.jobID==id,self.busy else{return};self.progress=value;self.status=label }
                }
                await self.finished(job,result:receipt,error:nil)
            } catch {
                let cancelled=error is CancellationError || (error as? GalleryError) == .cancelled
                await self.finished(job,result:nil,error:cancelled ? "Cancelled":error.localizedDescription)
            }
        }
    }
    private func finished(_ job:QueuedExport,result:ExportReceipt?,error:String?) {
        guard jobID==job.id else {return}
        self.result=result;self.error=error;status=result == nil ? (error ?? "Export failed") : "Exported";progress=result == nil ? progress:1
        busy=false;task=nil;activePath=nil
        history.insert(ExportHistory(id:job.id,name:job.name,result:result,error:error),at:0)
        if history.count>20 {history.removeLast()}
        if !pending.isEmpty {execute(pending.removeFirst())}
    }
    public func removeQueued(_ id:UUID) { pending.removeAll {$0.id==id} }
    public func cancel() { guard busy,progress<0.99 else{return};status="Cancelling";task?.cancel() }
    public func cancelAll() {pending=[];cancel()}
    public func reveal() { if let path=result?.outputPath {NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath:path)])} }
}
