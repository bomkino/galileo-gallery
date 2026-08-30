import type { TimelineMode, VisualTimelineSegment } from "../types"

export const SHELF_ID = "the-shelf"
export const SHELF_VERSION = 2
export const SHELF_MAX_ITEMS = 127
export const SHELF_MAX_DURATION_MS = 24 * 60 * 60 * 1_000
export const SHELF_OBSERVATION_GUARD = 48

export type ShelfParameters = {
    cardHeight: number
    gap: number
    leanAmount: number
    spotlightLift: number
    fit: "contain" | "cover"
}

export type ShelfEvaluationItem = {
    id: string
    ratio: number
    caption?: string
    failed?: boolean
}

export type ShelfTimelineIntent = {
    mode: TimelineMode
    direction: "forward" | "reverse"
    mediaCount: number
    paceMs: number
    fixedDurationMs: number
    segments: VisualTimelineSegment[]
    fps: number
}

export type CompiledShelfTimelineSegment = VisualTimelineSegment & {
    startMs: number
    endMs: number
    startCycle: number
    endCycle: number
}

export type CompiledShelfTimeline = {
    mode: TimelineMode
    direction: "forward" | "reverse"
    durationMs: number
    frameCount: number
    cycleCount: number
    segments: CompiledShelfTimelineSegment[]
}

export type ShelfRenderSlot = {
    slotId: string
    id: string
    sourceIndex: number
    copyIndex: -1 | 0 | 1
    x: number
    bottomY: number
    width: number
    height: number
    baseLeanDeg: number
    leanDeg: number
    lift: number
    focusProgress: number
    visible: boolean
    opacity: 1
    filter: "none"
    blend: "normal"
}

export type ShelfFrame = {
    sceneId: typeof SHELF_ID
    sceneVersion: typeof SHELF_VERSION
    phrase: "empty" | "single-still" | "walking-loop" | "directed-hold" | "entry" | "walking-to-spotlight" | "spotlight-hold" | "walking-to-finale" | "finale-hold" | "exit" | "reduced-motion-settled"
    segmentId: string
    phase: number
    velocity: number
    count: number
    baselineY: number | null
    trackLength: number
    naturalTrackLength: number
    effectiveGap: number
    currentFocusId: string | null
    focusProgress: number
    maxObservedNodes: 12 | 18
    overflowedObservedSlots: number
    duplicateProjectMedia: boolean
    sourceStates: Array<{
        id: string
        sourceIndex: number
        ratio: number
        baseLeanDeg: number
        failed: boolean
        active: boolean
        opacity: 1
        filter: "none"
        blend: "normal"
    }>
    slots: ShelfRenderSlot[]
    stateHash: string
    render: {
        fit: "contain" | "cover"
        artworkOpacity: 1
        artworkFilter: "none"
        artworkBlend: "normal"
    }
}

export type ShelfEvaluationInput = {
    items: ShelfEvaluationItem[]
    parameters: ShelfParameters
    timeline: CompiledShelfTimeline
    timeMs: number
    stageWidth: number
    stageHeight: number
    terminal?: boolean
    reducedMotion?: boolean
    spotlightId?: string
    finaleId?: string
}

export type ShelfSeamRecord = {
    id: string
    sourceIndex: number
    width: number
    trackLength: number
    exitPhase: number
    nextEntryPhase: number
    previousRightAtExit: number
    nextLeftAtExit: number
    nextLeftAtEntry: number
    previousRightAtEntry: number
    seamOutsideVisibleStage: boolean
}

export function selectShelfLiveVideoIds(slots: ShelfRenderSlot[], media: Array<Pick<{ id: string; type: "image" | "video" }, "id" | "type">>, stageWidth: number) {
    if (!Array.isArray(slots) || !Array.isArray(media) || !Number.isFinite(stageWidth) || stageWidth < 1) throw new Error("Shelf video observation is invalid.")
    const seen = new Set<string>()
    return slots
        .filter((slot) => slot.visible && media[slot.sourceIndex]?.type === "video" && media[slot.sourceIndex]?.id === slot.id)
        .sort((left, right) => Math.abs(left.x - stageWidth / 2) - Math.abs(right.x - stageWidth / 2) || left.sourceIndex - right.sourceIndex)
        .filter((slot) => {
            if (seen.has(slot.id)) return false
            seen.add(slot.id)
            return true
        })
        .slice(0, 2)
        .map((slot) => slot.id)
}

