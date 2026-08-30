import type { MediaItem, ReelConfig, ReelSettings } from "./types"
import {
    compileLightTableTimeline,
    LIGHT_TABLE_ID,
    LIGHT_TABLE_MAX_ITEMS,
    LIGHT_TABLE_TRANSPARENCY_REASON,
    LIGHT_TABLE_VERSION,
    lightTableScene,
    type CompiledLightTableTimeline,
    type LightTableParameters,
    type LightTableSource,
} from "./scenes/lightTable.ts"

export type LightTableSettingsExtension = {
    tableSpread?: number
    overlap?: number
    underlightStrength?: number
    focusBehavior?: "route" | "loupe-only" | "none"
    nudgeRestraint?: number
}

export type LightTableRuntimeConfig = ReelConfig & {
    settings: ReelSettings & LightTableSettingsExtension
}

export type ValidatedLightTableRuntime = {
    config: LightTableRuntimeConfig
    parameters: LightTableParameters
    timeline: CompiledLightTableTimeline
    sources: LightTableSource[]
}

function finiteInRange(value: number, minimum: number, maximum: number) {
    return Number.isFinite(value) && value >= minimum && value <= maximum
}

export function isLightTableV2(config: Pick<ReelConfig, "styleId" | "sceneVersion">) {
    return config.styleId === LIGHT_TABLE_ID && config.sceneVersion === LIGHT_TABLE_VERSION
}

export function lightTableTimelineMediaCount(itemCount: number, cataloguePreview = false) {
    if (!Number.isSafeInteger(itemCount) || itemCount < 0 || itemCount > LIGHT_TABLE_MAX_ITEMS) throw new Error("Light Table media count is invalid.")
    return itemCount > 0 ? itemCount : cataloguePreview ? 6 : 1
}

export function assertLightTableOpaqueIntent(backgroundStyle: ReelSettings["backgroundStyle"]) {
    if (backgroundStyle === "transparent") throw new Error(LIGHT_TABLE_TRANSPARENCY_REASON)
    if (!["solid", "gradient", "halo", "paper"].includes(backgroundStyle)) throw new Error("Light Table background intent is invalid.")
}

function validatedCrop(item: MediaItem) {
    const crop = item.crop
    if (!crop) return { x: 0, y: 0, width: 1, height: 1 }
    if (Object.keys(crop).sort().join(":") !== "height:width:x:y"
        || !finiteInRange(crop.x, 0, 1) || !finiteInRange(crop.y, 0, 1)
        || !finiteInRange(crop.width, 1 / 10_000, 1) || !finiteInRange(crop.height, 1 / 10_000, 1)
        || crop.x + crop.width > 1 + 1e-12 || crop.y + crop.height > 1 + 1e-12) {
        throw new Error("Light Table crop intent is invalid.")
    }
    return crop
}

export function validateLightTableFrameIntent(item: MediaItem, settings: ReelSettings) {
    if (!item || typeof item.id !== "string" || item.id.length < 1 || item.id.length > 256
        || !finiteInRange(item.ratio, 0.05, 20)
        || !["auto", "global", "custom"].includes(item.aspectMode ?? "auto")
        || !finiteInRange(item.ratioW ?? 16, 1, 10_000)
        || !finiteInRange(item.ratioH ?? 9, 1, 10_000)
        || !["contain", "cover"].includes(item.fit ?? settings.imageFit)) {
        throw new Error("Light Table frame ratio or fit intent is invalid.")
    }
    const focal = item.focal ?? { x: 0.5, y: 0.5 }
    if (Object.keys(focal).sort().join(":") !== "x:y" || !finiteInRange(focal.x, 0, 1) || !finiteInRange(focal.y, 0, 1)) {
        throw new Error("Light Table focal intent is invalid.")
    }
    validatedCrop(item)
}

