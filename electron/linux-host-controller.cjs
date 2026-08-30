const crypto = require("node:crypto")
const fs = require("node:fs")
const {
    HostPortError,
    createGrantRegistry,
    createRequestLimiter,
    publicFailure,
    validateEnvelope,
    validateSender,
} = require("./linux-host-port.cjs")
const {
    DESTINATION_GRANT,
    PNG_FRAMES_MIME,
    SNAPSHOT_ID,
    createPngFramesSnapshot,
    pngFramesCapabilities,
    pngFramesPreflight,
} = require("./png-export-contract.cjs")
const {
    MAX_CHUNK_BASE64,
} = require("./h264-audio-stage.cjs")
const {
    H264_DESTINATION_GRANT,
    H264_MIME,
    H264_SNAPSHOT_ID,
    MAX_AUDIO_DECODE_REQUESTS,
    createH264Snapshot,
    h264Capability,
    h264Preflight,
} = require("./h264-export-contract.cjs")

const GRANT_URL = /^reel-media:\/\/grant\/([a-f0-9]{64})$/
const MAX_PREPARED_VIDEO_AUDIO_FRAMES = 256 * 1024 * 1024 / 4

function verifyOpenedMediaSource(opened) {
    if (!opened || !Number.isSafeInteger(opened.handle)) throw new HostPortError("verification_failed")
    const stats = fs.fstatSync(opened.handle)
    if (!stats.isFile() || stats.dev !== opened.device || stats.ino !== opened.inode || stats.size !== opened.size
        || stats.mtimeMs !== opened.mtimeMs || stats.ctimeMs !== opened.ctimeMs) throw new HostPortError("verification_failed")
    return stats
}

function ownExact(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const actual = Object.keys(value).sort()
    const expected = [...keys].sort()
    return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function cheapEnvelopePayload(value, generation) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const required = new Set(["protocol", "requestId", "operation", "generation", "payload"])
    let count = 0
    for (const key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue
        count += 1
        if (count > 5 || !required.has(key)) return false
        required.delete(key)
    }
    if (count !== 5 || required.size !== 0 || value.protocol !== 1 || value.generation !== generation
        || typeof value.requestId !== "string" || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(value.requestId)
        || !value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) return null
    return value.payload
}

function cheapExactControlEnvelope(value, generation) {
    const payload = cheapEnvelopePayload(value, generation)
    if (!payload) return false
    for (const key in payload) if (Object.prototype.hasOwnProperty.call(payload, key)) return false
    return true
}

function cheapExactAudioDecodeEnvelope(value, generation) {
    const payload = cheapEnvelopePayload(value, generation)
    if (!payload) return false
    const required = new Set(["url", "startFrame", "frameCount"])
    let count = 0
    for (const key in payload) {
        if (!Object.prototype.hasOwnProperty.call(payload, key)) continue
        count += 1
        if (count > 3 || !required.has(key)) return false
        required.delete(key)
    }
    return count === 3 && required.size === 0 && typeof payload.url === "string" && payload.url.length === "reel-media://grant/".length + 64 && GRANT_URL.test(payload.url)
        && Number.isSafeInteger(payload.startFrame) && payload.startFrame >= 0
        && Number.isSafeInteger(payload.frameCount) && payload.frameCount >= 1 && payload.frameCount <= 4_096
}

function cheapExactH264AudioAppendEnvelope(value, generation) {
    const payload = cheapEnvelopePayload(value, generation)
    if (!payload) return false
    const required = new Set(["snapshotId", "startFrame", "pcm16Base64"])
    let count = 0
    for (const key in payload) {
        if (!Object.prototype.hasOwnProperty.call(payload, key)) continue
        count += 1
        if (count > 3 || !required.has(key)) return false
        required.delete(key)
    }
    return count === 3 && required.size === 0 && typeof payload.snapshotId === "string" && H264_SNAPSHOT_ID.test(payload.snapshotId)
        && Number.isSafeInteger(payload.startFrame) && payload.startFrame >= 0
        && typeof payload.pcm16Base64 === "string" && payload.pcm16Base64.length >= 4 && payload.pcm16Base64.length <= MAX_CHUNK_BASE64
}

function validConfig(value) {
    return value && typeof value === "object" && !Array.isArray(value)
}

function validOperationId(value) {
    return typeof value === "string" && /^[a-f0-9]{32}$/.test(value)
}

function finite(value, minimum, maximum) {
    return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
}

