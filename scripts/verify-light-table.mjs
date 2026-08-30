import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"
import { DEFAULT_SETTINGS } from "../src/defaults.ts"
import {
    automaticLightTableDuration,
    compileLightTableCoreTimeline,
    compileLightTableTimeline,
    evaluateLightTable,
    evaluateLightTableCore,
    LIGHT_TABLE_CORE_AUTHORITY_SHA256,
    LIGHT_TABLE_CORE_IMPLEMENTATION_SHA256,
    LIGHT_TABLE_CORE_MAX_CANVAS_RATIO,
    LIGHT_TABLE_CORE_MAX_SOURCE_RATIO,
    LIGHT_TABLE_CORE_MIN_CANVAS_RATIO,
    LIGHT_TABLE_CORE_MIN_SOURCE_RATIO,
    LIGHT_TABLE_MAX_DURATION_MS,
    LIGHT_TABLE_TRANSPARENCY_REASON,
    lightTableFrameCount,
    lightTableCoreFixture,
    lightTableScene,
    lightTableSourceTimeSeconds,
    minimumLightTableDuration,
    stableLightTableCoreStringify,
} from "../src/scenes/lightTable.ts"
import {
    LIGHT_TABLE_MAX_VIDEO_OWNERS,
    LIGHT_TABLE_POSTER_MAX_BYTES,
    LIGHT_TABLE_POSTER_MAX_EDGE,
    createLightTablePosterEncodeGate,
    createLightTableVideoTargetCoordinator,
    lightTablePresentedFrameAtOrBeforeTarget,
    lightTableSeekConverged,
    lightTableVideoSeekTime,
    matchingLightTablePoster,
    retainedLightTablePoster,
    sampledLightTableSourceTimeMs,
    selectLightTableVideoOwnerIds,
    shouldReplaceLightTablePoster,
} from "../src/scenes/lightTableVideoPolicy.ts"
import {
    assertLightTableOpaqueIntent,
    lightTableParametersFromConfig,
    lightTableSourcesFromConfig,
    lightTableTimelineMediaCount,
    resolvedLightTableRatio,
    validateLightTableRuntimeConfig,
    withLightTableDefaults,
} from "../src/lightTableConfig.ts"
import {
    LIGHT_TABLE_UNDERLIGHT_LAYER_Z,
    activateLightTablePlane,
    containLightTableKeyboardActivation,
    lightTableArtworkLayerZ,
    lightTableKeyIntent,
    nextLightTableInspectionId,
} from "../src/scenes/lightTablePresentation.ts"

const PINNED_CORE_AUTHORITY_SHA256 = "58cb28c0a6d44b3334ef0c25bc02f902dd1383270fe194f4145f2f34c1eccbf8"
const PINNED_CORE_IMPLEMENTATION_SHA256 = "8fe4b48d150db186001b16b11ed8bf17cb2beca063cd52ec6448a5ad5ea583f3"
const { lightTableFrameCount: hostLightTableFrameCount } = createRequire(import.meta.url)("../electron/frame-count-policy.cjs")
const VECTOR_IDS = [
    "seam-ordinary-six",
    "ordinary-duration",
    "count-one",
    "count-two",
    "count-five",
    "count-six",
    "bounded-many",
    "ratio-canvas-extremes",
    "too-many",
    "zero",
    "reduced-motion",
    "failed-source",
    "source-video",
    "source-contamination",
    "reverse-parity",
    "control-spread",
    "control-overlap",
    "opaque-capability",
]
const covered = new Set()
const cover = (id, check) => {
    check()
    covered.add(id)
}
const hash = (value) => crypto.createHash("sha256").update(stableLightTableCoreStringify(value)).digest("hex")

function allFinite(value) {
    if (typeof value === "number") return Number.isFinite(value)
    if (Array.isArray(value)) return value.every(allFinite)
    if (value && typeof value === "object") return Object.values(value).every(allFinite)
    return true
}

function authority(fixtureId = "ordinary-six", controls = {}, intent = { mode: "automatic" }) {
    const sources = lightTableCoreFixture(fixtureId)
    const compiled = compileLightTableCoreTimeline(intent, sources.length || 1, controls)
    return { sources, compiled, evaluate: (time, options = {}) => evaluateLightTableCore(compiled, time, sources, { canvasRatio: 16 / 9, ...options }) }
}

function independentMetrics(frames, canvasRatio) {
    const rectangles = frames.map((frame) => {
        const width = frame.width * frame.scale
        const height = width * canvasRatio / frame.ratio * frame.scale
        return { left: frame.x - width / 2, right: frame.x + width / 2, top: frame.y - height / 2, bottom: frame.y + height / 2, area: width * height }
    })
    const renderedBounds = frames.map((frame) => {
        const radians = Math.abs(frame.rotation) * Math.PI / 180
        const cosine = Math.cos(radians)
        const sine = Math.sin(radians)
        const scaledWidth = frame.width * frame.scale
        const scaledHeightInStageWidth = scaledWidth / frame.ratio
        const width = scaledWidth * cosine + scaledHeightInStageWidth * sine
        const height = (scaledWidth * sine + scaledHeightInStageWidth * cosine) * canvasRatio
        return { left: frame.x - width / 2, right: frame.x + width / 2, top: frame.y - height / 2, bottom: frame.y + height / 2 }
    })
    let maximum = 0
    let intersections = 0
    for (let leftIndex = 0; leftIndex < rectangles.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < rectangles.length; rightIndex += 1) {
            const left = rectangles[leftIndex]
            const right = rectangles[rightIndex]
            const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
            const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
            const area = width * height
            if (area > 0) {
                intersections += 1
                maximum = Math.max(maximum, area / Math.max(1e-9, Math.min(left.area, right.area)))
            }
        }
    }
    return {
        maximum,
        intersections,
        outOfBounds: renderedBounds.filter((rectangle) => rectangle.left < 0 || rectangle.right > 1 || rectangle.top < 0 || rectangle.bottom > 1).length,
    }
}

