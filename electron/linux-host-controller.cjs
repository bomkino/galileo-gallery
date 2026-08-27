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

    const operations = Object.freeze({
        "identity.read": { states: ["ready", "opening"], validate: (payload) => ownExact(payload, []) },
        "media.choose": { states: ["ready"], validate: (payload) => ownExact(payload, []) },
        "media.release": {
            states: ["ready"],
            validate: (payload) => ownExact(payload, ["urls"]) && Array.isArray(payload.urls) && payload.urls.length <= 512 && payload.urls.every((url) => typeof url === "string" && GRANT_URL.test(url)),
        },
        "project.save": { states: ["ready"], validate: (payload) => ownExact(payload, ["config"]) && validConfig(payload.config) },
        "project.open.begin": { states: ["ready"], validate: (payload) => ownExact(payload, []) },
        "project.open.accept": { states: ["opening"], validate: (payload) => ownExact(payload, ["operationId"]) && validOperationId(payload.operationId) },
        "project.open.discard": { states: ["opening"], validate: (payload) => ownExact(payload, ["operationId"]) && validOperationId(payload.operationId) },
        "project.open.cancel": { states: ["opening"], validate: (payload) => ownExact(payload, []) },
    })

    function grantMedia(filePath, mime, targetGeneration = generation) {
        return registry.create({ scope: "media", filePath, owner, generation: targetGeneration, mime })
    }

    function mediaPath(mediaURL) {
        const grant = registry.resolve({ grant: tokenFromMediaURL(mediaURL), scope: "media", owner, generation })
        return grant.filePath
    }

    function safeRemove(resourceRoot) {
        if (!resourceRoot) return
        try {
            removeResourceRoot(resourceRoot)
        } catch {
            // Authority has already moved; cleanup residue remains app-owned and is never exposed to the renderer.
        }
    }

    function cleanupPending() {
        if (!pending) return
        const abandoned = pending
        pending = null
        registry.revokeOwner(owner, abandoned.generation)
        safeRemove(abandoned.resourceRoot)
    }

    async function dispatch(envelope) {
        switch (envelope.operation) {
            case "identity.read":
                return options.identity()
            case "media.choose":
                return options.chooseMedia({ generation, grantMedia })
            case "media.release": {
                for (const url of envelope.payload.urls) registry.revoke(tokenFromMediaURL(url))
                return { released: envelope.payload.urls.length }
            }
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
                        registry.revokeOwner(owner, candidateGeneration)
                        safeRemove(opened.resourceRoot)
                        return { cancelled: true }
                    }
                    if (opened.cancelled) {
                        registry.revokeOwner(owner, candidateGeneration)
                        safeRemove(opened.resourceRoot)
                        state = "ready"
                        opening = null
                        return { cancelled: true }
                    }
                    if (opened.failure) {
                        registry.revokeOwner(owner, candidateGeneration)
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
                    registry.revokeOwner(owner, candidateGeneration)
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
                if (previousRoot) removeResourceRoot(previousRoot)
                generation = pending.generation
                currentResourceRoot = pending.resourceRoot
                pending = null
                state = "ready"
                registry.revokeOwner(owner, previousGeneration)
                return { generation }
            }
            case "project.open.discard":
                if (!pending || pending.operationId !== envelope.payload.operationId) throw new HostPortError("conflict")
                cleanupPending()
                state = "ready"
                return { discarded: true }
            case "project.open.cancel":
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
            const result = await dispatch(envelope)
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
        opening?.controller.abort()
        opening = null
        cleanupPending()
        registry.revokeOwner(owner)
        safeRemove(currentResourceRoot)
        currentResourceRoot = null
        state = "closed"
    }

    function abandonPending() {
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
