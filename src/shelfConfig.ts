import type { MediaItem, ReelConfig, ReelSettings } from "./types"
import {
    compileShelfTimeline,
    SHELF_ID,
    SHELF_MAX_DURATION_MS,
    SHELF_MAX_ITEMS,
    SHELF_VERSION,
    shelfScene,
    type CompiledShelfTimeline,
    type ShelfParameters,
} from "./scenes/shelf.ts"

export type ShelfRuntimeClock = {
    cycleDurationMs: number
    finalCycleDurationMs: number
    durationMs: number
}

export function isShelfV2(config: Pick<ReelConfig, "styleId" | "sceneVersion">) {
    return config.styleId === SHELF_ID && config.sceneVersion === SHELF_VERSION
}

function finiteInRange(value: number, minimum: number, maximum: number) {
    return Number.isFinite(value) && value >= minimum && value <= maximum
}

function resolvedCrop(item: MediaItem) {
    const crop = item.crop ?? { x: 0, y: 0, width: 1, height: 1 }
    if (!finiteInRange(crop.x, 0, 1) || !finiteInRange(crop.y, 0, 1)
        || !finiteInRange(crop.width, 1 / 10_000, 1) || !finiteInRange(crop.height, 1 / 10_000, 1)
        || crop.x + crop.width > 1 + 1e-12 || crop.y + crop.height > 1 + 1e-12) {
        throw new Error("Shelf frame crop is invalid.")
    }
    return crop
}

export function effectiveShelfRatio(item: MediaItem, settings: ReelSettings) {
    if (!finiteInRange(item.ratio, 1 / 10_000, 10_000)) throw new Error("Shelf source ratio is invalid.")
    if (item.aspectMode !== "auto" || settings.ratioMode !== "auto") {
        throw new Error("Shelf planes always use each source's natural ratio.")
    }
    if (!finiteInRange(item.ratio, 0.2, 4)) throw new Error("Shelf source ratio must be between 0.2 and 4.")
    return item.ratio
}

export function assertShelfFrameIntent(item: MediaItem, settings: ReelSettings) {
    if (!item || typeof item.id !== "string" || item.id.length < 1 || item.id.length > 240
        || !["image", "video"].includes(item.type) || typeof item.spotlight !== "boolean" || typeof item.muted !== "boolean"
        || !["contain", "cover"].includes(item.fit ?? settings.imageFit)) throw new Error("Shelf ordered frame intent is invalid.")
    resolvedCrop(item)
    const focal = item.focal ?? { x: 0.5, y: 0.5 }
    if (!finiteInRange(focal.x, 0, 1) || !finiteInRange(focal.y, 0, 1)) throw new Error("Shelf frame focal point is invalid.")
    effectiveShelfRatio(item, settings)
}

export function assertShelfV2Settings(settings: ReelSettings) {
    shelfScene.parameters({
        cardHeight: settings.slideHeight / 100,
        gap: settings.gap,
        leanAmount: settings.tilt,
        spotlightLift: settings.centerBump / 100,
        fit: settings.imageFit,
    })
    if (settings.axis !== "horizontal") throw new Error("Shelf uses one fixed horizontal baseline.")
    if (settings.ratioMode !== "auto") throw new Error("Shelf planes always use each source's natural ratio.")
    if (!["dark", "light"].includes(settings.theme) || !["solid", "transparent"].includes(settings.backgroundStyle)) {
        throw new Error("Shelf requires an explicit solid room or clean transparency.")
    }
    if (!Number.isSafeInteger(settings.canvasWidth) || !Number.isSafeInteger(settings.canvasHeight)
        || settings.canvasWidth < 64 || settings.canvasWidth > 7_680 || settings.canvasHeight < 64 || settings.canvasHeight > 7_680
        || settings.canvasWidth % 2 !== 0 || settings.canvasHeight % 2 !== 0) throw new Error("Shelf canvas dimensions must be even pixels.")
    if (!Number.isFinite(settings.paceMs) || settings.paceMs < 180 || settings.paceMs > 8_000) throw new Error("Shelf walking pace is invalid.")
    if (!["forward", "reverse"].includes(settings.direction) || !["once", "repeat", "loop"].includes(settings.playKind)
        || !Number.isSafeInteger(settings.repeatCount) || settings.repeatCount < 1 || settings.repeatCount > 1_000
        || typeof settings.spotlightsEnabled !== "boolean" || typeof settings.finaleEnabled !== "boolean"
        || typeof settings.loopVideos !== "boolean") throw new Error("Shelf playback intent is invalid.")
}

