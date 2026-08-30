// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-05/contact-sheet/prototype/evaluator.mjs"
import { createA05Scene, type A05Evaluator } from "../paritySupport/a05.ts"

const finite = (value: unknown, fallback = 0) => Number.isFinite(value) ? Number(value) : fallback

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
    decorations({ frame, width, height }) {
        const focus = frame.focus
        if (!focus) return []
        return [{
            id: "contact-sheet-registration-mark",
            kind: "box",
            x: finite(focus.x, width / 2) / width * 100,
            y: finite(focus.y, height / 2) / height * 100,
            width: finite(focus.width, width) / width * 100,
            height: finite(focus.height, height) / height * 100,
            z: 10_000,
            opacity: 1,
            color: "#171717",
            borderWidth: 2,
            radius: 5,
            label: `Select ${String(Math.round(finite(focus.sourceIndex, 0)) + 1).padStart(2, "0")}`,
        }]
    },
})
