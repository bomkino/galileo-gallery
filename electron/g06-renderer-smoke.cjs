const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { nativeImage } = require("electron")
const { inspectPng } = require("./png-frames-runtime.cjs")

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(window, expression, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (await window.webContents.executeJavaScript(expression)) return
        await wait(100)
    }
    throw new Error(`G06 renderer smoke timed out: ${expression}`)
}

async function clickText(window, selector, text) {
    const encodedSelector = JSON.stringify(selector)
    const encodedText = JSON.stringify(text)
    const clicked = await window.webContents.executeJavaScript(`(() => {
        const element = [...document.querySelectorAll(${encodedSelector})].find((candidate) => candidate.textContent.trim().toLowerCase().includes(${encodedText}.toLowerCase()))
        if (!element) return false
        element.click()
        return true
    })()`)
    if (!clicked) throw new Error(`G06 renderer smoke could not click ${text}.`)
}

async function prepareStudio(window) {
    await until(window, `Boolean(document.querySelector('.style-gallery-shell'))`)
    await clickText(window, "button", "Back to studio")
    await until(window, `Boolean(document.querySelector('.app-shell'))`)
    await clickText(window, "button", "Open project")
    await until(window, `document.querySelectorAll('.media-row').length === 1 && !document.body.textContent.includes('Opening project…')`)
    const selected = await window.webContents.executeJavaScript(`(() => {
        const button = [...document.querySelectorAll('.background-style-grid button')].find((candidate) => candidate.textContent.trim().toLowerCase() === 'transparent')
        if (!button) return false
        button.click()
        return true
    })()`)
    if (!selected) throw new Error("G06 renderer smoke could not select transparency.")
    await clickText(window, ".inspector-top button", "Export")
    await until(window, `Boolean(document.querySelector('.export-panel'))`)
    await window.webContents.executeJavaScript(`(() => {
        const canvasLabel = [...document.querySelectorAll('label')].find((candidate) => candidate.querySelector('.field-label')?.textContent.trim() === 'Canvas')
        const select = canvasLabel?.querySelector('select')
        if (!select) return false
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'custom')
        select.dispatchEvent(new Event('change', { bubbles: true }))
        return true
    })()`)
    await until(window, `Boolean(document.querySelector('.canvas-dimensions'))`)
    await window.webContents.executeJavaScript(`(() => {
        for (const input of document.querySelectorAll('.canvas-dimensions input')) {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '64')
            input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        const rate = [...document.querySelectorAll('.compact-controls > div')].find((candidate) => candidate.querySelector('.field-label')?.textContent.trim() === 'Frame rate')
        ;[...rate.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === '24')?.click()
    })()`)
    await wait(200)
}

