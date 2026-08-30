import { compileAudioTimeline, type AudioTimelineIntent } from "./audioTimeline.ts"
import type { MediaItem } from "../types.ts"

const GRANT_URL = /^reel-media:\/\/grant\/[a-f0-9]{64}$/

function ownExact(value: unknown, keys: string[]): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const actual = Object.keys(value).sort()
    const expected = [...keys].sort()
    return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function invalid(): never { throw new Error("Host audio intent is invalid.") }

export function validateHostAudioIntent(value: unknown, media: MediaItem[]): AudioTimelineIntent {
    if (!ownExact(value, ["id", "version", "sourceVideo", "sampleRate", "channels", "sources", "lanes", "ducking", "master"])) invalid()
    const intent = value as unknown as AudioTimelineIntent
    if (!Array.isArray(intent.sources) || !Array.isArray(intent.lanes)) invalid()
    const mediaById = new Map(media.map((item) => [item.id, item]))
    const sourceVideoIds = new Set<string>()
    for (const source of intent.sources) {
        const keys = source.role === "source-video"
            ? ["id", "name", "role", "mediaId", "url", "sampleRate", "channels", "sampleFrames"]
            : ["id", "name", "role", "url", "sampleRate", "channels", "sampleFrames"]
        if (!ownExact(source, keys) || typeof source.name !== "string" || typeof source.url !== "string" || !GRANT_URL.test(source.url)) invalid()
        if (source.role === "source-video") {
            if (typeof source.mediaId !== "string" || sourceVideoIds.has(source.mediaId)) invalid()
            const item = mediaById.get(source.mediaId)
            if (!item || item.type !== "video" || item.url !== source.url) invalid()
            sourceVideoIds.add(source.mediaId)
        } else if (!["presenter", "soundtrack"].includes(source.role)) invalid()
    }
    for (const lane of intent.lanes) {
        if (!ownExact(lane, ["id", "name", "role", "gain", "muted", "solo", "clips"]) || !Array.isArray(lane.clips)) invalid()
        for (const clip of lane.clips) {
            if (!ownExact(clip, ["id", "sourceId", "timelineStart", "sourceIn", "sourceSpan", "duration", "loop", "gain", "muted", "fadeIn", "fadeOut"])) invalid()
        }
    }
    if (!ownExact(intent.ducking, ["enabled", "triggerLaneId", "targetLaneIds", "amount", "attack", "release"]) || !ownExact(intent.master, ["gain", "muted"])) invalid()
    const compiled = compileAudioTimeline(intent, {
        duration: { numerator: 24 * 60 * 60, denominator: 1 },
        sampleRate: intent.sampleRate,
        channels: intent.channels,
    })
    if (compiled.issues.length) invalid()
    return intent
}

function cancelled(): Error {
    const error = new Error("Project open cancelled.")
    error.name = "AbortError"
    return error
}

export async function hydrateHostAudio(intent: AudioTimelineIntent | undefined, signal?: AbortSignal) {
    if (!intent) return
    for (const source of intent.sources) {
        if (signal?.aborted) throw cancelled()
        if (source.role === "source-video") continue
        const response = await fetch(source.url ?? "", { headers: { Range: "bytes=0-43" }, cache: "no-store", signal })
        if (response.status !== 206 || response.headers.get("content-length") !== "44" || !/^bytes 0-43\/\d+$/.test(response.headers.get("content-range") ?? "")) {
            throw new Error(`Could not hydrate ${source.name ?? source.id}.`)
        }
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (signal?.aborted) throw cancelled()
        const text = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length))
        if (bytes.length !== 44 || text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE" || text(12, 4) !== "fmt " || text(36, 4) !== "data") {
            throw new Error(`Could not hydrate ${source.name ?? source.id}.`)
        }
    }
}
