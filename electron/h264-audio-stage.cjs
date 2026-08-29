const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { HostPortError } = require("./linux-host-port.cjs")

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const MAX_CHUNK_FRAMES = 65_536
const MAX_CHUNK_BASE64 = 4 * Math.ceil(MAX_CHUNK_FRAMES * 4 / 3)

function cleanupH264AudioResidue(root) {
    if (typeof root !== "string" || !path.isAbsolute(root) || !fs.existsSync(root)) return 0
    const rootStat = fs.lstatSync(root)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (typeof process.getuid === "function" && rootStat.uid !== process.getuid())) return 0
    let removed = 0
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^audio-[a-f0-9]{32}$/.test(entry.name)) continue
        const target = path.join(root, entry.name)
        const stat = fs.lstatSync(target)
        if (!stat.isDirectory() || stat.isSymbolicLink()) continue
        fs.rmSync(target, { recursive: true, force: true })
        removed += 1
    }
    return removed
}

function createH264AudioStage({
    root,
    snapshot,
    randomBytes = crypto.randomBytes,
    statfs = fs.statfsSync,
    maximumBytes = 2 * 1024 * 1024 * 1024,
    freeSpaceReserveBytes = 1024 * 1024 * 1024,
}) {
    if (typeof root !== "string" || !path.isAbsolute(root) || !snapshot || !Number.isSafeInteger(snapshot.audioFrameCount) || snapshot.audioFrameCount < 1) {
        throw new HostPortError("invalid_request")
    }
    fs.mkdirSync(root, { recursive: true, mode: 0o700 })
    const rootStat = fs.lstatSync(root)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (typeof process.getuid === "function" && rootStat.uid !== process.getuid())) throw new HostPortError("host_unavailable")
    fs.chmodSync(root, 0o700)
    const expectedBytes = snapshot.audioFrameCount * 4
    const available = Number(statfs(root).bavail) * Number(statfs(root).bsize)
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes > maximumBytes || available < expectedBytes + freeSpaceReserveBytes) throw new HostPortError("resource_limit")
    const nonce = randomBytes(16).toString("hex")
    if (!/^[a-f0-9]{32}$/.test(nonce)) throw new HostPortError("internal_error")
    const stageRoot = path.join(root, `audio-${nonce}`)
    const filePath = path.join(stageRoot, "mix.pcm")
    let handle
    let createdRoot = false
    try {
        fs.mkdirSync(stageRoot, { mode: 0o700 })
        createdRoot = true
        handle = fs.openSync(filePath, "wx", 0o600)
    } catch (error) {
        if (createdRoot) {
            try { fs.rmdirSync(stageRoot) } catch { /* Never recursively delete a path whose contents are no longer ours. */ }
        }
        throw error
    }
    const stageRootStat = fs.lstatSync(stageRoot)
    const fileStat = fs.fstatSync(handle)
    const stageRootIdentity = { device: stageRootStat.dev, inode: stageRootStat.ino }
    const fileIdentity = { device: fileStat.dev, inode: fileStat.ino }
    const hash = crypto.createHash("sha256")
    let nextFrame = 0
    let finished = false
    let disposed = false

    function ensureLive() {
        if (disposed) throw new HostPortError("cancelled")
        if (finished) throw new HostPortError("conflict")
    }

    function append({ snapshotId, startFrame, pcm16Base64 }) {
        ensureLive()
        if (snapshotId !== snapshot.snapshotId || startFrame !== nextFrame || typeof pcm16Base64 !== "string" || pcm16Base64.length < 4
            || pcm16Base64.length > MAX_CHUNK_BASE64 || !BASE64.test(pcm16Base64)) throw new HostPortError("invalid_request")
        const bytes = Buffer.from(pcm16Base64, "base64")
        if (bytes.toString("base64") !== pcm16Base64 || bytes.length < 4 || bytes.length % 4 !== 0) throw new HostPortError("invalid_request")
        const frameCount = bytes.length / 4
        const requiredFrames = Math.min(MAX_CHUNK_FRAMES, snapshot.audioFrameCount - nextFrame)
        if (frameCount !== requiredFrames || nextFrame + frameCount > snapshot.audioFrameCount) throw new HostPortError("resource_limit")
        const currentAvailable = Number(statfs(root).bavail) * Number(statfs(root).bsize)
        if (currentAvailable < bytes.length + freeSpaceReserveBytes) throw new HostPortError("resource_limit")
        let offset = 0
        while (offset < bytes.length) offset += fs.writeSync(handle, bytes, offset, bytes.length - offset)
        hash.update(bytes)
        nextFrame += frameCount
        return Object.freeze({ acceptedFrames: frameCount, nextFrame })
    }

    function finish({ snapshotId }) {
        ensureLive()
        if (snapshotId !== snapshot.snapshotId || nextFrame !== snapshot.audioFrameCount) throw new HostPortError("conflict")
        fs.fsyncSync(handle)
        fs.closeSync(handle)
        finished = true
        const stat = fs.statSync(filePath)
        if (!stat.isFile() || stat.size !== snapshot.audioFrameCount * 4) throw new HostPortError("verification_failed")
        return Object.freeze({
            snapshotId,
            sampleRate: 48_000,
            channels: 2,
            sampleFrames: nextFrame,
            bytes: stat.size,
            sha256: hash.digest("hex"),
            filePath,
            device: stat.dev,
            inode: stat.ino,
            mtimeMs: stat.mtimeMs,
            ctimeMs: stat.ctimeMs,
        })
    }

    function dispose() {
        if (disposed) return
        disposed = true
        if (!finished) {
            try { fs.closeSync(handle) } catch { /* Already closed. */ }
        }
        try {
            const file = fs.lstatSync(filePath)
            if (!file.isSymbolicLink() && file.isFile() && file.dev === fileIdentity.device && file.ino === fileIdentity.inode) fs.unlinkSync(filePath)
        } catch { /* Missing or replaced paths are not ours to delete. */ }
        try {
            const directory = fs.lstatSync(stageRoot)
            if (!directory.isSymbolicLink() && directory.isDirectory() && directory.dev === stageRootIdentity.device && directory.ino === stageRootIdentity.inode) fs.rmdirSync(stageRoot)
        } catch { /* Non-empty or replaced paths remain confined under the private staging root. */ }
    }

    return Object.freeze({ append, dispose, finish, snapshotId: snapshot.snapshotId })
}

module.exports = { MAX_CHUNK_BASE64, MAX_CHUNK_FRAMES, cleanupH264AudioResidue, createH264AudioStage }
