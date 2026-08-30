const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { createLinuxHostController, verifyOpenedMediaSource } = require("../electron/linux-host-controller.cjs")
const { HostPortError } = require("../electron/linux-host-port.cjs")

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-g03-controller-"))
const mediaPath = path.join(temporary, "frame.png")
fs.writeFileSync(mediaPath, "frame-bytes")
const videoPath = path.join(temporary, "source.mov")
fs.writeFileSync(videoPath, "video-bytes")
const audioPath = path.join(temporary, "presenter.wav")
const audioHeader = Buffer.alloc(44)
audioHeader.write("RIFF", 0)
audioHeader.writeUInt32LE(44, 4)
audioHeader.write("WAVEfmt ", 8)
audioHeader.writeUInt32LE(16, 16)
audioHeader.writeUInt16LE(1, 20)
audioHeader.writeUInt16LE(1, 22)
audioHeader.writeUInt32LE(48_000, 24)
audioHeader.writeUInt32LE(96_000, 28)
audioHeader.writeUInt16LE(2, 32)
audioHeader.writeUInt16LE(16, 34)
audioHeader.write("data", 36)
audioHeader.writeUInt32LE(8, 40)
fs.writeFileSync(audioPath, Buffer.concat([audioHeader, Buffer.from([0, 0, 1, 0, 255, 255, 0, 0])]))
const removed = []
const mainFrame = { url: "gallery-app://app/index.html" }
const sender = { id: 71, mainFrame }
const event = { sender, senderFrame: mainFrame }
let openCount = 0

const host = createLinuxHostController({
    owner: "window-71",
    webContentsId: 71,
    identity: () => ({ productId: "galileo-gallery", protocol: 1, platform: "linux" }),
    chooseMedia: ({ grantMedia }) => [grantMedia(mediaPath, "image/png"), grantMedia(videoPath, "video/quicktime")],
    chooseAudio: ({ role, grantMedia }) => ({ name: "presenter.wav", role, url: grantMedia(audioPath, "audio/wav").mediaURL, sampleRate: 48_000, channels: 1, sampleFrames: 4 }),
    prepareVideoAudio: ({ grant }) => {
        assert.equal(grant.mime, "video/quicktime")
        assert.equal(grant.filePath, videoPath)
        return { sampleRate: 48_000, channels: 2, sampleFrames: 96_000 }
    },
    decodeAudio: ({ startFrame, frameCount }) => ({ sampleRate: 48_000, channels: 1, startFrame, frameCount, samples: Array.from({ length: frameCount }, () => 0) }),
    audioWaveform: ({ buckets }) => ({ sampleRate: 48_000, channels: 1, sampleFrames: 4, buckets: Array.from({ length: buckets }, () => ({ minimum: -0.5, maximum: 0.5, rms: 0.25 })) }),
    saveProject: ({ config, mediaPath: resolve }) => ({ itemCount: config.items.length, resolved: resolve(config.items[0].url) === mediaPath }),
    openProject: async ({ generation, grantMedia, signal }) => {
        openCount += 1
        if (signal.aborted) return { cancelled: true }
        const granted = grantMedia(mediaPath, "image/png")
        const audio = grantMedia(audioPath, "audio/wav")
        return { config: { items: [{ url: granted.mediaURL }], audioURL: audio.mediaURL }, resourceRoot: path.join(temporary, `opened-${generation}-${openCount}`) }
    },
    removeResourceRoot: (value) => removed.push(value),
})

function envelope(operation, payload = {}, generation = host.snapshot().generation, requestId = `request-${openCount + 1}`) {
    return { protocol: 1, requestId, operation, generation, payload }
}

