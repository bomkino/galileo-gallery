import SwiftUI
import AppKit
import GalileoCore
import GalileoNative

struct BackgroundControls: View {
    @ObservedObject var session: EditorSession
    @State private var browsing = false
    private var settings: DriftBackground { session.project.canvas.drift ?? DriftBackgroundCatalog.studies[0].settings }
    var body: some View {
        VStack(alignment:.leading,spacing:12) {
            Picker("Background",selection:Binding(get:{session.project.canvas.background},set:{ kind in
                session.commit("Change background") { p in
                    p.canvas.background = kind
                    if kind == .drift && p.canvas.drift == nil { p.canvas.drift = DriftBackgroundCatalog.studies[0].settings }
                }
                if kind == .drift { browsing = true }
            })) {
                Text("Solid").tag(BackgroundKind.solid)
                Text("Gradient").tag(BackgroundKind.gradient)
                Text("Transparent").tag(BackgroundKind.transparent)
                Text("Drift").tag(BackgroundKind.drift)
            }
            if session.project.canvas.background == .drift {
                HStack {
                    Text(settings.study?.name ?? "Drift").font(.callout).lineLimit(1)
                    Spacer()
                    Button("Browse…") { browsing = true }.accessibilityLabel("Browse Drift backgrounds")
                }
                Picker("Palette",selection:Binding(get:{settings.paletteID ?? "custom"},set:{ id in
                    guard let palette = DriftBackgroundCatalog.palettes.first(where:{$0.id == id}) else { return }
                    edit("Change background palette") { $0.apply(palette) }
                })) {
                    Text("Custom").tag("custom")
                    ForEach(DriftBackgroundCatalog.palettes) { Text($0.name).tag($0.id) }
                }
                Toggle("Animate background",isOn:Binding(get:{settings.animated},set:{value in edit("Animate background"){$0.animated = value}}))
                NumberControl(label:"Intensity",value:number(\.intensity),range:0...100,unit:"%",begin:{session.beginGesture("Adjust background intensity")},end:session.endGesture)
                if settings.animated {
                    NumberControl(label:"Motion",value:number(\.motion),range:0...100,unit:"%",begin:{session.beginGesture("Adjust background motion")},end:session.endGesture)
                }
                DisclosureGroup("Colour and texture") {
                    VStack(spacing:12) {
                        ColorPicker("Base",selection:color(\.colorA),supportsOpacity:false)
                        ColorPicker("Second colour",selection:color(\.colorB),supportsOpacity:false)
                        ColorPicker("Accent",selection:color(\.accent),supportsOpacity:false)
                        NumberControl(label:"Grain",value:number(\.grain),range:0...60,unit:"%",begin:{session.beginGesture("Adjust background grain")},end:session.endGesture)
                        NumberControl(label:"Vignette",value:number(\.vignette),range:0...100,unit:"%",begin:{session.beginGesture("Adjust background vignette")},end:session.endGesture)
                        Stepper("Variation \(settings.variation + 1)",value:Binding(get:{settings.variation},set:{v in edit("Change background variation"){$0.variation=v}}),in:0...99)
                        Button("Reset background") {
                            guard let study = settings.study else { return }
                            edit("Reset background") { $0 = study.settings }
                        }.buttonStyle(.borderless)
                    }.padding(.top,8)
                }
            } else if session.project.canvas.background != .transparent {
                ColorPicker("Colour",selection:canvasColor(\.color),supportsOpacity:false)
                if session.project.canvas.background == .gradient {
                    ColorPicker("Second colour",selection:canvasColor(\.secondaryColor),supportsOpacity:false)
                    NumberControl(label:"Angle",value:Binding(get:{session.project.canvas.gradientAngle},set:{ v in session.commit("Change gradient"){$0.canvas.gradientAngle=v} }),range: -180...180,unit:"°",begin:{session.beginGesture("Change gradient")},end:session.endGesture)
                }
            }
        }.sheet(isPresented:$browsing) {
            DriftBackgroundBrowser(currentID:settings.studyID) { study in
                session.commit("Choose Drift background") { p in p.canvas.background = .drift; p.canvas.drift = study.settings }
            }
        }
    }
    private func edit(_ name:String,_ change:(inout DriftBackground)->Void) {
        session.commit(name) { p in var value = p.canvas.drift ?? DriftBackgroundCatalog.studies[0].settings; change(&value); p.canvas.drift=value }
    }
    private func number(_ key:WritableKeyPath<DriftBackground,Double>)->Binding<Double> {
        Binding(get:{settings[keyPath:key]*100},set:{ v in edit("Adjust background"){$0[keyPath:key]=v/100} })
    }
    private func color(_ key:WritableKeyPath<DriftBackground,RGBA>)->Binding<Color> {
        Binding(get:{let c=settings[keyPath:key];return Color(.sRGB,red:c.r,green:c.g,blue:c.b)},set:{value in
            guard let c=NSColor(value).usingColorSpace(.sRGB) else {return}
            edit("Change background colour"){$0[keyPath:key]=RGBA(c.redComponent,c.greenComponent,c.blueComponent)}
        })
    }
    private func canvasColor(_ key:WritableKeyPath<GalileoCore.Canvas,RGBA>)->Binding<Color> {
        Binding(get:{let c=session.project.canvas[keyPath:key];return Color(.sRGB,red:c.r,green:c.g,blue:c.b,opacity:c.a)},set:{value in
            guard let c=NSColor(value).usingColorSpace(.sRGB) else {return}
            session.commit("Change colour"){$0.canvas[keyPath:key]=RGBA(c.redComponent,c.greenComponent,c.blueComponent,1)}
        })
    }
}

