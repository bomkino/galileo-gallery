const crypto = require("node:crypto")
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

function pngFixture(width, height, color, marker, index) {
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
            const stripe = (x + y + index * 3) % 17 < 3
            const selected = x < 18 && y < 18 ? marker : stripe ? color.map((value) => Math.max(0, value - 24)) : color
            rows[offset] = selected[0]
            rows[offset + 1] = selected[1]
            rows[offset + 2] = selected[2]
            rows[offset + 3] = 255
        }
    }
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", header),
        chunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ])
}

function colorFor(index) {
    return [
        56 + (index * 67) % 176,
        52 + (index * 97) % 180,
        48 + (index * 131) % 184,
    ]
}

function hex(color) {
    return color.map((value) => value.toString(16).padStart(2, "0")).join("")
}

function createVideo(ffmpeg, output, color, index) {
    const marker = hex(colorFor(index + 11))
    const result = spawnSync(ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-fflags", "+bitexact",
        "-f", "lavfi", "-i", `color=c=0x${hex(color)}:s=96x72:r=12:d=2`,
        "-vf", `drawbox=x=mod(t*28+${index * 5}\\,68):y=${7 + index}:w=22:h=17:color=0x${marker}:t=fill`,
        "-t", "2", "-r", "12", "-an", "-map_metadata", "-1", "-threads", "1",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "0", "-pix_fmt", "yuv420p",
        "-flags:v", "+bitexact", "-movflags", "+faststart", "-y", output,
    ], { encoding: "utf8" })
    if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr || `Could not create Light Table video ${index + 1}.`)
}

function itemFor(index, kind) {
    const ordinal = String(index + 1).padStart(2, "0")
    const ratios = [16 / 9, 4 / 3, 1, 3 / 4, 9 / 16, 4 / 5]
    return {
        id: `light-table-item-${ordinal}`,
        name: `Light Table ${ordinal}.${kind === "video" ? "mp4" : "png"}`,
        type: kind,
        url: `fixture://light-table-${ordinal}`,
        ratio: ratios[index % ratios.length],
        aspectMode: index === 7 ? "custom" : "auto",
        ratioW: index === 7 ? 5 : 16,
        ratioH: index === 7 ? 4 : 9,
        fit: index % 3 === 0 ? "cover" : "contain",
        crop: index === 8 ? { x: 0.125, y: 0.125, width: 0.75, height: 0.75 } : { x: 0, y: 0, width: 1, height: 1 },
        focal: { x: (index % 5 + 1) / 6, y: (index % 4 + 1) / 5 },
        caption: `Ordered source ${ordinal}`,
        spotlight: false,
        muted: false,
    }
}

async function run() {
    const outputPath = path.resolve(process.argv[2])
    const fixtureRoot = path.resolve(process.argv[3] ?? path.join(path.dirname(outputPath), "light-table-sources"))
    const setName = process.argv[4] ?? "twenty-four"
    if (!new Set(["one", "twenty-four"]).has(setName)) throw new Error("Unknown Light Table fixture set.")
    fs.mkdirSync(fixtureRoot, { recursive: true })
    const ffmpeg = require("ffmpeg-static")
    const count = setName === "one" ? 1 : 24
    const videoCount = setName === "one" ? 0 : 6
    const files = []
    const colors = []
    const urls = new Map()
    const items = []
    for (let index = 0; index < count; index += 1) {
        const kind = index < videoCount ? "video" : "image"
        const ordinal = String(index + 1).padStart(2, "0")
        const source = path.join(fixtureRoot, `light-table-${ordinal}.${kind === "video" ? "mp4" : "png"}`)
        const color = colorFor(index)
        if (kind === "video") createVideo(ffmpeg, source, color, index)
        else fs.writeFileSync(source, pngFixture(96, 72, color, colorFor(index + 17), index))
        const item = itemFor(index, kind)
        files.push(source)
        colors.push(hex(color))
        urls.set(item.url, source)
        items.push(item)
    }
    const config = {
        schemaVersion: 2,
        styleId: "light-table",
        sceneVersion: 2,
        timelineMode: "automatic",
        timelineFixedDurationMs: 0,
        timelineSegments: [],
        items,
        settings: {
            ...SETTINGS,
            canvasPreset: "custom",
            canvasWidth: 960,
            canvasHeight: 540,
            ratioMode: "auto",
            imageFit: "contain",
            playKind: "once",
            repeatCount: 1,
            loopVideos: false,
            backgroundStyle: "solid",
            ground: "#e8e6de",
            paper: "#e8e6de",
            theme: "light",
            axis: "vertical",
            direction: "forward",
            tableSpread: 0.83,
            overlap: 0.17,
            underlightStrength: 0.61,
            focusBehavior: "loupe-only",
            nudgeRestraint: 0.49,
        },
    }
    await savePortableProjectArchive({
        config,
        outputPath,
        tempRoot: os.tmpdir(),
        mediaPathFromURL: (url) => {
            const source = urls.get(url)
            if (!source) throw new Error("Unexpected Light Table fixture URL.")
            return source
        },
    })
    process.stdout.write(`${JSON.stringify({
        setName,
        mediaIds: items.map((item) => item.id),
        videoIds: items.filter((item) => item.type === "video").map((item) => item.id),
        sourceSha256: files.map((file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")),
        colors,
    })}\n`)
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