async function run() {
    const heldSource = path.join(temporary, "held-source.mov")
    fs.writeFileSync(heldSource, "abcdefgh")
    const heldHandle = fs.openSync(heldSource, "r")
    try {
        const heldStat = fs.fstatSync(heldHandle)
        const identity = { handle: heldHandle, device: heldStat.dev, inode: heldStat.ino, size: heldStat.size, mtimeMs: heldStat.mtimeMs, ctimeMs: heldStat.ctimeMs }
        assert.doesNotThrow(() => verifyOpenedMediaSource(identity))
        await new Promise((resolve) => setTimeout(resolve, 5))
        fs.writeFileSync(heldSource, "hgfedcba")
        assert.throws(() => verifyOpenedMediaSource(identity), (error) => error.code === "verification_failed", "same-size in-place mutation must invalidate held export source identity")
    } finally {
        fs.closeSync(heldHandle)
    }
    assert.deepEqual(host.bootstrap(event), { protocol: 1, generation: 1, state: "ready" })
    const identity = await host.handle(event, envelope("identity.read"))
    assert.deepEqual(identity.value, { productId: "galileo-gallery", protocol: 1, platform: "linux" })
    assert.equal(identity.generation, 1)

    const chosen = await host.handle(event, envelope("media.choose"))
    assert.equal(chosen.ok, true)
    assert.match(chosen.value[0].mediaURL, /^reel-media:\/\/grant\/[a-f0-9]{64}$/)
    assert.equal(JSON.stringify(chosen).includes(mediaPath), false)
    const preparedVideo = await host.handle(event, envelope("audio.video.prepare", { url: chosen.value[1].mediaURL, durationUs: 2_000_000 }, 1, "request-video-audio"))
    assert.deepEqual(preparedVideo.value, { sampleRate: 48_000, channels: 2, sampleFrames: 96_000 })
    assert.equal(JSON.stringify(preparedVideo).includes(videoPath), false)
    const chosenAudio = await host.handle(event, envelope("audio.choose", { role: "presenter" }, 1, "request-audio-choose"))
    assert.equal(chosenAudio.value.role, "presenter")
    assert.match(chosenAudio.value.url, /^reel-media:\/\/grant\/[a-f0-9]{64}$/)
    assert.equal(JSON.stringify(chosenAudio).includes(audioPath), false)
    const decodedAudio = await host.handle(event, envelope("audio.decode", { url: chosenAudio.value.url, startFrame: 1, frameCount: 2 }, 1, "request-audio-decode"))
    assert.deepEqual(decodedAudio.value, { sampleRate: 48_000, channels: 1, startFrame: 1, frameCount: 2, samples: [0, 0] })
    assert.equal(JSON.stringify(decodedAudio).includes(audioPath), false)
    const waveform = await host.handle(event, envelope("audio.waveform", { url: chosenAudio.value.url, buckets: 2 }, 1, "request-audio-waveform"))
    assert.equal(waveform.value.buckets.length, 2)
    assert.equal(JSON.stringify(waveform).includes(audioPath), false)
    const oversizedDecode = await host.handle(event, envelope("audio.decode", { url: chosenAudio.value.url, startFrame: 0, frameCount: 4097 }, 1, "request-audio-oversized"))
    assert.equal(oversizedDecode.error.code, "invalid_request")
    const saved = await host.handle(event, envelope("project.save", { config: { items: [{ url: chosen.value[0].mediaURL }] } }))
    assert.deepEqual(saved.value, { itemCount: 1, resolved: true })

    const begun = await host.handle(event, envelope("project.open.begin"))
    assert.equal(begun.ok, true)
    assert.equal(begun.value.candidateGeneration, 2)
    assert.equal(host.snapshot().state, "opening")
    assert.equal(host.openMedia({ url: begun.value.config.items[0].url, range: "bytes=0-4" }).status, 206)

    const blockedDuringHydration = await host.handle(event, envelope("media.choose"))
    assert.equal(blockedDuringHydration.error.code, "conflict")
    const discarded = await host.handle(event, envelope("project.open.discard", { operationId: begun.value.operationId }))
    assert.equal(discarded.ok, true)
    assert.equal(host.snapshot().generation, 1)
    assert.equal(removed.length, 1)
    assert.throws(() => host.openMedia({ url: begun.value.config.items[0].url, range: undefined }), (error) => error.code === "grant_expired")

    const acceptedCandidate = await host.handle(event, envelope("project.open.begin"))
    const pendingDecode = await host.handle(event, envelope("audio.decode", { url: acceptedCandidate.value.config.audioURL, startFrame: 0, frameCount: 1 }, 1, "request-pending-decode"))
    assert.equal(pendingDecode.ok, true)
    const accepted = await host.handle(event, envelope("project.open.accept", { operationId: acceptedCandidate.value.operationId }))
    assert.equal(accepted.ok, true)
    assert.equal(accepted.generation, 3)
    assert.deepEqual(host.bootstrap(event), { protocol: 1, generation: 3, state: "ready" })
    assert.equal(host.snapshot().state, "ready")
    assert.throws(() => host.mediaPath(chosen.value[0].mediaURL), (error) => error.code === "grant_expired")

    const stale = await host.handle(event, envelope("identity.read", {}, 1, "request-stale"))
    assert.equal(stale.error.code, "conflict")
    const wrongOrigin = await host.handle({ sender, senderFrame: { url: "https://attacker.example" } }, envelope("identity.read", {}, 3, "request-origin"))
    assert.equal(wrongOrigin.error.code, "permission_denied")
    const malformed = await host.handle(event, { ...envelope("identity.read", {}, 3, "request-malformed"), extra: true })
    assert.equal(malformed.error.code, "invalid_request")
    assert.equal(JSON.stringify(malformed).includes(mediaPath), false)

    host.dispose()
    assert.equal(host.snapshot().state, "closed")

    const unsafe = createLinuxHostController({
        owner: "window-73", webContentsId: 73, identity: () => ({}), chooseMedia: async () => [], saveProject: async () => ({}), openProject: async () => ({ cancelled: true }),
        chooseAudio: ({ role, grantMedia }) => ({ name: "presenter.wav", role, url: grantMedia(audioPath, "audio/wav").mediaURL, sampleRate: 48_000, channels: 1, sampleFrames: 4 }),
        prepareVideoAudio: async () => ({ sampleRate: 48_000, channels: 2, sampleFrames: Number.MAX_SAFE_INTEGER }),
        decodeAudio: async ({ startFrame, frameCount }) => ({ sampleRate: 48_000, channels: 1, startFrame, frameCount, samples: [0], path: audioPath }),
        audioWaveform: async () => ({ sampleRate: 48_000, channels: 1, sampleFrames: 4, buckets: [{ minimum: Number.NaN, maximum: 1, rms: 0.5 }] }),
    })
    const unsafeFrame = { url: "gallery-app://app/index.html" }
    const unsafeEvent = { sender: { id: 73, mainFrame: unsafeFrame }, senderFrame: unsafeFrame }
    const unsafeGrant = unsafe.grantMedia(audioPath, "audio/wav").mediaURL
    const invalidPrepared = await unsafe.handle(unsafeEvent, { protocol: 1, requestId: "unsafe-video-audio", operation: "audio.video.prepare", generation: 1, payload: { url: unsafeGrant, durationUs: 1_000_000 } })
    assert.equal(invalidPrepared.error.code, "verification_failed")
    const leakedDecode = await unsafe.handle(unsafeEvent, { protocol: 1, requestId: "unsafe-decode", operation: "audio.decode", generation: 1, payload: { url: unsafeGrant, startFrame: 0, frameCount: 1 } })
    assert.equal(leakedDecode.error.code, "verification_failed")
    assert.equal(JSON.stringify(leakedDecode).includes(audioPath), false)
    const invalidWaveform = await unsafe.handle(unsafeEvent, { protocol: 1, requestId: "unsafe-waveform", operation: "audio.waveform", generation: 1, payload: { url: unsafeGrant, buckets: 1 } })
    assert.equal(invalidWaveform.error.code, "verification_failed")
    unsafe.dispose()

    const finishAudio = []
    const bounded = createLinuxHostController({
        owner: "window-74", webContentsId: 74, identity: () => ({}), chooseMedia: async () => [], saveProject: async () => ({}), openProject: async () => ({ cancelled: true }),
        chooseAudio: async () => null,
        prepareVideoAudio: ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new HostPortError("cancelled")), { once: true })),
        decodeAudio: ({ startFrame, frameCount, signal }) => new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => reject(new HostPortError("cancelled")), { once: true })
            finishAudio.push(() => resolve({ sampleRate: 48_000, channels: 1, startFrame, frameCount, samples: [0] }))
        }),
        audioWaveform: async () => ({}),
    })
    const boundedFrame = { url: "gallery-app://app/index.html" }
    const boundedEvent = { sender: { id: 74, mainFrame: boundedFrame }, senderFrame: boundedFrame }
    const boundedGrant = bounded.grantMedia(audioPath, "audio/wav").mediaURL
    const decodeEnvelope = (requestId) => ({ protocol: 1, requestId, operation: "audio.decode", generation: 1, payload: { url: boundedGrant, startFrame: 0, frameCount: 1 } })
    const firstAudio = bounded.handle(boundedEvent, decodeEnvelope("bounded-one"))
    const secondAudio = bounded.handle(boundedEvent, decodeEnvelope("bounded-two"))
    await Promise.resolve()
    const thirdAudio = await bounded.handle(boundedEvent, decodeEnvelope("bounded-three"))
    assert.equal(thirdAudio.error.code, "resource_limit")
    const cancelledAudio = await bounded.handle(boundedEvent, { protocol: 1, requestId: "bounded-cancel", operation: "audio.cancel", generation: 1, payload: {} })
    assert.deepEqual(cancelledAudio.value, { cancelled: 2 })
    finishAudio.splice(0).forEach((finish) => finish())
    assert.equal((await firstAudio).error.code, "cancelled")
    assert.equal((await secondAudio).error.code, "cancelled")
    const boundedVideo = bounded.grantMedia(videoPath, "video/quicktime").mediaURL
    const preparingVideo = bounded.handle(boundedEvent, { protocol: 1, requestId: "bounded-video", operation: "audio.video.prepare", generation: 1, payload: { url: boundedVideo, durationUs: 2_000_000 } })
    await Promise.resolve()
    const cancelledVideo = await bounded.handle(boundedEvent, { protocol: 1, requestId: "bounded-video-cancel", operation: "audio.cancel", generation: 1, payload: {} })
    assert.deepEqual(cancelledVideo.value, { cancelled: 1 })
    assert.equal((await preparingVideo).error.code, "cancelled")
    bounded.dispose()

    let chooseCall = 0
    const revokedGrants = []
    const selection = createLinuxHostController({
        owner: "window-75", webContentsId: 75, identity: () => ({}), chooseMedia: async () => [], saveProject: async () => ({}), openProject: async () => ({ cancelled: true }),
        chooseAudio: ({ role, grantMedia, signal }) => {
            chooseCall += 1
            if (chooseCall === 1) return { name: "presenter.wav", role, url: grantMedia(audioPath, "audio/wav").mediaURL, sampleRate: 48_000, channels: 1, sampleFrames: 4 }
            return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new HostPortError("cancelled")), { once: true }))
        },
        decodeAudio: async () => ({}),
        audioWaveform: ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new HostPortError("cancelled")), { once: true })),
        onGrantRevoked: (grant) => revokedGrants.push(grant.filePath),
    })
    const selectionFrame = { url: "gallery-app://app/index.html" }
    const selectionEvent = { sender: { id: 75, mainFrame: selectionFrame }, senderFrame: selectionFrame }
    const selectedAudio = await selection.handle(selectionEvent, { protocol: 1, requestId: "selection-one", operation: "audio.choose", generation: 1, payload: { role: "presenter" } })
    const delayedWaveform = selection.handle(selectionEvent, { protocol: 1, requestId: "selection-waveform", operation: "audio.waveform", generation: 1, payload: { url: selectedAudio.value.url, buckets: 1 } })
    await Promise.resolve()
    const releasedSelection = await selection.handle(selectionEvent, { protocol: 1, requestId: "selection-release", operation: "media.release", generation: 1, payload: { urls: [selectedAudio.value.url] } })
    assert.deepEqual(releasedSelection.value, { released: 1 })
    assert.equal((await delayedWaveform).error.code, "cancelled")
    assert.deepEqual(revokedGrants, [audioPath])
    const delayedChoice = selection.handle(selectionEvent, { protocol: 1, requestId: "selection-two", operation: "audio.choose", generation: 1, payload: { role: "soundtrack" } })
    await Promise.resolve()
    const cancelledChoice = await selection.handle(selectionEvent, { protocol: 1, requestId: "selection-cancel", operation: "audio.cancel", generation: 1, payload: {} })
    assert.deepEqual(cancelledChoice.value, { cancelled: 1 })
    assert.equal((await delayedChoice).error.code, "cancelled")
    selection.dispose()

    const finishDelayedOpens = []
    const raceRemoved = []
    const racy = createLinuxHostController({
        owner: "window-72",
        webContentsId: 72,
        identity: () => ({}),
        chooseMedia: async () => [],
        chooseAudio: async () => null,
        decodeAudio: async () => ({}),
        audioWaveform: async () => ({}),
        saveProject: async () => ({}),
        openProject: ({ grantMedia, generation }) => new Promise((resolve) => {
            finishDelayedOpens.push(() => resolve({
                config: { items: [{ url: grantMedia(mediaPath, "image/png").mediaURL }] },
                resourceRoot: path.join(temporary, `racy-open-${generation}`),
            }))
        }),
        removeResourceRoot: (value) => raceRemoved.push(value),
    })
    const raceFrame = { url: "gallery-app://app/index.html" }
    const raceSender = { id: 72, mainFrame: raceFrame }
    const raceEvent = { sender: raceSender, senderFrame: raceFrame }
    const beginning = racy.handle(raceEvent, { protocol: 1, requestId: "race-begin", operation: "project.open.begin", generation: 1, payload: {} })
    await Promise.resolve()
    const cancelled = await racy.handle(raceEvent, { protocol: 1, requestId: "race-cancel", operation: "project.open.cancel", generation: 1, payload: {} })
    assert.equal(cancelled.ok, true)
    const retrying = racy.handle(raceEvent, { protocol: 1, requestId: "race-retry", operation: "project.open.begin", generation: 1, payload: {} })
    await Promise.resolve()
    finishDelayedOpens[0]()
    const staleCompletion = await beginning
    assert.deepEqual(staleCompletion.value, { cancelled: true })
    assert.deepEqual(racy.snapshot(), { generation: 1, state: "opening", pending: false })
    finishDelayedOpens[1]()
    const retried = await retrying
    assert.equal(retried.value.candidateGeneration, 3)
    assert.equal(racy.openMedia({ url: retried.value.config.items[0].url, range: "bytes=0-1" }).status, 206)
    const retryAccepted = await racy.handle(raceEvent, { protocol: 1, requestId: "race-accept", operation: "project.open.accept", generation: 1, payload: { operationId: retried.value.operationId } })
    assert.equal(retryAccepted.generation, 3)
    assert.deepEqual(raceRemoved, [path.join(temporary, "racy-open-2")])
    racy.abandonPending()
    assert.equal(racy.snapshot().state, "ready")
    racy.dispose()
    console.log("Verified: G03 HostPort dispatch, sender/generation/state enforcement, opaque media selection/save, and two-phase open accept/discard cleanup.")
}

run().catch((error) => {
    console.error(error)
    process.exitCode = 1
}).finally(() => fs.rmSync(temporary, { recursive: true, force: true }))
