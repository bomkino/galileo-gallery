import assert from "node:assert/strict"
import crypto from "node:crypto"
import {
    compileAudioTimeline,
    defaultAudioIntent,
    rationalTimeToFrames,
} from "../src/audio/audioTimeline.ts"
import { AudioMixError, mixAudioChunk } from "../src/audio/audioMixer.ts"
import { encodePcm16Wav, inspectPcm16Wav } from "../src/audio/audioWav.ts"
import { createHostPCMProvider, readHostWaveform } from "../src/audio/hostPcmProvider.ts"

const RATE = 48_000
const gcd = (left, right) => {
    let a = Math.abs(left)
    let b = Math.abs(right)
    while (b) [a, b] = [b, a % b]
    return a
}
const at = (frames) => {
    const divisor = gcd(frames, RATE)
    return { numerator: frames / divisor, denominator: RATE / divisor }
}
const close = (actual, expected, epsilon = 1e-6) => assert(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)
const hash = (floats) => crypto.createHash("sha256").update(Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength)).digest("hex")

function source(id, samples, role = "soundtrack", channels = 1) {
    const frames = samples instanceof Float32Array ? samples : Float32Array.from(samples)
    assert.equal(frames.length % channels, 0)
    return {
        meta: { id, role, sampleRate: RATE, channels, sampleFrames: frames.length / channels },
        frames,
    }
}

function clip(id, sourceId, values = {}) {
    const duration = values.duration ?? values.sourceSpan ?? 1
    return {
        id,
        sourceId,
        timelineStart: at(values.timelineStart ?? 0),
        sourceIn: at(values.sourceIn ?? 0),
        sourceSpan: at(values.sourceSpan ?? duration),
        duration: at(duration),
        loop: values.loop ?? false,
        gain: values.gain ?? 1,
        muted: values.muted ?? false,
        fadeIn: at(values.fadeIn ?? 0),
        fadeOut: at(values.fadeOut ?? 0),
    }
}

function lane(id, clips, values = {}) {
    return {
        id,
        name: values.name ?? id,
        role: values.role ?? "soundtrack",
        gain: values.gain ?? 1,
        muted: values.muted ?? false,
        solo: values.solo ?? false,
        clips,
    }
}

function plan(fixtures, lanes, durationFrames, values = {}) {
    const intent = {
        ...defaultAudioIntent(),
        channels: values.channels ?? 1,
        sources: fixtures.map((fixture) => fixture.meta),
        lanes,
        ducking: values.ducking ?? defaultAudioIntent().ducking,
        master: values.master ?? { gain: 1, muted: false },
    }
    return compileAudioTimeline(intent, { duration: at(durationFrames), sampleRate: RATE, channels: intent.channels, chunkFrames: values.chunkFrames ?? 4096 })
}

class FixtureProvider {
    constructor(fixtures) {
        this.fixtures = new Map(fixtures.map((fixture) => [fixture.meta.id, fixture]))
        this.maxRequestedFrames = 0
        this.active = 0
        this.maxActive = 0
    }

    async read(sourceId, startFrame, frameCount, signal) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
        const fixture = this.fixtures.get(sourceId)
        if (!fixture) throw new Error("missing fixture")
        this.active += 1
        this.maxActive = Math.max(this.maxActive, this.active)
        this.maxRequestedFrames = Math.max(this.maxRequestedFrames, frameCount)
        try {
            const start = startFrame * fixture.meta.channels
            const end = (startFrame + frameCount) * fixture.meta.channels
            return { sampleRate: fixture.meta.sampleRate, channels: fixture.meta.channels, frames: fixture.frames.slice(start, end) }
        } finally {
            this.active -= 1
        }
    }
}

