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

function availableBytes(folder, statfs) {
    const stat = statfs(folder)
    return Number(stat.bavail) * Number(stat.bsize)
}

function createPngFramesRuntime(options = {}) {
    const maximumFrameBytes = options.maximumFrameBytes ?? 128 * 1024 * 1024
    const maximumTotalBytes = options.maximumTotalBytes ?? 16 * 1024 * 1024 * 1024
    const freeSpaceReserveBytes = options.freeSpaceReserveBytes ?? 1024 * 1024 * 1024
    const statfs = options.statfs ?? fs.statfsSync
    const afterDestinationCreated = options.afterDestinationCreated
    const writeFileChunk = options.writeSync ?? fs.writeSync
    const fsyncFile = options.fsyncFile ?? fs.fsyncSync

    async function run({ snapshot, destination, destinationAuthority, signal, renderFrame, onProgress }) {
        if (process.platform !== "linux") throw new HostPortError("unsupported_capability")
        if (!snapshot || typeof destination !== "string" || !path.isAbsolute(destination) || typeof renderFrame !== "function"
            || !destinationAuthority || destinationAuthority.targetKind !== "directory" || destinationAuthority.targetExists !== false) {
            throw new HostPortError(destinationAuthority?.targetExists ? "conflict" : "invalid_request")
        }
        const parent = path.dirname(destination)
        const destinationName = path.basename(destination)
        let parentHandle = null
        let parentIdentity = null
        let directoryHandle = null
        let directoryIdentity = null
        let committed = false
        let totalBytes = 0
        const frames = []
        const ownedFiles = []
        const sameIdentity = (left, right) => Boolean(left && right && left.dev === right.dev && left.ino === right.ino)
        const verifyParent = (requirePublishedPath = false) => {
            if (parentHandle === null || !parentIdentity) throw new HostPortError("verification_failed")
            const descriptor = fs.fstatSync(parentHandle)
            if (!descriptor.isDirectory() || !sameIdentity(descriptor, parentIdentity)) throw new HostPortError("verification_failed")
            if (requirePublishedPath) {
                let linked
                try { linked = fs.lstatSync(parent) } catch { throw new HostPortError("verification_failed") }
                if (!linked.isDirectory() || linked.isSymbolicLink() || !sameIdentity(linked, parentIdentity)) throw new HostPortError("verification_failed")
            }
            return `/proc/self/fd/${parentHandle}`
        }
        const verifyDestination = (requirePublishedPath = false) => {
            if (directoryHandle === null || !directoryIdentity) throw new HostPortError("verification_failed")
            const descriptor = fs.fstatSync(directoryHandle)
            const parentRoot = verifyParent(requirePublishedPath)
            let linked
            try { linked = fs.lstatSync(path.join(parentRoot, destinationName)) } catch { throw new HostPortError("verification_failed") }
            if (!descriptor.isDirectory() || !linked.isDirectory() || linked.isSymbolicLink()
                || !sameIdentity(descriptor, directoryIdentity) || !sameIdentity(linked, directoryIdentity)) throw new HostPortError("verification_failed")
            if (requirePublishedPath) {
                const published = fs.lstatSync(destination)
                if (!published.isDirectory() || published.isSymbolicLink() || !sameIdentity(published, directoryIdentity)) throw new HostPortError("verification_failed")
            }
            return `/proc/self/fd/${directoryHandle}`
        }
        const writeVerified = (name, bytes, inspect) => {
            const directoryRoot = verifyDestination()
            const target = path.join(directoryRoot, name)
            const flags = fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0)
            const handle = fs.openSync(target, flags, 0o600)
            let written = 0
            const identity = fs.fstatSync(handle)
            const birthtimeNs = fs.fstatSync(handle, { bigint: true }).birthtimeNs
            if (!identity.isFile() || identity.size !== 0) {
                fs.closeSync(handle)
                throw new HostPortError("verification_failed")
            }
            const owned = {
                name, device: identity.dev, inode: identity.ino, bytes: bytes.length,
                sha256: crypto.createHash("sha256").update(bytes).digest("hex"), inspect,
                mtimeMs: identity.mtimeMs, ctimeMs: identity.ctimeMs, uid: identity.uid, gid: identity.gid, mode: identity.mode,
                birthtimeNs,
                cleanupBytes: 0, cleanupSha256: crypto.createHash("sha256").update(Buffer.alloc(0)).digest("hex"),
            }
            ownedFiles.push(owned)
            let completedWrite = false
            try {
                while (written < bytes.length) written += writeFileChunk(handle, bytes, written, bytes.length - written, null)
                fsyncFile(handle)
                const afterWrite = fs.fstatSync(handle)
                if (!afterWrite.isFile() || !sameIdentity(afterWrite, identity) || afterWrite.size !== bytes.length) throw new HostPortError("verification_failed")
                Object.assign(owned, {
                    mtimeMs: afterWrite.mtimeMs, ctimeMs: afterWrite.ctimeMs, uid: afterWrite.uid, gid: afterWrite.gid, mode: afterWrite.mode,
                    cleanupBytes: afterWrite.size, cleanupSha256: owned.sha256,
                })
                completedWrite = true
            } finally {
                if (!completedWrite) {
                    try {
                        const current = fs.fstatSync(handle)
                        if (current.isFile() && sameIdentity(current, identity)) {
                            const hash = crypto.createHash("sha256")
                            const chunk = Buffer.allocUnsafe(Math.min(Math.max(current.size, 1), 1024 * 1024))
                            let offset = 0
                            while (offset < current.size) {
                                const length = Math.min(chunk.length, current.size - offset)
                                const read = fs.readSync(handle, chunk, 0, length, offset)
                                if (read !== length) throw new HostPortError("verification_failed")
                                hash.update(chunk.subarray(0, read))
                                offset += read
                            }
                            Object.assign(owned, {
                                mtimeMs: current.mtimeMs, ctimeMs: current.ctimeMs, uid: current.uid, gid: current.gid, mode: current.mode,
                                cleanupBytes: current.size, cleanupSha256: hash.digest("hex"),
                            })
                        }
                    } catch { /* Cleanup will preserve any file whose exact ownership cannot be proven. */ }
                }
                fs.closeSync(handle)
            }
            const linked = fs.lstatSync(target)
            if (!linked.isFile() || linked.isSymbolicLink() || !sameIdentity(linked, identity)) throw new HostPortError("verification_failed")
            const readHandle = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
            let verifiedBytes
            try {
                const before = fs.fstatSync(readHandle)
                if (!before.isFile() || !sameIdentity(before, identity) || before.size !== bytes.length) throw new HostPortError("verification_failed")
                verifiedBytes = fs.readFileSync(readHandle)
                const after = fs.fstatSync(readHandle)
                if (!sameIdentity(after, identity) || after.size !== bytes.length || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new HostPortError("verification_failed")
            } finally {
                fs.closeSync(readHandle)
            }
            const finalLink = fs.lstatSync(target)
            if (!sameIdentity(finalLink, identity)) throw new HostPortError("verification_failed")
            const result = inspect(verifiedBytes)
            return result
        }
        const verifyOwnedFiles = async () => {
            const root = verifyDestination(true)
            for (const owned of ownedFiles) {
                ensureNotAborted(signal)
                const target = path.join(root, owned.name)
                let linked
                try { linked = fs.lstatSync(target) } catch { throw new HostPortError("verification_failed") }
                if (!linked.isFile() || linked.isSymbolicLink() || linked.dev !== owned.device || linked.ino !== owned.inode
                    || linked.size !== owned.bytes || linked.mtimeMs !== owned.mtimeMs || linked.ctimeMs !== owned.ctimeMs
                    || linked.uid !== owned.uid || linked.gid !== owned.gid || linked.mode !== owned.mode) throw new HostPortError("verification_failed")
                const handle = await fs.promises.open(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
                const bytes = Buffer.allocUnsafe(owned.bytes)
                try {
                    const before = await handle.stat()
                    if (!before.isFile() || before.dev !== owned.device || before.ino !== owned.inode || before.size !== owned.bytes
                        || before.mtimeMs !== owned.mtimeMs || before.ctimeMs !== owned.ctimeMs
                        || before.uid !== owned.uid || before.gid !== owned.gid || before.mode !== owned.mode) throw new HostPortError("verification_failed")
                    let offset = 0
                    while (offset < bytes.length) {
                        ensureNotAborted(signal)
                        const length = Math.min(bytes.length - offset, 1024 * 1024)
                        const { bytesRead } = await handle.read(bytes, offset, length, offset)
                        if (bytesRead !== length) throw new HostPortError("verification_failed")
                        offset += bytesRead
                        await new Promise((resolve) => setImmediate(resolve))
                    }
                    const after = await handle.stat()
                    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
                        || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
                        || after.uid !== before.uid || after.gid !== before.gid || after.mode !== before.mode) throw new HostPortError("verification_failed")
                } finally {
                    await handle.close()
                }
                const finalLink = fs.lstatSync(target)
                if (finalLink.dev !== owned.device || finalLink.ino !== owned.inode || finalLink.size !== owned.bytes
                    || finalLink.mtimeMs !== owned.mtimeMs || finalLink.ctimeMs !== owned.ctimeMs
                    || finalLink.uid !== owned.uid || finalLink.gid !== owned.gid || finalLink.mode !== owned.mode) throw new HostPortError("verification_failed")
                if (crypto.createHash("sha256").update(bytes).digest("hex") !== owned.sha256) throw new HostPortError("verification_failed")
                owned.inspect(bytes)
                ensureNotAborted(signal)
                await new Promise((resolve) => setImmediate(resolve))
            }
        }
        try {
            const parentStat = fs.lstatSync(parent)
            if (!parentStat.isDirectory() || parentStat.isSymbolicLink()
                || parentStat.dev !== destinationAuthority.parentDevice || parentStat.ino !== destinationAuthority.parentInode) {
                throw new HostPortError("verification_failed")
            }
            parentHandle = fs.openSync(parent, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0) | (fs.constants.O_NOFOLLOW ?? 0))
            parentIdentity = fs.fstatSync(parentHandle)
            if (!sameIdentity(parentIdentity, parentStat)) throw new HostPortError("verification_failed")
            const parentRoot = verifyParent(true)
            const destinationAccess = path.join(parentRoot, destinationName)
            const available = availableBytes(parentRoot, statfs)
            if (available < freeSpaceReserveBytes) throw new HostPortError("resource_limit")
            try { fs.mkdirSync(destinationAccess, { mode: 0o700 }) } catch (error) {
                if (["EEXIST", "EISDIR"].includes(error?.code)) throw new HostPortError("conflict")
                throw error
            }
            const createdIdentity = fs.lstatSync(destinationAccess)
            if (!createdIdentity.isDirectory() || createdIdentity.isSymbolicLink()) throw new HostPortError("verification_failed")
            afterDestinationCreated?.({ destination, destinationAccess })
            try {
                directoryHandle = fs.openSync(destinationAccess, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0) | (fs.constants.O_NOFOLLOW ?? 0))
            } catch {
                throw new HostPortError("verification_failed")
            }
            const openedIdentity = fs.fstatSync(directoryHandle)
            if (!sameIdentity(openedIdentity, createdIdentity)) throw new HostPortError("verification_failed")
            directoryIdentity = openedIdentity
            verifyDestination()
            onProgress?.({ phase: "preparing", frame: 0, totalFrames: snapshot.frameCount, progress: 0 })
            for (let index = 0; index < snapshot.frameCount; index += 1) {
                ensureNotAborted(signal)
                const timeMs = Math.min(snapshot.durationMs, index * 1000 / snapshot.fps)
                const buffer = await renderFrame({ snapshot, frameIndex: index, timeMs, signal })
                ensureNotAborted(signal)
                if (!Buffer.isBuffer(buffer) || buffer.length > maximumFrameBytes) throw new HostPortError("resource_limit")
                const inspected = inspectPng(buffer, snapshot)
                if (totalBytes + inspected.bytes > maximumTotalBytes || availableBytes(verifyParent(), statfs) < freeSpaceReserveBytes + inspected.bytes) throw new HostPortError("resource_limit")
                totalBytes += inspected.bytes
                const name = `frame-${String(index + 1).padStart(6, "0")}.png`
                const verified = writeVerified(name, buffer, (bytes) => inspectPng(bytes, snapshot))
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
            if (totalBytes + manifestBytes.length > maximumTotalBytes || availableBytes(verifyParent(), statfs) < freeSpaceReserveBytes + manifestBytes.length) throw new HostPortError("resource_limit")
            const manifestSha256 = writeVerified("manifest.json", manifestBytes, (bytes) => crypto.createHash("sha256").update(bytes).digest("hex"))
            const entries = fs.readdirSync(verifyDestination()).sort()
            const expectedEntries = ownedFiles.map((file) => file.name).sort()
            if (entries.length !== expectedEntries.length || entries.some((entry, index) => entry !== expectedEntries[index])) throw new HostPortError("verification_failed")
            ensureNotAborted(signal)
            fs.fsyncSync(directoryHandle)
            verifyDestination(true)
            fs.fsyncSync(parentHandle)
            verifyDestination(true)
            await verifyOwnedFiles()
            ensureNotAborted(signal)
            verifyDestination(true)
            committed = true
            onProgress?.({ phase: "done", frame: snapshot.frameCount, totalFrames: snapshot.frameCount, progress: 1 })
            return Object.freeze({
                format: "png-frames",
                frameCount: snapshot.frameCount,
                width: snapshot.width,
                height: snapshot.height,
                alpha: snapshot.alpha,
                audio: "none",
                manifestSha256,
            })
        } catch (error) {
            if (signal?.aborted && !(error instanceof HostPortError && error.code === "cancelled")) throw abortError()
            throw error
        } finally {
            if (directoryHandle !== null) {
                const stillOwned = (() => {
                    try { return sameIdentity(fs.lstatSync(path.join(verifyParent(), destinationName)), directoryIdentity) } catch { return false }
                })()
                if (stillOwned && !committed) {
                    const root = `/proc/self/fd/${directoryHandle}`
                    for (const file of ownedFiles.reverse()) {
                        try {
                            const target = path.join(root, file.name)
                            const linked = fs.lstatSync(target)
                            if (!linked.isFile() || linked.isSymbolicLink() || linked.dev !== file.device || linked.ino !== file.inode) continue
                            const linkedBirthtimeNs = fs.lstatSync(target, { bigint: true }).birthtimeNs
                            const sameBirth = file.birthtimeNs > 0n && linkedBirthtimeNs === file.birthtimeNs
                            const sameMetadata = linked.size === file.cleanupBytes && linked.mtimeMs === file.mtimeMs && linked.ctimeMs === file.ctimeMs
                                && linked.uid === file.uid && linked.gid === file.gid && linked.mode === file.mode
                            if (sameBirth) {
                                const final = fs.lstatSync(target)
                                const finalBirthtimeNs = fs.lstatSync(target, { bigint: true }).birthtimeNs
                                if (final.isFile() && !final.isSymbolicLink() && final.dev === file.device && final.ino === file.inode
                                    && finalBirthtimeNs === file.birthtimeNs) fs.unlinkSync(target)
                                continue
                            }
                            if (!sameMetadata) continue
                            const handle = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
                            let digest
                            try {
                                const before = fs.fstatSync(handle)
                                if (before.dev !== linked.dev || before.ino !== linked.ino || before.size !== linked.size
                                    || before.mtimeMs !== linked.mtimeMs || before.ctimeMs !== linked.ctimeMs) continue
                                const hash = crypto.createHash("sha256")
                                const chunk = Buffer.allocUnsafe(Math.min(Math.max(before.size, 1), 1024 * 1024))
                                let offset = 0
                                while (offset < before.size) {
                                    const length = Math.min(chunk.length, before.size - offset)
                                    const read = fs.readSync(handle, chunk, 0, length, offset)
                                    if (read !== length) throw new HostPortError("verification_failed")
                                    hash.update(chunk.subarray(0, read))
                                    offset += read
                                }
                                const after = fs.fstatSync(handle)
                                if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
                                    || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) continue
                                digest = hash.digest("hex")
                            } finally { fs.closeSync(handle) }
                            const finalLink = fs.lstatSync(target)
                            if (digest === file.cleanupSha256 && finalLink.dev === linked.dev && finalLink.ino === linked.ino
                                && finalLink.size === linked.size && finalLink.mtimeMs === linked.mtimeMs && finalLink.ctimeMs === linked.ctimeMs) fs.unlinkSync(target)
                        } catch { /* Never remove a raced or foreign entry. */ }
                    }
                }
                fs.closeSync(directoryHandle)
                if (stillOwned && !committed) {
                    try { fs.rmdirSync(path.join(verifyParent(), destinationName)) } catch { /* Foreign or raced entries remain untouched. */ }
                }
            }
            if (parentHandle !== null) fs.closeSync(parentHandle)
        }
    }

    return Object.freeze({ run })
}

module.exports = { createPngFramesRuntime, inspectPng }
