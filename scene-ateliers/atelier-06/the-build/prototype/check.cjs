"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Core = require("./scene-core.js")

let checks = 0
function check(condition, message) { checks += 1; assert.ok(condition, message) }
function equal(actual, expected, message) { checks += 1; assert.equal(actual, expected, message) }
function deep(actual, expected, message) { checks += 1; assert.deepEqual(actual, expected, message) }
function finiteTree(value, trail = "root") {
  if (typeof value === "number") assert.ok(Number.isFinite(value), `${trail} is not finite`)
  else if (Array.isArray(value)) value.forEach((item, index) => finiteTree(item, `${trail}[${index}]`))
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => finiteTree(item, `${trail}.${key}`))
}
function visual(result) {
  return {
    frameProgress: result.frameProgress,
    guideProgress: result.guideProgress,
    sourceReveal: result.sourceReveal,
    captionProgress: result.captionProgress,
    cleanupProgress: result.cleanupProgress,
    resolvedProgress: result.resolvedProgress,
    apparatus: result.apparatus,
    cursor: result.cursor,
  }
}

const captionSources = Core.fixture("one-caption")
const noCaptionSources = Core.fixture("one-no-caption")
const timeline = Core.compileTimeline({ mode: "automatic" }, {}, { hasCaption: true })
const noCaptionTimeline = Core.compileTimeline({ mode: "automatic" }, {}, { hasCaption: false })
const at = (time, options) => Core.evaluate(timeline, time, captionSources, options)

equal(timeline.durationMs, 11_600, "regular caption duration")
equal(timeline.minimumDurationMs, 7_900, "regular caption readable floor")
equal(noCaptionTimeline.durationMs, 10_700, "no-caption story removes the dead 900 ms beat")
equal(noCaptionTimeline.minimumDurationMs, 7_300, "no-caption floor removes only caption minimum")
check(timeline.segments.some((segment) => segment.id === "caption-if-known"), "caption source gets a caption beat")
check(!noCaptionTimeline.segments.some((segment) => segment.id === "caption-if-known"), "no-caption source gets no invisible beat")
equal(timeline.segments.reduce((sum, segment) => sum + segment.durationMs, 0), timeline.durationMs, "segment sum")
check(timeline.segments.every((segment, index) => segment.durationMs > 0 && segment.startMs < segment.endMs && (index === 0 ? segment.startMs === 0 : segment.startMs === timeline.segments[index - 1].endMs)), "positive contiguous segments")

const start = at(0)
const seam = at(1)
deep(visual(start), visual(seam), "visual seam is exact")
equal(start.sourceReveal, 0, "starts without source")
equal(seam.sourceReveal, 0, "ends without source")
const resolvedSegment = timeline.segments.find((segment) => segment.id === "resolved-hold")
const resolved = at((resolvedSegment.start + resolvedSegment.end) / 2)
equal(resolved.sourceReveal, 1, "resolved source fully revealed")
equal(resolved.guideProgress, 0, "guides cleared before resolved hold")
equal(resolved.captionProgress, 1, "known caption resolved")
deep(resolved.source.media, { opacity: 1, filter: "none", blend: "normal" }, "source treatment remains clean")

for (const segment of timeline.segments) {
  const result = at(segment.start)
  equal(result.phaseId, segment.id, `boundary enters ${segment.id}`)
  finiteTree(result, segment.id)
}
check(timeline.segments.every((segment) => Math.abs(at(segment.start).velocity) < 1e-9), "every authored boundary starts at zero velocity")

const causal = Core.compileTimeline({ mode: "automatic" }, { cursorVisibility: "causal" }, { hasCaption: true })
const sourceSegment = causal.segments.find((segment) => segment.id === "source-window")
const cursorMid = Core.evaluate(causal, (sourceSegment.start + sourceSegment.end) / 2, captionSources)
check(cursorMid.cursor.opacity > .99, "causal cursor peaks during source placement")
equal(Core.evaluate(causal, sourceSegment.start, captionSources).cursor.opacity, 0, "cursor absent at operation start")
equal(Core.evaluate(causal, sourceSegment.end, captionSources).cursor.opacity, 0, "cursor absent after operation")

for (const [density, count] of [["minimal", 2], ["standard", 4], ["technical", 8]]) equal(Core.guidesFor(density).length, count, `${density} guide count`)
const extraSources = Core.fixture("extra-three")
const extraCopy = JSON.parse(JSON.stringify(extraSources))
const extra = Core.evaluate(timeline, .5, extraSources)
equal(extra.consumedCount, 1, "one primary consumed")
equal(extra.preservedExtraCount, 2, "extras preserved")
deep(extraSources, extraCopy, "evaluator does not mutate sources")
const proposal = Core.evaluate(timeline, .5, Core.fixture("explicit-stages-proposal"))
equal(proposal.apply, "blocked-proposal", "unsupported stages blocked")
equal(proposal.requiredContract, "AT06-CONTRACT-AUTHORED-STAGES", "blocked proposal names contract")
equal(Core.evaluate(timeline, .5, []).code, "minimum-items", "zero source fails honestly")

