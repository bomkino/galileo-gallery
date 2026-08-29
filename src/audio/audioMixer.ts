import type { CompiledAudioClip, CompiledAudioTimeline } from "./audioTimeline.ts"

export interface PCMSourceProvider {
    read(sourceId: string, startFrame: number, frameCount: number, signal?: AbortSignal): Promise<{
        sampleRate: number
        channels: 1 | 2
        frames: Float32Array
    }>
}

export class AudioMixError extends Error {
    readonly code: "invalid-range" | "plan-blocked" | "source-invalid" | "cancelled"

    constructor(code: "invalid-range" | "plan-blocked" | "source-invalid" | "cancelled", message: string) {
        super(message)
        this.name = "AudioMixError"
        this.code = code
    }
}

function checkCancelled(signal?: AbortSignal) {
    if (signal?.aborted) throw new AudioMixError("cancelled", "Audio render cancelled.")
}

function fadeGain(clip: CompiledAudioClip, clipFrame: number) {
    let gain = 1
    if (clip.fadeInFrames > 0 && clipFrame < clip.fadeInFrames) gain = Math.min(gain, clip.fadeInFrames === 1 ? 0 : clipFrame / (clip.fadeInFrames - 1))
    const remaining = clip.durationFrames - clipFrame - 1
    if (clip.fadeOutFrames > 0 && remaining < clip.fadeOutFrames) gain = Math.min(gain, clip.fadeOutFrames === 1 ? 0 : Math.max(0, remaining / (clip.fadeOutFrames - 1)))
    return gain
}

function duckGain(plan: CompiledAudioTimeline, frame: number) {
    if (!plan.ducking.enabled || plan.ducking.activeRegions.length === 0) return 1
    const floor = 1 - plan.ducking.amount
    let gain = 1
    for (const region of plan.ducking.activeRegions) {
        let candidate = 1
        if (frame >= region.startFrame && frame < region.endFrame) {
            candidate = plan.ducking.attackFrames > 0 && frame < region.startFrame + plan.ducking.attackFrames
                ? 1 - plan.ducking.amount * ((frame - region.startFrame) / plan.ducking.attackFrames)
                : floor
        } else if (frame >= region.endFrame && frame < region.endFrame + plan.ducking.releaseFrames && plan.ducking.releaseFrames > 0) {
            candidate = floor + plan.ducking.amount * ((frame - region.endFrame) / plan.ducking.releaseFrames)
        }
        gain = Math.min(gain, candidate)
    }
    return gain
}

async function mixClip(
    output: Float32Array,
    plan: CompiledAudioTimeline,
    clip: CompiledAudioClip,
    laneGain: number,
    laneDucked: boolean,
    provider: PCMSourceProvider,
    chunkStart: number,
    chunkEnd: number,
    signal?: AbortSignal,
) {
    const overlapStart = Math.max(chunkStart, clip.timelineStartFrame)
    const overlapEnd = Math.min(chunkEnd, clip.timelineEndFrame)
    if (overlapStart >= overlapEnd) return
    const source = plan.sources.get(clip.sourceId)
    if (!source) throw new AudioMixError("plan-blocked", `Audio source ${clip.sourceId} is unavailable.`)
    let cursor = overlapStart
    while (cursor < overlapEnd) {
        checkCancelled(signal)
        const clipOffset = cursor - clip.timelineStartFrame
        const spanOffset = clip.loop ? clipOffset % clip.sourceSpanFrames : clipOffset
        const runFrames = Math.min(overlapEnd - cursor, clip.sourceSpanFrames - spanOffset, 4_096)
        const decoded = await provider.read(clip.sourceId, clip.sourceInFrame + spanOffset, runFrames, signal)
        checkCancelled(signal)
        if (decoded.sampleRate !== source.sampleRate || decoded.channels !== source.channels || decoded.frames.length !== runFrames * source.channels) {
            throw new AudioMixError("source-invalid", `Audio source ${clip.sourceId} returned an invalid PCM block.`)
        }
        for (let runFrame = 0; runFrame < runFrames; runFrame += 1) {
            const storyFrame = cursor + runFrame
            const localFrame = storyFrame - chunkStart
            const clipFrame = storyFrame - clip.timelineStartFrame
            const gain = Math.fround(clip.gain * laneGain * fadeGain(clip, clipFrame) * (laneDucked ? duckGain(plan, storyFrame) : 1))
            for (let channel = 0; channel < plan.channels; channel += 1) {
                const sourceIndex = runFrame * source.channels
                const sample = source.channels === 1
                    ? decoded.frames[sourceIndex]
                    : plan.channels === 1
                        ? Math.fround((decoded.frames[sourceIndex] + decoded.frames[sourceIndex + 1]) * 0.5)
                        : decoded.frames[sourceIndex + channel]
                if (!Number.isFinite(sample)) throw new AudioMixError("source-invalid", `Audio source ${clip.sourceId} returned a non-finite sample.`)
                const outputIndex = localFrame * plan.channels + channel
                output[outputIndex] = Math.fround(output[outputIndex] + Math.fround(sample * gain))
            }
        }
        cursor += runFrames
    }
}

export async function mixAudioChunk(
    plan: CompiledAudioTimeline,
    provider: PCMSourceProvider,
    startFrame: number,
    frameCount: number,
    signal?: AbortSignal,
) {
    if (!Number.isSafeInteger(startFrame) || !Number.isSafeInteger(frameCount) || startFrame < 0 || frameCount < 1 || frameCount > plan.chunkFrames || startFrame + frameCount > plan.durationFrames) {
        throw new AudioMixError("invalid-range", "Audio chunk is outside the compiled story.")
    }
    if (plan.issues.length) throw new AudioMixError("plan-blocked", "Audio plan has unresolved source issues.")
    checkCancelled(signal)
    const output = new Float32Array(frameCount * plan.channels)
    if (!plan.master.muted) {
        const hasSolo = plan.lanes.some((lane) => lane.solo && !lane.muted)
        const targetLanes = new Set(plan.ducking.targetLaneIds)
        for (const lane of plan.lanes) {
            if (lane.muted || (hasSolo && !lane.solo)) continue
            for (const clip of lane.clips) {
                if (!clip.muted) await mixClip(output, plan, clip, lane.gain, targetLanes.has(lane.id), provider, startFrame, startFrame + frameCount, signal)
            }
        }
    }
    let peak = 0
    let clippedSamples = 0
    for (let index = 0; index < output.length; index += 1) {
        const amplified = Math.fround(output[index] * plan.master.gain)
        peak = Math.max(peak, Math.abs(amplified))
        if (amplified > 1) { output[index] = 1; clippedSamples += 1 }
        else if (amplified < -1) { output[index] = -1; clippedSamples += 1 }
        else output[index] = amplified
    }
    return { interleaved: output, peak, clippedSamples }
}
