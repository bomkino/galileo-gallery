import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { DEFAULT_SETTINGS } from "../src/defaults.ts"
import { effectiveShelfRatio, reconcileShelfConfig, validateShelfRuntimeConfig } from "../src/shelfConfig.ts"
import { galleryStyle, latestSceneVersion, supportsSceneVersion } from "../src/styleRegistry.ts"
import { SHELF_MAX_ITEMS } from "../src/scenes/shelf.ts"

const item = (index, patch = {}) => ({
    id: `edition-${index}`,
    name: `Edition ${index}`,
    type: "image",
    url: `reel-media://edition-${index}`,
    ratio: index % 2 ? 4 / 5 : 16 / 9,
    aspectMode: "auto",
    ratioW: 16,
    ratioH: 9,
    fit: "contain",
    crop: { x: 0, y: 0, width: 1, height: 1 },
    focal: { x: 0.5, y: 0.5 },
    spotlight: false,
    muted: false,
    ...patch,
})

const settings = {
    ...DEFAULT_SETTINGS,
    canvasWidth: 960,
    canvasHeight: 540,
    ratioMode: "auto",
    axis: "horizontal",
    slideHeight: 42,
    gap: 34,
    tilt: 2.5,
    centerBump: 8,
    paceMs: 1_650,
    playKind: "loop",
    repeatCount: 3,
    spotlightsEnabled: false,
    finaleEnabled: true,
    theme: "dark",
    backgroundStyle: "solid",
}

const config = (patch = {}) => ({
    schemaVersion: 2,
    styleId: "the-shelf",
    sceneVersion: 2,
    items: [item(1), item(2)],
    settings,
    timelineMode: "automatic",
    timelineFixedDurationMs: 0,
    timelineSegments: [],
    ...patch,
})

assert.equal(latestSceneVersion("the-shelf"), 2)
assert.equal(supportsSceneVersion("the-shelf", 2), true)
assert.equal(supportsSceneVersion("the-shelf", 1), false)
assert.equal(galleryStyle("the-shelf").minItems, 1)
assert.equal(galleryStyle("the-shelf").source, "ShelfRenderer.tsx")

assert.doesNotThrow(() => validateShelfRuntimeConfig(config()))
assert.throws(() => validateShelfRuntimeConfig(config({ items: [] })), /ordered media/)
assert.throws(() => validateShelfRuntimeConfig(config({ items: Array.from({ length: SHELF_MAX_ITEMS + 1 }, (_, index) => item(index + 1)) })), /ordered media/)
assert.throws(() => reconcileShelfConfig(config({ settings: { ...settings, ratioMode: "fixed" } })), /natural ratio/)
assert.throws(() => reconcileShelfConfig(config({ settings: { ...settings, theme: "auto" } })), /explicit solid room/)
assert.throws(() => reconcileShelfConfig(config({ settings: { ...settings, backgroundStyle: "gradient" } })), /explicit solid room/)
assert.throws(() => reconcileShelfConfig(config({ items: [item(1, { aspectMode: "custom" })] })), /natural ratio/)
assert.equal(effectiveShelfRatio(item(1, { crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } }), settings), 4 / 5)

const invalidSaved = config({
    items: [item(1, { aspectMode: "custom" })],
    settings: { ...settings, ratioMode: "fixed" },
})
assert.throws(() => reconcileShelfConfig(invalidSaved), /natural ratio/)

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")
const expert = readFileSync(new URL("../src/ExpertControls.tsx", import.meta.url), "utf8")
const productRuntime = readFileSync(new URL("../src/productSceneRuntime.ts", import.meta.url), "utf8")
const profiles = readFileSync(new URL("../src/styleProfiles.ts", import.meta.url), "utf8")
assert.equal((app.match(/setConfigState\(/g) ?? []).length, 1, "App must have one synchronous config writer")
assert.equal((app.match(/\bsetConfig\(/g) ?? []).length, 0, "legacy async config setters must not bypass config authority")
assert.match(app, /configRef\.current = next[\s\S]*configEpochRef\.current \+= 1[\s\S]*setConfigState\(next\)/)
assert.match(app, /Project changed while media was being prepared\. Nothing was added\./)
assert.match(app, /Project changed while opening\. The opened candidate was not applied\./)
assert.match(app, /Shelf needs at least one ordered media item\. The last edition was kept\./)
assert.match(app, /items: current\.items\.map\(\(item\) => \(\{ \.\.\.item, aspectMode: "auto" as const \}\)\)/)
assert.match(app, /ratioMode: "auto" as const/)
assert.match(app, /backgroundStyle: defaults\.backgroundStyle === "transparent"/)
assert.match(productRuntime, /const SHELF_UNDO_KEYS = new Set<keyof ReelSettings>\(\[[\s\S]*"slideHeight"[\s\S]*"gap"[\s\S]*"tilt"[\s\S]*"centerBump"[\s\S]*"direction"/)
assert.match(productRuntime, /ratioMode: "auto"[\s\S]*axis: "horizontal"[\s\S]*theme: config\.settings\.theme === "light"[\s\S]*backgroundStyle: config\.settings\.backgroundStyle === "transparent"/)
assert.match(productRuntime, /items: config\.items\.map\(\(item\) => \(\{ \.\.\.item, aspectMode: "auto" as const \}\)\)/)
assert.match(profiles, /const SHELF_V2_PROFILE[\s\S]*ratioMode: "auto"[\s\S]*slideHeight: 42[\s\S]*gap: 34[\s\S]*tilt: 2\.5[\s\S]*centerBump: 8/)

for (const [label, key, minimum, maximum, step] of [
    ["Card height", "slideHeight", 28, 58, 1],
    ["Breathing room", "gap", 8, 120, 1],
    ["Edition lean", "tilt", 0, 6, 0.25],
    ["Shelf lift", "centerBump", 3, 14, 0.5],
]) {
    const control = new RegExp(`label="${label}"[\\s\\S]{0,300}min=\\{${minimum}\\}[\\s\\S]{0,100}max=\\{${maximum}\\}[\\s\\S]{0,100}step=\\{${step}\\}[\\s\\S]{0,250}beginProductSetting\\("${key}"\\)[\\s\\S]{0,250}endProductSetting\\("${key}"\\)`)
    assert.match(app, control)
    const expertControl = new RegExp(`label="${label}"[\\s\\S]{0,300}min=\\{${minimum}\\}[\\s\\S]{0,100}max=\\{${maximum}\\}[\\s\\S]{0,100}step=\\{${step}\\}[\\s\\S]{0,250}onSettingStart\\?\.\\("${key}"\\)[\\s\\S]{0,250}onSettingEnd\\?\.\\("${key}"\\)`)
    assert.match(expert, expertControl)
}

assert.match(expert, /Shelf keeps every plane at its detected natural source ratio/)
assert.match(expert, /Crop, fit, and focal point change only the pixels inside this plane/)
assert.match(app, /productSceneUndoDepth/)
assert.match(app, /vitrineUndoDepth/)
assert.match(app, /productUndoKeys\(before\)\?\.has\(key\)/)

console.log("Shelf App contract checks passed")
