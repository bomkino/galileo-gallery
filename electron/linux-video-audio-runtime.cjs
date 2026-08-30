const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { spawn } = require("node:child_process")
const { Transform } = require("node:stream")
const { pipeline } = require("node:stream/promises")
const { HostPortError } = require("./linux-host-port.cjs")

const SESSION = /^session-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function wavHeader(dataBytes, sampleRate = 48_000, channels = 2) {
    const header = Buffer.alloc(44)
    header.write("RIFF", 0)
    header.writeUInt32LE(dataBytes + 36, 4)
    header.write("WAVEfmt ", 8)
    header.writeUInt32LE(16, 16)
    header.writeUInt16LE(1, 20)
    header.writeUInt16LE(channels, 22)
    header.writeUInt32LE(sampleRate, 24)
    header.writeUInt32LE(sampleRate * channels * 2, 28)
    header.writeUInt16LE(channels * 2, 32)
    header.writeUInt16LE(16, 34)
    header.write("data", 36)
    header.writeUInt32LE(dataBytes, 40)
    return header
}

function framesForDuration(durationUs) {
    if (!Number.isSafeInteger(durationUs) || durationUs < 1 || durationUs > 24 * 60 * 60 * 1_000_000) throw new HostPortError("invalid_request")
    return Number((BigInt(durationUs) * 48_000n * 2n + 1_000_000n) / 2_000_000n)
}

function verifyGrantFile(grant) {
    let handle = null
    try {
        handle = fs.openSync(grant.filePath, "r")
        const stat = fs.fstatSync(handle)
        if (!stat.isFile() || stat.dev !== grant.device || stat.ino !== grant.inode || stat.size !== grant.bytes
            || stat.mtimeMs !== grant.mtimeMs || stat.ctimeMs !== grant.ctimeMs) throw new HostPortError("verification_failed")
        return handle
    } catch (error) {
        if (handle !== null) fs.closeSync(handle)
        if (error instanceof HostPortError) throw error
        throw new HostPortError("verification_failed")
    }
}

