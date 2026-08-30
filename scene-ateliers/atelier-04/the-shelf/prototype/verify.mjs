import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { CANVASES, DEFAULTS, FIXTURES, evaluateShelf, recyclingSeamProbe, summarize } from "./evaluator.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const sceneRoot = path.dirname(here)
const vectors = JSON.parse(fs.readFileSync(path.join(sceneRoot, "TEST_VECTORS.json"), "utf8"))
const evidencePath = path.join(sceneRoot, "evidence", "TEST_VECTOR_READBACK.json")
const failures = []
const readback = []
const check = (condition, message) => { if (!condition) failures.push(message) }
const near = (a, b, epsilon = 1e-8) => Math.abs(a - b) <= epsilon
const poseDigest = (state) => state.renderSlots.map((slot) => ({ id: slot.id, copyIndex: slot.copyIndex, x: slot.x, y: slot.y, width: slot.width, height: slot.height, leanDeg: slot.leanDeg, lift: slot.lift }))
const poseSetsNear = (left, right) => left.length === right.length && left.every((a, index) => {
  const b = right[index]
  return a.id === b.id && a.copyIndex === b.copyIndex && near(a.x, b.x) && near(a.y, b.y) && near(a.width, b.width) && near(a.height, b.height) && near(a.leanDeg, b.leanDeg) && near(a.lift, b.lift)
})

for (const vector of vectors.vectors) {
  const items = FIXTURES[vector.input.fixture]
  const state = evaluateShelf({
    items,
    config: { ...DEFAULTS, ...(vector.input.config || {}) },
    intent: { spotlightId: vector.input.spotlightId, finaleId: vector.input.finaleId },
    normalizedTime: vector.input.normalizedTime,
    canvas: CANVASES[vector.input.canvas],
    runKind: vector.input.runKind || "loop",
    reducedMotion: Boolean(vector.input.reducedMotion),
  })
  const summary = summarize(state)
  readback.push({ id: vector.id, summary })
  for (const [key, value] of Object.entries(vector.expect)) check(JSON.stringify(summary[key]) === JSON.stringify(value), `${vector.id}: expected ${key}=${JSON.stringify(value)}, got ${JSON.stringify(summary[key])}`)
  check(state.sourceStates.length === items.length, `${vector.id}: complete Project media state missing`)
  check(state.renderNodeCount <= state.maxObservedNodes, `${vector.id}: observed node budget exceeded`)
  check(new Set(state.renderSlots.map((slot) => slot.id)).size === state.renderSlots.length, `${vector.id}: one Project media identity visibly duplicated`)
  check(state.sourceStates.every((source) => source.artworkOpacity === 1 && source.artworkFilter === "none" && source.artworkBlend === "normal"), `${vector.id}: source treatment drift`)
  for (const slot of state.renderSlots) {
    const source = state.sourceStates[slot.sourceIndex]
    check(near(slot.width / slot.height, source.ratio, 1e-9), `${vector.id}: natural ratio changed for ${slot.id}`)
  }
}

const start = evaluateShelf({ items: FIXTURES.ordinary8, config: DEFAULTS, normalizedTime: 0, canvas: CANVASES["16:9"] })
const end = evaluateShelf({ items: FIXTURES.ordinary8, config: DEFAULTS, normalizedTime: 1, canvas: CANVASES["16:9"] })
check(JSON.stringify(poseDigest(start)) === JSON.stringify(poseDigest(end)), "loop end/start seam mismatch")
check(near(start.phase, end.phase), "loop phase seam mismatch")

const reverseTime = 0.231
const reverse = evaluateShelf({ items: FIXTURES.ordinary8, config: { ...DEFAULTS, direction: "reverse" }, normalizedTime: reverseTime, canvas: CANVASES["16:9"] })
const forwardMirror = evaluateShelf({ items: FIXTURES.ordinary8, config: DEFAULTS, normalizedTime: 1 - reverseTime, canvas: CANVASES["16:9"] })
check(poseSetsNear(poseDigest(reverse), poseDigest(forwardMirror)), "loop exact reverse mismatch")

const finiteReverse = evaluateShelf({ items: FIXTURES.ordinary8, config: { ...DEFAULTS, direction: "reverse" }, intent: { spotlightId: "ordinary-004", finaleId: "ordinary-008" }, normalizedTime: 0.23, canvas: CANVASES["16:9"], runKind: "finite" })
const finiteMirror = evaluateShelf({ items: FIXTURES.ordinary8, config: DEFAULTS, intent: { spotlightId: "ordinary-004", finaleId: "ordinary-008" }, normalizedTime: 0.77, canvas: CANVASES["16:9"], runKind: "finite" })
check(poseSetsNear(poseDigest(finiteReverse), poseDigest(finiteMirror)), "finite exact reverse mismatch")

for (const time of [0.13, 0.27, 0.44, 0.81]) {
  const state = evaluateShelf({ items: FIXTURES.mixed21, config: DEFAULTS, normalizedTime: time, canvas: CANVASES["16:9"] })
  for (const slot of state.renderSlots) check(near(slot.bottomY, state.baselineY), `baseline drift ${slot.id} at ${time}`)
}

