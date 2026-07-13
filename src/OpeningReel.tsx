import * as React from "react"
import {
    addPropertyControls,
    ControlType,
    RenderTarget,
    useIsStaticRenderer,
} from "framer"

// ---------------------------------------------------------------------------
// Opening Reel — a title sequence you screen-record.
//
// A mixed-media film strip is dragged in from the right. Slides whiz past on a soft,
// drifting grid; each one straightens and swells a touch as it crosses
// center. Slides marked SPOTLIGHT stop in the middle, grow to take the
// stage (neighbours pushed aside, the gap held constant), hold a beat,
// then rejoin the river. The last slide not marked Skip Beat is the FINALE: it grows
// bigger, everything else fades, the grid glides to stillness, even the
// paper padding melts away — until only the frame remains, dead still.
// Match-cut from there into your video.
//
// One clock, one rAF, straight to the DOM. Every beat is precomputed as
// a timeline, so the Canvas Pose control scrubs the exact same math the
// live playback runs. Record in the Framer preview at 1920×1080.
//
// Mode "Loop" fades back to the grid after the finale and runs forever —
// the website version, for showing off a deck.
//
// Click (or press R) to restart — take after take. Reduced-motion
// visitors get the still finale frame, no ride.
// ---------------------------------------------------------------------------

type TokenValue = string | { value: string }

type SlideImage = {
    src?: string
    srcSet?: string
    alt?: string
}

type MediaKind = "image" | "video"
type MotionPreset = "cut" | "magnetic" | "velvet" | "dream" | "custom"

type Slide = {
    mediaType?: MediaKind
    image?: SlideImage
    video?: string
    poster?: SlideImage
    spotlight?: boolean
    muted?: boolean
    caption?: string
    ratioW?: number
    ratioH?: number
}

type PanelPage = "Slides" | "Frame" | "Story" | "Timing" | "Look" | "All"
type RatioMode = "auto" | "fixed"
type FixedRatioPreset = "sixteenNine" | "wide2576" | "custom"
type PaddingUnit = "px" | "percent"
type ThemeMode = "auto" | "dark" | "light"
type BackgroundStyle = "solid" | "gradient" | "halo" | "paper" | "transparent"
type StartMode = "auto" | "click"
type PlayModeKind = "once" | "repeat" | "loop"
type Direction = "forward" | "reverse"

type CSSVars = React.CSSProperties & Record<`--${string}`, string | number>

interface Props {
    panel?: PanelPage
    slides?: Slide[]
    ratioMode?: RatioMode
    fixedRatio?: FixedRatioPreset
    customRatioWidth?: number
    customRatioHeight?: number
    imageFit?: "contain" | "cover"
    autoplayVideos?: boolean
    loopVideos?: boolean
    paddingUnit?: PaddingUnit
    paddingTop?: number
    paddingRight?: number
    paddingBottom?: number
    paddingLeft?: number
    captionGap?: number
    // Story
    heroSize?: number
    finaleSize?: number
    finaleEnabled?: boolean
    centerBump?: number
    tilt?: number
    sway?: number
    idleDim?: number
    idleMute?: number
    spotlightDim?: number
    speedBlur?: number
    // Timing
    startMode?: StartMode
    playKind?: PlayModeKind
    repeatCount?: number
    direction?: Direction
    leadInMs?: number
    paceMs?: number
    motionPreset?: MotionPreset
    launchMs?: number
    arrivalMs?: number
    growMs?: number
    exitMs?: number
    holdMs?: number
    finaleGrowMs?: number
    finaleHoldMs?: number
    fadeMs?: number
    canvasPose?: number
    // Look
    theme?: ThemeMode
    ground?: TokenValue
    paper?: TokenValue
    backgroundStyle?: BackgroundStyle
    backgroundColor2?: TokenValue
    backgroundAngle?: number
    backgroundTexture?: number
    slideHeight?: number
    gap?: number
    cornerStyle?: "rounded" | "squircle"
    cornerSmoothing?: number
    radius?: number
    shadow?: number
    gridSize?: number
    gridStrength?: number
    gridDrift?: number
    vignette?: number
    showHint?: boolean
    style?: React.CSSProperties
    onPlaybackStart?: () => void
    staticPose?: boolean
    canvasTimeMs?: number
    exportFrames?: Record<number, string>
}

// Hand-set lanes: a vertical breath and a lean per slide, so the strip
// never reads as machine-stamped. Deterministic — safe for SSR.
const LANES: Array<[number, number]> = [
    [-0.022, -1.3],
    [0.028, 1.0],
    [-0.011, 0.7],
    [0.034, -1.7],
    [-0.03, 1.5],
    [0.016, -0.6],
    [0.006, 1.8],
    [-0.034, -1.0],
]

const LOOP_FADE_MS = 750

const DEFAULT_SLIDES: Slide[] = Array.from({ length: 14 }, (_, i) => ({
    spotlight: i === 4 || i === 8 || i === 11,
}))

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function tok(value: TokenValue | undefined, fallback: string): string {
    if (value == null) return fallback
    if (typeof value === "object" && "value" in value) return value.value
    return value || fallback
}

function clamp01(n: number) {
    return Math.max(0, Math.min(1, n))
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n))
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t
}

function smooth(value: number) {
    const t = clamp01(value)
    return t * t * (3 - 2 * t)
}

function easeOutCubic(value: number) {
    const t = clamp01(value)
    return 1 - Math.pow(1 - t, 3)
}

function easeInOutCubic(value: number) {
    const t = clamp01(value)
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Ease-out with a whisper of overshoot — the show-off's entrance. */
function easeOutBack(value: number) {
    const c1 = 1.0
    const c3 = c1 + 1
    const t = clamp01(value)
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/** Integral of (1 - smoothstep) on [0, u]: how the grid glides to rest. */
function stillGlide(u: number) {
    const t = clamp01(u)
    return t - t * t * t + (t * t * t * t) / 2
}

function presetRatio(
    preset: FixedRatioPreset,
    customW = 16,
    customH = 9
): number {
    if (preset === "wide2576") return 2576 / 1080
    if (preset === "custom") {
        return clamp(customW, 1, 10000) / clamp(customH, 1, 10000)
    }
    return 16 / 9
}

function autoAspectRatioFromImage(img: HTMLImageElement) {
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        return null
    }
    return w / h
}

function autoAspectRatioFromVideo(video: HTMLVideoElement) {
    const w = video.videoWidth
    const h = video.videoHeight
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        return null
    }
    return w / h
}

function slideKind(slide: Slide): MediaKind {
    return slide.mediaType === "video" || (!!slide.video && !slide.image)
        ? "video"
        : "image"
}

function slideRatioKey(slide: Slide): string | undefined {
    return slideKind(slide) === "video"
        ? slide.video || slide.poster?.src
        : slide.image?.src
}

type ResolvedMotion = {
    launchMs: number
    arrivalMs: number
    growMs: number
    exitMs: number
}

const MOTION_PRESETS: Record<Exclude<MotionPreset, "custom">, ResolvedMotion> = {
    cut: { launchMs: 70, arrivalMs: 85, growMs: 260, exitMs: 220 },
    magnetic: { launchMs: 120, arrivalMs: 160, growMs: 420, exitMs: 340 },
    velvet: { launchMs: 180, arrivalMs: 280, growMs: 560, exitMs: 460 },
    dream: { launchMs: 260, arrivalMs: 480, growMs: 820, exitMs: 700 },
}

function resolveMotion(
    preset: MotionPreset,
    custom: ResolvedMotion
): ResolvedMotion {
    if (preset === "custom") {
        return {
            launchMs: clamp(custom.launchMs, 0, 1200),
            arrivalMs: clamp(custom.arrivalMs, 20, 2000),
            growMs: clamp(custom.growMs, 120, 2000),
            exitMs: clamp(custom.exitMs, 120, 2000),
        }
    }
    return MOTION_PRESETS[preset]
}

function paddingPixels(
    imageWidth: number,
    unit: PaddingUnit,
    top: number,
    right: number,
    bottom: number,
    left: number
) {
    const scale = unit === "percent" ? imageWidth / 100 : 1
    return {
        top: clamp(top * scale, 0, 10000),
        right: clamp(right * scale, 0, 10000),
        bottom: clamp(bottom * scale, 0, 10000),
        left: clamp(left * scale, 0, 10000),
    }
}

// ---------------------------------------------------------------------------
// Timeline: the whole film, precomputed
// ---------------------------------------------------------------------------

type Travel = {
    t0: number
    t1: number
    from: number
    to: number
    launchMs: number
    arrivalMs: number
}

type Act = {
    index: number
    grow0: number
    hold0: number
    shrink0: number
    shrink1: number
    scale: number
    finale: boolean
}

type Timeline = {
    travels: Travel[]
    acts: Act[]
    actByIndex: Record<number, Act>
    centers: number[]
    startPos: number
    end: number
    total: number
    finaleIdx: number
}

type TimingCfg = {
    leadInMs: number
    paceMs: number
    launchMs: number
    arrivalMs: number
    growMs: number
    exitMs: number
    holdMs: number
    finaleGrowMs: number
    finaleHoldMs: number
    heroSize: number
    finaleSize: number
    finaleEnabled: boolean
    loop: boolean
}

