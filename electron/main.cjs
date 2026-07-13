const {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    net,
    nativeImage,
    protocol,
    screen,
    shell,
} = require("electron")
const { spawn } = require("node:child_process")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")
const AdmZip = require("adm-zip")
let ffmpegStatic = null
try {
    ffmpegStatic = require("ffmpeg-static")
} catch {
    // Packaged apps use the target-specific binary under Resources.
}

protocol.registerSchemesAsPrivileged([
    {
        scheme: "reel-media",
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            stream: true,
        },
    },
])

app.commandLine.appendSwitch("force-device-scale-factor", "1")
app.commandLine.appendSwitch("disable-renderer-backgrounding")
if (process.env.REEL_USER_DATA_DIR) app.setPath("userData", path.resolve(process.env.REEL_USER_DATA_DIR))

let mainWindow = null
let activeExport = null

function rendererURL(exportMode = false) {
    const query = exportMode ? "?export=1" : ""
    if (process.env.VITE_DEV_SERVER_URL) {
        return `${process.env.VITE_DEV_SERVER_URL}/${query}`
    }
    return `${pathToFileURL(path.join(__dirname, "../dist/index.html")).href}${query}`
}

function ffmpegPath() {
    if (app.isPackaged) {
        const bundled = path.join(
            process.resourcesPath,
            "ffmpeg",
            process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
        )
        if (fs.existsSync(bundled)) return bundled
    }
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic
    throw new Error(`Bundled FFmpeg is missing for ${process.platform}-${process.arch}.`)
}

function recoveryPath() {
    return path.join(app.getPath("userData"), "galileo-gallery-recovery.json")
}

function safeExportFolder() {
    for (const location of ["videos", "documents", "desktop", "home"]) {
        try {
            const folder = app.getPath(location)
            if (folder && fs.existsSync(folder)) return folder
        } catch {
            // Try next standard macOS location.
        }
    }
    return process.cwd()
}

function safeProjectFolder() {
    for (const location of ["documents", "desktop", "home"]) {
        try {
            const folder = app.getPath(location)
            if (folder && fs.existsSync(folder)) return folder
        } catch {}
    }
    return process.cwd()
}

function safeMediaName(index, filePath) {
    const base = path.basename(filePath).replace(/[^a-zA-Z0-9._-]+/g, "-") || "media"
    return `${String(index + 1).padStart(2, "0")}-${base}`
}

async function savePortableProject(config, forcedOutputPath) {
    let outputPath = forcedOutputPath
    if (!outputPath) {
        const result = await dialog.showSaveDialog(mainWindow, {
            title: "Save Galileo Gallery Project",
            buttonLabel: "Save Project",
            defaultPath: path.join(safeProjectFolder(), "Galileo Gallery Project.galileo"),
            filters: [{ name: "Galileo Gallery Project", extensions: ["galileo"] }],
        })
        if (result.canceled || !result.filePath) return { cancelled: true }
        outputPath = result.filePath.endsWith(".galileo") ? result.filePath : `${result.filePath}.galileo`
    }
    const temporary = fs.mkdtempSync(path.join(app.getPath("temp"), "galileo-gallery-save-"))
    const projectFolder = path.join(temporary, "project")
    const mediaFolder = path.join(projectFolder, "media")
    fs.mkdirSync(mediaFolder, { recursive: true })
    try {
        const items = config.items.map((item, index) => {
            const source = mediaURLToPath(item.url)
            if (!fs.existsSync(source)) throw new Error(`Missing media: ${item.name}`)
            const mediaName = safeMediaName(index, source)
            fs.copyFileSync(source, path.join(mediaFolder, mediaName))
            const { previewUrl: _previewUrl, posterUrl: _posterUrl, posterMode: _posterMode, ...portableItem } = item
            return { ...portableItem, url: `media/${mediaName}` }
        })
        fs.writeFileSync(
            path.join(projectFolder, "project.json"),
            JSON.stringify({ type: "galileo-gallery-project", version: 1, config: { ...config, items } }, null, 2)
        )
        const archive = new AdmZip()
        archive.addLocalFolder(projectFolder, "project")
        archive.writeZip(outputPath)
        return { outputPath }
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true })
    }
}

function findProjectManifest(folder) {
    const direct = path.join(folder, "project.json")
    if (fs.existsSync(direct)) return direct
    for (const name of fs.readdirSync(folder)) {
        const candidate = path.join(folder, name)
        if (fs.statSync(candidate).isDirectory()) {
            const found = findProjectManifest(candidate)
            if (found) return found
        }
    }
    return null
}

