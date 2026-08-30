const crypto = require("node:crypto")
const { isAllowedNavigation } = require("./linux-protocols.cjs")

class LegacyProjectOpenError extends Error {
    constructor(code) {
        super(code)
        this.name = "LegacyProjectOpenError"
        this.code = code
    }
}

function createLegacyProjectOpenController(options) {
    if (!options || !Number.isSafeInteger(options.webContentsId) || typeof options.openProject !== "function"
        || typeof options.removeResourceRoot !== "function") throw new LegacyProjectOpenError("invalid_request")

    const owner = `window-${options.webContentsId}`
    const retiredRoots = new Set()
    let state = "ready"
    let lifecycle = 0
    let opening = null
    let pending = null
    let currentResourceRoot = null

    function assertSender(event) {
        const sender = event?.sender
        const frame = event?.senderFrame
        if (!sender || sender.id !== options.webContentsId || !frame || frame !== sender.mainFrame
            || !isAllowedNavigation(frame.url, { developmentOrigin: options.developmentOrigin })) {
            throw new LegacyProjectOpenError("permission_denied")
        }
        return owner
    }

    function retire(resourceRoot) {
        if (!resourceRoot || retiredRoots.has(resourceRoot)) return
        retiredRoots.add(resourceRoot)
        try { options.removeResourceRoot(resourceRoot) } catch (error) { options.onError?.("project.open.cleanup", error) }
    }

    function cleanupPending() {
        if (!pending) return false
        const candidate = pending
        pending = null
        retire(candidate.resourceRoot)
        return true
    }

    async function begin(event) {
        const requestOwner = assertSender(event)
        if (state !== "ready") throw new LegacyProjectOpenError("import_conflict")
        state = "opening"
        const controller = new AbortController()
        const operation = { controller, lifecycle, owner: requestOwner }
        opening = operation
        let opened
        try {
            opened = await options.openProject({ signal: controller.signal })
        } catch (error) {
            if (opening === operation) {
                opening = null
                state = "ready"
            }
            if (controller.signal.aborted || lifecycle !== operation.lifecycle) return { cancelled: true }
            throw error
        }

        const resourceRoot = opened?.resourceRoot ?? null
        if (opening !== operation || controller.signal.aborted || lifecycle !== operation.lifecycle) {
            retire(resourceRoot)
            return { cancelled: true }
        }
        opening = null
        if (opened?.cancelled) {
            retire(resourceRoot)
            state = "ready"
            return { cancelled: true }
        }
        if (opened?.failure) {
            retire(resourceRoot)
            state = "ready"
            return { failure: opened.failure }
        }
        if (!opened || !opened.config || typeof opened.config !== "object" || Array.isArray(opened.config)) {
            retire(resourceRoot)
            state = "ready"
            throw new LegacyProjectOpenError("internal_error")
        }

        const operationId = crypto.randomBytes(16).toString("hex")
        pending = { operationId, owner: requestOwner, resourceRoot }
        return { operationId, config: opened.config }
    }

    function accept(event, operationId) {
        const requestOwner = assertSender(event)
        if (typeof operationId !== "string" || !/^[a-f0-9]{32}$/.test(operationId)) throw new LegacyProjectOpenError("invalid_request")
        if (state !== "opening" || !pending || pending.owner !== requestOwner || pending.operationId !== operationId) {
            throw new LegacyProjectOpenError("import_conflict")
        }
        const candidate = pending
        const previousRoot = currentResourceRoot
        pending = null
        currentResourceRoot = candidate.resourceRoot
        state = "ready"
        retire(previousRoot)
        return { accepted: true }
    }

    function discard(event, operationId) {
        const requestOwner = assertSender(event)
        if (typeof operationId !== "string" || !/^[a-f0-9]{32}$/.test(operationId)) throw new LegacyProjectOpenError("invalid_request")
        if (state !== "opening" || !pending || pending.owner !== requestOwner || pending.operationId !== operationId) {
            throw new LegacyProjectOpenError("import_conflict")
        }
        cleanupPending()
        state = "ready"
        return { discarded: true }
    }

    function cancel(event) {
        assertSender(event)
        if (state === "closed") throw new LegacyProjectOpenError("host_unavailable")
        const active = Boolean(opening || pending)
        opening?.controller.abort()
        opening = null
        cleanupPending()
        state = "ready"
        return { cancelled: active }
    }

    function abandon() {
        lifecycle += 1
        opening?.controller.abort()
        opening = null
        cleanupPending()
        if (state !== "closed") state = "ready"
    }

    function dispose() {
        abandon()
        retire(currentResourceRoot)
        currentResourceRoot = null
        state = "closed"
    }

    return Object.freeze({
        accept,
        abandon,
        begin,
        cancel,
        discard,
        dispose,
        snapshot: () => Object.freeze({ state, opening: Boolean(opening), pending: Boolean(pending), hasCurrentProject: Boolean(currentResourceRoot) }),
    })
}

module.exports = { LegacyProjectOpenError, createLegacyProjectOpenController }
