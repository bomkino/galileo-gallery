const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { HostPortError } = require("../electron/linux-host-port.cjs")
const { createH264AudioStage } = require("../electron/h264-audio-stage.cjs")
const { MAX_AUDIO_DECODE_REQUESTS, createH264Snapshot, h264Capability, h264Preflight } = require("../electron/h264-export-contract.cjs")

const grant = `reel-media://grant/${"a".repeat(64)}`
const intent = {
    config: {
        schemaVersion: 2,
        styleId: "quiet-carousel",
        items: [{ id: "one", name: "One", type: "image", url: grant, ratio: 1, spotlight: false, muted: false }],
        settings: { backgroundStyle: "solid", playKind: "repeat", repeatCount: 2 },
    },
    width: 64,
    height: 64,
    fps: 24,
    durationMs: 1_800,
    cycleDurationMs: 1_200,
    finalCycleDurationMs: 600,
    quality: "high",
}

function expectCode(work, code) {
    assert.throws(work, (error) => error instanceof HostPortError && error.code === code)
}

const snapshot = createH264Snapshot(intent, () => Buffer.alloc(16, 7))
assert.equal(snapshot.format, "mp4-h264-aac")
assert.equal(snapshot.frameCount, 43)
assert.equal(snapshot.durationMs, 43_000 / 24)
assert.equal(snapshot.audioFrameCount, 86_000)
assert.equal(snapshot.maximumAudioDecodeRequests, 0)
assert.equal(snapshot.cycleDurationMs, 1_200)
assert.equal(snapshot.finalCycleDurationMs, 600)
assert.equal(snapshot.config.audio.id, "gallery-audio-intent")
assert.equal(Object.isFrozen(snapshot.config.audio.master), true)
assert.deepEqual(h264Capability().sceneIds, ["quiet-carousel"])
assert.deepEqual({ available: h264Capability(false).available, consequence: h264Capability(false).consequence }, {
    available: false,
    consequence: "H.264/AAC is unavailable because the bundled FFmpeg runtime is missing or not executable. Choose PNG Frames.",
})
assert.deepEqual(h264Preflight(snapshot), {
    snapshotId: "07".repeat(16),
    format: "mp4-h264-aac",
    width: 64,
    height: 64,
    fps: 24,
    durationMs: 43_000 / 24,
    frameCount: 43,
    alpha: false,
    audio: "aac-48khz-stereo",
    audioFrameCount: 86_000,
    consequence: h264Capability().consequence,
})
expectCode(() => createH264Snapshot({ ...intent, width: 65 }), "invalid_request")
expectCode(() => createH264Snapshot({ ...intent, fps: 29 }), "invalid_request")
expectCode(() => createH264Snapshot({ ...intent, width: 7680, height: 4320 }), "resource_limit")
expectCode(() => createH264Snapshot({ ...intent, config: { ...intent.config, settings: { ...intent.config.settings, backgroundStyle: "transparent" } } }), "invalid_request")
expectCode(() => createH264Snapshot({ ...intent, config: { ...intent.config, styleId: "opening-reel" } }), "unsupported_capability")
expectCode(() => createH264Snapshot({ ...intent, config: { ...intent.config, settings: { ...intent.config.settings, playKind: "forever" } } }), "invalid_request")
expectCode(() => createH264Snapshot({ ...intent, config: { ...intent.config, settings: { ...intent.config.settings, repeatCount: 3 } } }), "invalid_request")
for (const repeatCount of [0, 1.5, 1_001]) expectCode(() => createH264Snapshot({ ...intent, config: { ...intent.config, settings: { ...intent.config.settings, repeatCount } } }), "invalid_request")
expectCode(() => createH264Snapshot({ ...intent, durationMs: 1_799 }), "invalid_request")
expectCode(() => createH264Snapshot({ ...intent, config: { ...intent.config, settings: { ...intent.config.settings, playKind: "once", repeatCount: 2 } } }), "invalid_request")
expectCode(() => createH264Snapshot({ ...intent, durationMs: 1_200, config: { ...intent.config, settings: { ...intent.config.settings, playKind: "loop" } } }), "invalid_request")

const overloadedAudio = {
    id: "gallery-audio-intent", version: 1, sourceVideo: "per-media", sampleRate: 48_000, channels: 2, sources: [],
    lanes: [{ id: "overlap", name: "Overlap", role: "presenter", gain: 1, muted: false, solo: false, clips: Array.from({ length: 65 }, (_, index) => ({
        id: `clip-${index}`, sourceId: "source", timelineStart: { numerator: 0, denominator: 1 }, sourceIn: { numerator: 0, denominator: 1 },
        sourceSpan: { numerator: 2, denominator: 1 }, duration: { numerator: 2, denominator: 1 }, loop: false, gain: 1, muted: false,
        fadeIn: { numerator: 0, denominator: 1 }, fadeOut: { numerator: 0, denominator: 1 },
    })) }],
    ducking: { enabled: false, triggerLaneId: "overlap", targetLaneIds: [], amount: 0.5, attack: { numerator: 1, denominator: 20 }, release: { numerator: 1, denominator: 5 } },
    master: { gain: 1, muted: false },
}
expectCode(() => createH264Snapshot({ ...intent, config: { ...intent.config, audio: overloadedAudio } }), "unsupported_capability")

