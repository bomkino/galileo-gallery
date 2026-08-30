const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const zlib = require("node:zlib")
const { spawnSync } = require("node:child_process")
const { savePortableProjectArchive } = require("../electron/project-persistence.cjs")
const { SETTINGS } = require("./fixtures/project-v2-fixture.cjs")

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    return value >>> 0
})

function crc32(buffer) {
    let crc = 0xffffffff
    for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, payload) {
    const name = Buffer.from(type, "ascii")
    const result = Buffer.alloc(12 + payload.length)
    result.writeUInt32BE(payload.length, 0)
    name.copy(result, 4)
    payload.copy(result, 8)
    result.writeUInt32BE(crc32(Buffer.concat([name, payload])), 8 + payload.length)
    return result
}

function fixturePng(width, height, palette) {
    const header = Buffer.alloc(13)
    header.writeUInt32BE(width, 0)
    header.writeUInt32BE(height, 4)
    header[8] = 8
    header[9] = 6
    const rows = Buffer.alloc(height * (1 + width * 4))
    for (let y = 0; y < height; y += 1) {
        const row = y * (1 + width * 4)
        for (let x = 0; x < width; x += 1) {
            const offset = row + 1 + x * 4
            const edge = Math.min(x, y, width - 1 - x, height - 1 - y)
            if (edge < 4) continue
            const color = (x < width / 2) === (y < height / 2) ? palette[0] : palette[1]
            rows[offset] = color[0]
            rows[offset + 1] = color[1]
            rows[offset + 2] = color[2]
            rows[offset + 3] = edge < 8 ? 64 : edge < 12 ? 128 : edge < 16 ? 192 : 255
        }
    }
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", header),
        chunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ])
}

async function run() {
    const outputPath = path.resolve(process.argv[2])
    const fixtureRoot = path.resolve(process.argv[3] ?? path.join(path.dirname(outputPath), "sources"))
    fs.mkdirSync(fixtureRoot, { recursive: true })
    const sourceA = path.join(fixtureRoot, "vitrine-square.png")
    const sourceB = path.join(fixtureRoot, "vitrine-portrait.mp4")
    fs.writeFileSync(sourceA, fixturePng(96, 96, [[239, 78, 74], [34, 89, 214]]))
    const ffmpeg = require("ffmpeg-static")
    const generated = spawnSync(ffmpeg, [
        "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "color=c=0x26b46f:s=80x100:r=12:d=2",
        "-vf", "drawbox=x=mod(t*30\\,60):y=40:w=20:h=20:color=0xe6b02a:t=fill",
        "-t", "2", "-r", "12", "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "0", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", sourceB,
    ], { encoding: "utf8" })
    if (generated.error || generated.status !== 0) throw generated.error ?? new Error(generated.stderr || "Could not generate G11 source-video fixture.")
    const urls = new Map([["fixture://vitrine-square", sourceA], ["fixture://vitrine-portrait", sourceB]])
    const config = {
        schemaVersion: 2,
        styleId: "vitrine",
        sceneVersion: 2,
        timelineMode: "automatic",
        timelineFixedDurationMs: 0,
        timelineSegments: [],
        items: [
            {
                id: "vitrine-square", name: "Vitrine Square.png", type: "image", url: "fixture://vitrine-square",
                ratio: 1, aspectMode: "custom", ratioW: 16, ratioH: 9, fit: "cover",
                crop: { x: 0, y: 0, width: 1, height: 1 }, focal: { x: 0.2, y: 0.3 },
                caption: "Signal square", spotlight: true, muted: false,
            },
            {
                id: "vitrine-portrait", name: "Vitrine Portrait.mp4", type: "video", url: "fixture://vitrine-portrait",
                ratio: 0.8, aspectMode: "auto", ratioW: 4, ratioH: 5, fit: "contain",
                crop: { x: 0, y: 0.25, width: 1, height: 0.5 }, focal: { x: 0.8, y: 0.7 },
                caption: "Field portrait", spotlight: false, muted: false,
            },
        ],
        settings: {
            ...SETTINGS,
            canvasPreset: "custom",
            canvasWidth: 96,
            canvasHeight: 64,
            ratioMode: "auto",
            imageFit: "contain",
            playKind: "loop",
            repeatCount: 1,
            loopVideos: false,
            backgroundStyle: "transparent",
            ground: "#11110f",
            paper: "#11110f",
            slideHeight: 62,
            tilt: 5,
            sway: 18,
            paceMs: 320,
            holdMs: 680,
            radius: 0,
            shadow: 0,
            showHint: false,
            spotlightsEnabled: true,
            finaleEnabled: true,
            direction: "forward",
            transitionDirection: "left",
        },
    }
    await savePortableProjectArchive({ config, outputPath, tempRoot: os.tmpdir(), mediaPathFromURL: (url) => {
        const source = urls.get(url)
        if (!source) throw new Error("Unexpected G11 fixture URL.")
        return source
    } })
    process.stdout.write(`${JSON.stringify({ project: outputPath, sources: [sourceA, sourceB] })}\n`)
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
