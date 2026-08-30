import type { ReelConfig } from "../../types"
import type { ParityControl, ParitySceneContract } from "./types.ts"
import { authoredParameters, parityItems, stableFrameHash } from "./types.ts"

export type A04Evaluator = {
    DEFAULTS: Readonly<Record<string, number | string | boolean>>
    CONTROL_BOUNDS: Readonly<Record<string, readonly [number | string | boolean, number | string | boolean]>>
    compileTimeline(input: Record<string, unknown>): { durationSeconds: number }
}

type A04Frame = { phase?: number; phrase?: string; renderSlots: Array<Record<string, unknown>> }

type A04SceneOptions = {
    id: string
    sourcePath: string
    sourceSha256: string
    evaluator: A04Evaluator
    evaluate(input: Record<string, unknown>): A04Frame
    recommendedItems: number
    sizeKey: string
    sizeReference: number
    paceReference: number
    gapReference?: number
    yIsTop?: boolean
    alphaSupported?: boolean
}

const finite = (value: unknown, fallback = 0) => Number.isFinite(value) ? Number(value) : fallback

function sourceItems(config: ReelConfig, recommendedItems: number) {
    return parityItems(config, recommendedItems).slice(0, 127).map((item) => ({
        id: item.id,
        ratio: item.ratio || 16 / 9,
        kind: item.type,
        label: item.name,
        caption: item.caption,
        durationSeconds: item.type === "video" ? 12 : null,
        failed: false,
        alpha: item.type === "image" && /\.png($|\?)/i.test(item.url),
    }))
}

