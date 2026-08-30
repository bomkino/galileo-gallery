import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { CANVASES, DEFAULTS, FIXTURES, evaluateZoetrope, sampleCadence, summarize } from "./evaluator.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const sceneRoot = path.dirname(here)
const vectorsPath = path.join(sceneRoot, "TEST_VECTORS.json")
const evidencePath = path.join(sceneRoot, "evidence", "TEST_VECTOR_READBACK.json")
const vectors = JSON.parse(fs.readFileSync(vectorsPath, "utf8"))
const failures = []
const readback = []

function check(condition, message) { if (!condition) failures.push(message) }
function near(a, b, epsilon = 1e-9) { return Math.abs(a - b) <= epsilon }

for (const vector of vectors.vectors) {
  const items = FIXTURES[vector.input.fixture]
  const state = evaluateZoetrope({
    items,
    config: { ...DEFAULTS, ...(vector.input.config || {}) },
    normalizedTime: vector.input.normalizedTime,
    canvas: CANVASES[vector.input.canvas],
    runKind: vector.input.runKind || "loop",
    reducedMotion: Boolean(vector.input.reducedMotion),
    spotlightId: vector.input.spotlightId || items[Math.min(2, items.length - 1)]?.id,
    finaleId: vector.input.finaleId || items.at(-1)?.id,
  })
  const summary = summarize(state)
  readback.push({ id: vector.id, summary })
  for (const [key, value] of Object.entries(vector.expect)) {
    check(JSON.stringify(summary[key]) === JSON.stringify(value), `${vector.id}: expected ${key}=${JSON.stringify(value)}, got ${JSON.stringify(summary[key])}`)
  }
  check(state.cards.every((card) => card.artworkOpacity === 1 && card.artworkFilter === "none" && card.artworkBlend === "normal"), `${vector.id}: source fidelity contract drift`)
  check(state.renderNodeCount <= state.maxObservedNodes, `${vector.id}: node budget exceeded`)
  check(new Set(state.cards.map((card) => card.id)).size === state.cards.length, `${vector.id}: source identity duplicated in evaluator state`)
}

const start = evaluateZoetrope({ items: FIXTURES.ordinary6, config: DEFAULTS, normalizedTime: 0, canvas: CANVASES["16:9"] })
const end = evaluateZoetrope({ items: FIXTURES.ordinary6, config: DEFAULTS, normalizedTime: 1, canvas: CANVASES["16:9"] })
check(near(start.phase, end.phase), "loop start/end phase mismatch")
for (const card of start.cards) {
  const other = end.cards.find((candidate) => candidate.id === card.id)
  check(Boolean(other) && near(card.x, other.x) && near(card.y, other.y) && near(card.depth, other.depth), `loop seam mismatch for ${card.id}`)
}

const forward = evaluateZoetrope({ items: FIXTURES.ordinary6, config: { ...DEFAULTS, direction: "forward" }, normalizedTime: 0.237, canvas: CANVASES["16:9"] })
const reverse = evaluateZoetrope({ items: FIXTURES.ordinary6, config: { ...DEFAULTS, direction: "reverse" }, normalizedTime: 0.237, canvas: CANVASES["16:9"] })
check(near(forward.phase, ((1 - reverse.phase) % 1 + 1) % 1), "reverse is not exact phase inverse")

const controlCases = [
  ["cylinderRadius", 0.47, (a, b) => a.cards.some((card, index) => !near(card.x, b.cards[index].x))],
  ["cardSize", 0.41, (a, b) => a.cards.some((card, index) => !near(card.width, b.cards[index].width))],
  ["ringTiltDeg", 7, (a, b) => a.cards.some((card, index) => !near(card.y, b.cards[index].y))],
  ["cadenceCharacter", "flywheel", (a, b) => !near(a.phase, b.phase)],
  ["direction", "reverse", (a, b) => !near(a.phase, b.phase)],
]
const baseline = evaluateZoetrope({ items: FIXTURES.ordinary6, config: DEFAULTS, normalizedTime: 0.119, canvas: CANVASES["16:9"] })
for (const [id, value, changed] of controlCases) {
  const altered = evaluateZoetrope({ items: FIXTURES.ordinary6, config: { ...DEFAULTS, [id]: value }, normalizedTime: 0.119, canvas: CANVASES["16:9"] })
  check(changed(altered, baseline), `control ${id} has no declared causal output`)
  const reset = evaluateZoetrope({ items: FIXTURES.ordinary6, config: DEFAULTS, normalizedTime: 0.119, canvas: CANVASES["16:9"] })
  check(JSON.stringify(summarize(reset)) === JSON.stringify(summarize(baseline)), `control ${id} reset is not exact`)
}

const sampling = [24, 30, 60].map((fps) => sampleCadence({ count: 6, fps, character: "ratchet", durationSeconds: 2.58 }))
for (const result of sampling) {
  check(result.gateSamples >= 3, `${result.fps} fps: fewer than three gate-dwell samples`)
  check(result.maxAngularStepDeg < 18, `${result.fps} fps: angular sample step too large (${result.maxAngularStepDeg})`)
}

const equalityA = evaluateZoetrope({ items: FIXTURES.mixed20, config: DEFAULTS, normalizedTime: 0.456789, canvas: CANVASES["4:5"] })
const equalityB = evaluateZoetrope({ items: FIXTURES.mixed20, config: DEFAULTS, normalizedTime: 0.456789, canvas: CANVASES["4:5"] })
check(JSON.stringify(equalityA) === JSON.stringify(equalityB), "same input/time did not yield byte-equal JSON")

const receipt = {
  sceneId: "zoetrope",
  evaluatorVersion: 1,
  vectorCount: vectors.vectors.length,
  pass: failures.length === 0,
  failures,
  sampling: sampling.map(({ fps, frameCount, maxAngularStepDeg, gateSamples }) => ({ fps, frameCount, maxAngularStepDeg, gateSamples })),
  loopSeam: { phaseStart: start.phase, phaseEnd: end.phase },
  readback,
}
fs.writeFileSync(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`)
if (failures.length) {
  console.error(failures.join("\n"))
  process.exit(1)
}
console.log(`zoetrope verify: PASS (${vectors.vectors.length} vectors)`)
