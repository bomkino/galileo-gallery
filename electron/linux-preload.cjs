const { contextBridge, ipcRenderer } = require("electron")

const CHANNEL = "gallery-host:request"
let generation = 0
let counter = 0
const bootstrap = ipcRenderer.invoke("gallery-host:bootstrap").then((value) => {
    if (!ownExact(value, ["protocol", "generation", "state"]) || value.protocol !== 1 || !Number.isSafeInteger(value.generation)) {
        throw new Error("Host bootstrap failed.")
    }
    generation = value.generation
})

function ownExact(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const actual = Object.keys(value).sort()
    const expected = [...keys].sort()
    return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value
    for (const child of Object.values(value)) deepFreeze(child)
    return Object.freeze(value)
}

function validateResponse(value, requestId, expectedGeneration, allowGenerationAdvance) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value.requestId !== requestId || !Number.isSafeInteger(value.generation)) {
        throw new Error("Host returned an invalid response.")
    }
    if (allowGenerationAdvance ? value.generation <= expectedGeneration : value.generation !== expectedGeneration) throw new Error("Host returned an invalid response.")
    if (value.ok === true) {
        if (!ownExact(value, ["ok", "requestId", "generation", "value"])) throw new Error("Host returned an invalid response.")
        return deepFreeze(value)
    }
    if (value.ok === false && ownExact(value, ["ok", "requestId", "generation", "error"]) && ownExact(value.error, ["code", "diagnosticId"])) {
        return deepFreeze(value)
    }
    throw new Error("Host returned an invalid response.")
}

async function invoke(operation, payload = {}, allowGenerationAdvance = false) {
    await bootstrap
    counter += 1
    const requestId = `request-${Date.now().toString(36)}-${counter.toString(36)}`
    const requestGeneration = generation
    const response = validateResponse(await ipcRenderer.invoke(CHANNEL, {
        protocol: 1,
        requestId,
        operation,
        generation,
        payload,
    }), requestId, requestGeneration, allowGenerationAdvance)
    if (!response.ok) {
        const error = new Error(response.error.code)
        error.code = response.error.code
        error.diagnosticId = response.error.diagnosticId
        throw error
    }
    return response
}

const GRANT_URL = /^reel-media:\/\/grant\/[a-f0-9]{64}$/
const finite = (value, minimum, maximum) => typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum

function audioChoice(value, role) {
    if (value === null) return null
    if (!ownExact(value, ["name", "role", "url", "sampleRate", "channels", "sampleFrames"])
        || typeof value.name !== "string" || value.name.length < 1 || value.name.length > 512 || /[\\/\x00-\x1f]/.test(value.name)
        || value.role !== role || typeof value.url !== "string" || !GRANT_URL.test(value.url)
        || !Number.isSafeInteger(value.sampleRate) || value.sampleRate < 8_000 || value.sampleRate > 192_000
        || ![1, 2].includes(value.channels) || !Number.isSafeInteger(value.sampleFrames) || value.sampleFrames < 1) throw new Error("Host returned invalid audio metadata.")
    return value
}

function decodedAudio(value, startFrame, frameCount) {
    if (!ownExact(value, ["sampleRate", "channels", "startFrame", "frameCount", "samples"])
        || !Number.isSafeInteger(value.sampleRate) || value.sampleRate < 8_000 || value.sampleRate > 192_000 || ![1, 2].includes(value.channels)
        || value.startFrame !== startFrame || value.frameCount !== frameCount || !Array.isArray(value.samples)
        || value.samples.length !== frameCount * value.channels || value.samples.some((sample) => !finite(sample, -1, 1))) throw new Error("Host returned invalid PCM audio.")
    return value
}

function audioWaveform(value, bucketCount) {
    if (!ownExact(value, ["sampleRate", "channels", "sampleFrames", "buckets"])
        || !Number.isSafeInteger(value.sampleRate) || value.sampleRate < 8_000 || value.sampleRate > 192_000 || ![1, 2].includes(value.channels)
        || !Number.isSafeInteger(value.sampleFrames) || value.sampleFrames < 1 || !Array.isArray(value.buckets) || value.buckets.length !== bucketCount
        || value.buckets.some((bucket) => !ownExact(bucket, ["minimum", "maximum", "rms"])
            || !finite(bucket.minimum, -1, 1) || !finite(bucket.maximum, -1, 1) || bucket.minimum > bucket.maximum || !finite(bucket.rms, 0, 1))) throw new Error("Host returned an invalid waveform.")
    return value
}

const galleryHost = {
    platform: "linux",
    identity: async () => (await invoke("identity.read")).value,
    chooseMedia: async () => (await invoke("media.choose")).value,
    releaseMedia: async (urls) => (await invoke("media.release", { urls })).value,
    chooseAudio: async (role) => audioChoice((await invoke("audio.choose", { role })).value, role),
    decodeAudio: async (url, startFrame, frameCount) => decodedAudio((await invoke("audio.decode", { url, startFrame, frameCount })).value, startFrame, frameCount),
    audioWaveform: async (url, buckets) => audioWaveform((await invoke("audio.waveform", { url, buckets })).value, buckets),
    cancelAudio: async () => (await invoke("audio.cancel")).value,
    saveProject: async (config) => (await invoke("project.save", { config })).value,
    beginProjectOpen: async () => (await invoke("project.open.begin")).value,
    acceptProjectOpen: async (operationId) => {
        const response = await invoke("project.open.accept", { operationId }, true)
        generation = response.generation
        return response.value
    },
    discardProjectOpen: async (operationId) => (await invoke("project.open.discard", { operationId })).value,
    cancelProjectOpen: async () => (await invoke("project.open.cancel")).value,
}

contextBridge.exposeInMainWorld("galleryHost", deepFreeze(galleryHost))
