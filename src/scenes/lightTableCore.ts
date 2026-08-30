export const LIGHT_TABLE_CORE_AUTHORITY_SHA256 = "58cb28c0a6d44b3334ef0c25bc02f902dd1383270fe194f4145f2f34c1eccbf8"
export const LIGHT_TABLE_CORE_IMPLEMENTATION_SHA256 = "f10702b12e1f90ad4db655b33179ad04c3100bf08ec9d988e52f8d9b599bcfcc"

const TAU = Math.PI * 2
export const LIGHT_TABLE_CORE_MAX_VISIBLE = 24
export const LIGHT_TABLE_CORE_MAX_DURATION_MS = 60_000
export const LIGHT_TABLE_CORE_MIN_SOURCE_RATIO = 0.05
export const LIGHT_TABLE_CORE_MAX_SOURCE_RATIO = 20
export const LIGHT_TABLE_CORE_MIN_CANVAS_RATIO = 64 / 7_680
export const LIGHT_TABLE_CORE_MAX_CANVAS_RATIO = 7_680 / 64
const VALID_MODES = new Set(["automatic", "fixed-duration", "directed"] as const)

export type LightTableCoreMode = "automatic" | "fixed-duration" | "directed"
export type LightTableCoreControls = {
    tableSpread: number
    overlap: number
    underlightStrength: number
    focusBehaviour: "route" | "loupe-only" | "none"
    nudgeRestraint: number
}

export type LightTableCoreSource = {
    id: string
    name?: string
    ratio: number
    kind?: "image" | "video"
    failed?: boolean
    chart?: boolean
    paletteIndex?: number
}

export type LightTableCoreIssue = {
    code: string
    requestedMode?: string
    compiledMode?: LightTableCoreMode
    requestedDurationMs?: number | null
    compiledDurationMs?: number
    minimumDurationMs?: number
    maximumDurationMs?: number
}

export type LightTableCoreSegment = {
    id: "wake" | "review" | "final-inspection" | "return"
    kind: "move" | "cycle" | "hold"
    group: "opening" | "middle" | "finale"
    base: number
    preferred: number
    min: number
    requestedPaceScale: number
    durationMs: number
    achievedPaceScale: number
    index: number
    startMs: number
    endMs: number
    start: number
    end: number
}

export type CompiledLightTableCoreTimeline = {
    sceneId: "light-table"
    mode: LightTableCoreMode
    durationMs: number
    minimumDurationMs: number
    count: number
    controls: LightTableCoreControls
    issues: readonly LightTableCoreIssue[]
    segments: readonly LightTableCoreSegment[]
}

export type LightTableCoreFrame = {
    id: string
    sourceIndex: number
    kind: "image" | "video"
    failed: boolean
    ratio: number
    x: number
    y: number
    width: number
    rotation: number
    scale: number
    z: number
    focusWeight: number
    underlight: number
    underlightExpansion: number
    media: { opacity: 1; filter: "none"; blend: "normal" }
}

export type LightTableCoreSuccess = {
    apply: "ok"
    sceneId: "light-table"
    normalizedTime: number
    phase: LightTableCoreSegment["id"] | "seam"
    phaseSeam: boolean
    layout: "single-inspection" | "bilateral" | "open-bay" | "ordinary" | "bounded-review-grid"
    focusIndex: number | null
    focusWeight: number
    reducedMotion: boolean
    controls: LightTableCoreControls
    capability: { transparentOutput: false }
    layoutMetrics: { maxOcclusionFraction: number; intersectionCount: number; outOfBoundsCount: number }
    frames: LightTableCoreFrame[]
}

export type LightTableCoreFailure = {
    apply: "fail"
    code: "minimum-items" | "visible-limit"
    preservedCount: number
    visibleCount?: 0
    sceneId: "light-table"
}

export const LIGHT_TABLE_CORE_DEFAULT_CONTROLS: Readonly<LightTableCoreControls> = Object.freeze({
    tableSpread: 0.72,
    overlap: 0.10,
    underlightStrength: 0.42,
    focusBehaviour: "route",
    nudgeRestraint: 0.28,
})

