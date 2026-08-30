import type { ReelConfig } from "../../types"
import type { ParityControl, ParityFrame, ParitySceneContract } from "./types.ts"
import { authoredParameters, parityItems, stableFrameHash } from "./types.ts"

export type A06Timeline = { durationMs: number; [key: string]: unknown }

export type A06Core = {
    DEFAULT_CONTROLS: Readonly<Record<string, unknown>>
    compileTimeline(...args: unknown[]): A06Timeline
    evaluate(...args: unknown[]): Record<string, unknown>
}

export type A06Source = {
    id: string
    name: string
    sourceIndex: number
    ratio: number
    width: number
    height: number
    kind: "image" | "video"
    failed: boolean
    caption: string | null
    transparent: boolean
    alphaEdge: boolean
    proposal: false
    variant: string
}

export type A06CompileContext = {
    evaluator: A06Core
    intent: { mode: "automatic" | "fixed-duration"; durationMs?: number }
    parameters: Record<string, unknown>
    sources: A06Source[]
}

export type A06EvaluateContext = {
    evaluator: A06Core
    timeline: A06Timeline
    progress: number
    parameters: Record<string, unknown>
    sources: A06Source[]
    config: ReelConfig
    reducedMotion: boolean
}

export type A06NormalizeContext = {
    frame: Record<string, unknown>
    sources: A06Source[]
    config: ReelConfig
    progress: number
    durationMs: number
    sourceTimeMs: number
}

type Normalized = Pick<ParityFrame, "cards" | "background" | "opaque"> & {
    phase?: number
    state?: unknown
}

type A06SceneOptions = {
    id: string
    sourcePath: string
    sourceSha256: string
    evaluator: A06Core
    controls: readonly ParityControl[]
    defaultParameters: Readonly<Record<string, number | string | boolean>>
    recommendedItems: number
    maximumItems: number
    paceReference: number
    alphaSupported: boolean
    compile(context: A06CompileContext): A06Timeline
    evaluate(context: A06EvaluateContext): Record<string, unknown>
    normalize(context: A06NormalizeContext): Normalized
}

export const finite = (value: unknown, fallback = 0) => Number.isFinite(value) ? Number(value) : fallback
export const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

function sourcesFor(config: ReelConfig, recommendedItems: number, maximumItems: number): A06Source[] {
    return parityItems(config, recommendedItems).slice(0, maximumItems).map((item, sourceIndex) => {
        const ratio = item.ratio || 16 / 9
        const transparent = item.type === "image" && /\.png($|\?)/i.test(item.url)
        return {
            id: item.id,
            name: item.name,
            sourceIndex,
            ratio,
            width: 1920,
            height: 1920 / ratio,
            kind: item.type,
            failed: false,
            caption: item.caption || null,
            transparent,
            alphaEdge: transparent,
            proposal: false,
            variant: sourceIndex === 0 ? "before" : sourceIndex === 1 ? "after" : "extra",
        }
    })
}

export function createA06Scene(options: A06SceneOptions): ParitySceneContract {
    const parametersFor = (config: ReelConfig) => authoredParameters(config, options.defaultParameters)
    const compiledFor = (config: ReelConfig) => {
        const sources = sourcesFor(config, options.recommendedItems, options.maximumItems)
        const parameters = parametersFor(config)
        const fixed = config.timelineMode === "fixed-duration"
        const intent = fixed
            ? { mode: "fixed-duration" as const, durationMs: config.timelineFixedDurationMs }
            : { mode: "automatic" as const }
        const timeline = options.compile({ evaluator: options.evaluator, intent, parameters, sources })
        const durationMs = fixed
            ? timeline.durationMs
            : Math.max(1, timeline.durationMs * config.settings.paceMs / options.paceReference)
        return { sources, parameters, timeline, durationMs }
    }
    return {
        id: options.id,
        atelier: "A06",
        sourcePath: options.sourcePath,
        sourceSha256: options.sourceSha256,
        recommendedItems: options.recommendedItems,
        maximumItems: options.maximumItems,
        looping: true,
        alphaSupported: options.alphaSupported,
        defaultParameters: options.defaultParameters,
        controls: options.controls,
        durationMs(config) {
            return compiledFor(config).durationMs
        },
        evaluate({ config, timeMs, reducedMotion = false, terminal = false }) {
            const compiled = compiledFor(config)
            const progress = terminal
                ? 1
                : ((timeMs % compiled.durationMs) + compiled.durationMs) % compiled.durationMs / compiled.durationMs
            const frame = options.evaluate({
                evaluator: options.evaluator,
                timeline: compiled.timeline,
                progress,
                parameters: compiled.parameters,
                sources: compiled.sources,
                config,
                reducedMotion,
            })
            const normalized = options.normalize({
                frame,
                sources: compiled.sources,
                config,
                progress,
                durationMs: compiled.durationMs,
                sourceTimeMs: progress * compiled.durationMs,
            })
            return {
                sceneId: options.id,
                durationMs: compiled.durationMs,
                phase: finite(normalized.phase, progress),
                terminal,
                cards: normalized.cards,
                background: normalized.background,
                opaque: normalized.opaque ?? false,
                stateHash: stableFrameHash(normalized.state ?? frame),
            }
        },
    }
}