function buildReel(
    cardWs: number[],
    imgWs: number[],
    spotlightFlags: boolean[],
    mutedFlags: boolean[],
    gap: number,
    stageW: number,
    cfg: TimingCfg
): Timeline | null {
    const n = cardWs.length
    if (n < 1 || stageW < 10) return null

    const centers: number[] = []
    let cursor = 0
    for (let i = 0; i < n; i++) {
        centers.push(cursor + cardWs[i] / 2)
        cursor += cardWs[i] + gap
    }

    let finaleIdx = n - 1
    for (let i = n - 1; i >= 0; i--) {
        if (!mutedFlags[i]) {
            finaleIdx = i
            break
        }
    }

    const startPos =
        centers[0] - (stageW / 2 + cardWs[0] / 2 + stageW * 0.1 + 120)
    const strideAvg = Math.max(1, cursor / n)

    const heroes: number[] = []
    for (let i = 0; i < finaleIdx; i++) {
        if (spotlightFlags[i] && !mutedFlags[i]) heroes.push(i)
    }
    heroes.push(finaleIdx)

    const travels: Travel[] = []
    const acts: Act[] = []
    const actByIndex: Record<number, Act> = {}
    let t = Math.max(0, cfg.leadInMs)
    let pos = startPos

    for (const h of heroes) {
        const target = centers[h]
        const crossed = Math.max(1, (target - pos) / strideAvg)
        const minimumTravel = Math.max(
            240,
            cfg.launchMs + cfg.arrivalMs + 80
        )
        const travelDur = Math.max(minimumTravel, crossed * cfg.paceMs)
        travels.push({
            t0: t,
            t1: t + travelDur,
            from: pos,
            to: target,
            launchMs: cfg.launchMs,
            arrivalMs: cfg.arrivalMs,
        })
        t += travelDur
        pos = target

        const terminalWithoutFinale = h === finaleIdx && !cfg.finaleEnabled
        const finale = h === finaleIdx && cfg.finaleEnabled
        const growD = terminalWithoutFinale ? 120 : Math.max(120, finale ? cfg.finaleGrowMs : cfg.growMs)
        const holdD = terminalWithoutFinale ? 0 : Math.max(0, finale ? cfg.finaleHoldMs : cfg.holdMs)
        const pct = finale ? cfg.finaleSize : cfg.heroSize
        const scale = terminalWithoutFinale ? 1.02 : Math.max(
            1.02,
            (stageW * pct) / 100 / Math.max(1, imgWs[h])
        )
        const grow0 = t
        const hold0 = t + growD
        const shrink0 = t + growD + holdD
        const act: Act = {
            index: h,
            grow0,
            hold0,
            shrink0,
            shrink1: finale ? shrink0 : shrink0 + Math.max(120, cfg.exitMs),
            scale,
            finale,
        }
        acts.push(act)
        actByIndex[h] = act
        t += growD + holdD
    }

    const end = t
    const total = cfg.loop ? end + LOOP_FADE_MS : end
    return {
        travels,
        acts,
        actByIndex,
        centers,
        startPos,
        end,
        total,
        finaleIdx,
    }
}

/**
 * Distance travelled by a smooth trapezoidal velocity profile:
 * accelerate briefly, cruise at a stable speed, then brake only during
 * the requested Arrival window. Unlike one giant ease-in-out, this keeps
 * the middle of the river moving instead of beginning the slowdown halfway.
 */
function travelProgress(t: number, travel: Travel): number {
    const duration = Math.max(1, travel.t1 - travel.t0)
    const local = clamp(t - travel.t0, 0, duration)

    const requestedLaunch = clamp(travel.launchMs, 0, duration)
    const requestedArrival = clamp(travel.arrivalMs, 0, duration)
    const rampBudget = Math.max(0, duration - 40)
    const requestedRamps = requestedLaunch + requestedArrival
    const rampScale =
        requestedRamps > rampBudget && requestedRamps > 0
            ? rampBudget / requestedRamps
            : 1
    const launch = requestedLaunch * rampScale
    const arrival = requestedArrival * rampScale
    const cruiseEnd = duration - arrival
    const totalArea = Math.max(1, duration - (launch + arrival) / 2)

    let area: number
    if (launch > 0 && local < launch) {
        const u = local / launch
        // Integral of smoothstep(u): u³ − ½u⁴.
        area = launch * (u * u * u - 0.5 * u * u * u * u)
    } else if (local < cruiseEnd) {
        area = launch / 2 + (local - launch)
    } else if (arrival > 0) {
        const u = clamp01((local - cruiseEnd) / arrival)
        // Integral of 1 − smoothstep(u): u − u³ + ½u⁴.
        const arrivalArea = arrival * (u - u * u * u + 0.5 * u * u * u * u)
        area = launch / 2 + Math.max(0, cruiseEnd - launch) + arrivalArea
    } else {
        area = totalArea
    }

    return clamp01(area / totalArea)
}

function posAt(t: number, tl: Timeline): number {
    let pos = tl.startPos
    for (const tr of tl.travels) {
        if (t <= tr.t0) return pos
        if (t < tr.t1) {
            return lerp(tr.from, tr.to, travelProgress(t, tr))
        }
        pos = tr.to
    }
    return pos
}

function actScaleAt(t: number, act: Act): number {
    if (t <= act.grow0) return 1
    if (t < act.hold0) {
        const u = (t - act.grow0) / Math.max(1, act.hold0 - act.grow0)
        const e = act.finale ? easeOutCubic(u) : easeOutBack(u)
        return 1 + (act.scale - 1) * e
    }
    if (act.finale) return act.scale
    if (t < act.shrink0) {
        // A film hold is never frozen: a hair of creep while it rests.
        const hp = clamp01(
            (t - act.hold0) / Math.max(1, act.shrink0 - act.hold0)
        )
        return act.scale * (1 + 0.01 * hp)
    }
    if (t < act.shrink1) {
        const u = (t - act.shrink0) / Math.max(1, act.shrink1 - act.shrink0)
        return lerp(act.scale * 1.01, 1, easeInOutCubic(u))
    }
    return 1
}

/** 0→1→0 envelope of a spotlight act: how hard the rest of the room dims. */
function actEnvAt(t: number, act: Act): number {
    if (act.finale) return 0
    if (t <= act.grow0 || t >= act.shrink1) return 0
    if (t < act.hold0)
        return easeOutCubic(
            (t - act.grow0) / Math.max(1, act.hold0 - act.grow0)
        )
    if (t < act.shrink0) return 1
    return (
        1 -
        easeInOutCubic(
            (t - act.shrink0) / Math.max(1, act.shrink1 - act.shrink0)
        )
    )
}

// ---------------------------------------------------------------------------
// Pose: everything on screen at time t, from pure math
// ---------------------------------------------------------------------------

type CardPose = {
    x: number
    y: number
    z: number
    ry: number
    rz: number
    s: number
    o: number
    sat: number
    blur: number
    zi: number
    show: boolean
}

type FramePose = {
    cards: CardPose[]
    gridX: number
    gridY: number
    gridO: number
    vigO: number
    padK: number
}

type PoseCfg = {
    loop: boolean
    gap: number
    tilt: number
    swayK: number
    bump: number
    idleDim: number
    idleMute: number
    spotDim: number
    speedBlur: number
    vignette: number
    gridDrift: number
    fadeMs: number
    cardWs: number[]
    mutedFlags: boolean[]
    direction: number
}

