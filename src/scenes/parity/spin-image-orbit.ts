// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-03/spin-image-orbit/prototype/evaluator.mjs"
import { createA03Scene, type A03Evaluator } from "../paritySupport/a03.ts"

export const scene = createA03Scene({
    id: "spin-image-orbit",
    sourcePath: "scene-ateliers/atelier-03/spin-image-orbit/prototype/evaluator.mjs",
    sourceSha256: "6d15b49b5aec38d9f222051d1f0881ec905b05341ada5384c605eec87c4c2429",
    evaluator: evaluator as A03Evaluator,
    recommendedItems: 6,
    cardSizeReference: 28,
    paceReference: 500,
})