async function render(compiled, provider, chunkPattern = [compiled.chunkFrames]) {
    const output = new Float32Array(compiled.durationFrames * compiled.channels)
    let peak = 0
    let clippedSamples = 0
    let cursor = 0
    let chunkIndex = 0
    while (cursor < compiled.durationFrames) {
        const count = Math.min(chunkPattern[chunkIndex % chunkPattern.length], compiled.chunkFrames, compiled.durationFrames - cursor)
        const mixed = await mixAudioChunk(compiled, provider, cursor, count)
        output.set(mixed.interleaved, cursor * compiled.channels)
        peak = Math.max(peak, mixed.peak)
        clippedSamples += mixed.clippedSamples
        cursor += count
        chunkIndex += 1
    }
    return { output, peak, clippedSamples }
}

assert.equal(rationalTimeToFrames({ numerator: 1, denominator: 3 }, RATE), 16_000)
assert.equal(rationalTimeToFrames({ numerator: 1, denominator: 2 }, 44_100), 22_050)
assert.equal(rationalTimeToFrames({ numerator: 1, denominator: 6 }, 44_100), 7_350)
assert.throws(() => rationalTimeToFrames({ numerator: 2, denominator: 4 }, RATE), /must be reduced/)

// Placement, source slip, and bounded provider reads.
const slipSamples = new Float32Array(14_400)
slipSamples[0] = 1
slipSamples[4_800] = 0.75
slipSamples[9_600] = 0.5
const slipSource = source("slip-source", slipSamples)
const slipPlan = plan([slipSource], [lane("soundtrack", [clip("slip-clip", "slip-source", { timelineStart: 24_000, sourceIn: 4_800, sourceSpan: 9_600, duration: 9_600 })])], 36_000)
const slipProvider = new FixtureProvider([slipSource])
const slip = await render(slipPlan, slipProvider, [257, 4096, 7])
assert.equal(slip.output[24_000], 0.75)
assert.equal(slip.output[28_800], 0.5)
assert.equal(slip.output[23_999], 0)
assert.equal(slip.output[33_600], 0)
assert(slipProvider.maxRequestedFrames <= slipPlan.chunkFrames)
assert.equal(slipProvider.maxActive, 1)

// Looping repeats the declared source span, not the whole source.
const loopSamples = new Float32Array(4_800)
loopSamples[0] = 1
const loopSource = source("loop-source", loopSamples)
const loopPlan = plan([loopSource], [lane("loop-lane", [clip("loop-clip", "loop-source", { sourceSpan: 4_800, duration: 14_400, loop: true })])], 14_400)
const looped = (await render(loopPlan, new FixtureProvider([loopSource]), [4096])).output
assert.deepEqual([looped[0], looped[4_800], looped[9_600]], [1, 1, 1])

// Fade endpoints are explicit: 0 and 1 across N samples, with no hidden normalization.
const fadeSource = source("fade-source", new Float32Array(9_600).fill(1))
const fadePlan = plan([fadeSource], [lane("fade-lane", [clip("fade-clip", "fade-source", { sourceSpan: 9_600, fadeIn: 4_800, fadeOut: 4_800 })])], 9_600)
const faded = (await render(fadePlan, new FixtureProvider([fadeSource]))).output
assert.equal(faded[0], 0)
assert.equal(faded[4_799], 1)
assert.equal(faded[4_800], 1)
assert.equal(faded[9_599], 0)
close(faded[2_400], 2_400 / 4_799)
close(faded[7_199], 2_400 / 4_799)

// Complementary linear fades causally cross through zero for opposite-polarity sources.
const plus = source("plus-source", new Float32Array(9_601).fill(1))
const minus = source("minus-source", new Float32Array(9_601).fill(-1))
const crossPlan = plan([plus, minus], [lane("cross-lane", [
    clip("plus-clip", "plus-source", { sourceSpan: 9_601, duration: 9_601, fadeOut: 4_801 }),
    clip("minus-clip", "minus-source", { timelineStart: 4_800, sourceSpan: 9_601, duration: 9_601, fadeIn: 4_801 }),
])], 14_401)
const crossed = (await render(crossPlan, new FixtureProvider([plus, minus]), [257])).output
assert.equal(crossed[4_800], 1)
assert.equal(crossed[7_200], 0)
assert.equal(crossed[9_600], -1)

