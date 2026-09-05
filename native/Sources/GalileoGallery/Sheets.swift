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
    @State private var previewFrame:Int64=0
    @State private var previewRevision=0
    @State private var error:String?
    init(session:EditorSession) {
        self.session=session
        _draft=State(initialValue:session.project)
        _family=State(initialValue:SceneCatalog.variant(session.project.scene.variantID)!.family)
    }
    private var snapshot:RenderSnapshot? { try? RenderSnapshot(project:draft,workspace:session.workspace) }
    var body:some View {
        VStack(spacing:0) {
            HStack { Text("Scenes").font(.title2.weight(.semibold));Spacer();Button("Cancel"){dismiss()}.keyboardShortcut(.cancelAction);Button("Apply"){ let scene=draft.scene;session.commit("Change scene"){$0.scene=scene};dismiss() }.keyboardShortcut(.defaultAction) }.padding(20)
            Divider()
            HSplitView {
                List(selection:Binding<SceneFamily?>(get:{family},set:{if let value=$0 {family=value}})) {
                    ForEach(SceneFamily.allCases,id:\.self) { family in Label(family.name,systemImage:family.symbol).tag(family) }
                }.listStyle(.sidebar).frame(width:180)
                VStack(alignment:.leading,spacing:14) {
                    ScrollView(.horizontal) {
                        HStack { ForEach(SceneCatalog.variants.filter{$0.family==family}) { variant in
                            Button(variant.name) { select(variant.id) }.buttonStyle(.bordered).tint(draft.scene.variantID==variant.id ? .accentColor:nil)
                        } }
                    }
                    if let snapshot {
                        NativePreview(snapshot:snapshot,revision:previewRevision,frame:previewFrame,onError:{error=$0})
                        Slider(value:Binding(get:{Double(previewFrame)},set:{previewFrame=Int64($0)}),in:0...Double(max(1,snapshot.plan.schedule.cycleFrames-1)),step:1).accessibilityLabel("Scene preview frame")
                    }
                    if draft.items.isEmpty { Text("Add media to preview a scene with your own images.").foregroundStyle(.secondary) }
                    if let error { Text(error).foregroundStyle(.red) }
                }.padding(20)
            }
        }.frame(width:820,height:550)
    }
    private func select(_ id:String) {
        remembered[draft.scene.variantID]=draft.scene
        draft.scene=remembered[id] ?? SceneCatalog.defaults(for:id)
        previewRevision+=1;error=nil
    }
}
struct ExportOptions:View {
    @ObservedObject var session:EditorSession
    let frame:Int64
    @Environment(\.dismiss) private var dismiss
    @State private var settings:ExportSettings
    @State private var error:String?
    init(session:EditorSession,frame:Int64) { self.session=session;self.frame=frame;_settings=State(initialValue:session.project.export) }
    private var schedule:FrameSchedule? {
        var candidate=session.project;candidate.export=settings
        return try? RenderPlan(project:candidate).schedule
    }
    private var compatible:Bool { session.project.canvas.background != .transparent || settings.format.supportsAlpha }
    var body:some View {
        VStack(alignment:.leading,spacing:18) {
            Text("Export").font(.title2.weight(.semibold))
            Form {
                Picker("Format",selection:$settings.format) { ForEach(OutputFormat.allCases,id:\.self) { Text($0.label).tag($0) } }
                if settings.format != .png { Picker("Frame rate",selection:$settings.frameRate) { ForEach(FrameRate.supported,id:\.self) { Text("\($0.label) fps").tag($0) } } }
                LabeledContent("Size",value:"\(session.project.canvas.width) × \(session.project.canvas.height)")
                if let schedule {
                    LabeledContent("Frames",value:settings.format == .png ? "Current frame":"\(schedule.totalFrames)")
                    if settings.format != .png { LabeledContent("Duration",value:String(format:"%.3f s",schedule.duration)) }
                }
                Text(settings.format == .png || settings.format == .pngSequence ? "sRGB · transparency preserved":"Silent video · Rec.709").foregroundStyle(.secondary)
            }.formStyle(.grouped)
            if !compatible { Text("Choose ProRes 4444 or PNG to preserve transparency, or use a solid background.").foregroundStyle(.orange) }
            if let error { Text(error).foregroundStyle(.red).textSelection(.enabled) }
            HStack { Spacer();Button("Cancel"){dismiss()}.keyboardShortcut(.cancelAction);Button("Export…",action:export).keyboardShortcut(.defaultAction).disabled(!compatible || session.project.activeItems.isEmpty || ExportCenter.shared.busy) }
        }.padding(24).frame(width:460)
    }
    private func export() {
        do {
            var candidate=session.project;candidate.export=settings
            let snapshot=try RenderSnapshot(project:candidate,workspace:session.workspace)
            let panel=NSSavePanel();panel.title="Export";panel.nameFieldStringValue=settings.format == .pngSequence ? "\(session.documentName) Frames":"\(session.documentName).\(settings.format.fileExtension)"
            if settings.format != .pngSequence { panel.allowedContentTypes=[UTType(filenameExtension:settings.format.fileExtension) ?? .data] }
            panel.canCreateDirectories=true
            guard panel.runModal() == .OK,let url=panel.url else { return }
            if settings.format == .pngSequence,FileManager.default.fileExists(atPath:url.path) { throw GalleryError.invalid("Choose a new folder name for the PNG sequence. Existing folders are never replaced.") }
            let destination=try ExportDestination(url:url)
            let previewTime=session.snapshot.plan.schedule.seconds(for:frame)
            session.commit("Export settings"){$0.export=settings}
            let exportFrame=snapshot.plan.schedule.frame(at:previewTime)
            ExportCenter.shared.start(snapshot:snapshot,destination:destination,stillFrame:exportFrame)
            dismiss();NotificationCenter.default.post(name:.showExports,object:nil)
        } catch { self.error=error.localizedDescription }
    }
}
struct ExportsView:View {
    @ObservedObject var exports=ExportCenter.shared
    var body:some View {
        VStack(alignment:.leading,spacing:18) {
            HStack { Text("Exports").font(.title2.weight(.semibold));Spacer();if exports.busy {ProgressView().controlSize(.small)} }
            if exports.busy { ProgressView(value:exports.progress);HStack { Text(exports.status).monospacedDigit();Spacer();Button("Cancel",action:exports.cancel).disabled(exports.progress>=0.99) } }
            else if let error=exports.error { Text(error).textSelection(.enabled).foregroundStyle(.red) }
            else if let result=exports.result {
                Label("Exported",systemImage:"checkmark.circle").foregroundStyle(.green)
                Text(URL(fileURLWithPath:result.outputPath).lastPathComponent).textSelection(.enabled)
                Text("\(result.width) × \(result.height) · \(result.scheduledFrames) frames").foregroundStyle(.secondary)
                Button("Show in Finder",action:exports.reveal)
            } else { Text(exports.status.isEmpty ? "No exports yet.":exports.status).foregroundStyle(.secondary) }
        }.padding(24).frame(width:460).frame(minHeight:180)
    }
}
