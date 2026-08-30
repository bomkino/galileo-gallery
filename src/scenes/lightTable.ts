import type { MediaItem, TimelineMode, VisualTimelineSegment } from "../types"
import {
    automaticLightTableCoreDurationMs,
    compileLightTableCoreTimeline,
    evaluateLightTableCore,
    LIGHT_TABLE_CORE_MAX_DURATION_MS,
    LIGHT_TABLE_CORE_MAX_VISIBLE,
    minimumLightTableCoreDurationMs,
    normalizeLightTableCoreControls,
    normalizeLightTableCoreStoryTime,
    type CompiledLightTableCoreTimeline,
    type LightTableCoreControls,
    type LightTableCoreSource,
} from "./lightTableCore.ts"

export {
    compileLightTableCoreTimeline,
    evaluateLightTableCore,
    LIGHT_TABLE_CORE_DEFAULT_CONTROLS,
    LIGHT_TABLE_CORE_SHA256,
    lightTableCoreFixture,
    normalizeLightTableCoreControls,
    normalizeLightTableCoreStoryTime,
    stableLightTableCoreStringify,
} from "./lightTableCore.ts"

export const LIGHT_TABLE_ID = "light-table"
export const LIGHT_TABLE_VERSION = 2
export const LIGHT_TABLE_MAX_ITEMS = LIGHT_TABLE_CORE_MAX_VISIBLE
export const LIGHT_TABLE_MAX_DURATION_MS = LIGHT_TABLE_CORE_MAX_DURATION_MS
export const LIGHT_TABLE_TRANSPARENCY_REASON = "Light Table needs an opaque illuminated surface. Transparent export is unavailable for this Scene. Choose another Scene to preserve alpha."

export type LightTableFocusBehavior = "route" | "loupe-only" | "none"

export type LightTableParameters = {
    tableSpread: number
    overlap: number
    underlightStrength: number
    focusBehavior: LightTableFocusBehavior
    nudgeRestraint: number
    fit: "contain" | "cover"
    tableColor: string
}

export type LightTableControlDescriptor =
    | { id: "table-spread" | "overlap" | "nudge-restraint"; owner: "Scene"; label: string; parameter: "tableSpread" | "overlap" | "nudgeRestraint"; kind: "range"; min: number; max: number; step: number; resetValue: number }
    | { id: "underlight-strength"; owner: "Look"; label: string; parameter: "underlightStrength"; kind: "range"; min: number; max: number; step: number; resetValue: number }
    | { id: "focus-behaviour"; owner: "Scene"; label: string; parameter: "focusBehavior"; kind: "choice"; options: readonly LightTableFocusBehavior[]; resetValue: "route" }

export type LightTableTimelineIntent = {
    mode: TimelineMode
    direction: "forward" | "reverse"
    mediaCount: number
    fixedDurationMs: number
    segments: VisualTimelineSegment[]
    fps: number
}

export type LightTableTimelineIssue = {
    code: "duration-below-readable-minimum" | "duration-above-supported-maximum" | "directed-duration-compromise"
    requestedMs: number
    appliedMs: number
}

export type LightTablePhaseId = "wake" | "review" | "final-inspection" | "return"

export type CompiledLightTablePhase = {
    id: LightTablePhaseId
    startMs: number
    endMs: number
    startPhase: number
    endPhase: number
    requestedPaceScale: number
    achievedPaceScale: number
}

export type CompiledLightTableTimeline = {
    mode: TimelineMode
    direction: "forward" | "reverse"
    durationMs: number
    frameCount: number
    readableMinimumMs: number
    phases: CompiledLightTablePhase[]
    issues: LightTableTimelineIssue[]
    core: CompiledLightTableCoreTimeline
}

export type LightTableSource = Pick<MediaItem, "id" | "ratio" | "type"> & {
    failed?: boolean
}

export type LightTableTopology = "empty-table" | "single-inspection" | "bilateral" | "open-bay" | "ordinary" | "bounded-review-grid"

