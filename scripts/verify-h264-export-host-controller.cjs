const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { createH264AudioStage } = require("../electron/h264-audio-stage.cjs")
const { createLinuxHostController } = require("../electron/linux-host-controller.cjs")
const { HostPortError } = require("../electron/linux-host-port.cjs")

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-h264-host-"))
const source = path.join(temporary, "source.png")
const audioSource = path.join(temporary, "presenter.wav")
const destination = path.join(temporary, "output.mp4")
fs.writeFileSync(source, "source")
const wav = Buffer.alloc(44 + 48_000 * 4)
wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16)
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(48_000, 24); wav.writeUInt32LE(192_000, 28)
wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(48_000 * 4, 40)
fs.writeFileSync(audioSource, wav)
let runningSignal
let waitForCancel = false
let observedAudio
let destinationChoice = 0

const host = createLinuxHostController({
    owner: "window-96",
    webContentsId: 96,
    identity: () => ({}),
    chooseMedia: ({ grantMedia }) => [{ name: "source.png", type: "image", url: grantMedia(source, "image/png").mediaURL }],
    chooseAudio: async () => null,
    prepareVideoAudio: async () => ({}),
    decodeAudio: async ({ startFrame, frameCount }) => ({ sampleRate: 48_000, channels: 2, startFrame, frameCount, samples: Array(frameCount * 2).fill(0) }),
    audioWaveform: async () => ({}),
    saveProject: async () => ({}),
    openProject: async () => ({ cancelled: true }),
    chooseExportDestination: async () => null,
    runPngFramesExport: async () => ({}),
    createH264AudioStage: ({ snapshot }) => createH264AudioStage({ root: path.join(temporary, "audio"), snapshot }),
    chooseH264Destination: async () => {
        destinationChoice += 1
        return destinationChoice === 1 ? destination : path.join(temporary, `output-${destinationChoice}.mp4`)
    },
    runH264Export: async ({ snapshot, destination: selectedDestination, audio, signal, mediaPath, openExportMedia }) => {
        runningSignal = signal
        observedAudio = audio
        assert.equal(mediaPath(snapshot.config.items[0].url), source)
        const opened = openExportMedia(snapshot.config.items[0].url)
        fs.closeSync(opened.handle)
        if (waitForCancel) await new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new HostPortError("cancelled")), { once: true }))
        const bytes = Buffer.alloc(256, 7)
        fs.writeFileSync(selectedDestination, bytes)
        const hash = crypto.createHash("sha256").update(bytes).digest("hex")
        return {
            format: "mp4-h264-aac", frameCount: snapshot.frameCount, width: snapshot.width, height: snapshot.height,
            alpha: false, audio: "aac-48khz-stereo", audioFrameCount: snapshot.audioFrameCount, bytes: bytes.length,
            sha256: hash, videoDecodeSha256: hash, audioDecodeSha256: hash,
        }
    },
})

const mainFrame = { url: "gallery-app://app/index.html" }
const event = { sender: { id: 96, mainFrame }, senderFrame: mainFrame }
let request = 0
function envelope(operation, payload = {}) {
    request += 1
    return { protocol: 1, requestId: `g06b-request-${request}`, operation, generation: 1, payload }
}