export function shelfParametersForConfig(config: ReelConfig): ShelfParameters {
    return shelfScene.parameters({
        cardHeight: config.settings.slideHeight / 100,
        gap: config.settings.gap,
        leanAmount: config.settings.tilt,
        spotlightLift: config.settings.centerBump / 100,
        fit: config.settings.imageFit,
    })
}

export function shelfTimelineForConfig(config: ReelConfig, fps = 30, mediaCount = config.items.length): CompiledShelfTimeline {
    return compileShelfTimeline({
        mode: config.timelineMode ?? "automatic",
        direction: config.settings.direction,
        mediaCount,
        paceMs: config.settings.paceMs,
        fixedDurationMs: config.timelineFixedDurationMs ?? 0,
        segments: config.timelineSegments ?? [],
        fps,
    })
}

export function shelfFocusIdsForConfig(config: ReelConfig) {
    const eligible = config.items.filter((item) => !item.muted)
    return {
        spotlightId: config.settings.spotlightsEnabled ? eligible.find((item) => item.spotlight)?.id : undefined,
        finaleId: config.settings.finaleEnabled ? eligible.at(-1)?.id : undefined,
    }
}

export function shelfMediaFailureState(source: string | null, failed: boolean, required: boolean) {
    if ((source !== null && typeof source !== "string") || typeof failed !== "boolean" || typeof required !== "boolean") throw new Error("Shelf media readiness is invalid.")
    return failed || (required && (source === null || source.length === 0))
}

export function validateShelfRuntimeConfig(config: ReelConfig): ShelfRuntimeClock {
    if (!isShelfV2(config)) throw new Error("Shelf v2 Project identity is required.")
    if (!Array.isArray(config.items) || config.items.length < 1 || config.items.length > SHELF_MAX_ITEMS) throw new Error("Shelf ordered media intent is invalid.")
    assertShelfV2Settings(config.settings)
    const ids = new Set<string>()
    for (const item of config.items) {
        assertShelfFrameIntent(item, config.settings)
        if (ids.has(item.id)) throw new Error("Shelf ordered media identities must be unique.")
        ids.add(item.id)
    }
    const spotlightMarkers = config.items.filter((item) => item.spotlight)
    if (spotlightMarkers.length > 1 || spotlightMarkers.some((item) => item.muted)
        || (config.settings.spotlightsEnabled && spotlightMarkers.length !== 1)
        || (!config.settings.spotlightsEnabled && spotlightMarkers.length !== 0)) {
        throw new Error("Shelf Spotlight intent is inconsistent.")
    }
    const timeline = shelfTimelineForConfig(config)
    const cycleDurationMs = timeline.durationMs
    const durationMs = config.settings.playKind === "repeat" ? cycleDurationMs * config.settings.repeatCount : cycleDurationMs
    if (!Number.isFinite(durationMs) || durationMs < 1 || durationMs > SHELF_MAX_DURATION_MS) throw new Error("Shelf playback exceeds supported duration.")
    return { cycleDurationMs, finalCycleDurationMs: cycleDurationMs, durationMs }
}

export function exclusiveShelfSpotlight(items: MediaItem[], id: string | null) {
    return items.map((item) => ({
        ...item,
        spotlight: id === item.id,
        ...(id === item.id ? { muted: false } : {}),
    }))
}

export function reconcileShelfConfig(config: ReelConfig): ReelConfig {
    if (!isShelfV2(config)) return config
    if (config.items.length < 1 || config.items.length > SHELF_MAX_ITEMS) throw new Error(`Shelf needs 1–${SHELF_MAX_ITEMS} ordered media items.`)
    let settings = config.settings
    let items = config.items
    if (settings.spotlightsEnabled) {
        const selected = items.find((item) => item.spotlight && !item.muted) ?? items.find((item) => !item.muted)
        if (selected) items = exclusiveShelfSpotlight(items, selected.id)
        else {
            settings = { ...settings, spotlightsEnabled: false }
            items = exclusiveShelfSpotlight(items, null)
        }
    } else if (items.some((item) => item.spotlight)) {
        items = exclusiveShelfSpotlight(items, null)
    }
    const timelineMode = config.timelineMode ?? "automatic"
    let timelineFixedDurationMs = config.timelineFixedDurationMs ?? 0
    let timelineSegments = config.timelineSegments ?? []
    if (timelineMode === "automatic") {
        timelineFixedDurationMs = 0
        timelineSegments = []
    } else if (timelineMode === "fixed-duration") {
        timelineFixedDurationMs = Math.max(1_000, timelineFixedDurationMs)
        timelineSegments = []
    } else {
        timelineFixedDurationMs = 0
    }
    const next = { ...config, settings, items, timelineMode, timelineFixedDurationMs, timelineSegments }
    validateShelfRuntimeConfig(next)
    return next
}
