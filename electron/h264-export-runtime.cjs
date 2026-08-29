const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const zlib = require("node:zlib")
const { spawn } = require("node:child_process")
const { HostPortError } = require("./linux-host-port.cjs")
const { inspectPng } = require("./png-frames-runtime.cjs")
const { inspectMp4Handle } = require("./mp4-inspector.cjs")

function cancelled() { return new HostPortError("cancelled") }
function ensureNotAborted(signal) { if (signal?.aborted) throw cancelled() }

function paeth(left, above, upperLeft) {
    const estimate = left + above - upperLeft
    const leftDistance = Math.abs(estimate - left)
    const aboveDistance = Math.abs(estimate - above)
    const diagonalDistance = Math.abs(estimate - upperLeft)
    return leftDistance <= aboveDistance && leftDistance <= diagonalDistance ? left : aboveDistance <= diagonalDistance ? above : upperLeft
}

function assertOpaquePng(buffer, snapshot) {
    const inspected = inspectPng(buffer, { width: snapshot.width, height: snapshot.height, alpha: false })
    if (inspected.colourType === 2) {
        let offset = 8
        while (offset < buffer.length) {
            const length = buffer.readUInt32BE(offset)
            if (buffer.toString("ascii", offset + 4, offset + 8) === "tRNS") throw new HostPortError("verification_failed")
            offset += length + 12
        }
        return inspected
    }
    if (inspected.colourType !== 6) throw new HostPortError("verification_failed")
    const chunks = []
    let offset = 8
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset)
        const type = buffer.toString("ascii", offset + 4, offset + 8)
        if (type === "IDAT") chunks.push(buffer.subarray(offset + 8, offset + 8 + length))
        offset += length + 12
    }
    const stride = snapshot.width * 4
    let inflated
    try { inflated = zlib.inflateSync(Buffer.concat(chunks), { maxOutputLength: snapshot.height * (stride + 1) }) } catch { throw new HostPortError("verification_failed") }
    if (inflated.length !== snapshot.height * (stride + 1)) throw new HostPortError("verification_failed")
    let previous = Buffer.alloc(stride)
    for (let row = 0; row < snapshot.height; row += 1) {
        const sourceOffset = row * (stride + 1)
        const filter = inflated[sourceOffset]
        const raw = inflated.subarray(sourceOffset + 1, sourceOffset + 1 + stride)
        const decoded = Buffer.allocUnsafe(stride)
        for (let index = 0; index < stride; index += 1) {
            const left = index >= 4 ? decoded[index - 4] : 0
            const above = previous[index]
            const upperLeft = index >= 4 ? previous[index - 4] : 0
            let predictor
            if (filter === 0) predictor = 0
            else if (filter === 1) predictor = left
            else if (filter === 2) predictor = above
            else if (filter === 3) predictor = Math.floor((left + above) / 2)
            else if (filter === 4) predictor = paeth(left, above, upperLeft)
            else throw new HostPortError("verification_failed")
            decoded[index] = (raw[index] + predictor) & 0xff
        }
        for (let alpha = 3; alpha < decoded.length; alpha += 4) if (decoded[alpha] !== 255) throw new HostPortError("verification_failed")
        previous = decoded
    }
    return inspected
}

function writeInput(stream, buffer) {
    return new Promise((resolve, reject) => {
        const error = () => { cleanup(); reject(new HostPortError("verification_failed")) }
        const drain = () => { cleanup(); resolve() }
        const cleanup = () => { stream.removeListener("error", error); stream.removeListener("drain", drain) }
        stream.once("error", error)
        if (stream.write(buffer)) { cleanup(); resolve() }
        else stream.once("drain", drain)
    })
}

function endInput(stream) {
    return new Promise((resolve, reject) => {
        const error = () => { cleanup(); reject(new HostPortError("verification_failed")) }
        const finish = () => { cleanup(); resolve() }
        const cleanup = () => { stream.removeListener("error", error); stream.removeListener("finish", finish) }
        stream.once("error", error)
        stream.once("finish", finish)
        stream.end()
    })
}

