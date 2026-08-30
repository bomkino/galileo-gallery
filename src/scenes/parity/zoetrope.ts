// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-04/zoetrope/prototype/evaluator.mjs"
import { createA04Scene, type A04Evaluator } from "../paritySupport/a04.ts"

export const scene = createA04Scene({
    id: "zoetrope",
    sourcePath: "scene-ateliers/atelier-04/zoetrope/prototype/evaluator.mjs",
    sourceSha256: "a2bb3c73c42742dbfe8d6ff2a6f1f06c24be453b679e8212747436e8ea634604",
    evaluator: evaluator as A04Evaluator,
    evaluate: evaluator.evaluateZoetrope,
    recommendedItems: 7,
    sizeKey: "cardSize",
    sizeReference: 34,
    paceReference: 430,
})
