import "../../../scene-ateliers/atelier-01/deck-river-loader/prototype/evaluator.js"
import { createA01Scene, type A01Evaluator } from "../paritySupport/a01.ts"

const evaluator = (globalThis as typeof globalThis & { ChapterRevealEvaluator?: A01Evaluator }).ChapterRevealEvaluator
if (!evaluator) throw new Error("deck-river-loader source evaluator did not load")

const range = (id: string, label: string, min: number, max: number, step: number, unit: string) => ({ id, parameter: id, label, type: "range" as const, default: evaluator.defaults[id], min, max, step, unit })

export const scene = createA01Scene({
    id: "deck-river-loader",
    sourcePath: "scene-ateliers/atelier-01/deck-river-loader/prototype/evaluator.js",
    sourceSha256: "4e6e45c9c45b9aac139b2e490b8ed920377885538f7f379f2c248dddfb0ad831",
    evaluator,
    recommendedItems: 6,
    finite: true,
    frameScaleReference: 36,
    controls: [
        range("frameScale", "Corridor frame size", 0.16, 0.38, 0.01, "short axis"),
        range("depthSpacing", "Depth spacing", 0.65, 1.6, 0.01, "world scale"),
        range("laneSpread", "Corridor width", 1.4, 4.4, 0.05, "world units"),
        range("nearPass", "Camera clearance", 0.9, 2.4, 0.05, "world units"),
        range("arrivalScale", "Arrival size", 0.42, 0.82, 0.01, "short axis"),
    ],
})
