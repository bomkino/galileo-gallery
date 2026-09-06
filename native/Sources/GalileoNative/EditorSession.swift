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
    @Published public private(set) var importStatus=""
    @Published public var previewMediaID:String?=nil
    @Published public var showSidebar = UserDefaults.standard.object(forKey: "showSidebar") as? Bool ?? true { didSet { UserDefaults.standard.set(showSidebar, forKey: "showSidebar") } }
    @Published public var showInspector = UserDefaults.standard.object(forKey: "showInspector") as? Bool ?? true { didSet { UserDefaults.standard.set(showInspector, forKey: "showInspector") } }
    @Published public var canvasZoom = 0.0
    @Published public var framingMediaID: String? = nil
    @Published public var mediaQuery = ""
    @Published public var choosingScene=false
    @Published public var choosingBackground=false
    @Published public var choosingExport=false
    public private(set) var workspace:Workspace
    public var undoManager:UndoManager?
    public var didEdit:(()->Void)?
    public var didLoad:(()->Void)?
    private var generation=UUID()
    public var importGeneration:UUID {generation}
    private var importTask:Task<Void,Never>?
    private var gesture=false
    private final class GestureUndo {var steps=0}
    private var gestureUndo:GestureUndo?
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
    private func apply(_ candidate:GalleryProject,name:String,changeSteps:Int=1)throws {
        guard candidate != project else { return }
        let nextSnapshot = try RenderSnapshot(project: candidate, workspace: workspace)
        let previous=project
        let manager=undoManager
        let explicitGroup = !gesture && !(manager?.isUndoing ?? false) && !(manager?.isRedoing ?? false)
        if explicitGroup { manager?.beginUndoGrouping() }
        if !gesture || gestureUndo == nil {
            let transaction=GestureUndo();transaction.steps=changeSteps
            if gesture {gestureUndo=transaction}
            manager?.registerUndo(withTarget:self) { session in
                MainActor.assumeIsolated { do { try session.apply(previous,name:name,changeSteps:transaction.steps) } catch { session.issue=error.localizedDescription } }
            }
        } else {gestureUndo?.steps+=changeSteps}
        manager?.setActionName(name)
        project=candidate;snapshot=nextSnapshot;revision+=1
        selection.formIntersection(Set(candidate.items.map(\.id)))
        if explicitGroup { manager?.endUndoGrouping() }
        for _ in 0..<changeSteps {didEdit?()}
    }
    public func beginGesture(_ name:String) {
        guard !gesture else { return };gesture=true;gestureUndo=nil;undoManager?.beginUndoGrouping();undoManager?.setActionName(name)
    }
    public func endGesture() { guard gesture else { return };gesture=false;gestureUndo=nil;undoManager?.endUndoGrouping() }
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
    public func importURLs(_ urls:[URL],replacing:String?=nil, expectedFingerprint:String?=nil,
                           pdfOptions:[String:PDFImportOptions]=[:],expectedGeneration:UUID?=nil) {
        guard expectedGeneration == nil || expectedGeneration == generation else {return}
        guard !importing else {issue="Finish or cancel the current import before adding more media.";return}
        guard !urls.isEmpty else{return}
        let token=generation,base=project,owned=workspace,limit=importBudgetLimit
        importing=true;importStatus="Preparing media"
        importTask=Task.detached(priority:.userInitiated) { [weak self] in
            do {
                let staging=try Workspace();var accepted:[MediaItem]=[],failures:[String]=[]
                for (offset,url) in urls.enumerated() {
                    try Task.checkCancellation()
                    await MainActor.run {if self?.generation==token {self?.importStatus="Preparing \(offset+1) / \(urls.count) · \(url.lastPathComponent)"}}
                    do {
                        let incoming:[MediaItem]
                        if url.pathExtension.lowercased()=="pdf" {incoming=try await PDFImporter.importPages(url,workspace:staging,options:pdfOptions[url.path] ?? PDFImportOptions())}
                        else {incoming=[try await AssetImporter.inspect(url,workspace:staging)]}
                        var proposed=base
                        if let replacing {proposed.items.removeAll{$0.id==replacing}}
                        proposed.items+=accepted+incoming
                        try proposed.validate()
                        _ = try owned.validateBudget(project:proposed,additions:staging,limit:limit)
                        // Append only after validating this file, so an oversized
                        // sibling cannot poison an otherwise usable import batch.
                        accepted+=incoming
                    } catch is CancellationError {throw CancellationError()}
                    catch {failures.append("\(url.lastPathComponent): \(error.localizedDescription)")}
                }
                try Task.checkCancellation()
                guard !accepted.isEmpty else {throw GalleryError.invalid(failures.joined(separator:"\n"))}
                if replacing != nil && accepted.count != 1 {throw GalleryError.invalid("Replace one source with exactly one media item or PDF page.")}
                if let expectedFingerprint,accepted.first?.sha256 != expectedFingerprint,accepted.first?.originalSHA256 != expectedFingerprint {
                    throw GalleryError.invalid("This is not the original file. Use Replace media to choose different artwork.")
                }
                // File copies and integrity work remain on this worker. The
                // session is checked again before any document-state adoption.
                var names=Set<String>()
                for item in accepted {for name in [item.asset,item.originalAsset].compactMap({$0}) where names.insert(name).inserted {
                    try Task.checkCancellation()
                    let source=staging.assets.appendingPathComponent(name),target=owned.assets.appendingPathComponent(name)
                    if !FileManager.default.fileExists(atPath:target.path) {try Workspace.copyOwned(source,to:target)}
                }}
                let completed=accepted,notices=failures
                await MainActor.run {
                    guard let self,self.generation==token,!Task.isCancelled else{return}
                    defer {self.importing=false;self.importStatus="";self.importTask=nil}
                    do {
                        var candidate=self.project;var replacementNotice:String?
                        if let replacing {
                            guard let index=candidate.items.firstIndex(where:{$0.id==replacing}) else {throw GalleryError.cancelled}
                            let result=Replacement.preserving(candidate.items[index],with:completed[0])
                            candidate.items[index]=result.0;replacementNotice=result.1
                        } else {candidate.items+=completed}
                        _ = try owned.validateBudget(project:candidate,limit:limit)
                        try self.apply(candidate,name:replacing == nil ? "Add media":"Replace media")
                        if replacing == nil {self.selection=Set(completed.map(\.id))}
                        let problems=notices+[replacementNotice].compactMap{$0}
                        if !problems.isEmpty {self.issue=problems.joined(separator:"\n")}
                    } catch {self.issue=error.localizedDescription}
                }
            } catch {
                await MainActor.run {
                    guard let self,self.generation==token else{return}
                    self.importing=false;self.importStatus="";self.importTask=nil
                    if !(error is CancellationError) {self.issue=error.localizedDescription}
                }
            }
        }
    }
    public func cancelImport() { importTask?.cancel();importTask=nil;importing=false;importStatus="";generation=UUID() }
    public func close() { cancelImport();endGesture();didEdit=nil;didLoad=nil }
}