function poseAt(
    tRaw: number,
    tl: Timeline,
    cfg: PoseCfg,
    W: number,
    H: number
): FramePose {
    const n = tl.centers.length
    const looped = cfg.loop
        ? ((tRaw % tl.total) + tl.total) % tl.total
        : Math.min(tRaw, tl.end)
    const t = Math.min(looped, tl.end)
    const loopU =
        cfg.loop && looped > tl.end ? (looped - tl.end) / LOOP_FADE_MS : 0
    const stripO = 1 - smooth(loopU)

    const finaleAct = tl.acts[tl.acts.length - 1]
    const growD = Math.max(1, finaleAct.hold0 - finaleAct.grow0)
    const stillRaw = smooth((t - finaleAct.grow0) / growD)
    const still = stillRaw * stripO
    const othersFade =
        smooth((t - finaleAct.grow0) / Math.max(1, cfg.fadeMs)) * stripO

    // The grid glides to rest as the finale sets, then wakes for the loop.
    const gridSpeed = cfg.gridDrift * 0.0009
    let effT: number
    if (t <= finaleAct.grow0) effT = t
    else
        effT =
            finaleAct.grow0 + growD * stillGlide((t - finaleAct.grow0) / growD)
    const phase = gridSpeed * effT
    const gridX = -phase * 0.62 * cfg.direction * (1 - smooth(loopU))
    const gridY = -phase * 0.36
    const gridO = 1 - still
    const vigO = (cfg.vignette / 100) * (1 - still)

    // Velocity of the strip, for lean and speed-blur. Deterministic.
    const v =
        Math.abs(
            posAt(Math.min(t, tl.end) + 6, tl) - posAt(Math.max(0, t - 6), tl)
        ) / 12
    const lean = -clamp(v * 1.6, 0, 7) * (1 - still)

    const T = posAt(t, tl)
    const ray = W * 0.55
    const cx = W / 2

    // First pass: raw distance, closeness, and scale for every card.
    const baseX: number[] = []
    const amount: number[] = []
    const scales: number[] = []
    let nearest = 0
    let nearestDist = Number.POSITIVE_INFINITY
    for (let i = 0; i < n; i++) {
        const bx = tl.centers[i] - T
        baseX.push(bx)
        const a = smooth(1 - Math.min(1, Math.abs(bx) / ray))
        amount.push(a)
        const act = tl.actByIndex[i]
        let s: number
        if (act) {
            const env = act.finale ? stillRaw : actEnvAt(t, act)
            s = actScaleAt(t, act) * (1 + (cfg.bump / 100) * a * (1 - env))
        } else {
            s = 1 + (cfg.bump / 100) * a
        }
        scales.push(s)
        const d = Math.abs(bx)
        if (d < nearestDist) {
            nearestDist = d
            nearest = i
        }
    }

    // Second pass: gap-true layout. Anchor the card nearest center, place
    // the rest outward with the gap held constant against every scale.
    const pos: number[] = new Array(n)
    pos[nearest] = baseX[nearest]
    for (let i = nearest + 1; i < n; i++) {
        pos[i] =
            pos[i - 1] +
            (cfg.cardWs[i - 1] * scales[i - 1] + cfg.cardWs[i] * scales[i]) /
                2 +
            cfg.gap
    }
    for (let i = nearest - 1; i >= 0; i--) {
        pos[i] =
            pos[i + 1] -
            (cfg.cardWs[i + 1] * scales[i + 1] + cfg.cardWs[i] * scales[i]) /
                2 -
            cfg.gap
    }

    // Which spotlight act is dimming the room right now?
    let env = 0
    let envIdx = -1
    for (const act of tl.acts) {
        if (act.finale) continue
        const e = actEnvAt(t, act)
        if (e > env) {
            env = e
            envIdx = act.index
        }
    }

    const cards: CardPose[] = []
    for (let i = 0; i < n; i++) {
        const a = amount[i]
        const act = tl.actByIndex[i]
        const lane = LANES[i % LANES.length]
        const calmK = (1 - a) * (1 - still) * cfg.swayK
        const side = baseX[i] < 0 ? -1 : 1

        let o = 1 - (cfg.idleDim / 100) * (1 - a)
        let sat = 1 - (cfg.idleMute / 100) * (1 - a)
        if (cfg.mutedFlags[i]) {
            o *= 0.55
            sat *= 0.45
        }
        // Everyone but the slide in the spotlight dims with the act.
        if (env > 0 && i !== envIdx) o *= 1 - (cfg.spotDim / 100) * env
        if (i !== tl.finaleIdx) o *= 1 - othersFade
        o *= stripO
        o = clamp01(o)

        let blur = 0
        const isCurrentAct = act ? t > act.grow0 && t < act.shrink1 : false
        if (!isCurrentAct && cfg.speedBlur > 0) {
            blur =
                clamp((v - 0.8) * 1.2, 0, cfg.speedBlur) *
                (1 - a * 0.75) *
                (1 - still)
            if (blur < 0.15) blur = 0
        }

        const x = pos[i]
        const s = scales[i]
        const halfVisual = (cfg.cardWs[i] * s) / 2
        const show = o > 0.008 && Math.abs(x) - halfVisual < cx + 60

        cards.push({
            x: x * cfg.direction,
            y: lane[0] * H * calmK,
            z: (-110 + a * 150) * (1 - still),
            ry: (-side * cfg.tilt * Math.pow(1 - a, 1.3) * (1 - still) + lean) * cfg.direction,
            rz: lane[1] * calmK * cfg.direction,
            s,
            o,
            sat,
            blur,
            zi:
                (i === tl.finaleIdx ? 2000 : 0) +
                (isCurrentAct ? 1000 : 0) +
                Math.round(a * 100),
            show,
        })
    }

    // Padding, radius, and shadow melt away with the finale's stillness.
    const padK = 1 - still

    return { cards, gridX, gridY, gridO, vigO, padK }
}

function cardTransform(p: CardPose) {
    return `translate(-50%, -50%) translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, ${p.z.toFixed(1)}px) rotateY(${p.ry.toFixed(2)}deg) rotateZ(${p.rz.toFixed(2)}deg) scale(${p.s.toFixed(4)})`
}

