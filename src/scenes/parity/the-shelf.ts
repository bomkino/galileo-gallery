// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-04/the-shelf/prototype/evaluator.mjs"
import { createA04Scene, type A04Evaluator } from "../paritySupport/a04.ts"

export const scene = createA04Scene({
    id: "the-shelf",
    sourcePath: "scene-ateliers/atelier-04/the-shelf/prototype/evaluator.mjs",
    sourceSha256: "8520586750ccf2b51b60625dbb37d8bc54603b1c4c1db17b7aefe9661062fb60",
    evaluator: evaluator as A04Evaluator,
    evaluate: evaluator.evaluateShelf,
    recommendedItems: 6,
    sizeKey: "cardHeight",
    sizeReference: 38,
    paceReference: 470,
    gapReference: 36,
    yIsTop: true,
})
