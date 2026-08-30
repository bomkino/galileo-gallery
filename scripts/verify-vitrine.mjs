import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { DEFAULT_SETTINGS } from "../src/defaults.ts"
import {
    compileVitrineTimeline,
    evaluateVitrine,
    evaluateVitrineTimeline,
    minimumVitrineFixedDuration,
    VITRINE_MIN_EXCHANGE_MS,
    VITRINE_MIN_HOLD_MS,
    vitrineDesignSpace,
    vitrineScene,
    vitrineStoryTimeMs,
} from "../src/scenes/vitrine.ts"
import { reconcileVitrineConfig, validateVitrineRuntimeConfig } from "../src/vitrineConfig.ts"

const require = createRequire(import.meta.url)
const { assertNoPrivateEvidence, parsePackagedFfmpegVersion } = require("../electron/g11-vitrine-smoke.cjs")
const approvedFfmpeg = require("./ffmpeg-approved-binaries.json")

assert.equal(parsePackagedFfmpegVersion(`ffmpeg version ${approvedFfmpeg.version} approved-build`), approvedFfmpeg.version)
assert.equal(parsePackagedFfmpegVersion("ffmpeg version 7.0.2 approved-build"), "7.0.2")
assert.equal(parsePackagedFfmpegVersion("ffmpeg version malformed"), null)

const close = (actual, expected, tolerance = 0.00001, message = `${actual} != ${expected}`) => {
    assert(Math.abs(actual - expected) <= tolerance, message)
}

const items = [
    { id: "a", ratio: 16 / 9, caption: "Landscape" },
    { id: "b", ratio: 4 / 5, caption: "Portrait" },
    { id: "c", ratio: 1, caption: "Square" },
    { id: "d", ratio: 3 / 2, caption: "Edition" },
]
const parameters = vitrineScene.defaults()
assert.deepEqual(vitrineDesignSpace(96, 64), { designWidth: 960, designHeight: 640, projectScale: 0.1 })
assert.deepEqual(vitrineDesignSpace(7_680, 5_120), { designWidth: 960, designHeight: 640, projectScale: 8 })
assert.deepEqual(vitrineDesignSpace(7_680, 64), { designWidth: 76_800, designHeight: 640, projectScale: 0.1 })
assert.deepEqual(vitrineDesignSpace(64, 7_680), { designWidth: 640, designHeight: 76_800, projectScale: 0.1 })
assert.deepEqual(vitrineDesignSpace(4_800, 6_000), { designWidth: 640, designHeight: 800, projectScale: 7.5 })
assert.throws(() => vitrineDesignSpace(0, 64), /Project canvas/)
assert.throws(() => vitrineDesignSpace(64, Number.NaN), /Project canvas/)
const automatic = compileVitrineTimeline({
    mode: "automatic",
    mediaCount: 2,
    holdMs: 3_740,
    exchangeMs: 1_760,
    fixedDurationMs: 0,
    segments: [],
    fps: 30,
})
assert.equal(automatic.durationMs, 11_000)
assert.equal(automatic.frameCount, 330)
assert.equal(automatic.holdFraction, 0.68)

const evaluate = (timeMs, patch = {}, input = {}) => evaluateVitrine({
    items: items.slice(0, 2),
    parameters: { ...parameters, ...patch },
    timeline: automatic,
    timeMs,
    stageWidth: 960,
    stageHeight: 540,
    ...input,
})

const hold = evaluate(1_000)
assert.equal(hold.phrase, "readable-hold")
assert.equal(hold.currentId, "a")
assert.equal(hold.planes.length, 1)
assert.equal(hold.velocity, 0)
assert.deepEqual(hold.render, { fit: "contain", artworkOpacity: 1, artworkFilter: "none", artworkBlend: "normal" })
assert(hold.planes.every((plane) => plane.opacity === 1 && plane.filter === "none" && plane.blend === "normal"))