const EXPLICIT: Readonly<Record<number, readonly (readonly [number, number, number])[]>> = Object.freeze({
    1: [[0.50, 0.50, 0]],
    2: [[0.33, 0.50, -2.8], [0.67, 0.50, 2.8]],
    5: [[0.25, 0.31, -4.0], [0.52, 0.27, 2.1], [0.73, 0.45, 4.1], [0.34, 0.68, 3.0], [0.62, 0.69, -3.2]],
    6: [[0.24, 0.31, -4.0], [0.50, 0.25, 2.1], [0.75, 0.36, 4.1], [0.27, 0.68, 3.0], [0.52, 0.63, -3.2], [0.76, 0.70, 1.3]],
})

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount
const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor
const smooth = (value: number) => { const x = clamp(value, 0, 1); return x * x * (3 - 2 * x) }
const smoother = (value: number) => { const x = clamp(value, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10) }

function finiteNumber(value: unknown, fallback: number) {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : fallback
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
    return clamp(finiteNumber(value, fallback), minimum, maximum)
}

function normalizedCanvasRatio(value: unknown) {
    return boundedNumber(value, 16 / 9, LIGHT_TABLE_CORE_MIN_CANVAS_RATIO, LIGHT_TABLE_CORE_MAX_CANVAS_RATIO)
}

function normalizedSourceRatio(value: unknown) {
    return boundedNumber(value, 16 / 9, LIGHT_TABLE_CORE_MIN_SOURCE_RATIO, LIGHT_TABLE_CORE_MAX_SOURCE_RATIO)
}

export function normalizeLightTableCoreStoryTime(value: unknown) {
    const numeric = finiteNumber(value, 0)
    if (numeric === 1) return { value: 1, sample: 0, terminal: true }
    return { value: mod(numeric, 1), sample: mod(numeric, 1), terminal: false }
}

function normalizeMode(value: unknown, issues: LightTableCoreIssue[]): LightTableCoreMode {
    const mode = typeof value === "string" ? value : "automatic"
    if (VALID_MODES.has(mode as LightTableCoreMode)) return mode as LightTableCoreMode
    issues.push({ code: "invalid-timeline-mode", requestedMode: mode, compiledMode: "automatic" })
    return "automatic"
}

export function normalizeLightTableCoreControls(input?: Partial<LightTableCoreControls> | null): LightTableCoreControls {
    const source = { ...LIGHT_TABLE_CORE_DEFAULT_CONTROLS, ...(input ?? {}) }
    return Object.freeze({
        tableSpread: boundedNumber(source.tableSpread, LIGHT_TABLE_CORE_DEFAULT_CONTROLS.tableSpread, 0.52, 0.92),
        overlap: boundedNumber(source.overlap, LIGHT_TABLE_CORE_DEFAULT_CONTROLS.overlap, 0, 0.22),
        underlightStrength: boundedNumber(source.underlightStrength, LIGHT_TABLE_CORE_DEFAULT_CONTROLS.underlightStrength, 0, 0.70),
        focusBehaviour: ["route", "loupe-only", "none"].includes(String(source.focusBehaviour))
            ? source.focusBehaviour as LightTableCoreControls["focusBehaviour"]
            : LIGHT_TABLE_CORE_DEFAULT_CONTROLS.focusBehaviour,
        nudgeRestraint: boundedNumber(source.nudgeRestraint, LIGHT_TABLE_CORE_DEFAULT_CONTROLS.nudgeRestraint, 0, 0.60),
    })
}

export function minimumLightTableCoreDurationMs(count: unknown) {
    const visited = clamp(Math.round(finiteNumber(count, 1)), 1, LIGHT_TABLE_CORE_MAX_VISIBLE)
    return Math.max(6_000, 1_200 + visited * 680)
}

export function automaticLightTableCoreDurationMs(count: unknown) {
    const visible = clamp(Math.round(finiteNumber(count, 1)), 1, LIGHT_TABLE_CORE_MAX_VISIBLE)
    return clamp(6_880 + 520 * visible, 8_000, 18_000)
}

type Blueprint = Omit<LightTableCoreSegment, "durationMs" | "achievedPaceScale" | "index" | "startMs" | "endMs" | "start" | "end">
type DirectedDurationIntent = Readonly<{ id: LightTableCoreSegment["id"]; durationMs: number }>

