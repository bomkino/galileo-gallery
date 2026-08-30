import "../../../scene-ateliers/atelier-01/wave-ticker/prototype/evaluator.js"
import { createA01Scene, type A01Evaluator } from "../paritySupport/a01.ts"

const evaluator = (globalThis as typeof globalThis & { WaveTickerEvaluator?: A01Evaluator }).WaveTickerEvaluator
if (!evaluator) throw new Error("wave-ticker source evaluator did not load")

const range = (id: string, label: string, min: number, max: number, step: number, unit: string) => ({ id, parameter: id, label, type: "range" as const, default: evaluator.defaults[id], min, max, step, unit })

export const scene = createA01Scene({
    id: "wave-ticker",
    sourcePath: "scene-ateliers/atelier-01/wave-ticker/prototype/evaluator.js",
    sourceSha256: "b480300e7f3acd12fcc188e4d0705a187c90b11d021f9bd14423184ea5f22531",
    evaluator,
    recommendedItems: 5,
    frameScaleReference: 28,
    gapReference: 32,
    controls: [
        range("frameScale", "Frame size", 0.14, 0.32, 0.01, "cross axis"),
        range("gap", "Minimum gap", 0, 180, 1, "dp at 1080"),
        range("amplitude", "Amplitude", 0.04, 0.24, 0.01, "cross axis"),
        range("wavelength", "Wavelength", 0.3, 0.9, 0.01, "major axis"),
        range("tangentInfluence", "Tangent follow", 0, 0.45, 0.01, "fraction"),
    ],
})
