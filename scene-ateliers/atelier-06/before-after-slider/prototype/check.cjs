"use strict"
const assert = require("node:assert/strict")
const Core = require("./scene-core.js")

let checks = 0
function test(name, fn) {
  try { fn(); checks += 1 }
  catch (error) { error.message = `${name}: ${error.message}`; throw error }
}
function allFinite(value) {
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(allFinite)
  if (value && typeof value === "object") return Object.values(value).every(allFinite)
  return true
}
function approx(actual, expected, epsilon = 1e-9) { assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`) }

const sources = Core.fixture("aligned-pair")
const automatic = Core.compileTimeline({ mode: "automatic" }, {})
const evaluate = (time, options = {}) => Core.evaluate(automatic, time, sources, options)

test("automatic story remains the diagnosed 5.2 seconds", () => assert.equal(automatic.durationMs, 5_200))
test("segment timeline is positive, contiguous, and complete", () => {
  let cursor = 0
  for (const segment of automatic.segments) {
    assert.equal(segment.startMs, cursor)
    assert.ok(segment.durationMs >= segment.min)
    assert.ok(segment.end > segment.start)
    cursor = segment.endMs
  }
  assert.equal(cursor, automatic.durationMs)
  assert.equal(automatic.segments.at(-1).end, 1)
})
test("loop seam returns to the authored initial split", () => {
  assert.deepEqual([evaluate(0).split, evaluate(1).split], [0.18, 0.18])
  assert.deepEqual([evaluate(0).velocity, evaluate(1).velocity], [0, 0])
})
test("turnaround endpoints hit exact bounds at zero velocity", () => {
  const toMax = automatic.segments.find((segment) => segment.id === "sweep-to-max")
  const toMin = automatic.segments.find((segment) => segment.id === "sweep-to-min")
  approx(evaluate(toMax.end).split, 0.88)
  approx(evaluate(toMax.end).velocity, 0)
  approx(evaluate(toMin.end).split, 0.12)
  approx(evaluate(toMin.end).velocity, 0)
})
test("every boundary is continuous from both sides", () => {
  const epsilon = 1e-8
  for (const segment of automatic.segments.slice(0, -1)) {
    const left = evaluate(Math.max(0, segment.end - epsilon))
    const exact = evaluate(segment.end)
    const right = evaluate(Math.min(1, segment.end + epsilon))
    assert.ok(Math.abs(left.split - exact.split) < 1e-6, segment.id)
    assert.ok(Math.abs(right.split - exact.split) < 1e-6, segment.id)
    assert.ok(Math.abs(exact.velocity) < 1e-7, segment.id)
  }
})
test("zero sources fail without a comparison", () => assert.equal(Core.evaluate(automatic, 0.5, Core.fixture("zero")).code, "minimum-items"))
test("one source produces an explicit missing-pair state without duplication", () => {
  const result = Core.evaluate(automatic, 0.5, Core.fixture("one"))
  assert.deepEqual([result.apply, result.duplicates, result.side.after], ["missing-pair", 0, null])
})
test("exactly two sources are consumed and extras remain ordered", () => {
  const result = Core.evaluate(automatic, 0.5, Core.fixture("extra-four"))
  assert.deepEqual(result.consumedIds, ["before-source", "after-source"])
  assert.deepEqual(result.preservedExtraIds, ["extra-source-03", "extra-source-04"])
})
test("failed sides keep their side identity and never expose the other label", () => {
  const before = Core.evaluate(automatic, 0.5, Core.fixture("failed-before"))
  const after = Core.evaluate(automatic, 0.5, Core.fixture("failed-after"))
  assert.deepEqual([before.panes.before.side, before.panes.before.failed, before.panes.after.side], ["before", true, "after"])
  assert.deepEqual([after.panes.after.side, after.panes.after.failed, after.panes.before.side], ["after", true, "before"])
})
test("both panes share one exact content rect across dimensions and ratios", () => {
  for (const fixture of ["different-dimensions", "different-ratios", "alpha-edge", "video-pair"]) {
    const result = Core.evaluate(automatic, 0.5, Core.fixture(fixture))
    assert.deepEqual(result.contentRect, { x: 0, y: 0, width: 1, height: 1 })
    assert.deepEqual(result.panes.before.media, { opacity: 1, filter: "none", blend: "normal" })
    assert.deepEqual(result.panes.after.media, { opacity: 1, filter: "none", blend: "normal" })
  }
})
test("invalid fit falls back to contain rather than inventing a crop mode", () => assert.equal(evaluate(0.5, { fit: "warp" }).fit, "contain"))
test("null manual state remains automatic rather than coercing to zero", () => {
  assert.equal(Core.evaluate(automatic, 0.21, sources, { manualSplit: null }).phase, evaluate(0.21).phase)
})
test("manual split and automatic split use the same evaluator output", () => {
  const auto = evaluate(0.21)
  const manual = evaluate(0.75, { manualSplit: auto.split })
  approx(manual.split, auto.split)
  assert.equal(manual.velocity, 0)
  assert.equal(manual.phase, "manual")
})
test("manual split is clamped to the authored range", () => {
  assert.equal(evaluate(0.5, { manualSplit: -10 }).split, 0.12)
  assert.equal(evaluate(0.5, { manualSplit: 10 }).split, 0.88)
})
test("reduced motion holds one static authored split", () => {
  assert.equal(evaluate(0.1, { reducedMotion: true }).split, 0.18)
  assert.equal(evaluate(0.9, { reducedMotion: true }).split, 0.18)
})
test("fixed duration below the floor clamps with an explicit issue", () => {
  const timeline = Core.compileTimeline({ mode: "fixed-duration", durationMs: 1_000 }, {})
  assert.equal(timeline.durationMs, timeline.minimumDurationMs)
  assert.equal(timeline.issues[0].code, "duration-below-readable-minimum")
})
test("high hold controls cannot create sub-minimum or negative fixed segments", () => {
  const timeline = Core.compileTimeline({ mode: "fixed-duration", durationMs: 3_600 }, { turnaroundHoldMs: 2_400 })
  assert.equal(timeline.durationMs, 3_600)
  assert.equal(timeline.issues[0].code, "fixed-duration-compression")
  for (const segment of timeline.segments) assert.ok(segment.durationMs >= segment.min && segment.durationMs > 0, segment.id)
})
test("directed rhythm accelerates opening and finale while preserving the middle sweep", () => {
  const directed = Core.compileTimeline({ mode: "directed" }, {})
  const opening = directed.segments.find((segment) => segment.id === "sweep-to-max")
  const middle = directed.segments.find((segment) => segment.id === "sweep-to-min")
  const finale = directed.segments.find((segment) => segment.id === "return-to-initial")
  assert.equal(opening.requestedPaceScale, 2)
  assert.equal(middle.requestedPaceScale, 1)
  assert.equal(finale.requestedPaceScale, 2)
  assert.ok(opening.durationMs < automatic.segments.find((segment) => segment.id === "sweep-to-max").durationMs)
})
test("reverse playback retraces the same split path with opposite velocity", () => {
  for (const time of [0.03, 0.17, 0.41, 0.63, 0.87]) {
    const reverse = Core.evaluate(automatic, time, sources, { direction: "reverse" })
    const forward = Core.evaluate(automatic, 1 - time, sources)
    approx(reverse.split, forward.split, 1e-9)
    approx(reverse.velocity, -forward.velocity, 1e-8)
  }
})
test("control normalization sorts hostile ranges and stays finite", () => {
  const controls = Core.normalizeControls({ initialSplit: NaN, sweepRange: { min: Infinity, max: -Infinity }, sweepDurationMs: NaN, turnaroundHoldMs: undefined })
  assert.ok(allFinite(controls))
  assert.ok(controls.sweepRange.max - controls.sweepRange.min >= 0.10)
  assert.ok(controls.initialSplit >= controls.sweepRange.min && controls.initialSplit <= controls.sweepRange.max)
})
test("invalid mode and duration compile to explicit finite fallbacks", () => {
  const timeline = Core.compileTimeline({ mode: "nonsense", durationMs: NaN }, { sweepDurationMs: NaN })
  assert.equal(timeline.mode, "automatic")
  assert.equal(timeline.issues[0].code, "invalid-timeline-mode")
  assert.ok(allFinite(timeline))
})
test("non-finite and wrapped story times never leak NaN", () => {
  for (const time of [NaN, Infinity, -Infinity, -2.75, 4.125, undefined]) assert.ok(allFinite(evaluate(time)), String(time))
})
test("source arrays remain byte-for-byte unchanged", () => {
  const input = Core.fixture("alpha-edge")
  const before = JSON.stringify(input)
  Core.evaluate(automatic, 0.5, input)
  assert.equal(JSON.stringify(input), before)
})
test("independent canonical passes match across fresh fixtures", () => {
  const times = [0, 0.04, 0.08, 0.21, 0.34, 0.40, 0.46, 0.59, 0.72, 0.78, 0.84, 0.92, 1]
  const first = times.map((time) => Core.stableStringify(Core.evaluate(automatic, time, sources)))
  const second = times.map((time) => Core.stableStringify(Core.evaluate(automatic, time, Core.fixture("aligned-pair"))))
  assert.deepEqual(second, first)
})

console.log(JSON.stringify({ scene: "before-after-slider", checks, status: "pass", durationMs: automatic.durationMs, minimumDurationMs: automatic.minimumDurationMs, seam: "exact" }, null, 2))
