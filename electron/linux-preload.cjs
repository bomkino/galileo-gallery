const { contextBridge, ipcRenderer } = require("electron")

const CHANNEL = "gallery-host:request"
let generation = 0
let counter = 0
const bootstrap = ipcRenderer.invoke("gallery-host:bootstrap").then((value) => {
    if (!ownExact(value, ["protocol", "generation", "state"]) || value.protocol !== 1 || !Number.isSafeInteger(value.generation)) {
        throw new Error("Host bootstrap failed.")
    }
    generation = value.generation
})

function ownExact(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const actual = Object.keys(value).sort()
    const expected = [...keys].sort()
    return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value
    for (const child of Object.values(value)) deepFreeze(child)
    return Object.freeze(value)
}

function validateResponse(value, requestId, expectedGeneration, allowGenerationAdvance) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value.requestId !== requestId || !Number.isSafeInteger(value.generation)) {
        throw new Error("Host returned an invalid response.")
    }
    if (value.ok === true) {
        if (allowGenerationAdvance ? value.generation <= expectedGeneration : value.generation !== expectedGeneration) throw new Error("Host returned an invalid response.")
        if (!ownExact(value, ["ok", "requestId", "generation", "value"])) throw new Error("Host returned an invalid response.")
        return deepFreeze(value)
    }
    if (value.ok === false && ownExact(value, ["ok", "requestId", "generation", "error"]) && ownExact(value.error, ["code", "diagnosticId"])) {
        if (value.generation !== expectedGeneration) throw new Error("Host returned an invalid response.")
        return deepFreeze(value)
    }
    throw new Error("Host returned an invalid response.")
}

async function invoke(operation, payload = {}, allowGenerationAdvance = false) {
    await bootstrap
    counter += 1
    const requestId = `request-${Date.now().toString(36)}-${counter.toString(36)}`
    const requestGeneration = generation
    const response = validateResponse(await ipcRenderer.invoke(CHANNEL, {
        protocol: 1,
        requestId,
        operation,
        generation,
        payload,
    }), requestId, requestGeneration, allowGenerationAdvance)
    if (!response.ok) {
        const error = new Error(response.error.code)
        error.code = response.error.code
        error.diagnosticId = response.error.diagnosticId
        throw error
    }
    return response
}

const GRANT_URL = /^reel-media:\/\/grant\/[a-f0-9]{64}$/
const MAX_PREPARED_VIDEO_AUDIO_FRAMES = 256 * 1024 * 1024 / 4
const finite = (value, minimum, maximum) => typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum

function audioChoice(value, role) {
    if (value === null) return null
    if (!ownExact(value, ["name", "role", "url", "sampleRate", "channels", "sampleFrames"])
        || typeof value.name !== "string" || value.name.length < 1 || value.name.length > 512 || /[\\/\x00-\x1f]/.test(value.name)
        || value.role !== role || typeof value.url !== "string" || !GRANT_URL.test(value.url)
        || !Number.isSafeInteger(value.sampleRate) || value.sampleRate < 8_000 || value.sampleRate > 192_000
        || ![1, 2].includes(value.channels) || !Number.isSafeInteger(value.sampleFrames) || value.sampleFrames < 1) throw new Error("Host returned invalid audio metadata.")
    return value
}

function decodedAudio(value, startFrame, frameCount) {
    if (!ownExact(value, ["sampleRate", "channels", "startFrame", "frameCount", "samples"])
        || !Number.isSafeInteger(value.sampleRate) || value.sampleRate < 8_000 || value.sampleRate > 192_000 || ![1, 2].includes(value.channels)
        || value.startFrame !== startFrame || value.frameCount !== frameCount || !Array.isArray(value.samples)
        || value.samples.length !== frameCount * value.channels || value.samples.some((sample) => !finite(sample, -1, 1))) throw new Error("Host returned invalid PCM audio.")
    return value
}

