import assert from "node:assert/strict"
import { exportCycleClock } from "../src/exportClock.ts"

const request = {
    config: { settings: { playKind: "repeat", repeatCount: 3 } },
    durationMs: 2_600,
    cycleDurationMs: 1_000,
    finalCycleDurationMs: 600,
}

assert.deepEqual(exportCycleClock(request, 0), { timeMs: 0, durationMs: 1_000, terminal: false })
assert.deepEqual(exportCycleClock(request, 1_250), { timeMs: 250, durationMs: 1_000, terminal: false })
assert.deepEqual(exportCycleClock(request, 1_999), { timeMs: 999, durationMs: 1_000, terminal: false })
assert.deepEqual(exportCycleClock(request, 2_000), { timeMs: 0, durationMs: 600, terminal: true })
assert.deepEqual(exportCycleClock(request, 2_599), { timeMs: 599, durationMs: 600, terminal: true })

const once = { ...request, config: { settings: { playKind: "once", repeatCount: 1 } }, durationMs: 600, cycleDurationMs: 600, finalCycleDurationMs: 600 }
assert.deepEqual(exportCycleClock(once, 600), { timeMs: 600, durationMs: 600, terminal: true })

const singleRepeat = { ...request, config: { settings: { playKind: "repeat", repeatCount: 1 } }, durationMs: 600 }
assert.deepEqual(exportCycleClock(singleRepeat, 0), { timeMs: 0, durationMs: 600, terminal: true })

const doubleRepeat = { ...request, config: { settings: { playKind: "repeat", repeatCount: 2 } }, durationMs: 1_600 }
assert.deepEqual(exportCycleClock(doubleRepeat, 999), { timeMs: 999, durationMs: 1_000, terminal: false })
assert.deepEqual(exportCycleClock(doubleRepeat, 1_000), { timeMs: 0, durationMs: 600, terminal: true })

const twentyFiveRepeats = { ...request, config: { settings: { playKind: "repeat", repeatCount: 25 } }, durationMs: 24_600 }
assert.deepEqual(exportCycleClock(twentyFiveRepeats, 24_000), { timeMs: 0, durationMs: 600, terminal: true })

const clampedRepeats = { ...request, config: { settings: { playKind: "repeat", repeatCount: 1_001 } }, durationMs: 999_600 }
assert.deepEqual(exportCycleClock(clampedRepeats, 999_000), { timeMs: 0, durationMs: 600, terminal: true })

const vitrineRepeat = { ...request, config: { styleId: "vitrine", sceneVersion: 2, settings: { playKind: "repeat", repeatCount: 3 } } }
assert.deepEqual(exportCycleClock(vitrineRepeat, 0), { timeMs: 0, durationMs: 1_000, terminal: true })
assert.deepEqual(exportCycleClock(vitrineRepeat, 999), { timeMs: 999, durationMs: 1_000, terminal: true })
assert.deepEqual(exportCycleClock(vitrineRepeat, 1_000), { timeMs: 0, durationMs: 1_000, terminal: true })
assert.deepEqual(exportCycleClock(vitrineRepeat, 2_599), { timeMs: 599, durationMs: 1_000, terminal: true })

console.log("Verified: frozen repeat/finale export clocks preserve cycle, terminal pose, and preview parity boundaries.")