assert.equal(evaluate(3_740 - 0.001).phrase, "readable-hold")
const exchangeStart = evaluate(3_740)
assert.equal(exchangeStart.phrase, "exchange")
assert.equal(exchangeStart.transitionProgress, 0)
assert.equal(exchangeStart.planes.length, 2)
const midpoint = evaluate(4_620)
assert.equal(midpoint.phrase, "exchange")
assert.equal(midpoint.transitionProgress, 0.5)
assert.deepEqual(midpoint.planes.map((plane) => plane.id), ["a", "b"])
assert(midpoint.planes.every((plane) => plane.opacity === 1 && plane.filter === "none" && plane.blend === "normal"))
assert.deepEqual(midpoint.planes.map(({ x, y, z, rotateY }) => ({ x, y, depth: z, rotateY })), [
    { x: 79.2, y: 262.548, depth: -0.18, rotateY: 2.5 },
    { x: 798.96, y: 262.548, depth: -0.18, rotateY: -2.5 },
], "exact packet two-exchange vector")
const handoff = evaluate(5_500)
assert.equal(handoff.phrase, "readable-hold")
assert.equal(handoff.currentId, "b")
assert.equal(handoff.planes.length, 1)
assert.equal(handoff.planes[0].x, 480)
assert.equal(evaluate(automatic.durationMs).stateHash, evaluate(0).stateHash, "loop seam must close exactly")

for (const count of [3, 21, 127]) {
    const source = Array.from({ length: count }, (_, index) => ({ id: `edition-${index}`, ratio: 0.25 + (index % 17) * 0.47, caption: `Edition ${index}` }))
    const timeline = compileVitrineTimeline({ mode: "automatic", mediaCount: count, holdMs: 600, exchangeMs: 600, fixedDurationMs: 0, segments: [], fps: 24 })
    for (let chapter = 0; chapter < count; chapter += 1) {
        const holdEnd = chapter * 1_200 + 600
        const atBoundary = evaluateVitrine({ items: source, parameters, timeline, timeMs: holdEnd, stageWidth: 405, stageHeight: 720 })
        assert.equal(atBoundary.phrase, "exchange", `N=${count} chapter ${chapter} exact hold end`)
        assert.equal(atBoundary.transitionProgress, 0)
        assert.equal(atBoundary.planes.length, 2)
        const atHandoff = evaluateVitrine({ items: source, parameters, timeline, timeMs: (chapter + 1) * 1_200, stageWidth: 405, stageHeight: 720 })
        assert.equal(atHandoff.phrase, "readable-hold", `N=${count} chapter ${chapter} exact handoff`)
        assert.equal(atHandoff.currentId, source[(chapter + 1) % count].id)
        assert.equal(atHandoff.planes.length, 1)
    }
}

