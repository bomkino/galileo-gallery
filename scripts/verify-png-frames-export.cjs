const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const zlib = require("node:zlib")
const { createPngFramesSnapshot, pngFramesCapabilities, pngFramesPreflight } = require("../electron/png-export-contract.cjs")
const { createPngFramesRuntime, inspectPng } = require("../electron/png-frames-runtime.cjs")

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    return value >>> 0
})

function crc32(buffer) {
    let crc = 0xffffffff
    for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, payload) {
    const name = Buffer.from(type, "ascii")
    const result = Buffer.alloc(12 + payload.length)
    result.writeUInt32BE(payload.length, 0)
    name.copy(result, 4)
    payload.copy(result, 8)
    result.writeUInt32BE(crc32(Buffer.concat([name, payload])), 8 + payload.length)
    return result
}

function png(width, height, alpha, seed) {
    const channels = alpha ? 4 : 3
    const header = Buffer.alloc(13)
    header.writeUInt32BE(width, 0)
    header.writeUInt32BE(height, 4)
    header[8] = 8
    header[9] = alpha ? 6 : 2
    const rows = Buffer.alloc(height * (1 + width * channels))
    for (let y = 0; y < height; y += 1) {
        const start = y * (1 + width * channels)
        rows[start] = 0
        for (let x = 0; x < width; x += 1) {
            const pixel = start + 1 + x * channels
            rows[pixel] = (seed + x * 11) % 256
            rows[pixel + 1] = (seed + y * 17) % 256
            rows[pixel + 2] = (seed + x + y) % 256
            if (alpha) rows[pixel + 3] = (x + y) % 3 === 0 ? 0 : 255
        }
    }
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", header),
        chunk("IDAT", zlib.deflateSync(rows)),
        chunk("IEND", Buffer.alloc(0)),
    ])
}

const mediaURL = `reel-media://grant/${"a".repeat(64)}`
const intent = {
    config: {
        schemaVersion: 2,
        styleId: "quiet-carousel",
        items: [{ id: "frame-1", name: "Frame", type: "image", url: mediaURL, ratio: 16 / 9, spotlight: false, muted: false }],
        settings: { backgroundStyle: "transparent" },
    },
    width: 64,
    height: 64,
    fps: 10,
    durationMs: 150,
    cycleDurationMs: 100,
    finalCycleDurationMs: 50,
    transparent: true,
}

