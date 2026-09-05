import SwiftUI
import AppKit
import GalileoCore
import GalileoNative

struct NativePreview:NSViewRepresentable {
    let snapshot:RenderSnapshot
    let revision:Int
    let frame:Int64
    var selection:Set<String>=[]
    var onSelect:((String?,Bool)->Void)?=nil
    var onError:((String)->Void)?=nil
    func makeNSView(context:Context)->PreviewSurface { PreviewSurface() }
    func updateNSView(_ view:PreviewSurface,context:Context) {
        view.selection=selection;view.onSelect=onSelect;view.onError=onError
        view.update(snapshot:snapshot,revision:revision,frame:frame)
    }
    static func dismantleNSView(_ view:PreviewSurface,coordinator:()) { view.stop() }
}
@MainActor final class PreviewSurface:NSView {
    private let worker=PreviewWorker()
    private var snapshot:RenderSnapshot?
    private var requestedRevision = -1
    private var requestedFrame:Int64 = -1
    private(set) var committedFrame:Int64 = -1
    private var image:CGImage?
    private var cards:[SceneCard]=[]
    private var task:Task<Void,Never>?
    private var ticket=UUID()
    private var pending:(snapshot:RenderSnapshot,revision:Int,frame:Int64)?
    private var renderedCanvas:GalileoCore.Canvas?
    var selection:Set<String>=[] { didSet { if oldValue != selection { needsDisplay=true } } }
    var onSelect:((String?,Bool)->Void)?
    var onError:((String)->Void)?
    override var isFlipped:Bool { true }
    override var acceptsFirstResponder:Bool { true }
    override init(frame:NSRect) { super.init(frame:frame);setAccessibilityElement(true);setAccessibilityRole(.image);setAccessibilityLabel("Gallery canvas") }
    convenience init() { self.init(frame:.zero) }
    required init?(coder:NSCoder) { fatalError("Programmatic view") }
    func stop() {
        pending=nil;ticket=UUID();task?.cancel()
        requestedRevision = -1;requestedFrame = -1
    }
    func update(snapshot:RenderSnapshot,revision:Int,frame:Int64) {
        let changedDocument=self.snapshot?.plan.project.id != snapshot.plan.project.id
        guard revision != requestedRevision || frame != requestedFrame || changedDocument else { return }
        if revision != requestedRevision || changedDocument { ticket=UUID() }
        requestedRevision=revision;requestedFrame=frame;self.snapshot=snapshot
        pending=(snapshot,revision,frame)
        renderNext()
    }
    private func renderNext() {
        // Keep one render in flight and only the newest pending request. Cancelling
        // every playback tick starves the canvas when rendering exceeds one tick.
        guard task==nil,let request=pending else { return }
        pending=nil
        let worker=worker,ticket=ticket
        task=Task { [weak self] in
            do {
                let result=try await worker.render(snapshot:request.snapshot,frame:request.frame,maximumDimension:1600)
                if !Task.isCancelled,let self,self.ticket==ticket {
                    self.image=result;self.committedFrame=request.frame
                    self.renderedCanvas=request.snapshot.plan.project.canvas
                    self.cards=request.snapshot.plan.evaluate(frame:request.frame);self.needsDisplay=true
                    self.setAccessibilityValue("Frame \(request.frame), \(request.snapshot.plan.project.activeItems.count) media items")
                }
            } catch is CancellationError {} catch {
                if !Task.isCancelled,let self,self.ticket==ticket { self.onError?(error.localizedDescription) }
            }
            guard let self else { return }
            self.task=nil
            self.renderNext()
        }
    }
    private var contentRect:CGRect {
        guard let canvas=renderedCanvas ?? snapshot?.plan.project.canvas else { return bounds }
        let scale=min(bounds.width/CGFloat(canvas.width),bounds.height/CGFloat(canvas.height))
        let size=CGSize(width:CGFloat(canvas.width)*scale,height:CGFloat(canvas.height)*scale)
        return CGRect(x:(bounds.width-size.width)/2,y:(bounds.height-size.height)/2,width:size.width,height:size.height)
    }
    override func draw(_ dirtyRect:NSRect) {
        super.draw(dirtyRect)
        guard let ctx=NSGraphicsContext.current?.cgContext else { return }
        let rect=contentRect
        ctx.saveGState();ctx.clip(to:rect)
        let light=NSColor(calibratedWhite:0.68,alpha:1),dark=NSColor(calibratedWhite:0.55,alpha:1)
        ctx.setFillColor(light.cgColor);ctx.fill(rect)
        let cell:CGFloat=12
        for row in 0...Int(rect.height/cell) { for column in 0...Int(rect.width/cell) where (row+column)%2==0 {
            ctx.setFillColor(dark.cgColor);ctx.fill(CGRect(x:rect.minX+CGFloat(column)*cell,y:rect.minY+CGFloat(row)*cell,width:cell,height:cell))
        } }
        if let image { ctx.saveGState();ctx.translateBy(x:rect.minX,y:rect.maxY);ctx.scaleBy(x:1,y:-1);ctx.draw(image,in:CGRect(origin:.zero,size:rect.size));ctx.restoreGState() }
        if let canvas=renderedCanvas ?? snapshot?.plan.project.canvas {
            let scale=rect.width/CGFloat(canvas.width)
            ctx.setStrokeColor(NSColor.controlAccentColor.cgColor);ctx.setLineWidth(1.5)
            for card in cards where selection.contains(card.itemID) {
                let quad=card.quad(perspective:Double(canvas.width)*2)
                guard let first=quad.first else { continue }
                ctx.beginPath();ctx.move(to:CGPoint(x:rect.minX+first.x*scale,y:rect.minY+first.y*scale))
                for point in quad.dropFirst() { ctx.addLine(to:CGPoint(x:rect.minX+point.x*scale,y:rect.minY+point.y*scale)) }
                ctx.closePath();ctx.strokePath()
            }
        }
        ctx.restoreGState()
    }
    override func mouseDown(with event:NSEvent) {
        window?.makeFirstResponder(self)
        let location=convert(event.locationInWindow,from:nil),rect=contentRect
        guard rect.contains(location),let canvas=renderedCanvas ?? snapshot?.plan.project.canvas else { onSelect?(nil,false);return }
        let scale=Double(canvas.width)/rect.width
        let point=CGPoint(x:(location.x-rect.minX)*scale,y:(location.y-rect.minY)*scale)
        let hit=cards.reversed().first { card in
            let quad=card.quad(perspective:Double(canvas.width)*2)
            let path=CGMutablePath();guard let first=quad.first else { return false }
            path.move(to:CGPoint(x:first.x,y:first.y));quad.dropFirst().forEach{path.addLine(to:CGPoint(x:$0.x,y:$0.y))};path.closeSubpath()
            return path.contains(point)
        }
        onSelect?(hit?.itemID,event.modifierFlags.contains(.command) || event.modifierFlags.contains(.shift))
    }
    override func keyDown(with event:NSEvent) {
        if event.keyCode==49 { NotificationCenter.default.post(name:.togglePlayback,object:window);return }
        if event.keyCode==123 { NotificationCenter.default.post(name:.stepBackward,object:window);return }
        if event.keyCode==124 { NotificationCenter.default.post(name:.stepForward,object:window);return }
        super.keyDown(with:event)
    }
}