export type LightTablePlane = {
    id: string
    sourceIndex: number
    failed: boolean
    x: number
    y: number
    width: number
    height: number
    rotation: number
    scale: number
    z: number
    focusWeight: number
    underlightOpacity: number
    underlightExpansion: number
    opacity: 1
    filter: "none"
    blend: "normal"
    sourceTimeMs: number
}

export type LightTableEvaluationInput = {
    items: LightTableSource[]
    parameters: LightTableParameters
    timeline: CompiledLightTableTimeline
    timeMs: number
    stageWidth: number
    stageHeight: number
    reducedMotion?: boolean
    manualFocusIndex?: number | null
}

export type LightTableFrame = {
    sceneId: typeof LIGHT_TABLE_ID
    sceneVersion: typeof LIGHT_TABLE_VERSION
    phase: number
    velocity: number
    segmentId: LightTablePhaseId | "seam" | "empty" | "manual-inspection"
    topology: LightTableTopology
    focusId: string | null
    render: {
        background: { kind: "solid"; color: string }
        opaque: true
        artworkOpacity: 1
        artworkFilter: "none"
        artworkBlend: "normal"
        underlightPlacement: "sibling-behind-frame"
        tableLuminance: number
    }
    layout: {
        maximumOcclusion: number
        intersectionCount: number
        outOfBoundsCount: number
    }
    planes: LightTablePlane[]
    stateHash: string
}

const DIRECTED_IDS = ["wake", "review", "final-inspection", "return"] as const
const DIRECTED_PACE = [2, 1, 1, 2] as const
const positiveModulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor

function stableHash(value: unknown) {
    const text = JSON.stringify(value)
    let hash = 0x811c9dc5
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(16).padStart(8, "0")
}

function strictDirectedDuration(segments: VisualTimelineSegment[], automaticDuration: number) {
    if (segments.length === 0) return automaticDuration
    if (segments.length !== DIRECTED_IDS.length) throw new Error("Light Table directed Timeline needs exactly four authored phases.")
    let total = 0
    segments.forEach((segment, index) => {
        const exactKeys = Object.keys(segment).sort().join(":") === ["cycles", "durationMs", "id", "kind", "paceScale"].sort().join(":")
        if (!exactKeys || segment.id !== DIRECTED_IDS[index] || segment.cycles !== 1
            || segment.paceScale !== DIRECTED_PACE[index]
            || (index === 2 ? segment.kind !== "hold" : segment.kind !== "cycle")
            || !Number.isFinite(segment.durationMs) || segment.durationMs <= 0 || segment.durationMs > LIGHT_TABLE_MAX_DURATION_MS) {
            throw new Error("A directed Light Table phase is invalid.")
        }
        total += segment.durationMs
    })
    return total
}

export function automaticLightTableDuration(mediaCount: number) {
    if (!Number.isSafeInteger(mediaCount) || mediaCount < 1 || mediaCount > LIGHT_TABLE_MAX_ITEMS) throw new Error("Light Table media count must be between 1 and 24.")
    return automaticLightTableCoreDurationMs(mediaCount)
}

export function minimumLightTableDuration(mediaCount: number) {
    if (!Number.isSafeInteger(mediaCount) || mediaCount < 1 || mediaCount > LIGHT_TABLE_MAX_ITEMS) throw new Error("Light Table media count must be between 1 and 24.")
    return minimumLightTableCoreDurationMs(mediaCount)
}

