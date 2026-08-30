const assert = require("node:assert/strict")
const vm = require("node:vm")
const {
    decodeShelfPixelSample,
    executeShelfRendererProbe,
    harnessDiagnostic,
    rendererProbeSource,
    shelfDiagnosticCheckpoint,
    transportDiagnostic,
    validShelfDiagnostic,
} = require("../electron/shelf-smoke-diagnostics.cjs")
const { shelfMediaSamplesProbeExpression } = require("../electron/shelf-renderer-smoke.cjs")

async function run() {
    assert.deepEqual(shelfDiagnosticCheckpoint("poster.original.scrub-14", { journey: "original", step: 14, normalized: 14 / 64 }), {
        stage: "poster.original.scrub-14",
        journey: "original",
        step: 14,
        normalized: 14 / 64,
    })
    assert.throws(() => shelfDiagnosticCheckpoint("/private/path"), /stage is invalid/)
    assert.throws(() => shelfDiagnosticCheckpoint("poster.original", { journey: "private", step: 14, normalized: 14 / 64 }), /detail is invalid/)

    const caught = JSON.parse(await vm.runInNewContext(rendererProbeSource("poster.original.sample-14", `async () => {
        const error = new Error('/private/fixture/source.mp4 is detached from its current frame')
        error.name = 'InvalidStateError'
        throw error
    }`)))
    assert.equal(caught.ok, false)
    assert.deepEqual(Object.keys(caught.error).sort(), ["category", "channel", "fingerprint", "name", "stage"])
    assert.deepEqual({ ...caught.error, fingerprint: "redacted" }, {
        stage: "poster.original.sample-14",
        channel: "renderer",
        name: "InvalidStateError",
        category: "media-state-race",
        fingerprint: "redacted",
    })
    assert.match(caught.error.fingerprint, /^[a-f0-9]{8}$/)
    assert.equal(JSON.stringify(caught).includes("private"), false)
    assert.equal(validShelfDiagnostic(caught.error), true)

    const exactPixelProbe = JSON.parse(await vm.runInNewContext(rendererProbeSource("poster.original.sample-0", shelfMediaSamplesProbeExpression()), {
        document: { querySelectorAll: () => [], querySelector: () => null },
        HTMLCanvasElement: class HTMLCanvasElement {},
        HTMLImageElement: class HTMLImageElement {},
        HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
        HTMLVideoElement: class HTMLVideoElement {},
    }))
    assert.deepEqual(JSON.parse(JSON.stringify(exactPixelProbe)), {
        ok: true,
        value: { result: [], liveNodeCount: 0, sampleErrors: [], stage: null },
    })

    const transient = JSON.parse(await vm.runInNewContext(rendererProbeSource("poster.original.sample-14", `async () => {
        const name = 'InvalidStateError'
        const message = 'The source image is detached from its current frame'
        return { name, category: classify(name, message), fingerprint: fingerprint(name + '\\n' + message) }
    }`)))
    assert.deepEqual({ ...transient.value, fingerprint: "redacted" }, { name: "InvalidStateError", category: "media-state-race", fingerprint: "redacted" })
    assert.match(transient.value.fingerprint, /^[a-f0-9]{8}$/)

    const pixelsBase64 = Buffer.alloc(16 * 12 * 4, 37).toString("base64")
    const decoded = decodeShelfPixelSample({ pixelsBase64, targetTime: 0.2, presentedTime: 0.16 })
    assert.equal(decoded.pixels.length, 16 * 12 * 4)
    assert.equal(decoded.pixels.every((value) => value === 37), true)
    assert.match(decoded.digest, /^[a-f0-9]{64}$/)
    assert.deepEqual({ targetTime: decoded.targetTime, presentedTime: decoded.presentedTime }, { targetTime: 0.2, presentedTime: 0.16 })
    assert.throws(() => decodeShelfPixelSample({ pixelsBase64: "private/path", targetTime: null, presentedTime: null }), /sample is invalid/)

    const serializedSuccess = await executeShelfRendererProbe({ executeJavaScript: async () => JSON.stringify({ ok: true, value: { stage: true } }) }, "poster.original.sample-1", "async () => { return true }")
    assert.deepEqual(serializedSuccess, { stage: true })

    const success = await executeShelfRendererProbe({ executeJavaScript: async () => ({ ok: true, value: { stage: true } }) }, "poster.original.sample-1", "async () => { return true }")
    assert.deepEqual(success, { stage: true })

    const rendererFailure = await executeShelfRendererProbe({ executeJavaScript: async () => caught }, "poster.original.sample-14", "async () => { return true }").catch((error) => error)
    assert.match(rendererFailure.message, /poster\.original\.sample-14.*InvalidStateError\/media-state-race/)
    assert.deepEqual(rendererFailure.shelfDiagnostic, JSON.parse(JSON.stringify(caught.error)))

    const privateTransportError = new Error("Script failed at /private/fixture/source.mp4")
    const transport = transportDiagnostic("poster.original.scrub-14", privateTransportError)
    assert.equal(validShelfDiagnostic(transport), true)
    assert.equal(transport.category, "transport-rejection")
    assert.equal(JSON.stringify(transport).includes("private"), false)
    const transportFailure = await executeShelfRendererProbe({ executeJavaScript: async () => { throw privateTransportError } }, "poster.original.scrub-14", "async () => { return true }").catch((error) => error)
    assert.deepEqual(transportFailure.shelfDiagnostic, transport)
    assert.equal(transportFailure.message.includes("private"), false)

    const harness = harnessDiagnostic("poster.original.correlate", new Error("Assertion at /private/fixture/source.mp4"))
    assert.equal(validShelfDiagnostic(harness), true)
    assert.deepEqual({ ...harness, fingerprint: "redacted" }, {
        stage: "poster.original.correlate",
        channel: "harness",
        name: "Error",
        category: "harness-assertion",
        fingerprint: "redacted",
    })
    assert.equal(JSON.stringify(harness).includes("private"), false)

    console.log("Verified: Shelf renderer probes preserve exact stage/error fingerprints, classify transient decoder races, and redact private paths by construction.")
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
