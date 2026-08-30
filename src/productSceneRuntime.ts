import type { ReelConfig, ReelSettings } from "./types"
import { isShelfV2, reconcileShelfConfig } from "./shelfConfig"
import { isVitrineV2, reconcileVitrineConfig } from "./vitrineConfig"

export type ProductUndoKey =
    | "slideHeight"
    | "gap"
    | "tilt"
    | "centerBump"
    | "direction"
    | "sway"
    | "transitionDirection"
    | "showHint"

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

export function productUndoKeys(config: Pick<ReelConfig, "styleId" | "sceneVersion">) {
    if (isShelfV2(config)) return SHELF_UNDO_KEYS
    if (isVitrineV2(config)) return VITRINE_UNDO_KEYS
    return null
}

export function reconcileProductSceneConfig(config: ReelConfig) {
    if (isShelfV2(config)) return reconcileShelfConfig(config)
    if (isVitrineV2(config)) return reconcileVitrineConfig(config)
    return config
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
