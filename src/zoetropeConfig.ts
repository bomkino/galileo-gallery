import type { MediaItem, ReelConfig, ReelSettings, VisualTimelineSegment } from "./types"
import {
    baseZoetropeCycleMs,
    compileZoetropeTimeline,
    minimumZoetropeCycleMs,
    ZOETROPE_MAX_DURATION_MS,
    ZOETROPE_MAX_ITEMS,
    ZOETROPE_MIN_STATION_MS,
    zoetropeScene,
} from "./scenes/zoetrope.ts"

export type ZoetropeRuntimeClock = {
    cycleDurationMs: number
    finalCycleDurationMs: number
    durationMs: number
}

export function isZoetropeV2(config: Pick<ReelConfig, "styleId" | "sceneVersion">) {
    return config.styleId === "zoetrope" && config.sceneVersion === 2
}

function finiteInRange(value: number, minimum: number, maximum: number) {
    return Number.isFinite(value) && value >= minimum && value <= maximum
}

function exactSegmentKeys(segment: VisualTimelineSegment) {
    const keys = Object.keys(segment).sort()
    return keys.length === 5 && keys.join(":") === "cycles:durationMs:id:kind:paceScale"
}

export function zoetropeParametersFromSettings(settings: ReelSettings) {
    return zoetropeScene.parameters({
        cylinderRadius: settings.sway / 100,
        cardSize: settings.slideHeight / 100,
        ringTiltDeg: settings.tilt,
        cadenceCharacter: settings.motionPreset === "velvet" ? "flywheel" : "ratchet",
        direction: settings.direction,
    })
}

export function assertZoetropeFrameIntent(item: MediaItem) {
    if (!finiteInRange(item.ratio, 1 / 10_000, 10_000) || !["image", "video"].includes(item.type)
        || !["auto", "global", "custom"].includes(item.aspectMode ?? "")
        || !finiteInRange(item.ratioW ?? Number.NaN, 1, 10_000)
        || !finiteInRange(item.ratioH ?? Number.NaN, 1, 10_000)
        || !["contain", "cover"].includes(item.fit ?? "")) throw new Error("Zoetrope frame ratio or fit intent is invalid.")
    const crop = item.crop
    const focal = item.focal
    if (!crop || Object.keys(crop).sort().join(":") !== "height:width:x:y"
        || !finiteInRange(crop.x, 0, 1) || !finiteInRange(crop.y, 0, 1)
        || !finiteInRange(crop.width, 1 / 10_000, 1) || !finiteInRange(crop.height, 1 / 10_000, 1)
        || crop.x + crop.width > 1 + 1e-12 || crop.y + crop.height > 1 + 1e-12
        || !focal || Object.keys(focal).sort().join(":") !== "x:y"
        || !finiteInRange(focal.x, 0, 1) || !finiteInRange(focal.y, 0, 1)) throw new Error("Zoetrope crop or focal intent is invalid.")
}

export function effectiveZoetropeRatio(item: MediaItem, settings: ReelSettings) {
    assertZoetropeFrameIntent(item)
    const crop = item.crop!
    let ratio = item.ratio
    if (crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1) {
        ratio *= crop.width / crop.height
    } else if (item.aspectMode === "custom") {
        ratio = item.ratioW! / item.ratioH!
    } else if (item.aspectMode === "global") {
        if (!["auto", "fixed"].includes(settings.ratioMode)) throw new Error("Zoetrope global frame ratio intent is invalid.")
        if (settings.ratioMode === "fixed") {
            if (!["sixteenNine", "wide2576", "custom"].includes(settings.fixedRatio)) throw new Error("Zoetrope global frame ratio intent is invalid.")
            if (settings.fixedRatio === "custom") {
                if (!finiteInRange(settings.customRatioWidth, 1, 10_000) || !finiteInRange(settings.customRatioHeight, 1, 10_000)) {
                    throw new Error("Zoetrope global custom ratio intent is invalid.")
                }
                ratio = settings.customRatioWidth / settings.customRatioHeight
            } else {
                ratio = settings.fixedRatio === "wide2576" ? 2576 / 1080 : 16 / 9
            }
        }
    }
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 10_000) throw new Error("Zoetrope effective frame ratio is invalid.")
    return ratio
}

