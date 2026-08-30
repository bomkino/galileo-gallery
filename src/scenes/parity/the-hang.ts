// @ts-expect-error Immutable normalized evaluator is JavaScript evidence, not rewritten TypeScript.
import * as evaluator from "../../../scene-ateliers/atelier-05/the-hang/prototype/evaluator.mjs"
import { createA05Scene, type A05Evaluator } from "../paritySupport/a05.ts"

const finite = (value: unknown, fallback = 0) => Number.isFinite(value) ? Number(value) : fallback

export const scene = createA05Scene({
    id: "the-hang",
    sourcePath: "scene-ateliers/atelier-05/the-hang/prototype/evaluator.mjs",
    sourceSha256: "5fbbf879c45a14a944831aff39628df1e7f2244007d1f5f2fc9a93715d262592",
    evaluator: evaluator as A05Evaluator,
    recommendedItems: 8,
    maximumItems: 10,
    paceReference: 850,
    decorations({ frame, width, height }) {
        const rawCards = frame.cards.filter((card) => card.visible !== false)
        const pivots = rawCards.map((card) => ({ x: finite(card.pivotX), y: finite(card.pivotY) }))
        const wires = rawCards.map((card, index) => {
            const pivotX = finite(card.pivotX)
            const pivotY = finite(card.pivotY)
            const cardX = finite(card.x, pivotX)
            const cardY = finite(card.y, pivotY)
            const dx = cardX - pivotX
            const dy = cardY - pivotY
            return {
                id: `hang-wire-${String(card.id ?? index)}`,
                kind: "line" as const,
                x: (pivotX + cardX) / 2 / width * 100,
                y: (pivotY + cardY) / 2 / height * 100,
                width: Math.hypot(dx, dy) / width * 100,
                height: 0.16,
                rotation: Math.atan2(dy, dx) * 180 / Math.PI,
                z: Math.round(finite(card.z, index)) - 1,
                opacity: 0.72,
                color: "#d7d2c8",
            }
        })
        if (pivots.length < 1) return wires
        const minimumX = Math.min(...pivots.map(({ x }) => x))
        const maximumX = Math.max(...pivots.map(({ x }) => x))
        const averageY = pivots.reduce((total, { y }) => total + y, 0) / pivots.length
        return [{
            id: "hang-rail",
            kind: "line" as const,
            x: (minimumX + maximumX) / 2 / width * 100,
            y: averageY / height * 100,
            width: Math.max(1, maximumX - minimumX) / width * 100,
            height: 0.22,
            z: -2,
            opacity: 0.8,
            color: "#d7d2c8",
        }, ...wires]
    },
})
