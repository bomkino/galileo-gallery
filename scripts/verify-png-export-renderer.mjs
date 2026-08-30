import assert from "node:assert/strict"
import { DEFAULT_SETTINGS } from "../src/defaults.ts"
import { createHostBackedAPI } from "../src/runtime.ts"

function deferred() {
    let resolve
    let reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
}

const request = {
    config: { schemaVersion: 2, styleId: "quiet-carousel", items: [], settings: { backgroundStyle: "transparent" } },
    width: 64, height: 64, fps: 10, durationMs: 150, format: "png-frames", posterFrame: "none", quality: "master",
}

const pngCapability = { id: "png-frames", available: true, alpha: true, audio: false, sceneVersions: [{ id: "quiet-carousel", versions: [1] }, { id: "vitrine", versions: [2] }], consequence: "No audio." }

const vitrineConfig = {
    schemaVersion: 2,
    styleId: "vitrine",
    sceneVersion: 2,
    timelineMode: "automatic",
    timelineFixedDurationMs: 0,
    timelineSegments: [],
    items: [{
        id: "edition-one",
        name: "Edition One.png",
        type: "image",
        url: `reel-media://grant/${"4".repeat(64)}`,
        ratio: 1,
        aspectMode: "auto",
        ratioW: 1,
        ratioH: 1,
        fit: "contain",
        crop: { x: 0, y: 0, width: 1, height: 1 },
        focal: { x: 0.5, y: 0.5 },
        caption: "Edition one",
        spotlight: false,
        muted: false,
    }],
    settings: {
        ...DEFAULT_SETTINGS,
        axis: "horizontal",
        backgroundStyle: "transparent",
        holdMs: 1_400,
        paceMs: 760,
        playKind: "once",
        repeatCount: 1,
        spotlightsEnabled: false,
        finaleEnabled: true,
        slideHeight: 62,
        tilt: 5,
        sway: 18,
        transitionDirection: "left",
    },
}

const vitrineRequest = {
    config: vitrineConfig,
    width: 64,
    height: 64,
    fps: 10,
    durationMs: 2_160,
    cycleDurationMs: 2_160,
    finalCycleDurationMs: 2_160,
    format: "png-frames",
    posterFrame: "none",
    quality: "master",
}

function baseHost(overrides = {}) {
    return {
        platform: "linux",
        exportCapabilities: async () => ({ version: 1, formats: [pngCapability] }),
        preflightPngFrames: async () => ({ snapshotId: "1".repeat(32), format: "png-frames", width: 64, height: 64, fps: 10, durationMs: 150, frameCount: 2, alpha: true, audio: "none", consequence: "No audio." }),
        choosePngFramesDestination: async () => ({ cancelled: false, destinationGrant: "2".repeat(64) }),
        startPngFramesExport: async () => ({ format: "png-frames", frameCount: 2, width: 64, height: 64, alpha: true, audio: "none", manifestSha256: "3".repeat(64) }),
        cancelExport: async () => ({ cancelled: true }),
        cancelAudio: async () => ({ cancelled: 0 }),
        onExportProgress: () => () => {},
        ...overrides,
    }
}

