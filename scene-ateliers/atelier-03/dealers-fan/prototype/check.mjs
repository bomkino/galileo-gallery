import fs from "node:fs"
import crypto from "node:crypto"
import { DEFAULTS, CONTROL_BOUNDS, FIXTURES, CANVASES, DURATION_MS, compileTimeline, evaluate, canonicalSnapshot } from "./evaluator.mjs"
import {
  ReviewHistory,
  createAuthoringSnapshot,
  decodeReviewState,
  dragTime,
  encodeReviewState,
  findReadableTime,
  stepReviewFrame,
} from "./review-runtime.mjs"

const failures = []
const observations = {}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")
const check = (name, operation) => {
  try { operation() } catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`) }
}
const expect = (condition, message) => { if (!condition) throw new Error(message) }
const snapshot = (items, stage, controls, timeMs) => canonicalSnapshot(evaluate({ items, stage, controls, timeMs }))
const vectors = JSON.parse(fs.readFileSync(new URL("../TEST_VECTORS.json", import.meta.url), "utf8")).vectors

check("deterministic vectors", () => {
  for (const vector of vectors) {
    const controls = { ...DEFAULTS, ...(vector.controls || {}) }
    const first = snapshot(FIXTURES[vector.fixture], CANVASES[vector.canvas], controls, vector.timeMs)
    const second = snapshot(FIXTURES[vector.fixture], CANVASES[vector.canvas], controls, vector.timeMs)
    expect(equal(first, second), `${vector.id} is nondeterministic`)
    expect(hash(first) === vector.expectedSha256, `${vector.id} hash mismatch`)
  }
})

check("literal fixed holds and exact target", () => {
  const automatic = compileTimeline({ ...DEFAULTS, mode: "automatic" })
  const fixed = compileTimeline({ ...DEFAULTS, mode: "fixed-duration", fixedDurationMs: 12347 })
  const directed = compileTimeline({ ...DEFAULTS, mode: "directed" })
  expect(fixed.durationMs === 12347, `fixed duration is ${fixed.durationMs}, not 12347`)
  for (const segment of automatic.segments.filter((candidate) => candidate.kind === "hold")) {
    const fixedSegment = fixed.segments.find((candidate) => candidate.id === segment.id)
    const directedSegment = directed.segments.find((candidate) => candidate.id === segment.id)
    expect(fixedSegment?.durationMs === segment.durationMs, `${segment.id} stretched in fixed mode`)
    expect(directedSegment?.durationMs === segment.durationMs, `${segment.id} changed in directed mode`)
  }
  expect(directed.durationMs < automatic.durationMs, "directed entry/exit did not become faster")
  observations.timeline = { automatic: automatic.durationMs, fixed: fixed.durationMs, directed: directed.durationMs, literalHoldMs: automatic.literalHoldMs }
})

check("seam and exact reverse", () => {
  const items = FIXTURES.many127
  const stage = CANVASES.wide
  let samples = 0
  for (const mode of ["automatic", "fixed-duration", "directed"]) {
    const controls = { ...DEFAULTS, mode, fixedDurationMs: 12347, direction: "forward" }
    const duration = compileTimeline(controls).durationMs
    expect(equal(snapshot(items, stage, controls, 0), snapshot(items, stage, controls, duration)), `${mode} seam mismatch`)
    for (let index = 0; index <= 600; index += 1) {
      const q = index / 600
      const forward = snapshot(items, stage, controls, q * duration)
      const reverse = snapshot(items, stage, { ...controls, direction: "reverse" }, (1 - q) * duration)
      expect(equal(forward, reverse), `${mode} reverse mismatch at ${q}`)
      samples += 1
    }
  }
  observations.reverseSamples = samples
})

check("hostile input rejected before geometry", () => {
  const controlNames = Object.keys(CONTROL_BOUNDS).filter((name) => !["featuredIndex", "spotlightIndex", "fixedDurationMs"].includes(name))
  for (const name of controlNames) {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      let rejected = false
      try { evaluate({ items: FIXTURES.five, stage: CANVASES.wide, controls: { ...DEFAULTS, [name]: value }, timeMs: 0 }) } catch { rejected = true }
      expect(rejected, `${name} accepted ${String(value)}`)
    }
  }
  let duplicateRejected = false
  try { evaluate({ items: [{ id: "same", ratio: 1 }, { id: "same", ratio: 1 }], stage: CANVASES.wide, controls: DEFAULTS, timeMs: 0 }) } catch { duplicateRejected = true }
  expect(duplicateRejected, "duplicate source IDs accepted")
  let overflowRejected = false
  try { evaluate({ items: Array.from({ length: 128 }, (_, index) => ({ id: `x-${index}`, ratio: 1 })), stage: CANVASES.wide, controls: DEFAULTS, timeMs: 0 }) } catch { overflowRejected = true }
  expect(overflowRejected, "128 sources accepted")
  let stageRejected = false
  try { evaluate({ items: FIXTURES.five, stage: { width: Number.NaN, height: 720 }, controls: DEFAULTS, timeMs: 0 }) } catch { stageRejected = true }
  expect(stageRejected, "non-finite stage accepted")
})

check("source fidelity and resource ceiling", () => {
  const output = evaluate({ items: FIXTURES.many127, stage: CANVASES.wide, controls: { ...DEFAULTS, spotlightIndex: 64 }, timeMs: DURATION_MS * 0.4 })
  expect(output.resources.evaluated === 127, "did not evaluate all ordered identities")
  expect(output.resources.mounted <= 11, `mounted ${output.resources.mounted} cards`)
  expect(new Set(output.cards.map((card) => card.id)).size === output.cards.length, "duplicate mounted identity")
  expect(new Set(output.cards.map((card) => card.zIndex)).size === output.cards.length, "ambiguous z-order tie")
  expect(output.cards.every((card) => card.artworkOpacity === 1 && card.artworkFilter === "none" && card.blendMode === "normal"), "source treatment changed")
  observations.resources = output.resources
})

check("prototype journey exposes real authoring state", () => {
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8")
  const app = fs.readFileSync(new URL("./app.mjs", import.meta.url), "utf8")
  for (const id of ["play", "scrub", "fixture", "canvas", "mode", "fixedDurationMs", "reducedMotion", "reset", "readback", "status", "spotlightIndex"]) {
    expect(html.includes(`id="${id}"`), `UI missing ${id}`)
  }
  expect(html.includes('aria-live="polite"'), "status is not announced")
  expect(html.includes("aria-keyshortcuts"), "keyboard inspection is undisclosed")
  expect(!/innerHTML|replaceChildren/.test(app), "render loop destroys card DOM")
  expect(app.includes("const nodes = new Map()"), "keyed card lifecycle absent")
  expect(app.includes("fixedField.hidden"), "fixed duration is not conditional")
})

const fanBounds = (card) => {
  const angle = card.angleDeg * Math.PI / 180
  const width = card.width * card.scale
  const height = card.height * card.scale
  const points = [[-width/2,-height],[width/2,-height],[-width/2,0],[width/2,0]].map(([x,y]) => [card.bottomX+x*Math.cos(angle)-y*Math.sin(angle), card.bottomY+x*Math.sin(angle)+y*Math.cos(angle)])
  return { minX: Math.min(...points.map((point)=>point[0])), maxX: Math.max(...points.map((point)=>point[0])), minY: Math.min(...points.map((point)=>point[1])), maxY: Math.max(...points.map((point)=>point[1])) }
}
check("crown is readable and fractional handoff remains continuous", () => {
  const corners = [{}, ...Object.entries(CONTROL_BOUNDS).filter(([key]) => !["spotlightIndex","fixedDurationMs"].includes(key)).flatMap(([key,[min,max]]) => [{ [key]: min }, { [key]: max }])]
  for (const stage of Object.values(CANVASES)) for (const fixture of [FIXTURES.one,FIXTURES.two,FIXTURES.five,FIXTURES.mixed]) for (const patch of corners) for (const phase of [0.38,0.86]) {
    const output = evaluate({ items: fixture, stage, controls: { ...DEFAULTS, ...patch, spotlightIndex: Math.min(DEFAULTS.spotlightIndex,fixture.length-1) }, timeMs: DURATION_MS * phase })
    const crown = [...output.cards].sort((a,b)=>b.zIndex-a.zIndex)[0]
    const bounds = fanBounds(crown)
    expect(bounds.minX >= -0.05 && bounds.maxX <= stage.width + 0.05 && bounds.minY >= -0.05 && bounds.maxY <= stage.height + 0.05, `crown clipped at ${stage.width}x${stage.height}`)
  }
  const fractional = evaluate({ items: FIXTURES.five, stage: CANVASES.wide, controls: DEFAULTS, timeMs: DURATION_MS * 0.18 })
  expect(Math.abs(fractional.focus - Math.round(fractional.focus)) > 0.02, "focus snapped to an integer")
  const nearest = fractional.cards.filter((card) => Math.abs(card.distance) < 1)
  expect(nearest.length === 2, "fractional crown does not hand off between two ordered cards")
})
check("window churn occurs at invisible guards", () => {
  let prior = evaluate({ items: FIXTURES.many127, stage: CANVASES.wide, controls: { ...DEFAULTS, spotlightIndex: 64 }, timeMs: 0 })
  let changes = 0
  for (let index = 1; index <= 1400; index += 1) {
    const next = evaluate({ items: FIXTURES.many127, stage: CANVASES.wide, controls: { ...DEFAULTS, spotlightIndex: 64 }, timeMs: DURATION_MS * index / 1400 })
    const before = new Set(prior.cards.map((card)=>card.id)), after = new Set(next.cards.map((card)=>card.id))
    if (!equal([...before],[...after])) {
      const changed = [...prior.cards.filter((card)=>!after.has(card.id)),...next.cards.filter((card)=>!before.has(card.id))]
      expect(changed.every((card)=>card.containerOpacity <= 0.02), "window swapped a readable card")
      changes += 1
    }
    prior = next
  }
  expect(changes > 0, "large window never advanced")
  observations.windowChanges = changes
})
check("all five controls are causal", () => {
  const cases = [["fanStep",17,0.60,FIXTURES.five],["pivotDepth",70,0.38,FIXTURES.five],["visibleWindow",11,0.60,FIXTURES.many127],["presentationLift",29,0.38,FIXTURES.five],["cardSize",47,0.38,FIXTURES.five]]
  for(const [key,value,phase,items] of cases) expect(!equal(snapshot(items,CANVASES.wide,DEFAULTS,DURATION_MS*phase),snapshot(items,CANVASES.wide,{...DEFAULTS,[key]:value},DURATION_MS*phase)),`${key} is inert`)
})


const REVIEW_FEATURED_KEY = "spotlightIndex"
const REVIEW_CONTROL_IDS = Object.keys(CONTROL_BOUNDS).filter((id) => id !== "fixedDurationMs")
const REVIEW_SPEC = {
  defaultFixture: "five",
  defaultCanvas: "wide",
  defaultTime: DURATION_MS * 0.4,
  fixtureIds: Object.keys(FIXTURES),
  canvasIds: Object.keys(CANVASES),
  defaults: DEFAULTS,
  controlBounds: CONTROL_BOUNDS,
  controlIds: REVIEW_CONTROL_IDS,
  featuredKey: REVIEW_FEATURED_KEY,
}

check("review URL round-trips authored state without inventing Project authority", () => {
  const causalControl = REVIEW_CONTROL_IDS.find((id) => id !== REVIEW_FEATURED_KEY)
  const authored = {
    fixture: "mixed",
    canvas: "portrait",
    controls: {
      ...DEFAULTS,
      mode: "directed",
      direction: "reverse",
      fixedDurationMs: 12347,
      [causalControl]: CONTROL_BOUNDS[causalControl][1],
      [REVIEW_FEATURED_KEY]: Math.min(4, FIXTURES.mixed.length - 1),
    },
    timeMs: 2345,
    reducedMotionOverride: true,
  }
  const encoded = encodeReviewState(authored, REVIEW_SPEC)
  const decoded = decodeReviewState(encoded, REVIEW_SPEC)
  expect(decoded.state.fixture === authored.fixture, "fixture did not round-trip")
  expect(decoded.state.canvas === authored.canvas, "canvas did not round-trip")
  expect(decoded.state.timeMs === authored.timeMs, "review time did not round-trip")
  expect(decoded.state.reducedMotionOverride === true, "reduced-motion override did not round-trip")
  for (const id of [...REVIEW_CONTROL_IDS, "mode", "direction", "fixedDurationMs"]) {
    expect(decoded.state.controls[id] === authored.controls[id], `${id} did not round-trip`)
  }
  const malformed = decodeReviewState("?fixture=not-real&canvas=void&time=NaN&c." + causalControl + "=Infinity", REVIEW_SPEC)
  expect(malformed.state.fixture === REVIEW_SPEC.defaultFixture, "malformed fixture escaped fallback")
  expect(malformed.state.canvas === REVIEW_SPEC.defaultCanvas, "malformed canvas escaped fallback")
  expect(malformed.state.controls[causalControl] === DEFAULTS[causalControl], "malformed control escaped fallback")
  observations.reviewState = { bytes: encoded.length, warnings: decoded.warnings.length }
})

check("continuous authoring edit becomes one reversible history step", () => {
  const causalControl = REVIEW_CONTROL_IDS.find((id) => id !== REVIEW_FEATURED_KEY)
  const initial = createAuthoringSnapshot({ fixture: "five", canvas: "wide", controls: DEFAULTS, reducedMotionOverride: null })
  const history = new ReviewHistory(initial)
  const final = createAuthoringSnapshot({
    fixture: "five",
    canvas: "wide",
    controls: { ...DEFAULTS, [causalControl]: CONTROL_BOUNDS[causalControl][1] },
    reducedMotionOverride: null,
  })
  expect(history.commitFrom(initial, final, "Continuous drag") === true, "history rejected a real edit")
  expect(history.depth.undo === 1 && history.depth.redo === 0, "continuous edit fragmented history")
  expect(history.commitFrom(final, final, "No-op") === false, "no-op polluted history")
  const undo = history.undo(final)
  expect(equal(undo?.snapshot, initial), "undo did not restore exact authored state")
  const redo = history.redo(initial)
  expect(equal(redo?.snapshot, final), "redo did not restore exact authored state")
  observations.history = history.depth
})

check("inspection finds the requested source without mutating story intent", () => {
  const authoredControls = { ...DEFAULTS }
  const before = JSON.stringify(authoredControls)
  const sourceIndex = 96
  const inspectionControls = false
    ? { ...authoredControls, [REVIEW_FEATURED_KEY]: sourceIndex }
    : authoredControls
  const durationMs = compileTimeline(authoredControls).durationMs
  const found = findReadableTime({
    durationMs,
    sourceIndex,
    evaluateAt: (timeMs) => evaluate({ items: FIXTURES.many127, stage: CANVASES.wide, controls: inspectionControls, timeMs }),
  })
  expect(JSON.stringify(authoredControls) === before, "inspection mutated serialized controls")
  expect(found.mounted, "inspection could not make source 97 reviewable")
  const output = evaluate({ items: FIXTURES.many127, stage: CANVASES.wide, controls: inspectionControls, timeMs: found.timeMs })
  const card = output.cards.find((candidate) => candidate.sourceIndex === sourceIndex)
  expect(Boolean(card), "inspection target is absent at returned time")
  expect(card.containerOpacity >= 0.95, `inspection target opacity ${card.containerOpacity} is not readable`)
  observations.inspection = { source: sourceIndex + 1, timeMs: found.timeMs, score: Number(found.score.toFixed(4)), phraseRole: found.phraseRole }
})

check("frame stepping and direct scrub mapping are exact and reversible", () => {
  const durationMs = compileTimeline(DEFAULTS).durationMs
  const next = stepReviewFrame(0, durationMs, 1)
  const back = stepReviewFrame(next, durationMs, -1)
  expect(next > 0, "next-frame step did not advance")
  expect(Math.abs(back) < 1e-6, `previous-frame step returned ${back} instead of zero`)
  const start = Math.min(1200, durationMs * 0.2)
  const fullWidth = dragTime(start, 800, 800, durationMs)
  const halfWidth = dragTime(start, 400, 800, durationMs)
  expect(Math.abs(fullWidth - start) < 1e-6, "one full-width scrub did not wrap exactly")
  expect(Math.abs(halfWidth - ((start + durationMs / 2) % durationMs)) < 1e-6, "half-width scrub did not map to half a phrase")
  observations.transport = { fps: 30, nextFrameMs: next }
})

check("authoring UI separates story intent, inspection, history, and transport", () => {
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8")
  for (const id of ["undo", "redo", "stepBack", "stepForward", "copyReview", "reviewUrl", "diagnostics"]) {
    expect(html.includes(`id="${id}"`), `UI missing ${id}`)
  }
  expect(html.includes("Serialized Scene intent"), "story source is not labelled as serialized intent")
  expect(html.includes("Inspection never changes the serialized story source"), "inspection boundary is not explained")
  const app = fs.readFileSync(new URL("./app.mjs", import.meta.url), "utf8")
  expect(app.includes("if (dragGesture || !unmodifiedPrimaryPointer(event)) return"), "a second pointer can steal the active scrub")
  expect(app.includes('window.addEventListener("blur", () => abortCardDrag(true))'), "window blur does not cancel review scrub")
  expect(app.includes("function abortCardDrag(restoreTime = true)"), "review scrub has no common cancellation path")
  expect(app.includes("if (document.hidden) {\n      pause()\n      abortCardDrag(true)"), "hidden-page transition leaves a scrub alive")
})

const result = { scene: "dealers-fan", passed: failures.length === 0, checks: vectors.length + 17, failures, observations }
console.log(JSON.stringify(result, null, 2))
if (failures.length) process.exit(1)
