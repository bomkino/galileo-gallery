import type { GalleryHostPort } from "../types.ts"
import type { AudioTimelineIntent } from "./audioTimeline.ts"
import type { PCMSourceProvider } from "./audioMixer.ts"

function invalidResponse(message: string): never {
    throw new Error(`Host audio decode failed: ${message}`)
}

export function createHostPCMProvider(host: GalleryHostPort, intent: AudioTimelineIntent): PCMSourceProvider {
    const sources = new Map(intent.sources.map((source) => [source.id, source]))
    let active = false
    return {
        async read(sourceId, startFrame, frameCount, signal) {
            if (signal?.aborted) throw new DOMException("Audio decode cancelled.", "AbortError")
            if (active) throw new Error("Host audio decode concurrency exceeded.")
            const source = sources.get(sourceId)
            if (!source?.url) invalidResponse("source is unavailable.")
            active = true
            try {
                const decoded = await host.decodeAudio(source.url, startFrame, frameCount)
                if (signal?.aborted) throw new DOMException("Audio decode cancelled.", "AbortError")
                if (decoded.sampleRate !== source.sampleRate || decoded.channels !== source.channels
                    || decoded.startFrame !== startFrame || decoded.frameCount !== frameCount
                    || !Array.isArray(decoded.samples) || decoded.samples.length !== frameCount * source.channels
                    || decoded.samples.some((sample) => !Number.isFinite(sample) || sample < -1 || sample > 1)) {
                    invalidResponse("response does not match the requested source block.")
                }
                return { sampleRate: decoded.sampleRate, channels: decoded.channels, frames: Float32Array.from(decoded.samples) }
            } finally {
                active = false
            }
        },
    }
}

export async function readHostWaveform(host: GalleryHostPort, sourceURL: string, buckets: number) {
    const waveform = await host.audioWaveform(sourceURL, buckets)
    if (!Number.isSafeInteger(waveform.sampleFrames) || waveform.sampleFrames < 1
        || !Number.isSafeInteger(waveform.sampleRate) || waveform.sampleRate < 8_000 || waveform.sampleRate > 192_000
        || ![1, 2].includes(waveform.channels) || !Array.isArray(waveform.buckets) || waveform.buckets.length !== buckets
        || waveform.buckets.some((bucket) => !bucket || !Number.isFinite(bucket.minimum) || !Number.isFinite(bucket.maximum) || !Number.isFinite(bucket.rms)
            || bucket.minimum < -1 || bucket.maximum > 1 || bucket.minimum > bucket.maximum || bucket.rms < 0 || bucket.rms > 1)) {
        throw new Error("Host audio waveform response is invalid.")
    }
    return waveform
}
