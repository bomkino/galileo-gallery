import assert from "node:assert/strict"
import {
    coerceInterfaceScale,
    createInterfaceScaleModel,
    DEFAULT_INTERFACE_SCALE,
    interfaceScaleRatio,
    INTERFACE_SCALE_VALUES,
    isInterfaceScale,
} from "../src/presentation/interfaceScale.ts"
import {
    comparePresentationManifestOrder,
    createPresentationManifest,
    MAX_PRESENTATION_REVISION,
    nextPresentationRevision,
    parsePresentationManifest,
    PRESENTATION_MANIFEST_MAX_BYTES,
    PRESENTATION_MANIFEST_STORAGE_KEY,
    PRESENTATION_SYSTEM_WRITER_ID,
    serializePresentationManifest,
    tryParsePresentationManifest,
} from "../src/presentation/presentationManifest.ts"
import { createBrowserPresentationAdapter } from "../src/presentation/browserPresentationAdapter.ts"

// Promise: the semantic control exposes every 5% stop from 75% through 200%, and no others.
assert.equal(INTERFACE_SCALE_VALUES.length, 26)
assert.deepEqual(INTERFACE_SCALE_VALUES, Array.from({ length: 26 }, (_, index) => 75 + index * 5))
for (const value of INTERFACE_SCALE_VALUES) {
    assert.equal(isInterfaceScale(value), true)
    assert.equal(interfaceScaleRatio(value), value / 100)
}
for (const value of [74, 76, 99, 201, NaN, Infinity, "100", null]) assert.equal(isInterfaceScale(value), false)
assert.equal(coerceInterfaceScale(-1), 75)
assert.equal(coerceInterfaceScale(103), 105)
assert.equal(coerceInterfaceScale(102), 100)
assert.equal(coerceInterfaceScale(1_000), 200)
assert.equal(coerceInterfaceScale(NaN), DEFAULT_INTERFACE_SCALE)

// Promise: presentation identity is a bounded, exact, local-only record.
const manifestText = serializePresentationManifest(createPresentationManifest(135))
assert(manifestText.length < PRESENTATION_MANIFEST_MAX_BYTES)
assert.deepEqual(parsePresentationManifest(manifestText), {
    format: "galileo-gallery-local-presentation",
    product: "galileo-gallery",
    schemaVersion: 1,
    revision: 0,
    writerId: PRESENTATION_SYSTEM_WRITER_ID,
    interfaceScale: 135,
})
for (const mutation of [
    { ...JSON.parse(manifestText), interfaceScale: 133 },
    { ...JSON.parse(manifestText), schemaVersion: 2 },
    { ...JSON.parse(manifestText), revision: -1 },
    { ...JSON.parse(manifestText), revision: MAX_PRESENTATION_REVISION + 1 },
    { ...JSON.parse(manifestText), writerId: "not-bounded" },
    { ...JSON.parse(manifestText), product: "another-product" },
    { ...JSON.parse(manifestText), projectPath: "/private/project.galileo" },
]) {
    assert.throws(() => parsePresentationManifest(JSON.stringify(mutation)), /manifest/i)
}
assert.throws(() => parsePresentationManifest("{"), /JSON/)
assert.throws(() => parsePresentationManifest(`"${"x".repeat(PRESENTATION_MANIFEST_MAX_BYTES)}"`), /byte limit/)
assert.equal(tryParsePresentationManifest("hostile"), null)
assert.equal(nextPresentationRevision(41), 42)
assert.throws(() => nextPresentationRevision(MAX_PRESENTATION_REVISION), /exhausted/)
assert.throws(() => createPresentationManifest(100, 1.5), /revision/)
assert.throws(() => createPresentationManifest(100, 1, "A".repeat(16)), /writer identity/)
assert.equal(comparePresentationManifestOrder(
    createPresentationManifest(100, 1, "aaaaaaaaaaaaaaaa"),
    createPresentationManifest(100, 1, "bbbbbbbbbbbbbbbb"),
), -1)

class FakeStorage {
    values = new Map()
    failReads = false
    failWrites = false
    getItem(key) {
        if (this.failReads) throw new Error("blocked")
        return this.values.get(key) ?? null
    }
    setItem(key, value) {
        if (this.failWrites) throw new Error("full")
        this.values.set(key, value)
    }
}

class FakeStorageEvents {
    listeners = new Set()
    addEventListener(type, listener) {
        assert.equal(type, "storage")
        this.listeners.add(listener)
    }
    removeEventListener(type, listener) {
        assert.equal(type, "storage")
        this.listeners.delete(listener)
    }
    emit(event) {
        for (const listener of [...this.listeners]) listener(event)
    }
}

