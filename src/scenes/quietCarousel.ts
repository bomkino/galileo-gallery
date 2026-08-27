import type { MediaItem, TimelineMode, VisualTimelineSegment } from "../types"

export const QUIET_CAROUSEL_ID = "quiet-carousel"
export const QUIET_CAROUSEL_VERSION = 1

export type QuietCarouselParameters = {
    frameSize: number
    gap: number
    paceMs: number
    depth: number
    fit: "contain" | "cover"
    background: { kind: "solid"; color: string } | { kind: "transparent" }
}

export type QuietCarouselControlDescriptor =
    | { id: "frame-size" | "gap" | "pace" | "depth"; label: string; parameter: keyof Pick<QuietCarouselParameters, "frameSize" | "gap" | "paceMs" | "depth">; kind: "range"; min: number; max: number; step: number; unit: string; resetValue: number }
    | { id: "fit"; label: string; parameter: "fit"; kind: "choice"; options: readonly ["contain", "cover"]; resetValue: "contain" }
    | { id: "background"; label: string; parameter: "background"; kind: "choice"; options: readonly ["solid", "transparent"]; resetValue: "solid" }

export type QuietTimelineIntent = {
    mode: TimelineMode
    axis: "horizontal" | "vertical"
    direction: "forward" | "reverse"
    mediaCount: number
    paceMs: number
    fixedDurationMs: number
    segments: VisualTimelineSegment[]
    fps: number
}

export type CompiledQuietTimelineSegment = VisualTimelineSegment & {
    startMs: number
    endMs: number
    startCycle: number
    endCycle: number
}

export type CompiledQuietTimeline = {
    mode: TimelineMode
    axis: "horizontal" | "vertical"
    direction: "forward" | "reverse"
    durationMs: number
    frameCount: number
    cycleCount: number
    segments: CompiledQuietTimelineSegment[]
}

export type QuietCarouselFrame = {
    phase: number
    velocity: number
    render: {
        fit: "contain" | "cover"
        background: QuietCarouselParameters["background"]
        artworkOpacity: 1
        artworkFilter: "none"
    }
    frames: Array<{
        id: string
        sourceIndex: number
        x: number
        y: number
        width: number
        height: number
        scale: number
        z: number
        visible: boolean
        opacity: 1
    }>
}