export function resolvedLightTableRatio(item: MediaItem, settings: ReelSettings) {
    validateLightTableFrameIntent(item, settings)
    const crop = validatedCrop(item)
    let ratio = item.ratio
    if (crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1) ratio = item.ratio * crop.width / crop.height
    else if (item.aspectMode === "custom") ratio = (item.ratioW ?? 16) / (item.ratioH ?? 9)
    else if (item.aspectMode === "global" && settings.ratioMode === "fixed") {
        if (settings.fixedRatio === "wide2576") ratio = 2576 / 1080
        else if (settings.fixedRatio === "custom") {
            if (!finiteInRange(settings.customRatioWidth, 1, 10_000) || !finiteInRange(settings.customRatioHeight, 1, 10_000)) throw new Error("Light Table global frame ratio is invalid.")
            ratio = settings.customRatioWidth / settings.customRatioHeight
        } else ratio = 16 / 9
    }
    if (!finiteInRange(ratio, 0.05, 20)) throw new Error("Light Table effective frame ratio is invalid.")
    return ratio
}

export function lightTableParametersFromConfig(config: ReelConfig): LightTableParameters {
    const settings = config.settings as ReelSettings & LightTableSettingsExtension
    const defaults = lightTableScene.defaults()
    return lightTableScene.parameters({
        tableSpread: settings.tableSpread ?? defaults.tableSpread,
        overlap: settings.overlap ?? defaults.overlap,
        underlightStrength: settings.underlightStrength ?? defaults.underlightStrength,
        focusBehavior: settings.focusBehavior ?? defaults.focusBehavior,
        nudgeRestraint: settings.nudgeRestraint ?? defaults.nudgeRestraint,
        fit: settings.imageFit,
        tableColor: settings.ground || defaults.tableColor,
    })
}

export function lightTableSourcesFromConfig(config: ReelConfig, failedIds: ReadonlySet<string> = new Set()): LightTableSource[] {
    return config.items.map((item) => ({
        id: item.id,
        ratio: resolvedLightTableRatio(item, config.settings),
        type: item.type,
        ...(failedIds.has(item.id) ? { failed: true } : {}),
    }))
}

export function lightTableTimelineFromConfig(config: ReelConfig, fps = 30, mediaCount = config.items.length) {
    return compileLightTableTimeline({
        mode: config.timelineMode ?? "automatic",
        direction: config.settings.direction,
        mediaCount,
        fixedDurationMs: config.timelineFixedDurationMs ?? 0,
        segments: config.timelineSegments ?? [],
        fps,
    })
}

export function withLightTableDefaults(config: ReelConfig): LightTableRuntimeConfig {
    if (!isLightTableV2(config)) throw new Error("Light Table v2 config identity is invalid.")
    const defaults = lightTableScene.defaults()
    const settings = config.settings as ReelSettings & LightTableSettingsExtension
    return {
        ...config,
        settings: {
            ...settings,
            tableSpread: settings.tableSpread ?? defaults.tableSpread,
            overlap: settings.overlap ?? defaults.overlap,
            underlightStrength: settings.underlightStrength ?? defaults.underlightStrength,
            focusBehavior: settings.focusBehavior ?? defaults.focusBehavior,
            nudgeRestraint: settings.nudgeRestraint ?? defaults.nudgeRestraint,
        },
    }
}

export function validateLightTableRuntimeConfig(config: ReelConfig, fps = 30): ValidatedLightTableRuntime {
    if (!isLightTableV2(config)) throw new Error("Light Table v2 config identity is invalid.")
    assertLightTableOpaqueIntent(config.settings.backgroundStyle)
    if (config.items.length < 1) throw new Error("Light Table needs at least one source.")
    if (config.items.length > LIGHT_TABLE_MAX_ITEMS) throw new Error("Light Table shows up to 24 sources in v2. All Project media remain preserved.")
    if (!Number.isSafeInteger(config.settings.canvasWidth) || !Number.isSafeInteger(config.settings.canvasHeight)
        || config.settings.canvasWidth < 64 || config.settings.canvasWidth > 7_680
        || config.settings.canvasHeight < 64 || config.settings.canvasHeight > 7_680) {
        throw new Error("Light Table canvas dimensions are invalid.")
    }
    const ids = new Set<string>()
    for (const item of config.items) {
        validateLightTableFrameIntent(item, config.settings)
        if (ids.has(item.id)) throw new Error("Light Table source identities must be unique.")
        ids.add(item.id)
    }
    const normalized = withLightTableDefaults(config)
    const parameters = lightTableParametersFromConfig(normalized)
    const sources = lightTableSourcesFromConfig(normalized)
    const timeline = lightTableTimelineFromConfig(normalized, fps)
    return { config: normalized, parameters, timeline, sources }
}
