import type { MediaItem, ReelConfig, ReelSettings, VisualTimelineSegment } from "./types"
import {
    compileVitrineTimeline,
    minimumVitrineFixedDuration,
    VITRINE_MIN_EXCHANGE_MS,
    VITRINE_MIN_HOLD_MS,
    vitrineScene,
} from "./scenes/vitrine.ts"

export const VITRINE_MAX_ITEMS = 127
export const VITRINE_MAX_DURATION_MS = 24 * 60 * 60 * 1_000

export type VitrineRuntimeClock = {
    cycleDurationMs: number
    finalCycleDurationMs: number
    durationMs: number
}

export function isVitrineV2(config: Pick<ReelConfig, "styleId" | "sceneVersion">) {
    return config.styleId === "vitrine" && config.sceneVersion === 2
}

export function assertVitrineV2Settings(settings: ReelSettings) {
    vitrineScene.parameters({
        presentationScale: settings.slideHeight / 100,
        objectTurnAmplitude: settings.tilt,
        transitionDepth: settings.sway / 100,
        direction: settings.direction,
        transitionDirection: settings.transitionDirection,
        placardVisible: settings.showHint,
        fit: settings.imageFit,
    })
    if (settings.axis !== "horizontal") throw new Error("Vitrine uses a fixed horizontal object exchange.")
    if (!Number.isSafeInteger(settings.canvasWidth) || !Number.isSafeInteger(settings.canvasHeight)
        || settings.canvasWidth < 64 || settings.canvasWidth > 7_680 || settings.canvasHeight < 64 || settings.canvasHeight > 7_680
        || settings.canvasWidth % 2 !== 0 || settings.canvasHeight % 2 !== 0) throw new Error("Vitrine canvas dimensions must be even pixels.")
    if (!["solid", "transparent"].includes(settings.backgroundStyle)) throw new Error("Vitrine supports a solid room or clean transparency only.")
    if (!Number.isFinite(settings.holdMs) || settings.holdMs < VITRINE_MIN_HOLD_MS || settings.holdMs > 6_000) throw new Error("Vitrine readable hold is invalid.")
    if (!Number.isFinite(settings.paceMs) || settings.paceMs < VITRINE_MIN_EXCHANGE_MS || settings.paceMs > 1_800) throw new Error("Vitrine exchange duration is invalid.")
}

function finiteInRange(value: number, minimum: number, maximum: number) {
    return Number.isFinite(value) && value >= minimum && value <= maximum
}

export function assertVitrineFrameIntent(item: MediaItem, settings: ReelSettings) {
    if (!finiteInRange(item.ratio, 1 / 10_000, 10_000)
        || !["auto", "global", "custom"].includes(item.aspectMode ?? "")
        || !finiteInRange(item.ratioW ?? Number.NaN, 1, 10_000)
        || !finiteInRange(item.ratioH ?? Number.NaN, 1, 10_000)
        || !["contain", "cover"].includes(item.fit ?? "")) throw new Error("Vitrine frame ratio or fit intent is invalid.")
    const crop = item.crop
    const focal = item.focal
    if (!crop || Object.keys(crop).sort().join(":") !== "height:width:x:y"
        || !finiteInRange(crop.x, 0, 1) || !finiteInRange(crop.y, 0, 1)
        || !finiteInRange(crop.width, 1 / 10_000, 1) || !finiteInRange(crop.height, 1 / 10_000, 1)
        || crop.x + crop.width > 1 + 1e-12 || crop.y + crop.height > 1 + 1e-12
        || !focal || Object.keys(focal).sort().join(":") !== "x:y"
        || !finiteInRange(focal.x, 0, 1) || !finiteInRange(focal.y, 0, 1)) throw new Error("Vitrine crop or focal intent is invalid.")
    const cropped = crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1
    let effectiveRatio = item.ratio
    if (cropped) effectiveRatio *= crop.width / crop.height
    else if (item.aspectMode === "custom") effectiveRatio = (item.ratioW ?? 16) / (item.ratioH ?? 9)
    else if (item.aspectMode === "global" && settings.ratioMode === "fixed") {
        effectiveRatio = settings.fixedRatio === "wide2576" ? 2576 / 1080
            : settings.fixedRatio === "custom" ? settings.customRatioWidth / settings.customRatioHeight : 16 / 9
    }
    if (!finiteInRange(effectiveRatio, 1 / 10_000, 10_000)) throw new Error("Vitrine effective frame ratio is outside the supported range.")
}

