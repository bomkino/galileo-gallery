import "../../../scene-ateliers/atelier-06/slide-anatomy-object/prototype/scene-core.js"
import type { ParityControl } from "../paritySupport/types.ts"
import { clamp, createA06Scene, finite, type A06Core } from "../paritySupport/a06.ts"

const evaluator = (globalThis as typeof globalThis & { SlideAnatomyCore: A06Core }).SlideAnatomyCore

const controls: readonly ParityControl[] = [
    { id: "perspective", parameter: "perspective", label: "Perspective", type: "range", default: 0.34, min: 0, max: 0.60, step: 0.01 },
    { id: "separation-depth", parameter: "separationDepth", label: "Separation depth", type: "range", default: 0.58, min: 0.20, max: 0.90, step: 0.01 },
    { id: "lateral-spread", parameter: "lateralSpread", label: "Lateral spread", type: "range", default: 0.52, min: 0.18, max: 0.82, step: 0.01 },
    { id: "inspection-hold", parameter: "inspectionHoldMs", label: "Inspection hold", type: "range", default: 2100, min: 1200, max: 5000, step: 100, unit: "ms" },
    { id: "label-visibility", parameter: "labelVisibility", label: "Labels", type: "choice", default: "known-structure", options: ["known-structure", "numbers-only", "hidden"] },
]

const defaults = Object.freeze({ separationDepth: 0.58, lateralSpread: 0.52, perspective: 0.34, inspectionHoldMs: 2100, labelVisibility: "known-structure" })

export const scene = createA06Scene({
    id: "slide-anatomy-object",
    sourcePath: "scene-ateliers/atelier-06/slide-anatomy-object/prototype/scene-core.js",
    sourceSha256: "470fb4d9da31bd8234c9b411a8ed192b114b2598702b4c31e282176692ae3bc2",
    evaluator,
    controls,
    defaultParameters: defaults,
    recommendedItems: 1,
    maximumItems: 127,
    paceReference: 700,
    alphaSupported: true,
    compile({ evaluator: core, intent, parameters }) {
        return core.compileTimeline(intent, parameters)
    },
    evaluate({ evaluator: core, timeline, progress, sources, config, reducedMotion }) {
        return core.evaluate(timeline, progress, sources, {
            direction: config.settings.direction,
            reducedMotion,
        })
    },
    normalize({ frame, sources, config, progress, sourceTimeMs }) {
        const stage = frame.stage as Record<string, unknown> | undefined
        const planes = Array.isArray(frame.planes) ? frame.planes as Array<Record<string, unknown>> : []
        const sourcePlane = planes.find((plane) => plane.sourceOwned === true) ?? {}
        const ratio = Math.max(0.05, sources[0]?.ratio ?? 16 / 9)
        const canvasRatio = config.settings.canvasWidth / Math.max(1, config.settings.canvasHeight)
        const width = clamp(config.settings.slideHeight, 20, 92)
        const media = frame.source && typeof frame.source === "object"
            ? (frame.source as Record<string, unknown>).media as Record<string, unknown> | undefined
            : undefined
        const labelVisibility = String(frame.labelVisibility ?? "known-structure")
        const decorations = planes.map((plane, index) => {
            const id = String(plane.id ?? `anatomy-plane-${index}`)
            const sourceOwned = plane.sourceOwned === true
            const colors: Record<string, string> = { backing: "#79d6ba", "source-frame": "#f5f1e8", "frame-edge": "#ff775e", "safe-area": "#7ea7ff", caption: "#df9bff" }
            return {
                id: `anatomy-apparatus-${id}`,
                kind: "box" as const,
                x: 50 + finite(plane.x, 0) * 100,
                y: 50 + finite(plane.y, 0) * 100,
                width,
                height: width * canvasRatio / ratio,
                rotation: finite(plane.rotation, 0),
                rotateX: finite(stage?.rotateX, 0),
                rotateY: finite(stage?.rotateY, 0),
                z: Math.round(100 + finite(plane.zOrder, index + 1) + (sourceOwned ? 0.5 : 0)),
                opacity: clamp(finite(plane.opacity, 1), 0, 1),
                color: colors[id] ?? "#f5f1e8",
                fill: id === "backing" ? "rgba(121, 214, 186, 0.14)" : "transparent",
                borderWidth: sourceOwned ? 1 : 2,
                dashed: id === "safe-area",
                radius: config.settings.radius,
                label: labelVisibility === "hidden" ? undefined : labelVisibility === "numbers-only" ? String(index + 1).padStart(2, "0") : String(plane.label ?? id),
            }
        })
        return {
            phase: progress,
            cards: [{
                id: sources[0]?.id ?? "anatomy-source",
                sourceIndex: 0,
                x: 50 + finite(sourcePlane.x, 0) * 100,
                y: 50 + finite(sourcePlane.y, 0) * 100,
                width,
                height: width * canvasRatio / ratio,
                scale: 1,
                rotation: finite(sourcePlane.rotation, 0),
                rotateX: finite(stage?.rotateX, 0),
                rotateY: finite(stage?.rotateY, 0),
                z: Math.round(100 + finite(sourcePlane.zOrder, 0)),
                opacity: clamp(finite(media?.opacity, 1), 0, 1),
                visible: true,
                filter: String(media?.filter ?? "none"),
                blend: String(media?.blend ?? "normal"),
                sourceTimeMs,
            }],
            decorations,
            opaque: false,
            state: frame,
        }
    },
})
