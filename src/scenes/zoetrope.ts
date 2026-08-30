import type { MediaItem, TimelineMode, VisualTimelineSegment } from "../types"

export const ZOETROPE_ID = "zoetrope"
export const ZOETROPE_VERSION = 2
export const ZOETROPE_DWELL_FRACTION = 0.32
export const ZOETROPE_TRAVEL_FRACTION = 1 - ZOETROPE_DWELL_FRACTION
export const ZOETROPE_MIN_STATION_MS = 430
export const ZOETROPE_MIN_CYCLE_MS = 2_400
export const ZOETROPE_FINITE_DURATION_MS = 24_000
export const ZOETROPE_MAX_ITEMS = 127
export const ZOETROPE_MAX_DURATION_MS = 24 * 60 * 60 * 1_000
export const ZOETROPE_DESIGN_SHORT_EDGE = 640

export type ZoetropeParameters = {
    cylinderRadius: number
    cardSize: number
    ringTiltDeg: number
    cadenceCharacter: "ratchet" | "flywheel"
    direction: "forward" | "reverse"
}

export type ZoetropeTimelineIntent = {
    mode: TimelineMode
    mediaCount: number
    stationMs: number
    fixedDurationMs: number
    segments: VisualTimelineSegment[]
    fps: number
}

export type CompiledZoetropeTimelineSegment = VisualTimelineSegment & {
    startMs: number
    endMs: number
    startStation: number
    endStation: number
}

export type CompiledZoetropeTimeline = {
    mode: TimelineMode
    mediaCount: number
    stationMs: number
    durationMs: number
    finiteDurationMs: number
    frameCount: number
    finiteFrameCount: number
    stationCount: number
    segments: CompiledZoetropeTimelineSegment[]
}

export type ZoetropeSourceState = {
    id: string
    sourceIndex: number
    ratio: number
    type: "image" | "video"
    angleDeg: number
    depth: number
    role: "gate" | "successor" | "ring" | "rear-culled"
    active: boolean
    culled: boolean
    decoderRole: "gate" | "prewarm" | null
    opacity: 1
    filter: "none"
    blend: "normal"
}

export type ZoetropeSlot = {
    id: string
    sourceIndex: number
    role: Exclude<ZoetropeSourceState["role"], "rear-culled">
    x: number
    y: number
    z: number
    width: number
    height: number
    scale: number
    rotateY: number
    rotateZ: number
    depth: number
    decoderRole: ZoetropeSourceState["decoderRole"]
    opacity: 1
    filter: "none"
    blend: "normal"
}

export type ZoetropeFrame = {
    sceneId: typeof ZOETROPE_ID
    sceneVersion: typeof ZOETROPE_VERSION
    phase: number
    station: number
    velocity: number
    segmentId: string
    phrase: "empty" | "single-still" | "entry" | "spotlight-hold" | "ordered-advance" | "cycle" | "finale-hold" | "exit"
    count: number
    gateId: string | null
    successorId: string | null
    apparatusScale: number
    maxObservedNodes: 15 | 19
    liveVideoDecoderCount: number
    sourceStates: ZoetropeSourceState[]
    renderSlots: ZoetropeSlot[]
    stateHash: string
    render: {
        artworkOpacity: 1
        artworkFilter: "none"
        artworkBlend: "normal"
    }
}

export type ZoetropeEvaluationInput = {
    items: Array<Pick<MediaItem, "id" | "ratio" | "type">>
    parameters: ZoetropeParameters
    timeline: CompiledZoetropeTimeline
    timeMs: number
    stageWidth: number
    stageHeight: number
    terminal?: boolean
    reducedMotion?: boolean
    exportMode?: boolean
    spotlightId?: string
    finaleId?: string
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))
const positiveModulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor

export function zoetropeDesignSpace(width: number, height: number) {
    if (!Number.isFinite(width) || width < 1 || !Number.isFinite(height) || height < 1) throw new Error("Zoetrope Project canvas is invalid.")
    const projectScale = Math.min(width, height) / ZOETROPE_DESIGN_SHORT_EDGE
    return { designWidth: width / projectScale, designHeight: height / projectScale, projectScale }
}

function rounded(value: number) {
    const result = Math.round(value * 1_000_000) / 1_000_000
    return Object.is(result, -0) ? 0 : result
}