export function assertZoetropeV2Settings(settings: ReelSettings) {
    zoetropeParametersFromSettings(settings)
    if (!["magnetic", "velvet"].includes(settings.motionPreset)) throw new Error("Zoetrope cadence setting is invalid.")
    if (settings.axis !== "horizontal") throw new Error("Zoetrope uses a fixed horizontal cylinder.")
    if (!Number.isSafeInteger(settings.canvasWidth) || !Number.isSafeInteger(settings.canvasHeight)
        || settings.canvasWidth < 64 || settings.canvasWidth > 7_680 || settings.canvasHeight < 64 || settings.canvasHeight > 7_680
        || settings.canvasWidth % 2 !== 0 || settings.canvasHeight % 2 !== 0) throw new Error("Zoetrope canvas dimensions must be even pixels.")
    if (!Number.isFinite(settings.paceMs) || settings.paceMs < ZOETROPE_MIN_STATION_MS || settings.paceMs > 6_000) throw new Error("Zoetrope station duration is invalid.")
    if (typeof settings.loopVideos !== "boolean" || typeof settings.autoplayVideos !== "boolean") throw new Error("Zoetrope source-video intent is invalid.")
}

export function validateZoetropeRuntimeConfig(config: ReelConfig): ZoetropeRuntimeClock {
    if (!isZoetropeV2(config)) throw new Error("Zoetrope v2 Project identity is required.")
    if (!Array.isArray(config.items) || config.items.length < 1 || config.items.length > ZOETROPE_MAX_ITEMS || config.items.every((item) => item?.muted)) {
        throw new Error("Zoetrope ordered media intent is invalid.")
    }
    const ids = new Set<string>()
    for (const item of config.items) {
        if (!item || typeof item.id !== "string" || item.id.length < 1 || item.id.length > 240 || ids.has(item.id)
            || typeof item.muted !== "boolean" || typeof item.spotlight !== "boolean") throw new Error("Zoetrope ordered media identity is invalid.")
        ids.add(item.id)
    }
    assertZoetropeV2Settings(config.settings)
    config.items.forEach((item) => effectiveZoetropeRatio(item, config.settings))
    const openingMarkers = config.items.filter((item) => item.spotlight && !item.muted)
    if (openingMarkers.length > 1
        || (config.settings.spotlightsEnabled && openingMarkers.length !== 1)
        || (!config.settings.spotlightsEnabled && openingMarkers.length !== 0)) throw new Error("Zoetrope Spotlight intent is invalid.")
    const mediaCount = config.items.filter((item) => !item.muted).length
    const mode = config.timelineMode ?? "automatic"
    const fixedDurationMs = config.timelineFixedDurationMs ?? 0
    const segments = config.timelineSegments ?? []
    if (!["automatic", "fixed-duration", "directed"].includes(mode) || !Array.isArray(segments) || segments.length > 64) throw new Error("Zoetrope Timeline intent is invalid.")
    if (config.settings.playKind !== "loop" && mode === "directed") throw new Error("Finite Zoetrope uses its authored entry, Spotlight hold, ordered advances, finale, and exit; directed segments require Loop playback.")
    if (segments.some((segment) => !exactSegmentKeys(segment))) throw new Error("A directed Zoetrope segment is invalid.")
    const timeline = compileZoetropeTimeline({
        mode,
        mediaCount,
        stationMs: config.settings.paceMs,
        fixedDurationMs,
        segments,
        fps: 30,
    })
    const finalCycleDurationMs = config.settings.playKind === "loop" ? timeline.durationMs : timeline.finiteDurationMs
    const durationMs = config.settings.playKind === "once"
        ? finalCycleDurationMs
        : config.settings.playKind === "repeat"
            ? timeline.durationMs * Math.max(0, config.settings.repeatCount - 1) + finalCycleDurationMs
            : timeline.durationMs
    if (!["once", "repeat", "loop"].includes(config.settings.playKind)
        || !Number.isSafeInteger(config.settings.repeatCount) || config.settings.repeatCount < 1 || config.settings.repeatCount > 1_000
        || !Number.isFinite(durationMs) || durationMs < 1 || durationMs > ZOETROPE_MAX_DURATION_MS) throw new Error("Zoetrope playback intent is invalid.")
    return { cycleDurationMs: timeline.durationMs, finalCycleDurationMs, durationMs }
}

