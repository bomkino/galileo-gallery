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

function alphaFixture(width, height) {
    const header = Buffer.alloc(13)
    header.writeUInt32BE(width, 0)
    header.writeUInt32BE(height, 4)
    header[8] = 8
    header[9] = 6
    const rows = Buffer.alloc(height * (1 + width * 4))
    const alphaCounts = { transparent: 0, partial: 0, opaque: 0 }
    for (let y = 0; y < height; y += 1) {
        const row = y * (1 + width * 4)
        for (let x = 0; x < width; x += 1) {
            const offset = row + 1 + x * 4
            const alpha = x < width / 3 ? 0 : x < 2 * width / 3 ? 128 : 255
            rows[offset] = 224
            rows[offset + 1] = 74
            rows[offset + 2] = 146
            rows[offset + 3] = alpha
            if (alpha === 0) alphaCounts.transparent += 1
            else if (alpha === 255) alphaCounts.opaque += 1
            else alphaCounts.partial += 1
        }
    }
    return {
        bytes: Buffer.concat([
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
            chunk("IHDR", header),
            chunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
            chunk("IEND", Buffer.alloc(0)),
        ]),
        alphaCounts,
    }
}

function colorFixture(width, height, groundHex, markerHex) {
    const parse = (hex) => [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
    const ground = parse(groundHex)
    const marker = parse(markerHex)
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
            const color = x < 24 && y < 24 ? marker : ground
            rows[offset] = color[0]
            rows[offset + 1] = color[1]
            rows[offset + 2] = color[2]
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

const ORIGINAL_COLORS = [
    "d83b45", "1d70c9", "1b9a6b", "d97818", "7847c8",
    "d13f9b", "5d7f20", "277d88", "bd8a10", "6c596f",
]
const REPLACEMENT_COLORS = [
    "22a6d5", "ee6842", "7bba37", "9b62dc", "dfb126",
    "2fb18a", "d74f83", "697de2", "a86d32", "3f9460",
]

function createVideo(ffmpeg, output, color, index, setName) {
    const marker = setName === "replacement" ? "ffffff" : "101010"
    const x = 3 + index % 5
    const y = 4 + index % 3
    const result = spawnSync(ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-fflags", "+bitexact",
        "-f", "lavfi", "-i", `color=c=0x${color}:s=64x48:r=8:d=1`,
        "-vf", `drawbox=x=${x}:y=${y}:w=18:h=13:color=0x${marker}:t=fill,drawbox=x=38:y=27:w=19:h=14:color=0x${color}:t=fill`,
        "-t", "1", "-r", "8", "-an", "-map_metadata", "-1", "-threads", "1",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "0", "-pix_fmt", "yuv420p",
        "-flags:v", "+bitexact", "-movflags", "+faststart", "-y", output,
    ], { encoding: "utf8" })
    if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr || `Could not create Shelf video ${index}.`)
}

const VFR_MARKERS = ["e5484d", "36a269", "3975d5"]

function inspectVfrFrames(ffmpeg, source, markerColors = VFR_MARKERS, expectedCount = 4) {
    const probe = spawnSync(ffmpeg, ["-hide_banner", "-i", source, "-vf", "showinfo", "-f", "null", "-"], { encoding: "utf8" })
    if (probe.error || probe.status !== 0) throw probe.error ?? new Error(probe.stderr || "Could not inspect Shelf VFR video.")
    const frames = probe.stderr.split("\n").flatMap((line) => {
        const match = line.match(/\bn:\s*(\d+).*\bpts_time:([0-9.]+).*\bduration_time:([0-9.]+)/)
        if (!match) return []
        const index = Number(match[1])
        return [{ index, ptsSeconds: Number(match[2]), durationSeconds: Number(match[3]), markerColor: markerColors[Math.min(index, markerColors.length - 1)] }]
    })
    if (frames.length !== expectedCount || frames.some((frame, index) => frame.index !== index || !Number.isFinite(frame.ptsSeconds) || !Number.isFinite(frame.durationSeconds) || frame.durationSeconds <= 0)) {
        throw new Error("Shelf video source did not retain its exact timing table.")
    }
    return frames
}

