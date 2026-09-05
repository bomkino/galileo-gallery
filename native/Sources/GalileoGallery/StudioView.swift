import SwiftUI
import AppKit
import ImageIO
import AVFoundation
import UniformTypeIdentifiers
import GalileoCore
import GalileoNative

struct StudioView:View {
    @ObservedObject var session:EditorSession
    @ObservedObject var playback:PlaybackModel
    @ObservedObject private var exports=ExportCenter.shared
    @State private var inspector="Scene"
    let addMedia:()->Void
    let replaceMedia:()->Void
    var body:some View {
        VStack(spacing:0) {
            HSplitView {
                if session.showSidebar { library.frame(minWidth:190,idealWidth:220,maxWidth:350) }
                canvas.frame(minWidth:320,maxWidth:.infinity,maxHeight:.infinity)
                if session.showInspector {
                    VStack(spacing:0) {
                        Picker("Inspector",selection:$inspector) { Text("Scene").tag("Scene");Text("Media").tag("Media") }
                            .pickerStyle(.segmented).padding(16)
                        Divider()
                        ScrollView { if inspector=="Scene" { SceneInspector(session:session) } else { MediaInspector(session:session,replace:replaceMedia) } }
                    }.frame(minWidth:260,idealWidth:285,maxWidth:380).background(.regularMaterial)
                }
            }
            if let issue=session.issue {
                Divider()
                HStack(alignment:.top,spacing:10) {
                    Image(systemName:"exclamationmark.triangle").foregroundStyle(.orange)
                    Text(issue).font(.callout).textSelection(.enabled).frame(maxWidth:.infinity,alignment:.leading)
                    Button("Dismiss") { session.issue=nil }.buttonStyle(.borderless)
                }.padding(12).background(Color(nsColor:.controlBackgroundColor))
            }
            if exports.busy || exports.error != nil {
                Divider()
                HStack {
                    if exports.busy { ProgressView(value:exports.progress).frame(width:100) }
                    Text(exports.error ?? exports.status).font(.caption).lineLimit(2)
                    Spacer()
                    Button("Exports") { NotificationCenter.default.post(name:.showExports,object:nil) }.buttonStyle(.borderless)
                }.padding(.horizontal,16).padding(.vertical,8)
            }
        }
        .frame(minWidth:900,minHeight:600)
        .sheet(isPresented:$session.choosingScene) { SceneChooser(session:session) }
        .sheet(isPresented:$session.choosingExport) { ExportOptions(session:session,frame:playback.frame) }
        .onChange(of:session.revision) { playback.update(session.snapshot.plan) }
        .onChange(of:session.selection) { _,selection in if !selection.isEmpty { inspector="Media" } }
        .onDrop(of:[UTType.fileURL],isTargeted:nil) { providers in
            guard !session.importing else { return false }
            Task { @MainActor in
                var urls:[URL]=[]
                for provider in providers {
                    let data:Data?=await withCheckedContinuation { continuation in
                        provider.loadDataRepresentation(forTypeIdentifier:UTType.fileURL.identifier) { data,_ in continuation.resume(returning:data) }
                    }
                    if let data,let url=URL(dataRepresentation:data,relativeTo:nil) { urls.append(url) }
                }
                session.importURLs(urls)
            }
            return true
        }
    }
    private var library:some View {
        VStack(spacing:0) {
            HStack { Text("Media").font(.headline);Spacer();Text("\(session.project.items.count)").foregroundStyle(.secondary).monospacedDigit() }.padding(16)
            if session.project.items.isEmpty {
                VStack(spacing:12) {
                    Image(systemName:"photo.on.rectangle").font(.system(size:28,weight:.light)).foregroundStyle(.secondary)
                    Button("Add media",action:addMedia)
                }.frame(maxWidth:.infinity,maxHeight:.infinity)
            } else {
                List(selection:$session.selection) {
                    ForEach(session.project.items) { item in
                        MediaRow(item:item,workspace:session.workspace).tag(item.id)
                            .contextMenu {
                                Button("Use as opening") { session.markOpening(item.id) }
                                Button(item.included ? "Exclude":"Include") { session.commit("Change inclusion") { p in if let i=p.items.firstIndex(where:{$0.id==item.id}) { p.items[i].included.toggle() } } }
                                Button("Replace…") { session.selection=[item.id];replaceMedia() }
                                Divider()
                                Button("Duplicate") { session.selection=[item.id];session.duplicateSelection() }
                                Button("Remove") { session.selection=[item.id];session.removeSelection() }
                            }
                    }.onMove(perform:session.move)
                }.listStyle(.sidebar).onDeleteCommand(perform:session.removeSelection)
            }
            Divider()
            if session.importing {
                HStack { ProgressView().controlSize(.small);Text("Importing");Spacer();Button("Cancel",action:session.cancelImport).buttonStyle(.borderless) }.padding(12)
            } else {
                HStack {
                    Button(action:addMedia) { Image(systemName:"plus") }.help("Add media")
                    Button(action:session.removeSelection) { Image(systemName:"minus") }.disabled(session.selection.isEmpty).help("Remove selected media")
                    Spacer()
                    Text("\(session.project.activeItems.count) used").font(.caption).foregroundStyle(.secondary)
                }.buttonStyle(.borderless).padding(12)
            }
        }.background(.regularMaterial)
    }
    private var canvas:some View {
        VStack(spacing:0) {
            if session.project.items.isEmpty {
                VStack(spacing:16) {
                    Image(systemName:"rectangle.stack").font(.system(size:48,weight:.ultraLight)).foregroundStyle(.secondary)
                    Text("Start with your media").font(.title2.weight(.medium))
                    Text("Drop images or video into this window.").foregroundStyle(.secondary)
                    Button("Add media",action:addMedia).buttonStyle(.borderedProminent).controlSize(.large)
                }.frame(maxWidth:.infinity,maxHeight:.infinity)
            } else {
                NativePreview(snapshot:session.snapshot,revision:session.revision,frame:playback.frame,selection:session.selection,onSelect:{ id,extend in
                    if let id { if extend { if session.selection.contains(id) { session.selection.remove(id) } else { session.selection.insert(id) } } else { session.selection=[id] } }
                    else { session.selection=[] }
                },onError:{session.issue=$0}).padding(24)
            }
            HStack {
                Text("\(session.project.canvas.width) × \(session.project.canvas.height)")
                Spacer()
                Text("\(session.project.export.frameRate.label) fps")
            }.font(.caption).foregroundStyle(.secondary).monospacedDigit().padding(.horizontal,24).padding(.bottom,12)
            Divider()
            TransportBar(playback:playback,schedule:session.snapshot.plan.schedule).padding(16)
        }.background(Color(nsColor:.underPageBackgroundColor))
    }
}
private struct MediaRow:View {
    let item:MediaItem;let workspace:Workspace
    @State private var image:NSImage?
    var body:some View {
        HStack(spacing:9) {
            ZStack {
                RoundedRectangle(cornerRadius:4).fill(Color(nsColor:.controlBackgroundColor))
                if let image { Image(nsImage:image).resizable().aspectRatio(contentMode:.fit) }
                else { Image(systemName:item.kind == .image ? "photo":"film").foregroundStyle(.secondary) }
            }.frame(width:52,height:38).clipShape(RoundedRectangle(cornerRadius:4))
            VStack(alignment:.leading,spacing:3) {
                Text(item.name).font(.system(size:12,weight:.medium)).lineLimit(1).help(item.name)
                if !item.included { Text("Excluded").font(.caption2).foregroundStyle(.secondary) }
                else if item.opening { Text("Opening").font(.caption2).foregroundStyle(.secondary) }
            }
            Spacer(minLength:0)
        }.padding(.vertical,4).opacity(item.included ? 1:0.55)
            .accessibilityElement(children:.combine)
            .task(id:item.sha256) {
                let item=item,workspace=workspace
                let cg=await Task.detached(priority:.utility) { ()->CGImage? in
                    guard let url=try? workspace.url(for:item) else { return nil }
                    if item.kind == .video {
                        let generator=AVAssetImageGenerator(asset:AVURLAsset(url:url));generator.appliesPreferredTrackTransform=true;generator.maximumSize=CGSize(width:160,height:100)
                        return try? generator.copyCGImage(at:.zero,actualTime:nil)
                    }
                    guard let source=CGImageSourceCreateWithURL(url as CFURL,nil) else { return nil }
                    return CGImageSourceCreateThumbnailAtIndex(source,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:160] as CFDictionary)
                }.value
                if !Task.isCancelled,let cg { image=NSImage(cgImage:cg,size:.zero) }
            }
    }
}
struct TransportBar:View {
    @ObservedObject var playback:PlaybackModel
    let schedule:FrameSchedule
    var body:some View {
        VStack(spacing:10) {
            Slider(value:Binding(get:{Double(playback.frame)},set:{playback.seek(Int64($0))}),in:0...Double(max(1,schedule.totalFrames-1)),step:1)
                .accessibilityLabel("Timeline frame")
            HStack(spacing:14) {
                Button(action:{playback.seek(0)}) { Image(systemName:"backward.end") }.help("First frame")
                Button(action:{playback.step(-1)}) { Image(systemName:"backward.frame") }.help("Previous frame")
                Button(action:playback.toggle) { Image(systemName:playback.playing ? "pause.fill":"play.fill").frame(width:18) }.help(playback.playing ? "Pause":"Play")
                Button(action:{playback.step(1)}) { Image(systemName:"forward.frame") }.help("Next frame")
                Spacer()
                Text(schedule.label(frame:playback.frame)).monospacedDigit().font(.system(.caption,design:.monospaced))
                TextField("Frame",value:Binding(get:{playback.frame},set:{playback.seek($0)}),format:.number.grouping(.never))
                    .frame(width:68).textFieldStyle(.roundedBorder).accessibilityLabel("Frame index, starting at zero")
                Text("/ \(schedule.totalFrames)").font(.caption).foregroundStyle(.secondary).monospacedDigit()
            }.buttonStyle(.borderless)
        }
    }
}
struct InspectorSection<Content:View>:View {
    let title:String;@ViewBuilder var content:()->Content
    var body:some View { VStack(alignment:.leading,spacing:12) { Text(title).font(.system(size:12,weight:.semibold)).foregroundStyle(.secondary);content() } }
}
struct NumberControl:View {
    let label:String;@Binding var value:Double;let range:ClosedRange<Double>;var unit="";var step=1.0
    var begin:()->Void={};var end:()->Void={}
    @State private var text=""
    @FocusState private var focused:Bool
    var body:some View {
        VStack(spacing:5) {
            HStack {
                Text(label).font(.callout);Spacer()
                TextField(label,text:$text).multilineTextAlignment(.trailing).frame(width:62).textFieldStyle(.roundedBorder).focused($focused)
                    .onSubmit(commit).onChange(of:focused) { _,focus in if focus { begin() } else { commit();end() } }
                if !unit.isEmpty { Text(unit).font(.caption).foregroundStyle(.secondary).frame(width:16,alignment:.leading) }
            }
            Slider(value:$value,in:range,step:step,onEditingChanged:{ editing in editing ? begin():end() }).accessibilityLabel(label)
        }.onAppear { sync() }.onChange(of:value) { if !focused { sync() } }
    }
    private func sync() { text=String(format:step<1 ? "%.2f":"%.0f",value) }
    private func commit() { if let number=Double(text),number.isFinite { value=bounded(number,range.lowerBound,range.upperBound) };sync() }
}
struct SceneInspector:View {
    @ObservedObject var session:EditorSession
    private var variant:SceneVariant { session.snapshot.plan.variant }
    private func scene(_ key:WritableKeyPath<SceneSettings,Double>,factor:Double=1)->Binding<Double> {
        Binding(get:{session.project.scene[keyPath:key]*factor},set:{ value in session.commit("Adjust scene"){$0.scene[keyPath:key]=value/factor} })
    }
    var body:some View {
        VStack(alignment:.leading,spacing:24) {
            HStack { VStack(alignment:.leading,spacing:3) { Text(variant.family.name).font(.title3.weight(.semibold));Text(variant.name).font(.caption).foregroundStyle(.secondary) };Spacer();Button("Change") { session.choosingScene=true } }
            InspectorSection(title:"Canvas") {
                Picker("Size",selection:Binding(get:{"\(session.project.canvas.width)x\(session.project.canvas.height)"},set:{ value in
                    let parts=value.split(separator:"x").compactMap{Int($0)}
                    if parts.count==2 { session.commit("Change canvas") { $0.canvas.width=parts[0];$0.canvas.height=parts[1] } }
                })) {
                    Text("1920 × 1080").tag("1920x1080");Text("2576 × 1080").tag("2576x1080");Text("3840 × 2160").tag("3840x2160")
                    Text("1080 × 1920").tag("1080x1920");Text("1080 × 1080").tag("1080x1080");Text("1080 × 1350").tag("1080x1350")
                    if !["1920x1080","2576x1080","3840x2160","1080x1920","1080x1080","1080x1350"].contains("\(session.project.canvas.width)x\(session.project.canvas.height)") { Text("Custom").tag("\(session.project.canvas.width)x\(session.project.canvas.height)") }
                }.labelsHidden()
                HStack { dimension("W",\.width);dimension("H",\.height) }
                Picker("Background",selection:Binding(get:{session.project.canvas.background},set:{ kind in session.commit("Change background"){$0.canvas.background=kind} })) {
                    ForEach(BackgroundKind.allCases,id:\.self) { Text($0.rawValue.capitalized).tag($0) }
                }
                if session.project.canvas.background != .transparent {
                    ColorPicker("Colour",selection:color(\.color),supportsOpacity:false)
                    if session.project.canvas.background == .gradient {
                        ColorPicker("Second colour",selection:color(\.secondaryColor),supportsOpacity:false)
                        NumberControl(label:"Angle",value:Binding(get:{session.project.canvas.gradientAngle},set:{ value in session.commit("Change gradient"){$0.canvas.gradientAngle=value} }),range: -180...180,unit:"°",begin:{session.beginGesture("Change gradient")},end:session.endGesture)
                    }
                }
            }
            InspectorSection(title:"Timing") {
                NumberControl(label:"Duration",value:Binding(get:{Double(session.project.timing.durationMilliseconds)/1000},set:{value in session.commit("Change duration"){$0.timing.durationMilliseconds=Int64(value*1000)} }),range:1...600,unit:"s",step:0.1,begin:{session.beginGesture("Change duration")},end:session.endGesture)
                Picker("Playback",selection:Binding(get:{session.project.timing.playMode},set:{mode in session.commit("Change playback"){$0.timing.playMode=mode} })) { Text("Once").tag(PlayMode.once);Text("Repeat").tag(PlayMode.repeatCount);Text("Loop").tag(PlayMode.loop) }
                if session.project.timing.playMode == .repeatCount {
                    Stepper("\(session.project.timing.repeats) repeats",value:Binding(get:{session.project.timing.repeats},set:{value in session.commit("Change repeat count"){$0.timing.repeats=value} }),in:1...1000)
                }
                Toggle("Reverse order",isOn:Binding(get:{session.project.timing.reverse},set:{value in session.commit("Reverse order"){$0.timing.reverse=value} }))
            }
            InspectorSection(title:"Composition") {
                ForEach(variant.controls.filter{!hideControl($0)},id:\.self) { control in controlView(control) }
                Button("Reset composition") { session.commit("Reset composition"){$0.scene=SceneCatalog.defaults(for:variant.id)} }.buttonStyle(.borderless)
            }
            if !session.project.migrationNotes.isEmpty {
                DisclosureGroup("Imported legacy document") { ForEach(session.project.migrationNotes,id:\.self) { Text($0).font(.caption).foregroundStyle(.secondary).padding(.top,6) } }
            }
        }.padding(16)
    }
    private func hideControl(_ c:SceneControl)->Bool {
        if c == .hold && variant.family == .table && variant.id != "deck-contact-strip" && variant.id != "light-table" && session.project.activeItems.count<=12 { return true }
        return false
    }
    @ViewBuilder private func controlView(_ c:SceneControl)->some View {
        switch c {
        case .captions: Toggle("Captions",isOn:Binding(get:{session.project.scene.captions},set:{value in session.commit("Toggle captions"){$0.scene.captions=value} }))
        case .vertical: Toggle("Vertical",isOn:Binding(get:{session.project.scene.vertical},set:{value in session.commit("Change axis"){$0.scene.vertical=value} }))
        default:
            let spec=numberSpec(c)
            NumberControl(label:c.label,value:spec.0,range:spec.1,unit:spec.2,step:spec.3,begin:{session.beginGesture("Adjust \(c.label.lowercased())")},end:session.endGesture)
        }
    }
    private func numberSpec(_ c:SceneControl)->(Binding<Double>,ClosedRange<Double>,String,Double) {
        switch c {
        case .scale:return(scene(\.scale,factor:100),15...100,"%",1)
        case .spacing:return(scene(\.spacing),0...240,"px",1)
        case .depth:return(scene(\.depth,factor:100),0...100,"%",1)
        case .spread:return(scene(\.spread),10...170,"°",1)
        case .tilt:return(scene(\.tilt),0...25,"°",0.25)
        case .radius:return(scene(\.radius),0...96,"px",1)
        case .shadow:return(scene(\.shadow,factor:100),0...100,"%",1)
        default:return(Binding(get:{session.project.timing.holdFraction*100},set:{value in session.commit("Change hold"){$0.timing.holdFraction=value/100} }),10...95,"%",1)
        }
    }
    private func dimension(_ label:String,_ key:WritableKeyPath<GalileoCore.Canvas,Int>)->some View {
        HStack { Text(label).foregroundStyle(.secondary);TextField(label,value:Binding(get:{session.project.canvas[keyPath:key]},set:{value in session.commit("Resize canvas"){$0.canvas[keyPath:key]=value} }),format:.number.grouping(.never)).textFieldStyle(.roundedBorder).accessibilityLabel(label=="W" ? "Canvas width":"Canvas height") }
    }
    private func color(_ key:WritableKeyPath<GalileoCore.Canvas,RGBA>)->Binding<Color> {
        Binding(get:{let c=session.project.canvas[keyPath:key];return Color(.sRGB,red:c.r,green:c.g,blue:c.b,opacity:c.a)},set:{value in
            guard let c=NSColor(value).usingColorSpace(.sRGB) else { return }
            session.commit("Change colour"){$0.canvas[keyPath:key]=RGBA(c.redComponent,c.greenComponent,c.blueComponent,1)}
        })
    }
}
struct MediaInspector:View {
    @ObservedObject var session:EditorSession
    let replace:()->Void
    private func number(_ key:WritableKeyPath<MediaItem,Double>,name:String,range:ClosedRange<Double>,unit:String="",factor:Double=1)->some View {
        NumberControl(label:name,value:Binding(get:{(session.selectedItem?[keyPath:key] ?? 0)*factor},set:{v in session.editSelected(name){$0[keyPath:key]=v/factor} }),range:range,unit:unit,step:0.01,begin:{session.beginGesture(name)},end:session.endGesture)
    }
    var body:some View {
        VStack(alignment:.leading,spacing:24) {
            if let item=session.selectedItem {
                Text(session.selection.count>1 ? "\(session.selection.count) selected":item.name).font(.headline).lineLimit(3).textSelection(.enabled)
                InspectorSection(title:"Source") {
                    Text("\(item.width) × \(item.height)").font(.caption).foregroundStyle(.secondary)
                    Toggle("Include",isOn:Binding(get:{item.included},set:{value in session.editSelected("Change inclusion"){$0.included=value} }))
                    Button("Replace media…",action:replace).disabled(session.selection.count != 1)
                }
                InspectorSection(title:"Framing") {
                    Picker("Fit",selection:Binding(get:{item.fit},set:{value in session.editSelected("Change fit"){$0.fit=value} })) { Text("Fit").tag(MediaFit.contain);Text("Fill").tag(MediaFit.cover) }.pickerStyle(.segmented).labelsHidden()
                    NumberControl(label:"Focal X",value:Binding(get:{item.focal.x*100},set:{v in session.editSelected("Move focal point"){$0.focal.x=v/100} }),range:0...100,unit:"%",begin:{session.beginGesture("Move focal point")},end:session.endGesture)
                    NumberControl(label:"Focal Y",value:Binding(get:{item.focal.y*100},set:{v in session.editSelected("Move focal point"){$0.focal.y=v/100} }),range:0...100,unit:"%",begin:{session.beginGesture("Move focal point")},end:session.endGesture)
                    DisclosureGroup("Crop") {
                        crop("Left",\.x,maximum:1-item.crop.width)
                        crop("Top",\.y,maximum:1-item.crop.height)
                        crop("Width",\.width,maximum:1-item.crop.x)
                        crop("Height",\.height,maximum:1-item.crop.y)
                        Button("Reset crop") { session.editSelected("Reset crop"){$0.crop=Crop();$0.focal=Point();$0.displayRatio=nil} }.buttonStyle(.borderless)
                    }
                }
                InspectorSection(title:"Caption") {
                    TextField("Caption",text:Binding(get:{item.caption},set:{value in session.editSelected("Edit caption"){$0.caption=value} }),axis:.vertical).lineLimit(2...5).textFieldStyle(.roundedBorder)
                    Toggle("Show captions",isOn:Binding(get:{session.project.scene.captions},set:{value in session.commit("Toggle captions"){$0.scene.captions=value} }))
                }
                if item.kind != .image,let duration=item.duration {
                    InspectorSection(title:"Source playback") {
                        Text(String(format:"%.2f s",duration)).font(.caption).foregroundStyle(.secondary)
                        Toggle("Play source",isOn:Binding(get:{item.sourcePlays},set:{value in session.editSelected("Change source playback"){$0.sourcePlays=value} }))
                        Toggle("Loop source",isOn:Binding(get:{item.sourceLoops},set:{value in session.editSelected("Change source looping"){$0.sourceLoops=value} }))
                        number(\.sourceRate,name:"Rate",range:0.25...4,unit:"×")
                        number(\.trimStart,name:"In",range:0...max(0,(item.trimEnd ?? duration)-0.02),unit:"s")
                        NumberControl(label:"Out",value:Binding(get:{item.trimEnd ?? duration},set:{v in session.editSelected("Change source out"){$0.trimEnd=v} }),range:min(duration,item.trimStart+0.02)...duration,unit:"s",step:0.01,begin:{session.beginGesture("Trim source")},end:session.endGesture)
                    }
                }
            } else { Text("Select media to edit its framing.").foregroundStyle(.secondary).padding(.top,12) }
        }.padding(16)
    }
    private func crop(_ label:String,_ key:WritableKeyPath<Crop,Double>,maximum:Double)->some View {
        NumberControl(label:label,value:Binding(get:{(session.selectedItem?.crop[keyPath:key] ?? 0)*100},set:{v in session.editSelected("Crop media"){$0.crop[keyPath:key]=v/100} }),range:(key == \.width || key == \.height ? 0.01:0)...max(0.01,maximum*100),unit:"%",step:0.01,begin:{session.beginGesture("Crop media")},end:session.endGesture)
    }
}
