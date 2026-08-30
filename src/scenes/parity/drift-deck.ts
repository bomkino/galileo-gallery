// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-05/drift-deck/prototype/evaluator.mjs"
import { createA05Scene, type A05Evaluator } from "../paritySupport/a05.ts"

export const scene = createA05Scene({
    id: "drift-deck",
    sourcePath: "scene-ateliers/atelier-05/drift-deck/prototype/evaluator.mjs",
    sourceSha256: "55503cd8b183ac6476057abca678e82af9f9b92cfa6af722449ec49583ec77d2",
    evaluator: evaluator as A05Evaluator,
    recommendedItems: 4,
    maximumItems: 12,
    paceReference: 1125,
    liftFactor: 0.12,
})
