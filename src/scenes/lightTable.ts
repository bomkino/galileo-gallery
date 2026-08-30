import type { MediaItem, TimelineMode, VisualTimelineSegment } from "../types"

export const LIGHT_TABLE_ID = "light-table"
export const LIGHT_TABLE_VERSION = 2
export const LIGHT_TABLE_MAX_ITEMS = 24
export const LIGHT_TABLE_MAX_DURATION_MS = 60_000
export const LIGHT_TABLE_TRANSPARENCY_REASON = "Light Table needs an opaque illuminated surface. Transparent export is unavailable for this Scene. Choose another Scene to preserve alpha."

export type LightTableFocusBehavior = "route" | "loupe-only" | "none"

export type LightTableParameters = {
    tableSpread: number
    overlap: number
    underlightStrength: number
    focusBehavior: LightTableFocusBehavior
    nudgeRestraint: number
    fit: "contain" | "cover"
    tableColor: string
}

export type LightTableControlDescriptor =
    | { id: "table-spread" | "overlap" | "nudge-restraint"; owner: "Scene"; label: string; parameter: "tableSpread" | "overlap" | "nudgeRestraint"; kind: "range"; min: number; max: number; step: number; resetValue: number }
    | { id: "underlight-strength"; owner: "Look"; label: string; parameter: "underlightStrength"; kind: "range"; min: number; max: number; step: number; resetValue: number }
    | { id: "focus-behaviour"; owner: "Scene"; label: string; parameter: "focusBehavior"; kind: "choice"; options: readonly LightTableFocusBehavior[]; resetValue: "route" }

export type LightTableTimelineIntent = {
    mode: TimelineMode
    direction: "forward" | "reverse"
    mediaCount: number
    fixedDurationMs: number
    segments: VisualTimelineSegment[]
    fps: number
}

export type LightTableTimelineIssue = {
    code: "duration-below-readable-minimum" | "duration-above-supported-maximum" | "directed-readability-adjusted" | "directed-maximum-adjusted"
    requestedMs: number
    appliedMs: number
}

export type LightTablePhaseId = "wake" | "review" | "final-inspection" | "return"

export type CompiledLightTablePhase = {
    id: LightTablePhaseId
    startMs: number
    endMs: number
    startPhase: number
    endPhase: number
    requestedPaceScale: number
    achievedPaceScale: number
}

export type CompiledLightTableTimeline = {
    mode: TimelineMode
    direction: "forward" | "reverse"
    durationMs: number
    frameCount: number
    readableMinimumMs: number
    phases: CompiledLightTablePhase[]
    issues: LightTableTimelineIssue[]
}

export type LightTableSource = Pick<MediaItem, "id" | "ratio"> & {
    failed?: boolean
}

export type LightTableTopology = "empty-table" | "single-inspection" | "bilateral" | "open-bay" | "ordinary-six" | "bounded-review-grid"

export type LightTablePlane = {
    id: string
    sourceIndex: number
    failed: boolean
    x: number
    y: number
    width: number
    height: number
    rotation: number
    scale: number
    z: number
    focusWeight: number
    underlightOpacity: number
    underlightExpansion: number
    opacity: 1
    filter: "none"
    blend: "normal"
    sourceTimeMs: number
}

export type LightTableEvaluationInput = {
    items: LightTableSource[]
    parameters: LightTableParameters
    timeline: CompiledLightTableTimeline
    timeMs: number
    stageWidth: number
    stageHeight: number
    reducedMotion?: boolean
    manualFocusIndex?: number | null
}

export type LightTableFrame = {
    sceneId: typeof LIGHT_TABLE_ID
    sceneVersion: typeof LIGHT_TABLE_VERSION
    phase: number
    velocity: number
    segmentId: LightTablePhaseId | "empty" | "reduced-motion" | "manual-inspection"
    topology: LightTableTopology
    focusId: string | null
    render: {
        background: { kind: "solid"; color: string }
        opaque: true
        artworkOpacity: 1
        artworkFilter: "none"
        artworkBlend: "normal"
        underlightPlacement: "sibling-behind-frame"
        tableLuminance: number
    }
    layout: {
        maximumOcclusion: number
        intersectionCount: number
        outOfBoundsCount: number
    }
    planes: LightTablePlane[]
    stateHash: string
}

