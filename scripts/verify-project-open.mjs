import assert from "node:assert/strict"
import {
    applyProjectOpenTransaction,
    admitShelfMediaItems,
    createProjectMutationLane,
    projectConfigAfterOpen,
    projectOpenNotice,
    withDecoderAdmissionGate,
} from "../src/projectOpen.ts"

const priorProject = Object.freeze({
    schemaVersion: 2,
    styleId: "opening-reel",
    items: Object.freeze([]),
    settings: Object.freeze({ marker: "prior-state" }),
})

for (const result of [
    { cancelled: true },
    { failure: { code: "legacy_project_unsupported", message: "Legacy project rejected safely." } },
    { failure: { code: "unsafe_entry_name", message: "Unsafe archive rejected safely." } },
]) {
    assert.strictEqual(projectConfigAfterOpen(priorProject, result), priorProject)
}

const replacement = { ...priorProject, styleId: "quiet-carousel" }
assert.strictEqual(projectConfigAfterOpen(priorProject, { config: replacement, operationId: "a".repeat(32) }), replacement)
const shelfReplacement = {
    ...priorProject,
    styleId: "the-shelf",
    sceneVersion: 2,
    items: [{ id: "edition-one", ratio: 4 / 3, aspectMode: "auto" }],
    settings: { ratioMode: "auto", axis: "horizontal" },
}
assert.strictEqual(projectConfigAfterOpen(priorProject, { config: shelfReplacement, operationId: "b".repeat(32) }), shelfReplacement)
for (const failure of [
    { code: "scene_invalid", message: "Shelf v1 is unsupported." },
    { code: "future_version_unsupported", message: "Future Shelf version rejected safely." },
    { code: "manifest_invalid", message: "Shelf frame intent rejected safely." },
]) {
    assert.strictEqual(projectConfigAfterOpen(priorProject, { failure }), priorProject)
}
const lightTableReplacement = {
    ...priorProject,
    styleId: "light-table",
    sceneVersion: 2,
    items: [{ id: "review-one", ratio: 4 / 3, aspectMode: "auto", fit: "contain", crop: { x: 0, y: 0, width: 1, height: 1 }, focal: { x: 0.5, y: 0.5 } }],
    settings: { axis: "horizontal", backgroundStyle: "solid", tableSpread: 0.72, overlap: 0.1, underlightStrength: 0.42, focusBehavior: "route", nudgeRestraint: 0.28 },
}
assert.strictEqual(projectConfigAfterOpen(priorProject, { config: lightTableReplacement, operationId: "d".repeat(32) }), lightTableReplacement)
for (const failure of [
    { code: "scene_invalid", message: "Light Table parameters rejected safely." },
    { code: "look_invalid", message: "Transparent Light Table rejected safely." },
    { code: "future_version_unsupported", message: "Future Light Table version rejected safely." },
    { code: "timeline_invalid", message: "Light Table Timeline rejected safely." },
]) {
    assert.strictEqual(projectConfigAfterOpen(priorProject, { failure }), priorProject)
}
assert.equal(projectOpenNotice({ cancelled: true }), "Project opening cancelled")
assert.equal(
    projectOpenNotice({ failure: { code: "legacy_project_unsupported", message: "Legacy project rejected safely." } }),
    "Legacy project rejected safely."
)

const lane = createProjectMutationLane()
const laneEvents = []
let concurrent = 0
let maximumConcurrent = 0
let releaseFirst
const firstGate = new Promise((resolve) => { releaseFirst = resolve })
const first = lane.run(async () => {
    concurrent += 1
    maximumConcurrent = Math.max(maximumConcurrent, concurrent)
    laneEvents.push("first:start")
    await firstGate
    laneEvents.push("first:end")
    concurrent -= 1
    return "first"
})
const second = lane.run(async () => {
    concurrent += 1
    maximumConcurrent = Math.max(maximumConcurrent, concurrent)
    laneEvents.push("second:start")
    concurrent -= 1
    return "second"
})
await Promise.resolve()
assert.deepEqual(laneEvents, ["first:start"])
releaseFirst()
assert.deepEqual(await Promise.all([first, second]), ["first", "second"])
assert.deepEqual(laneEvents, ["first:start", "first:end", "second:start"])
assert.equal(maximumConcurrent, 1)

const gateEvents = []
const gatedResult = await withDecoderAdmissionGate({
    unmount: () => gateEvents.push("unmount"),
    paint: async () => gateEvents.push("paint"),
    remount: () => gateEvents.push("remount"),
}, async () => {
    gateEvents.push("admit")
    return "admitted"
})
assert.equal(gatedResult, "admitted")
assert.deepEqual(gateEvents, ["unmount", "paint", "paint", "admit", "remount"])

