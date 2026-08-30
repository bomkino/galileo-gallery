import assert from "node:assert/strict"
import { DEFAULT_SETTINGS } from "../src/defaults.ts"
import {
    automaticLightTableDuration,
    compileLightTableTimeline,
    evaluateLightTable,
    lightTableScene,
    lightTableSourceTimeSeconds,
    minimumLightTableDuration,
    validateLightTableParameters,
    LIGHT_TABLE_MAX_DURATION_MS,
    LIGHT_TABLE_TRANSPARENCY_REASON,
} from "../src/scenes/lightTable.ts"
import {
    assertLightTableOpaqueIntent,
    lightTableParametersFromConfig,
    resolvedLightTableRatio,
    validateLightTableRuntimeConfig,
    withLightTableDefaults,
} from "../src/lightTableConfig.ts"

const fixtureRatios = [16 / 9, 4 / 5, 1, 9 / 16, 2.4, 0.5]
const canonicalTimes = [0, 0.0625, 0.1, 0.1875, 0.25, 0.375, 0.5, 0.625, 0.75, 0.78, 0.85, 0.92, 0.96875, 1]

function items(count, ratios = fixtureRatios) {
    return Array.from({ length: count }, (_, index) => ({ id: `light-source-${String(index + 1).padStart(2, "0")}`, ratio: ratios[index % ratios.length] }))
}

