// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-04/spiral-image-vortex/prototype/evaluator.mjs"
import { createA04Scene, type A04Evaluator } from "../paritySupport/a04.ts"

export const scene = createA04Scene({
    id: "spiral-image-vortex",
    sourcePath: "scene-ateliers/atelier-04/spiral-image-vortex/prototype/evaluator.mjs",
    sourceSha256: "7212c72d93731e71f6bbb810717c9b3c283474667b45743e53dfc0b5b2be4240",
    evaluator: evaluator as A04Evaluator,
    evaluate: evaluator.evaluateVortex,
    recommendedItems: 6,
    sizeKey: "cardSize",
    sizeReference: 24,
    paceReference: 500,
})