function timelineBlueprint(count: number, targetDurationMs: number, mode: LightTableCoreMode): Blueprint[] {
    const reviewMinimum = Math.max(1_600, Math.min(LIGHT_TABLE_CORE_MAX_VISIBLE, Math.max(1, count)) * 420)
    const minimums = { wake: 500, review: reviewMinimum, final: 900, return: 500 }
    const base = { wake: 1_000, review: Math.max(reviewMinimum, targetDurationMs - 3_200), final: 1_400, return: 800 }
    return [
        { id: "wake", kind: "move", group: "opening", base: base.wake, preferred: mode === "directed" ? Math.max(minimums.wake, Math.round(base.wake / 2)) : base.wake, min: minimums.wake, requestedPaceScale: mode === "directed" ? 2 : 1 },
        { id: "review", kind: "cycle", group: "middle", base: base.review, preferred: base.review, min: minimums.review, requestedPaceScale: 1 },
        { id: "final-inspection", kind: "hold", group: "middle", base: base.final, preferred: base.final, min: minimums.final, requestedPaceScale: 1 },
        { id: "return", kind: "move", group: "finale", base: base.return, preferred: mode === "directed" ? Math.max(minimums.return, Math.round(base.return / 2)) : base.return, min: minimums.return, requestedPaceScale: mode === "directed" ? 2 : 1 },
    ]
}

function distributeDurations(targetDurationMs: number, blueprint: Blueprint[]) {
    const minimumTotal = blueprint.reduce((sum, segment) => sum + segment.min, 0)
    const target = Math.max(minimumTotal, targetDurationMs)
    const flexible = blueprint.map((segment) => Math.max(0, segment.preferred - segment.min))
    const flexibleTotal = flexible.reduce((sum, value) => sum + value, 0)
    const remaining = target - minimumTotal
    let assigned = 0
    return blueprint.map((segment, index) => {
        const extra = index === blueprint.length - 1
            ? remaining - assigned
            : flexibleTotal > 0
                ? Math.floor(remaining * flexible[index] / flexibleTotal)
                : Math.floor(remaining / blueprint.length)
        assigned += extra
        const durationMs = segment.min + extra
        return { ...segment, durationMs, achievedPaceScale: segment.base / Math.max(1, durationMs) }
    })
}

function directedDurationsFromIntent(value: unknown, issues: LightTableCoreIssue[]): DirectedDurationIntent[] | null {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) return null
    const ids: LightTableCoreSegment["id"][] = ["wake", "review", "final-inspection", "return"]
    if (!Array.isArray(value) || value.length !== ids.length) {
        issues.push({ code: "invalid-directed-segments" })
        return null
    }
    const durations = value.map((candidate, index) => {
        if (!candidate || typeof candidate !== "object") return null
        const record = candidate as Record<string, unknown>
        const durationMs = Number(record.durationMs)
        if (record.id !== ids[index] || !Number.isFinite(durationMs) || durationMs <= 0) return null
        return Object.freeze({ id: ids[index], durationMs })
    })
    if (durations.some((duration) => duration === null)) {
        issues.push({ code: "invalid-directed-segments" })
        return null
    }
    return durations as DirectedDurationIntent[]
}