type ShelfLayout = {
    baselineY: number
    trackLength: number
    naturalTrackLength: number
    effectiveGap: number
    cards: Array<{
        id: string
        sourceIndex: number
        ratio: number
        width: number
        height: number
        centre: number
        baseLeanDeg: number
        maximumLeftExtent: number
        maximumRightExtent: number
        failed: boolean
    }>
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))
const positiveModulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor

function rounded(value: number) {
    const next = Math.round(value * 1_000_000) / 1_000_000
    return Object.is(next, -0) ? 0 : next
}

function minimumJerk(value: number) {
    const amount = clamp(value, 0, 1)
    return amount * amount * amount * (amount * (amount * 6 - 15) + 10)
}

function smoothstep(value: number) {
    const amount = clamp(value, 0, 1)
    return amount * amount * (3 - 2 * amount)
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

function identityLean(id: string, amount: number) {
    if (amount === 0) return 0
    let hash = 0x811c9dc5
    for (let index = 0; index < id.length; index += 1) {
        hash ^= id.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    const unsigned = hash >>> 0
    const raw = unsigned / 0xffffffff * 2 - 1
    const sign = raw < 0 ? -1 : 1
    const placement = sign * Math.max(0.18, Math.abs(raw))
    return rounded(placement * amount)
}

function horizontalOffsets(width: number, height: number, leanDeg: number) {
    const radians = leanDeg * Math.PI / 180
    const bottomExtent = Math.abs(Math.cos(radians)) * width / 2
    const topShift = Math.sin(radians) * height
    return {
        left: bottomExtent + Math.max(0, -topShift),
        right: bottomExtent + Math.max(0, topShift),
    }
}

function maximumHorizontalOffsets(width: number, height: number, leanDeg: number) {
    const settled = horizontalOffsets(width, height, 0)
    const leaned = horizontalOffsets(width, height, leanDeg)
    return {
        left: Math.max(settled.left, leaned.left),
        right: Math.max(settled.right, leaned.right),
    }
}

function exactSegmentKeys(segment: VisualTimelineSegment) {
    const keys = Object.keys(segment).sort()
    return keys.length === 5 && keys.join(":") === ["cycles", "durationMs", "id", "kind", "paceScale"].join(":")
}

function automaticDuration(mediaCount: number, paceMs: number) {
    return clamp(Math.max(1, mediaCount) * paceMs, 8_000, 42_000)
}

function normalizedSegments(intent: ShelfTimelineIntent, baseCycleMs: number): VisualTimelineSegment[] {
    if (intent.mode === "automatic") {
        if (intent.fixedDurationMs !== 0 || intent.segments.length !== 0) throw new Error("Automatic Shelf cannot contain fixed or directed intent.")
        return [{ id: "automatic-cycle", kind: "cycle", cycles: 1, paceScale: 1, durationMs: baseCycleMs }]
    }
    if (intent.mode === "fixed-duration") {
        if (!Number.isFinite(intent.fixedDurationMs) || intent.fixedDurationMs < 1_000 || intent.fixedDurationMs > SHELF_MAX_DURATION_MS || intent.segments.length !== 0) {
            throw new Error("Shelf fixed duration is invalid.")
        }
        return [{ id: "fixed-cycle", kind: "cycle", cycles: 1, paceScale: baseCycleMs / intent.fixedDurationMs, durationMs: intent.fixedDurationMs }]
    }
    if (intent.fixedDurationMs !== 0 || intent.segments.length < 1 || intent.segments.length > 64) throw new Error("Directed Shelf needs explicit segments.")
    const ids = new Set<string>()
    return intent.segments.map((segment) => {
        if (!segment || !exactSegmentKeys(segment) || typeof segment.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment.id) || segment.id.length > 120 || ids.has(segment.id)
            || !["cycle", "hold"].includes(segment.kind) || !Number.isSafeInteger(segment.cycles) || segment.cycles < 0 || segment.cycles > 1_000
            || !Number.isFinite(segment.paceScale) || segment.paceScale < 0.05 || segment.paceScale > 20
            || !Number.isFinite(segment.durationMs) || segment.durationMs < 0 || segment.durationMs > SHELF_MAX_DURATION_MS
            || (segment.kind === "cycle" && segment.cycles < 1) || (segment.kind === "hold" && segment.cycles !== 0)) {
            throw new Error("A directed Shelf segment is invalid.")
        }
        ids.add(segment.id)
        const durationMs = segment.durationMs > 0
            ? segment.durationMs
            : segment.kind === "hold"
                ? Math.max(250, intent.paceMs)
                : baseCycleMs * segment.cycles / segment.paceScale
        if (!Number.isFinite(durationMs) || durationMs < 1 || durationMs > SHELF_MAX_DURATION_MS) throw new Error("A directed Shelf segment duration is invalid.")
        return { ...segment, durationMs }
    })
}

export function compileShelfTimeline(intent: ShelfTimelineIntent): CompiledShelfTimeline {
    if (!intent || !["automatic", "fixed-duration", "directed"].includes(intent.mode)) throw new Error("Shelf Timeline mode is invalid.")
    if (!["forward", "reverse"].includes(intent.direction)) throw new Error("Shelf direction is invalid.")
    if (!Number.isSafeInteger(intent.mediaCount) || intent.mediaCount < 0 || intent.mediaCount > SHELF_MAX_ITEMS) throw new Error("Shelf media count must be between 0 and 127.")
    if (!Number.isFinite(intent.paceMs) || intent.paceMs < 180 || intent.paceMs > 8_000) throw new Error("Shelf walking pace is invalid.")
    if (!Number.isFinite(intent.fps) || intent.fps < 1 || intent.fps > 120) throw new Error("Shelf frame rate is invalid.")
    if (!Array.isArray(intent.segments)) throw new Error("Shelf Timeline segments are invalid.")
    const baseCycleMs = automaticDuration(intent.mediaCount, intent.paceMs)
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
    if (!Number.isFinite(elapsed) || elapsed < 1 || elapsed > SHELF_MAX_DURATION_MS) throw new Error("Shelf Timeline exceeds supported duration.")
    return {
        mode: intent.mode,
        direction: intent.direction,
        durationMs: elapsed,
        frameCount: Math.max(1, Math.ceil(elapsed / 1_000 * intent.fps)),
        cycleCount: cycles,
        segments,
    }
}

export function validateCompiledShelfTimeline(timeline: CompiledShelfTimeline) {
    if (!timeline || !["automatic", "fixed-duration", "directed"].includes(timeline.mode)
        || !["forward", "reverse"].includes(timeline.direction)
        || !Number.isFinite(timeline.durationMs) || timeline.durationMs < 1 || timeline.durationMs > SHELF_MAX_DURATION_MS
        || !Number.isSafeInteger(timeline.frameCount) || timeline.frameCount < 1
        || !Number.isSafeInteger(timeline.cycleCount) || timeline.cycleCount < 0
        || !Array.isArray(timeline.segments) || timeline.segments.length < 1 || timeline.segments.length > 64) {
        throw new Error("Shelf compiled Timeline is invalid.")
    }
    const ids = new Set<string>()
    let elapsed = 0
    let cycles = 0
    for (const segment of timeline.segments) {
        if (!segment || typeof segment.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment.id) || ids.has(segment.id)
            || !["cycle", "hold"].includes(segment.kind)
            || !Number.isSafeInteger(segment.cycles) || segment.cycles < 0 || segment.cycles > 1_000
            || !Number.isFinite(segment.paceScale) || segment.paceScale <= 0
            || !Number.isFinite(segment.durationMs) || segment.durationMs < 1 || segment.durationMs > SHELF_MAX_DURATION_MS
            || !Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs)
            || !Number.isSafeInteger(segment.startCycle) || !Number.isSafeInteger(segment.endCycle)
            || Math.abs(segment.startMs - elapsed) > 1e-6 || segment.endMs <= segment.startMs
            || Math.abs(segment.endMs - segment.startMs - segment.durationMs) > 1e-6
            || segment.startCycle !== cycles || segment.endCycle !== segment.startCycle + segment.cycles
            || (segment.kind === "cycle" && segment.cycles < 1) || (segment.kind === "hold" && segment.cycles !== 0)) {
            throw new Error("Shelf compiled Timeline segment is invalid.")
        }
        ids.add(segment.id)
        elapsed = segment.endMs
        cycles = segment.endCycle
    }
    const onlySegment = timeline.segments[0]
    if ((timeline.mode === "automatic" && (timeline.segments.length !== 1 || onlySegment.id !== "automatic-cycle" || onlySegment.kind !== "cycle" || onlySegment.cycles !== 1 || onlySegment.paceScale !== 1))
        || (timeline.mode === "fixed-duration" && (timeline.segments.length !== 1 || onlySegment.id !== "fixed-cycle" || onlySegment.kind !== "cycle" || onlySegment.cycles !== 1))
        || (timeline.mode === "directed" && timeline.segments.some((segment) => segment.paceScale < 0.05 || segment.paceScale > 20))) {
        throw new Error("Shelf compiled Timeline mode is inconsistent.")
    }
    if (Math.abs(elapsed - timeline.durationMs) > 1e-6 || cycles !== timeline.cycleCount) throw new Error("Shelf compiled Timeline totals are invalid.")
    return timeline
}

