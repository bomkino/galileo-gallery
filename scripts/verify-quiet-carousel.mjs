import assert from "node:assert/strict"
import crypto from "node:crypto"
import { createRequire } from "node:module"
import {
    compileQuietTimeline,
    defaultCasinoTimeline,
    evaluateQuietCarousel,
    evaluateQuietTimeline,
    quietCarouselScene,
    sourceVideoTimeSeconds,
} from "../src/scenes/quietCarousel.ts"
import {
    createQuietCarouselProject,
    parseQuietCarouselBrowserProject,
    parseQuietCarouselHostProject,
    serializeQuietCarouselBrowserProject,
    timelineIntentForMode,
} from "../src/quietCarouselProject.ts"

const require = createRequire(import.meta.url)
const { canonicalProjectJSON, configFromPortableProject, portableProjectFromConfig } = require("../electron/project-schema.cjs")

// Promise: ordinary media reaches a finite, source-faithful Quiet Carousel immediately.
// Failure: default evaluation adds artwork treatment, loses a frame, or has infinite/unknown duration.
// Public seam: Quiet Carousel Scene module evaluate/compile contract.
// Cheapest loop: canonical eight-frame evaluation at literal times.
const config = createQuietCarouselProject()
const params = quietCarouselScene.defaults()
const automatic = compileQuietTimeline({
    mode: "automatic",
    axis: "horizontal",
    direction: "forward",
    mediaCount: config.items.length,
    paceMs: params.paceMs,
    fixedDurationMs: 0,
    segments: [],
    fps: 30,
})
assert.equal(automatic.durationMs, 6400)
assert.equal(automatic.frameCount, 192)
assert.equal(automatic.cycleCount, 1)
assert.equal(sourceVideoTimeSeconds(2250, 2, true), 0.25)
assert.equal(sourceVideoTimeSeconds(2250, 2, false), 2)
assert.equal(sourceVideoTimeSeconds(-100, 2, true), 0)

const evaluate = (items, timeline, timeMs, overrides = {}, stage = { width: 1600, height: 900 }) => evaluateQuietCarousel({
    items,
    parameters: { ...params, ...overrides },
    timeline,
    timeMs,
    stageWidth: stage.width,
    stageHeight: stage.height,
})

const initial = evaluate(config.items, automatic, 0)
assert.equal(initial.frames.length, 8)
assert.deepEqual(initial.render, {
    fit: "contain",
    background: { kind: "solid", color: "#11110f" },
    artworkOpacity: 1,
    artworkFilter: "none",
})
assert.deepEqual(quietCarouselScene.controls.map((descriptor) => descriptor.id), ["frame-size", "gap", "pace", "depth", "fit", "background"])
for (const descriptor of quietCarouselScene.controls.filter((candidate) => candidate.kind === "range")) {
    assert.equal(quietCarouselScene.defaults()[descriptor.parameter], descriptor.resetValue)
}
assert(initial.frames.every((frame, index) => frame.id === config.items[index].id))
for (const item of config.items) {
    const source = decodeURIComponent(item.url.slice(item.url.indexOf(",") + 1))
    const [, width, height] = source.match(/<svg[^>]+width="([0-9]+)" height="([0-9]+)"/) ?? []
    assert(width && height)
    assert(Math.abs(Number(width) / Number(height) - item.ratio) < 0.01, `${item.id} source ratio disagrees with metadata`)
}

