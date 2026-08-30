const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const zlib = require("node:zlib")
const { createPngFramesSnapshot, pngFramesCapabilities, pngFramesPreflight, reachableMediaIndexes, reachableVideoIndexes } = require("../electron/png-export-contract.cjs")
const { createPngFramesRuntime, inspectPng } = require("../electron/png-frames-runtime.cjs")

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
    const name = Buffer.from(type, "ascii")
    const result = Buffer.alloc(12 + payload.length)
    result.writeUInt32BE(payload.length, 0)
    name.copy(result, 4)
    payload.copy(result, 8)
    result.writeUInt32BE(crc32(Buffer.concat([name, payload])), 8 + payload.length)
    return result
}

function png(width, height, alpha, seed) {
    const channels = alpha ? 4 : 3
    const header = Buffer.alloc(13)
    header.writeUInt32BE(width, 0)
    header.writeUInt32BE(height, 4)
    header[8] = 8
    header[9] = alpha ? 6 : 2
    const rows = Buffer.alloc(height * (1 + width * channels))
    for (let y = 0; y < height; y += 1) {
        const start = y * (1 + width * channels)
        rows[start] = 0
        for (let x = 0; x < width; x += 1) {
            const pixel = start + 1 + x * channels
            rows[pixel] = (seed + x * 11) % 256
            rows[pixel + 1] = (seed + y * 17) % 256
            rows[pixel + 2] = (seed + x + y) % 256
            if (alpha) rows[pixel + 3] = (x + y) % 3 === 0 ? 0 : 255
        }
    }
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", header),
        chunk("IDAT", zlib.deflateSync(rows)),
        chunk("IEND", Buffer.alloc(0)),
    ])
}

const mediaURL = `reel-media://grant/${"a".repeat(64)}`
const intent = {
    config: {
        schemaVersion: 2,
        styleId: "quiet-carousel",
        items: [{ id: "frame-1", name: "Frame", type: "image", url: mediaURL, ratio: 16 / 9, spotlight: false, muted: false }],
        settings: { canvasPreset: "custom", canvasWidth: 64, canvasHeight: 64, backgroundStyle: "transparent" },
    },
    width: 64,
    height: 64,
    fps: 10,
    durationMs: 150,
    cycleDurationMs: 100,
    finalCycleDurationMs: 50,
    transparent: true,
}

