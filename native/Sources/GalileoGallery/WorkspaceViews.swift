import SwiftUI
import AppKit
import GalileoCore
import GalileoNative

struct SplitAutosave: NSViewRepresentable {
    let name: String
    func makeNSView(context: Context) -> NSView { NSView() }
    func updateNSView(_ view: NSView, context: Context) {
        DispatchQueue.main.async {
            var parent: NSView? = view.superview
            while let candidate = parent {
                if let split=candidate as? NSSplitView {split.autosaveName=name;return}
                parent=candidate.superview
            }
        }
    }
}
struct FramingSelection: Identifiable {let id:String}
struct FramingEditor: View {
    @ObservedObject var session: EditorSession
    let itemID: String
    @Environment(\.dismiss) private var dismiss
    @State private var crop=Crop()
    @State private var focal=Point()
    @State private var ratioLock="free"
    private var ratio:Double {
        switch ratioLock {
        case "source":return item.map{Double($0.width)/Double($0.height)} ?? 0
        case "wide":return 16.0/9
        case "square":return 1
        case "portrait":return 0.8
        default:return 0
        }
    }
    @State private var image:CGImage?
    @State private var error:String?
    @State private var moving:Crop?
    private var item:MediaItem? {session.project.items.first{$0.id==itemID}}
    var body:some View {
        VStack(spacing:16) {
            HStack {
                Text("Framing").font(.title2.weight(.semibold));Spacer()
                Button("Cancel"){dismiss()}.keyboardShortcut(.cancelAction)
                Button("Apply") {
                    session.editItems([itemID],name:"Frame media"){$0.crop=crop;$0.focal=focal};dismiss()
                }.keyboardShortcut(.defaultAction).disabled(image==nil)
            }
            if let image,let item {
                GeometryReader { geometry in
                    let fit=min(geometry.size.width/Double(image.width),geometry.size.height/Double(image.height))
                    let size=CGSize(width:Double(image.width)*fit,height:Double(image.height)*fit)
                    ZStack(alignment:.topLeading) {
                        Image(decorative:image,scale:1).resizable().frame(width:size.width,height:size.height)
                        Path { path in
                            path.addRect(CGRect(origin:.zero,size:size))
                            path.addRect(CGRect(x:crop.x*size.width,y:crop.y*size.height,width:crop.width*size.width,height:crop.height*size.height))
                        }.fill(.black.opacity(0.55),style:FillStyle(eoFill:true)).allowsHitTesting(false)
                        Rectangle().fill(.clear).contentShape(Rectangle()).overlay(Rectangle().stroke(.white,lineWidth:1.5))
                            .frame(width:crop.width*size.width,height:crop.height*size.height)
                            .offset(x:crop.x*size.width,y:crop.y*size.height)
                            .gesture(DragGesture().onChanged { value in
                                if moving==nil {moving=crop};guard let start=moving else{return}
                                crop.x=bounded(start.x+value.translation.width/size.width,0,1-crop.width)
                                crop.y=bounded(start.y+value.translation.height/size.height,0,1-crop.height)
                            }.onEnded{_ in moving=nil})
                        ForEach(0..<4,id:\.self) { corner in
                            let right=corner%2==1,bottom=corner>=2
                            Circle().fill(.white).overlay(Circle().stroke(.black.opacity(0.5))).frame(width:14,height:14)
                                .position(x:(crop.x+(right ? crop.width:0))*size.width,y:(crop.y+(bottom ? crop.height:0))*size.height)
                                .gesture(DragGesture(coordinateSpace:.named("crop")).onChanged { value in
                                    if moving==nil {moving=crop};guard let start=moving else{return}
                                    resize(start,corner:corner,point:value.location,size:size,sourceRatio:Double(item.width)/Double(item.height))
                                }.onEnded{_ in moving=nil})
                        }
                        if item.fit == .cover {
                            Image(systemName:"scope").font(.system(size:26)).foregroundStyle(.white).shadow(color:.black,radius:2)
                                .frame(width:32,height:32).contentShape(Circle())
                                .position(x:(crop.x+crop.width*focal.x)*size.width,y:(crop.y+crop.height*focal.y)*size.height)
                                .gesture(DragGesture(coordinateSpace:.named("crop")).onChanged { value in
                                    focal.x=bounded((value.location.x/size.width-crop.x)/crop.width,0,1)
                                    focal.y=bounded((value.location.y/size.height-crop.y)/crop.height,0,1)
                                })
                                .accessibilityLabel("Fill position; use the position fields below for precise adjustment")
                        }
                    }.frame(width:size.width,height:size.height).coordinateSpace(name:"crop")
                        .frame(maxWidth:.infinity,maxHeight:.infinity)
                }.frame(height:420)
                HStack {
                    Picker("Lock ratio",selection:$ratioLock) {Text("Free").tag("free");Text("Source").tag("source");Text("16:9").tag("wide");Text("Square").tag("square");Text("4:5").tag("portrait")}.frame(width:220)
                    Spacer();Button("Reset"){crop=Crop();focal=Point()}
                }
                if item.fit == .cover {
                    HStack {
                        Text("Fill position").font(.caption).foregroundStyle(.secondary)
                        TextField("Horizontal position",value:Binding(get:{focal.x*100},set:{focal.x=bounded($0/100,0,1)}),format:.number.precision(.fractionLength(1))).textFieldStyle(.roundedBorder).frame(width:70).accessibilityLabel("Horizontal fill position percent")
                        TextField("Vertical position",value:Binding(get:{focal.y*100},set:{focal.y=bounded($0/100,0,1)}),format:.number.precision(.fractionLength(1))).textFieldStyle(.roundedBorder).frame(width:70).accessibilityLabel("Vertical fill position percent")
                        Spacer()
                    }
                }
                HStack {
                    cropNumber("Left",key:\.x,maximum:1-crop.width)
                    cropNumber("Top",key:\.y,maximum:1-crop.height)
                    cropNumber("Width",key:\.width,maximum:1-crop.x)
                    cropNumber("Height",key:\.height,maximum:1-crop.y)
                }
            } else if let error {Text(error).foregroundStyle(.red).frame(height:420)}
            else {ProgressView().frame(height:420)}
        }.padding(24).frame(width:740)
        .task {
            guard let item else{return};crop=item.crop;focal=item.focal
            do {image=try await ThumbnailWorker.shared.image(item:item,workspace:session.workspace,maximumDimension:1600)}
            catch {self.error=error.localizedDescription}
        }
    }
    private func cropNumber(_ title:String,key:WritableKeyPath<Crop,Double>,maximum:Double)->some View {
        VStack(alignment:.leading) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            TextField(title,value:Binding(get:{crop[keyPath:key]*100},set:{crop[keyPath:key]=bounded($0/100,key == \.width || key == \.height ? 0.0001:0,max(0.0001,maximum))}),format:.number.precision(.fractionLength(2))).textFieldStyle(.roundedBorder)
        }
    }
    private func resize(_ start:Crop,corner:Int,point:CGPoint,size:CGSize,sourceRatio:Double) {
        let right=corner%2==1,bottom=corner>=2
        let fixedX=start.x+(right ? 0:start.width),fixedY=start.y+(bottom ? 0:start.height)
        var width=max(0.01,abs(bounded(point.x/size.width,0,1)-fixedX))
        var height=max(0.01,abs(bounded(point.y/size.height,0,1)-fixedY))
        let maxW=right ? 1-fixedX:fixedX,maxH=bottom ? 1-fixedY:fixedY
        width=min(maxW,width);height=min(maxH,height)
        if ratio>0 {
            let normalized=ratio/sourceRatio
            width=min(min(width,height*normalized),min(maxW,maxH*normalized))
            height=width/normalized
        }
        guard width>=0.0001,height>=0.0001 else{return}
        crop.width=width;crop.height=height;crop.x=right ? fixedX:fixedX-width;crop.y=bottom ? fixedY:fixedY-height
    }
}