function boundedTimeout(snapshot) {
    return Math.min(4 * 60 * 60 * 1000, Math.max(120_000, Math.ceil(snapshot.durationMs * 20)))
}

function qualityArgs(quality) {
    return quality === "master" ? ["-crf", "8"] : quality === "high" ? ["-crf", "12"] : ["-crf", "20"]
}

function readAt(handle, buffer, length, position) {
    return new Promise((resolve, reject) => {
        fs.read(handle, buffer, 0, length, position, (error, bytesRead) => error ? reject(error) : resolve(bytesRead))
    })
}

function yieldToHost() {
    return new Promise((resolve) => setImmediate(resolve))
}

async function verifyAudioStage(audio, snapshot, signal) {
    if (!audio || audio.snapshotId !== snapshot.snapshotId || audio.sampleRate !== 48_000 || audio.channels !== 2
        || audio.sampleFrames !== snapshot.audioFrameCount || audio.bytes !== snapshot.audioFrameCount * 4
        || typeof audio.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(audio.sha256) || typeof audio.filePath !== "string"
        || typeof audio.ctimeMs !== "number") throw new HostPortError("invalid_request")
    const handle = fs.openSync(audio.filePath, "r")
    try {
        const stat = fs.fstatSync(handle)
        if (!stat.isFile() || stat.size !== audio.bytes || stat.dev !== audio.device || stat.ino !== audio.inode
            || stat.mtimeMs !== audio.mtimeMs || stat.ctimeMs !== audio.ctimeMs) throw new HostPortError("verification_failed")
        const hash = crypto.createHash("sha256")
        const buffer = Buffer.alloc(1024 * 1024)
        let position = 0
        while (position < stat.size) {
            ensureNotAborted(signal)
            const count = await readAt(handle, buffer, Math.min(buffer.length, stat.size - position), position)
            if (!count) throw new HostPortError("verification_failed")
            hash.update(buffer.subarray(0, count))
            position += count
            await yieldToHost()
        }
        ensureNotAborted(signal)
        const after = fs.fstatSync(handle)
        if (after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs
            || after.ctimeMs !== stat.ctimeMs || hash.digest("hex") !== audio.sha256) throw new HostPortError("verification_failed")
        return { handle, identity: { device: stat.dev, inode: stat.ino, bytes: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs } }
    } catch (error) {
        fs.closeSync(handle)
        throw error
    }
}

async function verifyAudioHandleUnchanged(handle, identity, expectedSha256, signal) {
    const stat = fs.fstatSync(handle)
    if (!sameStageIdentity(stat, identity)) throw new HostPortError("verification_failed")
    const hash = crypto.createHash("sha256")
    const buffer = Buffer.alloc(1024 * 1024)
    let position = 0
    while (position < identity.bytes) {
        ensureNotAborted(signal)
        const count = await readAt(handle, buffer, Math.min(buffer.length, identity.bytes - position), position)
        if (!count) throw new HostPortError("verification_failed")
        hash.update(buffer.subarray(0, count))
        position += count
        await yieldToHost()
    }
    ensureNotAborted(signal)
    if (!sameStageIdentity(fs.fstatSync(handle), identity) || hash.digest("hex") !== expectedSha256) throw new HostPortError("verification_failed")
}

function encodeArgs(snapshot, target, maximumOutputBytes) {
    const keyInterval = snapshot.fps * 2
    return [
        "-hide_banner", "-loglevel", "error", "-xerror", "-nostdin", "-threads", "1", "-max_alloc", "268435456",
        "-f", "image2pipe", "-framerate", String(snapshot.fps), "-i", "pipe:0",
        "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", "pipe:3",
        "-map", "0:v:0", "-map", "1:a:0",
        "-vf", "zscale=primariesin=709:transferin=iec61966-2-1:matrixin=gbr:rangein=full:primaries=709:transfer=709:matrix=709:range=limited",
        "-c:v", "libx264", "-preset", "slow", ...qualityArgs(snapshot.quality), "-profile:v", "high", "-pix_fmt", "yuv420p", "-bf", "0", "-threads:v", "1",
        "-x264-params", `threads=1:lookahead_threads=1:sliced_threads=0:bframes=0:keyint=${keyInterval}:min-keyint=${keyInterval}:scenecut=0`,
        "-frames:v", String(snapshot.frameCount),
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-aac_coder", "twoloop",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
        "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact", "-map_metadata", "-1", "-map_chapters", "-1",
        "-movflags", "+faststart", "-video_track_timescale", String(snapshot.fps * 1000), "-fs", String(maximumOutputBytes), "-f", "mp4", "-y", target,
    ]
}

