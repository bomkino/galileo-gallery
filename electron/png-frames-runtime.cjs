const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const zlib = require("node:zlib")
const { HostPortError } = require("./linux-host-port.cjs")

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
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

function abortError() { return new HostPortError("cancelled") }

function ensureNotAborted(signal) {
    if (signal?.aborted) throw abortError()
}

function inspectPng(buffer, snapshot) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)
        || buffer.toString("ascii", 12, 16) !== "IHDR") throw new HostPortError("verification_failed")
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    const bitDepth = buffer[24]
    const colourType = buffer[25]
    if (width !== snapshot.width || height !== snapshot.height || bitDepth !== 8 || ![2, 6].includes(colourType) || (snapshot.alpha && colourType !== 6)
        || buffer[26] !== 0 || buffer[27] !== 0 || buffer[28] !== 0) {
        throw new HostPortError("verification_failed")
    }
    let offset = 8
    let sawHeader = false
    let sawEnd = false
    const imageData = []
    while (offset < buffer.length) {
        if (offset + 12 > buffer.length) throw new HostPortError("verification_failed")
        const length = buffer.readUInt32BE(offset)
        if (length > 128 * 1024 * 1024 || offset + 12 + length > buffer.length) throw new HostPortError("verification_failed")
        const type = buffer.toString("ascii", offset + 4, offset + 8)
        const payload = buffer.subarray(offset + 8, offset + 8 + length)
        const expectedCrc = buffer.readUInt32BE(offset + 8 + length)
        if (crc32(buffer.subarray(offset + 4, offset + 8 + length)) !== expectedCrc) throw new HostPortError("verification_failed")
        if (!sawHeader) {
            if (type !== "IHDR" || length !== 13) throw new HostPortError("verification_failed")
            sawHeader = true
        } else if (type === "IHDR") throw new HostPortError("verification_failed")
        if (type === "IDAT") imageData.push(payload)
        if (type === "IEND") {
            if (length !== 0 || imageData.length === 0 || offset + 12 !== buffer.length) throw new HostPortError("verification_failed")
            sawEnd = true
            break
        }
        offset += length + 12
    }
    if (!sawEnd) throw new HostPortError("verification_failed")
    const channels = colourType === 6 ? 4 : 3
    const expectedInflated = height * (1 + width * channels)
    let inflated
    try { inflated = zlib.inflateSync(Buffer.concat(imageData), { maxOutputLength: expectedInflated }) } catch { throw new HostPortError("verification_failed") }
    if (inflated.length !== expectedInflated) throw new HostPortError("verification_failed")
    for (let row = 0; row < height; row += 1) if (inflated[row * (1 + width * channels)] > 4) throw new HostPortError("verification_failed")
    return { bytes: buffer.length, sha256: crypto.createHash("sha256").update(buffer).digest("hex"), colourType }
}

function safeExistingDirectory(target) {
    if (!fs.existsSync(target)) return false
    const stat = fs.lstatSync(target)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new HostPortError("conflict")
    return true
}

function availableBytes(folder, statfs) {
    const stat = statfs(folder)
    return Number(stat.bavail) * Number(stat.bsize)
}

