import "../../../scene-ateliers/atelier-01/filmstrip-river/prototype/evaluator.js"
import { createA01Scene, type A01Evaluator } from "../paritySupport/a01.ts"

const evaluator = (globalThis as typeof globalThis & { FilmstripRiverEvaluator?: A01Evaluator }).FilmstripRiverEvaluator
if (!evaluator) throw new Error("filmstrip-river source evaluator did not load")

const range = (id: string, label: string, min: number, max: number, step: number, unit: string) => ({ id, parameter: id, label, type: "range" as const, default: evaluator.defaults[id], min, max, step, unit })

export const scene = createA01Scene({
    id: "filmstrip-river",
    sourcePath: "scene-ateliers/atelier-01/filmstrip-river/prototype/evaluator.js",
    sourceSha256: "612af3bacdea41320f10ea3b8a151afd0d7aa5e73253b9f50170e60cda20466e",
    evaluator,
    recommendedItems: 6,
    frameScaleReference: 34,
    gapReference: 28,
    controls: [
        range("frameScale", "Frame size", 0.16, 0.36, 0.01, "cross axis"),
        range("gap", "Minimum gap", 0, 160, 1, "dp at 1080"),
        range("laneSeparation", "Lane separation", 0.25, 0.58, 0.01, "cross axis"),
        range("lanePhase", "Lane offset", 0, 1, 0.01, "cycle"),
    ],
})