async function run() {
    const snapshot = createPngFramesSnapshot(intent, () => Buffer.alloc(16, 7))
    assert.equal(snapshot.frameCount, 2, "frame plan must use round(duration * fps)")
    assert.equal(snapshot.cycleDurationMs, 100)
    assert.equal(snapshot.finalCycleDurationMs, 50)
    assert.equal(Object.isFrozen(snapshot.config.items[0]), true)
    intent.config.items[0].id = "mutated-after-preflight"
    assert.equal(snapshot.config.items[0].id, "frame-1", "preflight must retain an immutable clone")
    assert.deepEqual(pngFramesPreflight(snapshot), {
        snapshotId: "07".repeat(16), format: "png-frames", width: 64, height: 64, fps: 10, durationMs: 150,
        frameCount: 2, alpha: true, audio: "none",
        consequence: pngFramesCapabilities().formats[0].consequence,
    })
    assert.equal(pngFramesCapabilities().formats[0].audio, false)
    assert.throws(() => createPngFramesSnapshot({ ...intent, transparent: false }), (error) => error.code === "invalid_request", "alpha intent must match the Project background")
    assert.throws(() => createPngFramesSnapshot({
        ...intent,
        config: { ...snapshot.config, items: [{ ...snapshot.config.items[0], type: "video" }] },
        durationMs: 12_900,
    }), (error) => error.code === "resource_limit", "source-video preflight must respect the bounded decoded-frame grant budget")

    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-g06-png-"))
    try {
        const destination = path.join(temporary, "Gallery PNG Frames")
        fs.mkdirSync(destination)
        fs.writeFileSync(path.join(destination, "prior.txt"), "prior-destination")
        let nonce = 10
        const runtime = createPngFramesRuntime({
            randomBytes: () => Buffer.alloc(16, nonce++),
            freeSpaceReserveBytes: 0,
            maximumTotalBytes: 8 * 1024 * 1024,
        })
        const progress = []
        const result = await runtime.run({
            snapshot,
            destination,
            renderFrame: async ({ frameIndex }) => png(64, 64, true, frameIndex + 1),
            onProgress: (value) => progress.push(value),
        })
        assert.deepEqual({ ...result, manifestSha256: "hash" }, {
            format: "png-frames", frameCount: 2, width: 64, height: 64, alpha: true, audio: "none", manifestSha256: "hash",
        })
        assert.equal(fs.existsSync(path.join(destination, "prior.txt")), false)
        assert.deepEqual(fs.readdirSync(destination).sort(), ["frame-000001.png", "frame-000002.png", "manifest.json"])
        const manifestBytes = fs.readFileSync(path.join(destination, "manifest.json"))
        assert.equal(result.manifestSha256, crypto.createHash("sha256").update(manifestBytes).digest("hex"))
        const manifest = JSON.parse(manifestBytes)
        assert.equal(manifest.audio, "none")
        assert.match(manifest.consequence, /no audio/)
        assert.equal(manifest.frames.length, 2)
        assert.equal(inspectPng(fs.readFileSync(path.join(destination, "frame-000001.png")), snapshot).colourType, 6)
        assert.equal(progress.at(-1).phase, "done")

        const priorManifest = fs.readFileSync(path.join(destination, "manifest.json"))
        const corrupt = png(64, 64, true, 9)
        corrupt[corrupt.length - 5] ^= 1
        await assert.rejects(runtime.run({ snapshot, destination, renderFrame: async () => corrupt }), (error) => error.code === "verification_failed")
        assert.deepEqual(fs.readFileSync(path.join(destination, "manifest.json")), priorManifest, "verification failure must preserve prior destination")

        const early = path.join(temporary, "early")
        fs.mkdirSync(early)
        fs.writeFileSync(path.join(early, "prior.txt"), "early-prior")
        const earlyController = new AbortController()
        earlyController.abort()
        await assert.rejects(runtime.run({ snapshot, destination: early, signal: earlyController.signal, renderFrame: async () => png(64, 64, true, 1) }), (error) => error.code === "cancelled")
        assert.equal(fs.readFileSync(path.join(early, "prior.txt"), "utf8"), "early-prior")

        const mid = path.join(temporary, "mid")
        fs.mkdirSync(mid)
        fs.writeFileSync(path.join(mid, "prior.txt"), "mid-prior")
        const midController = new AbortController()
        await assert.rejects(runtime.run({
            snapshot,
            destination: mid,
            signal: midController.signal,
            renderFrame: async ({ frameIndex }) => {
                if (frameIndex === 1) midController.abort()
                return png(64, 64, true, frameIndex + 1)
            },
        }), (error) => error.code === "cancelled")
        assert.equal(fs.readFileSync(path.join(mid, "prior.txt"), "utf8"), "mid-prior")

        const restore = path.join(temporary, "restore")
        fs.mkdirSync(restore); fs.writeFileSync(path.join(restore, "prior.txt"), "restore-prior")
        let failedPromotion = false
        const restoringRuntime = createPngFramesRuntime({
            freeSpaceReserveBytes: 0,
            randomBytes: () => Buffer.alloc(16, 50),
            rename: (source, target) => {
                if (!failedPromotion && source.includes(".gallery-png-stage-") && target === restore) {
                    failedPromotion = true
                    const error = new Error("injected promotion failure"); error.code = "EIO"; throw error
                }
                fs.renameSync(source, target)
            },
        })
        await assert.rejects(restoringRuntime.run({ snapshot, destination: restore, renderFrame: async ({ frameIndex }) => png(64, 64, true, frameIndex) }), /injected promotion failure/)
        assert.equal(fs.readFileSync(path.join(restore, "prior.txt"), "utf8"), "restore-prior", "failed promotion must restore the prior destination")

        const recoverable = path.join(temporary, "recoverable")
        fs.mkdirSync(recoverable); fs.writeFileSync(path.join(recoverable, "prior.txt"), "recoverable-prior")
        let racedPromotion = false
        const recoveryRuntime = createPngFramesRuntime({
            freeSpaceReserveBytes: 0,
            randomBytes: () => Buffer.alloc(16, 51),
            rename: (source, target) => {
                if (!racedPromotion && source.includes(".gallery-png-stage-") && target === recoverable) {
                    racedPromotion = true
                    fs.mkdirSync(recoverable)
                    fs.writeFileSync(path.join(recoverable, "competitor.txt"), "do-not-touch")
                    const error = new Error("injected destination race"); error.code = "EEXIST"; throw error
                }
                fs.renameSync(source, target)
            },
        })
        await assert.rejects(recoveryRuntime.run({ snapshot, destination: recoverable, renderFrame: async ({ frameIndex }) => png(64, 64, true, frameIndex) }), /injected destination race/)
        const recoveryBackup = fs.readdirSync(temporary).find((name) => name.startsWith(".gallery-png-backup-33"))
        assert.ok(recoveryBackup, "a failed restore race must preserve an app-owned recovery backup")
        assert.equal(fs.readFileSync(path.join(temporary, recoveryBackup, "prior.txt"), "utf8"), "recoverable-prior")
        assert.equal(fs.readFileSync(path.join(recoverable, "competitor.txt"), "utf8"), "do-not-touch")
        fs.rmSync(path.join(temporary, recoveryBackup), { recursive: true, force: true })

        const reserve = path.join(temporary, "reserve")
        fs.mkdirSync(reserve); fs.writeFileSync(path.join(reserve, "prior.txt"), "reserve-prior")
        let diskChecks = 0
        const reserveRuntime = createPngFramesRuntime({
            freeSpaceReserveBytes: 1000,
            randomBytes: () => Buffer.alloc(16, 52),
            statfs: () => ({ bavail: ++diskChecks < 3 ? 10_000_000 : 1, bsize: 1 }),
        })
        await assert.rejects(reserveRuntime.run({ snapshot, destination: reserve, renderFrame: async ({ frameIndex }) => png(64, 64, true, frameIndex) }), (error) => error.code === "resource_limit")
        assert.equal(fs.readFileSync(path.join(reserve, "prior.txt"), "utf8"), "reserve-prior", "mid-run reserve exhaustion must preserve the prior destination")

        const oversizedRuntime = createPngFramesRuntime({ freeSpaceReserveBytes: 0, maximumFrameBytes: 100 })
        await assert.rejects(oversizedRuntime.run({ snapshot, destination: path.join(temporary, "oversized"), renderFrame: async () => Buffer.alloc(101) }), (error) => error.code === "resource_limit")
        assert.equal(fs.readdirSync(temporary).some((name) => name.startsWith(".gallery-png-")), false, "staging and backup residue must be removed")
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true })
    }
    console.log("Verified: G06A immutable rounded frame plan, real PNG integrity/alpha/hash manifest, no-audio consequence, transactional promotion, cancellation, cleanup, and prior-destination preservation.")
}

run().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
