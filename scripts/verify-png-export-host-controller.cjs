const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const zlib = require("node:zlib")
const { createLinuxHostController } = require("../electron/linux-host-controller.cjs")
const { HostPortError } = require("../electron/linux-host-port.cjs")
const { createPngFramesRuntime } = require("../electron/png-frames-runtime.cjs")

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
    const name = Buffer.from(type)
    const result = Buffer.alloc(payload.length + 12)
    result.writeUInt32BE(payload.length, 0); name.copy(result, 4); payload.copy(result, 8)
    result.writeUInt32BE(crc32(Buffer.concat([name, payload])), payload.length + 8)
    return result
}
function transparentPng(width, height, seed) {
    const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6
    const rows = Buffer.alloc(height * (1 + width * 4))
    for (let row = 0; row < height; row += 1) {
        const offset = row * (1 + width * 4); rows[offset] = 0
        for (let column = 0; column < width; column += 1) {
            const pixel = offset + 1 + column * 4
            rows[pixel] = seed; rows[pixel + 1] = column; rows[pixel + 2] = row; rows[pixel + 3] = (column + row) % 2 ? 255 : 0
        }
    }
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))])
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-g06-host-"))
const source = path.join(temporary, "source.png")
fs.writeFileSync(source, transparentPng(64, 64, 1))
const destination = path.join(temporary, "output")
const cancelledDestination = path.join(temporary, "cancelled-output")
fs.mkdirSync(cancelledDestination)
fs.writeFileSync(path.join(cancelledDestination, "prior.txt"), "keep-me")
const frameRuntime = createPngFramesRuntime({ freeSpaceReserveBytes: 0 })
let selectedDestination = destination
let shouldWaitForCancel = false
let observedSnapshot

const host = createLinuxHostController({
    owner: "window-86",
    webContentsId: 86,
    identity: () => ({}),
    chooseMedia: ({ grantMedia }) => [{ name: "source.png", type: "image", url: grantMedia(source, "image/png").mediaURL }],
    chooseAudio: async () => null,
    prepareVideoAudio: async () => ({}),
    decodeAudio: async () => ({}),
    audioWaveform: async () => ({}),
    saveProject: async () => ({}),
    openProject: async () => ({ cancelled: true }),
    chooseExportDestination: async () => selectedDestination,
    runPngFramesExport: ({ snapshot, destination: target, destinationAuthority, signal, mediaPath, openExportMedia }) => {
        observedSnapshot = snapshot
        assert.equal(mediaPath(snapshot.config.items[0].url), source)
        const opened = openExportMedia(snapshot.config.items[0].url)
        fs.closeSync(opened.handle)
        return frameRuntime.run({
            snapshot,
            destination: target,
            destinationAuthority,
            signal,
            renderFrame: ({ frameIndex }) => {
                if (!shouldWaitForCancel) return transparentPng(snapshot.width, snapshot.height, frameIndex + 1)
                return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new HostPortError("cancelled")), { once: true }))
            },
        })
    },
})

const mainFrame = { url: "gallery-app://app/index.html" }
const event = { sender: { id: 86, mainFrame }, senderFrame: mainFrame }
let request = 0
function envelope(operation, payload = {}) {
    request += 1
    return { protocol: 1, requestId: `g06-request-${request}`, operation, generation: 1, payload }
}

async function preflight(url) {
    return host.handle(event, envelope("export.png.preflight", { intent: {
        config: { schemaVersion: 2, styleId: "quiet-carousel", items: [{ id: "one", name: "Source", type: "image", url, ratio: 1, spotlight: false, muted: false }], settings: { backgroundStyle: "transparent" } },
        width: 64, height: 64, fps: 10, durationMs: 150, transparent: true,
    } }))
}

async function run() {
    const capability = await host.handle(event, envelope("export.capabilities"))
    assert.equal(capability.value.formats[0].audio, false)
    assert.equal(JSON.stringify(capability).includes(temporary), false)
    const media = await host.handle(event, envelope("media.choose"))
    const prepared = await preflight(media.value[0].url)
    assert.equal(prepared.value.frameCount, 2)
    assert.equal(prepared.value.audio, "none")
    const chosen = await host.handle(event, envelope("export.destination.choose", { suggestedName: "Gallery PNG Frames" }))
    assert.match(chosen.value.destinationGrant, /^[a-f0-9]{64}$/)
    assert.equal(JSON.stringify(chosen).includes(destination), false)
    const result = await host.handle(event, envelope("export.png.start", { snapshotId: prepared.value.snapshotId, destinationGrant: chosen.value.destinationGrant }))
    assert.equal(result.ok, true)
    assert.equal(result.value.frameCount, 2)
    assert.equal(result.value.audio, "none")
    assert.equal(JSON.stringify(result).includes(destination), false)
    assert.equal(Object.isFrozen(observedSnapshot.config.items[0]), true)
    assert.deepEqual(fs.readdirSync(destination).sort(), ["frame-000001.png", "frame-000002.png", "manifest.json"])

    selectedDestination = cancelledDestination
    shouldWaitForCancel = true
    const cancelPrepared = await preflight(media.value[0].url)
    const cancelChosen = await host.handle(event, envelope("export.destination.choose", { suggestedName: "Gallery PNG Frames" }))
    const running = host.handle(event, envelope("export.png.start", { snapshotId: cancelPrepared.value.snapshotId, destinationGrant: cancelChosen.value.destinationGrant }))
    await new Promise((resolve) => setImmediate(resolve))
    const cancelled = await host.handle(event, envelope("export.cancel"))
    assert.deepEqual(cancelled.value, { cancelled: true })
    assert.equal((await running).error.code, "cancelled")
    assert.equal(fs.readFileSync(path.join(cancelledDestination, "prior.txt"), "utf8"), "keep-me")
    assert.equal(fs.readdirSync(temporary).some((name) => name.startsWith(".gallery-png-")), false)

    const staleStart = await host.handle(event, envelope("export.png.start", { snapshotId: cancelPrepared.value.snapshotId, destinationGrant: cancelChosen.value.destinationGrant }))
    assert.equal(staleStart.error.code, "conflict")

    shouldWaitForCancel = false
    const replacement = path.join(temporary, "replacement.png")
    fs.writeFileSync(replacement, transparentPng(64, 64, 44))
    fs.renameSync(replacement, source)
    selectedDestination = path.join(temporary, "swapped-output")
    const swappedPrepared = await preflight(media.value[0].url)
    const swappedChosen = await host.handle(event, envelope("export.destination.choose", { suggestedName: "Gallery PNG Frames" }))
    const swapped = await host.handle(event, envelope("export.png.start", { snapshotId: swappedPrepared.value.snapshotId, destinationGrant: swappedChosen.value.destinationGrant }))
    assert.equal(swapped.error.code, "verification_failed", "replaced source media must fail verified-handle opening before FFmpeg")
    host.dispose()
    console.log("Verified: G06A public HostPort capabilities/preflight/destination/start/cancel seam, opaque paths, immutable snapshots, real PNG output, and prior-destination preservation.")
}

run().catch((error) => {
    console.error(error)
    process.exitCode = 1
}).finally(() => fs.rmSync(temporary, { recursive: true, force: true }))