function cardFilter(p: CardPose) {
    const parts: string[] = []
    if (p.sat < 0.995) parts.push(`saturate(${p.sat.toFixed(3)})`)
    if (p.blur > 0) parts.push(`blur(${p.blur.toFixed(2)}px)`)
    return parts.length > 0 ? parts.join(" ") : "none"
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Cinematic opening reel: a film strip of slides whizzes in on a drifting
 * grid; spotlight slides pause center-stage and grow; the finale takes the
 * whole frame and everything else — grid, padding, motion — falls still.
 * Record the preview at 1920×1080 and match-cut into your video, or set
 * Mode to Loop and use it on the site. Click or press R to restart.
 * Scrub Canvas Pose to art-direct any frame.
 * @framerDisableUnlink
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 800
 * @framerIntrinsicHeight 450
 */
export default function OpeningReel(props: Props) {
    const {
        slides = DEFAULT_SLIDES,
        ratioMode = "auto",
        fixedRatio = "sixteenNine",
        customRatioWidth = 16,
        customRatioHeight = 9,
        imageFit = "contain",
        autoplayVideos = true,
        loopVideos = true,
        paddingUnit = "px",
        paddingTop = 6,
        paddingRight = 6,
        paddingBottom = 6,
        paddingLeft = 6,
        captionGap = 10,
        heroSize = 70,
        finaleSize = 100,
        finaleEnabled = true,
        centerBump = 5,
        tilt = 10,
        sway = 70,
        idleDim = 30,
        idleMute = 45,
        spotlightDim = 55,
        speedBlur = 3,
        startMode = "auto",
        playKind = "once",
        repeatCount = 3,
        direction = "forward",
        leadInMs = 800,
        paceMs = 230,
        motionPreset = "magnetic",
        launchMs = 120,
        arrivalMs = 160,
        growMs = 420,
        exitMs = 340,
        holdMs = 900,
        finaleGrowMs = 750,
        finaleHoldMs = 2600,
        fadeMs = 600,
        canvasPose = 62,
        theme = "dark",
        ground,
        paper,
        backgroundStyle = "solid",
        backgroundColor2 = "#4A2F2A",
        backgroundAngle = 145,
        backgroundTexture = 8,
        slideHeight = 44,
        gap = 30,
        cornerStyle = "squircle",
        cornerSmoothing = 60,
        radius = 16,
        shadow = 35,
        gridSize = 54,
        gridStrength = 7,
        gridDrift = 30,
        vignette = 12,
        showHint = true,
        style,
        onPlaybackStart,
        staticPose = false,
        canvasTimeMs,
        exportFrames,
    } = props

    const isStatic = useIsStaticRenderer()
    const isCanvas = RenderTarget.current() === RenderTarget.canvas
    const onCanvas = isStatic || isCanvas || staticPose

    const rootRef = React.useRef<HTMLDivElement | null>(null)
    const gridRef = React.useRef<HTMLDivElement | null>(null)
    const vigRef = React.useRef<HTMLDivElement | null>(null)
    const cardRefs = React.useRef<Array<HTMLDivElement | null>>([])
    const videoRefs = React.useRef<Array<HTMLVideoElement | null>>([])
    const videoActiveRef = React.useRef<boolean[]>([])
    const videoCycleRef = React.useRef(0)
    const videoPlaybackRef = React.useRef({ autoplay: true, enabled: true })
    const startRef = React.useRef(0)
    const kickRef = React.useRef<(() => void) | null>(null)
    const prevPadKRef = React.useRef(1)
    const padsRef = React.useRef<Array<ReturnType<typeof paddingPixels>>>([])
    const radiusPxRef = React.useRef(0)

    const [size, setSize] = React.useState({ w: 800, h: 450 })
    const [started, setStarted] = React.useState(false)
    const [reduced, setReduced] = React.useState(false)
    const [autoRatios, setAutoRatios] = React.useState<Record<string, number>>(
        {}
    )
    const [failedVideos, setFailedVideos] = React.useState<Record<string, boolean>>(
        {}
    )

    const items = slides.length > 0 ? slides : DEFAULT_SLIDES
    const loop = playKind !== "once"
    const radiusPx = clamp(radius, 0, 96)
    const gapPx = clamp(gap, 0, 320)
    const resolvedMotion = React.useMemo(
        () =>
            resolveMotion(motionPreset, {
                launchMs,
                arrivalMs,
                growMs,
                exitMs,
            }),
        [motionPreset, launchMs, arrivalMs, growMs, exitMs]
    )

    // --- Geometry: one shared media height, widths from each ratio -----------
    const fallbackRatio = presetRatio(
        fixedRatio,
        customRatioWidth,
        customRatioHeight
    )

    const rememberRatio = React.useCallback(
        (src: string | undefined, next: number | null) => {
            if (ratioMode !== "auto" || !src || !next) return
            setAutoRatios((prev) => {
                if (Math.abs((prev[src] ?? 0) - next) < 0.001) return prev
                return { ...prev, [src]: next }
            })
        },
        [ratioMode]
    )

    const rememberImageRatio = React.useCallback(
        (src: string | undefined, img: HTMLImageElement) => {
            rememberRatio(src, autoAspectRatioFromImage(img))
        },
        [rememberRatio]
    )

    const rememberVideoRatio = React.useCallback(
        (src: string | undefined, video: HTMLVideoElement) => {
            rememberRatio(src, autoAspectRatioFromVideo(video))
        },
        [rememberRatio]
    )

    const ratios = React.useMemo(
        () =>
            items.map((slide) => {
                const rw = slide.ratioW ?? 0
                const rh = slide.ratioH ?? 0
                if (rw > 0 && rh > 0) return rw / rh
                const key = slideRatioKey(slide)
                if (ratioMode === "auto" && key && autoRatios[key])
                    return autoRatios[key]
                return fallbackRatio
            }),
        [items, ratioMode, autoRatios, fallbackRatio]
    )

    const imgH = Math.max(40, (size.h * clamp(slideHeight, 15, 100)) / 100)
    const imgWs = React.useMemo(
        () => ratios.map((r) => imgH * r),
        [ratios, imgH]
    )
    const pads = React.useMemo(
        () =>
            imgWs.map((w) =>
                paddingPixels(
                    w,
                    paddingUnit,
                    paddingTop,
                    paddingRight,
                    paddingBottom,
                    paddingLeft
                )
            ),
        [
            imgWs,
            paddingUnit,
            paddingTop,
            paddingRight,
            paddingBottom,
            paddingLeft,
        ]
    )
    const cardWs = React.useMemo(
        () => imgWs.map((w, i) => w + pads[i].left + pads[i].right),
        [imgWs, pads]
    )
    const mutedFlags = React.useMemo(() => items.map((s) => !!s.muted), [items])
    const spotFlags = React.useMemo(
        () => items.map((s) => !!s.spotlight),
        [items]
    )

    const timeline = React.useMemo(
        () =>
            buildReel(cardWs, imgWs, spotFlags, mutedFlags, gapPx, size.w, {
                leadInMs,
                paceMs: clamp(paceMs, 60, 5000),
                launchMs: resolvedMotion.launchMs,
                arrivalMs: resolvedMotion.arrivalMs,
                growMs: resolvedMotion.growMs,
                exitMs: resolvedMotion.exitMs,
                holdMs,
                finaleGrowMs,
                finaleHoldMs,
                heroSize: clamp(heroSize, 25, 96),
                finaleSize: clamp(finaleSize, 30, 100),
                finaleEnabled,
                loop,
            }),
        [
            cardWs,
            imgWs,
            spotFlags,
            mutedFlags,
            gapPx,
            size.w,
            leadInMs,
            paceMs,
            resolvedMotion,
            holdMs,
            finaleGrowMs,
            finaleHoldMs,
            heroSize,
            finaleSize,
            finaleEnabled,
            loop,
        ]
    )

    const poseCfg: PoseCfg = React.useMemo(
        () => ({
            loop,
            gap: gapPx,
            tilt: clamp(tilt, 0, 45),
            swayK: clamp(sway, 0, 200) / 100,
            bump: clamp(centerBump, 0, 30),
            idleDim: clamp(idleDim, 0, 85),
            idleMute: clamp(idleMute, 0, 100),
            spotDim: clamp(spotlightDim, 0, 92),
            speedBlur: clamp(speedBlur, 0, 20),
            vignette: clamp(vignette, 0, 45),
            gridDrift: clamp(gridDrift, 0, 100),
            fadeMs: Math.max(120, fadeMs),
            cardWs,
            mutedFlags,
            direction: direction === "reverse" ? -1 : 1,
        }),
        [
            loop,
            gapPx,
            tilt,
            sway,
            centerBump,
            idleDim,
            idleMute,
            spotlightDim,
            speedBlur,
            vignette,
            gridDrift,
            fadeMs,
            cardWs,
            mutedFlags,
            direction,
        ]
    )

    const tlRef = React.useRef(timeline)
    const poseCfgRef = React.useRef(poseCfg)
    const sizeRef = React.useRef(size)
    const imgWsRef = React.useRef(imgWs)

    // --- Measure the frame ---------------------------------------------------
    React.useEffect(() => {
        const node = rootRef.current
        if (!node || typeof ResizeObserver === "undefined") return
        const ro = new ResizeObserver(([entry]) => {
            const w = Math.round(entry.contentRect.width)
            const h = Math.round(entry.contentRect.height)
            if (w < 10 || h < 10) return
            setSize((prev) =>
                Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1
                    ? prev
                    : { w, h }
            )
        })
        ro.observe(node)
        return () => ro.disconnect()
    }, [])

    // --- Reduced motion -------------------------------------------------------
    React.useEffect(() => {
        if (
            onCanvas ||
            typeof window === "undefined" ||
            typeof window.matchMedia !== "function"
        )
            return
        const media = window.matchMedia("(prefers-reduced-motion: reduce)")
        const update = () => setReduced(media.matches)
        update()
        if (typeof media.addEventListener === "function") {
            media.addEventListener("change", update)
            return () => media.removeEventListener("change", update)
        }
        media.addListener(update)
        return () => media.removeListener(update)
    }, [onCanvas])

    // --- Preload media, learn ratios, then roll -----------------------------
    React.useEffect(() => {
        if (onCanvas || typeof window === "undefined") return
        let alive = true

        type Job = {
            kind: MediaKind
            src: string
            posterSrc?: string
        }
        const jobs: Job[] = []
        items.forEach((slide) => {
            if (slideKind(slide) === "video") {
                if (slide.video) {
                    jobs.push({
                        kind: "video",
                        src: slide.video,
                        posterSrc: slide.poster?.src,
                    })
                } else if (slide.poster?.src) {
                    jobs.push({ kind: "image", src: slide.poster.src })
                }
            } else if (slide.image?.src) {
                jobs.push({ kind: "image", src: slide.image.src })
            }
        })

        let begun = false
        const begin = () => {
            if (!alive || begun) return
            begun = true
            if (startMode === "auto") {
                startRef.current = performance.now()
                setStarted(true)
                onPlaybackStart?.()
            }
        }

        if (jobs.length === 0) {
            begin()
            return () => {
                alive = false
            }
        }

        const cap = window.setTimeout(begin, 3000)
        let done = 0
        const learned: Record<string, number> = {}
        const preloadVideos: HTMLVideoElement[] = []

        const learnImage = (src: string, key = src, onDone: () => void) => {
            const img = new Image()
            let settled = false
            const settle = () => {
                if (settled) return
                settled = true
                onDone()
            }
            img.onload = () => {
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    learned[key] = img.naturalWidth / img.naturalHeight
                }
                settle()
            }
            img.onerror = settle
            img.src = src
        }

        jobs.forEach((job) => {
            let settled = false
            const settleJob = () => {
                if (settled) return
                settled = true
                finish()
            }

            if (job.kind === "image") {
                learnImage(job.src, job.src, settleJob)
                return
            }

            const video = document.createElement("video")
            preloadVideos.push(video)
            video.preload = "metadata"
            video.muted = true
            video.playsInline = true
            video.onloadedmetadata = () => {
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                    learned[job.src] = video.videoWidth / video.videoHeight
                    settleJob()
                } else if (job.posterSrc) {
                    learnImage(job.posterSrc, job.src, settleJob)
                } else {
                    settleJob()
                }
            }
            video.onerror = () => {
                if (job.posterSrc) learnImage(job.posterSrc, job.src, settleJob)
                else settleJob()
            }
            video.src = job.src
            video.load()
        })

        function finish() {
            done += 1
            if (done < jobs.length || !alive) return
            window.clearTimeout(cap)
            setAutoRatios((prev) => {
                let changed = false
                for (const key of Object.keys(learned)) {
                    if (Math.abs((prev[key] ?? 0) - learned[key]) > 0.001) {
                        changed = true
                        break
                    }
                }
                return changed ? { ...prev, ...learned } : prev
            })
            begin()
        }
        return () => {
            alive = false
            window.clearTimeout(cap)
            preloadVideos.forEach((video) => {
                video.removeAttribute("src")
                video.load()
            })
        }
        // items identity changes on slide/media edits; startMode flips restart it.
    }, [onCanvas, items, startMode, onPlaybackStart])

    const pauseVideos = React.useCallback(() => {
        videoRefs.current.forEach((video) => video?.pause())
    }, [])

    const deactivateVideos = React.useCallback(() => {
        videoRefs.current.forEach((video) => video?.pause())
        videoActiveRef.current = []
    }, [])

    const restartVideos = React.useCallback(() => {
        videoCycleRef.current = 0
        videoActiveRef.current = []
        videoRefs.current.forEach((video) => {
            if (!video) return
            video.pause()
            try {
                video.currentTime = 0
            } catch {
                // Metadata may not have loaded yet.
            }
        })
    }, [])

    React.useEffect(() => {
        videoPlaybackRef.current = {
            autoplay: autoplayVideos,
            enabled: !onCanvas && !reduced && started,
        }
        if (!autoplayVideos || onCanvas || reduced || !started) {
            deactivateVideos()
        } else {
            kickRef.current?.()
        }
    }, [autoplayVideos, onCanvas, reduced, started, deactivateVideos])

    // --- The one clock ---------------------------------------------------------
    const write = React.useCallback((tMs: number) => {
        const tl = tlRef.current
        if (!tl) return
        const { w, h } = sizeRef.current
        const pose = poseAt(tMs, tl, poseCfgRef.current, w, h)

        if (poseCfgRef.current.loop && tl.total > 0) {
            const cycle = Math.floor(Math.max(0, tMs) / tl.total)
            if (cycle !== videoCycleRef.current) {
                videoCycleRef.current = cycle
                videoActiveRef.current = []
                videoRefs.current.forEach((video) => {
                    if (!video) return
                    video.pause()
                    try {
                        video.currentTime = 0
                    } catch {
                        // Metadata may not have loaded yet.
                    }
                })
            }
        }

        pose.cards.forEach((cp, i) => {
            const el = cardRefs.current[i]
            if (el) {
                el.style.transform = cardTransform(cp)
                el.style.opacity = cp.o.toFixed(3)
                el.style.visibility = cp.show ? "visible" : "hidden"
                el.style.filter = cardFilter(cp)
                el.style.zIndex = String(cp.zi)
            }

            const video = videoRefs.current[i]
            if (!video) return
            const playback = videoPlaybackRef.current
            const shouldPlay =
                playback.autoplay &&
                playback.enabled
            const wasActive = !!videoActiveRef.current[i]

            if (shouldPlay) {
                if (!wasActive) {
                    videoActiveRef.current[i] = true
                }
                if (video.paused) {
                    video.muted = true
                    const attempt = video.play()
                    attempt?.catch?.(() => {
                        // Muted autoplay is normally allowed; poster is fallback.
                    })
                }
            } else {
                videoActiveRef.current[i] = false
                if (!video.paused) video.pause()
            }
        })

        const grid = gridRef.current
        if (grid) {
            grid.style.backgroundPosition = `${pose.gridX.toFixed(1)}px ${pose.gridY.toFixed(1)}px`
            grid.style.opacity = pose.gridO.toFixed(3)
        }
        const vig = vigRef.current
        if (vig) vig.style.opacity = pose.vigO.toFixed(3)

        // The finale sheds its paper: padding, radius, shadow → nothing.
        const padK = pose.padK
        if (padK < 0.999 || prevPadKRef.current < 0.999) {
            const fEl = cardRefs.current[tl.finaleIdx]
            const basePad = padsRef.current[tl.finaleIdx]
            if (fEl && basePad) {
                const top = basePad.top * padK
                const right = basePad.right * padK
                const bottom = basePad.bottom * padK
                const left = basePad.left * padK
                fEl.style.padding = `${top.toFixed(2)}px ${right.toFixed(2)}px ${bottom.toFixed(2)}px ${left.toFixed(2)}px`
                fEl.style.width = `${(imgWsRef.current[tl.finaleIdx] + left + right).toFixed(2)}px`
                fEl.style.borderRadius = `${(radiusPxRef.current * padK).toFixed(2)}px`
                fEl.style.setProperty("--orl-shk", padK.toFixed(3))
                const frame = fEl.firstElementChild as HTMLElement | null
                if (frame) {
                    frame.style.borderRadius = `${Math.max(0, radiusPxRef.current * padK - 2).toFixed(2)}px`
                }
            }
        }
        prevPadKRef.current = padK
    }, [])

    React.useEffect(() => {
        tlRef.current = timeline
        poseCfgRef.current = poseCfg
        sizeRef.current = size
        imgWsRef.current = imgWs
        padsRef.current = pads
        radiusPxRef.current = radiusPx
        // Wake the loop so a resize or prop tweak repaints even when frozen.
        kickRef.current?.()
    }, [timeline, poseCfg, size, imgWs, pads, radiusPx])

    React.useEffect(() => {
        if (onCanvas || reduced || !started || typeof window === "undefined")
            return
        let alive = true
        let raf = 0
        let pausedAt: number | null = null
        let hidden = false
        let offscreen = false

        const tick = (now: number) => {
            if (!alive) return
            const tl = tlRef.current
            const t = now - startRef.current
            if (playKind === "repeat" && tl && t >= tl.total * (clamp(Math.round(repeatCount), 2, 20) - 1) + tl.end) {
                write(tl.end)
                return
            }
            write(t)
            if (!loop && tl && t > tl.end + 80) return // finale holds; frame frozen
            raf = window.requestAnimationFrame(tick)
        }
        const kick = () => {
            if (!alive || pausedAt != null) return
            window.cancelAnimationFrame(raf)
            raf = window.requestAnimationFrame(tick)
        }
        kickRef.current = kick

        const pause = () => {
            if (pausedAt == null) pausedAt = performance.now()
            window.cancelAnimationFrame(raf)
            pauseVideos()
        }
        const resume = () => {
            if (pausedAt != null) {
                startRef.current += performance.now() - pausedAt
                pausedAt = null
            }
            kick()
        }
        const sync = () => {
            if (hidden || offscreen) pause()
            else resume()
        }

        const onVis = () => {
            hidden = document.visibilityState === "hidden"
            sync()
        }
        document.addEventListener("visibilitychange", onVis)

        let io: IntersectionObserver | null = null
        if (typeof IntersectionObserver !== "undefined" && rootRef.current) {
            io = new IntersectionObserver(([entry]) => {
                offscreen = !entry.isIntersecting
                sync()
            })
            io.observe(rootRef.current)
        }

        kick()
        return () => {
            alive = false
            kickRef.current = null
            window.cancelAnimationFrame(raf)
            document.removeEventListener("visibilitychange", onVis)
            io?.disconnect()
        }
    }, [
        onCanvas,
        reduced,
        started,
        loop,
        playKind,
        repeatCount,
        write,
        pauseVideos,
    ])

    // --- Restart: click, or R — take after take --------------------------------
    const restart = React.useCallback(() => {
        startRef.current =
            typeof performance !== "undefined" ? performance.now() : 0
        // Force one restorative write of the finale card's melted padding.
        prevPadKRef.current = 0
        restartVideos()
        onPlaybackStart?.()
        if (!started) setStarted(true)
        else kickRef.current?.()
    }, [started, restartVideos, onPlaybackStart])

    React.useEffect(() => {
        if (onCanvas || typeof window === "undefined") return
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "r" && e.key !== "R") return
            const el = e.target as HTMLElement | null
            if (
                el &&
                (el.tagName === "INPUT" ||
                    el.tagName === "TEXTAREA" ||
                    el.isContentEditable)
            ) {
                return
            }
            restart()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onCanvas, restart])

    // --- Colors and shared vars -------------------------------------------------
    const groundOverride = ground != null ? tok(ground, "") : ""
    const paperOverride = paper != null ? tok(paper, "") : ""
    const backgroundColor2Value = tok(backgroundColor2, "#4A2F2A")

    const rootVars: CSSVars = {
        "--orl-cell": `${clamp(gridSize, 12, 200)}px`,
        "--orl-grid-a": clamp(gridStrength, 0, 30),
        "--orl-sha": clamp(shadow, 0, 100),
        "--orl-r": `${radiusPx}px`,
        "--orl-corner": cornerStyle === "squircle" ? `superellipse(${1 + clamp(cornerSmoothing, 0, 100) / 60})` : "round",
        "--orl-fit": imageFit,
        "--orl-ground-2": backgroundColor2Value,
        "--orl-bg-angle": `${clamp(backgroundAngle, 0, 360)}deg`,
        "--orl-texture-a": clamp(backgroundTexture, 0, 40) / 100,
    }
    if (groundOverride) rootVars["--orl-ground"] = groundOverride
    if (paperOverride) rootVars["--orl-paper"] = paperOverride

    // --- Scene ---------------------------------------------------------------
    const renderScene = (pose: FramePose, live: boolean) => (
        <div className="orl-stage" aria-hidden="true">
            {items.map((slide, i) => {
                const cp = pose.cards[i]
                const kind = slideKind(slide)
                const imageSrc = slide.image?.src
                const videoSrc = slide.video
                const posterSrc = slide.poster?.src
                const videoFailed = !!(videoSrc && failedVideos[videoSrc])
                const wImg = imgWs[i]
                const cardPad = pads[i]

                const placeholder = (
                    <div className="orl-ph">
                        <span className="orl-ph-k">
                            {kind === "video" ? "video" : "scene"}
                        </span>
                        <span className="orl-ph-n">
                            {String(i + 1).padStart(2, "0")}
                        </span>
                    </div>
                )

                let media: React.ReactNode = placeholder
                if (kind === "video") {
                    if (staticPose && exportFrames?.[i]) {
                        media = <img className="orl-media orl-export-frame" src={exportFrames[i]} alt="" draggable={false} />
                    } else if (videoFailed || !videoSrc) {
                        if (posterSrc) {
                            media = (
                                <img
                                    className="orl-media"
                                    src={posterSrc}
                                    srcSet={slide.poster?.srcSet}
                                    sizes={`${Math.round(wImg)}px`}
                                    alt=""
                                    loading="eager"
                                    decoding="async"
                                    draggable={false}
                                    onLoad={(event) =>
                                        rememberRatio(
                                            videoSrc || posterSrc,
                                            autoAspectRatioFromImage(
                                                event.currentTarget
                                            )
                                        )
                                    }
                                />
                            )
                        }
                    } else {
                        media = (
                            <video
                                data-orl-video-index={i}
                                ref={
                                    live
                                        ? (el) => {
                                              videoRefs.current[i] = el
                                          }
                                        : undefined
                                }
                                className="orl-media"
                                src={videoSrc}
                                poster={posterSrc}
                                muted
                                playsInline
                                autoPlay={false}
                                loop={loopVideos}
                                preload="auto"
                                disablePictureInPicture
                                onLoadedMetadata={(event) =>
                                    rememberVideoRatio(
                                        videoSrc,
                                        event.currentTarget
                                    )
                                }
                                onError={() =>
                                    setFailedVideos((prev) =>
                                        prev[videoSrc]
                                            ? prev
                                            : { ...prev, [videoSrc]: true }
                                    )
                                }
                            />
                        )
                    }
                } else if (imageSrc) {
                    media = (
                        <img
                            className="orl-media"
                            src={imageSrc}
                            srcSet={slide.image?.srcSet}
                            sizes={`${Math.round(wImg)}px`}
                            alt=""
                            loading="eager"
                            decoding="async"
                            draggable={false}
                            onLoad={(event) =>
                                rememberImageRatio(
                                    imageSrc,
                                    event.currentTarget
                                )
                            }
                        />
                    )
                }

                return (
                    <div
                        data-orl-index={i}
                        key={i}
                        ref={
                            live
                                ? (el) => {
                                      cardRefs.current[i] = el
                                  }
                                : undefined
                        }
                        className="orl-card"
                        style={{
                            width: `${(wImg + cardPad.left + cardPad.right).toFixed(1)}px`,
                            padding: `${cardPad.top}px ${cardPad.right}px ${cardPad.bottom}px ${cardPad.left}px`,
                            transform: cardTransform(cp),
                            opacity: cp.o,
                            visibility: cp.show ? "visible" : "hidden",
                            filter: cardFilter(cp),
                            zIndex: cp.zi,
                        }}
                    >
                        <div
                            className="orl-frame"
                            style={{
                                width: `${wImg.toFixed(1)}px`,
                                aspectRatio: `${ratios[i]}`,
                            }}
                        >
                            {media}
                        </div>
                        {slide.caption ? <div className="orl-caption" style={{ marginTop: `${captionGap}px`, opacity: i === timeline?.finaleIdx ? pose.padK : 1 }}>{slide.caption}</div> : null}
                    </div>
                )
            })}
        </div>
    )

    const emptyPose: FramePose = {
        cards: items.map(() => ({
            x: 0,
            y: 0,
            z: 0,
            ry: 0,
            rz: 0,
            s: 1,
            o: 0,
            sat: 1,
            blur: 0,
            zi: 0,
            show: false,
        })),
        gridX: 0,
        gridY: 0,
        gridO: 1,
        vigO: clamp(vignette, 0, 45) / 100,
        padK: 1,
    }

    let pose: FramePose = emptyPose
    if (timeline) {
        if (onCanvas) {
            pose = poseAt(
                typeof canvasTimeMs === "number" ? canvasTimeMs : (clamp(canvasPose, 0, 100) / 100) * timeline.end,
                timeline,
                poseCfg,
                size.w,
                size.h
            )
        } else if (reduced) {
            pose = poseAt(timeline.end, timeline, poseCfg, size.w, size.h)
        } else {
            pose = poseAt(0, timeline, poseCfg, size.w, size.h)
        }
    }

    const hintVisible =
        !onCanvas && !started && !reduced && startMode === "click" && showHint

    return (
        <div
            ref={rootRef}
            className="orl-root"
            data-orl-theme={theme}
            data-orl-background={backgroundStyle}
            style={{ ...rootVars, ...style }}
            role="presentation"
            onPointerDown={onCanvas ? undefined : restart}
        >
            <style>{COMPONENT_CSS}</style>
            <div className="orl-texture" aria-hidden="true" />
            <div
                ref={onCanvas ? undefined : gridRef}
                className="orl-grid"
                aria-hidden="true"
                style={{
                    backgroundPosition: `${pose.gridX.toFixed(1)}px ${pose.gridY.toFixed(1)}px`,
                    opacity: pose.gridO,
                }}
            />
            {renderScene(pose, !onCanvas)}
            <div
                ref={onCanvas ? undefined : vigRef}
                className="orl-vig"
                aria-hidden="true"
                style={{ opacity: pose.vigO }}
            />
            {hintVisible ? (
                <span className="orl-hint">click to roll · r restarts</span>
            ) : null}
            {isCanvas ? (
                <span className="orl-hint orl-tag">
                    opening reel — scrub canvas pose
                </span>
            ) : null}
        </div>
    )
}