async function openPortableProject(forcedSource) {
    let source = forcedSource
    if (!source) {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: "Open Galileo Gallery Project",
            buttonLabel: "Open Project",
            properties: ["openFile"],
            filters: [{ name: "Galileo Gallery Project", extensions: ["galileo", "openingreel"] }],
        })
        if (result.canceled || !result.filePaths[0]) return { cancelled: true }
        source = result.filePaths[0]
    }
    const stat = fs.statSync(source)
    const key = crypto.createHash("sha1").update(`${source}:${stat.mtimeMs}:${stat.size}`).digest("hex")
    const destination = path.join(app.getPath("userData"), "projects", key)
    if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true })
        new AdmZip(source).extractAllTo(destination, true)
    }
    const manifestPath = findProjectManifest(destination)
    if (!manifestPath) throw new Error("This file is not a Galileo Gallery project.")
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    if (!["galileo-gallery-project", "opening-reel-project"].includes(manifest.type) || !manifest.config) {
        throw new Error("This file is not a Galileo Gallery project.")
    }
    const root = path.dirname(manifestPath)
    const items = (manifest.config.items ?? []).map((item) => {
        const { previewUrl: _previewUrl, posterUrl: _posterUrl, posterMode: _posterMode, ...portableItem } = item
        return { ...portableItem, url: fileToMedia(path.join(root, item.url)).url }
    })
    return { config: { ...manifest.config, items }, sourcePath: source }
}

async function saveSettingsTemplate(settings, forcedOutputPath) {
    let outputPath = forcedOutputPath
    if (!outputPath) {
        const result = await dialog.showSaveDialog(mainWindow, {
            title: "Save Galileo Gallery Template",
            buttonLabel: "Save Template",
            defaultPath: path.join(safeProjectFolder(), "Galileo Gallery Look.galileo-template.json"),
            filters: [{ name: "Galileo Gallery Template", extensions: ["json"] }],
        })
        if (result.canceled || !result.filePath) return { cancelled: true }
        outputPath = result.filePath.endsWith(".json") ? result.filePath : `${result.filePath}.json`
    }
    fs.writeFileSync(outputPath, JSON.stringify({ type: "galileo-gallery-template", version: 1, settings }, null, 2))
    return { outputPath }
}

async function openSettingsTemplate(forcedSource) {
    let source = forcedSource
    if (!source) {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: "Open Galileo Gallery Template",
            buttonLabel: "Apply Template",
            properties: ["openFile"],
            filters: [{ name: "Galileo Gallery Template", extensions: ["json"] }],
        })
        if (result.canceled || !result.filePaths[0]) return { cancelled: true }
        source = result.filePaths[0]
    }
    const template = JSON.parse(fs.readFileSync(source, "utf8"))
    if (!["galileo-gallery-template", "opening-reel-template"].includes(template.type) || !template.settings) {
        throw new Error("This file is not a Galileo Gallery template.")
    }
    return { settings: template.settings, sourcePath: source }
}

function fileToMedia(filePath) {
    const extension = path.extname(filePath).toLowerCase()
    const videoExtensions = new Set([".mp4", ".webm", ".mov", ".m4v", ".gif"])
    const token = Buffer.from(filePath).toString("base64url")
    return {
        name: path.basename(filePath),
        type: videoExtensions.has(extension) ? "video" : "image",
        url: `reel-media://file/${token}`,
    }
}

function mediaURLToPath(mediaURL) {
    const url = new URL(mediaURL)
    if (url.protocol !== "reel-media:" || url.hostname !== "file") {
        throw new Error("Unsupported local media URL.")
    }
    return Buffer.from(url.pathname.replace(/^\//, ""), "base64url").toString()
}

function runFFmpeg(args, exportState) {
    return new Promise((resolve, reject) => {
        const child = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] })
        if (exportState) exportState.process = child
        let errorText = ""
        child.stderr.on("data", (chunk) => {
            errorText += chunk.toString()
        })
        child.once("error", reject)
        child.once("close", (code) => {
            if (exportState?.process === child) exportState.process = null
            if (code === 0) resolve()
            else reject(new Error(errorText.trim() || `FFmpeg exited with code ${code}.`))
        })
    })
}

async function createVideoProxy(mediaURL) {
    const source = mediaURLToPath(mediaURL)
    const stat = fs.statSync(source)
    const key = crypto.createHash("sha1").update(`${source}:${stat.mtimeMs}:${stat.size}:proxy-v1`).digest("hex")
    const folder = path.join(app.getPath("userData"), "video-proxies")
    const output = path.join(folder, `${key}.mp4`)
    if (!fs.existsSync(output)) {
        fs.mkdirSync(folder, { recursive: true })
        await runFFmpeg([
            "-hide_banner",
            "-loglevel", "error",
            "-i", source,
            "-map", "0:v:0",
            "-an",
            "-vf", "scale=1920:1920:force_original_aspect_ratio=decrease:force_divisible_by=2",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-y", output,
        ])
    }
    return fileToMedia(output).url
}

