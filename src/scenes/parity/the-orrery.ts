// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-04/the-orrery/prototype/evaluator.mjs"
import { createA04Scene, type A04Evaluator } from "../paritySupport/a04.ts"

export const scene = createA04Scene({
    id: "the-orrery",
    sourcePath: "scene-ateliers/atelier-04/the-orrery/prototype/evaluator.mjs",
    sourceSha256: "3b1df09f29f9b35f123c29355c4d7be101aa31bc8ae1276ad49b03fbaa870fbb",
    evaluator: evaluator as A04Evaluator,
    evaluate: evaluator.evaluateOrrery,
    recommendedItems: 9,
    sizeKey: "satelliteScale",
    sizeReference: 32,
    paceReference: 620,
})