function renderedPlaneBounds(plane) {
    const radians = Math.abs(plane.rotation) * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    const width = (plane.width * cosine + plane.height * sine) * plane.scale
    const height = (plane.width * sine + plane.height * cosine) * plane.scale
    return { left: plane.x - width / 2, right: plane.x + width / 2, top: plane.y - height / 2, bottom: plane.y + height / 2 }
}

function close(actual, expected, tolerance = 1e-10) {
    assert(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)
}

function media(count, type = "image") {
    const sources = lightTableCoreFixture(count === 1 ? "one" : count === 2 ? "two" : count === 5 ? "five" : count === 24 ? "many-24" : "ordinary-six")
    return sources.slice(0, count).map((source, index) => ({
        id: source.id,
        name: source.name,
        type: index === 1 && type === "video" ? "video" : "image",
        url: `reel-media://source-${index + 1}`,
        ratio: source.ratio,
        aspectMode: "auto",
        ratioW: 16,
        ratioH: 9,
        fit: "contain",
        crop: { x: 0, y: 0, width: 1, height: 1 },
        focal: { x: 0.5, y: 0.5 },
        caption: "",
        spotlight: false,
        muted: false,
    }))
}

function config(count = 6, patch = {}) {
    const base = {
        schemaVersion: 2,
        styleId: "light-table",
        sceneVersion: 2,
        items: media(count),
        settings: {
            ...structuredClone(DEFAULT_SETTINGS),
            backgroundStyle: "solid",
            ground: "#e8e6de",
            imageFit: "contain",
            direction: "forward",
        },
        timelineMode: "automatic",
        timelineFixedDurationMs: 0,
        timelineSegments: [],
    }
    return { ...base, ...patch, settings: { ...base.settings, ...(patch.settings ?? {}) } }
}

function productTimeline(count = 6, direction = "forward", patch = {}) {
    return compileLightTableTimeline({
        mode: "automatic",
        direction,
        mediaCount: count,
        fixedDurationMs: 0,
        segments: [],
        fps: 30,
        ...patch,
    })
}

function productEvaluation(direction, timeMs, items = lightTableSourcesFromConfig(config())) {
    const timeline = productTimeline(items.length, direction)
    return evaluateLightTable({
        items,
        parameters: lightTableScene.defaults(),
        timeline,
        timeMs,
        stageWidth: 1600,
        stageHeight: 900,
    })
}

