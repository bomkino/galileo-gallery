const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const HOST_PROTOCOL_VERSION = 1
const GRANT_SCOPES = new Set(["media", "document", "destination"])
const ERROR_CODES = new Set(["cancelled", "permission_denied", "grant_expired", "invalid_request", "unsupported_capability", "resource_limit", "not_found", "conflict", "corrupt_input", "verification_failed", "host_unavailable", "internal_error"])
const REQUEST_ID = /^[a-z0-9][a-z0-9-]{0,119}$/
const OPERATION = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){0,7}$/
const TOKEN = /^[a-f0-9]{64}$/
const DIAGNOSTIC_ID = /^[a-z0-9-]{1,120}$/

class HostPortError extends Error {
    constructor(code, diagnosticId = crypto.randomBytes(8).toString("hex")) {
        super(code)
        this.name = "HostPortError"
        this.code = code
        this.diagnosticId = diagnosticId
    }
}

function fail(code) {
    throw new HostPortError(code)
}

function publicFailure(error) {
    const code = error instanceof HostPortError && ERROR_CODES.has(error.code) ? error.code : "internal_error"
    const diagnosticId = error instanceof HostPortError && typeof error.diagnosticId === "string" && DIAGNOSTIC_ID.test(error.diagnosticId)
        ? error.diagnosticId
        : crypto.randomBytes(8).toString("hex")
    return { ok: false, error: { code, diagnosticId } }
}

