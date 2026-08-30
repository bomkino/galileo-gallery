import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { CANVASES, DEFAULTS, FIXTURES, evaluateVitrine, summarize } from "./evaluator.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const sceneRoot = path.dirname(here)
const vectors = JSON.parse(fs.readFileSync(path.join(sceneRoot, "TEST_VECTORS.json"), "utf8"))
const evidencePath = path.join(sceneRoot, "evidence", "TEST_VECTOR_READBACK.json")
const failures = []
const readback = []
const check = (condition, message) => { if (!condition) failures.push(message) }
const near = (a, b, epsilon = 1e-9) => Math.abs(a - b) <= epsilon
const poseDigest = (state) => state.renderSlots.map((card) => ({ id: card.id, role: card.role, x: card.x, y: card.y, depth: card.depth, scale: card.scale, rotateYDeg: card.rotateYDeg }))

for (const vector of vectors.vectors) {
  const items = FIXTURES[vector.input.fixture]
  const state = evaluateVitrine({
    items,
    config: { ...DEFAULTS, ...(vector.input.config || {}) },
    intent: {
      direction: vector.input.direction || "forward",
      spotlightId: vector.input.spotlightId || items[0]?.id,
      finaleId: vector.input.finaleId || items.find((item) => item.id !== (vector.input.spotlightId || items[0]?.id))?.id,
    },
    normalizedTime: vector.input.normalizedTime,
    canvas: CANVASES[vector.input.canvas],
    runKind: vector.input.runKind || "loop",
    reducedMotion: Boolean(vector.input.reducedMotion),
  })
  const summary = summarize(state)
  readback.push({ id: vector.id, summary })
  for (const [key, value] of Object.entries(vector.expect)) check(JSON.stringify(summary[key]) === JSON.stringify(value), `${vector.id}: expected ${key}=${JSON.stringify(value)}, got ${JSON.stringify(summary[key])}`)
  check(state.sourceStates.length === items.length, `${vector.id}: complete identity state missing`)
  check(state.renderNodeCount <= 2, `${vector.id}: more than outgoing/incoming pair rendered`)
  check(state.sourceStates.every((card) => card.artworkOpacity === 1 && card.artworkFilter === "none" && card.artworkBlend === "normal"), `${vector.id}: source fidelity drift`)
}

const seamStart = evaluateVitrine({ items: FIXTURES.ordinary8, config: DEFAULTS, intent: { direction: "forward" }, normalizedTime: 0, canvas: CANVASES["16:9"] })
const seamEnd = evaluateVitrine({ items: FIXTURES.ordinary8, config: DEFAULTS, intent: { direction: "forward" }, normalizedTime: 1, canvas: CANVASES["16:9"] })
check(JSON.stringify(poseDigest(seamStart)) === JSON.stringify(poseDigest(seamEnd)), "loop seam pose mismatch")
check(seamStart.currentId === seamEnd.currentId && seamStart.incomingId === seamEnd.incomingId, "loop seam identity mismatch")

const reverseTime = 0.231
const reverse = evaluateVitrine({ items: FIXTURES.ordinary8, config: DEFAULTS, intent: { direction: "reverse" }, normalizedTime: reverseTime, canvas: CANVASES["16:9"] })
const forwardMirror = evaluateVitrine({ items: FIXTURES.ordinary8, config: DEFAULTS, intent: { direction: "forward" }, normalizedTime: 1 - reverseTime, canvas: CANVASES["16:9"] })
check(JSON.stringify(poseDigest(reverse)) === JSON.stringify(poseDigest(forwardMirror)), "exact reverse pose mismatch")
check(reverse.currentId === forwardMirror.currentId && reverse.incomingId === forwardMirror.incomingId, "exact reverse identity mismatch")

const finiteReverse = evaluateVitrine({ items: FIXTURES.ordinary8, config: DEFAULTS, intent: { direction: "reverse", spotlightId: "ordinary-004", finaleId: "ordinary-008" }, normalizedTime: 0.23, canvas: CANVASES["4:5"], runKind: "finite" })
const finiteMirror = evaluateVitrine({ items: FIXTURES.ordinary8, config: DEFAULTS, intent: { direction: "forward", spotlightId: "ordinary-004", finaleId: "ordinary-008" }, normalizedTime: 0.77, canvas: CANVASES["4:5"], runKind: "finite" })
check(JSON.stringify(poseDigest(finiteReverse)) === JSON.stringify(poseDigest(finiteMirror)), "finite exact reverse mismatch")