function createVfrVideo(ffmpeg, output, ground) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-shelf-vfr-"))
    try {
        const frames = VFR_MARKERS.map((marker, index) => {
            const target = path.join(temporary, `frame-${index}.png`)
            fs.writeFileSync(target, colorFixture(64, 48, ground, marker))
            return target
        })
        const concat = path.join(temporary, "frames.ffconcat")
        fs.writeFileSync(concat, [
            "ffconcat version 1.0",
            `file '${frames[0]}'`,
            "duration 0.2",
            `file '${frames[1]}'`,
            "duration 0.52",
            `file '${frames[2]}'`,
            "duration 0.28",
            `file '${frames[2]}'`,
        ].join("\n"))
        const result = spawnSync(ffmpeg, [
            "-hide_banner", "-loglevel", "error", "-fflags", "+bitexact",
            "-f", "concat", "-safe", "0", "-i", concat,
            "-fps_mode", "vfr", "-an", "-map_metadata", "-1", "-threads", "1",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "0", "-pix_fmt", "yuv420p",
            "-flags:v", "+bitexact", "-movflags", "+faststart", "-y", output,
        ], { encoding: "utf8" })
        if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr || "Could not create Shelf VFR video.")
        return inspectVfrFrames(ffmpeg, output)
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true })
    }
}

function createShortVideo(ffmpeg, output, ground) {
    const result = spawnSync(ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-fflags", "+bitexact",
        "-f", "lavfi", "-i", `color=c=0x${ground}:s=64x48:r=50:d=0.02`,
        "-an", "-map_metadata", "-1", "-threads", "1",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "0", "-pix_fmt", "yuv420p",
        "-flags:v", "+bitexact", "-movflags", "+faststart", "-y", output,
    ], { encoding: "utf8" })
    if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr || "Could not create short Shelf video.")
    return inspectVfrFrames(ffmpeg, output, [ground], 1)
}

function corruptVideo(output) {
    const bytes = Buffer.alloc(192, 0xa5)
    bytes.writeUInt32BE(24, 0)
    bytes.write("ftyp", 4, "ascii")
    bytes.write("isom", 8, "ascii")
    bytes.writeUInt32BE(0, 12)
    bytes.write("isomiso2", 16, "ascii")
    fs.writeFileSync(output, bytes)
}