assert.equal(LIGHT_TABLE_CORE_AUTHORITY_SHA256, PINNED_CORE_AUTHORITY_SHA256)
assert.equal(LIGHT_TABLE_CORE_IMPLEMENTATION_SHA256, PINNED_CORE_IMPLEMENTATION_SHA256)
const coreSource = fs.readFileSync(new URL("../src/scenes/lightTableCore.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n")
const coreSourceWithoutImplementationIdentity = coreSource.replace(/^export const LIGHT_TABLE_CORE_IMPLEMENTATION_SHA256 = "[a-f0-9]{64}"\r?\n/m, "")
assert.notEqual(coreSourceWithoutImplementationIdentity, coreSource, "implementation identity declaration must remain canonical")
assert.equal(crypto.createHash("sha256").update(coreSourceWithoutImplementationIdentity).digest("hex"), PINNED_CORE_IMPLEMENTATION_SHA256)
assert.deepEqual([
    LIGHT_TABLE_CORE_MIN_SOURCE_RATIO,
    LIGHT_TABLE_CORE_MAX_SOURCE_RATIO,
    LIGHT_TABLE_CORE_MIN_CANVAS_RATIO,
    LIGHT_TABLE_CORE_MAX_CANVAS_RATIO,
], [0.05, 20, 64 / 7_680, 7_680 / 64])
assert.equal(lightTableFrameCount(12_345, 30), 371, "a partial terminal Light Table frame must be retained")
assert.equal(lightTableFrameCount(12_000, 30), 360, "an exact Light Table frame boundary must not gain a frame")
assert.equal(lightTableFrameCount(1_000, 29.97), 30, "decimal frame rates must use the same rational ceiling")
assert.throws(() => lightTableFrameCount(0, 30), /positive finite number/)
for (const [durationMs, fps] of [[1, 1], [20, 50], [1_000, 29.97], [4_100, 30], [12_000, 30], [12_345, 30], [60_000, 120]]) {
    assert.equal(lightTableFrameCount(durationMs, fps), hostLightTableFrameCount(durationMs, fps), `browser and host frame clocks diverged at ${durationMs}ms @ ${fps}fps`)
}
assert.deepEqual(lightTableScene.controls.map((control) => control.id), ["table-spread", "overlap", "underlight-strength", "focus-behaviour", "nudge-restraint"])
assert.deepEqual(lightTableScene.controls.map((control) => control.owner), ["Scene", "Scene", "Look", "Scene", "Scene"])
assert.deepEqual(lightTableScene.controls.map((control) => control.resetValue), [0.72, 0.1, 0.42, "route", 0.28])

cover("ordinary-duration", () => {
    const ordinary = authority()
    assert.equal(hash(ordinary.compiled), "151c2b30c1546d5507d9bf90b5eaa295dde281dbc0048ff24d97fc04454be80c")
    assert.equal(ordinary.compiled.durationMs, 10_000)
    assert.equal(ordinary.compiled.minimumDurationMs, 6_000)
    assert.deepEqual(ordinary.compiled.segments.map((segment) => [segment.id, segment.startMs, segment.endMs, segment.requestedPaceScale]), [
        ["wake", 0, 1_000, 1],
        ["review", 1_000, 7_800, 1],
        ["final-inspection", 7_800, 9_200, 1],
        ["return", 9_200, 10_000, 1],
    ])
    assert.equal(automaticLightTableDuration(1), 8_000)
    assert.equal(automaticLightTableDuration(24), 18_000)
    assert.equal(minimumLightTableDuration(24), 17_520)
})

cover("seam-ordinary-six", () => {
    const ordinary = authority()
    const start = ordinary.evaluate(0)
    const end = ordinary.evaluate(1)
    assert.equal(start.apply, "ok")
    assert.equal(end.apply, "ok")
    const geometry = (result) => result.frames.map(({ x, y, rotation, scale, focusWeight, underlight }) => ({ x, y, rotation, scale, focusWeight, underlight }))
    assert.equal(hash(geometry(start)), "3989fb494fa06f1d851b1eb8c5df9f24dc2d87bbf84f585086e5aa2289378c24")
    assert.deepEqual(geometry(end), geometry(start))
    assert.deepEqual([end.normalizedTime, end.phase, end.phaseSeam], [1, "seam", true])
})

for (const [vectorId, fixtureId, layout, compiledHash, frameHash] of [
    ["count-one", "one", "single-inspection", "0b38cd32f988584f538262ce74c981a3284f70dc16bd2e977555dc31ea16ad53", "4d2c73e09c3b57145ec67ef73da9a3de7cc86284f740cd984d85d029d6dbed86"],
    ["count-two", "two", "bilateral", "423210431933f960d83a2479ce82bbde6597e76274bc120379f8efe99bad9993", "90956c6ab59d254a3847b1de1bb5304a465b500f40f01956bcb31c2207f7f806"],
    ["count-five", "five", "open-bay", "91b897a4d486cf71f093f3b3756025e3dc014683318b831a79eb0c853769619f", "7ef05d11b3b43feb9a654261d976fd9fecd975ccb120882256b957054283f88f"],
    ["count-six", "ordinary-six", "ordinary", "151c2b30c1546d5507d9bf90b5eaa295dde281dbc0048ff24d97fc04454be80c", "61bd0853cf89eb6e3ce8c8cb0f26af37b1df57bd6ceab38502cd3af349394a79"],
]) cover(vectorId, () => {
    const candidate = authority(fixtureId)
    const frame = candidate.evaluate(0.5)
    assert.equal(hash(candidate.compiled), compiledHash)
    assert.equal(hash(frame), frameHash)
    assert.equal(frame.layout, layout)
    assert.equal(new Set(frame.frames.map((item) => item.id)).size, candidate.sources.length)
    if (fixtureId === "ordinary-six") assert.equal(hash(frame.frames), "5919d54d86ac53e906f9e1f5f712a3bb0241bfe2d11855a5e3505742ab41ad70", "ordinary rendered geometry must remain unchanged")
})

cover("bounded-many", () => {
    const exact = authority("many-24")
    assert.equal(hash(exact.compiled), "5abf811413c0352d8f889a3bfab0a2418e3003541c7deec9a7f43c4b3763a16a")
    assert.equal(hash(exact.evaluate(0.5)), "7add2cba509e0ae267fe6b3b7aede1a31e948f274b1f5e2e8f7479cfaa140911")
    for (const fixtureId of ["many-12", "many-24"]) {
        for (const ratio of [16 / 9, 9 / 16, 1, 4 / 5]) {
            const candidate = authority(fixtureId, { overlap: 0.22 })
            for (const time of [0, 0.125, 0.5, 0.875, 1]) {
                const frame = candidate.evaluate(time, { canvasRatio: ratio })
                assert.equal(frame.apply, "ok")
                const metrics = independentMetrics(frame.frames, ratio)
                assert.equal(metrics.outOfBounds, 0)
                assert(metrics.maximum <= 0.22, `${fixtureId} ${ratio} ${time}: ${metrics.maximum}`)
                assert(Math.abs(metrics.maximum - frame.layoutMetrics.maxOcclusionFraction) < 1e-12)
            }
        }
    }
})

cover("ratio-canvas-extremes", () => {
    const ratios = [LIGHT_TABLE_CORE_MIN_SOURCE_RATIO, LIGHT_TABLE_CORE_MAX_SOURCE_RATIO]
    const sources = lightTableCoreFixture("many-24").map((source, index) => ({ ...source, ratio: ratios[index % ratios.length] }))
    const compiled = compileLightTableCoreTimeline({ mode: "automatic" }, sources.length, { tableSpread: 0.92, overlap: 0, nudgeRestraint: 0.6 })
    const canvases = [
        { width: 3_840, height: 64 },
        { width: 64, height: 3_840 },
        { width: 7_680, height: 64 },
        { width: 64, height: 7_680 },
    ]

    for (const canvas of canvases) {
        const canvasRatio = canvas.width / canvas.height
        for (const time of [0, 0.125, 0.5, 0.875, 1]) {
            const frame = evaluateLightTableCore(compiled, time, sources, { canvasRatio, manualFocusIndex: sources.length - 1 })
            assert.equal(frame.apply, "ok")
            assert.equal(frame.frames.length, 24)
            assert.deepEqual(frame.frames.map((item) => item.id), sources.map((source) => source.id), "the bounded core must preserve all 24 ordered identities")
            assert.deepEqual(frame.frames.map((item) => item.ratio), sources.map((source) => source.ratio), "admitted source ratios must survive core evaluation exactly")
            assert(allFinite(frame))
            const metrics = independentMetrics(frame.frames, canvasRatio)
            assert.equal(metrics.outOfBounds, 0, `${canvas.width}x${canvas.height} at ${time} must remain visibly contained`)
            assert.equal(frame.layoutMetrics.outOfBoundsCount, metrics.outOfBounds)
            assert.equal(frame.layoutMetrics.intersectionCount, metrics.intersections)
            close(frame.layoutMetrics.maxOcclusionFraction, metrics.maximum)
        }

        const items = media(24).map((item, index) => ({ ...item, ratio: ratios[index % ratios.length] }))
        const admitted = validateLightTableRuntimeConfig(config(24, {
            items,
            settings: { canvasWidth: canvas.width, canvasHeight: canvas.height },
        }))
        assert.deepEqual(admitted.sources.map((source) => source.ratio), items.map((item) => item.ratio), "runtime admission must preserve supported canvas and ratio extremes")
        const timeline = productTimeline(items.length)
        const rendered = evaluateLightTable({
            items,
            parameters: { ...lightTableScene.defaults(), tableSpread: 0.92, overlap: 0, nudgeRestraint: 0.6 },
            timeline,
            timeMs: timeline.durationMs / 2,
            stageWidth: canvas.width,
            stageHeight: canvas.height,
            manualFocusIndex: items.length - 1,
        })
        assert.equal(rendered.planes.length, 24)
        assert.equal(rendered.layout.outOfBoundsCount, 0)
        rendered.planes.forEach((plane, index) => {
            close(plane.width / plane.height, items[index].ratio)
            const bounds = renderedPlaneBounds(plane)
            assert(bounds.left >= -1e-8 && bounds.right <= canvas.width + 1e-8 && bounds.top >= -1e-8 && bounds.bottom <= canvas.height + 1e-8, `${canvas.width}x${canvas.height} plane ${index} escaped its rendered canvas`)
        })
    }

    for (const probe of [
        { width: 3_840, height: 64, ratio: LIGHT_TABLE_CORE_MAX_SOURCE_RATIO },
        { width: 64, height: 3_840, ratio: LIGHT_TABLE_CORE_MIN_SOURCE_RATIO },
    ]) {
        const items = media(2).map((item) => ({ ...item, ratio: probe.ratio }))
        const timeline = productTimeline(items.length)
        const rendered = evaluateLightTable({
            items,
            parameters: { ...lightTableScene.defaults(), tableSpread: 0.92, overlap: 0, nudgeRestraint: 0.6 },
            timeline,
            timeMs: timeline.durationMs / 2,
            stageWidth: probe.width,
            stageHeight: probe.height,
            reducedMotion: true,
        })
        assert(rendered.planes.some((plane) => Math.abs(plane.rotation) > 0.1), "extreme containment must not erase the Light Table rotation")
        assert.equal(rendered.layout.outOfBoundsCount, 0)
        rendered.planes.forEach((plane) => {
            close(plane.width / plane.height, probe.ratio)
            const bounds = renderedPlaneBounds(plane)
            assert(bounds.left >= -1e-8 && bounds.right <= probe.width + 1e-8 && bounds.top >= -1e-8 && bounds.bottom <= probe.height + 1e-8, `${probe.width}x${probe.height} diagonal plane escaped its canvas`)
        })
    }
})

cover("too-many", () => {
    const sources = lightTableCoreFixture("too-many-25")
    const frame = evaluateLightTableCore(compileLightTableCoreTimeline({ mode: "automatic" }, 24, {}), 0.5, sources)
    assert.equal(hash(frame), "0a8d76076dce5d88e093903a7c778767260cb6d20dacfa2e790468d9c8dc366a")
    assert.deepEqual(frame, { apply: "fail", code: "visible-limit", preservedCount: 25, visibleCount: 0, sceneId: "light-table" })
})

cover("zero", () => {
    const frame = evaluateLightTableCore(compileLightTableCoreTimeline({ mode: "automatic" }, 1, {}), 0.5, [])
    assert.equal(hash(frame), "3833b51dcff556a7c018dd4e3e96336de07654b269885d50589080d10129bd4d")
    assert.equal(frame.code, "minimum-items")
})

cover("reduced-motion", () => {
    const ordinary = authority()
    const exact = ordinary.evaluate(0.5, { reducedMotion: true })
    assert.equal(hash(exact), "5dea8846ceacd955be2de53337ff319500e5670d2e174f424a518403b56a580d")
    const first = ordinary.evaluate(0.25, { reducedMotion: true })
    const second = ordinary.evaluate(0.75, { reducedMotion: true })
    assert.deepEqual(first.frames.map(({ x, y, rotation }) => [x, y, rotation]), second.frames.map(({ x, y, rotation }) => [x, y, rotation]))
    assert.deepEqual([exact.focusIndex, exact.focusWeight], [0, 0.72])
})

cover("failed-source", () => {
    const candidate = authority("failed-six")
    const frame = candidate.evaluate(0.5)
    assert.equal(hash(frame), "e34adc4729f09b1edc3ea546b07b36425b1ed061d99241398fc30acb76e8bff5")
    assert.equal(frame.frames[2].failed, true)
    assert.equal(frame.frames[2].id, candidate.sources[2].id)
})

cover("source-video", () => {
    const candidate = authority("video-six")
    const frame = candidate.evaluate(0.375)
    assert.equal(hash(frame), "85548227111c3f562aeb7aac7d0e1ec5847f38db8f54ac1126c24d520ab3b043")
    assert.equal(frame.frames[1].kind, "video")
    assert.equal(lightTableSourceTimeSeconds(2_500, 2, true), 0.5)
    assert.equal(lightTableSourceTimeSeconds(2_500, 2, false), 2)
    assert.equal(sampledLightTableSourceTimeMs(2_567, 30), 2_566.666666666667)
    assert.equal(sampledLightTableSourceTimeMs(4_100, 30), 4_100, "exact output-frame boundaries must not underflow")
    assert.equal(sampledLightTableSourceTimeMs(20, 50), 20, "20 ms frame boundaries must remain exact")
    assert.equal(sampledLightTableSourceTimeMs(4_100 - 1e-6, 30), 4_066.6666666666665)
    assert.equal(sampledLightTableSourceTimeMs(4_100 + 1e-6, 30), 4_100)
    assert.equal(lightTableSeekConverged(0.02, 0.02, 30), true)
    assert.equal(lightTablePresentedFrameAtOrBeforeTarget(0, 0.02), true, "a browser-selected VFR predecessor is valid at a 20 ms target")
    assert.equal(lightTablePresentedFrameAtOrBeforeTarget(0.2, 0.72), true, "VFR predecessor proof must not assume constant frame spacing")
    assert.equal(lightTablePresentedFrameAtOrBeforeTarget(0.021, 0.02), false, "a future presented frame must fail closed")
    const terminalSeek = lightTableVideoSeekTime(lightTableSourceTimeSeconds(1_040, 1.04, false), 1.04)
    assert(terminalSeek < 1.04 && terminalSeek > 1, "a non-loop terminal target must seek inside the media interval")
    assert.equal(lightTablePresentedFrameAtOrBeforeTarget(1, terminalSeek), true, "the terminal seek must admit the last VFR frame")
    const shortTerminalSeek = lightTableVideoSeekTime(lightTableSourceTimeSeconds(20, 0.02, false), 0.02)
    assert(shortTerminalSeek < 0.02 && shortTerminalSeek > 0, "a 20 ms terminal target must remain a valid seek time")
})

cover("source-contamination", () => {
    for (const time of [0, 0.25, 0.5, 0.75, 1]) {
        const off = authority("colour-chart-six", { underlightStrength: 0 }).evaluate(time)
        const on = authority("colour-chart-six", { underlightStrength: 0.7 }).evaluate(time)
        assert.deepEqual(off.frames.map((frame) => frame.media), on.frames.map((frame) => frame.media))
        assert.notDeepEqual(off.frames.map((frame) => frame.underlight), on.frames.map((frame) => frame.underlight))
        assert(off.frames.every((frame) => frame.media.opacity === 1 && frame.media.filter === "none" && frame.media.blend === "normal"))
        assert.equal(on.frames.every((frame) => frame.underlight >= 0), true)
    }
    const presentation = productEvaluation("forward", productTimeline().durationMs * 0.5)
    assert.equal(presentation.render.underlightPlacement, "table-layer-below-all-artwork")
    assert.equal(LIGHT_TABLE_UNDERLIGHT_LAYER_Z, 0)
    for (const plane of presentation.planes) assert(lightTableArtworkLayerZ(plane.z) > LIGHT_TABLE_UNDERLIGHT_LAYER_Z)
})

const eventEvidence = () => {
    const calls = { prevented: 0, stopped: 0 }
    return {
        calls,
        event: {
            preventDefault: () => { calls.prevented += 1 },
            stopPropagation: () => { calls.stopped += 1 },
        },
    }
}

for (const [key, expected] of [
    ["ArrowRight", { kind: "focus", index: 3 }],
    ["ArrowLeft", { kind: "focus", index: 1 }],
    ["Home", { kind: "focus", index: 0 }],
    ["End", { kind: "focus", index: 5 }],
    ["Enter", { kind: "inspect", index: 2 }],
    [" ", { kind: "inspect", index: 2 }],
    ["Escape", { kind: "clear-inspection" }],
]) {
    const intent = lightTableKeyIntent(key, 2, 6)
    assert.deepEqual(intent, expected)
    const evidence = eventEvidence()
    assert.equal(containLightTableKeyboardActivation(evidence.event, intent), true)
    assert.deepEqual(evidence.calls, { prevented: 1, stopped: 1 }, `${key} must not reach App transport`)
}
const unhandled = eventEvidence()
assert.equal(containLightTableKeyboardActivation(unhandled.event, lightTableKeyIntent("r", 2, 6)), false)
assert.deepEqual(unhandled.calls, { prevented: 0, stopped: 0 })
const clicked = eventEvidence()
let inspectedIndex = null
activateLightTablePlane(clicked.event, 4, (index) => { inspectedIndex = index })
assert.deepEqual({ inspectedIndex, calls: clicked.calls }, { inspectedIndex: 4, calls: { prevented: 0, stopped: 1 } })
assert.equal(nextLightTableInspectionId(null, "frame-4"), "frame-4")
assert.equal(nextLightTableInspectionId("frame-4", "frame-4"), null)
assert.equal(nextLightTableInspectionId("frame-4", "frame-6"), "frame-6")
assert.throws(() => nextLightTableInspectionId(null, ""), /identity/)

cover("reverse-parity", () => {
    const duration = productTimeline().durationMs
    for (const sample of [0.125, 0.375, 0.625, 0.875]) {
        const forward = productEvaluation("forward", duration * sample)
        const reverse = productEvaluation("reverse", duration * (1 - sample))
        const geometry = (frame) => frame.planes.map(({ sourceTimeMs: _sourceTimeMs, ...plane }) => plane)
        assert.deepEqual(geometry(reverse), geometry(forward))
        assert.equal(forward.focusId, reverse.focusId)
        assert.equal(forward.planes[0].sourceTimeMs, duration * sample)
        assert.equal(reverse.planes[0].sourceTimeMs, duration * (1 - sample), "source-video clock follows raw Project time, not reversed Scene geometry")
    }
})

cover("control-spread", () => {
    const low = authority("ordinary-six", { tableSpread: 0.52 }).evaluate(0.5)
    const high = authority("ordinary-six", { tableSpread: 0.92 }).evaluate(0.5)
    assert(Math.abs(low.frames[2].x - high.frames[2].x) > 0.05)
    assert.deepEqual(low.frames.map(({ width, ratio }) => ({ width, ratio })), high.frames.map(({ width, ratio }) => ({ width, ratio })))
})

cover("control-overlap", () => {
    const low = authority("ordinary-six", { overlap: 0 }).evaluate(0.5)
    const high = authority("ordinary-six", { overlap: 0.22 }).evaluate(0.5)
    assert(high.layoutMetrics.intersectionCount > low.layoutMetrics.intersectionCount)
    assert(high.layoutMetrics.maxOcclusionFraction > low.layoutMetrics.maxOcclusionFraction)
    assert.deepEqual(low.frames.map(({ width, ratio }) => ({ width, ratio })), high.frames.map(({ width, ratio }) => ({ width, ratio })))
})

cover("opaque-capability", () => {
    const frame = authority().evaluate(0.5)
    assert.deepEqual(frame.capability, { transparentOutput: false })
    assert.throws(() => assertLightTableOpaqueIntent("transparent"), (error) => error instanceof Error && error.message === LIGHT_TABLE_TRANSPARENCY_REASON)
    assert.doesNotThrow(() => assertLightTableOpaqueIntent("solid"))
})

const sourceConfig = config()
const untouched = structuredClone(sourceConfig)
const normalized = withLightTableDefaults(sourceConfig)
assert.deepEqual(sourceConfig, untouched, "default reconciliation must preserve prior Project state")
assert.deepEqual(lightTableParametersFromConfig(normalized), lightTableScene.defaults())
assert.equal(validateLightTableRuntimeConfig(sourceConfig).sources.length, 6)
assert.equal(lightTableTimelineMediaCount(0, false), 1)
assert.equal(lightTableTimelineMediaCount(0, true), 6)
assert.throws(() => validateLightTableRuntimeConfig(config(0)), /at least one source/)
assert.throws(() => validateLightTableRuntimeConfig(config(6, { sceneVersion: 1 })), /identity/)
const cropped = config(1)
cropped.items[0].ratio = 2
cropped.items[0].crop = { x: 0.25, y: 0, width: 0.5, height: 1 }
assert.equal(resolvedLightTableRatio(cropped.items[0], cropped.settings), 1)

const fixedShort = productTimeline(6, "forward", { mode: "fixed-duration", fixedDurationMs: 1_000 })
assert.equal(fixedShort.durationMs, fixedShort.readableMinimumMs)
assert.equal(fixedShort.issues[0].code, "duration-below-readable-minimum")
const fixedLong = productTimeline(6, "forward", { mode: "fixed-duration", fixedDurationMs: 90_000 })
assert.equal(fixedLong.durationMs, LIGHT_TABLE_MAX_DURATION_MS)
const directed = productTimeline(6, "forward", { mode: "directed" })
assert.deepEqual(directed.phases.map((phase) => phase.requestedPaceScale), [2, 1, 1, 2])
assert.equal(directed.durationMs, 10_000)

const hostile = compileLightTableCoreTimeline({ mode: "nonsense", durationMs: Number.NaN }, Number.NaN, { tableSpread: Number.NaN, overlap: Number.POSITIVE_INFINITY })
assert.equal(hostile.mode, "automatic")
assert.equal(hostile.issues[0].code, "invalid-timeline-mode")
assert(Number.isFinite(hostile.durationMs))
for (const time of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -2.75, 4.125, undefined]) {
    const result = evaluateLightTableCore(authority().compiled, time, lightTableCoreFixture("ordinary-six"), { canvasRatio: 16 / 9 })
    assert(allFinite(result), `non-finite story time must not leak NaN: ${String(time)}`)
}