export function compileLightTableCoreTimeline(
    intent: { mode?: unknown; durationMs?: unknown; segments?: unknown } | null | undefined,
    count: unknown,
    controls?: Partial<LightTableCoreControls> | null,
): CompiledLightTableCoreTimeline {
    const normalizedCount = clamp(Math.round(finiteNumber(count, 1)), 1, LIGHT_TABLE_CORE_MAX_VISIBLE)
    const issues: LightTableCoreIssue[] = []
    const mode = normalizeMode(intent?.mode, issues)
    const authoredDirected = mode === "directed" ? directedDurationsFromIntent(intent?.segments, issues) : null
    const automatic = automaticLightTableCoreDurationMs(normalizedCount)
    const minimum = minimumLightTableCoreDurationMs(normalizedCount)
    const authoredDuration = authoredDirected?.reduce((sum, segment) => sum + segment.durationMs, 0)
    const requestedRaw = authoredDuration ?? (intent && Object.prototype.hasOwnProperty.call(intent, "durationMs") ? Number(intent.durationMs) : automatic)
    let requested = Number.isFinite(requestedRaw) ? requestedRaw : automatic

    if (!Number.isFinite(requestedRaw) && mode !== "automatic") {
        issues.push({ code: "invalid-duration", requestedDurationMs: null, compiledDurationMs: Math.max(minimum, automatic) })
    }
    if (requested > LIGHT_TABLE_CORE_MAX_DURATION_MS) {
        issues.push({ code: "duration-above-supported-maximum", requestedDurationMs: requested, maximumDurationMs: LIGHT_TABLE_CORE_MAX_DURATION_MS })
        requested = LIGHT_TABLE_CORE_MAX_DURATION_MS
    }

    let target = automatic
    if (mode !== "automatic") {
        target = requested
        if (target < minimum) {
            issues.push({
                code: mode === "directed" ? "directed-duration-compromise" : "duration-below-readable-minimum",
                requestedDurationMs: target,
                minimumDurationMs: minimum,
                compiledDurationMs: minimum,
            })
            target = minimum
        }
    }

    const blueprint = timelineBlueprint(normalizedCount, Math.max(target, minimum), mode)
    const authoredDirectedIsExact = Boolean(authoredDirected)
        && target === authoredDuration
        && target <= LIGHT_TABLE_CORE_MAX_DURATION_MS
        && authoredDirected!.every((segment, index) => segment.durationMs >= blueprint[index].min)
    if (authoredDirected && !authoredDirectedIsExact && !issues.some((issue) => issue.code === "directed-duration-compromise")) {
        issues.push({
            code: "directed-duration-compromise",
            requestedDurationMs: authoredDuration,
            minimumDurationMs: minimum,
            compiledDurationMs: target,
        })
    }
    const withDuration = authoredDirectedIsExact
        ? blueprint.map((segment, index) => ({
            ...segment,
            durationMs: authoredDirected![index].durationMs,
            achievedPaceScale: segment.base / authoredDirected![index].durationMs,
        }))
        : distributeDurations(mode === "automatic" ? automatic : target, blueprint)
    const durationMs = withDuration.reduce((sum, segment) => sum + segment.durationMs, 0)
    let cursor = 0
    const segments = withDuration.map((segment, index): LightTableCoreSegment => {
        const startMs = cursor
        cursor += segment.durationMs
        return Object.freeze({ ...segment, index, startMs, endMs: cursor, start: startMs / durationMs, end: cursor / durationMs })
    })

    return Object.freeze({
        sceneId: "light-table",
        mode,
        durationMs,
        minimumDurationMs: minimum,
        count: normalizedCount,
        controls: normalizeLightTableCoreControls(controls),
        issues: Object.freeze(issues),
        segments: Object.freeze(segments),
    })
}

function phaseAt(compiled: CompiledLightTableCoreTimeline, time: number) {
    return compiled.segments.find((segment) => time < segment.end) ?? compiled.segments[compiled.segments.length - 1]
}

function focusState(
    time: number,
    sources: LightTableCoreSource[],
    behaviour: LightTableCoreControls["focusBehaviour"],
    reducedMotion: boolean,
    manualFocusIndex: unknown,
    compiled: CompiledLightTableCoreTimeline,
) {
    const count = sources.length
    const valid = sources.map((source, index) => ({ source, index })).filter(({ source }) => !source.failed)
    const lastValid = valid.length ? valid[valid.length - 1].index : Math.max(0, count - 1)
    if (Number.isInteger(manualFocusIndex) && Number(manualFocusIndex) >= 0 && Number(manualFocusIndex) < count) {
        return { index: Number(manualFocusIndex), weight: 1, manual: true }
    }
    if (reducedMotion) return { index: valid.length ? valid[0].index : 0, weight: count ? 0.72 : 0, manual: false }
    if (behaviour === "none" || count === 0) return { index: null, weight: 0, manual: false }
    const phase = phaseAt(compiled, time)
    const phaseProgress = clamp((time - phase.start) / Math.max(1e-9, phase.end - phase.start), 0, 1)
    if (phase.id === "final-inspection") {
        const weight = smooth(Math.min(1, phaseProgress / 0.20)) * (1 - smooth(Math.max(0, (phaseProgress - 0.74) / 0.26)))
        return { index: lastValid, weight, manual: false }
    }
    if (phase.id === "return") return { index: lastValid, weight: (1 - smoother(phaseProgress)) * 0.35, manual: false }
    if (behaviour === "loupe-only" || phase.id === "wake") return { index: null, weight: 0, manual: false }
    const review = compiled.segments.find((segment) => segment.id === "review") as LightTableCoreSegment
    const reviewProgress = clamp((time - review.start) / Math.max(1e-9, review.end - review.start), 0, 0.999999999)
    const stationFloat = reviewProgress * count
    const index = Math.min(count - 1, Math.floor(stationFloat))
    const local = stationFloat - index
    const enter = smooth(local / 0.22)
    const leave = 1 - smooth((local - 0.82) / 0.18)
    return { index, weight: clamp(enter * leave, 0, 1), manual: false }
}