type Slot = {
    x: number
    y: number
    maxWidth: number
    maxHeight: number
    rotation: number
}

const TAU = Math.PI * 2
const PHASE_BOUNDS = [0, 0.1, 0.78, 0.92, 1] as const
const PHASE_IDS = ["wake", "review", "final-inspection", "return"] as const
const DIRECTED_PACE = [2, 1, 1, 2] as const

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const positiveModulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount

function smootherstep(value: number) {
    const amount = clamp(value, 0, 1)
    return amount * amount * amount * (amount * (amount * 6 - 15) + 10)
}

function rounded(value: number) {
    const result = Math.round(value * 1_000_000) / 1_000_000
    return Object.is(result, -0) ? 0 : result
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

function seeded(index: number, salt: number) {
    let value = Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(salt + 17, 0x27d4eb2d)
    value ^= value >>> 16
    value = Math.imul(value, 0x45d9f3b)
    value ^= value >>> 16
    return (value >>> 0) / 0xffffffff
}

function exactDirectedSegments(segments: VisualTimelineSegment[]) {
    if (segments.length === 0) return DIRECTED_PACE.map((paceScale, index) => ({
        id: PHASE_IDS[index],
        kind: "cycle" as const,
        cycles: 1,
        paceScale,
        durationMs: 0,
    }))
    if (segments.length !== PHASE_IDS.length) throw new Error("Light Table directed Timeline needs exactly four authored phases.")
    return segments.map((segment, index) => {
        const expectedId = PHASE_IDS[index]
        const exactKeys = Object.keys(segment).sort().join(":") === ["cycles", "durationMs", "id", "kind", "paceScale"].sort().join(":")
        if (!exactKeys || segment.id !== expectedId || segment.kind !== "cycle" || segment.cycles !== 1
            || !Number.isFinite(segment.paceScale) || segment.paceScale < 0.25 || segment.paceScale > 4
            || !Number.isFinite(segment.durationMs) || segment.durationMs < 0 || segment.durationMs > LIGHT_TABLE_MAX_DURATION_MS) {
            throw new Error("A directed Light Table phase is invalid.")
        }
        return segment
    })
}

export function automaticLightTableDuration(mediaCount: number) {
    if (!Number.isSafeInteger(mediaCount) || mediaCount < 1 || mediaCount > LIGHT_TABLE_MAX_ITEMS) throw new Error("Light Table media count must be between 1 and 24.")
    return clamp(6_880 + 520 * mediaCount, 8_000, 18_000)
}

export function minimumLightTableDuration(mediaCount: number) {
    if (!Number.isSafeInteger(mediaCount) || mediaCount < 1 || mediaCount > LIGHT_TABLE_MAX_ITEMS) throw new Error("Light Table media count must be between 1 and 24.")
    return Math.max(6_000, 1_200 + 680 * mediaCount)
}

export function compileLightTableTimeline(intent: LightTableTimelineIntent): CompiledLightTableTimeline {
    if (!intent || !["automatic", "fixed-duration", "directed"].includes(intent.mode)) throw new Error("Light Table Timeline mode is invalid.")
    if (!Number.isSafeInteger(intent.mediaCount) || intent.mediaCount < 1 || intent.mediaCount > LIGHT_TABLE_MAX_ITEMS) throw new Error("Light Table media count must be between 1 and 24.")
    if (!Number.isFinite(intent.fps) || intent.fps < 1 || intent.fps > 120) throw new Error("Light Table frame rate is invalid.")
    if (!["forward", "reverse"].includes(intent.direction)) throw new Error("Light Table direction is invalid.")
    if (!Array.isArray(intent.segments)) throw new Error("Light Table Timeline segments are invalid.")

    const automaticDuration = automaticLightTableDuration(intent.mediaCount)
    const readableMinimumMs = minimumLightTableDuration(intent.mediaCount)
    const basePhaseDurations = PHASE_IDS.map((_, index) => automaticDuration * (PHASE_BOUNDS[index + 1] - PHASE_BOUNDS[index]))
    const issues: LightTableTimelineIssue[] = []
    let phaseDurations: number[]
    let requestedPace: number[]

    if (intent.mode === "automatic") {
        if (intent.fixedDurationMs !== 0 || intent.segments.length !== 0) throw new Error("Automatic Light Table cannot contain fixed or directed intent.")
        phaseDurations = [...basePhaseDurations]
        requestedPace = [1, 1, 1, 1]
    } else if (intent.mode === "fixed-duration") {
        if (!Number.isFinite(intent.fixedDurationMs) || intent.fixedDurationMs <= 0 || intent.segments.length !== 0) throw new Error("Light Table fixed duration is invalid.")
        const applied = clamp(intent.fixedDurationMs, readableMinimumMs, LIGHT_TABLE_MAX_DURATION_MS)
        if (intent.fixedDurationMs < readableMinimumMs) issues.push({ code: "duration-below-readable-minimum", requestedMs: intent.fixedDurationMs, appliedMs: applied })
        if (intent.fixedDurationMs > LIGHT_TABLE_MAX_DURATION_MS) issues.push({ code: "duration-above-supported-maximum", requestedMs: intent.fixedDurationMs, appliedMs: applied })
        phaseDurations = basePhaseDurations.map((duration) => duration * applied / automaticDuration)
        requestedPace = basePhaseDurations.map((duration, index) => duration / phaseDurations[index])
    } else {
        if (intent.fixedDurationMs !== 0) throw new Error("Directed Light Table cannot contain fixed duration intent.")
        const segments = exactDirectedSegments(intent.segments)
        requestedPace = segments.map((segment) => segment.paceScale)
        phaseDurations = segments.map((segment, index) => segment.durationMs > 0 ? segment.durationMs : basePhaseDurations[index] / segment.paceScale)
        const requestedTotal = phaseDurations.reduce((sum, duration) => sum + duration, 0)
        if (requestedTotal < readableMinimumMs) {
            const scale = readableMinimumMs / requestedTotal
            phaseDurations = phaseDurations.map((duration) => duration * scale)
            issues.push({ code: "directed-readability-adjusted", requestedMs: requestedTotal, appliedMs: readableMinimumMs })
        } else if (requestedTotal > LIGHT_TABLE_MAX_DURATION_MS) {
            const scale = LIGHT_TABLE_MAX_DURATION_MS / requestedTotal
            phaseDurations = phaseDurations.map((duration) => duration * scale)
            issues.push({ code: "directed-maximum-adjusted", requestedMs: requestedTotal, appliedMs: LIGHT_TABLE_MAX_DURATION_MS })
        }
    }

    let elapsed = 0
    const phases = PHASE_IDS.map((id, index) => {
        const startMs = elapsed
        elapsed += phaseDurations[index]
        return {
            id,
            startMs: rounded(startMs),
            endMs: rounded(elapsed),
            startPhase: PHASE_BOUNDS[index],
            endPhase: PHASE_BOUNDS[index + 1],
            requestedPaceScale: requestedPace[index],
            achievedPaceScale: rounded(basePhaseDurations[index] / phaseDurations[index]),
        }
    })
    const durationMs = phases[phases.length - 1].endMs
    return {
        mode: intent.mode,
        direction: intent.direction,
        durationMs,
        frameCount: Math.max(1, Math.ceil(durationMs / 1_000 * intent.fps)),
        readableMinimumMs,
        phases,
        issues,
    }
}

export function evaluateLightTableTimeline(timeline: CompiledLightTableTimeline, timeMs: number) {
    if (!Number.isFinite(timeMs) || timeMs < 0) throw new Error("Light Table story time is invalid.")
    const local = positiveModulo(timeMs, timeline.durationMs)
    const directed = timeline.direction === "reverse" ? positiveModulo(timeline.durationMs - local, timeline.durationMs) : local
    const segment = timeline.phases.find((candidate) => directed < candidate.endMs) ?? timeline.phases[timeline.phases.length - 1]
    const progress = clamp((directed - segment.startMs) / Math.max(0.000001, segment.endMs - segment.startMs), 0, 1)
    const phase = mix(segment.startPhase, segment.endPhase, progress)
    const sign = timeline.direction === "reverse" ? -1 : 1
    return {
        phase: rounded(phase),
        velocity: rounded(sign * (segment.endPhase - segment.startPhase) / Math.max(0.000001, segment.endMs - segment.startMs)),
        segmentId: segment.id,
        segmentProgress: rounded(progress),
    }
}

export function validateLightTableParameters(input: LightTableParameters): LightTableParameters {
    if (!input || !["route", "loupe-only", "none"].includes(input.focusBehavior)) throw new Error("Light Table focus behaviour is invalid.")
    if (!["contain", "cover"].includes(input.fit)) throw new Error("Light Table frame fit is invalid.")
    if (!/^#[0-9a-fA-F]{6}$/.test(input.tableColor)) throw new Error("Light Table surface colour is invalid.")
    if (!Number.isFinite(input.tableSpread) || input.tableSpread < 0.52 || input.tableSpread > 0.92) throw new Error("Light Table spread is invalid.")
    if (!Number.isFinite(input.overlap) || input.overlap < 0 || input.overlap > 0.22) throw new Error("Light Table overlap is invalid.")
    if (!Number.isFinite(input.underlightStrength) || input.underlightStrength < 0 || input.underlightStrength > 0.7) throw new Error("Light Table under-light is invalid.")
    if (!Number.isFinite(input.nudgeRestraint) || input.nudgeRestraint < 0 || input.nudgeRestraint > 0.6) throw new Error("Light Table nudge restraint is invalid.")
    return input
}

function frameSize(ratioValue: number, maxWidth: number, maxHeight: number) {
    const ratio = clamp(ratioValue, 0.05, 20)
    let width = Math.min(maxWidth, maxHeight * ratio)
    let height = width / ratio
    if (height > maxHeight) {
        height = maxHeight
        width = height * ratio
    }
    return { width, height }
}

function explicitSlot(index: number, count: number, width: number, height: number, spread: number, overlap: number): Slot {
    const landscape = width >= height
    const spreadScale = spread / 0.72
    const overlapScale = 1 - overlap * 4.2
    const scale = spreadScale * overlapScale
    if (count === 1) return { x: width * 0.5, y: height * 0.5, maxWidth: width * 0.54, maxHeight: height * 0.62, rotation: 0 }
    if (count === 2) {
        const horizontal = landscape
        const side = index === 0 ? -1 : 1
        return {
            x: width * (0.5 + (horizontal ? side * 0.22 * scale : side * 0.014)),
            y: height * (0.5 + (horizontal ? side * 0.018 : side * 0.22 * scale)),
            maxWidth: width * (horizontal ? 0.32 : 0.44),
            maxHeight: height * (horizontal ? 0.52 : 0.32),
            rotation: side * 1.2,
        }
    }

    const landscapeFive = [[-0.27, -0.18], [0, -0.235], [0.27, -0.145], [-0.19, 0.205], [0.17, 0.19]] as const
    const landscapeSix = [[-0.28, -0.18], [0, -0.235], [0.28, -0.155], [-0.255, 0.205], [0.025, 0.175], [0.29, 0.21]] as const
    const portraitFive = [[-0.19, -0.255], [0.17, -0.21], [-0.04, 0], [-0.2, 0.245], [0.2, 0.235]] as const
    const portraitSix = [[-0.19, -0.265], [0.18, -0.225], [-0.2, -0.01], [0.18, 0.015], [-0.18, 0.245], [0.2, 0.255]] as const
    const points = landscape ? (count === 5 ? landscapeFive : landscapeSix) : (count === 5 ? portraitFive : portraitSix)
    const point = points[index]
    return {
        x: width * (0.5 + point[0] * scale),
        y: height * (0.5 + point[1] * scale),
        maxWidth: width * (landscape ? 0.205 : 0.275),
        maxHeight: height * (landscape ? 0.27 : 0.19),
        rotation: (seeded(index, 2) - 0.5) * 4,
    }
}

function reviewGridSlot(index: number, count: number, width: number, height: number, spread: number, overlap: number): Slot {
    const aspect = width / height
    const maximumColumns = aspect < 0.72 ? 3 : aspect < 1.15 ? 4 : 6
    const columns = clamp(Math.ceil(Math.sqrt(count * aspect)), 2, maximumColumns)
    const rows = Math.ceil(count / columns)
    const row = Math.floor(index / columns)
    const rowStart = row * columns
    const rowCount = Math.min(columns, count - rowStart)
    const column = index - rowStart
    const horizontalSpan = width * spread
    const verticalSpan = height * clamp(spread + 0.08, 0.6, 0.88)
    const overlapScale = 1 - overlap * 4.2
    const cellStepX = horizontalSpan / columns * overlapScale
    const cellStepY = verticalSpan / rows * overlapScale
    const minimumCellWidth = width * 0.52 / columns
    const minimumCellHeight = height * 0.6 / rows
    const jitterX = (seeded(index, 11) - 0.5) * minimumCellWidth * 0.05
    const jitterY = (seeded(index, 17) - 0.5) * minimumCellHeight * 0.05
    return {
        x: width / 2 + (column - (rowCount - 1) / 2) * cellStepX + jitterX,
        y: height / 2 + (row - (rows - 1) / 2) * cellStepY + jitterY,
        maxWidth: minimumCellWidth * 0.91,
        maxHeight: minimumCellHeight * 0.87,
        rotation: (seeded(index, 23) - 0.5) * 3.2,
    }
}

function topologyFor(count: number): LightTableTopology {
    if (count === 0) return "empty-table"
    if (count === 1) return "single-inspection"
    if (count === 2) return "bilateral"
    if (count === 5) return "open-bay"
    if (count === 6) return "ordinary-six"
    return "bounded-review-grid"
}

function focusState(phase: number, eligible: number[], parameters: LightTableParameters, reducedMotion: boolean, manualFocusIndex: number | null | undefined) {
    if (manualFocusIndex != null) return eligible.includes(manualFocusIndex)
        ? { index: manualFocusIndex, weight: 1, segmentId: "manual-inspection" as const }
        : { index: null, weight: 0, segmentId: null }
    if (parameters.focusBehavior === "none" || eligible.length === 0) return { index: null, weight: 0, segmentId: null }
    if (reducedMotion) return { index: parameters.focusBehavior === "loupe-only" ? eligible[eligible.length - 1] : eligible[0], weight: 1, segmentId: "reduced-motion" as const }
    if (phase < 0.1) return { index: null, weight: 0, segmentId: null }
    if (phase < 0.78) {
        if (parameters.focusBehavior === "loupe-only") return { index: null, weight: 0, segmentId: null }
        const route = clamp((phase - 0.1) / 0.68, 0, 1 - Number.EPSILON) * eligible.length
        const slot = Math.min(eligible.length - 1, Math.floor(route))
        const local = route - slot
        const enter = smootherstep(local / 0.18)
        const exit = 1 - smootherstep((local - 0.82) / 0.18)
        return { index: eligible[slot], weight: rounded(enter * exit), segmentId: null }
    }
    const index = eligible[eligible.length - 1]
    if (phase < 0.92) return { index, weight: rounded(smootherstep((phase - 0.78) / 0.035)), segmentId: null }
    return { index, weight: rounded(1 - smootherstep((phase - 0.92) / 0.08)), segmentId: null }
}

function aabb(plane: LightTablePlane) {
    const radians = Math.abs(plane.rotation) * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    const width = (plane.width * cosine + plane.height * sine) * plane.scale
    const height = (plane.width * sine + plane.height * cosine) * plane.scale
    return { left: plane.x - width / 2, right: plane.x + width / 2, top: plane.y - height / 2, bottom: plane.y + height / 2, width, height }
}

export function lightTableLayoutMetrics(planes: LightTablePlane[], stageWidth: number, stageHeight: number) {
    const boxes = planes.map(aabb)
    let maximumOcclusion = 0
    let intersectionCount = 0
    for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
            const left = boxes[leftIndex]
            const right = boxes[rightIndex]
            const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
            const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
            if (width <= 0 || height <= 0) continue
            intersectionCount += 1
            maximumOcclusion = Math.max(maximumOcclusion, width * height / Math.max(1, Math.min(left.width * left.height, right.width * right.height)))
        }
    }
    const outOfBoundsCount = boxes.filter((box) => box.left < -1e-6 || box.top < -1e-6 || box.right > stageWidth + 1e-6 || box.bottom > stageHeight + 1e-6).length
    return { maximumOcclusion: rounded(maximumOcclusion), intersectionCount, outOfBoundsCount }
}