export function createA04Scene(options: A04SceneOptions): ParitySceneContract {
    const { evaluator } = options
    const controls: ParityControl[] = Object.entries(evaluator.CONTROL_BOUNDS).map(([id, bounds]) => {
        const [first, second] = bounds
        if (typeof first === "number" && typeof second === "number") return {
            id,
            parameter: id,
            label: id.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase()),
            type: "range" as const,
            default: evaluator.DEFAULTS[id],
            min: first,
            max: second,
            step: Number.isInteger(first) && Number.isInteger(second) ? 1 : 0.01,
        }
        return {
            id,
            parameter: id,
            label: id.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase()),
            type: "choice" as const,
            default: evaluator.DEFAULTS[id],
            options: [first, second],
        }
    })
    const parametersFor = (config: ReelConfig) => {
        const mapped: Record<string, number | string | boolean> = { ...evaluator.DEFAULTS }
        const bounds = evaluator.CONTROL_BOUNDS[options.sizeKey]
        if (bounds && typeof bounds[0] === "number" && typeof bounds[1] === "number") {
            const value = config.settings.slideHeight * Number(evaluator.DEFAULTS[options.sizeKey]) / options.sizeReference
            mapped[options.sizeKey] = Math.min(bounds[1], Math.max(bounds[0], value))
        }
        if (options.gapReference && "gap" in mapped) {
            const gapBounds = evaluator.CONTROL_BOUNDS.gap
            const value = config.settings.gap * Number(evaluator.DEFAULTS.gap) / options.gapReference
            if (typeof gapBounds?.[0] === "number" && typeof gapBounds[1] === "number") mapped.gap = Math.min(gapBounds[1], Math.max(gapBounds[0], value))
        }
        if ("direction" in mapped) mapped.direction = config.settings.direction
        if ("transitionDirection" in mapped) mapped.transitionDirection = config.settings.transitionDirection
        return authoredParameters(config, mapped)
    }
    const timelineFor = (config: ReelConfig) => {
        const items = sourceItems(config, options.recommendedItems)
        const parameters = parametersFor(config)
        const common = { mediaCount: items.length, orbitPace: parameters.orbitPace ?? 1, fps: 30 }
        const automatic = evaluator.compileTimeline({ ...common, mode: "automatic" })
        const requestedMs = config.timelineMode === "fixed-duration"
            ? config.timelineFixedDurationMs ?? automatic.durationSeconds * 1000
            : automatic.durationSeconds * 1000 * config.settings.paceMs / options.paceReference
        if (Math.abs(requestedMs - automatic.durationSeconds * 1000) < 0.5) return automatic
        return evaluator.compileTimeline({ ...common, mode: "fixed-duration", fixedDurationSeconds: Math.min(60, Math.max(0.5, requestedMs / 1000)) })
    }
    return {
        id: options.id,
        atelier: "A04",
        sourcePath: options.sourcePath,
        sourceSha256: options.sourceSha256,
        recommendedItems: options.recommendedItems,
        maximumItems: 127,
        looping: true,
        alphaSupported: options.alphaSupported ?? true,
        defaultParameters: evaluator.DEFAULTS,
        controls,
        durationMs(config) {
            return timelineFor(config).durationSeconds * 1000
        },
        evaluate({ config, timeMs, reducedMotion = false, terminal = false }) {
            const items = sourceItems(config, options.recommendedItems)
            const parameters = parametersFor(config)
            const timeline = timelineFor(config)
            const durationMs = timeline.durationSeconds * 1000
            const normalizedTime = terminal ? 1 : ((timeMs % durationMs) + durationMs) % durationMs / durationMs
            const spotlightId = items.find((item, index) => parityItems(config, options.recommendedItems)[index]?.spotlight)?.id ?? items[Math.min(2, items.length - 1)]?.id
            const finaleId = items.at(-1)?.id
            const frame = options.evaluate({
                items,
                config: parameters,
                normalizedTime,
                canvas: { width: Math.max(1, config.settings.canvasWidth), height: Math.max(1, config.settings.canvasHeight) },
                runKind: config.settings.playKind === "once" ? "once" : "loop",
                reducedMotion,
                spotlightId,
                finaleId,
                intent: {
                    direction: config.settings.direction,
                    primaryId: items[0]?.id,
                    exchangeTargetId: items[1]?.id,
                    exchangeEnabled: items.length > 1,
                    spotlightId,
                    finaleId,
                },
            })
            const width = Math.max(1, config.settings.canvasWidth)
            const height = Math.max(1, config.settings.canvasHeight)
            const zOrder = [...frame.renderSlots].sort((left, right) => finite(left.zOrder) - finite(right.zOrder))
            const zBySlot = new Map(zOrder.map((slot, index) => [String(slot.slotId ?? slot.id), index + 1]))
            const cards = frame.renderSlots.map((slot, index) => {
                const sourceIndex = Math.max(0, Math.min(items.length - 1, Math.round(finite(slot.sourceIndex, index % items.length))))
                const cardWidth = finite(slot.width, width * 0.25)
                const cardHeight = finite(slot.height, cardWidth / Math.max(0.05, items[sourceIndex]?.ratio ?? 16 / 9))
                const slotId = String(slot.slotId ?? slot.id ?? `${options.id}-${index}`)
                return {
                    id: slotId,
                    sourceIndex,
                    x: finite(slot.x, width / 2) / width * 100,
                    y: (finite(slot.y, height / 2) + (options.yIsTop ? cardHeight / 2 : 0)) / height * 100,
                    width: cardWidth / width * 100,
                    height: cardHeight / height * 100,
                    scale: finite(slot.scale, 1),
                    rotation: finite(slot.rotateZDeg ?? slot.leanDeg, 0),
                    rotateX: finite(slot.rotateXDeg, 0),
                    rotateY: finite(slot.rotateYDeg, 0),
                    z: zBySlot.get(slotId) ?? index + 1,
                    opacity: 1,
                    visible: slot.visible !== false,
                    filter: String(slot.artworkFilter ?? "none"),
                    blend: String(slot.artworkBlend ?? "normal"),
                    transformOrigin: options.yIsTop ? "50% 100%" : undefined,
                    sourceTimeMs: Number.isFinite(slot.sourceVideoTimeSeconds) ? Number(slot.sourceVideoTimeSeconds) * 1000 : normalizedTime * durationMs,
                }
            })
            const phase = finite(frame.phase, normalizedTime)
            return {
                sceneId: options.id,
                durationMs,
                phase,
                terminal,
                cards,
                opaque: false,
                stateHash: stableFrameHash({ phrase: frame.phrase, phase, cards }),
            }
        },
    }
}