function minimumJerk(value: number) {
    const amount = clamp(value, 0, 1)
    return amount ** 3 * (amount * (amount * 6 - 15) + 10)
}

function minimumJerkDerivative(value: number) {
    const amount = clamp(value, 0, 1)
    return 30 * amount ** 2 * (amount - 1) ** 2
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

function validateSegment(segment: VisualTimelineSegment, ids: Set<string>) {
    if (!segment || Object.keys(segment).sort().join(":") !== "cycles:durationMs:id:kind:paceScale"
        || typeof segment.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment.id) || segment.id.length > 120 || ids.has(segment.id)
        || !["cycle", "hold"].includes(segment.kind)
        || !Number.isSafeInteger(segment.cycles) || segment.cycles < 0 || segment.cycles > 1_000
        || !Number.isFinite(segment.paceScale) || segment.paceScale < 0.05 || segment.paceScale > 20
        || !Number.isFinite(segment.durationMs) || segment.durationMs < 0 || segment.durationMs > ZOETROPE_MAX_DURATION_MS
        || (segment.kind === "cycle" && segment.cycles < 1)
        || (segment.kind === "hold" && segment.cycles !== 0)) throw new Error("A directed Zoetrope segment is invalid.")
    ids.add(segment.id)
}

export function minimumZoetropeCycleMs(mediaCount: number) {
    if (!Number.isSafeInteger(mediaCount) || mediaCount < 1 || mediaCount > ZOETROPE_MAX_ITEMS) throw new Error("Zoetrope media count must be between 1 and 127.")
    return Math.max(ZOETROPE_MIN_CYCLE_MS, mediaCount * ZOETROPE_MIN_STATION_MS)
}

export function baseZoetropeCycleMs(mediaCount: number, stationMs: number) {
    const minimumCycleMs = minimumZoetropeCycleMs(mediaCount)
    if (!Number.isFinite(stationMs) || stationMs < ZOETROPE_MIN_STATION_MS || stationMs > 6_000) throw new Error("Zoetrope station duration is invalid.")
    return Math.max(minimumCycleMs, mediaCount * stationMs)
}

function minimumFiniteDurationMs(mediaCount: number, stationMs: number) {
    return Math.max(ZOETROPE_FINITE_DURATION_MS, mediaCount * stationMs * 10)
}