async function run() {
    const outputPath = path.resolve(process.argv[2])
    const fixtureRoot = path.resolve(process.argv[3] ?? path.join(path.dirname(outputPath), "shelf-sources"))
    const setName = process.argv[4] ?? "original"
    if (!["original", "replacement", "corrupt", "vfr", "image-only"].includes(setName)) throw new Error("Unknown Shelf fixture set.")
    fs.mkdirSync(fixtureRoot, { recursive: true })
    const ffmpeg = require("ffmpeg-static")
    const colors = setName === "replacement" ? REPLACEMENT_COLORS : ORIGINAL_COLORS
    const sourceFiles = []
    let vfrFrames = null
    let shortFrames = null
    const videoCount = setName === "image-only" ? 0 : setName === "vfr" ? 2 : 10
    for (let index = 0; index < videoCount; index += 1) {
        const source = path.join(fixtureRoot, `shelf-${setName}-${String(index + 1).padStart(2, "0")}.mp4`)
        if (setName === "corrupt" && index === 3) corruptVideo(source)
        else if (setName === "vfr" && index === 0) vfrFrames = createVfrVideo(ffmpeg, source, colors[index])
        else if (setName === "vfr") shortFrames = createShortVideo(ffmpeg, source, colors[index])
        else createVideo(ffmpeg, source, colors[index], index, setName)
        sourceFiles.push(source)
    }
    const alpha = alphaFixture(48, 48)
    const alphaSource = path.join(fixtureRoot, `shelf-${setName}-alpha.png`)
    fs.writeFileSync(alphaSource, alpha.bytes)
    const urls = new Map(sourceFiles.map((source, index) => [`fixture://shelf-video-${index + 1}`, source]))
    urls.set("fixture://shelf-alpha", alphaSource)
    const items = sourceFiles.map((_source, index) => ({
        id: `shelf-video-${index + 1}`,
        name: `Shelf Video ${index + 1}.mp4`,
        type: "video",
        url: `fixture://shelf-video-${index + 1}`,
        ratio: 4 / 3,
        aspectMode: "auto",
        ratioW: 4,
        ratioH: 3,
        fit: index % 2 ? "cover" : "contain",
        crop: { x: 0, y: 0, width: 1, height: 1 },
        focal: { x: (index % 5 + 1) / 6, y: (index % 3 + 1) / 4 },
        caption: `${setName === "replacement" ? "Replacement" : setName === "vfr" ? "VFR proof" : "Original"} edition ${index + 1}`,
        spotlight: index === 4 || (setName === "vfr" && index === 0),
        muted: false,
    }))
    if (setName !== "vfr") items.splice(5, 0, {
        id: "shelf-alpha",
        name: "Shelf Alpha.png",
        type: "image",
        url: "fixture://shelf-alpha",
        ratio: 1,
        aspectMode: "auto",
        ratioW: 1,
        ratioH: 1,
        fit: "contain",
        crop: { x: 0, y: 0, width: 1, height: 1 },
        focal: { x: 0.5, y: 0.5 },
        caption: "Transparent and partial alpha",
        spotlight: setName === "image-only",
        muted: false,
    })
    const config = {
        schemaVersion: 2,
        styleId: "the-shelf",
        sceneVersion: 2,
        timelineMode: setName === "image-only" ? "fixed-duration" : "automatic",
        timelineFixedDurationMs: setName === "image-only" ? 1_000 : 0,
        timelineSegments: [],
        items,
        settings: {
            ...SETTINGS,
            canvasPreset: "custom",
            canvasWidth: setName === "image-only" ? 64 : 960,
            canvasHeight: setName === "image-only" ? 64 : 540,
            ratioMode: "auto",
            imageFit: "contain",
            playKind: setName === "image-only" ? "once" : "repeat",
            repeatCount: setName === "image-only" ? 1 : 2,
            loopVideos: !["vfr", "image-only"].includes(setName),
            backgroundStyle: "transparent",
            ground: "#11110f",
            paper: "#11110f",
            theme: "dark",
            axis: "horizontal",
            direction: "reverse",
            slideHeight: 42,
            gap: 34,
            tilt: 2.5,
            centerBump: 8,
            paceMs: 650,
            spotlightsEnabled: true,
            finaleEnabled: true,
        },
    }
    await savePortableProjectArchive({
        config,
        outputPath,
        tempRoot: os.tmpdir(),
        mediaPathFromURL: (url) => {
            const source = urls.get(url)
            if (!source) throw new Error("Unexpected Shelf fixture URL.")
            return source
        },
    })
    process.stdout.write(`${JSON.stringify({
        project: outputPath,
        setName,
        mediaIds: items.map((item) => item.id),
        videoIds: items.filter((item) => item.type === "video").map((item) => item.id),
        videoSha256: sourceFiles.map((source) => crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex")),
        alphaSha256: crypto.createHash("sha256").update(alpha.bytes).digest("hex"),
        colors,
        alphaCounts: alpha.alphaCounts,
        vfr: setName === "vfr" ? {
            id: "shelf-video-1",
            frames: vfrFrames,
            durationSeconds: vfrFrames.at(-1).ptsSeconds + vfrFrames.at(-1).durationSeconds,
            short: { id: "shelf-video-2", frames: shortFrames, durationSeconds: shortFrames.at(-1).ptsSeconds + shortFrames.at(-1).durationSeconds },
        } : null,
    })}\n`)
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