export function compileLightTableTimeline(intent: LightTableTimelineIntent): CompiledLightTableTimeline {
    if (!intent || !["automatic", "fixed-duration", "directed"].includes(intent.mode)) throw new Error("Light Table Timeline mode is invalid.")
    if (!Number.isSafeInteger(intent.mediaCount) || intent.mediaCount < 1 || intent.mediaCount > LIGHT_TABLE_MAX_ITEMS) throw new Error("Light Table media count must be between 1 and 24.")
    if (!Number.isFinite(intent.fps) || intent.fps < 1 || intent.fps > 120) throw new Error("Light Table frame rate is invalid.")
    if (!["forward", "reverse"].includes(intent.direction)) throw new Error("Light Table direction is invalid.")
    if (!Array.isArray(intent.segments)) throw new Error("Light Table Timeline segments are invalid.")

    const automaticDuration = automaticLightTableDuration(intent.mediaCount)
    let durationMs: number | undefined
    if (intent.mode === "automatic") {
        if (intent.fixedDurationMs !== 0 || intent.segments.length !== 0) throw new Error("Automatic Light Table cannot contain fixed or directed intent.")
    } else if (intent.mode === "fixed-duration") {
        if (!Number.isFinite(intent.fixedDurationMs) || intent.fixedDurationMs <= 0 || intent.segments.length !== 0) throw new Error("Light Table fixed duration is invalid.")
        durationMs = intent.fixedDurationMs
    } else {
        if (intent.fixedDurationMs !== 0) throw new Error("Directed Light Table cannot contain fixed duration intent.")
        durationMs = strictDirectedDuration(intent.segments, automaticDuration)
    }

    const core = compileLightTableCoreTimeline({ mode: intent.mode, ...(durationMs === undefined ? {} : { durationMs }) }, intent.mediaCount)
    const phases = core.segments.map((segment) => ({
        id: segment.id,
        startMs: segment.startMs,
        endMs: segment.endMs,
        startPhase: segment.start,
        endPhase: segment.end,
        requestedPaceScale: segment.requestedPaceScale,
        achievedPaceScale: segment.achievedPaceScale,
    }))
    const issues = core.issues.flatMap((issue): LightTableTimelineIssue[] => {
        if (!["duration-below-readable-minimum", "duration-above-supported-maximum", "directed-duration-compromise"].includes(issue.code)) return []
        const requestedMs = issue.requestedDurationMs ?? durationMs ?? core.durationMs
        const appliedMs = issue.compiledDurationMs ?? issue.maximumDurationMs ?? core.durationMs
        return [{ code: issue.code as LightTableTimelineIssue["code"], requestedMs, appliedMs }]
    })
    return {
        mode: intent.mode,
        direction: intent.direction,
        durationMs: core.durationMs,
        frameCount: Math.max(1, Math.ceil(core.durationMs / 1_000 * intent.fps)),
        readableMinimumMs: core.minimumDurationMs,
        phases,
        issues,
        core,
    }
}

export function evaluateLightTableTimeline(timeline: CompiledLightTableTimeline, timeMs: number) {
    if (!Number.isFinite(timeMs) || timeMs < 0) throw new Error("Light Table story time is invalid.")
    const raw = timeMs / timeline.durationMs
    const directed = timeline.direction === "reverse" ? 1 - raw : raw
    const story = normalizeLightTableCoreStoryTime(directed)
    const segment = timeline.core.segments.find((candidate) => story.sample < candidate.end) ?? timeline.core.segments[timeline.core.segments.length - 1]
    const sign = timeline.direction === "reverse" ? -1 : 1
    return {
        phase: story.value,
        velocity: sign / timeline.durationMs,
        segmentId: story.terminal ? "seam" as const : segment.id,
        segmentProgress: (story.sample - segment.start) / Math.max(1e-9, segment.end - segment.start),
        storySample: directed,
    }
}

