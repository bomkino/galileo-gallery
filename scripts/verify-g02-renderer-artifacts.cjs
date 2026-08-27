const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(process.argv[2] || "artifacts/g02")
const receipt = JSON.parse(fs.readFileSync(path.join(root, "renderer-receipt.json"), "utf8"))
const hash = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")

assert.equal(receipt.schema, "galileo-gallery-g02-renderer-receipt-v1")
assert.equal(receipt.platform, "linux")
assert.match(receipt.electron, /^43\./)
assert.equal(receipt.journey.order.length, 8)
assert.deepEqual(receipt.journey.order, Array.from({ length: 8 }, (_, index) => `quiet-frame-${String(index + 1).padStart(2, "0")}`))
assert.deepEqual(receipt.journey.modes, [
    { mode: "automatic", durationMs: 8000 },
    { mode: "fixed-duration", durationMs: 14500 },
    { mode: "directed", durationMs: 20000 },
])
assert.equal(receipt.journey.reloaded.canvas, "1080x1350")
assert.equal(receipt.journey.reloaded.axis, "vertical")
assert.equal(receipt.journey.reloaded.direction, "reverse")
assert.equal(receipt.journey.reloaded.fit, "cover")
assert.equal(receipt.journey.reloaded.background, "transparent")
assert.equal(receipt.journey.reloaded.timelineMode, "directed")
assert.match(receipt.journey.notice, /Reloaded exact browser Project/)
assert(receipt.journey.storageBytes > 1000)
assert(Number(receipt.journey.scrubbed.timeMs) > 0)
assert.equal(receipt.journey.afterMotion.frameId, receipt.journey.beforeMotion.frameId)
assert.match(receipt.journey.beforeMotion.frameId, /^quiet-frame-/)
assert(receipt.journey.afterMotion.timeMs - receipt.journey.beforeMotion.timeMs >= 450)
assert.notEqual(receipt.journey.afterMotion.transform, receipt.journey.beforeMotion.transform)
assert.deepEqual(receipt.journey.sourceTreatment, {
    opacity: "1",
    filter: "none",
    mixBlendMode: "normal",
    objectFit: "cover",
})
assert.equal(receipt.journey.failedMedia, 1)
assert.notEqual(receipt.journey.controlEffects.beforeFrameSize.height, receipt.journey.controlEffects.afterFrameSize.height)
assert.notEqual(receipt.journey.controlEffects.beforeGap.transform, receipt.journey.controlEffects.afterGap.transform)
assert.notEqual(receipt.journey.controlEffects.beforeDepth.transform, receipt.journey.controlEffects.afterDepth.transform)
assert(receipt.journey.decodedSources.every((source) => source.naturalWidth > 0 && source.naturalHeight > 0))
const expectedRatios = [16 / 9, 4 / 3, 1, 3 / 4, 16 / 10, 9 / 16, 3 / 2, 4 / 5]
receipt.journey.decodedSources.forEach((source, index) => assert(Math.abs(source.sourceRatio - expectedRatios[index]) < 0.01))
assert(receipt.journey.stage.width > 300 && receipt.journey.stage.height > 300)
assert(receipt.journey.nodeCount < 500)

assert(receipt.keyboardFocus.length >= 8)
assert.equal(receipt.keyboardFocus[0].action, "fixture")
assert.equal(receipt.keyboardFocus[1].action, "save")
assert.equal(receipt.keyboardFocus[2].action, "reload")
const focusKeys = receipt.keyboardFocus.map((step) => [step.tag, step.action, step.control, step.frame, step.text].join(":"))
assert(new Set(focusKeys).size >= 6)
assert(receipt.keyboardFocus.filter((step) => step.tag === "button").length >= 6)

for (const capture of Object.values(receipt.captures)) {
    const target = path.join(root, capture.file)
    assert(fs.statSync(target).size > 10_000)
    assert.equal(hash(target), capture.sha256)
    assert(capture.size.width >= 1080 && capture.size.height >= 700)
}
assert(receipt.captures.alpha.pixels.transparent > 50_000)
assert.equal(receipt.captures.alpha.pixels.contaminatedTransparent, 0)
assert(receipt.captures.alpha.pixels.opaque > 50_000)
assert.equal(
    receipt.captures.alpha.pixels.transparent + receipt.captures.alpha.pixels.partial + receipt.captures.alpha.pixels.opaque,
    receipt.captures.alpha.pixels.total
)

console.log("Verified: real Electron G02 journey, ordered decode, causal controls, all Timeline modes, save/reload, scrub, real-time motion, failed-media order, keyboard focus, screenshots, and transparent pixels.")
