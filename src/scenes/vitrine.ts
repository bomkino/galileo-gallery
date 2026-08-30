import type { MediaItem, TimelineMode, VisualTimelineSegment } from "../types"

export const VITRINE_ID = "vitrine"
export const VITRINE_VERSION = 2

export type VitrineParameters = {
    presentationScale: number
    objectTurnAmplitude: number
    transitionDepth: number
    direction: "forward" | "reverse"
    transitionDirection: "left" | "right"
    placardVisible: boolean
    fit: "contain" | "cover"
}

export type VitrineTimelineIntent = {
    mode: TimelineMode
    mediaCount: number
    holdMs: number
    exchangeMs: number
    fixedDurationMs: number
    segments: VisualTimelineSegment[]
    fps: number
}

export type CompiledVitrineTimelineSegment = VisualTimelineSegment & {
    startMs: number
    endMs: number
    startCycle: number
    endCycle: number
}

export type CompiledVitrineTimeline = {
    mode: TimelineMode
    durationMs: number
    frameCount: number
    cycleCount: number
    holdFraction: number
    segments: CompiledVitrineTimelineSegment[]
}

export type VitrinePlane = {
    id: string
    sourceIndex: number
    role: "readable" | "outgoing" | "incoming"
    x: number
    y: number
    z: number
    width: number
    height: number
    scale: number
    rotateY: number
    rotateX: number
    opacity: 1
    filter: "none"
    blend: "normal"
}

export type VitrineFrame = {
    sceneId: typeof VITRINE_ID
    sceneVersion: typeof VITRINE_VERSION
    phase: number
    velocity: number
    segmentId: string
    phrase: "empty" | "single-still" | "entry" | "readable-hold" | "exchange" | "finale-hold" | "exit" | "reduced-motion-settled"
    currentId: string | null
    incomingId: string | null
    transitionProgress: number
    count: number
    maxObservedNodes: 2
    sourceStates: Array<{
        id: string
        sourceIndex: number
        ratio: number
        caption: string
        role: VitrinePlane["role"] | "offstage"
        active: boolean
        opacity: 1
        filter: "none"
        blend: "normal"
    }>
    placard: { mediaId: string; caption: string } | null
    planes: VitrinePlane[]
    stateHash: string
    render: {
        fit: "contain" | "cover"
        artworkOpacity: 1
        artworkFilter: "none"
        artworkBlend: "normal"
    }
}

export type VitrineEvaluationInput = {
    items: Array<Pick<MediaItem, "id" | "ratio" | "caption">>
    parameters: VitrineParameters
    timeline: CompiledVitrineTimeline
    timeMs: number
    stageWidth: number
    stageHeight: number
    terminal?: boolean
    reducedMotion?: boolean
    spotlightId?: string
    finaleId?: string
}

export const VITRINE_MIN_HOLD_MS = 600
export const VITRINE_MIN_EXCHANGE_MS = 280

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const positiveModulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor

function boundedNumber(value: number, fallback: number, min: number, max: number) {
    return Number.isFinite(value) ? clamp(value, min, max) : fallback
}

function minimumJerk(value: number) {
    const amount = clamp(value, 0, 1)
    return amount * amount * amount * (amount * (amount * 6 - 15) + 10)
}

export function minimumVitrineFixedDuration(mediaCount: number, holdMs: number, exchangeMs: number) {
    if (!Number.isSafeInteger(mediaCount) || mediaCount < 1 || mediaCount > 127) throw new Error("Vitrine media count must be between 1 and 127.")
    if (!Number.isFinite(holdMs) || holdMs < VITRINE_MIN_HOLD_MS || holdMs > 6_000) throw new Error("Vitrine readable hold is invalid.")
    if (!Number.isFinite(exchangeMs) || exchangeMs < VITRINE_MIN_EXCHANGE_MS || exchangeMs > 1_800) throw new Error("Vitrine exchange duration is invalid.")
    const count = mediaCount
    const hold = holdMs
    const exchange = exchangeMs
    const span = hold + exchange
    const computed = count * Math.max(VITRINE_MIN_HOLD_MS * span / hold, VITRINE_MIN_EXCHANGE_MS * span / exchange)
    const nearest = Math.round(computed)
    return Math.abs(computed - nearest) <= 1e-9 ? nearest : Math.ceil(computed)
}