// Promise: loop seam preserves position and velocity for 1, 2, ordinary, and awkward media counts.
// Failure: canonical end/start jumps or resource count grows with story time.
// Public seam: Quiet Carousel Scene module evaluate contract.
// Cheapest loop: paired boundary evaluations plus epsilon probes.
for (const count of [1, 2, 7, 8, 127]) {
    const items = config.items.length >= count
        ? config.items.slice(0, count)
        : Array.from({ length: count }, (_, index) => ({ id: `high-${index}`, ratio: 1 + (index % 5) * 0.2 }))
    const timeline = compileQuietTimeline({ mode: "automatic", axis: "horizontal", direction: "forward", mediaCount: count, paceMs: 800, fixedDurationMs: 0, segments: [], fps: 30 })
    const start = evaluate(items, timeline, 0)
    const end = evaluate(items, timeline, timeline.durationMs)
    assert.deepEqual(end, start, `${count} frames did not close exactly`)
    const before = evaluate(items, timeline, timeline.durationMs - 0.1)
    const after = evaluate(items, timeline, 0.1)
    assert.equal(before.frames.length, count)
    assert.equal(after.frames.length, count)
    for (let index = 0; index < count; index += 1) {
        assert(Math.abs(before.frames[index].x - after.frames[index].x) < 1, `${count}:${index} jumped at seam`)
        assert(Math.abs(before.frames[index].y - after.frames[index].y) < 1, `${count}:${index} jumped at seam`)
    }
    assert.equal(before.velocity, after.velocity)
}
const boundedItems = Array.from({ length: 256 }, (_, index) => ({ id: `bounded-${index}`, ratio: 1 + (index % 5) * 0.2 }))
const boundedTimeline = compileQuietTimeline({ mode: "automatic", axis: "horizontal", direction: "forward", mediaCount: boundedItems.length, paceMs: 800, fixedDurationMs: 0, segments: [], fps: 30 })
for (const timeMs of [0, boundedTimeline.durationMs * 0.25, boundedTimeline.durationMs * 0.5, boundedTimeline.durationMs * 0.75]) {
    assert(evaluate(boundedItems, boundedTimeline, timeMs).frames.filter((frame) => frame.visible).length <= 80)
}

// Promise: automatic, fixed, and directed casino rhythm compile to finite truthful durations.
// Failure: fixed duration drifts or fast×2 / regular×1 / fast×1 loses explicit identity.
// Public seam: Quiet Carousel Scene module compile contract.
// Cheapest loop: literal compiler examples.
const fixed = compileQuietTimeline({ mode: "fixed-duration", axis: "horizontal", direction: "forward", mediaCount: 8, paceMs: 800, fixedDurationMs: 12000, segments: [], fps: 30 })
assert.equal(fixed.durationMs, 12000)
assert.equal(fixed.frameCount, 360)
assert.equal(fixed.cycleCount, 2)

const directed = compileQuietTimeline({ mode: "directed", axis: "horizontal", direction: "forward", mediaCount: 8, paceMs: 800, fixedDurationMs: 0, segments: defaultCasinoTimeline(), fps: 30 })
assert.deepEqual(directed.segments.map(({ id, cycles, durationMs }) => ({ id, cycles, durationMs })), [
    { id: "fast-opening", cycles: 2, durationMs: 6400 },
    { id: "regular-middle", cycles: 1, durationMs: 6400 },
    { id: "fast-finale", cycles: 1, durationMs: 3200 },
])
assert.equal(directed.durationMs, 16000)
assert.equal(directed.cycleCount, 4)
assert.equal(directed.frameCount, 480)
assert.deepEqual(evaluateQuietTimeline(directed, 0), evaluateQuietTimeline(directed, directed.durationMs))

const quarter = evaluateQuietTimeline(automatic, 1600)
assert.equal(quarter.phase, 0.25)
assert.equal(quarter.velocity, 1 / 6400)
const reverse = compileQuietTimeline({ mode: "automatic", axis: "horizontal", direction: "reverse", mediaCount: 8, paceMs: 800, fixedDurationMs: 0, segments: [], fps: 30 })
assert.equal(evaluateQuietTimeline(reverse, 1600).phase, 0.75)
assert.equal(evaluateQuietTimeline(reverse, 1600).velocity, -1 / 6400)

// Promise: every exposed Scene control changes deterministic output and vertical/ratio changes recompose.
// Failure: enabled control becomes cosmetic or vertical stays a cropped horizontal world.
// Public seam: Quiet Carousel Scene module evaluate/compile contract.
// Cheapest loop: one canonical frame with one-variable changes.
const sampleTime = 2300
const base = evaluate(config.items, automatic, sampleTime)
const larger = evaluate(config.items, automatic, sampleTime, { frameSize: 70 })
assert.notEqual(larger.frames[0].height, base.frames[0].height)
const widerGap = evaluate(config.items, automatic, sampleTime, { gap: 200 })
assert.notEqual(widerGap.frames[0].x, base.frames[0].x)
const halfStage = evaluate(config.items, automatic, sampleTime, {}, { width: 800, height: 450 })
for (let index = 0; index < config.items.length; index += 1) {
    assert(Math.abs(halfStage.frames[index].x * 2 - base.frames[index].x) < 0.001)
    assert(Math.abs(halfStage.frames[index].y * 2 - base.frames[index].y) < 0.001)
}
const deeper = evaluate(config.items, automatic, sampleTime, { depth: 35 })
assert(deeper.frames.some((frame, index) => frame.scale !== base.frames[index].scale))
assert.equal(evaluate(config.items, automatic, sampleTime, { fit: "cover" }).render.fit, "cover")
assert.deepEqual(evaluate(config.items, automatic, sampleTime, { background: { kind: "transparent" } }).render.background, { kind: "transparent" })
assert.notEqual(compileQuietTimeline({ mode: "automatic", axis: "horizontal", direction: "forward", mediaCount: 8, paceMs: 1200, fixedDurationMs: 0, segments: [], fps: 30 }).durationMs, automatic.durationMs)