async function run() {
    const snapshot = createPngFramesSnapshot(intent, () => Buffer.alloc(16, 7))
    assert.equal(snapshot.frameCount, 2, "frame plan must use round(duration * fps)")
    assert.equal(snapshot.cycleDurationMs, 100)
    assert.equal(snapshot.finalCycleDurationMs, 50)
    assert.equal(Object.isFrozen(snapshot.config.items[0]), true)
    assert.equal(Object.hasOwn(snapshot.config, "audio"), false, "PNG visual snapshot must not retain audio/private metadata")
    assert.equal(Object.hasOwn(snapshot.config.items[0], "previewUrl"), false)
    assert.deepEqual(snapshot.config.items[0].crop, { x: 0, y: 0, width: 1, height: 1 })
    assert.deepEqual(snapshot.config.items[0].focal, { x: 0.5, y: 0.5 })
    intent.config.items[0].id = "mutated-after-preflight"
    assert.equal(snapshot.config.items[0].id, "frame-1", "preflight must retain an immutable clone")
    intent.config.items[0].id = "frame-1"
    for (const config of [
        { ...intent.config, privatePath: "/home/person/secret" },
        { ...intent.config, settings: { ...intent.config.settings, privatePath: "/home/person/secret" } },
        { ...intent.config, items: [{ ...intent.config.items[0], sourcePath: "/home/person/secret" }] },
        Object.assign(Object.create({ inherited: true }), intent.config),
        { ...intent.config, settings: Object.assign(Object.create({ inherited: true }), intent.config.settings) },
        { ...intent.config, items: [Object.assign(Object.create({ inherited: true }), intent.config.items[0])] },
        { ...intent.config, settings: { ...intent.config.settings, ground: "/home/person/secret" } },
    ]) assert.throws(() => createPngFramesSnapshot({ ...intent, config }), (error) => error.code === "invalid_request")
    const strippedAudio = createPngFramesSnapshot({ ...intent, config: { ...intent.config, audio: { privatePath: "/home/person/secret" } } })
    assert.equal(Object.hasOwn(strippedAudio.config, "audio"), false)
    assert.deepEqual(pngFramesPreflight(snapshot), {
        snapshotId: "07".repeat(16), format: "png-frames", width: 64, height: 64, fps: 10, durationMs: 150,
        frameCount: 2, alpha: true, audio: "none",
        consequence: pngFramesCapabilities().formats[0].consequence,
    })
    assert.equal(pngFramesCapabilities().formats[0].audio, false)
    assert.deepEqual(pngFramesCapabilities().formats[0].sceneVersions, [{ id: "quiet-carousel", versions: [1] }, { id: "vitrine", versions: [2] }])
    assert.throws(() => createPngFramesSnapshot({ ...intent, width: 65 }), (error) => error.code === "invalid_request", "export dimensions must match Project canvas")
    assert.throws(() => createPngFramesSnapshot({
        ...intent,
        width: 97,
        height: 65,
        config: { ...intent.config, settings: { ...intent.config.settings, canvasWidth: 97, canvasHeight: 65 } },
    }), (error) => error.code === "invalid_request", "custom Project and export dimensions must remain even")
    assert.throws(() => createPngFramesSnapshot({
        ...intent,
        config: { ...intent.config, settings: { ...intent.config.settings, canvasPreset: "fullHD" } },
    }), (error) => error.code === "invalid_request", "named canvas preset must retain its exact dimensions")
    const vitrineConfig = {
        ...snapshot.config,
        styleId: "vitrine",
        sceneVersion: 2,
        timelineMode: "automatic",
        timelineFixedDurationMs: 0,
        timelineSegments: [],
        items: [{ ...snapshot.config.items[0], id: "vitrine-source", spotlight: false, muted: false }],
        settings: {
            ...snapshot.config.settings,
            axis: "horizontal", direction: "forward", transitionDirection: "left", imageFit: "contain",
            playKind: "loop", repeatCount: 1, loopVideos: true, spotlightsEnabled: false, finaleEnabled: true,
            slideHeight: 62, tilt: 5, sway: 18, holdMs: 1_400, paceMs: 760, showHint: false,
        },
    }
    const vitrineIntent = {
        ...intent,
        config: vitrineConfig,
        durationMs: 2_160,
        cycleDurationMs: 2_160,
        finalCycleDurationMs: 2_160,
    }
    const vitrineSnapshot = createPngFramesSnapshot(vitrineIntent, () => Buffer.alloc(16, 8))
    assert.deepEqual(vitrineSnapshot.scene, { id: "vitrine", version: 2 })
    assert.equal(vitrineSnapshot.audio, "none")
    assert.doesNotThrow(() => createPngFramesSnapshot({
        ...vitrineIntent,
        config: { ...vitrineConfig, settings: { ...vitrineConfig.settings, showHint: true } },
    }), "transparent Vitrine may retain its explicitly-authored Placard")
    const finiteVideoItems = Array.from({ length: 20 }, (_, index) => ({
        ...vitrineConfig.items[0],
        id: `finite-video-${index + 1}`,
        type: "video",
        spotlight: false,
        muted: index > 0 && index < 19,
    }))
    const finiteVideoConfig = {
        ...vitrineConfig,
        items: finiteVideoItems,
        settings: { ...vitrineConfig.settings, playKind: "once", spotlightsEnabled: false, finaleEnabled: true },
    }
    const finiteVideoIntent = { ...vitrineIntent, config: finiteVideoConfig, durationMs: 4_320, cycleDurationMs: 4_320, finalCycleDurationMs: 4_320 }
    assert.equal(createPngFramesSnapshot(finiteVideoIntent).config.items.length, 20, "unreachable Vitrine videos must not consume decode grants")
    assert.doesNotThrow(() => createPngFramesSnapshot({
        ...vitrineIntent,
        config: { ...finiteVideoConfig, items: finiteVideoItems.slice(0, 3).map((item) => ({ ...item, muted: false })) },
        durationMs: 6_480,
        cycleDurationMs: 6_480,
        finalCycleDurationMs: 6_480,
    }), "Vitrine uses bounded live seeks rather than a story-length decoded-frame cache")
    const defaultVideoVitrine = {
        ...vitrineIntent,
        fps: 30,
        durationMs: 44_000,
        cycleDurationMs: 44_000,
        finalCycleDurationMs: 44_000,
        config: {
            ...vitrineConfig,
            items: Array.from({ length: 8 }, (_, index) => ({ ...vitrineConfig.items[0], id: `default-vitrine-${index + 1}`, type: index === 3 ? "video" : "image" })),
            settings: { ...vitrineConfig.settings, holdMs: 3_740, paceMs: 1_760 },
        },
    }
    assert.equal(createPngFramesSnapshot(defaultVideoVitrine).frameCount, 1_320, "fresh default Vitrine with source video must pass export preflight")
    const mutedLoopConfig = {
        ...vitrineConfig,
        items: [
            { ...vitrineConfig.items[0], id: "muted-video", type: "video", muted: true },
            { ...vitrineConfig.items[0], id: "visible-image", type: "image", muted: false },
        ],
    }
    assert.deepEqual(reachableMediaIndexes(mutedLoopConfig), [1], "muted Loop media must never enter the live export working set")
    assert.deepEqual(reachableVideoIndexes(mutedLoopConfig), [], "muted Loop videos must never consume decoders")
    assert.deepEqual(reachableMediaIndexes(finiteVideoConfig), [0, 19], "finite Vitrine must preflight only its opening and finale sources")
    assert.deepEqual(reachableVideoIndexes(finiteVideoConfig), [0, 19], "finite Vitrine must allocate only its opening and finale video sources")
    const repeatedVideoConfig = {
        ...vitrineConfig,
        items: [{ ...vitrineConfig.items[0], type: "video" }],
        settings: { ...vitrineConfig.settings, playKind: "repeat", repeatCount: 100 },
    }
    assert.equal(createPngFramesSnapshot({
        ...vitrineIntent,
        config: repeatedVideoConfig,
        durationMs: 216_000,
    }).frameCount, 2_160, "Repeat output may be long while decoded video remains bounded to one cycle")
    for (const ratio of [1 / 10_000, 10_000]) {
        assert.equal(createPngFramesSnapshot({
            ...vitrineIntent,
            config: { ...vitrineConfig, items: [{ ...vitrineConfig.items[0], ratio }] },
        }).config.items[0].ratio, ratio)
    }
    const minimumDirectedConfig = {
        ...vitrineConfig,
        timelineMode: "directed",
        items: [vitrineConfig.items[0], { ...vitrineConfig.items[0], id: "vitrine-second" }],
        settings: { ...vitrineConfig.settings, holdMs: 1_200, paceMs: 560 },
        timelineSegments: [{ id: "fast-minimum", kind: "cycle", cycles: 1, paceScale: 2, durationMs: 0 }],
    }
    assert.equal(createPngFramesSnapshot({
        ...vitrineIntent,
        config: minimumDirectedConfig,
        durationMs: 1_760,
        cycleDurationMs: 1_760,
        finalCycleDurationMs: 1_760,
    }).durationMs, 1_760)
    assert.throws(() => createPngFramesSnapshot({
        ...vitrineIntent,
        config: { ...minimumDirectedConfig, timelineSegments: [{ id: "too-short", kind: "cycle", cycles: 1, paceScale: 2, durationMs: 1_759 }] },
        durationMs: 1_759,
        cycleDurationMs: 1_759,
        finalCycleDurationMs: 1_759,
    }), (error) => error.code === "invalid_request")
    for (const config of [
        { ...vitrineSnapshot.config, sceneVersion: 1 },
        { ...snapshot.config, sceneVersion: 2 },
        { ...snapshot.config, styleId: "opening-reel", sceneVersion: 1 },
    ]) assert.throws(() => createPngFramesSnapshot({ ...vitrineIntent, config }), (error) => error.code === "unsupported_capability")
    for (const settings of [
        { ...vitrineSnapshot.config.settings, slideHeight: 10 },
        { ...vitrineSnapshot.config.settings, paceMs: 100 },
        { ...vitrineSnapshot.config.settings, backgroundStyle: "gradient" },
        { ...vitrineSnapshot.config.settings, axis: "vertical" },
        { ...vitrineSnapshot.config.settings, direction: "left" },
        { ...vitrineSnapshot.config.settings, transitionDirection: "forward" },
        { ...vitrineSnapshot.config.settings, imageFit: "stretch" },
        { ...vitrineSnapshot.config.settings, playKind: "sometimes" },
        { ...vitrineSnapshot.config.settings, repeatCount: 1.5 },
        { ...vitrineSnapshot.config.settings, spotlightsEnabled: "yes" },
        { ...vitrineSnapshot.config.settings, finaleEnabled: 42 },
    ]) assert.throws(() => createPngFramesSnapshot({ ...vitrineIntent, config: { ...vitrineSnapshot.config, settings } }), (error) => error.code === "invalid_request")
    const repeatVitrine = {
        ...vitrineIntent,
        config: { ...vitrineConfig, settings: { ...vitrineConfig.settings, playKind: "repeat", repeatCount: 3 } },
        durationMs: 6_480,
    }
    assert.equal(createPngFramesSnapshot(repeatVitrine).durationMs, 6_480)
    const fixedVitrine = {
        ...vitrineIntent,
        config: { ...vitrineConfig, timelineMode: "fixed-duration", timelineFixedDurationMs: 8_000 },
        durationMs: 8_000, cycleDurationMs: 8_000, finalCycleDurationMs: 8_000,
    }
    assert.equal(createPngFramesSnapshot(fixedVitrine).cycleDurationMs, 8_000)
    const directedVitrine = {
        ...vitrineIntent,
        config: {
            ...vitrineConfig,
            timelineMode: "directed",
            timelineSegments: [
                { id: "one-cycle", kind: "cycle", cycles: 1, paceScale: 1, durationMs: 2_160 },
                { id: "ending-hold", kind: "hold", cycles: 0, paceScale: 1, durationMs: 600 },
            ],
        },
        durationMs: 2_760, cycleDurationMs: 2_760, finalCycleDurationMs: 2_760,
    }
    assert.equal(createPngFramesSnapshot(directedVitrine).cycleDurationMs, 2_760)
    assert.throws(() => createPngFramesSnapshot({
        ...directedVitrine,
        config: { ...directedVitrine.config, settings: { ...directedVitrine.config.settings, playKind: "once" } },
        durationMs: 2_760,
    }), (error) => error.code === "invalid_request", "finite Vitrine must not discard literal directed segments")
    for (const key of ["durationMs", "cycleDurationMs", "finalCycleDurationMs"]) {
        assert.throws(() => createPngFramesSnapshot({ ...vitrineIntent, [key]: vitrineIntent[key] + 1 }), (error) => error.code === "invalid_request")
    }
    for (const config of [
        { ...vitrineConfig, timelineMode: "mystery" },
        { ...vitrineConfig, timelineMode: "fixed-duration", timelineFixedDurationMs: 999 },
        { ...vitrineConfig, timelineMode: "directed", timelineSegments: [] },
        { ...vitrineConfig, timelineMode: "directed", timelineSegments: [{ id: "bad", kind: "cycle", cycles: 1, paceScale: 1, durationMs: 900 }] },
        { ...vitrineConfig, items: [{ ...vitrineConfig.items[0], fit: "stretch" }] },
        { ...vitrineConfig, items: [{ ...vitrineConfig.items[0], focal: { x: 1.01, y: 0.5 } }] },
        { ...vitrineConfig, items: [{ ...vitrineConfig.items[0], ratio: 10_000, crop: { x: 0, y: 0, width: 1, height: 0.0001 } }] },
        { ...vitrineConfig, items: [{ ...vitrineConfig.items[0], muted: true }] },
        { ...vitrineConfig, items: [] },
    ]) assert.throws(() => createPngFramesSnapshot({ ...vitrineIntent, config }), (error) => error.code === "invalid_request")
    const maximumItems = Array.from({ length: 127 }, (_, index) => ({ ...vitrineConfig.items[0], id: `vitrine-${index + 1}` }))
    const maximumCycleMs = 127 * (1_400 + 760)
    assert.equal(createPngFramesSnapshot({
        ...vitrineIntent,
        config: { ...vitrineConfig, items: maximumItems },
        fps: 1,
        durationMs: maximumCycleMs,
        cycleDurationMs: maximumCycleMs,
        finalCycleDurationMs: maximumCycleMs,
    }).config.items.length, 127)
    assert.throws(() => createPngFramesSnapshot({
        ...vitrineIntent,
        config: { ...vitrineConfig, items: [...maximumItems, { ...vitrineConfig.items[0], id: "vitrine-128" }] },
    }), (error) => error.code === "invalid_request")
    const maximumDuration = 24 * 60 * 60 * 1_000
    assert.equal(createPngFramesSnapshot({
        ...fixedVitrine,
        config: { ...fixedVitrine.config, timelineFixedDurationMs: maximumDuration },
        fps: 1,
        durationMs: maximumDuration,
        cycleDurationMs: maximumDuration,
        finalCycleDurationMs: maximumDuration,
    }).durationMs, maximumDuration)
    assert.throws(() => createPngFramesSnapshot({
        ...fixedVitrine,
        config: { ...fixedVitrine.config, timelineFixedDurationMs: maximumDuration, settings: { ...fixedVitrine.config.settings, playKind: "repeat", repeatCount: 2 } },
        durationMs: maximumDuration,
        cycleDurationMs: maximumDuration,
        finalCycleDurationMs: maximumDuration,
    }), (error) => error.code === "invalid_request")
    assert.throws(() => createPngFramesSnapshot({ ...intent, transparent: false }), (error) => error.code === "invalid_request", "alpha intent must match the Project background")
    assert.throws(() => createPngFramesSnapshot({
        ...intent,
        config: { ...snapshot.config, items: [{ ...snapshot.config.items[0], type: "video" }] },
        durationMs: 12_900,
        cycleDurationMs: 12_900,
        finalCycleDurationMs: 12_900,
    }), (error) => error.code === "resource_limit", "source-video preflight must respect the bounded decoded-frame grant budget")

    if (process.platform === "linux") {
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-g06-png-"))
      try {
        const authorityFor = (target) => {
            const parent = fs.lstatSync(path.dirname(target))
            let linked = null
            try { linked = fs.lstatSync(target) } catch (error) {
                if (error?.code !== "ENOENT") throw error
            }
            return {
                parentDevice: parent.dev,
                parentInode: parent.ino,
                targetKind: "directory",
                targetExists: Boolean(linked),
                targetDevice: linked?.dev ?? null,
                targetInode: linked?.ino ?? null,
                targetBytes: linked?.size ?? null,
                targetMtimeMs: linked?.mtimeMs ?? null,
                targetCtimeMs: linked?.ctimeMs ?? null,
            }
        }
        const destination = path.join(temporary, "Gallery PNG Frames")
        const runtime = createPngFramesRuntime({
            freeSpaceReserveBytes: 0,
            maximumTotalBytes: 8 * 1024 * 1024,
        })
        const progress = []
        const result = await runtime.run({
            snapshot,
            destination,
            destinationAuthority: authorityFor(destination),
            renderFrame: async ({ frameIndex }) => png(64, 64, true, frameIndex + 1),
            onProgress: (value) => progress.push(value),
        })
        assert.deepEqual({ ...result, manifestSha256: "hash" }, {
            format: "png-frames", frameCount: 2, width: 64, height: 64, alpha: true, audio: "none", manifestSha256: "hash",
        })
        assert.deepEqual(fs.readdirSync(destination).sort(), ["frame-000001.png", "frame-000002.png", "manifest.json"])
        const manifestBytes = fs.readFileSync(path.join(destination, "manifest.json"))
        assert.equal(result.manifestSha256, crypto.createHash("sha256").update(manifestBytes).digest("hex"))
        const manifest = JSON.parse(manifestBytes)
        assert.equal(manifest.audio, "none")
        assert.match(manifest.consequence, /no audio/)
        assert.equal(manifest.frames.length, 2)
        assert.equal(inspectPng(fs.readFileSync(path.join(destination, "frame-000001.png")), snapshot).colourType, 6)
        assert.equal(progress.at(-1).phase, "done")

        const sameInodeTamperDestination = path.join(temporary, "same-inode-finalize-tamper")
        let sameInodeTampered = false
        await assert.rejects(runtime.run({
            snapshot,
            destination: sameInodeTamperDestination,
            destinationAuthority: authorityFor(sameInodeTamperDestination),
            renderFrame: async ({ frameIndex }) => {
                if (frameIndex === 1 && !sameInodeTampered) {
                    sameInodeTampered = true
                    const target = path.join(sameInodeTamperDestination, "frame-000001.png")
                    const before = fs.statSync(target)
                    await new Promise((resolve) => setTimeout(resolve, 5))
                    const handle = fs.openSync(target, "r+")
                    try {
                        const byte = Buffer.alloc(1)
                        fs.readSync(handle, byte, 0, 1, before.size - 5)
                        byte[0] ^= 1
                        fs.writeSync(handle, byte, 0, 1, before.size - 5)
                    } finally { fs.closeSync(handle) }
                    fs.utimesSync(target, before.atimeMs / 1000, before.mtimeMs / 1000)
                    const after = fs.statSync(target)
                    assert.equal(after.dev, before.dev)
                    assert.equal(after.ino, before.ino)
                    assert.equal(after.size, before.size)
                    assert.equal(after.mtimeMs, before.mtimeMs)
                    assert.notEqual(after.ctimeMs, before.ctimeMs)
                }
                return png(64, 64, true, frameIndex + 1)
            },
        }), (error) => error.code === "verification_failed")
        assert.equal(fs.existsSync(sameInodeTamperDestination), false, "final same-inode tamper must fail and clean only owned output")

        const replacementTamperDestination = path.join(temporary, "replacement-finalize-tamper")
        const foreignFrame = Buffer.from("foreign replacement: preserve")
        let replacementTampered = false
        await assert.rejects(runtime.run({
            snapshot,
            destination: replacementTamperDestination,
            destinationAuthority: authorityFor(replacementTamperDestination),
            renderFrame: async ({ frameIndex }) => {
                if (frameIndex === 1 && !replacementTampered) {
                    replacementTampered = true
                    const target = path.join(replacementTamperDestination, "frame-000001.png")
                    fs.unlinkSync(target)
                    fs.writeFileSync(target, foreignFrame)
                }
                return png(64, 64, true, frameIndex + 1)
            },
        }), (error) => error.code === "verification_failed")
        assert.deepEqual(fs.readFileSync(path.join(replacementTamperDestination, "frame-000001.png")), foreignFrame, "foreign replacement must remain untouched")
        assert.deepEqual(fs.readdirSync(replacementTamperDestination).sort(), ["frame-000001.png"])
        fs.unlinkSync(path.join(replacementTamperDestination, "frame-000001.png"))
        fs.rmdirSync(replacementTamperDestination)

        const priorManifest = fs.readFileSync(path.join(destination, "manifest.json"))
        const corrupt = png(64, 64, true, 9)
        corrupt[corrupt.length - 5] ^= 1
        await assert.rejects(runtime.run({ snapshot, destination, destinationAuthority: authorityFor(destination), renderFrame: async () => corrupt }), (error) => error.code === "conflict")
        assert.deepEqual(fs.readFileSync(path.join(destination, "manifest.json")), priorManifest, "existing destination must remain untouched")

        const corruptDestination = path.join(temporary, "corrupt")
        await assert.rejects(runtime.run({ snapshot, destination: corruptDestination, destinationAuthority: authorityFor(corruptDestination), renderFrame: async () => corrupt }), (error) => error.code === "verification_failed")
        assert.equal(fs.existsSync(corruptDestination), false, "failed new export must remove only its owned partial directory")

        const early = path.join(temporary, "early")
        const earlyController = new AbortController()
        earlyController.abort()
        await assert.rejects(runtime.run({ snapshot, destination: early, destinationAuthority: authorityFor(early), signal: earlyController.signal, renderFrame: async () => png(64, 64, true, 1) }), (error) => error.code === "cancelled")
        assert.equal(fs.existsSync(early), false)

        const mid = path.join(temporary, "mid")
        const midController = new AbortController()
        await assert.rejects(runtime.run({
            snapshot,
            destination: mid,
            destinationAuthority: authorityFor(mid),
            signal: midController.signal,
            renderFrame: async ({ frameIndex }) => {
                if (frameIndex === 1) midController.abort()
                return png(64, 64, true, frameIndex + 1)
            },
        }), (error) => error.code === "cancelled")
        assert.equal(fs.existsSync(mid), false)

        const finalizing = path.join(temporary, "finalizing-cancel")
        const finalizingController = new AbortController()
        let finalizingCancelScheduled = false
        await assert.rejects(runtime.run({
            snapshot,
            destination: finalizing,
            destinationAuthority: authorityFor(finalizing),
            signal: finalizingController.signal,
            renderFrame: async ({ frameIndex }) => {
                if (frameIndex === snapshot.frameCount - 1 && !finalizingCancelScheduled) {
                    finalizingCancelScheduled = true
                    setTimeout(() => finalizingController.abort(), 0)
                }
                return png(64, 64, true, frameIndex + 1)
            },
        }), (error) => error.code === "cancelled")
        assert.equal(fs.existsSync(finalizing), false, "cancel during final publication verification must clean only owned output")

        const raced = path.join(temporary, "raced")
        const movedOwned = path.join(temporary, "raced-owned-moved")
        let injectedRace = false
        await assert.rejects(runtime.run({
            snapshot,
            destination: raced,
            destinationAuthority: authorityFor(raced),
            renderFrame: async ({ frameIndex }) => {
                if (!injectedRace) {
                    injectedRace = true
                    fs.renameSync(raced, movedOwned)
                    fs.mkdirSync(raced)
                    fs.writeFileSync(path.join(raced, "competitor.txt"), "do-not-touch")
                }
                return png(64, 64, true, frameIndex)
            },
        }), (error) => error.code === "verification_failed")
        assert.equal(fs.readFileSync(path.join(raced, "competitor.txt"), "utf8"), "do-not-touch", "raced destination must remain untouched")
        assert.deepEqual(fs.readdirSync(movedOwned), [], "owned directory moved by a race must not receive frames")
        fs.rmdirSync(movedOwned)

        for (const replacement of ["directory", "file", "symlink"]) {
            const target = path.join(temporary, `creation-race-${replacement}`)
            const moved = `${target}-owned`
            const foreign = `${target}-foreign`
            if (replacement === "symlink") fs.mkdirSync(foreign)
            const raceRuntime = createPngFramesRuntime({
                freeSpaceReserveBytes: 0,
                afterDestinationCreated: () => {
                    fs.renameSync(target, moved)
                    if (replacement === "directory") fs.mkdirSync(target)
                    else if (replacement === "file") fs.writeFileSync(target, "foreign-file")
                    else fs.symlinkSync(foreign, target)
                },
            })
            await assert.rejects(raceRuntime.run({ snapshot, destination: target, destinationAuthority: authorityFor(target), renderFrame: async () => png(64, 64, true, 1) }), (error) => error.code === "verification_failed")
            assert.deepEqual(fs.readdirSync(moved), [], `owned directory must remain empty after ${replacement} creation race`)
            fs.rmdirSync(moved)
            if (replacement === "directory") fs.rmdirSync(target)
            else if (replacement === "file") {
                assert.equal(fs.readFileSync(target, "utf8"), "foreign-file")
                fs.unlinkSync(target)
            } else {
                assert.equal(fs.lstatSync(target).isSymbolicLink(), true)
                fs.unlinkSync(target)
                fs.rmdirSync(foreign)
            }
        }

        const authorityParent = path.join(temporary, "authority-parent")
        const movedParent = path.join(temporary, "authority-parent-moved")
        fs.mkdirSync(authorityParent)
        const parentRaceDestination = path.join(authorityParent, "frames")
        let parentRaced = false
        await assert.rejects(runtime.run({
            snapshot,
            destination: parentRaceDestination,
            destinationAuthority: authorityFor(parentRaceDestination),
            renderFrame: async () => {
                if (!parentRaced) {
                    parentRaced = true
                    fs.renameSync(authorityParent, movedParent)
                    fs.mkdirSync(authorityParent)
                    fs.writeFileSync(path.join(authorityParent, "foreign.txt"), "do-not-touch")
                }
                return png(64, 64, true, 1)
            },
        }), (error) => error.code === "verification_failed")
        assert.equal(fs.readFileSync(path.join(authorityParent, "foreign.txt"), "utf8"), "do-not-touch")
        assert.equal(fs.existsSync(path.join(movedParent, "frames")), false, "held-parent failure must clean only its owned destination")

        const reserve = path.join(temporary, "reserve")
        let diskChecks = 0
        const reserveRuntime = createPngFramesRuntime({
            freeSpaceReserveBytes: 1000,
            statfs: () => ({ bavail: ++diskChecks < 3 ? 10_000_000 : 1, bsize: 1 }),
        })
        await assert.rejects(reserveRuntime.run({ snapshot, destination: reserve, destinationAuthority: authorityFor(reserve), renderFrame: async ({ frameIndex }) => png(64, 64, true, frameIndex) }), (error) => error.code === "resource_limit")
        assert.equal(fs.existsSync(reserve), false, "mid-run reserve exhaustion must remove its owned partial destination")

        const oversizedRuntime = createPngFramesRuntime({ freeSpaceReserveBytes: 0, maximumFrameBytes: 100 })
        const oversized = path.join(temporary, "oversized")
        await assert.rejects(oversizedRuntime.run({ snapshot, destination: oversized, destinationAuthority: authorityFor(oversized), renderFrame: async () => Buffer.alloc(101) }), (error) => error.code === "resource_limit")
        assert.equal(fs.existsSync(oversized), false)

        for (const failure of ["write", "fsync"]) {
            const partial = path.join(temporary, `partial-${failure}`)
            const injected = Object.assign(new Error(`injected ${failure} failure`), { code: failure === "write" ? "ENOSPC" : "EIO" })
            const failureRuntime = createPngFramesRuntime({
                freeSpaceReserveBytes: 0,
                ...(failure === "write" ? { writeSync: () => { throw injected } } : { fsyncFile: () => { throw injected } }),
            })
            await assert.rejects(failureRuntime.run({ snapshot, destination: partial, destinationAuthority: authorityFor(partial), renderFrame: async () => png(64, 64, true, 1) }), (error) => error === injected)
            assert.equal(fs.existsSync(partial), false, `${failure} failure must remove its identity-owned partial file and directory`)
        }
      } finally {
          fs.rmSync(temporary, { recursive: true, force: true })
      }
    }
    console.log("Verified: G06A immutable rounded frame plan, real PNG integrity/alpha/hash manifest, no-audio consequence, exclusive new-target publication, destination-race containment, cancellation, cleanup, and prior-destination preservation.")
}

run().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