function media(count) {
    return items(count).map((item, index) => ({
        ...item,
        name: `Source ${index + 1}`,
        type: index === 1 ? "video" : "image",
        url: `reel-media://source-${index + 1}`,
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
    return {
        ...base,
        ...patch,
        settings: { ...base.settings, ...(patch.settings ?? {}) },
    }
}

function timeline(count = 6, patch = {}) {
    return compileLightTableTimeline({
        mode: "automatic",
        direction: "forward",
        mediaCount: count,
        fixedDurationMs: 0,
        segments: [],
        fps: 30,
        ...patch,
    })
}

function parameters(patch = {}) {
    return { ...lightTableScene.defaults(), ...patch }
}

function evaluate(count = 6, patch = {}) {
    const compiled = patch.timeline ?? timeline(count)
    return evaluateLightTable({
        items: patch.items ?? items(count),
        parameters: parameters(patch.parameters),
        timeline: compiled,
        timeMs: patch.timeMs ?? compiled.durationMs * 0.5,
        stageWidth: patch.stageWidth ?? 1600,
        stageHeight: patch.stageHeight ?? 900,
        reducedMotion: patch.reducedMotion,
        manualFocusIndex: patch.manualFocusIndex,
    })
}

function geometricFrame(frame) {
    return {
        phase: frame.phase,
        segmentId: frame.segmentId,
        topology: frame.topology,
        focusId: frame.focusId,
        render: frame.render,
        layout: frame.layout,
        planes: frame.planes.map(({ sourceTimeMs: _sourceTimeMs, ...plane }) => plane),
    }
}

function planeGeometry(frame) {
    return frame.planes.map(({ id, sourceIndex, x, y, width, height, rotation, scale, z, focusWeight, underlightOpacity, underlightExpansion, failed }) => ({ id, sourceIndex, x, y, width, height, rotation, scale, z, focusWeight, underlightOpacity, underlightExpansion, failed }))
}

assert.equal(lightTableScene.definition.id, "light-table")
assert.equal(lightTableScene.definition.version, 2)
assert.equal(lightTableScene.controls.length, 5)
assert.deepEqual(lightTableScene.controls.map((control) => control.id), ["table-spread", "overlap", "underlight-strength", "focus-behaviour", "nudge-restraint"])
assert.deepEqual(lightTableScene.controls.map((control) => control.owner), ["Scene", "Scene", "Look", "Scene", "Scene"])
assert.deepEqual(lightTableScene.controls.map((control) => control.resetValue), [0.72, 0.1, 0.42, "route", 0.28])

assert.equal(automaticLightTableDuration(1), 8_000)
assert.equal(automaticLightTableDuration(6), 10_000)
assert.equal(automaticLightTableDuration(24), 18_000)
assert.equal(minimumLightTableDuration(1), 6_000)
assert.equal(minimumLightTableDuration(6), 6_000)
assert.equal(minimumLightTableDuration(24), 17_520)
const automatic = timeline(6)
assert.equal(automatic.durationMs, 10_000)
assert.equal(automatic.frameCount, 300)
assert.deepEqual(automatic.phases.map((phase) => [phase.id, phase.startMs, phase.endMs]), [
    ["wake", 0, 1_000],
    ["review", 1_000, 7_800],
    ["final-inspection", 7_800, 9_200],
    ["return", 9_200, 10_000],
])
assert.equal(automatic.issues.length, 0)

const fixedShort = timeline(6, { mode: "fixed-duration", fixedDurationMs: 4_000 })
assert.equal(fixedShort.durationMs, 6_000)
assert.deepEqual(fixedShort.issues, [{ code: "duration-below-readable-minimum", requestedMs: 4_000, appliedMs: 6_000 }])
const fixedLong = timeline(6, { mode: "fixed-duration", fixedDurationMs: 90_000 })
assert.equal(fixedLong.durationMs, LIGHT_TABLE_MAX_DURATION_MS)
assert.deepEqual(fixedLong.issues, [{ code: "duration-above-supported-maximum", requestedMs: 90_000, appliedMs: LIGHT_TABLE_MAX_DURATION_MS }])
const fixedExact = timeline(6, { mode: "fixed-duration", fixedDurationMs: 12_345 })
assert.equal(fixedExact.durationMs, 12_345)
assert.equal(fixedExact.frameCount, 371)
const directed = timeline(6, { mode: "directed" })
assert.equal(directed.durationMs, 9_100)
assert.deepEqual(directed.phases.map((phase) => phase.requestedPaceScale), [2, 1, 1, 2])
assert.deepEqual(directed.phases.map((phase) => phase.achievedPaceScale), [2, 1, 1, 2])
const directedMany = timeline(24, { mode: "directed" })
assert.equal(directedMany.durationMs, 17_520)
assert.equal(directedMany.issues[0].code, "directed-readability-adjusted")
assert(directedMany.phases[0].achievedPaceScale < directedMany.phases[0].requestedPaceScale)

const first = evaluate(6, { timeMs: 0 })
const repeated = evaluate(6, { timeMs: 0 })
assert.deepEqual(first, repeated, "equal input must produce byte-equal semantic state")
const seam = evaluate(6, { timeMs: automatic.durationMs })
assert.deepEqual(geometricFrame(first), geometricFrame(seam), "loop seam geometry, focus, light, and depth must close exactly")
assert.equal(first.planes[0].sourceTimeMs, 0)
assert.equal(seam.planes[0].sourceTimeMs, automatic.durationMs, "Scene must preserve Project source time instead of inventing a media clock")

const forward = timeline(6)
const reverse = timeline(6, { direction: "reverse" })
for (const sample of [0.125, 0.375, 0.625, 0.875]) {
    const forwardFrame = evaluate(6, { timeline: forward, timeMs: forward.durationMs * sample })
    const reverseFrame = evaluate(6, { timeline: reverse, timeMs: reverse.durationMs * (1 - sample) })
    assert.deepEqual(planeGeometry(forwardFrame), planeGeometry(reverseFrame), `reverse must sample forward geometry at 1-t (${sample})`)
    assert.equal(forwardFrame.focusId, reverseFrame.focusId)
}

const empty = evaluateLightTable({ items: [], parameters: parameters(), timeline: automatic, timeMs: 0, stageWidth: 1600, stageHeight: 900 })
assert.equal(empty.topology, "empty-table")
assert.equal(empty.segmentId, "empty")
assert.equal(empty.focusId, null)
assert.deepEqual(empty.planes, [])
assert.deepEqual(empty.layout, { maximumOcclusion: 0, intersectionCount: 0, outOfBoundsCount: 0 })
assert.equal(empty.render.opaque, true)
assert.throws(() => evaluate(25, { timeline: timeline(24) }), /up to 24 sources/)
assert.equal(evaluate(1).topology, "single-inspection")
assert.equal(evaluate(2).topology, "bilateral")
assert.equal(evaluate(5).topology, "open-bay")
assert.equal(evaluate(6).topology, "ordinary-six")
assert.equal(evaluate(7).topology, "bounded-review-grid")
assert.equal(evaluate(24).topology, "bounded-review-grid")
for (const count of [1, 2, 3, 4, 5, 6, 7, 12, 24]) {
    const frame = evaluate(count)
    assert.equal(frame.planes.length, count)
    assert.deepEqual(frame.planes.map((plane) => plane.id), items(count).map((item) => item.id))
    assert.equal(new Set(frame.planes.map((plane) => plane.id)).size, count)
}

const stressRatios = [0.05, 0.2, 0.5, 9 / 16, 4 / 5, 1, 1.25, 16 / 9, 2.4, 5, 20]
for (const [stageWidth, stageHeight] of [[1600, 900], [900, 1600], [1000, 1000], [800, 1000], [64, 3840], [3840, 64]]) {
    for (const count of [1, 2, 5, 6, 7, 12, 24]) {
        const compiled = timeline(count)
        for (const sample of canonicalTimes) {
            const frame = evaluate(count, {
                timeline: compiled,
                items: items(count, stressRatios),
                parameters: { tableSpread: 0.52, overlap: 0.22, nudgeRestraint: 0.6 },
                timeMs: compiled.durationMs * sample,
                stageWidth,
                stageHeight,
            })
            assert.equal(frame.layout.outOfBoundsCount, 0, `${stageWidth}×${stageHeight}, ${count} sources must stay on canvas`)
            assert(frame.layout.maximumOcclusion <= 0.22, `${stageWidth}×${stageHeight}, ${count} sources exceeded occlusion bound: ${frame.layout.maximumOcclusion}`)
        }
    }
}

const compact = evaluate(6, { parameters: { tableSpread: 0.52, nudgeRestraint: 0 }, timeMs: 0 })
const broad = evaluate(6, { parameters: { tableSpread: 0.92, nudgeRestraint: 0 }, timeMs: 0 })
assert.deepEqual(compact.planes.map(({ width, height }) => ({ width, height })), broad.planes.map(({ width, height }) => ({ width, height })), "Table spread must not resize or crop frames")
assert(Math.abs(broad.planes[0].x - 800) > Math.abs(compact.planes[0].x - 800), "Table spread must move slots away from centre")
const separate = evaluate(6, { parameters: { overlap: 0, nudgeRestraint: 0 }, timeMs: 0 })
const overlapping = evaluate(6, { parameters: { overlap: 0.22, nudgeRestraint: 0 }, timeMs: 0 })
assert.deepEqual(separate.planes.map(({ width, height }) => ({ width, height })), overlapping.planes.map(({ width, height }) => ({ width, height })), "Overlap must not resize or crop frames")
assert(Math.abs(overlapping.planes[0].x - 800) < Math.abs(separate.planes[0].x - 800), "Overlap must move stable slots toward their shared centre")
assert(overlapping.layout.maximumOcclusion > separate.layout.maximumOcclusion, "Overlap must produce bounded, visible plane overlap")
assert(overlapping.layout.maximumOcclusion <= 0.22)

const darkUnderlight = evaluate(6, { parameters: { underlightStrength: 0 }, timeMs: 5_000 })
const brightUnderlight = evaluate(6, { parameters: { underlightStrength: 0.7 }, timeMs: 5_000 })
for (let index = 0; index < darkUnderlight.planes.length; index += 1) {
    const { underlightOpacity: dark, ...darkPlane } = darkUnderlight.planes[index]
    const { underlightOpacity: bright, ...brightPlane } = brightUnderlight.planes[index]
    assert.equal(dark, 0)
    assert(bright > dark)
    assert.deepEqual(darkPlane, brightPlane, "Under-light control must affect exterior light only")
}
const stillNudge = evaluate(6, { parameters: { nudgeRestraint: 0 }, timeMs: 2_500 })
const movingNudge = evaluate(6, { parameters: { nudgeRestraint: 0.6 }, timeMs: 2_500 })
assert(stillNudge.planes.some((plane, index) => plane.x !== movingNudge.planes[index].x || plane.y !== movingNudge.planes[index].y || plane.rotation !== movingNudge.planes[index].rotation))
assert.deepEqual(stillNudge.planes.map(({ width, height }) => ({ width, height })), movingNudge.planes.map(({ width, height }) => ({ width, height })))

const route = evaluate(6, { parameters: { focusBehavior: "route" }, timeMs: 5_000 })
const noFocus = evaluate(6, { parameters: { focusBehavior: "none" }, timeMs: 5_000 })
const loupeReview = evaluate(6, { parameters: { focusBehavior: "loupe-only" }, timeMs: 5_000 })
const loupeFinal = evaluate(6, { parameters: { focusBehavior: "loupe-only" }, timeMs: 8_500 })
assert(route.focusId)
assert.equal(noFocus.focusId, null)
assert.equal(loupeReview.focusId, null)
assert.equal(loupeFinal.focusId, items(6)[5].id)
assert.equal(route.planes.filter((plane) => plane.focusWeight > 0).length, 1, "Only one inspection frame may be active")
const manual = evaluate(6, { manualFocusIndex: 2, timeMs: 5_000 })
assert.equal(manual.focusId, items(6)[2].id)
assert.equal(manual.segmentId, "manual-inspection")

const failedSources = items(6).map((item, index) => index === 5 ? { ...item, failed: true } : item)
const failedFinal = evaluate(6, { items: failedSources, timeMs: 8_500 })
assert.equal(failedFinal.planes[5].failed, true)
assert.equal(failedFinal.planes[5].sourceIndex, 5)
assert.equal(failedFinal.focusId, items(6)[4].id, "Final inspection must skip failed source without replacing its slot")
const failedManual = evaluate(6, { items: failedSources, manualFocusIndex: 5, timeMs: 5_000 })
assert.equal(failedManual.focusId, null, "Manual inspection must not promote a failed source")

const reducedA = evaluate(6, { reducedMotion: true, timeMs: 1_500 })
const reducedB = evaluate(6, { reducedMotion: true, timeMs: 8_500 })
assert.equal(reducedA.phase, 0)
assert.equal(reducedA.velocity, 0)
assert.equal(reducedA.segmentId, "reduced-motion")
assert.deepEqual(planeGeometry(reducedA), planeGeometry(reducedB), "Reduced motion must remove drift and automatic focus transit")
assert.equal(reducedA.focusId, items(6)[0].id)

const luminance = canonicalTimes.map((sample) => evaluate(6, { timeMs: automatic.durationMs * sample }).render.tableLuminance)
assert(Math.max(...luminance) - Math.min(...luminance) < 8 / 255)
for (const sample of canonicalTimes) {
    const frame = evaluate(6, { timeMs: automatic.durationMs * sample })
    assert.equal(frame.render.opaque, true)
    assert.equal(frame.render.artworkOpacity, 1)
    assert.equal(frame.render.artworkFilter, "none")
    assert.equal(frame.render.artworkBlend, "normal")
    assert.equal(frame.render.underlightPlacement, "sibling-behind-frame")
    for (const plane of frame.planes) assert.deepEqual([plane.opacity, plane.filter, plane.blend], [1, "none", "normal"])
}

assert.equal(lightTableSourceTimeSeconds(2_500, 2, true), 0.5)
assert.equal(lightTableSourceTimeSeconds(2_500, 2, false), 2)
assert.equal(lightTableSourceTimeSeconds(Number.NaN, 2, true), 0)
assert.throws(() => assertLightTableOpaqueIntent("transparent"), (error) => error instanceof Error && error.message === LIGHT_TABLE_TRANSPARENCY_REASON)
assert.doesNotThrow(() => assertLightTableOpaqueIntent("solid"))
assert.throws(() => assertLightTableOpaqueIntent("bogus"), /background intent/)

const sourceConfig = config()
const untouched = structuredClone(sourceConfig)
const normalized = withLightTableDefaults(sourceConfig)
assert.deepEqual(sourceConfig, untouched, "Default reconciliation must not mutate prior Project state")
assert.deepEqual(lightTableParametersFromConfig(normalized), lightTableScene.defaults())
const validated = validateLightTableRuntimeConfig(sourceConfig)
assert.equal(validated.sources.length, 6)
assert.equal(validated.timeline.durationMs, 10_000)
assert.throws(() => validateLightTableRuntimeConfig(config(0)), /at least one source/)
assert.throws(() => validateLightTableRuntimeConfig(config(25)), /up to 24 sources/)
assert.throws(() => validateLightTableRuntimeConfig(config(6, { settings: { backgroundStyle: "transparent" } })), (error) => error instanceof Error && error.message === LIGHT_TABLE_TRANSPARENCY_REASON)
assert.throws(() => validateLightTableRuntimeConfig(config(6, { sceneVersion: 1 })), /identity/)
const duplicateConfig = config(2)
duplicateConfig.items[1].id = duplicateConfig.items[0].id
assert.throws(() => validateLightTableRuntimeConfig(duplicateConfig), /unique/)
const corruptCrop = config(1)
corruptCrop.items[0].crop = { x: 0.8, y: 0, width: 0.4, height: 1 }
assert.throws(() => validateLightTableRuntimeConfig(corruptCrop), /crop/)
const cropped = config(1)
cropped.items[0].ratio = 2
cropped.items[0].crop = { x: 0.25, y: 0, width: 0.5, height: 1 }
assert.equal(resolvedLightTableRatio(cropped.items[0], cropped.settings), 1)
const pathologicalRatio = config(1)
pathologicalRatio.items[0].aspectMode = "custom"
pathologicalRatio.items[0].ratioW = 10_000
pathologicalRatio.items[0].ratioH = 1
assert.throws(() => resolvedLightTableRatio(pathologicalRatio.items[0], pathologicalRatio.settings), /effective frame ratio/)

for (const invalid of [
    { tableSpread: 0.51 },
    { overlap: 0.221 },
    { underlightStrength: 0.701 },
    { focusBehavior: "pulse" },
    { nudgeRestraint: -0.01 },
    { fit: "fill" },
    { tableColor: "transparent" },
]) assert.throws(() => validateLightTableParameters(parameters(invalid)))
assert.throws(() => timeline(0), /between 1 and 24/)
assert.throws(() => timeline(25), /between 1 and 24/)
assert.throws(() => timeline(6, { fps: 0 }), /frame rate/)
assert.throws(() => timeline(6, { direction: "sideways" }), /direction/)
assert.throws(() => timeline(6, { mode: "directed", segments: [{ id: "wake", kind: "cycle", cycles: 1, paceScale: 2, durationMs: 0 }] }), /exactly four/)
assert.throws(() => evaluate(6, { manualFocusIndex: 6 }), /manual focus/)
assert.throws(() => evaluate(6, { stageWidth: 0 }), /stage dimensions/)
assert.throws(() => evaluate(6, { timeMs: -1 }), /story time/)
assert.throws(() => evaluate(2, { items: [{ id: "same", ratio: 1 }, { id: "same", ratio: 1 }] }), /unique/)

console.log("Verified: Light Table v2 pure Timeline/evaluator, count and ratio topology, bounded occlusion, five causal controls, clean artwork treatment, opaque-only policy, source-time preservation, reduced motion, and invalid-input rejection.")
