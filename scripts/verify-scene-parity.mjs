import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"

const sceneId = process.argv[2]
assert.match(sceneId ?? "", /^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Pass one Scene ID")

const moduleUrl = pathToFileURL(resolve(`src/scenes/parity/${sceneId}.ts`)).href
const { scene } = await import(moduleUrl)
assert.equal(scene.id, sceneId)

const sourceBytes = await readFile(resolve(scene.sourcePath))
assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), scene.sourceSha256, "frozen evaluator hash drifted")

const settings = {
  canvasWidth: 960,
  canvasHeight: 540,
  paceMs: 1000,
  direction: "forward",
  axis: "horizontal",
  imageFit: "contain",
  slideHeight: 44,
  gap: 30,
  backgroundStyle: "transparent",
  ground: "#11110f",
  radius: 8,
  captionGap: 12,
}
const items = Array.from({ length: scene.recommendedItems }, (_, index) => ({
  id: `source-${index + 1}`,
  name: `Source ${index + 1}`,
  type: index === 2 ? "video" : "image",
  url: index === 1 ? "alpha.png" : `source-${index + 1}.jpg`,
  ratio: [16 / 9, 4 / 5, 1, 3 / 4, 16 / 10][index % 5],
  caption: "",
  spotlight: false,
  muted: false,
}))
const config = { styleId: sceneId, sceneVersion: 1, items, settings }
const durationMs = scene.durationMs(config)
assert.ok(Number.isFinite(durationMs) && durationMs > 0)

const evaluate = (timeMs, patch = {}) => scene.evaluate({ config: { ...config, ...patch }, timeMs, durationMs })
const start = evaluate(0)
const middle = evaluate(durationMs * 0.413)
const repeat = evaluate(durationMs * 0.413)
const seam = evaluate(durationMs)

assert.equal(start.sceneId, sceneId)
assert.ok(start.cards.length >= items.length, "renderer dropped source identities")
assert.deepEqual(middle, repeat, "same input and story time must be deterministic")
assert.deepEqual([...new Set(start.cards.map((card) => card.sourceIndex))].sort((a, b) => a - b), items.map((_, index) => index), "source identity set changed")
assert.ok(middle.cards.every((card) => [card.x, card.y, card.width, card.height, card.scale, card.z, card.opacity].every(Number.isFinite)), "non-finite geometry")
assert.ok(middle.cards.every((card) => card.opacity === 1 && card.filter === "none" && card.blend === "normal"), "source fidelity drift")
if (scene.looping) assert.equal(start.stateHash, seam.stateHash, "loop seam is discontinuous")

const range = scene.controls.find((control) => control.type === "range" && Number.isFinite(control.min) && Number.isFinite(control.max))
if (range) {
  const low = evaluate(durationMs * 0.413, { sceneParameters: { [range.parameter]: range.min } })
  const high = evaluate(durationMs * 0.413, { sceneParameters: { [range.parameter]: range.max } })
  assert.notEqual(low.stateHash, high.stateHash, `${range.id} control is inert`)
  assert.deepEqual(evaluate(durationMs * 0.413), middle, `${range.id} reset is not exact`)
}

if (sceneId === "cms-slideshow") {
  const compact = scene.evaluate({ config: { ...config, settings: { ...settings, slideHeight: 24, gap: 8 } }, timeMs: durationMs * 0.413, durationMs })
  const generous = scene.evaluate({ config: { ...config, settings: { ...settings, slideHeight: 52, gap: 48 } }, timeMs: durationMs * 0.413, durationMs })
  assert.notEqual(compact.stateHash, generous.stateHash, "visible Product size/gap controls are inert")
}

console.log(JSON.stringify({ status: "PASS", sceneId, sourceSha256: scene.sourceSha256, durationMs, cards: middle.cards.length, controls: scene.controls.length, stateHash: middle.stateHash }))
