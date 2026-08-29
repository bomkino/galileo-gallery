import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import { createHostBackedAPI } from "../src/runtime.ts"

const SNAPSHOT_ID = "1".repeat(32)
const DESTINATION_GRANT = "2".repeat(64)
const AUDIO_FRAMES = 6_000

const request = {
    config: {
        schemaVersion: 2,
        styleId: "quiet-carousel",
        items: [],
        settings: { backgroundStyle: "solid", playKind: "once", repeatCount: 1 },
    },
    width: 64,
    height: 64,
    fps: 24,
    durationMs: 125,
    format: "mp4",
    posterFrame: "none",
    quality: "master",
}

function baseHost(overrides = {}) {
    return {
        platform: "linux",
        exportCapabilities: async () => ({
            version: 1,
            formats: [
                { id: "png-frames", available: true, alpha: true, audio: false, consequence: "No audio." },
                { id: "mp4-h264-aac", available: true, alpha: false, audio: true, sceneIds: ["quiet-carousel"], consequence: "Verified AAC audio." },
            ],
        }),
        preflightH264: async () => ({
            snapshotId: SNAPSHOT_ID,
            format: "mp4-h264-aac",
            width: 64,
            height: 64,
            fps: 24,
            durationMs: 125,
            frameCount: 3,
            alpha: false,
            audio: "aac-48khz-stereo",
            audioFrameCount: AUDIO_FRAMES,
            consequence: "Verified AAC audio.",
        }),
        appendH264Audio: async (_snapshotId, startFrame, pcm16Base64) => {
            const acceptedFrames = Buffer.from(pcm16Base64, "base64").byteLength / 4
            return { acceptedFrames, nextFrame: startFrame + acceptedFrames }
        },
        finishH264Audio: async () => ({
            snapshotId: SNAPSHOT_ID,
            sampleRate: 48_000,
            channels: 2,
            sampleFrames: AUDIO_FRAMES,
            bytes: AUDIO_FRAMES * 4,
            sha256: "3".repeat(64),
        }),
        chooseH264Destination: async () => ({ cancelled: false, destinationGrant: DESTINATION_GRANT }),
        startH264Export: async () => ({
            format: "mp4-h264-aac",
            frameCount: 3,
            width: 64,
            height: 64,
            alpha: false,
            audio: "aac-48khz-stereo",
            audioFrameCount: AUDIO_FRAMES,
            bytes: 1_024,
            sha256: "4".repeat(64),
            videoDecodeSha256: "5".repeat(64),
            audioDecodeSha256: "6".repeat(64),
        }),
        cancelExport: async () => ({ cancelled: true }),
        cancelAudio: async () => ({ cancelled: 0 }),
        onExportProgress: () => () => {},
        ...overrides,
    }
}

