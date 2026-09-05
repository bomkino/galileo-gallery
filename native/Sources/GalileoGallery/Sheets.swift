import SwiftUI
import AppKit
import UniformTypeIdentifiers
import GalileoCore
import GalileoNative

struct SceneChooser:View {
    @ObservedObject var session:EditorSession
    @Environment(\.dismiss) private var dismiss
    @State private var draft:GalleryProject
    @State private var remembered:[String:SceneSettings]=[:]
    @State private var family:SceneFamily
    @State private var previewRevision=0
    @State private var error:String?
    @State private var applyTiming=false
    @State private var presets:[SavedPreset]=[]
    @State private var favorites:Set<String>
    @State private var onlyFavorites=false
    @StateObject private var playback:PlaybackModel
    init(session:EditorSession) {
        self.session=session
        _draft=State(initialValue:session.project)
        _family=State(initialValue:session.snapshot.plan.variant.family)
        _favorites=State(initialValue:Set(UserDefaults.standard.stringArray(forKey:"favorite-scenes") ?? []))
        _playback=StateObject(wrappedValue:PlaybackModel(schedule:session.snapshot.plan.schedule))
    }
    private var snapshot:RenderSnapshot? {try? RenderSnapshot(project:draft,workspace:session.workspace)}
    var body:some View {
        VStack(spacing:0) {
            HStack {
                Text("Scenes").font(.title2.weight(.semibold));Spacer()
                if draft.scene != SceneCatalog.defaults(for:draft.scene.variantID) {Text("Modified").font(.caption).foregroundStyle(.secondary)}
                Button("Cancel"){dismiss()}.keyboardShortcut(.cancelAction)
                Button("Apply") {
                    let scene=draft.scene,timing=draft.timing
                    session.commit(applyTiming ? "Apply preset":"Change scene") {p in p.scene=scene;if applyTiming {p.timing=timing}}
                    dismiss()
                }.keyboardShortcut(.defaultAction)
            }.padding(20)
            Divider()
            HSplitView {
                VStack(alignment:.leading) {
                    List(selection:Binding<SceneFamily?>(get:{family},set:{value in
                        guard let value else{return};family=value
                        if let first=SceneCatalog.variants(in:value).first {select(first.id)}
                    })) {
                        ForEach(SceneFamily.allCases,id:\.self) {family in Label(family.name,systemImage:family.symbol).tag(family)}
                    }.listStyle(.sidebar)
                    if !presets.isEmpty {
                        Divider();Text("Saved presets").font(.caption).foregroundStyle(.secondary).padding(.horizontal,12)
                        ScrollView {
                            VStack(alignment:.leading,spacing:8) {
                                ForEach(presets) { entry in
                                    Button(entry.preset.name) {
                                        draft.scene=entry.preset.scene;draft.timing=entry.preset.timing;family=SceneCatalog.variant(draft.scene.variantID)!.family
                                        applyTiming=true;changed()
                                    }.buttonStyle(.borderless)
                                }
                            }.padding(12)
                        }.frame(maxHeight:150)
                    }
                }.frame(width:180)
                VStack(alignment:.leading,spacing:14) {
                    HStack {
                        Toggle("Favourites",isOn:$onlyFavorites).toggleStyle(.button)
                        Spacer()
                        Button {favorite(draft.scene.variantID)} label: {Image(systemName:favorites.contains(draft.scene.variantID) ? "star.fill":"star")}.help("Favourite scene")
                    }
                    ScrollView(.horizontal) {
                        HStack {
                            ForEach(SceneCatalog.variants.filter{onlyFavorites ? favorites.contains($0.id):$0.family==family}) {variant in
                                Button(variant.name) {select(variant.id)}.buttonStyle(.bordered).tint(draft.scene.variantID==variant.id ? .accentColor:nil)
                            }
                        }
                    }
                    if let snapshot {
                        NativePreview(snapshot:snapshot,revision:previewRevision,frame:playback.frame,onError:{error=$0})
                        TransportBar(playback:playback,schedule:snapshot.plan.schedule,cues:snapshot.plan.spotlights)
                    }
                    if draft.items.isEmpty {Text("Add media to preview your scene.").foregroundStyle(.secondary)}
                    if let error {Text(error).foregroundStyle(.red)}
                }.padding(20)
            }
        }.frame(width:900,height:600).onAppear {
            if let snapshot {playback.update(snapshot.plan)}
            do {presets=try PresetStore.load()} catch {self.error=error.localizedDescription}
        }.onDisappear {playback.pause()}
    }
    private func select(_ id:String) {
        remembered[draft.scene.variantID]=draft.scene
        draft.scene=remembered[id] ?? SceneCatalog.defaults(for:id)
        family=SceneCatalog.variant(id)!.family;changed()
    }
    private func changed() {previewRevision+=1;error=nil;if let snapshot {playback.update(snapshot.plan);playback.seek(0)}}
    private func favorite(_ id:String) {
        if favorites.contains(id){favorites.remove(id)}else{favorites.insert(id)}
        UserDefaults.standard.set(favorites.sorted(),forKey:"favorite-scenes")
    }
}
struct ExportOptions:View {
    @ObservedObject var session:EditorSession
    let frame:Int64
    @Environment(\.dismiss) private var dismiss
    @State private var settings:ExportSettings
    @State private var mode="all"
    @State private var startSeconds=0.0
    @State private var endSeconds=1.0
    @State private var error:String?
    init(session:EditorSession,frame:Int64) {
        self.session=session;self.frame=frame;_settings=State(initialValue:session.project.export)
        _endSeconds=State(initialValue:session.snapshot.plan.schedule.duration)
    }
    private var plan:RenderPlan? {var p=session.project;p.export=settings;return try? RenderPlan(project:p)}
    private var compatible:Bool {session.project.canvas.background != .transparent || settings.format.supportsAlpha}
    private func range(_ plan:RenderPlan)throws->ExportRange {
        if mode=="cue" {
            guard session.selection.count==1 else {throw GalleryError.invalid("Select one spotlighted slide for this range.")}
            guard let cue=plan.spotlights.first(where:{session.selection.contains($0.itemID)}) else {throw GalleryError.invalid("Select a spotlighted slide first.")}
            let cycle=min(plan.schedule.cycles-1,frame/session.snapshot.plan.schedule.cycleFrames),offset=cycle*plan.schedule.cycleFrames
            return try ExportRange(start:cue.startFrame+offset,end:cue.endFrame+offset,total:plan.schedule.totalFrames)
        }
        if mode=="custom" {
            guard startSeconds.isFinite,endSeconds.isFinite,startSeconds>=0,endSeconds<=plan.schedule.duration else{throw GalleryError.invalid("The range is outside the document.")}
            return try ExportRange(start:Int64(floor(startSeconds*plan.schedule.rate.value)),end:Int64(ceil(endSeconds*plan.schedule.rate.value-1e-8)),total:plan.schedule.totalFrames)
        }
        return try ExportRange(start:0,end:plan.schedule.totalFrames,total:plan.schedule.totalFrames)
    }
    var body:some View {
        VStack(alignment:.leading,spacing:18) {
            Text("Export").font(.title2.weight(.semibold))
            Form {
                Picker("Format",selection:$settings.format) {ForEach(OutputFormat.allCases,id:\.self){Text($0.label).tag($0)}}
                if settings.format != .png {
                    Picker("Frame rate",selection:$settings.frameRate) {ForEach(FrameRate.supported,id:\.self){Text("\($0.label) fps").tag($0)}}
                    Picker("Range",selection:$mode) {
                        Text("Whole sequence").tag("all");Text("Selected spotlight").tag("cue");Text("Custom").tag("custom")
                    }
                    if mode=="custom" {
                        TextField("Start, seconds",value:$startSeconds,format:.number)
                        TextField("End, seconds",value:$endSeconds,format:.number)
                    }
                }
                LabeledContent("Size",value:"\(session.project.canvas.width) × \(session.project.canvas.height)")
                if let plan,let range=try? range(plan) {
                    LabeledContent("Frames",value:settings.format == .png ? "Current frame":"\(range.count)")
                    if settings.format != .png {LabeledContent("Duration",value:String(format:"%.3f s",plan.schedule.seconds(for:range.count)))}
                }
                Text(settings.format == .png || settings.format == .pngSequence ? "sRGB · transparency preserved":"Rec.709 · no audio").foregroundStyle(.secondary)
            }.formStyle(.grouped)
            if !compatible {Text("Use ProRes 4444 or PNG for transparency.").foregroundStyle(.orange)}
            if let error {Text(error).foregroundStyle(.red).textSelection(.enabled)}
            HStack {
                Spacer();Button("Cancel"){dismiss()}.keyboardShortcut(.cancelAction)
                Button(ExportCenter.shared.busy ? "Queue export…":"Export…",action:export).keyboardShortcut(.defaultAction)
                    .disabled(!compatible || session.project.activeItems.isEmpty)
            }
        }.padding(24).frame(width:480)
    }
    private func export() {
        do {
            var candidate=session.project;candidate.export=settings
            let snapshot=try RenderSnapshot(project:candidate,workspace:session.workspace)
            let selectedRange:ExportRange? = settings.format == .png ? nil : try range(snapshot.plan)
            guard !snapshot.plan.items.contains(where:{$0.unavailable != nil}) else {throw GalleryError.missing("Locate, replace or exclude missing media before exporting.")}
            let panel=NSSavePanel();panel.title="Export";panel.nameFieldStringValue=settings.format == .pngSequence ? "\(session.documentName) Frames":"\(session.documentName).\(settings.format.fileExtension)"
            if settings.format != .pngSequence {panel.allowedContentTypes=[UTType(filenameExtension:settings.format.fileExtension) ?? .data]}
            panel.canCreateDirectories=true
            guard panel.runModal() == .OK,let url=panel.url else{return}
            if settings.format == .pngSequence,FileManager.default.fileExists(atPath:url.path){throw GalleryError.invalid("Choose a new folder for the PNG sequence. Existing folders are not replaced.")}
            let destination=try ExportDestination(url:url),previewTime=session.snapshot.plan.schedule.seconds(for:frame)
            guard ExportCenter.shared.start(snapshot:snapshot,destination:destination,stillFrame:snapshot.plan.schedule.frame(at:previewTime),range:selectedRange) else {
                self.error=ExportCenter.shared.error;return
            }
            session.commit("Export settings"){$0.export=settings}
            dismiss();NotificationCenter.default.post(name:.showExports,object:nil)
        } catch {self.error=error.localizedDescription}
    }
}
struct ExportsView:View {
    @ObservedObject var exports=ExportCenter.shared
    var body:some View {
        VStack(alignment:.leading,spacing:16) {
            HStack {Text("Exports").font(.title2.weight(.semibold));Spacer();if exports.busy {ProgressView().controlSize(.small)}}
            if exports.busy {
                ProgressView(value:exports.progress)
                HStack {Text(exports.status).monospacedDigit();Spacer();Button("Cancel current",action:exports.cancel).disabled(exports.progress>=0.99)}
            }
            if let error=exports.error {Text(error).textSelection(.enabled).foregroundStyle(.red)}
            ForEach(exports.pending) {job in
                HStack {Text(job.name).lineLimit(1);Spacer();Button("Remove"){exports.removeQueued(job.id)}}
            }
            if !exports.pending.isEmpty {Button("Cancel all",action:exports.cancelAll)}
            ScrollView {
                VStack(alignment:.leading,spacing:12) {
                    ForEach(exports.history) {entry in
                        HStack {
                            Image(systemName:entry.result == nil ? "exclamationmark.circle":"checkmark.circle")
                            VStack(alignment:.leading) {Text(entry.name).lineLimit(1);if let error=entry.error {Text(error).font(.caption).foregroundStyle(.secondary)}}
                            Spacer()
                            if let result=entry.result {Button("Show"){NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath:result.outputPath)])}}
                        }
                    }
                    if exports.history.isEmpty && !exports.busy {Text("No exports yet.").foregroundStyle(.secondary)}
                }
            }.frame(maxHeight:260)
        }.padding(24).frame(width:500).frame(minHeight:180)
    }
}
