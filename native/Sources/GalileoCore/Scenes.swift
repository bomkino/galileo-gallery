import Foundation

public enum SceneFamily: String, Codable, CaseIterable, Sendable {
    case carousel, reel, stack, orbit, fan, table, vitrine, compare, build, hang
    public var name: String { rawValue.capitalized }
    public var symbol: String {
        switch self {
        case .carousel: return "rectangle.on.rectangle"
        case .reel: return "film"
        case .stack: return "square.stack.3d.up"
        case .orbit: return "circle.dotted"
        case .fan: return "rectangle.3.group"
        case .table: return "square.grid.2x2"
        case .vitrine: return "rectangle.center.inset.filled"
        case .compare: return "rectangle.lefthalf.inset.filled"
        case .build: return "square.3.layers.3d"
        case .hang: return "line.3.horizontal.decrease"
        }
    }
}
public enum SceneControl: String, CaseIterable, Sendable {
    case scale, spacing, depth, spread, tilt, radius, shadow, captions, vertical, hold
    public var label: String {
        switch self {
        case .scale: return "Scale"
        case .spacing: return "Spacing"
        case .depth: return "Depth"
        case .spread: return "Spread"
        case .tilt: return "Tilt"
        case .radius: return "Corners"
        case .shadow: return "Shadow"
        case .captions: return "Captions"
        case .vertical: return "Vertical"
        case .hold: return "Hold"
        }
    }
}
public struct SceneVariant: Identifiable, Sendable {
    public let id: String; public let name: String; public let family: SceneFamily
    public let controls: [SceneControl]
    public var timingDescription: String { controls.contains(.hold) ? "Hold and exchange" : "Continuous movement" }
}
public enum SceneCatalog {
    private static let basic: [SceneControl] = [.scale,.radius,.shadow,.captions]
    private static func v(_ id: String, _ name: String, _ family: SceneFamily, _ controls: [SceneControl]) -> SceneVariant {
        SceneVariant(id:id,name:name,family:family,controls:controls + basic)
    }
    public static let variants: [SceneVariant] = [
        v("cms-slideshow", "Slide", .carousel, [.spacing,.vertical,.hold]),
        v("coverflow-gallery", "Coverflow", .carousel, [.spacing,.depth,.hold]),
        v("the-shelf", "Shelf", .carousel, [.spacing,.depth,.hold]),
        v("opening-reel", "Opening", .reel, [.spacing,.hold]),
        v("filmstrip-river", "Filmstrip", .reel, [.spacing]),
        v("wave-ticker", "Wave", .reel, [.spacing,.tilt]),
        v("deck-river", "Depth river", .reel, [.spacing,.depth]),
        v("deck-river-loader", "Chapter reveal", .reel, [.spacing,.depth,.hold]),
        v("swipe-stack", "Swipe", .stack, [.spacing,.tilt,.hold]),
        v("the-stack", "Calm", .stack, [.spacing,.tilt,.hold]),
        v("hero-deck-object", "Hero", .stack, [.spacing,.tilt,.hold]),
        v("orbit-ring", "Ring", .orbit, [.spacing,.depth]),
        v("proximity-orbit", "Proximity", .orbit, [.spacing,.depth]),
        v("spin-image-orbit", "Ellipse", .orbit, [.spacing,.depth]),
        v("zoetrope", "Zoetrope", .orbit, [.spacing,.depth]),
        v("spiral-image-vortex", "Spiral", .orbit, [.spacing,.depth]),
        v("the-orrery", "Orrery", .orbit, [.spacing,.depth]),
        v("slide-fan", "Open", .fan, [.spread,.tilt,.hold]),
        v("dealers-fan", "Dealer", .fan, [.spread,.tilt,.hold]),
        v("deck-contact-strip", "Strip", .table, [.spacing,.hold]),
        v("contact-sheet", "Grid", .table, [.spacing,.hold]),
        v("light-table", "Light table", .table, [.spacing,.depth,.hold]),
        v("drift-deck", "Quiet spread", .table, [.spacing,.tilt,.hold]),
        v("image-scatter-gallery", "Lively spread", .table, [.spacing,.tilt,.hold]),
        v("vitrine", "Museum", .vitrine, [.depth,.tilt,.hold]),
        v("before-after-slider", "Wipe", .compare, [.vertical]),
        v("slide-anatomy-object", "Sections", .build, [.spacing,.depth,.hold]),
        v("the-build", "Assembly", .build, [.spacing,.depth,.hold]),
        v("the-hang", "Suspended", .hang, [.spacing,.tilt]),
    ]
    public static func variant(_ id: String) -> SceneVariant? { variants.first { $0.id == (id == "quiet-carousel" ? "cms-slideshow" : id) } }
    public static func variants(in family: SceneFamily) -> [SceneVariant] { variants.filter { $0.family == family } }
    public static func defaults(for id: String) -> SceneSettings {
        var s = SceneSettings(); s.variantID = variant(id)?.id ?? "cms-slideshow"
        switch variant(id)?.family {
        case .orbit: s.scale = 0.42
        case .fan: s.scale = 0.50; s.tilt = 4
        case .table, .hang: s.scale = 0.82
        case .reel: s.scale = 0.55
        case .stack: s.scale = 0.65
        default: break
        }
        return s
    }
}
public struct SceneCard: Equatable, Sendable {
    public var instanceID: String
    public var itemID: String
    public var center: Point
    public var width: Double; public var height: Double
    public var angle = 0.0; public var pitch = 0.0; public var yaw = 0.0
    public var z = 0.0
    public var sourceTime: Double
    public var slice: Crop? = nil
    public var reveal: Double? = nil
    public var verticalReveal = false
    public var suspension = false
    public init(item: MediaItem, instance: String = "", x: Double, y: Double, width: Double, height: Double, seconds: Double) {
        itemID=item.id; instanceID=item.id+instance; center=Point(x,y); self.width=width; self.height=height
        sourceTime=item.sourceTime(at:seconds)
    }
    /// Top-left, top-right, bottom-right, bottom-left in a top-left-origin composition.
    public func quad(perspective: Double) -> [Point] {
        let a=angle * .pi/180, py=pitch * .pi/180, yw=yaw * .pi/180
        return [Point(-width/2,-height/2),Point(width/2,-height/2),Point(width/2,height/2),Point(-width/2,height/2)].map { p in
            let xx = p.x*cos(yw); let zz = -p.x*sin(yw)
            let yy = p.y*cos(py)-zz*sin(py); let z2=p.y*sin(py)+zz*cos(py)
            let factor=perspective/max(perspective*0.2,perspective-z2)
            return Point(center.x+(xx*cos(a)-yy*sin(a))*factor,center.y+(xx*sin(a)+yy*cos(a))*factor)
        }
    }
}
public struct RenderPlan: Sendable {
    public let project: GalleryProject
    public let schedule: FrameSchedule
    public let variant: SceneVariant
    public let items: [MediaItem]
    public let spotlights: [SpotlightCue]
    private let motionSchedule: FrameSchedule
    public init(project: GalleryProject) throws {
        try project.validate()
        self.project = project
        motionSchedule = try FrameSchedule(timing: project.timing, rate: project.export.frameRate)
        variant = SceneCatalog.variant(project.scene.variantID)!
        items = project.activeItems
        spotlights = SpotlightCue.compile(items: items, variant: variant, timing: project.timing, motion: motionSchedule)
        schedule = try FrameSchedule(timing: project.timing, rate: project.export.frameRate,
                                     additionalCycleFrames: spotlights.reduce(0) { $0 + $1.frameCount })
    }
    public func evaluate(frame: Int64) -> [SceneCard] {
        guard !items.isEmpty else { return [] }
        let output = schedule.sample(frame: frame)
        var added: Int64 = 0
        for cue in spotlights {
            if output.localFrame < cue.startFrame { break }
            if output.localFrame < cue.endFrame {
                let time = motionSample(frame: cue.motionFrame, output: output)
                let base = evaluateMotion(time: time, sourceSeconds: output.localSeconds)
                return SpotlightCue.present(cue, offset: output.localFrame - cue.startFrame,
                                            cards: base, items: items, canvas: project.canvas, sourceSeconds: output.localSeconds)
            }
            added += cue.frameCount
        }
        return evaluateMotion(time: motionSample(frame: output.localFrame - added, output: output),
                              sourceSeconds: output.localSeconds)
    }
    private func motionSample(frame: Int64, output: TimeSample) -> TimeSample {
        let original = motionSchedule.sample(frame: frame)
        return TimeSample(absoluteFrame: output.absoluteFrame, cycleIndex: output.cycleIndex,
                          localFrame: original.localFrame, seconds: output.seconds,
                          localSeconds: original.localSeconds, progress: original.progress,
                          isLastCycle: output.isLastCycle)
    }
    private func evaluateMotion(time: TimeSample, sourceSeconds: Double) -> [SceneCard] {
        let w=Double(project.canvas.width),h=Double(project.canvas.height),short=min(w,h)
        let s=project.scene, n=items.count, p=time.progress, tau=Double.pi*2
        let canWrap=project.timing.playMode == .loop || !time.isLastCycle
        func smooth(_ x: Double) -> Double { let x=bounded(x,0,1); return x*x*x*(x*(x*6-15)+10) }
        func source(_ index:Int)->MediaItem { items[((index%n)+n)%n] }
        func card(_ index:Int,_ x:Double,_ y:Double,_ maxW:Double,_ maxH:Double,_ instance:String="")->SceneCard {
            let item=source(index),ratio=item.ratio
            let ch=min(maxH,maxW/max(0.0001,ratio)),cw=ch*ratio
            return SceneCard(item:item,instance:instance,x:x,y:y,width:max(1,cw),height:max(1,ch),seconds:sourceSeconds)
        }
        let beat=p*Double(n),current=min(n-1,Int(beat)),fraction=beat-Double(current)
        let exchange=smooth((fraction-project.timing.holdFraction)/(1-project.timing.holdFraction))
        let motion=(current==n-1 && !canWrap) ? 0 : exchange
        var cards:[SceneCard]=[]
        switch variant.family {
        case .carousel:
            if variant.id == "cms-slideshow" {
                let distance=(s.vertical ? h : w)+s.spacing
                cards.append(card(current,w/2-(s.vertical ? 0:motion*distance),h/2-(s.vertical ? motion*distance:0),w*s.scale,h*s.scale))
                if motion>0 { cards.append(card(current+1,w/2+(s.vertical ? 0:(1-motion)*distance),h/2+(s.vertical ? (1-motion)*distance:0),w*s.scale,h*s.scale,"-incoming")) }
            } else {
                for offset in -2...3 {
                    let i=current+offset
                    if !canWrap && (i<0 || i>=n) { continue }
                    if n<6 && offset>=n { continue }
                    let d=Double(offset)-motion,front=max(0,1-abs(d))
                    let size=(0.72+front*0.28)*s.scale
                    var c=card(i,w/2+d*(w*0.23+s.spacing),variant.id == "the-shelf" ? h*0.60 : h/2,w*size,h*size,"-\(offset)")
                    if variant.id == "the-shelf" { c.center.y=h*0.75-c.height/2; c.yaw = -18*s.depth }
                    else { c.yaw=bounded(-d*65*s.depth,-65,65) }
                    c.z=front*100-abs(d); cards.append(c)
                }
            }
        case .reel:
            let depthRiver = variant.id == "deck-river" || variant.id == "deck-river-loader"
            let cursor = (variant.id == "opening-reel" || variant.id == "deck-river-loader") ? Double(current)+motion : p*Double(n)
            for offset in -4...5 {
                let virtual=Int(floor(cursor))+offset
                if !canWrap && (virtual<0 || virtual>=n) { continue }
                if n<10 && (offset<0 || offset>=n) && canWrap { continue }
                let d=Double(virtual)-cursor
                if depthRiver {
                    let scale=bounded(1-abs(d)*0.19,0.09,1)
                    var c=card(virtual,w/2+d*(short*0.1+s.spacing),h*0.5-d*short*0.075,w*s.scale*scale,h*s.scale*scale,"-\(offset)")
                    c.yaw=bounded(d*22*s.depth,-55,55); c.z = -abs(d); cards.append(c)
                } else {
                    let lane=variant.id == "filmstrip-river" ? virtual%2 : 0
                    let wave=variant.id == "wave-ticker" ? sin(d*0.7+p*tau)*short*s.tilt/180 : 0
                    var c=card(virtual,w/2+d*(short*s.scale*0.8+s.spacing),h/2+(Double(lane)-0.5)*(variant.id == "filmstrip-river" ? h*0.45:0)+wave,short*s.scale,short*s.scale*0.70,"-\(offset)")
                    if variant.id == "wave-ticker" { c.angle=cos(d*0.7+p*tau)*s.tilt }
                    cards.append(c)
                }
            }
        case .stack:
            for offset in (0..<min(5,n)).reversed() {
                let i=current+offset
                if !canWrap && i>=n { continue }
                let layer=Double(offset),shrink=1-layer*0.045+motion*0.045
                var c=card(i,w/2+(layer-motion)*s.spacing*0.15,h/2+layer*s.spacing*0.40-motion*s.spacing*0.4,w*s.scale*shrink,h*s.scale*shrink,"-\(offset)")
                c.angle=(layer-motion-1)*s.tilt*0.16; c.z = -layer
                if offset==0 {
                    if variant.id == "the-stack" { c.center.y-=motion*h; c.angle-=motion*s.tilt }
                    else if variant.id == "hero-deck-object" { c.center.x+=motion*w*1.1; c.center.y-=sin(motion*Double.pi)*h*0.1; c.angle+=motion*s.tilt*0.5 }
                    else { c.center.x-=motion*w; c.center.y-=sin(motion*Double.pi)*h*0.12; c.angle-=motion*(12+s.tilt) }
                }
                cards.append(c)
            }
        case .orbit:
            let orrery = variant.id == "the-orrery"
            if orrery {
                var primary = card(0, w/2, h/2, w*s.scale*0.6, h*s.scale*0.6, "-primary")
                primary.z = 20; cards.append(primary)
            }
            let count = orrery ? n-1 : n
            guard count > 0 else { return cards }
            let conveyor = count > 12
            for index in 0..<count {
                // The source, not a changing slot, owns its entire route. Larger
                // collections recycle through an off-canvas rear corridor.
                var d = Double(index) - p*Double(count)
                if conveyor {
                    d -= floor((d + Double(count)/2) / Double(count))*Double(count)
                    if abs(d) >= 6 { continue }
                }
                let angle = conveyor ? d*tau/12 : Double(index)/Double(count)*tau-p*tau
                let near = (cos(angle)+1)/2
                let ring = orrery && index%2 == 1 ? 0.70 : 1.0
                let rx = (w*0.31+s.spacing*0.25)*ring
                var ry = h*(variant.id == "spin-image-orbit" ? 0.12 : 0.18+s.depth*0.12)*ring
                if variant.id == "zoetrope" { ry = h*0.08 }
                let scale = s.scale*(0.45+near*(0.3+s.depth*0.3))
                var c = card(index+(orrery ? 1:0), w/2+sin(angle)*rx, h/2+cos(angle)*ry, w*scale, h*scale, "-orbit")
                if variant.id == "proximity-orbit" { c.width *= 1+pow(near,8)*0.18; c.height *= 1+pow(near,8)*0.18 }
                if variant.id == "spiral-image-vortex" {
                    let t = conveyor ? bounded((d+6)/12,0,1) : Double(index)/Double(max(1,count-1))
                    c.center.y = h*0.2+t*h*0.6+sin(angle)*h*0.035
                    c.center.x = w/2+sin(angle+t*tau)*rx*(0.5+t*0.5)
                }
                if conveyor { c.center.y -= smooth((abs(d)-4.2)/1.8)*h*2 }
                c.yaw = variant.id == "zoetrope" ? sin(angle)*70*s.depth : variant.id == "spin-image-orbit" ? 0 : -sin(angle)*22*s.depth
                c.z = near*10; cards.append(c)
            }
        case .fan:
            let pageSize=10,pages=(n+pageSize-1)/pageSize,page=min(pages-1,Int(p*Double(pages)))
            let phase=p*Double(pages)-Double(page),first=page*pageSize,count=min(pageSize,n-first)
            let entry = page > 0 || canWrap ? 1-smooth(phase/0.14) : 0
            let exit = page < pages-1 || canWrap ? smooth((phase-0.86)/0.14) : 0
            let opening=smooth(phase/0.14)*(1-exit)
            let feature=smooth((phase-0.3)/0.10)*(1-smooth((phase-project.timing.holdFraction)/max(0.05,0.9-project.timing.holdFraction)))
            for slot in 0..<count {
                let position=count==1 ? 0:Double(slot)/Double(count-1)-0.5
                let angle=position*s.spread*opening
                let size=short*s.scale*0.7
                var c=card(first+slot,w/2,h*0.64+(entry+exit)*h*1.5,size,size,"-fan")
                let r=angle * .pi/180
                c.center.x+=sin(r)*c.height*0.44
                c.center.y-=cos(r)*c.height*0.30
                c.angle=angle
                if slot==count/2 { c.center.y-=feature*short*(variant.id == "dealers-fan" ? 0.18:0.09); c.angle-=feature*s.tilt; c.z=feature*100 }
                else { c.angle+=sin(phase*tau)*s.tilt*0.12 }
                cards.append(c)
            }
        case .table:
            let strip = variant.id == "deck-contact-strip", pageSize = strip ? 5 : 12
            let pages = (n+pageSize-1)/pageSize, page = min(pages-1,Int(p*Double(pages)))
            let phase = p*Double(pages)-Double(page)
            let exchangePage = pages > 1 && (page < pages-1 || canWrap)
            let travel = exchangePage ? smooth((phase-project.timing.holdFraction)/(1-project.timing.holdFraction)) : 0
            // Both pages exist throughout the handoff. The incoming page reaches
            // exactly its next-page pose; the final looping page hands back to zero.
            for pass in 0...(travel > 0 ? 1 : 0) {
                let shownPage = pass == 0 ? page : (page+1)%pages
                let first = shownPage*pageSize, count = min(pageSize,n-first)
                let columns = strip ? count : min(4,max(1,Int(ceil(sqrt(Double(count)*w/h)))))
                let rows = (count+columns-1)/columns
                let cellW = (w-s.spacing*2)/Double(columns), cellH = (h-s.spacing*2)/Double(rows)
                let pageShift = pass == 0 ? -travel*w*1.2 : (1-travel)*w*1.2
                for slot in 0..<count {
                    let i = first+slot
                    var c = card(i,s.spacing+(Double(slot%columns)+0.5)*cellW+pageShift,s.spacing+(Double(slot/columns)+0.5)*cellH,max(1,cellW-s.spacing*0.45)*s.scale,max(1,cellH-s.spacing*0.45)*s.scale,"-table")
                    if variant.id == "drift-deck" || variant.id == "image-scatter-gallery" {
                        let seed = Self.stableUnit(items[i].id), strength = variant.id == "drift-deck" ? 0.35 : 1.0
                        c.angle = (seed-0.5)*s.tilt*strength+sin(p*tau+seed*tau)*s.tilt*0.1
                        c.center.y += sin(p*tau+seed*tau)*min(cellH*0.08,s.tilt*strength)
                    }
                    if strip || variant.id == "light-table" {
                        let scanPhase = pass == 1 ? 0 : phase
                        let scan = scanPhase*Double(count), selected = min(count-1,Int(scan))
                        let blend = smooth((scan-Double(selected)-project.timing.holdFraction)/(1-project.timing.holdFraction))
                        let weight = slot == selected ? 1-blend : slot == (selected+1)%count ? blend : 0
                        let lift = strip ? 0.12 : s.depth*0.16
                        c.width *= 1+weight*lift; c.height *= 1+weight*lift; c.z = weight*10
                    }
                    cards.append(c)
                }
            }
        case .vitrine:
            let distance = w*1.5
            var a = card(current,w/2-motion*distance,h/2,w*s.scale*(1-motion*s.depth*0.2),h*s.scale*(1-motion*s.depth*0.2))
            a.yaw = -motion*(15+s.depth*35); a.angle = sin(p*tau)*s.tilt*0.2; a.z = 1
            if motion > 0 {
                var b = card(current+1,w/2+(1-motion)*distance,h/2,w*s.scale,h*s.scale,"-incoming")
                b.yaw = (1-motion)*(15+s.depth*35); b.angle = sin(p*tau)*s.tilt*0.2; b.z = 2
                cards.append(b)
            }
            cards.append(a)
        case .compare:
            let pairs=(n+1)/2,pair=min(pairs-1,Int(p*Double(pairs))),phase=p*Double(pairs)-Double(pair)
            let a=pair*2,b=min(n-1,a+1)
            cards.append(card(a,w/2,h/2,w*s.scale,h*s.scale,"-before"))
            var after=card(b,w/2,h/2,w*s.scale,h*s.scale,"-after")
            // Both sources share one container; media fit remains an explicit per-source choice.
            after.width=cards[0].width; after.height=cards[0].height
            after.reveal=(1-cos(phase*tau))/2; after.verticalReveal=s.vertical; after.z=1
            cards.append(after)
        case .build:
            let pieces = variant.id == "the-build" ? 6 : 3
            let finish = project.timing.holdFraction
            let leaving = (current < n-1 || canWrap) ? smooth((fraction-max(0.80,finish))/(1-max(0.80,finish))) : 0
            for part in 0..<pieces {
                // Stagger is proportional to assembly time, never longer than it.
                let delay = finish*0.4*Double(part)/Double(pieces)
                let assemble = smooth((fraction-delay)/max(0.001,finish-delay))
                var c = card(current,w/2,h/2,w*s.scale,h*s.scale,"-part\(part)")
                var slice = Crop()
                if variant.id == "the-build" { slice.x = Double(part)/Double(pieces); slice.width = 1/Double(pieces) }
                else { slice.y = Double(part)/Double(pieces); slice.height = 1/Double(pieces) }
                c.slice = slice
                c.center.y += (1-assemble)*(h*1.6+Double(part)*(s.spacing+short*s.depth*0.05)) - leaving*h*1.6
                c.center.x += (1-assemble)*(part%2 == 0 ? -1 : 1)*short*s.depth*0.08
                c.z = Double(part); cards.append(c)
            }
        case .hang:
            let pageSize = 8, pages = (n+pageSize-1)/pageSize, page = min(pages-1,Int(p*Double(pages)))
            let phase = p*Double(pages)-Double(page)
            let travel = pages > 1 && (page < pages-1 || canWrap) ? smooth((phase-0.78)/0.22) : 0
            for pass in 0...(travel > 0 ? 1 : 0) {
                let first = (pass == 0 ? page : (page+1)%pages)*pageSize
                let count = min(pageSize,n-first), cell = w/Double(count)
                let shift = pass == 0 ? -travel*h*1.8 : (1-travel)*h*1.8
                for slot in 0..<count {
                    let i = first+slot, seed = Self.stableUnit(items[i].id)
                    var c = card(i,(Double(slot)+0.5)*cell,h*(0.42+seed*0.15)+shift,max(1,cell-s.spacing)*s.scale,h*0.60*s.scale,"-hang")
                    c.angle = sin(p*tau+seed*tau)*s.tilt; c.suspension = true; cards.append(c)
                }
            }
        }
        return cards.sorted { $0.z == $1.z ? $0.instanceID < $1.instanceID : $0.z < $1.z }
    }
    private static func stableUnit(_ id:String)->Double {
        var h:UInt64=1469598103934665603
        for b in id.utf8 { h=(h ^ UInt64(b)) &* 1099511628211 }
        return Double(h%10000)/10000
    }
}