const packetRatios = [16 / 9, 4 / 5, 1, 3 / 2, 9 / 16, 2.1, 5 / 4]
const packetItems = (count, prefix, mixed = false) => Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index + 1).padStart(3, "0")}`,
    ratio: mixed ? packetRatios[index % packetRatios.length] : index % 3 === 1 ? 4 / 5 : index % 3 === 2 ? 1 : 16 / 9,
    caption: index % 2 ? `Edition ${index + 1}` : `Object ${index + 1}`,
}))
const packetVector = (source, normalizedTime, width, height) => {
    const timeline = compileVitrineTimeline({ mode: "automatic", mediaCount: source.length, holdMs: 3_740, exchangeMs: 1_760, fixedDurationMs: 0, segments: [], fps: 30 })
    return evaluateVitrine({ items: source, parameters, timeline, timeMs: timeline.durationMs * normalizedTime, stageWidth: width, stageHeight: height })
}
const mixedPortrait = packetVector(packetItems(21, "mixed", true), 0.237, 405, 720)
assert.equal(mixedPortrait.transitionProgress, 0.996676)
assert.deepEqual(mixedPortrait.planes.map(({ id, x, y, z, rotateY, width, height }) => ({ id, x: Math.round(x * 1_000) / 1_000, y: Math.round(y * 1_000) / 1_000, depth: z, rotateY, width: Math.round(width * 1_000) / 1_000, height: Math.round(height * 1_000) / 1_000 })), [
    { id: "mixed-005", x: -149.55, y: 338.4, depth: 0, rotateY: 4.999998, width: 251.1, height: 446.4 },
    { id: "mixed-006", x: 202.5, y: 338.4, depth: 0, rotateY: -0.000002, width: 332.1, height: 158.143 },
], "exact packet mixed-portrait vector")
const manyBounded = packetVector(packetItems(127, "many"), 0.613, 405, 720)
assert.equal(manyBounded.transitionProgress, 0.56425)
assert.equal(manyBounded.count, 127)
assert.equal(manyBounded.maxObservedNodes, 2)
assert.equal(manyBounded.sourceStates.length, 127)
assert.deepEqual(manyBounded.sourceStates.map((state) => state.id), packetItems(127, "many").map((item) => item.id))
assert.equal(manyBounded.sourceStates.filter((state) => state.active).length, 2)
assert.deepEqual(manyBounded.planes.map(({ id, x, y, z, rotateY, width, height }) => ({ id, x: Math.round(x * 1_000) / 1_000, y: Math.round(y * 1_000) / 1_000, depth: z, rotateY, width: Math.round(width * 1_000) / 1_000, height: Math.round(height * 1_000) / 1_000 })), [
    { id: "many-078", x: -40.547, y: 349.256, depth: -0.167536, rotateY: 3.095749, width: 332.1, height: 332.1 },
    { id: "many-079", x: 352.003, y: 349.256, depth: -0.167536, rotateY: -1.904251, width: 332.1, height: 186.806 },
], "exact packet many-127 vector")
const reorderedInactive = packetItems(127, "many")
;[reorderedInactive[0], reorderedInactive[1]] = [reorderedInactive[1], reorderedInactive[0]]
assert.notEqual(packetVector(reorderedInactive, 0.613, 405, 720).stateHash, manyBounded.stateHash, "inactive source order must remain part of complete evaluator identity")

for (const count of [3, 21]) {
    const source = Array.from({ length: count }, (_, index) => ({ id: `fixed-${index}`, ratio: 1 + index / 10, caption: `Fixed ${index}` }))
    const durationMs = count * 2_400
    const timeline = compileVitrineTimeline({ mode: "fixed-duration", mediaCount: count, holdMs: 600, exchangeMs: 600, fixedDurationMs: durationMs, segments: [], fps: 30 })
    for (let chapter = 0; chapter < count; chapter += 1) {
        const chapterStart = chapter * durationMs / count
        const holdEnd = chapterStart + durationMs / count * 0.5
        assert.equal(evaluateVitrine({ items: source, parameters, timeline, timeMs: holdEnd, stageWidth: 640, stageHeight: 640 }).phrase, "exchange")
        assert.equal(evaluateVitrine({ items: source, parameters, timeline, timeMs: chapterStart + durationMs / count, stageWidth: 640, stageHeight: 640 }).phrase, "readable-hold")
    }
}

const oneTimeline = compileVitrineTimeline({ mode: "automatic", mediaCount: 1, holdMs: 3_740, exchangeMs: 1_760, fixedDurationMs: 0, segments: [], fps: 30 })
const oneAt = (timeMs, input = {}) => evaluateVitrine({ items: items.slice(0, 1), parameters, timeline: oneTimeline, timeMs, stageWidth: 960, stageHeight: 540, ...input })
assert.equal(oneAt(0).phrase, "single-still")
assert.deepEqual(oneAt(0).planes, oneAt(2_317).planes)
assert.deepEqual(oneAt(2_317).planes, oneAt(5_499).planes)
assert.equal(vitrineStoryTimeMs(1_250, 5_500, "forward", false), 1_250)
assert.equal(vitrineStoryTimeMs(1_250, 5_500, "reverse", false), 4_250)
assert.equal(vitrineStoryTimeMs(0, 5_500, "reverse", false), 0)
assert.equal(vitrineStoryTimeMs(1_250, 5_500, "reverse", true), 4_250)
assert.equal(vitrineStoryTimeMs(0, 5_500, "reverse", true), 5_500)

const fixed = compileVitrineTimeline({ mode: "fixed-duration", mediaCount: 2, holdMs: 1_400, exchangeMs: 760, fixedDurationMs: 8_000, segments: [], fps: 25 })
assert.equal(fixed.durationMs, 8_000)
assert.equal(fixed.frameCount, 200)
assert.equal(minimumVitrineFixedDuration(2, 1_400, 760), 1_852)
const directedMinimum = compileVitrineTimeline({
    mode: "directed",
    mediaCount: 2,
    holdMs: VITRINE_MIN_HOLD_MS * 2,
    exchangeMs: VITRINE_MIN_EXCHANGE_MS * 2,
    fixedDurationMs: 0,
    segments: [{ id: "fast-minimum", kind: "cycle", cycles: 1, paceScale: 2, durationMs: 0 }],
    fps: 30,
})
assert.equal(minimumVitrineFixedDuration(2, VITRINE_MIN_HOLD_MS * 2, VITRINE_MIN_EXCHANGE_MS * 2), 1_760)
assert.equal(directedMinimum.durationMs, 1_760)
const directed = compileVitrineTimeline({
    mode: "directed",
    mediaCount: 2,
    holdMs: 1_400,
    exchangeMs: 760,
    fixedDurationMs: 0,
    segments: [
        { id: "one-cycle", kind: "cycle", cycles: 1, paceScale: 1, durationMs: 4_320 },
        { id: "ending-hold", kind: "hold", cycles: 0, paceScale: 1, durationMs: 600 },
    ],
    fps: 30,
})
assert.equal(directed.durationMs, 4_920)
assert.deepEqual(evaluateVitrineTimeline(directed, 4_600), { cycle: 1, velocity: 0, segmentId: "ending-hold" })

for (const invalid of [
    { mode: "automatic", mediaCount: 128, holdMs: 600, exchangeMs: 600, fixedDurationMs: 0, segments: [], fps: 30 },
    { mode: "automatic", mediaCount: Number.NaN, holdMs: 600, exchangeMs: 600, fixedDurationMs: 0, segments: [], fps: 30 },
    { mode: "mystery", mediaCount: 2, holdMs: 600, exchangeMs: 600, fixedDurationMs: 0, segments: [], fps: 30 },
    { mode: "automatic", mediaCount: 2, holdMs: 600, exchangeMs: 600, fixedDurationMs: 1_000, segments: [], fps: 30 },
    { mode: "fixed-duration", mediaCount: 12, holdMs: 1_400, exchangeMs: 760, fixedDurationMs: 2_000, segments: [], fps: 30 },
    { mode: "directed", mediaCount: 2, holdMs: 1_400, exchangeMs: 760, fixedDurationMs: 0, segments: [], fps: 30 },
    { mode: "directed", mediaCount: 2, holdMs: 600, exchangeMs: 280, fixedDurationMs: 0, segments: [{ id: "too-fast", kind: "cycle", cycles: 2, paceScale: 2, durationMs: 0 }], fps: 30 },
    { mode: "directed", mediaCount: 2, holdMs: 600, exchangeMs: 600, fixedDurationMs: 0, segments: [{ id: "same", kind: "hold", cycles: 0, paceScale: 1, durationMs: 50_000_000 }, { id: "same", kind: "hold", cycles: 0, paceScale: 1, durationMs: 50_000_000 }], fps: 30 },
]) assert.throws(() => compileVitrineTimeline(invalid), /Vitrine|directed|Automatic/)

function comparable(frame) {
    return {
        phase: frame.phase,
        segmentId: frame.segmentId,
        phrase: frame.phrase,
        currentId: frame.currentId,
        incomingId: frame.incomingId,
        transitionProgress: frame.transitionProgress,
        placard: frame.placard,
        planes: frame.planes,
        render: frame.render,
    }
}

for (const timeline of [automatic, directed]) {
    for (const terminal of [false, true]) {
        for (const timeMs of [0, 1, timeline.durationMs * 0.12, timeline.durationMs * 0.3, timeline.durationMs * 0.68, timeline.durationMs * 0.77, timeline.durationMs * 0.92, timeline.durationMs - 1]) {
            const source = items.slice(0, 2)
            const forward = evaluateVitrine({ items: source, parameters, timeline, timeMs: timeline.durationMs - timeMs, stageWidth: 960, stageHeight: 540, terminal })
            const reverse = evaluateVitrine({ items: source, parameters: { ...parameters, direction: "reverse" }, timeline, timeMs, stageWidth: 960, stageHeight: 540, terminal })
            assert.deepEqual(comparable(reverse), comparable(forward), `reverse must be forward(T-t), terminal=${terminal}, t=${timeMs}`)
            close(reverse.velocity, -forward.velocity)
        }
    }
}

for (const direction of ["forward", "reverse"]) {
    const left = evaluate(4_620, { direction, transitionDirection: "left" })
    const right = evaluate(4_620, { direction, transitionDirection: "right" })
    assert.deepEqual(left.planes.map((plane) => plane.id), right.planes.map((plane) => plane.id))
    assert.equal(left.transitionProgress, right.transitionProgress)
    left.planes.forEach((plane, index) => {
        const mirror = right.planes[index]
        close(plane.x + mirror.x, 960)
        close(plane.rotateY, -mirror.rotateY)
        for (const key of ["y", "z", "width", "height", "scale", "rotateX", "opacity", "filter", "blend"]) assert.equal(plane[key], mirror[key])
    })
}

for (const width of [405, 640]) {
    const left = evaluateVitrine({ items: items.slice(0, 2), parameters: { ...parameters, transitionDirection: "left" }, timeline: automatic, timeMs: 3_740, stageWidth: width, stageHeight: 720 })
    const right = evaluateVitrine({ items: items.slice(0, 2), parameters: { ...parameters, transitionDirection: "right" }, timeline: automatic, timeMs: 3_740, stageWidth: width, stageHeight: 720 })
    const leftIncoming = left.planes.find((plane) => plane.role === "incoming")
    const rightIncoming = right.planes.find((plane) => plane.role === "incoming")
    close(leftIncoming.x - leftIncoming.width / 2 - width, 24)
    close(-(rightIncoming.x + rightIncoming.width / 2), 24)
}

function finiteAt(source, phase, spotlightId, finaleId, patch = {}) {
    const timeline = compileVitrineTimeline({ mode: "automatic", mediaCount: source.length, holdMs: 3_740, exchangeMs: 1_760, fixedDurationMs: 0, segments: [], fps: 30 })
    return evaluateVitrine({ items: source, parameters: { ...parameters, ...patch }, timeline, timeMs: timeline.durationMs * phase, stageWidth: 960, stageHeight: 540, terminal: true, spotlightId, finaleId })
}

const singleStates = []
for (const terminal of [false, true]) for (const phase of [0, 0.03, 0.3, 0.9, 0.99, 1]) {
    const timeline = compileVitrineTimeline({ mode: "automatic", mediaCount: 1, holdMs: 3_740, exchangeMs: 1_760, fixedDurationMs: 0, segments: [], fps: 30 })
    const frame = evaluateVitrine({ items: items.slice(0, 1), parameters, timeline, timeMs: timeline.durationMs * phase, stageWidth: 960, stageHeight: 540, terminal, spotlightId: "a", finaleId: "a" })
    assert.equal(frame.phrase, "single-still")
    assert.equal(frame.velocity, 0)
    singleStates.push(frame)
}
for (const frame of singleStates.slice(1)) assert.deepEqual(frame, singleStates[0], "single-source Vitrine must remain one exact centred still for every clock mode")

for (const [phase, phrase] of [[0.12, "readable-hold"], [0.68, "exchange"], [0.86, "finale-hold"], [0.96, "exit"]]) {
    assert.equal(finiteAt(items.slice(0, 2), phase, "a", "b").phrase, phrase)
}
const finiteExchange = finiteAt(items, 0.77, "b", "d")
assert.deepEqual([finiteExchange.currentId, finiteExchange.incomingId], ["b", "d"])
assert.equal(finiteExchange.transitionProgress, 0.5)
assert.equal(finiteAt(items, 0.5, "b", "d").currentId, "b", "finite hold must not tour intermediate sources")
assert.equal(finiteAt(items, 0.68 - 1e-10, "b", "d").phrase, "readable-hold")
assert.deepEqual([finiteAt(items, 0.68, "b", "d").currentId, finiteAt(items, 0.68, "b", "d").incomingId], ["b", "d"])
assert.equal(finiteAt(items, 0.86 - 1e-10, "b", "d").phrase, "exchange")
assert.equal(finiteAt(items, 0.86, "b", "d").currentId, "d")
assert.equal(finiteAt(items, 0.77, "b", "b").phrase, "readable-hold", "same opening/finale must not create a fake exchange")
assert.equal(finiteAt(items, 0.9, "b", "b").phrase, "finale-hold")

for (const [width, height] of [[960, 540], [405, 720], [640, 640], [576, 720]]) {
    for (const scale of [0.42, 0.62, 0.78]) {
        for (const ratio of [1 / 10_000, 4 / 5, 16 / 9, 10_000]) {
            const frame = evaluateVitrine({ items: [{ id: "geometry", ratio, caption: "Geometry" }], parameters: { ...parameters, presentationScale: scale }, timeline: oneTimeline, timeMs: 0, stageWidth: width, stageHeight: height })
            const plane = frame.planes[0]
            const expectedHeight = Math.min(height * scale, width * (width < height ? 0.82 : 0.72) / ratio)
            close(plane.height, expectedHeight)
            close(plane.width, expectedHeight * ratio, 0.001)
            close(plane.width / plane.height, ratio, Math.max(0.00001, ratio * 0.000001))
            close(plane.x, width / 2)
            close(plane.y, height * 0.47)
        }
    }
}

const smallSquare = evaluateVitrine({ items: [{ id: "square", ratio: 1, caption: "Square" }], parameters: { ...parameters, presentationScale: 0.42 }, timeline: oneTimeline, timeMs: 0, stageWidth: 960, stageHeight: 540 })
const largeSquare = evaluateVitrine({ items: [{ id: "square", ratio: 1, caption: "Square" }], parameters: { ...parameters, presentationScale: 0.78 }, timeline: oneTimeline, timeMs: 0, stageWidth: 960, stageHeight: 540 })
assert(largeSquare.planes[0].height > smallSquare.planes[0].height)
const portraitWideSmall = evaluateVitrine({ items: [{ id: "wide", ratio: 16 / 9, caption: "Wide" }], parameters: { ...parameters, presentationScale: 0.42 }, timeline: oneTimeline, timeMs: 0, stageWidth: 405, stageHeight: 720 })
const portraitWideLarge = evaluateVitrine({ items: [{ id: "wide", ratio: 16 / 9, caption: "Wide" }], parameters: { ...parameters, presentationScale: 0.78 }, timeline: oneTimeline, timeMs: 0, stageWidth: 405, stageHeight: 720 })
assert.deepEqual(portraitWideLarge.planes, portraitWideSmall.planes, "width safety bound may own very wide portrait-canvas sources")

const noTurn = evaluate(4_620, { objectTurnAmplitude: 0 })
assert(noTurn.planes.every((plane) => plane.rotateY === 0))
const deeper = evaluate(4_620, { transitionDepth: 0.3 })
assert.deepEqual(deeper.planes.map((plane) => plane.x), midpoint.planes.map((plane) => plane.x))
assert.notDeepEqual(deeper.planes.map((plane) => [plane.y, plane.z, plane.scale]), midpoint.planes.map((plane) => [plane.y, plane.z, plane.scale]))
const noPlacard = evaluate(1_000, { placardVisible: false })
assert.equal(noPlacard.placard, null)
assert.deepEqual(noPlacard.planes, hold.planes)
assert.equal(evaluate(1_000, { fit: "cover" }).render.fit, "cover")

for (let sample = 0; sample <= 100; sample += 1) {
    for (const terminal of [false, true]) {
        const frame = evaluate(automatic.durationMs * sample / 100, {}, { terminal })
        assert(frame.planes.every((plane) => plane.opacity === 1 && plane.filter === "none" && plane.blend === "normal"))
    }
}
const reduced = evaluate(automatic.durationMs * 0.77, {}, { reducedMotion: true })
assert.equal(reduced.phrase, "reduced-motion-settled")
assert.equal(reduced.planes.length, 1)
assert.equal(reduced.velocity, 0)
assert.equal(reduced.currentId, "b", "loop reduced motion must settle on the current authored chapter")
const reducedFinite = evaluate(automatic.durationMs * 0.9, {}, { reducedMotion: true, terminal: true, spotlightId: "b", finaleId: "a" })
assert.equal(reducedFinite.currentId, "b", "finite reduced motion must remain on Spotlight without automatic Finale advance")
assert.equal(reducedFinite.incomingId, null)
assert.equal(reducedFinite.velocity, 0)
for (const phase of [0, 0.25, 0.5, 0.9, 1]) {
    const sample = evaluate(automatic.durationMs * phase, {}, { reducedMotion: true, terminal: true, spotlightId: "b", finaleId: "a" })
    assert.deepEqual(sample, evaluate(0, {}, { reducedMotion: true, terminal: true, spotlightId: "b", finaleId: "a" }), "finite reduced motion must freeze Spotlight semantics and state hash")
}
assert.deepEqual([0, 0.25, 0.5, 0.75, 1].map((phase) => evaluate(automatic.durationMs * phase, {}, { reducedMotion: true }).currentId), ["a", "a", "b", "b", "a"], "loop reduced motion must step discretely at authored chapter boundaries")

const before = structuredClone({ items, parameters, automatic })
evaluateVitrine({ items, parameters, timeline: automatic, timeMs: 4_620, stageWidth: 960, stageHeight: 540 })
assert.deepEqual({ items, parameters, automatic }, before, "evaluation must not mutate Project or Timeline input")

for (const invalid of [
    { ...parameters, presentationScale: 0.1 },
    { ...parameters, objectTurnAmplitude: 10 },
    { ...parameters, transitionDepth: Number.NaN },
    { ...parameters, direction: "sideways" },
    { ...parameters, transitionDirection: "forward" },
]) assert.throws(() => vitrineScene.parameters(invalid), /Vitrine/)

assert.equal(vitrineScene.definition.id, "vitrine")
assert.equal(vitrineScene.definition.version, 2)
assert.deepEqual(vitrineScene.controls.map((control) => control.id), ["presentation-scale", "object-turn-amplitude", "transition-depth", "transition-direction", "placard-visibility"])
const defaultSource = packetItems(8, "ordinary")
const defaultTimeline = compileVitrineTimeline({ mode: "automatic", mediaCount: 8, holdMs: 3_740, exchangeMs: 1_760, fixedDurationMs: 0, segments: [], fps: 30 })
assert.deepEqual(Array.from({ length: 8 }, (_, index) => evaluateVitrine({ items: defaultSource, parameters, timeline: defaultTimeline, timeMs: defaultTimeline.durationMs * (index + 0.1) / 8, stageWidth: 960, stageHeight: 540 }).currentId), defaultSource.map((item) => item.id), "fresh default must make every ordered item reachable")

const runtimeItem = (index, patch = {}) => ({
    id: `runtime-${index}`,
    name: `Runtime ${index}.png`,
    type: "image",
    url: `reel-media://grant/${String(index % 10).repeat(64)}`,
    ratio: 1,
    aspectMode: "auto",
    ratioW: 1,
    ratioH: 1,
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
    styleId: "vitrine",
    sceneVersion: 2,
    timelineMode: "automatic",
    timelineFixedDurationMs: 0,
    timelineSegments: [],
    items: [runtimeItem(1), runtimeItem(2)],
    settings: {
        ...DEFAULT_SETTINGS,
        axis: "horizontal",
        backgroundStyle: "transparent",
        holdMs: 1_400,
        paceMs: 760,
        playKind: "once",
        repeatCount: 1,
        spotlightsEnabled: false,
        finaleEnabled: true,
        slideHeight: 62,
        tilt: 5,
        sway: 18,
        transitionDirection: "left",
    },
    ...patch,
})