async function runG06RendererSmoke(window, evidenceRoot, mode) {
    fs.mkdirSync(evidenceRoot, { recursive: true })
    const destination = path.resolve(process.env.REEL_G06_PNG_DESTINATION)
    await prepareStudio(window)
    if (mode === "cancel") {
        await window.webContents.executeJavaScript(`(() => {
            window.__g06ObservedExportProgress = []
            window.galleryHost.onExportProgress((progress) => {
                window.__g06ObservedExportProgress.push({
                    exportId: progress.exportId,
                    phase: progress.phase,
                    frame: progress.frame ?? null,
                    totalFrames: progress.totalFrames ?? null,
                })
            })
        })()`)
    }
    await clickText(window, ".export-button", "Export verified PNG Frames")
    await until(window, `Boolean(document.querySelector('.export-progress'))`)
    if (mode === "cancel") {
        await until(window, `window.__g06ObservedExportProgress.some((progress) => progress.phase === 'rendering' && progress.frame >= 1)`)
        await clickText(window, ".export-progress button", "Cancel")
        await until(window, `document.querySelector('.export-cancelled[role="status"][data-export-phase="cancelled"]')?.textContent.trim() === 'Export cancelled.'`)
        if (fs.readFileSync(path.join(destination, "prior.txt"), "utf8") !== "preserve-me") throw new Error("G06 real cancellation changed the prior destination.")
        if (fs.readdirSync(destination).join("\n") !== "prior.txt") throw new Error("G06 real cancellation left output inside the prior destination.")
        const transactionResidue = fs.readdirSync(path.dirname(destination)).filter((name) => /^\.gallery-png-(?:stage|backup)-[a-f0-9]{32}$/.test(name))
        if (transactionResidue.length) throw new Error("G06 real cancellation left transactional residue.")
        const outcome = await window.webContents.executeJavaScript(`(() => ({
            terminalPhase: document.querySelector('.export-cancelled')?.dataset.exportPhase,
            status: document.querySelector('.export-cancelled')?.textContent.trim(),
            progress: window.__g06ObservedExportProgress,
        }))()`)
        if (outcome.terminalPhase !== "cancelled" || outcome.status !== "Export cancelled."
            || !outcome.progress.some((progress) => progress.phase === "rendering" && progress.frame >= 1)) {
            throw new Error("G06 real cancellation did not cross the active public export seam before reaching its terminal state.")
        }
        fs.writeFileSync(path.join(evidenceRoot, "cancel.json"), `${JSON.stringify({
            mode,
            priorPreserved: true,
            destinationEntries: ["prior.txt"],
            transactionResidue,
            terminalPhase: outcome.terminalPhase,
            status: outcome.status,
            observedProgress: outcome.progress,
        }, null, 2)}\n`)
        return
    }
    await until(window, `document.querySelector('.export-success strong')?.textContent.includes('PNG Frames verified')`, 120_000)
    const manifestPath = path.join(destination, "manifest.json")
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    if (manifest.format !== "galileo-gallery-png-frames" || manifest.frameCount !== manifest.frames.length || manifest.audio !== "none" || manifest.width !== 64 || manifest.height !== 64 || manifest.alpha !== true) {
        throw new Error("G06 real renderer manifest is invalid.")
    }
    let transparentPixels = 0
    let opaquePixels = 0
    let artworkPixels = 0
    for (const frame of manifest.frames) {
        const bytes = fs.readFileSync(path.join(destination, frame.name))
        const inspected = inspectPng(bytes, { width: 64, height: 64, alpha: true })
        if (inspected.sha256 !== frame.sha256 || inspected.bytes !== frame.bytes) throw new Error("G06 real renderer frame verification failed.")
    }
    const image = nativeImage.createFromPath(path.join(destination, manifest.frames[0].name))
    const bitmap = image.toBitmap()
    for (let offset = 3; offset < bitmap.length; offset += 4) {
        if (bitmap[offset] === 0) transparentPixels += 1
        if (bitmap[offset] === 255) {
            opaquePixels += 1
            const blue = bitmap[offset - 3]
            const green = bitmap[offset - 2]
            const red = bitmap[offset - 1]
            if (Math.max(red, green, blue) - Math.min(red, green, blue) > 12) artworkPixels += 1
        }
    }
    if (transparentPixels < 1 || opaquePixels < 64 || artworkPixels < 16) throw new Error("G06 real renderer did not preserve mixed alpha and source artwork pixels.")
    const screenshot = await window.webContents.capturePage()
    fs.writeFileSync(path.join(evidenceRoot, "success.png"), screenshot.toPNG())
    fs.writeFileSync(path.join(evidenceRoot, "success.json"), `${JSON.stringify({
        mode,
        frameCount: manifest.frameCount,
        dimensions: [manifest.width, manifest.height],
        alpha: manifest.alpha,
        audio: manifest.audio,
        transparentPixels,
        opaquePixels,
        artworkPixels,
        manifestSha256: crypto.createHash("sha256").update(fs.readFileSync(manifestPath)).digest("hex"),
    }, null, 2)}\n`)
}

module.exports = { runG06RendererSmoke }
