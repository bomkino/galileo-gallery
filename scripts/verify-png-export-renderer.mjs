import assert from "node:assert/strict"
import { DEFAULT_SETTINGS } from "../src/defaults.ts"
import { defaultAudioIntent } from "../src/audio/audioTimeline.ts"
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
    const normalizedVitrineConfig = { ...vitrineConfig, sceneParameters: {} }
    assert.deepEqual(await vitrineApi.exportReel({ ...vitrineRequest, config: normalizedVitrineConfig }), {})
    assert.equal(vitrinePreflights, 2)
    assert.deepEqual(vitrineIntent.config, vitrineConfig, "verified Vitrine host snapshot must omit unrelated authored Scene parameters")
    assert.equal(Object.hasOwn(vitrineIntent.config, "sceneParameters"), false)

    const priorGlobals = Object.fromEntries(["window", "document", "Image", "HTMLMediaElement", "HTMLVideoElement"].map((key) => [key, globalThis[key]]))
    class FakeHTMLMediaElement {
        constructor(mode) { this.mode = mode; this.source = ""; this.loadCalls = 0; this.pauseCalls = 0 }
        set src(value) { this.source = value }
        get src() { return this.source }
        removeAttribute(name) { if (name === "src") this.source = "" }
        pause() { this.pauseCalls += 1 }
        load() {
            this.loadCalls += 1
            if (!this.source) return
            if (this.mode === "pending") return
            queueMicrotask(() => this.mode === "error" ? this.onerror?.() : this.onloadeddata?.())
        }
    }
    class FakeHTMLVideoElement extends FakeHTMLMediaElement {}
    let videoMode = "loaded"
    const videoModes = []
    const videos = []
    globalThis.HTMLMediaElement = FakeHTMLMediaElement
    globalThis.HTMLVideoElement = FakeHTMLVideoElement
    globalThis.Image = class {}
    globalThis.document = { createElement: (tag) => {
        assert.equal(tag, "video")
        const video = new FakeHTMLVideoElement(videoModes.shift() ?? videoMode)
        videos.push(video)
        return video
    } }
    globalThis.window = {
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        requestAnimationFrame: (callback) => globalThis.setImmediate(callback),
    }
    try {
        const videoConfig = {
            ...vitrineConfig,
            audio: defaultAudioIntent(),
            items: [{ ...vitrineConfig.items[0], id: "edition-video", name: "Edition Video.mp4", type: "video", url: `reel-media://grant/${"6".repeat(64)}` }],
        }
        let accepts = 0
        let discards = 0
        const openHost = (mode, candidateConfig = videoConfig, overrides = {}) => baseHost({
            beginProjectOpen: async () => ({ operationId: "7".repeat(32), candidateGeneration: 2, config: candidateConfig }),
            acceptProjectOpen: async () => {
                accepts += 1
                const video = videos.at(-1)
                assert.equal(video.source, "", "candidate video authority must be released before accept")
                assert.equal(video.pauseCalls, 1)
                assert.equal(video.loadCalls, 2)
                return { generation: 2 }
            },
            discardProjectOpen: async () => { discards += 1; return { discarded: true } },
            cancelProjectOpen: async () => ({ cancelled: true }),
            prepareVideoAudio: async () => { throw new Error("no source-video audio expected") },
            mode,
            ...overrides,
        })
        videoMode = "error"
        await assert.rejects(createHostBackedAPI(openHost("error")).openProject(), /Could not hydrate Edition Video/)
        assert.equal(accepts, 0, "corrupt Vitrine video must not replace the prior Project")
        assert.equal(discards, 1, "corrupt Vitrine video candidate must be discarded")
        assert.equal(videos.at(-1).source, "")
        assert.equal(videos.at(-1).pauseCalls, 1)
        assert.equal(videos.at(-1).loadCalls, 2)

        const threeVideoConfig = {
            ...videoConfig,
            items: Array.from({ length: 3 }, (_, index) => ({
                ...videoConfig.items[0], id: `edition-video-${index}`, name: `Edition Video ${index}.mp4`, url: `reel-media://grant/${String(index + 7).repeat(64)}`,
            })),
        }
        const failureStart = videos.length
        videoModes.push("error", "loaded", "loaded")
        await assert.rejects(createHostBackedAPI(openHost("mixed", threeVideoConfig)).openProject(), /Could not hydrate Edition Video 0/)
        const failedWorkers = videos.slice(failureStart)
        assert.equal(failedWorkers.length, 2, "first worker failure must stop a third candidate grant from starting")
        assert(failedWorkers.every((video) => video.source === "" && video.pauseCalls === 1 && video.loadCalls === 2), "all concurrent candidate decoders must drain and release before discard")
        assert.equal(accepts, 0)
        assert.equal(discards, 2)
        videoModes.length = 0

        let hostOpenCancels = 0
        let hostCancelled = false
        const cancellationStart = videos.length
        videoModes.push("pending", "pending", "loaded")
        const cancelApi = createHostBackedAPI(openHost("pending", threeVideoConfig, {
            cancelProjectOpen: async () => { hostOpenCancels += 1; hostCancelled = true; return { cancelled: true } },
            discardProjectOpen: async () => {
                if (hostCancelled) throw new Error("candidate already discarded")
                discards += 1
                return { discarded: true }
            },
        }))
        const pendingOpen = cancelApi.openProject()
        await new Promise((resolve) => setImmediate(resolve))
        assert.deepEqual(await cancelApi.cancelProjectOpen(), { cancelled: true })
        assert.deepEqual(await pendingOpen, { cancelled: true }, "cancelled hydration must resolve as cancellation, not conflict or decoder error")
        const cancelledWorkers = videos.slice(cancellationStart)
        assert.equal(cancelledWorkers.length, 2, "cancellation must stop a third candidate grant from starting")
        assert(cancelledWorkers.every((video) => video.source === "" && video.pauseCalls === 1 && video.loadCalls === 2), "cancellation must drain and release both decoder workers")
        assert.equal(hostOpenCancels, 1)
        assert.equal(accepts, 0)
        videoModes.length = 0

        videoMode = "loaded"
        const opened = await createHostBackedAPI(openHost("loaded")).openProject()
        assert.equal(opened.config, videoConfig)
        assert.equal(accepts, 1)
        assert.equal(discards, 2)
    } finally {
        for (const [key, value] of Object.entries(priorGlobals)) {
            if (value === undefined) delete globalThis[key]
            else globalThis[key] = value
        }
    }

    console.log("Verified: renderer host adapter owns one workflow, rejects invalid Vitrine clocks, and accepts only decoded, released Project candidates.")
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