export type QuietCarouselEvaluationInput = {
    items: Array<Pick<MediaItem, "id" | "ratio">>
    parameters: QuietCarouselParameters
    timeline: CompiledQuietTimeline
    timeMs: number
    stageWidth: number
    stageHeight: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const positiveModulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor

function boundedNumber(value: number, fallback: number, min: number, max: number) {
    return Number.isFinite(value) ? clamp(value, min, max) : fallback
}

export function defaultCasinoTimeline(): VisualTimelineSegment[] {
    return [
        { id: "fast-opening", kind: "cycle", cycles: 2, paceScale: 2, durationMs: 0 },
        { id: "regular-middle", kind: "cycle", cycles: 1, paceScale: 1, durationMs: 0 },
        { id: "fast-finale", kind: "cycle", cycles: 1, paceScale: 2, durationMs: 0 },
    ]
}

function normalizeSegments(intent: QuietTimelineIntent, baseCycleMs: number): VisualTimelineSegment[] {
    if (intent.mode === "automatic") {
        return [{ id: "automatic-cycle", kind: "cycle", cycles: 1, paceScale: 1, durationMs: baseCycleMs }]
    }
    if (intent.mode === "fixed-duration") {
        const target = boundedNumber(intent.fixedDurationMs, baseCycleMs, 1000, 24 * 60 * 60 * 1000)
        const cycles = Math.max(1, Math.round(target / baseCycleMs))
        return [{ id: "fixed-cycle", kind: "cycle", cycles, paceScale: cycles * baseCycleMs / target, durationMs: target }]
    }
    const source = intent.segments.length > 0 ? intent.segments : defaultCasinoTimeline()
    return source.map((segment) => ({
        ...segment,
        cycles: segment.kind === "hold" ? 0 : Math.max(1, Math.round(segment.cycles)),
        paceScale: boundedNumber(segment.paceScale, 1, 0.05, 20),
        durationMs: segment.durationMs > 0
            ? boundedNumber(segment.durationMs, baseCycleMs, 1, 24 * 60 * 60 * 1000)
            : segment.kind === "hold"
                ? Math.max(250, baseCycleMs * 0.2)
                : Math.max(1, (baseCycleMs * Math.max(1, Math.round(segment.cycles))) / boundedNumber(segment.paceScale, 1, 0.05, 20)),
    }))
}

export function compileQuietTimeline(intent: QuietTimelineIntent): CompiledQuietTimeline {
    const mediaCount = Math.max(1, Math.round(intent.mediaCount))
    const paceMs = boundedNumber(intent.paceMs, 800, 180, 4000)
    const baseCycleMs = clamp(mediaCount * paceMs, 1800, 30000)
    const source = normalizeSegments(intent, baseCycleMs)
    let elapsed = 0
    let cycles = 0
    const segments = source.map((segment) => {
        const startMs = elapsed
        const startCycle = cycles
        elapsed += segment.durationMs
        cycles += segment.cycles
        return { ...segment, startMs, endMs: elapsed, startCycle, endCycle: cycles }
    })
    const durationMs = Math.max(1, elapsed)
    return {
        mode: intent.mode,
        axis: intent.axis,
        direction: intent.direction,
        durationMs,
        frameCount: Math.max(1, Math.ceil((durationMs / 1000) * boundedNumber(intent.fps, 30, 1, 120))),
        cycleCount: cycles,
        segments,
    }
}

export function evaluateQuietTimeline(timeline: CompiledQuietTimeline, timeMs: number) {
    const localTime = positiveModulo(timeMs, timeline.durationMs)
    const segment = timeline.segments.find((candidate) => localTime < candidate.endMs) ?? timeline.segments[timeline.segments.length - 1]
    const segmentDuration = Math.max(1, segment.endMs - segment.startMs)
    const segmentProgress = clamp((localTime - segment.startMs) / segmentDuration, 0, 1)
    const cycle = segment.startCycle + segment.cycles * segmentProgress
    const sign = timeline.direction === "reverse" ? -1 : 1
    return {
        phase: positiveModulo(sign * cycle, 1),
        velocity: segment.kind === "hold" ? 0 : sign * segment.cycles / segmentDuration,
        segmentId: segment.id,
    }
}

export function validateQuietCarouselParameters(input: QuietCarouselParameters): QuietCarouselParameters {
    if (!input || !["contain", "cover"].includes(input.fit)) throw new Error("Quiet Carousel fit is invalid.")
    if (input.background.kind === "solid" && !/^#[0-9a-fA-F]{6}$/.test(input.background.color)) {
        throw new Error("Quiet Carousel background colour is invalid.")
    }
    if (!Number.isFinite(input.frameSize) || input.frameSize < 24 || input.frameSize > 78) throw new Error("Quiet Carousel frame size is invalid.")
    if (!Number.isFinite(input.gap) || input.gap < 0 || input.gap > 240) throw new Error("Quiet Carousel gap is invalid.")
    if (!Number.isFinite(input.paceMs) || input.paceMs < 180 || input.paceMs > 4000) throw new Error("Quiet Carousel pace is invalid.")
    if (!Number.isFinite(input.depth) || input.depth < 0 || input.depth > 40) throw new Error("Quiet Carousel depth is invalid.")
    return input
}

export function evaluateQuietCarousel(input: QuietCarouselEvaluationInput): QuietCarouselFrame {
    const parameters = validateQuietCarouselParameters(input.parameters)
    const count = input.items.length
    const render = { fit: parameters.fit, background: parameters.background, artworkOpacity: 1 as const, artworkFilter: "none" as const }
    if (count === 0) return { phase: 0, velocity: 0, render, frames: [] }
    const stageWidth = Math.max(1, input.stageWidth)
    const stageHeight = Math.max(1, input.stageHeight)
    const temporal = evaluateQuietTimeline(input.timeline, input.timeMs)
    const horizontal = input.timeline.axis === "horizontal"
    const crossExtent = horizontal ? stageHeight : stageWidth
    const mainExtent = horizontal ? stageWidth : stageHeight
    const baseCrossSize = crossExtent * (parameters.frameSize / 100)
    const scaledGap = crossExtent * (parameters.gap / 1080)
    const trackExtent = mainExtent + baseCrossSize * 2 + scaledGap * Math.max(2, count)
    const phaseOffset = Math.SQRT2 / 10

    const frames = input.items.map((item, index) => {
        const ratio = clamp(item.ratio || 16 / 9, 0.05, 20)
        const breathing = count === 1 ? Math.sin(temporal.phase * Math.PI * 2) * mainExtent * 0.025 : 0
        const wrapped = count === 1 ? 0 : positiveModulo(index / count - temporal.phase + phaseOffset + 0.5, 1) - 0.5
        const main = count === 1 ? breathing : wrapped * trackExtent
        const normalizedDepth = clamp(Math.abs(main) / Math.max(1, mainExtent * 0.55), 0, 1)
        const scale = 1 - (parameters.depth / 100) * normalizedDepth
        const width = horizontal ? baseCrossSize * ratio : baseCrossSize
        const height = horizontal ? baseCrossSize : baseCrossSize / ratio
        const visible = Math.abs(main) <= mainExtent * 0.5 + Math.max(width, height)
        return {
            id: item.id,
            sourceIndex: index,
            x: horizontal ? stageWidth / 2 + main : stageWidth / 2,
            y: horizontal ? stageHeight / 2 : stageHeight / 2 + main,
            width,
            height,
            scale,
            z: Math.round((1 - normalizedDepth) * 1000),
            visible,
            opacity: 1 as const,
        }
    })

    return { phase: temporal.phase, velocity: temporal.velocity, render, frames }
}

export const quietCarouselScene = {
    definition: {
        id: QUIET_CAROUSEL_ID,
        version: QUIET_CAROUSEL_VERSION,
        name: "Quiet Carousel",
        motionSentence: "Source frames travel continuously through a calm focus well with modest depth and an invisible loop seam.",
    },
    defaults: (): QuietCarouselParameters => ({
        frameSize: 52,
        gap: 42,
        paceMs: 800,
        depth: 12,
        fit: "contain",
        background: { kind: "solid", color: "#11110f" },
    }),
    parameters: validateQuietCarouselParameters,
    compileTimeline: compileQuietTimeline,
    evaluate: evaluateQuietCarousel,
    controls: [
        { id: "frame-size", label: "Frame size", parameter: "frameSize", kind: "range", min: 24, max: 78, step: 1, unit: "%", resetValue: 52 },
        { id: "gap", label: "Gap", parameter: "gap", kind: "range", min: 0, max: 240, step: 1, unit: "px at 1080", resetValue: 42 },
        { id: "pace", label: "Pace", parameter: "paceMs", kind: "range", min: 180, max: 1800, step: 20, unit: "ms", resetValue: 800 },
        { id: "depth", label: "Depth", parameter: "depth", kind: "range", min: 0, max: 40, step: 1, unit: "%", resetValue: 12 },
        { id: "fit", label: "Frame fit", parameter: "fit", kind: "choice", options: ["contain", "cover"], resetValue: "contain" },
        { id: "background", label: "Background", parameter: "background", kind: "choice", options: ["solid", "transparent"], resetValue: "solid" },
    ] satisfies QuietCarouselControlDescriptor[],
    preview: { fixture: "ordinary-eight", representativePhase: 0.37 },
    fixtures: ["ordinary-eight", "one", "two", "awkward-seven", "mixed-ratios", "transparent-soft-edge"] as const,
}