const videos = Array.from({ length: 10 }, (_, index) => ({ id: `video-${index}`, type: "video", url: `reel-media://video-${index}` }))
const posters = new Map()
let rounds = 0
while (rounds < 10) {
    const owners = selectLightTableVideoOwnerIds(videos, "video-7", "frame-1", posters, new Set(), new Set())
    assert(owners.length <= LIGHT_TABLE_MAX_VIDEO_OWNERS)
    if (owners.length === 0) break
    owners.forEach((id) => posters.set(id, { source: videos.find((item) => item.id === id).url, targetKey: "frame-1", url: `blob:${id}` }))
    rounds += 1
}
assert.equal(posters.size, 10)
assert.equal(LIGHT_TABLE_POSTER_MAX_EDGE, 1_600)
assert.equal(LIGHT_TABLE_POSTER_MAX_BYTES, 4 * 1024 * 1024)
assert.deepEqual(selectLightTableVideoOwnerIds(videos, null, "frame-1", posters, new Set(), new Set()), [])
assert.equal(matchingLightTablePoster(posters.get("video-0"), videos[0].url, "frame-2"), undefined, "stale story-time posters must never render as current")
assert.equal(retainedLightTablePoster(posters.get("video-0"), videos[0].url)?.url, "blob:video-0", "the last source-matched poster must remain visible while a new exact target is pending")
assert.equal(matchingLightTablePoster(posters.get("video-0"), "reel-media://replacement", "frame-1"), undefined, "replaced-source posters must never render")
assert.equal(retainedLightTablePoster(posters.get("video-0"), "reel-media://replacement"), undefined, "a retained poster must never cross source identity")
assert.equal(shouldReplaceLightTablePoster({ source: videos[0].url, targetKey: "frame-2", url: "blob:new", sequence: 4 }, { source: videos[0].url, targetKey: "frame-1", url: "blob:stale", sequence: 3 }), false, "late poster encodes must not replace newer source frames")
assert.equal(shouldReplaceLightTablePoster(posters.get("video-0"), { source: "reel-media://replacement", targetKey: "frame-1", url: "blob:replacement", sequence: 1 }), true, "a source replacement owns a fresh poster sequence")
const replacement = videos.map((item) => item.id === "video-3" ? { ...item, url: "reel-media://replacement" } : item)
assert.deepEqual(selectLightTableVideoOwnerIds(replacement, "video-3", "frame-1", posters, new Set(), new Set())[0], "video-3")
const retainedOwners = new Set(["video-0", "video-1"])
assert.deepEqual(selectLightTableVideoOwnerIds(videos, "video-7", "frame-2", posters, new Set(), new Set(), retainedOwners), ["video-0", "video-1"], "target and focus churn must not unmount active decoder owners")
const oneCurrent = new Map(posters)
oneCurrent.set("video-0", { source: videos[0].url, targetKey: "frame-2", url: "blob:video-0-current" })
assert.deepEqual(selectLightTableVideoOwnerIds(videos, "video-7", "frame-2", oneCurrent, new Set(), new Set(), retainedOwners), ["video-1", "video-7"], "a confirmed owner must release its decoder slot to the focused pending source")