function preparedVideoAudio(value) {
    if (!ownExact(value, ["sampleRate", "channels", "sampleFrames"])
        || value.sampleRate !== 48_000 || value.channels !== 2
        || !Number.isSafeInteger(value.sampleFrames) || value.sampleFrames < 1 || value.sampleFrames > MAX_PREPARED_VIDEO_AUDIO_FRAMES) throw new Error("Host returned invalid source-video audio metadata.")
    return value
}

function audioWaveform(value, bucketCount) {
    if (!ownExact(value, ["sampleRate", "channels", "sampleFrames", "buckets"])
        || !Number.isSafeInteger(value.sampleRate) || value.sampleRate < 8_000 || value.sampleRate > 192_000 || ![1, 2].includes(value.channels)
        || !Number.isSafeInteger(value.sampleFrames) || value.sampleFrames < 1 || !Array.isArray(value.buckets) || value.buckets.length !== bucketCount
        || value.buckets.some((bucket) => !ownExact(bucket, ["minimum", "maximum", "rms"])
            || !finite(bucket.minimum, -1, 1) || !finite(bucket.maximum, -1, 1) || bucket.minimum > bucket.maximum || !finite(bucket.rms, 0, 1))) throw new Error("Host returned an invalid waveform.")
    return value
}

function cancelledAudio(value) {
    if (!ownExact(value, ["cancelled"]) || !Number.isSafeInteger(value.cancelled) || value.cancelled < 0 || value.cancelled > 2) throw new Error("Host returned an invalid cancellation result.")
    return value
}

function exportCapabilities(value) {
    if (!ownExact(value, ["version", "formats"]) || value.version !== 1 || !Array.isArray(value.formats) || value.formats.length !== 2) throw new Error("Host returned invalid export capabilities.")
    const [png, h264] = value.formats
    if (!ownExact(png, ["id", "available", "alpha", "audio", "sceneVersions", "consequence"]) || png.id !== "png-frames"
        || png.available !== true || png.alpha !== true || png.audio !== false || typeof png.consequence !== "string" || png.consequence.length < 1 || png.consequence.length > 512
        || !Array.isArray(png.sceneVersions) || png.sceneVersions.length !== 2
        || !ownExact(png.sceneVersions[0], ["id", "versions"]) || png.sceneVersions[0].id !== "quiet-carousel" || !Array.isArray(png.sceneVersions[0].versions) || png.sceneVersions[0].versions.length !== 1 || png.sceneVersions[0].versions[0] !== 1
        || !ownExact(png.sceneVersions[1], ["id", "versions"]) || png.sceneVersions[1].id !== "vitrine" || !Array.isArray(png.sceneVersions[1].versions) || png.sceneVersions[1].versions.length !== 1 || png.sceneVersions[1].versions[0] !== 2
        || !ownExact(h264, ["id", "available", "alpha", "audio", "sceneIds", "consequence"]) || h264.id !== "mp4-h264-aac"
        || typeof h264.available !== "boolean" || h264.alpha !== false || h264.audio !== true
        || !Array.isArray(h264.sceneIds) || h264.sceneIds.length !== 1 || h264.sceneIds[0] !== "quiet-carousel"
        || typeof h264.consequence !== "string" || h264.consequence.length < 1 || h264.consequence.length > 512) {
        throw new Error("Host returned invalid export capabilities.")
    }
    return value
}

function pngPreflight(value) {
    if (!ownExact(value, ["snapshotId", "format", "width", "height", "fps", "durationMs", "frameCount", "alpha", "audio", "consequence"])
        || typeof value.snapshotId !== "string" || !/^[a-f0-9]{32}$/.test(value.snapshotId) || value.format !== "png-frames"
        || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || !Number.isSafeInteger(value.fps)
        || typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs) || !Number.isSafeInteger(value.frameCount) || value.frameCount < 1
        || typeof value.alpha !== "boolean" || value.audio !== "none" || typeof value.consequence !== "string" || value.consequence.length > 512) {
        throw new Error("Host returned invalid PNG Frames preflight.")
    }
    return value
}