function createPngFramesRuntime(options = {}) {
    const randomBytes = options.randomBytes ?? crypto.randomBytes
    const maximumFrameBytes = options.maximumFrameBytes ?? 128 * 1024 * 1024
    const maximumTotalBytes = options.maximumTotalBytes ?? 16 * 1024 * 1024 * 1024
    const freeSpaceReserveBytes = options.freeSpaceReserveBytes ?? 1024 * 1024 * 1024
    const rename = options.rename ?? fs.renameSync
    const remove = options.remove ?? ((target) => fs.rmSync(target, { recursive: true, force: true }))
    const statfs = options.statfs ?? fs.statfsSync

    async function run({ snapshot, destination, destinationAuthority, signal, renderFrame, onProgress }) {
        if (!snapshot || typeof destination !== "string" || !path.isAbsolute(destination) || typeof renderFrame !== "function") throw new HostPortError("invalid_request")
        const parent = path.dirname(destination)
        const nonce = randomBytes(16).toString("hex")
        if (!/^[a-f0-9]{32}$/.test(nonce)) throw new HostPortError("internal_error")
        const stage = path.join(parent, `.gallery-png-stage-${nonce}`)
        const backup = path.join(parent, `.gallery-png-backup-${nonce}`)
        let promoted = false
        let backedUp = false
        let totalBytes = 0
        const frames = []
        try {
            const parentStat = fs.lstatSync(parent)
            if (!parentStat.isDirectory() || parentStat.isSymbolicLink()
                || (destinationAuthority && (parentStat.dev !== destinationAuthority.parentDevice || parentStat.ino !== destinationAuthority.parentInode))) {
                throw new HostPortError("verification_failed")
            }
            const available = availableBytes(parent, statfs)
            if (available < freeSpaceReserveBytes) throw new HostPortError("resource_limit")
            fs.mkdirSync(stage, { mode: 0o700 })
            onProgress?.({ phase: "preparing", frame: 0, totalFrames: snapshot.frameCount, progress: 0 })
            for (let index = 0; index < snapshot.frameCount; index += 1) {
                ensureNotAborted(signal)
                const timeMs = Math.min(snapshot.durationMs, index * 1000 / snapshot.fps)
                const buffer = await renderFrame({ snapshot, frameIndex: index, timeMs, signal })
                ensureNotAborted(signal)
                if (!Buffer.isBuffer(buffer) || buffer.length > maximumFrameBytes) throw new HostPortError("resource_limit")
                const inspected = inspectPng(buffer, snapshot)
                if (totalBytes + inspected.bytes > maximumTotalBytes || availableBytes(parent, statfs) < freeSpaceReserveBytes + inspected.bytes) throw new HostPortError("resource_limit")
                totalBytes += inspected.bytes
                const name = `frame-${String(index + 1).padStart(6, "0")}.png`
                const target = path.join(stage, name)
                fs.writeFileSync(target, buffer, { flag: "wx", mode: 0o600 })
                const written = fs.readFileSync(target)
                const verified = inspectPng(written, snapshot)
                if (verified.sha256 !== inspected.sha256 || verified.bytes !== inspected.bytes) throw new HostPortError("verification_failed")
                frames.push(Object.freeze({ name, timeMs, bytes: inspected.bytes, sha256: inspected.sha256 }))
                onProgress?.({ phase: "rendering", frame: index + 1, totalFrames: snapshot.frameCount, progress: (index + 1) / snapshot.frameCount })
            }
            ensureNotAborted(signal)
            const manifest = {
                format: "galileo-gallery-png-frames",
                version: 1,
                scene: snapshot.scene,
                width: snapshot.width,
                height: snapshot.height,
                fps: snapshot.fps,
                durationMs: snapshot.durationMs,
                frameCount: snapshot.frameCount,
                alpha: snapshot.alpha,
                audio: "none",
                consequence: "PNG Frames contain no audio; Project audio intent is unchanged.",
                frames,
            }
            const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
            if (totalBytes + manifestBytes.length > maximumTotalBytes || availableBytes(parent, statfs) < freeSpaceReserveBytes + manifestBytes.length) throw new HostPortError("resource_limit")
            fs.writeFileSync(path.join(stage, "manifest.json"), manifestBytes, { flag: "wx", mode: 0o600 })
            const entries = fs.readdirSync(stage).sort()
            if (entries.length !== snapshot.frameCount + 1 || entries[entries.length - 1] !== "manifest.json") throw new HostPortError("verification_failed")
            ensureNotAborted(signal)
            const promotionParent = fs.lstatSync(parent)
            if (!promotionParent.isDirectory() || promotionParent.isSymbolicLink()
                || promotionParent.dev !== parentStat.dev || promotionParent.ino !== parentStat.ino) throw new HostPortError("verification_failed")
            if (safeExistingDirectory(destination)) {
                rename(destination, backup)
                backedUp = true
            }
            try {
                rename(stage, destination)
                promoted = true
            } catch (error) {
                if (backedUp && !fs.existsSync(destination)) {
                    rename(backup, destination)
                    backedUp = false
                }
                throw error
            }
            if (backedUp) {
                try {
                    remove(backup)
                } catch { /* Promotion is committed; app-owned backup residue is safer than rolling back a partially removed backup. */ }
                backedUp = false
            }
            onProgress?.({ phase: "done", frame: snapshot.frameCount, totalFrames: snapshot.frameCount, progress: 1 })
            return Object.freeze({
                format: "png-frames",
                frameCount: snapshot.frameCount,
                width: snapshot.width,
                height: snapshot.height,
                alpha: snapshot.alpha,
                audio: "none",
                manifestSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(destination, "manifest.json"))).digest("hex"),
            })
        } catch (error) {
            if (backedUp && !promoted && !fs.existsSync(destination) && fs.existsSync(backup)) {
                rename(backup, destination)
                backedUp = false
            }
            if (signal?.aborted && !(error instanceof HostPortError && error.code === "cancelled")) throw abortError()
            throw error
        } finally {
            if (!promoted) fs.rmSync(stage, { recursive: true, force: true })
        }
    }

    return Object.freeze({ run })
}

module.exports = { createPngFramesRuntime, inspectPng }