const EXPORT_FRAME_CACHE_LIMIT = 12 * 1024 * 1024 * 1024
const EXPORT_FRAME_CACHE_TARGET = 6 * 1024 * 1024 * 1024

function folderBytes(folder) {
    if (!fs.existsSync(folder)) return 0
    return fs.readdirSync(folder, { withFileTypes: true }).reduce((total, entry) => {
        const target = path.join(folder, entry.name)
        try {
            return total + (entry.isDirectory() ? folderBytes(target) : fs.statSync(target).size)
        } catch {
            return total
        }
    }, 0)
}

function pruneExportFrameCache() {
    const root = path.join(app.getPath("userData"), "export-video-frames")
    if (!fs.existsSync(root)) return
    const folders = fs.readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
            const target = path.join(root, entry.name)
            return { target, bytes: folderBytes(target), mtimeMs: fs.statSync(target).mtimeMs }
        })
        .sort((a, b) => a.mtimeMs - b.mtimeMs)
    let total = folders.reduce((sum, folder) => sum + folder.bytes, 0)
    if (total <= EXPORT_FRAME_CACHE_LIMIT) return
    for (const folder of folders) {
        fs.rmSync(folder.target, { recursive: true, force: true })
        total -= folder.bytes
        if (total <= EXPORT_FRAME_CACHE_TARGET) break
    }
}