function stableHash(value: unknown) {
    const text = JSON.stringify(value)
    let hash = 0x811c9dc5
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(16).padStart(8, "0")
}

function normalizedSegments(intent: VitrineTimelineIntent, baseCycleMs: number): VisualTimelineSegment[] {
    if (intent.mode === "automatic") {
        if (intent.fixedDurationMs !== 0 || intent.segments.length !== 0) throw new Error("Automatic Vitrine cannot contain fixed or directed intent.")
        return [{ id: "automatic-cycle", kind: "cycle", cycles: 1, paceScale: 1, durationMs: baseCycleMs }]
    }
    if (intent.mode === "fixed-duration") {
        if (!Number.isFinite(intent.fixedDurationMs) || intent.fixedDurationMs < 1_000 || intent.fixedDurationMs > 24 * 60 * 60 * 1_000 || intent.segments.length !== 0) {
            throw new Error("Vitrine fixed duration is invalid.")
        }
        const target = intent.fixedDurationMs
        const readableFloor = minimumVitrineFixedDuration(intent.mediaCount, intent.holdMs, intent.exchangeMs)
        if (target < readableFloor) throw new Error(`Vitrine fixed duration must be at least ${readableFloor} ms for this media count.`)
        return [{ id: "fixed-cycle", kind: "cycle", cycles: 1, paceScale: baseCycleMs / target, durationMs: target }]
    }
    if (intent.fixedDurationMs !== 0 || !intent.segments.length || intent.segments.length > 64) throw new Error("Vitrine directed Timeline needs explicit segments.")
    const ids = new Set<string>()
    return intent.segments.map((segment) => {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment.id) || segment.id.length > 120 || ids.has(segment.id)
            || !["cycle", "hold"].includes(segment.kind)
            || !Number.isSafeInteger(segment.cycles) || segment.cycles < 0 || segment.cycles > 1_000
            || !Number.isFinite(segment.paceScale) || segment.paceScale < 0.05 || segment.paceScale > 20
            || !Number.isFinite(segment.durationMs) || segment.durationMs < 0 || segment.durationMs > 24 * 60 * 60 * 1_000) {
            throw new Error("A directed Vitrine segment is invalid.")
        }
        ids.add(segment.id)
        if ((segment.kind === "cycle" && segment.cycles < 1) || (segment.kind === "hold" && segment.cycles !== 0)) throw new Error("A directed Vitrine segment is invalid.")
        const cycles = segment.cycles
        const paceScale = segment.paceScale
        const durationMs = segment.durationMs > 0
            ? segment.durationMs
            : segment.kind === "hold"
                ? Math.max(VITRINE_MIN_HOLD_MS, intent.holdMs)
                : Math.max(1, baseCycleMs * cycles / paceScale)
        if (segment.kind === "hold" && durationMs < VITRINE_MIN_HOLD_MS) throw new Error(`Vitrine directed holds must be at least ${VITRINE_MIN_HOLD_MS} ms.`)
        if (segment.kind === "cycle") {
            const minimumCycleMs = minimumVitrineFixedDuration(intent.mediaCount, intent.holdMs, intent.exchangeMs)
            if (durationMs / cycles < minimumCycleMs) throw new Error(`Vitrine directed cycles must be at least ${minimumCycleMs} ms each.`)
        }
        return { ...segment, cycles, paceScale, durationMs }
    })
}

