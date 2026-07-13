const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..")
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")
const fail = (message) => {
    console.error(`FAIL: ${message}`)
    process.exitCode = 1
}

const registry = read("src/styleRegistry.ts")
const profiles = read("src/styleProfiles.ts")
const renderer = read("src/GalleryRenderer.tsx")
const defaults = read("src/defaults.ts")
const types = read("src/types.ts")
const css = read("src/styles.css")
const electron = read("electron/main.cjs")

const ids = [...registry.matchAll(/\{ id: "([^"]+)"/g)].map((match) => match[1])
if (ids.length !== 29) fail(`expected 29 styles; found ${ids.length}`)
if (ids.includes("rate-card")) fail("Rate Card must not be a motion world")
for (const id of ids) {
    if (!profiles.includes(`id: "${id}"`)) fail(`${id} has no style profile`)
}

const sceneRows = [...registry.matchAll(/^    \["[^"]+",/gm)]
if (sceneRows.length !== 17) fail(`expected 17 curated scenes; found ${sceneRows.length}`)
if (!registry.includes('"stack", "Stack"') || !registry.includes('"orbit", "Orbit"')) fail("merged scene families missing")
if (!renderer.includes("smootherstep") || !renderer.includes("edgeFade")) fail("continuous motion primitives missing")
if (!css.includes("transform-style:preserve-3d")) fail("depth-preserving card transforms missing")

if (!/playKind: "repeat"[\s\S]*repeatCount: 5/.test(defaults)) fail("safe Repeat x5 baseline missing")
if (!/spotlightsEnabled: false[\s\S]*finaleEnabled: false/.test(defaults)) fail("story beats must default off")
if (!/axis: "horizontal"/.test(defaults) || !/axis: "horizontal" \| "vertical"/.test(types)) fail("horizontal/vertical motion axis missing")
if (!/ExportQuality = "master" \| "high" \| "optimized"/.test(types)) fail("Master export type missing")
if (!/\.studio \{[\s\S]*overflow: auto;/.test(css)) fail("Studio has no scroll owner")
if (!css.includes(".style-gallery-shell { width:100%; height:100%; min-height:0; overflow:auto;")) fail("Home gallery has no bounded scroll owner")
if (!/master \? "3"/.test(electron)) fail("opaque Premiere Master must use ProRes 422 HQ profile 3")
if (!/master \? "5" : "4"/.test(electron)) fail("transparent Master must use ProRes 4444 XQ profile 5")
for (const tag of ["color_primaries", "color_trc", "colorspace", "color_range"]) {
    if (!electron.includes(`"-${tag}"`)) fail(`export color tag missing: ${tag}`)
}

if (!process.exitCode) console.log("Verified: 17 scenes / 29 source presets, continuous 3D motion, safe defaults, both scroll owners, axes, Master ProRes, Rec.709 tags.")