function referenceAudioArgs(target, maximumOutputBytes) {
    return [
        "-hide_banner", "-loglevel", "error", "-xerror", "-nostdin", "-threads", "1", "-max_alloc", "268435456",
        "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", "pipe:3", "-map", "0:a:0",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-aac_coder", "twoloop",
        "-fflags", "+bitexact", "-flags:a", "+bitexact", "-map_metadata", "-1", "-map_chapters", "-1",
        "-movflags", "+faststart", "-fs", String(maximumOutputBytes), "-f", "mp4", "-y", target,
    ]
}

function runReferenceAudioEncoder({ ffmpegPath, audioHandle, outputHandle, target, snapshot, signal, spawnProcess, maximumOutputBytes, reapTimeoutMs }) {
    if (signal?.aborted) return Promise.reject(cancelled())
    return new Promise((resolve, reject) => {
        let stderr = ""
        let settled = false
        let terminalError = null
        let reapTimer = null
        const child = spawnProcess(ffmpegPath, referenceAudioArgs(target, maximumOutputBytes), {
            shell: false,
            windowsHide: true,
            env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
            stdio: ["ignore", "ignore", "pipe", audioHandle, outputHandle],
        })
        function finish(error) {
            if (settled) return
            settled = true
            clearTimeout(timer)
            if (reapTimer) clearTimeout(reapTimer)
            signal?.removeEventListener("abort", abort)
            if (error) reject(error)
            else resolve()
        }
        const requestKill = (error) => {
            if (!terminalError) terminalError = error
            try { child.kill("SIGKILL") } catch { /* Bounded reap fallback below owns completion. */ }
            if (!reapTimer) reapTimer = setTimeout(() => finish(terminalError), reapTimeoutMs)
        }
        const abort = () => requestKill(cancelled())
        const timer = setTimeout(() => requestKill(new HostPortError("resource_limit")), boundedTimeout(snapshot))
        signal?.addEventListener("abort", abort, { once: true })
        child.stderr?.on("data", (chunk) => { if (stderr.length < 65_536) stderr += chunk.toString().slice(0, 65_536 - stderr.length) })
        child.once("error", () => requestKill(new HostPortError("host_unavailable")))
        child.once("close", (code) => {
            if (signal?.aborted) finish(cancelled())
            else if (terminalError) finish(terminalError)
            else if (code !== 0) finish(new HostPortError(stderr ? "verification_failed" : "host_unavailable"))
            else finish()
        })
    })
}

