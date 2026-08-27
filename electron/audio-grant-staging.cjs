const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { Transform } = require("node:stream")
const { pipeline } = require("node:stream/promises")
const { HostPortError } = require("./linux-host-port.cjs")

const RESIDUE = /^selection-[a-f0-9-]{36}$/

function mapInspectionError(error, signal, deadline) {
    if (signal?.aborted || error?.code === "cancelled") return new HostPortError("cancelled")
    if (deadline?.aborted) return new HostPortError("resource_limit")
    if (error?.code === "media_missing") return new HostPortError("not_found")
    if (error?.code === "media_signature_mismatch") return new HostPortError("corrupt_input")
    return error
}

function createAudioGrantStaging(options) {
    const root = path.resolve(options.root)
    const inspect = options.inspect
    const maximumBytes = options.maximumBytes ?? 4_000_000_000
    const freeSpaceReserveBytes = options.freeSpaceReserveBytes ?? 1024 * 1024 * 1024
    const timeoutMs = options.timeoutMs ?? 60_000
    const availableBytes = options.availableBytes ?? ((folder) => {
        if (typeof fs.statfsSync !== "function") return Number.POSITIVE_INFINITY
        const disk = fs.statfsSync(folder)
        return Number(disk.bavail) * Number(disk.bsize)
    })
    const randomUUID = options.randomUUID ?? crypto.randomUUID

    function ensureRoot() {
        fs.mkdirSync(root, { recursive: true, mode: 0o700 })
        const stat = fs.lstatSync(root)
        if (!stat.isDirectory() || stat.isSymbolicLink() || (typeof process.getuid === "function" && stat.uid !== process.getuid())) throw new HostPortError("host_unavailable")
        fs.chmodSync(root, 0o700)
        return root
    }

    function cleanupResidue() {
        if (!fs.existsSync(root)) return
        const stat = fs.lstatSync(root)
        if (!stat.isDirectory() || stat.isSymbolicLink() || (typeof process.getuid === "function" && stat.uid !== process.getuid())) return
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory() || !RESIDUE.test(entry.name)) continue
            const target = path.join(root, entry.name)
            const targetStat = fs.lstatSync(target)
            if (targetStat.isDirectory() && !targetStat.isSymbolicLink()) fs.rmSync(target, { recursive: true, force: true })
        }
    }

    function remove(filePath) {
        const resolved = path.resolve(filePath)
        const relative = path.relative(root, resolved)
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return false
        const selectionRoot = path.dirname(resolved)
        if (!RESIDUE.test(path.basename(selectionRoot))) return false
        try {
            const stat = fs.lstatSync(selectionRoot)
            if (!stat.isDirectory() || stat.isSymbolicLink()) return false
            fs.rmSync(selectionRoot, { recursive: true, force: true })
            return true
        } catch {
            return false
        }
    }

    async function stage(sourcePath, signal) {
        if (signal?.aborted) throw new HostPortError("cancelled")
        ensureRoot()
        let sourceStat
        try { sourceStat = fs.lstatSync(sourcePath) } catch { throw new HostPortError("not_found") }
        if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new HostPortError("corrupt_input")
        if (sourceStat.size < 1 || sourceStat.size > maximumBytes) throw new HostPortError("resource_limit")
        if (availableBytes(root) - sourceStat.size < freeSpaceReserveBytes) throw new HostPortError("resource_limit")

        const deadlineController = new AbortController()
        const timeout = setTimeout(() => deadlineController.abort(), timeoutMs)
        const boundedSignal = signal ? AbortSignal.any([signal, deadlineController.signal]) : deadlineController.signal
        let selectionRoot = null
        try {
            const sourceInspection = await inspect(sourcePath, boundedSignal)
            selectionRoot = path.join(root, `selection-${randomUUID()}`)
            fs.mkdirSync(selectionRoot, { recursive: false, mode: 0o700 })
            fs.writeFileSync(path.join(selectionRoot, ".owner.json"), JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 })
            const stagedPath = path.join(selectionRoot, "source.wav")
            let copied = 0
            const meter = new Transform({ transform(chunk, _encoding, callback) {
                copied += chunk.length
                if (copied > sourceStat.size || copied > maximumBytes) callback(new HostPortError("resource_limit"))
                else callback(null, chunk)
            } })
            await pipeline(fs.createReadStream(sourcePath), meter, fs.createWriteStream(stagedPath, { flags: "wx", mode: 0o600 }), { signal: boundedSignal })
            if (copied !== sourceStat.size) throw new HostPortError("verification_failed")
            const stagedInspection = await inspect(stagedPath, boundedSignal)
            if (stagedInspection.sha256 !== sourceInspection.sha256 || stagedInspection.bytes !== sourceInspection.bytes) throw new HostPortError("verification_failed")
            if (signal?.aborted) throw new HostPortError("cancelled")
            if (deadlineController.signal.aborted) throw new HostPortError("resource_limit")
            return Object.freeze({ filePath: stagedPath, inspection: stagedInspection })
        } catch (error) {
            if (selectionRoot) fs.rmSync(selectionRoot, { recursive: true, force: true })
            throw mapInspectionError(error, signal, deadlineController.signal)
        } finally {
            clearTimeout(timeout)
        }
    }

    return Object.freeze({ cleanupResidue, ensureRoot, remove, stage })
}

module.exports = { createAudioGrantStaging }