function exactSegmentKeys(segment: VisualTimelineSegment) {
    const keys = Object.keys(segment).sort()
    return keys.length === 5 && keys.join(":") === ["cycles", "durationMs", "id", "kind", "paceScale"].join(":")
}

export function validateVitrineRuntimeConfig(config: ReelConfig): VitrineRuntimeClock {
    if (!isVitrineV2(config)) throw new Error("Vitrine v2 Project identity is required.")
    if (config.items.length < 1 || config.items.length > VITRINE_MAX_ITEMS
        || !config.items.every((item) => typeof item.muted === "boolean" && typeof item.spotlight === "boolean")
        || config.items.every((item) => item.muted)) throw new Error("Vitrine ordered media intent is invalid.")
    assertVitrineV2Settings(config.settings)
    config.items.forEach((item) => assertVitrineFrameIntent(item, config.settings))
    const settings = config.settings
    if (typeof settings.loopVideos !== "boolean" || typeof settings.spotlightsEnabled !== "boolean" || typeof settings.finaleEnabled !== "boolean"
        || typeof settings.showHint !== "boolean" || !["once", "repeat", "loop"].includes(settings.playKind)
        || !Number.isSafeInteger(settings.repeatCount) || settings.repeatCount < 1 || settings.repeatCount > 1_000) {
        throw new Error("Vitrine playback intent is invalid.")
    }
    const openingMarkers = config.items.filter((item) => item.spotlight)
    if (openingMarkers.length > 1 || openingMarkers.some((item) => item.muted)
        || (settings.spotlightsEnabled && openingMarkers.length !== 1)
        || (!settings.spotlightsEnabled && openingMarkers.length !== 0)) throw new Error("Vitrine opening-object intent is invalid.")
    const mediaCount = config.items.filter((item) => !item.muted).length
    const baseCycleMs = mediaCount * (settings.holdMs + settings.paceMs)
    const minimumCycleMs = minimumVitrineFixedDuration(mediaCount, settings.holdMs, settings.paceMs)
    const mode = config.timelineMode ?? "automatic"
    const fixedDurationMs = config.timelineFixedDurationMs ?? 0
    const segments = config.timelineSegments ?? []
    if (!["automatic", "fixed-duration", "directed"].includes(mode) || !Array.isArray(segments) || segments.length > 64) throw new Error("Vitrine Timeline intent is invalid.")
    if (settings.playKind !== "loop" && mode === "directed") throw new Error("Finite Vitrine uses its authored entry, hold, exchange, finale, and exit phrase; directed segments require Loop playback.")
    let cycleDurationMs = baseCycleMs
    if (mode === "automatic") {
        if (fixedDurationMs !== 0 || segments.length !== 0) throw new Error("Automatic Vitrine cannot carry fixed or directed intent.")
    } else if (mode === "fixed-duration") {
        if (!Number.isFinite(fixedDurationMs) || fixedDurationMs < Math.max(1_000, minimumCycleMs) || fixedDurationMs > VITRINE_MAX_DURATION_MS || segments.length !== 0) {
            throw new Error("Vitrine fixed duration is invalid.")
        }
        cycleDurationMs = fixedDurationMs
    } else {
        if (fixedDurationMs !== 0 || segments.length < 1) throw new Error("Directed Vitrine needs explicit segments.")
        const ids = new Set<string>()
        cycleDurationMs = 0
        for (const segment of segments) {
            if (!segment || !exactSegmentKeys(segment) || typeof segment.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment.id) || segment.id.length > 120 || ids.has(segment.id)
                || !["cycle", "hold"].includes(segment.kind) || !Number.isSafeInteger(segment.cycles) || segment.cycles < 0 || segment.cycles > 1_000
                || !Number.isFinite(segment.paceScale) || segment.paceScale < 0.05 || segment.paceScale > 20
                || !Number.isFinite(segment.durationMs) || segment.durationMs < 0 || segment.durationMs > VITRINE_MAX_DURATION_MS
                || (segment.kind === "cycle" && segment.cycles < 1) || (segment.kind === "hold" && segment.cycles !== 0)) {
                throw new Error("A directed Vitrine segment is invalid.")
            }
            ids.add(segment.id)
            const durationMs = segment.durationMs > 0
                ? segment.durationMs
                : segment.kind === "hold"
                    ? settings.holdMs
                    : baseCycleMs * segment.cycles / segment.paceScale
            if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > VITRINE_MAX_DURATION_MS
                || (segment.kind === "hold" && durationMs < VITRINE_MIN_HOLD_MS)
                || (segment.kind === "cycle" && durationMs / segment.cycles < minimumCycleMs)) {
                throw new Error("A directed Vitrine segment erases readable time.")
            }
            cycleDurationMs += durationMs
        }
        if (cycleDurationMs > VITRINE_MAX_DURATION_MS) throw new Error("Directed Vitrine exceeds the supported duration.")
    }
    const finalCycleDurationMs = cycleDurationMs
    const durationMs = settings.playKind === "repeat" ? cycleDurationMs * settings.repeatCount : cycleDurationMs
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > VITRINE_MAX_DURATION_MS) throw new Error("Vitrine playback exceeds the supported duration.")
    return { cycleDurationMs, finalCycleDurationMs, durationMs }
}

