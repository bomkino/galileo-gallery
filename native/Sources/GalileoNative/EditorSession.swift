import Foundation
import AppKit
import Combine
import GalileoCore

@MainActor public final class EditorSession: ObservableObject {
    @Published public private(set) var project:GalleryProject
    @Published public private(set) var snapshot:RenderSnapshot
    @Published public private(set) var revision:Int=0
    @Published public var documentName="Untitled"
    @Published public var selection:Set<String>=[]
    @Published public var issue:String?=nil
    @Published public private(set) var importing=false
    @Published public var showSidebar=true
    @Published public var showInspector=true
    @Published public var choosingScene=false
    @Published public var choosingExport=false
    public private(set) var workspace:Workspace
    public var undoManager:UndoManager?
    public var didEdit:(()->Void)?
    public var didLoad:(()->Void)?
    private var generation=UUID()
    private var importTask:Task<Void,Never>?
    private var gesture=false
    public init(project:GalleryProject=GalleryProject(),workspace:Workspace?=nil)throws {
        let owned=try workspace ?? Workspace()
        self.project=project;self.documentName=project.name;self.workspace=owned;snapshot=try RenderSnapshot(project:project,workspace:owned)
    }
    public var selectedItem:MediaItem? { project.items.first { selection.contains($0.id) } }
    public func commit(_ name:String,_ edit:(inout GalleryProject)->Void) {
        var candidate=project;edit(&candidate)
        do { try apply(candidate,name:name) } catch { issue=error.localizedDescription }
    }
    private func apply(_ candidate:GalleryProject,name:String)throws {
        try candidate.validate()
        guard candidate != project else { return }
        let previous=project
        let manager=undoManager
        let explicitGroup = !gesture && !(manager?.isUndoing ?? false) && !(manager?.isRedoing ?? false)
        if explicitGroup { manager?.beginUndoGrouping() }
        manager?.registerUndo(withTarget:self) { session in
            MainActor.assumeIsolated { do { try session.apply(previous,name:name) } catch { session.issue=error.localizedDescription } }
        }
        manager?.setActionName(name)
        project=candidate;snapshot=try RenderSnapshot(project:candidate,workspace:workspace);revision+=1
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
        let ids=selection
        commit(name) { p in for i in p.items.indices where ids.contains(p.items[i].id) { edit(&p.items[i]) } }
    }
    public func removeSelection() { let ids=selection;commit("Remove media"){$0.items.removeAll{ids.contains($0.id)}} }
    public func duplicateSelection() {
        let ids=selection;var newIDs=Set<String>()
        commit("Duplicate media") { p in
            p.items=p.items.flatMap { item -> [MediaItem] in
                guard ids.contains(item.id) else { return [item] }
                var copy=item;copy.id=UUID().uuidString;copy.opening=false;newIDs.insert(copy.id)
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
    public func importURLs(_ urls:[URL],replacing:String?=nil) {
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
                    do { items.append(try await AssetImporter.inspect(url,workspace:staging)) }
                    catch is CancellationError { throw CancellationError() }
                    catch { failures.append(error.localizedDescription) }
                }
                try Task.checkCancellation()
                let completedItems=items,completedFailures=failures
                await MainActor.run {
                    guard self.generation==token,!Task.isCancelled else { return }
                    do {
                        var candidate=self.project
                        if let replacing,let index=candidate.items.firstIndex(where:{$0.id==replacing}),var replacement=completedItems.first {
                            let prior=candidate.items[index];replacement.id=prior.id;replacement.caption=prior.caption
                            replacement.fit=prior.fit;replacement.crop=prior.crop;replacement.focal=prior.focal
                            replacement.displayRatio=prior.displayRatio;replacement.included=prior.included;replacement.opening=prior.opening
                            replacement.sourcePlays=prior.sourcePlays;replacement.sourceLoops=prior.sourceLoops
                            candidate.items[index]=replacement
                        } else if replacing==nil { candidate.items+=completedItems }
                        try candidate.validate()
                        var unique=Set<String>()
                        for item in completedItems where unique.insert(item.asset).inserted {
                            let source=try staging.url(for:item),destination=self.workspace.assets.appendingPathComponent(item.asset)
                            if !FileManager.default.fileExists(atPath:destination.path) {
                                do { try FileManager.default.linkItem(at:source,to:destination) }
                                catch { try FileManager.default.copyItem(at:source,to:destination) }
                            }
                        }
                        try self.apply(candidate,name:replacing==nil ? "Add media":"Replace media")
                        if replacing==nil { self.selection=Set(completedItems.map(\.id)) }
                        if !completedFailures.isEmpty { self.issue=completedFailures.joined(separator:"\n") }
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
    public init(schedule:FrameSchedule) { self.schedule=schedule }
    deinit { timer?.invalidate() }
    public func update(_ plan:RenderPlan) {
        pause();schedule=plan.schedule;loop=plan.project.timing.playMode == .loop
        transport.seek(frame,schedule:schedule);frame=transport.frame
    }
    public func seek(_ frame:Int64) { pause();transport.seek(frame,schedule:schedule);self.frame=transport.frame }
    public func step(_ amount:Int64) { seek(frame+amount) }
    public func restart() { seek(0);play() }
    public func toggle() { playing ? pause():play() }
    public func pause() { timer?.invalidate();timer=nil;transport.pause();playing=false }
    public func play() {
        transport.play(now:ProcessInfo.processInfo.systemUptime,schedule:schedule);playing=true
        timer?.invalidate()
        let newTimer=Timer(timeInterval:1/60,repeats:true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.transport.tick(now:ProcessInfo.processInfo.systemUptime,schedule:self.schedule,loop:self.loop)
                if self.frame != self.transport.frame { self.frame=self.transport.frame }
                if !self.transport.playing { self.pause() }
            }
        }
        timer=newTimer;RunLoop.main.add(newTimer,forMode:.common)
    }
}
@MainActor public final class ExportCenter: ObservableObject {
    public static let shared=ExportCenter()
    @Published public private(set) var busy=false
    @Published public private(set) var progress=0.0
    @Published public private(set) var status=""
    @Published public private(set) var result:ExportReceipt?
    @Published public private(set) var error:String?
    private var task:Task<Void,Never>?
    private var jobID=UUID()
    public init() {}
    public func start(snapshot:RenderSnapshot,destination:ExportDestination,stillFrame:Int64) {
        guard !busy else { return }
        let id=UUID();jobID=id;busy=true;progress=0;status="Preparing";error=nil;result=nil
        task=Task.detached(priority:.userInitiated) { [weak self] in
            guard let self else { return }
            do {
                let receipt=try await NativeExport.run(snapshot:snapshot,destination:destination,stillFrame:stillFrame) { value,label in
                    Task { @MainActor [weak self] in guard let self,self.jobID==id,self.busy else { return };self.progress=value;self.status=label }
                }
                await MainActor.run { guard self.jobID==id else { return };self.result=receipt;self.status="Exported";self.progress=1;self.busy=false;self.task=nil }
            } catch {
                let cancelled=error is CancellationError || (error as? GalleryError) == .cancelled
                let message=error.localizedDescription
                await MainActor.run { guard self.jobID==id else { return };self.busy=false;self.task=nil;self.status=cancelled ? "Cancelled":"Export failed";self.error=cancelled ? nil:message }
            }
        }
    }
    public func cancel() { guard busy,progress<0.99 else { return };status="Cancelling";task?.cancel() }
    public func reveal() { if let path=result?.outputPath { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath:path)]) } }
}
