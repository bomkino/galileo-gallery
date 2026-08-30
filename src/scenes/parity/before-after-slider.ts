import "../../../scene-ateliers/atelier-06/before-after-slider/prototype/scene-core.js"
import type { ParityControl } from "../paritySupport/types.ts"
import { clamp, createA06Scene, type A06Core } from "../paritySupport/a06.ts"

const evaluator = (globalThis as typeof globalThis & { BeforeAfterCore: A06Core }).BeforeAfterCore

const controls: readonly ParityControl[] = [
    { id: "sweep-maximum", parameter: "sweepRangeMax", label: "Sweep maximum", type: "range", default: 0.88, min: 0.14, max: 0.96, step: 0.01 },
    { id: "sweep-minimum", parameter: "sweepRangeMin", label: "Sweep minimum", type: "range", default: 0.12, min: 0.04, max: 0.86, step: 0.01 },
    { id: "initial-split", parameter: "initialSplit", label: "Initial split", type: "range", default: 0.18, min: 0.05, max: 0.95, step: 0.01 },
    { id: "sweep-duration", parameter: "sweepDurationMs", label: "Sweep duration", type: "range", default: 1400, min: 800, max: 4000, step: 50, unit: "ms" },
    { id: "turnaround-hold", parameter: "turnaroundHoldMs", label: "Turnaround hold", type: "range", default: 650, min: 300, max: 2400, step: 50, unit: "ms" },
    { id: "comparison-chrome", parameter: "comparisonChrome", label: "Comparison chrome", type: "choice", default: "labels-handle", options: ["labels-handle", "handle", "clean"] },
]

const defaults = Object.freeze({
    initialSplit: 0.18,
    sweepRangeMin: 0.12,
    sweepRangeMax: 0.88,
    sweepDurationMs: 1400,
    turnaroundHoldMs: 650,
    comparisonChrome: "labels-handle",
})

export const scene = createA06Scene({
    id: "before-after-slider",
    sourcePath: "scene-ateliers/atelier-06/before-after-slider/prototype/scene-core.js",
    sourceSha256: "38a70fa0f11e4104d81fa2a2cd8bc5123c2a44c68cb065267af75ff3af8a1176",
    evaluator,
    controls,
    defaultParameters: defaults,
    recommendedItems: 2,
    maximumItems: 127,
    paceReference: 520,
    alphaSupported: false,
    compile({ evaluator: core, intent, parameters }) {
        return core.compileTimeline(intent, {
            initialSplit: parameters.initialSplit,
            sweepRange: { min: parameters.sweepRangeMin, max: parameters.sweepRangeMax },
            sweepDurationMs: parameters.sweepDurationMs,
            turnaroundHoldMs: parameters.turnaroundHoldMs,
            comparisonChrome: parameters.comparisonChrome,
        })
    },
    evaluate({ evaluator: core, timeline, progress, sources, config, reducedMotion }) {
        return core.evaluate(timeline, progress, sources, {
            fit: config.settings.imageFit,
            direction: config.settings.direction,
            reducedMotion,
            manualSplit: null,
        })
    },
    normalize({ frame, sources, config, progress, sourceTimeMs }) {
        const split = clamp(Number(frame.split) || 0.18, 0, 1)
        const common = {
            x: 50,
            y: 50,
            width: 100,
            height: 100,
            scale: 1,
            rotation: 0,
            opacity: 1,
            visible: true,
            filter: "none",
            blend: "normal",
            sourceTimeMs,
        }
        return {
            phase: progress,
            opaque: true,
            background: config.settings.ground,
            cards: [
                { ...common, id: sources[1]?.id ?? "after", sourceIndex: 1, z: 1 },
                { ...common, id: sources[0]?.id ?? "before", sourceIndex: 0, z: 2, clipPath: `inset(0 ${(1 - split) * 100}% 0 0)` },
            ],
            state: frame,
        }
    },
})