export function shelfStoryTimeMs(timeMs: number, durationMs: number, direction: "forward" | "reverse", terminal = false) {
    if (!Number.isFinite(timeMs) || !Number.isFinite(durationMs) || durationMs <= 0 || !["forward", "reverse"].includes(direction)) {
        throw new Error("Shelf story clock is invalid.")
    }
    const raw = terminal ? clamp(timeMs, 0, durationMs) : positiveModulo(timeMs, durationMs)
    if (direction === "forward") return raw
    if (terminal) return durationMs - raw
    return raw === 0 ? 0 : durationMs - raw
}

export function evaluateShelfTimeline(timeline: CompiledShelfTimeline, timeMs: number, terminal = false) {
    validateCompiledShelfTimeline(timeline)
    const localTime = shelfStoryTimeMs(timeMs, timeline.durationMs, timeline.direction, terminal)
    const atEnd = terminal && localTime === timeline.durationMs
    const segment = (atEnd ? timeline.segments.at(-1) : timeline.segments.find((candidate) => localTime < candidate.endMs)) ?? timeline.segments.at(-1)
    if (!segment) throw new Error("Shelf Timeline has no compiled segment.")
    const duration = Math.max(1, segment.endMs - segment.startMs)
    const progress = clamp((localTime - segment.startMs) / duration, 0, 1)
    const cycle = segment.startCycle + segment.cycles * progress
    const directionSign = timeline.direction === "reverse" ? -1 : 1
    return {
        phase: rounded(positiveModulo(cycle, 1)),
        velocity: segment.kind === "hold" ? 0 : directionSign * segment.cycles / duration,
        segmentId: segment.id,
        holding: segment.kind === "hold",
    }
}