async function runEncoder({ ffmpegPath, snapshot, target, audioHandle, outputHandle, signal, renderFrame, onProgress, spawnProcess, maximumOutputBytes, checkOutputBudget, reapTimeoutMs }) {
    let stderr = ""
    let timedOut = false
    let producerError = null
    let spawnError = false
    let closeResult = null
    let killRequested = false
    let resolveClose
    const internal = new AbortController()
    const producerSignal = signal ? AbortSignal.any([signal, internal.signal]) : internal.signal
    const child = spawnProcess(ffmpegPath, encodeArgs(snapshot, target, maximumOutputBytes), {
        shell: false,
        windowsHide: true,
        env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
        stdio: ["pipe", "ignore", "pipe", audioHandle, outputHandle],
    })
    const closed = new Promise((resolve) => { resolveClose = resolve })
    let reapTimer = null
    const requestKill = () => {
        if (killRequested) return
        killRequested = true
        internal.abort()
        try { child.stdin?.destroy() } catch { /* The permanent error listener below owns stream failure. */ }
        try { child.kill("SIGKILL") } catch { /* Spawn failure is reported below. */ }
        reapTimer = setTimeout(() => resolveClose({ code: null, reaped: false }), reapTimeoutMs)
    }
    const abort = () => requestKill()
    const stdinError = () => {
        if (!producerError) producerError = signal?.aborted ? cancelled() : new HostPortError("verification_failed")
        requestKill()
    }
    child.stdin?.on("error", stdinError)
    signal?.addEventListener("abort", abort, { once: true })
    child.stderr?.on("data", (chunk) => { if (stderr.length < 65_536) stderr += chunk.toString().slice(0, 65_536 - stderr.length) })
    child.once("error", () => { spawnError = true; requestKill() })
    child.once("close", (code) => {
        closeResult = { code, reaped: true }
        internal.abort()
        resolveClose(closeResult)
    })
    const timer = setTimeout(() => { timedOut = true; requestKill() }, boundedTimeout(snapshot))
    const assertProducerActive = () => {
        if (signal?.aborted) throw cancelled()
        if (internal.signal.aborted) throw new HostPortError("verification_failed")
    }
    const producer = (async () => {
        try {
            for (let frameIndex = 0; frameIndex < snapshot.frameCount; frameIndex += 1) {
                assertProducerActive()
                const timeMs = Math.min(snapshot.durationMs, frameIndex * 1000 / snapshot.fps)
                const buffer = await renderFrame({ snapshot, frameIndex, timeMs, signal: producerSignal })
                assertProducerActive()
                if (!Buffer.isBuffer(buffer) || buffer.length > 128 * 1024 * 1024) throw new HostPortError("resource_limit")
                assertOpaquePng(buffer, snapshot)
                await writeInput(child.stdin, buffer)
                assertProducerActive()
                if (frameIndex % 16 === 0 || frameIndex + 1 === snapshot.frameCount) checkOutputBudget()
                onProgress?.({ phase: "rendering", frame: frameIndex + 1, totalFrames: snapshot.frameCount, progress: (frameIndex + 1) / snapshot.frameCount })
            }
            await endInput(child.stdin)
            assertProducerActive()
            onProgress?.({ phase: "encoding", frame: snapshot.frameCount, totalFrames: snapshot.frameCount, progress: 1 })
        } catch (error) {
            producerError = signal?.aborted ? cancelled() : producerSignal.aborted ? new HostPortError("verification_failed") : error
            requestKill()
        }
    })()
    const observedClose = await closed
    internal.abort()
    let producerJoined = false
    await Promise.race([
        producer.then(() => { producerJoined = true }),
        new Promise((resolve) => setTimeout(resolve, reapTimeoutMs)),
    ])
    clearTimeout(timer)
    if (reapTimer) clearTimeout(reapTimer)
    signal?.removeEventListener("abort", abort)
    child.stdin?.removeListener("error", stdinError)
    if (signal?.aborted) throw cancelled()
    if (timedOut || !producerJoined || !observedClose.reaped) throw new HostPortError("resource_limit")
    if (producerError) throw producerError
    if (spawnError) throw new HostPortError("host_unavailable")
    if (observedClose.code !== 0) throw new HostPortError(stderr ? "verification_failed" : "host_unavailable")
}

function sameStageIdentity(stat, identity, allowPromotionCtime = false) {
    return stat.isFile() && stat.dev === identity.device && stat.ino === identity.inode && stat.size === identity.bytes
        && stat.mtimeMs === identity.mtimeMs && (allowPromotionCtime || identity.ctimeMs === undefined || stat.ctimeMs === identity.ctimeMs)
}

