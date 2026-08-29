const crypto = require("node:crypto")
const { HostPortError } = require("./linux-host-port.cjs")

const H264_MIME = "video/mp4"
const H264_FORMAT = "mp4-h264-aac"
const H264_SNAPSHOT_ID = /^[a-f0-9]{32}$/
const H264_DESTINATION_GRANT = /^[a-f0-9]{64}$/
const H264_FPS = new Set([24, 25, 30, 48, 50, 60])
const H264_QUALITIES = new Set(["master", "high", "optimized"])
const MAX_AUDIO_DECODE_WORK_FACTOR = 64
const MAX_AUDIO_DECODE_REQUESTS = 262_144
const AUDIO_DECODE_CHUNK_FRAMES = 4_096n
const AUDIO_MIX_CHUNK_FRAMES = 65_536n

function ownExact(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const actual = Object.keys(value).sort()
    const expected = [...keys].sort()
    return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function integer(value, minimum, maximum) {
    return Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

function cloneAndFreeze(value) {
    let clone
    try { clone = JSON.parse(JSON.stringify(value)) } catch { throw new HostPortError("invalid_request") }
    function freeze(candidate) {
        if (!candidate || typeof candidate !== "object" || Object.isFrozen(candidate)) return candidate
        for (const child of Object.values(candidate)) freeze(child)
        return Object.freeze(candidate)
    }
    return freeze(clone)
}

function emptyAudioIntent() {
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

function validateConfig(config) {
    if (!config || typeof config !== "object" || Array.isArray(config) || config.schemaVersion !== 2 || config.styleId !== "quiet-carousel") {
        throw new HostPortError("unsupported_capability")
    }
    if (!Array.isArray(config.items) || config.items.length < 1 || config.items.length > 256 || !config.settings || typeof config.settings !== "object"
        || !["solid", "gradient", "halo", "paper"].includes(config.settings.backgroundStyle)
        || !["once", "repeat", "loop"].includes(config.settings.playKind)
        || !integer(config.settings.repeatCount, 1, 1_000)) throw new HostPortError("invalid_request")
    const ids = new Set()
    for (const item of config.items) {
        if (!item || typeof item !== "object" || typeof item.id !== "string" || ids.has(item.id)
            || !["image", "video"].includes(item.type) || typeof item.url !== "string"
            || !/^reel-media:\/\/grant\/[a-f0-9]{64}$/.test(item.url)
            || typeof item.ratio !== "number" || !Number.isFinite(item.ratio) || item.ratio < 0.05 || item.ratio > 20) throw new HostPortError("invalid_request")
        ids.add(item.id)
    }
    if (config.audio !== undefined && (!config.audio || typeof config.audio !== "object" || Array.isArray(config.audio))) throw new HostPortError("invalid_request")
}

function audioFramesForVideo(frameCount, fps) {
    const numerator = BigInt(frameCount) * 48_000n
    if (numerator % BigInt(fps) !== 0n) throw new HostPortError("unsupported_capability")
    const frames = numerator / BigInt(fps)
    if (frames < 1n || frames > BigInt(Number.MAX_SAFE_INTEGER)) throw new HostPortError("resource_limit")
    return Number(frames)
}

function rationalFrames(value) {
    if (!value || !integer(value.numerator, 0, Number.MAX_SAFE_INTEGER) || !integer(value.denominator, 1, 1_000_000)) throw new HostPortError("invalid_request")
    const numerator = BigInt(value.numerator) * 48_000n
    const denominator = BigInt(value.denominator)
    const rounded = (numerator * 2n + denominator) / (denominator * 2n)
    if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new HostPortError("invalid_request")
    return rounded
}

function validateAudioDecodeWork(audio, storyFrames) {
    if (!audio || audio.sampleRate !== 48_000 || audio.channels !== 2 || !Array.isArray(audio.lanes) || !audio.master || typeof audio.master.muted !== "boolean") throw new HostPortError("invalid_request")
    if (audio.master.muted) return 0
    const hasSolo = audio.lanes.some((lane) => lane && lane.solo === true && lane.muted === false)
    let work = 0n
    let requests = 0n
    for (const lane of audio.lanes) {
        if (!lane || typeof lane.muted !== "boolean" || typeof lane.solo !== "boolean" || !Array.isArray(lane.clips)) throw new HostPortError("invalid_request")
        if (lane.muted || (hasSolo && !lane.solo)) continue
        for (const clip of lane.clips) {
            if (!clip || typeof clip.muted !== "boolean") throw new HostPortError("invalid_request")
            if (clip.muted) continue
            const start = rationalFrames(clip.timelineStart)
            const duration = rationalFrames(clip.duration)
            if (start >= BigInt(storyFrames)) continue
            const overlap = duration < BigInt(storyFrames) - start ? duration : BigInt(storyFrames) - start
            work += overlap
            if (work > BigInt(storyFrames) * BigInt(MAX_AUDIO_DECODE_WORK_FACTOR)) throw new HostPortError("unsupported_capability")
            const decodeSplits = (overlap + AUDIO_DECODE_CHUNK_FRAMES - 1n) / AUDIO_DECODE_CHUNK_FRAMES
            const mixSplits = (overlap + AUDIO_MIX_CHUNK_FRAMES - 1n) / AUDIO_MIX_CHUNK_FRAMES
            let loopSplits = 0n
            if (clip.loop === true) {
                const sourceSpan = rationalFrames(clip.sourceSpan)
                if (sourceSpan < 1n) throw new HostPortError("invalid_request")
                loopSplits = (overlap + sourceSpan - 1n) / sourceSpan
            }
            requests += decodeSplits + mixSplits + loopSplits + 1n
            if (requests > BigInt(MAX_AUDIO_DECODE_REQUESTS)) throw new HostPortError("unsupported_capability")
        }
    }
    return Number(requests)
}

function createH264Snapshot(intent, randomBytes = crypto.randomBytes) {
    if (!ownExact(intent, ["config", "width", "height", "fps", "durationMs", "cycleDurationMs", "finalCycleDurationMs", "quality"])) throw new HostPortError("invalid_request")
    validateConfig(intent.config)
    if (!integer(intent.width, 64, 7680) || intent.width % 2 || !integer(intent.height, 64, 7680) || intent.height % 2
        || !H264_FPS.has(intent.fps) || typeof intent.durationMs !== "number" || !Number.isFinite(intent.durationMs)
        || intent.durationMs < 1 || intent.durationMs > 24 * 60 * 60 * 1000
        || typeof intent.cycleDurationMs !== "number" || !Number.isFinite(intent.cycleDurationMs) || intent.cycleDurationMs < 1 || intent.cycleDurationMs > intent.durationMs
        || typeof intent.finalCycleDurationMs !== "number" || !Number.isFinite(intent.finalCycleDurationMs) || intent.finalCycleDurationMs < 1 || intent.finalCycleDurationMs > intent.durationMs
        || !H264_QUALITIES.has(intent.quality)) throw new HostPortError("invalid_request")
    const expectedDurationMs = intent.config.settings.playKind === "repeat"
        ? intent.cycleDurationMs * (intent.config.settings.repeatCount - 1) + intent.finalCycleDurationMs
        : intent.cycleDurationMs
    if (intent.durationMs !== expectedDurationMs
        || (intent.config.settings.playKind !== "repeat" && intent.finalCycleDurationMs !== intent.cycleDurationMs)) throw new HostPortError("invalid_request")
    const frameCount = Math.max(1, Math.round(intent.durationMs * intent.fps / 1000))
    const decodedFrameBytes = intent.width * intent.height * 4
    if (frameCount > 216_000 || decodedFrameBytes > 64 * 1024 * 1024 || decodedFrameBytes * frameCount > 64 * 1024 * 1024 * 1024) throw new HostPortError("resource_limit")
    const videoCount = intent.config.items.filter((item) => item.type === "video").length
    if (videoCount > 0 && videoCount * frameCount > 128) throw new HostPortError("resource_limit")
    const snapshotId = randomBytes(16).toString("hex")
    if (!H264_SNAPSHOT_ID.test(snapshotId)) throw new HostPortError("internal_error")
    const config = { ...intent.config, audio: intent.config.audio ?? emptyAudioIntent() }
    const audioFrameCount = audioFramesForVideo(frameCount, intent.fps)
    const maximumAudioDecodeRequests = validateAudioDecodeWork(config.audio, audioFrameCount)
    return cloneAndFreeze({
        snapshotId,
        version: 1,
        format: H264_FORMAT,
        scene: { id: "quiet-carousel", version: 1 },
        config,
        width: intent.width,
        height: intent.height,
        fps: intent.fps,
        durationMs: frameCount * 1000 / intent.fps,
        cycleDurationMs: intent.cycleDurationMs,
        finalCycleDurationMs: intent.finalCycleDurationMs,
        frameCount,
        alpha: false,
        audio: "aac-48khz-stereo",
        audioSampleRate: 48_000,
        audioChannels: 2,
        audioFrameCount,
        maximumAudioDecodeRequests,
        quality: intent.quality,
    })
}

function h264Capability(available = true) {
    if (typeof available !== "boolean") throw new HostPortError("invalid_request")
    return Object.freeze({
        id: H264_FORMAT,
        available,
        alpha: false,
        audio: true,
        sceneIds: Object.freeze(["quiet-carousel"]),
        consequence: available
            ? "Verified H.264/AAC currently supports Quiet Carousel only and produces an opaque BT.709 MP4. Transparent Projects must choose PNG Frames."
            : "H.264/AAC is unavailable because the bundled FFmpeg runtime is missing or not executable. Choose PNG Frames.",
    })
}

function h264Preflight(snapshot) {
    return Object.freeze({
        snapshotId: snapshot.snapshotId,
        format: snapshot.format,
        width: snapshot.width,
        height: snapshot.height,
        fps: snapshot.fps,
        durationMs: snapshot.durationMs,
        frameCount: snapshot.frameCount,
        alpha: false,
        audio: snapshot.audio,
        audioFrameCount: snapshot.audioFrameCount,
        consequence: h264Capability().consequence,
    })
}

module.exports = {
    H264_DESTINATION_GRANT,
    H264_FORMAT,
    H264_MIME,
    MAX_AUDIO_DECODE_REQUESTS,
    H264_SNAPSHOT_ID,
    MAX_AUDIO_DECODE_WORK_FACTOR,
    audioFramesForVideo,
    createH264Snapshot,
    h264Capability,
    h264Preflight,
}
