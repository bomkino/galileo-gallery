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

/// One native compositor for both the preview surface and offscreen output.
/// Core Image uses Metal where available; a headless Mac can use the same software path.
public final class NativeRenderer {
    public let context:CIContext
    public let backend:String
    private let decoded=NSCache<NSString,ImageBox>()
    private let prepared=NSCache<NSString,ImageBox>()
    private let generators=NSCache<NSString,GeneratorBox>()
    private let working=CGColorSpace(name:CGColorSpace.extendedLinearSRGB)!
    private let srgb=CGColorSpace(name:CGColorSpace.sRGB)!
    public init() {
        let options:[CIContextOption:Any]=[.cacheIntermediates:false,.workingColorSpace:CGColorSpace(name:CGColorSpace.extendedLinearSRGB)!]
        if let device=MTLCreateSystemDefaultDevice() { context=CIContext(mtlDevice:device,options:options);backend="Core Image / Metal: \(device.name)" }
        else { context=CIContext(options:options.merging([.useSoftwareRenderer:true]) { _,b in b });backend="Core Image / software (no Metal device)" }
        decoded.totalCostLimit=192*1024*1024;prepared.totalCostLimit=96*1024*1024;generators.countLimit=6
    }
    public func clearCaches() { decoded.removeAllObjects();prepared.removeAllObjects();generators.removeAllObjects();context.clearCaches() }
    public func image(snapshot:RenderSnapshot,frame:Int64,maximumDimension:Int?=nil,colorSpace:CGColorSpace?=nil)throws->CGImage {
        try Task.checkCancellation()
        let project=snapshot.plan.project,w=Double(project.canvas.width),h=Double(project.canvas.height)
        let extent=CGRect(x:0,y:0,width:w,height:h)
        let background=project.canvas
        var result:CIImage
        if background.background == .transparent { result=CIImage(color:.clear).cropped(to:extent) }
        else if background.background == .gradient {
            let radians=background.gradientAngle * .pi/180,distance=hypot(w,h)/2
            result=CIFilter(name:"CILinearGradient",parameters:[
                "inputPoint0":CIVector(x:w/2-cos(radians)*distance,y:h/2-sin(radians)*distance),
                "inputPoint1":CIVector(x:w/2+cos(radians)*distance,y:h/2+sin(radians)*distance),
                "inputColor0":ciColor(background.color),"inputColor1":ciColor(background.secondaryColor)
            ])!.outputImage!.cropped(to:extent)
        } else { result=CIImage(color:ciColor(background.color)).cropped(to:extent) }
        let cards=snapshot.plan.evaluate(frame:frame)
        let byID=Dictionary(uniqueKeysWithValues:project.items.map { ($0.id,$0) })
        if cards.contains(where: \.suspension),let ropes=ropeImage(cards:cards,width:Int(w),height:Int(h),light:background.color.r>0.5) {
            result=CIImage(cgImage:ropes).composited(over:result)
        }
        for card in cards {
            try Task.checkCancellation()
            guard let item=byID[card.itemID] else { throw GalleryError.invalid("A rendered instance has no source media.") }
            let source=try sourceImage(item:item,seconds:card.sourceTime,workspace:snapshot.workspace,maximumDimension:min(7680,maximumDimension ?? max(project.canvas.width,project.canvas.height)))
            let bitmap=try artwork(source:source,item:item,card:card,scene:project.scene)
            let q=card.quad(perspective:w*2)
            var layer=CIImage(cgImage:bitmap).applyingFilter("CIPerspectiveTransform",parameters:[
                "inputTopLeft":CIVector(x:q[0].x,y:h-q[0].y),"inputTopRight":CIVector(x:q[1].x,y:h-q[1].y),
                "inputBottomRight":CIVector(x:q[2].x,y:h-q[2].y),"inputBottomLeft":CIVector(x:q[3].x,y:h-q[3].y)
            ])
            if project.scene.shadow>0 {
                let shadow=layer.applyingFilter("CIColorMatrix",parameters:[
                    "inputRVector":CIVector(x:0,y:0,z:0,w:0),"inputGVector":CIVector(x:0,y:0,z:0,w:0),
                    "inputBVector":CIVector(x:0,y:0,z:0,w:0),"inputAVector":CIVector(x:0,y:0,z:0,w:project.scene.shadow*0.65)
                ]).transformed(by:CGAffineTransform(translationX:0,y:-min(w,h)*0.008)).applyingFilter("CIGaussianBlur",parameters:["inputRadius":min(w,h)*0.012]).cropped(to:extent)
                result=shadow.composited(over:result)
            }
            layer=layer.cropped(to:extent);result=layer.composited(over:result)
            if project.scene.captions,!item.caption.isEmpty,card.slice==nil,card.reveal==nil {
                if let caption=captionImage(item.caption,width:max(1,Int(card.width)),fontSize:max(12,min(w,h)*0.018),light:background.background == .transparent || background.color.r<0.5) {
                    let label=CIImage(cgImage:caption).transformed(by:CGAffineTransform(translationX:card.center.x-card.width/2,y:h-card.center.y-card.height/2-Double(caption.height)-8))
                    result=label.composited(over:result)
                }
            }
        }
        let scale=maximumDimension.map { min(1,Double($0)/max(w,h)) } ?? 1
        if scale<1 { result=result.transformed(by:CGAffineTransform(scaleX:scale,y:scale)) }
        let output=CGRect(x:0,y:0,width:round(w*scale),height:round(h*scale))
        guard let image=context.createCGImage(result,from:output,format:.RGBA8,colorSpace:colorSpace ?? srgb) else { throw GalleryError.invalid("The native renderer could not create the requested frame.") }
        return image
    }
    private func ciColor(_ c:RGBA)->CIColor { CIColor(red:c.r,green:c.g,blue:c.b,alpha:c.a,colorSpace:srgb)! }
    private func sourceImage(item:MediaItem,seconds:Double,workspace:Workspace,maximumDimension:Int)throws->CGImage {
        let key="\(item.sha256):\(item.kind == .image ? 0:Int64(seconds*1_000_000)):m\(maximumDimension)" as NSString
        if let box=decoded.object(forKey:key) { return box.image }
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
        decoded.setObject(ImageBox(image),forKey:key,cost:image.bytesPerRow*image.height)
        return image
    }
    private func artwork(source:CGImage,item:MediaItem,card:SceneCard,scene:SceneSettings)throws->CGImage {
        let width=max(1,min(8192,Int(ceil(card.width)))),height=max(1,min(8192,Int(ceil(card.height))))
        let key="\(item.sha256):\(item.kind == .image ? 0:Int64(card.sourceTime*1_000_000)):\(width)x\(height):\(item.fit):\(item.crop):\(item.focal):\(scene.radius):\(String(describing:card.slice)):\(String(describing:card.reveal)):\(card.verticalReveal)" as NSString
        if let cached=prepared.object(forKey:key) { return cached.image }
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
        prepared.setObject(ImageBox(image),forKey:key,cost:image.bytesPerRow*image.height);return image
    }
    private func captionImage(_ text:String,width:Int,fontSize:Double,light:Bool)->CGImage? {
        let height=Int(ceil(fontSize*2.1))
        guard let ctx=CGContext(data:nil,width:width,height:height,bitsPerComponent:8,bytesPerRow:0,space:srgb,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        let font=CTFontCreateUIFontForLanguage(.system,CGFloat(fontSize),nil)!
        let attributes:[NSAttributedString.Key:Any]=[NSAttributedString.Key(kCTFontAttributeName as String):font,NSAttributedString.Key(kCTForegroundColorAttributeName as String):CGColor(gray:light ? 0.95:0.08,alpha:1)]
        let line=CTLineCreateWithAttributedString(NSAttributedString(string:text,attributes:attributes))
        let token=CTLineCreateWithAttributedString(NSAttributedString(string:"…",attributes:attributes))
        let fitted=CTLineCreateTruncatedLine(line,Double(width),.end,token) ?? line
        ctx.textPosition=CGPoint(x:0,y:fontSize*0.55);CTLineDraw(fitted,ctx);return ctx.makeImage()
    }
    private func ropeImage(cards:[SceneCard],width:Int,height:Int,light:Bool)->CGImage? {
        guard let ctx=CGContext(data:nil,width:width,height:height,bitsPerComponent:8,bytesPerRow:0,space:srgb,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
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
        try Task.checkCancellation();let image=try renderer.image(snapshot:snapshot,frame:frame,maximumDimension:maximumDimension)
        try Task.checkCancellation();return image
    }
}