assert.deepEqual(validateVitrineRuntimeConfig(runtimeConfig()), { cycleDurationMs: 4_320, finalCycleDurationMs: 4_320, durationMs: 4_320 })
const markedOpening = reconcileVitrineConfig(runtimeConfig({
    settings: { ...runtimeConfig().settings, spotlightsEnabled: true },
}))
assert.deepEqual(markedOpening.items.filter((item) => item.spotlight).map((item) => item.id), ["runtime-1"])
const clearedOpening = reconcileVitrineConfig(runtimeConfig({
    items: [runtimeItem(1, { spotlight: true }), runtimeItem(2)],
}))
assert.equal(clearedOpening.items.some((item) => item.spotlight), false)

const oneEligibleFixed = reconcileVitrineConfig(runtimeConfig({
    timelineMode: "fixed-duration",
    timelineFixedDurationMs: 1_000,
    items: [runtimeItem(1), runtimeItem(2, { muted: true })],
}))
const twoEligibleFixed = reconcileVitrineConfig({
    ...oneEligibleFixed,
    items: oneEligibleFixed.items.map((item) => ({ ...item, muted: false })),
})
assert(twoEligibleFixed.timelineFixedDurationMs > oneEligibleFixed.timelineFixedDurationMs)
assert(twoEligibleFixed.timelineFixedDurationMs >= minimumVitrineFixedDuration(2, 1_400, 760))

