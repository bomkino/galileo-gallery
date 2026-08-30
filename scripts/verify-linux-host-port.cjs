const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { once } = require("node:events")
const {
    HostPortError,
    createGrantRegistry,
    createRequestLimiter,
    publicFailure,
    redactedDiagnostic,
    validateEnvelope,
    validateSender,
} = require("../electron/linux-host-port.cjs")

async function run() {
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
    assert.deepEqual(registry.snapshot(), { active: 1, openStreams: 0, byScope: { media: 1, document: 0, destination: 0 } })

    const full = registry.read({ grant: media.grant, owner: "window-1", generation: 7, range: "bytes=0-7" })
    assert.equal(full.status, 206)
    assert.equal(full.body.toString(), "01234567")
    assert.equal(full.headers["content-range"], "bytes 0-7/16")
    const suffix = registry.read({ grant: media.grant, owner: "window-1", generation: 7, range: "bytes=-4" })
    assert.equal(suffix.body.toString(), "cdef")
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

    const restoredMtimePath = path.join(temporary, "same-size-restored-mtime.bin")
    fs.writeFileSync(restoredMtimePath, Buffer.alloc(128, 3))
    const restoredMtimeSeconds = 1_700_000_000
    fs.utimesSync(restoredMtimePath, restoredMtimeSeconds, restoredMtimeSeconds)
    const restoredMtimeIdentity = fs.statSync(restoredMtimePath)
    const restoredMtimeRegistry = createGrantRegistry()
    const restoredMtimeGrant = restoredMtimeRegistry.create({ scope: "media", filePath: restoredMtimePath, owner: "window-restored", generation: 1, mime: "application/octet-stream" })
    await new Promise((resolve) => setTimeout(resolve, 5))
    fs.writeFileSync(restoredMtimePath, Buffer.alloc(128, 4))
    fs.utimesSync(restoredMtimePath, restoredMtimeSeconds, restoredMtimeSeconds)
    const restoredMtimeAfter = fs.statSync(restoredMtimePath)
    assert.equal(restoredMtimeAfter.mtimeMs, restoredMtimeIdentity.mtimeMs)
    assert.notEqual(restoredMtimeAfter.ctimeMs, restoredMtimeIdentity.ctimeMs)
    assert.throws(
        () => restoredMtimeRegistry.read({ grant: restoredMtimeGrant.grant, owner: "window-restored", generation: 1, range: "bytes=0-7" }),
        (error) => error.code === "verification_failed",
        "same-size mutation with restored mtime must fail ctime-bound grant verification",
    )

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

    const zeroPath = path.join(temporary, "zero.png")
    fs.writeFileSync(zeroPath, "")
    assert.throws(() => registry.create({ scope: "media", filePath: zeroPath, owner: "window-1", generation: 9, mime: "image/png" }), (error) => error.code === "invalid_request")
    const largePath = path.join(temporary, "large.png")
    fs.writeFileSync(largePath, Buffer.alloc(9 * 1024 * 1024, 7))
    const streamingRegistry = createGrantRegistry({ maximumReadBytes: 8 * 1024 * 1024, maximumOpenStreams: 1 })
    const large = streamingRegistry.create({ scope: "media", filePath: largePath, owner: "window-large", generation: 1, mime: "image/png" })
    const largeStream = streamingRegistry.openRead({ grant: large.grant, owner: "window-large", generation: 1, range: undefined })
    assert.equal(largeStream.status, 200)
    assert.equal(largeStream.headers["content-length"], String(9 * 1024 * 1024))
    assert.throws(() => streamingRegistry.openRead({ grant: large.grant, owner: "window-large", generation: 1, range: undefined }), (error) => error.code === "resource_limit")
    const largeClosed = once(largeStream.stream, "close")
    largeStream.stream.destroy()
    await largeClosed
    assert.equal(streamingRegistry.snapshot().openStreams, 0)

    const midReadPath = path.join(temporary, "mid-read-mutation.bin")
    fs.writeFileSync(midReadPath, Buffer.alloc(2 * 1024 * 1024, 5))
    const midReadMtimeSeconds = 1_700_000_100
    fs.utimesSync(midReadPath, midReadMtimeSeconds, midReadMtimeSeconds)
    const midReadIdentity = fs.statSync(midReadPath)
    await new Promise((resolve) => setTimeout(resolve, 5))
    let mutateAfterFirstRead = true
    const midReadRegistry = createGrantRegistry({
        readSync: (...args) => {
            const bytesRead = fs.readSync(...args)
            if (mutateAfterFirstRead) {
                mutateAfterFirstRead = false
                const mutationHandle = fs.openSync(midReadPath, "r+")
                try { fs.writeSync(mutationHandle, Buffer.alloc(4_096, 6), 0, 4_096, 1024 * 1024 + 4_096) } finally { fs.closeSync(mutationHandle) }
                fs.utimesSync(midReadPath, midReadMtimeSeconds, midReadMtimeSeconds)
            }
            return bytesRead
        },
    })
    const midReadGrant = midReadRegistry.create({ scope: "media", filePath: midReadPath, owner: "window-mid-read", generation: 1, mime: "video/mp4" })
    assert.throws(
        () => midReadRegistry.openRead({ grant: midReadGrant.grant, owner: "window-mid-read", generation: 1, range: undefined }),
        (error) => error.code === "verification_failed",
        "mid-read same-inode mutation must fail before any response stream is returned",
    )
    const midReadAfter = fs.statSync(midReadPath)
    assert.equal(midReadAfter.mtimeMs, midReadIdentity.mtimeMs)
    assert.notEqual(midReadAfter.ctimeMs, midReadIdentity.ctimeMs)
    assert.equal(midReadRegistry.snapshot().openStreams, 0)

    const destinationParent = path.join(temporary, "exports")
    fs.mkdirSync(destinationParent)
    const destinationRegistry = createGrantRegistry({ randomBytes: () => Buffer.alloc(32, 11) })
    const destination = destinationRegistry.createDestination({
        scope: "destination",
        filePath: path.join(destinationParent, "Gallery PNG Frames"),
        owner: "window-export",
        generation: 1,
        mime: "application/vnd.galileo.png-frames-directory",
    })
    assert.equal(destination.mediaURL, undefined)
    assert.equal(JSON.stringify(destination).includes(destinationParent), false)
    assert.equal(destinationRegistry.resolve({ grant: destination.grant, scope: "destination", owner: "window-export", generation: 1 }).filePath, path.join(destinationParent, "Gallery PNG Frames"))
    fs.renameSync(destinationParent, `${destinationParent}-moved`)
    fs.mkdirSync(destinationParent)
    assert.throws(() => destinationRegistry.resolve({ grant: destination.grant, scope: "destination", owner: "window-export", generation: 1 }), (error) => error.code === "verification_failed")

    const targetParent = path.join(temporary, "target-authority")
    fs.mkdirSync(targetParent)
    const targetRegistry = createGrantRegistry()
    const absentTarget = path.join(targetParent, "absent.mp4")
    const absentGrant = targetRegistry.createDestination({ scope: "destination", filePath: absentTarget, owner: "window-target", generation: 1, mime: "video/mp4" })
    fs.writeFileSync(absentTarget, "arrived later")
    assert.throws(() => targetRegistry.resolve({ grant: absentGrant.grant, scope: "destination", owner: "window-target", generation: 1 }), (error) => error.code === "conflict")
    targetRegistry.revoke(absentGrant.grant)
    const existingTarget = path.join(targetParent, "existing.mp4")
    fs.writeFileSync(existingTarget, "authorized")
    assert.throws(
        () => targetRegistry.createDestination({ scope: "destination", filePath: existingTarget, owner: "window-target", generation: 1, mime: "video/mp4" }),
        (error) => error.code === "conflict",
    )
    assert.equal(fs.readFileSync(existingTarget, "utf8"), "authorized", "verified MP4 grants must refuse overwrite before allocating authority")

    console.log("Verified: G03/G06 opaque scoped media and destination grants, bounded verified reads, parent/target identity, expiry/revocation/generation, strict envelopes and sender/origin checks, and path/token redaction.")
} finally {
    fs.rmSync(temporary, { recursive: true, force: true })
}
}

run().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