OpeningReel.displayName = "Opening Reel"

// ---------------------------------------------------------------------------
// Property controls, paged so the panel stays humane
// ---------------------------------------------------------------------------

const onPage =
    (...pages: PanelPage[]) =>
    (props: Partial<Props>) => {
        const active = props.panel ?? "Slides"
        return active !== "All" && !pages.includes(active)
    }

addPropertyControls(OpeningReel, {
    panel: {
        type: ControlType.Enum,
        title: "Edit",
        options: ["Slides", "Frame", "Story", "Timing", "Look", "All"],
        defaultValue: "Slides",
    },

    // ---- Slides -------------------------------------------------------
    slides: {
        type: ControlType.Array,
        title: "Slides",
        maxCount: 24,
        control: {
            type: ControlType.Object,
            controls: {
                mediaType: {
                    type: ControlType.Enum,
                    title: "Media",
                    options: ["image", "video"],
                    optionTitles: ["Image / GIF", "MP4 / WebM"],
                    defaultValue: "image",
                    displaySegmentedControl: true,
                },
                image: {
                    type: ControlType.ResponsiveImage,
                    title: "Image",
                    hidden: (p: Partial<Slide>) => p.mediaType === "video",
                },
                video: {
                    type: ControlType.File,
                    title: "Video",
                    allowedFileTypes: ["mp4", "webm"],
                    hidden: (p: Partial<Slide>) => p.mediaType !== "video",
                },
                poster: {
                    type: ControlType.ResponsiveImage,
                    title: "Poster / Fallback",
                    hidden: (p: Partial<Slide>) => p.mediaType !== "video",
                },
                spotlight: {
                    type: ControlType.Boolean,
                    title: "Spotlight",
                    defaultValue: false,
                },
                muted: {
                    type: ControlType.Boolean,
                    title: "Skip Beat",
                    defaultValue: false,
                },
                caption: {
                    type: ControlType.String,
                    title: "Caption",
                    placeholder: "Optional line beneath frame",
                    maxLength: 120,
                },
                ratioW: {
                    type: ControlType.Number,
                    title: "Ratio W",
                    min: 0,
                    max: 10000,
                    step: 1,
                    defaultValue: 0,
                    displayStepper: true,
                },
                ratioH: {
                    type: ControlType.Number,
                    title: "Ratio H",
                    min: 0,
                    max: 10000,
                    step: 1,
                    defaultValue: 0,
                    displayStepper: true,
                },
            },
        },
        description:
            "Use images, GIFs, MP4s, or WebMs. A video poster appears before playback and becomes the fallback if the file cannot play. Spotlight = a show-off beat. Skip Beat keeps a slide visible but removes its story moment. The last included beat is the finale. Ratio 0 / 0 inherits the global ratio.",
        hidden: onPage("Slides"),
    },
    ratioMode: {
        type: ControlType.Enum,
        title: "Ratio",
        options: ["auto", "fixed"],
        optionTitles: ["Auto from image", "Fixed"],
        defaultValue: "auto",
        hidden: onPage("Frame"),
    },
    fixedRatio: {
        type: ControlType.Enum,
        title: "Fixed Ratio",
        options: ["sixteenNine", "wide2576", "custom"],
        optionTitles: ["16:9 / 1920×1080", "2576×1080", "Custom"],
        defaultValue: "sixteenNine",
        hidden: (p: Partial<Props>) =>
            onPage("Frame")(p) || p.ratioMode !== "fixed",
    },
    customRatioWidth: {
        type: ControlType.Number,
        title: "Ratio W",
        min: 1,
        max: 10000,
        step: 1,
        defaultValue: 16,
        displayStepper: true,
        hidden: (p: Partial<Props>) =>
            onPage("Frame")(p) ||
            p.ratioMode !== "fixed" ||
            p.fixedRatio !== "custom",
    },
    customRatioHeight: {
        type: ControlType.Number,
        title: "Ratio H",
        min: 1,
        max: 10000,
        step: 1,
        defaultValue: 9,
        displayStepper: true,
        hidden: (p: Partial<Props>) =>
            onPage("Frame")(p) ||
            p.ratioMode !== "fixed" ||
            p.fixedRatio !== "custom",
    },
    imageFit: {
        type: ControlType.Enum,
        title: "Media Fit",
        options: ["contain", "cover"],
        optionTitles: ["Contain", "Cover"],
        defaultValue: "contain",
        displaySegmentedControl: true,
        hidden: onPage("Frame"),
    },
    autoplayVideos: {
        type: ControlType.Boolean,
        title: "Video Autoplay",
        enabledTitle: "On",
        disabledTitle: "Off",
        defaultValue: true,
        description:
            "Videos are always silent. Off leaves each video on its poster or first frame.",
        hidden: onPage("Slides", "Frame"),
    },
    loopVideos: {
        type: ControlType.Boolean,
        title: "Video Loop",
        enabledTitle: "Loop",
        disabledTitle: "Once",
        defaultValue: true,
        description: "Useful when a video clip is shorter than the reel.",
        hidden: onPage("Slides", "Frame"),
    },
    paddingUnit: {
        type: ControlType.Enum,
        title: "Pad Unit",
        options: ["px", "percent"],
        optionTitles: ["px", "% of image width"],
        defaultValue: "px",
        description: "Percentage padding uses the inner image width.",
        hidden: onPage("Frame"),
    },
    paddingTop: {
        type: ControlType.Number,
        title: "Pad Top",
        min: 0,
        max: 120,
        step: 1,
        defaultValue: 6,
        hidden: onPage("Frame"),
    },
    paddingRight: {
        type: ControlType.Number,
        title: "Pad Right",
        min: 0,
        max: 120,
        step: 1,
        defaultValue: 6,
        hidden: onPage("Frame"),
    },
    paddingBottom: {
        type: ControlType.Number,
        title: "Pad Bottom",
        min: 0,
        max: 120,
        step: 1,
        defaultValue: 6,
        hidden: onPage("Frame"),
    },
    paddingLeft: {
        type: ControlType.Number,
        title: "Pad Left",
        min: 0,
        max: 120,
        step: 1,
        defaultValue: 6,
        hidden: onPage("Frame"),
    },
    captionGap: {
        type: ControlType.Number,
        title: "Caption Gap",
        min: 0,
        max: 80,
        step: 1,
        unit: "px",
        defaultValue: 10,
        hidden: onPage("Frame"),
    },

    // ---- Story ----------------------------------------------------------
    heroSize: {
        type: ControlType.Number,
        title: "Spotlight Size",
        min: 25,
        max: 96,
        step: 1,
        unit: "%",
        defaultValue: 70,
        description:
            "Image width during a spotlight act, as a share of the stage.",
        hidden: onPage("Story"),
    },
    finaleSize: {
        type: ControlType.Number,
        title: "Finale Size",
        min: 30,
        max: 100,
        step: 1,
        unit: "%",
        defaultValue: 100,
        description: "100% on a 16:9 finale = a perfect full-bleed match cut.",
        hidden: onPage("Story"),
    },
    centerBump: {
        type: ControlType.Number,
        title: "Center Swell",
        min: 0,
        max: 30,
        step: 0.5,
        unit: "%",
        defaultValue: 5,
        description: "Every slide grows this much as it crosses center.",
        hidden: onPage("Story"),
    },
    tilt: {
        type: ControlType.Number,
        title: "Tilt",
        min: 0,
        max: 45,
        step: 1,
        unit: "°",
        defaultValue: 10,
        description: "3D turn of off-center slides. The corridor feel.",
        hidden: onPage("Story"),
    },
    sway: {
        type: ControlType.Number,
        title: "Sway",
        min: 0,
        max: 200,
        step: 1,
        unit: "%",
        defaultValue: 70,
        description:
            "Hand-set vertical drift and lean per slide. 0 = machine-straight.",
        hidden: onPage("Story"),
    },
    idleDim: {
        type: ControlType.Number,
        title: "Idle Dim",
        min: 0,
        max: 85,
        step: 1,
        unit: "%",
        defaultValue: 30,
        description: "How much off-center slides fade.",
        hidden: onPage("Story"),
    },
    idleMute: {
        type: ControlType.Number,
        title: "Idle Mute",
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        defaultValue: 45,
        description: "How much off-center slides desaturate.",
        hidden: onPage("Story"),
    },
    spotlightDim: {
        type: ControlType.Number,
        title: "Spotlight Dim",
        min: 0,
        max: 92,
        step: 1,
        unit: "%",
        defaultValue: 55,
        description: "How hard the room dims while someone's in the spotlight.",
        hidden: onPage("Story"),
    },
    speedBlur: {
        type: ControlType.Number,
        title: "Speed Blur",
        min: 0,
        max: 20,
        step: 0.5,
        unit: "px",
        defaultValue: 3,
        description: "Fake motion blur when the river runs fast. 0 = crisp.",
        hidden: onPage("Story"),
    },

    // ---- Timing ---------------------------------------------------------
    startMode: {
        type: ControlType.Enum,
        title: "Starts",
        options: ["auto", "click"],
        optionTitles: ["On Load", "On Click"],
        defaultValue: "auto",
        displaySegmentedControl: true,
        description:
            "On Click is best for recording: start capture, click, hands off.",
        hidden: onPage("Timing"),
    },
    playKind: {
        type: ControlType.Enum,
        title: "Mode",
        options: ["once", "repeat", "loop"],
        optionTitles: ["Once", "Loop ×", "Forever"],
        defaultValue: "once",
        displaySegmentedControl: true,
        description:
            "Once holds the finale. Loop × repeats a set count. Forever keeps rolling.",
        hidden: onPage("Timing"),
    },
    repeatCount: {
        type: ControlType.Number,
        title: "Loop Count",
        min: 2,
        max: 20,
        step: 1,
        defaultValue: 3,
        displayStepper: true,
        hidden: (p: Partial<Props>) => onPage("Timing")(p) || p.playKind !== "repeat",
    },
    direction: {
        type: ControlType.Enum,
        title: "Direction",
        options: ["forward", "reverse"],
        optionTitles: ["Right → Left", "Left → Right"],
        defaultValue: "forward",
        displaySegmentedControl: true,
        hidden: onPage("Timing"),
    },
    leadInMs: {
        type: ControlType.Number,
        title: "Lead-In",
        min: 0,
        max: 4000,
        step: 50,
        unit: "ms",
        defaultValue: 800,
        description: "Quiet grid before the strip arrives.",
        hidden: onPage("Timing"),
    },
    paceMs: {
        type: ControlType.Number,
        title: "River Pace",
        min: 60,
        max: 5000,
        step: 25,
        unit: "ms",
        defaultValue: 230,
        description: "Time per slide crossed. Lower = a faster river.",
        hidden: onPage("Timing"),
    },
    motionPreset: {
        type: ControlType.Enum,
        title: "Motion Feel",
        options: ["cut", "magnetic", "velvet", "dream", "custom"],
        optionTitles: ["Cut", "Magnetic", "Velvet", "Dream", "Custom"],
        defaultValue: "magnetic",
        description:
            "Cut catches hard. Magnetic is quick and natural. Velvet is cinematic. Dream floats. Choose Custom to expose every phase.",
        hidden: onPage("Timing"),
    },
    launchMs: {
        type: ControlType.Number,
        title: "Launch",
        min: 0,
        max: 1200,
        step: 10,
        unit: "ms",
        defaultValue: 120,
        description: "Brief acceleration before the steady cruise.",
        hidden: (p: Partial<Props>) =>
            onPage("Timing")(p) || p.motionPreset !== "custom",
    },
    arrivalMs: {
        type: ControlType.Number,
        title: "Arrival",
        min: 20,
        max: 2000,
        step: 10,
        unit: "ms",
        defaultValue: 160,
        description:
            "Only the braking before a spotlight grows. Lower = a later, sharper catch.",
        hidden: (p: Partial<Props>) =>
            onPage("Timing")(p) || p.motionPreset !== "custom",
    },
    growMs: {
        type: ControlType.Number,
        title: "Spotlight Grow",
        min: 120,
        max: 2000,
        step: 20,
        unit: "ms",
        defaultValue: 420,
        description: "How quickly the centred slide swells.",
        hidden: (p: Partial<Props>) =>
            onPage("Timing")(p) || p.motionPreset !== "custom",
    },
    exitMs: {
        type: ControlType.Number,
        title: "Spotlight Exit",
        min: 120,
        max: 2000,
        step: 20,
        unit: "ms",
        defaultValue: 340,
        description: "How quickly it shrinks back while the river departs.",
        hidden: (p: Partial<Props>) =>
            onPage("Timing")(p) || p.motionPreset !== "custom",
    },
    holdMs: {
        type: ControlType.Number,
        title: "Hold",
        min: 0,
        max: 5000,
        step: 50,
        unit: "ms",
        defaultValue: 900,
        description: "How long a spotlight slide basks.",
        hidden: onPage("Timing"),
    },
    finaleGrowMs: {
        type: ControlType.Number,
        title: "Finale Grow",
        min: 200,
        max: 3000,
        step: 50,
        unit: "ms",
        defaultValue: 750,
        hidden: onPage("Timing"),
    },
    finaleHoldMs: {
        type: ControlType.Number,
        title: "Finale Hold",
        min: 200,
        max: 10000,
        step: 100,
        unit: "ms",
        defaultValue: 2600,
        description:
            "The long stillness. Cut your video in anywhere inside it.",
        hidden: onPage("Timing"),
    },
    fadeMs: {
        type: ControlType.Number,
        title: "Others Fade",
        min: 120,
        max: 3000,
        step: 20,
        unit: "ms",
        defaultValue: 600,
        description:
            "How quickly the rest of the world leaves the finale alone.",
        hidden: onPage("Timing"),
    },
    canvasPose: {
        type: ControlType.Number,
        title: "Canvas Pose",
        min: 0,
        max: 100,
        step: 0.5,
        unit: "%",
        defaultValue: 62,
        description:
            "Scrub the whole film on the canvas. Live playback ignores this.",
        hidden: onPage("Timing"),
    },

    // ---- Look ------------------------------------------------------------
    theme: {
        type: ControlType.Enum,
        title: "Theme",
        options: ["dark", "light", "auto"],
        optionTitles: ["Dark", "Light", "Auto"],
        defaultValue: "dark",
        displaySegmentedControl: true,
        hidden: onPage("Look"),
    },
    ground: {
        type: ControlType.Color,
        title: "Ground",
        optional: true,
        description: "Leave off for the theme's own warm ground.",
        hidden: onPage("Look"),
    },
    backgroundStyle: {
        type: ControlType.Enum,
        title: "Background",
        options: ["solid", "gradient", "halo", "paper", "transparent"],
        optionTitles: ["Solid", "Gradient", "Soft Halo", "Paper", "Transparent"],
        defaultValue: "solid",
        hidden: onPage("Look"),
    },
    backgroundColor2: {
        type: ControlType.Color,
        title: "Second Color",
        defaultValue: "#4A2F2A",
        hidden: (p: Partial<Props>) => onPage("Look")(p) || p.backgroundStyle === "solid",
    },
    backgroundAngle: {
        type: ControlType.Number,
        title: "Gradient Angle",
        min: 0,
        max: 360,
        step: 1,
        unit: "°",
        defaultValue: 145,
        hidden: (p: Partial<Props>) => onPage("Look")(p) || p.backgroundStyle !== "gradient",
    },
    backgroundTexture: {
        type: ControlType.Number,
        title: "Texture",
        min: 0,
        max: 40,
        step: 1,
        unit: "%",
        defaultValue: 8,
        hidden: onPage("Look"),
    },
    paper: {
        type: ControlType.Color,
        title: "Paper",
        optional: true,
        hidden: onPage("Look"),
    },
    slideHeight: {
        type: ControlType.Number,
        title: "Slide Height",
        min: 15,
        max: 100,
        step: 1,
        unit: "%",
        defaultValue: 44,
        description: "Image height as a share of the stage height.",
        hidden: onPage("Look"),
    },
    gap: {
        type: ControlType.Number,
        title: "Gap",
        min: 0,
        max: 320,
        step: 1,
        unit: "px",
        defaultValue: 30,
        description: "Held constant even while a spotlight grows.",
        hidden: onPage("Look"),
    },
    cornerStyle: {
        type: ControlType.Enum,
        title: "Corners",
        options: ["squircle", "rounded"],
        optionTitles: ["Squircle", "Rounded"],
        defaultValue: "squircle",
        displaySegmentedControl: true,
        hidden: onPage("Look"),
    },
    cornerSmoothing: {
        type: ControlType.Number,
        title: "Smoothing",
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        defaultValue: 60,
        hidden: (p: Partial<Props>) => onPage("Look")(p) || p.cornerStyle === "rounded",
    },
    radius: {
        type: ControlType.Number,
        title: "Radius",
        min: 0,
        max: 96,
        step: 1,
        unit: "px",
        defaultValue: 16,
        hidden: onPage("Look"),
    },
    shadow: {
        type: ControlType.Number,
        title: "Shadow",
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        defaultValue: 35,
        hidden: onPage("Look"),
    },
    gridSize: {
        type: ControlType.Number,
        title: "Grid Cell",
        min: 12,
        max: 200,
        step: 2,
        unit: "px",
        defaultValue: 54,
        hidden: onPage("Look"),
    },
    gridStrength: {
        type: ControlType.Number,
        title: "Grid Ink",
        min: 0,
        max: 30,
        step: 0.5,
        unit: "%",
        defaultValue: 7,
        description: "Soft. It should never call attention to itself.",
        hidden: onPage("Look"),
    },
    gridDrift: {
        type: ControlType.Number,
        title: "Grid Drift",
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        defaultValue: 30,
        description: "Subtly alive. Glides to a stop with the finale.",
        hidden: onPage("Look"),
    },
    vignette: {
        type: ControlType.Number,
        title: "Vignette",
        min: 0,
        max: 45,
        step: 1,
        unit: "%",
        defaultValue: 12,
        description: "A breath of cinema at the edges. Fades with the finale.",
        hidden: onPage("Look"),
    },
    showHint: {
        type: ControlType.Boolean,
        title: "Click Hint",
        enabledTitle: "Show",
        disabledTitle: "Hide",
        defaultValue: true,
        hidden: (p: Partial<Props>) =>
            onPage("Look")(p) || p.startMode !== "click",
    },
})

