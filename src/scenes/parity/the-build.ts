import "../../../scene-ateliers/atelier-06/the-build/prototype/scene-core.js"
import type { ParityControl } from "../paritySupport/types.ts"
import { clamp, createA06Scene, finite, type A06Core } from "../paritySupport/a06.ts"

const evaluator = (globalThis as typeof globalThis & { TheBuildCore: A06Core }).TheBuildCore

const controls: readonly ParityControl[] = [
    { id: "per-beat-hold", parameter: "perBeatHoldMs", label: "Per-beat hold", type: "range", default: 600, min: 420, max: 1600, step: 20, unit: "ms" },
    { id: "build-detail", parameter: "buildDetail", label: "Build detail", type: "choice", default: "regular", options: ["concise", "regular", "detailed"] },
    { id: "guide-density", parameter: "guideDensity", label: "Guide density", type: "choice", default: "standard", options: ["minimal", "standard", "technical"] },
    { id: "cursor-visibility", parameter: "cursorVisibility", label: "Cursor visibility", type: "choice", default: "off", options: ["off", "causal"] },
    { id: "finale-hold", parameter: "finaleHoldMs", label: "Finale hold", type: "range", default: 2000, min: 1200, max: 5000, step: 50, unit: "ms" },
]

const defaults = Object.freeze({ buildDetail: "regular", guideDensity: "standard", cursorVisibility: "off", perBeatHoldMs: 600, finaleHoldMs: 2000 })

export const scene = createA06Scene({
    id: "the-build",
    sourcePath: "scene-ateliers/atelier-06/the-build/prototype/scene-core.js",
    sourceSha256: "b609cd99deeb81c05facca76afa09ae9b56b66506de1412779e748cb72d9ac22",
    evaluator,
    controls,
    defaultParameters: defaults,
    recommendedItems: 1,
    maximumItems: 127,
    paceReference: 900,
    alphaSupported: true,
    compile({ evaluator: core, intent, parameters, sources }) {
        return core.compileTimeline(intent, parameters, { hasCaption: Boolean(sources[0]?.caption) })
    },
    evaluate({ evaluator: core, timeline, progress, sources, config, reducedMotion }) {
        return core.evaluate(timeline, progress, sources, {
            direction: config.settings.direction,
            reducedMotion,
        })
    },
    normalize({ frame, sources, config, progress, sourceTimeMs }) {
        const apparatus = frame.apparatus as Record<string, unknown> | undefined
        const ratio = Math.max(0.05, sources[0]?.ratio ?? 16 / 9)
        const canvasRatio = config.settings.canvasWidth / Math.max(1, config.settings.canvasHeight)
        const width = clamp(config.settings.slideHeight, 20, 92)
        const media = frame.source && typeof frame.source === "object"
            ? (frame.source as Record<string, unknown>).media as Record<string, unknown> | undefined
            : undefined
        const sourceClipRight = clamp(finite(apparatus?.sourceClipRight, 1), 0, 1)
        return {
            phase: progress,
            cards: [{
                id: sources[0]?.id ?? "build-source",
                sourceIndex: 0,
                x: 50,
                y: 50 + finite(apparatus?.frameY, 0) * 100,
                width,
                height: width * canvasRatio / ratio,
                scale: Math.max(0.001, finite(apparatus?.frameScale, 1)),
                rotation: 0,
                z: 10,
                opacity: clamp(finite(media?.opacity, 1), 0, 1),
                visible: finite(apparatus?.frameOpacity, 0) > 0.001,
                filter: String(media?.filter ?? "none"),
                blend: String(media?.blend ?? "normal"),
                clipPath: `inset(0 ${sourceClipRight * 100}% 0 0)`,
                sourceTimeMs,
            }],
            opaque: false,
            state: frame,
        }
    },
})
