import Foundation
import AppKit
import AVFoundation
import CoreImage
import CoreText
import ImageIO
import Metal
import GalileoCore

public struct RenderSnapshot: @unchecked Sendable {
    public let plan: RenderPlan
    public let workspace: Workspace
    public init(project:GalleryProject,workspace:Workspace)throws { plan=try RenderPlan(project:project);self.workspace=workspace }
}
private final class ImageBox: NSObject { let image:CGImage;init(_ image:CGImage){self.image=image} }
private final class GeneratorBox: NSObject { let generator:AVAssetImageGenerator;init(_ generator:AVAssetImageGenerator){self.generator=generator} }

/// Immutable images and a thread-safe CIContext can be shared. Mutable video
/// generators remain renderer-owned and confined to their worker.
private final class RenderResources: @unchecked Sendable {
    static let shared=RenderResources()
    let context:CIContext
    let backend:String
    let decoded=NSCache<NSString,ImageBox>()
    let prepared=NSCache<NSString,ImageBox>()
    private var pressure:DispatchSourceMemoryPressure?
    private init() {
        let options:[CIContextOption:Any]=[.cacheIntermediates:false,.workingColorSpace:CGColorSpace(name:CGColorSpace.extendedLinearSRGB)!]
        if let device=MTLCreateSystemDefaultDevice() {context=CIContext(mtlDevice:device,options:options);backend="Core Image / Metal: \(device.name)"}
        else {context=CIContext(options:options.merging([.useSoftwareRenderer:true]){_,b in b});backend="Core Image / software"}
        // These are shared NSCache eviction targets, not claims about total RSS.
        decoded.totalCostLimit=128*1024*1024;decoded.countLimit=128
        prepared.totalCostLimit=64*1024*1024;prepared.countLimit=192
        let source=DispatchSource.makeMemoryPressureSource(eventMask:[.warning,.critical],queue:.global(qos:.utility))
        source.setEventHandler { [weak self] in self?.clear() };source.resume();pressure=source
    }
    func clear() {decoded.removeAllObjects();prepared.removeAllObjects();context.clearCaches()}
}