// ---------------------------------------------------------------------------
// Stylesheet. Rendered in JSX so first paint is styled.
// ---------------------------------------------------------------------------

const COMPONENT_CSS = `
.orl-root {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--orl-ground);
    --orl-ground: #141312;
    --orl-paper: #211F1C;
    --orl-ink: #EEEDE9;
    --orl-shadow-c: rgb(0, 0, 0);
    --orl-vig-c: rgba(0, 0, 0, 0.85);
    cursor: default;
}
.orl-root[data-orl-background="gradient"] {
    background: linear-gradient(var(--orl-bg-angle), var(--orl-ground), var(--orl-ground-2));
}
.orl-root[data-orl-background="halo"] {
    background: radial-gradient(ellipse 78% 68% at 50% 43%, var(--orl-ground-2), var(--orl-ground) 74%);
}
.orl-root[data-orl-background="paper"] {
    background:
        linear-gradient(118deg, color-mix(in srgb, var(--orl-ground-2) 12%, transparent), transparent 38%),
        var(--orl-ground);
}
.orl-root[data-orl-background="transparent"] { background: transparent; }
.orl-root[data-orl-background="transparent"] .orl-grid,
.orl-root[data-orl-background="transparent"] .orl-vig,
.orl-root[data-orl-background="transparent"] .orl-texture { display: none; }
.orl-root[data-orl-theme="light"] {
    --orl-ground: #F3F1EA;
    --orl-paper: #FBFAF6;
    --orl-ink: #21201C;
    --orl-shadow-c: rgb(33, 32, 28);
    --orl-vig-c: rgba(33, 32, 28, 0.45);
}
@media (prefers-color-scheme: light) {
    .orl-root[data-orl-theme="auto"] {
        --orl-ground: #F3F1EA;
        --orl-paper: #FBFAF6;
        --orl-ink: #21201C;
        --orl-shadow-c: rgb(33, 32, 28);
        --orl-vig-c: rgba(33, 32, 28, 0.45);
    }
}
.orl-texture {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: var(--orl-texture-a);
    background-image:
        radial-gradient(circle at 20% 30%, var(--orl-ink) 0 .45px, transparent .65px),
        radial-gradient(circle at 75% 62%, var(--orl-ink) 0 .4px, transparent .62px);
    background-size: 5px 5px, 7px 7px;
    mix-blend-mode: soft-light;
}
.orl-root[data-orl-background="paper"] .orl-texture {
    background-size: 3px 3px, 5px 5px;
    mix-blend-mode: multiply;
}
.orl-grid {
    position: absolute;
    inset: -30%;
    pointer-events: none;
    background-image:
        linear-gradient(color-mix(in srgb, var(--orl-ink) calc(var(--orl-grid-a) * 1%), transparent) 1px, transparent 1px),
        linear-gradient(90deg, color-mix(in srgb, var(--orl-ink) calc(var(--orl-grid-a) * 1%), transparent) 1px, transparent 1px),
        linear-gradient(color-mix(in srgb, var(--orl-ink) calc(var(--orl-grid-a) * 1.8%), transparent) 1px, transparent 1px),
        linear-gradient(90deg, color-mix(in srgb, var(--orl-ink) calc(var(--orl-grid-a) * 1.8%), transparent) 1px, transparent 1px);
    background-size:
        var(--orl-cell) var(--orl-cell),
        var(--orl-cell) var(--orl-cell),
        calc(var(--orl-cell) * 4) calc(var(--orl-cell) * 4),
        calc(var(--orl-cell) * 4) calc(var(--orl-cell) * 4);
    will-change: background-position, opacity;
}
.orl-vig {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(120% 92% at 50% 45%, transparent 58%, var(--orl-vig-c));
    will-change: opacity;
}
.orl-stage {
    position: absolute;
    inset: 0;
    perspective: 1200px;
    perspective-origin: 50% 46%;
    transform-style: preserve-3d;
}
.orl-card {
    position: absolute;
    left: 50%;
    top: 50%;
    box-sizing: border-box;
    background: var(--orl-paper);
    border-radius: var(--orl-r);
    corner-shape: var(--orl-corner, round);
    --orl-shk: 1;
    box-shadow: 0 26px 80px -18px color-mix(in srgb, var(--orl-shadow-c) calc(var(--orl-shk) * var(--orl-sha) * 1%), transparent);
    transform-style: preserve-3d;
    backface-visibility: hidden;
    will-change: transform, opacity, filter;
}
.orl-frame {
    overflow: hidden;
    border-radius: max(0px, calc(var(--orl-r) - 2px));
    corner-shape: var(--orl-corner, round);
    background: color-mix(in srgb, var(--orl-paper) 88%, var(--orl-ink));
}
.orl-caption {
    max-width: 100%;
    color: var(--orl-ink);
    font: 500 clamp(8px, 1.2vw, 14px)/1.35 system-ui, sans-serif;
    letter-spacing: 0.01em;
    text-align: center;
}
.orl-media {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: var(--orl-fit, contain);
    user-select: none;
    pointer-events: none;
}
.orl-ph {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4em;
    color: var(--orl-ink);
}
.orl-ph-k {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 9px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    opacity: 0.45;
}
.orl-ph-n {
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(22px, 5vw, 64px);
    line-height: 1;
    opacity: 0.85;
}
.orl-hint {
    position: absolute;
    left: 16px;
    bottom: 13px;
    font-family: ui-monospace, Menlo, monospace;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: lowercase;
    color: var(--orl-ink);
    opacity: 0.45;
    pointer-events: none;
    user-select: none;
}
.orl-tag {
    text-transform: uppercase;
    font-size: 9px;
}
`
