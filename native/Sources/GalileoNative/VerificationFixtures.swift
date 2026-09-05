import Foundation
import CoreGraphics
import CoreText
import GalileoCore

/// Original, deterministic test artwork. No customer media or bundled fonts.
public enum VerificationFixtures {
    public static func image(width:Int=640,height:Int=400,index:Int=0,alpha:Bool=false)throws->CGImage {
        let colorSpace=CGColorSpace(name:CGColorSpace.sRGB)!
        guard let ctx=CGContext(data:nil,width:width,height:height,bitsPerComponent:8,bytesPerRow:0,space:colorSpace,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else {throw GalleryError.invalid("Fixture allocation failed.")}
        let palette:[RGBA]=[RGBA(hex:"E7E3D7"),RGBA(hex:"B65439"),RGBA(hex:"2B514B"),RGBA(hex:"DBB548")]
        let color=palette[index%palette.count]
        if !alpha {ctx.setFillColor(CGColor(colorSpace:colorSpace,components:[color.r,color.g,color.b,1])!);ctx.fill(CGRect(x:0,y:0,width:width,height:height))}
        let short=Double(min(width,height)),inset=short*0.09
        ctx.setFillColor(CGColor(gray:alpha ? 0.9:0.08,alpha:1))
        ctx.fillEllipse(in:CGRect(x:Double(width)*0.47,y:Double(height)*0.28,width:short*0.52,height:short*0.52))
        ctx.setStrokeColor(CGColor(gray:index==0 ? 0.15:0.93,alpha:0.85));ctx.setLineWidth(max(1,short*0.004))
        ctx.stroke(CGRect(x:inset,y:inset,width:Double(width)-inset*2,height:Double(height)-inset*2))
        let font=CTFontCreateUIFontForLanguage(.system,short*0.07,nil)!
        let text=["FIELD NOTES","AFTER HOURS","STILL / MOVING","A SMALL STUDY"][index%4]
        let line=CTLineCreateWithAttributedString(NSAttributedString(string:text,attributes:[NSAttributedString.Key(kCTFontAttributeName as String):font,NSAttributedString.Key(kCTForegroundColorAttributeName as String):CGColor(gray:index==0 ? 0.08:0.97,alpha:1)]))
        ctx.textPosition=CGPoint(x:inset*1.5,y:Double(height)-inset*2.2);CTLineDraw(line,ctx)
        guard let image=ctx.makeImage() else{throw GalleryError.invalid("Fixture rendering failed.")};return image
    }
    public static func workspace(count:Int=3)throws->(GalleryProject,Workspace) {
        let workspace=try Workspace();var project=GalleryProject();project.name="Studio study"
        project.canvas.width=640;project.canvas.height=360;project.timing.durationMilliseconds=1000;project.scene.shadow=0
        for index in 0..<count {
            let size=[(640,400),(360,480),(640,270),(400,400)][index%4]
            let temporary=workspace.root.appendingPathComponent("source-\(index).png")
            try NativeExport.writePNG(image(width:size.0,height:size.1,index:index),to:temporary)
            let acquired=try workspace.acquire(temporary)
            project.items.append(MediaItem(name:["Field notes.png","After hours.png","Still moving.png","A small study.png"][index%4],asset:acquired.url.lastPathComponent,sha256:acquired.hash,kind:.image,width:size.0,height:size.1))
            try FileManager.default.removeItem(at:temporary)
        }
        return(project,workspace)
    }
}
