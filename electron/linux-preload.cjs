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

function validateResponse(value, requestId) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value.requestId !== requestId || !Number.isSafeInteger(value.generation)) {
        throw new Error("Host returned an invalid response.")
    }
    if (value.ok === true) {
        if (!ownExact(value, ["ok", "requestId", "generation", "value"])) throw new Error("Host returned an invalid response.")
        return deepFreeze(value)
    }
    if (value.ok === false && ownExact(value, ["ok", "requestId", "generation", "error"]) && ownExact(value.error, ["code", "diagnosticId"])) {
        return deepFreeze(value)
    }
    throw new Error("Host returned an invalid response.")
}

async function invoke(operation, payload = {}) {
    await bootstrap
    counter += 1
    const requestId = `request-${Date.now().toString(36)}-${counter.toString(36)}`
    const response = validateResponse(await ipcRenderer.invoke(CHANNEL, {
        protocol: 1,
        requestId,
        operation,
        generation,
        payload,
    }), requestId)
    if (!response.ok) {
        const error = new Error(response.error.code)
        error.code = response.error.code
        error.diagnosticId = response.error.diagnosticId
        throw error
    }
    return response
}

const galleryHost = {
    platform: "linux",
    identity: async () => (await invoke("identity.read")).value,
    chooseMedia: async () => (await invoke("media.choose")).value,
    releaseMedia: async (urls) => (await invoke("media.release", { urls })).value,
    saveProject: async (config) => (await invoke("project.save", { config })).value,
    beginProjectOpen: async () => (await invoke("project.open.begin")).value,
    acceptProjectOpen: async (operationId) => {
        const response = await invoke("project.open.accept", { operationId })
        generation = response.generation
        return response.value
    },
    discardProjectOpen: async (operationId) => (await invoke("project.open.discard", { operationId })).value,
    cancelProjectOpen: async () => (await invoke("project.open.cancel")).value,
}

contextBridge.exposeInMainWorld("galleryHost", deepFreeze(galleryHost))
