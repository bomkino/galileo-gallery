import SwiftUI
import GalileoCore
import GalileoNative
import PitchdogStudioUI

struct SourceDisplayControls:View {
    @ObservedObject var session:EditorSession
    let items:[MediaItem]
    @State private var pictures:[StillFrameSelection:CGImage]=[:]
    @State private var pictureErrors:[StillFrameSelection:String]=[:]
    @State private var loadedIdentity=""
    @State private var retry=0
    private var ids:Set<String> {Set(items.map(\.id))}
    private var movingTitle:String {
        Set(items.map(\.kind)).count>1 ? "Moving":items.first?.kind == .animatedImage ? "Animation":"Video"
    }
    private var mode:String {
        Set(items.map(\.sourcePlays)).count>1 ? "mixed":items.first?.sourcePlays == true ? "moving":"still"
    }
    private var choice:StillFrameSelection? {
        guard let first=items.first?.stillFrameSelection,items.allSatisfy({$0.stillFrameSelection==first}) else {return nil};return first
    }
    private var identity:String {items.count==1 ? session.workspace.root.path+":"+items[0].id+":"+items[0].sourceDisplayIdentity+":"+String(retry):"batch"}
    var body:some View {
        VStack(alignment:.leading,spacing:10) {
            HStack {Text("Display").studioType(.label);Spacer();if mode=="mixed" {Text("Mixed").studioType(.caption)}}
            StudioChoiceBar("Display",selection:Binding(get:{mode},set:{session.setSourceDisplay(ids,plays:$0=="moving")}),choices:[StudioChoice("moving",movingTitle),StudioChoice("still","Still")])
                .accessibilityIdentifier("galileo.source-display")
            if mode != "moving" {
                HStack(spacing:5) {
                    ForEach([StillFrameSelection.first,.middle,.last],id:\.self) { selection in
                        Button {session.setRelativeStill(ids,selection:selection)} label: {
                            VStack(spacing:5) {
                                if items.count==1 {
                                    ZStack {
                                        Rectangle().fill(.black.opacity(0.12))
                                        if loadedIdentity==identity,let image=pictures[selection] {Image(decorative:image,scale:1).resizable().scaledToFit()}
                                        else if loadedIdentity==identity,pictureErrors[selection] != nil {Image(systemName:"exclamationmark.triangle")}
                                        else {ProgressView().controlSize(.small)}
                                    }.frame(height:42).clipped()
                                }
                                Text(selection.label).studioType(.caption)
                                Rectangle().fill(choice==selection ? Color.accentColor:Color.clear).frame(height:2)
                            }.frame(maxWidth:.infinity)
                        }.buttonStyle(StudioButtonStyle(.quiet,compact:true))
                            .accessibilityLabel("\(selection.label) frame")
                            .accessibilityAddTraits(choice==selection ? [.isSelected]:[])
                    }
                }
                .accessibilityElement(children:.contain).accessibilityIdentifier("galileo.still-choices")
                if let choice {
                    switch choice {
                    case .custom(let anchor):Text(String(format:"Custom · %.6f s",anchor.seconds)).studioType(.caption).monospacedDigit()
                    case .legacyFrozen(let seconds):Text(String(format:"Custom · %.6f s",seconds)).studioType(.caption).monospacedDigit()
                    default:EmptyView()
                    }
                } else if items.count>1 {Text("Mixed frames").studioType(.caption)}
                if items.count==1,let item=items.first {
                    Button("Choose another frame…") {session.previewMediaID=item.id}.disabled(item.unavailable != nil)
                    if item.trimStart != 0 || item.trimEnd != nil {Text("Within trim").studioType(.caption).foregroundStyle(.secondary)}
                    if loadedIdentity==identity,let error=pictureErrors[choice ?? .last] ?? pictureErrors.values.first {
                        Text(error).studioType(.caption).foregroundStyle(.red)
                        Button("Retry frames") {retry+=1}
                    }
                }
            }
        }
        .task(id:identity+":"+mode) {
            pictures=[:];pictureErrors=[:];loadedIdentity=identity
            guard items.count==1,let item=items.first,mode != "moving" else {return}
            let request=identity
            var order:[StillFrameSelection]=[.first,.middle,.last]
            if let choice,order.contains(choice) {order.removeAll{$0==choice};order.insert(choice,at:0)}
            for selection in order {
                guard !Task.isCancelled,request==identity else {return}
                var source=item;source.sourcePlays=false;source.stillFrameSelection=selection
                do {
                    let image=try await ThumbnailWorker.shared.image(item:source,workspace:session.workspace,maximumDimension:160)
                    guard !Task.isCancelled,request==identity else {return};pictures[selection]=image
                } catch {
                    guard !Task.isCancelled,request==identity else {return};pictureErrors[selection]=error.localizedDescription
                }
            }
        }
    }
}