export function validateShelfParameters(input: ShelfParameters): ShelfParameters {
    if (!input || !["contain", "cover"].includes(input.fit)) throw new Error("Shelf fit is invalid.")
    if (!Number.isFinite(input.cardHeight) || input.cardHeight < 0.28 || input.cardHeight > 0.58) throw new Error("Shelf card height is invalid.")
    if (!Number.isFinite(input.gap) || input.gap < 8 || input.gap > 120) throw new Error("Shelf gap is invalid.")
    if (!Number.isFinite(input.leanAmount) || input.leanAmount < 0 || input.leanAmount > 6) throw new Error("Shelf lean amount is invalid.")
    if (!Number.isFinite(input.spotlightLift) || input.spotlightLift < 0.03 || input.spotlightLift > 0.14) throw new Error("Shelf Spotlight lift is invalid.")
    return input
}

function validateItems(items: ShelfEvaluationItem[]) {
    if (!Array.isArray(items) || items.length > SHELF_MAX_ITEMS) throw new Error("Shelf ordered media is invalid.")
    const ids = new Set<string>()
    for (const item of items) {
        if (!item || typeof item.id !== "string" || item.id.length < 1 || item.id.length > 240 || ids.has(item.id)
            || !Number.isFinite(item.ratio) || item.ratio < 0.2 || item.ratio > 4
            || (item.caption !== undefined && typeof item.caption !== "string") || (item.failed !== undefined && typeof item.failed !== "boolean")) {
            throw new Error("Shelf ordered media is invalid.")
        }
        ids.add(item.id)
    }
}