export function compileZoetropeTimeline(intent: ZoetropeTimelineIntent): CompiledZoetropeTimeline {
    if (!intent || !["automatic", "fixed-duration", "directed"].includes(intent.mode)) throw new Error("Zoetrope Timeline mode is invalid.")
    if (!Number.isSafeInteger(intent.mediaCount) || intent.mediaCount < 1 || intent.mediaCount > ZOETROPE_MAX_ITEMS) throw new Error("Zoetrope media count must be between 1 and 127.")
    if (!Number.isFinite(intent.stationMs) || intent.stationMs < ZOETROPE_MIN_STATION_MS || intent.stationMs > 6_000) throw new Error("Zoetrope station duration is invalid.")
    if (!Number.isFinite(intent.fps) || intent.fps < 1 || intent.fps > 120) throw new Error("Zoetrope frame rate is invalid.")
    if (!Array.isArray(intent.segments)) throw new Error("Zoetrope Timeline segments are invalid.")

    const baseCycleMs = baseZoetropeCycleMs(intent.mediaCount, intent.stationMs)
    let source: VisualTimelineSegment[]
    if (intent.mode === "automatic") {
        if (intent.fixedDurationMs !== 0 || intent.segments.length !== 0) throw new Error("Automatic Zoetrope cannot contain fixed or directed intent.")
        source = [{ id: "automatic-cycle", kind: "cycle", cycles: 1, paceScale: 1, durationMs: baseCycleMs }]
    } else if (intent.mode === "fixed-duration") {
        if (!Number.isFinite(intent.fixedDurationMs) || intent.fixedDurationMs < minimumZoetropeCycleMs(intent.mediaCount)
            || intent.fixedDurationMs > ZOETROPE_MAX_DURATION_MS || intent.segments.length !== 0) throw new Error("Zoetrope fixed duration is invalid.")
        source = [{ id: "fixed-cycle", kind: "cycle", cycles: 1, paceScale: baseCycleMs / intent.fixedDurationMs, durationMs: intent.fixedDurationMs }]
    } else {
        if (intent.fixedDurationMs !== 0 || intent.segments.length < 1 || intent.segments.length > 64) throw new Error("Zoetrope directed Timeline needs explicit segments.")
        const ids = new Set<string>()
        source = intent.segments.map((segment) => {
            validateSegment(segment, ids)
            const durationMs = segment.durationMs > 0
                ? segment.durationMs
                : segment.kind === "hold"
                    ? intent.stationMs
                    : baseCycleMs * segment.cycles / segment.paceScale
            if (!Number.isFinite(durationMs) || durationMs < (segment.kind === "hold" ? 120 : minimumZoetropeCycleMs(intent.mediaCount) * segment.cycles)
                || durationMs > ZOETROPE_MAX_DURATION_MS) throw new Error("A directed Zoetrope segment erases its readable station dwell.")
            return { ...segment, durationMs }
        })
    }

    let elapsed = 0
    let stations = 0
    const segments = source.map((segment) => {
        const startMs = elapsed
        const startStation = stations
        elapsed += segment.durationMs
        stations += segment.cycles * intent.mediaCount
        return { ...segment, startMs, endMs: elapsed, startStation, endStation: stations }
    })
    if (!Number.isFinite(elapsed) || elapsed < 1 || elapsed > ZOETROPE_MAX_DURATION_MS) throw new Error("Zoetrope Timeline exceeds the supported duration.")
    const finiteDurationMs = Math.max(minimumFiniteDurationMs(intent.mediaCount, intent.stationMs), elapsed)
    return {
        mode: intent.mode,
        mediaCount: intent.mediaCount,
        stationMs: intent.stationMs,
        durationMs: elapsed,
        finiteDurationMs,
        frameCount: Math.max(1, Math.ceil(elapsed / 1_000 * intent.fps)),
        finiteFrameCount: Math.max(1, Math.ceil(finiteDurationMs / 1_000 * intent.fps)),
        stationCount: stations,
        segments,
    }
}

export function validateCompiledZoetropeTimeline(timeline: CompiledZoetropeTimeline) {
    if (!timeline || !["automatic", "fixed-duration", "directed"].includes(timeline.mode)
        || !Number.isSafeInteger(timeline.mediaCount) || timeline.mediaCount < 1 || timeline.mediaCount > ZOETROPE_MAX_ITEMS
        || !Number.isFinite(timeline.stationMs) || timeline.stationMs < ZOETROPE_MIN_STATION_MS || timeline.stationMs > 6_000
        || !Number.isFinite(timeline.durationMs) || timeline.durationMs < 1 || timeline.durationMs > ZOETROPE_MAX_DURATION_MS
        || !Number.isFinite(timeline.finiteDurationMs) || timeline.finiteDurationMs !== Math.max(minimumFiniteDurationMs(timeline.mediaCount, timeline.stationMs), timeline.durationMs)
        || !Number.isSafeInteger(timeline.frameCount) || timeline.frameCount < 1
        || !Number.isSafeInteger(timeline.finiteFrameCount) || timeline.finiteFrameCount < timeline.frameCount
        || !Number.isSafeInteger(timeline.stationCount) || timeline.stationCount < 0
        || !Array.isArray(timeline.segments) || timeline.segments.length < 1 || timeline.segments.length > 64) {
        throw new Error("Zoetrope compiled Timeline is invalid.")
    }
    const ids = new Set<string>()
    let elapsed = 0
    let stations = 0
    for (const segment of timeline.segments) {
        if (!segment || Object.keys(segment).sort().join(":") !== "cycles:durationMs:endMs:endStation:id:kind:paceScale:startMs:startStation"
            || typeof segment.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment.id) || segment.id.length > 120 || ids.has(segment.id)
            || !["cycle", "hold"].includes(segment.kind)
            || !Number.isSafeInteger(segment.cycles) || segment.cycles < 0 || segment.cycles > 1_000
            || !Number.isFinite(segment.paceScale) || segment.paceScale <= 0
            || !Number.isFinite(segment.durationMs) || segment.durationMs < 1 || segment.durationMs > ZOETROPE_MAX_DURATION_MS
            || !Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs)
            || !Number.isSafeInteger(segment.startStation) || !Number.isSafeInteger(segment.endStation)
            || Math.abs(segment.startMs - elapsed) > 1e-6 || segment.endMs <= segment.startMs
            || Math.abs(segment.endMs - segment.startMs - segment.durationMs) > 1e-6
            || segment.startStation !== stations || segment.endStation !== segment.startStation + segment.cycles * timeline.mediaCount
            || (segment.kind === "cycle" && (segment.cycles < 1 || segment.durationMs < minimumZoetropeCycleMs(timeline.mediaCount) * segment.cycles))
            || (segment.kind === "hold" && (segment.cycles !== 0 || segment.durationMs < 120))) {
            throw new Error("Zoetrope compiled Timeline segment is invalid.")
        }
        ids.add(segment.id)
        elapsed = segment.endMs
        stations = segment.endStation
    }
    const onlySegment = timeline.segments[0]
    const baseCycleMs = baseZoetropeCycleMs(timeline.mediaCount, timeline.stationMs)
    if ((timeline.mode === "automatic" && (timeline.segments.length !== 1 || onlySegment.id !== "automatic-cycle" || onlySegment.kind !== "cycle"
            || onlySegment.cycles !== 1 || onlySegment.paceScale !== 1 || onlySegment.durationMs !== baseCycleMs))
        || (timeline.mode === "fixed-duration" && (timeline.segments.length !== 1 || onlySegment.id !== "fixed-cycle" || onlySegment.kind !== "cycle"
            || onlySegment.cycles !== 1 || Math.abs(onlySegment.paceScale - baseCycleMs / onlySegment.durationMs) > 1e-12))
        || (timeline.mode === "directed" && timeline.segments.some((segment) => segment.paceScale < 0.05 || segment.paceScale > 20))
        || Math.abs(elapsed - timeline.durationMs) > 1e-6 || stations !== timeline.stationCount) {
        throw new Error("Zoetrope compiled Timeline mode or totals are inconsistent.")
    }
    return timeline
}

