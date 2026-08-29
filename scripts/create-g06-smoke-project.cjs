const os = require("node:os")
const path = require("node:path")
const { savePortableProjectArchive } = require("../electron/project-persistence.cjs")
const { SETTINGS } = require("./fixtures/project-v2-fixture.cjs")

const outputPath = path.resolve(process.argv[2])
const mediaPath = path.resolve(process.argv[3])
const presenterPath = process.argv[4] ? path.resolve(process.argv[4]) : null
const mediaURL = "fixture://quiet-carousel-frame"
const presenterURL = "fixture://presenter"
const config = {
    schemaVersion: 2,
    styleId: "quiet-carousel",
    timelineMode: "automatic",
    timelineFixedDurationMs: 0,
    timelineSegments: [],
    items: [{ id: "quiet-frame-one", name: "Quiet Frame.png", type: "image", url: mediaURL, ratio: 1, aspectMode: "auto", ratioW: 1, ratioH: 1, spotlight: false, muted: false }],
    settings: { ...SETTINGS, canvasPreset: "custom", canvasWidth: 64, canvasHeight: 64, paceMs: 180, playKind: "repeat", repeatCount: 2, backgroundStyle: "transparent", ground: "#11110f", paper: "#11110f", imageFit: "contain" },
    ...(presenterPath ? { audio: {
        id: "gallery-audio-intent", version: 1, sourceVideo: "per-media", sampleRate: 48_000, channels: 2,
        sources: [{ id: "presenter-source", name: "Presenter", role: "presenter", url: presenterURL, sampleRate: 48_000, channels: 2, sampleFrames: 144_000 }],
        lanes: [{ id: "presenter-lane", name: "Presenter", role: "presenter", gain: 1, muted: false, solo: false, clips: [{
            id: "presenter-clip", sourceId: "presenter-source", timelineStart: { numerator: 0, denominator: 1 }, sourceIn: { numerator: 0, denominator: 1 },
            sourceSpan: { numerator: 3, denominator: 1 }, duration: { numerator: 1, denominator: 10 }, loop: false, gain: 1, muted: false,
            fadeIn: { numerator: 0, denominator: 1 }, fadeOut: { numerator: 0, denominator: 1 },
        }] }],
        ducking: { enabled: false, triggerLaneId: "presenter-lane", targetLaneIds: [], amount: 0.5, attack: { numerator: 1, denominator: 20 }, release: { numerator: 1, denominator: 5 } },
        master: { gain: 1, muted: false },
    } } : {}),
}

savePortableProjectArchive({ config, outputPath, tempRoot: os.tmpdir(), mediaPathFromURL: (url) => {
    if (url === mediaURL) return mediaPath
    if (url === presenterURL && presenterPath) return presenterPath
    throw new Error("Unexpected G06 fixture URL.")
} }).then(() => console.log(outputPath)).catch((error) => { console.error(error); process.exitCode = 1 })