function createShelfLayout(items: ShelfEvaluationItem[], parameters: ShelfParameters, stageWidth: number, stageHeight: number): ShelfLayout {
    const portrait = stageWidth < stageHeight
    const nominalHeight = stageHeight * parameters.cardHeight
    const widthLimit = stageWidth * (portrait ? 0.82 : 0.58)
    const maximumRatio = items.reduce((maximum, item) => Math.max(maximum, item.ratio), 0)
    const rowHeight = Math.min(nominalHeight, widthLimit / maximumRatio)
    const dimensions = items.map((item) => {
        const width = rowHeight * item.ratio
        const baseLeanDeg = identityLean(item.id, parameters.leanAmount)
        const maximumOffsets = maximumHorizontalOffsets(width, rowHeight, baseLeanDeg)
        return { width, height: rowHeight, baseLeanDeg, maximumOffsets }
    })
    const naturalTrackLength = dimensions.reduce((sum, value) => sum + value.width, 0) + items.length * parameters.gap
    const maximumLeftExtent = dimensions.reduce((maximum, value) => Math.max(maximum, value.maximumOffsets.left), 0)
    const maximumRightExtent = dimensions.reduce((maximum, value) => Math.max(maximum, value.maximumOffsets.right), 0)
    const maximumObservedWidth = maximumLeftExtent + maximumRightExtent
    const minimumLoop = stageWidth + maximumObservedWidth + 2 * SHELF_OBSERVATION_GUARD + 1
    const observationBound = portrait ? 12 : 18
    const minimumCentreStride = (stageWidth + 2 * SHELF_OBSERVATION_GUARD + maximumObservedWidth + 1) / observationBound
    const densityGap = dimensions.reduce((minimumGap, value, index) => {
        const next = dimensions[(index + 1) % Math.max(1, dimensions.length)] ?? value
        return Math.max(minimumGap, minimumCentreStride - (value.width + next.width) / 2)
    }, parameters.gap)
    const densityTrackLength = dimensions.reduce((sum, value) => sum + value.width, 0) + items.length * densityGap
    const trackLength = items.length <= 1 ? naturalTrackLength : Math.max(naturalTrackLength, minimumLoop, densityTrackLength)
    const effectiveGap = items.length ? parameters.gap + Math.max(0, trackLength - naturalTrackLength) / items.length : parameters.gap
    let cursor = 0
    const cards = items.map((item, sourceIndex) => {
        const dimensionsForItem = dimensions[sourceIndex]
        const centre = cursor + dimensionsForItem.width / 2
        cursor += dimensionsForItem.width + effectiveGap
        return {
            id: item.id,
            sourceIndex,
            ratio: item.ratio,
            width: dimensionsForItem.width,
            height: dimensionsForItem.height,
            centre,
            baseLeanDeg: dimensionsForItem.baseLeanDeg,
            maximumLeftExtent: dimensionsForItem.maximumOffsets.left,
            maximumRightExtent: dimensionsForItem.maximumOffsets.right,
            failed: item.failed === true,
        }
    })
    return {
        baselineY: stageHeight * (portrait ? 0.78 : 0.8),
        trackLength,
        naturalTrackLength,
        effectiveGap,
        cards,
    }
}

export function inspectShelfSeams(items: ShelfEvaluationItem[], parameters: ShelfParameters, stageWidth: number, stageHeight: number): ShelfSeamRecord[] {
    validateItems(items)
    validateShelfParameters(parameters)
    if (!Number.isFinite(stageWidth) || stageWidth < 1 || !Number.isFinite(stageHeight) || stageHeight < 1) throw new Error("Shelf Project canvas is invalid.")
    if (items.length <= 1) return []
    const layout = createShelfLayout(items, parameters, stageWidth, stageHeight)
    return layout.cards.map((card) => {
        const offsets = horizontalOffsets(card.width, card.height, card.baseLeanDeg)
        const observedWidth = offsets.left + offsets.right
        const exitPhase = (card.centre + offsets.right) / layout.trackLength
        const nextEntryPhase = (card.centre + layout.trackLength - offsets.left - stageWidth) / layout.trackLength
        const previousRightAtExit = 0
        const nextLeftAtExit = layout.trackLength - observedWidth
        const nextLeftAtEntry = stageWidth
        const previousRightAtEntry = stageWidth - layout.trackLength + observedWidth
        return {
            id: card.id,
            sourceIndex: card.sourceIndex,
            width: rounded(observedWidth),
            trackLength: rounded(layout.trackLength),
            exitPhase: rounded(exitPhase),
            nextEntryPhase: rounded(nextEntryPhase),
            previousRightAtExit,
            nextLeftAtExit: rounded(nextLeftAtExit),
            nextLeftAtEntry,
            previousRightAtEntry: rounded(previousRightAtEntry),
            seamOutsideVisibleStage: nextLeftAtExit >= stageWidth && previousRightAtEntry <= 0,
        }
    })
}