function evaluateCompiledZoetropeTimeline(timeline: CompiledZoetropeTimeline, timeMs: number) {
    const localTime = positiveModulo(timeMs, timeline.durationMs)
    const segment = timeline.segments.find((candidate) => localTime < candidate.endMs) ?? timeline.segments[timeline.segments.length - 1]
    const durationMs = Math.max(1, segment.endMs - segment.startMs)
    const progress = clamp((localTime - segment.startMs) / durationMs, 0, 1)
    return {
        station: segment.startStation + (segment.endStation - segment.startStation) * progress,
        velocity: segment.kind === "hold" ? 0 : (segment.endStation - segment.startStation) / durationMs,
        segmentId: segment.id,
    }
}

export function evaluateZoetropeTimeline(timeline: CompiledZoetropeTimeline, timeMs: number) {
    validateCompiledZoetropeTimeline(timeline)
    if (!Number.isFinite(timeMs)) throw new Error("Zoetrope story time is invalid.")
    return evaluateCompiledZoetropeTimeline(timeline, timeMs)
}

export function validateZoetropeParameters(input: ZoetropeParameters): ZoetropeParameters {
    if (!input || !Number.isFinite(input.cylinderRadius) || input.cylinderRadius < 0.28 || input.cylinderRadius > 0.48) throw new Error("Zoetrope cylinder radius is invalid.")
    if (!Number.isFinite(input.cardSize) || input.cardSize < 0.22 || input.cardSize > 0.42) throw new Error("Zoetrope card size is invalid.")
    if (!Number.isFinite(input.ringTiltDeg) || input.ringTiltDeg < -12 || input.ringTiltDeg > 8) throw new Error("Zoetrope ring tilt is invalid.")
    if (!["ratchet", "flywheel"].includes(input.cadenceCharacter)) throw new Error("Zoetrope cadence character is invalid.")
    if (!["forward", "reverse"].includes(input.direction)) throw new Error("Zoetrope direction is invalid.")
    return input
}

