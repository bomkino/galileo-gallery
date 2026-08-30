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
function independentMetrics(frames, canvasRatio) {
  const rectangles = frames.map((frame) => {
    const width = frame.width * frame.scale
    const height = width * canvasRatio / frame.ratio * frame.scale
    return { left: frame.x - width / 2, right: frame.x + width / 2, top: frame.y - height / 2, bottom: frame.y + height / 2, area: width * height }
  })
  let maximum = 0
  for (let i = 0; i < rectangles.length; i += 1) for (let j = i + 1; j < rectangles.length; j += 1) {
    const a = rectangles[i], b = rectangles[j]
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
    maximum = Math.max(maximum, width * height / Math.max(1e-9, Math.min(a.area, b.area)))
  }
  return {
    maximum,
    outOfBounds: rectangles.filter((r) => r.left < 0 || r.right > 1 || r.top < 0 || r.bottom > 1).length,
  }
}
function compile(fixture = "ordinary-six", controls = {}, intent = { mode: "automatic" }) {
  const sources = Core.fixture(fixture)
  return { sources, timeline: Core.compileTimeline(intent, sources.length || 1, controls) }
}

const ordinary = compile()
const start = Core.evaluate(ordinary.timeline, 0, ordinary.sources, { canvasRatio: 16 / 9 })
const end = Core.evaluate(ordinary.timeline, 1, ordinary.sources, { canvasRatio: 16 / 9 })

test("ordinary six uses the resolved 10-second default", () => assert.equal(ordinary.timeline.durationMs, 10_000))
test("loop seam preserves every frame pose", () => assert.deepEqual(end.frames, start.frames))
test("loop seam reports terminal story time without changing the sampled pose", () => assert.deepEqual([end.normalizedTime, end.phase], [1, "seam"]))
test("clean media contract remains exact", () => assert.deepEqual(start.frames.map((frame) => frame.media), Array(6).fill({ opacity: 1, filter: "none", blend: "normal" })))
test("automatic segments are positive, contiguous, and cover the full story", () => {
  let cursor = 0
  for (const segment of ordinary.timeline.segments) {
    assert.equal(segment.startMs, cursor)
    assert.ok(segment.durationMs > 0)
    assert.ok(segment.end > segment.start)
    cursor = segment.endMs
  }
  assert.equal(cursor, ordinary.timeline.durationMs)
  assert.equal(ordinary.timeline.segments.at(-1).end, 1)
})

for (const [id, count, layout] of [["one", 1, "single-inspection"], ["two", 2, "bilateral"], ["five", 5, "open-bay"], ["ordinary-six", 6, "ordinary"], ["many-12", 12, "bounded-review-grid"], ["many-24", 24, "bounded-review-grid"]]) {
  test(`${id} retains unique source identities`, () => {
    const source = Core.fixture(id)
    const timeline = Core.compileTimeline({ mode: "automatic" }, source.length, {})
    const result = Core.evaluate(timeline, 0.5, source, { canvasRatio: 16 / 9 })
    assert.equal(result.frames.length, count)
    assert.equal(result.layout, layout)
    assert.equal(new Set(result.frames.map((frame) => frame.id)).size, count)
  })
}

test("zero sources fail without fabricating media", () => assert.equal(Core.evaluate(Core.compileTimeline({ mode: "automatic" }, 1, {}), 0.5, []).code, "minimum-items"))
test("the 25th source is preserved but not silently rendered", () => {
  const source = Core.fixture("too-many-25")
  const result = Core.evaluate(Core.compileTimeline({ mode: "automatic" }, 24, {}), 0.5, source)
  assert.deepEqual([result.code, result.preservedCount, result.visibleCount], ["visible-limit", 25, 0])
})

test("bounded-many layouts stay on-canvas and below the declared occlusion cap", () => {
  for (const id of ["many-12", "many-24"]) for (const ratio of [16 / 9, 9 / 16, 1, 4 / 5]) {
    const source = Core.fixture(id)
    const timeline = Core.compileTimeline({ mode: "automatic" }, source.length, { overlap: 0.22 })
    for (const time of [0, 0.125, 0.5, 0.875, 1]) {
      const result = Core.evaluate(timeline, time, source, { canvasRatio: ratio })
      const metrics = independentMetrics(result.frames, ratio)
      assert.equal(metrics.outOfBounds, 0, `${id} ratio ${ratio} t=${time}`)
      assert.ok(metrics.maximum <= 0.22, `${id} ratio ${ratio} t=${time}: ${metrics.maximum}`)
      assert.ok(Math.abs(metrics.maximum - result.layoutMetrics.maxOcclusionFraction) < 1e-12)
    }
  }
})

test("reduced motion freezes physical placement across story time", () => {
  const first = Core.evaluate(ordinary.timeline, 0.25, ordinary.sources, { reducedMotion: true, canvasRatio: 16 / 9 })
  const second = Core.evaluate(ordinary.timeline, 0.75, ordinary.sources, { reducedMotion: true, canvasRatio: 16 / 9 })
  assert.deepEqual(first.frames.map(({ x, y, rotation }) => [x, y, rotation]), second.frames.map(({ x, y, rotation }) => [x, y, rotation]))
})