function safeAudioChoice(value, expectedRole) {
    if (value === null) return null
    if (!ownExact(value, ["name", "role", "url", "sampleRate", "channels", "sampleFrames"])
        || typeof value.name !== "string" || value.name.length < 1 || value.name.length > 512 || /[\\/\x00-\x1f]/.test(value.name)
        || value.role !== expectedRole || typeof value.url !== "string" || !GRANT_URL.test(value.url)
        || !Number.isSafeInteger(value.sampleRate) || value.sampleRate < 8_000 || value.sampleRate > 192_000
        || ![1, 2].includes(value.channels) || !Number.isSafeInteger(value.sampleFrames) || value.sampleFrames < 1) throw new HostPortError("verification_failed")
    return value
}

function safeAudioDecode(value, payload) {
    if (!ownExact(value, ["sampleRate", "channels", "startFrame", "frameCount", "samples"])
        || !Number.isSafeInteger(value.sampleRate) || value.sampleRate < 8_000 || value.sampleRate > 192_000 || ![1, 2].includes(value.channels)
        || value.startFrame !== payload.startFrame || value.frameCount !== payload.frameCount || !Array.isArray(value.samples)
        || value.samples.length !== value.frameCount * value.channels || value.samples.some((sample) => !finite(sample, -1, 1))) throw new HostPortError("verification_failed")
    return value
}

function safePreparedVideoAudio(value) {
    if (!ownExact(value, ["sampleRate", "channels", "sampleFrames"])
        || value.sampleRate !== 48_000 || value.channels !== 2
        || !Number.isSafeInteger(value.sampleFrames) || value.sampleFrames < 1 || value.sampleFrames > MAX_PREPARED_VIDEO_AUDIO_FRAMES) throw new HostPortError("verification_failed")
    return value
}

function safeWaveform(value, payload) {
    if (!ownExact(value, ["sampleRate", "channels", "sampleFrames", "buckets"])
        || !Number.isSafeInteger(value.sampleRate) || value.sampleRate < 8_000 || value.sampleRate > 192_000 || ![1, 2].includes(value.channels)
        || !Number.isSafeInteger(value.sampleFrames) || value.sampleFrames < 1 || !Array.isArray(value.buckets) || value.buckets.length !== payload.buckets
        || value.buckets.some((bucket) => !ownExact(bucket, ["minimum", "maximum", "rms"])
            || !finite(bucket.minimum, -1, 1) || !finite(bucket.maximum, -1, 1) || bucket.minimum > bucket.maximum || !finite(bucket.rms, 0, 1))) {
        throw new HostPortError("verification_failed")
    }
    return value
}

function safePngExportResult(value, snapshot) {
    if (!ownExact(value, ["format", "frameCount", "width", "height", "alpha", "audio", "manifestSha256"])
        || value.format !== "png-frames" || value.frameCount !== snapshot.frameCount || value.width !== snapshot.width || value.height !== snapshot.height
        || value.alpha !== snapshot.alpha || value.audio !== "none" || typeof value.manifestSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.manifestSha256)) {
        throw new HostPortError("verification_failed")
    }
    return value
}

function safeH264ExportResult(value, snapshot) {
    if (!ownExact(value, ["format", "frameCount", "width", "height", "alpha", "audio", "audioFrameCount", "bytes", "sha256", "videoDecodeSha256", "audioDecodeSha256"])
        || value.format !== "mp4-h264-aac" || value.frameCount !== snapshot.frameCount || value.width !== snapshot.width || value.height !== snapshot.height
        || value.alpha !== false || value.audio !== "aac-48khz-stereo" || value.audioFrameCount !== snapshot.audioFrameCount
        || !Number.isSafeInteger(value.bytes) || value.bytes < 128
        || [value.sha256, value.videoDecodeSha256, value.audioDecodeSha256].some((hash) => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))) {
        throw new HostPortError("verification_failed")
    }
    return value
}

function tokenFromMediaURL(value) {
    if (typeof value !== "string") throw new HostPortError("invalid_request")
    const match = GRANT_URL.exec(value)
    if (!match) throw new HostPortError("invalid_request")
    return match[1]
}

