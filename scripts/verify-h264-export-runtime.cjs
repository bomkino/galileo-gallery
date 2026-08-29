const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const zlib = require("node:zlib")
const { spawn } = require("node:child_process")
const { EventEmitter } = require("node:events")
const { PassThrough } = require("node:stream")
const ffmpegPath = require("ffmpeg-static")
const { HostPortError } = require("../electron/linux-host-port.cjs")
const { createH264AudioStage } = require("../electron/h264-audio-stage.cjs")
const { createH264Snapshot } = require("../electron/h264-export-contract.cjs")
const { assertOpaquePng, createH264ExportRuntime } = require("../electron/h264-export-runtime.cjs")

if (process.platform !== "linux") {
    console.log("Skipped: G06B process/fd publication runtime is Linux-only; pure H.264/AAC contract and MP4 semantics remain cross-platform.")
    process.exit(0)
}

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
function rgbaPng(width, height, seed, transparent = false) {
    const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6
    const rows = Buffer.alloc(height * (1 + width * 4))
    for (let row = 0; row < height; row += 1) {
        const offset = row * (1 + width * 4); rows[offset] = 0
        for (let column = 0; column < width; column += 1) {
            const pixel = offset + 1 + column * 4
            rows[pixel] = seed; rows[pixel + 1] = column * 3; rows[pixel + 2] = row * 3; rows[pixel + 3] = transparent && row === 0 && column === 0 ? 0 : 255
        }
    }
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))])
}
function rgbTrnsPng(width, height) {
    const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
    const transparent = Buffer.alloc(6); transparent.writeUInt16BE(1, 0); transparent.writeUInt16BE(2, 2); transparent.writeUInt16BE(3, 4)
    const rows = Buffer.alloc(height * (1 + width * 3))
    for (let row = 0; row < height; row += 1) {
        const offset = row * (1 + width * 3); rows[offset] = 0
        for (let column = 0; column < width; column += 1) {
            const pixel = offset + 1 + column * 3; rows[pixel] = 1; rows[pixel + 1] = 2; rows[pixel + 2] = 3
        }
    }
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("tRNS", transparent), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))])
}

function nthBoxType(buffer, type, occurrence) {
    let offset = -1
    for (let index = 0; index < occurrence; index += 1) offset = buffer.indexOf(Buffer.from(type), offset + 1)
    return offset
}

function swapUInt32(buffer, left, right) {
    const value = buffer.readUInt32BE(left)
    buffer.writeUInt32BE(buffer.readUInt32BE(right), left)
    buffer.writeUInt32BE(value, right)
}

function reorderAudioChunks(buffer) {
    const chunkOffsets = nthBoxType(buffer, "stco", 2)
    const sampleSizes = nthBoxType(buffer, "stsz", 2)
    assert.ok(chunkOffsets > 0 && sampleSizes > 0)
    assert.ok(buffer.readUInt32BE(chunkOffsets + 8) >= 3 && buffer.readUInt32BE(sampleSizes + 12) >= 5)
    swapUInt32(buffer, chunkOffsets + 16, chunkOffsets + 20)
    for (let index = 0; index < 2; index += 1) swapUInt32(buffer, sampleSizes + 20 + index * 4, sampleSizes + 28 + index * 4)
}

const grant = `reel-media://grant/${"b".repeat(64)}`
const snapshot = createH264Snapshot({
    config: { schemaVersion: 2, styleId: "quiet-carousel", items: [{ id: "one", name: "One", type: "image", url: grant, ratio: 1, spotlight: false, muted: false }], settings: { backgroundStyle: "solid", playKind: "once", repeatCount: 1 } },
    width: 64, height: 64, fps: 24, durationMs: 1_000, cycleDurationMs: 1_000, finalCycleDurationMs: 1_000, quality: "optimized",
}, () => Buffer.alloc(16, 4))

function destinationAuthority(target, parent) {
    let stat = null
    try { stat = fs.lstatSync(target) } catch (error) { if (error?.code !== "ENOENT") throw error }
    return {
        parentDevice: parent.dev, parentInode: parent.ino, targetKind: "file", targetExists: Boolean(stat),
        targetDevice: stat?.dev ?? null, targetInode: stat?.ino ?? null, targetBytes: stat?.size ?? null,
        targetMtimeMs: stat?.mtimeMs ?? null, targetCtimeMs: stat?.ctimeMs ?? null,
    }
}