test("spread changes geometry causally", () => {
  const low = compile("ordinary-six", { tableSpread: 0.52 })
  const high = compile("ordinary-six", { tableSpread: 0.92 })
  const a = Core.evaluate(low.timeline, 0.5, low.sources, { canvasRatio: 16 / 9 })
  const b = Core.evaluate(high.timeline, 0.5, high.sources, { canvasRatio: 16 / 9 })
  assert.ok(Math.abs(a.frames[2].x - b.frames[2].x) > 0.05)
})

test("under-light changes only under-light state, never artwork treatment", () => {
  const off = compile("ordinary-six", { underlightStrength: 0 })
  const on = compile("ordinary-six", { underlightStrength: 0.7 })
  const a = Core.evaluate(off.timeline, 0.5, off.sources, { canvasRatio: 16 / 9 })
  const b = Core.evaluate(on.timeline, 0.5, on.sources, { canvasRatio: 16 / 9 })
  assert.deepEqual(a.frames.map((frame) => frame.media), b.frames.map((frame) => frame.media))
  assert.notDeepEqual(a.frames.map((frame) => frame.underlight), b.frames.map((frame) => frame.underlight))
})

test("manual focus is bounded and deterministic", () => {
  const result = Core.evaluate(ordinary.timeline, 0.3, ordinary.sources, { manualFocusIndex: 4, canvasRatio: 16 / 9 })
  assert.deepEqual([result.focusIndex, result.frames[4].focusWeight], [4, 1])
})

test("failed source keeps its order and identity", () => {
  const source = Core.fixture("failed-six")
  const result = Core.evaluate(Core.compileTimeline({ mode: "automatic" }, source.length, {}), 0.5, source, { canvasRatio: 16 / 9 })
  assert.equal(result.frames[2].failed, true)
  assert.equal(result.frames[2].id, source[2].id)
})

test("source inputs are never mutated", () => {
  const source = Core.fixture("mixed-six")
  const before = JSON.stringify(source)
  Core.evaluate(Core.compileTimeline({ mode: "automatic" }, source.length, {}), 0.5, source, { canvasRatio: 1 })
  assert.equal(JSON.stringify(source), before)
})

test("fixed duration clamps to the readable floor and reports the compromise", () => {
  const timeline = Core.compileTimeline({ mode: "fixed-duration", durationMs: 1_000 }, 6, {})
  assert.equal(timeline.durationMs, timeline.minimumDurationMs)
  assert.equal(timeline.issues[0].code, "duration-below-readable-minimum")
})

test("directed mode actually accelerates opening and return", () => {
  const automatic = Core.compileTimeline({ mode: "automatic" }, 6, {})
  const directed = Core.compileTimeline({ mode: "directed", durationMs: 10_000 }, 6, {})
  assert.ok(directed.segments.find((segment) => segment.id === "wake").achievedPaceScale > automatic.segments.find((segment) => segment.id === "wake").achievedPaceScale)
  assert.ok(directed.segments.find((segment) => segment.id === "return").requestedPaceScale === 2)
})

test("invalid mode and duration are explicit, finite fallbacks", () => {
  const timeline = Core.compileTimeline({ mode: "nonsense", durationMs: NaN }, NaN, { tableSpread: NaN, overlap: Infinity, nudgeRestraint: undefined })
  assert.equal(timeline.mode, "automatic")
  assert.equal(timeline.issues[0].code, "invalid-timeline-mode")
  assert.ok(allFinite(timeline))
})

test("non-finite and hostile story times never leak NaN", () => {
  for (const time of [NaN, Infinity, -Infinity, -2.75, 4.125, undefined]) {
    assert.ok(allFinite(Core.evaluate(ordinary.timeline, time, ordinary.sources, { canvasRatio: 16 / 9 })), String(time))
  }
})

test("canonical samples are deterministic without comparing an expression to itself", () => {
  const firstPass = [0, 0.0625, 0.1, 0.1875, 0.25, 0.375, 0.5, 0.625, 0.75, 0.78, 0.85, 0.92, 0.96875, 1]
    .map((time) => Core.stableStringify(Core.evaluate(ordinary.timeline, time, ordinary.sources, { canvasRatio: 16 / 9 })))
  const secondPass = [0, 0.0625, 0.1, 0.1875, 0.25, 0.375, 0.5, 0.625, 0.75, 0.78, 0.85, 0.92, 0.96875, 1]
    .map((time) => Core.stableStringify(Core.evaluate(ordinary.timeline, time, Core.fixture("ordinary-six"), { canvasRatio: 16 / 9 })))
  assert.deepEqual(secondPass, firstPass)
})

console.log(JSON.stringify({ scene: "light-table", checks, status: "pass", durationMs: ordinary.timeline.durationMs, seam: "exact", boundedManyOcclusionCap: 0.22 }, null, 2))