for (const fixture of ["transparent-source", "failed-source", "video-source"]) {
  const result = Core.evaluate(timeline, .5, Core.fixture(fixture))
  deep(result.source.media, { opacity: 1, filter: "none", blend: "normal" }, `${fixture} source treatment`)
}
for (const time of [0, .1, .25, .5, .75, .9, 1]) {
  const noCaption = Core.evaluate(noCaptionTimeline, time, noCaptionSources)
  equal(noCaption.captionProgress, 0, `no caption never appears at ${time}`)
}

const conciseCaption = Core.compileTimeline({ mode: "automatic" }, { buildDetail: "concise" }, { hasCaption: true })
const conciseNoCaption = Core.compileTimeline({ mode: "automatic" }, { buildDetail: "concise" }, { hasCaption: false })
check(conciseCaption.segments.some((segment) => segment.id === "caption-if-known"), "concise caption enters causally")
check(!conciseNoCaption.segments.some((segment) => segment.id === "caption-if-known"), "concise no-caption has no dead beat")
equal(conciseCaption.durationMs - conciseNoCaption.durationMs, 800, "concise caption cost is explicit")
const detailed = Core.compileTimeline({ mode: "automatic" }, { buildDetail: "detailed" }, { hasCaption: true })
check(detailed.segments.some((segment) => segment.id === "alignment-check"), "detailed adds one known alignment check")

const fixedLow = Core.compileTimeline({ mode: "fixed-duration", durationMs: 2_000 }, {}, { hasCaption: true })
equal(fixedLow.issues[0].code, "duration-below-readable-minimum", "low fixed duration reports issue")
equal(fixedLow.durationMs, fixedLow.minimumDurationMs, "low fixed duration clamps to floor")
check(fixedLow.segments.every((segment) => segment.durationMs >= segment.min), "fixed compiler preserves every phase minimum")
const fixed = Core.compileTimeline({ mode: "fixed-duration", durationMs: 12_000 }, {}, { hasCaption: true })
equal(fixed.durationMs, 12_000, "fixed duration exact")
const compressed = Core.compileTimeline({ mode: "fixed-duration", durationMs: 9_000 }, {}, { hasCaption: true })
equal(compressed.issues[0].code, "fixed-duration-compression", "readable compression reported")

const directed = Core.compileTimeline({ mode: "directed" }, {}, { hasCaption: true })
equal(directed.segments.find((segment) => segment.id === "source-window").requestedPaceScale, 1, "middle source decision remains regular")
equal(directed.segments.find((segment) => segment.id === "frame-apparatus").requestedPaceScale, 2, "opening move requests fast x2")
equal(directed.segments.find((segment) => segment.id === "deconstruct").requestedPaceScale, 2, "finale move requests fast x2")
check(directed.durationMs < timeline.durationMs, "directed rhythm is materially faster")

for (const hostile of [NaN, Infinity, -Infinity, "garbage", null, undefined]) {
  const compiled = Core.compileTimeline({ mode: "fixed-duration", durationMs: hostile }, { perBeatHoldMs: hostile, finaleHoldMs: hostile }, { hasCaption: true })
  finiteTree(compiled, `compile-${String(hostile)}`)
  finiteTree(Core.evaluate(compiled, hostile, captionSources), `evaluate-${String(hostile)}`)
  check(compiled.segments.every((segment) => segment.durationMs > 0), `hostile ${String(hostile)} keeps positive durations`)
}

const forwardQuarter = at(.25)
const reverseQuarter = at(.75, { direction: "reverse" })
deep(visual(forwardQuarter), visual(reverseQuarter), "reverse retraces the same visual state")
check(Math.sign(forwardQuarter.velocity) === -Math.sign(reverseQuarter.velocity) || (forwardQuarter.velocity === 0 && reverseQuarter.velocity === 0), "reverse velocity changes sign")
const reduced = at(.6, { reducedMotion: true })
check(reduced.phaseId.startsWith("reduced-"), "reduced motion uses discrete states")
equal(reduced.cursor.opacity, 0, "reduced motion never animates cursor")

const runtime = ["scene-core.js", "app.js", "index.html", "styles.css"].map((file) => fs.readFileSync(path.join(__dirname, file), "utf8")).join("\n")
for (const token of [/\bAPPROVED\b/i, /\bREADY\b/, /palette/i, /typography trial/i, /particle/i, /\bbloom\b/i, /caustic/i, /confetti/i]) {
  check(!token.test(runtime), `forbidden runtime token ${token}`)
}
check(!/(?:import\s|require\()["']\.\.\//.test(runtime), "prototype imports no parent runtime")

console.log(JSON.stringify({
  scene: "the-build",
  checks,
  status: "pass",
  sourceModel: "flat-source-presentation-build",
  captionDurationMs: timeline.durationMs,
  noCaptionDurationMs: noCaptionTimeline.durationMs,
  minimumDurationMs: timeline.minimumDurationMs,
  seam: "exact",
  g10c: "preflight-only",
}, null, 2))
