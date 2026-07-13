const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-story-"))
const compile = spawnSync(
    process.execPath,
    [path.join(__dirname, "../node_modules/typescript/lib/tsc.js"), "--ignoreConfig", "--outDir", outputDir, "--module", "commonjs", "--target", "es2022", path.join(__dirname, "../src/storyTiming.ts")],
    { encoding: "utf8" }
)
if (compile.status !== 0) throw new Error(compile.error?.message || compile.stderr || compile.stdout || "Could not compile story timing test")

try {
    const { sceneClock, sceneDurationMs, sceneFinaleIndex } = require(path.join(outputDir, "storyTiming.js"))
    const { STYLE_PROFILES } = require(path.join(outputDir, "styleProfiles.js"))
    const items = [0, 1, 2, 3].map((index) => ({
        id: String(index),
        name: String(index),
        type: "image",
        url: "",
        ratio: 16 / 9,
        spotlight: index === 1,
        muted: index === 3,
    }))
    const settings = {
        direction: "forward",
        spotlightsEnabled: true,
        finaleEnabled: true,
        holdMs: 700,
        finaleGrowMs: 300,
        finaleHoldMs: 1200,
    }
    const config = { schemaVersion: 2, styleId: "swipe-stack", items, settings }
    const base = 10000

    assert.equal(sceneFinaleIndex(items), 2, "finale skips muted trailing frames")
    assert.equal(sceneDurationMs(config, base, false), 12200, "loop includes one spotlight and finale dwell")
    assert.equal(sceneDurationMs(config, base, true), 6500, "terminal cycle ends on the finale and holds")

    const spotlight = sceneClock(config, 2600, base, false)
    assert.equal(spotlight.heldIndex, 1, "spotlight genuinely holds its selected frame")
    assert.equal(spotlight.rawPhase, 0.25)

    const finale = sceneClock(config, 5800, base, false)
    assert.equal(finale.heldIndex, 2, "finale genuinely holds the last non-muted frame")
    assert.equal(finale.heldKind, "finale")

    const reverse = { ...config, settings: { ...settings, direction: "reverse", finaleEnabled: false } }
    const reverseSpotlight = sceneClock(reverse, 7600, base, false)
    assert.equal(reverseSpotlight.heldIndex, 1, "reverse playback schedules the same spotlight in reverse time")
    assert.equal(reverseSpotlight.rawPhase, 0.75)

    const build = { ...config, styleId: "the-build", items: [items[0]] }
    const buildEnd = sceneClock(build, sceneDurationMs(build, base, true), base, true)
    assert.equal(buildEnd.rawPhase, 0.72, "Build ends on its authored completed-poster pose")
    assert.equal(buildEnd.heldKind, "finale")

    const compare = { ...config, styleId: "before-after-slider", items: items.slice(0, 2) }
    const compareEnd = sceneClock(compare, sceneDurationMs(compare, base, true), base, true)
    assert.equal(compareEnd.rawPhase, 0.25, "Before/After ends at its most revealing gentle sweep")

    let checkedProfiles = 0
    for (const profile of Object.values(STYLE_PROFILES)) {
        if (profile.id === "opening-reel") continue
        const profileConfig = {
            ...config,
            styleId: profile.id,
            settings: { ...settings, ...(profile.settings || {}), spotlightsEnabled: true, finaleEnabled: true },
        }
        const duration = sceneDurationMs(profileConfig, base, false)
        const samples = Array.from({ length: Math.ceil(duration / 25) + 1 }, (_, index) => sceneClock(profileConfig, index * 25, base, false))
        if (profile.supportsSpotlight) {
            assert(samples.some((clock) => clock.heldKind === "spotlight" && clock.heldIndex === 1), `${profile.id} misses its spotlight hold`)
        }
        if (profile.supportsFinale) {
            assert(samples.some((clock) => clock.heldKind === "finale" && clock.heldIndex === 2), `${profile.id} misses its finale hold`)
            const terminal = sceneClock(profileConfig, sceneDurationMs(profileConfig, base, true), base, true)
            assert.equal(terminal.heldKind, "finale", `${profile.id} terminal cycle does not rest on its finale`)
            assert.equal(terminal.heldIndex, 2, `${profile.id} terminal cycle chooses the wrong frame`)
        }
        checkedProfiles += 1
    }

    console.log(`Verified: holds and finales across ${checkedProfiles} motion profiles, muted-frame selection, reverse timing, Build and Before/After terminal poses.`)
} finally {
    fs.rmSync(outputDir, { recursive: true, force: true })
}