// Solo, mute, master gain, master mute, and reset each have one authority.
const quarter = source("quarter", new Float32Array(100).fill(0.25))
const half = source("half", new Float32Array(100).fill(0.5))
const baseLanes = [lane("lane-a", [clip("clip-a", "quarter", { sourceSpan: 100 })]), lane("lane-b", [clip("clip-b", "half", { sourceSpan: 100 })])]
assert.equal((await render(plan([quarter, half], baseLanes, 100), new FixtureProvider([quarter, half]))).output[10], 0.75)
assert.equal((await render(plan([quarter, half], [{ ...baseLanes[0], solo: true }, baseLanes[1]], 100), new FixtureProvider([quarter, half]))).output[10], 0.25)
assert.equal((await render(plan([quarter, half], [{ ...baseLanes[0], solo: true, muted: true }, baseLanes[1]], 100), new FixtureProvider([quarter, half]))).output[10], 0.5)
assert.equal((await render(plan([quarter], [baseLanes[0]], 100, { master: { gain: 2, muted: false } }), new FixtureProvider([quarter]))).output[10], 0.5)
assert.equal((await render(plan([quarter], [baseLanes[0]], 100, { master: { gain: 1, muted: true } }), new FixtureProvider([quarter]))).output[10], 0)
const emptyPlan = compileAudioTimeline(defaultAudioIntent(), { duration: at(100) })
assert.equal((await render(emptyPlan, new FixtureProvider([]))).output.every((sample) => sample === 0), true)

// Intent-driven ducking has exact absolute attack, hold, release, and reset behavior.
const voice = source("voice", new Float32Array(100), "presenter")
const bed = source("bed", new Float32Array(300).fill(1))
const ducking = { enabled: true, triggerLaneId: "voice-lane", targetLaneIds: ["bed-lane"], amount: 0.5, attack: at(10), release: at(20) }
const duckPlan = plan([voice, bed], [
    lane("voice-lane", [clip("voice-clip", "voice", { timelineStart: 100, sourceSpan: 100 })], { role: "presenter" }),
    lane("bed-lane", [clip("bed-clip", "bed", { sourceSpan: 300 })]),
], 300, { ducking })
const ducked = (await render(duckPlan, new FixtureProvider([voice, bed]), [7])).output
assert.equal(ducked[99], 1)
assert.equal(ducked[100], 1)
close(ducked[105], 0.75)
assert.equal(ducked[110], 0.5)
assert.equal(ducked[199], 0.5)
assert.equal(ducked[200], 0.5)
close(ducked[210], 0.75)
assert.equal(ducked[220], 1)
const noDuck = { ...ducking, enabled: false }
const resetDuck = (await render(plan([voice, bed], duckPlan.lanes.map((value) => ({ ...value, clips: value.clips })), 300, { ducking: noDuck }), new FixtureProvider([voice, bed]))).output
assert.equal(resetDuck.every((sample) => sample === 1 || sample === 0), true)
assert.equal(resetDuck[105], 1)

// Pre-clamp peak and exact clipped-sample count are stable and saturating.
const loudA = source("loud-a", new Float32Array(10).fill(1))
const loudB = source("loud-b", new Float32Array(10).fill(1))
const loudPlan = plan([loudA, loudB], [
    lane("loud-lane-a", [clip("loud-clip-a", "loud-a", { sourceSpan: 10, gain: 0.75 })]),
    lane("loud-lane-b", [clip("loud-clip-b", "loud-b", { sourceSpan: 10, gain: 0.75 })]),
], 10)
const loud = await render(loudPlan, new FixtureProvider([loudA, loudB]), [7])
assert.equal(loud.peak, 1.5)
assert.equal(loud.clippedSamples, 10)
assert.equal(loud.output.every((sample) => sample === 1), true)

// Absolute indexing makes PCM invariant across repeated and irregular chunk boundaries.
const invariantA = await render(crossPlan, new FixtureProvider([plus, minus]), [1, 7, 257, 4096])
const invariantB = await render(crossPlan, new FixtureProvider([plus, minus]), [4096])
const invariantC = await render(crossPlan, new FixtureProvider([plus, minus]), [13, 509])
assert.equal(hash(invariantA.output), hash(invariantB.output))
assert.equal(hash(invariantB.output), hash(invariantC.output))
assert.deepEqual({ peak: invariantA.peak, clipped: invariantA.clippedSamples }, { peak: invariantB.peak, clipped: invariantB.clippedSamples })

