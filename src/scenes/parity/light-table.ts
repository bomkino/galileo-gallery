import "../../../scene-ateliers/atelier-06/light-table/prototype/scene-core.js"
import type { ParityControl } from "../paritySupport/types.ts"
import { clamp, createA06Scene, finite, type A06Core } from "../paritySupport/a06.ts"

const evaluator = (globalThis as typeof globalThis & { LightTableCore: A06Core }).LightTableCore

const controls: readonly ParityControl[] = [
    { id: "table-spread", parameter: "tableSpread", label: "Table spread", type: "range", default: 0.72, min: 0.52, max: 0.92, step: 0.01 },
    { id: "overlap", parameter: "overlap", label: "Overlap", type: "range", default: 0.10, min: 0, max: 0.22, step: 0.01 },
    { id: "underlight-strength", parameter: "underlightStrength", label: "Underlight strength", type: "range", default: 0.42, min: 0, max: 0.70, step: 0.01 },
    { id: "focus-behaviour", parameter: "focusBehaviour", label: "Focus behaviour", type: "choice", default: "route", options: ["route", "loupe-only", "none"] },
    { id: "nudge-restraint", parameter: "nudgeRestraint", label: "Nudge restraint", type: "range", default: 0.28, min: 0, max: 0.60, step: 0.01 },
]

const defaults = Object.freeze({ tableSpread: 0.72, overlap: 0.10, underlightStrength: 0.42, focusBehaviour: "route", nudgeRestraint: 0.28 })

export const scene = createA06Scene({
    id: "light-table",
    sourcePath: "scene-ateliers/atelier-06/light-table/prototype/scene-core.js",
    sourceSha256: "58cb28c0a6d44b3334ef0c25bc02f902dd1383270fe194f4145f2f34c1eccbf8",
    evaluator,
    controls,
    defaultParameters: defaults,
    recommendedItems: 5,
    maximumItems: 24,
    paceReference: 1000,
    alphaSupported: false,
    compile({ evaluator: core, intent, parameters, sources }) {
        return core.compileTimeline(intent, sources.length, parameters)
    },
    evaluate({ evaluator: core, timeline, progress, sources, config, reducedMotion }) {
        return core.evaluate(timeline, progress, sources, {
            canvasRatio: config.settings.canvasWidth / Math.max(1, config.settings.canvasHeight),
            reducedMotion,
            manualFocusIndex: null,
        })
    },
    normalize({ frame, sources, config, progress, sourceTimeMs }) {
        const canvasRatio = config.settings.canvasWidth / Math.max(1, config.settings.canvasHeight)
        const frames = Array.isArray(frame.frames) ? frame.frames as Array<Record<string, unknown>> : []
        const cards = frames.map((candidate, index) => {
            const sourceIndex = Math.max(0, Math.min(sources.length - 1, Math.round(finite(candidate.sourceIndex, index))))
            const ratio = Math.max(0.05, sources[sourceIndex]?.ratio ?? 16 / 9)
            const width = clamp(finite(candidate.width, 0.25), 0.001, 1)
            const media = candidate.media as Record<string, unknown> | undefined
            return {
                id: String(candidate.id ?? sources[sourceIndex]?.id ?? `light-${index}`),
                sourceIndex,
                x: finite(candidate.x, 0.5) * 100,
                y: finite(candidate.y, 0.5) * 100,
                width: width * 100,
                height: width * canvasRatio / ratio * 100,
                scale: Math.max(0.001, finite(candidate.scale, 1)),
                rotation: finite(candidate.rotation, 0),
                z: Math.round(finite(candidate.z, index + 1)),
                opacity: clamp(finite(media?.opacity, 1), 0, 1),
                visible: true,
                filter: String(media?.filter ?? "none"),
                blend: String(media?.blend ?? "normal"),
                sourceTimeMs,
            }
        })
        return { phase: progress, cards, opaque: true, background: config.settings.ground, state: frame }
    },
})
