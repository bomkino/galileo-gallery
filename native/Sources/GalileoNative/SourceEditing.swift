import Foundation
import AVFoundation
import GalileoCore

public struct SourceEditTicket:Sendable,Equatable {
    let session:UUID,load:UUID,operation:UUID
    let epochs:[String:UInt64]
    let sources:[String:SourceDomain]
}
struct SourceDomain:Sendable,Equatable {
    let asset:String,hash:String,kind:MediaKind
    let original:String?,originalHash:String?,derivation:String?,unavailable:String?
    let width:Int,height:Int,duration:Double?
    let start:Double,end:Double?,rate:Double,loops:Bool,plays:Bool,selection:StillFrameSelection?
    init(_ item:MediaItem) {
        asset=item.asset;hash=item.sha256;kind=item.kind;original=item.originalAsset;originalHash=item.originalSHA256
        derivation=item.derivation;unavailable=item.unavailable;width=item.width;height=item.height;duration=item.duration
        start=item.trimStart;end=item.trimEnd;rate=item.sourceRate;loops=item.sourceLoops;plays=item.sourcePlays;selection=item.stillFrameSelection
    }
}
extension MediaItem {
    public var sourceRange:SourceRange {get throws {
        guard kind != .image,let duration else {throw GalleryError.invalid("The item has no timed source range.")}
        return try SourceRange(start:trimStart,end:min(trimEnd ?? duration,duration))
    }}
    public var sourceDisplayIdentity:String {
        let selection=(try? JSONEncoder().encode(stillFrameSelection)).map{$0.base64EncodedString()} ?? "none"
        return "\(kind.rawValue):\(duration?.bitPattern ?? 0):\(asset):\(sha256):\(originalSHA256 ?? ""):\(derivation ?? "native"):\(sourcePlays):\(trimStart.bitPattern):\(trimEnd?.bitPattern ?? 0):\(selection)"
    }
}
@MainActor extension EditorSession {
    func trackSourceChanges(from old:GalleryProject,to new:GalleryProject) {
        let previous=Dictionary(uniqueKeysWithValues:old.items.map{($0.id,SourceDomain($0))})
        let next=Dictionary(uniqueKeysWithValues:new.items.map{($0.id,SourceDomain($0))})
        for id in Set(previous.keys).union(next.keys) where previous[id] != next[id] {
            sourceEpochs[id,default:0] &+= 1
            if let operation=sourceOperations[id] {sourceCancellations[operation]?()}
            sourceOperations[id]=nil
        }
    }
    func invalidateSourceEdits() {sourceLoadID=UUID();sourceCancellations.values.forEach{$0()};sourceCancellations.removeAll();sourceOperations.removeAll()}
    public func beginSourceEdit(_ ids:Set<String>,allowImages:Bool=false)->SourceEditTicket? {
        let items=project.items.filter{ids.contains($0.id)}
        guard !ids.isEmpty,items.count==ids.count,items.allSatisfy({allowImages || ($0.kind != .image && $0.duration != nil)}) else {return nil}
        let operation=UUID()
        for id in ids {if let previous=sourceOperations[id] {sourceCancellations[previous]?()};sourceOperations[id]=operation}
        return SourceEditTicket(session:sourceSessionID,load:sourceLoadID,operation:operation,
            epochs:Dictionary(uniqueKeysWithValues:ids.map{($0,sourceEpochs[$0,default:0])}),
            sources:Dictionary(uniqueKeysWithValues:items.map{($0.id,SourceDomain($0))}))
    }
    public func acceptsSourceEdit(_ ticket:SourceEditTicket)->Bool {
        guard ticket.session==sourceSessionID,ticket.load==sourceLoadID else {return false}
        return ticket.epochs.allSatisfy { id,epoch in
            sourceEpochs[id,default:0]==epoch && sourceOperations[id]==ticket.operation &&
            project.items.first(where:{$0.id==id}).map(SourceDomain.init)==ticket.sources[id]
        }
    }
    public func cancelSourceEdit(_ ticket:SourceEditTicket) {
        sourceCancellations[ticket.operation]?();sourceCancellations[ticket.operation]=nil
        for id in ticket.epochs.keys where sourceOperations[id]==ticket.operation {sourceOperations[id]=nil}
    }
    public func setSourceDisplay(_ ids:Set<String>,plays:Bool) {
        guard ids.allSatisfy({id in project.items.contains{$0.id==id && $0.kind != .image && $0.duration != nil}}) else {return}
        editItems(ids,name:plays ? "Display moving source":"Display still") {
            $0.sourcePlays=plays
            if !plays,$0.stillFrameSelection == nil {$0.stillFrameSelection = .last}
        }
    }
    public func setRelativeStill(_ ids:Set<String>,selection:StillFrameSelection) {
        guard [.first,.middle,.last].contains(selection),ids.allSatisfy({id in project.items.contains{$0.id==id && $0.kind != .image && $0.duration != nil}}) else {return}
        editItems(ids,name:"Choose \(selection.label.lowercased()) frame") {$0.stillFrameSelection=selection;$0.sourcePlays=false}
    }
    /// A source-domain patch merges into the newest project; caption/framing edits survive.
    public func commitSourceDrafts(_ drafts:[MediaItem],ticket:SourceEditTicket,name:String="Edit source playback")->Bool {
        guard acceptsSourceEdit(ticket),Set(drafts.map(\.id))==Set(ticket.epochs.keys),drafts.count==ticket.epochs.count else {return false}
        var candidate=project
        for draft in drafts {
            guard let index=candidate.items.firstIndex(where:{$0.id==draft.id}) else {return false}
            candidate.items[index].trimStart=draft.trimStart;candidate.items[index].trimEnd=draft.trimEnd
            candidate.items[index].sourceRate=draft.sourceRate;candidate.items[index].sourceLoops=draft.sourceLoops
            candidate.items[index].sourcePlays=draft.sourcePlays;candidate.items[index].stillFrameSelection=draft.stillFrameSelection
        }
        do {try candidate.validate()} catch {issue=error.localizedDescription;return false}
        commit(name) {$0=candidate}
        cancelSourceEdit(ticket);return true
    }
    public func applySourceDrafts(_ drafts:[MediaItem],ticket:SourceEditTicket) async -> Bool {
        guard acceptsSourceEdit(ticket) else {return false}
        let previous=Dictionary(uniqueKeysWithValues:project.items.filter{ticket.epochs[$0.id] != nil}.map{($0.id,$0)})
        let workspace=self.workspace
        let work=Task.detached(priority:.userInitiated) { ()throws->[(MediaItem,String?)] in
            try drafts.map {draft in
                guard let old=previous[draft.id] else {throw GalleryError.cancelled}
                return try SourceEditPreparation.adjust(draft,previous:old,workspace:workspace)
            }
        }
        sourceCancellations[ticket.operation] = {work.cancel()}
        defer {sourceCancellations[ticket.operation]=nil}
        do {
            let prepared=try await withTaskCancellationHandler(operation:{try await work.value},onCancel:{work.cancel()})
            guard !Task.isCancelled,acceptsSourceEdit(ticket) else {return false}
            guard commitSourceDrafts(prepared.map(\.0),ticket:ticket) else {return false}
            let notices=prepared.compactMap(\.1)
            if !notices.isEmpty {issue=notices.joined(separator:"\n")}
            return true
        } catch {
            if !Task.isCancelled,acceptsSourceEdit(ticket),!(error is CancellationError) {issue=error.localizedDescription}
            return false
        }
    }
    public func resetSourceTrim(_ ids:Set<String>) async {
        guard let ticket=beginSourceEdit(ids) else {return}
        let drafts=project.items.filter{ids.contains($0.id)}.map {item -> MediaItem in var draft=item;draft.trimStart=0;draft.trimEnd=nil;return draft}
        _=await applySourceDrafts(drafts,ticket:ticket)
    }
}

