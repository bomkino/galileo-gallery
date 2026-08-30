import type { ReelConfig } from "../../types"
import type { ParityControl, ParitySceneContract } from "./types.ts"
import { authoredParameters, parityItems, stableFrameHash } from "./types.ts"

export type A03Evaluator = {
    DEFAULTS: Readonly<Record<string, number | string | boolean>>
    CONTROL_BOUNDS: Readonly<Record<string, readonly [number, number]>>
    compileTimeline(input: Record<string, unknown>): { durationMs: number }
    evaluate(input: Record<string, unknown>): { phase: number; cards: Array<Record<string, unknown>> }
}

type A03SceneOptions = {
    id: string
    sourcePath: string
    sourceSha256: string
    evaluator: A03Evaluator
    recommendedItems: number
    cardSizeReference: number
    paceReference: number
}

const finite = (value: unknown, fallback = 0) => Number.isFinite(value) ? Number(value) : fallback

function sourceItems(config: ReelConfig, recommendedItems: number) {
    return parityItems(config, recommendedItems).slice(0, 127).map((item) => ({
        id: item.id,
        ratio: item.ratio || 16 / 9,
        label: item.name,
        failed: false,
        video: item.type === "video",
        alpha: item.type === "image" && /\.png($|\?)/i.test(item.url),
    }))
}

export function createA03Scene(options: A03SceneOptions): ParitySceneContract {
    const { evaluator } = options
    const controls: ParityControl[] = Object.entries(evaluator.CONTROL_BOUNDS)
        .filter(([id]) => id !== "fixedDurationMs")
        .map(([id, [min, max]]) => ({
            id,
            parameter: id,
            label: id.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase()),
            type: "range",
            default: evaluator.DEFAULTS[id] as number,
            min,
            max,
            step: Number.isInteger(min) && Number.isInteger(max) ? 1 : 0.01,
        }))
    const controlsFor = (config: ReelConfig, reducedMotion = false) => {
        const mapped = { ...evaluator.DEFAULTS, direction: config.settings.direction, reducedMotion }
        if ("cardSize" in mapped) {
            const [min, max] = evaluator.CONTROL_BOUNDS.cardSize
            mapped.cardSize = Math.min(max, Math.max(min, config.settings.slideHeight * Number(evaluator.DEFAULTS.cardSize) / options.cardSizeReference))
        }
        return authoredParameters(config, mapped)
    }
    const timelineFor = (config: ReelConfig, reducedMotion = false) => {
        const controlsValue = controlsFor(config, reducedMotion)
        const automatic = evaluator.compileTimeline({ ...controlsValue, mode: "automatic" })
        if (config.timelineMode === "directed") return evaluator.compileTimeline({ ...controlsValue, mode: "directed" })
        const requested = config.timelineMode === "fixed-duration"
            ? config.timelineFixedDurationMs ?? automatic.durationMs
            : automatic.durationMs * config.settings.paceMs / options.paceReference
        if (Math.abs(requested - automatic.durationMs) < 0.5) return automatic
        const bounds = evaluator.CONTROL_BOUNDS.fixedDurationMs ?? [1, 60_000]
        return evaluator.compileTimeline({ ...controlsValue, mode: "fixed-duration", fixedDurationMs: Math.min(bounds[1], Math.max(bounds[0], requested)) })
    }
    return {
        id: options.id,
        atelier: "A03",
        sourcePath: options.sourcePath,
        sourceSha256: options.sourceSha256,
        recommendedItems: options.recommendedItems,
        maximumItems: 127,
        looping: false,
        alphaSupported: true,
        defaultParameters: evaluator.DEFAULTS,
        controls,
        durationMs(config) {
            return timelineFor(config).durationMs
        },
        evaluate({ config, timeMs, reducedMotion = false, terminal = false }) {
            const items = sourceItems(config, options.recommendedItems)
            const controlsValue = controlsFor(config, reducedMotion)
            const timeline = timelineFor(config, reducedMotion)
            const storyTimeMs = terminal ? timeline.durationMs : Math.min(Math.max(0, timeMs), timeline.durationMs)
            const frame = evaluator.evaluate({
                items,
                stage: { width: Math.max(1, config.settings.canvasWidth), height: Math.max(1, config.settings.canvasHeight) },
                controls: controlsValue,
                timeMs: storyTimeMs,
            })
            const width = Math.max(1, config.settings.canvasWidth)
            const height = Math.max(1, config.settings.canvasHeight)
            const zOrder = [...frame.cards].sort((left, right) => finite(left.zIndex) - finite(right.zIndex))
            const zById = new Map(zOrder.map((card, index) => [String(card.id), index + 1]))
            const cards = frame.cards.map((card, index) => {
                const sourceIndex = Math.max(0, Math.min(items.length - 1, Math.round(finite(card.sourceIndex, index))))
                const cardWidth = finite(card.width, width * 0.25)
                const cardHeight = finite(card.height, cardWidth / Math.max(0.05, items[sourceIndex]?.ratio ?? 16 / 9))
                const anchored = Number.isFinite(card.bottomX) && Number.isFinite(card.bottomY)
                return {
                    id: String(card.id ?? `${options.id}-${index}`),
                    sourceIndex,
                    x: finite(anchored ? card.bottomX : card.x, width / 2) / width * 100,
                    y: (finite(anchored ? card.bottomY : card.y, height / 2) - (anchored ? cardHeight / 2 : 0)) / height * 100,
                    width: cardWidth / width * 100,
                    height: cardHeight / height * 100,
                    scale: finite(card.scale, 1),
                    rotation: finite(card.angleDeg, 0),
                    rotateY: finite(card.rotateYDeg, 0),
                    z: zById.get(String(card.id)) ?? index + 1,
                    opacity: finite(card.containerOpacity, 1),
                    visible: card.visible !== false,
                    filter: String(card.artworkFilter ?? "none"),
                    blend: String(card.blendMode ?? "normal"),
                    transformOrigin: anchored ? "50% 100%" : undefined,
                    sourceTimeMs: storyTimeMs,
                }
            })
            return {
                sceneId: options.id,
                durationMs: timeline.durationMs,
                phase: finite(frame.phase, 0),
                terminal,
                cards,
                opaque: false,
                stateHash: stableFrameHash({ phase: frame.phase, cards }),
            }
        },
    }
}
