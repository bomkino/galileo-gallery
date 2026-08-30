// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-02/hero-deck-object/prototype/evaluator.mjs"
import { createA02Scene, type A02Evaluator } from "../paritySupport/a02.ts"

export const scene = createA02Scene({
    id: "hero-deck-object",
    sourcePath: "scene-ateliers/atelier-02/hero-deck-object/prototype/evaluator.mjs",
    sourceSha256: "d442223f984a7cf87976e6151d119dc7eeab328001957798957e89eac5ecf68d",
    evaluator: evaluator as A02Evaluator,
    recommendedItems: 5,
    frameScaleReference: 46,
    paceReference: 3800,
})
