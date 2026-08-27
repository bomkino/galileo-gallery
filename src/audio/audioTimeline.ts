export type RationalTime = { numerator: number; denominator: number }

export type AudioLaneRole = "source-video" | "presenter" | "soundtrack"

export type AudioSourceIntent = {
    id: string
    name?: string
    role: AudioLaneRole
    mediaId?: string
    url?: string
    sampleRate: number
    channels: 1 | 2
    sampleFrames: number
}

export type AudioClipIntent = {
    id: string
    sourceId: string
    timelineStart: RationalTime
    sourceIn: RationalTime
    sourceSpan: RationalTime
    duration: RationalTime
    loop: boolean
    gain: number
    muted: boolean
    fadeIn: RationalTime
    fadeOut: RationalTime
}

export type AudioLaneIntent = {
    id: string
    name: string
    role: AudioLaneRole
    gain: number
    muted: boolean
    solo: boolean
    clips: AudioClipIntent[]
}

export type AudioDuckingIntent = {
    enabled: boolean
    triggerLaneId: string
    targetLaneIds: string[]
    amount: number
    attack: RationalTime
    release: RationalTime
}

export type AudioTimelineIntent = {
    id: "gallery-audio-intent"
    version: 1
    sourceVideo: "per-media"
    sampleRate: number
    channels: 1 | 2
    sources: AudioSourceIntent[]
    lanes: AudioLaneIntent[]
    ducking: AudioDuckingIntent
    master: { gain: number; muted: boolean }
}

export type CompiledAudioClip = AudioClipIntent & {
    timelineStartFrame: number
    timelineEndFrame: number
    sourceInFrame: number
    sourceSpanFrames: number
    durationFrames: number
    fadeInFrames: number
    fadeOutFrames: number
}

export type CompiledAudioLane = Omit<AudioLaneIntent, "clips"> & { clips: CompiledAudioClip[] }

export type AudioCompileIssue = {
    code: "source-missing" | "source-rate-unsupported" | "source-exhausted"
    laneId: string
    clipId: string
    sourceId: string
}

export type CompiledAudioTimeline = {
    sampleRate: number
    channels: 1 | 2
    durationFrames: number
    chunkFrames: number
    sources: ReadonlyMap<string, AudioSourceIntent>
    lanes: CompiledAudioLane[]
    ducking: AudioDuckingIntent & { attackFrames: number; releaseFrames: number; activeRegions: Array<{ startFrame: number; endFrame: number }> }
    master: { gain: number; muted: boolean }
    issues: AudioCompileIssue[]
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_DURATION_SECONDS = 24 * 60 * 60
const MAX_LANES = 32
const MAX_CLIPS = 4096

function fail(message: string): never {
    throw new Error(`Audio intent invalid: ${message}`)
}

function integer(value: number, minimum: number, maximum: number, label: string) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(`${label} is outside the supported range.`)
    return value
}

function finite(value: number, minimum: number, maximum: number, label: string) {
    if (!Number.isFinite(value) || value < minimum || value > maximum) fail(`${label} is outside the supported range.`)
    return value
}

function identifier(value: string, label: string) {
    if (typeof value !== "string" || value.length > 120 || !ID.test(value)) fail(`${label} is invalid.`)
    return value
}

function gcd(left: number, right: number) {
    let a = Math.abs(left)
    let b = Math.abs(right)
    while (b) [a, b] = [b, a % b]
    return a
}

export function validateRationalTime(value: RationalTime, label = "time") {
    if (!value || typeof value !== "object") fail(`${label} must be rational.`)
    integer(value.numerator, 0, Number.MAX_SAFE_INTEGER, `${label} numerator`)
    integer(value.denominator, 1, 1_000_000, `${label} denominator`)
    if (gcd(value.numerator, value.denominator) !== 1) fail(`${label} must be reduced.`)
    return value
}

/** Converts seconds to sample frames once, using exact BigInt half-up rounding. */
export function rationalTimeToFrames(value: RationalTime, sampleRate: number, label = "time") {
    validateRationalTime(value, label)
    integer(sampleRate, 8_000, 192_000, "sample rate")
    const numerator = BigInt(value.numerator) * BigInt(sampleRate)
    const denominator = BigInt(value.denominator)
    const rounded = (numerator * 2n + denominator) / (denominator * 2n)
    if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) fail(`${label} exceeds the supported duration.`)
    return Number(rounded)
}

