const fs = require("node:fs")
const path = require("node:path")

const SETTINGS = {
    canvasPreset: "fullHD", canvasWidth: 1920, canvasHeight: 1080, ratioMode: "auto", fixedRatio: "sixteenNine",
    customRatioWidth: 16, customRatioHeight: 9, imageFit: "contain", autoplayVideos: true, loopVideos: true,
    paddingUnit: "px", paddingTop: 6, paddingRight: 6, paddingBottom: 6, paddingLeft: 6, captionGap: 10,
    motionPreset: "magnetic", launchMs: 120, arrivalMs: 160, growMs: 420, exitMs: 340, paceMs: 230,
    axis: "horizontal", direction: "forward", startMode: "auto", playKind: "repeat", repeatCount: 5,
    leadInMs: 800, holdMs: 900, finaleGrowMs: 750, finaleHoldMs: 2600, fadeMs: 600, canvasPose: 62,
    spotlightsEnabled: false, finaleEnabled: false, heroSize: 70, finaleSize: 100, centerBump: 5, tilt: 10,
    sway: 70, idleDim: 30, idleMute: 45, spotlightDim: 55, speedBlur: 3, slideHeight: 44, gap: 30,
    cornerStyle: "squircle", cornerSmoothing: 60, radius: 16, shadow: 35, gridSize: 54, gridStrength: 7,
    gridDrift: 30, vignette: 12, showHint: true, theme: "dark", ground: "", paper: "",
    backgroundStyle: "solid", backgroundColor2: "#4a2f2a", backgroundAngle: 145, backgroundTexture: 8,
    exportQuality: "high",
}

function fixtureConfig(media) {
    return {
        schemaVersion: 2,
        styleId: "cms-slideshow",
        timelineMode: "automatic",
        timelineFixedDurationMs: 0,
        timelineSegments: [],
        items: [
            { id: "frame-one", name: "First frame.png", type: "image", url: media[0], ratio: 4 / 3, aspectMode: "auto", ratioW: 16, ratioH: 9, caption: "Opening", spotlight: true, muted: false },
            { id: "frame-two", name: "Second frame.webp", type: "image", url: media[1], ratio: 9 / 16, aspectMode: "custom", ratioW: 9, ratioH: 16, spotlight: false, muted: true },
        ],
        settings: { ...SETTINGS, canvasPreset: "vertical", canvasWidth: 1080, canvasHeight: 1920, axis: "vertical" },
    }
}

function writeMedia(root) {
    const first = path.join(root, "private-source-one.png")
    const second = path.join(root, "private-source-two.webp")
    fs.writeFileSync(first, Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("gallery-fixture-one")]))
    fs.writeFileSync(second, Buffer.concat([Buffer.from("RIFF0000WEBP", "ascii"), Buffer.from("gallery-fixture-two")]))
    return [first, second]
}

module.exports = { SETTINGS, fixtureConfig, writeMedia }
