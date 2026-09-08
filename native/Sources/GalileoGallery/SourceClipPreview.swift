import PitchdogStudioUI
import SwiftUI
import AppKit
import GalileoCore
import GalileoNative

@MainActor private final class ClipPreviewModel:ObservableObject {
    @Published var image:CGImage?
    @Published var thumbnails:[CGImage]=[]
    @Published var seconds=0.0
    @Published var playing=false
    @Published var loading=false
    @Published var applying=false
    @Published var error:String?
    private(set) var displayedSeconds=0.0
    private(set) var displayed:SourceInterval?
    private let worker=SourcePreviewWorker()
    private var playback:Task<Void,Never>?
    private var seekTask:Task<Void,Never>?
    private var applyTask:Task<Void,Never>?
    private var identity=UUID()
    private var closed=false
    private weak var session:EditorSession?
    private let ticket:SourceEditTicket?
    let item:MediaItem
    let workspace:Workspace
    init(item:MediaItem,session:EditorSession) {
        self.item=item;workspace=session.workspace;self.session=session
        ticket=session.beginSourceEdit([item.id]);seconds=item.trimStart
    }
    private func adopt(_ frame:SourceAuditionFrame,seconds:Double,id:UUID) {
        guard !Task.isCancelled,!closed,identity==id else {return}
        image=frame.image;displayed=frame.interval;displayedSeconds=seconds;loading=false;error=nil
    }
    private func fail(_ failure:Error,id:UUID) {
        guard !Task.isCancelled,!closed,identity==id else {return}
        image=nil;displayed=nil;error=failure.localizedDescription;loading=false;playing=false
    }
    func load() async {
        let id=identity;loading=true
        do {
            let first=try await worker.audition(item:item,seconds:seconds,workspace:workspace)
            adopt(first,seconds:seconds,id:id)
            let end=max(0,(item.duration ?? 0)-0.002)
            for index in 0..<8 {
                let image=try await worker.frame(item:item,seconds:end*Double(index)/7,workspace:workspace,maximumDimension:160)
                guard !Task.isCancelled,!closed else {return};thumbnails.append(image)
            }
        } catch {fail(error,id:id)}
    }
    func seek(_ value:Double) {
        stop();seconds=bounded(value,0,max(0,(item.duration ?? 0)-0.002))
        let requested=seconds,id=identity;loading=true;image=nil;displayed=nil;error=nil
        seekTask=Task {[weak self] in
            guard let self else{return}
            do {adopt(try await worker.audition(item:item,seconds:requested,workspace:workspace),seconds:requested,id:id)}
            catch {fail(error,id:id)}
        }
    }
    func play(_ draft:MediaItem) {
        stop();playing=true;error=nil
        let start=draft.trimStart,end=draft.trimEnd ?? draft.duration ?? 0
        if seconds<start || seconds>=end {seconds=start}
        let initial=seconds,anchor=ProcessInfo.processInfo.systemUptime,id=identity
        playback=Task {[weak self] in
            guard let self else{return}
            do {
                while !Task.isCancelled,!closed,identity==id {
                    let elapsed=(ProcessInfo.processInfo.systemUptime-anchor)*draft.sourceRate
                    let raw=initial-start+elapsed,length=max(0.001,end-start)
                    let ended=raw>=length && !draft.sourceLoops
                    let requested=ended ? max(start,end-0.002):start+(draft.sourceLoops ? raw.truncatingRemainder(dividingBy:length):raw)
                    let picture=try await worker.audition(item:item,seconds:requested,workspace:workspace)
                    try Task.checkCancellation();guard identity==id else {return}
                    seconds=requested;adopt(picture,seconds:requested,id:id)
                    if ended {playing=false;break}
                    try await Task.sleep(nanoseconds:16_666_667)
                }
            } catch {fail(error,id:id)}
        }
    }
    func apply(_ draft:MediaItem,onSuccess:@escaping @MainActor ()->Void) {
        guard !applying,let session,let ticket,session.acceptsSourceEdit(ticket) else {
            error="The source changed while this editor was open. Reopen it to edit the current source.";return
        }
        stop();applying=true
        applyTask=Task { [weak self] in
            guard let self else {return}
            let accepted=await session.applySourceDrafts([draft],ticket:ticket)
            guard !Task.isCancelled,!closed else {return}
            applying=false
            if accepted {onSuccess()} else {error=session.issue ?? "The source changed. Reopen its editor and retry."}
        }
    }
    func useFrame(in draft:MediaItem)throws->StillFrameSelection {
        guard !loading,!playing,let displayed else {throw GalleryError.invalid("Wait for the requested source picture before using it.")}
        return .custom(try displayed.anchor(in:draft.sourceRange,preferredSeconds:displayedSeconds))
    }
    func stop() {playback?.cancel();playback=nil;seekTask?.cancel();seekTask=nil;identity=UUID();playing=false;loading=false}
    func close() {closed=true;stop();applyTask?.cancel();if let ticket {session?.cancelSourceEdit(ticket)}}
}