function pngDestination(value) {
    if (ownExact(value, ["cancelled"]) && value.cancelled === true) return value
    if (!ownExact(value, ["cancelled", "destinationGrant"]) || value.cancelled !== false || typeof value.destinationGrant !== "string" || !/^[a-f0-9]{64}$/.test(value.destinationGrant)) {
        throw new Error("Host returned an invalid export destination.")
    }
    return value
}

function pngResult(value) {
    if (!ownExact(value, ["format", "frameCount", "width", "height", "alpha", "audio", "manifestSha256"])
        || value.format !== "png-frames" || !Number.isSafeInteger(value.frameCount) || value.frameCount < 1
        || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || typeof value.alpha !== "boolean" || value.audio !== "none"
        || typeof value.manifestSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.manifestSha256)) throw new Error("Host returned an invalid PNG Frames result.")
    return value
}

function h264Preflight(value) {
    if (!ownExact(value, ["snapshotId", "format", "width", "height", "fps", "durationMs", "frameCount", "alpha", "audio", "audioFrameCount", "consequence"])
        || typeof value.snapshotId !== "string" || !/^[a-f0-9]{32}$/.test(value.snapshotId) || value.format !== "mp4-h264-aac"
        || !Number.isSafeInteger(value.width) || value.width < 64 || value.width > 7680 || value.width % 2
        || !Number.isSafeInteger(value.height) || value.height < 64 || value.height > 7680 || value.height % 2
        || !Number.isSafeInteger(value.fps) || ![24, 25, 30, 48, 50, 60].includes(value.fps)
        || typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs) || !Number.isSafeInteger(value.frameCount) || value.frameCount < 1
        || value.alpha !== false || value.audio !== "aac-48khz-stereo" || !Number.isSafeInteger(value.audioFrameCount) || value.audioFrameCount < 1
        || typeof value.consequence !== "string" || value.consequence.length > 512) throw new Error("Host returned invalid H.264/AAC preflight.")
    return value
}

function h264AudioAppend(value) {
    if (!ownExact(value, ["acceptedFrames", "nextFrame"]) || !Number.isSafeInteger(value.acceptedFrames) || value.acceptedFrames < 1 || value.acceptedFrames > 65_536
        || !Number.isSafeInteger(value.nextFrame) || value.nextFrame < value.acceptedFrames) throw new Error("Host returned invalid H.264 audio staging progress.")
    return value
}

function h264AudioFinished(value) {
    if (!ownExact(value, ["snapshotId", "sampleRate", "channels", "sampleFrames", "bytes", "sha256"])
        || typeof value.snapshotId !== "string" || !/^[a-f0-9]{32}$/.test(value.snapshotId) || value.sampleRate !== 48_000 || value.channels !== 2
        || !Number.isSafeInteger(value.sampleFrames) || value.sampleFrames < 1 || value.bytes !== value.sampleFrames * 4
        || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) throw new Error("Host returned invalid H.264 audio staging receipt.")
    return value
}

function h264Result(value) {
    if (!ownExact(value, ["format", "frameCount", "width", "height", "alpha", "audio", "audioFrameCount", "bytes", "sha256", "videoDecodeSha256", "audioDecodeSha256"])
        || value.format !== "mp4-h264-aac" || !Number.isSafeInteger(value.frameCount) || value.frameCount < 1
        || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || value.alpha !== false || value.audio !== "aac-48khz-stereo"
        || !Number.isSafeInteger(value.audioFrameCount) || value.audioFrameCount < 1 || !Number.isSafeInteger(value.bytes) || value.bytes < 128
        || [value.sha256, value.videoDecodeSha256, value.audioDecodeSha256].some((hash) => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))) {
        throw new Error("Host returned an invalid H.264/AAC result.")
    }
    return value
}

function cancelledExport(value) {
    if (!ownExact(value, ["cancelled"]) || typeof value.cancelled !== "boolean") throw new Error("Host returned an invalid export cancellation result.")
    return value
}

