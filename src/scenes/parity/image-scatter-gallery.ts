// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-05/image-scatter-gallery/prototype/evaluator.mjs"
import { createA05Scene, type A05Evaluator } from "../paritySupport/a05.ts"

export const scene = createA05Scene({
    id: "image-scatter-gallery",
    sourcePath: "scene-ateliers/atelier-05/image-scatter-gallery/prototype/evaluator.mjs",
    sourceSha256: "437a683e3baa8f9a7b148bc11a32dbe30045ed229beb6f11f47eb93d6174706a",
    evaluator: evaluator as A05Evaluator,
    recommendedItems: 7,
    maximumItems: 24,
    paceReference: 550,
    liftFactor: 0.14,
})
