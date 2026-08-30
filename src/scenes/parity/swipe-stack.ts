// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-02/swipe-stack/prototype/evaluator.mjs"
import { createA02Scene, type A02Evaluator } from "../paritySupport/a02.ts"

export const scene = createA02Scene({
    id: "swipe-stack",
    sourcePath: "scene-ateliers/atelier-02/swipe-stack/prototype/evaluator.mjs",
    sourceSha256: "aaf6b68b6fd6434c0759f75c5db5393055275372f89532e6f1403d0cf5d92fb6",
    evaluator: evaluator as A02Evaluator,
    recommendedItems: 4,
    frameScaleReference: 42,
    paceReference: 540,
})