// Promise: local persistence and cross-window updates are safe, observable, and non-reentrant on no-op.
const storage = new FakeStorage()
const events = new FakeStorageEvents()
storage.setItem(PRESENTATION_MANIFEST_STORAGE_KEY, serializePresentationManifest(createPresentationManifest(120)))
const adapter = createBrowserPresentationAdapter({ storage, events, writerId: "1111111111111111" })
assert.equal(adapter.getSnapshot().interfaceScale, 120)
const observed = []
adapter.subscribe(() => { throw new Error("observer defect") })
const unsubscribe = adapter.subscribe((snapshot) => observed.push(snapshot.interfaceScale))
adapter.setInterfaceScale(145)
adapter.setInterfaceScale(145)
assert.deepEqual(observed, [145])
assert.equal(parsePresentationManifest(storage.getItem(PRESENTATION_MANIFEST_STORAGE_KEY)).interfaceScale, 145)
events.emit({ key: PRESENTATION_MANIFEST_STORAGE_KEY, newValue: serializePresentationManifest(createPresentationManifest(175)) })
assert.equal(adapter.getSnapshot().interfaceScale, 145)
assert.deepEqual(observed, [145])
events.emit({ key: PRESENTATION_MANIFEST_STORAGE_KEY, newValue: serializePresentationManifest(createPresentationManifest(175, 2)) })
events.emit({ key: PRESENTATION_MANIFEST_STORAGE_KEY, newValue: "corrupt" })
assert.equal(adapter.getSnapshot().interfaceScale, 175)
assert.deepEqual(observed, [145, 175])
adapter.resetInterfaceScale()
assert.equal(adapter.getSnapshot().interfaceScale, DEFAULT_INTERFACE_SCALE)
assert.deepEqual(observed, [145, 175, 100])
const resetManifest = parsePresentationManifest(storage.getItem(PRESENTATION_MANIFEST_STORAGE_KEY))
assert.equal(resetManifest.interfaceScale, DEFAULT_INTERFACE_SCALE)
assert.equal(resetManifest.revision, 3)
assert.equal(resetManifest.writerId, "1111111111111111")
adapter.resetInterfaceScale()
assert.deepEqual(observed, [145, 175, 100])
events.emit({ key: PRESENTATION_MANIFEST_STORAGE_KEY, newValue: null })
assert.equal(adapter.getSnapshot().interfaceScale, 100)
unsubscribe()
unsubscribe()
adapter.setInterfaceScale(110)
assert.deepEqual(observed, [145, 175, 100])
storage.failWrites = true
adapter.setInterfaceScale(115)
assert.equal(adapter.getSnapshot().interfaceScale, 115)
adapter.dispose()
adapter.dispose()
events.emit({ key: PRESENTATION_MANIFEST_STORAGE_KEY, newValue: manifestText })
assert.equal(adapter.getSnapshot().interfaceScale, 115)
assert.throws(() => adapter.setInterfaceScale(125), /disposed/)
assert.throws(() => adapter.resetInterfaceScale(), /disposed/)

const blockedStorage = new FakeStorage()
blockedStorage.failReads = true
const blocked = createBrowserPresentationAdapter({ storage: blockedStorage, events: null, writerId: "2222222222222222" })
assert.equal(blocked.getSnapshot().interfaceScale, DEFAULT_INTERFACE_SCALE)
blocked.dispose()

const model = createInterfaceScaleModel(180)
assert.equal(model.resetInterfaceScale().interfaceScale, DEFAULT_INTERFACE_SCALE)
assert.throws(() => model.setInterfaceScale(101), /75–200/)
assert.throws(() => createInterfaceScaleModel(101), /Initial Interface Scale/)
const exhaustedStorage = new FakeStorage()
exhaustedStorage.setItem(PRESENTATION_MANIFEST_STORAGE_KEY, serializePresentationManifest(createPresentationManifest(100, MAX_PRESENTATION_REVISION)))
const exhausted = createBrowserPresentationAdapter({ storage: exhaustedStorage, events: null, writerId: "3333333333333333" })
assert.throws(() => exhausted.setInterfaceScale(105), /exhausted/)
assert.equal(exhausted.getSnapshot().interfaceScale, 100)
exhausted.dispose()

// Promise: simultaneous revision-1 writes converge on the bounded writer-id winner in either
// delivery order, and late lower-order delivery repairs the shared storage value.
function verifyConcurrentDelivery(order) {
    const pairedStorage = new FakeStorage()
    const pairedEvents = new FakeStorageEvents()
    const lower = createBrowserPresentationAdapter({ storage: pairedStorage, events: pairedEvents, writerId: "aaaaaaaaaaaaaaaa" })
    const higher = createBrowserPresentationAdapter({ storage: pairedStorage, events: pairedEvents, writerId: "bbbbbbbbbbbbbbbb" })
    lower.setInterfaceScale(125)
    const lowerWrite = pairedStorage.getItem(PRESENTATION_MANIFEST_STORAGE_KEY)
    higher.setInterfaceScale(150)
    const higherWrite = pairedStorage.getItem(PRESENTATION_MANIFEST_STORAGE_KEY)
    const writes = { lower: lowerWrite, higher: higherWrite }
    for (const key of order) pairedEvents.emit({ key: PRESENTATION_MANIFEST_STORAGE_KEY, newValue: writes[key] })
    assert.equal(lower.getSnapshot().interfaceScale, 150)
    assert.equal(higher.getSnapshot().interfaceScale, 150)
    assert.equal(pairedStorage.getItem(PRESENTATION_MANIFEST_STORAGE_KEY), higherWrite)
    lower.dispose()
    higher.dispose()
}
verifyConcurrentDelivery(["lower", "higher"])
verifyConcurrentDelivery(["higher", "lower"])

