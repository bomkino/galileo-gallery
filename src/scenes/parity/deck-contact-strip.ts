// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-05/deck-contact-strip/prototype/evaluator.mjs"
import { createA05Scene, type A05Evaluator } from "../paritySupport/a05.ts"

export const scene = createA05Scene({
    id: "deck-contact-strip",
    sourcePath: "scene-ateliers/atelier-05/deck-contact-strip/prototype/evaluator.mjs",
    sourceSha256: "5e8481e867a75b0b94ddf93b55da796316c9f66ff505092302b501ea16cc69c9",
    evaluator: evaluator as A05Evaluator,
    recommendedItems: 6,
    maximumItems: 24,
    paceReference: 620,
    sizeParameter: "frameSize",
    sizeReference: 30,
    gapParameter: "gap",
    gapReference: 18,
})
