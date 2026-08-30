// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-04/vitrine/prototype/evaluator.mjs"
import { createA04Scene, type A04Evaluator } from "../paritySupport/a04.ts"

export const scene = createA04Scene({
    id: "vitrine",
    sourcePath: "scene-ateliers/atelier-04/vitrine/prototype/evaluator.mjs",
    sourceSha256: "8ef43774b7753fe63aa849d39ebee4d08b18d09d0a0574ad15f057e19a2dfb90",
    evaluator: evaluator as A04Evaluator,
    evaluate: evaluator.evaluateVitrine,
    recommendedItems: 3,
    sizeKey: "presentationScale",
    sizeReference: 60,
    paceReference: 6000,
})
