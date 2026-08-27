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

const GRANT_URL = /^reel-media:\/\/grant\/([a-f0-9]{64})$/
const MAX_PREPARED_VIDEO_AUDIO_FRAMES = 256 * 1024 * 1024 / 4

function ownExact(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const actual = Object.keys(value).sort()
    const expected = [...keys].sort()
    return actual.length === expected.length && actual.every((key, index) => key === expected[index])
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
    const removeResourceRoot = options.removeResourceRoot ?? ((resourceRoot) => fs.rmSync(resourceRoot, { recursive: true, force: true }))
    let generation = options.generation ?? 1
    let state = "ready"
    let currentResourceRoot = null
    let pending = null
    let opening = null
    let nextGeneration = generation + 1
    let activeAudioRequests = 0
    const audioControllers = new Set()

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
        "project.save": { states: ["ready"], validate: (payload) => ownExact(payload, ["config"]) && validConfig(payload.config) },
        "project.open.begin": { states: ["ready"], validate: (payload) => ownExact(payload, []) },
        "project.open.accept": { states: ["opening"], validate: (payload) => ownExact(payload, ["operationId"]) && validOperationId(payload.operationId) },
        "project.open.discard": { states: ["opening"], validate: (payload) => ownExact(payload, ["operationId"]) && validOperationId(payload.operationId) },
        "project.open.cancel": { states: ["opening"], validate: (payload) => ownExact(payload, []) },
    })

    function grantMedia(filePath, mime, targetGeneration = generation) {
        return registry.create({ scope: "media", filePath, owner, generation: targetGeneration, mime })
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
                return withAudioSlot(async (signal) => safeAudioDecode(await options.decodeAudio({ grant: mediaGrant(envelope.payload.url), startFrame: envelope.payload.startFrame, frameCount: envelope.payload.frameCount, signal }), envelope.payload))
            case "audio.video.prepare":
                return withAudioSlot(async (signal) => safePreparedVideoAudio(await options.prepareVideoAudio({ grant: mediaGrant(envelope.payload.url), durationUs: envelope.payload.durationUs, signal })))
            case "audio.waveform":
                return withAudioSlot(async (signal) => safeWaveform(await options.audioWaveform({ grant: mediaGrant(envelope.payload.url), buckets: envelope.payload.buckets, signal }), envelope.payload))
            case "audio.cancel":
                return { cancelled: cancelAudioWork() }
            case "project.save":
                return options.saveProject({ config: envelope.payload.config, mediaPath })
            case "project.open.begin": {
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
            limiter.check(owner)
            const envelope = validateEnvelope(value, { generation, state, maximumBytes: 512 * 1024, operations })
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

module.exports = { createLinuxHostController, tokenFromMediaURL }
