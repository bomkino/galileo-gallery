import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { registerHooks } from "node:module"

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
            try {
                return nextResolve(`${specifier}.ts`, context)
            } catch {
                // Let Node report the original unresolved specifier below.
            }
        }
        return nextResolve(specifier, context)
    },
})

const [
    { DEFAULT_SETTINGS },
    { lightTableTimelineFromConfig },
    { productUndoKeys, reconcileProductSceneConfig, resetLightTableControls },
    { LIGHT_TABLE_MAX_DURATION_MS, LIGHT_TABLE_MAX_ITEMS, LIGHT_TABLE_TRANSPARENCY_REASON, minimumLightTableDuration },
    { styleProfile, styleSettings },
    { galleryStyle, latestSceneVersion, supportsSceneVersion, supportsVerifiedPngFrames },
] = await Promise.all([
    import("../src/defaults.ts"),
    import("../src/lightTableConfig.ts"),
    import("../src/productSceneRuntime.ts"),
    import("../src/scenes/lightTable.ts"),
    import("../src/styleProfiles.ts"),
    import("../src/styleRegistry.ts"),
])

const item = (index) => ({
    id: `source-${index}`,
    name: `Source ${index}`,
    type: index % 3 === 0 ? "video" : "image",
    url: `reel-media://source-${index}`,
    ratio: index % 2 === 0 ? 16 / 9 : 4 / 5,
    aspectMode: "auto",
    ratioW: 16,
    ratioH: 9,
    fit: "contain",
    crop: { x: 0, y: 0, width: 1, height: 1 },
    focal: { x: 0.5, y: 0.5 },
    caption: "",
    spotlight: false,
    muted: false,
})

const config = (count = 6, patch = {}) => {
    const base = {
        schemaVersion: 2,
        styleId: "light-table",
        sceneVersion: 2,
        items: Array.from({ length: count }, (_, index) => item(index + 1)),
        settings: {
            ...structuredClone(DEFAULT_SETTINGS),
            backgroundStyle: "solid",
            ground: "#e8e6de",
            imageFit: "contain",
            direction: "forward",
        },
        timelineMode: "automatic",
        timelineFixedDurationMs: 0,
        timelineSegments: [],
    }
    return { ...base, ...patch, settings: { ...base.settings, ...(patch.settings ?? {}) } }
}

assert.equal(latestSceneVersion("light-table"), 2)
assert.equal(supportsSceneVersion("light-table", 1), true)
assert.equal(supportsSceneVersion("light-table", 2), true)
assert.equal(supportsSceneVersion("light-table", 3), false)
assert.equal(supportsVerifiedPngFrames("light-table", 2), false)
assert.equal(galleryStyle("light-table").minItems, 1)
assert.equal(galleryStyle("light-table").source, "LightTableRenderer.tsx")

const v1 = styleProfile("light-table", 1)
const v2 = styleProfile("light-table", 2)
assert.equal(v1.recommendedItems, 5)
assert.equal(v1.directional, false)
assert.equal(v2.recommendedItems, 6)
assert.equal(v2.directional, true)
assert.equal(v2.supportsSpotlight, false)
assert.equal(v2.supportsFinale, false)
assert.equal(v2.transparentReady, false)
assert.deepEqual(
    Object.fromEntries(["tableSpread", "overlap", "underlightStrength", "focusBehavior", "nudgeRestraint", "imageFit", "theme", "ground", "backgroundStyle"].map((key) => [key, styleSettings("light-table", 2)[key]])),
    {
        tableSpread: 0.72,
        overlap: 0.1,
        underlightStrength: 0.42,
        focusBehavior: "route",
        nudgeRestraint: 0.28,
        imageFit: "contain",
        theme: "light",
        ground: "#e8e6de",
        backgroundStyle: "solid",
    },
)

assert.equal(reconcileProductSceneConfig(config(1)).items.length, 1)
assert.equal(reconcileProductSceneConfig(config(LIGHT_TABLE_MAX_ITEMS)).items.length, LIGHT_TABLE_MAX_ITEMS)
assert.throws(() => reconcileProductSceneConfig(config(0)), /at least one source/)
assert.throws(() => reconcileProductSceneConfig(config(LIGHT_TABLE_MAX_ITEMS + 1)), /up to 24 sources/)
assert.throws(
    () => reconcileProductSceneConfig(config(1, { settings: { backgroundStyle: "transparent" } })),
    (error) => error instanceof Error && error.message === LIGHT_TABLE_TRANSPARENCY_REASON,
)
const legacy = { ...config(1), sceneVersion: 1, settings: { ...config(1).settings, backgroundStyle: "transparent" } }
assert.equal(reconcileProductSceneConfig(legacy), legacy, "Light Table v1 remains a pass-through legacy scene")

assert.deepEqual(
    [...productUndoKeys(config(1))],
    ["tableSpread", "overlap", "underlightStrength", "focusBehavior", "nudgeRestraint"],
)
const reset = resetLightTableControls(config(1, {
    settings: { tableSpread: 0.9, overlap: 0.2, underlightStrength: 0.7, focusBehavior: "none", nudgeRestraint: 0.6 },
    timelineMode: "fixed-duration",
    timelineFixedDurationMs: 20_000,
}))
assert.deepEqual(
    [reset.settings.tableSpread, reset.settings.overlap, reset.settings.underlightStrength, reset.settings.focusBehavior, reset.settings.nudgeRestraint],
    [0.72, 0.1, 0.42, "route", 0.28],
)
assert.deepEqual([reset.settings.backgroundStyle, reset.settings.ground, reset.timelineMode, reset.timelineFixedDurationMs, reset.timelineSegments], ["solid", "#e8e6de", "automatic", 0, []])

