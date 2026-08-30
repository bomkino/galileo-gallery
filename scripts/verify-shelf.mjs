import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { DEFAULT_SETTINGS } from "../src/defaults.ts"
import {
    compileShelfTimeline,
    evaluateShelf,
    evaluateShelfTimeline,
    inspectShelfSeams,
    SHELF_EVALUATOR_AUTHORITY_SHA256,
    SHELF_MAX_ITEMS,
    selectShelfLiveVideoIds,
    shelfScene,
    shelfSourceTimeMs,
    shelfStoryTimeMs,
    validateCompiledShelfTimeline,
} from "../src/scenes/shelf.ts"
import {
    effectiveShelfRatio,
    exclusiveShelfSpotlight,
    reconcileShelfConfig,
    shelfFocusIdsForConfig,
    shelfMediaFailureState,
    shelfParametersForConfig,
    validateShelfRuntimeConfig,
} from "../src/shelfConfig.ts"

const close = (actual, expected, tolerance = 0.00001, message = `${actual} != ${expected}`) => {
    assert(Math.abs(actual - expected) <= tolerance, message)
}

const ratios = [0.2, 0.5, 0.8, 1, 1.5, 2, 4]
const items = (count, prefix = "edition") => Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index + 1).padStart(3, "0")}`,
    ratio: ratios[index % ratios.length],
    caption: `Edition ${index + 1}`,
}))

const timeline = (count, direction = "forward", patch = {}) => compileShelfTimeline({
    mode: "automatic",
    direction,
    mediaCount: count,
    paceMs: 1_650,
    fixedDurationMs: 0,
    segments: [],
    fps: 30,
    ...patch,
})

const parameters = shelfScene.defaults()
const evaluate = (source, timeMs, patch = {}, input = {}) => {
    const compiled = input.timeline ?? timeline(source.length)
    return evaluateShelf({
        items: source,
        parameters: { ...parameters, ...patch },
        timeline: compiled,
        timeMs,
        stageWidth: 960,
        stageHeight: 540,
        ...input,
    })
}

assert.deepEqual(parameters, { cardHeight: 0.42, gap: 34, leanAmount: 2.5, spotlightLift: 0.08, fit: "contain" })
assert.equal(SHELF_EVALUATOR_AUTHORITY_SHA256, "8520586750ccf2b51b60625dbb37d8bc54603b1c4c1db17b7aefe9661062fb60")

const pinnedVectorBytes = readFileSync(new URL("./shelf-test-vectors.json", import.meta.url))
assert.equal(createHash("sha256").update(pinnedVectorBytes).digest("hex"), "8222aa54106fa5b49e9a53c8f3f207a459659ad4450a92c6646dd4e86a0d2455")
const pinnedVectors = JSON.parse(pinnedVectorBytes.toString("utf8"))
assert.equal(pinnedVectors.sceneId, "the-shelf")
assert.equal(pinnedVectors.evaluatorVersion, 1)
assert.equal(pinnedVectors.vectors.length, 8)

const vectorRatios = [16 / 9, 4 / 5, 1, 3 / 2, 9 / 16, 2.1, 5 / 4]
const makeVectorItems = (count, kind) => Array.from({ length: count }, (_, index) => ({
    id: `${kind}-${String(index + 1).padStart(3, "0")}`,
    caption: index % 2 ? `Collected print ${index + 1}` : `Archive edition ${index + 1}`,
    ratio: kind === "mixed" ? vectorRatios[index % vectorRatios.length] : index % 3 === 1 ? 4 / 5 : index % 3 === 2 ? 1 : 16 / 9,
    failed: kind === "media-edge" && index === 6,
}))
const vectorFixtures = {
    one: makeVectorItems(1, "one"),
    two: makeVectorItems(2, "two"),
    ordinary8: makeVectorItems(8, "ordinary"),
    mixed21: makeVectorItems(21, "mixed"),
    many127: makeVectorItems(127, "many"),
    mediaEdge: makeVectorItems(9, "media-edge"),
}
const vectorCanvases = {
    "16:9": { width: 960, height: 540 },
    "9:16": { width: 405, height: 720 },
    "1:1": { width: 640, height: 640 },
    "4:5": { width: 576, height: 720 },
}
const fixedNumber = (value, places) => Number(value.toFixed(places))
const resolveVectorId = (source, requested, fallbackIndex) => source.some((item) => item.id === requested)
    ? requested
    : source[Math.min(Math.max(0, fallbackIndex), Math.max(0, source.length - 1))]?.id ?? null
const summarizeVectorFrame = (frame, vector, source, compiled, canvas) => ({
    sceneId: frame.sceneId,
    evaluatorVersion: pinnedVectors.evaluatorVersion,
    axis: "horizontal-only",
    normalizedTime: fixedNumber(vector.input.normalizedTime, 6),
    runKind: vector.input.runKind,
    phrase: frame.phrase,
    direction: compiled.direction,
    phase: fixedNumber(frame.phase, 6),
    count: frame.count,
    canvas,
    baselineY: fixedNumber(frame.baselineY, 3),
    trackLength: fixedNumber(frame.trackLength, 3),
    naturalTrackLength: fixedNumber(frame.naturalTrackLength, 3),
    effectiveGap: fixedNumber(frame.effectiveGap, 3),
    currentFocusId: frame.currentFocusId,
    focusProgress: fixedNumber(frame.focusProgress, 6),
    spotlightId: resolveVectorId(source, vector.input.spotlightId, Math.min(2, source.length - 1)),
    finaleId: resolveVectorId(source, vector.input.finaleId, source.length - 1),
    renderNodeCount: frame.slots.length,
    maxObservedNodes: frame.maxObservedNodes,
    duplicateProjectMedia: frame.duplicateProjectMedia,
    compiledDurationSeconds: fixedNumber(compiled.durationMs / 1_000, 6),
    visibleSlots: frame.slots.map((slot) => ({
        id: slot.id,
        copyIndex: slot.copyIndex,
        x: fixedNumber(slot.x, 3),
        bottomY: fixedNumber(slot.bottomY, 3),
        width: fixedNumber(slot.width, 3),
        height: fixedNumber(slot.height, 3),
        baseLeanDeg: fixedNumber(slot.baseLeanDeg, 6),
        leanDeg: fixedNumber(slot.leanDeg, 6),
        lift: fixedNumber(slot.lift, 3),
        focusProgress: fixedNumber(slot.focusProgress, 6),
    })),
    artworkContract: {
        opacity: frame.render.artworkOpacity,
        filter: frame.render.artworkFilter,
        blend: frame.render.artworkBlend,
    },
})

for (const vector of pinnedVectors.vectors) {
    const source = vectorFixtures[vector.input.fixture]
    const canvas = vectorCanvases[vector.input.canvas]
    assert(source, `Unknown pinned Shelf fixture: ${vector.input.fixture}`)
    assert(canvas, `Unknown pinned Shelf canvas: ${vector.input.canvas}`)
    const compiled = timeline(source.length)
    const frame = evaluateShelf({
        items: source,
        parameters,
        timeline: compiled,
        timeMs: vector.input.normalizedTime * compiled.durationMs,
        stageWidth: canvas.width,
        stageHeight: canvas.height,
        terminal: vector.input.runKind === "finite",
        reducedMotion: vector.input.reducedMotion === true,
        spotlightId: vector.input.spotlightId,
        finaleId: vector.input.finaleId,
    })
    assert.deepEqual(summarizeVectorFrame(frame, vector, source, compiled, canvas), vector.expect, `Pinned Shelf vector drift: ${vector.id}`)
}

for (const patch of [
    { cardHeight: 0.27 }, { cardHeight: 0.59 }, { gap: 7 }, { gap: 121 }, { leanAmount: -1 }, { leanAmount: 6.01 },
    { spotlightLift: 0.02 }, { spotlightLift: 0.15 }, { fit: "stretch" },
]) assert.throws(() => shelfScene.parameters({ ...parameters, ...patch }), /Shelf/)

const automatic = timeline(8)
assert.equal(automatic.durationMs, 13_200)
assert.equal(automatic.frameCount, 396)
assert.equal(automatic.cycleCount, 1)
const shortAutomatic = timeline(1)
assert.equal(shortAutomatic.durationMs, 8_000)
const longAutomatic = timeline(127)
assert.equal(longAutomatic.durationMs, 42_000)
const fixed = timeline(8, "forward", { mode: "fixed-duration", fixedDurationMs: 12_345 })
assert.equal(fixed.durationMs, 12_345)
assert.equal(fixed.frameCount, 371)
const minimumFixed = timeline(127, "forward", { mode: "fixed-duration", fixedDurationMs: 1_000 })
const maximumFixed = timeline(1, "forward", { mode: "fixed-duration", fixedDurationMs: 86_400_000 })
assert(minimumFixed.segments[0].paceScale > 20)
assert(maximumFixed.segments[0].paceScale < 0.05)
assert.doesNotThrow(() => validateCompiledShelfTimeline(minimumFixed))
assert.doesNotThrow(() => validateCompiledShelfTimeline(maximumFixed))
assert.doesNotThrow(() => evaluateShelf({ items: items(127), parameters, timeline: minimumFixed, timeMs: 500, stageWidth: 960, stageHeight: 540 }))
assert.doesNotThrow(() => evaluateShelf({ items: items(1), parameters, timeline: maximumFixed, timeMs: 43_200_000, stageWidth: 960, stageHeight: 540 }))
const directed = timeline(8, "forward", {
    mode: "directed",
    segments: [
        { id: "fast-opening", kind: "cycle", cycles: 2, paceScale: 2, durationMs: 0 },
        { id: "authored-hold", kind: "hold", cycles: 0, paceScale: 1, durationMs: 700 },
        { id: "regular-middle", kind: "cycle", cycles: 1, paceScale: 1, durationMs: 0 },
        { id: "fast-finale", kind: "cycle", cycles: 1, paceScale: 2, durationMs: 0 },
    ],
})
assert.equal(directed.durationMs, 33_700)
assert.equal(directed.cycleCount, 4)
const directedHold = evaluateShelfTimeline(directed, 13_500)
assert.equal(directedHold.segmentId, "authored-hold")
assert.equal(directedHold.velocity, 0)
assert.equal(directedHold.holding, true)

for (const invalid of [
    { mode: "automatic", direction: "forward", mediaCount: 128, paceMs: 1_650, fixedDurationMs: 0, segments: [], fps: 30 },
    { mode: "automatic", direction: "vertical", mediaCount: 8, paceMs: 1_650, fixedDurationMs: 0, segments: [], fps: 30 },
    { mode: "automatic", direction: "forward", mediaCount: 8, paceMs: 1_650, fixedDurationMs: 1_000, segments: [], fps: 30 },
    { mode: "fixed-duration", direction: "forward", mediaCount: 8, paceMs: 1_650, fixedDurationMs: 999, segments: [], fps: 30 },
    { mode: "directed", direction: "forward", mediaCount: 8, paceMs: 1_650, fixedDurationMs: 0, segments: [], fps: 30 },
    { mode: "directed", direction: "forward", mediaCount: 8, paceMs: 1_650, fixedDurationMs: 0, segments: [{ id: "bad", kind: "hold", cycles: 1, paceScale: 1, durationMs: 500 }], fps: 30 },
]) assert.throws(() => compileShelfTimeline(invalid), /Shelf|directed|Automatic/)

for (const malformed of [
    { ...automatic, durationMs: Number.NaN },
    { ...automatic, direction: "sideways" },
    { ...automatic, frameCount: 0 },
    { ...automatic, segments: [] },
    { ...automatic, cycleCount: automatic.cycleCount + 1 },
    { ...automatic, segments: automatic.segments.map((segment, index) => index === 0 ? { ...segment, endMs: segment.endMs + 1 } : segment) },
]) {
    assert.throws(() => validateCompiledShelfTimeline(malformed), /Shelf/)
    assert.throws(() => evaluateShelf({ items: [], parameters, timeline: malformed, timeMs: 0, stageWidth: 960, stageHeight: 540 }), /Shelf/)
    assert.throws(() => evaluateShelf({ items: items(1), parameters, timeline: malformed, timeMs: 0, stageWidth: 960, stageHeight: 540 }), /Shelf/)
    assert.throws(() => evaluateShelf({ items: items(2), parameters, timeline: malformed, timeMs: 0, stageWidth: 960, stageHeight: 540, reducedMotion: true }), /Shelf/)
}

for (const count of [0, 1, 2, 4, 8, 21, 127]) {
    const source = items(count, `count-${count}`)
    const compiled = timeline(count)
    for (const [width, height, bound] of [[960, 540, 18], [405, 720, 12]]) {
        const frame = evaluateShelf({ items: source, parameters, timeline: compiled, timeMs: compiled.durationMs * 0.317, stageWidth: width, stageHeight: height })
        assert.equal(frame.count, count)
        assert.equal(frame.sourceStates.length, count)
        assert(frame.slots.length <= bound)
        assert.equal(frame.maxObservedNodes, bound)
        assert.equal(frame.duplicateProjectMedia, false)
        assert.equal(new Set(frame.slots.map((slot) => slot.slotId)).size, frame.slots.length)
        assert.equal(new Set(frame.slots.map((slot) => slot.id)).size, frame.slots.length)
        assert.equal(new Set(frame.slots.filter((slot) => slot.visible).map((slot) => slot.id)).size, frame.slots.filter((slot) => slot.visible).length)
        assert(frame.sourceStates.every((state) => state.opacity === 1 && state.filter === "none" && state.blend === "normal"))
        assert(frame.slots.every((slot) => slot.opacity === 1 && slot.filter === "none" && slot.blend === "normal"))
        if (count === 0) {
            assert.equal(frame.phrase, "empty")
            assert.equal(frame.baselineY, null)
            assert.equal(frame.slots.length, 0)
        } else {
            close(frame.baselineY, height * (width < height ? 0.78 : 0.8))
            for (const slot of frame.slots) {
                close(slot.width / slot.height, source[slot.sourceIndex].ratio, 0.00001)
                close(slot.bottomY, frame.baselineY)
            }
        }
        if (count === 1) {
            assert.equal(frame.phrase, "single-still")
            assert.equal(frame.slots.length, 1)
            assert.equal(frame.slots[0].copyIndex, 0)
            close(frame.slots[0].x, width / 2)
        }
    }
}

const one = items(1, "still")
const oneStates = [
    evaluate(one, 0),
    evaluate(one, 4_317, {}, { terminal: true, reducedMotion: true }),
    evaluateShelf({ items: one, parameters, timeline: timeline(1, "reverse"), timeMs: 7_999, stageWidth: 405, stageHeight: 720, terminal: true }),
]
assert.equal(oneStates[0].stateHash, evaluate(one, 7_999).stateHash)
assert(oneStates.every((frame) => frame.phrase === "single-still" && frame.slots.length === 1))

for (const ratio of ratios) {
    const frame = evaluate([{ id: `ratio-${ratio}`, ratio }], 0)
    const expectedHeight = Math.min(540 * parameters.cardHeight, 960 * 0.58 / ratio)
    close(frame.slots[0].height, expectedHeight)
    close(frame.slots[0].width, expectedHeight * ratio)
    close(frame.slots[0].width / frame.slots[0].height, ratio)
}
const naturalRatioRow = evaluate([
    { id: "portrait", ratio: 0.8 },
    { id: "square", ratio: 1 },
    { id: "landscape", ratio: 1.5 },
    { id: "panorama", ratio: 4 },
], 0)
for (const slot of naturalRatioRow.slots.filter((candidate) => candidate.copyIndex === 0)) {
    const source = [0.8, 1, 1.5, 4][slot.sourceIndex]
    close(slot.height, Math.min(540 * parameters.cardHeight, 960 * 0.58 / source))
    close(slot.width / slot.height, source)
}
assert.notEqual(naturalRatioRow.slots.find((slot) => slot.id === "portrait")?.height, naturalRatioRow.slots.find((slot) => slot.id === "panorama")?.height)

const portraitOnly = evaluateShelf({
    items: [{ id: "portrait-only-1", ratio: 0.2 }, { id: "portrait-only-2", ratio: 0.2 }],
    parameters,
    timeline: timeline(2),
    timeMs: 1_000,
    stageWidth: 64,
    stageHeight: 7_680,
})
assert(portraitOnly.slots.length > 0)
portraitOnly.slots.forEach((slot) => {
    close(slot.height, 64 * 0.82 / 0.2)
    close(slot.width, 64 * 0.82)
})

const causalItems = items(8, "causal").map((item, index) => ({ ...item, ratio: [0.8, 1, 1.2, 1.5, 2][index % 5] }))
const causalTimeline = timeline(causalItems.length)
const base = evaluate(causalItems, causalTimeline.durationMs * 0.24, {}, { timeline: causalTimeline })
const taller = evaluate(causalItems, causalTimeline.durationMs * 0.24, { cardHeight: 0.5 }, { timeline: causalTimeline })
assert.notDeepEqual(taller.slots.map(({ width, height }) => ({ width, height })), base.slots.map(({ width, height }) => ({ width, height })))
assert.equal(taller.phase, base.phase)
assert.equal(taller.baselineY, base.baselineY)
assert.deepEqual(taller.sourceStates.map((state) => state.baseLeanDeg), base.sourceStates.map((state) => state.baseLeanDeg))
const widerGap = evaluate(causalItems, causalTimeline.durationMs * 0.24, { gap: 100 }, { timeline: causalTimeline })
assert.notEqual(widerGap.trackLength, base.trackLength)
assert.deepEqual(widerGap.sourceStates.map(({ ratio, baseLeanDeg }) => ({ ratio, baseLeanDeg })), base.sourceStates.map(({ ratio, baseLeanDeg }) => ({ ratio, baseLeanDeg })))
const strongerLean = evaluate(causalItems, causalTimeline.durationMs * 0.24, { leanAmount: 5 }, { timeline: causalTimeline })
assert.notDeepEqual(strongerLean.sourceStates.map((state) => state.baseLeanDeg), base.sourceStates.map((state) => state.baseLeanDeg))
assert.equal(strongerLean.trackLength, base.trackLength)
assert.equal(strongerLean.baselineY, base.baselineY)
assert.deepEqual(strongerLean.slots.map(({ x, bottomY, width, height }) => ({ x, bottomY, width, height })), base.slots.map(({ x, bottomY, width, height }) => ({ x, bottomY, width, height })))
const cover = evaluate(causalItems, causalTimeline.durationMs * 0.24, { fit: "cover" }, { timeline: causalTimeline })
assert.deepEqual(cover.slots, base.slots)
assert.equal(cover.render.fit, "cover")

const spotlightId = causalItems[3].id
const finaleId = causalItems.at(-1).id
const finiteSpotlight = evaluate(causalItems, causalTimeline.durationMs * 0.6, {}, { timeline: causalTimeline, terminal: true, spotlightId, finaleId })
assert.equal(finiteSpotlight.phrase, "spotlight-hold")
assert.equal(finiteSpotlight.currentFocusId, spotlightId)
assert.equal(finiteSpotlight.focusProgress, 1)
const focused = finiteSpotlight.slots.find((slot) => slot.id === spotlightId)
assert(focused)
assert.equal(focused.leanDeg, 0)
close(focused.lift, 540 * parameters.spotlightLift)
close(focused.bottomY, finiteSpotlight.baselineY - focused.lift)
finiteSpotlight.slots.filter((slot) => slot.id !== spotlightId).forEach((slot) => {
    close(slot.bottomY, finiteSpotlight.baselineY)
    assert.equal(slot.focusProgress, 0)
})
const higherLift = evaluate(causalItems, causalTimeline.durationMs * 0.6, { spotlightLift: 0.12 }, { timeline: causalTimeline, terminal: true, spotlightId, finaleId })
const higherFocused = higherLift.slots.find((slot) => slot.id === spotlightId)
assert(higherFocused)
assert(higherFocused.lift > focused.lift)
assert.equal(higherLift.phase, finiteSpotlight.phase)
assert.equal(higherLift.trackLength, finiteSpotlight.trackLength)
const finiteFinale = evaluate(causalItems, causalTimeline.durationMs * 0.9, {}, { timeline: causalTimeline, terminal: true, spotlightId, finaleId })
assert.equal(finiteFinale.phrase, "finale-hold")
assert.equal(finiteFinale.currentFocusId, finaleId)
const transferEarly = evaluate(causalItems, causalTimeline.durationMs * 0.755, {}, { timeline: causalTimeline, terminal: true, spotlightId, finaleId })
const transferMiddle = evaluate(causalItems, causalTimeline.durationMs * 0.79, {}, { timeline: causalTimeline, terminal: true, spotlightId, finaleId })
const transferLate = evaluate(causalItems, causalTimeline.durationMs * 0.825, {}, { timeline: causalTimeline, terminal: true, spotlightId, finaleId })
assert.equal(transferEarly.currentFocusId, spotlightId)
assert(transferEarly.focusProgress > 0 && transferEarly.focusProgress < 1)
assert.equal(transferMiddle.currentFocusId, finaleId)
assert.equal(transferMiddle.focusProgress, 1)
assert.equal(transferLate.currentFocusId, finaleId)
assert(transferLate.focusProgress > 0 && transferLate.focusProgress < 1)
assert.equal(evaluate(causalItems, causalTimeline.durationMs * 0.02, {}, { timeline: causalTimeline, terminal: true, spotlightId, finaleId }).phrase, "entry")
assert.equal(evaluate(causalItems, causalTimeline.durationMs * 0.98, {}, { timeline: causalTimeline, terminal: true, spotlightId, finaleId }).phrase, "exit")
const finiteEntry = evaluate(causalItems, 0, {}, { timeline: causalTimeline, terminal: true, spotlightId, finaleId })
const finiteWalkingStart = evaluate(causalItems, causalTimeline.durationMs * 0.1, {}, { timeline: causalTimeline, terminal: true, spotlightId, finaleId })
const finiteExit = evaluate(causalItems, causalTimeline.durationMs, {}, { timeline: causalTimeline, terminal: true, spotlightId, finaleId })
assert.equal(finiteEntry.phrase, "entry")
assert.equal(finiteEntry.phase, 0)
assert.equal(finiteEntry.currentFocusId, null)
const entryCard = finiteEntry.slots.find((slot) => slot.sourceIndex === 0 && slot.copyIndex === 0)
const settledEntryCard = finiteWalkingStart.slots.find((slot) => slot.sourceIndex === 0 && slot.copyIndex === 0)
assert(entryCard && settledEntryCard)
close(entryCard.x - settledEntryCard.x, 960 * 0.42)
assert.equal(finiteExit.phrase, "exit")
assert.equal(finiteExit.currentFocusId, finaleId)
assert.equal(finiteExit.focusProgress, 0)
assert(finiteEntry.slots.length <= 18 && finiteExit.slots.length <= 18)

for (const timeMs of [0, causalTimeline.durationMs * 0.4, causalTimeline.durationMs * 0.6, causalTimeline.durationMs]) {
    const disabled = evaluate(causalItems, timeMs, {}, { timeline: causalTimeline, terminal: true })
    assert.equal(disabled.currentFocusId, null)
    assert.equal(disabled.focusProgress, 0)
    assert(disabled.slots.every((slot) => slot.focusProgress === 0 && slot.lift === 0 && slot.leanDeg === slot.baseLeanDeg))
}

const reduced = evaluate(causalItems, causalTimeline.durationMs * 0.31, {}, { timeline: causalTimeline, reducedMotion: true, spotlightId, finaleId })
assert.equal(reduced.phrase, "reduced-motion-settled")
assert.equal(reduced.velocity, 0)
assert.equal(reduced.currentFocusId, spotlightId)
assert.equal(reduced.focusProgress, 1)
assert.equal(reduced.stateHash, evaluate(causalItems, causalTimeline.durationMs * 0.81, {}, { timeline: causalTimeline, reducedMotion: true, spotlightId, finaleId }).stateHash)
const reducedWithoutSpotlight = evaluate(causalItems, causalTimeline.durationMs * 0.31, {}, { timeline: causalTimeline, reducedMotion: true })
assert.equal(reducedWithoutSpotlight.currentFocusId, null)
assert.equal(reducedWithoutSpotlight.focusProgress, 0)
assert(reducedWithoutSpotlight.slots.every((slot) => slot.focusProgress === 0 && slot.lift === 0 && slot.leanDeg === slot.baseLeanDeg))

for (const compiled of [automatic, directed]) {
    const reverse = compileShelfTimeline({
        mode: compiled.mode,
        direction: "reverse",
        mediaCount: 8,
        paceMs: 1_650,
        fixedDurationMs: compiled.mode === "fixed-duration" ? compiled.durationMs : 0,
        segments: compiled.mode === "directed" ? compiled.segments.map(({ id, kind, cycles, paceScale, durationMs }) => ({ id, kind, cycles, paceScale, durationMs })) : [],
        fps: 30,
    })
    for (const timeMs of [0, 1, compiled.durationMs * 0.13, compiled.durationMs * 0.51, compiled.durationMs - 1]) {
        const forwardFrame = evaluateShelf({ items: causalItems, parameters, timeline: compiled, timeMs: compiled.durationMs - timeMs, stageWidth: 960, stageHeight: 540 })
        const reverseFrame = evaluateShelf({ items: causalItems, parameters, timeline: reverse, timeMs, stageWidth: 960, stageHeight: 540 })
        assert.equal(reverseFrame.phase, forwardFrame.phase)
        assert.equal(reverseFrame.segmentId, forwardFrame.segmentId)
        assert.deepEqual(reverseFrame.slots, forwardFrame.slots)
        close(reverseFrame.velocity, -forwardFrame.velocity)
    }
}
const reverseTerminal = timeline(8, "reverse")
for (const timeMs of [0, causalTimeline.durationMs * 0.12, causalTimeline.durationMs * 0.5, causalTimeline.durationMs * 0.91, causalTimeline.durationMs]) {
    const forwardFrame = evaluateShelf({ items: causalItems, parameters, timeline: causalTimeline, timeMs: causalTimeline.durationMs - timeMs, stageWidth: 960, stageHeight: 540, terminal: true, spotlightId, finaleId })
    const reverseFrame = evaluateShelf({ items: causalItems, parameters, timeline: reverseTerminal, timeMs, stageWidth: 960, stageHeight: 540, terminal: true, spotlightId, finaleId })
    assert.deepEqual(reverseFrame.slots, forwardFrame.slots)
    assert.equal(reverseFrame.phrase, forwardFrame.phrase)
    assert.equal(reverseFrame.currentFocusId, forwardFrame.currentFocusId)
}
assert.equal(shelfStoryTimeMs(0, 8_000, "reverse", false), 0)
assert.equal(shelfStoryTimeMs(2_000, 8_000, "reverse", false), 6_000)
assert.equal(shelfStoryTimeMs(0, 8_000, "reverse", true), 8_000)
assert.equal(shelfSourceTimeMs(0, 8_000, "reverse", false), 0)
assert.equal(shelfSourceTimeMs(2_000, 8_000, "reverse", false), 2_000)
assert.equal(shelfSourceTimeMs(8_500, 8_000, "forward", false), 500)
assert.equal(shelfSourceTimeMs(8_500, 8_000, "reverse", true), 8_000)
assert.throws(() => shelfSourceTimeMs(0, 0, "forward"), /Shelf source clock/)
const forwardQuarter = evaluateShelf({ items: causalItems, parameters, timeline: causalTimeline, timeMs: causalTimeline.durationMs * 0.25, stageWidth: 960, stageHeight: 540 })
const reverseQuarter = evaluateShelf({ items: causalItems, parameters, timeline: timeline(causalItems.length, "reverse"), timeMs: causalTimeline.durationMs * 0.25, stageWidth: 960, stageHeight: 540 })
assert.equal(forwardQuarter.phase, 0.25)
assert.equal(reverseQuarter.phase, 0.75)
assert.notDeepEqual(reverseQuarter.slots, forwardQuarter.slots)
assert.equal(shelfSourceTimeMs(causalTimeline.durationMs * 0.25, causalTimeline.durationMs, "forward"), shelfSourceTimeMs(causalTimeline.durationMs * 0.25, causalTimeline.durationMs, "reverse"))

assert.equal(evaluate(causalItems, 0, {}, { timeline: causalTimeline }).stateHash, evaluate(causalItems, causalTimeline.durationMs, {}, { timeline: causalTimeline }).stateHash)
const seamItems = items(127, "seam")
const seams = inspectShelfSeams(seamItems, parameters, 960, 540)
assert.equal(seams.length, 127)
assert(seams.every((seam) => seam.seamOutsideVisibleStage && seam.previousRightAtExit === 0 && seam.nextLeftAtExit >= 960 && seam.nextLeftAtEntry === 960 && seam.previousRightAtEntry <= 0))
assert.deepEqual(inspectShelfSeams(items(1), parameters, 960, 540), [])

const tangentItems = [{ id: "guard-tangent-a", ratio: 1 }, { id: "guard-tangent-b", ratio: 1 }]
const tangentTimeline = timeline(tangentItems.length)
const beforeGuardExit = evaluateShelf({ items: tangentItems, parameters, timeline: tangentTimeline, timeMs: tangentTimeline.durationMs * 0.399999, stageWidth: 600, stageHeight: 100 })
const atGuardExit = evaluateShelf({ items: tangentItems, parameters, timeline: tangentTimeline, timeMs: tangentTimeline.durationMs * 0.4, stageWidth: 600, stageHeight: 100 })
assert(beforeGuardExit.slots.some((slot) => slot.id === "guard-tangent-a" && slot.copyIndex === 0 && !slot.visible))
assert(!atGuardExit.slots.some((slot) => slot.id === "guard-tangent-a" && slot.copyIndex === 0))
for (const frame of [beforeGuardExit, atGuardExit]) assert.equal(new Set(frame.slots.map((slot) => slot.id)).size, frame.slots.length)

const rotatedItems = items(24, "rotated-aabb").map((item) => ({ ...item, ratio: 0.2 }))
const rotatedParameters = { ...parameters, leanAmount: 6 }
const rotatedTimeline = timeline(rotatedItems.length)
const rotatedStage = { stageWidth: 4_000, stageHeight: 7_680 }
const rotatedAtZero = evaluateShelf({ items: rotatedItems, parameters: rotatedParameters, timeline: rotatedTimeline, timeMs: 0, ...rotatedStage })
const straightAtZero = evaluateShelf({ items: rotatedItems, parameters: { ...rotatedParameters, leanAmount: 0 }, timeline: rotatedTimeline, timeMs: 0, ...rotatedStage })
const positiveLean = rotatedAtZero.sourceStates.find((state) => state.baseLeanDeg > 1)
assert(positiveLean)
const rotatedSeam = inspectShelfSeams(rotatedItems, rotatedParameters, rotatedStage.stageWidth, rotatedStage.stageHeight).find((seam) => seam.id === positiveLean.id)
assert(rotatedSeam)
const rowHeight = rotatedStage.stageHeight * rotatedParameters.cardHeight
const physicalWidth = rowHeight * 0.2
close(rotatedSeam.width, physicalWidth)
assert.equal(rotatedSeam.seamOutsideVisibleStage, true)
assert.deepEqual(inspectShelfSeams(rotatedItems, rotatedParameters, rotatedStage.stageWidth, rotatedStage.stageHeight), inspectShelfSeams(rotatedItems, { ...rotatedParameters, leanAmount: 0 }, rotatedStage.stageWidth, rotatedStage.stageHeight))
assert.equal(rotatedAtZero.trackLength, straightAtZero.trackLength)
assert.deepEqual(rotatedAtZero.slots.map(({ x, bottomY, width, height }) => ({ x, bottomY, width, height })), straightAtZero.slots.map(({ x, bottomY, width, height }) => ({ x, bottomY, width, height })))
for (let step = 0; step < 96; step += 1) {
    const frame = evaluateShelf({ items: rotatedItems, parameters: rotatedParameters, timeline: rotatedTimeline, timeMs: rotatedTimeline.durationMs * step / 96, ...rotatedStage })
    assert(frame.slots.length <= 12)
    assert(frame.overflowedObservedSlots >= 0)
    assert.equal(frame.duplicateProjectMedia, false)
}

const oppositeLeanIds = [
    "id-400", "id-401", "id-416", "id-402", "id-436", "id-415", "id-464", "id-438", "id-476", "id-439",
    "id-1202", "id-465", "id-1262", "id-470", "id-1526", "id-471", "id-1534", "id-1201", "id-1546",
]
const oppositeLeanItems = oppositeLeanIds.map((id) => ({ id, ratio: 0.2 }))
const oppositeLeanTimeline = timeline(oppositeLeanItems.length)
const oppositeLeanFrame = evaluateShelf({
    items: oppositeLeanItems,
    parameters: { ...parameters, cardHeight: 0.58, gap: 8, leanAmount: 6 },
    timeline: oppositeLeanTimeline,
    timeMs: oppositeLeanTimeline.durationMs * 488 / 8_192,
    stageWidth: 7_680,
    stageHeight: 64,
})
assert(oppositeLeanFrame.sourceStates.some((state) => state.baseLeanDeg < 0))
assert(oppositeLeanFrame.sourceStates.some((state) => state.baseLeanDeg > 0))
assert.equal(oppositeLeanFrame.overflowedObservedSlots, 0)
assert(oppositeLeanFrame.slots.length <= 18)
const adversarialItems = Array.from({ length: 127 }, (_, index) => ({ id: `id-${index}`, ratio: 0.2 }))
const adversarialTimeline = compileShelfTimeline({ mode: "automatic", direction: "forward", mediaCount: 127, paceMs: 180, fixedDurationMs: 0, segments: [], fps: 30 })
const adversarialFrame = evaluateShelf({
    items: adversarialItems,
    parameters: { ...parameters, cardHeight: 0.28, gap: 8, leanAmount: 6 },
    timeline: adversarialTimeline,
    timeMs: adversarialTimeline.durationMs * 0.1815,
    stageWidth: 1_920,
    stageHeight: 1_080,
})
assert.equal(adversarialFrame.overflowedObservedSlots, 12)
assert.equal(adversarialFrame.slots.length, 18)

const deterministicA = evaluate(causalItems, 3_219, {}, { timeline: causalTimeline })
const deterministicB = evaluate(structuredClone(causalItems), 3_219, {}, { timeline: structuredClone(causalTimeline) })
assert.deepEqual(deterministicB, deterministicA)
const reordered = [...causalItems]
;[reordered[0], reordered[1]] = [reordered[1], reordered[0]]
assert.notEqual(evaluate(reordered, 3_219, {}, { timeline: causalTimeline }).stateHash, deterministicA.stateHash)
const leanById = new Map(deterministicA.sourceStates.map((state) => [state.id, state.baseLeanDeg]))
for (const state of evaluate(reordered, 3_219, {}, { timeline: causalTimeline }).sourceStates) assert.equal(state.baseLeanDeg, leanById.get(state.id))

const failedItems = causalItems.map((item, index) => ({ ...item, failed: index === 3 }))
const failed = evaluate(failedItems, 3_219, {}, { timeline: causalTimeline })
assert.deepEqual(failed.slots, deterministicA.slots)
assert.equal(failed.trackLength, deterministicA.trackLength)
assert.equal(failed.sourceStates[3].failed, true)
assert.equal(failed.sourceStates.filter((state) => state.failed).length, 1)

const worstDensity = evaluateShelf({ items: Array.from({ length: 127 }, (_, index) => ({ id: `narrow-${index}`, ratio: 0.2 })), parameters: { ...parameters, cardHeight: 0.28, gap: 8 }, timeline: timeline(127), timeMs: 11_111, stageWidth: 960, stageHeight: 540 })
assert.equal(worstDensity.slots.length, 18)
assert.equal(worstDensity.overflowedObservedSlots, 10)
assert.equal(worstDensity.duplicateProjectMedia, false)
const mediaKinds = worstDensity.sourceStates.map((state, index) => ({ id: state.id, type: index % 3 === 0 ? "image" : "video" }))
const selectedVideos = selectShelfLiveVideoIds(worstDensity.slots, mediaKinds, 960)
assert(selectedVideos.length <= 2)
assert.equal(new Set(selectedVideos).size, selectedVideos.length)
assert(selectedVideos.every((id) => worstDensity.slots.some((slot) => slot.id === id && slot.visible)))

const runtimeItem = (index, patch = {}) => ({
    id: `runtime-${index}`,
    name: `Runtime ${index}`,
    type: "image",
    url: `reel-media://grant/${String(index).padStart(64, "0")}`,
    ratio: 1,
    aspectMode: "auto",
    ratioW: 16,
    ratioH: 9,
    fit: "contain",
    crop: { x: 0, y: 0, width: 1, height: 1 },
    focal: { x: 0.5, y: 0.5 },
    caption: `Runtime ${index}`,
    spotlight: false,
    muted: false,
    ...patch,
})
const runtimeConfig = (patch = {}) => ({
    schemaVersion: 2,
    styleId: "the-shelf",
    sceneVersion: 2,
    items: [runtimeItem(1), runtimeItem(2)],
    settings: {
        ...DEFAULT_SETTINGS,
        canvasWidth: 960,
        canvasHeight: 540,
        axis: "horizontal",
        direction: "forward",
        playKind: "loop",
        repeatCount: 1,
        slideHeight: 42,
        gap: 34,
        tilt: 2.5,
        centerBump: 8,
        paceMs: 1_650,
        imageFit: "contain",
        spotlightsEnabled: false,
        finaleEnabled: true,
    },
    timelineMode: "automatic",
    timelineFixedDurationMs: 0,
    timelineSegments: [],
    ...patch,
})
assert.deepEqual(validateShelfRuntimeConfig(runtimeConfig()), { cycleDurationMs: 8_000, finalCycleDurationMs: 8_000, durationMs: 8_000 })
assert.deepEqual(shelfParametersForConfig(runtimeConfig()), parameters)
assert.deepEqual(shelfFocusIdsForConfig(runtimeConfig()), { spotlightId: undefined, finaleId: "runtime-2" })
assert.deepEqual(shelfFocusIdsForConfig(runtimeConfig({ settings: { ...runtimeConfig().settings, finaleEnabled: false } })), { spotlightId: undefined, finaleId: undefined })
const marked = reconcileShelfConfig(runtimeConfig({ settings: { ...runtimeConfig().settings, spotlightsEnabled: true } }))
assert.deepEqual(marked.items.filter((item) => item.spotlight).map((item) => item.id), ["runtime-1"])
assert.deepEqual(shelfFocusIdsForConfig(marked), { spotlightId: "runtime-1", finaleId: "runtime-2" })
assert.deepEqual(shelfFocusIdsForConfig({ ...marked, settings: { ...marked.settings, finaleEnabled: false } }), { spotlightId: "runtime-1", finaleId: undefined })
assert.equal(shelfMediaFailureState(null, false, false), false)
assert.equal(shelfMediaFailureState(null, false, true), true)
assert.equal(shelfMediaFailureState("", false, true), true)
assert.equal(shelfMediaFailureState("reel-media://grant/source", false, true), false)
assert.equal(shelfMediaFailureState("reel-media://grant/source", true, false), true)
assert.deepEqual(exclusiveShelfSpotlight(runtimeConfig().items, "runtime-2").filter((item) => item.spotlight).map((item) => item.id), ["runtime-2"])
const repeated = validateShelfRuntimeConfig(runtimeConfig({ settings: { ...runtimeConfig().settings, playKind: "repeat", repeatCount: 3 } }))
assert.equal(repeated.durationMs, 24_000)
const fixedReconciled = reconcileShelfConfig(runtimeConfig({ timelineMode: "fixed-duration", timelineFixedDurationMs: 1 }))
assert.equal(fixedReconciled.timelineFixedDurationMs, 1_000)
assert.throws(() => effectiveShelfRatio(runtimeItem(1, { aspectMode: "custom", ratioW: 4, ratioH: 5 }), runtimeConfig().settings), /natural ratio/)
assert.equal(effectiveShelfRatio(runtimeItem(1, { ratio: 2, crop: { x: 0, y: 0, width: 0.5, height: 1 } }), runtimeConfig().settings), 2)
for (const config of [
    runtimeConfig({ sceneVersion: 1 }),
    runtimeConfig({ settings: { ...runtimeConfig().settings, axis: "vertical" } }),
    runtimeConfig({ items: Array.from({ length: SHELF_MAX_ITEMS + 1 }, (_, index) => runtimeItem(index + 1)) }),
    runtimeConfig({ items: [runtimeItem(1), runtimeItem(1)] }),
    runtimeConfig({ items: [runtimeItem(1, { ratio: 0.1 })] }),
    runtimeConfig({ items: [runtimeItem(1, { crop: { x: 0.8, y: 0, width: 0.3, height: 1 } })] }),
    runtimeConfig({ items: [runtimeItem(1, { aspectMode: "invalid", crop: { x: 0, y: 0, width: 0.5, height: 1 } })] }),
    runtimeConfig({ items: [runtimeItem(1, { aspectMode: "custom", ratioW: 0, ratioH: 5, crop: { x: 0, y: 0, width: 0.5, height: 1 } })] }),
    runtimeConfig({
        items: [runtimeItem(1, { aspectMode: "global", crop: { x: 0, y: 0, width: 0.5, height: 1 } })],
        settings: { ...runtimeConfig().settings, ratioMode: "fixed", fixedRatio: "custom", customRatioWidth: 0, customRatioHeight: 9 },
    }),
    runtimeConfig({ items: [runtimeItem(1, { spotlight: true }), runtimeItem(2)], settings: { ...runtimeConfig().settings, spotlightsEnabled: false } }),
]) assert.throws(() => validateShelfRuntimeConfig(config), /Shelf/)