function cadenceStation(rawStation: number, cadence: ZoetropeParameters["cadenceCharacter"], temporalVelocity: number) {
    if (temporalVelocity === 0) return { station: Math.round(rawStation), velocityFactor: 0, dwelling: true }
    const base = Math.floor(rawStation + 1e-12)
    const local = positiveModulo(rawStation, 1)
    if (cadence === "flywheel") return { station: base + minimumJerk(local), velocityFactor: minimumJerkDerivative(local), dwelling: false }
    if (local + 1e-12 >= ZOETROPE_TRAVEL_FRACTION) return { station: base + 1, velocityFactor: 0, dwelling: true }
    const travel = local / ZOETROPE_TRAVEL_FRACTION
    const advance = minimumJerk(travel)
    const derivative = minimumJerkDerivative(travel)
    return { station: base + advance, velocityFactor: derivative / ZOETROPE_TRAVEL_FRACTION, dwelling: false }
}

function signedAngleDifference(angleDeg: number) {
    const normalized = positiveModulo(angleDeg + 180, 360) - 180
    return Object.is(normalized, -0) ? 0 : normalized
}

function cardDimensions(ratioValue: number, stageWidth: number, stageHeight: number, cardSize: number) {
    if (!Number.isFinite(ratioValue) || ratioValue <= 0 || ratioValue > 10_000) throw new Error("Zoetrope source ratio is invalid.")
    const heightLimit = stageHeight * cardSize
    const widthLimit = stageWidth * (stageWidth < stageHeight ? 0.5 : 0.38)
    const height = Math.min(heightLimit, widthLimit / ratioValue)
    return { width: height * ratioValue, height }
}

function indexForId(items: ZoetropeEvaluationInput["items"], id: string | undefined, fallback: number) {
    const index = id ? items.findIndex((item) => item.id === id) : -1
    return index >= 0 ? index : fallback
}

function finiteStoryStation(input: ZoetropeEvaluationInput, progress: number, directionSign: number, parameters: ZoetropeParameters) {
    const count = input.items.length
    const opening = 0
    const spotlight = indexForId(input.items, input.spotlightId, opening)
    const fallbackFinale = positiveModulo(spotlight + directionSign * Math.max(0, count - 1), count)
    const finale = indexForId(input.items, input.finaleId, fallbackFinale)
    const movement = (startIndex: number, distance: number, localProgress: number, durationFraction: number) => {
        const rawStation = distance * clamp(localProgress, 0, 1)
        const cadence = cadenceStation(rawStation, parameters.cadenceCharacter, distance > 0 ? 1 : 0)
        return {
            station: startIndex + directionSign * cadence.station,
            velocity: directionSign * distance / Math.max(1, durationFraction * input.timeline.finiteDurationMs) * cadence.velocityFactor,
        }
    }
    if (progress < 0.1) return { station: opening, phrase: "entry" as const, velocity: 0, apparatusScale: 0.82 + 0.18 * minimumJerk(progress / 0.1) }
    if (progress < 0.7) {
        const resolvedDistance = positiveModulo((spotlight - opening) * directionSign, count)
        const forwardDistance = count === 1 ? 0 : 5 * count + (resolvedDistance === 0 ? count : resolvedDistance)
        return { ...movement(opening, forwardDistance, (progress - 0.1) / 0.6, 0.6), phrase: "ordered-advance" as const, apparatusScale: 1 }
    }
    if (progress < 0.79) return { station: spotlight, phrase: "spotlight-hold" as const, velocity: 0, apparatusScale: 1 }
    if (progress < 0.89) {
        const resolvedDistance = positiveModulo((finale - spotlight) * directionSign, count)
        return { ...movement(spotlight, resolvedDistance, (progress - 0.79) / 0.1, 0.1), phrase: "ordered-advance" as const, apparatusScale: 1 }
    }
    if (progress < 0.96) return { station: finale, phrase: "finale-hold" as const, velocity: 0, apparatusScale: 1 }
    return { station: finale, phrase: "exit" as const, velocity: 0, apparatusScale: 1 - 0.18 * minimumJerk((progress - 0.96) / 0.04) }
}