const automatic = lightTableTimelineFromConfig(config(6), 30)
assert.equal(automatic.mode, "automatic")
assert.equal(automatic.durationMs, 10_000)
const fixed = lightTableTimelineFromConfig(config(6, { timelineMode: "fixed-duration", timelineFixedDurationMs: minimumLightTableDuration(6), timelineSegments: [] }), 30)
assert.equal(fixed.durationMs, minimumLightTableDuration(6))
const fractionalSecondFixed = lightTableTimelineFromConfig(config(6, { timelineMode: "fixed-duration", timelineFixedDurationMs: 12_345.5, timelineSegments: [] }), 30)
assert.deepEqual([fractionalSecondFixed.durationMs, fractionalSecondFixed.frameCount], [12_345.5, 371])
const directedSegments = automatic.phases.map((phase) => ({
    id: phase.id,
    kind: phase.id === "final-inspection" ? "hold" : "cycle",
    cycles: 1,
    paceScale: phase.id === "wake" || phase.id === "return" ? 2 : 1,
    durationMs: phase.endMs - phase.startMs,
}))
const directed = lightTableTimelineFromConfig(config(6, { timelineMode: "directed", timelineFixedDurationMs: 0, timelineSegments: directedSegments }), 30)
assert.equal(directed.mode, "directed")
assert.ok(directed.durationMs <= LIGHT_TABLE_MAX_DURATION_MS)
assert.deepEqual(directed.phases.map((phase) => [phase.id, phase.requestedPaceScale]), [["wake", 2], ["review", 1], ["final-inspection", 1], ["return", 2]])
assert.deepEqual(directed.phases.map((phase) => phase.endMs - phase.startMs), directedSegments.map((segment) => segment.durationMs), "portable directed phase boundaries must drive evaluation exactly")

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")
const runtime = readFileSync(new URL("../src/productSceneRuntime.ts", import.meta.url), "utf8")
const renderer = readFileSync(new URL("../src/scenes/LightTableRenderer.tsx", import.meta.url), "utf8")
assert.match(app, /const authoredProductScene = authoredVitrine \|\| authoredShelf \|\| authoredLightTable/)
assert.match(app, /reducedProductPreview = authoredProductScene && systemReducedMotion/)
assert.match(app, /isAuthoredVitrine\(config\) \|\| isShelfV2\(config\) \|\| isLightTableV2\(config\)/)
assert.match(app, /productSceneDuration\(config, fps\)/)
assert.match(app, /Light Table supports at most.*ordered media items\. Nothing was added\./)
assert.match(app, /Light Table needs at least one ordered media item\. The last frame was kept\./)
assert.match(app, /style\.id === "light-table" && sceneVersion === 2[\s\S]{0,1800}backgroundStyle: "solid" as const/)
assert.match(app, /options=\{authoredShelf \|\| authoredLightTable \|\| config\.settings\.playKind === "loop"/)
assert.match(app, /timelineMode: "directed", timelineFixedDurationMs: 0, timelineSegments: \[\]/)
assert.match(app, /Wake ×2 → review ×1 → final inspection hold → return ×2/)
assert.match(app, /disabled=\{authoredLightTable && style === "transparent"\}/)
assert.match(app, /Light Table v2 export is unavailable until its rendered output is verified\./)
assert.match(app, /disabled=\{authoredLightTable \|\| Boolean\(isExporting\)/)
assert.match(app, /authoredLightTable[\s\S]{0,100}\? lightTableFrameCount\(playbackDuration, fps\)/)
assert.match(app, /document\.querySelector\('\[data-media-failed="true"\]'\)[\s\S]{0,100}Export source media could not be decoded/)
assert.match(renderer, /if \(!source\) return <div className="light-table-placeholder" data-media-failed=\{exportMode \? "true" : undefined\}/)
assert.match(renderer, /data-media-failed="true"[\s\S]{0,180}SOURCE FRAME REQUIRED/)
assert.match(renderer, /data-media-failed=\{exportMode \? "true" : undefined\}[\s\S]{0,180}SOURCE UNAVAILABLE/)
assert.equal(renderer.match(/data-media-failed=\{exportMode \? "true" : undefined\}/g)?.length, 2, "every image-source failure placeholder must fail closed only in export mode")
assert.match(runtime, /if \(isLightTableV2\(config\)\) return validateLightTableRuntimeConfig\(config\)\.config/)
assert.match(runtime, /if \(isLightTableV2\(config\)\) return LIGHT_TABLE_UNDO_KEYS/)

for (const [label, key, minimum, maximum, step] of [
    ["Table spread", "tableSpread", 0.52, 0.92, 0.01],
    ["Overlap", "overlap", 0, 0.22, 0.01],
    ["Under-light", "underlightStrength", 0, 0.7, 0.01],
    ["Nudge restraint", "nudgeRestraint", 0, 0.6, 0.01],
]) {
    assert.match(app, new RegExp(`label="${label}"[\\s\\S]{0,180}min=\\{${minimum}\\}[\\s\\S]{0,80}max=\\{${maximum}\\}[\\s\\S]{0,80}step=\\{${step}\\}[\\s\\S]{0,220}beginProductSetting\\("${key}"\\)[\\s\\S]{0,220}endProductSetting\\("${key}"\\)`))
}
assert.match(app, /label="Focus behavior"[\s\S]{0,350}value: "route"[\s\S]{0,180}value: "loupe-only"[\s\S]{0,180}value: "none"[\s\S]{0,180}updateSettings\("focusBehavior"/)
assert.match(app, /Reset Light Table controls/)

console.log("Light Table App contract checks passed")