const fragmentedAudio = {
    ...overloadedAudio,
    lanes: [{ ...overloadedAudio.lanes[0], clips: Array.from({ length: 513 }, (_, index) => ({
        ...overloadedAudio.lanes[0].clips[0], id: `fragment-${index}`, sourceSpan: { numerator: 1, denominator: 48_000 },
        duration: { numerator: 1, denominator: 48_000 },
    })) }],
}
const fragmentedSnapshot = createH264Snapshot({ ...intent, config: { ...intent.config, audio: fragmentedAudio } })
assert.ok(fragmentedSnapshot.maximumAudioDecodeRequests >= 513 && fragmentedSnapshot.maximumAudioDecodeRequests < MAX_AUDIO_DECODE_REQUESTS)

const requestBombAudio = {
    ...overloadedAudio,
    lanes: [{ ...overloadedAudio.lanes[0], clips: [{
        ...overloadedAudio.lanes[0].clips[0], id: "one-frame-loop", loop: true,
        sourceSpan: { numerator: 1, denominator: 48_000 }, duration: { numerator: 6, denominator: 1 },
    }] }],
}
expectCode(() => createH264Snapshot({ ...intent, durationMs: 6_000, cycleDurationMs: 6_000, finalCycleDurationMs: 6_000,
    config: { ...intent.config, settings: { ...intent.config.settings, playKind: "once" }, audio: requestBombAudio } }), "unsupported_capability")

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-h264-contract-"))
try {
    const tiny = createH264Snapshot({ ...intent, config: { ...intent.config, settings: { ...intent.config.settings, playKind: "once" } }, durationMs: 100, cycleDurationMs: 100, finalCycleDurationMs: 100, fps: 24 }, () => Buffer.alloc(16, 9))
    assert.equal(tiny.audioFrameCount, 4_000)
    expectCode(() => createH264AudioStage({ root: path.join(temporary, "quota"), snapshot: tiny, statfs: () => ({ bavail: 1, bsize: 1 }), freeSpaceReserveBytes: 0 }), "resource_limit")
    expectCode(() => createH264AudioStage({ root: path.join(temporary, "maximum"), snapshot: tiny, maximumBytes: 1, freeSpaceReserveBytes: 0 }), "resource_limit")
    fs.rmSync(path.join(temporary, "quota"), { recursive: true, force: true })
    fs.rmSync(path.join(temporary, "maximum"), { recursive: true, force: true })
    const stage = createH264AudioStage({ root: temporary, snapshot: tiny, randomBytes: () => Buffer.alloc(16, 3) })
    const first = Buffer.alloc(4_000 * 4)
    first.writeInt16LE(12_345, 0)
    expectCode(() => stage.append({ snapshotId: tiny.snapshotId, startFrame: 1, pcm16Base64: first.toString("base64") }), "invalid_request")
    expectCode(() => stage.append({ snapshotId: tiny.snapshotId, startFrame: 0, pcm16Base64: first.subarray(0, first.length / 2).toString("base64") }), "resource_limit")
    assert.deepEqual(stage.append({ snapshotId: tiny.snapshotId, startFrame: 0, pcm16Base64: first.toString("base64") }), { acceptedFrames: 4_000, nextFrame: 4_000 })
    const result = stage.finish({ snapshotId: tiny.snapshotId })
    assert.equal(result.sampleFrames, 4_000)
    assert.equal(result.bytes, 16_000)
    assert.match(result.sha256, /^[a-f0-9]{64}$/)
    const stagedStat = fs.statSync(result.filePath)
    assert.equal(stagedStat.isFile(), true)
    if (process.platform !== "win32") assert.equal(stagedStat.mode & 0o777, 0o600)
    expectCode(() => stage.append({ snapshotId: tiny.snapshotId, startFrame: 4_000, pcm16Base64: "AAAAAA==" }), "conflict")
    stage.dispose()
    assert.deepEqual(fs.readdirSync(temporary), [])

    const failedRoot = path.join(temporary, "failed-constructor")
    const originalOpen = fs.openSync
    fs.openSync = function injectedOpen(filePath, ...args) {
        if (String(filePath).endsWith(`${path.sep}mix.pcm`)) {
            const error = new Error("injected open failure")
            error.code = "EIO"
            throw error
        }
        return originalOpen.call(this, filePath, ...args)
    }
    try {
        assert.throws(() => createH264AudioStage({ root: failedRoot, snapshot: tiny, freeSpaceReserveBytes: 0, randomBytes: () => Buffer.alloc(16, 12) }), /injected open failure/)
    } finally { fs.openSync = originalOpen }
    assert.deepEqual(fs.readdirSync(failedRoot), [], "constructor failure must remove its private stage directory")

    const collisionRoot = path.join(temporary, "collision-root")
    const collisionStage = path.join(collisionRoot, `audio-${"12".repeat(16)}`)
    fs.mkdirSync(collisionStage, { recursive: true })
    fs.writeFileSync(path.join(collisionStage, "sentinel.txt"), "preserve-me")
    assert.throws(() => createH264AudioStage({ root: collisionRoot, snapshot: tiny, freeSpaceReserveBytes: 0, randomBytes: () => Buffer.alloc(16, 18) }), (error) => error?.code === "EEXIST")
    assert.equal(fs.readFileSync(path.join(collisionStage, "sentinel.txt"), "utf8"), "preserve-me", "nonce collision must never delete a directory this invocation did not create")
} finally {
    fs.rmSync(temporary, { recursive: true, force: true })
}

console.log("Verified: G06B immutable opaque H.264/AAC snapshots and contiguous bounded PCM staging.")