export function compileVitrineTimeline(intent: VitrineTimelineIntent): CompiledVitrineTimeline {
    if (!intent || !["automatic", "fixed-duration", "directed"].includes(intent.mode)) throw new Error("Vitrine Timeline mode is invalid.")
    if (!Number.isSafeInteger(intent.mediaCount) || intent.mediaCount < 1 || intent.mediaCount > 127) throw new Error("Vitrine media count must be between 1 and 127.")
    if (!Number.isFinite(intent.fps) || intent.fps < 1 || intent.fps > 120) throw new Error("Vitrine frame rate is invalid.")
    if (!Array.isArray(intent.segments)) throw new Error("Vitrine Timeline segments are invalid.")
    const mediaCount = intent.mediaCount
    if (!Number.isFinite(intent.holdMs) || intent.holdMs < VITRINE_MIN_HOLD_MS || intent.holdMs > 6_000) throw new Error("Vitrine readable hold is invalid.")
    if (!Number.isFinite(intent.exchangeMs) || intent.exchangeMs < VITRINE_MIN_EXCHANGE_MS || intent.exchangeMs > 1_800) throw new Error("Vitrine exchange duration is invalid.")
    const holdMs = intent.holdMs
    const exchangeMs = intent.exchangeMs
    const baseCycleMs = mediaCount * (holdMs + exchangeMs)
    const source = normalizedSegments(intent, baseCycleMs)
    let elapsed = 0
    let cycles = 0
    const segments = source.map((segment) => {
        const startMs = elapsed
        const startCycle = cycles
        elapsed += segment.durationMs
        cycles += segment.cycles
        return { ...segment, startMs, endMs: elapsed, startCycle, endCycle: cycles }
    })
    if (elapsed > 24 * 60 * 60 * 1_000) throw new Error("Vitrine Timeline exceeds the supported duration.")
    const durationMs = Math.max(1, elapsed)
    return {
        mode: intent.mode,
        durationMs,
        frameCount: Math.max(1, Math.ceil(durationMs / 1_000 * intent.fps)),
        cycleCount: cycles,
        holdFraction: holdMs / (holdMs + exchangeMs),
        segments,
    }
}

export function evaluateVitrineTimeline(timeline: CompiledVitrineTimeline, timeMs: number) {
    const localTime = positiveModulo(timeMs, timeline.durationMs)
    const segment = timeline.segments.find((candidate) => localTime < candidate.endMs) ?? timeline.segments[timeline.segments.length - 1]
    const duration = Math.max(1, segment.endMs - segment.startMs)
    const progress = clamp((localTime - segment.startMs) / duration, 0, 1)
    return {
        cycle: segment.startCycle + segment.cycles * progress,
        velocity: segment.kind === "hold" ? 0 : segment.cycles / duration,
        segmentId: segment.id,
    }
}

export function validateVitrineParameters(input: VitrineParameters): VitrineParameters {
    if (!input || !["contain", "cover"].includes(input.fit)) throw new Error("Vitrine fit is invalid.")
    if (!Number.isFinite(input.presentationScale) || input.presentationScale < 0.42 || input.presentationScale > 0.78) throw new Error("Vitrine presentation scale is invalid.")
    if (!Number.isFinite(input.objectTurnAmplitude) || input.objectTurnAmplitude < 0 || input.objectTurnAmplitude > 9) throw new Error("Vitrine object turn is invalid.")
    if (!Number.isFinite(input.transitionDepth) || input.transitionDepth < 0.08 || input.transitionDepth > 0.3) throw new Error("Vitrine transition depth is invalid.")
    if (!["forward", "reverse"].includes(input.direction)) throw new Error("Vitrine direction is invalid.")
    if (!["left", "right"].includes(input.transitionDirection)) throw new Error("Vitrine transition direction is invalid.")
    if (typeof input.placardVisible !== "boolean") throw new Error("Vitrine placard setting is invalid.")
    return input
}

