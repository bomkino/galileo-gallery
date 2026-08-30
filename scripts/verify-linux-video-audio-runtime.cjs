const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { createLinuxVideoAudioRuntime } = require("../electron/linux-video-audio-runtime.cjs")

if (process.platform !== "linux") {
    console.log("Skipped: G05 Linux source-video audio runtime is Linux-only.")
    process.exit(0)
}

const pinnedFFmpeg = require("ffmpeg-static")
const ffmpeg = process.env.FFMPEG_PATH || (pinnedFFmpeg && fs.existsSync(pinnedFFmpeg) ? pinnedFFmpeg : "/usr/bin/ffmpeg")
if (!ffmpeg || !fs.existsSync(ffmpeg)) throw new Error("FFmpeg is required for the G05 source-video audio runtime check.")
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-g05-video-audio-"))

function grant(filePath, token, mime = "video/mp4") {
    const stat = fs.statSync(filePath)
    return { token, filePath, mime, bytes: stat.size, device: stat.dev, inode: stat.ino, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs }
}

function makeVideo(target, withAudio) {
    const inputs = ["-f", "lavfi", "-i", "color=c=#302b25:s=96x54:r=24:d=1"]
    if (withAudio) inputs.push("-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1")
    const output = withAudio
        ? ["-shortest", "-c:v", "mpeg4", "-q:v", "12", "-c:a", "pcm_s16le", target]
        : ["-c:v", "mpeg4", "-q:v", "12", target]
    const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...inputs, ...output], { encoding: "utf8" })
    if (result.status !== 0) throw new Error(result.stderr || "Could not create source-video fixture.")
}

function makeDelayedVideo(target) {
    const result = spawnSync(ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "color=c=#302b25:s=96x54:r=24:d=1",
        "-itsoffset", "0.25", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.5",
        "-c:v", "mpeg4", "-q:v", "12", "-c:a", "pcm_s16le", target,
    ], { encoding: "utf8" })
    if (result.status !== 0) throw new Error(result.stderr || "Could not create delayed source-video fixture.")
}

