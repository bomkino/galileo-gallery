// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-03/orbit-ring/prototype/evaluator.mjs"
import { createA03Scene, type A03Evaluator } from "../paritySupport/a03.ts"

export const scene = createA03Scene({
    id: "orbit-ring",
    sourcePath: "scene-ateliers/atelier-03/orbit-ring/prototype/evaluator.mjs",
    sourceSha256: "8d9c83ac09356d3afc2c09d53f09da668678029d8ea1b3a69c7c02be6ded8c15",
    evaluator: evaluator as A03Evaluator,
    recommendedItems: 6,
    cardSizeReference: 34,
    paceReference: 650,
})