const targets = createLightTableVideoTargetCoordinator()
const targetA = targets.request({ key: "clamp:0", timeMs: 0, loop: false })
assert.equal(targetA?.sequence, 1)
assert.equal(targets.request({ key: "clamp:20000", timeMs: 20, loop: false }), null)
assert.equal(targets.request({ key: "clamp:720000", timeMs: 720, loop: false }), null)
assert.equal(targets.snapshot().inFlight?.key, "clamp:0", "moving time must not cancel an exact seek already in flight")
assert.equal(targets.snapshot().desired?.key, "clamp:720000", "target churn must retain only the latest desired target")
assert.deepEqual(targets.settle(999, "captured"), { accepted: false, settled: null, next: null }, "an archived stale callback cannot settle a newer request")
const afterA = targets.settle(targetA.sequence, "captured")
assert.equal(afterA.accepted, true)
assert.equal(afterA.next?.key, "clamp:720000", "completion must converge directly to the latest target")
assert.equal(afterA.next?.sequence, 2)
targets.request({ key: "clamp:1000000", timeMs: 1_000, loop: false })
targets.reset()
assert.deepEqual(targets.settle(afterA.next.sequence, "captured"), { accepted: false, settled: null, next: null }, "source replacement must invalidate archived callbacks")
const replacementTarget = targets.request({ key: "clamp:1000000", timeMs: 1_000, loop: false })
assert.equal(replacementTarget?.sequence, 3, "source reset must preserve monotonic callback identity")
assert.equal(targets.settle(replacementTarget.sequence, "unavailable").accepted, true)
assert.equal(targets.request({ key: "clamp:1000000", timeMs: 1_000, loop: false }), null, "a failed current target must not spin")
const laterTarget = targets.request({ key: "clamp:1040000", timeMs: 1_040, loop: false })
assert.equal(laterTarget?.sequence, 4, "a later target may proceed after a bounded failure")
assert.equal(targets.request({ key: "clamp:1000000", timeMs: 1_000, loop: false }), null, "returning while another request is in flight must queue the latest target")
const retriedTarget = targets.settle(laterTarget.sequence, "captured").next
assert.equal(retriedTarget?.key, "clamp:1000000", "moving away must permit a later retry of a formerly unavailable target")
assert.equal(retriedTarget?.sequence, 5)
assert.equal(targets.settle(retriedTarget.sequence, "captured").accepted, true)
const deferredTarget = targets.request({ key: "clamp:1040000", timeMs: 1_040, loop: false })
assert.equal(deferredTarget?.sequence, 6)
assert.equal(targets.defer(deferredTarget.sequence), true)
assert.equal(targets.resume()?.sequence, 7, "metadata deferral must resume without losing the desired target")
assert.equal(createLightTableVideoTargetCoordinator(8).request({ key: "clamp:2000000", timeMs: 2_000, loop: false })?.sequence, 9, "decoder remounts must continue after the retained poster sequence")