const leanA = evaluateShelf({ items: FIXTURES.ordinary8, config: DEFAULTS, normalizedTime: 0.11, canvas: CANVASES["16:9"] })
const leanB = evaluateShelf({ items: FIXTURES.ordinary8, config: DEFAULTS, normalizedTime: 0.67, canvas: CANVASES["16:9"] })
for (const source of leanA.sourceStates) {
  const other = leanB.sourceStates.find((entry) => entry.id === source.id)
  check(Boolean(other) && near(source.baseLeanDeg, other.baseLeanDeg), `identity lean unstable for ${source.id}`)
}

const spotlightA = evaluateShelf({ items: FIXTURES.ordinary8, config: DEFAULTS, intent: { spotlightId: "ordinary-004", finaleId: "ordinary-008" }, normalizedTime: 0.56, canvas: CANVASES["16:9"], runKind: "finite" })
const spotlightB = evaluateShelf({ items: FIXTURES.ordinary8, config: DEFAULTS, intent: { spotlightId: "ordinary-004", finaleId: "ordinary-008" }, normalizedTime: 0.68, canvas: CANVASES["16:9"], runKind: "finite" })
check(near(spotlightA.phase, spotlightB.phase), "track did not hold causally during Spotlight")
const focused = spotlightA.renderSlots.find((slot) => slot.id === "ordinary-004")
check(Boolean(focused) && near(focused.leanDeg, 0) && near(focused.lift, CANVASES["16:9"].height * DEFAULTS.spotlightLift), "Spotlight did not straighten/lift selected print")

const baselineControl = evaluateShelf({ items: FIXTURES.ordinary8, config: DEFAULTS, intent: { spotlightId: "ordinary-004", finaleId: "ordinary-008" }, normalizedTime: 0.60, canvas: CANVASES["16:9"], runKind: "finite" })
const controlCases = [
  ["cardHeight", 0.56, (a, b) => !near(a.sourceStates[0].height, b.sourceStates[0].height)],
  ["gap", 110, (a, b) => !near(a.trackLength, b.trackLength)],
  ["leanAmount", 5.5, (a, b) => !near(a.sourceStates[0].baseLeanDeg, b.sourceStates[0].baseLeanDeg)],
  ["direction", "reverse", (a, b) => !near(a.phase, b.phase) || a.phrase !== b.phrase],
  ["spotlightLift", 0.13, (a, b) => {
    const af = a.renderSlots.find((slot) => slot.id === "ordinary-004")
    const bf = b.renderSlots.find((slot) => slot.id === "ordinary-004")
    return Boolean(af && bf) && !near(af.lift, bf.lift)
  }],
]
for (const [id, value, predicate] of controlCases) {
  const altered = evaluateShelf({ items: FIXTURES.ordinary8, config: { ...DEFAULTS, [id]: value }, intent: { spotlightId: "ordinary-004", finaleId: "ordinary-008" }, normalizedTime: 0.60, canvas: CANVASES["16:9"], runKind: "finite" })
  check(predicate(altered, baselineControl), `control ${id} inert`)
  const reset = evaluateShelf({ items: FIXTURES.ordinary8, config: DEFAULTS, intent: { spotlightId: "ordinary-004", finaleId: "ordinary-008" }, normalizedTime: 0.60, canvas: CANVASES["16:9"], runKind: "finite" })
  check(JSON.stringify(reset) === JSON.stringify(baselineControl), `control ${id} reset not exact`)
}

const seamProbe = recyclingSeamProbe(FIXTURES.many127, CANVASES["16:9"], DEFAULTS)
check(seamProbe.length === 127, "did not locate every 127-source recycling seam")
for (const seam of seamProbe) check(seam.seamOutsideVisibleStage, `recycling seam visible for ${seam.id}`)

const one = evaluateShelf({ items: FIXTURES.one, config: DEFAULTS, normalizedTime: 0.47, canvas: CANVASES["16:9"] })
check(one.renderNodeCount === 1 && near(one.renderSlots[0].x, CANVASES["16:9"].width / 2), "one-item shelf is not settled/centred")
const many = evaluateShelf({ items: FIXTURES.many127, config: DEFAULTS, normalizedTime: 0.613, canvas: CANVASES["9:16"] })
check(many.sourceStates.length === 127 && many.renderNodeCount <= 12, "127 portrait bound failed")
const equalityA = evaluateShelf({ items: FIXTURES.mixed21, config: DEFAULTS, normalizedTime: 0.456789, canvas: CANVASES["4:5"] })
const equalityB = evaluateShelf({ items: FIXTURES.mixed21, config: DEFAULTS, normalizedTime: 0.456789, canvas: CANVASES["4:5"] })
check(JSON.stringify(equalityA) === JSON.stringify(equalityB), "same-input/time equality failed")

const receipt = {
  sceneId: "the-shelf",
  evaluatorVersion: 1,
  vectorCount: vectors.vectors.length,
  pass: failures.length === 0,
  failures,
  loopSeam: { phaseStart: start.phase, phaseEnd: end.phase },
  reverseMirrorTime: reverseTime,
  spotlightHold: { phaseA: spotlightA.phase, phaseB: spotlightB.phase, focusedId: focused?.id, lift: focused?.lift, leanDeg: focused?.leanDeg },
  recyclingSeams: seamProbe,
  readback,
}
fs.writeFileSync(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`)
if (failures.length) {
  console.error(failures.join("\n"))
  process.exit(1)
}
console.log(`shelf verify: PASS (${vectors.vectors.length} vectors; ${seamProbe.length} offstage seams)`)
