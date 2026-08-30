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
      try { evaluate({ items: FIXTURES.six, stage: CANVASES.wide, controls: { ...DEFAULTS, [name]: value }, timeMs: 0 }) } catch { rejected = true }
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
  try { evaluate({ items: FIXTURES.six, stage: { width: Number.NaN, height: 720 }, controls: DEFAULTS, timeMs: 0 }) } catch { stageRejected = true }
  expect(stageRejected, "non-finite stage accepted")
})

check("source fidelity and resource ceiling", () => {
  const output = evaluate({ items: FIXTURES.many127, stage: CANVASES.wide, controls: { ...DEFAULTS, featuredIndex: 64 }, timeMs: DURATION_MS * 0.4 })
  expect(output.resources.evaluated === 127, "did not evaluate all ordered identities")
  expect(output.resources.mounted <= 18, `mounted ${output.resources.mounted} cards`)
  expect(new Set(output.cards.map((card) => card.id)).size === output.cards.length, "duplicate mounted identity")
  expect(new Set(output.cards.map((card) => card.zIndex)).size === output.cards.length, "ambiguous z-order tie")
  expect(output.cards.every((card) => card.artworkOpacity === 1 && card.artworkFilter === "none" && card.blendMode === "normal"), "source treatment changed")
  observations.resources = output.resources
})

check("prototype journey exposes real authoring state", () => {
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8")
  const app = fs.readFileSync(new URL("./app.mjs", import.meta.url), "utf8")
  for (const id of ["play", "scrub", "fixture", "canvas", "mode", "fixedDurationMs", "reducedMotion", "reset", "readback", "status", "featuredIndex"]) {
    expect(html.includes(`id="${id}"`), `UI missing ${id}`)
  }
  expect(html.includes('aria-live="polite"'), "status is not announced")
  expect(html.includes("aria-keyshortcuts"), "keyboard inspection is undisclosed")
  expect(!/innerHTML|replaceChildren/.test(app), "render loop destroys card DOM")
  expect(app.includes("const nodes = new Map()"), "keyed card lifecycle absent")
  expect(app.includes("fixedField.hidden"), "fixed duration is not conditional")
})

const box = (card) => ({ minX:card.x-card.width*card.scale/2,maxX:card.x+card.width*card.scale/2,minY:card.y-card.height*card.scale/2,maxY:card.y+card.height*card.scale/2 })
check("one-plane ring fills its slots and keeps front readable", () => {
  const hold = evaluate({ items: FIXTURES.six, stage: CANVASES.wide, controls: DEFAULTS, timeMs: DURATION_MS * 0.44 })
  const front = [...hold.cards].sort((a,b)=>b.depth-a.depth)[0]
  expect(front.sourceIndex === DEFAULTS.featuredIndex, "featured identity missed front gate")
  expect(front.containerOpacity > 0.999 && front.artworkOpacity === 1 && front.artworkFilter === "none", "front gate is not source-faithful")
  const many = evaluate({ items: FIXTURES.many127, stage: CANVASES.wide, controls: { ...DEFAULTS, featuredIndex:64 }, timeMs:DURATION_MS*.44 })
  const xs=many.cards.map((card)=>card.x), depths=many.cards.map((card)=>card.depth)
  expect(Math.max(...xs)-Math.min(...xs) > many.effective.ringRadius*1.85, "large window bunches instead of filling the ring")
  expect(Math.max(...depths)-Math.min(...depths) > many.effective.ringRadius*1.80, "large window lacks rear depth")
  const sorted=[...many.cards].sort((a,b)=>a.slotDistance-b.slotDistance).map((card)=>card.sourceIndex)
  expect(new Set(sorted).size===18,"large window duplicated identity")
})
check("rear-guard virtualization is hidden", () => {
  let prior=evaluate({items:FIXTURES.many127,stage:CANVASES.wide,controls:{...DEFAULTS,featuredIndex:64},timeMs:0}),changes=0
  for(let i=1;i<=1400;i+=1){const next=evaluate({items:FIXTURES.many127,stage:CANVASES.wide,controls:{...DEFAULTS,featuredIndex:64},timeMs:DURATION_MS*i/1400}),before=new Set(prior.cards.map(c=>c.id)),after=new Set(next.cards.map(c=>c.id));if(!equal([...before],[...after])){const changed=[...prior.cards.filter(c=>!after.has(c.id)),...next.cards.filter(c=>!before.has(c.id))];expect(changed.every(c=>c.containerOpacity<.02||(c.frontness<.04&&c.guardOpacity<.15)),"window swap left rear guard");changes+=1}prior=next}expect(changes>0,"large window never advanced");observations.windowChanges=changes
})
check("supported geometry remains in stage",()=>{const corners=[{},...Object.entries(CONTROL_BOUNDS).filter(([k])=>!["featuredIndex","fixedDurationMs"].includes(k)).flatMap(([k,[a,b]])=>[{[k]:a},{[k]:b}])];for(const stage of Object.values(CANVASES))for(const patch of corners){const out=evaluate({items:FIXTURES.mixed,stage,controls:{...DEFAULTS,...patch},timeMs:DURATION_MS*.44});for(const c of out.cards){const b=box(c);expect(b.minX>=-.05&&b.maxX<=stage.width+.05&&b.minY>=-.05&&b.maxY<=stage.height+.05,`${c.id} clipped`)}}})
check("three scene controls are causal",()=>{for(const [k,v]of[["ringRadius",25],["planeTilt",23],["cardSize",33]])expect(!equal(snapshot(FIXTURES.six,CANVASES.wide,DEFAULTS,DURATION_MS*.44),snapshot(FIXTURES.six,CANVASES.wide,{...DEFAULTS,[k]:v},DURATION_MS*.44)),`${k} inert`)})


const REVIEW_FEATURED_KEY = "featuredIndex"
const REVIEW_CONTROL_IDS = Object.keys(CONTROL_BOUNDS).filter((id) => id !== "fixedDurationMs")
const REVIEW_SPEC = {
  defaultFixture: "six",
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
  const initial = createAuthoringSnapshot({ fixture: "six", canvas: "wide", controls: DEFAULTS, reducedMotionOverride: null })
  const history = new ReviewHistory(initial)
  const final = createAuthoringSnapshot({
    fixture: "six",
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

const result = { scene: "orbit-ring", passed: failures.length === 0, checks: vectors.length + 17, failures, observations }
console.log(JSON.stringify(result, null, 2))
if (failures.length) process.exit(1)