const verticalTimeline = compileQuietTimeline({ mode: "automatic", axis: "vertical", direction: "forward", mediaCount: 8, paceMs: 800, fixedDurationMs: 0, segments: [], fps: 30 })
const vertical = evaluate(config.items, verticalTimeline, sampleTime, {}, { width: 900, height: 1600 })
assert(base.frames.some((frame) => frame.x !== base.frames[0].x))
assert(vertical.frames.every((frame) => frame.x === 450))
assert(vertical.frames.some((frame) => frame.y !== vertical.frames[0].y))
assert.notDeepEqual(vertical.frames.map(({ width, height }) => [width, height]), base.frames.map(({ width, height }) => [width, height]))

// Promise: browser and portable Project round trips retain Scene and explicit Timeline intent without host URLs.
// Failure: directed mode/segments disappear, order changes, or data URLs enter portable truth.
// Public seam: browser Project adapter and G01B Project schema boundary.
// Cheapest loop: canonical serialize/parse plus portable conversion.
const directedConfig = { ...config, ...timelineIntentForMode("directed") }
const browserText = serializeQuietCarouselBrowserProject(directedConfig)
assert.deepEqual(parseQuietCarouselBrowserProject(browserText), directedConfig)
assert.throws(() => parseQuietCarouselBrowserProject(JSON.stringify({ ...JSON.parse(browserText), config: { ...directedConfig, items: [directedConfig.items[0], directedConfig.items[0]] } })), /unique/)
assert.throws(() => parseQuietCarouselBrowserProject(JSON.stringify({ ...JSON.parse(browserText), config: { ...directedConfig, settings: { ...directedConfig.settings, paceMs: -1 } } })), /pace/)
assert.throws(() => parseQuietCarouselBrowserProject(JSON.stringify({ ...JSON.parse(browserText), config: { ...directedConfig, items: [{ ...directedConfig.items[0], url: "https://example.com/tracker.png" }] } })), /invalid/)

const media = directedConfig.items.map((item, index) => {
    const sha256 = crypto.createHash("sha256").update(item.id).digest("hex")
    return { archivePath: `project/media/${String(index + 1).padStart(4, "0")}-${sha256.slice(0, 16)}.png`, bytes: 24 + index, sha256, signature: "png" }
})
const portable = portableProjectFromConfig(directedConfig, media)
assert.equal(portable.scene.id, "quiet-carousel")
assert.equal(portable.timeline.mode, "directed")
assert.deepEqual(portable.timeline.segments, defaultCasinoTimeline())
assert.equal(canonicalProjectJSON(portable).includes("data:image"), false)
const restored = configFromPortableProject(portable, directedConfig.items.map((item) => item.url))
assert.deepEqual(restored.timelineSegments, directedConfig.timelineSegments)
assert.equal(restored.timelineMode, "directed")
assert.deepEqual(restored.items.map((item) => item.id), directedConfig.items.map((item) => item.id))
const hostRestored = configFromPortableProject(portable, directedConfig.items.map((_item, index) => `reel-media://grant/${String(index + 1).padStart(64, "0")}`))
assert.deepEqual(parseQuietCarouselHostProject(hostRestored), hostRestored)
assert.throws(() => parseQuietCarouselHostProject({ ...hostRestored, items: [{ ...hostRestored.items[0], url: "reel-media://file/exposed" }] }), /invalid/)

console.log("Verified: G02 Quiet Carousel defaults, source boundary, seam continuity, axis/ratio recomposition, control causality, finite automatic/fixed/directed Timeline, bounded frame count, and browser/portable round trip.")
