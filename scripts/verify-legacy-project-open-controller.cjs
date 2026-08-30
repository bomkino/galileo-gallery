const assert = require("node:assert/strict")
const { createLegacyProjectOpenController } = require("../electron/legacy-project-open-controller.cjs")

function deferred() {
    let resolve
    const promise = new Promise((yes) => { resolve = yes })
    return { promise, resolve }
}

function eventFor(id = 41, url = "gallery-app://app/index.html") {
    const mainFrame = { url }
    const sender = { id, mainFrame }
    return { sender, senderFrame: mainFrame }
}

async function run() {
    const removed = []
    const opens = []
    const event = eventFor()
    const controller = createLegacyProjectOpenController({
        webContentsId: 41,
        openProject: ({ signal }) => {
            const next = opens.shift()
            if (!next) throw new Error("missing fixture")
            return typeof next === "function" ? next(signal) : next
        },
        removeResourceRoot: (root) => removed.push(root),
    })

    opens.push({ config: { id: "first" }, resourceRoot: "/owned/open-first" })
    const first = await controller.begin(event)
    assert.match(first.operationId, /^[a-f0-9]{32}$/)
    assert.deepEqual(first.config, { id: "first" })
    assert.equal(JSON.stringify(first).includes("/owned/"), false, "resource roots must remain host-private")
    assert.deepEqual(removed, [], "candidate authority must remain live until an explicit renderer decision")
    assert.deepEqual(controller.accept(event, first.operationId), { accepted: true })
    assert.deepEqual(controller.snapshot(), { state: "ready", opening: false, pending: false, hasCurrentProject: true })
    assert.deepEqual(removed, [], "first acceptance has no prior Project to retire")

    opens.push({ config: { id: "discarded" }, resourceRoot: "/owned/open-discarded" })
    const discarded = await controller.begin(event)
    assert.throws(() => controller.accept(event, { forged: discarded.operationId }), (error) => error.code === "invalid_request")
    assert.throws(() => controller.accept(event, "0".repeat(32)), (error) => error.code === "import_conflict")
    assert.deepEqual(removed, [], "wrong opaque authority must not mutate either Project")
    assert.deepEqual(controller.discard(event, discarded.operationId), { discarded: true })
    assert.deepEqual(removed, ["/owned/open-discarded"])

    opens.push({ config: { id: "second" }, resourceRoot: "/owned/open-second" })
    const second = await controller.begin(event)
    assert.deepEqual(controller.accept(event, second.operationId), { accepted: true })
    assert.deepEqual(removed, ["/owned/open-discarded", "/owned/open-first"], "prior Project retires only after candidate acceptance")

    opens.push({ failure: { code: "corrupt_input", message: "Unreadable." }, resourceRoot: "/owned/open-failed" })
    assert.deepEqual(await controller.begin(event), { failure: { code: "corrupt_input", message: "Unreadable." } })
    assert.deepEqual(removed, ["/owned/open-discarded", "/owned/open-first", "/owned/open-failed"])
    assert.equal(controller.snapshot().hasCurrentProject, true, "candidate failure must preserve the prior Project")

    const delayed = deferred()
    opens.push((signal) => {
        assert.equal(signal.aborted, false)
        return delayed.promise
    })
    const beginning = controller.begin(event)
    await Promise.resolve()
    assert.deepEqual(controller.cancel(event), { cancelled: true })
    delayed.resolve({ config: { id: "late" }, resourceRoot: "/owned/open-late" })
    assert.deepEqual(await beginning, { cancelled: true })
    assert.equal(removed.filter((root) => root === "/owned/open-late").length, 1, "late staged candidate retires exactly once")

    opens.push({ config: { id: "navigation" }, resourceRoot: "/owned/open-navigation" })
    const navigation = await controller.begin(event)
    assert.match(navigation.operationId, /^[a-f0-9]{32}$/)
    controller.abandon()
    controller.abandon()
    assert.equal(removed.filter((root) => root === "/owned/open-navigation").length, 1, "navigation/crash abandonment retires pending authority exactly once")
    assert.throws(() => controller.accept(event, navigation.operationId), (error) => error.code === "import_conflict")

    opens.push({ config: { id: "attacker" }, resourceRoot: "/owned/open-attacker" })
    await assert.rejects(controller.begin(eventFor(99)), (error) => error.code === "permission_denied")
    await assert.rejects(controller.begin(eventFor(41, "https://attacker.example")), (error) => error.code === "permission_denied")
    const subframe = eventFor()
    subframe.senderFrame = { url: "gallery-app://app/index.html" }
    await assert.rejects(controller.begin(subframe), (error) => error.code === "permission_denied")
    assert.equal(opens.length, 1, "untrusted senders must never reach archive opening")
    opens.shift()

    controller.dispose()
    controller.dispose()
    assert.equal(removed.filter((root) => root === "/owned/open-second").length, 1, "current Project retires exactly once at owner disposal")
    assert.equal(controller.snapshot().state, "closed")

    console.log("Verified: legacy Project open binds opaque authority to one sender, preserves prior state, and retires candidates exactly on discard, cancel, navigation, crash, and disposal.")
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