export function evaluateZoetrope(input: ZoetropeEvaluationInput): ZoetropeFrame {
    const parameters = validateZoetropeParameters(input.parameters)
    if (!Number.isFinite(input.stageWidth) || input.stageWidth < 1 || !Number.isFinite(input.stageHeight) || input.stageHeight < 1) throw new Error("Zoetrope Project canvas is invalid.")
    if (!Number.isFinite(input.timeMs)) throw new Error("Zoetrope story time is invalid.")
    if (input.items.length > ZOETROPE_MAX_ITEMS) throw new Error("Zoetrope supports at most 127 ordered media items.")
    validateCompiledZoetropeTimeline(input.timeline)
    const render = { artworkOpacity: 1 as const, artworkFilter: "none" as const, artworkBlend: "normal" as const }
    const maxObservedNodes = (input.stageWidth >= input.stageHeight ? 19 : 15) as 15 | 19
    if (input.items.length === 0) {
        const empty = { sceneId: ZOETROPE_ID as typeof ZOETROPE_ID, sceneVersion: ZOETROPE_VERSION as typeof ZOETROPE_VERSION, phase: 0, station: 0, velocity: 0, segmentId: "empty", phrase: "empty" as const, count: 0, gateId: null, successorId: null, apparatusScale: 1, maxObservedNodes, liveVideoDecoderCount: 0, sourceStates: [] as ZoetropeSourceState[], renderSlots: [] as ZoetropeSlot[], render }
        return { ...empty, stateHash: stableHash(empty) }
    }
    if (input.timeline.mediaCount !== input.items.length) throw new Error("Zoetrope Timeline media count does not match its ordered sources.")
    const ids = new Set<string>()
    for (const item of input.items) {
        if (typeof item.id !== "string" || item.id.length < 1 || item.id.length > 240 || ids.has(item.id) || !["image", "video"].includes(item.type)
            || !Number.isFinite(item.ratio) || item.ratio <= 0 || item.ratio > 10_000) throw new Error("Zoetrope ordered media identity or ratio is invalid.")
        ids.add(item.id)
    }

    const count = input.items.length
    const directionSign = parameters.direction === "forward" ? 1 : -1
    const terminalProgress = clamp(input.timeMs / input.timeline.finiteDurationMs, 0, 1)
    const temporal = evaluateCompiledZoetropeTimeline(input.timeline, input.timeMs)
    let rawSignedStation: number
    let phrase: ZoetropeFrame["phrase"]
    let velocity: number
    let apparatusScale = 1
    if (count === 1) {
        rawSignedStation = 0
        phrase = "single-still"
        velocity = 0
    } else if (input.reducedMotion && !input.terminal) {
        rawSignedStation = directionSign * Math.round(temporal.station)
        phrase = "cycle"
        velocity = 0
    } else if (input.terminal) {
        const finite = finiteStoryStation(input, terminalProgress, directionSign, parameters)
        rawSignedStation = input.reducedMotion ? Math.round(finite.station) : finite.station
        phrase = finite.phrase
        velocity = input.reducedMotion ? 0 : finite.velocity
        apparatusScale = finite.apparatusScale
    } else {
        const cadence = cadenceStation(temporal.station, parameters.cadenceCharacter, temporal.velocity)
        rawSignedStation = directionSign * cadence.station
        phrase = "cycle"
        velocity = directionSign * temporal.velocity * cadence.velocityFactor
    }

    const signedStation = count === 1 ? 0 : rawSignedStation
    const phase = count === 1 ? 0 : positiveModulo(signedStation / count, 1)
    const gateIndex = positiveModulo(Math.round(signedStation), count)
    const successorIndex = count === 1 ? gateIndex : positiveModulo(gateIndex + directionSign, count)
    const centerX = input.stageWidth / 2
    const centerY = input.stageHeight * 0.5
    const radiusPx = input.stageWidth * parameters.cylinderRadius
    const tiltSin = Math.sin(parameters.ringTiltDeg * Math.PI / 180)
    const allStates = input.items.map((item, sourceIndex) => {
        const angleDeg = rounded(signedAngleDifference((sourceIndex - signedStation) * 360 / count))
        const angle = angleDeg * Math.PI / 180
        const cosine = Math.cos(angle)
        const depth = cosine
        const culled = Math.abs(angleDeg) > 90
        const role: ZoetropeSourceState["role"] = culled ? "rear-culled" : sourceIndex === gateIndex ? "gate" : sourceIndex === successorIndex ? "successor" : "ring"
        const decoderRole: ZoetropeSourceState["decoderRole"] = input.exportMode || item.type !== "video" ? null : sourceIndex === gateIndex ? "gate" : sourceIndex === successorIndex ? "prewarm" : null
        return {
            id: item.id,
            sourceIndex,
            ratio: rounded(item.ratio),
            type: item.type,
            angleDeg,
            depth: rounded(depth),
            role,
            active: !culled,
            culled,
            decoderRole,
            opacity: 1 as const,
            filter: "none" as const,
            blend: "normal" as const,
        }
    })

    const chosen = allStates.filter((state) => !state.culled)
        .sort((left, right) => right.depth - left.depth || left.sourceIndex - right.sourceIndex)
        .slice(0, maxObservedNodes)
    const selected = new Set(chosen.map((state) => state.sourceIndex))
    if (!selected.has(gateIndex)) {
        if (chosen.length === maxObservedNodes) chosen.pop()
        chosen.push(allStates[gateIndex])
    }
    const renderSlots = chosen.map((state): ZoetropeSlot => {
        const item = input.items[state.sourceIndex]
        const angle = state.angleDeg * Math.PI / 180
        const dimensions = cardDimensions(item.ratio, input.stageWidth, input.stageHeight, parameters.cardSize)
        const x = centerX + Math.sin(angle) * radiusPx
        const y = centerY + Math.sin(angle) * radiusPx * tiltSin + (1 - state.depth) * 0.012 * input.stageHeight
        return {
            id: item.id,
            sourceIndex: state.sourceIndex,
            role: state.role === "rear-culled" ? "ring" : state.role,
            x: rounded(x),
            y: rounded(y),
            z: rounded((state.depth - 1) * input.stageWidth * 0.09),
            width: rounded(dimensions.width),
            height: rounded(dimensions.height),
            scale: rounded(0.68 + 0.16 * (state.depth + 1)),
            rotateY: rounded(state.angleDeg),
            rotateZ: parameters.ringTiltDeg,
            depth: state.depth,
            decoderRole: state.decoderRole,
            opacity: 1,
            filter: "none",
            blend: "normal",
        }
    }).sort((left, right) => left.depth - right.depth || left.sourceIndex - right.sourceIndex)

    const liveVideoDecoderCount = allStates.filter((state) => state.decoderRole !== null).length
    const state = {
        sceneId: ZOETROPE_ID as typeof ZOETROPE_ID,
        sceneVersion: ZOETROPE_VERSION as typeof ZOETROPE_VERSION,
        phase: rounded(phase),
        station: rounded(input.terminal ? positiveModulo(signedStation, count) : signedStation),
        velocity: rounded(velocity),
        segmentId: count === 1 ? "single-still" : input.terminal ? "finite-zoetrope" : temporal.segmentId,
        phrase,
        count,
        gateId: input.items[gateIndex]?.id ?? null,
        successorId: input.items[successorIndex]?.id ?? null,
        apparatusScale: rounded(apparatusScale),
        maxObservedNodes,
        liveVideoDecoderCount,
        sourceStates: allStates,
        renderSlots,
        render,
    }
    return { ...state, stateHash: stableHash(state) }
}

