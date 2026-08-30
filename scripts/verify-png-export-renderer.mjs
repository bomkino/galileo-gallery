import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { DEFAULT_SETTINGS } from "../src/defaults.ts"
import { defaultAudioIntent } from "../src/audio/audioTimeline.ts"
import { createHostBackedAPI, createLegacyBackedAPI } from "../src/runtime.ts"
import { compileShelfTimeline } from "../src/scenes/shelf.ts"

const require = createRequire(import.meta.url)
const { createPngFramesSnapshot } = require("../electron/png-export-contract.cjs")

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

const pngCapability = {
    id: "png-frames",
    available: true,
    alpha: true,
    audio: false,
    sceneVersions: [{ id: "quiet-carousel", versions: [1], video: true }, { id: "vitrine", versions: [2], video: true }, { id: "the-shelf", versions: [2], video: false }],
    consequence: "No audio.",
}

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

const shelfItems = Array.from({ length: 3 }, (_, index) => ({
    id: `shelf-edition-${index + 1}`,
    name: `Shelf Edition ${index + 1}.png`,
    type: "image",
    url: `reel-media://grant/${String(index + 7).repeat(64)}`,
    ratio: [0.8, 1, 16 / 9][index],
    aspectMode: "auto",
    ratioW: 1,
    ratioH: 1,
    fit: index === 1 ? "cover" : "contain",
    crop: index === 1 ? { x: 0.1, y: 0.2, width: 0.8, height: 0.6 } : { x: 0, y: 0, width: 1, height: 1 },
    focal: index === 1 ? { x: 0.25, y: 0.75 } : { x: 0.5, y: 0.5 },
    caption: `Shelf edition ${index + 1}`,
    spotlight: false,
    muted: false,
}))

const shelfConfig = {
    schemaVersion: 2,
    styleId: "the-shelf",
    sceneVersion: 2,
    timelineMode: "automatic",
    timelineFixedDurationMs: 0,
    timelineSegments: [],
    items: shelfItems,
    settings: {
        ...DEFAULT_SETTINGS,
        canvasPreset: "custom",
        canvasWidth: 64,
        canvasHeight: 64,
        ratioMode: "auto",
        imageFit: "contain",
        loopVideos: true,
        axis: "horizontal",
        direction: "reverse",
        playKind: "repeat",
        repeatCount: 2,
        backgroundStyle: "transparent",
        paceMs: 3_000,
        slideHeight: 42,
        gap: 34,
        tilt: 2.5,
        centerBump: 8,
        spotlightsEnabled: false,
        finaleEnabled: true,
        theme: "dark",
    },
}