async function run() {
    const chunks = []
    let finished = false
    let started = false
    const api = createHostBackedAPI(baseHost({
        appendH264Audio: async (snapshotId, startFrame, pcm16Base64) => {
            assert.equal(snapshotId, SNAPSHOT_ID)
            assert.equal(startFrame, chunks.reduce((sum, chunk) => sum + chunk.frames, 0), "audio chunks must be contiguous")
            const bytes = Buffer.from(pcm16Base64, "base64")
            assert.equal(bytes.byteLength % 4, 0, "PCM16 stereo chunks must contain complete sample frames")
            assert.ok(bytes.every((byte) => byte === 0), "an empty audio intent must stage deterministic silence")
            const frames = bytes.byteLength / 4
            assert.ok(frames > 0 && frames <= 65_536, "renderer chunks must stay inside the public staging bound")
            chunks.push({ startFrame, frames })
            return { acceptedFrames: frames, nextFrame: startFrame + frames }
        },
        finishH264Audio: async (snapshotId) => {
            assert.equal(snapshotId, SNAPSHOT_ID)
            assert.equal(chunks.reduce((sum, chunk) => sum + chunk.frames, 0), AUDIO_FRAMES)
            finished = true
            return { snapshotId, sampleRate: 48_000, channels: 2, sampleFrames: AUDIO_FRAMES, bytes: AUDIO_FRAMES * 4, sha256: "3".repeat(64) }
        },
        startH264Export: async (snapshotId, destinationGrant) => {
            assert.equal(finished, true, "encode must not start before the immutable PCM stage closes")
            assert.equal(snapshotId, SNAPSHOT_ID)
            assert.equal(destinationGrant, DESTINATION_GRANT)
            started = true
            return { format: "mp4-h264-aac", frameCount: 3, width: 64, height: 64, alpha: false, audio: "aac-48khz-stereo", audioFrameCount: AUDIO_FRAMES, bytes: 1_024, sha256: "4".repeat(64), videoDecodeSha256: "5".repeat(64), audioDecodeSha256: "6".repeat(64) }
        },
    }))
    assert.deepEqual(await api.exportReel(request), {})
    assert.deepEqual(chunks, [{ startFrame: 0, frames: 6_000 }])
    assert.equal(started, true)

    let cancelCalls = 0
    let appendCalls = 0
    let cancelledFinishCalls = 0
    const cancelledApi = createHostBackedAPI(baseHost({
        appendH264Audio: async (_snapshotId, startFrame, pcm16Base64) => {
            appendCalls += 1
            const frames = Buffer.from(pcm16Base64, "base64").byteLength / 4
            if (appendCalls === 1) await cancelledApi.cancelExport()
            return { acceptedFrames: frames, nextFrame: startFrame + frames }
        },
        cancelExport: async () => { cancelCalls += 1; return { cancelled: true } },
        finishH264Audio: async () => { cancelledFinishCalls += 1; throw new Error("cancelled renderer must not finish audio") },
        startH264Export: async () => { throw new Error("cancelled renderer must not start encode") },
    }))
    assert.deepEqual(await cancelledApi.exportReel(request), { cancelled: true })
    assert.equal(appendCalls, 1)
    assert.equal(cancelledFinishCalls, 0, "renderer cancellation must stop before finalizing the private PCM stage")
    assert.ok(cancelCalls >= 2, "renderer and prepared-host cleanup must both request cancellation")

    let releaseCapabilities
    let observeCapabilities
    let preHostPreflight = false
    const capabilitiesPending = new Promise((resolve) => { observeCapabilities = resolve })
    const preHostCancelApi = createHostBackedAPI(baseHost({
        exportCapabilities: async () => {
            observeCapabilities()
            await new Promise((resolve) => { releaseCapabilities = resolve })
            return baseHost().exportCapabilities()
        },
        cancelExport: async () => ({ cancelled: false }),
        preflightH264: async () => { preHostPreflight = true; throw new Error("cancelled export must not preflight") },
    }))
    const preHostRun = preHostCancelApi.exportReel(request)
    await capabilitiesPending
    await preHostCancelApi.cancelExport()
    releaseCapabilities()
    assert.deepEqual(await preHostRun, { cancelled: true })
    assert.equal(preHostPreflight, false, "renderer-owned cancellation before host allocation must remain authoritative without a host acknowledgement")

    let releaseUnacknowledgedAppend
    let observeUnacknowledgedAppend
    const unacknowledgedAppend = new Promise((resolve) => { observeUnacknowledgedAppend = resolve })
    const unacknowledgedApi = createHostBackedAPI(baseHost({
        appendH264Audio: async (_snapshotId, startFrame, pcm16Base64) => {
            observeUnacknowledgedAppend()
            await new Promise((resolve) => { releaseUnacknowledgedAppend = resolve })
            const frames = Buffer.from(pcm16Base64, "base64").byteLength / 4
            return { acceptedFrames: frames, nextFrame: startFrame + frames }
        },
        cancelExport: async () => ({ cancelled: false }),
    }))
    const unacknowledgedRun = unacknowledgedApi.exportReel(request)
    await unacknowledgedAppend
    await assert.rejects(unacknowledgedApi.cancelExport(), /did not acknowledge/, "renderer must not claim cancellation while the host keeps encoding")
    releaseUnacknowledgedAppend()
    assert.deepEqual(await unacknowledgedRun, {}, "a failed cancellation acknowledgement must leave the still-owned export observable")

    await assert.rejects(
        createHostBackedAPI(baseHost({
            exportCapabilities: async () => ({ version: 1, formats: [{ id: "png-frames", available: true, alpha: true, audio: false, consequence: "No audio." }] }),
        })).exportReel(request),
        /unavailable/,
        "renderer must refuse a host that does not advertise verified H.264/AAC",
    )

    let unavailablePreflight = false
    const unavailableReason = "H.264/AAC is unavailable because the bundled FFmpeg runtime is missing or not executable. Choose PNG Frames."
    await assert.rejects(
        createHostBackedAPI(baseHost({
            exportCapabilities: async () => ({ version: 1, formats: [
                { id: "png-frames", available: true, alpha: true, audio: false, consequence: "No audio." },
                { id: "mp4-h264-aac", available: false, alpha: false, audio: true, sceneIds: ["quiet-carousel"], consequence: unavailableReason },
            ] }),
            preflightH264: async () => { unavailablePreflight = true; throw new Error("must not preflight") },
        })).exportReel(request),
        (error) => error instanceof Error && error.message === unavailableReason,
        "renderer must preserve the host-validated unavailable-format reason",
    )
    assert.equal(unavailablePreflight, false)

    let failedStageCancels = 0
    const failedStageApi = createHostBackedAPI(baseHost({
        appendH264Audio: async () => { throw new Error("staging failed") },
        cancelExport: async () => { failedStageCancels += 1; return { cancelled: true } },
    }))
    await assert.rejects(failedStageApi.exportReel(request), /staging failed/)
    assert.equal(failedStageCancels, 1, "renderer errors after preflight must dispose the host snapshot and private PCM stage")

    const conflict = Object.assign(new Error("conflict"), { code: "conflict", diagnosticId: "destination-race" })
    await assert.rejects(
        createHostBackedAPI(baseHost({ chooseH264Destination: async () => { throw conflict } })).exportReel(request),
        (error) => error?.code === "conflict" && error.message === "Choose a new filename; overwrite is not supported yet." && error.diagnosticId === "destination-race",
        "existing or raced MP4 destinations must receive a truthful no-overwrite instruction",
    )

    let settledStartCalls = 0
    let settledStartCleanupCalls = 0
    const retryAfterSettledStartApi = createHostBackedAPI(baseHost({
        startH264Export: async () => {
            settledStartCalls += 1
            if (settledStartCalls === 1) throw conflict
            return baseHost().startH264Export()
        },
        cancelExport: async () => { settledStartCleanupCalls += 1; return { cancelled: false } },
    }))
    await assert.rejects(
        retryAfterSettledStartApi.exportReel(request),
        (error) => error?.code === "conflict" && error.message === "Choose a new filename; overwrite is not supported yet.",
        "a host-side destination race after start must stay truthful",
    )
    assert.deepEqual(await retryAfterSettledStartApi.exportReel(request), {}, "a settled host start rejection must release renderer ownership for retry")
    assert.equal(settledStartCalls, 2)
    assert.equal(settledStartCleanupCalls, 1, "the settled failure must still request host cleanup once")

    let mismatchedPreflight = false
    const mismatchedAudioApi = createHostBackedAPI(baseHost({
        preflightH264: async () => { mismatchedPreflight = true; throw new Error("must not preflight") },
    }))
    await assert.rejects(mismatchedAudioApi.exportReel({
        ...request,
        config: { ...request.config, audio: { id: "gallery-audio-intent", version: 1, sourceVideo: "per-media", sampleRate: 44_100, channels: 1, sources: [], lanes: [], ducking: { enabled: false, triggerLaneId: "presenter", targetLaneIds: [], amount: 0.5, attack: { numerator: 1, denominator: 20 }, release: { numerator: 1, denominator: 5 } }, master: { gain: 1, muted: false } } },
    }), /48 kHz stereo/)
    assert.equal(mismatchedPreflight, false, "unsupported Project audio masters must fail truthfully before allocating a host stage")

    let unsupportedScenePreflight = false
    await assert.rejects(createHostBackedAPI(baseHost({
        preflightH264: async () => { unsupportedScenePreflight = true; throw new Error("must not preflight") },
    })).exportReel({ ...request, config: { ...request.config, styleId: "opening-reel" } }), /Quiet Carousel only/)
    assert.equal(unsupportedScenePreflight, false, "non-Quiet Scenes must receive a truthful unavailable reason before host allocation")

    const overloadedAudio = {
        id: "gallery-audio-intent", version: 1, sourceVideo: "per-media", sampleRate: 48_000, channels: 2,
        sources: [{ id: "presenter-source", role: "presenter", sampleRate: 48_000, channels: 2, sampleFrames: AUDIO_FRAMES }],
        lanes: [{ id: "presenter-lane", name: "Presenter", role: "presenter", gain: 1, muted: false, solo: false, clips: Array.from({ length: 65 }, (_, index) => ({
            id: `clip-${index}`, sourceId: "presenter-source", timelineStart: { numerator: 0, denominator: 1 }, sourceIn: { numerator: 0, denominator: 1 },
            sourceSpan: { numerator: 1, denominator: 8 }, duration: { numerator: 1, denominator: 8 }, loop: false, gain: 1, muted: false,
            fadeIn: { numerator: 0, denominator: 1 }, fadeOut: { numerator: 0, denominator: 1 },
        })) }],
        ducking: { enabled: false, triggerLaneId: "presenter-lane", targetLaneIds: [], amount: 0.5, attack: { numerator: 1, denominator: 20 }, release: { numerator: 1, denominator: 5 } },
        master: { gain: 1, muted: false },
    }
    let overloadedPreflight = false
    await assert.rejects(createHostBackedAPI(baseHost({
        preflightH264: async () => { overloadedPreflight = true; throw new Error("must not preflight") },
    })).exportReel({ ...request, config: { ...request.config, audio: overloadedAudio } }), /64× story-work bound/)
    assert.equal(overloadedPreflight, false, "over-budget authored overlap must fail before allocating a host stage")

    console.log("Verified: G06B renderer public seam stages exact deterministic PCM, starts only after closure, cleans failures, honours cancellation, and reports Scene/audio/resource limits truthfully.")
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