// Promise: a higher-order local winner survives a failed write, rejects a delivered lower winner,
// repairs storage when it becomes available, and then brings the peer to the same state.
const recoveryStorage = new FakeStorage()
const recoveryEvents = new FakeStorageEvents()
const recoveryHigher = createBrowserPresentationAdapter({ storage: recoveryStorage, events: recoveryEvents, writerId: "dddddddddddddddd" })
const recoveryLower = createBrowserPresentationAdapter({ storage: recoveryStorage, events: recoveryEvents, writerId: "cccccccccccccccc" })
recoveryStorage.failWrites = true
recoveryHigher.setInterfaceScale(175)
recoveryStorage.failWrites = false
recoveryLower.setInterfaceScale(130)
const lowerStored = recoveryStorage.getItem(PRESENTATION_MANIFEST_STORAGE_KEY)
recoveryEvents.emit({ key: PRESENTATION_MANIFEST_STORAGE_KEY, newValue: lowerStored })
assert.equal(recoveryHigher.getSnapshot().interfaceScale, 175)
const repairedStored = recoveryStorage.getItem(PRESENTATION_MANIFEST_STORAGE_KEY)
assert.equal(parsePresentationManifest(repairedStored).writerId, "dddddddddddddddd")
recoveryEvents.emit({ key: PRESENTATION_MANIFEST_STORAGE_KEY, newValue: repairedStored })
assert.equal(recoveryLower.getSnapshot().interfaceScale, 175)
recoveryEvents.emit({ key: null, newValue: null })
const clearedWinner = recoveryStorage.getItem(PRESENTATION_MANIFEST_STORAGE_KEY)
recoveryEvents.emit({ key: PRESENTATION_MANIFEST_STORAGE_KEY, newValue: clearedWinner })
const repairedClearWinner = recoveryStorage.getItem(PRESENTATION_MANIFEST_STORAGE_KEY)
recoveryEvents.emit({ key: PRESENTATION_MANIFEST_STORAGE_KEY, newValue: repairedClearWinner })
assert.equal(recoveryHigher.getSnapshot().interfaceScale, DEFAULT_INTERFACE_SCALE)
assert.equal(recoveryLower.getSnapshot().interfaceScale, DEFAULT_INTERFACE_SCALE)
assert.equal(parsePresentationManifest(recoveryStorage.getItem(PRESENTATION_MANIFEST_STORAGE_KEY)).writerId, "dddddddddddddddd")
recoveryHigher.dispose()
recoveryLower.dispose()

// Promise: synchronous observer reentry advances from the visible mutation, so model,
// persistence, and a peer converge on the same final winner in both directions.
function verifyReentrantMutation({ initial, outer, nested }) {
    const reentrantStorage = new FakeStorage()
    const reentrantEvents = new FakeStorageEvents()
    reentrantStorage.setItem(
        PRESENTATION_MANIFEST_STORAGE_KEY,
        serializePresentationManifest(createPresentationManifest(initial)),
    )
    const subject = createBrowserPresentationAdapter({
        storage: reentrantStorage,
        events: reentrantEvents,
        writerId: "eeeeeeeeeeeeeeee",
    })
    const peer = createBrowserPresentationAdapter({
        storage: reentrantStorage,
        events: reentrantEvents,
        writerId: "ffffffffffffffff",
    })
    let reentered = false
    subject.subscribe(() => {
        if (reentered) return
        reentered = true
        nested(subject)
    })
    const returned = outer(subject)
    const persisted = reentrantStorage.getItem(PRESENTATION_MANIFEST_STORAGE_KEY)
    const winner = parsePresentationManifest(persisted)
    assert.equal(subject.getSnapshot().interfaceScale, winner.interfaceScale)
    assert.equal(returned.interfaceScale, winner.interfaceScale)
    reentrantEvents.emit({ key: PRESENTATION_MANIFEST_STORAGE_KEY, newValue: persisted })
    assert.equal(peer.getSnapshot().interfaceScale, winner.interfaceScale)
    subject.dispose()
    peer.dispose()
    return winner
}

const setThenReset = verifyReentrantMutation({
    initial: 100,
    outer: (adapter) => adapter.setInterfaceScale(150),
    nested: (adapter) => adapter.resetInterfaceScale(),
})
assert.equal(setThenReset.interfaceScale, DEFAULT_INTERFACE_SCALE)
assert.equal(setThenReset.revision, 2)

const resetThenSet = verifyReentrantMutation({
    initial: 175,
    outer: (adapter) => adapter.resetInterfaceScale(),
    nested: (adapter) => adapter.setInterfaceScale(155),
})
assert.equal(resetThenSet.interfaceScale, 155)
assert.equal(resetThenSet.revision, 2)

console.log("Verified: G08 Interface Scale domain, bounded total-order local persistence, safe subscriptions, and convergent paired-adapter updates.")