for (const invalid of [
    { items: [{ id: "duplicate", ratio: 1 }, { id: "duplicate", ratio: 1 }] },
    { items: [{ id: "bad-ratio", ratio: 0.19 }] },
    { stageWidth: 0 },
    { timeMs: Number.NaN },
]) assert.throws(() => evaluateShelf({ items: causalItems, parameters, timeline: causalTimeline, timeMs: 0, stageWidth: 960, stageHeight: 540, ...invalid }), /Shelf/)

const rendererSource = readFileSync(new URL("../src/scenes/ShelfRenderer.tsx", import.meta.url), "utf8")
const shelfCss = readFileSync(new URL("../src/shelf.css", import.meta.url), "utf8")
assert.match(rendererSource, /sourceRequired=\{exportMode\}/)
assert.match(rendererSource, /video\.removeAttribute\("src"\)/)
assert.match(rendererSource, /video\.load\(\)/)
assert.match(rendererSource, /<ShelfVideo key=\{sourceKey\}/)
assert.match(rendererSource, /<canvas[\s\S]+className="shelf-media shelf-video-surface"/)
assert.match(rendererSource, /className="shelf-video-decoder"/)
assert.doesNotMatch(rendererSource, /className="shelf-media"[\s\S]{0,300}ref=\{ref\}/)
assert.doesNotMatch(rendererSource, /video\.play\(/)
assert.match(rendererSource, /shelfSourceTimeMs\(timeMs, timeline\.durationMs/)
assert.match(rendererSource, /crossOrigin="anonymous"/)
assert.match(rendererSource, /aria-live=\{announceSelection \? "polite" : "off"\}/)
assert.match(shelfCss, /--shelf-baseline-color:\s*rgba\(/)
assert.match(shelfCss, /background:\s*var\(--shelf-baseline-color\)/)
assert.doesNotMatch(shelfCss, /currentColor|box-shadow|backdrop-filter/)
for (const cleanRule of [".shelf-card", ".shelf-artwork-plane", ".shelf-media"]) {
    const start = shelfCss.indexOf(`${cleanRule} {`)
    const end = shelfCss.indexOf("}", start)
    const block = shelfCss.slice(start, end)
    assert(start >= 0 && /filter:\s*none/.test(block) && /mix-blend-mode:\s*normal/.test(block))
}

console.log("Verified source-ready: Shelf v2 replays all eight pinned evaluator vectors with natural-ratio geometry, exact loop/finite/reduced focus semantics, reverse parity, bounded nodes, causal controls, and source-faithful rendering contracts. DOM/Electron pixel and decoder proof remains an integration gate.")