async function run() {
    const chooser = deferred()
    let chooserCancels = 0
    const chooserApi = createHostBackedAPI(baseHost({
        choosePngFramesDestination: () => chooser.promise,
        cancelExport: async () => { chooserCancels += 1; return { cancelled: true } },
    }))
    const choosing = chooserApi.exportReel(request)
    await new Promise((resolve) => setImmediate(resolve))
    await chooserApi.cancelExport()
    chooser.resolve({ cancelled: false, destinationGrant: "2".repeat(64) })
    assert.deepEqual(await choosing, { cancelled: true }, "cancel during destination choice must remain cancellation, not conflict/error")
    assert.ok(chooserCancels >= 2, "renderer cancellation and prepared-host cleanup must both be attempted")

    const active = deferred()
    let activeCancels = 0
    const activeApi = createHostBackedAPI(baseHost({
        startPngFramesExport: () => active.promise,
        cancelExport: async () => {
            activeCancels += 1
            const error = new Error("cancelled"); error.code = "cancelled"; active.reject(error)
            return { cancelled: true }
        },
    }))
    const exporting = activeApi.exportReel(request)
    await new Promise((resolve) => setImmediate(resolve))
    await activeApi.cancelExport()
    assert.deepEqual(await exporting, { cancelled: true }, "active job cancellation must not surface as export error")
    assert.equal(activeCancels, 1)

    const blocked = deferred()
    const ownedApi = createHostBackedAPI(baseHost({ exportCapabilities: () => blocked.promise }))
    const first = ownedApi.exportReel(request)
    await assert.rejects(ownedApi.exportReel(request), /already running/, "double click must not start a second export workflow")
    blocked.resolve({ version: 1, formats: [pngCapability] })
    await first

    let subscribed
    const progressApi = createHostBackedAPI(baseHost({ onExportProgress: (callback) => { subscribed = callback; return () => { subscribed = undefined } } }))
    let progress
    const unsubscribe = progressApi.onExportProgress((value) => { progress = value })
    subscribed({ exportId: "png-123", phase: "rendering", progress: 0.5, frame: 1, totalFrames: 2 })
    assert.equal(progress.phase, "rendering")
    unsubscribe()
    assert.equal(subscribed, undefined)

    let vitrinePreflights = 0
    let vitrineIntent
    const vitrineApi = createHostBackedAPI(baseHost({
        preflightPngFrames: async (intent) => {
            vitrinePreflights += 1
            vitrineIntent = intent
            return { snapshotId: "5".repeat(32), format: "png-frames", width: 64, height: 64, fps: 10, durationMs: 2_160, frameCount: 22, alpha: true, audio: "none", consequence: "No audio." }
        },
    }))
    const { cycleDurationMs: _omittedCycle, ...withoutCycle } = vitrineRequest
    await assert.rejects(vitrineApi.exportReel(withoutCycle), /clocks do not match/, "Vitrine cycle clock must be explicit")
    assert.equal(vitrinePreflights, 0, "missing Vitrine clock must not reach host preflight")
    for (const patch of [
        { durationMs: 2_161 },
        { cycleDurationMs: 2_161 },
        { finalCycleDurationMs: 2_161 },
    ]) {
        await assert.rejects(vitrineApi.exportReel({ ...vitrineRequest, ...patch }), /clocks do not match/)
        assert.equal(vitrinePreflights, 0, "mismatched Vitrine clock must not reach host preflight")
    }
    await assert.rejects(vitrineApi.exportReel({
        ...vitrineRequest,
        config: { ...vitrineConfig, timelineMode: "mystery" },
    }), /Timeline intent/, "unknown Vitrine Timeline mode must fail locally")
    assert.equal(vitrinePreflights, 0)
    await assert.rejects(vitrineApi.exportReel({
        ...vitrineRequest,
        config: {
            ...vitrineConfig,
            timelineMode: "directed",
            settings: { ...vitrineConfig.settings, playKind: "loop" },
            timelineSegments: [{ id: 17, kind: "hold", cycles: 0, paceScale: 1, durationMs: 600 }],
        },
    }), /directed Vitrine segment/, "non-string Vitrine segment identity must fail locally")
    assert.equal(vitrinePreflights, 0)
    assert.deepEqual(await vitrineApi.exportReel(vitrineRequest), {})
    assert.equal(vitrinePreflights, 1)
    assert.equal(vitrineIntent.durationMs, 2_160)
    assert.equal(vitrineIntent.cycleDurationMs, 2_160)
    assert.equal(vitrineIntent.finalCycleDurationMs, 2_160)
    assert.equal(vitrineIntent.config, vitrineConfig)

    console.log("Verified: renderer host adapter owns one workflow, translates cancellation, and rejects missing, mismatched, or invalid Vitrine clocks before host preflight.")
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