export const zoetropeScene = {
    definition: {
        id: ZOETROPE_ID,
        version: ZOETROPE_VERSION,
        name: "Zoetrope",
        motionSentence: "A shallow horizontal cylinder advances one upright card through a fixed central gate, then rests in a complete readable dwell.",
    },
    defaults: (): ZoetropeParameters => ({
        cylinderRadius: 0.39,
        cardSize: 0.31,
        ringTiltDeg: -4,
        cadenceCharacter: "ratchet",
        direction: "forward",
    }),
    parameters: validateZoetropeParameters,
    compileTimeline: compileZoetropeTimeline,
    evaluate: evaluateZoetrope,
    controls: [
        { id: "cylinder-radius", label: "Cylinder radius", setting: "sway", min: 28, max: 48, step: 1, resetValue: 39 },
        { id: "card-size", label: "Card size", setting: "slideHeight", min: 22, max: 42, step: 1, resetValue: 31 },
        { id: "ring-tilt", label: "Ring tilt", setting: "tilt", min: -12, max: 8, step: 1, resetValue: -4 },
        { id: "cadence-character", label: "Cadence", setting: "motionPreset", options: ["ratchet", "flywheel"], serializedValues: ["magnetic", "velvet"], resetValue: "ratchet" },
        { id: "direction", label: "Direction", setting: "direction", options: ["forward", "reverse"], resetValue: "forward" },
    ] as const,
}
