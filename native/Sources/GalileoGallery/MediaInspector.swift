import SwiftUI
import AppKit
import GalileoCore
import GalileoNative

struct MediaInspector: View {
    @ObservedObject var session: EditorSession
    let replace: () -> Void
    let preview: (String) -> Void
    /// A text field finishing after selection changed still edits its original
    /// targets. Never resolve the current selection inside a delayed setter.
    private let targets: Set<String>
    init(session: EditorSession, replace: @escaping () -> Void, preview: @escaping (String) -> Void) {
        self.session=session; self.replace=replace; self.preview=preview; targets=session.selection
    }
    private var items: [MediaItem] { session.project.items.filter {targets.contains($0.id)} }
    private func mixed<T: Equatable>(_ value: (MediaItem) -> T) -> Bool {
        guard let first=items.first else {return false}; return items.contains {value($0) != value(first)}
    }
    private func edit(_ name:String,_ body:(inout MediaItem)->Void) {session.editItems(targets,name:name,body)}
    private func toggle(_ title:String,get:@escaping(MediaItem)->Bool,set:@escaping(inout MediaItem,Bool)->Void)->some View {
        HStack {
            Toggle(title,isOn:Binding(get:{items.first.map(get) ?? false},set:{v in edit(title){set(&$0,v)}}))
            if mixed(get) {Text("Mixed").font(.caption).foregroundStyle(.secondary)}
        }
    }
    private func number(_ title:String,range:ClosedRange<Double>,unit:String="",step:Double=1,
                        get:@escaping(MediaItem)->Double,set:@escaping(inout MediaItem,Double)->Void)->some View {
        NumberControl(label:title,value:Binding(get:{items.first.map(get) ?? range.lowerBound},set:{v in edit(title){set(&$0,v)}}),
                      range:range,unit:unit,step:step,mixed:mixed(get),begin:{session.beginGesture(title)},end:session.endGesture)
    }
    var body:some View {
        VStack(alignment:.leading,spacing:22) {
            if let item=items.first {
                Text(items.count>1 ? "\(items.count) selected":item.name).font(.headline).lineLimit(3).textSelection(.enabled)
                InspectorSection(title:"Source") {
                    if item.unavailable != nil {Label("Source missing",systemImage:"exclamationmark.triangle").foregroundStyle(.orange)}
                    if items.count==1 {Text("\(item.width) × \(item.height)").font(.caption).foregroundStyle(.secondary)}
                    toggle("Include",get:{$0.included},set:{$0.included=$1})
                    HStack {
                        Button("Replace…",action:replace).disabled(items.count != 1)
                        if item.unavailable != nil {
                            Button("Locate original…") {locate(item)}.disabled(items.count != 1)
                        }
                    }
                }
                InspectorSection(title:"Spotlight") {
                    toggle("Bring to centre",get:{$0.spotlight?.enabled ?? false}) { media,value in
                        var cue=media.spotlight ?? Spotlight();cue.enabled=value;media.spotlight=cue
                    }.accessibilityIdentifier("spotlight-enabled")
                    if items.contains(where:{$0.spotlight?.enabled == true || $0.closing == true}) {
                        number("Hold",range:0.25...60,unit:"s",step:0.25,get:{Double($0.spotlight?.holdMilliseconds ?? 3000)/1000}) {media,value in
                            var cue=media.spotlight ?? Spotlight();cue.holdMilliseconds=Int64((value*1000).rounded());media.spotlight=cue
                        }
                        number("Size",range:25...95,unit:"%",get:{($0.spotlight?.scale ?? 0.85)*100}) {media,value in
                            var cue=media.spotlight ?? Spotlight();cue.scale=value/100;media.spotlight=cue
                        }
                        number("Transition",range:0.1...5,unit:"s",step:0.05,get:{Double($0.spotlight?.transitionMilliseconds ?? 450)/1000}) {media,value in
                            var cue=media.spotlight ?? Spotlight();cue.transitionMilliseconds=Int64((value*1000).rounded());media.spotlight=cue
                        }
                        Button("Preview spotlight") {preview(item.id)}.disabled(items.count != 1 || !item.included)
                    }
                    if items.count==1 {
                        Toggle("Use as closing",isOn:Binding(get:{item.closing == true},set:{enabled in
                            if enabled {session.markClosing(item.id)} else {edit("Clear closing"){$0.closing=false}}
                        }))
                        if item.closing == true && session.project.timing.playMode == .loop {Text("Closing is saved for Once or Repeat.").font(.caption).foregroundStyle(.secondary)}
                    }
                }
                InspectorSection(title:"Framing") {
                    Button("Edit framing…") {session.framingMediaID=item.id}.disabled(items.count != 1 || item.unavailable != nil)
                    Picker("Ratio",selection:Binding(get:{mixed({$0.displayRatio}) ? -1:(item.displayRatio ?? 0)},set:{value in
                        guard value >= 0 else{return};edit("Frame ratio"){$0.displayRatio=value == 0 ? nil:value}
                    })) {
                        if mixed({$0.displayRatio}) {Text("Mixed").tag(-1.0)}
                        Text("Source").tag(0.0);Text("16:9").tag(16.0/9);Text("1:1").tag(1.0);Text("4:5").tag(0.8);Text("9:16").tag(9.0/16)
                        if let ratio=item.displayRatio,![16.0/9,1,0.8,9.0/16].contains(ratio) {Text("Custom").tag(ratio)}
                    }
                    Picker("Fit",selection:Binding(get:{mixed({$0.fit}) ? "mixed":item.fit.rawValue},set:{value in
                        if let fit=MediaFit(rawValue:value){edit("Change fit"){$0.fit=fit}}
                    })) {
                        if mixed({$0.fit}) {Text("Mixed").tag("mixed")}
                        Text("Fit").tag("contain");Text("Fill").tag("cover")
                    }
                    if items.allSatisfy({$0.fit == .cover}),items.contains(where:{abs($0.ratio - Double($0.width)*$0.crop.width/(Double($0.height)*$0.crop.height))>0.0001}) {
                        number("Position X",range:0...100,unit:"%",get:{$0.focal.x*100},set:{$0.focal.x=$1/100})
                        number("Position Y",range:0...100,unit:"%",get:{$0.focal.y*100},set:{$0.focal.y=$1/100})
                    }
                    DisclosureGroup("Crop values") {
                        crop("Left",key:\.x,maximum:items.map{1-$0.crop.width}.min() ?? 1)
                        crop("Top",key:\.y,maximum:items.map{1-$0.crop.height}.min() ?? 1)
                        crop("Width",key:\.width,maximum:items.map{1-$0.crop.x}.min() ?? 1)
                        crop("Height",key:\.height,maximum:items.map{1-$0.crop.y}.min() ?? 1)
                        Button("Reset framing") {edit("Reset framing"){$0.crop=Crop();$0.focal=Point();$0.displayRatio=nil}}
                    }
                }
                InspectorSection(title:"Caption") {
                    TextField(mixed({$0.caption}) ? "Mixed captions":"Caption",text:Binding(get:{mixed({$0.caption}) ? "":item.caption},set:{value in edit("Edit caption"){$0.caption=value}}),axis:.vertical).lineLimit(2...4).textFieldStyle(.roundedBorder)
                    Toggle("Show captions",isOn:Binding(get:{session.project.scene.captions},set:{v in session.commit("Show captions"){$0.scene.captions=v}}))
                    if session.project.scene.captions {
                        Toggle("Caption background",isOn:Binding(get:{session.project.scene.captionBacking ?? true},set:{v in session.commit("Caption background"){$0.scene.captionBacking=v}}))
                    }
                }
                if items.allSatisfy({$0.kind != .image && $0.duration != nil}) {
                    InspectorSection(title:"Source playback") {
                        toggle("Play source",get:{$0.sourcePlays},set:{$0.sourcePlays=$1})
                        toggle("Loop source",get:{$0.sourceLoops},set:{$0.sourceLoops=$1})
                        number("Rate",range:0.25...4,unit:"×",step:0.05,get:{$0.sourceRate},set:{$0.sourceRate=$1})
                        let maximumIn=items.map{max(0,($0.trimEnd ?? $0.duration!)-0.001)}.min() ?? 0
                        number("In",range:0...maximumIn,unit:"s",step:0.01,get:{$0.trimStart},set:{$0.trimStart=$1})
                        let minimumOut=items.map{$0.trimStart+min(0.001,$0.duration!/2)}.max() ?? 0
                        let maximumOut=items.compactMap(\.duration).min() ?? 0
                        if minimumOut<=maximumOut {
                            number("Out",range:minimumOut...maximumOut,unit:"s",step:0.01,get:{$0.trimEnd ?? $0.duration!},set:{$0.trimEnd=$1})
                        } else {Text("Select one clip to edit its out point.").font(.caption).foregroundStyle(.secondary)}
                    }
                }
            } else {Text("Select media to edit its framing.").foregroundStyle(.secondary)}
        }.padding(16)
    }
    private func crop(_ label:String,key:WritableKeyPath<Crop,Double>,maximum:Double)->some View {
        number(label,range:(key == \.width || key == \.height ? 0.01:0)...max(0.01,maximum*100),unit:"%",step:0.01,
               get:{$0.crop[keyPath:key]*100},set:{$0.crop[keyPath:key]=$1/100})
    }
    private func locate(_ item:MediaItem) {
        let panel=NSOpenPanel();panel.title="Locate \(item.name)";panel.canChooseDirectories=false;panel.allowsMultipleSelection=false
        guard panel.runModal() == .OK,let url=panel.url else{return}
        session.importURLs([url],replacing:item.id,expectedFingerprint:item.sha256)
    }
}
