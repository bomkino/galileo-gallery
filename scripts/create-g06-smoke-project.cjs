const os = require("node:os")
const path = require("node:path")
const { savePortableProjectArchive } = require("../electron/project-persistence.cjs")
const { SETTINGS } = require("./fixtures/project-v2-fixture.cjs")

const outputPath = path.resolve(process.argv[2])
const mediaPath = path.resolve(process.argv[3])
const mediaURL = "fixture://quiet-carousel-frame"
const config = {
    schemaVersion: 2,
    styleId: "quiet-carousel",
    timelineMode: "automatic",
    timelineFixedDurationMs: 0,
    timelineSegments: [],
    items: [{ id: "quiet-frame-one", name: "Quiet Frame.png", type: "image", url: mediaURL, ratio: 1, aspectMode: "auto", ratioW: 1, ratioH: 1, spotlight: false, muted: false }],
    settings: { ...SETTINGS, canvasPreset: "custom", canvasWidth: 64, canvasHeight: 64, paceMs: 180, playKind: "once", repeatCount: 1, backgroundStyle: "transparent", ground: "#11110f", paper: "#11110f", imageFit: "contain" },
}

savePortableProjectArchive({ config, outputPath, tempRoot: os.tmpdir(), mediaPathFromURL: (url) => {
    if (url !== mediaURL) throw new Error("Unexpected G06 fixture URL.")
    return mediaPath
} }).then(() => console.log(outputPath)).catch((error) => { console.error(error); process.exitCode = 1 })
