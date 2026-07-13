import type { MediaItem, ReelConfig, ReelSettings } from "./types"
import { styleCycleDuration, styleProfile } from "./styleProfiles"
import { sceneDurationMs } from "./storyTiming"

const MOTION = {
    cut: { launch: 70, arrival: 85, grow: 260 },
    magnetic: { launch: 120, arrival: 160, grow: 420 },
    velvet: { launch: 180, arrival: 280, grow: 560 },
    dream: { launch: 260, arrival: 480, grow: 820 },
} as const

function fixedRatio(settings: ReelSettings) {
    if (settings.fixedRatio === "wide2576") return 2576 / 1080
    if (settings.fixedRatio === "custom") {
        return Math.max(1, settings.customRatioWidth) / Math.max(1, settings.customRatioHeight)
    }
    return 16 / 9
}

function itemRatio(item: MediaItem, settings: ReelSettings) {
    if (item.aspectMode === "custom") {
        return Math.max(1, item.ratioW ?? 16) / Math.max(1, item.ratioH ?? 9)
    }
    if (item.aspectMode === "global" && settings.ratioMode === "fixed") {
        return fixedRatio(settings)
    }
    return item.ratio || 16 / 9
}

function resolvedMotion(settings: ReelSettings) {
    if (settings.motionPreset === "custom") {
        return {
            launch: settings.launchMs,
            arrival: settings.arrivalMs,
            grow: settings.growMs,
        }
    }
    return MOTION[settings.motionPreset]
}

export function reelTimeline(
    items: MediaItem[],
    settings: ReelSettings,
    width: number,
    height: number
): { durationMs: number } {
    const source = items.length > 0 ? items : placeholderItems()
    const imageHeight = Math.max(40, (height * settings.slideHeight) / 100)
    const imageWidths = source.map((item) => imageHeight * itemRatio(item, settings))
    const cardWidths = imageWidths.map((imageWidth) => {
        const scale = settings.paddingUnit === "percent" ? imageWidth / 100 : 1
        return imageWidth + (settings.paddingLeft + settings.paddingRight) * scale
    })
    const centers: number[] = []
    let cursor = 0
    for (const cardWidth of cardWidths) {
        centers.push(cursor + cardWidth / 2)
        cursor += cardWidth + settings.gap
    }

    let finale = source.length - 1
    for (let index = source.length - 1; index >= 0; index -= 1) {
        if (!source[index].muted) {
            finale = index
            break
        }
    }

    const heroes = source
        .map((item, index) => ({ item, index }))
        .filter(({ item, index }) => index < finale && item.spotlight && !item.muted)
        .map(({ index }) => index)
    heroes.push(finale)

    const motion = resolvedMotion(settings)
    const stride = Math.max(1, cursor / source.length)
    let position = centers[0] - (width / 2 + cardWidths[0] / 2 + width * 0.1 + 120)
    let time = Math.max(0, settings.leadInMs)

    for (const index of heroes) {
        const crossed = Math.max(1, (centers[index] - position) / stride)
        const minimumTravel = Math.max(240, motion.launch + motion.arrival + 80)
        const travelDuration = Math.max(minimumTravel, crossed * settings.paceMs)
        time += travelDuration
        position = centers[index]
        const terminalWithoutFinale = index === finale && !settings.finaleEnabled
        const isFinale = index === finale && settings.finaleEnabled
        const growDuration = terminalWithoutFinale ? 120 : isFinale ? settings.finaleGrowMs : motion.grow
        time += growDuration + (terminalWithoutFinale ? 0 : isFinale ? settings.finaleHoldMs : settings.holdMs)
    }

    return { durationMs: Math.ceil(time + (settings.playKind === "once" ? 0 : 750)) }
}

export function reelDurationMs(
    items: MediaItem[],
    settings: ReelSettings,
    width: number,
    height: number
): number {
    return reelTimeline(items, settings, width, height).durationMs
}

export function studioTimeline(
    config: ReelConfig,
    width: number,
    height: number
): { durationMs: number } {
    if (config.styleId === "opening-reel") {
        return reelTimeline(config.items, config.settings, width, height)
    }

    const settings = config.settings
    const profile = styleProfile(config.styleId)
    const visibleCount = config.items.length || profile.recommendedItems
    const baseDuration = styleCycleDuration(config.styleId, visibleCount, settings)
    return { durationMs: sceneDurationMs(config, baseDuration, settings.playKind === "once") }
}

export function placeholderItems(count = 14): MediaItem[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `placeholder-${index}`,
        name: `Scene ${String(index + 1).padStart(2, "0")}`,
        type: "image" as const,
        url: "",
        ratio: 16 / 9,
        aspectMode: "auto" as const,
        ratioW: 16,
        ratioH: 9,
        spotlight: false,
        muted: false,
    }))
}
