import type { ParityControl, ParitySceneContract } from "./types.ts"
import { authoredParameters, parityItems, stableFrameHash } from "./types.ts"

export type A01Evaluator = {
    defaults: Readonly<Record<string, number>>
    compile(input: Record<string, unknown>): { durationMs: number; direction: "forward" | "reverse" }
    evaluate(input: Record<string, unknown>): {
        phase?: number
        normalizedTime?: number
        frames: Array<Record<string, unknown>>
    }
}

type A01SceneOptions = {
    id: string
    sourcePath: string
    sourceSha256: string
    evaluator: A01Evaluator
    controls: readonly ParityControl[]
    recommendedItems: number
    finite?: boolean
    frameScaleReference: number
    gapReference?: number
}

function finite(value: unknown, fallback = 0) {
    return Number.isFinite(value) ? Number(value) : fallback
}

export function createA01Scene(options: A01SceneOptions): ParitySceneContract {
    const { evaluator, finite: finiteStory = false } = options
    const compile = (config: Parameters<ParitySceneContract["durationMs"]>[0], durationMs: number) => {
        const items = parityItems(config, options.recommendedItems).slice(0, 127)
        if (finiteStory) return evaluator.compile({ items: items.map((item) => ({ id: item.id, ratio: item.ratio || 16 / 9, alpha: /\.png($|\?)/i.test(item.url), video: item.type === "video", failed: false })), mode: "automatic", direction: config.settings.direction })
        return evaluator.compile({ mediaCount: items.length, paceMs: config.settings.paceMs, direction: config.settings.direction, durationMs })
    }
    return {
        id: options.id,
        atelier: "A01",
        sourcePath: options.sourcePath,
        sourceSha256: options.sourceSha256,
        recommendedItems: options.recommendedItems,
        maximumItems: 127,
        looping: !finiteStory,
        alphaSupported: true,
        defaultParameters: evaluator.defaults,
        controls: options.controls,
        durationMs(config) {
            return compile(config, 0).durationMs
        },
        evaluate({ config, timeMs, durationMs, reducedMotion = false, terminal = false }) {
            const items = parityItems(config, options.recommendedItems).slice(0, 127)
            const sourceItems = items.map((item) => ({ id: item.id, ratio: item.ratio || 16 / 9, alpha: /\.png($|\?)/i.test(item.url), video: item.type === "video", failed: false }))
            const mappedDefaults: Record<string, number> = {
                ...evaluator.defaults,
                frameScale: Math.min(1, Math.max(0.01, config.settings.slideHeight * evaluator.defaults.frameScale / options.frameScaleReference)),
            }
            if (options.gapReference && "gap" in evaluator.defaults) mappedDefaults.gap = Math.max(0, config.settings.gap * evaluator.defaults.gap / options.gapReference)
            const parameters = authoredParameters(config, mappedDefaults)
            const timeline = compile(config, finiteStory ? 0 : durationMs)
            const sourceTimeMs = terminal || finiteStory
                ? Math.min(timeMs, timeline.durationMs)
                : ((timeMs % timeline.durationMs) + timeline.durationMs) % timeline.durationMs
            const frame = evaluator.evaluate({
                items: sourceItems,
                parameters,
                timeline,
                timeMs: sourceTimeMs,
                stageWidth: Math.max(1, config.settings.canvasWidth),
                stageHeight: Math.max(1, config.settings.canvasHeight),
                axis: config.settings.axis,
                fitIntent: config.settings.imageFit,
                reducedMotion,
            })
            const width = Math.max(1, config.settings.canvasWidth)
            const height = Math.max(1, config.settings.canvasHeight)
            const cards = frame.frames.map((candidate, index) => {
                const card = candidate as Record<string, unknown>
                const sourceIndex = Math.max(0, Math.min(items.length - 1, Math.round(finite(card.sourceIndex, index % items.length))))
                const cardWidth = finite(card.width, width * 0.3)
                const cardHeight = finite(card.height, cardWidth / Math.max(0.05, items[sourceIndex]?.ratio || 16 / 9))
                return {
                    id: String(card.id ?? `${options.id}-${index}`),
                    sourceIndex,
                    x: finite(card.x, width / 2) / width * 100,
                    y: finite(card.y, height / 2) / height * 100,
                    width: cardWidth / width * 100,
                    height: cardHeight / height * 100,
                    scale: finite(card.scale, 1),
                    rotation: finite(card.rotation, 0),
                    rotateY: finite(card.yaw, 0),
                    z: Math.round(finite(card.z, index)),
                    opacity: finite(card.opacity, 1),
                    visible: card.visible !== false,
                    filter: String(card.filter ?? "none"),
                    blend: "normal",
                    sourceTimeMs,
                }
            })
            const phase = finite(frame.phase ?? frame.normalizedTime, 0)
            return {
                sceneId: options.id,
                durationMs: timeline.durationMs,
                phase,
                terminal,
                cards,
                opaque: false,
                stateHash: stableFrameHash({ phase, cards }),
            }
        },
    }
}
