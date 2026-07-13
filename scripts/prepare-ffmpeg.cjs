const fs = require("node:fs")
const path = require("node:path")

const supported = new Set(["darwin-arm64", "darwin-x64", "linux-x64", "win32-x64"])
const target = `${process.platform}-${process.arch}`
if (!supported.has(target)) {
    throw new Error(`Galileo Gallery does not have a packaging target for ${target}.`)
}

const source = require("ffmpeg-static")
if (!source || !fs.existsSync(source)) throw new Error("ffmpeg-static did not install a binary for this platform.")

const folder = path.resolve(__dirname, `../vendor/ffmpeg/${target}`)
const filename = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
fs.mkdirSync(folder, { recursive: true })
fs.copyFileSync(source, path.join(folder, filename))
if (process.platform !== "win32") fs.chmodSync(path.join(folder, filename), 0o755)

const packageFolder = path.dirname(require.resolve("ffmpeg-static/package.json"))
const license = path.join(packageFolder, "ffmpeg.LICENSE")
if (fs.existsSync(license)) fs.copyFileSync(license, path.join(folder, "LICENSE"))

console.log(`Prepared FFmpeg for ${target}.`)