function runDecode({ ffmpegPath, filePath, identity, kind, snapshot, signal, spawnProcess, reapTimeoutMs }) {
    if (signal?.aborted) return Promise.reject(cancelled())
    return new Promise((resolve, reject) => {
        const handle = fs.openSync(filePath, "r")
        if (!sameStageIdentity(fs.fstatSync(handle), identity)) { fs.closeSync(handle); reject(new HostPortError("verification_failed")); return }
        const expectedBytes = kind === "video" ? snapshot.width * snapshot.height * 4 * snapshot.frameCount : kind === "dimensions" ? 0 : snapshot.audioFrameCount * 4
        const args = kind === "video"
            ? ["-hide_banner", "-loglevel", "error", "-xerror", "-nostdin", "-threads", "1", "-i", "pipe:3", "-map", "0:v:0", "-fps_mode", "passthrough", "-pix_fmt", "rgba", "-f", "rawvideo", "pipe:1"]
            : kind === "dimensions"
                ? ["-hide_banner", "-loglevel", "error", "-xerror", "-nostdin", "-threads", "1", "-i", "pipe:3", "-map", "0:v:0", "-frames:v", "1", "-vf", `crop=${snapshot.width}:${snapshot.height}:0:0`, "-f", "null", "pipe:1"]
            : ["-hide_banner", "-loglevel", "error", "-xerror", "-nostdin", "-threads", "1", "-i", "pipe:3", "-map", "0:a:0", "-af", `atrim=end_sample=${snapshot.audioFrameCount}`, "-ar", "48000", "-ac", "2", "-f", "s16le", "pipe:1"]
        const child = spawnProcess(ffmpegPath, args, { shell: false, windowsHide: true, env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" }, stdio: ["ignore", "pipe", "pipe", handle] })
        let bytes = 0
        let stderr = ""
        let settled = false
        const hash = crypto.createHash("sha256")
        let terminalError = null
        let reapTimer = null
        const requestKill = (error) => {
            if (!terminalError) terminalError = error
            try { child.kill("SIGKILL") } catch { /* Bounded reap fallback below owns completion. */ }
            if (!reapTimer) reapTimer = setTimeout(() => finish(terminalError), reapTimeoutMs)
        }
        const timer = setTimeout(() => requestKill(new HostPortError("resource_limit")), boundedTimeout(snapshot))
        const abort = () => requestKill(cancelled())
        signal?.addEventListener("abort", abort, { once: true })
        child.stdout.on("data", (chunk) => {
            bytes += chunk.length
            if (bytes > expectedBytes) requestKill(new HostPortError("verification_failed"))
            else hash.update(chunk)
        })
        child.stderr.on("data", (chunk) => { if (stderr.length < 65_536) stderr += chunk.toString().slice(0, 65_536 - stderr.length) })
        function finish(error) {
            if (settled) return
            settled = true
            clearTimeout(timer)
            if (reapTimer) clearTimeout(reapTimer)
            signal?.removeEventListener("abort", abort)
            let stable = false
            try { stable = sameStageIdentity(fs.fstatSync(handle), identity) } catch { stable = false }
            try { fs.closeSync(handle) } catch { stable = false }
            if (!error && !stable) { reject(new HostPortError("verification_failed")); return }
            if (error) reject(error)
            else resolve({ bytes, sha256: hash.digest("hex") })
        }
        child.once("error", () => requestKill(new HostPortError("host_unavailable")))
        child.once("close", (code) => {
            if (signal?.aborted) finish(cancelled())
            else if (terminalError) finish(terminalError)
            else if (code !== 0 || bytes !== expectedBytes) finish(new HostPortError("verification_failed"))
            else finish()
        })
    })
}

function destinationStat(target) {
    try { return fs.lstatSync(target) } catch (error) {
        if (error?.code === "ENOENT") return null
        throw error
    }
}

function assertDestinationUnchanged(target, authority) {
    if (!authority || authority.targetKind !== "file" || typeof authority.targetExists !== "boolean") throw new HostPortError("invalid_request")
    const stat = destinationStat(target)
    if (authority.targetExists !== Boolean(stat)) throw new HostPortError("conflict")
    if (stat && (stat.isSymbolicLink() || !stat.isFile() || stat.dev !== authority.targetDevice || stat.ino !== authority.targetInode
        || stat.size !== authority.targetBytes || stat.mtimeMs !== authority.targetMtimeMs || stat.ctimeMs !== authority.targetCtimeMs)) throw new HostPortError("conflict")
}

function sameOwnedPath(target, identity) {
    const stat = destinationStat(target)
    return Boolean(stat && !stat.isSymbolicLink() && stat.isFile() && stat.dev === identity.device && stat.ino === identity.inode)
}

async function hashPublishedHandle(handle, identity, signal) {
    const hash = crypto.createHash("sha256")
    const buffer = Buffer.alloc(1024 * 1024)
    let position = 0
    while (position < identity.bytes) {
        ensureNotAborted(signal)
        const count = await readAt(handle, buffer, Math.min(buffer.length, identity.bytes - position), position)
        if (!count) throw new HostPortError("verification_failed")
        hash.update(buffer.subarray(0, count))
        position += count
        await yieldToHost()
    }
    ensureNotAborted(signal)
    if (!sameStageIdentity(fs.fstatSync(handle), identity, true)) throw new HostPortError("verification_failed")
    return hash.digest("hex")
}

function fsyncDirectory(directory) {
    const handle = fs.openSync(directory, "r")
    try { fs.fsyncSync(handle) } finally { fs.closeSync(handle) }
}

function createH264ExportRuntime(options = {}) {
    const ffmpegPath = options.ffmpegPath
    if (typeof ffmpegPath !== "string" || !path.isAbsolute(ffmpegPath)) throw new HostPortError("host_unavailable")
    const randomBytes = options.randomBytes ?? crypto.randomBytes
    const link = options.link ?? fs.linkSync
    const statfs = options.statfs ?? fs.statfsSync
    const spawnProcess = options.spawnProcess ?? spawn
    const reapTimeoutMs = options.reapTimeoutMs ?? 10_000
    if (!Number.isSafeInteger(reapTimeoutMs) || reapTimeoutMs < 1 || reapTimeoutMs > 60_000) throw new HostPortError("invalid_request")
    const maximumBytes = options.maximumBytes ?? 16 * 1024 * 1024 * 1024
    const freeSpaceReserveBytes = options.freeSpaceReserveBytes ?? 1024 * 1024 * 1024

    async function run({ snapshot, destination, destinationAuthority, audio, signal, renderFrame, onProgress }) {
        if (!snapshot || snapshot.format !== "mp4-h264-aac" || typeof destination !== "string" || !path.isAbsolute(destination) || typeof renderFrame !== "function") throw new HostPortError("invalid_request")
        const parent = path.dirname(destination)
        const parentStat = fs.lstatSync(parent)
        if (!parentStat.isDirectory() || parentStat.isSymbolicLink()
            || (destinationAuthority && (parentStat.dev !== destinationAuthority.parentDevice || parentStat.ino !== destinationAuthority.parentInode))) throw new HostPortError("verification_failed")
        const rawVideoBytes = snapshot.width * snapshot.height * 1.5 * snapshot.frameCount
        const outputBudget = Math.min(maximumBytes, Math.max(64 * 1024 * 1024, Math.ceil(rawVideoBytes + snapshot.audioFrameCount * 4)))
        const availableBytes = () => Number(statfs(parent).bavail) * Number(statfs(parent).bsize)
        if (!Number.isSafeInteger(outputBudget) || availableBytes() < freeSpaceReserveBytes + outputBudget) throw new HostPortError("resource_limit")
        const nonce = randomBytes(16).toString("hex")
        if (!/^[a-f0-9]{32}$/.test(nonce)) throw new HostPortError("internal_error")
        const stage = path.join(parent, `.gallery-h264-stage-${nonce}.mp4`)
        let audioReference = null
        let promoted = false
        let audioHandle = null
        let audioReferenceSourceHandle = null
        let audioIdentity = null
        let stageHandle = null
        let stageCreationHandle = null
        let stagePathIdentity = null
        let audioReferenceHandle = null
        let audioReferenceIdentity = null
        const checkOutputBudget = () => {
            if (stageCreationHandle === null || !stagePathIdentity || !sameOwnedPath(stage, stagePathIdentity)) throw new HostPortError("verification_failed")
            const bytes = fs.fstatSync(stageCreationHandle).size
            if (bytes > outputBudget || availableBytes() < freeSpaceReserveBytes) throw new HostPortError("resource_limit")
        }
        try {
            ensureNotAborted(signal)
            assertDestinationUnchanged(destination, destinationAuthority)
            if (destinationAuthority.targetExists) throw new HostPortError("conflict")
            const verifiedAudio = await verifyAudioStage(audio, snapshot, signal)
            audioHandle = verifiedAudio.handle
            audioIdentity = verifiedAudio.identity
            audioReferenceSourceHandle = fs.openSync(audio.filePath, "r")
            if (!sameStageIdentity(fs.fstatSync(audioReferenceSourceHandle), audioIdentity)) throw new HostPortError("verification_failed")
            stageCreationHandle = fs.openSync(stage, "wx+", 0o600)
            const createdStage = fs.fstatSync(stageCreationHandle)
            stagePathIdentity = { device: createdStage.dev, inode: createdStage.ino }
            if (!createdStage.isFile()) throw new HostPortError("verification_failed")
            fs.fchmodSync(stageCreationHandle, 0o600)
            if ((fs.fstatSync(stageCreationHandle).mode & 0o777) !== 0o600) throw new HostPortError("verification_failed")
            onProgress?.({ phase: "preparing", frame: 0, totalFrames: snapshot.frameCount, progress: 0 })
            await runEncoder({ ffmpegPath, snapshot, target: "/proc/self/fd/4", audioHandle, outputHandle: stageCreationHandle, signal, renderFrame, onProgress, spawnProcess, maximumOutputBytes: outputBudget, checkOutputBudget, reapTimeoutMs })
            await verifyAudioHandleUnchanged(audioHandle, audioIdentity, audio.sha256, signal)
            audioReference = path.join(path.dirname(audio.filePath), `.gallery-h264-audio-reference-${nonce}.m4a`)
            audioReferenceHandle = fs.openSync(audioReference, "wx+", 0o600)
            const createdReference = fs.fstatSync(audioReferenceHandle)
            if (!createdReference.isFile()) throw new HostPortError("verification_failed")
            fs.fchmodSync(audioReferenceHandle, 0o600)
            const securedReference = fs.fstatSync(audioReferenceHandle)
            const referencePathStat = fs.lstatSync(audioReference)
            if (!sameStageIdentity(referencePathStat, { device: securedReference.dev, inode: securedReference.ino, bytes: securedReference.size, mtimeMs: securedReference.mtimeMs, ctimeMs: securedReference.ctimeMs })) throw new HostPortError("verification_failed")
            fs.unlinkSync(audioReference)
            await runReferenceAudioEncoder({ ffmpegPath, audioHandle: audioReferenceSourceHandle, outputHandle: audioReferenceHandle, target: "/proc/self/fd/4", snapshot, signal, spawnProcess, maximumOutputBytes: outputBudget, reapTimeoutMs })
            await verifyAudioHandleUnchanged(audioHandle, audioIdentity, audio.sha256, signal)
            if (!sameStageIdentity(fs.fstatSync(audioReferenceSourceHandle), audioIdentity)) throw new HostPortError("verification_failed")
            fs.closeSync(audioReferenceSourceHandle)
            audioReferenceSourceHandle = null
            fs.fsyncSync(audioReferenceHandle)
            const completedReference = fs.fstatSync(audioReferenceHandle)
            if (!completedReference.isFile() || completedReference.size < 128 || completedReference.size > outputBudget) throw new HostPortError("verification_failed")
            audioReferenceIdentity = { device: completedReference.dev, inode: completedReference.ino, bytes: completedReference.size, mtimeMs: completedReference.mtimeMs, ctimeMs: completedReference.ctimeMs }
            fs.closeSync(audioHandle)
            audioHandle = null
            ensureNotAborted(signal)
            onProgress?.({ phase: "verifying", frame: snapshot.frameCount, totalFrames: snapshot.frameCount, progress: 1 })
            checkOutputBudget()
            if (!sameOwnedPath(stage, stagePathIdentity)) throw new HostPortError("verification_failed")
            fs.fsyncSync(stageCreationHandle)
            stageHandle = stageCreationHandle
            stageCreationHandle = null
            const inspected = await inspectMp4Handle(stageHandle, snapshot, { maximumBytes: outputBudget, signal })
            await runDecode({ ffmpegPath, filePath: stage, identity: inspected.identity, kind: "dimensions", snapshot, signal, spawnProcess, reapTimeoutMs })
            ensureNotAborted(signal)
            const videoDecode = await runDecode({ ffmpegPath, filePath: stage, identity: inspected.identity, kind: "video", snapshot, signal, spawnProcess, reapTimeoutMs })
            ensureNotAborted(signal)
            const audioDecode = await runDecode({ ffmpegPath, filePath: stage, identity: inspected.identity, kind: "audio", snapshot, signal, spawnProcess, reapTimeoutMs })
            const referenceAudioDecode = await runDecode({ ffmpegPath, filePath: `/proc/self/fd/${audioReferenceHandle}`, identity: audioReferenceIdentity, kind: "audio", snapshot, signal, spawnProcess, reapTimeoutMs })
            ensureNotAborted(signal)
            if (audioDecode.sha256 !== referenceAudioDecode.sha256) throw new HostPortError("verification_failed")
            fs.closeSync(audioReferenceHandle)
            audioReferenceHandle = null
            audioReferenceIdentity = null
            if (!sameStageIdentity(fs.fstatSync(stageHandle), inspected.identity) || !sameStageIdentity(fs.lstatSync(stage), inspected.identity)) throw new HostPortError("verification_failed")
            const finalParent = fs.lstatSync(parent)
            if (!finalParent.isDirectory() || finalParent.isSymbolicLink() || finalParent.dev !== parentStat.dev || finalParent.ino !== parentStat.ino) throw new HostPortError("verification_failed")
            assertDestinationUnchanged(destination, destinationAuthority)
            try { link(stage, destination) } catch (error) {
                if (error?.code === "EEXIST") throw new HostPortError("conflict")
                throw new HostPortError("verification_failed")
            }
            let publishedHandle = null
            try {
                publishedHandle = fs.openSync(destination, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
                const published = fs.fstatSync(publishedHandle)
                if (!sameStageIdentity(published, inspected.identity, true) || (published.mode & 0o777) !== 0o600
                    || await hashPublishedHandle(publishedHandle, inspected.identity, signal) !== inspected.sha256
                    || !sameStageIdentity(fs.lstatSync(destination), inspected.identity, true)) throw new HostPortError("verification_failed")
            } finally {
                if (publishedHandle !== null) fs.closeSync(publishedHandle)
            }
            fsyncDirectory(parent)
            if (!sameStageIdentity(fs.lstatSync(destination), inspected.identity, true)) throw new HostPortError("verification_failed")
            promoted = true
            if (sameOwnedPath(stage, inspected.identity)) {
                try { fs.unlinkSync(stage); fsyncDirectory(parent) } catch { /* Verified destination is committed; private residue is swept separately. */ }
            }
            try { onProgress?.({ phase: "done", frame: snapshot.frameCount, totalFrames: snapshot.frameCount, progress: 1 }) } catch { /* Publication is already committed. */ }
            return Object.freeze({
                format: snapshot.format,
                frameCount: snapshot.frameCount,
                width: snapshot.width,
                height: snapshot.height,
                alpha: false,
                audio: snapshot.audio,
                audioFrameCount: snapshot.audioFrameCount,
                bytes: inspected.bytes,
                sha256: inspected.sha256,
                videoDecodeSha256: videoDecode.sha256,
                audioDecodeSha256: audioDecode.sha256,
            })
        } catch (error) {
            if (signal?.aborted && !(error instanceof HostPortError && error.code === "cancelled")) throw cancelled()
            throw error
        } finally {
            if (audioHandle !== null) fs.closeSync(audioHandle)
            if (audioReferenceSourceHandle !== null) fs.closeSync(audioReferenceSourceHandle)
            if (audioReferenceHandle !== null) fs.closeSync(audioReferenceHandle)
            if (stageCreationHandle !== null) fs.closeSync(stageCreationHandle)
            if (stageHandle !== null) fs.closeSync(stageHandle)
            // Once linked, destination is preserved on every later failure. Pathname rollback could delete a replacement raced into the user-selected path.
            if (!promoted && stagePathIdentity && sameOwnedPath(stage, stagePathIdentity)) fs.rmSync(stage, { force: true })
        }
    }
    return Object.freeze({ run })
}

module.exports = { assertOpaquePng, createH264ExportRuntime }
