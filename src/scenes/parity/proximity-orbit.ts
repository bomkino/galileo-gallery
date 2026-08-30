// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-03/proximity-orbit/prototype/evaluator.mjs"
import { createA03Scene, type A03Evaluator } from "../paritySupport/a03.ts"

export const scene = createA03Scene({
    id: "proximity-orbit",
    sourcePath: "scene-ateliers/atelier-03/proximity-orbit/prototype/evaluator.mjs",
    sourceSha256: "de38266eae4670c94836aac2fc829354111bc1efcffa6856a05fd5bd35d71ebd",
    evaluator: evaluator as A03Evaluator,
    recommendedItems: 7,
    cardSizeReference: 30,
    paceReference: 500,
})