const entry = evaluateVitrine({ items: FIXTURES.two, config: DEFAULTS, intent: { direction: "forward", spotlightId: "two-001", finaleId: "two-002" }, normalizedTime: 0.03, canvas: CANVASES["16:9"], runKind: "finite" })
const exit = evaluateVitrine({ items: FIXTURES.two, config: DEFAULTS, intent: { direction: "forward", spotlightId: "two-001", finaleId: "two-002" }, normalizedTime: 0.99, canvas: CANVASES["16:9"], runKind: "finite" })
const entryCard = entry.renderSlots[0], exitCard = exit.renderSlots[0]
check(near(entryCard.x, exitCard.x) && near(entryCard.y, exitCard.y) && near(entryCard.depth, exitCard.depth) && near(entryCard.rotateYDeg, exitCard.rotateYDeg), "entry/exit inverse pose mismatch")

const controlTime = 0.42
const baseline = evaluateVitrine({ items: FIXTURES.two, config: DEFAULTS, normalizedTime: controlTime, canvas: CANVASES["16:9"] })
const controlCases = [
  ["presentationScale", 0.76, (a, b) => !near(a.renderSlots[0].width, b.renderSlots[0].width)],
  ["objectTurnAmplitude", 8, (a, b) => !near(a.renderSlots[0].rotateYDeg, b.renderSlots[0].rotateYDeg)],
  ["transitionDepth", 0.29, (a, b) => !near(a.renderSlots[0].depth, b.renderSlots[0].depth)],
  ["transitionDirection", "right", (a, b) => !near(a.renderSlots[0].x, b.renderSlots[0].x)],
  ["placardVisibility", false, (a, b) => a.placardVisible !== b.placardVisible],
]
for (const [id, value, predicate] of controlCases) {
  const altered = evaluateVitrine({ items: FIXTURES.two, config: { ...DEFAULTS, [id]: value }, normalizedTime: controlTime, canvas: CANVASES["16:9"] })
  check(predicate(altered, baseline), `control ${id} inert`)
  const reset = evaluateVitrine({ items: FIXTURES.two, config: DEFAULTS, normalizedTime: controlTime, canvas: CANVASES["16:9"] })
  check(JSON.stringify(reset) === JSON.stringify(baseline), `control ${id} reset not exact`)
}

let treatmentDifferences = 0
let maximumNodes = 0
for (const runKind of ["loop", "finite"]) {
  for (let sample = 0; sample <= 100; sample += 1) {
    const state = evaluateVitrine({
      items: FIXTURES.mediaEdge,
      config: DEFAULTS,
      intent: { direction: "forward", spotlightId: "media-edge-003", finaleId: "media-edge-006" },
      normalizedTime: sample / 100,
      canvas: CANVASES["16:9"],
      runKind,
    })
    maximumNodes = Math.max(maximumNodes, state.renderNodeCount)
    treatmentDifferences += state.renderSlots.filter((card) => card.artworkOpacity !== 1 || card.artworkFilter !== "none" || card.artworkBlend !== "normal").length
  }
}
check(treatmentDifferences === 0, `source treatment differs in ${treatmentDifferences} sampled readable/exchange intervals`)
check(maximumNodes <= 2, `sampled maximum nodes ${maximumNodes} exceeds pair bound`)

const many = evaluateVitrine({ items: FIXTURES.many127, config: DEFAULTS, normalizedTime: 0.613, canvas: CANVASES["9:16"] })
check(many.sourceStates.length === 127 && many.renderNodeCount <= 2, "127-source state/bound failed")
const equalityA = evaluateVitrine({ items: FIXTURES.mixed21, config: DEFAULTS, normalizedTime: 0.456789, canvas: CANVASES["4:5"] })
const equalityB = evaluateVitrine({ items: FIXTURES.mixed21, config: DEFAULTS, normalizedTime: 0.456789, canvas: CANVASES["4:5"] })
check(JSON.stringify(equalityA) === JSON.stringify(equalityB), "same-input/time equality failed")

const receipt = {
  sceneId: "vitrine",
  evaluatorVersion: 1,
  vectorCount: vectors.vectors.length,
  pass: failures.length === 0,
  failures,
  loopSeam: { currentStart: seamStart.currentId, currentEnd: seamEnd.currentId },
  reverseMirrorTime: reverseTime,
  sampledTreatmentDifferences: treatmentDifferences,
  sampledMaximumRenderNodes: maximumNodes,
  readback,
}
fs.writeFileSync(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`)
if (failures.length) {
  console.error(failures.join("\n"))
  process.exit(1)
}
console.log(`vitrine verify: PASS (${vectors.vectors.length} vectors)`)
