import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { DEFAULT_SETTINGS } from "../src/defaults.ts"
import {
    compileZoetropeTimeline,
    evaluateZoetrope,
    evaluateZoetropeTimeline,
    minimumZoetropeCycleMs,
    validateCompiledZoetropeTimeline,
    ZOETROPE_DWELL_FRACTION,
    ZOETROPE_MIN_STATION_MS,
    zoetropeScene,
    zoetropeDesignSpace,
} from "../src/scenes/zoetrope.ts"
import { effectiveZoetropeRatio, reconcileZoetropeConfig, validateZoetropeRuntimeConfig, zoetropeParametersFromSettings } from "../src/zoetropeConfig.ts"

const close = (actual, expected, tolerance = 0.00001, message = `${actual} != ${expected}`) => {
    assert(Math.abs(actual - expected) <= tolerance, message)
}

const ratios = [16 / 9, 4 / 5, 1, 3 / 2, 9 / 16, 5 / 4]
const items = (count, prefix = "card", video = false) => Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index + 1).padStart(3, "0")}`,
    ratio: ratios[index % ratios.length],
    type: video || index % 3 === 1 ? "video" : "image",
}))

const parameters = zoetropeScene.defaults()
assert.deepEqual(zoetropeDesignSpace(1_920, 1_080), { designWidth: 1137.7777777777778, designHeight: 640, projectScale: 1.6875 })
assert.deepEqual(zoetropeDesignSpace(1_080, 1_920), { designWidth: 640, designHeight: 1137.7777777777778, projectScale: 1.6875 })
const zoetropeCss = readFileSync(new URL("../src/zoetrope.css", import.meta.url), "utf8")
const zoetropeRenderer = readFileSync(new URL("../src/scenes/ZoetropeRenderer.tsx", import.meta.url), "utf8")
const cssRule = (selector) => {
    const start = zoetropeCss.indexOf(`${selector} {`)
    const end = zoetropeCss.indexOf("}", start)
    assert(start >= 0 && end > start, `${selector} rule must exist`)
    return zoetropeCss.slice(start, end)
}
const stageRule = cssRule(".zoetrope-stage")
const assemblyRule = cssRule(".zoetrope-assembly")
assert.match(stageRule, /container-type:\s*size;/, "stage establishes the Scene-owned query container")
assert.doesNotMatch(stageRule, /perspective:/, "a query container cannot resolve its own cqmin perspective")
assert.match(assemblyRule, /perspective:\s*187\.5cqmin;/, "descendant perspective resolves against the stage query container")
assert.match(assemblyRule, /perspective-origin:\s*50% 50%;/)
assert.match(zoetropeCss, /backface-visibility:\s*hidden;/, "one-sided source planes remain explicit")
assert.match(zoetropeRenderer, /className=\{exportMode \? "product-export-media"/, "export artwork participates in the product image decode gate")
assert.match(zoetropeRenderer, /data-media-failed=\{exportMode \? "true" : "false"\}/, "missing export artwork exposes a hard failure marker")
assert.match(zoetropeRenderer, /item\.type === "video" \? exportSource \?\? ""/, "export video frames cannot silently fall back to a preview poster")
assert.match(zoetropeRenderer, /role="img" aria-label=\{accessibleLabel\}/, "the moving apparatus has a stable labelled graphic role")
assert.doesNotMatch(zoetropeRenderer, /aria-live|role="status"/, "gate motion must not flood assistive announcements")
assert.match(zoetropeRenderer, /video\.pause\(\)[\s\S]*video\.removeAttribute\("src"\)[\s\S]*video\.load\(\)/, "video source changes and unmounts release decoder state")
assert.doesNotMatch(zoetropeRenderer, /<video[^>]*\ssrc=/, "React and the lifecycle effect must not race as dual video source owners")
assert.throws(() => zoetropeDesignSpace(0, 1_080), /canvas/)
assert.deepEqual(parameters, { cylinderRadius: 0.39, cardSize: 0.31, ringTiltDeg: -4, cadenceCharacter: "ratchet", direction: "forward" })
assert.deepEqual(zoetropeScene.controls.map((control) => control.setting), ["sway", "slideHeight", "tilt", "motionPreset", "direction"])
assert.equal(new Set(zoetropeScene.controls.map((control) => control.setting)).size, zoetropeScene.controls.length, "controls must own disjoint settings")

for (const invalid of [
    { ...parameters, cylinderRadius: 0.23 },
    { ...parameters, cylinderRadius: Number.NaN },
    { ...parameters, cardSize: 0.43 },
    { ...parameters, ringTiltDeg: -13 },
    { ...parameters, cadenceCharacter: "spin" },
    { ...parameters, direction: "sideways" },
]) assert.throws(() => zoetropeScene.parameters(invalid), /Zoetrope/)

const automatic = compileZoetropeTimeline({
    mode: "automatic",
    mediaCount: 6,
    stationMs: 430,
    fixedDurationMs: 0,
    segments: [],
    fps: 24,
})
assert.equal(automatic.durationMs, 2_580)
assert.equal(automatic.frameCount, 62)
assert.equal(automatic.finiteDurationMs, 25_800)
assert.equal(automatic.finiteFrameCount, 620)
assert.equal(automatic.stationCount, 6)
assert.equal(minimumZoetropeCycleMs(1), 2_400)
assert.equal(minimumZoetropeCycleMs(6), 2_580)
assert.equal(minimumZoetropeCycleMs(127), 54_610)
assert.equal(validateCompiledZoetropeTimeline(automatic), automatic)
assert.deepEqual(evaluateZoetropeTimeline(automatic, automatic.durationMs), evaluateZoetropeTimeline(automatic, 0), "Timeline seam closes exactly")

const evaluate = (timeMs, patch = {}, input = {}) => evaluateZoetrope({
    items: items(6),
    parameters: { ...parameters, ...patch },
    timeline: automatic,
    timeMs,
    stageWidth: 960,
    stageHeight: 540,
    ...input,
})

const seam = evaluate(0)
assert.deepEqual(evaluate(automatic.durationMs), seam, "full evaluator seam closes exactly")
assert.equal(seam.gateId, "card-001")
assert.equal(seam.phase, 0)
assert.equal(seam.sourceStates.length, 6)
assert.equal(seam.sourceStates.find((state) => state.id === seam.gateId).depth, 1)
assert(seam.sourceStates.find((state) => state.id === seam.gateId).depth > 0.9, "fixed central gate is on the front face")
assert(seam.sourceStates.some((state) => state.culled), "rear core is culled")
assert.equal(seam.renderSlots.length, 3, "ordinary six renders exactly the three front-facing source planes at the canonical gate")
assert(seam.renderSlots.every((slot) => Math.abs(slot.rotateY) <= 90), "evaluator visibility agrees with CSS backface culling")
assert(seam.sourceStates.every((state) => state.active === (Math.abs(state.angleDeg) <= 90)), "source activity agrees with one-sided plane visibility")
assert(seam.sourceStates.every((state) => state.opacity === 1 && state.filter === "none" && state.blend === "normal"), "artwork treatment remains clean")
assert(seam.renderSlots.every((slot) => slot.opacity === 1 && slot.filter === "none" && slot.blend === "normal"), "rendered artwork remains clean")

const projectionScale = (slot, width, height, designWidth) => {
    const perspectivePx = 1.875 * Math.min(width, height)
    const translateZPx = slot.z / designWidth * width
    return perspectivePx / (perspectivePx - translateZPx)
}
const oneXSpace = zoetropeDesignSpace(960, 540)
const twoXSpace = zoetropeDesignSpace(1_920, 1_080)
const oneXFrame = evaluateZoetrope({ items: items(6, "projection"), parameters, timeline: automatic, timeMs: 0, stageWidth: oneXSpace.designWidth, stageHeight: oneXSpace.designHeight })
const twoXFrame = evaluateZoetrope({ items: items(6, "projection"), parameters, timeline: automatic, timeMs: 0, stageWidth: twoXSpace.designWidth, stageHeight: twoXSpace.designHeight })
assert.deepEqual(twoXFrame.renderSlots, oneXFrame.renderSlots, "same-aspect 1x and 2x evaluate in one design space")
const projectedSlot = oneXFrame.renderSlots.find((slot) => slot.z < 0)
assert(projectedSlot, "projection regression needs a rear visible slot")
close(
    projectionScale(projectedSlot, 960, 540, oneXSpace.designWidth),
    projectionScale(projectedSlot, 1_920, 1_080, twoXSpace.designWidth),
    1e-12,
    "same-aspect 1x and 2x preserve perspective projection",
)

const stationMs = automatic.durationMs / 6
const beforeDwell = evaluate(stationMs * 0.5)
const atDwell = evaluate(stationMs * (1 - ZOETROPE_DWELL_FRACTION))
const insideDwell = evaluate(stationMs * 0.84)
const stationEnd = evaluate(stationMs)
assert(beforeDwell.velocity > 0)
assert(beforeDwell.station < 1)
assert.equal(atDwell.station, 1)
assert.equal(atDwell.velocity, 0)
assert.equal(insideDwell.station, 1)
assert.equal(insideDwell.velocity, 0)
assert.equal(insideDwell.gateId, "card-002")
assert.equal(stationEnd.station, 1)
assert(stationEnd.velocity <= 0.00000001, "station boundary begins at exact zero velocity")

const ratchetQuarter = evaluate(stationMs * 0.2)
const flywheelQuarter = evaluate(stationMs * 0.2, { cadenceCharacter: "flywheel" })
assert.notEqual(ratchetQuarter.station, flywheelQuarter.station, "cadence changes the within-station curve")
assert.notEqual(flywheelQuarter.stateHash, ratchetQuarter.stateHash, "cadence changes evaluator identity while moving")
const flywheelLate = evaluate(stationMs * 0.84, { cadenceCharacter: "flywheel" })
assert(flywheelLate.station < 1)
assert(flywheelLate.velocity > 0, "flywheel uses the complete slot and does not inherit ratchet dwell")

const fixed = compileZoetropeTimeline({
    mode: "fixed-duration",
    mediaCount: 6,
    stationMs: 430,
    fixedDurationMs: 12_000,
    segments: [],
    fps: 30,
})
assert.equal(fixed.durationMs, 12_000)
assert.equal(fixed.stationCount, 6)

const casinoSegments = [
    { id: "fast-two", kind: "cycle", cycles: 2, paceScale: 2, durationMs: 0 },
    { id: "regular-one", kind: "cycle", cycles: 1, paceScale: 1, durationMs: 0 },
    { id: "fast-one", kind: "cycle", cycles: 1, paceScale: 2, durationMs: 0 },
    { id: "final-gate-hold", kind: "hold", cycles: 0, paceScale: 1, durationMs: 700 },
]
const directed = compileZoetropeTimeline({
    mode: "directed",
    mediaCount: 6,
    stationMs: 860,
    fixedDurationMs: 0,
    segments: casinoSegments,
    fps: 30,
})
assert.deepEqual(directed.segments.map(({ id, durationMs, startStation, endStation }) => ({ id, durationMs, startStation, endStation })), [
    { id: "fast-two", durationMs: 5_160, startStation: 0, endStation: 12 },
    { id: "regular-one", durationMs: 5_160, startStation: 12, endStation: 18 },
    { id: "fast-one", durationMs: 2_580, startStation: 18, endStation: 24 },
    { id: "final-gate-hold", durationMs: 700, startStation: 24, endStation: 24 },
], "directed fast x2, regular x1, fast x1 rhythm remains explicit")
assert.deepEqual(evaluateZoetropeTimeline(directed, directed.durationMs - 1), { station: 24, velocity: 0, segmentId: "final-gate-hold" })

for (const invalid of [
    { mode: "automatic", mediaCount: 0, stationMs: 430, fixedDurationMs: 0, segments: [], fps: 30 },
    { mode: "automatic", mediaCount: 128, stationMs: 430, fixedDurationMs: 0, segments: [], fps: 30 },
    { mode: "automatic", mediaCount: 6, stationMs: 429, fixedDurationMs: 0, segments: [], fps: 30 },
    { mode: "automatic", mediaCount: 6, stationMs: 430, fixedDurationMs: 1, segments: [], fps: 30 },
    { mode: "fixed-duration", mediaCount: 6, stationMs: 430, fixedDurationMs: 2_579, segments: [], fps: 30 },
    { mode: "directed", mediaCount: 6, stationMs: 430, fixedDurationMs: 0, segments: [{ id: "too-fast", kind: "cycle", cycles: 1, paceScale: 20, durationMs: 0 }], fps: 30 },
    { mode: "directed", mediaCount: 6, stationMs: 430, fixedDurationMs: 0, segments: [{ id: "duplicate", kind: "hold", cycles: 0, paceScale: 1, durationMs: 700 }, { id: "duplicate", kind: "hold", cycles: 0, paceScale: 1, durationMs: 700 }], fps: 30 },
]) assert.throws(() => compileZoetropeTimeline(invalid), /Zoetrope|directed|Automatic/)

const maximumItems = items(127, "readable")
const readableCycleMs = minimumZoetropeCycleMs(maximumItems.length)
const maximumAutomatic = compileZoetropeTimeline({ mode: "automatic", mediaCount: maximumItems.length, stationMs: 430, fixedDurationMs: 0, segments: [], fps: 24 })
const maximumFixed = compileZoetropeTimeline({ mode: "fixed-duration", mediaCount: maximumItems.length, stationMs: 430, fixedDurationMs: readableCycleMs, segments: [], fps: 24 })
const maximumDirected = compileZoetropeTimeline({ mode: "directed", mediaCount: maximumItems.length, stationMs: 430, fixedDurationMs: 0, segments: [{ id: "readable-cycle", kind: "cycle", cycles: 1, paceScale: 1, durationMs: readableCycleMs }], fps: 24 })
for (const [label, timeline] of [["automatic", maximumAutomatic], ["fixed", maximumFixed], ["directed", maximumDirected]]) {
    assert(timeline.durationMs / timeline.stationCount >= ZOETROPE_MIN_STATION_MS, `${label} must preserve the minimum effective station duration`)
    for (const direction of ["forward", "reverse"]) {
        const seen = new Set()
        const dwellByGate = new Map()
        let previousGate = null
        for (let frameIndex = 0; frameIndex < timeline.frameCount; frameIndex += 1) {
            const frame = evaluateZoetrope({ items: maximumItems, parameters: { ...parameters, direction }, timeline, timeMs: frameIndex / 24 * 1_000, stageWidth: 960, stageHeight: 540 })
            const gateIndex = maximumItems.findIndex((item) => item.id === frame.gateId)
            seen.add(gateIndex)
            if (frame.velocity === 0) dwellByGate.set(gateIndex, (dwellByGate.get(gateIndex) ?? 0) + 1)
            if (previousGate !== null) {
                const advance = direction === "forward"
                    ? (gateIndex - previousGate + maximumItems.length) % maximumItems.length
                    : (previousGate - gateIndex + maximumItems.length) % maximumItems.length
                assert(advance <= 1, `${label} ${direction} must not skip an ordered gate at 24fps`)
            }
            previousGate = gateIndex
        }
        assert.equal(seen.size, maximumItems.length, `${label} ${direction} must show every ordered source at the gate`)
        assert(maximumItems.every((_, index) => (dwellByGate.get(index) ?? 0) >= 3), `${label} ${direction} must give every gate at least three exact 24fps dwell samples`)
    }
}
assert.throws(() => compileZoetropeTimeline({ mode: "fixed-duration", mediaCount: 127, stationMs: 430, fixedDurationMs: readableCycleMs - 1, segments: [], fps: 24 }), /fixed duration/)
assert.throws(() => compileZoetropeTimeline({ mode: "directed", mediaCount: 127, stationMs: 430, fixedDurationMs: 0, segments: [{ id: "too-short", kind: "cycle", cycles: 1, paceScale: 1, durationMs: readableCycleMs - 1 }], fps: 24 }), /readable station dwell/)

const oneTimeline = compileZoetropeTimeline({ mode: "automatic", mediaCount: 1, stationMs: 430, fixedDurationMs: 0, segments: [], fps: 24 })
for (const timeMs of [0, 1, 700, 2_399, 2_400, 99_000]) {
    const frame = evaluateZoetrope({ items: items(1), parameters, timeline: oneTimeline, timeMs, stageWidth: 960, stageHeight: 540 })
    assert.equal(frame.phrase, "single-still")
    assert.equal(frame.station, 0)
    assert.equal(frame.velocity, 0)
    assert.equal(frame.renderSlots.length, 1)
}

const twoTimeline = compileZoetropeTimeline({ mode: "automatic", mediaCount: 2, stationMs: 430, fixedDurationMs: 0, segments: [], fps: 24 })
const two = evaluateZoetrope({ items: items(2), parameters, timeline: twoTimeline, timeMs: 0, stageWidth: 960, stageHeight: 540 })
assert.deepEqual(two.sourceStates.map((state) => state.angleDeg), [0, -180], "two cards stay exactly half-turn opposed")
assert.equal(two.renderSlots.length, 1, "rear opposed card is culled, not dimmed")

const reverseAt = evaluate(stationMs * 0.84, { direction: "reverse" })
assert.equal(reverseAt.gateId, "card-006")
assert.equal(reverseAt.station, -1)
assert.equal(reverseAt.velocity, 0)
close(reverseAt.phase, 5 / 6)
const exactTwoReverse = evaluateZoetrope({ items: items(2, "two"), parameters: { ...parameters, direction: "reverse" }, timeline: twoTimeline, timeMs: twoTimeline.durationMs * 0.25, stageWidth: 640, stageHeight: 640 })
assert.equal(exactTwoReverse.phase, 0.559815)
assert.equal(exactTwoReverse.gateId, "two-002")
assert.equal(exactTwoReverse.sourceStates.find((state) => state.id === exactTwoReverse.gateId).depth, 0.930204)
assert.equal(exactTwoReverse.renderSlots.length, 1)

const radiusSmall = evaluate(stationMs * 0.24, { cylinderRadius: 0.28 })
const radiusLarge = evaluate(stationMs * 0.24, { cylinderRadius: 0.48 })
assert.equal(radiusSmall.phase, radiusLarge.phase)
assert.deepEqual(radiusSmall.renderSlots.map((slot) => [slot.id, slot.width, slot.height]), radiusLarge.renderSlots.map((slot) => [slot.id, slot.width, slot.height]))
assert.notDeepEqual(radiusSmall.renderSlots.filter((slot) => slot.role !== "gate").map((slot) => slot.x), radiusLarge.renderSlots.filter((slot) => slot.role !== "gate").map((slot) => slot.x))
const cardsSmall = evaluate(stationMs * 0.24, { cardSize: 0.22 })
const cardsLarge = evaluate(stationMs * 0.24, { cardSize: 0.42 })
assert.deepEqual(cardsSmall.renderSlots.map((slot) => [slot.id, slot.x, slot.y, slot.rotateY]), cardsLarge.renderSlots.map((slot) => [slot.id, slot.x, slot.y, slot.rotateY]))
assert.notDeepEqual(cardsSmall.renderSlots.map((slot) => [slot.width, slot.height]), cardsLarge.renderSlots.map((slot) => [slot.width, slot.height]))
const tiltLow = evaluate(0, { ringTiltDeg: -12 })
const tiltHigh = evaluate(0, { ringTiltDeg: 8 })
assert.notDeepEqual(tiltLow.renderSlots.filter((slot) => slot.role !== "gate").map((slot) => slot.y), tiltHigh.renderSlots.filter((slot) => slot.role !== "gate").map((slot) => slot.y))
assert(tiltLow.renderSlots.every((slot) => slot.rotateZ === -12) && tiltHigh.renderSlots.every((slot) => slot.rotateZ === 8))
close(tiltLow.renderSlots.find((slot) => slot.role === "gate").y, 270)

for (const [width, height, limit] of [[960, 540, 19], [405, 720, 15]]) {
    for (const count of [2, 6, 20, 127]) {
        const timeline = compileZoetropeTimeline({ mode: "automatic", mediaCount: count, stationMs: 430, fixedDurationMs: 0, segments: [], fps: 24 })
        for (const sample of [0, 0.17, 0.41, 0.679, 0.84, 1.31, count - 0.001]) {
            const frame = evaluateZoetrope({ items: items(count, `bounded-${width}-${count}`), parameters, timeline, timeMs: sample / count * timeline.durationMs, stageWidth: width, stageHeight: height })
            assert.equal(frame.sourceStates.length, count)
            assert(frame.renderSlots.length <= limit, `${width}x${height}, N=${count} exceeds renderer bound`)
            assert.equal(new Set(frame.renderSlots.map((slot) => slot.id)).size, frame.renderSlots.length, "no duplicate visible IDs")
            assert(frame.renderSlots.some((slot) => slot.id === frame.gateId), "gate is always rendered")
            assert(frame.renderSlots.every((slot) => Math.abs(slot.rotateY) <= 90), "virtualized slots must agree with CSS backface visibility")
        }
    }
}

const ordered = items(127, "order")
const orderedTimeline = compileZoetropeTimeline({ mode: "automatic", mediaCount: 127, stationMs: 430, fixedDurationMs: 0, segments: [], fps: 24 })
const orderedFrame = evaluateZoetrope({ items: ordered, parameters, timeline: orderedTimeline, timeMs: 41_337, stageWidth: 405, stageHeight: 720 })
const reordered = ordered.slice()
;[reordered[100], reordered[101]] = [reordered[101], reordered[100]]
const reorderedFrame = evaluateZoetrope({ items: reordered, parameters, timeline: orderedTimeline, timeMs: 41_337, stageWidth: 405, stageHeight: 720 })
assert.notEqual(reorderedFrame.stateHash, orderedFrame.stateHash, "offscreen source order remains part of complete evaluator identity")
assert.deepEqual(orderedFrame.sourceStates.map((state) => state.id), ordered.map((item) => item.id))

const videoTimeline = compileZoetropeTimeline({ mode: "automatic", mediaCount: 6, stationMs: 430, fixedDurationMs: 0, segments: [], fps: 24 })
const videoFrame = evaluateZoetrope({ items: items(6, "video", true), parameters, timeline: videoTimeline, timeMs: 0, stageWidth: 960, stageHeight: 540 })
assert.equal(videoFrame.liveVideoDecoderCount, 2)
assert.deepEqual(videoFrame.sourceStates.filter((state) => state.decoderRole).map((state) => state.decoderRole).sort(), ["gate", "prewarm"])
const exportFrame = evaluateZoetrope({ items: items(6, "video", true), parameters, timeline: videoTimeline, timeMs: 0, stageWidth: 960, stageHeight: 540, exportMode: true })
assert.equal(exportFrame.liveVideoDecoderCount, 0)
assert(exportFrame.sourceStates.every((state) => state.decoderRole === null), "frame export owns no live video decoder")

let maxStep = 0
let dwellSamples = 0
let previousStation = null
const angularTimeline = compileZoetropeTimeline({ mode: "automatic", mediaCount: 6, stationMs: 430, fixedDurationMs: 0, segments: [], fps: 24 })
for (let frameIndex = 0; frameIndex < Math.ceil(angularTimeline.durationMs / 1_000 * 24); frameIndex += 1) {
    const timeMs = frameIndex / 24 * 1_000
    const frame = evaluateZoetrope({ items: items(6, "angular"), parameters, timeline: angularTimeline, timeMs, stageWidth: 960, stageHeight: 540 })
    if (previousStation !== null) maxStep = Math.max(maxStep, Math.abs(frame.station - previousStation) * 60)
    if (frame.velocity === 0) dwellSamples += 1
    previousStation = frame.station
}
assert(maxStep < 18, `24fps maximum angular step ${maxStep} must stay below 18 degrees`)
assert(dwellSamples >= 3, "24fps station must contain at least three exact zero-velocity dwell samples")

function maximumAngularStep(timeline, count) {
    let maximum = 0
    let previousPhase = null
    for (let frameIndex = 0; frameIndex < Math.ceil(timeline.durationMs / 1_000 * 24); frameIndex += 1) {
        const frame = evaluateZoetrope({ items: items(count, `alias-${count}`), parameters, timeline, timeMs: frameIndex / 24 * 1_000, stageWidth: 960, stageHeight: 540 })
        if (previousPhase !== null) {
            const phaseDelta = Math.abs(frame.phase - previousPhase)
            maximum = Math.max(maximum, Math.min(phaseDelta, 1 - phaseDelta) * 360)
        }
        previousPhase = frame.phase
    }
    return maximum
}
const minimumFixedTwo = compileZoetropeTimeline({ mode: "fixed-duration", mediaCount: 2, stationMs: 430, fixedDurationMs: 2_400, segments: [], fps: 24 })
const minimumDirectedTwo = compileZoetropeTimeline({ mode: "directed", mediaCount: 2, stationMs: 430, fixedDurationMs: 0, segments: [{ id: "safe-cycle", kind: "cycle", cycles: 1, paceScale: 1, durationMs: 2_400 }], fps: 24 })
assert(maximumAngularStep(minimumFixedTwo, 2) < 18, "minimum fixed cycle preserves the 24fps angular bound")
assert(maximumAngularStep(minimumDirectedTwo, 2) < 18, "minimum directed cycle preserves the 24fps angular bound")
assert.throws(() => compileZoetropeTimeline({ mode: "directed", mediaCount: 2, stationMs: 430, fixedDurationMs: 0, segments: [{ id: "unsafe-cycle", kind: "cycle", cycles: 1, paceScale: 1, durationMs: 2_399 }], fps: 24 }), /readable station dwell/)

function maximumFiniteAngularStep(count, spotlightIndex, finaleIndex) {
    const source = items(count, `finite-alias-${count}`)
    const timeline = compileZoetropeTimeline({ mode: "automatic", mediaCount: count, stationMs: 430, fixedDurationMs: 0, segments: [], fps: 24 })
    let maximum = 0
    let maximumGateAdvance = 0
    let previousPhase = null
    let previousGateIndex = null
    const seen = new Set()
    for (let frameIndex = 0; frameIndex <= timeline.finiteFrameCount; frameIndex += 1) {
        const frame = evaluateZoetrope({
            items: source,
            parameters,
            timeline,
            timeMs: Math.min(timeline.finiteDurationMs, frameIndex / 24 * 1_000),
            stageWidth: 960,
            stageHeight: 540,
            terminal: true,
            spotlightId: source[spotlightIndex].id,
            finaleId: source[finaleIndex].id,
        })
        const gateIndex = source.findIndex((item) => item.id === frame.gateId)
        seen.add(gateIndex)
        if (previousPhase !== null) {
            const phaseDelta = Math.abs(frame.phase - previousPhase)
            maximum = Math.max(maximum, Math.min(phaseDelta, 1 - phaseDelta) * 360)
        }
        if (previousGateIndex !== null) maximumGateAdvance = Math.max(maximumGateAdvance, (gateIndex - previousGateIndex + count) % count)
        previousPhase = frame.phase
        previousGateIndex = gateIndex
    }
    return { maximumAngularStep: maximum, maximumGateAdvance, seenCount: seen.size }
}
for (const [count, spotlightIndex, finaleIndex] of [[2, 0, 1], [6, 2, 5], [127, 63, 126]]) {
    const finiteSampling = maximumFiniteAngularStep(count, spotlightIndex, finaleIndex)
    assert(finiteSampling.maximumAngularStep < 18, `${count}-source finite route preserves the 24fps angular bound`)
    assert(finiteSampling.maximumGateAdvance <= 1, `${count}-source finite route does not skip ordered gates at 24fps`)
    assert.equal(finiteSampling.seenCount, count, `${count}-source finite route presents every source at the gate`)
}

for (const skipped of [0, 1, 319, 871, 1_399, 2_579, 7_777, 16_799]) {
    assert.deepEqual(evaluate(skipped), evaluate(skipped), `skipped sample ${skipped} is deterministic`)
}

const terminalInput = { terminal: true, spotlightId: "card-003", finaleId: "card-006" }
for (const [phase, phrase, gate] of [
    [0, "entry", "card-001"],
    [0.1, "ordered-advance", null],
    [0.3, "ordered-advance", null],
    [0.78, "spotlight-hold", "card-003"],
    [0.89, "finale-hold", "card-006"],
    [0.97, "exit", "card-006"],
]) {
    const frame = evaluate(automatic.finiteDurationMs * phase, {}, terminalInput)
    assert.equal(frame.phrase, phrase)
    if (gate) assert.equal(frame.gateId, gate)
}
assert.equal(evaluate(0, {}, terminalInput).apparatusScale, 0.82)
assert.equal(evaluate(automatic.finiteDurationMs * 0.1, {}, terminalInput).apparatusScale, 1)
assert.equal(evaluate(automatic.finiteDurationMs, {}, terminalInput).apparatusScale, 0.82)
for (const boundary of [0.1, 0.7, 0.79, 0.89, 0.96]) {
    const before = evaluate(automatic.finiteDurationMs * (boundary - 1e-9), {}, terminalInput)
    const at = evaluate(automatic.finiteDurationMs * boundary, {}, terminalInput)
    close(before.station, at.station, 0.00002, `finite station jumps at ${boundary}`)
    close(before.apparatusScale, at.apparatusScale, 0.00002, `finite apparatus jumps at ${boundary}`)
}
const reduced = evaluate(automatic.finiteDurationMs * 0.51, {}, { ...terminalInput, reducedMotion: true })
assert.equal(reduced.phrase, "ordered-advance")
assert.equal(reduced.gateId, "card-005")
assert.equal(reduced.velocity, 0)
const reducedLoop = evaluate(automatic.durationMs * 0.631, {}, { reducedMotion: true })
assert.equal(reducedLoop.gateId, "card-005")
assert.equal(reducedLoop.phase, 0.666667)
assert.equal(reducedLoop.velocity, 0)

assert.throws(() => evaluateZoetrope({ items: [{ id: "same", ratio: 1, type: "image" }, { id: "same", ratio: 1, type: "image" }], parameters, timeline: twoTimeline, timeMs: 0, stageWidth: 960, stageHeight: 540 }), /identity/)
assert.throws(() => evaluateZoetrope({ items: [{ id: "bad-ratio", ratio: 0, type: "image" }], parameters, timeline: oneTimeline, timeMs: 0, stageWidth: 960, stageHeight: 540 }), /ratio/)
const culledBadRatio = items(6)
culledBadRatio[3] = { ...culledBadRatio[3], ratio: Number.NaN }
assert.throws(() => evaluateZoetrope({ items: culledBadRatio, parameters, timeline: automatic, timeMs: 0, stageWidth: 960, stageHeight: 540 }), /ratio/, "rear-culled sources are validated before virtualization")
assert.throws(() => evaluateZoetrope({ items: items(2), parameters, timeline: automatic, timeMs: 0, stageWidth: 960, stageHeight: 540 }), /media count/)
assert.throws(() => evaluateZoetrope({ items: items(1), parameters, timeline: oneTimeline, timeMs: 0, stageWidth: 0, stageHeight: 540 }), /canvas/)
assert.throws(() => evaluateZoetrope({ items: items(1), parameters, timeline: oneTimeline, timeMs: Number.NaN, stageWidth: 960, stageHeight: 540 }), /story time/)
assert.throws(() => evaluateZoetropeTimeline(automatic, Number.NaN), /story time/)
for (const malformed of [
    { ...automatic, durationMs: Number.NaN },
    { ...automatic, finiteDurationMs: 24_000 },
    { ...automatic, stationCount: 7 },
    { ...automatic, segments: [] },
    { ...automatic, segments: [{ ...automatic.segments[0], endStation: 7 }] },
]) {
    assert.throws(() => validateCompiledZoetropeTimeline(malformed), /compiled Timeline/)
    assert.throws(() => evaluateZoetropeTimeline(malformed, 0), /compiled Timeline/)
    assert.throws(() => evaluateZoetrope({ items: items(6), parameters, timeline: malformed, timeMs: 0, stageWidth: 960, stageHeight: 540 }), /compiled Timeline/)
}
const malformedEmptyTimeline = { ...oneTimeline, durationMs: Number.NaN }
assert.throws(() => evaluateZoetrope({ items: [], parameters, timeline: malformedEmptyTimeline, timeMs: 0, stageWidth: 960, stageHeight: 540 }), /compiled Timeline/, "empty state must not bypass Timeline validation")
const maximumFixedDuration = compileZoetropeTimeline({ mode: "fixed-duration", mediaCount: 1, stationMs: 430, fixedDurationMs: 86_400_000, segments: [], fps: 120 })
assert.equal(validateCompiledZoetropeTimeline(maximumFixedDuration), maximumFixedDuration, "compiler output remains validator-closed at the duration boundary")

const runtimeItem = (index, patch = {}) => ({
    id: `runtime-${index}`,
    name: `Runtime ${index}`,
    type: "image",
    url: `memory:runtime-${index}`,
    ratio: 16 / 9,
    aspectMode: "auto",
    ratioW: 16,
    ratioH: 9,
    fit: "contain",
    crop: { x: 0, y: 0, width: 1, height: 1 },
    focal: { x: 0.5, y: 0.5 },
    caption: `Runtime ${index}`,
    spotlight: index === 1,
    muted: false,
    ...patch,
})
const runtimeConfig = (patch = {}) => ({
    schemaVersion: 2,
    styleId: "zoetrope",
    sceneVersion: 2,
    items: [runtimeItem(1), runtimeItem(2)],
    settings: {
        ...DEFAULT_SETTINGS,
        sway: 39,
        slideHeight: 31,
        tilt: -4,
        paceMs: 430,
        motionPreset: "magnetic",
        playKind: "loop",
        repeatCount: 1,
        spotlightsEnabled: true,
        finaleEnabled: true,
    },
    timelineMode: "automatic",
    timelineFixedDurationMs: 0,
    timelineSegments: [],
    ...patch,
})
assert.deepEqual(zoetropeParametersFromSettings(runtimeConfig().settings), parameters)
assert.equal(effectiveZoetropeRatio(runtimeItem(1, { ratio: 2, crop: { x: 0, y: 0, width: 0.5, height: 1 } }), runtimeConfig().settings), 1)
assert.equal(effectiveZoetropeRatio(runtimeItem(1, { aspectMode: "custom", ratioW: 4, ratioH: 5 }), runtimeConfig().settings), 0.8)
assert.deepEqual(validateZoetropeRuntimeConfig(runtimeConfig()), { cycleDurationMs: 2_400, finalCycleDurationMs: 2_400, durationMs: 2_400 })
assert.deepEqual(validateZoetropeRuntimeConfig(runtimeConfig({ settings: { ...runtimeConfig().settings, playKind: "once" } })), { cycleDurationMs: 2_400, finalCycleDurationMs: 24_000, durationMs: 24_000 })
assert.deepEqual(validateZoetropeRuntimeConfig(runtimeConfig({ settings: { ...runtimeConfig().settings, playKind: "repeat", repeatCount: 3 } })), { cycleDurationMs: 2_400, finalCycleDurationMs: 24_000, durationMs: 28_800 })
const repaired = reconcileZoetropeConfig(runtimeConfig({ settings: { ...DEFAULT_SETTINGS, playKind: "loop", repeatCount: 1 } }))
assert.deepEqual([repaired.settings.sway, repaired.settings.slideHeight, repaired.settings.tilt, repaired.settings.paceMs], [48, 42, 8, 430])
assert.equal(repaired.items.some((item) => item.spotlight), false)
const repairedSpotlight = reconcileZoetropeConfig(runtimeConfig({
    items: [runtimeItem(1, { spotlight: false }), runtimeItem(2, { spotlight: false })],
    settings: { ...runtimeConfig().settings, spotlightsEnabled: true },
}))
assert.deepEqual(repairedSpotlight.items.filter((item) => item.spotlight).map((item) => item.id), ["runtime-1"])
const fixedRepaired = reconcileZoetropeConfig(runtimeConfig({ timelineMode: "fixed-duration", timelineFixedDurationMs: 1_000 }))
assert.equal(fixedRepaired.timelineFixedDurationMs, minimumZoetropeCycleMs(2))
const directedRepaired = reconcileZoetropeConfig(runtimeConfig({ timelineMode: "directed", timelineSegments: casinoSegments }))
assert.equal(directedRepaired.settings.paceMs, 2_400)
assert(validateZoetropeRuntimeConfig(directedRepaired).durationMs > 0)
const maximumDirectedRepaired = reconcileZoetropeConfig(runtimeConfig({
    items: Array.from({ length: 127 }, (_, index) => runtimeItem(index + 1)),
    timelineMode: "directed",
    timelineSegments: [{ id: "maximum-pace", kind: "cycle", cycles: 1, paceScale: 20, durationMs: 0 }],
}))
assert.equal(maximumDirectedRepaired.settings.paceMs, 6_000)
assert.equal(maximumDirectedRepaired.timelineSegments[0].durationMs, minimumZoetropeCycleMs(127), "reconciliation materializes a readable duration when the pace control reaches its bound")
assert(validateZoetropeRuntimeConfig(maximumDirectedRepaired).durationMs > 0)
assert.throws(() => validateZoetropeRuntimeConfig(runtimeConfig({ sceneVersion: 1 })), /identity/)
assert.throws(() => validateZoetropeRuntimeConfig(runtimeConfig({ items: Array.from({ length: 128 }, (_, index) => runtimeItem(index)) })), /ordered media/)
assert.throws(() => validateZoetropeRuntimeConfig(runtimeConfig({ items: [runtimeItem(1), runtimeItem(1, { spotlight: false })] })), /ordered media identity/)
assert.throws(() => validateZoetropeRuntimeConfig(runtimeConfig({ timelineMode: "directed", settings: { ...runtimeConfig().settings, playKind: "once" }, timelineSegments: casinoSegments })), /directed segments require Loop/)
assert.throws(() => validateZoetropeRuntimeConfig(runtimeConfig({ settings: { ...runtimeConfig().settings, motionPreset: "dream" } })), /cadence setting/)
assert.throws(() => validateZoetropeRuntimeConfig(runtimeConfig({
    items: [runtimeItem(1, { ratio: 10_000, crop: { x: 0, y: 0, width: 1, height: 0.0001 } })],
})), /effective frame ratio/, "runtime validation must reject an accepted raw ratio whose crop would crash the evaluator")
assert.throws(() => validateZoetropeRuntimeConfig(runtimeConfig({
    items: [runtimeItem(1, { aspectMode: "global" })],
    settings: { ...runtimeConfig().settings, ratioMode: "fixed", fixedRatio: "custom", customRatioWidth: 0, customRatioHeight: 9 },
})), /global custom ratio/, "global custom frame intent must reject before renderer evaluation")

console.log("Verified: Zoetrope v2 deterministic ratchet/flywheel timing, exact dwell and seam, bounded cylinder geometry, reverse and finite stories, clean artwork, and two-decoder source-video policy.")
