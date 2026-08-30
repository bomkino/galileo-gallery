// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-02/opening-reel/prototype/evaluator.mjs"
import { createA02Scene, type A02Evaluator } from "../paritySupport/a02.ts"

export const scene = createA02Scene({
    id: "opening-reel",
    sourcePath: "scene-ateliers/atelier-02/opening-reel/prototype/evaluator.mjs",
    sourceSha256: "0d57f60093afa33af975f593dbe40c2c5217994a020825c2d0cefb5a9dae0c83",
    evaluator: evaluator as A02Evaluator,
    recommendedItems: 14,
    frameScaleReference: 44,
    paceReference: 230,
    gapReference: 30,
})
