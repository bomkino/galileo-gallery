// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-03/dealers-fan/prototype/evaluator.mjs"
import { createA03Scene, type A03Evaluator } from "../paritySupport/a03.ts"

export const scene = createA03Scene({
    id: "dealers-fan",
    sourcePath: "scene-ateliers/atelier-03/dealers-fan/prototype/evaluator.mjs",
    sourceSha256: "50993bb61d01548c21bfad829f0296982df23ba7474e251415ff3e160e77ccb2",
    evaluator: evaluator as A03Evaluator,
    recommendedItems: 5,
    cardSizeReference: 44,
    paceReference: 700,
})
