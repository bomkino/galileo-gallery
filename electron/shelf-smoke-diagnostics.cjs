const crypto = require("node:crypto")

const STAGE = /^[a-z][a-z0-9.-]{0,95}$/
const ERROR_NAME = /^[A-Za-z][A-Za-z0-9]{0,63}$/
const CATEGORY = new Set(["canvas-readback", "canvas-security", "harness-assertion", "media-state-race", "renderer-exception", "resource-limit", "transport-rejection"])

function shelfDiagnosticStage(value) {
    if (typeof value !== "string" || !STAGE.test(value)) throw new Error("Shelf diagnostic stage is invalid.")
    return value
}

function shelfDiagnosticCheckpoint(stage, detail = {}) {
    const normalized = { stage: shelfDiagnosticStage(stage) }
    const exact = Object.keys(detail).sort().join(":")
    if (!["", "journey:normalized:step"].includes(exact)) throw new Error("Shelf diagnostic checkpoint shape is invalid.")
    if (exact) {
        if (!["original", "replacement"].includes(detail.journey)
            || !Number.isSafeInteger(detail.step) || detail.step < 0 || detail.step > 64
            || !Number.isFinite(detail.normalized) || detail.normalized < 0 || detail.normalized > 1) {
            throw new Error("Shelf diagnostic checkpoint detail is invalid.")
        }
        normalized.journey = detail.journey
        normalized.step = detail.step
        normalized.normalized = detail.normalized
    }
    return Object.freeze(normalized)
}

function rendererProbeSource(stage, expression) {
    const exactStage = shelfDiagnosticStage(stage)
    if (typeof expression !== "string" || !/^async \(\) => \{/.test(expression.trim())) throw new Error("Shelf renderer probe expression is invalid.")
    return `(async () => {
        const fingerprint = (input) => {
            let hash = 0x811c9dc5
            for (let index = 0; index < input.length; index += 1) {
                hash ^= input.charCodeAt(index)
                hash = Math.imul(hash, 0x01000193)
            }
            return (hash >>> 0).toString(16).padStart(8, '0')
        }
        const classify = (name, message) => {
            if (name === 'SecurityError' || /taint|cross-origin|security/i.test(message)) return 'canvas-security'
            if (name === 'QuotaExceededError' || /quota|allocation|memory/i.test(message)) return 'resource-limit'
            if (name === 'InvalidStateError' || /detached|not usable|media state|source image|current frame/i.test(message)) return 'media-state-race'
            if (/canvas|drawimage|getimagedata|getcontext/i.test(message)) return 'canvas-readback'
            return 'renderer-exception'
        }
        try {
            return JSON.stringify({ ok: true, value: await (${expression})() })
        } catch (error) {
            const rawName = String(error?.name ?? 'Error')
            const name = /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(rawName) ? rawName : 'Error'
            const message = String(error?.message ?? error)
            return JSON.stringify({
                ok: false,
                error: {
                    stage: ${JSON.stringify(exactStage)},
                    channel: 'renderer',
                    name,
                    category: classify(name, message),
                    fingerprint: fingerprint(name + '\\n' + message),
                },
            })
        }
    })()`
}

function decodeShelfPixelSample(value) {
    if (!value || typeof value !== "object" || typeof value.pixelsBase64 !== "string"
        || !/^[A-Za-z0-9+/]{1024}$/.test(value.pixelsBase64)
        || ![value.targetTime, value.presentedTime].every((candidate) => candidate === null || (typeof candidate === "number" && Number.isFinite(candidate)))) {
        throw new Error("Shelf pixel sample is invalid.")
    }
    const pixels = Buffer.from(value.pixelsBase64, "base64")
    if (pixels.length !== 16 * 12 * 4 || pixels.toString("base64") !== value.pixelsBase64) throw new Error("Shelf pixel sample is invalid.")
    return {
        pixels: [...pixels],
        digest: crypto.createHash("sha256").update(pixels).digest("hex"),
        targetTime: value.targetTime,
        presentedTime: value.presentedTime,
    }
}

function validShelfDiagnostic(value) {
    return Boolean(value && typeof value === "object"
        && STAGE.test(value.stage)
        && ["harness", "renderer", "transport"].includes(value.channel)
        && ERROR_NAME.test(value.name)
        && CATEGORY.has(value.category)
        && /^[a-f0-9]{8}$|^[a-f0-9]{64}$/.test(value.fingerprint))
}

function harnessDiagnostic(stage, error) {
    const rawName = String(error?.name ?? "Error")
    const name = ERROR_NAME.test(rawName) ? rawName : "Error"
    const raw = String(error?.stack ?? error?.message ?? error)
    return Object.freeze({
        stage: shelfDiagnosticStage(stage),
        channel: "harness",
        name,
        category: "harness-assertion",
        fingerprint: crypto.createHash("sha256").update(raw).digest("hex"),
    })
}

function transportDiagnostic(stage, error) {
    const rawName = String(error?.name ?? "Error")
    const name = ERROR_NAME.test(rawName) ? rawName : "Error"
    const raw = String(error?.stack ?? error?.message ?? error)
    return Object.freeze({
        stage: shelfDiagnosticStage(stage),
        channel: "transport",
        name,
        category: "transport-rejection",
        fingerprint: crypto.createHash("sha256").update(raw).digest("hex"),
    })
}

async function executeShelfRendererProbe(webContents, stage, expression) {
    const exactStage = shelfDiagnosticStage(stage)
    let envelope
    try {
        const serialized = await webContents.executeJavaScript(rendererProbeSource(exactStage, expression))
        envelope = typeof serialized === "string" ? JSON.parse(serialized) : serialized
    } catch (error) {
        const diagnostic = transportDiagnostic(exactStage, error)
        const failure = new Error(`Shelf renderer transport failed at ${diagnostic.stage} (${diagnostic.name}/${diagnostic.fingerprint}).`)
        failure.shelfDiagnostic = diagnostic
        throw failure
    }
    if (!envelope?.ok) {
        const diagnostic = validShelfDiagnostic(envelope?.error)
            ? Object.freeze({ ...envelope.error })
            : Object.freeze({ stage: exactStage, channel: "renderer", name: "Error", category: "renderer-exception", fingerprint: "00000000" })
        const failure = new Error(`Shelf renderer probe failed at ${diagnostic.stage} (${diagnostic.name}/${diagnostic.category}/${diagnostic.fingerprint}).`)
        failure.shelfDiagnostic = diagnostic
        throw failure
    }
    return envelope.value
}

module.exports = {
    decodeShelfPixelSample,
    executeShelfRendererProbe,
    harnessDiagnostic,
    rendererProbeSource,
    shelfDiagnosticCheckpoint,
    shelfDiagnosticStage,
    transportDiagnostic,
    validShelfDiagnostic,
}
