const crypto = require("node:crypto")
const { HostPortError } = require("./linux-host-port.cjs")

const PNG_FRAMES_MIME = "application/vnd.galileo.png-frames-directory"
const SNAPSHOT_ID = /^[a-f0-9]{32}$/
const DESTINATION_GRANT = /^[a-f0-9]{64}$/
const MAX_DECODED_VIDEO_BYTES = 2 * 1024 * 1024 * 1024

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

function validateQuietCarouselConfig(config) {
    if (!config || typeof config !== "object" || Array.isArray(config) || config.schemaVersion !== 2 || config.styleId !== "quiet-carousel") throw new HostPortError("unsupported_capability")
    if (!Array.isArray(config.items) || config.items.length < 1 || config.items.length > 256 || !config.settings || typeof config.settings !== "object"
        || !["solid", "gradient", "halo", "paper", "transparent"].includes(config.settings.backgroundStyle)) throw new HostPortError("invalid_request")
    const ids = new Set()
    for (const item of config.items) {
        if (!item || typeof item !== "object" || typeof item.id !== "string" || ids.has(item.id)
            || !["image", "video"].includes(item.type) || typeof item.url !== "string"
            || !/^reel-media:\/\/grant\/[a-f0-9]{64}$/.test(item.url)
            || typeof item.ratio !== "number" || !Number.isFinite(item.ratio) || item.ratio < 0.05 || item.ratio > 20) throw new HostPortError("invalid_request")
        ids.add(item.id)
    }
}

function createPngFramesSnapshot(intent, randomBytes = crypto.randomBytes) {
    if (!ownExact(intent, ["config", "width", "height", "fps", "durationMs", "cycleDurationMs", "finalCycleDurationMs", "transparent"])) throw new HostPortError("invalid_request")
    validateQuietCarouselConfig(intent.config)
    if (!integer(intent.width, 64, 7680) || !integer(intent.height, 64, 7680) || !integer(intent.fps, 1, 120)
        || typeof intent.durationMs !== "number" || !Number.isFinite(intent.durationMs) || intent.durationMs < 1 || intent.durationMs > 24 * 60 * 60 * 1000
        || typeof intent.cycleDurationMs !== "number" || !Number.isFinite(intent.cycleDurationMs) || intent.cycleDurationMs < 1 || intent.cycleDurationMs > intent.durationMs
        || typeof intent.finalCycleDurationMs !== "number" || !Number.isFinite(intent.finalCycleDurationMs) || intent.finalCycleDurationMs < 1 || intent.finalCycleDurationMs > intent.durationMs
        || typeof intent.transparent !== "boolean") throw new HostPortError("invalid_request")
    if (intent.transparent !== (intent.config.settings.backgroundStyle === "transparent")) throw new HostPortError("invalid_request")
    const frameCount = Math.max(1, Math.round(intent.durationMs * intent.fps / 1000))
    if (frameCount > 216_000 || intent.width * intent.height * frameCount > 100_000_000_000) throw new HostPortError("resource_limit")
    const videoCount = intent.config.items.filter((item) => item.type === "video").length
    if (videoCount > 0 && videoCount * frameCount > 128) throw new HostPortError("resource_limit")
    const worstDecodedFrameBytes = intent.width * intent.height * 4 + intent.height + 1024 * 1024
    if (videoCount * frameCount * worstDecodedFrameBytes > MAX_DECODED_VIDEO_BYTES) throw new HostPortError("resource_limit")
    const snapshotId = randomBytes(16).toString("hex")
    if (!SNAPSHOT_ID.test(snapshotId)) throw new HostPortError("internal_error")
    return cloneAndFreeze({
        snapshotId,
        version: 1,
        format: "png-frames",
        scene: { id: "quiet-carousel", version: 1 },
        config: intent.config,
        width: intent.width,
        height: intent.height,
        fps: intent.fps,
        durationMs: intent.durationMs,
        cycleDurationMs: intent.cycleDurationMs,
        finalCycleDurationMs: intent.finalCycleDurationMs,
        frameCount,
        alpha: intent.transparent,
        audio: "none",
    })
}

function pngFramesCapabilities() {
    return Object.freeze({
        version: 1,
        formats: Object.freeze([Object.freeze({
            id: "png-frames",
            available: true,
            alpha: true,
            audio: false,
            consequence: "PNG Frames preserve straight alpha when requested and never contain audio; Project audio intent is unchanged.",
        })]),
    })
}

function pngFramesPreflight(snapshot) {
    return Object.freeze({
        snapshotId: snapshot.snapshotId,
        format: snapshot.format,
        width: snapshot.width,
        height: snapshot.height,
        fps: snapshot.fps,
        durationMs: snapshot.durationMs,
        frameCount: snapshot.frameCount,
        alpha: snapshot.alpha,
        audio: snapshot.audio,
        consequence: pngFramesCapabilities().formats[0].consequence,
    })
}

module.exports = { DESTINATION_GRANT, PNG_FRAMES_MIME, SNAPSHOT_ID, createPngFramesSnapshot, pngFramesCapabilities, pngFramesPreflight }