@MainActor public final class PlaybackModel: ObservableObject {
    @Published public private(set) var frame:Int64=0
    @Published public private(set) var playing=false
    private var transport=Transport()
    private var schedule:FrameSchedule
    private var loop=false
    private var timer:Timer?
    private var stoppingFrame:Int64?
    private var documentID:String?
    private var previousProject:GalleryProject?
    private var auditionReturn:Int64?
    private let persists:Bool
    public init(schedule:FrameSchedule,persist:Bool=true) {self.schedule=schedule;persists=persist}
    deinit {timer?.invalidate()}
    public func update(_ plan:RenderPlan) {
        let firstLoad=documentID != plan.project.id
        let appearanceOnly=previousProject.map { old -> Bool in
            old.id==plan.project.id && old.items==plan.project.items && old.timing==plan.project.timing &&
            old.scene.variantID==plan.project.scene.variantID && schedule==plan.schedule
        } ?? false
        if !appearanceOnly {pause()}
        let oldSeconds=schedule.seconds(for:frame)
        schedule=plan.schedule;loop=plan.project.timing.playMode == .loop;documentID=plan.project.id
        previousProject=plan.project
        if firstLoad {frame=persists ? Int64(UserDefaults.standard.integer(forKey:"playhead-"+plan.project.id)):0}
        else if !appearanceOnly {frame=schedule.frame(at:oldSeconds)}
        if !appearanceOnly {transport.seek(frame,schedule:schedule);frame=transport.frame}
    }
    private func stopTimer() {timer?.invalidate();timer=nil;transport.pause();playing=false;stoppingFrame=nil}
    private func persistPosition() {if persists,auditionReturn==nil,let documentID {UserDefaults.standard.set(frame,forKey:"playhead-"+documentID)}}
    public func seek(_ frame:Int64) {
        stopTimer();auditionReturn=nil;transport.seek(frame,schedule:schedule);self.frame=transport.frame;persistPosition()
    }
    public func step(_ amount:Int64) {seek(frame+amount)}
    public func restart() {seek(0);play()}
    public func toggle() {playing ? pause():play()}
    public func pause() {
        stopTimer()
        if let original=auditionReturn {auditionReturn=nil;transport.seek(original,schedule:schedule);frame=transport.frame}
        persistPosition()
    }
    public func preview(_ cue:SpotlightCue,cycle:Int64=0) {
        let original=auditionReturn ?? frame
        stopTimer();auditionReturn=original
        let offset=min(schedule.cycles-1,max(0,cycle))*schedule.cycleFrames
        transport.seek(cue.startFrame+offset,schedule:schedule);frame=transport.frame
        startPlayback();stoppingFrame=min(schedule.totalFrames-1,cue.endFrame-1+offset)
    }
    public func jumpCue(_ cues:[SpotlightCue],direction:Int) {
        guard !cues.isEmpty else{return}
        let local=frame%schedule.cycleFrames,offset=frame/schedule.cycleFrames*schedule.cycleFrames
        let target=direction>0 ? cues.first(where:{$0.holdStartFrame>local}) ?? cues[0]
            : cues.last(where:{$0.holdStartFrame<local}) ?? cues[cues.count-1]
        seek(offset+target.holdStartFrame)
    }
    public func play() {auditionReturn=nil;startPlayback()}
    private func startPlayback() {
        transport.play(now:ProcessInfo.processInfo.systemUptime,schedule:schedule);playing=true
        timer?.invalidate()
        let newTimer=Timer(timeInterval:1/60,repeats:true) {[weak self] _ in
            MainActor.assumeIsolated {
                guard let self else{return}
                self.transport.tick(now:ProcessInfo.processInfo.systemUptime,schedule:self.schedule,loop:self.loop)
                if let stop=self.stoppingFrame,self.transport.frame>=stop {self.pause();return}
                if self.frame != self.transport.frame {self.frame=self.transport.frame}
                if !self.transport.playing {self.pause()}
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
    @Published public private(set) var activeDocumentID:String?
    @Published public private(set) var activeName=""
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
        activePath=job.destination.url.standardizedFileURL.path;activeDocumentID=job.snapshot.plan.project.id;activeName=job.name
        task=Task.detached(priority:.userInitiated) { [weak self] in
            guard let self else {return}
            do {
                let throttle=ExportProgressThrottle()
                let receipt=try await NativeExport.run(snapshot:job.snapshot,destination:job.destination,stillFrame:job.stillFrame,range:job.range) { value,label in
                    if throttle.shouldReport(value,label:label) {Task { @MainActor [weak self] in guard let self,self.jobID==id,self.busy else{return};self.progress=value;self.status=label }}
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

private final class ExportProgressThrottle: @unchecked Sendable {
    private let lock=NSLock()
    private var last=0.0
    private var phase=""
    func shouldReport(_ value:Double,label:String)->Bool {
        lock.lock();defer{lock.unlock()}
        let now=ProcessInfo.processInfo.systemUptime,next=String(label.prefix(while:{$0 != " "}))
        guard value>=0.99 || next != phase || now-last>=0.1 else{return false}
        last=now;phase=next;return true
    }
}