/// One compositor for editor and output. Preview resolution is applied BEFORE
/// decoding, bitmap preparation, shadows and captions, not only at final output.
public final class NativeRenderer {
    public let context:CIContext
    public let backend:String
    public private(set) var largestPreparedLayer=0
    private let generators=NSCache<NSString,GeneratorBox>()
    private let srgb=CGColorSpace(name:CGColorSpace.sRGB)!
    public init() {context=RenderResources.shared.context;backend=RenderResources.shared.backend;generators.countLimit=4}
    public func clearCaches() {generators.removeAllObjects();RenderResources.shared.clear()}
    public func thumbnail(item:MediaItem,workspace:Workspace,maximumDimension:Int=160)throws->CGImage {
        guard item.unavailable==nil else {throw GalleryError.missing("Locate or replace the missing source.")}
        return try sourceImage(item:item,seconds:item.trimStart,workspace:workspace,maximumDimension:max(64,min(7680,maximumDimension)))
    }
    public func image(snapshot:RenderSnapshot,frame:Int64,maximumDimension:Int?=nil,colorSpace:CGColorSpace?=nil)throws->CGImage {
        let result=try composition(snapshot:snapshot,frame:frame,maximumDimension:maximumDimension)
        guard let image=context.createCGImage(result,from:result.extent,format:.RGBA8,colorSpace:colorSpace ?? srgb) else {throw GalleryError.invalid("The native renderer could not create the requested frame.")}
        return image
    }
    /// Avoid the full-frame CGImage -> bitmap -> CVPixelBuffer round trip.
    public func render(snapshot:RenderSnapshot,frame:Int64,into buffer:CVPixelBuffer,colorSpace:CGColorSpace)throws {
        guard CVPixelBufferGetWidth(buffer)==snapshot.plan.project.canvas.width,
              CVPixelBufferGetHeight(buffer)==snapshot.plan.project.canvas.height else {throw GalleryError.invalid("The export buffer has the wrong dimensions.")}
        let result=try composition(snapshot:snapshot,frame:frame,maximumDimension:nil)
        context.render(result,to:buffer,bounds:result.extent,colorSpace:colorSpace)
    }
    private func composition(snapshot:RenderSnapshot,frame:Int64,maximumDimension:Int?)throws->CIImage {
        try Task.checkCancellation()
        let project=snapshot.plan.project,logicalW=Double(project.canvas.width),logicalH=Double(project.canvas.height)
        let factor=maximumDimension.map{min(1,Double(max(1,$0))/max(logicalW,logicalH))} ?? 1
        let w=round(logicalW*factor),h=round(logicalH*factor),extent=CGRect(x:0,y:0,width:w,height:h)
        let background=project.canvas
        var result:CIImage
        if background.background == .transparent {result=CIImage(color:.clear).cropped(to:extent)}
        else if background.background == .gradient {
            let radians=background.gradientAngle * .pi/180,distance=hypot(w,h)/2
            result=CIFilter(name:"CILinearGradient",parameters:[
                "inputPoint0":CIVector(x:w/2-cos(radians)*distance,y:h/2-sin(radians)*distance),
                "inputPoint1":CIVector(x:w/2+cos(radians)*distance,y:h/2+sin(radians)*distance),
                "inputColor0":ciColor(background.color),"inputColor1":ciColor(background.secondaryColor)
            ])!.outputImage!.cropped(to:extent)
        } else {result=CIImage(color:ciColor(background.color)).cropped(to:extent)}
        var scene=project.scene;scene.radius *= factor
        let cards=snapshot.plan.evaluate(frame:frame).map { original -> SceneCard in
            var c=original;c.center=Point(c.center.x*factor,c.center.y*factor);c.width *= factor;c.height *= factor;return c
        }.filter{$0.intersects(width:w,height:h,margin:min(w,h)*0.08)}
        let byID=Dictionary(uniqueKeysWithValues:project.items.map{($0.id,$0)})
        if cards.contains(where: \.suspension),let ropes=ropeImage(cards:cards,width:Int(w),height:Int(h),light:luminance(background.color)>0.5) {
            result=CIImage(cgImage:ropes).composited(over:result)
        }
        for card in cards {
            try Task.checkCancellation()
            guard let item=byID[card.itemID] else {throw GalleryError.invalid("A rendered instance has no source media.")}
            let source:CGImage
            if item.unavailable != nil {
                guard let placeholder=captionImage("Missing source",width:320,fontSize:24,light:true,backing:true) else {throw GalleryError.invalid("The missing-media preview could not be drawn.")}
                source=placeholder
            } else {
                source=try sourceImage(item:item,seconds:card.sourceTime,workspace:snapshot.workspace,maximumDimension:min(7680,max(64,Int(ceil(max(w,h))))))
            }
            let bitmap=try artwork(source:source,item:item,card:card,scene:scene)
            let q=card.quad(perspective:w*2)
            let layer=CIImage(cgImage:bitmap).applyingFilter("CIPerspectiveTransform",parameters:[
                "inputTopLeft":CIVector(x:q[0].x,y:h-q[0].y),"inputTopRight":CIVector(x:q[1].x,y:h-q[1].y),
                "inputBottomRight":CIVector(x:q[2].x,y:h-q[2].y),"inputBottomLeft":CIVector(x:q[3].x,y:h-q[3].y)
            ])
            if scene.shadow>0 {
                let shadow=layer.applyingFilter("CIColorMatrix",parameters:[
                    "inputRVector":CIVector(x:0,y:0,z:0,w:0),"inputGVector":CIVector(x:0,y:0,z:0,w:0),
                    "inputBVector":CIVector(x:0,y:0,z:0,w:0),"inputAVector":CIVector(x:0,y:0,z:0,w:scene.shadow*0.65)
                ]).transformed(by:CGAffineTransform(translationX:0,y:-min(w,h)*0.008)).applyingFilter("CIGaussianBlur",parameters:["inputRadius":min(w,h)*0.012]).cropped(to:extent)
                result=shadow.composited(over:result)
            }
            result=layer.cropped(to:extent).composited(over:result)
        }
        if scene.captions {
            // Draw one caption for the logical source, not each build fragment.
            // Place labels after all artwork so a later layer cannot eat half a line.
            let groups=Dictionary(grouping:cards,by:\.itemID)
            for id in groups.keys.sorted() {
                guard let item=byID[id],!item.caption.isEmpty,let group=groups[id] else {continue}
                let fragments=group.allSatisfy{$0.slice != nil}
                let visible=fragments ? group : [group.last!]
                let points=visible.flatMap{$0.visibleQuad(perspective:w*2)}
                guard !points.isEmpty else {continue}
                let left=points.map(\.x).min()!,right=points.map(\.x).max()!,bottom=points.map(\.y).max()!
                let margin=max(4,min(w,h)*0.015),width=max(1,Int(min(w-margin*2,max(80*factor,right-left))))
                let backing=scene.captionBacking ?? true
                if let label=captionImage(item.caption,width:width,fontSize:max(6,min(logicalW,logicalH)*0.018*factor),light:backing || background.background == .transparent || luminance(background.color)<0.5,backing:backing) {
                    let x=bounded((left+right-Double(width))/2,margin,max(margin,w-Double(width)-margin))
                    let y=bounded(bottom+margin,margin,max(margin,h-Double(label.height)-margin))
                    result=CIImage(cgImage:label).transformed(by:CGAffineTransform(translationX:x,y:h-y-Double(label.height))).composited(over:result)
                }
            }
        }
        return result.cropped(to:extent)
    }
    private func ciColor(_ c:RGBA)->CIColor {CIColor(red:c.r,green:c.g,blue:c.b,alpha:c.a,colorSpace:srgb)!}
    private func luminance(_ c:RGBA)->Double {
        func linear(_ v:Double)->Double {v<=0.04045 ? v/12.92:pow((v+0.055)/1.055,2.4)}
        return 0.2126*linear(c.r)+0.7152*linear(c.g)+0.0722*linear(c.b)
    }
    private func sourceImage(item:MediaItem,seconds:Double,workspace:Workspace,maximumDimension:Int)throws->CGImage {
        let key="\(item.sha256):\(item.kind == .image ? 0:Int64(seconds*1_000_000)):m\(maximumDimension)" as NSString
        if let box=RenderResources.shared.decoded.object(forKey:key) { return box.image }
        let url=try workspace.url(for:item)
        let image:CGImage
        if item.kind == .video {
            let generatorKey="\(item.sha256):\(maximumDimension)" as NSString
            let generator:AVAssetImageGenerator
            if let cached=generators.object(forKey:generatorKey) { generator=cached.generator }
            else {
                generator=AVAssetImageGenerator(asset:AVURLAsset(url:url));generator.appliesPreferredTrackTransform=true
                generator.maximumSize=CGSize(width:maximumDimension,height:maximumDimension)
                generator.requestedTimeToleranceBefore = .zero;generator.requestedTimeToleranceAfter = .zero
                generators.setObject(GeneratorBox(generator),forKey:generatorKey)
            }
            do { image=try generator.copyCGImage(at:CMTime(seconds:seconds,preferredTimescale:600000),actualTime:nil) }
            catch { throw GalleryError.invalid("\(item.name) could not be decoded at \(String(format:"%.3f",seconds)) s: \(error.localizedDescription)") }
        } else {
            guard let source=CGImageSourceCreateWithURL(url as CFURL,[kCGImageSourceShouldCache:false] as CFDictionary) else { throw GalleryError.invalid("\(item.name) could not be decoded.") }
            var index=0
            if item.kind == .animatedImage {
                var elapsed:Double=0
                for i in 0..<CGImageSourceGetCount(source) {
                    let properties=CGImageSourceCopyPropertiesAtIndex(source,i,nil) as? [CFString:Any] ?? [:]
                    elapsed+=ImageSequenceTiming.delay(properties:properties) ?? 0.1
                    index=i;if seconds<elapsed { break }
                }
            }
            let options:[CFString:Any]=[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:maximumDimension,kCGImageSourceShouldCacheImmediately:true]
            guard let decoded=CGImageSourceCreateThumbnailAtIndex(source,index,options as CFDictionary) else { throw GalleryError.invalid("\(item.name) could not be decoded.") }
            image=decoded
        }
        RenderResources.shared.decoded.setObject(ImageBox(image),forKey:key,cost:image.bytesPerRow*image.height)
        return image
    }
    private func artwork(source:CGImage,item:MediaItem,card:SceneCard,scene:SceneSettings)throws->CGImage {
        let width=max(1,min(8192,Int(ceil(card.width)))),height=max(1,min(8192,Int(ceil(card.height))))
        largestPreparedLayer=max(largestPreparedLayer,width*height)
        let key="source\(source.width)x\(source.height):\(item.sha256):\(item.kind == .image ? 0:Int64(card.sourceTime*1_000_000)):\(width)x\(height):\(item.fit):\(item.crop):\(item.focal):\(scene.radius):\(String(describing:card.slice)):\(String(describing:card.reveal)):\(card.verticalReveal)" as NSString
        if let cached=RenderResources.shared.prepared.object(forKey:key) { return cached.image }
        guard width*height<=33_177_600,let ctx=CGContext(data:nil,width:width,height:height,bitsPerComponent:8,bytesPerRow:0,space:srgb,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else { throw GalleryError.invalid("A source layer exceeds the rendering budget.") }
        let bounds=CGRect(x:0,y:0,width:width,height:height)
        let radius=min(CGFloat(scene.radius),min(bounds.width,bounds.height)/2)
        ctx.addPath(CGPath(roundedRect:bounds,cornerWidth:radius,cornerHeight:radius,transform:nil));ctx.clip()
        if let slice=card.slice { ctx.clip(to:CGRect(x:slice.x*Double(width),y:(1-slice.y-slice.height)*Double(height),width:slice.width*Double(width),height:slice.height*Double(height))) }
        if let reveal=card.reveal {
            ctx.clip(to:card.verticalReveal ? CGRect(x:0,y:Double(height)*(1-reveal),width:Double(width),height:Double(height)*reveal) : CGRect(x:0,y:0,width:Double(width)*reveal,height:Double(height)))
        }
        let crop=CGRect(x:item.crop.x*Double(source.width),y:item.crop.y*Double(source.height),width:item.crop.width*Double(source.width),height:item.crop.height*Double(source.height)).integral
        guard let cropped=source.cropping(to:crop) else { throw GalleryError.invalid("\(item.name)'s crop could not be rendered.") }
        let sx=Double(width)/Double(cropped.width),sy=Double(height)/Double(cropped.height)
        let scale=item.fit == .contain ? min(sx,sy):max(sx,sy)
        let drawW=Double(cropped.width)*scale,drawH=Double(cropped.height)*scale
        let x=(Double(width)-drawW)*(item.fit == .contain ? 0.5:item.focal.x)
        let y=(Double(height)-drawH)*(item.fit == .contain ? 0.5:1-item.focal.y)
        ctx.interpolationQuality = .high
        ctx.draw(cropped,in:CGRect(x:x,y:y,width:drawW,height:drawH))
        guard let image=ctx.makeImage() else { throw GalleryError.invalid("A source layer could not be rendered.") }
        RenderResources.shared.prepared.setObject(ImageBox(image),forKey:key,cost:image.bytesPerRow*image.height);return image
    }
    private func captionImage(_ text:String,width:Int,fontSize:Double,light:Bool,backing:Bool)->CGImage? {
        let padding=max(3,fontSize*0.45),height=max(1,Int(ceil(fontSize*5.6+padding*2)))
        let key="caption:\(width):\(fontSize):\(light):\(backing):\(text)" as NSString
        if let cached=RenderResources.shared.prepared.object(forKey:key) {return cached.image}
        let font=CTFontCreateUIFontForLanguage(.system,CGFloat(fontSize),nil)!
        let style=NSMutableParagraphStyle();style.alignment = .center;style.lineBreakMode = .byWordWrapping
        let attributes:[NSAttributedString.Key:Any]=[
            NSAttributedString.Key(kCTFontAttributeName as String):font,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String):CGColor(gray:light ? 0.97:0.08,alpha:1),
            .paragraphStyle:style
        ]
        let attributed=NSAttributedString(string:text,attributes:attributes)
        let setter=CTFramesetterCreateWithAttributedString(attributed)
        let maxWidth=max(1,Double(width)-padding*2)
        let suggested=CTFramesetterSuggestFrameSizeWithConstraints(setter,CFRange(location:0,length:0),nil,CGSize(width:maxWidth,height:Double(height)-padding*2),nil)
        let fittedHeight=max(1,min(height,Int(ceil(suggested.height+padding*2))))
        guard let ctx=CGContext(data:nil,width:width,height:fittedHeight,bitsPerComponent:8,bytesPerRow:0,space:srgb,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else {return nil}
        if backing {
            ctx.setFillColor(CGColor(gray:0.08,alpha:0.90))
            ctx.addPath(CGPath(roundedRect:CGRect(x:0,y:0,width:width,height:fittedHeight),cornerWidth:fontSize*0.4,cornerHeight:fontSize*0.4,transform:nil));ctx.fillPath()
        }
        let rect=CGRect(x:padding,y:padding,width:maxWidth,height:Double(fittedHeight)-padding*2)
        let path=CGPath(rect:rect,transform:nil)
        var frame=CTFramesetterCreateFrame(setter,CFRange(location:0,length:0),path,nil)
        let visible=CTFrameGetVisibleStringRange(frame)
        if visible.length < attributed.length,visible.length>1 {
            let short=(text as NSString).substring(to:visible.length-1).trimmingCharacters(in:.whitespacesAndNewlines)+"…"
            let shorter=CTFramesetterCreateWithAttributedString(NSAttributedString(string:short,attributes:attributes))
            frame=CTFramesetterCreateFrame(shorter,CFRange(location:0,length:0),path,nil)
        }
        CTFrameDraw(frame,ctx)
        guard let image=ctx.makeImage() else {return nil}
        RenderResources.shared.prepared.setObject(ImageBox(image),forKey:key,cost:image.bytesPerRow*image.height)
        return image
    }
    private func ropeImage(cards:[SceneCard],width:Int,height:Int,light:Bool)->CGImage? {
        guard let ctx=CGContext(data:nil,width:width,height:height,bitsPerComponent:8,bytesPerRow:0,space:srgb,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else {return nil}
        ctx.setStrokeColor(CGColor(gray:light ? 0.3:0.6,alpha:0.75));ctx.setLineWidth(max(1,Double(height)/600))
        for c in cards where c.suspension {
            ctx.move(to:CGPoint(x:c.center.x,y:Double(height)));ctx.addLine(to:CGPoint(x:c.center.x,y:Double(height)-c.center.y+c.height/2));ctx.strokePath()
        }
        return ctx.makeImage()
    }
}
public actor PreviewWorker {
    private let renderer=NativeRenderer()
    public init() {}
    public func render(snapshot:RenderSnapshot,frame:Int64,maximumDimension:Int)throws->CGImage {
        try Task.checkCancellation()
        return try autoreleasepool {try renderer.image(snapshot:snapshot,frame:frame,maximumDimension:maximumDimension)}
    }
}
public actor ThumbnailWorker {
    public static let shared=ThumbnailWorker()
    private let renderer=NativeRenderer()
    public func image(item:MediaItem,workspace:Workspace,maximumDimension:Int=160)throws->CGImage {
        try Task.checkCancellation()
        return try autoreleasepool {try renderer.thumbnail(item:item,workspace:workspace,maximumDimension:maximumDimension)}
    }
}