function ownExact(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const actual = Object.keys(value).sort()
    const expected = [...keys].sort()
    return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function safeInteger(value, minimum, maximum) {
    return Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

function createGrantRegistry(options = {}) {
    const clock = options.clock ?? Date.now
    const randomBytes = options.randomBytes ?? crypto.randomBytes
    const maximumGrants = options.maximumGrants ?? 512
    const maximumResourceBytes = options.maximumResourceBytes ?? 16 * 1024 * 1024 * 1024
    const maximumReadBytes = options.maximumReadBytes ?? 8 * 1024 * 1024
    const lifetimeMs = options.lifetimeMs ?? 12 * 60 * 60 * 1000
    const grants = new Map()

    function pruneExpired() {
        const current = clock()
        for (const [token, grant] of grants) if (grant.expiresAt <= current) grants.delete(token)
    }

    function create(input) {
        if (!ownExact(input, ["scope", "filePath", "owner", "generation", "mime"])) fail("invalid_request")
        if (!GRANT_SCOPES.has(input.scope) || typeof input.filePath !== "string" || !path.isAbsolute(input.filePath)) fail("invalid_request")
        if (typeof input.owner !== "string" || !REQUEST_ID.test(input.owner) || !safeInteger(input.generation, 1, Number.MAX_SAFE_INTEGER)) fail("invalid_request")
        if (typeof input.mime !== "string" || input.mime.length < 1 || input.mime.length > 120 || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(input.mime)) fail("invalid_request")
        pruneExpired()
        if (grants.size >= maximumGrants) fail("resource_limit")
        const stats = fs.statSync(input.filePath)
        if (!stats.isFile()) fail("invalid_request")
        if (stats.size < 1) fail("invalid_request")
        if (stats.size > maximumResourceBytes) fail("resource_limit")
        let token
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const candidate = randomBytes(32).toString("hex")
            if (TOKEN.test(candidate) && !grants.has(candidate)) {
                token = candidate
                break
            }
        }
        if (!token) fail("internal_error")
        grants.set(token, Object.freeze({
            token,
            scope: input.scope,
            filePath: path.resolve(input.filePath),
            owner: input.owner,
            generation: input.generation,
            mime: input.mime,
            bytes: stats.size,
            device: stats.dev,
            inode: stats.ino,
            mtimeMs: stats.mtimeMs,
            expiresAt: clock() + lifetimeMs,
        }))
        return Object.freeze({
            grant: token,
            scope: input.scope,
            mediaURL: input.scope === "media" ? `reel-media://grant/${token}` : undefined,
            bytes: stats.size,
            mime: input.mime,
        })
    }

    function resolve(input) {
        if (!ownExact(input, ["grant", "scope", "owner", "generation"]) || typeof input.grant !== "string" || !TOKEN.test(input.grant)) fail("grant_expired")
        const grant = grants.get(input.grant)
        if (!grant || grant.expiresAt <= clock()) {
            grants.delete(input.grant)
            fail("grant_expired")
        }
        if (grant.scope !== input.scope || grant.owner !== input.owner || grant.generation !== input.generation) fail("permission_denied")
        return grant
    }

    function revoke(token) {
        if (typeof token === "string") grants.delete(token)
    }

    function revokeOwner(owner, generation) {
        for (const [token, grant] of grants) {
            if (grant.owner === owner && (generation === undefined || grant.generation === generation)) grants.delete(token)
        }
    }

    function parseRange(header, bytes) {
        if (header === undefined) return { start: 0, end: bytes - 1, partial: false }
        if (typeof header !== "string" || header.length > 120) fail("invalid_request")
        const match = /^bytes=(\d*)-(\d*)$/.exec(header)
        if (!match) fail("invalid_request")
        if (!match[1] && !match[2]) fail("invalid_request")
        if (!match[1]) {
            const suffix = Number(match[2])
            if (!safeInteger(suffix, 1, Math.min(bytes, maximumReadBytes))) fail("resource_limit")
            return { start: bytes - suffix, end: bytes - 1, partial: true }
        }
        const start = Number(match[1])
        const requestedEnd = match[2] ? Number(match[2]) : Math.min(bytes - 1, start + maximumReadBytes - 1)
        if (!safeInteger(start, 0, bytes - 1) || !safeInteger(requestedEnd, start, bytes - 1)) fail("invalid_request")
        if (requestedEnd - start + 1 > maximumReadBytes) fail("resource_limit")
        return { start, end: requestedEnd, partial: true }
    }

    function read(input) {
        if (!ownExact(input, ["grant", "owner", "generation", "range"])) fail("invalid_request")
        const grant = resolve({ grant: input.grant, scope: "media", owner: input.owner, generation: input.generation })
        const handle = fs.openSync(grant.filePath, "r")
        try {
            const stats = fs.fstatSync(handle)
            if (!stats.isFile() || stats.dev !== grant.device || stats.ino !== grant.inode || stats.size !== grant.bytes || stats.mtimeMs !== grant.mtimeMs) fail("verification_failed")
            const range = parseRange(input.range, stats.size)
            const length = range.end - range.start + 1
            if (length > maximumReadBytes) fail("resource_limit")
            const body = Buffer.allocUnsafe(length)
            const readBytes = fs.readSync(handle, body, 0, length, range.start)
            if (readBytes !== length) fail("verification_failed")
            const after = fs.fstatSync(handle)
            if (after.size !== grant.bytes || after.mtimeMs !== grant.mtimeMs) fail("verification_failed")
            return {
                status: range.partial ? 206 : 200,
                body,
                headers: Object.freeze({
                    "content-type": grant.mime,
                    "content-length": String(length),
                    "accept-ranges": "bytes",
                    ...(range.partial ? { "content-range": `bytes ${range.start}-${range.end}/${stats.size}` } : {}),
                }),
            }
        } finally {
            fs.closeSync(handle)
        }
    }

    function openRead(input) {
        if (!ownExact(input, ["grant", "owner", "generation", "range"])) fail("invalid_request")
        const grant = resolve({ grant: input.grant, scope: "media", owner: input.owner, generation: input.generation })
        const handle = fs.openSync(grant.filePath, "r")
        try {
            const stats = fs.fstatSync(handle)
            if (!stats.isFile() || stats.dev !== grant.device || stats.ino !== grant.inode || stats.size !== grant.bytes || stats.mtimeMs !== grant.mtimeMs) fail("verification_failed")
            const range = parseRange(input.range, stats.size)
            const length = range.end - range.start + 1
            const stream = fs.createReadStream(grant.filePath, { fd: handle, autoClose: true, start: range.start, end: range.end })
            return {
                status: range.partial ? 206 : 200,
                stream,
                headers: Object.freeze({
                    "content-type": grant.mime,
                    "content-length": String(length),
                    "accept-ranges": "bytes",
                    "cache-control": "no-store",
                    ...(range.partial ? { "content-range": `bytes ${range.start}-${range.end}/${stats.size}` } : {}),
                }),
            }
        } catch (error) {
            fs.closeSync(handle)
            throw error
        }
    }

    function snapshot() {
        pruneExpired()
        const byScope = { media: 0, document: 0, destination: 0 }
        for (const grant of grants.values()) byScope[grant.scope] += 1
        return Object.freeze({ active: grants.size, byScope: Object.freeze(byScope) })
    }

    return Object.freeze({ create, openRead, read, resolve, revoke, revokeOwner, snapshot })
}

function createRequestLimiter(options = {}) {
    const clock = options.clock ?? Date.now
    const maximumKeys = options.maximumKeys ?? 512
    const maximumRequests = options.maximumRequests ?? 120
    const windowMs = options.windowMs ?? 1_000
    const entries = new Map()
    return Object.freeze({
        check(key) {
            if (typeof key !== "string" || !REQUEST_ID.test(key)) fail("invalid_request")
            const current = clock()
            for (const [candidate, entry] of entries) if (entry.startedAt + windowMs <= current) entries.delete(candidate)
            let entry = entries.get(key)
            if (!entry) {
                if (entries.size >= maximumKeys) fail("resource_limit")
                entry = { startedAt: current, count: 0 }
                entries.set(key, entry)
            }
            entry.count += 1
            if (entry.count > maximumRequests) fail("resource_limit")
            return true
        },
    })
}

function validateEnvelope(value, contract) {
    const maximumBytes = contract.maximumBytes ?? 64 * 1024
    let encoded
    try {
        encoded = Buffer.from(JSON.stringify(value))
    } catch {
        fail("invalid_request")
    }
    if (encoded.length > maximumBytes) fail("resource_limit")
    if (!ownExact(value, ["protocol", "requestId", "operation", "generation", "payload"]) || !value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) fail("invalid_request")
    if (value.protocol !== HOST_PROTOCOL_VERSION || typeof value.requestId !== "string" || !REQUEST_ID.test(value.requestId)) fail("invalid_request")
    if (!safeInteger(value.generation, 1, Number.MAX_SAFE_INTEGER) || value.generation !== contract.generation) fail("conflict")
    if (typeof value.operation !== "string" || !OPERATION.test(value.operation) || !Object.hasOwn(contract.operations, value.operation)) fail("invalid_request")
    const operation = contract.operations[value.operation]
    if (!operation || !operation.states.includes(contract.state)) fail("conflict")
    if (!operation.validate(value.payload)) fail("invalid_request")
    const clone = JSON.parse(encoded.toString("utf8"))
    return deepFreeze(clone)
}

function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value
    for (const child of Object.values(value)) deepFreeze(child)
    return Object.freeze(value)
}