function reconcileDirectedSegments(config: ReelConfig, settings: ReelSettings, mediaCount: number) {
    const source = config.timelineSegments ?? []
    const inferredPaceScale = Math.max(1, ...source.filter((segment) => segment.kind === "cycle" && segment.durationMs === 0).map((segment) => segment.paceScale))
    const factor = Math.max(1, VITRINE_MIN_HOLD_MS * inferredPaceScale / settings.holdMs, VITRINE_MIN_EXCHANGE_MS * inferredPaceScale / settings.paceMs)
    const holdMs = Math.ceil(settings.holdMs * factor)
    const paceMs = Math.ceil(settings.paceMs * factor)
    if (holdMs > 6_000 || paceMs > 1_800) throw new Error("Directed Vitrine speed would erase its readable hold.")
    const nextSettings = { ...settings, holdMs, paceMs }
    const minimumCycleMs = minimumVitrineFixedDuration(mediaCount, holdMs, paceMs)
    const segments: VisualTimelineSegment[] = source.map((segment) => {
        if (segment.durationMs === 0) return segment
        return segment.kind === "hold"
            ? { ...segment, durationMs: Math.max(VITRINE_MIN_HOLD_MS, segment.durationMs) }
            : { ...segment, durationMs: Math.max(minimumCycleMs * segment.cycles, segment.durationMs) }
    })
    return { settings: nextSettings, segments }
}

export function reconcileVitrineConfig(config: ReelConfig): ReelConfig {
    if (!isVitrineV2(config)) return config
    if (config.items.length > VITRINE_MAX_ITEMS) throw new Error(`Vitrine supports at most ${VITRINE_MAX_ITEMS} ordered media items.`)
    if (config.items.length > 0 && config.items.every((item) => item.muted)) throw new Error("Vitrine needs at least one eligible opening/finale object.")
    let settings = config.settings
    let items = config.items
    if (settings.spotlightsEnabled) {
        const opening = items.find((item) => item.spotlight && !item.muted) ?? firstEligibleVitrineItem(items)
        if (opening) items = exclusiveVitrineOpening(items, opening.id)
        else settings = { ...settings, spotlightsEnabled: false }
    } else if (items.some((item) => item.spotlight)) {
        items = exclusiveVitrineOpening(items, null)
    }
    assertVitrineV2Settings(settings)
    items.forEach((item) => assertVitrineFrameIntent(item, settings))
    const mediaCount = Math.max(1, items.filter((item) => !item.muted).length)
    let timelineMode = config.timelineMode ?? "automatic"
    let segments = config.timelineSegments ?? []
    if (settings.playKind !== "loop" && timelineMode === "directed") {
        timelineMode = "automatic"
        segments = []
    }
    if (timelineMode === "directed") ({ settings, segments } = reconcileDirectedSegments(config, settings, mediaCount))
    const fixedMinimum = minimumVitrineFixedDuration(mediaCount, settings.holdMs, settings.paceMs)
    const timelineFixedDurationMs = timelineMode === "fixed-duration"
        ? Math.max(fixedMinimum, config.timelineFixedDurationMs ?? 0)
        : 0
    const next = { ...config, settings, items, timelineMode, timelineFixedDurationMs, timelineSegments: segments }
    compileVitrineTimeline({
        mode: next.timelineMode ?? "automatic",
        mediaCount,
        holdMs: settings.holdMs,
        exchangeMs: settings.paceMs,
        fixedDurationMs: timelineFixedDurationMs,
        segments,
        fps: 30,
    })
    return next
}

export function exclusiveVitrineOpening(items: MediaItem[], id: string | null) {
    return items.map((item) => ({
        ...item,
        spotlight: id === item.id,
        ...(id === item.id ? { muted: false } : {}),
    }))
}

export function firstEligibleVitrineItem(items: MediaItem[]) {
    return items.find((item) => !item.muted) ?? null
}