assert.throws(() => assertOpaquePng(rgbaPng(64, 64, 1, true), snapshot), (error) => error instanceof HostPortError && error.code === "verification_failed")
assert.throws(() => assertOpaquePng(rgbTrnsPng(64, 64), snapshot), (error) => error instanceof HostPortError && error.code === "verification_failed")
assert.equal(assertOpaquePng(rgbaPng(64, 64, 1), snapshot).colourType, 6)

async function run() {
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-h264-runtime-"))
const audioRoot = path.join(temporary, "audio")
const destination = path.join(temporary, "gallery.mp4")
const progress = []
let audioStage
try {
    audioStage = createH264AudioStage({ root: audioRoot, snapshot, randomBytes: () => Buffer.alloc(16, 5) })
    for (let startFrame = 0; startFrame < snapshot.audioFrameCount; startFrame += 65_536) {
        const frameCount = Math.min(65_536, snapshot.audioFrameCount - startFrame)
        const pcm = Buffer.alloc(frameCount * 4)
        for (let frame = 0; frame < frameCount; frame += 1) {
            const sample = Math.round(Math.sin((startFrame + frame) * Math.PI * 2 * 440 / 48_000) * 8_000)
            pcm.writeInt16LE(sample, frame * 4); pcm.writeInt16LE(sample, frame * 4 + 2)
        }
        audioStage.append({ snapshotId: snapshot.snapshotId, startFrame, pcm16Base64: pcm.toString("base64") })
    }
    const audio = audioStage.finish({ snapshotId: snapshot.snapshotId })
    const runtime = createH264ExportRuntime({ ffmpegPath, freeSpaceReserveBytes: 0, randomBytes: () => Buffer.alloc(16, 6) })
    const parent = fs.statSync(temporary)
    const result = await runtime.run({
        snapshot,
        destination,
        destinationAuthority: destinationAuthority(destination, parent),
        audio,
        signal: new AbortController().signal,
        renderFrame: ({ frameIndex }) => rgbaPng(64, 64, frameIndex + 1),
        onProgress: (value) => progress.push(value),
    })
    assert.equal(result.format, "mp4-h264-aac")
    assert.equal(result.frameCount, 24)
    assert.equal(result.audioFrameCount, 48_000)
    assert.ok(result.bytes > 1_000)
    assert.match(result.sha256, /^[a-f0-9]{64}$/)
    assert.match(result.videoDecodeSha256, /^[a-f0-9]{64}$/)
    assert.match(result.audioDecodeSha256, /^[a-f0-9]{64}$/)
    assert.equal(fs.existsSync(destination), true)
    assert.equal(fs.statSync(destination).mode & 0o777, 0o600, "verified output must remain owner-only")
    assert.deepEqual(progress.map((value) => value.phase).filter((value, index, values) => index === 0 || value !== values[index - 1]), ["preparing", "rendering", "encoding", "verifying", "done"])

    for (const edgeFps of [24, 25, 30, 48, 50, 60]) {
        for (const edgeFrames of [1, 2, 3]) {
            const edgeDuration = edgeFrames * 1000 / edgeFps
            const edgeSnapshot = createH264Snapshot({
                config: snapshot.config, width: 64, height: 64, fps: edgeFps, durationMs: edgeDuration,
                cycleDurationMs: edgeDuration, finalCycleDurationMs: edgeDuration, quality: "optimized",
            })
            const edgeStage = createH264AudioStage({ root: path.join(temporary, `edge-audio-${edgeFps}-${edgeFrames}`), snapshot: edgeSnapshot, freeSpaceReserveBytes: 0 })
            try {
                edgeStage.append({ snapshotId: edgeSnapshot.snapshotId, startFrame: 0, pcm16Base64: Buffer.alloc(edgeSnapshot.audioFrameCount * 4).toString("base64") })
                const edgeAudio = edgeStage.finish({ snapshotId: edgeSnapshot.snapshotId })
                const edgeDestination = path.join(temporary, `edge-${edgeFps}-${edgeFrames}.mp4`)
                let edgeResult
                try {
                    edgeResult = await runtime.run({
                        snapshot: edgeSnapshot, destination: edgeDestination, destinationAuthority: destinationAuthority(edgeDestination, parent),
                        audio: edgeAudio, signal: new AbortController().signal, renderFrame: ({ frameIndex }) => rgbaPng(64, 64, frameIndex + 1),
                    })
                } catch (error) {
                    error.message = `${error.message} at ${edgeFps}fps/${edgeFrames}frames`
                    throw error
                }
                assert.equal(edgeResult.frameCount, edgeFrames)
            } finally { edgeStage.dispose() }
        }
    }

    const deterministicDestination = path.join(temporary, "gallery-second.mp4")
    const deterministic = await runtime.run({
        snapshot,
        destination: deterministicDestination,
        destinationAuthority: destinationAuthority(deterministicDestination, parent),
        audio,
        signal: new AbortController().signal,
        renderFrame: ({ frameIndex }) => rgbaPng(64, 64, frameIndex + 1),
        onProgress: (value) => { if (value.phase === "done") throw new Error("post-commit observer failed") },
    })
    assert.equal(deterministic.sha256, result.sha256, "fixed visual/audio input must produce byte-identical MP4 output")
    assert.deepEqual(fs.readFileSync(deterministicDestination), fs.readFileSync(destination))

    const reorderedAudioDestination = path.join(temporary, "reordered-audio.mp4")
    let audioTableMutated = false
    let audioTableMutationError = null
    const reorderedAudioRuntime = createH264ExportRuntime({
        ffmpegPath, freeSpaceReserveBytes: 0, randomBytes: () => Buffer.alloc(16, 18),
        spawnProcess: (command, args, options) => {
            const child = spawn(command, args, options)
            if (args.includes("-c:v") && args.includes("libx264")) {
                child.once("close", (code) => {
                    if (code !== 0) return
                    try {
                        const handle = options.stdio[4]
                        const bytes = Buffer.alloc(fs.fstatSync(handle).size)
                        fs.readSync(handle, bytes, 0, bytes.length, 0)
                        reorderAudioChunks(bytes)
                        fs.writeSync(handle, bytes, 0, bytes.length, 0)
                        fs.fsyncSync(handle)
                        audioTableMutated = true
                    } catch (error) { audioTableMutationError = error }
                })
            }
            return child
        },
    })
    await assert.rejects(reorderedAudioRuntime.run({
        snapshot, destination: reorderedAudioDestination, destinationAuthority: destinationAuthority(reorderedAudioDestination, parent), audio,
        signal: new AbortController().signal, renderFrame: ({ frameIndex }) => rgbaPng(64, 64, frameIndex + 1),
    }), (error) => error instanceof HostPortError && error.code === "verification_failed")
    if (audioTableMutationError) throw audioTableMutationError
    assert.equal(audioTableMutated, true, "causal fixture must reorder valid AAC chunk tables after encode")
    assert.equal(fs.existsSync(reorderedAudioDestination), false, "audio content mismatch must never publish")

    const existingDestination = path.join(temporary, "existing.mp4")
    fs.writeFileSync(existingDestination, "authorized-version")
    let existingRenderCalls = 0
    await assert.rejects(runtime.run({
        snapshot, destination: existingDestination, destinationAuthority: destinationAuthority(existingDestination, parent), audio,
        signal: new AbortController().signal,
        renderFrame: () => { existingRenderCalls += 1; return rgbaPng(64, 64, 1) },
    }), (error) => error instanceof HostPortError && error.code === "conflict")
    assert.equal(existingRenderCalls, 0, "unsupported overwrite must fail before hashing audio or encoding frames")
    assert.equal(fs.readFileSync(existingDestination, "utf8"), "authorized-version", "an existing destination must never be overwritten")

    const absentRace = path.join(temporary, "created-after-grant.mp4")
    const absentAuthority = destinationAuthority(absentRace, parent)
    let createdAfterGrant = false
    await assert.rejects(runtime.run({
        snapshot, destination: absentRace, destinationAuthority: absentAuthority, audio,
        signal: new AbortController().signal,
        renderFrame: ({ frameIndex }) => {
            if (!createdAfterGrant && frameIndex === 0) { fs.writeFileSync(absentRace, "external-arrival"); createdAfterGrant = true }
            return rgbaPng(64, 64, frameIndex + 1)
        },
    }), (error) => error instanceof HostPortError && error.code === "conflict")
    assert.equal(fs.readFileSync(absentRace, "utf8"), "external-arrival")

    const commitRace = path.join(temporary, "commit-race.mp4")
    const commitRaceRuntime = createH264ExportRuntime({
        ffmpegPath, freeSpaceReserveBytes: 0, randomBytes: () => Buffer.alloc(16, 13),
        link: (sourcePath, destinationPath) => {
            fs.writeFileSync(destinationPath, "external-at-commit")
            fs.linkSync(sourcePath, destinationPath)
        },
    })
    await assert.rejects(commitRaceRuntime.run({
        snapshot, destination: commitRace, destinationAuthority: destinationAuthority(commitRace, parent), audio,
        signal: new AbortController().signal, renderFrame: ({ frameIndex }) => rgbaPng(64, 64, frameIndex + 1),
    }), (error) => error instanceof HostPortError && error.code === "conflict")
    assert.equal(fs.readFileSync(commitRace, "utf8"), "external-at-commit", "atomic no-replace publication must preserve a target created at the final commit boundary")

    const swappedSourceDestination = path.join(temporary, "swapped-stage-destination.mp4")
    let injectedStagePath = null
    const swappedSourceRuntime = createH264ExportRuntime({
        ffmpegPath, freeSpaceReserveBytes: 0, randomBytes: () => Buffer.alloc(16, 14),
        link: (sourcePath, destinationPath) => {
            injectedStagePath = sourcePath
            fs.unlinkSync(sourcePath)
            fs.writeFileSync(sourcePath, "hostile-stage-swap")
            fs.linkSync(sourcePath, destinationPath)
        },
    })
    await assert.rejects(swappedSourceRuntime.run({
        snapshot, destination: swappedSourceDestination, destinationAuthority: destinationAuthority(swappedSourceDestination, parent), audio,
        signal: new AbortController().signal, renderFrame: ({ frameIndex }) => rgbaPng(64, 64, frameIndex + 1),
    }), (error) => error instanceof HostPortError && error.code === "verification_failed")
    assert.equal(fs.readFileSync(swappedSourceDestination, "utf8"), "hostile-stage-swap", "cleanup must not delete an unowned inode linked at the destination")
    assert.ok(injectedStagePath && fs.readFileSync(injectedStagePath, "utf8") === "hostile-stage-swap", "cleanup must not unlink an inode it does not own")
    fs.unlinkSync(swappedSourceDestination)
    fs.unlinkSync(injectedStagePath)

    const postLinkSwapDestination = path.join(temporary, "post-link-swap.mp4")
    const postLinkSwapRuntime = createH264ExportRuntime({
        ffmpegPath, freeSpaceReserveBytes: 0, randomBytes: () => Buffer.alloc(16, 15),
        link: (sourcePath, destinationPath) => {
            fs.linkSync(sourcePath, destinationPath)
            fs.unlinkSync(destinationPath)
            fs.writeFileSync(destinationPath, "external-after-link")
        },
    })
    await assert.rejects(postLinkSwapRuntime.run({
        snapshot, destination: postLinkSwapDestination, destinationAuthority: destinationAuthority(postLinkSwapDestination, parent), audio,
        signal: new AbortController().signal, renderFrame: ({ frameIndex }) => rgbaPng(64, 64, frameIndex + 1),
    }), (error) => error instanceof HostPortError && error.code === "verification_failed")
    assert.equal(fs.readFileSync(postLinkSwapDestination, "utf8"), "external-after-link", "cleanup must preserve an external inode swapped in after publication")

    const audioHashCancelled = path.join(temporary, "audio-hash-cancelled.mp4")
    const audioHashController = new AbortController()
    setImmediate(() => audioHashController.abort())
    await assert.rejects(runtime.run({
        snapshot, destination: audioHashCancelled, destinationAuthority: destinationAuthority(audioHashCancelled, parent), audio,
        signal: audioHashController.signal, renderFrame: () => { throw new Error("cancelled audio hashing must not render") },
    }), (error) => error instanceof HostPortError && error.code === "cancelled")
    assert.equal(fs.existsSync(audioHashCancelled), false)

    const symlinkVictim = path.join(temporary, "symlink-victim.mp4")
    fs.writeFileSync(symlinkVictim, "never-truncate")
    const hostileNonce = "08".repeat(16)
    const hostileStage = path.join(temporary, `.gallery-h264-stage-${hostileNonce}.mp4`)
    fs.symlinkSync(symlinkVictim, hostileStage)
    const exclusiveRuntime = createH264ExportRuntime({ ffmpegPath, freeSpaceReserveBytes: 0, randomBytes: () => Buffer.alloc(16, 8) })
    const exclusiveDestination = path.join(temporary, "exclusive.mp4")
    await assert.rejects(exclusiveRuntime.run({
        snapshot, destination: exclusiveDestination, destinationAuthority: destinationAuthority(exclusiveDestination, parent), audio,
        signal: new AbortController().signal, renderFrame: () => rgbaPng(64, 64, 2),
    }), (error) => error?.code === "EEXIST")
    assert.equal(fs.readFileSync(symlinkVictim, "utf8"), "never-truncate")
    fs.unlinkSync(hostileStage)

    const quotaPrior = path.join(temporary, "quota-target.mp4")
    const quotaRuntime = createH264ExportRuntime({ ffmpegPath, freeSpaceReserveBytes: 0, statfs: () => ({ bavail: 1, bsize: 1 }) })
    await assert.rejects(quotaRuntime.run({
        snapshot, destination: quotaPrior, destinationAuthority: destinationAuthority(quotaPrior, parent), audio,
        signal: new AbortController().signal, renderFrame: () => rgbaPng(64, 64, 2),
    }), (error) => error instanceof HostPortError && error.code === "resource_limit")
    assert.equal(fs.existsSync(quotaPrior), false)

    const tamperStage = createH264AudioStage({ root: path.join(temporary, "tamper-audio"), snapshot })
    const authoredPcm = fs.readFileSync(audio.filePath)
    tamperStage.append({ snapshotId: snapshot.snapshotId, startFrame: 0, pcm16Base64: authoredPcm.toString("base64") })
    const tamperedAudio = tamperStage.finish({ snapshotId: snapshot.snapshotId })
    const firstByte = Buffer.alloc(1)
    const tamperHandle = fs.openSync(tamperedAudio.filePath, "r+")
    try {
        fs.readSync(tamperHandle, firstByte, 0, 1, 0)
        firstByte[0] ^= 0xff
        fs.writeSync(tamperHandle, firstByte, 0, 1, 0)
        fs.fsyncSync(tamperHandle)
    } finally { fs.closeSync(tamperHandle) }
    const tamperedDestination = path.join(temporary, "tampered-audio.mp4")
    await assert.rejects(runtime.run({
        snapshot, destination: tamperedDestination, destinationAuthority: destinationAuthority(tamperedDestination, parent), audio: tamperedAudio,
        signal: new AbortController().signal, renderFrame: () => rgbaPng(64, 64, 2),
    }), (error) => error instanceof HostPortError && error.code === "verification_failed")
    assert.equal(fs.existsSync(tamperedDestination), false)
    tamperStage.dispose()

    const postEncodeAudioStage = createH264AudioStage({ root: path.join(temporary, "post-encode-audio"), snapshot })
    postEncodeAudioStage.append({ snapshotId: snapshot.snapshotId, startFrame: 0, pcm16Base64: authoredPcm.toString("base64") })
    const postEncodeAudio = postEncodeAudioStage.finish({ snapshotId: snapshot.snapshotId })
    let mutatedBeforeSpawn = false
    const postEncodeTamperRuntime = createH264ExportRuntime({
        ffmpegPath, freeSpaceReserveBytes: 0, randomBytes: () => Buffer.alloc(16, 16),
        spawnProcess: (command, args, options) => {
            if (!mutatedBeforeSpawn) {
                mutatedBeforeSpawn = true
                const handle = fs.openSync(postEncodeAudio.filePath, "r+")
                try {
                    const byte = Buffer.alloc(1)
                    fs.readSync(handle, byte, 0, 1, 0)
                    byte[0] ^= 0xff
                    fs.writeSync(handle, byte, 0, 1, 0)
                    fs.fsyncSync(handle)
                } finally { fs.closeSync(handle) }
            }
            return spawn(command, args, options)
        },
    })
    const postEncodeTamperDestination = path.join(temporary, "post-encode-tamper.mp4")
    await assert.rejects(postEncodeTamperRuntime.run({
        snapshot, destination: postEncodeTamperDestination, destinationAuthority: destinationAuthority(postEncodeTamperDestination, parent), audio: postEncodeAudio,
        signal: new AbortController().signal, renderFrame: ({ frameIndex }) => rgbaPng(64, 64, frameIndex + 1),
    }), (error) => error instanceof HostPortError && error.code === "verification_failed")
    assert.equal(fs.existsSync(postEncodeTamperDestination), false, "PCM changed after its first hash must never be committed")
    postEncodeAudioStage.dispose()

    let producerAbortObserved = false
    let fakeClosed = false
    const earlyExitRuntime = createH264ExportRuntime({
        ffmpegPath, freeSpaceReserveBytes: 0, randomBytes: () => Buffer.alloc(16, 17),
        spawnProcess: () => {
            const child = new EventEmitter()
            child.stdin = new PassThrough()
            child.stderr = new PassThrough()
            child.kill = () => {
                if (!fakeClosed) setImmediate(() => { fakeClosed = true; child.emit("close", 1) })
                return true
            }
            setTimeout(() => { if (!fakeClosed) { fakeClosed = true; child.emit("close", 1) } }, 20)
            return child
        },
    })
    const earlyExitDestination = path.join(temporary, "early-exit.mp4")
    const earlyExitStartedAt = Date.now()
    await assert.rejects(earlyExitRuntime.run({
        snapshot, destination: earlyExitDestination, destinationAuthority: destinationAuthority(earlyExitDestination, parent), audio,
        signal: new AbortController().signal,
        renderFrame: async ({ signal }) => {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(resolve, 1_000)
                signal.addEventListener("abort", () => { clearTimeout(timeout); producerAbortObserved = true; reject(new HostPortError("verification_failed")) }, { once: true })
            })
            return rgbaPng(64, 64, 1)
        },
    }), (error) => error instanceof HostPortError && error.code === "verification_failed")
    assert.equal(fakeClosed, true)
    assert.equal(producerAbortObserved, true, "early child exit must abort the in-flight renderer through the composite producer signal")
    assert.ok(Date.now() - earlyExitStartedAt < 500, "composite cancellation must not leave renderer IPC alive for its 30 second public timeout")
    assert.equal(fs.existsSync(earlyExitDestination), false)

    const unreapedDecodeDestination = path.join(temporary, "unreaped-decode.mp4")
    const unreapedDecodeController = new AbortController()
    let decodeKillRequested = false
    const unreapedDecodeRuntime = createH264ExportRuntime({
        ffmpegPath, freeSpaceReserveBytes: 0, randomBytes: () => Buffer.alloc(16, 19), reapTimeoutMs: 20,
        spawnProcess: (command, args, options) => {
            if (!args.includes("pipe:3") || !args.includes("pipe:1")) return spawn(command, args, options)
            const child = new EventEmitter()
            child.stdout = new PassThrough()
            child.stderr = new PassThrough()
            child.kill = () => { decodeKillRequested = true; return true }
            setImmediate(() => unreapedDecodeController.abort())
            return child
        },
    })
    const unreapedStartedAt = Date.now()
    await assert.rejects(unreapedDecodeRuntime.run({
        snapshot, destination: unreapedDecodeDestination, destinationAuthority: destinationAuthority(unreapedDecodeDestination, parent), audio,
        signal: unreapedDecodeController.signal, renderFrame: ({ frameIndex }) => rgbaPng(64, 64, frameIndex + 1),
    }), (error) => error instanceof HostPortError && error.code === "cancelled")
    assert.equal(decodeKillRequested, true)
    assert.ok(Date.now() - unreapedStartedAt < 2_000, "decode cancellation must settle even when a child never emits close")
    assert.equal(fs.existsSync(unreapedDecodeDestination), false)

    const verifyCancelled = path.join(temporary, "verify-cancelled.mp4")
    const verifyController = new AbortController()
    await assert.rejects(runtime.run({
        snapshot, destination: verifyCancelled, destinationAuthority: destinationAuthority(verifyCancelled, parent), audio,
        signal: verifyController.signal,
        renderFrame: ({ frameIndex }) => rgbaPng(64, 64, frameIndex + 1),
        onProgress: (value) => { if (value.phase === "verifying") verifyController.abort() },
    }), (error) => error instanceof HostPortError && error.code === "cancelled")
    assert.equal(fs.existsSync(verifyCancelled), false)

    const prior = path.join(temporary, "prior.mp4")
    fs.writeFileSync(prior, "preserve-me")
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(runtime.run({
        snapshot, destination: prior, destinationAuthority: destinationAuthority(prior, parent), audio,
        signal: controller.signal, renderFrame: () => rgbaPng(64, 64, 2),
    }), (error) => error instanceof HostPortError && error.code === "cancelled")
    assert.equal(fs.readFileSync(prior, "utf8"), "preserve-me")
    assert.equal(fs.readdirSync(temporary).some((name) => name.startsWith(".gallery-h264-")), false)
} finally {
    audioStage?.dispose()
    fs.rmSync(temporary, { recursive: true, force: true })
}

console.log("Verified: G06B deterministic H.264/AAC encode, opacity, async identity verification, exclusive owner-only staging, output quotas, full decode verification, cancellation, destination-race preservation, and post-commit observer isolation.")
}

run().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