export function reconcileZoetropeConfig(config: ReelConfig): ReelConfig {
    if (!isZoetropeV2(config)) return config
    if (config.items.length > ZOETROPE_MAX_ITEMS) throw new Error(`Zoetrope supports at most ${ZOETROPE_MAX_ITEMS} ordered media items.`)
    if (config.items.length > 0 && config.items.every((item) => item.muted)) throw new Error("Zoetrope needs at least one eligible source.")
    let settings = {
        ...config.settings,
        axis: "horizontal" as const,
        sway: Math.min(48, Math.max(28, Number.isFinite(config.settings.sway) ? config.settings.sway : 39)),
        slideHeight: Math.min(42, Math.max(22, Number.isFinite(config.settings.slideHeight) ? config.settings.slideHeight : 31)),
        tilt: Math.min(8, Math.max(-12, Number.isFinite(config.settings.tilt) ? config.settings.tilt : -4)),
        paceMs: Math.min(6_000, Math.max(ZOETROPE_MIN_STATION_MS, Number.isFinite(config.settings.paceMs) ? config.settings.paceMs : 430)),
        motionPreset: config.settings.motionPreset === "velvet" ? "velvet" as const : "magnetic" as const,
    }
    let items = config.items
    if (settings.spotlightsEnabled) {
        const spotlight = items.find((item) => item.spotlight && !item.muted) ?? items.find((item) => !item.muted)
        items = items.map((item) => ({ ...item, spotlight: item.id === spotlight?.id }))
    } else if (items.some((item) => item.spotlight)) {
        items = items.map((item) => ({ ...item, spotlight: false }))
    }
    const mediaCount = Math.max(1, config.items.filter((item) => !item.muted).length)
    let timelineMode = config.timelineMode ?? "automatic"
    let timelineSegments = config.timelineSegments ?? []
    if (settings.playKind !== "loop" && timelineMode === "directed") {
        timelineMode = "automatic"
        timelineSegments = []
    }
    if (timelineMode === "directed") {
        const maximumPace = Math.max(1, ...timelineSegments.filter((segment) => segment.kind === "cycle" && segment.durationMs === 0).map((segment) => segment.paceScale))
        const safePaceMs = minimumZoetropeCycleMs(mediaCount) * maximumPace / mediaCount
        settings = { ...settings, paceMs: Math.min(6_000, Math.max(settings.paceMs, safePaceMs)) }
        const baseCycleMs = baseZoetropeCycleMs(mediaCount, settings.paceMs)
        const minimumCycleMs = minimumZoetropeCycleMs(mediaCount)
        timelineSegments = timelineSegments.map((segment) => segment.kind === "cycle" && segment.durationMs === 0 && baseCycleMs / segment.paceScale < minimumCycleMs
            ? { ...segment, durationMs: minimumCycleMs * segment.cycles }
            : segment)
    }
    const timelineFixedDurationMs = timelineMode === "fixed-duration"
        ? Math.max(minimumZoetropeCycleMs(mediaCount), config.timelineFixedDurationMs ?? 0)
        : 0
    const next = { ...config, settings, items, timelineMode, timelineFixedDurationMs, timelineSegments }
    validateZoetropeRuntimeConfig(next)
    return next
}
