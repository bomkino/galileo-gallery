// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-05/contact-sheet/prototype/evaluator.mjs"
import { createA05Scene, type A05Evaluator } from "../paritySupport/a05.ts"

export const scene = createA05Scene({
    id: "contact-sheet",
    sourcePath: "scene-ateliers/atelier-05/contact-sheet/prototype/evaluator.mjs",
    sourceSha256: "932251382081d126fed8a04442e2ff8a6c8adc2deee65ca7348b5b5589cbb5d7",
    evaluator: evaluator as A05Evaluator,
    recommendedItems: 8,
    maximumItems: 24,
    paceReference: 620,
    gapParameter: "gutter",
    gapReference: 28,
    opaque: true,
})