struct SourceClipPreview:View {
    @ObservedObject var session:EditorSession
    let itemID:String
    @Environment(\.dismiss) private var dismiss
    @State private var draft:MediaItem
    @StateObject private var model:ClipPreviewModel
    init(session:EditorSession,itemID:String) {
        self.session=session;self.itemID=itemID
        let item=session.project.items.first{$0.id==itemID} ?? MediaItem(name:"Unavailable",asset:"missing",sha256:String(repeating:"0",count:64),kind:.image,width:1,height:1)
        _draft=State(initialValue:item)
        _model=StateObject(wrappedValue:ClipPreviewModel(item:item,session:session))
    }
    private var duration:Double {draft.duration ?? 0.001}
    private var unresolvedCustom:Bool {
        if case .some(.custom(_))=draft.stillFrameSelection {return model.displayed==nil};return false
    }
    var body:some View {
        VStack(spacing:16) {
            HStack {
                Text(draft.name).studioType(.panelTitle).lineLimit(1);Spacer()
                Button("Cancel"){dismiss()}.keyboardShortcut(.cancelAction)
                Button(model.applying ? "Applying…":"Apply") {model.apply(draft) {dismiss()}}
                    .keyboardShortcut(.defaultAction).disabled(model.applying || model.loading || unresolvedCustom)

            }
            Group {
            ZStack {
                Rectangle().fill(Color(nsColor:.underPageBackgroundColor))
                if let image=model.image {Image(decorative:image,scale:1).resizable().scaledToFit().padding(8)}
                else {ProgressView()}
            }.frame(height:320).clipShape(RoundedRectangle(cornerRadius:8))
            HStack(spacing:4) {
                ForEach(Array(model.thumbnails.enumerated()),id:\.offset) {index,image in
                    Button {model.seek(max(0,duration-0.002)*Double(index)/7)} label: {
                        Image(decorative:image,scale:1).resizable().aspectRatio(contentMode:.fit)
                    }.buttonStyle(.plain).accessibilityLabel("Preview source at \(String(format:"%.2f",duration*Double(index)/7)) seconds")
                }
            }.frame(height:54)
            HStack {
                Button {model.playing ? model.stop():model.play(draft)} label:{Image(systemName:model.playing ? "pause.fill":"play.fill")}.help("Preview trimmed source")
                Slider(value:Binding(get:{model.seconds},set:model.seek),in:0...max(0.001,duration-0.002)).accessibilityLabel("Source position")
                Text(String(format:"%.2f / %.2f s",model.seconds,duration)).monospacedDigit().studioType(.caption).frame(width:125,alignment:.trailing)
            }
            HStack {
                Text("In")
                TextField("In seconds",value:Binding(get:{draft.trimStart},set:{draft.trimStart=bounded($0,0,max(0,(draft.trimEnd ?? duration)-0.001));model.seek(draft.trimStart)}),format:.number.precision(.fractionLength(3))).frame(width:75)
                Button("Set here"){draft.trimStart=min(model.seconds,max(0,(draft.trimEnd ?? duration)-0.001));model.stop()}
                Text("Out")
                TextField("Out seconds",value:Binding(get:{draft.trimEnd ?? duration},set:{draft.trimEnd=bounded($0,draft.trimStart+0.001,duration);model.stop()}),format:.number.precision(.fractionLength(3))).frame(width:75)
                Button("Set here"){draft.trimEnd=min(duration,max(draft.trimStart+0.001,model.seconds));model.stop()}
                Spacer();Button("Reset trim"){draft.trimStart=0;draft.trimEnd=nil;model.seek(0)}
            }.textFieldStyle(StudioTextFieldStyle())
            HStack {
                StudioChoiceBar("Display",selection:Binding(get:{draft.sourcePlays},set:{plays in
                    draft.sourcePlays=plays;if !plays,draft.stillFrameSelection==nil {draft.stillFrameSelection = .last}
                }),choices:[StudioChoice(true,draft.kind == .animatedImage ? "Animation":"Video"),StudioChoice(false,"Still")]).frame(width:210)
                Toggle("Loop source",isOn:$draft.sourceLoops)
                Text("Rate")
                TextField("Playback rate",value:Binding(get:{draft.sourceRate},set:{draft.sourceRate=bounded($0,0.25,4);model.stop()}),format:.number.precision(.fractionLength(2))).frame(width:65).textFieldStyle(StudioTextFieldStyle())
                Text("×");Spacer()
                Button("Use this frame") {
                    do {draft.stillFrameSelection=try model.useFrame(in:draft);draft.sourcePlays=false;model.stop()}
                    catch {model.error=error.localizedDescription}
                }.disabled(model.loading || model.playing || model.displayed==nil || model.applying)
            }
            }.disabled(model.applying)
            if let error=model.error {Text(error).foregroundStyle(.red).studioType(.bodyCompact).textSelection(.enabled)}
        }.padding(22).frame(width:760)
        .task {await model.load()}
        .onChange(of:draft.sourceLoops){_,_ in model.stop()}
        .onChange(of:draft.sourcePlays){_,_ in model.stop()}
        .onDisappear {model.close()}
    }
}