gateEvents.length = 0
await assert.rejects(withDecoderAdmissionGate({
    unmount: () => gateEvents.push("unmount"),
    paint: async () => gateEvents.push("paint"),
    remount: () => gateEvents.push("remount"),
}, async () => {
    gateEvents.push("admit")
    throw new Error("corrupt source")
}), /corrupt source/)
assert.deepEqual(gateEvents, ["unmount", "paint", "paint", "admit", "remount"], "failed admission must restore preview only after decoder cleanup rejects")

const originalShelfItems = [
    { id: "still", name: "Still", type: "image", url: "reel-media://grant/original-still", ratio: 1 },
    { id: "video", name: "Video", type: "video", url: "reel-media://grant/original-video", ratio: 16 / 9 },
]
let admittedSources
const preparedShelfItems = await admitShelfMediaItems(originalShelfItems, async (sources) => {
    admittedSources = sources
    return [{ id: "video", url: "reel-media://grant/original-video", width: 1080, height: 1920 }]
})
assert.strictEqual(admittedSources, originalShelfItems, "admission must receive unchanged original source records")
assert.equal(preparedShelfItems[1].url, "reel-media://grant/original-video")
assert.equal(preparedShelfItems[1].ratio, 1080 / 1920)
assert.equal(originalShelfItems[1].ratio, 16 / 9, "preparation must not mutate prior Project state")

await assert.rejects(admitShelfMediaItems(originalShelfItems, async (sources) => {
    assert.equal(sources[1].url, "reel-media://grant/original-video")
    throw new Error("corrupt source")
}), /corrupt source/)
assert.equal(originalShelfItems[1].ratio, 16 / 9, "corrupt admission must not fall back to synthetic 16:9 state or mutate the candidate")
await assert.rejects(admitShelfMediaItems(originalShelfItems, async () => []), /decoded-frame proof is missing/)

function transaction(overrides = {}) {
    const events = []
    const state = { config: priorProject, epoch: 7 }
    const operationId = "c".repeat(32)
    return {
        events,
        state,
        options: {
            current: () => ({ ...state }),
            open: async () => { events.push("open"); return { config: replacement, operationId } },
            normalize: (config) => { events.push("normalize"); return config },
            stillCurrent: (config, epoch) => state.config === config && state.epoch === epoch,
            accept: async (id) => { assert.equal(id, operationId); events.push("accept") },
            discard: async (id) => { assert.equal(id, operationId); events.push("discard") },
            commit: (config) => { events.push("commit"); state.config = config; state.epoch += 1; return true },
            ...overrides,
        },
    }
}

const applied = transaction()
assert.deepEqual(await applyProjectOpenTransaction(applied.options), { state: "applied", config: replacement })
assert.deepEqual(applied.events, ["open", "normalize", "accept", "commit"], "commit must be synchronous immediately after awaited acceptance")
assert.strictEqual(applied.state.config, replacement)

const stale = transaction()
stale.options.open = async () => {
    stale.events.push("open")
    stale.state.config = { ...priorProject }
    stale.state.epoch += 1
    return { config: replacement, operationId: "c".repeat(32) }
}
assert.deepEqual(await applyProjectOpenTransaction(stale.options), { state: "stale" })
assert.deepEqual(stale.events, ["open", "normalize", "discard"])
assert.notStrictEqual(stale.state.config, replacement)

const invalid = transaction({
    normalize: () => { throw new Error("invalid candidate") },
})
await assert.rejects(applyProjectOpenTransaction(invalid.options), /invalid candidate/)
assert.deepEqual(invalid.events, ["open", "discard"])

const cancelledAfterOpen = transaction({ cancelled: () => true })
assert.deepEqual(await applyProjectOpenTransaction(cancelledAfterOpen.options), { state: "cancelled", result: { cancelled: true } })
assert.deepEqual(cancelledAfterOpen.events, ["open", "normalize", "discard"])

let postAcceptDiscards = 0
const postAccept = transaction({
    commit: () => { throw new Error("renderer commit failed") },
    discard: async () => { postAcceptDiscards += 1 },
})
await assert.rejects(applyProjectOpenTransaction(postAccept.options), /renderer commit failed/)
assert.equal(postAcceptDiscards, 0, "accepted candidate authority must never be discarded")

console.log("Verified: one mutation lane serializes writers; two-phase Project open discards stale/invalid candidates and commits synchronously only after acceptance.")
