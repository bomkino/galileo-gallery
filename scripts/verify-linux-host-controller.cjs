const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { createLinuxHostController } = require("../electron/linux-host-controller.cjs")

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-g03-controller-"))
const mediaPath = path.join(temporary, "frame.png")
fs.writeFileSync(mediaPath, "frame-bytes")
const removed = []
const mainFrame = { url: "gallery-app://app/index.html" }
const sender = { id: 71, mainFrame }
const event = { sender, senderFrame: mainFrame }
let openCount = 0

const host = createLinuxHostController({
    owner: "window-71",
    webContentsId: 71,
    identity: () => ({ productId: "galileo-gallery", protocol: 1, platform: "linux" }),
    chooseMedia: ({ grantMedia }) => [grantMedia(mediaPath, "image/png")],
    saveProject: ({ config, mediaPath: resolve }) => ({ itemCount: config.items.length, resolved: resolve(config.items[0].url) === mediaPath }),
    openProject: async ({ generation, grantMedia, signal }) => {
        openCount += 1
        if (signal.aborted) return { cancelled: true }
        const granted = grantMedia(mediaPath, "image/png")
        return { config: { items: [{ url: granted.mediaURL }] }, resourceRoot: path.join(temporary, `opened-${generation}-${openCount}`) }
    },
    removeResourceRoot: (value) => removed.push(value),
})

function envelope(operation, payload = {}, generation = host.snapshot().generation, requestId = `request-${openCount + 1}`) {
    return { protocol: 1, requestId, operation, generation, payload }
}

async function run() {
    assert.deepEqual(host.bootstrap(event), { protocol: 1, generation: 1, state: "ready" })
    const identity = await host.handle(event, envelope("identity.read"))
    assert.deepEqual(identity.value, { productId: "galileo-gallery", protocol: 1, platform: "linux" })
    assert.equal(identity.generation, 1)

    const chosen = await host.handle(event, envelope("media.choose"))
    assert.equal(chosen.ok, true)
    assert.match(chosen.value[0].mediaURL, /^reel-media:\/\/grant\/[a-f0-9]{64}$/)
    assert.equal(JSON.stringify(chosen).includes(mediaPath), false)
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

    const finishDelayedOpens = []
    const raceRemoved = []
    const racy = createLinuxHostController({
        owner: "window-72",
        webContentsId: 72,
        identity: () => ({}),
        chooseMedia: async () => [],
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