assert.equal(validateVitrineRuntimeConfig(runtimeConfig({
    items: Array.from({ length: 127 }, (_, index) => runtimeItem(index + 1)),
})).cycleDurationMs, 127 * 2_160)
assert.throws(() => validateVitrineRuntimeConfig(runtimeConfig({
    items: Array.from({ length: 128 }, (_, index) => runtimeItem(index + 1)),
})), /ordered media intent/)
for (const patch of [
    { fit: "stretch" },
    { crop: { x: 0.5, y: 0, width: 0.6, height: 1 } },
    { crop: { x: 0, y: 0, width: 0.00009, height: 1 } },
    { focal: { x: -0.01, y: 0.5 } },
    { ratio: 10_000, crop: { x: 0, y: 0, width: 1, height: 0.0001 } },
]) assert.throws(() => validateVitrineRuntimeConfig(runtimeConfig({ items: [runtimeItem(1, patch)] })), /frame|crop|ratio|fit/i)
for (const [ratioW, ratioH] of [[1, 10_000], [10_000, 1]]) {
    assert(validateVitrineRuntimeConfig(runtimeConfig({ items: [runtimeItem(1, { aspectMode: "custom", ratioW, ratioH })] })).durationMs > 0)
}
for (const privateEvidence of [
    "x=/home/alice/project.png",
    "x=C:\\Users\\alice\\project.png",
    "x=\\\\server\\share\\project.png",
    "x=%2Fhome%2Falice%2Fproject.png",
    "x=%252Fhome%252Falice%252Fproject.png",
    "x=%25252Fhome%25252Falice%25252Fprivate.png",
    "x=/users/alice/private.png",
    "x=\\Users\\alice\\private.png",
    "x=/usr/local/secret",
    "x=/proc/self/cwd",
    "x=~/secret",
    "x=../../secret",
    "x=C:private\\secret",
    "blob:private-frame",
    { "x=/tmp/private": "digest" },
]) assert.throws(() => assertNoPrivateEvidence(privateEvidence), /private authority/)
assert.doesNotThrow(() => assertNoPrivateEvidence({ file: "vitrine-save-hold-a.png", sha256: "a".repeat(64), message: "Project opened" }))
assert.throws(() => validateVitrineRuntimeConfig(runtimeConfig({ timelineMode: "mystery" })), /Timeline intent/)
assert.throws(() => validateVitrineRuntimeConfig(runtimeConfig({
    timelineMode: "directed",
    settings: { ...runtimeConfig().settings, playKind: "once" },
    timelineSegments: [{ id: "literal-hold", kind: "hold", cycles: 0, paceScale: 1, durationMs: 600 }],
})), /directed segments require Loop/)
assert.throws(() => validateVitrineRuntimeConfig(runtimeConfig({
    timelineMode: "directed",
    settings: { ...runtimeConfig().settings, playKind: "loop" },
    timelineSegments: [{ id: 17, kind: "hold", cycles: 0, paceScale: 1, durationMs: 600 }],
})), /directed Vitrine segment/)

console.log("Verified: Vitrine v2 exact temporal reverse, independent spatial direction, boundary-stable routes, natural-ratio geometry, causal controls, strict runtime reconciliation, and deterministic immutable evaluation.")
