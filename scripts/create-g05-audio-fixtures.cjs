const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const output = path.resolve(process.argv[2] || "artifacts/g05-fixtures")
fs.mkdirSync(output, { recursive: true })

function writeWav(name, seconds, sampleAt) {
    const sampleRate = 48_000
    const channels = 2
    const sampleFrames = sampleRate * seconds
    const dataBytes = sampleFrames * channels * 2
    const wav = Buffer.allocUnsafe(44 + dataBytes)
    wav.write("RIFF", 0)
    wav.writeUInt32LE(wav.length - 8, 4)
    wav.write("WAVEfmt ", 8)
    wav.writeUInt32LE(16, 16)
    wav.writeUInt16LE(1, 20)
    wav.writeUInt16LE(channels, 22)
    wav.writeUInt32LE(sampleRate, 24)
    wav.writeUInt32LE(sampleRate * channels * 2, 28)
    wav.writeUInt16LE(channels * 2, 32)
    wav.writeUInt16LE(16, 34)
    wav.write("data", 36)
    wav.writeUInt32LE(dataBytes, 40)
    for (let frame = 0; frame < sampleFrames; frame += 1) {
        const sample = Math.max(-1, Math.min(1, sampleAt(frame, sampleRate)))
        const integer = Math.round(sample * (sample < 0 ? 32768 : 32767))
        wav.writeInt16LE(integer, 44 + frame * 4)
        wav.writeInt16LE(integer, 46 + frame * 4)
    }
    const target = path.join(output, name)
    fs.writeFileSync(target, wav)
    return target
}

const presenter = writeWav("presenter.wav", 3, (frame) => frame < 1_200 ? 0.72 : 0)
const soundtrack = writeWav("soundtrack.wav", 2, (frame, rate) => 0.18 * Math.sin(2 * Math.PI * 220 * frame / rate))
const pinnedFFmpeg = require("ffmpeg-static")
const ffmpeg = pinnedFFmpeg && fs.existsSync(pinnedFFmpeg) ? pinnedFFmpeg : "/usr/bin/ffmpeg"
const video = path.join(output, "source-video.mov")
const result = spawnSync(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=#365c62:s=320x180:r=30:d=2",
    "-itsoffset", "0.25", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=1.5",
    "-c:v", "mpeg4", "-q:v", "8", "-c:a", "pcm_s16le", video,
], { encoding: "utf8" })
if (result.status !== 0) throw new Error(result.stderr || "Could not create G05 source-video fixture.")

console.log(JSON.stringify({ presenter, soundtrack, video }))