function createLinuxHostController(options) {
    const owner = options.owner
    const webContentsId = options.webContentsId
    const registry = options.registry ?? createGrantRegistry()
    const limiter = options.limiter ?? createRequestLimiter()
    const ingressLimiter = options.ingressLimiter ?? createRequestLimiter({ maximumRequests: 512 })
    const exportIngressLimiter = options.exportIngressLimiter ?? createRequestLimiter({ maximumRequests: 2_048 })
    const exportLimiter = options.exportLimiter ?? createRequestLimiter({ maximumRequests: 2_048 })
    const controlIngressLimiter = options.controlIngressLimiter ?? createRequestLimiter({ maximumRequests: 512 })
    const controlLimiters = Object.freeze({
        "audio.cancel": createRequestLimiter({ maximumRequests: 60 }),
        "export.cancel": createRequestLimiter({ maximumRequests: 60 }),
        "project.open.cancel": createRequestLimiter({ maximumRequests: 60 }),
    })
    const h264Available = options.h264Available ?? true
    if (typeof h264Available !== "boolean") throw new HostPortError("invalid_request")
    const removeResourceRoot = options.removeResourceRoot ?? ((resourceRoot) => fs.rmSync(resourceRoot, { recursive: true, force: true }))
    let generation = options.generation ?? 1
    let state = "ready"
    let currentResourceRoot = null
    let pending = null
    let opening = null
    let nextGeneration = generation + 1
    let activeAudioRequests = 0
    const audioControllers = new Set()
    let exportSnapshot = null
    let exportController = null
    let exportDestinationToken = null
    let exportAudioStage = null
    let exportAudioResult = null
    let exportDecodedAudioFrames = 0
    let exportDecodedAudioRequests = 0
    let exportAudioAppendRequests = 0

    const operations = Object.freeze({
        "identity.read": { states: ["ready", "opening"], validate: (payload) => ownExact(payload, []) },
        "media.choose": { states: ["ready"], validate: (payload) => ownExact(payload, []) },
        "media.release": {
            states: ["ready"],
            validate: (payload) => ownExact(payload, ["urls"]) && Array.isArray(payload.urls) && payload.urls.length <= 512 && payload.urls.every((url) => typeof url === "string" && GRANT_URL.test(url)),
        },
        "audio.choose": {
            states: ["ready"],
            validate: (payload) => ownExact(payload, ["role"]) && ["presenter", "soundtrack"].includes(payload.role),
        },
        "audio.video.prepare": {
            states: ["ready", "opening"],
            validate: (payload) => ownExact(payload, ["url", "durationUs"]) && typeof payload.url === "string" && GRANT_URL.test(payload.url)
                && Number.isSafeInteger(payload.durationUs) && payload.durationUs >= 1 && payload.durationUs <= 24 * 60 * 60 * 1_000_000,
        },
        "audio.decode": {
            states: ["ready", "opening"],
            validate: (payload) => ownExact(payload, ["url", "startFrame", "frameCount"])
                && typeof payload.url === "string" && GRANT_URL.test(payload.url)
                && Number.isSafeInteger(payload.startFrame) && payload.startFrame >= 0
                && Number.isSafeInteger(payload.frameCount) && payload.frameCount >= 1 && payload.frameCount <= 4096,
        },
        "audio.waveform": {
            states: ["ready", "opening"],
            validate: (payload) => ownExact(payload, ["url", "buckets"])
                && typeof payload.url === "string" && GRANT_URL.test(payload.url)
                && Number.isSafeInteger(payload.buckets) && payload.buckets >= 1 && payload.buckets <= 1024,
        },
        "audio.cancel": { states: ["ready", "opening"], validate: (payload) => ownExact(payload, []) },
        "export.capabilities": { states: ["ready"], validate: (payload) => ownExact(payload, []) },
        "export.png.preflight": { states: ["ready"], validate: (payload) => ownExact(payload, ["intent"]) },
        "export.h264.preflight": { states: ["ready"], validate: (payload) => ownExact(payload, ["intent"]) },
        "export.h264.audio.append": {
            states: ["ready"],
            validate: (payload) => ownExact(payload, ["snapshotId", "startFrame", "pcm16Base64"])
                && typeof payload.snapshotId === "string" && H264_SNAPSHOT_ID.test(payload.snapshotId)
                && Number.isSafeInteger(payload.startFrame) && payload.startFrame >= 0
                && typeof payload.pcm16Base64 === "string" && payload.pcm16Base64.length >= 4 && payload.pcm16Base64.length <= MAX_CHUNK_BASE64,
        },
        "export.h264.audio.finish": {
            states: ["ready"],
            validate: (payload) => ownExact(payload, ["snapshotId"]) && typeof payload.snapshotId === "string" && H264_SNAPSHOT_ID.test(payload.snapshotId),
        },
        "export.destination.choose": {
            states: ["ready"],
            validate: (payload) => ownExact(payload, ["suggestedName"]) && typeof payload.suggestedName === "string"
                && payload.suggestedName.length >= 1 && payload.suggestedName.length <= 120 && !/[\\/\x00-\x1f]/.test(payload.suggestedName),
        },
        "export.png.start": {
            states: ["ready"],
            validate: (payload) => ownExact(payload, ["snapshotId", "destinationGrant"])
                && typeof payload.snapshotId === "string" && SNAPSHOT_ID.test(payload.snapshotId)
                && typeof payload.destinationGrant === "string" && DESTINATION_GRANT.test(payload.destinationGrant),
        },
        "export.h264.destination.choose": {
            states: ["ready"],
            validate: (payload) => ownExact(payload, ["suggestedName"]) && typeof payload.suggestedName === "string"
                && payload.suggestedName.length >= 1 && payload.suggestedName.length <= 120 && !/[\\/\x00-\x1f]/.test(payload.suggestedName),
        },
        "export.h264.start": {
            states: ["ready"],
            validate: (payload) => ownExact(payload, ["snapshotId", "destinationGrant"])
                && typeof payload.snapshotId === "string" && H264_SNAPSHOT_ID.test(payload.snapshotId)
                && typeof payload.destinationGrant === "string" && H264_DESTINATION_GRANT.test(payload.destinationGrant),
        },
        "export.cancel": { states: ["ready", "opening"], validate: (payload) => ownExact(payload, []) },
        "project.save": { states: ["ready"], validate: (payload) => ownExact(payload, ["config"]) && validConfig(payload.config) },
        "project.open.begin": { states: ["ready"], validate: (payload) => ownExact(payload, []) },
        "project.open.accept": { states: ["opening"], validate: (payload) => ownExact(payload, ["operationId"]) && validOperationId(payload.operationId) },
        "project.open.discard": { states: ["opening"], validate: (payload) => ownExact(payload, ["operationId"]) && validOperationId(payload.operationId) },
        "project.open.cancel": { states: ["opening"], validate: (payload) => ownExact(payload, []) },
    })

    function grantMedia(filePath, mime, targetGeneration = generation) {
        return registry.create({ scope: "media", filePath, owner, generation: targetGeneration, mime })
    }

    function grantDestination(filePath, mime = PNG_FRAMES_MIME) {
        return registry.createDestination({ scope: "destination", filePath, owner, generation, mime })
    }

    function mediaGrant(mediaURL) {
        const token = tokenFromMediaURL(mediaURL)
        const generations = pending ? [generation, pending.generation] : [generation]
        let lastError
        for (const candidate of generations) {
            try {
                return registry.resolve({ grant: token, scope: "media", owner, generation: candidate })
            } catch (error) {
                lastError = error
            }
        }
        throw lastError ?? new HostPortError("grant_expired")
    }

    function mediaPath(mediaURL) {
        return mediaGrant(mediaURL).filePath
    }

    function openExportMedia(mediaURL) {
        const grant = mediaGrant(mediaURL)
        const handle = fs.openSync(grant.filePath, "r")
        try {
            const stats = fs.fstatSync(handle)
            if (!stats.isFile() || stats.dev !== grant.device || stats.ino !== grant.inode || stats.size !== grant.bytes
                || stats.mtimeMs !== grant.mtimeMs || stats.ctimeMs !== grant.ctimeMs) throw new HostPortError("verification_failed")
            const opened = Object.freeze({ handle, device: stats.dev, inode: stats.ino, size: stats.size, mtimeMs: stats.mtimeMs, ctimeMs: stats.ctimeMs, mime: grant.mime })
            verifyOpenedMediaSource(opened)
            return opened
        } catch (error) {
            fs.closeSync(handle)
            throw error
        }
    }

    function safeRemove(resourceRoot) {
        if (!resourceRoot) return
        try {
            removeResourceRoot(resourceRoot)
        } catch {
            // Authority has already moved; cleanup residue remains app-owned and is never exposed to the renderer.
        }
    }

    function notifyRevoked(grants) {
        for (const grant of grants) {
            try { options.onGrantRevoked?.(grant) } catch { /* Revocation remains authoritative. */ }
        }
    }

    function revokeToken(token) {
        const grant = registry.revoke(token)
        if (grant) notifyRevoked([grant])
    }

    function revokeGeneration(targetGeneration) {
        notifyRevoked(registry.revokeOwner(owner, targetGeneration))
    }

    function revokeAll() {
        notifyRevoked(registry.revokeOwner(owner))
    }

    function cleanupPending() {
        if (!pending) return
        const abandoned = pending
        pending = null
        cancelAudioWork()
        revokeGeneration(abandoned.generation)
        safeRemove(abandoned.resourceRoot)
    }

    async function withAudioSlot(work) {
        if (activeAudioRequests >= 2) throw new HostPortError("resource_limit")
        activeAudioRequests += 1
        const controller = new AbortController()
        audioControllers.add(controller)
        try {
            return await work(controller.signal)
        } finally {
            audioControllers.delete(controller)
            activeAudioRequests -= 1
        }
    }

    function cancelAudioWork() {
        const cancelled = audioControllers.size
        for (const controller of audioControllers) controller.abort()
        return cancelled
    }

    function cancelExportWork() {
        if (!exportController) return false
        exportController.abort()
        return true
    }


    function clearPreparedExport() {
        const hadPrepared = Boolean(exportSnapshot || exportDestinationToken || exportAudioStage || exportAudioResult)
        exportSnapshot = null
        if (exportDestinationToken) registry.revoke(exportDestinationToken)
        exportDestinationToken = null
        try { exportAudioStage?.dispose() } catch (error) { options.onError?.("export.cleanup", error) }
        exportAudioStage = null
        exportAudioResult = null
        exportDecodedAudioFrames = 0
        exportDecodedAudioRequests = 0
        exportAudioAppendRequests = 0
        return hadPrepared
    }

    async function dispatch(envelope) {
        switch (envelope.operation) {
            case "identity.read":
                return options.identity()
            case "media.choose":
                return options.chooseMedia({ generation, grantMedia })
            case "media.release": {
                cancelAudioWork()
                for (const url of envelope.payload.urls) revokeToken(tokenFromMediaURL(url))
                return { released: envelope.payload.urls.length }
            }
            case "audio.choose": {
                const choiceGeneration = generation
                return withAudioSlot(async (signal) => {
                    const choice = await options.chooseAudio({
                        role: envelope.payload.role,
                        generation: choiceGeneration,
                        grantMedia: (filePath, mime) => grantMedia(filePath, mime, choiceGeneration),
                        signal,
                    })
                    try {
                        const safe = safeAudioChoice(choice, envelope.payload.role)
                        if (generation !== choiceGeneration || state !== "ready") {
                            if (safe?.url) revokeToken(tokenFromMediaURL(safe.url))
                            throw new HostPortError("conflict")
                        }
                        return safe
                    } catch (error) {
                        if (choice?.url && typeof choice.url === "string" && GRANT_URL.test(choice.url)) revokeToken(tokenFromMediaURL(choice.url))
                        throw error
                    }
                })
            }
            case "audio.decode":
                if (exportSnapshot?.format === "mp4-h264-aac") {
                    const maximumExportDecodeFrames = exportSnapshot.audioFrameCount * 64
                    if (exportDecodedAudioFrames + envelope.payload.frameCount > maximumExportDecodeFrames) throw new HostPortError("resource_limit")
                    if (exportDecodedAudioRequests + 1 > exportSnapshot.maximumAudioDecodeRequests) throw new HostPortError("resource_limit")
                    exportDecodedAudioFrames += envelope.payload.frameCount
                    exportDecodedAudioRequests += 1
                }
                return withAudioSlot(async (signal) => safeAudioDecode(await options.decodeAudio({ grant: mediaGrant(envelope.payload.url), startFrame: envelope.payload.startFrame, frameCount: envelope.payload.frameCount, signal }), envelope.payload))
            case "audio.video.prepare":
                return withAudioSlot(async (signal) => safePreparedVideoAudio(await options.prepareVideoAudio({ grant: mediaGrant(envelope.payload.url), durationUs: envelope.payload.durationUs, signal })))
            case "audio.waveform":
                return withAudioSlot(async (signal) => safeWaveform(await options.audioWaveform({ grant: mediaGrant(envelope.payload.url), buckets: envelope.payload.buckets, signal }), envelope.payload))
            case "audio.cancel":
                return { cancelled: cancelAudioWork() }
            case "export.capabilities":
                return Object.freeze({ version: 1, formats: Object.freeze([...pngFramesCapabilities().formats, h264Capability(h264Available)]) })
            case "export.png.preflight": {
                if (exportController) throw new HostPortError("conflict")
                clearPreparedExport()
                exportSnapshot = createPngFramesSnapshot(envelope.payload.intent)
                return pngFramesPreflight(exportSnapshot)
            }
            case "export.h264.preflight": {
                if (exportController) throw new HostPortError("conflict")
                if (!h264Available) throw new HostPortError("unsupported_capability")
                clearPreparedExport()
                const preparedSnapshot = createH264Snapshot(envelope.payload.intent)
                const preparedAudioStage = options.createH264AudioStage({ snapshot: preparedSnapshot })
                exportSnapshot = preparedSnapshot
                exportAudioStage = preparedAudioStage
                return h264Preflight(exportSnapshot)
            }
            case "export.h264.audio.append":
                if (!exportSnapshot || exportSnapshot.format !== "mp4-h264-aac" || !exportAudioStage || exportAudioResult || exportController) throw new HostPortError("conflict")
                exportAudioAppendRequests += 1
                if (exportAudioAppendRequests > Math.ceil(exportSnapshot.audioFrameCount / 65_536) + 1) throw new HostPortError("resource_limit")
                return exportAudioStage.append(envelope.payload)
            case "export.h264.audio.finish":
                if (!exportSnapshot || exportSnapshot.format !== "mp4-h264-aac" || !exportAudioStage || exportAudioResult || exportController) throw new HostPortError("conflict")
                exportAudioResult = exportAudioStage.finish(envelope.payload)
                return Object.freeze({
                    snapshotId: exportAudioResult.snapshotId,
                    sampleRate: exportAudioResult.sampleRate,
                    channels: exportAudioResult.channels,
                    sampleFrames: exportAudioResult.sampleFrames,
                    bytes: exportAudioResult.bytes,
                    sha256: exportAudioResult.sha256,
                })
            case "export.destination.choose": {
                if (!exportSnapshot || exportController) throw new HostPortError("conflict")
                const choiceSnapshot = exportSnapshot
                const choice = await options.chooseExportDestination({ suggestedName: envelope.payload.suggestedName })
                if (exportSnapshot !== choiceSnapshot || exportController) throw new HostPortError("conflict")
                if (!choice) return { cancelled: true }
                if (exportDestinationToken) registry.revoke(exportDestinationToken)
                const destination = grantDestination(choice)
                exportDestinationToken = destination.grant
                return { cancelled: false, destinationGrant: destination.grant }
            }
            case "export.h264.destination.choose": {
                if (!exportSnapshot || exportSnapshot.format !== "mp4-h264-aac" || !exportAudioResult || exportController) throw new HostPortError("conflict")
                const choiceSnapshot = exportSnapshot
                const choice = await options.chooseH264Destination({ suggestedName: envelope.payload.suggestedName })
                if (exportSnapshot !== choiceSnapshot || exportController) throw new HostPortError("conflict")
                if (!choice) return { cancelled: true }
                if (exportDestinationToken) registry.revoke(exportDestinationToken)
                const destination = grantDestination(choice, H264_MIME)
                exportDestinationToken = destination.grant
                return { cancelled: false, destinationGrant: destination.grant }
            }
            case "export.png.start": {
                if (exportController || !exportSnapshot || exportSnapshot.snapshotId !== envelope.payload.snapshotId || exportDestinationToken !== envelope.payload.destinationGrant) throw new HostPortError("conflict")
                const destination = registry.resolve({ grant: envelope.payload.destinationGrant, scope: "destination", owner, generation })
                const snapshot = exportSnapshot
                exportSnapshot = null
                const controller = new AbortController()
                const exportMediaTokens = []
                exportController = controller
                try {
                    const result = await options.runPngFramesExport({
                        snapshot,
                        destination: destination.filePath,
                        destinationAuthority: {
                            parentDevice: destination.parentDevice,
                            parentInode: destination.parentInode,
                            targetKind: destination.targetKind,
                            targetExists: destination.targetExists,
                            targetDevice: destination.targetDevice,
                            targetInode: destination.targetInode,
                            targetBytes: destination.targetBytes,
                            targetMtimeMs: destination.targetMtimeMs,
                            targetCtimeMs: destination.targetCtimeMs,
                        },
                        signal: controller.signal,
                        mediaPath,
                        openExportMedia,
                        grantExportMedia: (filePath, mime) => {
                            const granted = grantMedia(filePath, mime)
                            exportMediaTokens.push(granted.grant)
                            return granted.mediaURL
                        },
                    })
                    return safePngExportResult(result, snapshot)
                } finally {
                    for (const token of exportMediaTokens) revokeToken(token)
                    registry.revoke(envelope.payload.destinationGrant)
                    exportDestinationToken = null
                    if (exportController === controller) exportController = null
                }
            }
            case "export.h264.start": {
                if (exportController || !exportSnapshot || exportSnapshot.format !== "mp4-h264-aac" || exportSnapshot.snapshotId !== envelope.payload.snapshotId
                    || exportDestinationToken !== envelope.payload.destinationGrant || !exportAudioStage || !exportAudioResult) throw new HostPortError("conflict")
                const destination = registry.resolve({ grant: envelope.payload.destinationGrant, scope: "destination", owner, generation })
                if (destination.mime !== H264_MIME) throw new HostPortError("conflict")
                const snapshot = exportSnapshot
                const audioStage = exportAudioStage
                const audio = exportAudioResult
                exportSnapshot = null
                exportAudioStage = null
                exportAudioResult = null
                const controller = new AbortController()
                const exportMediaTokens = []
                exportController = controller
                try {
                    const result = await options.runH264Export({
                        snapshot,
                        destination: destination.filePath,
                        destinationAuthority: {
                            parentDevice: destination.parentDevice,
                            parentInode: destination.parentInode,
                            targetKind: destination.targetKind,
                            targetExists: destination.targetExists,
                            targetDevice: destination.targetDevice,
                            targetInode: destination.targetInode,
                            targetBytes: destination.targetBytes,
                            targetMtimeMs: destination.targetMtimeMs,
                            targetCtimeMs: destination.targetCtimeMs,
                        },
                        audio,
                        signal: controller.signal,
                        mediaPath,
                        openExportMedia,
                        grantExportMedia: (filePath, mime) => {
                            const granted = grantMedia(filePath, mime)
                            exportMediaTokens.push(granted.grant)
                            return granted.mediaURL
                        },
                    })
                    return safeH264ExportResult(result, snapshot)
                } finally {
                    try { audioStage.dispose() } catch (error) { options.onError?.("export.cleanup", error) }
                    for (const token of exportMediaTokens) revokeToken(token)
                    registry.revoke(envelope.payload.destinationGrant)
                    exportDestinationToken = null
                    if (exportController === controller) exportController = null
                }
            }
            case "export.cancel": {
                cancelAudioWork()
                const active = cancelExportWork()
                const prepared = clearPreparedExport()
                return { cancelled: active || prepared }
            }
            case "project.save":
                return options.saveProject({ config: envelope.payload.config, mediaPath })
            case "project.open.begin": {
                if (exportSnapshot || exportController || exportAudioStage || exportAudioResult) throw new HostPortError("conflict")
                state = "opening"
                const controller = new AbortController()
                const candidateGeneration = nextGeneration
                nextGeneration += 1
                const operation = { controller, generation: candidateGeneration }
                opening = operation
                try {
                    const opened = await options.openProject({
                        signal: controller.signal,
                        generation: candidateGeneration,
                        grantMedia: (filePath, mime) => grantMedia(filePath, mime, candidateGeneration),
                    })
                    if (opening !== operation || controller.signal.aborted) {
                        revokeGeneration(candidateGeneration)
                        safeRemove(opened.resourceRoot)
                        return { cancelled: true }
                    }
                    if (opened.cancelled) {
                        revokeGeneration(candidateGeneration)
                        safeRemove(opened.resourceRoot)
                        state = "ready"
                        opening = null
                        return { cancelled: true }
                    }
                    if (opened.failure) {
                        revokeGeneration(candidateGeneration)
                        safeRemove(opened.resourceRoot)
                        state = "ready"
                        opening = null
                        return { failure: opened.failure }
                    }
                    const operationId = crypto.randomBytes(16).toString("hex")
                    pending = { operationId, generation: candidateGeneration, resourceRoot: opened.resourceRoot ?? null }
                    opening = null
                    return { operationId, candidateGeneration, config: opened.config }
                } catch (error) {
                    revokeGeneration(candidateGeneration)
                    if (opening === operation) {
                        state = "ready"
                        opening = null
                    }
                    if (controller.signal.aborted) return { cancelled: true }
                    throw error
                }
            }
            case "project.open.accept": {
                if (!pending || pending.operationId !== envelope.payload.operationId) throw new HostPortError("conflict")
                const previousGeneration = generation
                const previousRoot = currentResourceRoot
                cancelAudioWork()
                cancelExportWork()
                clearPreparedExport()
                if (previousRoot) removeResourceRoot(previousRoot)
                generation = pending.generation
                currentResourceRoot = pending.resourceRoot
                pending = null
                state = "ready"
                revokeGeneration(previousGeneration)
                return { generation }
            }
            case "project.open.discard":
                if (!pending || pending.operationId !== envelope.payload.operationId) throw new HostPortError("conflict")
                cancelAudioWork()
                cleanupPending()
                state = "ready"
                return { discarded: true }
            case "project.open.cancel":
                cancelAudioWork()
                opening?.controller.abort()
                opening = null
                cleanupPending()
                state = "ready"
                return { cancelled: true }
            default:
                throw new HostPortError("unsupported_capability")
        }
    }

    async function handle(event, value) {
        let requestId = typeof value?.requestId === "string" ? value.requestId : "invalid-request"
        try {
            validateSender(event, { webContentsId })
            const namedControlOperation = typeof value?.operation === "string"
                && ["audio.cancel", "export.cancel", "project.open.cancel"].includes(value.operation)
            const rawControlOperation = namedControlOperation && cheapExactControlEnvelope(value, generation)
            const rawExportOperation = exportSnapshot?.format === "mp4-h264-aac" && (
                (value?.operation === "audio.decode" && cheapExactAudioDecodeEnvelope(value, generation))
                || (value?.operation === "export.h264.audio.append" && cheapExactH264AudioAppendEnvelope(value, generation))
            )
            if (!rawControlOperation) (rawExportOperation ? exportIngressLimiter : ingressLimiter).check(owner)
            let envelope
            try {
                envelope = validateEnvelope(value, { generation, state, maximumBytes: 512 * 1024, operations })
            } catch (error) {
                if (namedControlOperation) controlIngressLimiter.check(owner)
                limiter.check(owner)
                throw error
            }
            const controlOperation = ["audio.cancel", "export.cancel", "project.open.cancel"].includes(envelope.operation)
            const exportOperation = exportSnapshot?.format === "mp4-h264-aac"
                && ["audio.decode", "export.h264.audio.append"].includes(envelope.operation)
            if (controlOperation) {
                controlLimiters[envelope.operation].check(owner)
            } else if (exportOperation) exportLimiter.check(owner)
            else limiter.check(owner)
            requestId = envelope.requestId
            const requestGeneration = generation
            const result = await dispatch(envelope)
            if (envelope.operation.startsWith("audio.") && (state === "closed" || generation !== requestGeneration)) throw new HostPortError("conflict")
            return Object.freeze({ ok: true, requestId, generation, value: result })
        } catch (error) {
            options.onError?.(typeof value?.operation === "string" ? value.operation : "invalid", error)
            const failure = publicFailure(error)
            return Object.freeze({ ...failure, requestId, generation })
        }
    }

    function openMedia(input) {
        const token = tokenFromMediaURL(input.url)
        const generations = pending ? [generation, pending.generation] : [generation]
        let lastError
        for (const candidate of generations) {
            try {
                return registry.openRead({ grant: token, owner, generation: candidate, range: input.range })
            } catch (error) {
                lastError = error
            }
        }
        throw lastError ?? new HostPortError("grant_expired")
    }

    function dispose() {
        cancelAudioWork()
        cancelExportWork()
        clearPreparedExport()
        opening?.controller.abort()
        opening = null
        cleanupPending()
        revokeAll()
        safeRemove(currentResourceRoot)
        currentResourceRoot = null
        state = "closed"
    }

    function abandonPending() {
        cancelAudioWork()
        cancelExportWork()
        clearPreparedExport()
        opening?.controller.abort()
        opening = null
        cleanupPending()
        if (state !== "closed") state = "ready"
    }

    function bootstrap(event) {
        validateSender(event, { webContentsId })
        return Object.freeze({ protocol: 1, generation, state })
    }

    return Object.freeze({ abandonPending, bootstrap, dispose, grantMedia, handle, mediaPath, openMedia, snapshot: () => Object.freeze({ generation, state, pending: Boolean(pending) }) })
}

module.exports = { createLinuxHostController, tokenFromMediaURL, verifyOpenedMediaSource }
