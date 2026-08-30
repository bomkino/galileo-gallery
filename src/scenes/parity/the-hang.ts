// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-05/the-hang/prototype/evaluator.mjs"
import { createA05Scene, type A05Evaluator } from "../paritySupport/a05.ts"

export const scene = createA05Scene({
    id: "the-hang",
    sourcePath: "scene-ateliers/atelier-05/the-hang/prototype/evaluator.mjs",
    sourceSha256: "5fbbf879c45a14a944831aff39628df1e7f2244007d1f5f2fc9a93715d262592",
    evaluator: evaluator as A05Evaluator,
    recommendedItems: 8,
    maximumItems: 10,
    paceReference: 850,
})
