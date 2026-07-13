import { styleProfile } from "./styleProfiles"
import type { MediaItem, ReelConfig } from "./types"

type StoryEvent = {
    index: number
    kind: "spotlight" | "finale"
    rawPhase: number
    holdMs: number
    flourishMs: number
}

export type SceneClock = {
    rawPhase: number
    heldIndex: number | null
    heldKind: StoryEvent["kind"] | null
    flourish: number
}

function clamp(value: number, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value))
}

function fract(value: number) {
    return value - Math.floor(value)
}

function smootherstep(value: number) {
    const amount = clamp(value)
    return amount * amount * amount * (amount * (amount * 6 - 15) + 10)
}

export function sceneFinaleIndex(items: MediaItem[]) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
        if (!items[index].muted) return index
    }
    return Math.max(0, items.length - 1)
}

function eventRawPhase(styleId: string, index: number, count: number, reverse: boolean) {
    if (styleId === "before-after-slider") return 0.25
    if (styleId === "the-build") return (index + 0.72) / Math.max(1, count)
    if (styleId === "slide-anatomy-object") return (index + 0.5) / Math.max(1, count)
    const displayPhase = index / Math.max(1, count)
    return reverse ? fract(1 - displayPhase) : displayPhase
}

function storyEvents(config: ReelConfig): StoryEvent[] {
    const profile = styleProfile(config.styleId)
    const items = config.items
    if (!items.length) return []
    const settings = config.settings
    const reverse = settings.direction === "reverse"
    const finaleIndex = sceneFinaleIndex(items)
    const events: StoryEvent[] = []

    if (profile.supportsSpotlight && settings.spotlightsEnabled) {
        items.forEach((item, index) => {
            const authoredSingleObject = ["the-build", "slide-anatomy-object"].includes(config.styleId)
            if (!item.spotlight || item.muted || (index === finaleIndex && !authoredSingleObject)) return
            events.push({
                index,
                kind: "spotlight",
                rawPhase: eventRawPhase(config.styleId, index, items.length, reverse),
                holdMs: Math.max(0, settings.holdMs),
                flourishMs: 0,
            })
        })
    }

    if (profile.supportsFinale && settings.finaleEnabled && !items[finaleIndex]?.muted) {
        events.push({
            index: finaleIndex,
            kind: "finale",
            rawPhase: eventRawPhase(config.styleId, finaleIndex, items.length, reverse),
            holdMs: Math.max(0, settings.finaleGrowMs + settings.finaleHoldMs),
            flourishMs: Math.max(1, settings.finaleGrowMs),
        })
    }

    return events.sort((a, b) => a.rawPhase - b.rawPhase || a.index - b.index)
}

function terminalEvent(config: ReelConfig): StoryEvent {
    const items = config.items
    const index = sceneFinaleIndex(items)
    const finale = styleProfile(config.styleId).supportsFinale && config.settings.finaleEnabled
    return {
        index,
        kind: "finale",
        rawPhase: eventRawPhase(config.styleId, index, Math.max(1, items.length), config.settings.direction === "reverse"),
        holdMs: finale ? Math.max(0, config.settings.finaleGrowMs + config.settings.finaleHoldMs) : 0,
        flourishMs: finale ? Math.max(1, config.settings.finaleGrowMs) : 1,
    }
}

export function sceneDurationMs(config: ReelConfig, baseDurationMs: number, terminal: boolean) {
    if (terminal) {
        const event = terminalEvent(config)
        const travel = Math.max(baseDurationMs * 0.35, baseDurationMs * event.rawPhase)
        return Math.round(travel + event.holdMs)
    }
    return Math.round(baseDurationMs + storyEvents(config).reduce((sum, event) => sum + event.holdMs, 0))
}

export function sceneClock(config: ReelConfig, timeMs: number, baseDurationMs: number, terminal: boolean): SceneClock {
    if (terminal) {
        const event = terminalEvent(config)
        const travel = Math.max(baseDurationMs * 0.35, baseDurationMs * event.rawPhase)
        const elapsed = clamp(timeMs, 0, travel + event.holdMs)
        if (elapsed < travel) {
            return {
                rawPhase: event.rawPhase * smootherstep(elapsed / Math.max(1, travel)),
                heldIndex: null,
                heldKind: null,
                flourish: 0,
            }
        }
        return {
            rawPhase: event.rawPhase,
            heldIndex: event.index,
            heldKind: event.kind,
            flourish: clamp((elapsed - travel) / event.flourishMs),
        }
    }

    const events = storyEvents(config)
    const total = baseDurationMs + events.reduce((sum, event) => sum + event.holdMs, 0)
    let elapsed = ((timeMs % Math.max(1, total)) + total) % total
    let previousBaseTime = 0

    for (const event of events) {
        const eventBaseTime = event.rawPhase * baseDurationMs
        const travel = Math.max(0, eventBaseTime - previousBaseTime)
        if (elapsed < travel) {
            return { rawPhase: (previousBaseTime + elapsed) / Math.max(1, baseDurationMs), heldIndex: null, heldKind: null, flourish: 0 }
        }
        elapsed -= travel
        if (elapsed < event.holdMs) {
            return {
                rawPhase: event.rawPhase,
                heldIndex: event.index,
                heldKind: event.kind,
                flourish: event.kind === "finale" ? clamp(elapsed / event.flourishMs) : 0,
            }
        }
        elapsed -= event.holdMs
        previousBaseTime = eventBaseTime
    }

    return {
        rawPhase: clamp((previousBaseTime + elapsed) / Math.max(1, baseDurationMs)),
        heldIndex: null,
        heldKind: null,
        flourish: 0,
    }
}
