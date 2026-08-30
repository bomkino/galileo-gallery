import type { ReelConfig } from "../../types"
import type { ParityControl, ParitySceneContract } from "./types.ts"
import { authoredParameters, parityItems, stableFrameHash } from "./types.ts"

export type A05Evaluator = {
    sceneMeta: {
        id: string
        alphaSupported: boolean
        resourceObservation?: { maximumAcceptedSources?: number }
    }
    controlDescriptors: readonly ParityControl[]
    defaultControls(): Record<string, number | string | boolean>
    compileTimeline(input: {
        mode: "automatic" | "directed" | "fixed-duration"
        itemCount: number
        controls: Record<string, number | string | boolean>
        direction: "forward" | "reverse"
    }): { durationMs: number }
    evaluateScene(input: Record<string, unknown>): {
        phase?: number
        phaseName?: string
        cards: Array<Record<string, unknown>>
        focus?: Record<string, unknown>
        selectedIndex?: number
    }
}

type A05SceneOptions = {
    id: string
    sourcePath: string
    sourceSha256: string
    evaluator: A05Evaluator
    recommendedItems: number
    maximumItems: number
    paceReference: number
    sizeParameter?: string
    sizeReference?: number
    gapParameter?: string
    gapReference?: number
    liftFactor?: number
    opaque?: boolean
}

const finite = (value: unknown, fallback = 0) => Number.isFinite(value) ? Number(value) : fallback

function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(minimum, value))
}

function sourceItems(config: ReelConfig, recommendedItems: number, maximumItems: number) {
    return parityItems(config, recommendedItems).slice(0, maximumItems).map((item, sourceIndex) => ({
        id: item.id,
        sourceIndex,
        ratio: item.ratio || 16 / 9,
        fit: config.settings.imageFit,
        focalPoint: [0.5, 0.5],
        caption: item.caption,
        failed: false,
        type: item.type,
        videoDurationSeconds: item.type === "video" ? 12 : null,
    }))
}

function controlBounds(controls: readonly ParityControl[], parameter: string) {
    const control = controls.find((candidate) => candidate.parameter === parameter)
    return control?.type === "range" && Number.isFinite(control.min) && Number.isFinite(control.max)
        ? [Number(control.min), Number(control.max)] as const
        : null
}

export function createA05Scene(options: A05SceneOptions): ParitySceneContract {
    const defaults = Object.freeze(options.evaluator.defaultControls())
    const controls = options.evaluator.controlDescriptors
    const parametersFor = (config: ReelConfig) => {
        const mapped: Record<string, number | string | boolean> = { ...defaults }
        if (options.sizeParameter && options.sizeReference) {
            const bounds = controlBounds(controls, options.sizeParameter)
            const defaultValue = Number(defaults[options.sizeParameter])
            if (bounds && Number.isFinite(defaultValue)) {
                mapped[options.sizeParameter] = clamp(config.settings.slideHeight * defaultValue / options.sizeReference, bounds[0], bounds[1])
            }
        }
        if (options.gapParameter && options.gapReference) {
            const bounds = controlBounds(controls, options.gapParameter)
            const defaultValue = Number(defaults[options.gapParameter])
            if (bounds && Number.isFinite(defaultValue)) {
                mapped[options.gapParameter] = clamp(config.settings.gap * defaultValue / options.gapReference, bounds[0], bounds[1])
            }
        }
        return authoredParameters(config, mapped) as Record<string, number | string | boolean>
    }
    const sourceTimelineFor = (config: ReelConfig) => options.evaluator.compileTimeline({
        mode: "automatic",
        itemCount: sourceItems(config, options.recommendedItems, options.maximumItems).length,
        controls: parametersFor(config),
        direction: config.settings.direction,
    })
    const durationFor = (config: ReelConfig) => {
        const sourceTimeline = sourceTimelineFor(config)
        if (config.timelineMode === "fixed-duration") return Math.max(1, config.timelineFixedDurationMs ?? sourceTimeline.durationMs)
        return Math.max(1, sourceTimeline.durationMs * config.settings.paceMs / options.paceReference)
    }
    return {
        id: options.id,
        atelier: "A05",
        sourcePath: options.sourcePath,
        sourceSha256: options.sourceSha256,
        recommendedItems: options.recommendedItems,
        maximumItems: options.maximumItems,
        looping: true,
        alphaSupported: options.evaluator.sceneMeta.alphaSupported,
        defaultParameters: defaults,
        controls,
        durationMs: durationFor,
        evaluate({ config, timeMs, reducedMotion = false, terminal = false }) {
            const items = sourceItems(config, options.recommendedItems, options.maximumItems)
            const parameters = parametersFor(config)
            const sourceTimeline = sourceTimelineFor(config)
            const durationMs = durationFor(config)
            const progress = terminal
                ? 1
                : ((timeMs % durationMs) + durationMs) % durationMs / durationMs
            const sourceTimeMs = progress * sourceTimeline.durationMs
            const width = Math.max(1, config.settings.canvasWidth)
            const height = Math.max(1, config.settings.canvasHeight)
            const frame = options.evaluator.evaluateScene({
                items,
                controls: parameters,
                timeline: sourceTimeline,
                timeMs: sourceTimeMs,
                width,
                height,
                reducedMotion,
                selectedIndex: 0,
            })
            const cards = frame.cards.map((card, index) => {
                const sourceIndex = Math.max(0, Math.min(items.length - 1, Math.round(finite(card.sourceIndex, index % items.length))))
                const cardWidth = Math.max(0.01, finite(card.width, width * 0.25))
                const cardHeight = Math.max(0.01, finite(card.height, cardWidth / Math.max(0.05, items[sourceIndex]?.ratio ?? 16 / 9)))
                const lift = finite(card.lift, 0) * (options.liftFactor ?? 0)
                return {
                    id: String(card.id ?? `${options.id}-${index}`),
                    sourceIndex,
                    x: finite(card.x, width / 2) / width * 100,
                    y: (finite(card.y, height / 2) - lift) / height * 100,
                    width: cardWidth / width * 100,
                    height: cardHeight / height * 100,
                    scale: Math.max(0.001, finite(card.scale, 1)),
                    rotation: finite(card.rotation, 0) * 180 / Math.PI,
                    z: Math.round(finite(card.z, index)),
                    opacity: clamp(finite(card.artworkOpacity, 1), 0, 1),
                    visible: card.visible !== false,
                    filter: String(card.artworkFilter ?? "none"),
                    blend: String(card.blendMode ?? "normal"),
                    sourceTimeMs: Number.isFinite(card.sourceVideoTimeSeconds)
                        ? Number(card.sourceVideoTimeSeconds) * 1000
                        : sourceTimeMs,
                }
            })
            const phase = finite(frame.phase, progress)
            return {
                sceneId: options.id,
                durationMs,
                phase,
                terminal,
                cards,
                background: options.opaque ? "#f5f2ea" : undefined,
                opaque: options.opaque ?? false,
                stateHash: stableFrameHash({ phaseName: frame.phaseName, phase, selectedIndex: frame.selectedIndex, focus: frame.focus, cards }),
            }
        },
    }
}