function layoutName(count: number): LightTableCoreSuccess["layout"] {
    if (count === 1) return "single-inspection"
    if (count === 2) return "bilateral"
    if (count === 5) return "open-bay"
    if (count === 6) return "ordinary"
    return "bounded-review-grid"
}

function boundedSlots(count: number, canvasRatio: unknown): number[][] {
    if (EXPLICIT[count]) return EXPLICIT[count].map((slot) => [...slot])
    const ratio = normalizedCanvasRatio(canvasRatio)
    const columns = clamp(Math.ceil(Math.sqrt(count * ratio)), 2, Math.min(7, count))
    const rows = Math.ceil(count / columns)
    const left = 0.10
    const right = 0.90
    const top = 0.12
    const bottom = 0.88
    return Array.from({ length: count }, (_, index) => {
        const row = Math.floor(index / columns)
        const column = index % columns
        const itemsInRow = Math.min(columns, count - row * columns)
        const rowOffset = (columns - itemsInRow) / 2
        const nx = columns === 1 ? 0.5 : (column + rowOffset) / Math.max(1, columns - 1)
        const ny = rows === 1 ? 0.5 : row / Math.max(1, rows - 1)
        const deterministicJitterX = Math.sin((index + 1) * 12.9898) * 0.008
        const deterministicJitterY = Math.sin((index + 1) * 78.233) * 0.008
        const rotation = Math.sin((index + 1) * 1.913) * 2.2
        return [mix(left, right, nx) + deterministicJitterX, mix(top, bottom, ny) + deterministicJitterY, rotation]
    })
}

function nominalWidthForCount(count: number) {
    if (count <= 1) return 0.56
    if (count === 2) return 0.38
    if (count <= 6) return 0.29
    if (count <= 12) return 0.17
    return 0.115
}

function frameWidthForRatio(count: number, sourceRatio: unknown, canvasRatio: unknown) {
    const ratio = normalizedSourceRatio(sourceRatio)
    const stageRatio = normalizedCanvasRatio(canvasRatio)
    const nominalWidth = nominalWidthForCount(count)
    const maxNormalizedHeight = count <= 2 ? 0.62 : count <= 6 ? 0.40 : count <= 12 ? 0.21 : 0.15
    const widthFromHeight = maxNormalizedHeight * ratio / stageRatio
    return Math.min(nominalWidth, widthFromHeight)
}

function normalizedFrameAabbDimensions(width: number, ratio: number, canvasRatio: number, rotation: number, scale: number) {
    const radians = Math.abs(rotation) * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    const scaledWidth = width * scale
    const scaledHeightInStageWidth = scaledWidth / ratio
    return {
        width: scaledWidth * cosine + scaledHeightInStageWidth * sine,
        height: (scaledWidth * sine + scaledHeightInStageWidth * cosine) * canvasRatio,
    }
}

function containedRotation(width: number, ratio: number, canvasRatio: number, rotation: number, scale: number, margin: number) {
    const maximumExtent = 1 - margin * 2
    const requested = Math.abs(rotation)
    const requestedBounds = normalizedFrameAabbDimensions(width, ratio, canvasRatio, requested, scale)
    if (requestedBounds.width <= maximumExtent && requestedBounds.height <= maximumExtent) return rotation

    let lower = 0
    let upper = requested
    for (let pass = 0; pass < 32; pass += 1) {
        const candidate = (lower + upper) / 2
        const bounds = normalizedFrameAabbDimensions(width, ratio, canvasRatio, candidate, scale)
        if (bounds.width <= maximumExtent && bounds.height <= maximumExtent) lower = candidate
        else upper = candidate
    }
    return Math.sign(rotation) * lower
}