const shelfRequest = {
    config: shelfConfig,
    width: 64,
    height: 64,
    fps: 10,
    durationMs: 18_000,
    cycleDurationMs: 9_000,
    finalCycleDurationMs: 9_000,
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

    let shelfPreflights = 0
    const shelfIntents = []
    const shelfApi = createHostBackedAPI(baseHost({
        preflightPngFrames: async (intent) => {
            shelfPreflights += 1
            shelfIntents.push(intent)
            return { snapshotId: "8".repeat(32), format: "png-frames", width: 64, height: 64, fps: 10, durationMs: intent.durationMs, frameCount: Math.round(intent.durationMs / 100), alpha: intent.transparent, audio: "none", consequence: "No audio." }
        },
    }))
    const { cycleDurationMs: _shelfCycle, ...shelfWithoutCycle } = shelfRequest
    await assert.rejects(shelfApi.exportReel(shelfWithoutCycle), /Shelf export clocks do not match/, "Shelf cycle clock must be explicit")
    for (const patch of [
        { durationMs: 18_001 },
        { cycleDurationMs: 9_001 },
        { finalCycleDurationMs: 9_001 },
    ]) await assert.rejects(shelfApi.exportReel({ ...shelfRequest, ...patch }), /Shelf export clocks do not match/)
    assert.equal(shelfPreflights, 0, "mismatched Shelf clocks must not cross the renderer-to-host boundary")
    await assert.rejects(shelfApi.exportReel({
        ...shelfRequest,
        config: { ...shelfConfig, settings: { ...shelfConfig.settings, paceMs: 3_500 } },
    }), /Shelf export clocks do not match/, "a causal Shelf pace change must invalidate the stale export clock")
    assert.equal(shelfPreflights, 0)
    await assert.rejects(shelfApi.exportReel({
        ...shelfRequest,
        config: { ...shelfConfig, items: shelfItems.map((item, index) => index === 0 ? { ...item, aspectMode: "global" } : item) },
    }), /natural ratio/, "Shelf PNG export must reject non-natural frame geometry locally")
    assert.equal(shelfPreflights, 0)
    await assert.rejects(shelfApi.exportReel({
        ...shelfRequest,
        config: { ...shelfConfig, items: shelfItems.map((item, index) => index === 0 ? { ...item, type: "video" } : item) },
    }), /still images only/, "Shelf video export must fail closed before allocating a host snapshot")
    assert.equal(shelfPreflights, 0)
    let dishonestShelfPreflights = 0
    const dishonestShelfApi = createHostBackedAPI(baseHost({
        exportCapabilities: async () => ({
            version: 1,
            formats: [{ ...pngCapability, sceneVersions: pngCapability.sceneVersions.map((scene) => scene.id === "the-shelf" ? { ...scene, video: true } : scene) }],
        }),
        preflightPngFrames: async () => { dishonestShelfPreflights += 1; throw new Error("must not run") },
    }))
    await assert.rejects(dishonestShelfApi.exportReel(shelfRequest), /capabilities are invalid/, "renderer must reject a host that overstates Shelf video support")
    assert.equal(dishonestShelfPreflights, 0)
    assert.deepEqual(await shelfApi.exportReel(shelfRequest), {})
    assert.equal(shelfPreflights, 1)
    assert.equal(shelfIntents[0].config, shelfConfig)
    assert.equal(shelfIntents[0].durationMs, 18_000)
    assert.equal(shelfIntents[0].cycleDurationMs, 9_000)
    assert.equal(shelfIntents[0].finalCycleDurationMs, 9_000)
    assert.equal(shelfIntents[0].transparent, true, "transparent Shelf must reach host preflight as an alpha request")
    const solidShelfConfig = { ...shelfConfig, settings: { ...shelfConfig.settings, backgroundStyle: "solid" } }
    assert.deepEqual(await shelfApi.exportReel({ ...shelfRequest, config: solidShelfConfig }), {})
    assert.equal(shelfPreflights, 2)
    assert.equal(shelfIntents[1].transparent, false, "solid Shelf must causally reach host preflight as opaque")
    assert.equal(shelfIntents[1].config, solidShelfConfig)

    const shelfCompilerParityCases = [
        { mode: "automatic", count: 1, paceMs: 180, fixedDurationMs: 0, segments: [], playKind: "loop", repeatCount: 1, fps: 1 },
        { mode: "automatic", count: 3, paceMs: 3_500, fixedDurationMs: 0, segments: [], playKind: "repeat", repeatCount: 2, fps: 24 },
        { mode: "automatic", count: 127, paceMs: 8_000, fixedDurationMs: 0, segments: [], playKind: "once", repeatCount: 1, fps: 1 },
        { mode: "fixed-duration", count: 2, paceMs: 333.3, fixedDurationMs: 1_001, segments: [], playKind: "once", repeatCount: 1, fps: 1 },
        {
            mode: "directed", count: 3, paceMs: 180, fixedDurationMs: 0, playKind: "once", repeatCount: 1, fps: 30,
            segments: [{ id: "two-walks", kind: "cycle", cycles: 2, paceScale: 2, durationMs: 0 }, { id: "short-hold", kind: "hold", cycles: 0, paceScale: 1, durationMs: 0 }],
        },
        {
            mode: "directed", count: 3, paceMs: 777.7, fixedDurationMs: 0, playKind: "repeat", repeatCount: 2, fps: 60,
            segments: [
                { id: "fractional-walk", kind: "cycle", cycles: 3, paceScale: 7, durationMs: 0 },
                { id: "pace-hold", kind: "hold", cycles: 0, paceScale: 1, durationMs: 0 },
                { id: "literal-walk", kind: "cycle", cycles: 1, paceScale: 0.05, durationMs: 333.25 },
            ],
        },
    ]
    for (const candidate of shelfCompilerParityCases) {
        const timeline = compileShelfTimeline({
            mode: candidate.mode,
            direction: "reverse",
            mediaCount: candidate.count,
            paceMs: candidate.paceMs,
            fixedDurationMs: candidate.fixedDurationMs,
            segments: candidate.segments,
            fps: candidate.fps,
        })
        const config = {
            ...shelfConfig,
            timelineMode: candidate.mode,
            timelineFixedDurationMs: candidate.fixedDurationMs,
            timelineSegments: candidate.segments,
            items: Array.from({ length: candidate.count }, (_, index) => ({ ...shelfItems[index % shelfItems.length], id: `parity-${candidate.mode}-${index}`, name: `Parity ${index}` })),
            settings: { ...shelfConfig.settings, paceMs: candidate.paceMs, playKind: candidate.playKind, repeatCount: candidate.repeatCount },
        }
        const durationMs = candidate.playKind === "repeat" ? timeline.durationMs * candidate.repeatCount : timeline.durationMs
        const snapshot = createPngFramesSnapshot({
            config, width: 64, height: 64, fps: candidate.fps, durationMs,
            cycleDurationMs: timeline.durationMs, finalCycleDurationMs: timeline.durationMs, transparent: true,
        })
        assert.deepEqual(
            { durationMs: snapshot.durationMs, cycleDurationMs: snapshot.cycleDurationMs, finalCycleDurationMs: snapshot.finalCycleDurationMs, frameCount: snapshot.frameCount },
            { durationMs, cycleDurationMs: timeline.durationMs, finalCycleDurationMs: timeline.durationMs, frameCount: Math.max(1, Math.ceil(durationMs / 1_000 * candidate.fps)) },
            `host Shelf clock diverged from compileShelfTimeline for ${candidate.mode}`,
        )
    }

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
    class FakeHTMLVideoElement extends FakeHTMLMediaElement {
        constructor(mode) {
            super(mode)
            this.readyState = 2
            this.videoWidth = 1920
            this.videoHeight = 1080
            this.frameCallback = null
            this.removeCalls = 0
        }
        requestVideoFrameCallback(callback) { this.frameCallback = callback; return 1 }
        cancelVideoFrameCallback() {}
        play() { return Promise.resolve() }
        remove() { this.removeCalls += 1 }
        load() {
            this.loadCalls += 1
            if (!this.source) return
            if (this.mode === "pending") return
            if (this.mode === "frame") {
                const callback = this.frameCallback
                queueMicrotask(() => callback?.(10, { mediaTime: 0 }))
                return
            }
            queueMicrotask(() => this.mode === "error" ? this.onerror?.() : this.onloadeddata?.())
        }
    }
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
        const openedApi = createHostBackedAPI(openHost("loaded"))
        const opened = await openedApi.openProject()
        assert.equal(opened.config, videoConfig)
        assert.equal(accepts, 0, "renderer caller must retain the baseline/epoch decision before acceptance")
        await openedApi.acceptProjectOpen(opened.operationId)
        assert.equal(accepts, 1)
        assert.equal(discards, 2)

        const shelfConfig = {
            ...vitrineConfig,
            styleId: "the-shelf",
            sceneVersion: 2,
            timelineMode: "automatic",
            timelineFixedDurationMs: 0,
            timelineSegments: [],
            settings: {
                ...DEFAULT_SETTINGS,
                axis: "horizontal",
                ratioMode: "auto",
                direction: "forward",
                playKind: "once",
                repeatCount: 1,
                imageFit: "contain",
                spotlightsEnabled: false,
                finaleEnabled: false,
                slideHeight: 44,
                gap: 30,
                tilt: 2.5,
                centerBump: 5,
            },
            audio: defaultAudioIntent(),
            items: [{
                ...vitrineConfig.items[0],
                id: "shelf-video",
                name: "Shelf Video.mp4",
                type: "video",
                url: `reel-media://grant/${"a".repeat(64)}`,
                aspectMode: "auto",
                fit: "contain",
                spotlight: false,
                muted: false,
            }],
        }
        let shelfAccepts = 0
        let shelfDiscards = 0
        videoMode = "frame"
        const shelfStart = videos.length
        const shelfHost = openHost("frame", shelfConfig, {
            acceptProjectOpen: async () => {
                shelfAccepts += 1
                const decoder = videos[shelfStart]
                assert.equal(decoder.source, "", "Shelf decoder must release candidate authority before host acceptance")
                assert.equal(decoder.pauseCalls, 1)
                assert.equal(decoder.loadCalls, 2)
                assert.equal(decoder.removeCalls, 1)
                return { generation: 2 }
            },
            discardProjectOpen: async () => { shelfDiscards += 1; return { discarded: true } },
        })
        const shelfApi = createHostBackedAPI(shelfHost)
        const shelfOpened = await shelfApi.openProject()
        assert.equal(shelfOpened.config, shelfConfig)
        assert.equal(shelfAccepts, 0, "Shelf admission must finish while prior-generation authority is still live")
        await shelfApi.acceptProjectOpen(shelfOpened.operationId)
        assert.equal(shelfAccepts, 1)
        assert.equal(shelfDiscards, 0)

        let legacyAccepts = 0
        let legacyDiscards = 0
        const legacyStart = videos.length
        videoMode = "frame"
        const legacyApi = createLegacyBackedAPI({
            platform: "darwin",
            openProject: async () => ({ config: shelfConfig, operationId: "b".repeat(32) }),
            acceptProjectOpen: async () => {
                legacyAccepts += 1
                const decoder = videos[legacyStart]
                assert.equal(decoder.source, "")
                assert.equal(decoder.pauseCalls, 1)
                assert.equal(decoder.loadCalls, 2)
                assert.equal(decoder.removeCalls, 1)
            },
            discardProjectOpen: async () => { legacyDiscards += 1 },
            cancelProjectOpen: async () => ({ cancelled: true }),
        })
        const legacyCandidate = await legacyApi.openProject()
        assert.equal(legacyCandidate.config, shelfConfig)
        assert.equal(legacyAccepts, 0)
        await legacyApi.acceptProjectOpen(legacyCandidate.operationId)
        assert.equal(legacyAccepts, 1)
        assert.equal(legacyDiscards, 0)
    } finally {
        for (const [key, value] of Object.entries(priorGlobals)) {
            if (value === undefined) delete globalThis[key]
            else globalThis[key] = value
        }
    }

    console.log("Verified: renderer host adapter owns one workflow, preserves Vitrine behavior, admits exact image-only Shelf PNG/alpha clocks, and accepts Shelf Projects only after original-source frame admission and decoder retirement.")
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
