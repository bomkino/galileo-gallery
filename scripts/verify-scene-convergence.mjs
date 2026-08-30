import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

import {
  ALL_STYLE_VARIANTS,
  GALLERY_STYLES,
  galleryScene,
  sceneVariants,
} from "../src/styleRegistry.ts"

const parityDirectory = resolve("src/scenes/parity")
const moduleNames = (await readdir(parityDirectory))
  .filter((name) => name.endsWith(".ts"))
  .sort()

assert.equal(moduleNames.length, 29, "expected exactly 29 source Scene adapters")

const contracts = []
for (const moduleName of moduleNames) {
  const moduleUrl = pathToFileURL(resolve(parityDirectory, moduleName)).href
  const { scene } = await import(moduleUrl)
  assert.ok(scene, `${moduleName} does not export a Scene contract`)
  contracts.push(scene)
}

const contractIds = contracts.map(({ id }) => id).sort()
const variantIds = ALL_STYLE_VARIANTS.map(({ id }) => id).sort()
const galleryIds = GALLERY_STYLES.map(({ id }) => id).sort()

assert.equal(new Set(contractIds).size, 29, "duplicate adapter Scene identity")
assert.equal(new Set(variantIds).size, 29, "duplicate Product style identity")
assert.equal(new Set(galleryIds).size, 29, "duplicate Product catalogue identity")
assert.deepEqual(variantIds, contractIds, "Product style registry and adapters diverged")
assert.deepEqual(galleryIds, contractIds, "Product catalogue and adapters diverged")

const settings = {
  canvasWidth: 960,
  canvasHeight: 540,
  paceMs: 1000,
  direction: "forward",
  transitionDirection: "left",
  playKind: "repeat",
  axis: "horizontal",
  imageFit: "contain",
  slideHeight: 44,
  gap: 30,
  backgroundStyle: "transparent",
  ground: "#11110f",
  radius: 8,
  captionGap: 12,
}

const results = []
for (const scene of contracts) {
  const sourceBytes = await readFile(resolve(scene.sourcePath))
  assert.equal(
    createHash("sha256").update(sourceBytes).digest("hex"),
    scene.sourceSha256,
    `${scene.id}: frozen evaluator hash drifted`,
  )

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
  const config = { styleId: scene.id, sceneVersion: 1, items, settings }
  const durationMs = scene.durationMs(config)
  assert.ok(Number.isFinite(durationMs) && durationMs > 0, `${scene.id}: invalid duration`)

  const evaluate = (sceneParameters) => scene.evaluate({
    config: sceneParameters ? { ...config, sceneParameters } : config,
    timeMs: durationMs * 0.413,
    durationMs,
  })
  const baseline = evaluate()
  assert.equal(baseline.sceneId, scene.id, `${scene.id}: renderer identity drifted`)
  assert.ok(baseline.cards.length > 0, `${scene.id}: renderer produced no cards`)
  assert.ok(baseline.cards.every((card) => (
    card.sourceIndex >= 0
    && card.sourceIndex < items.length
    && [card.x, card.y, card.width, card.height, card.scale, card.z, card.opacity].every(Number.isFinite)
    && card.opacity >= 0
    && card.opacity <= 1
    && card.filter === "none"
    && card.blend === "normal"
  )), `${scene.id}: source fidelity or geometry drifted`)

  const control = scene.controls.find((candidate) => {
    if (candidate.type === "range") return Number.isFinite(candidate.min) && candidate.default !== candidate.min
    return candidate.options?.some((option) => option !== candidate.default)
  })
  if (control) {
    const authoredValue = control.type === "range"
      ? control.min
      : control.options.find((option) => option !== control.default)
    const authored = evaluate({ [control.parameter]: authoredValue })
    assert.notEqual(authored.stateHash, baseline.stateHash, `${scene.id}: authored control is inert`)
    assert.deepEqual(evaluate(), baseline, `${scene.id}: authored control reset is not exact`)
  }

  const catalogue = galleryScene(scene.id)
  assert.equal(catalogue.id, scene.id, `${scene.id}: catalogue collapsed Scene identity`)
  assert.deepEqual(sceneVariants(scene.id).map(({ id }) => id), [scene.id], `${scene.id}: catalogue variants are not one-to-one`)

  results.push({
    sceneId: scene.id,
    atelier: scene.atelier,
    sourceSha256: scene.sourceSha256,
    controls: scene.controls.length,
    stateHash: baseline.stateHash,
  })
}

assert.equal(galleryScene("quiet-carousel").id, "quiet-carousel", "Quiet Carousel identity drifted")
assert.ok(!contractIds.includes("quiet-carousel"), "Quiet Carousel must remain outside the 29 source adapters")

console.log(JSON.stringify({
  status: "PASS",
  scenes: results.length,
  ateliers: Object.fromEntries(["A01", "A02", "A03", "A04", "A05", "A06"].map((atelier) => [
    atelier,
    results.filter((result) => result.atelier === atelier).length,
  ])),
  controls: results.reduce((total, result) => total + result.controls, 0),
  results,
}, null, 2))