function planeSize(ratioValue: number, stageWidth: number, stageHeight: number, presentationScale: number) {
    if (!Number.isFinite(ratioValue) || ratioValue <= 0) throw new Error("Vitrine source ratio is invalid.")
    const ratio = ratioValue
    const heightLimit = stageHeight * presentationScale
    const widthLimit = stageWidth * (stageWidth < stageHeight ? 0.82 : 0.72)
    const height = Math.min(heightLimit, widthLimit / ratio)
    return { width: height * ratio, height }
}

function rounded(value: number) {
    const result = Math.round(value * 1_000_000) / 1_000_000
    return Object.is(result, -0) ? 0 : result
}

function snapNearInteger(value: number) {
    const nearest = Math.round(value)
    return Math.abs(value - nearest) <= 1e-10 ? nearest : value
}

export function vitrineStoryTimeMs(timeMs: number, durationMs: number, direction: "forward" | "reverse", terminal: boolean) {
    const duration = Math.max(1, durationMs)
    const rawTime = terminal ? clamp(timeMs, 0, duration) : positiveModulo(timeMs, duration)
    if (direction === "forward") return rawTime
    return terminal ? duration - rawTime : positiveModulo(duration - rawTime, duration)
}

export function evaluateVitrine(input: VitrineEvaluationInput): VitrineFrame {
    const parameters = validateVitrineParameters(input.parameters)
    const stageWidth = Math.max(1, input.stageWidth)
    const stageHeight = Math.max(1, input.stageHeight)
    const render = { fit: parameters.fit, artworkOpacity: 1 as const, artworkFilter: "none" as const, artworkBlend: "normal" as const }
    if (input.items.length === 0) {
        const empty = { sceneId: VITRINE_ID as typeof VITRINE_ID, sceneVersion: VITRINE_VERSION as typeof VITRINE_VERSION, phase: 0, velocity: 0, segmentId: "empty", phrase: "empty" as const, currentId: null, incomingId: null, transitionProgress: 0, count: 0, maxObservedNodes: 2 as const, sourceStates: [] as VitrineFrame["sourceStates"], placard: null, planes: [] as VitrinePlane[], render }
        return { ...empty, stateHash: stableHash(empty) }
    }

    const count = input.items.length
    if (count > 127) throw new Error("Vitrine supports at most 127 ordered media items.")
    const directionSign = parameters.direction === "forward" ? 1 : -1
    // The packet settles finite reduced-motion stories on Spotlight, while loop
    // previews still step discretely through the ordered media at chapter edges.
    const evaluationTimeMs = input.reducedMotion && input.terminal ? 0 : input.timeMs
    const directedTime = vitrineStoryTimeMs(evaluationTimeMs, input.timeline.durationMs, parameters.direction, Boolean(input.terminal))
    const temporal = evaluateVitrineTimeline(input.timeline, directedTime)
    const phase = input.terminal
        ? clamp(directedTime / input.timeline.durationMs, 0, 1)
        : positiveModulo(temporal.cycle, 1)
    const centerX = stageWidth / 2
    const centerY = stageHeight * 0.47
    const treatment = { opacity: 1 as const, filter: "none" as const, blend: "normal" as const }
    const centeredPlane = (index: number, role: VitrinePlane["role"] = "readable"): VitrinePlane => {
        const item = input.items[index]
        const size = planeSize(item.ratio, stageWidth, stageHeight, parameters.presentationScale)
        return { id: item.id, sourceIndex: index, role, x: centerX, y: centerY, z: 0, width: size.width, height: size.height, scale: 1, rotateY: 0, rotateX: 0, ...treatment }
    }
    const entryPlane = (index: number, progress: number): VitrinePlane => {
        const plane = centeredPlane(index)
        const amount = minimumJerk(progress)
        const remaining = 1 - amount
        const lateralSign = parameters.transitionDirection === "left" ? -1 : 1
        return {
            ...plane,
            y: centerY + remaining * stageHeight * 0.1,
            z: -parameters.transitionDepth * remaining,
            scale: 1 - parameters.transitionDepth * 0.34 * remaining,
            rotateY: -lateralSign * parameters.objectTurnAmplitude * remaining,
            rotateX: 1.8 * remaining,
        }
    }
    const exchangePlanes = (currentIndex: number, incomingIndex: number, transitionProgress: number): VitrinePlane[] => {
        const current = centeredPlane(currentIndex, "outgoing")
        const incoming = centeredPlane(incomingIndex, "incoming")
        // transitionProgress is the evaluator's reported smootherstep. The
        // authored packet applies a second smootherstep to spatial geometry.
        const progress = minimumJerk(transitionProgress)
        const depth = -Math.sin(progress * Math.PI) * parameters.transitionDepth
        const offstageMargin = 24
        const outgoingTravel = stageWidth / 2 + current.width / 2 + offstageMargin
        const incomingTravel = stageWidth / 2 + incoming.width / 2 + offstageMargin
        const lateralSign = parameters.transitionDirection === "left" ? -1 : 1
        return [
            { ...current, x: centerX + lateralSign * outgoingTravel * progress, y: centerY + Math.abs(depth) * stageHeight * 0.09, z: depth, scale: 1 + depth * 0.3, rotateY: -lateralSign * parameters.objectTurnAmplitude * progress, rotateX: Math.abs(depth) * 8 },
            { ...incoming, x: centerX - lateralSign * incomingTravel * (1 - progress), y: centerY + Math.abs(depth) * stageHeight * 0.09, z: depth, scale: 1 + depth * 0.3, rotateY: lateralSign * parameters.objectTurnAmplitude * (1 - progress), rotateX: Math.abs(depth) * 8 },
        ]
    }
    const indexForId = (id: string | undefined, fallback: number) => {
        const index = id ? input.items.findIndex((item) => item.id === id) : -1
        return index >= 0 ? index : fallback
    }

    let phrase: VitrineFrame["phrase"]
    let progress = 0
    let planes: VitrinePlane[]
    let currentIndex = 0
    let incomingIndex: number | null = null
    if (count === 1) {
        phrase = "single-still"
        planes = [centeredPlane(0)]
    } else if (input.reducedMotion) {
        const spotlightIndex = indexForId(input.spotlightId, 0)
        currentIndex = input.terminal
            ? spotlightIndex
            : Math.min(count - 1, Math.floor(phase * count))
        phrase = "reduced-motion-settled"
        planes = [centeredPlane(currentIndex)]
    } else if (input.terminal) {
        const spotlightIndex = indexForId(input.spotlightId, 0)
        const fallbackFinale = spotlightIndex === count - 1 ? 0 : count - 1
        const finaleIndex = indexForId(input.finaleId, fallbackFinale)
        if (phase < 0.12) {
            phrase = "entry"
            currentIndex = spotlightIndex
            planes = [entryPlane(currentIndex, phase / 0.12)]
        } else if (phase < 0.68 || (phase < 0.86 && spotlightIndex === finaleIndex)) {
            phrase = "readable-hold"
            currentIndex = spotlightIndex
            planes = [centeredPlane(currentIndex)]
        } else if (phase < 0.86) {
            phrase = "exchange"
            currentIndex = spotlightIndex
            incomingIndex = finaleIndex
            const rawProgress = (phase - 0.68) / 0.18
            progress = minimumJerk(rawProgress)
            planes = exchangePlanes(currentIndex, incomingIndex, progress)
        } else if (phase < 0.96) {
            phrase = "finale-hold"
            currentIndex = finaleIndex
            planes = [centeredPlane(currentIndex)]
        } else {
            phrase = "exit"
            currentIndex = finaleIndex
            planes = [entryPlane(currentIndex, 1 - (phase - 0.96) / 0.04)]
        }
    } else {
        const cycle = snapNearInteger(phase * count)
        currentIndex = Math.min(count - 1, Math.floor(cycle))
        const local = positiveModulo(cycle, 1)
        incomingIndex = (currentIndex + 1) % count
        if (temporal.velocity === 0 || local + 1e-12 < input.timeline.holdFraction) {
            phrase = "readable-hold"
            planes = [centeredPlane(currentIndex)]
        } else {
            phrase = "exchange"
            const rawProgress = (local - input.timeline.holdFraction) / Math.max(0.000001, 1 - input.timeline.holdFraction)
            progress = minimumJerk(rawProgress)
            planes = exchangePlanes(currentIndex, incomingIndex, progress)
        }
    }

    planes = planes.map((plane) => Object.fromEntries(Object.entries(plane).map(([key, value]) => [key, typeof value === "number" ? rounded(value) : value])) as VitrinePlane)
    const activePlanes = new Map(planes.map((plane) => [plane.sourceIndex, plane]))
    const sourceStates: VitrineFrame["sourceStates"] = input.items.map((item, sourceIndex) => {
        const active = activePlanes.get(sourceIndex)
        return {
            id: item.id,
            sourceIndex,
            ratio: rounded(item.ratio),
            caption: item.caption || "",
            role: active?.role ?? "offstage",
            active: Boolean(active),
            opacity: 1,
            filter: "none",
            blend: "normal",
        }
    })
    const placardIndex = incomingIndex != null && progress >= 0.5 ? incomingIndex : currentIndex
    const placardItem = input.items[placardIndex]
    const placard = parameters.placardVisible ? { mediaId: placardItem.id, caption: placardItem.caption || placardItem.id } : null
    const moving = ["entry", "exchange", "exit"].includes(phrase)
    const state = {
        sceneId: VITRINE_ID as typeof VITRINE_ID,
        sceneVersion: VITRINE_VERSION as typeof VITRINE_VERSION,
        phase: count === 1 ? 0 : rounded(phase),
        velocity: moving ? rounded(directionSign * (input.terminal ? 1 / input.timeline.durationMs : temporal.velocity)) : 0,
        segmentId: count === 1 ? "single-still" : input.terminal ? "finite-vitrine" : temporal.segmentId,
        phrase,
        currentId: input.items[currentIndex]?.id ?? null,
        incomingId: phrase === "exchange" && incomingIndex != null ? input.items[incomingIndex].id : null,
        transitionProgress: rounded(progress),
        count,
        maxObservedNodes: 2 as const,
        sourceStates,
        placard,
        planes,
        render,
    }
    return { ...state, stateHash: stableHash(state) }
}

