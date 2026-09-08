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
    @Published var error:String?
    private let worker=SourcePreviewWorker()
    private var playback:Task<Void,Never>?
    private var seekTask:Task<Void,Never>?
    private var identity=UUID()
    let item:MediaItem
    let workspace:Workspace
    init(item:MediaItem,workspace:Workspace) {self.item=item;self.workspace=workspace;seconds=item.trimStart}
    func load() async {
        do {
            image=try await worker.frame(item:item,seconds:seconds,workspace:workspace)
            let end=max(0,(item.duration ?? 0)-0.002)
            for index in 0..<8 {
                let image=try await worker.frame(item:item,seconds:end*Double(index)/7,workspace:workspace,maximumDimension:160)
                try Task.checkCancellation();thumbnails.append(image)
            }
        } catch is CancellationError {} catch {self.error=error.localizedDescription}
    }
    func seek(_ value:Double) {
        stop();seconds=bounded(value,0,max(0,(item.duration ?? 0)-0.002));identity=UUID();let id=identity
        seekTask=Task {[weak self] in
            guard let self else{return}
            do {
                let result=try await worker.frame(item:item,seconds:seconds,workspace:workspace)
                if !Task.isCancelled,identity==id {image=result}
            } catch is CancellationError {} catch {self.error=error.localizedDescription}
        }
    }
    func play(_ draft:MediaItem) {
        stop();playing=true;error=nil
        let start=draft.trimStart,end=draft.trimEnd ?? draft.duration ?? 0
        if seconds<start || seconds>=end {seconds=start}
        let initial=seconds,anchor=ProcessInfo.processInfo.systemUptime
        playback=Task {[weak self] in
            guard let self else{return}
            do {
                while !Task.isCancelled {
                    let elapsed=(ProcessInfo.processInfo.systemUptime-anchor)*draft.sourceRate
                    let raw=initial-start+elapsed,length=max(0.001,end-start)
                    if raw>=length && !draft.sourceLoops {
                        seconds=max(start,end-0.002)
                        let last=try await worker.frame(item:item,seconds:seconds,workspace:workspace)
                        try Task.checkCancellation();image=last;playing=false;break
                    }
                    seconds=start+(draft.sourceLoops ? raw.truncatingRemainder(dividingBy:length):raw)
                    let picture=try await worker.frame(item:item,seconds:seconds,workspace:workspace)
                    try Task.checkCancellation();image=picture
                    try await Task.sleep(nanoseconds:16_666_667)
                }
            } catch is CancellationError {} catch {self.error=error.localizedDescription;playing=false}
        }
    }
    func stop() {playback?.cancel();playback=nil;seekTask?.cancel();seekTask=nil;identity=UUID();playing=false}
}

struct SourceClipPreview:View {
    @ObservedObject var session:EditorSession
    let itemID:String
    @Environment(\.dismiss) private var dismiss
    @State private var draft:MediaItem
    @StateObject private var model:ClipPreviewModel
    private let originalHash:String
    init(session:EditorSession,itemID:String) {
        self.session=session;self.itemID=itemID
        let item=session.project.items.first{$0.id==itemID} ?? MediaItem(name:"Unavailable",asset:"missing",sha256:String(repeating:"0",count:64),kind:.image,width:1,height:1)
        originalHash=item.sha256;_draft=State(initialValue:item)
        _model=StateObject(wrappedValue:ClipPreviewModel(item:item,workspace:session.workspace))
    }
    private var duration:Double {draft.duration ?? 0.001}
    var body:some View {
        VStack(spacing:16) {
            HStack {
                Text(draft.name).studioType(.panelTitle).lineLimit(1);Spacer()
                Button("Cancel"){dismiss()}.keyboardShortcut(.cancelAction)
                Button("Apply") {
                    guard session.project.items.first(where:{$0.id==itemID})?.sha256==originalHash else {model.error="The source changed while previewing. Reopen the clip preview.";return}
                    session.editItems([itemID],name:"Edit source playback") {
                        $0.trimStart=draft.trimStart;$0.trimEnd=draft.trimEnd;$0.sourceRate=draft.sourceRate
                        $0.sourceLoops=draft.sourceLoops;$0.sourcePlays=draft.sourcePlays
                    }
                    dismiss()
                }.keyboardShortcut(.defaultAction).disabled(model.image==nil)
            }
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
            }.textFieldStyle(.roundedBorder)
            HStack {
                Toggle("Play source",isOn:$draft.sourcePlays)
                Toggle("Loop source",isOn:$draft.sourceLoops)
                Text("Rate")
                TextField("Playback rate",value:Binding(get:{draft.sourceRate},set:{draft.sourceRate=bounded($0,0.25,4);model.stop()}),format:.number.precision(.fractionLength(2))).frame(width:65).textFieldStyle(.roundedBorder)
                Text("×");Spacer()
                Button("Freeze here"){draft.trimStart=min(model.seconds,max(0,(draft.trimEnd ?? duration)-0.001));draft.sourcePlays=false;model.stop()}
            }
            if let error=model.error {Text(error).foregroundStyle(.red).studioType(.bodyCompact).textSelection(.enabled)}
        }.padding(22).frame(width:760)
        .task {await model.load()}
        .onChange(of:draft.sourceLoops){_,_ in model.stop()}
        .onChange(of:draft.sourcePlays){_,_ in model.stop()}
        .onDisappear {model.stop()}
    }
}