export function validateLightTableParameters(input: LightTableParameters): LightTableParameters {
    if (!input || !["route", "loupe-only", "none"].includes(input.focusBehavior)) throw new Error("Light Table focus behaviour is invalid.")
    if (!["contain", "cover"].includes(input.fit)) throw new Error("Light Table frame fit is invalid.")
    if (!/^#[0-9a-fA-F]{6}$/.test(input.tableColor)) throw new Error("Light Table surface colour is invalid.")
    if (!Number.isFinite(input.tableSpread) || input.tableSpread < 0.52 || input.tableSpread > 0.92) throw new Error("Light Table spread is invalid.")
    if (!Number.isFinite(input.overlap) || input.overlap < 0 || input.overlap > 0.22) throw new Error("Light Table overlap is invalid.")
    if (!Number.isFinite(input.underlightStrength) || input.underlightStrength < 0 || input.underlightStrength > 0.7) throw new Error("Light Table under-light is invalid.")
    if (!Number.isFinite(input.nudgeRestraint) || input.nudgeRestraint < 0 || input.nudgeRestraint > 0.6) throw new Error("Light Table nudge restraint is invalid.")
    return input
}

export function lightTableSourceTimeSeconds(timeMs: number, durationSeconds: number, loop: boolean) {
    if (!Number.isFinite(timeMs) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
    const seconds = Math.max(0, timeMs / 1_000)
    return loop ? positiveModulo(seconds, durationSeconds) : Math.min(seconds, durationSeconds)
}

function emptyFrame(parameters: LightTableParameters): LightTableFrame {
    const state = {
        sceneId: LIGHT_TABLE_ID as typeof LIGHT_TABLE_ID,
        sceneVersion: LIGHT_TABLE_VERSION as typeof LIGHT_TABLE_VERSION,
        phase: 0,
        velocity: 0,
        segmentId: "empty" as const,
        topology: "empty-table" as const,
        focusId: null,
        render: {
            background: { kind: "solid" as const, color: parameters.tableColor },
            opaque: true as const,
            artworkOpacity: 1 as const,
            artworkFilter: "none" as const,
            artworkBlend: "normal" as const,
            underlightPlacement: "sibling-behind-frame" as const,
            tableLuminance: 0.78,
        },
        layout: { maximumOcclusion: 0, intersectionCount: 0, outOfBoundsCount: 0 },
        planes: [] as LightTablePlane[],
    }
    return { ...state, stateHash: stableHash(state) }
}

export function evaluateLightTable(input: LightTableEvaluationInput): LightTableFrame {
    const parameters = validateLightTableParameters(input.parameters)
    if (!Array.isArray(input.items)) throw new Error("Light Table sources are invalid.")
    if (input.items.length > LIGHT_TABLE_MAX_ITEMS) throw new Error("Light Table shows up to 24 sources in v2. All Project media remain preserved.")
    if (!Number.isFinite(input.stageWidth) || !Number.isFinite(input.stageHeight) || input.stageWidth <= 0 || input.stageHeight <= 0) throw new Error("Light Table stage dimensions are invalid.")
    if (!Number.isFinite(input.timeMs) || input.timeMs < 0) throw new Error("Light Table story time is invalid.")
    if (input.items.length === 0) return emptyFrame(parameters)

    const ids = new Set<string>()
    input.items.forEach((item) => {
        if (typeof item.id !== "string" || item.id.length < 1 || item.id.length > 256 || ids.has(item.id)) throw new Error("Light Table source identities must be unique and bounded.")
        if (!Number.isFinite(item.ratio) || item.ratio < 0.05 || item.ratio > 20) throw new Error("Light Table source ratio is invalid.")
        ids.add(item.id)
    })
    if (input.manualFocusIndex != null && (!Number.isSafeInteger(input.manualFocusIndex) || input.manualFocusIndex < 0 || input.manualFocusIndex >= input.items.length)) throw new Error("Light Table manual focus is invalid.")

    const temporal = evaluateLightTableTimeline(input.timeline, input.timeMs)
    const controls: LightTableCoreControls = normalizeLightTableCoreControls({
        tableSpread: parameters.tableSpread,
        overlap: parameters.overlap,
        underlightStrength: parameters.underlightStrength,
        focusBehaviour: parameters.focusBehavior,
        nudgeRestraint: parameters.nudgeRestraint,
    })
    const coreTimeline: CompiledLightTableCoreTimeline = { ...input.timeline.core, controls }
    const sources: LightTableCoreSource[] = input.items.map((item) => ({
        id: item.id,
        ratio: item.ratio,
        kind: item.type,
        failed: Boolean(item.failed),
    }))
    const core = evaluateLightTableCore(coreTimeline, temporal.storySample, sources, {
        reducedMotion: input.reducedMotion,
        canvasRatio: input.stageWidth / input.stageHeight,
        manualFocusIndex: input.manualFocusIndex,
    })
    if (core.apply !== "ok") throw new Error(core.code === "visible-limit" ? "Light Table shows up to 24 sources in v2. All Project media remain preserved." : "Light Table needs at least one source.")

    const planes = core.frames.map((frame): LightTablePlane => ({
        id: frame.id,
        sourceIndex: frame.sourceIndex,
        failed: frame.failed,
        x: frame.x * input.stageWidth,
        y: frame.y * input.stageHeight,
        width: frame.width * input.stageWidth,
        height: frame.width * input.stageWidth / frame.ratio,
        rotation: frame.rotation,
        scale: frame.scale,
        z: frame.z,
        focusWeight: frame.focusWeight,
        underlightOpacity: frame.underlight,
        underlightExpansion: frame.underlightExpansion,
        opacity: frame.media.opacity,
        filter: frame.media.filter,
        blend: frame.media.blend,
        sourceTimeMs: input.timeMs,
    }))
    const state = {
        sceneId: LIGHT_TABLE_ID as typeof LIGHT_TABLE_ID,
        sceneVersion: LIGHT_TABLE_VERSION as typeof LIGHT_TABLE_VERSION,
        phase: core.normalizedTime,
        velocity: input.reducedMotion ? 0 : temporal.velocity,
        segmentId: (input.manualFocusIndex != null ? "manual-inspection" : core.phase) as LightTableFrame["segmentId"],
        topology: core.layout,
        focusId: core.focusIndex == null ? null : input.items[core.focusIndex].id,
        render: {
            background: { kind: "solid" as const, color: parameters.tableColor },
            opaque: true as const,
            artworkOpacity: 1 as const,
            artworkFilter: "none" as const,
            artworkBlend: "normal" as const,
            underlightPlacement: "sibling-behind-frame" as const,
            tableLuminance: 0.78,
        },
        layout: {
            maximumOcclusion: core.layoutMetrics.maxOcclusionFraction,
            intersectionCount: core.layoutMetrics.intersectionCount,
            outOfBoundsCount: core.layoutMetrics.outOfBoundsCount,
        },
        planes,
    }
    return { ...state, stateHash: stableHash(state) }
}

export const lightTableScene = {
    definition: {
        id: LIGHT_TABLE_ID,
        version: LIGHT_TABLE_VERSION,
        name: "Light Table",
        motionSentence: "Prints rest on an opaque illuminated review surface while one exterior loupe moves through the ordered working set.",
    },
    defaults: (): LightTableParameters => ({
        tableSpread: 0.72,
        overlap: 0.1,
        underlightStrength: 0.42,
        focusBehavior: "route",
        nudgeRestraint: 0.28,
        fit: "contain",
        tableColor: "#e8e6de",
    }),
    parameters: validateLightTableParameters,
    compileTimeline: compileLightTableTimeline,
    evaluate: evaluateLightTable,
    controls: [
        { id: "table-spread", owner: "Scene", label: "Table spread", parameter: "tableSpread", kind: "range", min: 0.52, max: 0.92, step: 0.01, resetValue: 0.72 },
        { id: "overlap", owner: "Scene", label: "Overlap", parameter: "overlap", kind: "range", min: 0, max: 0.22, step: 0.01, resetValue: 0.1 },
        { id: "underlight-strength", owner: "Look", label: "Under-light", parameter: "underlightStrength", kind: "range", min: 0, max: 0.7, step: 0.01, resetValue: 0.42 },
        { id: "focus-behaviour", owner: "Scene", label: "Focus", parameter: "focusBehavior", kind: "choice", options: ["route", "loupe-only", "none"], resetValue: "route" },
        { id: "nudge-restraint", owner: "Scene", label: "Nudge restraint", parameter: "nudgeRestraint", kind: "range", min: 0, max: 0.6, step: 0.01, resetValue: 0.28 },
    ] satisfies LightTableControlDescriptor[],
    preview: { fixture: "ordinary-six", representativePhase: 0.5 },
    fixtures: ["one", "two", "five", "ordinary-six", "many-24", "mixed-ratios", "failed-source", "source-video"] as const,
}