export function lightTableCoreRectangleMetrics(frames: LightTableCoreFrame[], canvasRatio: unknown) {
    const stageRatio = normalizedCanvasRatio(canvasRatio)
    // Occlusion keeps the pinned print-footprint contract; containment follows the rotated pixels the renderer emits.
    const rectangles = frames.map((frame) => {
        const width = frame.width * frame.scale
        const height = width * stageRatio / frame.ratio * frame.scale
        return { left: frame.x - width / 2, right: frame.x + width / 2, top: frame.y - height / 2, bottom: frame.y + height / 2, area: width * height }
    })
    const renderedBounds = frames.map((frame) => {
        const { width, height } = normalizedFrameAabbDimensions(frame.width, frame.ratio, stageRatio, frame.rotation, frame.scale)
        return { left: frame.x - width / 2, right: frame.x + width / 2, top: frame.y - height / 2, bottom: frame.y + height / 2 }
    })
    let maxOcclusionFraction = 0
    let intersectionCount = 0
    for (let leftIndex = 0; leftIndex < rectangles.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < rectangles.length; rightIndex += 1) {
            const left = rectangles[leftIndex]
            const right = rectangles[rightIndex]
            const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
            const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
            const area = width * height
            if (area > 0) {
                intersectionCount += 1
                maxOcclusionFraction = Math.max(maxOcclusionFraction, area / Math.max(1e-9, Math.min(left.area, right.area)))
            }
        }
    }
    const outOfBoundsCount = renderedBounds.filter((rectangle) => rectangle.left < 0 || rectangle.right > 1 || rectangle.top < 0 || rectangle.bottom > 1).length
    return { maxOcclusionFraction, intersectionCount, outOfBoundsCount }
}

