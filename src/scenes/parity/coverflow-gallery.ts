// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-02/coverflow-gallery/prototype/evaluator.mjs"
import { createA02Scene, type A02Evaluator } from "../paritySupport/a02.ts"

export const scene = createA02Scene({
    id: "coverflow-gallery",
    sourcePath: "scene-ateliers/atelier-02/coverflow-gallery/prototype/evaluator.mjs",
    sourceSha256: "6ee7ca53d7a026b00b2f999623fab3dfe17669a1a20dd4aaff92a5463ad2cbe5",
    evaluator: evaluator as A02Evaluator,
    recommendedItems: 5,
    frameScaleReference: 28,
    paceReference: 2800,
    gapReference: 18,
})