export const vitrineScene = {
    definition: {
        id: VITRINE_ID,
        version: VITRINE_VERSION,
        name: "Vitrine",
        motionSentence: "One source rests completely still, then exchanges through restrained depth and yaw without dimming or grading the artwork.",
    },
    defaults: (): VitrineParameters => ({
        presentationScale: 0.62,
        objectTurnAmplitude: 5,
        transitionDepth: 0.18,
        direction: "forward",
        transitionDirection: "left",
        placardVisible: true,
        fit: "contain",
    }),
    parameters: validateVitrineParameters,
    compileTimeline: compileVitrineTimeline,
    evaluate: evaluateVitrine,
    controls: [
        { id: "presentation-scale", label: "Presentation scale", setting: "slideHeight", min: 42, max: 78, step: 1, resetValue: 62 },
        { id: "object-turn-amplitude", label: "Object turn amplitude", setting: "tilt", min: 0, max: 9, step: 0.25, resetValue: 5 },
        { id: "transition-depth", label: "Transition depth", setting: "sway", min: 8, max: 30, step: 1, resetValue: 18 },
        { id: "transition-direction", label: "Transition direction", setting: "transitionDirection", options: ["left", "right"], resetValue: "left" },
        { id: "placard-visibility", label: "Placard", setting: "showHint", options: [true, false], resetValue: true },
    ] as const,
}
