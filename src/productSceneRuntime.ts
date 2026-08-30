import type { ReelConfig, ReelSettings } from "./types"
import { isShelfV2, reconcileShelfConfig } from "./shelfConfig"
import { isVitrineV2, reconcileVitrineConfig } from "./vitrineConfig"
import { isLightTableV2, validateLightTableRuntimeConfig } from "./lightTableConfig"

export type ProductUndoKey =
    | "slideHeight"
    | "gap"
    | "tilt"
    | "centerBump"
    | "direction"
    | "sway"
    | "transitionDirection"
    | "showHint"
    | "tableSpread"
    | "overlap"
    | "underlightStrength"
    | "focusBehavior"
    | "nudgeRestraint"

export type ProductUndoEntry = {
    key: ProductUndoKey
    value: ReelSettings[ProductUndoKey]
}

const VITRINE_UNDO_KEYS = new Set<keyof ReelSettings>([
    "slideHeight",
    "tilt",
    "sway",
    "transitionDirection",
    "showHint",
])

const SHELF_UNDO_KEYS = new Set<keyof ReelSettings>([
    "slideHeight",
    "gap",
    "tilt",
    "centerBump",
    "direction",
])

const LIGHT_TABLE_UNDO_KEYS = new Set<keyof ReelSettings>([
    "tableSpread",
    "overlap",
    "underlightStrength",
    "focusBehavior",
    "nudgeRestraint",
])

export function productUndoKeys(config: Pick<ReelConfig, "styleId" | "sceneVersion">) {
    if (isLightTableV2(config)) return LIGHT_TABLE_UNDO_KEYS
    if (isShelfV2(config)) return SHELF_UNDO_KEYS
    if (isVitrineV2(config)) return VITRINE_UNDO_KEYS
    return null
}

export function reconcileProductSceneConfig(config: ReelConfig) {
    if (isLightTableV2(config)) return validateLightTableRuntimeConfig(config).config
    if (isShelfV2(config)) return reconcileShelfConfig(config)
    if (isVitrineV2(config)) return reconcileVitrineConfig(config)
    return config
}

export function resetLightTableControls(config: ReelConfig): ReelConfig {
    if (!isLightTableV2(config)) return config
    return validateLightTableRuntimeConfig({
        ...config,
        settings: {
            ...config.settings,
            tableSpread: 0.72,
            overlap: 0.1,
            underlightStrength: 0.42,
            focusBehavior: "route",
            nudgeRestraint: 0.28,
            theme: "light",
            ground: "#e8e6de",
            backgroundStyle: "solid",
        },
        timelineMode: "automatic",
        timelineFixedDurationMs: 0,
        timelineSegments: [],
    }).config
}

export function resetShelfSourceGeometry(config: ReelConfig): ReelConfig {
    if (!isShelfV2(config)) return config
    return {
        ...config,
        settings: {
            ...config.settings,
            ratioMode: "auto",
            axis: "horizontal",
            theme: config.settings.theme === "light" ? "light" : "dark",
            backgroundStyle: config.settings.backgroundStyle === "transparent" ? "transparent" : "solid",
        },
        items: config.items.map((item) => ({ ...item, aspectMode: "auto" as const })),
    }
}