// Diagnostic WAV is deterministic and independently read back.
const wav = encodePcm16Wav(invariantB.output, RATE, 1)
const wavAgain = encodePcm16Wav(invariantB.output, RATE, 1)
assert.equal(Buffer.compare(wav, wavAgain), 0)
const inspected = inspectPcm16Wav(wav)
assert.equal(inspected.sampleRate, RATE)
assert.equal(inspected.channels, 1)
assert.equal(inspected.sampleFrames, crossPlan.durationFrames)
assert(inspected.peak > 0.99 && inspected.peak <= 1)
assert.equal(new DataView(wav.buffer).getUint32(4, true), wav.byteLength - 8)
assert.equal(new DataView(wav.buffer).getUint32(40, true), wav.byteLength - 44)

// Missing/unsupported sources block output; cancellation and quotas fail causally.
const missingPlan = plan([], [lane("missing-lane", [clip("missing-clip", "missing-source", { sourceSpan: 10 })])], 10)
assert.deepEqual(missingPlan.issues.map((issue) => issue.code), ["source-missing"])
await assert.rejects(() => mixAudioChunk(missingPlan, new FixtureProvider([]), 0, 10), (error) => error instanceof AudioMixError && error.code === "plan-blocked")
await assert.rejects(() => mixAudioChunk(loudPlan, new FixtureProvider([loudA, loudB]), 0, loudPlan.chunkFrames + 1), (error) => error instanceof AudioMixError && error.code === "invalid-range")
const controller = new AbortController()
controller.abort()
await assert.rejects(() => mixAudioChunk(loudPlan, new FixtureProvider([loudA, loudB]), 0, 10, controller.signal), (error) => error instanceof AudioMixError && error.code === "cancelled")

// The renderer adapter preserves opaque source identity, request bounds, response shape, and cancellation.
const hostSource = source("host-source", new Float32Array([0.25, -0.5, 0.75, -1]))
const hostIntent = plan([hostSource], [lane("host-lane", [clip("host-clip", "host-source", { sourceSpan: 4 })])], 4)
hostIntent.sources.get("host-source").url = `reel-media://grant/${"a".repeat(64)}`
const hostCalls = []
const host = {
    decodeAudio: async (url, startFrame, frameCount) => {
        hostCalls.push({ url, startFrame, frameCount })
        return { sampleRate: RATE, channels: 1, startFrame, frameCount, samples: Array.from(hostSource.frames.slice(startFrame, startFrame + frameCount)) }
    },
    audioWaveform: async () => ({ sampleRate: RATE, channels: 1, sampleFrames: 4, buckets: [{ minimum: -1, maximum: 0.75, rms: 0.7 }] }),
}
const hostProvider = createHostPCMProvider(host, { ...defaultAudioIntent(), sources: [hostIntent.sources.get("host-source")] })
assert.deepEqual(await hostProvider.read("host-source", 1, 2), { sampleRate: RATE, channels: 1, frames: Float32Array.from([-0.5, 0.75]) })
assert.deepEqual(hostCalls, [{ url: `reel-media://grant/${"a".repeat(64)}`, startFrame: 1, frameCount: 2 }])
assert.equal((await readHostWaveform(host, `reel-media://grant/${"a".repeat(64)}`, 1)).sampleFrames, 4)
const cancelledHostRead = new AbortController()
cancelledHostRead.abort()
await assert.rejects(() => hostProvider.read("host-source", 0, 1, cancelledHostRead.signal), (error) => error.name === "AbortError")

console.log("Verified: G05 rational sample clock, placement/slip/loop, fades/crossfade, mute/solo/master, deterministic ducking, clipping, chunk-invariant PCM, bounded host reads, cancellation, and diagnostic WAV readback.")
