import "../../../scene-ateliers/atelier-01/cms-slideshow/prototype/evaluator.js"
import type { ParitySceneContract } from "../paritySupport/types.ts"
import { authoredParameters, parityItems, stableFrameHash } from "../paritySupport/types.ts"

type QuietCarouselEvaluator = {
    defaults: Readonly<{ frameScale: number; gap: number; focusDepth: number }>
    compile(input: { mediaCount: number; paceMs: number; direction: "forward" | "reverse"; durationMs: number }): { durationMs: number; cycles: number; direction: "forward" | "reverse" }
    evaluate(input: Record<string, unknown>): {
        phase: number
        storyTimeMs: number
        frames: Array<{ id: string; sourceIndex: number; x: number; y: number; width: number; height: number; scale: number; z: number; visible: boolean; opacity: number; filter: string }>
    }
}

const evaluator = (globalThis as typeof globalThis & { QuietCarouselEvaluator?: QuietCarouselEvaluator }).QuietCarouselEvaluator
if (!evaluator) throw new Error("cms-slideshow source evaluator did not load")

const defaults = evaluator.defaults
const sourcePath = "scene-ateliers/atelier-01/cms-slideshow/prototype/evaluator.js"

export const scene: ParitySceneContract = {
    id: "cms-slideshow",
    atelier: "A01",
    sourcePath,
    sourceSha256: "f9e4396771cb499d71dd1579df268801e9d45cd0529c5de23c096c8ad2ff3134",
    recommendedItems: 5,
    maximumItems: 127,
    alphaSupported: true,
    defaultParameters: defaults,
    controls: [
        { id: "frame-scale", parameter: "frameScale", label: "Frame size", type: "range", default: defaults.frameScale, min: 0.24, max: 0.78, step: 0.01, unit: "cross axis" },
        { id: "minimum-gap", parameter: "gap", label: "Minimum gap", type: "range", default: defaults.gap, min: 0, max: 240, step: 1, unit: "dp at 1080" },
        { id: "focus-depth", parameter: "focusDepth", label: "Focus depth", type: "range", default: defaults.focusDepth, min: 0, max: 0.24, step: 0.01, unit: "fraction" },
    ],
    durationMs(config) {
        const count = parityItems(config, 5).length
        return evaluator.compile({ mediaCount: count, paceMs: config.settings.paceMs, direction: config.settings.direction, durationMs: 0 }).durationMs
    },
    evaluate({ config, timeMs, durationMs, reducedMotion = false, terminal = false }) {
        const items = parityItems(config, 5).slice(0, 127)
        const mappedDefaults = {
            frameScale: Math.min(0.78, Math.max(0.24, config.settings.slideHeight * defaults.frameScale / 36)),
            gap: Math.min(240, Math.max(0, config.settings.gap * defaults.gap / 22)),
            focusDepth: defaults.focusDepth,
        }
        const parameters = authoredParameters(config, mappedDefaults)
        const timeline = evaluator.compile({
            mediaCount: items.length,
            paceMs: config.settings.paceMs,
            direction: config.settings.direction,
            durationMs,
        })
        const sourceItems = items.map((item) => ({
            id: item.id,
            ratio: item.ratio || 16 / 9,
            alpha: item.type === "image" && /\.png($|\?)/i.test(item.url),
            video: item.type === "video",
            failed: false,
        }))
        const sourceTimeMs = terminal ? timeline.durationMs : timeMs
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
        const cards = frame.frames.map((card) => ({
            id: card.id,
            sourceIndex: card.sourceIndex,
            x: card.x / width * 100,
            y: card.y / height * 100,
            width: card.width / width * 100,
            height: card.height / height * 100,
            scale: card.scale,
            rotation: 0,
            z: card.z,
            opacity: card.opacity,
            visible: card.visible,
            filter: card.filter,
            blend: "normal",
        }))
        return {
            sceneId: "cms-slideshow",
            durationMs: timeline.durationMs,
            phase: frame.phase,
            terminal,
            cards,
            opaque: false,
            stateHash: stableFrameHash({ phase: frame.phase, cards }),
        }
    },
}
