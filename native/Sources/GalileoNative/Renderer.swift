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
    let sourceByID:[String:MediaItem]
    public init(project:GalleryProject,workspace:Workspace)throws { plan=try RenderPlan(project:project);self.workspace=workspace;sourceByID=Dictionary(uniqueKeysWithValues:project.items.map{($0.id,$0)}) }
}
final class ImageBox: NSObject { let image:CGImage;init(_ image:CGImage){self.image=image} }

/// Immutable images and a thread-safe CIContext can be shared. Mutable video
/// generators remain renderer-owned and confined to their worker.
final class RenderResources: @unchecked Sendable {
    static let shared=RenderResources()
    let context:CIContext
    let backend:String
    let decoded=NSCache<NSString,ImageBox>()
    let prepared=NSCache<NSString,ImageBox>()
    private var pressure:DispatchSourceMemoryPressure?
    private let epochLock=NSLock()
    private var epoch:UInt64=0
    var pressureEpoch:UInt64 {epochLock.lock();defer{epochLock.unlock()};return epoch}
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
    func clear() {
        epochLock.lock();epoch &+= 1;epochLock.unlock()
        decoded.removeAllObjects();prepared.removeAllObjects();context.clearCaches()
    }
}

/// One compositor for editor and output. Preview resolution is applied BEFORE
/// decoding, bitmap preparation, shadows and captions, not only at final output.
public final class NativeRenderer {
    public let context:CIContext
    public let backend:String
    public private(set) var largestPreparedLayer=0
    private var observedPressureEpoch:UInt64=0
    private var readers:[String:VideoFrameCursor]=[:]
    private var readerOrder:[String]=[]
    private var imageIndexes:[String:ImageFrameIndex]=[:]
    public private(set) var preparedSourceFrames=0
    public private(set) var decodedVideoSamples=0
    public private(set) var sourceDecodeRequests=0
    private let srgb=CGColorSpace(name:CGColorSpace.sRGB)!
    public init() {context=RenderResources.shared.context;backend=RenderResources.shared.backend}
    public func clearCaches() {readers.removeAll();readerOrder.removeAll();imageIndexes.removeAll();RenderResources.shared.clear()}
    public func thumbnail(item:MediaItem,workspace:Workspace,maximumDimension:Int=160)throws->CGImage {
        guard item.unavailable==nil else {throw GalleryError.missing("Locate or replace the missing source.")}
        return try compositionSource(item:item,seconds:item.trimStart,workspace:workspace,maximumDimension:max(64,min(16384,maximumDimension)),export:false).image
    }
    public func sourcePreview(item:MediaItem,seconds:Double,workspace:Workspace,maximumDimension:Int=960)throws->CGImage {
        try Task.checkCancellation()
        guard seconds.isFinite else{throw GalleryError.invalid("Invalid source time.")}
        return try sourceImage(item:item,seconds:max(0,seconds),workspace:workspace,maximumDimension:max(64,min(16384,maximumDimension))).image
    }
    public func audition(item:MediaItem,seconds:Double,workspace:Workspace,maximumDimension:Int=960,legacy:Bool=false)throws->SourceAuditionFrame {
        guard seconds.isFinite,item.unavailable==nil else {throw GalleryError.invalid("The source is unavailable for frame selection.")}
        let source=try sourceImage(item:item,seconds:seconds,workspace:workspace,maximumDimension:maximumDimension,exactAudition:!legacy,includeInterval:true)
        guard let interval=source.interval else {throw GalleryError.invalid("The displayed picture has no exact presentation interval.")}
        return SourceAuditionFrame(image:source.image,interval:interval)
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
        else if background.background == .drift {
            guard let settings = background.drift else { throw GalleryError.invalid("Choose a Drift background.") }
            result = try DriftBackgroundRenderer.image(settings:settings,extent:extent,
                logicalSize:CGSize(width:logicalW,height:logicalH),frame:frame,schedule:snapshot.plan.schedule)
        }
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
        let byID=snapshot.sourceByID
        if cards.contains(where: \.suspension),let ropes=ropeImage(cards:cards,width:Int(w),height:Int(h),light:luminance(background.color)>0.5) {
            result=CIImage(cgImage:ropes).composited(over:result)
        }
        func sourceTier(_ card:SceneCard,_ item:MediaItem)->Int {
            let quad=card.quad(perspective:w*2)
            func edge(_ a:Point,_ b:Point)->Double {hypot(a.x-b.x,a.y-b.y)}
            let projectedW=max(edge(quad[0],quad[1]),edge(quad[3],quad[2]))
            let projectedH=max(edge(quad[0],quad[3]),edge(quad[1],quad[2]))
            let sourceW=Double(item.width),sourceH=Double(item.height)
            let sx=projectedW/max(0.0001,sourceW*item.crop.width)
            let sy=projectedH/max(0.0001,sourceH*item.crop.height)
            let demand=max(sourceW,sourceH)*(item.fit == .contain ? min(sx,sy):max(sx,sy))
            return min(16384,max(128,Int(pow(2,ceil(log2(max(128,demand)))))))
        }
        // Immutable stills are prepared before touching any sequential playing reader.
        var stillTiers=[String:Int](),stills=[String:DecodedSourceFrame]()
        for card in cards {
            if let item=byID[card.itemID],item.kind != .image,!item.sourcePlays,item.unavailable==nil {
                stillTiers[item.id]=max(stillTiers[item.id,default:0],sourceTier(card,item))
            }
        }
        for (id,tier) in stillTiers {
            let item=byID[id]!
            stills[id]=try compositionSource(item:item,seconds:item.trimStart,workspace:snapshot.workspace,maximumDimension:tier,export:maximumDimension == nil)
        }
        for card in cards {
            try Task.checkCancellation()
            guard let item=byID[card.itemID] else {throw GalleryError.invalid("A rendered instance has no source media.")}
            let source:DecodedSourceFrame
            if item.unavailable != nil {
                guard let placeholder=captionImage("Missing source",width:320,fontSize:24,light:true,backing:true) else {throw GalleryError.invalid("The missing-media preview could not be drawn.")}
                source=DecodedSourceFrame(image:placeholder,identity:"missing")
            } else {
                source=try stills[item.id] ?? compositionSource(item:item,seconds:card.sourceTime,workspace:snapshot.workspace,maximumDimension:sourceTier(card,item),export:maximumDimension == nil)
            }
            let bitmap=try artwork(source:source,item:item,card:card,scene:scene)
            let q=card.quad(perspective:w*2)
            let layer=bitmap.applyingFilter("CIPerspectiveTransform",parameters:[
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
    private func compositionSource(item:MediaItem,seconds:Double,workspace:Workspace,maximumDimension:Int,export:Bool)throws->DecodedSourceFrame {
        guard item.kind != .image,!item.sourcePlays else {return try sourceImage(item:item,seconds:seconds,workspace:workspace,maximumDimension:maximumDimension)}
        guard let selection=item.stillFrameSelection else {throw GalleryError.invalid("The still has no valid frame selection.")}
        if case .legacyFrozen(let time)=selection {
            return try sourceImage(item:item,seconds:time,workspace:workspace,maximumDimension:maximumDimension,readerPurpose:"legacy-still")
        }
        let resolver=StillSourceResolver.shared
        let resolved=try resolver.resolve(item:item,selection:selection,range:item.sourceRange,workspace:workspace,export:export)
        return try resolver.image(item:item,resolved:resolved,workspace:workspace,maximumDimension:maximumDimension,context:context,export:export)
    }
    private func sourceImage(item:MediaItem,seconds:Double,workspace:Workspace,maximumDimension:Int,exactAudition:Bool=false,includeInterval:Bool=false,readerPurpose:String="moving")throws->DecodedSourceFrame {
        let epoch=RenderResources.shared.pressureEpoch
        if observedPressureEpoch != epoch {
            readers.removeAll();readerOrder.removeAll();imageIndexes.removeAll();observedPressureEpoch=epoch
        }
        sourceDecodeRequests+=1
        let url=try workspace.url(for:item)
        if item.kind == .video {
            let key="\(workspace.root.path):\(item.sha256):\(maximumDimension):\(readerPurpose)"
            let cursor:VideoFrameCursor
            if let old=readers[key] {cursor=old;readerOrder.removeAll{$0==key}}
            else {
                cursor=try VideoFrameCursor(url:url,maximumDimension:maximumDimension,context:context)
                while !readerOrder.isEmpty && (readers.count>=8 || readers.values.reduce(0){$0+$1.estimatedBytes}+cursor.estimatedBytes>256*1024*1024) {
                    readers.removeValue(forKey:readerOrder.removeFirst())
                }
                readers[key]=cursor
            }
            readerOrder.append(key)
            let before=cursor.materializedFrames,samplesBefore=cursor.decodedSamples
            let frame=try cursor.frame(at:seconds,fingerprint:item.sha256,exact:exactAudition,includeInterval:includeInterval)
            preparedSourceFrames+=cursor.materializedFrames-before;decodedVideoSamples+=cursor.decodedSamples-samplesBefore;return frame
        }
        let sourceKey="\(workspace.root.path):\(item.sha256)"
        let index:ImageFrameIndex
        if let cached=imageIndexes[sourceKey] {index=cached}
        else {
            index=try ImageFrameIndex(url:url,animated:item.kind == .animatedImage)
            if imageIndexes.count>=16 {imageIndexes.removeAll()}
            imageIndexes[sourceKey]=index
        }
        let number=index.index(at:seconds)
        let interval=(exactAudition || includeInterval) ? try index.exactIntervals()[number] : nil
        if exactAudition,interval?.contains(seconds:seconds) != true {throw GalleryError.invalid("No animation picture covers this audition time.")}
        let key="\(item.sha256):i\(number):m\(maximumDimension)"
        if let cached=RenderResources.shared.decoded.object(forKey:key as NSString) {return DecodedSourceFrame(image:cached.image,identity:key,interval:interval)}
        let options:[CFString:Any]=[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:maximumDimension,kCGImageSourceShouldCacheImmediately:true]
        guard let image=CGImageSourceCreateThumbnailAtIndex(index.source,number,options as CFDictionary) else {throw GalleryError.invalid("\(item.name) could not produce picture \(number+1).")}
        RenderResources.shared.decoded.setObject(ImageBox(image),forKey:key as NSString,cost:image.bytesPerRow*image.height)
        preparedSourceFrames+=1;return DecodedSourceFrame(image:image,identity:key,interval:interval)
    }
    /// Keep one source image through fit/crop/rounded masking and fragment
    /// clipping. No new full-card CPU bitmap for each animated pose or slice.
    private func artwork(source:DecodedSourceFrame,item:MediaItem,card:SceneCard,scene:SceneSettings)throws->CIImage {
        let width=max(1,card.width),height=max(1,card.height)
        guard width*height<=33_177_600 else {throw GalleryError.invalid("A source layer exceeds the rendering budget.")}
        largestPreparedLayer=max(largestPreparedLayer,Int(ceil(width*height)))
        let bounds=CGRect(x:0,y:0,width:width,height:height)
        let bitmap=source.image
        let crop=CGRect(x:item.crop.x*Double(bitmap.width),y:(1-item.crop.y-item.crop.height)*Double(bitmap.height),
                        width:item.crop.width*Double(bitmap.width),height:item.crop.height*Double(bitmap.height))
        var image=CIImage(cgImage:bitmap).cropped(to:crop).transformed(by:CGAffineTransform(translationX:-crop.minX,y:-crop.minY))
        let sx=width/crop.width,sy=height/crop.height,scale=item.fit == .contain ? min(sx,sy):max(sx,sy)
        let x=(width-crop.width*scale)*(item.fit == .contain ? 0.5:item.focal.x)
        let y=(height-crop.height*scale)*(item.fit == .contain ? 0.5:1-item.focal.y)
        image=image.transformed(by:CGAffineTransform(scaleX:scale,y:scale)).transformed(by:CGAffineTransform(translationX:x,y:y)).cropped(to:bounds)
        let clear=CIImage(color:.clear).cropped(to:bounds)
        if scene.radius>0 {
            guard let mask=CIFilter(name:"CIRoundedRectangleGenerator",parameters:["inputExtent":CIVector(cgRect:bounds),"inputRadius":min(scene.radius,min(width,height)/2),"inputColor":CIColor.white])?.outputImage else {throw GalleryError.invalid("The rounded image mask is unavailable.")}
            image=image.applyingFilter("CIBlendWithAlphaMask",parameters:[kCIInputBackgroundImageKey:clear,kCIInputMaskImageKey:mask]).cropped(to:bounds)
        }
        if let slice=card.slice {image=image.cropped(to:CGRect(x:slice.x*width,y:(1-slice.y-slice.height)*height,width:slice.width*width,height:slice.height*height))}
        if let reveal=card.reveal {image=image.cropped(to:card.verticalReveal ? CGRect(x:0,y:height*(1-reveal),width:width,height:height*reveal):CGRect(x:0,y:0,width:width*reveal,height:height))}
        // Retain the full source plane so perspective maps clipped pieces into
        // their original coordinates rather than stretching each piece.
        return image.composited(over:clear).cropped(to:bounds)
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

public struct SourceAuditionFrame: @unchecked Sendable {
    public let image:CGImage
    public let interval:SourceInterval
}
public actor SourcePreviewWorker {
    private let renderer=NativeRenderer()
    public init() {}
    public func audition(item:MediaItem,seconds:Double,workspace:Workspace,maximumDimension:Int=960)throws->SourceAuditionFrame {
        try Task.checkCancellation()
        return try autoreleasepool {try renderer.audition(item:item,seconds:seconds,workspace:workspace,maximumDimension:maximumDimension)}
    }
    public func frame(item:MediaItem,seconds:Double,workspace:Workspace,maximumDimension:Int=960)throws->CGImage {
        try Task.checkCancellation()
        return try autoreleasepool {try renderer.sourcePreview(item:item,seconds:seconds,workspace:workspace,maximumDimension:maximumDimension)}
    }
}
