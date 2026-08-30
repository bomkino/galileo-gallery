// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-03/slide-fan/prototype/evaluator.mjs"
import { createA03Scene, type A03Evaluator } from "../paritySupport/a03.ts"

export const scene = createA03Scene({
    id: "slide-fan",
    sourcePath: "scene-ateliers/atelier-03/slide-fan/prototype/evaluator.mjs",
    sourceSha256: "f09f241782da25cbaff7298594c0e087576870728b8a56513bb405530ec7d991",
    evaluator: evaluator as A03Evaluator,
    recommendedItems: 5,
    cardSizeReference: 42,
    paceReference: 620,
})