function exportProgress(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const allowed = new Set(["exportId", "phase", "progress", "frame", "totalFrames", "message"])
    if (Object.keys(value).some((key) => !allowed.has(key)) || typeof value.exportId !== "string" || !/^(?:png|h264)-[a-f0-9]{24}$/.test(value.exportId)
        || !["preparing", "rendering", "encoding", "verifying", "done", "cancelled", "error"].includes(value.phase)
        || !finite(value.progress, 0, 1)
        || (value.frame !== undefined && (!Number.isSafeInteger(value.frame) || value.frame < 0))
        || (value.totalFrames !== undefined && (!Number.isSafeInteger(value.totalFrames) || value.totalFrames < 1))
        || (value.message !== undefined && (typeof value.message !== "string" || value.message.length > 512))) return null
    return deepFreeze({
        exportId: value.exportId,
        phase: value.phase,
        progress: value.progress,
        ...(value.frame !== undefined ? { frame: value.frame } : {}),
        ...(value.totalFrames !== undefined ? { totalFrames: value.totalFrames } : {}),
        ...(value.message !== undefined ? { message: value.message } : {}),
    })
}

const galleryHost = {
    platform: "linux",
    identity: async () => (await invoke("identity.read")).value,
    chooseMedia: async () => (await invoke("media.choose")).value,
    releaseMedia: async (urls) => (await invoke("media.release", { urls })).value,
    chooseAudio: async (role) => audioChoice((await invoke("audio.choose", { role })).value, role),
    prepareVideoAudio: async (url, durationUs) => preparedVideoAudio((await invoke("audio.video.prepare", { url, durationUs })).value),
    decodeAudio: async (url, startFrame, frameCount) => decodedAudio((await invoke("audio.decode", { url, startFrame, frameCount })).value, startFrame, frameCount),
    audioWaveform: async (url, buckets) => audioWaveform((await invoke("audio.waveform", { url, buckets })).value, buckets),
    cancelAudio: async () => cancelledAudio((await invoke("audio.cancel")).value),
    exportCapabilities: async () => exportCapabilities((await invoke("export.capabilities")).value),
    preflightPngFrames: async (intent) => pngPreflight((await invoke("export.png.preflight", { intent })).value),
    choosePngFramesDestination: async (suggestedName) => pngDestination((await invoke("export.destination.choose", { suggestedName })).value),
    startPngFramesExport: async (snapshotId, destinationGrant) => pngResult((await invoke("export.png.start", { snapshotId, destinationGrant })).value),
    preflightH264: async (intent) => h264Preflight((await invoke("export.h264.preflight", { intent })).value),
    appendH264Audio: async (snapshotId, startFrame, pcm16Base64) => h264AudioAppend((await invoke("export.h264.audio.append", { snapshotId, startFrame, pcm16Base64 })).value),
    finishH264Audio: async (snapshotId) => h264AudioFinished((await invoke("export.h264.audio.finish", { snapshotId })).value),
    chooseH264Destination: async (suggestedName) => pngDestination((await invoke("export.h264.destination.choose", { suggestedName })).value),
    startH264Export: async (snapshotId, destinationGrant) => h264Result((await invoke("export.h264.start", { snapshotId, destinationGrant })).value),
    cancelExport: async () => cancelledExport((await invoke("export.cancel")).value),
    onExportProgress: (callback) => {
        if (typeof callback !== "function") throw new Error("Export progress callback is invalid.")
        const listener = (_event, value) => {
            const safe = exportProgress(value)
            if (safe) callback(safe)
        }
        ipcRenderer.on("export:progress", listener)
        return () => ipcRenderer.removeListener("export:progress", listener)
    },
    saveProject: async (config) => (await invoke("project.save", { config })).value,
    beginProjectOpen: async () => (await invoke("project.open.begin")).value,
    acceptProjectOpen: async (operationId) => {
        const response = await invoke("project.open.accept", { operationId }, true)
        generation = response.generation
        return response.value
    },
    discardProjectOpen: async (operationId) => (await invoke("project.open.discard", { operationId })).value,
    cancelProjectOpen: async () => (await invoke("project.open.cancel")).value,
}

contextBridge.exposeInMainWorld("galleryHost", deepFreeze(galleryHost))