export function defaultAudioIntent(): AudioTimelineIntent {
    return {
        id: "gallery-audio-intent",
        version: 1,
        sourceVideo: "per-media",
        sampleRate: 48_000,
        channels: 2,
        sources: [],
        lanes: [],
        ducking: {
            enabled: false,
            triggerLaneId: "presenter",
            targetLaneIds: [],
            amount: 0.5,
            attack: { numerator: 1, denominator: 20 },
            release: { numerator: 1, denominator: 5 },
        },
        master: { gain: 1, muted: false },
    }
}

function mergeRegions(regions: Array<{ startFrame: number; endFrame: number }>) {
    const sorted = [...regions].sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame)
    const merged: Array<{ startFrame: number; endFrame: number }> = []
    for (const region of sorted) {
        const previous = merged.at(-1)
        if (previous && region.startFrame <= previous.endFrame) previous.endFrame = Math.max(previous.endFrame, region.endFrame)
        else merged.push({ ...region })
    }
    return merged
}

export function compileAudioTimeline(
    intent: AudioTimelineIntent,
    options: { duration: RationalTime; sampleRate?: number; channels?: 1 | 2; chunkFrames?: number }
): CompiledAudioTimeline {
    if (intent.id !== "gallery-audio-intent" || intent.version !== 1 || intent.sourceVideo !== "per-media") fail("identity is unsupported.")
    const sampleRate = integer(options.sampleRate ?? intent.sampleRate, 8_000, 192_000, "sample rate")
    const channels = integer(options.channels ?? intent.channels, 1, 2, "channels") as 1 | 2
    if (intent.sampleRate !== sampleRate || intent.channels !== channels) fail("compile format must match master format.")
    const chunkFrames = integer(options.chunkFrames ?? 4_096, 1, 65_536, "chunk size")
    const storyDurationFrames = rationalTimeToFrames(options.duration, sampleRate, "story duration")
    if (storyDurationFrames < 1 || storyDurationFrames > sampleRate * MAX_DURATION_SECONDS) fail("story duration is outside the supported range.")
    if (!Array.isArray(intent.sources) || !Array.isArray(intent.lanes) || intent.lanes.length > MAX_LANES) fail("lane table is invalid.")

    const sources = new Map<string, AudioSourceIntent>()
    for (const source of intent.sources) {
        identifier(source.id, "source id")
        if (sources.has(source.id)) fail("source identities must be unique.")
        if (!["source-video", "presenter", "soundtrack"].includes(source.role)) fail("source role is unsupported.")
        integer(source.sampleRate, 8_000, 192_000, "source sample rate")
        integer(source.channels, 1, 2, "source channels")
        integer(source.sampleFrames, 1, source.sampleRate * MAX_DURATION_SECONDS, "source frames")
        sources.set(source.id, { ...source })
    }

    const laneIds = new Set<string>()
    const clipIds = new Set<string>()
    const issues: AudioCompileIssue[] = []
    let clipCount = 0
    const lanes = intent.lanes.map((lane): CompiledAudioLane => {
        identifier(lane.id, "lane id")
        if (laneIds.has(lane.id)) fail("lane identities must be unique.")
        laneIds.add(lane.id)
        if (typeof lane.name !== "string" || lane.name.length < 1 || lane.name.length > 200) fail("lane name is invalid.")
        if (!["source-video", "presenter", "soundtrack"].includes(lane.role)) fail("lane role is unsupported.")
        finite(lane.gain, 0, 4, "lane gain")
        if (typeof lane.muted !== "boolean" || typeof lane.solo !== "boolean" || !Array.isArray(lane.clips)) fail("lane controls are invalid.")
        clipCount += lane.clips.length
        if (clipCount > MAX_CLIPS) fail("clip table is too large.")
        const clips = lane.clips.map((clip): CompiledAudioClip => {
            identifier(clip.id, "clip id")
            if (clipIds.has(clip.id)) fail("clip identities must be unique.")
            clipIds.add(clip.id)
            identifier(clip.sourceId, "clip source id")
            if (typeof clip.loop !== "boolean" || typeof clip.muted !== "boolean") fail("clip controls are invalid.")
            finite(clip.gain, 0, 4, "clip gain")
            const timelineStartFrame = rationalTimeToFrames(clip.timelineStart, sampleRate, "clip timeline start")
            const sourceInFrame = rationalTimeToFrames(clip.sourceIn, sampleRate, "clip source in")
            const sourceSpanFrames = rationalTimeToFrames(clip.sourceSpan, sampleRate, "clip source span")
            const clipDurationFrames = rationalTimeToFrames(clip.duration, sampleRate, "clip duration")
            const fadeInFrames = rationalTimeToFrames(clip.fadeIn, sampleRate, "clip fade in")
            const fadeOutFrames = rationalTimeToFrames(clip.fadeOut, sampleRate, "clip fade out")
            if (timelineStartFrame >= storyDurationFrames) fail("clip is outside the story.")
            if (sourceSpanFrames < 1 || clipDurationFrames < 1 || fadeInFrames + fadeOutFrames > clipDurationFrames) fail("clip spans or fades are invalid.")
            const source = sources.get(clip.sourceId)
            if (!source) issues.push({ code: "source-missing", laneId: lane.id, clipId: clip.id, sourceId: clip.sourceId })
            else {
                if (source.sampleRate !== sampleRate) issues.push({ code: "source-rate-unsupported", laneId: lane.id, clipId: clip.id, sourceId: clip.sourceId })
                if (sourceInFrame + sourceSpanFrames > source.sampleFrames || (!clip.loop && clipDurationFrames > sourceSpanFrames)) {
                    issues.push({ code: "source-exhausted", laneId: lane.id, clipId: clip.id, sourceId: clip.sourceId })
                }
            }
            return {
                ...clip,
                timelineStartFrame,
                timelineEndFrame: Math.min(clipDurationFrames + timelineStartFrame, storyDurationFrames),
                sourceInFrame,
                sourceSpanFrames,
                durationFrames: clipDurationFrames,
                fadeInFrames,
                fadeOutFrames,
            }
        })
        return { ...lane, clips }
    })

    finite(intent.master.gain, 0, 4, "master gain")
    if (typeof intent.master.muted !== "boolean") fail("master mute is invalid.")
    const ducking = intent.ducking
    if (!ducking || typeof ducking.enabled !== "boolean" || !Array.isArray(ducking.targetLaneIds)) fail("ducking intent is invalid.")
    identifier(ducking.triggerLaneId, "ducking trigger lane")
    finite(ducking.amount, 0, 1, "ducking amount")
    const attackFrames = rationalTimeToFrames(ducking.attack, sampleRate, "ducking attack")
    const releaseFrames = rationalTimeToFrames(ducking.release, sampleRate, "ducking release")
    const targetLaneIds = new Set<string>()
    for (const laneId of ducking.targetLaneIds) {
        identifier(laneId, "ducking target lane")
        if (targetLaneIds.has(laneId)) fail("ducking target lanes must be unique.")
        targetLaneIds.add(laneId)
    }
    if (ducking.enabled && (!laneIds.has(ducking.triggerLaneId) || [...targetLaneIds].some((id) => !laneIds.has(id)))) fail("ducking lanes are missing.")
    const hasSolo = lanes.some((lane) => lane.solo && !lane.muted)
    const trigger = lanes.find((lane) => lane.id === ducking.triggerLaneId)
    const activeRegions = ducking.enabled && trigger && !trigger.muted && (!hasSolo || trigger.solo)
        ? mergeRegions(trigger.clips.filter((clip) => !clip.muted).map((clip) => ({ startFrame: clip.timelineStartFrame, endFrame: clip.timelineEndFrame })))
        : []

    return {
        sampleRate,
        channels,
        durationFrames: storyDurationFrames,
        chunkFrames,
        sources,
        lanes,
        ducking: { ...ducking, attackFrames, releaseFrames, activeRegions },
        master: { ...intent.master },
        issues,
    }
}