/// One staged source-domain edit per completed field/slider interaction.
/// Metadata work begins after the gesture; no undo group survives an await.
struct SourceTrimControl:View {
    @ObservedObject var session:EditorSession
    let ids:Set<String>,label:String,range:ClosedRange<Double>,outPoint:Bool
    @State private var text=""
    @State private var initialText=""
    @State private var value:Double?
    @State private var originals:[MediaItem]=[]
    @State private var ticket:SourceEditTicket?
    @State private var capturedRange:ClosedRange<Double>?
    @State private var error:String?
    @State private var pending=false
    @State private var operation=UUID()
    @State private var cancelledBlur=false
    @FocusState private var focused:Bool
    private var items:[MediaItem] {session.project.items.filter{ids.contains($0.id)}}
    private func current(_ item:MediaItem)->Double {outPoint ? item.trimEnd ?? item.duration ?? 0:item.trimStart}
    private var live:Double {items.first.map(current) ?? range.lowerBound}
    private var mixed:Bool {items.contains{current($0) != live}}
    var body:some View {
        VStack(alignment:.leading,spacing:5) {
            HStack {
                Text(label).studioType(.bodyCompact);Spacer()
                if pending {ProgressView().controlSize(.small)}
                TextField(mixed ? "Mixed":label,text:$text).multilineTextAlignment(.trailing).frame(width:72)
                    .textFieldStyle(StudioTextFieldStyle(focused:focused,invalid:error != nil)).focused($focused)
                    .onSubmit(finish).onExitCommand(perform:cancel)
                    .onChange(of:focused) {_,focus in
                        if focus {begin()}
                        else if cancelledBlur {cancelledBlur=false}
                        else {finish()}
                    }
                Text("s").studioType(.caption).frame(width:16)
            }
            if !mixed {
                StudioSlider(label,value:Binding(get:{value ?? live},set:{new in begin();value=new;text=String(new)}),in:range,step:0.01,onEditingChanged:{editing in if editing {begin()} else {finish()}}).frame(height:22)
            }
            if let error {Text(error).studioType(.caption).foregroundStyle(.red)}
        }.onAppear(perform:sync)
            .onChange(of:live) {if ticket==nil && !pending {sync()}}
            .onChange(of:ids) {finish();operation=UUID();focused=false;sync()}
            .onDisappear {if ticket != nil {finish()}}
    }
    private func sync() {value=nil;text=mixed ? "":String(live)}
    private func begin() {
        guard ticket==nil else {return}
        operation=UUID();pending=false;error=nil;originals=items;capturedRange=range
        ticket=session.beginSourceEdit(Set(originals.map(\.id)));initialText=text
        value=live
    }
    private func cancel() {
        if let ticket {session.cancelSourceEdit(ticket)}
        ticket=nil;operation=UUID();pending=false;cancelledBlur=true;error=nil;sync();focused=false
    }
    private func finish() {
        guard let ticket else {return}
        if text==initialText {session.cancelSourceEdit(ticket);self.ticket=nil;sync();return}
        guard let number=Double(text),number.isFinite,let capturedRange,capturedRange.contains(number) else {error="Enter a time within the available source range.";return}
        var drafts=originals
        for index in drafts.indices {if outPoint {drafts[index].trimEnd=number} else {drafts[index].trimStart=number}}
        self.ticket=nil;pending=true;let generation=operation
        Task { @MainActor in
            let accepted=await session.applySourceDrafts(drafts,ticket:ticket)
            guard operation==generation else {return}
            pending=false
            if !accepted {error="The source changed or the frame could not be resolved. Retry the trim edit."}
            sync()
        }
    }
}