const stalePresentation = createLightTableVideoTargetCoordinator()
const timedOut = stalePresentation.request({ key: "clamp:20000", timeMs: 20, loop: false })
stalePresentation.reset()
const currentPresentation = stalePresentation.request({ key: "clamp:720000", timeMs: 720, loop: false })
assert.equal(stalePresentation.settle(timedOut.sequence, "unavailable").accepted, false, "an archived timeout must not fail the current request")
assert.equal(stalePresentation.settle(timedOut.sequence, "captured").accepted, false, "an archived frame callback must not publish into the current request")
assert.equal(stalePresentation.snapshot().inFlight?.sequence, currentPresentation.sequence)
assert.equal(stalePresentation.settle(currentPresentation.sequence, "captured").accepted, true)

const timeoutRace = createLightTableVideoTargetCoordinator()
const staleFrame = timeoutRace.request({ key: "clamp:20000", timeMs: 20, loop: false })
timeoutRace.request({ key: "clamp:720000", timeMs: 720, loop: false })
const afterTimeout = timeoutRace.settle(staleFrame.sequence, "unavailable")
assert.equal(afterTimeout.next?.key, "clamp:720000")
assert.equal(timeoutRace.settle(staleFrame.sequence, "captured").accepted, false, "a callback delivered after its timeout must not disturb the next target")
assert.equal(timeoutRace.snapshot().inFlight?.sequence, afterTimeout.next.sequence)