struct DriftBackgroundBrowser: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selectedID: String
    @State private var family = "all"
    @State private var search = ""
    let choose: (DriftStudy)->Void
    init(currentID:String,choose:@escaping (DriftStudy)->Void) { _selectedID=State(initialValue:currentID);self.choose=choose }
    private var visible:[DriftStudy] {
        DriftBackgroundCatalog.studies.filter { (family == "all" || $0.family.rawValue == family) &&
            (search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) || $0.family.label.localizedCaseInsensitiveContains(search)) }
    }
    var body: some View {
        VStack(alignment:.leading,spacing:14) {
            Text("Drift backgrounds").font(.title2.weight(.semibold))
            HStack {
                Picker("Family",selection:$family) {
                    Text("All").tag("all")
                    ForEach(DriftFamily.allCases,id:\.self) { Text($0.label).tag($0.rawValue) }
                }.frame(width:250)
                TextField("Search backgrounds",text:$search).textFieldStyle(.roundedBorder)
            }
            ScrollView {
                LazyVGrid(columns:Array(repeating:GridItem(.flexible(),spacing:12),count:3),spacing:14) {
                    ForEach(visible) { study in
                        Button { selectedID=study.id } label: {
                            VStack(alignment:.leading,spacing:6) {
                                DriftBackgroundThumbnail(study:study).aspectRatio(240.0/136,contentMode:.fit).clipShape(RoundedRectangle(cornerRadius:6))
                                Text(study.name).font(.callout).foregroundStyle(.primary).lineLimit(1)
                            }.padding(6).background(selectedID==study.id ? Color.accentColor.opacity(0.12):Color.clear)
                                .overlay(RoundedRectangle(cornerRadius:9).stroke(selectedID==study.id ? Color.accentColor:Color.clear,lineWidth:2))
                        }.buttonStyle(.plain).accessibilityLabel(study.name).accessibilityAddTraits(selectedID==study.id ? .isSelected:[])
                    }
                }.padding(3)
                if visible.isEmpty { Text("No matching backgrounds").foregroundStyle(.secondary).padding() }
            }
            HStack {
                Text(DriftBackgroundCatalog.studies.first{$0.id==selectedID}?.name ?? "").foregroundStyle(.secondary)
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Use background") {
                    if let study=DriftBackgroundCatalog.studies.first(where:{$0.id==selectedID}) { choose(study);dismiss() }
                }.keyboardShortcut(.defaultAction)
            }
        }.padding(20).frame(width:680,height:590)
    }
}
private struct DriftBackgroundThumbnail:View {
    let study:DriftStudy
    @State private var image:CGImage?
    @State private var failed=false
    var body:some View {
        ZStack {
            Rectangle().fill(Color(nsColor:.controlBackgroundColor))
            if let image { Image(decorative:image,scale:1).resizable().scaledToFit() }
            else if failed { Image(systemName:"exclamationmark.triangle").accessibilityLabel("Preview unavailable") }
            else { ProgressView().controlSize(.small) }
        }.task(id:study.id) {
            do { let value=try await DriftBackgroundThumbnails.shared.image(for:study);if !Task.isCancelled {image=value} }
            catch is CancellationError { }
            catch { failed=true }
        }
    }
}