function createLinuxVideoAudioRuntime(options) {
    const root = path.resolve(options.root)
    const maximumBytes = options.maximumBytes ?? 256 * 1024 * 1024
    const maximumTotalBytes = options.maximumTotalBytes ?? 512 * 1024 * 1024
    const maximumEntries = options.maximumEntries ?? 64
    const freeSpaceReserveBytes = options.freeSpaceReserveBytes ?? 512 * 1024 * 1024
    const timeoutMs = options.timeoutMs ?? 120_000
    const entries = new Map()
    let active = null
    let disposed = false

    function ensureRoot() {
        fs.mkdirSync(root, { recursive: true, mode: 0o700 })
        const stat = fs.lstatSync(root)
        if (!stat.isDirectory() || stat.isSymbolicLink() || (typeof process.getuid === "function" && stat.uid !== process.getuid())) throw new HostPortError("host_unavailable")
        fs.chmodSync(root, 0o700)
    }

    function cleanupResidue() {
        if (!fs.existsSync(root)) return
        const stat = fs.lstatSync(root)
        if (!stat.isDirectory() || stat.isSymbolicLink() || (typeof process.getuid === "function" && stat.uid !== process.getuid())) return
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory() || !SESSION.test(entry.name)) continue
            const target = path.join(root, entry.name)
            const targetStat = fs.lstatSync(target)
            if (targetStat.isDirectory() && !targetStat.isSymbolicLink()) fs.rmSync(target, { recursive: true, force: true })
        }
    }

    ensureRoot()
    cleanupResidue()
    const sessionRoot = path.join(root, `session-${crypto.randomUUID()}`)
    fs.mkdirSync(sessionRoot, { recursive: false, mode: 0o700 })

    async function prepare(grant, durationUs, signal) {
        if (disposed) throw new HostPortError("host_unavailable")
        if (signal?.aborted) throw new HostPortError("cancelled")
        if (!/^video\//.test(grant.mime)) throw new HostPortError("invalid_request")
        const expectedFrames = framesForDuration(durationUs)
        const expectedRawBytes = expectedFrames * 4
        const cached = entries.get(grant.token)
        if (cached) {
            if (cached.durationUs !== durationUs) throw new HostPortError("conflict")
            const sourceHandle = verifyGrantFile(grant)
            fs.closeSync(sourceHandle)
            const outputHandle = verifyGrantFile(cached.grant)
            fs.closeSync(outputHandle)
            entries.delete(grant.token)
            entries.set(grant.token, cached)
            return cached.metadata
        }
        if (active) throw new HostPortError("resource_limit")
        if (entries.size >= maximumEntries) throw new HostPortError("resource_limit")
        const cachedBytes = [...entries.values()].reduce((sum, entry) => sum + entry.grant.bytes, 0)
        const remainingRawBytes = Math.min(maximumBytes, maximumTotalBytes - cachedBytes - 44)
        if (expectedRawBytes > remainingRawBytes) throw new HostPortError("resource_limit")
        if (typeof fs.statfsSync === "function") {
            const disk = fs.statfsSync(sessionRoot)
            if (Number(disk.bavail) * Number(disk.bsize) - maximumBytes - 44 < freeSpaceReserveBytes) throw new HostPortError("resource_limit")
        }
        let entryRoot = null
        let outputPath = null
        let sourceHandle = null
        const deadline = new AbortController()
        const internal = new AbortController()
        const timeout = setTimeout(() => deadline.abort(), timeoutMs)
        const boundedSignal = AbortSignal.any([...(signal ? [signal] : []), deadline.signal, internal.signal])
        let child = null
        let abort = null
        let rawBytes = 0
        let stderr = ""
        active = { grantToken: grant.token, entryRoot: null, child: null, controller: internal }
        try {
            entryRoot = path.join(sessionRoot, crypto.randomUUID())
            fs.mkdirSync(entryRoot, { recursive: false, mode: 0o700 })
            active.entryRoot = entryRoot
            outputPath = path.join(entryRoot, "source.wav")
            fs.writeFileSync(outputPath, Buffer.alloc(44), { flag: "wx", mode: 0o600 })
            sourceHandle = verifyGrantFile(grant)
            child = spawn(options.ffmpegPath, [
                "-hide_banner", "-loglevel", "error", "-xerror", "-nostdin", "-threads", "1", "-max_alloc", "67108864",
                "-protocol_whitelist", "file,pipe", "-i", "/proc/self/fd/3",
                "-map", "0:a:0?", "-vn", "-sn", "-dn", "-af", "aresample=48000:async=1:first_pts=0,apad",
                "-t", (durationUs / 1_000_000).toFixed(6), "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1",
            ], {
                shell: false,
                windowsHide: true,
                env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
                stdio: ["ignore", "pipe", "pipe", sourceHandle],
            })
            active.child = child
            abort = () => child?.kill("SIGKILL")
            boundedSignal.addEventListener("abort", abort, { once: true })
            child.stderr.on("data", (chunk) => { if (stderr.length < 65_536) stderr += chunk.toString().slice(0, 65_536 - stderr.length) })
            const meter = new Transform({ transform(chunk, _encoding, callback) {
                rawBytes += chunk.length
                if (rawBytes > expectedRawBytes || rawBytes > remainingRawBytes) callback(new HostPortError("resource_limit"))
                else callback(null, chunk)
            } })
            const output = fs.createWriteStream(outputPath, { flags: "r+", start: 44 })
            const closed = new Promise((resolve, reject) => {
                child.once("error", () => reject(new HostPortError("host_unavailable")))
                child.once("close", (code) => {
                    if (code === 0) return resolve()
                    const noAudioStream = rawBytes === 0 && (stderr.includes("does not contain any stream") || stderr.includes("matches no streams"))
                    reject(new HostPortError(noAudioStream ? "unsupported_capability" : "corrupt_input"))
                })
            })
            await Promise.all([pipeline(child.stdout, meter, output, { signal: boundedSignal }), closed])
            if (signal?.aborted) throw new HostPortError("cancelled")
            if (internal.signal.aborted) throw new HostPortError("cancelled")
            if (deadline.signal.aborted) throw new HostPortError("resource_limit")
            if (rawBytes === 0) throw new HostPortError("unsupported_capability")
            if (rawBytes !== expectedRawBytes) throw new HostPortError("corrupt_input")
            const outputHandle = fs.openSync(outputPath, "r+")
            try {
                fs.writeSync(outputHandle, wavHeader(rawBytes), 0, 44, 0)
                fs.fsyncSync(outputHandle)
            } finally { fs.closeSync(outputHandle) }
            const afterSource = fs.fstatSync(sourceHandle)
            if (afterSource.dev !== grant.device || afterSource.ino !== grant.inode || afterSource.size !== grant.bytes
                || afterSource.mtimeMs !== grant.mtimeMs || afterSource.ctimeMs !== grant.ctimeMs) throw new HostPortError("verification_failed")
            const stat = fs.statSync(outputPath)
            if (entries.size >= maximumEntries || cachedBytes + stat.size > maximumTotalBytes) throw new HostPortError("resource_limit")
            const metadata = Object.freeze({ sampleRate: 48_000, channels: 2, sampleFrames: expectedFrames })
            entries.set(grant.token, Object.freeze({
                metadata,
                durationUs,
                grant: Object.freeze({ token: grant.token, filePath: outputPath, mime: "audio/wav", bytes: stat.size, device: stat.dev, inode: stat.ino, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs }),
                entryRoot,
            }))
            return metadata
        } catch (error) {
            child?.kill("SIGKILL")
            if (entryRoot) fs.rmSync(entryRoot, { recursive: true, force: true })
            if (signal?.aborted) throw new HostPortError("cancelled")
            if (internal.signal.aborted) throw new HostPortError("cancelled")
            if (deadline.signal.aborted) throw new HostPortError("resource_limit")
            throw error
        } finally {
            clearTimeout(timeout)
            if (abort) boundedSignal.removeEventListener("abort", abort)
            if (sourceHandle !== null) fs.closeSync(sourceHandle)
            active = null
        }
    }

    function resolve(grant) {
        const entry = entries.get(grant.token)
        if (!entry) throw new HostPortError("unsupported_capability")
        const sourceHandle = verifyGrantFile(grant)
        fs.closeSync(sourceHandle)
        const outputHandle = verifyGrantFile(entry.grant)
        fs.closeSync(outputHandle)
        return entry.grant
    }

    function revoke(grant) {
        const entry = entries.get(grant.token)
        if (!entry) return false
        entries.delete(grant.token)
        fs.rmSync(entry.entryRoot, { recursive: true, force: true })
        return true
    }

    function dispose() {
        disposed = true
        active?.controller?.abort()
        active?.child?.kill("SIGKILL")
        active = null
        entries.clear()
        fs.rmSync(sessionRoot, { recursive: true, force: true })
    }

    return Object.freeze({ dispose, prepare, resolve, revoke })
}

module.exports = { createLinuxVideoAudioRuntime, framesForDuration, wavHeader }
