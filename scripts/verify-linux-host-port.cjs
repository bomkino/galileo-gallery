const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {
    HostPortError,
    createGrantRegistry,
    createRequestLimiter,
    publicFailure,
    redactedDiagnostic,
    validateEnvelope,
    validateSender,
} = require("../electron/linux-host-port.cjs")

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-g03-host-port-"))
try {
    const mediaPath = path.join(temporary, "private-user-frame.bin")
    fs.writeFileSync(mediaPath, Buffer.from("0123456789abcdef"))
    let now = 1_000
    let random = 0
    const registry = createGrantRegistry({
        clock: () => now,
        randomBytes: () => Buffer.alloc(32, ++random),
        maximumGrants: 2,
        maximumReadBytes: 8,
        lifetimeMs: 100,
    })
    const media = registry.create({ scope: "media", filePath: mediaPath, owner: "window-1", generation: 7, mime: "application/octet-stream" })
    assert.match(media.grant, /^[a-f0-9]{64}$/)
    assert.equal(media.mediaURL.includes(mediaPath), false)
    assert.equal(Buffer.from(media.grant, "hex").length, 32)
    assert.deepEqual(registry.snapshot(), { active: 1, byScope: { media: 1, document: 0, destination: 0 } })

    const full = registry.read({ grant: media.grant, owner: "window-1", generation: 7, range: "bytes=0-7" })
    assert.equal(full.status, 206)
    assert.equal(full.body.toString(), "01234567")
    assert.equal(full.headers["content-range"], "bytes 0-7/16")
    assert.throws(() => registry.read({ grant: media.grant, owner: "window-1", generation: 7, range: null }), (error) => error.code === "invalid_request")
    assert.throws(() => registry.read({ grant: media.grant, owner: "window-1", generation: 7, range: "bytes=0-8" }), (error) => error.code === "resource_limit")
    assert.throws(() => registry.read({ grant: "0".repeat(64), owner: "window-1", generation: 7, range: "bytes=0-1" }), (error) => error.code === "grant_expired")
    assert.throws(() => registry.resolve({ grant: media.grant, scope: "document", owner: "window-1", generation: 7 }), (error) => error.code === "permission_denied")
    assert.throws(() => registry.resolve({ grant: media.grant, scope: "media", owner: "window-2", generation: 7 }), (error) => error.code === "permission_denied")
    assert.throws(() => registry.resolve({ grant: media.grant, scope: "media", owner: "window-1", generation: 8 }), (error) => error.code === "permission_denied")

    const replacement = path.join(temporary, "replacement.bin")
    fs.writeFileSync(replacement, "changed-resource")
    fs.renameSync(replacement, mediaPath)
    assert.throws(() => registry.read({ grant: media.grant, owner: "window-1", generation: 7, range: "bytes=0-1" }), (error) => error.code === "verification_failed")
    registry.revoke(media.grant)
    assert.throws(() => registry.resolve({ grant: media.grant, scope: "media", owner: "window-1", generation: 7 }), (error) => error.code === "grant_expired")

    fs.writeFileSync(mediaPath, "fresh")
    const expiring = registry.create({ scope: "media", filePath: mediaPath, owner: "window-1", generation: 8, mime: "image/png" })
    now += 101
    assert.throws(() => registry.resolve({ grant: expiring.grant, scope: "media", owner: "window-1", generation: 8 }), (error) => error.code === "grant_expired")
    assert.equal(registry.snapshot().active, 0)

    const operations = {
        "project.open": { states: ["ready"], validate: (payload) => payload && Object.keys(payload).length === 0 },
    }
    const envelope = { protocol: 1, requestId: "request-1", operation: "project.open", generation: 9, payload: {} }
    assert.deepEqual(validateEnvelope(envelope, { generation: 9, state: "ready", operations }), envelope)
    assert.throws(() => validateEnvelope({ ...envelope, protocol: 2 }, { generation: 9, state: "ready", operations }), (error) => error.code === "invalid_request")
    assert.throws(() => validateEnvelope({ ...envelope, generation: 8 }, { generation: 9, state: "ready", operations }), (error) => error.code === "conflict")
    assert.throws(() => validateEnvelope({ ...envelope, extra: true }, { generation: 9, state: "ready", operations }), (error) => error.code === "invalid_request")
    assert.throws(() => validateEnvelope({ ...envelope, payload: { text: "x".repeat(200) } }, { generation: 9, state: "ready", maximumBytes: 100, operations }), (error) => error.code === "resource_limit")
    assert.throws(() => validateEnvelope({ ...envelope, payload: [] }, { generation: 9, state: "ready", operations }), (error) => error.code === "invalid_request")
    assert.throws(() => validateEnvelope({ ...envelope, operation: "toString" }, { generation: 9, state: "ready", operations }), (error) => error.code === "invalid_request")
    const nestedEnvelope = { ...envelope, payload: { nested: { value: 1 } } }
    const nestedOperations = { "project.open": { states: ["ready"], validate: () => true } }
    const validatedNested = validateEnvelope(nestedEnvelope, { generation: 9, state: "ready", operations: nestedOperations })
    nestedEnvelope.payload.nested.value = 2
    assert.equal(validatedNested.payload.nested.value, 1)
    assert.equal(Object.isFrozen(validatedNested.payload.nested), true)

    let limiterTime = 0
    const limiter = createRequestLimiter({ clock: () => limiterTime, maximumRequests: 2, windowMs: 50 })
    assert.equal(limiter.check("window-1"), true)
    assert.equal(limiter.check("window-1"), true)
    assert.throws(() => limiter.check("window-1"), (error) => error.code === "resource_limit")
    limiterTime = 51
    assert.equal(limiter.check("window-1"), true)

    const mainFrame = { url: "gallery-app://app/index.html" }
    const sender = { id: 41, mainFrame }
    assert.equal(validateSender({ sender, senderFrame: mainFrame }, { webContentsId: 41 }), true)
    assert.throws(() => validateSender({ sender, senderFrame: { url: mainFrame.url } }, { webContentsId: 41 }), (error) => error.code === "permission_denied")
    assert.throws(() => validateSender({ sender: { id: 42, mainFrame }, senderFrame: mainFrame }, { webContentsId: 41 }), (error) => error.code === "permission_denied")
    assert.throws(() => validateSender({ sender, senderFrame: { url: "https://attacker.example/" } }, { webContentsId: 41 }), (error) => error.code === "permission_denied")

    const diagnostic = redactedDiagnostic({ grant: "a".repeat(64), file: mediaPath })
    assert.equal(diagnostic.includes("a".repeat(64)), false)
    assert.equal(diagnostic.includes(mediaPath), false)
    const publicError = publicFailure(new HostPortError("permission_denied", "diagnostic-1"))
    assert.deepEqual(publicError, { ok: false, error: { code: "permission_denied", diagnosticId: "diagnostic-1" } })
    assert.equal(JSON.stringify(publicError).includes(mediaPath), false)
    const circular = { filePath: "/home/alice/My Secret/frame.png", count: 2n }
    circular.self = circular
    const hostileDiagnostic = redactedDiagnostic(circular)
    assert.equal(hostileDiagnostic.includes("alice"), false)
    assert.equal(hostileDiagnostic.includes("My Secret"), false)
    assert.equal(hostileDiagnostic.includes("[circular]"), true)
    const hostilePublic = publicFailure(new HostPortError(mediaPath, mediaPath))
    assert.equal(hostilePublic.error.code, "internal_error")
    assert.equal(JSON.stringify(hostilePublic).includes(mediaPath), false)

    console.log("Verified: G03 opaque scoped grants, bounded verified reads, expiry/revocation/generation, strict envelopes and sender/origin checks, and path/token redaction.")
} finally {
    fs.rmSync(temporary, { recursive: true, force: true })
}
