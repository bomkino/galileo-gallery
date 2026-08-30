import "../../../scene-ateliers/atelier-01/deck-river/prototype/evaluator.js"
import { createA01Scene, type A01Evaluator } from "../paritySupport/a01.ts"

const evaluator = (globalThis as typeof globalThis & { DeckRiverEvaluator?: A01Evaluator }).DeckRiverEvaluator
if (!evaluator) throw new Error("deck-river source evaluator did not load")

const range = (id: string, label: string, min: number, max: number, step: number, unit: string) => ({ id, parameter: id, label, type: "range" as const, default: evaluator.defaults[id], min, max, step, unit })

export const scene = createA01Scene({
    id: "deck-river",
    sourcePath: "scene-ateliers/atelier-01/deck-river/prototype/evaluator.js",
    sourceSha256: "658d56bdb973fb6a81bd0bafe8a1dc1c6748c6cf642b3e22bb85919346e46f68",
    evaluator,
    recommendedItems: 6,
    frameScaleReference: 38,
    controls: [
        range("frameScale", "Frame size", 0.18, 0.48, 0.01, "short axis"),
        range("depthSpacing", "Depth spacing", 0.65, 1.6, 0.01, "world scale"),
        range("laneSpread", "Corridor width", 1.4, 4.2, 0.05, "world units"),
        range("nearPass", "Camera clearance", 0.9, 2.4, 0.05, "world units"),
        range("visibleDepth", "Corridor length", 7, 18, 0.25, "world units"),
    ],
})
