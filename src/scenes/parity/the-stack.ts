// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-02/the-stack/prototype/evaluator.mjs"
import { createA02Scene, type A02Evaluator } from "../paritySupport/a02.ts"

export const scene = createA02Scene({
    id: "the-stack",
    sourcePath: "scene-ateliers/atelier-02/the-stack/prototype/evaluator.mjs",
    sourceSha256: "c8390575e79a9d7a1bc29262a427680ece73e3a62bee3fad2b32f268d418173a",
    evaluator: evaluator as A02Evaluator,
    recommendedItems: 5,
    frameScaleReference: 50,
    paceReference: 2800,
})