async function run() {
    const videoPath = path.join(temporary, "with-audio.mov")
    const silentPath = path.join(temporary, "silent.mov")
    makeVideo(videoPath, true)
    makeVideo(silentPath, false)
    const runtimeRoot = path.join(temporary, "runtime")
    fs.mkdirSync(runtimeRoot, { mode: 0o700 })
    const oldSession = path.join(runtimeRoot, "session-00000000-0000-4000-8000-000000000001")
    const sentinel = path.join(runtimeRoot, "session-not-a-uuid")
    const symlinkTarget = path.join(temporary, "symlink-target")
    fs.mkdirSync(oldSession)
    fs.mkdirSync(sentinel)
    fs.mkdirSync(symlinkTarget)
    fs.symlinkSync(symlinkTarget, path.join(runtimeRoot, "session-00000000-0000-4000-8000-000000000002"), "dir")
    const runtime = createLinuxVideoAudioRuntime({ root: runtimeRoot, ffmpegPath: ffmpeg, freeSpaceReserveBytes: 0 })
    assert.equal(fs.existsSync(oldSession), false)
    assert.equal(fs.existsSync(sentinel), true)
    assert.equal(fs.existsSync(symlinkTarget), true)
    const liveSession = fs.readdirSync(runtimeRoot).find((entry) => fs.lstatSync(path.join(runtimeRoot, entry)).isDirectory() && entry !== path.basename(sentinel))
    assert(liveSession)
    assert.equal(fs.statSync(path.join(runtimeRoot, liveSession)).mode & 0o777, 0o700)
    const sourceGrant = grant(videoPath, "a".repeat(64))
    const metadata = await runtime.prepare(sourceGrant, 1_000_000)
    assert.deepEqual(metadata, { sampleRate: 48_000, channels: 2, sampleFrames: 48_000 })
    assert.deepEqual(await runtime.prepare(sourceGrant, 1_000_000), metadata)
    await assert.rejects(runtime.prepare(sourceGrant, 2_000_000), (error) => error.code === "conflict")
    const canonical = runtime.resolve(sourceGrant)
    assert.equal(canonical.mime, "audio/wav")
    assert.equal(canonical.bytes, 48_000 * 4 + 44)
    assert.equal(fs.statSync(canonical.filePath).mode & 0o777, 0o600)
    const bytes = fs.readFileSync(canonical.filePath)
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF")
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE")
    assert.equal(bytes.readUInt32LE(40), 48_000 * 4)
    assert.notEqual(bytes.subarray(44).every((value) => value === 0), true)

    const delayedPath = path.join(temporary, "delayed-audio.mov")
    makeDelayedVideo(delayedPath)
    const delayedGrant = grant(delayedPath, "9".repeat(64))
    const delayedMetadata = await runtime.prepare(delayedGrant, 1_000_000)
    assert.equal(delayedMetadata.sampleFrames, 48_000)
    const delayedBytes = fs.readFileSync(runtime.resolve(delayedGrant).filePath).subarray(44)
    assert.equal(delayedBytes.subarray(0, 12_000 * 4).every((value) => value === 0), true)
    assert.notEqual(delayedBytes.subarray(12_000 * 4, 12_100 * 4).every((value) => value === 0), true)
    assert.equal(delayedBytes.subarray(36_000 * 4).every((value) => value === 0), true)

    const replacement = path.join(temporary, "replacement.mp4")
    fs.copyFileSync(silentPath, replacement)
    fs.renameSync(replacement, videoPath)
    assert.throws(() => runtime.resolve(sourceGrant), (error) => error.code === "verification_failed")
    assert.equal(runtime.revoke(sourceGrant), true)
    assert.throws(() => runtime.resolve(sourceGrant), (error) => error.code === "unsupported_capability")
    runtime.dispose()
    assert.equal(fs.existsSync(path.join(runtimeRoot, liveSession)), false)
    assert.equal(fs.existsSync(sentinel), true)
    assert.equal(fs.existsSync(symlinkTarget), true)

    const silentRuntime = createLinuxVideoAudioRuntime({ root: path.join(temporary, "silent-runtime"), ffmpegPath: ffmpeg, freeSpaceReserveBytes: 0 })
    await assert.rejects(silentRuntime.prepare(grant(silentPath, "b".repeat(64)), 1_000_000), (error) => error.code === "unsupported_capability")
    const junkPath = path.join(temporary, "junk.mov")
    fs.writeFileSync(junkPath, "not a media container")
    await assert.rejects(silentRuntime.prepare(grant(junkPath, "0".repeat(64)), 1_000_000), (error) => error.code === "corrupt_input")
    silentRuntime.dispose()

    const capped = createLinuxVideoAudioRuntime({ root: path.join(temporary, "capped-runtime"), ffmpegPath: ffmpeg, maximumBytes: 1024, freeSpaceReserveBytes: 0 })
    await assert.rejects(capped.prepare(grant(silentPath, "c".repeat(64)), 1_000_000), (error) => error.code === "resource_limit")
    const audioVideo = path.join(temporary, "cap-audio.mov")
    makeVideo(audioVideo, true)
    await assert.rejects(capped.prepare(grant(audioVideo, "d".repeat(64)), 1_000_000), (error) => error.code === "resource_limit")
    capped.dispose()

    const cancelled = createLinuxVideoAudioRuntime({ root: path.join(temporary, "cancelled-runtime"), ffmpegPath: ffmpeg, freeSpaceReserveBytes: 0 })
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(cancelled.prepare(grant(audioVideo, "e".repeat(64)), 1_000_000, controller.signal), (error) => error.code === "cancelled")
    cancelled.dispose()

    const missingPath = path.join(temporary, "missing.mov")
    fs.copyFileSync(audioVideo, missingPath)
    const missingGrant = grant(missingPath, "f".repeat(64))
    fs.unlinkSync(missingPath)
    const missingRuntime = createLinuxVideoAudioRuntime({ root: path.join(temporary, "missing-runtime"), ffmpegPath: ffmpeg, freeSpaceReserveBytes: 0 })
    await assert.rejects(missingRuntime.prepare(missingGrant, 1_000_000), (error) => error.code === "verification_failed")
    missingRuntime.dispose()

    const lruRuntime = createLinuxVideoAudioRuntime({ root: path.join(temporary, "lru-runtime"), ffmpegPath: ffmpeg, maximumEntries: 1, maximumTotalBytes: 300_000, freeSpaceReserveBytes: 0 })
    const firstGrant = grant(audioVideo, "1".repeat(64))
    const secondVideo = path.join(temporary, "second-audio.mov")
    makeVideo(secondVideo, true)
    const secondGrant = grant(secondVideo, "2".repeat(64))
    await lruRuntime.prepare(firstGrant, 1_000_000)
    await assert.rejects(lruRuntime.prepare(secondGrant, 1_000_000), (error) => error.code === "resource_limit")
    assert.equal(lruRuntime.resolve(firstGrant).mime, "audio/wav")
    assert.throws(() => lruRuntime.resolve(secondGrant), (error) => error.code === "unsupported_capability")
    lruRuntime.dispose()

    const endless = path.join(temporary, "endless-ffmpeg")
    fs.writeFileSync(endless, `#!${process.execPath}\nconst frame=Buffer.alloc(4);setInterval(()=>process.stdout.write(frame),5)\n`, { mode: 0o700 })
    const liveAbort = createLinuxVideoAudioRuntime({ root: path.join(temporary, "live-abort-runtime"), ffmpegPath: endless, freeSpaceReserveBytes: 0 })
    const liveController = new AbortController()
    const livePending = liveAbort.prepare(secondGrant, 1_000_000, liveController.signal)
    await new Promise((resolve) => setTimeout(resolve, 25))
    const concurrent = liveAbort.prepare(firstGrant, 1_000_000)
    await assert.rejects(concurrent, (error) => error.code === "resource_limit")
    liveController.abort()
    await assert.rejects(livePending, (error) => error.code === "cancelled")
    liveAbort.dispose()

    const timed = createLinuxVideoAudioRuntime({ root: path.join(temporary, "timeout-runtime"), ffmpegPath: endless, timeoutMs: 20, freeSpaceReserveBytes: 0 })
    await assert.rejects(timed.prepare(secondGrant, 1_000_000), (error) => error.code === "resource_limit")
    timed.dispose()

    const disposing = createLinuxVideoAudioRuntime({ root: path.join(temporary, "dispose-runtime"), ffmpegPath: endless, freeSpaceReserveBytes: 0 })
    const inFlight = disposing.prepare(secondGrant, 1_000_000)
    await new Promise((resolve) => setTimeout(resolve, 25))
    disposing.dispose()
    await assert.rejects(inFlight, (error) => error.code === "cancelled")
    await assert.rejects(disposing.prepare(secondGrant, 1_000_000), (error) => error.code === "host_unavailable")

    const environmentProbe = path.join(temporary, "environment-ffmpeg")
    fs.writeFileSync(environmentProbe, `#!${process.execPath}\nif(process.env.GALLERY_SECRET_SENTINEL)process.exit(7);process.stdout.write(Buffer.alloc(192000))\n`, { mode: 0o700 })
    process.env.GALLERY_SECRET_SENTINEL = "must-not-cross"
    const isolated = createLinuxVideoAudioRuntime({ root: path.join(temporary, "isolated-runtime"), ffmpegPath: environmentProbe, freeSpaceReserveBytes: 0 })
    assert.deepEqual(await isolated.prepare(secondGrant, 1_000_000), { sampleRate: 48_000, channels: 2, sampleFrames: 48_000 })
    isolated.dispose()
    delete process.env.GALLERY_SECRET_SENTINEL

    const absent = createLinuxVideoAudioRuntime({ root: path.join(temporary, "absent-runtime"), ffmpegPath: path.join(temporary, "missing-ffmpeg"), freeSpaceReserveBytes: 0 })
    await assert.rejects(absent.prepare(secondGrant, 1_000_000), (error) => error.code === "host_unavailable")
    absent.dispose()

    console.log("Verified: bounded Linux source-video audio preparation, deterministic PCM16 WAV/time origin, transactional cache authority, mutation/corruption rejection, no-audio failure, caps, cancellation/disposal, revocation, and cleanup.")
}

run().finally(() => fs.rmSync(temporary, { recursive: true, force: true })).catch((error) => {
    console.error(error)
    process.exitCode = 1
})