export function evaluateLightTableCore(
    compiled: CompiledLightTableCoreTimeline,
    time: unknown,
    sources: LightTableCoreSource[],
    options?: { reducedMotion?: unknown; canvasRatio?: unknown; manualFocusIndex?: unknown },
): LightTableCoreSuccess | LightTableCoreFailure {
    const opts = options ?? {}
    if (!Array.isArray(sources)) throw new Error("sources must be an array")
    if (sources.length === 0) return { apply: "fail", code: "minimum-items", preservedCount: 0, sceneId: "light-table" }
    if (sources.length > LIGHT_TABLE_CORE_MAX_VISIBLE) return { apply: "fail", code: "visible-limit", preservedCount: sources.length, visibleCount: 0, sceneId: "light-table" }

    const story = normalizeLightTableCoreStoryTime(time)
    const sampleTime = story.sample
    const controls = normalizeLightTableCoreControls(compiled?.controls)
    const reducedMotion = Boolean(opts.reducedMotion)
    const canvasRatio = normalizedCanvasRatio(opts.canvasRatio)
    const focus = focusState(sampleTime, sources, controls.focusBehaviour, reducedMotion, opts.manualFocusIndex, compiled)
    const slots = boundedSlots(sources.length, canvasRatio)
    const spread = controls.tableSpread
    const many = sources.length > 6
    const overlapPull = controls.overlap * (many ? 0.16 : 0.72)

    const frames = slots.map((slot, index): LightTableCoreFrame => {
        const source = sources[index]
        const ratio = normalizedSourceRatio(source.ratio)
        const width = frameWidthForRatio(sources.length, ratio, canvasRatio)
        const baseX = 0.5 + (slot[0] - 0.5) * spread * (1 - overlapPull)
        const baseY = 0.5 + (slot[1] - 0.5) * spread * (1 - overlapPull * 0.82)
        const frequencyX = 1 + (index % 3)
        const frequencyY = 1 + ((index + 1) % 2)
        const phase = (index + 1) * 0.73
        const nudge = reducedMotion ? 0 : controls.nudgeRestraint
        const driftScale = many ? 0.55 : 1
        const driftX = Math.sin(TAU * frequencyX * sampleTime + phase) * nudge * 0.010 * driftScale
        const driftY = Math.sin(TAU * frequencyY * sampleTime + phase * 0.61) * nudge * 0.008 * driftScale
        const driftR = Math.sin(TAU * (1 + index % 2) * sampleTime + phase * 0.43) * nudge * (many ? 0.45 : 1.1)
        const ownFocus = focus.index === index ? focus.weight : 0
        const wakeSegment = compiled.segments.find((segment) => segment.id === "wake")
        const wakeProgress = wakeSegment ? clamp(sampleTime / Math.max(1e-9, wakeSegment.end), 0, 1) : 0
        const wake = wakeSegment && sampleTime < wakeSegment.end && !reducedMotion ? Math.sin(wakeProgress * Math.PI) : 0
        const scale = 1 + ownFocus * (many ? 0.035 : 0.055)
        const margin = 0.018
        const rotation = containedRotation(width, ratio, canvasRatio, slot[2] + driftR, scale, margin)
        const bounds = normalizedFrameAabbDimensions(width, ratio, canvasRatio, rotation, scale)
        const halfWidth = bounds.width / 2
        const halfHeight = bounds.height / 2
        return {
            id: source.id,
            sourceIndex: index,
            kind: source.kind ?? "image",
            failed: Boolean(source.failed),
            ratio,
            x: clamp(baseX + driftX + wake * (index % 2 ? 1 : -1) * 0.006, margin + halfWidth, 1 - margin - halfWidth),
            y: clamp(baseY + driftY + wake * 0.010 - ownFocus * 0.012, margin + halfHeight, 1 - margin - halfHeight),
            width,
            rotation,
            scale,
            z: index + 1 + (ownFocus > 0 ? 100 : 0),
            focusWeight: ownFocus,
            underlight: controls.underlightStrength * (0.24 + ownFocus * 0.76),
            underlightExpansion: 0.035 + ownFocus * 0.018,
            media: { opacity: 1, filter: "none", blend: "normal" },
        }
    })

    return {
        apply: "ok",
        sceneId: "light-table",
        normalizedTime: story.value,
        phase: story.terminal ? "seam" : phaseAt(compiled, sampleTime).id,
        phaseSeam: story.terminal || sampleTime === 0,
        layout: layoutName(sources.length),
        focusIndex: focus.index,
        focusWeight: focus.weight,
        reducedMotion,
        controls,
        capability: { transparentOutput: false },
        layoutMetrics: lightTableCoreRectangleMetrics(frames, canvasRatio),
        frames,
    }
}

export function lightTableCoreFixture(id: string): LightTableCoreSource[] {
    const makeSources = (count: number, variant: string) => {
        const ratios = [16 / 9, 4 / 3, 1, 3 / 4, 9 / 16, 4 / 5]
        return Array.from({ length: count }, (_, index): LightTableCoreSource => ({
            id: `light-source-${String(index + 1).padStart(2, "0")}`,
            name: `Source ${String(index + 1).padStart(2, "0")}`,
            ratio: ratios[index % ratios.length],
            kind: variant === "video" && index === 1 ? "video" : "image",
            failed: variant === "failed" && index === 2,
            chart: variant === "colour-chart" || index === 0,
            paletteIndex: index,
        }))
    }
    switch (id) {
        case "zero": return []
        case "one": return makeSources(1, "ordinary")
        case "two": return makeSources(2, "ordinary")
        case "five": return makeSources(5, "ordinary")
        case "ordinary-six": return makeSources(6, "ordinary")
        case "many-12": return makeSources(12, "ordinary")
        case "many-24": return makeSources(24, "ordinary")
        case "too-many-25": return makeSources(25, "ordinary")
        case "failed-six": return makeSources(6, "failed")
        case "video-six": return makeSources(6, "video")
        case "colour-chart-six": return makeSources(6, "colour-chart")
        case "mixed-six": return makeSources(6, "ordinary")
        default: return makeSources(6, "ordinary")
    }
}

export function stableLightTableCoreStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableLightTableCoreStringify).join(",")}]`
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableLightTableCoreStringify((value as Record<string, unknown>)[key])}`).join(",")}}`
    }
    return JSON.stringify(value)
}