const encodeGate = createLightTablePosterEncodeGate(2)
const started = []
const releases = []
for (const ownerId of ["a", "b", "c", "d"]) {
    encodeGate.schedule(ownerId, (release) => {
        started.push(ownerId)
        releases.push(release)
    })
}
assert.deepEqual(started, ["a", "b"])
assert.deepEqual(encodeGate.snapshot(), { active: 2, queued: 2, maximumObserved: 2, limit: 2, disposed: false })
const staleToken = encodeGate.schedule("c", () => started.push("stale-c"))
const latestToken = encodeGate.schedule("c", (release) => {
    started.push("latest-c")
    releases.push(release)
})
assert.notEqual(staleToken, latestToken)
releases.shift()()
assert.equal(started.includes("stale-c"), false, "queued work must collapse to latest target per owner")
assert.equal(started.includes("latest-c"), true)
while (releases.length) releases.shift()()
assert(encodeGate.snapshot().maximumObserved <= 2)
assert.equal(encodeGate.snapshot().active, 0)
assert.equal(encodeGate.snapshot().queued, 0)
encodeGate.dispose()

const vite = await createServer({
    root: fileURLToPath(new URL("../", import.meta.url)),
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
})
try {
    const { default: LightTableRenderer } = await vite.ssrLoadModule("/src/scenes/LightTableRenderer.tsx")
    const markup = renderToStaticMarkup(React.createElement(LightTableRenderer, {
        config: config(),
        timeMs: productTimeline().durationMs * 0.5,
        fps: 30,
        reducedMotion: false,
    }))
    const underlightLayer = markup.indexOf('data-light-table-layer="underlights"')
    const firstArtwork = markup.indexOf('data-light-table-layer="artwork"')
    const underlights = [...markup.matchAll(/data-underlight-for=/g)]
    const artworks = [...markup.matchAll(/data-light-table-layer="artwork"/g)]
    assert(underlightLayer >= 0 && firstArtwork > underlightLayer)
    assert.equal(underlights.length, 6)
    assert.equal(artworks.length, 6)
    assert(underlights.every((match) => match.index < firstArtwork), "every under-light must be outside and before every artwork stacking context")
    assert.match(markup, /data-light-table-layer="underlights"[^>]*style="z-index:0"/)
    const artworkMarkup = markup.slice(firstArtwork)
    const artworkLayers = [...artworkMarkup.matchAll(/data-light-table-layer="artwork"[\s\S]*?style="([^"]*z-index:([^;\"]+)[^"]*)"/g)]
    assert.equal(artworkLayers.length, 6)
    assert(artworkLayers.every((match) => Number(match[2]) > LIGHT_TABLE_UNDERLIGHT_LAYER_Z))
    assert.equal((markup.match(/role="button"/g) ?? []).length, 6)
    assert.equal((markup.match(/tabindex="0"/g) ?? []).length, 1)
    assert.equal((markup.match(/tabindex="-1"/g) ?? []).length, 5)
    assert.match(markup, /data-underlight-placement="table-layer-below-all-artwork"/)
    assert.match(markup, /data-light-table-interactive="true"/)
    assert.match(markup, /data-evaluator-hash="[a-f0-9]{8}"/)
} finally {
    await vite.close()
}
const rendererSource = fs.readFileSync(new URL("../src/scenes/LightTableRenderer.tsx", import.meta.url), "utf8")
assert.match(rendererSource, /retainedLightTablePoster\(posters\.get\(plane\.id\), source\)/)
assert.match(rendererSource, /createLightTableVideoTargetCoordinator\(poster\?\.sequence \?\? 0\)/)
assert.match(rendererSource, /onUnavailable=\{\(unavailableTargetKey\) =>/)
assert.match(rendererSource, /visibility: "hidden"/)
assert.match(rendererSource, /currentVideoSourcesRef\.current\.get\(id\) !== poster\.source/)
assert.match(rendererSource, /if \(previous\) queuePosterRetirement\(previous\.url\)/)
assert.match(rendererSource, /querySelectorAll<HTMLImageElement>\('img\[data-story-poster="true"\]'\)/)
assert.doesNotMatch(rendererSource, /capture\(video, request, epoch, target\)(?!,)/, "no timeout or compatibility path may publish a frame without rVFC mediaTime")
assert.doesNotMatch(rendererSource, /video\.play\(/, "poster capture must never advance the source decoder")

assert.deepEqual([...covered].sort(), [...VECTOR_IDS].sort(), "every pinned TEST_VECTORS.json case must receive a causal replay")
console.log(JSON.stringify({ scene: "light-table", authoritySha256: PINNED_CORE_AUTHORITY_SHA256, implementationSha256: PINNED_CORE_IMPLEMENTATION_SHA256, vectors: VECTOR_IDS.length, videoOwnerMaximum: LIGHT_TABLE_MAX_VIDEO_OWNERS, status: "pass" }))
