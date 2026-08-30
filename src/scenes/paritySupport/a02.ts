import type { ReelConfig } from "../../types"
import type { ParityControl, ParitySceneContract } from "./types.ts"
import { authoredParameters, parityItems, stableFrameHash } from "./types.ts"

export type A02Evaluator = {
    DEFAULT_PARAMETERS: Readonly<Record<string, number>>
    CONTROL_DEFINITIONS: ReadonlyArray<{ id: string; label: string; min: number; max: number; step: number }>
    compileTimeline(input: Record<string, unknown>): { durationMs: number; minimumHonestDurationMs?: number }
    evaluateScene(input: Record<string, unknown>): { phase?: string; phaseProgress?: number; cards: Array<Record<string, unknown>>; sourceVideoTimes?: Record<string, number> }
}

type A02SceneOptions = {
    id: string
    sourcePath: string
    sourceSha256: string
    evaluator: A02Evaluator
    recommendedItems: number
    frameScaleReference: number
    paceReference: number
    gapReference?: number
    alphaSupported?: boolean
}

const finite = (value: unknown, fallback = 0) => Number.isFinite(value) ? Number(value) : fallback

function sourceItems(config: ReelConfig, recommendedItems: number) {
    const items = parityItems(config, recommendedItems).slice(0, 24)
    const finaleIndex = items.length - 1
    return items.map((item, index) => ({
        id: item.id,
        ratio: item.ratio || 16 / 9,
        kind: item.type,
        sourceOffsetMs: 0,
        status: "ok",
        alpha: item.type === "image" && /\.png($|\?)/i.test(item.url),
        storyRole: index === finaleIndex ? "finale" : item.spotlight ? "spotlight" : "ordinary",
    }))
}

export function createA02Scene(options: A02SceneOptions): ParitySceneContract {
    const { evaluator } = options
    const controls: ParityControl[] = evaluator.CONTROL_DEFINITIONS.map((control) => ({
        id: control.id,
        parameter: control.id,
        label: control.label,
        type: "range",
        default: evaluator.DEFAULT_PARAMETERS[control.id],
        min: control.min,
        max: control.max,
        step: control.step,
    }))
    const parametersFor = (config: ReelConfig) => {
        const mapped: Record<string, number> = { ...evaluator.DEFAULT_PARAMETERS }
        const sizeKey = "frameScale" in mapped ? "frameScale" : "heroScale" in mapped ? "heroScale" : null
        if (sizeKey) {
            const bounds = evaluator.CONTROL_DEFINITIONS.find((control) => control.id === sizeKey)
            const value = config.settings.slideHeight * mapped[sizeKey] / options.frameScaleReference
            mapped[sizeKey] = Math.min(bounds?.max ?? 1, Math.max(bounds?.min ?? 0.01, value))
        }
        if (options.gapReference && "gap" in mapped) {
            const bounds = evaluator.CONTROL_DEFINITIONS.find((control) => control.id === "gap")
            const value = config.settings.gap * mapped.gap / options.gapReference
            mapped.gap = Math.min(bounds?.max ?? value, Math.max(bounds?.min ?? 0, value))
        }
        return authoredParameters(config, mapped)
    }
    const timelineFor = (config: ReelConfig) => {
        const items = sourceItems(config, options.recommendedItems)
        const parameters = parametersFor(config)
        const direction = config.settings.direction
        const automatic = evaluator.compileTimeline({ items, parameters, mode: "automatic", direction })
        if (config.timelineMode === "directed") return evaluator.compileTimeline({ items, parameters, mode: "directed", direction })
        const requested = config.timelineMode === "fixed-duration"
            ? config.timelineFixedDurationMs ?? automatic.durationMs
            : automatic.durationMs * config.settings.paceMs / options.paceReference
        if (Math.abs(requested - automatic.durationMs) < 0.5) return automatic
        const fixedDurationMs = Math.min(60_000, Math.max(automatic.minimumHonestDurationMs ?? 1, requested))
        return evaluator.compileTimeline({ items, parameters, mode: "fixed-duration", direction, fixedDurationMs })
    }
    return {
        id: options.id,
        atelier: "A02",
        sourcePath: options.sourcePath,
        sourceSha256: options.sourceSha256,
        recommendedItems: options.recommendedItems,
        maximumItems: 24,
        looping: false,
        alphaSupported: options.alphaSupported ?? true,
        defaultParameters: evaluator.DEFAULT_PARAMETERS,
        controls,
        durationMs(config) {
            return timelineFor(config).durationMs
        },
        evaluate({ config, timeMs, reducedMotion = false, terminal = false }) {
            const items = sourceItems(config, options.recommendedItems)
            const parameters = parametersFor(config)
            const timeline = timelineFor(config)
            const storyTimeMs = terminal ? timeline.durationMs : Math.min(Math.max(0, timeMs), timeline.durationMs)
            const frame = evaluator.evaluateScene({
                items,
                parameters,
                timeline,
                storyTimeMs,
                stage: { width: Math.max(1, config.settings.canvasWidth), height: Math.max(1, config.settings.canvasHeight) },
                reducedMotion,
            })
            const width = Math.max(1, config.settings.canvasWidth)
            const height = Math.max(1, config.settings.canvasHeight)
            const cards = frame.cards.map((card, index) => ({
                id: String(card.id ?? `${options.id}-${index}`),
                sourceIndex: Math.max(0, Math.min(items.length - 1, Math.round(finite(card.sourceIndex, index)))),
                x: finite(card.x, width / 2) / width * 100,
                y: finite(card.y, height / 2) / height * 100,
                width: finite(card.width, width * 0.3) / width * 100,
                height: finite(card.height, height * 0.3) / height * 100,
                scale: finite(card.scale, 1),
                rotation: finite(card.rotation, 0),
                rotateY: finite(card.projectedYaw, 0),
                z: Math.round(finite(card.z, index)),
                opacity: finite(card.opacity, 1),
                visible: card.visible !== false,
                filter: String(card.filter ?? "none"),
                blend: String(card.blend ?? "normal"),
                sourceTimeMs: finite(frame.sourceVideoTimes?.[String(card.id)], storyTimeMs),
            }))
            const phase = finite(frame.phaseProgress, 0)
            return {
                sceneId: options.id,
                durationMs: timeline.durationMs,
                phase,
                terminal,
                cards,
                opaque: false,
                stateHash: stableFrameHash({ phase: frame.phase, phaseProgress: phase, cards }),
            }
        },
    }
}