export function lightTableSourceTimeSeconds(timeMs: number, durationSeconds: number, loop: boolean) {
    if (!Number.isFinite(timeMs) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
    const seconds = Math.max(0, timeMs / 1_000)
    return loop ? positiveModulo(seconds, durationSeconds) : Math.min(seconds, durationSeconds)
}

export function evaluateLightTable(input: LightTableEvaluationInput): LightTableFrame {
    const parameters = validateLightTableParameters(input.parameters)
    if (!Array.isArray(input.items)) throw new Error("Light Table sources are invalid.")
    if (input.items.length > LIGHT_TABLE_MAX_ITEMS) throw new Error("Light Table shows up to 24 sources in v2. All Project media remain preserved.")
    if (!Number.isFinite(input.stageWidth) || !Number.isFinite(input.stageHeight) || input.stageWidth <= 0 || input.stageHeight <= 0) throw new Error("Light Table stage dimensions are invalid.")
    if (!Number.isFinite(input.timeMs) || input.timeMs < 0) throw new Error("Light Table story time is invalid.")
    if (input.items.length === 0) {
        const empty = {
            sceneId: LIGHT_TABLE_ID as typeof LIGHT_TABLE_ID,
            sceneVersion: LIGHT_TABLE_VERSION as typeof LIGHT_TABLE_VERSION,
            phase: 0,
            velocity: 0,
            segmentId: "empty" as const,
            topology: "empty-table" as const,
            focusId: null,
            render: {
                background: { kind: "solid" as const, color: parameters.tableColor },
                opaque: true as const,
                artworkOpacity: 1 as const,
                artworkFilter: "none" as const,
                artworkBlend: "normal" as const,
                underlightPlacement: "sibling-behind-frame" as const,
                tableLuminance: 0.78,
            },
            layout: { maximumOcclusion: 0, intersectionCount: 0, outOfBoundsCount: 0 },
            planes: [] as LightTablePlane[],
        }
        return { ...empty, stateHash: stableHash(empty) }
    }
    const ids = new Set<string>()
    input.items.forEach((item) => {
        if (typeof item.id !== "string" || item.id.length < 1 || item.id.length > 256 || ids.has(item.id)) throw new Error("Light Table source identities must be unique and bounded.")
        if (!Number.isFinite(item.ratio) || item.ratio < 0.05 || item.ratio > 20) throw new Error("Light Table source ratio is invalid.")
        ids.add(item.id)
    })
    if (input.manualFocusIndex != null && (!Number.isSafeInteger(input.manualFocusIndex) || input.manualFocusIndex < 0 || input.manualFocusIndex >= input.items.length)) throw new Error("Light Table manual focus is invalid.")

    const temporal = evaluateLightTableTimeline(input.timeline, input.timeMs)
    const reducedMotion = Boolean(input.reducedMotion)
    const eligible = input.items.map((item, index) => item.failed ? -1 : index).filter((index) => index >= 0)
    const focus = focusState(temporal.phase, eligible, parameters, reducedMotion, input.manualFocusIndex)
    const topology = topologyFor(input.items.length)
    const minimumDimension = Math.min(input.stageWidth, input.stageHeight)
    const nudgeAmplitude = reducedMotion ? 0 : parameters.nudgeRestraint * minimumDimension * 0.007
    const buildPlanes = (effectiveOverlap: number) => input.items.map((item, index): LightTablePlane => {
        const slot = input.items.length <= 6 && ![3, 4].includes(input.items.length)
            ? explicitSlot(index, input.items.length, input.stageWidth, input.stageHeight, parameters.tableSpread, effectiveOverlap)
            : reviewGridSlot(index, input.items.length, input.stageWidth, input.stageHeight, parameters.tableSpread, effectiveOverlap)
        const size = frameSize(item.ratio, slot.maxWidth, slot.maxHeight)
        const focusWeight = focus.index === index ? focus.weight : 0
        const nudgeX = Math.sin(TAU * temporal.phase * (1 + index % 3)) * nudgeAmplitude * (seeded(index, 31) * 0.5 + 0.5)
        const nudgeY = Math.sin(TAU * temporal.phase * (2 + index % 2)) * nudgeAmplitude * (seeded(index, 37) * 0.45 + 0.35)
        const nudgeRotation = reducedMotion ? 0 : Math.sin(TAU * temporal.phase * (1 + index % 2)) * parameters.nudgeRestraint * (seeded(index, 41) * 0.8 + 0.35)
        const rotationSafety = clamp(Math.min(size.width, size.height) / Math.max(size.width, size.height) * 5, 0, 1)
        const plane: LightTablePlane = {
            id: item.id,
            sourceIndex: index,
            failed: Boolean(item.failed),
            x: rounded(slot.x + nudgeX),
            y: rounded(slot.y + nudgeY - focusWeight * minimumDimension * 0.009),
            width: rounded(size.width),
            height: rounded(size.height),
            rotation: rounded((slot.rotation + nudgeRotation) * rotationSafety),
            scale: rounded(1 + focusWeight * 0.035),
            z: index * 2 + (focusWeight > 0 ? 1_000 : 0),
            focusWeight,
            underlightOpacity: rounded(parameters.underlightStrength * (0.32 + focusWeight * 0.68)),
            underlightExpansion: rounded(1.08 + focusWeight * 0.08),
            opacity: 1,
            filter: "none",
            blend: "normal",
            sourceTimeMs: input.timeMs,
        }
        return plane
    })
    let planes = buildPlanes(parameters.overlap)
    let layout = lightTableLayoutMetrics(planes, input.stageWidth, input.stageHeight)
    if (layout.maximumOcclusion > parameters.overlap) {
        let lower = 0
        let upper = parameters.overlap
        for (let pass = 0; pass < 18; pass += 1) {
            const candidate = (lower + upper) / 2
            const candidatePlanes = buildPlanes(candidate)
            const candidateLayout = lightTableLayoutMetrics(candidatePlanes, input.stageWidth, input.stageHeight)
            if (candidateLayout.maximumOcclusion <= parameters.overlap) lower = candidate
            else upper = candidate
        }
        planes = buildPlanes(lower)
        layout = lightTableLayoutMetrics(planes, input.stageWidth, input.stageHeight)
    }
    const state = {
        sceneId: LIGHT_TABLE_ID as typeof LIGHT_TABLE_ID,
        sceneVersion: LIGHT_TABLE_VERSION as typeof LIGHT_TABLE_VERSION,
        phase: reducedMotion ? 0 : temporal.phase,
        velocity: reducedMotion ? 0 : temporal.velocity,
        segmentId: (focus.segmentId ?? temporal.segmentId) as LightTableFrame["segmentId"],
        topology,
        focusId: focus.index == null ? null : input.items[focus.index].id,
        render: {
            background: { kind: "solid" as const, color: parameters.tableColor },
            opaque: true as const,
            artworkOpacity: 1 as const,
            artworkFilter: "none" as const,
            artworkBlend: "normal" as const,
            underlightPlacement: "sibling-behind-frame" as const,
            tableLuminance: 0.78,
        },
        layout,
        planes,
    }
    return { ...state, stateHash: stableHash(state) }
}

export const lightTableScene = {
    definition: {
        id: LIGHT_TABLE_ID,
        version: LIGHT_TABLE_VERSION,
        name: "Light Table",
        motionSentence: "Prints rest on an opaque illuminated review surface while one exterior loupe moves through the ordered working set.",
    },
    defaults: (): LightTableParameters => ({
        tableSpread: 0.72,
        overlap: 0.1,
        underlightStrength: 0.42,
        focusBehavior: "route",
        nudgeRestraint: 0.28,
        fit: "contain",
        tableColor: "#e8e6de",
    }),
    parameters: validateLightTableParameters,
    compileTimeline: compileLightTableTimeline,
    evaluate: evaluateLightTable,
    controls: [
        { id: "table-spread", owner: "Scene", label: "Table spread", parameter: "tableSpread", kind: "range", min: 0.52, max: 0.92, step: 0.01, resetValue: 0.72 },
        { id: "overlap", owner: "Scene", label: "Overlap", parameter: "overlap", kind: "range", min: 0, max: 0.22, step: 0.01, resetValue: 0.1 },
        { id: "underlight-strength", owner: "Look", label: "Under-light", parameter: "underlightStrength", kind: "range", min: 0, max: 0.7, step: 0.01, resetValue: 0.42 },
        { id: "focus-behaviour", owner: "Scene", label: "Focus", parameter: "focusBehavior", kind: "choice", options: ["route", "loupe-only", "none"], resetValue: "route" },
        { id: "nudge-restraint", owner: "Scene", label: "Nudge restraint", parameter: "nudgeRestraint", kind: "range", min: 0, max: 0.6, step: 0.01, resetValue: 0.28 },
    ] satisfies LightTableControlDescriptor[],
    preview: { fixture: "ordinary-six", representativePhase: 0.5 },
    fixtures: ["one", "two", "five", "ordinary-six", "many-24", "mixed-ratios", "failed-source", "source-video"] as const,
}
