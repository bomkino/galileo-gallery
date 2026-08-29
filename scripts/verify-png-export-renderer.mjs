import assert from "node:assert/strict"
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

function baseHost(overrides = {}) {
    return {
        platform: "linux",
        exportCapabilities: async () => ({ version: 1, formats: [{ id: "png-frames", available: true, alpha: true, audio: false, consequence: "No audio." }] }),
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
    blocked.resolve({ version: 1, formats: [{ id: "png-frames", available: true, alpha: true, audio: false, consequence: "No audio." }] })
    await first

    let subscribed
    const progressApi = createHostBackedAPI(baseHost({ onExportProgress: (callback) => { subscribed = callback; return () => { subscribed = undefined } } }))
    let progress
    const unsubscribe = progressApi.onExportProgress((value) => { progress = value })
    subscribed({ exportId: "png-123", phase: "rendering", progress: 0.5, frame: 1, totalFrames: 2 })
    assert.equal(progress.phase, "rendering")
    unsubscribe()
    assert.equal(subscribed, undefined)
    console.log("Verified: G06A renderer host adapter owns one workflow, bridges progress, and translates destination/active cancellation without error UI.")
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