public enum SourceEditPreparation {
    public static func adjust(_ draft:MediaItem,previous:MediaItem,workspace:Workspace,replacement:Bool=false)throws->(MediaItem,String?) {
        var draft=draft
        guard draft.kind != .image else {draft.stillFrameSelection=nil;return (draft,nil)}
        let range=try draft.sourceRange
        guard let choice=draft.stillFrameSelection else {return (draft,nil)}
        let trimChanged=draft.trimStart != previous.trimStart || draft.trimEnd != previous.trimEnd
        guard trimChanged || replacement else {return (draft,nil)}
        let resolver=StillSourceResolver.shared
        let anchor:SourceTime
        switch choice {
        case .first,.middle,.last:return (draft,nil)
        case .custom(let time):anchor=time
        case .legacyFrozen(let seconds):
            if replacement {anchor=try SourceTime(value:CMTime(seconds:seconds,preferredTimescale:600_000_000).value,timescale:600_000_000)}
            else {
                let displayed=try NativeRenderer().audition(item:previous,seconds:seconds,workspace:workspace,maximumDimension:64,legacy:true)
                anchor=try displayed.interval.anchor(in:previous.sourceRange)
            }
        }
        let resolved:ResolvedStillFrame
        if range.contains(anchor),!replacement {
            resolved=try resolver.resolve(item:draft,selection:.custom(anchor),range:range,workspace:workspace)
        } else {
            resolved=try resolver.resolve(item:draft,selection:.last,range:range,workspace:workspace,nearestTo:anchor)
        }
        let adjusted=try resolved.interval.anchor(in:range,preferred:anchor)
        draft.stillFrameSelection = .custom(adjusted)
        return (draft,adjusted == anchor ? nil:"The custom still moved to the nearest available picture within the trim.")
    }
}