function validateSender(event, contract) {
    if (!event || event.sender?.id !== contract.webContentsId || event.senderFrame !== event.sender?.mainFrame) fail("permission_denied")
    let url
    try {
        url = new URL(event.senderFrame.url)
    } catch {
        fail("permission_denied")
    }
    if (url.protocol !== "gallery-app:" || url.hostname !== "app" || url.username || url.password || url.port) fail("permission_denied")
    return true
}

function redactedDiagnostic(value) {
    const seen = new WeakSet()
    let text
    try {
        text = typeof value === "string" ? value : JSON.stringify(value, (key, candidate) => {
            if (/grant|token|path|file|source|destination/i.test(key)) return "[redacted]"
            if (typeof candidate === "bigint") return "[bigint]"
            if (candidate && typeof candidate === "object") {
                if (seen.has(candidate)) return "[circular]"
                seen.add(candidate)
            }
            return candidate
        })
    } catch {
        text = "[unavailable diagnostic]"
    }
    return text
        .replace(/[a-f0-9]{64}/gi, "[grant]")
        .replace(/(?:[A-Za-z]:(?:\\\\|\\)+|\/)[^"'\r\n}]*/g, "[path]")
        .slice(0, 2048)
}

module.exports = {
    HOST_PROTOCOL_VERSION,
    HostPortError,
    createGrantRegistry,
    createRequestLimiter,
    publicFailure,
    redactedDiagnostic,
    validateEnvelope,
    validateSender,
}