async function run() {
    const media = await host.handle(event, envelope("media.choose"))
    const audioURL = host.grantMedia(audioSource, "audio/wav").mediaURL
    const authoredAudio = (clipCount, duration) => ({
        id: "gallery-audio-intent",
        version: 1,
        sourceVideo: "per-media",
        sampleRate: 48_000,
        channels: 2,
        sources: [{ id: "presenter-source", name: "Presenter", role: "presenter", url: audioURL, sampleRate: 48_000, channels: 2, sampleFrames: 48_000 }],
        lanes: [{ id: "presenter-lane", name: "Presenter", role: "presenter", gain: 1, muted: false, solo: false, clips: Array.from({ length: clipCount }, (_, index) => ({
            id: `presenter-clip-${index}`,
            sourceId: "presenter-source",
            muted: false,
            loop: false,
            timelineStart: { numerator: 0, denominator: 1 },
            sourceIn: { numerator: 0, denominator: 1 },
            sourceSpan: duration,
            duration,
            gain: 1,
            fadeIn: { numerator: 0, denominator: 1 },
            fadeOut: { numerator: 0, denominator: 1 },
        })) }],
        ducking: { enabled: false, triggerLaneId: "presenter-lane", targetLaneIds: [], amount: 0.5, attack: { numerator: 1, denominator: 20 }, release: { numerator: 1, denominator: 5 } },
        master: { gain: 1, muted: false },
    })
    const boundedAudio = authoredAudio(64, { numerator: 1, denominator: 10 })
    const intent = {
        config: { schemaVersion: 2, styleId: "quiet-carousel", items: [{ id: "one", name: "One", type: "image", url: media.value[0].url, ratio: 1, spotlight: false, muted: false }], settings: { backgroundStyle: "solid", playKind: "once", repeatCount: 1 }, audio: boundedAudio },
        width: 64, height: 64, fps: 24, durationMs: 100, cycleDurationMs: 100, finalCycleDurationMs: 100, quality: "high",
    }
    const capability = await host.handle(event, envelope("export.capabilities"))
    assert.deepEqual(capability.value.formats.map((format) => format.id), ["png-frames", "mp4-h264-aac"])
    const prepared = await host.handle(event, envelope("export.h264.preflight", { intent }))
    assert.equal(prepared.value.audioFrameCount, 4_000)
    assert.equal(JSON.stringify(prepared).includes(temporary), false)
    const blockedOpen = await host.handle(event, envelope("project.open.begin"))
    assert.equal(blockedOpen.error.code, "conflict", "Project Open must not revoke media beneath a prepared export")
    for (let index = 0; index < 62; index += 1) {
        const decoded = await host.handle(event, envelope("audio.decode", { url: media.value[0].url, startFrame: 0, frameCount: 4_096 }))
        assert.equal(decoded.ok, true, "export-owned bounded decodes must not trip the general UI request limiter")
    }
    const decodeCap = await host.handle(event, envelope("audio.decode", { url: media.value[0].url, startFrame: 0, frameCount: 4_096 }))
    assert.equal(decodeCap.error.code, "resource_limit", "export-owned audio decode work must retain a snapshot-derived hard cap")
    const pcm = Buffer.alloc(4_000 * 4)
    const appended = await host.handle(event, envelope("export.h264.audio.append", { snapshotId: prepared.value.snapshotId, startFrame: 0, pcm16Base64: pcm.toString("base64") }))
    assert.deepEqual(appended.value, { acceptedFrames: 4_000, nextFrame: 4_000 })
    const finished = await host.handle(event, envelope("export.h264.audio.finish", { snapshotId: prepared.value.snapshotId }))
    assert.equal(finished.value.sampleFrames, 4_000)
    assert.equal(JSON.stringify(finished).includes(temporary), false)
    const chosen = await host.handle(event, envelope("export.h264.destination.choose", { suggestedName: "Gallery.mp4" }))
    assert.match(chosen.value.destinationGrant, /^[a-f0-9]{64}$/)
    assert.equal(JSON.stringify(chosen).includes(destination), false)
    const result = await host.handle(event, envelope("export.h264.start", { snapshotId: prepared.value.snapshotId, destinationGrant: chosen.value.destinationGrant }))
    assert.equal(result.ok, true)
    assert.equal(result.value.format, "mp4-h264-aac")
    assert.equal(result.value.audioFrameCount, 4_000)
    assert.equal(JSON.stringify(result).includes(destination), false)
    assert.equal(observedAudio.sampleFrames, 4_000)

    waitForCancel = true
    const cancelledPreflight = await host.handle(event, envelope("export.h264.preflight", { intent }))
    await host.handle(event, envelope("export.h264.audio.append", { snapshotId: cancelledPreflight.value.snapshotId, startFrame: 0, pcm16Base64: pcm.toString("base64") }))
    await host.handle(event, envelope("export.h264.audio.finish", { snapshotId: cancelledPreflight.value.snapshotId }))
    const cancelledDestination = await host.handle(event, envelope("export.h264.destination.choose", { suggestedName: "Gallery.mp4" }))
    const running = host.handle(event, envelope("export.h264.start", { snapshotId: cancelledPreflight.value.snapshotId, destinationGrant: cancelledDestination.value.destinationGrant }))
    await new Promise((resolve) => setImmediate(resolve))
    const cancelled = await host.handle(event, envelope("export.cancel"))
    assert.deepEqual(cancelled.value, { cancelled: true })
    assert.equal(runningSignal.aborted, true)
    assert.equal((await running).error.code, "cancelled")
    const stale = await host.handle(event, envelope("export.h264.start", { snapshotId: cancelledPreflight.value.snapshotId, destinationGrant: cancelledDestination.value.destinationGrant }))
    assert.equal(stale.error.code, "conflict")

    const fragmentedAudio = authoredAudio(513, { numerator: 1, denominator: 48_000 })
    const fragmentedPrepared = await host.handle(event, envelope("export.h264.preflight", { intent: { ...intent, config: { ...intent.config, audio: fragmentedAudio } } }))
    assert.equal(fragmentedPrepared.ok, true)
    for (let index = 0; index < 513; index += 1) {
        const decoded = await host.handle(event, envelope("audio.decode", { url: media.value[0].url, startFrame: 0, frameCount: 1 }))
        assert.equal(decoded.ok, true, "a preflight-accepted fragmented mix must not hit a fixed-window limiter mid-stage")
    }
    assert.deepEqual((await host.handle(event, envelope("export.cancel"))).value, { cancelled: true })

    const longIntent = { ...intent, durationMs: 10_250, cycleDurationMs: 10_250, finalCycleDurationMs: 10_250 }
    const longPrepared = await host.handle(event, envelope("export.h264.preflight", { intent: longIntent }))
    assert.equal(longPrepared.value.audioFrameCount, 492_000)
    let regularLimited = false
    for (let index = 0; index < 140; index += 1) {
        const response = await host.handle(event, envelope("identity.read"))
        if (response.error?.code === "resource_limit") regularLimited = true
    }
    assert.equal(regularLimited, true, "ordinary IPC flood must saturate its bounded lane")
    const saturatedAppendPcm = Buffer.alloc(65_536 * 4)
    const saturatedAppend = await host.handle(event, envelope("export.h264.audio.append", {
        snapshotId: longPrepared.value.snapshotId,
        startFrame: 0,
        pcm16Base64: saturatedAppendPcm.toString("base64"),
    }))
    assert.deepEqual(saturatedAppend.value, { acceptedFrames: 65_536, nextFrame: 65_536 }, "validated PCM append must retain its export-owned lane after ordinary IPC saturation")
    for (let index = 0; index < 121; index += 1) {
        const decoded = await host.handle(event, envelope("audio.decode", { url: media.value[0].url, startFrame: 0, frameCount: 4_096 }))
        assert.equal(decoded.ok, true, "a 10.25 second verified mix must retain its validated bounded export lane")
    }
    for (let index = 0; index < 512; index += 1) await host.handle(event, envelope("export.cancel", { junk: true }))
    const oversizedControl = await host.handle(event, envelope("export.cancel", { junk: "x".repeat(600 * 1024) }))
    assert.equal(oversizedControl.error.code, "resource_limit", "malformed control names must remain behind bounded ingress before payload sizing")
    for (let index = 0; index < 60; index += 1) {
        const unrelatedControl = await host.handle(event, envelope("audio.cancel"))
        assert.equal(unrelatedControl.ok, true)
    }
    const saturatedCancel = await host.handle(event, envelope("export.cancel"))
    assert.deepEqual(saturatedCancel.value, { cancelled: true }, "export cancellation must survive ordinary saturation, malformed control ingress, and unrelated valid controls")
    assert.equal(fs.existsSync(path.join(temporary, "audio")) ? fs.readdirSync(path.join(temporary, "audio")).length : 0, 0)

    const malformedFlood = await host.handle(event, envelope("export.h264.audio.append", {}))
    assert.equal(malformedFlood.error.code, "resource_limit", "malformed export IPC must not bypass ingress/general limits")
    host.dispose()
    assert.equal(fs.existsSync(path.join(temporary, "audio")) ? fs.readdirSync(path.join(temporary, "audio")).length : 0, 0)

    const failedHost = createLinuxHostController({
        owner: "window-97", webContentsId: 97, identity: () => ({}), chooseMedia: async () => [], chooseAudio: async () => null,
        prepareVideoAudio: async () => ({}), decodeAudio: async () => ({}), audioWaveform: async () => ({}), saveProject: async () => ({}),
        openProject: async () => ({ cancelled: true }), chooseExportDestination: async () => null, runPngFramesExport: async () => ({}),
        createH264AudioStage: () => { throw new HostPortError("resource_limit") }, chooseH264Destination: async () => null, runH264Export: async () => ({}),
    })
    const failedFrame = { url: "gallery-app://app/index.html" }
    const failedEvent = { sender: { id: 97, mainFrame: failedFrame }, senderFrame: failedFrame }
    const failedPreflight = await failedHost.handle(failedEvent, { protocol: 1, requestId: "failed-preflight", operation: "export.h264.preflight", generation: 1, payload: { intent } })
    assert.equal(failedPreflight.error.code, "resource_limit")
    const openAfterFailure = await failedHost.handle(failedEvent, { protocol: 1, requestId: "open-after-failure", operation: "project.open.begin", generation: 1, payload: {} })
    assert.deepEqual(openAfterFailure.value, { cancelled: true }, "failed preflight must publish no stale export authority")
    failedHost.dispose()
    console.log("Verified: G06B path-free HostPort, atomic preflight, bounded export IPC, long-audio lane, one-shot destination/start, and saturation-safe cancellation.")
}

run().catch((error) => {
    console.error(error)
    process.exitCode = 1
}).finally(() => fs.rmSync(temporary, { recursive: true, force: true }))