async function prepareExportVideoFrames(request, exportState) {
    pruneExportFrameCache()
    const result = {}
    const decoded = new Map()
    const videoItems = request.config.items.filter((item) => item.type === "video")
    let prepared = 0
    for (let index = 0; index < request.config.items.length; index += 1) {
        const item = request.config.items[index]
        if (item.type !== "video") continue
        report({
            exportId: exportState.exportId,
            phase: "preparing",
            progress: videoItems.length ? prepared / videoItems.length : 1,
            message: `Preparing video ${prepared + 1} of ${videoItems.length} · ${item.name}`,
        })
        const source = mediaURLToPath(item.url)
        const stat = fs.statSync(source)
        const decodeDurationMs = Math.min(
            request.durationMs,
            Math.max(request.cycleDurationMs || request.durationMs, request.finalCycleDurationMs || 0)
        )
        const estimatedBytes = request.width * request.height * 4 * request.fps * (decodeDurationMs / 1000) * 0.12
        const cacheRoot = path.join(app.getPath("userData"), "export-video-frames")
        fs.mkdirSync(cacheRoot, { recursive: true })
        if (typeof fs.statfsSync === "function") {
            const disk = fs.statfsSync(cacheRoot)
            const freeBytes = Number(disk.bavail) * Number(disk.bsize)
            if (estimatedBytes > freeBytes * 0.75) {
                throw new Error(`Not enough free space to prepare ${item.name}. Need roughly ${Math.ceil(estimatedBytes / 1073741824)} GB.`)
            }
        }
        const extension = request.quality === "optimized" ? "jpg" : "png"
        const key = crypto
            .createHash("sha1")
            .update(`${source}:${stat.mtimeMs}:${stat.size}:${request.fps}:${request.width}x${request.height}:${decodeDurationMs}:${request.quality}:frames-v2`)
            .digest("hex")
        if (!decoded.has(key)) {
            const folder = path.join(app.getPath("userData"), "export-video-frames", key)
            const marker = path.join(folder, "complete.json")
            let frames = []
            if (fs.existsSync(marker)) {
                try {
                    const expected = JSON.parse(fs.readFileSync(marker, "utf8")).frames
                    frames = fs.readdirSync(folder)
                        .filter((name) => name.endsWith(`.${extension}`))
                        .sort()
                        .map((name) => path.join(folder, name))
                    if (!Number.isInteger(expected) || expected < 1 || frames.length !== expected) frames = []
                } catch {
                    frames = []
                }
            }
            if (frames.length === 0) {
                fs.rmSync(folder, { recursive: true, force: true })
                fs.mkdirSync(folder, { recursive: true })
                const outputPattern = path.join(folder, `frame-%06d.${extension}`)
                const codec = extension === "png"
                    ? ["-c:v", "png", "-compression_level", "3"]
                    : ["-q:v", "2"]
                try {
                    await runFFmpeg([
                        "-hide_banner",
                        "-loglevel", "error",
                        "-i", source,
                        "-t", String(decodeDurationMs / 1000),
                        "-an",
                        "-vf", `fps=${request.fps},scale=${request.width}:${request.height}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
                        ...codec,
                        "-start_number", "0",
                        "-y", outputPattern,
                    ], exportState)
                } catch (error) {
                    fs.rmSync(folder, { recursive: true, force: true })
                    throw error
                }
                frames = fs.readdirSync(folder)
                    .filter((name) => name.endsWith(`.${extension}`))
                    .sort()
                    .map((name) => path.join(folder, name))
                if (frames.length === 0) throw new Error(`Could not decode video frames: ${item.name}`)
                fs.writeFileSync(marker, JSON.stringify({ frames: frames.length, fps: request.fps }))
            }
            decoded.set(key, { fps: request.fps, frames: frames.map((frame) => fileToMedia(frame).url) })
        }
        result[index] = decoded.get(key)
        prepared += 1
        report({
            exportId: exportState.exportId,
            phase: "preparing",
            progress: prepared / videoItems.length,
            message: prepared === videoItems.length ? "Video frames ready." : `Prepared ${prepared} of ${videoItems.length} videos.`,
        })
    }
    return result
}

function createMainWindow() {
    const bundledIcon = app.isPackaged
        ? path.join(process.resourcesPath, process.platform === "darwin" ? "icon.icns" : "icon.png")
        : path.join(__dirname, "..", "build", "icon.png")
    const windowOptions = {
        width: 1440,
        height: 920,
        minWidth: 1080,
        minHeight: 700,
        show: false,
        backgroundColor: "#171614",
        title: "Galileo Gallery",
        icon: bundledIcon,
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: false,
        },
    }
    if (process.platform === "darwin") {
        Object.assign(windowOptions, {
            titleBarStyle: "hiddenInset",
            trafficLightPosition: { x: 18, y: 18 },
            vibrancy: "under-window",
            visualEffectState: "active",
        })
    }
    mainWindow = new BrowserWindow(windowOptions)
    mainWindow.loadURL(rendererURL())
    mainWindow.once("ready-to-show", () => {
        mainWindow?.show()
        if (process.env.REEL_SCREENSHOT_OUTPUT && mainWindow) {
            const screenshotPath = path.resolve(process.env.REEL_SCREENSHOT_OUTPUT)
            const screenshotDelay = Number(process.env.REEL_SCREENSHOT_DELAY) || 900
            if (process.env.REEL_SCREENSHOT_STYLE) {
                const styleId = JSON.stringify(process.env.REEL_SCREENSHOT_STYLE)
                setTimeout(() => {
                    void mainWindow?.webContents.executeJavaScript(
                        `document.querySelector('button[data-style-id="' + CSS.escape(${styleId}) + '"]')?.click()`
                    )
                }, 360)
            }
            if (process.env.REEL_SCREENSHOT_VARIANT) {
                const variant = JSON.stringify(process.env.REEL_SCREENSHOT_VARIANT)
                setTimeout(() => {
                    void mainWindow?.webContents.executeJavaScript(`(() => {
                        const select = document.querySelector('.scene-preset-select select')
                        if (!select) return
                        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${variant})
                        select.dispatchEvent(new Event('change', { bubbles: true }))
                    })()`)
                }, process.env.REEL_SCREENSHOT_STYLE ? 760 : 220)
            }
            if (["expert", "export"].includes(process.env.REEL_SCREENSHOT_TAB)) {
                setTimeout(() => {
                    const index = process.env.REEL_SCREENSHOT_TAB === "expert" ? 2 : 3
                    void mainWindow?.webContents.executeJavaScript(
                        `document.querySelector(".inspector-top .segment button:nth-child(${index})")?.click()`
                    )
                    if (process.env.REEL_SCREENSHOT_EXPERT_TAB) {
                        const tab = JSON.stringify(process.env.REEL_SCREENSHOT_EXPERT_TAB)
                        setTimeout(() => {
                            void mainWindow?.webContents.executeJavaScript(
                                `Array.from(document.querySelectorAll(".expert-tabs button")).find((button) => button.textContent === ${tab})?.click()`
                            )
                        }, 120)
                    }
                }, process.env.REEL_SCREENSHOT_STYLE ? 320 : 100)
            }
            if (process.env.REEL_SCREENSHOT_TAB === "project") {
                setTimeout(() => {
                    void mainWindow?.webContents.executeJavaScript(
                        `document.querySelector(".project-menu summary")?.click()`
                    )
                }, 100)
            }
            if (process.env.REEL_SCREENSHOT_CANVAS) {
                const canvas = JSON.stringify(process.env.REEL_SCREENSHOT_CANVAS.toLowerCase())
                setTimeout(() => {
                    void mainWindow?.webContents.executeJavaScript(
                        `Array.from(document.querySelectorAll(".canvas-preset-grid button")).find((button) => button.textContent.trim().toLowerCase() === ${canvas})?.click()`
                    )
                }, 180)
            }
            if (process.env.REEL_SCREENSHOT_BACKGROUND) {
                const background = JSON.stringify(process.env.REEL_SCREENSHOT_BACKGROUND.toLowerCase())
                setTimeout(() => {
                    void mainWindow?.webContents.executeJavaScript(
                        `Array.from(document.querySelectorAll(".background-style-grid button")).find((button) => button.textContent.trim().toLowerCase() === ${background})?.click()`
                    )
                }, 260)
            }
            if (process.env.REEL_SCREENSHOT_SCRUB) {
                const scrub = Math.max(0, Math.min(1, Number(process.env.REEL_SCREENSHOT_SCRUB)))
                setTimeout(() => {
                    void mainWindow?.webContents.executeJavaScript(`(() => {
                        const timeline = document.querySelector('.timeline')
                        if (!timeline) return
                        timeline.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
                        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(timeline, ${scrub})
                        timeline.dispatchEvent(new Event('input', { bubbles: true }))
                        timeline.dispatchEvent(new Event('change', { bubbles: true }))
                        timeline.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
                    })()`)
                }, Number(process.env.REEL_SCREENSHOT_SCRUB_DELAY) || (process.env.REEL_SCREENSHOT_STYLE ? 1500 : 1300))
            }
            setTimeout(async () => {
                if (!mainWindow || mainWindow.isDestroyed()) return
                fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
                const image = await mainWindow.webContents.capturePage()
                fs.writeFileSync(screenshotPath, image.toPNG())
                app.exit(0)
            }, screenshotDelay)
        }
    })
    mainWindow.on("closed", () => {
        mainWindow = null
    })
}

function onceIPC(channel, predicate, timeoutMs = 30000, exportState) {
    return new Promise((resolve, reject) => {
        let cancelCheck = null
        const cleanup = () => {
            clearTimeout(timeout)
            if (cancelCheck) clearInterval(cancelCheck)
            ipcMain.removeListener(channel, listener)
        }
        const timeout = setTimeout(() => {
            cleanup()
            reject(new Error(`Timed out waiting for ${channel}.`))
        }, timeoutMs)
        if (exportState) {
            cancelCheck = setInterval(() => {
                if (!exportState.cancelled) return
                cleanup()
                reject(new Error("Export cancelled."))
            }, 100)
        }
        const listener = (_event, payload) => {
            if (!predicate(payload)) return
            cleanup()
            if (payload.error) reject(new Error(payload.error))
            else resolve(payload)
        }
        ipcMain.on(channel, listener)
    })
}

function writeBuffer(stream, buffer) {
    return new Promise((resolve, reject) => {
        if (stream.destroyed) {
            reject(new Error("FFmpeg input closed unexpectedly."))
            return
        }
        const onError = (error) => {
            stream.removeListener("drain", onDrain)
            reject(error)
        }
        const onDrain = () => {
            stream.removeListener("error", onError)
            resolve()
        }
        stream.once("error", onError)
        if (stream.write(buffer)) {
            stream.removeListener("error", onError)
            resolve()
        } else {
            stream.once("drain", onDrain)
        }
    })
}

function encoderArgs(request, outputPath) {
    const master = request.quality === "master"
    const high = request.quality !== "optimized"
    const transparent = request.config?.settings?.backgroundStyle === "transparent"
    const rec709 = [
        "-color_primaries", "bt709",
        "-color_trc", "bt709",
        "-colorspace", "bt709",
        "-color_range", "tv",
    ]
    const colorPipeline = transparent
        ? []
        : ["-vf", "zscale=primariesin=709:transferin=iec61966-2-1:matrixin=gbr:rangein=full:primaries=709:transfer=709:matrix=709:range=limited"]
    const base = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "image2pipe",
        "-framerate",
        String(request.fps),
        "-i",
        "pipe:0",
        "-an",
        ...colorPipeline,
    ]
    if (request.format === "mp4") {
        return [
            ...base,
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            master ? "8" : high ? "12" : "20",
            ...rec709,
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-y",
            outputPath,
        ]
    }
    if (request.format === "premiere") {
        return [
            ...base,
            "-c:v",
            "prores_ks",
            "-profile:v",
            transparent ? (master ? "5" : "4") : master ? "3" : high ? "2" : "1",
            "-vendor",
            "apl0",
            "-pix_fmt",
            transparent ? "yuva444p10le" : "yuv422p10le",
            ...rec709,
            "-movflags",
            "+faststart",
            "-y",
            outputPath,
        ]
    }
    const compact = request.format === "webm-small"
    return [
        ...base,
        "-c:v",
        "libvpx-vp9",
        "-crf",
        compact ? (master ? "22" : high ? "28" : "38") : (master ? "12" : high ? "18" : "28"),
        "-b:v",
        "0",
        "-deadline",
        "good",
        "-cpu-used",
        compact ? "4" : "2",
        "-row-mt",
        "1",
        "-pix_fmt",
        transparent ? "yuva420p" : "yuv420p",
        ...rec709,
        ...(transparent ? ["-auto-alt-ref", "0"] : []),
        "-y",
        outputPath,
    ]
}

function report(progress) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("export:progress", progress)
    }
}

function cancelActiveExport() {
    if (!activeExport) return
    activeExport.cancelled = true
    activeExport.process?.kill("SIGKILL")
}

async function runExport(request, outputPath) {
    const exportId = `export-${Date.now().toString(36)}`
    const state = { exportId, cancelled: false, process: null, window: null }
    const posterPath = request.posterFrame && request.posterFrame !== "none"
        ? `${outputPath.slice(0, -path.extname(outputPath).length)}-poster.jpg`
        : null
    let posterImage = null
    activeExport = state
    report({ exportId, phase: "preparing", progress: 0, outputPath })

    const scaleFactor = screen.getPrimaryDisplay().scaleFactor || 1
    const transparent = request.config?.settings?.backgroundStyle === "transparent"
    const exportWindow = new BrowserWindow({
        width: Math.max(1, Math.round(request.width / scaleFactor)),
        height: Math.max(1, Math.round(request.height / scaleFactor)),
        useContentSize: true,
        show: false,
        frame: false,
        resizable: false,
        backgroundColor: transparent ? "#00000000" : "#141312",
        transparent,
        paintWhenInitiallyHidden: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: false,
            offscreen: false,
            zoomFactor: 1 / scaleFactor,
        },
    })
    state.window = exportWindow

    try {
        const videoFrames = await prepareExportVideoFrames(request, state)
        if (state.cancelled) throw new Error("Export cancelled.")
        await exportWindow.loadURL(rendererURL(true))
        const ready = onceIPC("export:ready", (payload) => payload.exportId === exportId, 30000, state)
        exportWindow.webContents.send("export:init", { exportId, request, videoFrames })
        await ready

        if (state.cancelled) throw new Error("Export cancelled.")

        const totalFrames = Math.max(1, Math.ceil((request.durationMs / 1000) * request.fps))
        const child = spawn(ffmpegPath(), encoderArgs(request, outputPath), {
            stdio: ["pipe", "ignore", "pipe"],
        })
        state.process = child
        let ffmpegError = ""
        child.stderr.on("data", (chunk) => {
            ffmpegError += chunk.toString()
        })
        const finished = new Promise((resolve, reject) => {
            child.once("error", reject)
            child.once("close", (code) => {
                if (code === 0) resolve()
                else reject(new Error(ffmpegError.trim() || `FFmpeg exited with code ${code}.`))
            })
        })
        void finished.catch(() => {})

        for (let frame = 0; frame < totalFrames; frame += 1) {
            if (state.cancelled) throw new Error("Export cancelled.")
            const timeMs = Math.min(request.durationMs, (frame / request.fps) * 1000)
            const frameId = `${exportId}-${frame}`
            const frameReady = onceIPC(
                "export:frame-ready",
                (payload) => payload.exportId === exportId && payload.frameId === frameId,
                30000,
                state
            )
            exportWindow.webContents.send("export:set-frame", {
                exportId,
                frameId,
                timeMs,
            })
            await frameReady
            const image = await exportWindow.webContents.capturePage()
            const size = image.getSize()
            if (size.width !== request.width || size.height !== request.height) {
                throw new Error(
                    `Captured ${size.width}×${size.height}; expected ${request.width}×${request.height}.`
                )
            }
            if (
                (request.posterFrame === "first" && frame === 0) ||
                (request.posterFrame === "last" && frame === totalFrames - 1)
            ) {
                posterImage = image
            }
            await writeBuffer(child.stdin, image.toPNG())
            report({
                exportId,
                phase: "rendering",
                progress: (frame + 1) / totalFrames,
                frame: frame + 1,
                totalFrames,
                outputPath,
            })
        }

        child.stdin.end()
        report({ exportId, phase: "encoding", progress: 1, outputPath })
        await finished
        if (posterPath && posterImage) {
            fs.writeFileSync(posterPath, posterImage.toJPEG(92))
        }
        report({
            exportId,
            phase: "done",
            progress: 1,
            outputPath,
            ...(posterPath ? { posterPath } : {}),
        })
        return { outputPath, ...(posterPath ? { posterPath } : {}) }
    } catch (error) {
        const cancelled = state.cancelled || error.message === "Export cancelled."
        state.process?.kill("SIGKILL")
        if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true })
        if (posterPath && fs.existsSync(posterPath)) fs.rmSync(posterPath, { force: true })
        report({
            exportId,
            phase: cancelled ? "cancelled" : "error",
            progress: 0,
            outputPath,
            message: cancelled ? "Export cancelled." : error.message,
        })
        if (cancelled) return { cancelled: true }
        throw error
    } finally {
        if (!exportWindow.isDestroyed()) exportWindow.destroy()
        if (activeExport === state) activeExport = null
    }
}

app.whenReady().then(async () => {
    if (process.platform === "darwin") {
        const iconPath = app.isPackaged
            ? path.join(process.resourcesPath, "icon.icns")
            : path.join(__dirname, "..", "build", "icon.png")
        const icon = nativeImage.createFromPath(iconPath)
        if (!icon.isEmpty()) app.dock.setIcon(icon)
    }
    protocol.handle("reel-media", (request) => {
        try {
            const url = new URL(request.url)
            const token = url.pathname.replace(/^\//, "")
            const filePath = Buffer.from(token, "base64url").toString()
            return net.fetch(pathToFileURL(filePath).href)
        } catch {
            return new Response("Media not found", { status: 404 })
        }
    })

    ipcMain.handle("media:pick", async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: "Choose photos and videos",
            buttonLabel: "Add Frames",
            properties: ["openFile", "multiSelections"],
            filters: [
                {
                    name: "Images & silent video",
                    extensions: ["jpg", "jpeg", "png", "webp", "gif", "avif", "mp4", "webm", "mov", "m4v"],
                },
            ],
        })
        return result.canceled ? [] : result.filePaths.map(fileToMedia)
    })
    ipcMain.handle("media:from-path", (_event, filePath) =>
        filePath && fs.existsSync(filePath) ? fileToMedia(filePath) : null
    )
    ipcMain.handle("media:create-video-proxy", (_event, url) => createVideoProxy(url))
    ipcMain.handle("project:save", (_event, config) => savePortableProject(config))
    ipcMain.handle("project:open", () => openPortableProject())
    ipcMain.handle("template:save", (_event, settings) => saveSettingsTemplate(settings))
    ipcMain.handle("template:open", () => openSettingsTemplate())
    ipcMain.handle("recovery:load", () => {
        try {
            return JSON.parse(fs.readFileSync(recoveryPath(), "utf8"))
        } catch {
            return null
        }
    })
    ipcMain.handle("recovery:save", (_event, snapshot) => {
        const target = recoveryPath()
        const temporary = `${target}.tmp`
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(temporary, JSON.stringify(snapshot), "utf8")
        fs.renameSync(temporary, target)
        return { savedAt: snapshot.savedAt }
    })
    ipcMain.handle("export:cancel", () => {
        cancelActiveExport()
    })
    ipcMain.handle("export:reveal", (_event, filePath) => shell.showItemInFolder(filePath))
    ipcMain.handle("export:start", async (_event, request) => {
        if (activeExport) throw new Error("An export is already running.")
        const extension = request.format === "mp4" ? "mp4" : request.format === "premiere" ? "mov" : "webm"
        let outputPath = request.outputPath
        if (!outputPath) {
            const date = new Date().toISOString().slice(0, 10)
            const result = await dialog.showSaveDialog(mainWindow, {
                title: "Export Galileo Gallery",
                buttonLabel: "Export",
                defaultPath: path.join(safeExportFolder(), `Galileo Gallery ${date}.${extension}`),
                filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
            })
            if (result.canceled || !result.filePath) return { cancelled: true }
            outputPath = result.filePath.endsWith(`.${extension}`)
                ? result.filePath
                : `${result.filePath}.${extension}`
        }
        return runExport(request, outputPath)
    })

    if (process.env.REEL_SMOKE_OUTPUT) {
        const smokeOutput = path.resolve(process.env.REEL_SMOKE_OUTPUT)
        const smokeExtension = path.extname(smokeOutput).toLowerCase()
        const inferredSmokeFormat = smokeExtension === ".mov" ? "premiere" : smokeExtension === ".webm" ? "webm" : "mp4"
        const smokeFormat = ["mp4", "premiere", "webm", "webm-small"].includes(process.env.REEL_SMOKE_FORMAT)
            ? process.env.REEL_SMOKE_FORMAT
            : inferredSmokeFormat
        const [smokeWidth, smokeHeight] = (process.env.REEL_SMOKE_SIZE ?? "640x360")
            .split("x")
            .map((value) => Number(value))
        const smokeMediaSources = (process.env.REEL_SMOKE_MEDIA_SOURCES ?? process.env.REEL_SMOKE_VIDEO_SOURCES ?? process.env.REEL_SMOKE_VIDEO_SOURCE ?? "")
            .split(path.delimiter)
            .filter(Boolean)
            .map((source) => path.resolve(source))
        const smokeMedia = smokeMediaSources.map(fileToMedia)
        const smokeItems = smokeMedia.length
            ? Array.from({ length: Math.max(3, smokeMedia.length) }, (_, index) => ({
                  id: `smoke-video-${index}`,
                  name: smokeMedia[index % smokeMedia.length].name,
                  type: smokeMedia[index % smokeMedia.length].type,
                  url: smokeMedia[index % smokeMedia.length].url,
                  ratio: 16 / 9,
                  aspectMode: "auto",
                  ratioW: 16,
                  ratioH: 9,
                  spotlight: index < 2,
                  muted: false,
              }))
            : []
        const smokeDuration = Number(process.env.REEL_SMOKE_DURATION) || (smokeMedia.length ? 4200 : 1000)
        fs.mkdirSync(path.dirname(smokeOutput), { recursive: true })
        try {
            const smokeExport = runExport(
                {
                    config: {
                        styleId: process.env.REEL_SMOKE_STYLE ?? "opening-reel",
                        items: smokeItems,
                        settings: {
                            motionPreset: "cut",
                            paceMs: 150,
                            leadInMs: 0,
                            holdMs: 600,
                            finaleGrowMs: 400,
                            finaleHoldMs: 700,
                            autoplayVideos: true,
                            loopVideos: process.env.REEL_SMOKE_LOOP_VIDEOS !== "false",
                            playKind: process.env.REEL_SMOKE_PLAY_KIND ?? "once",
                            repeatCount: Number(process.env.REEL_SMOKE_REPEAT_COUNT) || 3,
                            axis: process.env.REEL_SMOKE_AXIS === "vertical" ? "vertical" : "horizontal",
                            direction: process.env.REEL_SMOKE_DIRECTION === "reverse" ? "reverse" : "forward",
                            spotlightsEnabled: process.env.REEL_SMOKE_SPOTLIGHTS !== "false",
                            finaleEnabled: process.env.REEL_SMOKE_FINALE !== "false",
                            heroSize: 70,
                            finaleSize: 100,
                            slideHeight: 44,
                            gap: 30,
                            gridStrength: 7,
                            theme: "dark",
                            backgroundStyle: process.env.REEL_SMOKE_TRANSPARENT ? "transparent" : "solid",
                        },
                    },
                    width: smokeWidth || 640,
                    height: smokeHeight || 360,
                    fps: Number(process.env.REEL_SMOKE_FPS) || 12,
                    durationMs: smokeDuration,
                    cycleDurationMs: Number(process.env.REEL_SMOKE_CYCLE_DURATION) || smokeDuration,
                    format: smokeFormat,
                    quality: ["master", "optimized"].includes(process.env.REEL_SMOKE_QUALITY)
                        ? process.env.REEL_SMOKE_QUALITY
                        : "high",
                    posterFrame: ["last", "none"].includes(process.env.REEL_SMOKE_POSTER_FRAME)
                        ? process.env.REEL_SMOKE_POSTER_FRAME
                        : "first",
                    outputPath: smokeOutput,
                },
                smokeOutput
            )
            const cancelAfterMs = Number(process.env.REEL_SMOKE_CANCEL_AFTER_MS)
            if (cancelAfterMs > 0) setTimeout(cancelActiveExport, cancelAfterMs)
            await smokeExport
            app.exit(0)
        } catch (error) {
            console.error(error)
            app.exit(1)
        }
        return
    }

    if (process.env.REEL_PATH_SMOKE) {
        console.log(safeExportFolder())
        app.exit(0)
        return
    }

    if (process.env.REEL_PROJECT_SMOKE_OUTPUT) {
        const outputPath = path.resolve(process.env.REEL_PROJECT_SMOKE_OUTPUT)
        const templatePath = `${outputPath}-template.json`
        try {
            const snapshot = JSON.parse(fs.readFileSync(recoveryPath(), "utf8"))
            await savePortableProject(snapshot.config, outputPath)
            const opened = await openPortableProject(outputPath)
            await saveSettingsTemplate(snapshot.config.settings, templatePath)
            const template = await openSettingsTemplate(templatePath)
            console.log(JSON.stringify({
                projectItems: opened.config.items.length,
                templateSettings: Object.keys(template.settings).length,
                mediaExists: opened.config.items.every((item) => fs.existsSync(mediaURLToPath(item.url))),
            }))
            app.exit(0)
        } catch (error) {
            console.error(error)
            app.exit(1)
        }
        return
    }

    if (process.env.REEL_PROXY_SMOKE_SOURCE) {
        try {
            const source = path.resolve(process.env.REEL_PROXY_SMOKE_SOURCE)
            const mediaURL = fileToMedia(source).url
            const proxy = await createVideoProxy(mediaURL)
            console.log(mediaURLToPath(proxy))
            app.exit(0)
        } catch (error) {
            console.error(error)
            app.exit(1)
        }
        return
    }

    createMainWindow()
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
})

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit()
})
