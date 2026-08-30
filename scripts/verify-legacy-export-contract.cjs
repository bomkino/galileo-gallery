const assert = require("node:assert/strict")
const { assertLegacyExportScene } = require("../electron/legacy-export-contract.cjs")

const request = (styleId, sceneVersion) => ({ config: { styleId, sceneVersion } })
assert.doesNotThrow(() => assertLegacyExportScene(request("quiet-carousel", 1)))
assert.doesNotThrow(() => assertLegacyExportScene(request("vitrine", 2)))
assert.doesNotThrow(() => assertLegacyExportScene(request("the-shelf", 1)))
assert.throws(
    () => assertLegacyExportScene(request("the-shelf", 2)),
    /Shelf v2 export is unavailable until its source-video clock and rendered output are verified/,
)
assert.throws(() => assertLegacyExportScene(null), /invalid/)
console.log("Verified: legacy export fails closed for Shelf v2 before allocating output work.")