function focusIndex(items: ShelfEvaluationItem[], id: string | undefined) {
    if (!id) return null
    const found = items.findIndex((item) => item.id === id)
    return found >= 0 ? found : null
}

function finitePose(input: ShelfEvaluationInput, layout: ShelfLayout) {
    const duration = input.timeline.durationMs
    const storyTimeMs = shelfStoryTimeMs(input.timeMs, duration, input.timeline.direction, true)
    const normalized = clamp(storyTimeMs / Math.max(1, duration), 0, 1)
    const spotlightFocusIndex = focusIndex(input.items, input.spotlightId)
    const finaleFocusIndex = focusIndex(input.items, input.finaleId)
    const spotlightAnchorIndex = spotlightFocusIndex ?? 0
    const finaleAnchorIndex = finaleFocusIndex ?? Math.max(0, input.items.length - 1)
    const alignmentOffset = (index: number) => input.stageWidth / 2 - layout.cards[index].centre
    const spotlightOffset = alignmentOffset(spotlightAnchorIndex)
    const finaleOffset = alignmentOffset(finaleAnchorIndex)
    const firstVisibleOffset = input.stageWidth * 0.72 - layout.cards[0].centre
    const rowLeft = layout.cards.reduce((left, card) => Math.min(left, card.centre - card.maximumLeftExtent), Number.POSITIVE_INFINITY)
    const rowRight = layout.cards.reduce((right, card) => Math.max(right, card.centre + card.maximumRightExtent), Number.NEGATIVE_INFINITY)
    const entryOffset = input.stageWidth + SHELF_OBSERVATION_GUARD - rowLeft + 1
    const exitOffset = -rowRight - SHELF_OBSERVATION_GUARD - 1
    let phrase: ShelfFrame["phrase"]
    let translationX = entryOffset
    let currentFocusIndex: number | null = null
    let focusProgress = 0
    if (normalized < 0.1) {
        phrase = "entry"
        translationX = entryOffset + (firstVisibleOffset - entryOffset) * minimumJerk(normalized / 0.1)
    } else if (normalized < 0.46) {
        phrase = "walking-to-spotlight"
        const progress = (normalized - 0.1) / 0.36
        translationX = firstVisibleOffset + (spotlightOffset - firstVisibleOffset) * minimumJerk(progress)
        if (spotlightFocusIndex !== null) {
            focusProgress = smoothstep((progress - 0.78) / 0.22)
            if (focusProgress > 0) currentFocusIndex = spotlightFocusIndex
        }
    } else if (normalized < 0.72) {
        phrase = "spotlight-hold"
        translationX = spotlightOffset
        currentFocusIndex = spotlightFocusIndex
        focusProgress = spotlightFocusIndex === null ? 0 : 1
    } else if (normalized < 0.86) {
        phrase = "walking-to-finale"
        const progress = (normalized - 0.72) / 0.14
        translationX = spotlightOffset + (finaleOffset - spotlightOffset) * minimumJerk(progress)
        if (progress < 0.2 && spotlightFocusIndex !== null) {
            currentFocusIndex = spotlightFocusIndex
            focusProgress = 1 - smoothstep(progress / 0.2)
        } else if (progress > 0.8 && finaleFocusIndex !== null) {
            currentFocusIndex = finaleFocusIndex
            focusProgress = smoothstep((progress - 0.8) / 0.2)
        }
    } else if (normalized < 0.96) {
        phrase = "finale-hold"
        translationX = finaleOffset
        currentFocusIndex = finaleFocusIndex
        focusProgress = finaleFocusIndex === null ? 0 : 1
    } else {
        phrase = "exit"
        const progress = (normalized - 0.96) / 0.04
        translationX = finaleOffset + (exitOffset - finaleOffset) * minimumJerk(progress)
        if (finaleFocusIndex !== null) {
            currentFocusIndex = finaleFocusIndex
            focusProgress = 1 - smoothstep(progress)
        }
    }
    return {
        phrase,
        phase: positiveModulo(-translationX / layout.trackLength, 1),
        translationX,
        wrapped: false,
        currentFocusIndex,
        focusProgress,
        segmentId: `finite-${phrase}`,
        velocity: 0,
    }
}

export function evaluateShelf(input: ShelfEvaluationInput): ShelfFrame {
    const parameters = validateShelfParameters(input.parameters)
    validateItems(input.items)
    if (!Number.isFinite(input.stageWidth) || input.stageWidth < 1 || !Number.isFinite(input.stageHeight) || input.stageHeight < 1) throw new Error("Shelf Project canvas is invalid.")
    if (!Number.isFinite(input.timeMs)) throw new Error("Shelf story time is invalid.")
    validateCompiledShelfTimeline(input.timeline)
    const render = { fit: parameters.fit, artworkOpacity: 1 as const, artworkFilter: "none" as const, artworkBlend: "normal" as const }
    const maxObservedNodes = (input.stageWidth < input.stageHeight ? 12 : 18) as 12 | 18
    if (input.items.length === 0) {
        const empty: Omit<ShelfFrame, "stateHash"> = {
            sceneId: SHELF_ID,
            sceneVersion: SHELF_VERSION,
            phrase: "empty",
            segmentId: "empty",
            phase: 0,
            velocity: 0,
            count: 0,
            baselineY: null,
            trackLength: 0,
            naturalTrackLength: 0,
            effectiveGap: parameters.gap,
            currentFocusId: null,
            focusProgress: 0,
            maxObservedNodes,
            overflowedObservedSlots: 0,
            duplicateProjectMedia: false,
            sourceStates: [],
            slots: [],
            render,
        }
        return { ...empty, stateHash: stableHash(empty) }
    }

    const layout = createShelfLayout(input.items, parameters, input.stageWidth, input.stageHeight)
    if (input.items.length === 1) {
        const card = layout.cards[0]
        const slot: ShelfRenderSlot = {
            slotId: `${card.id}:0`, id: card.id, sourceIndex: 0, copyIndex: 0,
            x: rounded(input.stageWidth / 2), bottomY: rounded(layout.baselineY), width: rounded(card.width), height: rounded(card.height),
            baseLeanDeg: card.baseLeanDeg, leanDeg: card.baseLeanDeg, lift: 0, focusProgress: 0, visible: true,
            opacity: 1, filter: "none", blend: "normal",
        }
        const single: Omit<ShelfFrame, "stateHash"> = {
            sceneId: SHELF_ID, sceneVersion: SHELF_VERSION, phrase: "single-still", segmentId: "single-still", phase: 0, velocity: 0,
            count: 1, baselineY: rounded(layout.baselineY), trackLength: rounded(layout.trackLength), naturalTrackLength: rounded(layout.naturalTrackLength), effectiveGap: rounded(layout.effectiveGap),
            currentFocusId: null, focusProgress: 0, maxObservedNodes, overflowedObservedSlots: 0, duplicateProjectMedia: false,
            sourceStates: [{ id: card.id, sourceIndex: 0, ratio: card.ratio, baseLeanDeg: card.baseLeanDeg, failed: card.failed, active: true, opacity: 1, filter: "none", blend: "normal" }],
            slots: [slot], render,
        }
        return { ...single, stateHash: stableHash(single) }
    }

    let pose: {
        phrase: ShelfFrame["phrase"]
        phase: number
        translationX: number
        wrapped: boolean
        currentFocusIndex: number | null
        focusProgress: number
        segmentId: string
        velocity: number
    }
    if (input.reducedMotion) {
        const focus = focusIndex(input.items, input.spotlightId)
        const anchor = focus ?? 0
        const phase = positiveModulo((layout.cards[anchor].centre - input.stageWidth / 2) / layout.trackLength, 1)
        pose = {
            phrase: "reduced-motion-settled",
            phase,
            translationX: -phase * layout.trackLength,
            wrapped: true,
            currentFocusIndex: focus,
            focusProgress: focus === null ? 0 : 1,
            segmentId: "reduced-motion-settled",
            velocity: 0,
        }
    } else if (input.terminal) {
        pose = finitePose(input, layout)
    } else {
        const temporal = evaluateShelfTimeline(input.timeline, input.timeMs)
        pose = {
            phrase: temporal.holding ? "directed-hold" : "walking-loop",
            phase: temporal.phase,
            translationX: -temporal.phase * layout.trackLength,
            wrapped: true,
            currentFocusIndex: null,
            focusProgress: 0,
            segmentId: temporal.segmentId,
            velocity: temporal.velocity,
        }
    }

    const candidates: ShelfRenderSlot[] = []
    for (const card of layout.cards) {
        const focusProgress = pose.currentFocusIndex === card.sourceIndex ? pose.focusProgress : 0
        const lift = input.stageHeight * parameters.spotlightLift * focusProgress
        const bottomY = layout.baselineY - lift
        const leanDeg = card.baseLeanDeg * (1 - focusProgress)
        const offsets = horizontalOffsets(card.width, card.height, leanDeg)
        const copyIndices = pose.wrapped ? [-1, 0, 1] as const : [0] as const
        for (const copyIndex of copyIndices) {
            const x = card.centre + pose.translationX + copyIndex * layout.trackLength
            const left = x - offsets.left
            const right = x + offsets.right
            if (right < -SHELF_OBSERVATION_GUARD || left > input.stageWidth + SHELF_OBSERVATION_GUARD) continue
            candidates.push({
                slotId: `${card.id}:${copyIndex}`,
                id: card.id,
                sourceIndex: card.sourceIndex,
                copyIndex,
                x: rounded(x),
                bottomY: rounded(bottomY),
                width: rounded(card.width),
                height: rounded(card.height),
                baseLeanDeg: card.baseLeanDeg,
                leanDeg: rounded(leanDeg),
                lift: rounded(lift),
                focusProgress: rounded(focusProgress),
                visible: right >= 0 && left <= input.stageWidth,
                opacity: 1,
                filter: "none",
                blend: "normal",
            })
        }
    }
    const ranked = [...candidates].sort((left, right) => Number(right.visible) - Number(left.visible)
        || Math.abs(left.x - input.stageWidth / 2) - Math.abs(right.x - input.stageWidth / 2)
        || left.sourceIndex - right.sourceIndex || left.copyIndex - right.copyIndex)
    const slots = ranked.slice(0, maxObservedNodes).sort((left, right) => left.sourceIndex - right.sourceIndex || left.copyIndex - right.copyIndex)
    const visibleIds = slots.filter((slot) => slot.visible).map((slot) => slot.id)
    const duplicateProjectMedia = new Set(visibleIds).size !== visibleIds.length
    const activeIds = new Set(slots.map((slot) => slot.id))
    const sourceStates = layout.cards.map((card) => ({
        id: card.id,
        sourceIndex: card.sourceIndex,
        ratio: card.ratio,
        baseLeanDeg: card.baseLeanDeg,
        failed: card.failed,
        active: activeIds.has(card.id),
        opacity: 1 as const,
        filter: "none" as const,
        blend: "normal" as const,
    }))
    const frame: Omit<ShelfFrame, "stateHash"> = {
        sceneId: SHELF_ID,
        sceneVersion: SHELF_VERSION,
        phrase: pose.phrase,
        segmentId: pose.segmentId,
        phase: rounded(pose.phase),
        velocity: rounded(pose.velocity),
        count: input.items.length,
        baselineY: rounded(layout.baselineY),
        trackLength: rounded(layout.trackLength),
        naturalTrackLength: rounded(layout.naturalTrackLength),
        effectiveGap: rounded(layout.effectiveGap),
        currentFocusId: pose.currentFocusIndex === null ? null : input.items[pose.currentFocusIndex].id,
        focusProgress: rounded(pose.focusProgress),
        maxObservedNodes,
        overflowedObservedSlots: Math.max(0, candidates.length - slots.length),
        duplicateProjectMedia,
        sourceStates,
        slots,
        render,
    }
    return { ...frame, stateHash: stableHash(frame) }
}

export const shelfScene = Object.freeze({
    id: SHELF_ID,
    version: SHELF_VERSION,
    name: "Shelf",
    defaults: (): ShelfParameters => ({ cardHeight: 0.42, gap: 34, leanAmount: 2.5, spotlightLift: 0.08, fit: "contain" }),
    parameters: validateShelfParameters,
    compileTimeline: compileShelfTimeline,
    evaluate: evaluateShelf,
})
