const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const PRESENTATION_KEY = "galileo-gallery:local-presentation:v1"
const PROJECT_KEY = "galileo-gallery-project-v1"

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex")
}

async function waitFor(window, expression, label, timeoutMs = 12_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`Timed out waiting for ${label}.`)
}

async function settleRenderer(window) {
    await window.webContents.executeJavaScript(`(async () => {
        await document.fonts.ready
        await Promise.all(Array.from(document.images).map(async (image) => {
            try { await image.decode() } catch {}
            if (!image.complete || image.naturalWidth < 1 || image.naturalHeight < 1) {
                throw new Error('Interface image did not decode: ' + (image.currentSrc || image.src))
            }
        }))
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        return true
    })()`)
}

async function resize(window, width, height) {
    window.setSize(width, height)
    await new Promise((resolve) => setTimeout(resolve, 120))
    await settleRenderer(window)
}

async function capture(window, outputDirectory, name) {
    await settleRenderer(window)
    const image = await window.webContents.capturePage()
    const png = image.toPNG()
    const file = path.join(outputDirectory, `${name}.png`)
    fs.writeFileSync(file, png)
    return { file: path.basename(file), bytes: png.length, sha256: sha256(png), size: image.getSize() }
}

async function setScale(window, target) {
    await window.webContents.executeJavaScript(`(async () => {
        const group = document.querySelector('.interface-scale-control')
        if (!group) throw new Error('Interface Scale control is missing.')
        const increase = group.querySelector('button:last-child')
        const decrease = group.querySelector('button:first-child')
        const initial = Number(document.querySelector('[data-interface-scale]').dataset.interfaceScale)
        if (initial === ${target} && !localStorage.getItem('${PRESENTATION_KEY}')) {
            ;(${target} === 200 ? decrease : increase).click()
            await new Promise((resolve) => requestAnimationFrame(resolve))
            ;(${target} === 200 ? increase : decrease).click()
            await new Promise((resolve) => requestAnimationFrame(resolve))
        }
        for (let guard = 0; guard < 40; guard += 1) {
            const current = Number(document.querySelector('[data-interface-scale]').dataset.interfaceScale)
            if (current === ${target}) break
            ;(current < ${target} ? increase : decrease).click()
            await new Promise((resolve) => requestAnimationFrame(resolve))
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const root = document.querySelector('[data-interface-scale]')
        const visible = group.querySelector('.interface-scale-value')?.textContent?.trim()
        const manifest = JSON.parse(localStorage.getItem('${PRESENTATION_KEY}'))
        if (root?.dataset.interfaceScale !== '${target}' || visible !== '${target}%' || manifest?.interfaceScale !== ${target}) {
            throw new Error('Interface Scale did not settle visibly and persist at ${target}%.')
        }
        return true
    })()`)
    await settleRenderer(window)
}

async function reloadRenderer(window) {
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Renderer reload timed out.")), 15_000)
        window.webContents.once("did-finish-load", () => {
            clearTimeout(timer)
            resolve()
        })
        window.webContents.reload()
    })
    await settleRenderer(window)
}

async function freezeStoryPose(window, value = 0.42) {
    await window.webContents.executeJavaScript(`(async () => {
        const timeline = document.querySelector('.timeline')
        if (!timeline) throw new Error('Studio timeline is missing.')
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        valueSetter.call(timeline, '${value}')
        timeline.dispatchEvent(new Event('input', { bubbles: true }))
        timeline.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        if (Math.abs(Number(timeline.value) - ${value}) > 0.0001) throw new Error('Story pose did not freeze.')
        return true
    })()`)
    await settleRenderer(window)
}

async function readMetrics(window) {
    return window.webContents.executeJavaScript(`(() => {
        const rect = (selector) => {
            const element = document.querySelector(selector)
            if (!element) throw new Error('Missing interface element: ' + selector)
            const box = element.getBoundingClientRect()
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
        }
        const scaleRoot = document.querySelector('[data-interface-scale]')
        const shell = document.querySelector('.app-shell')
        const stage = rect('.stage-shell')
        const focusTarget = document.querySelector('.title-actions .button.primary')
        focusTarget.focus()
        const focusStyle = getComputedStyle(focusTarget)
        const manifest = JSON.parse(localStorage.getItem('${PRESENTATION_KEY}'))
        return {
            viewport: { width: innerWidth, height: innerHeight },
            interfaceScale: Number(scaleRoot.dataset.interfaceScale),
            scaleLabel: document.querySelector('.interface-scale-value').textContent.trim(),
            surfaceTransform: getComputedStyle(document.querySelector('.interface-scale-surface')).transform,
            shell: {
                clientWidth: shell.clientWidth,
                scrollWidth: shell.scrollWidth,
                clientHeight: shell.clientHeight,
                scrollHeight: shell.scrollHeight,
            },
            targets: {
                primary: rect('.title-actions .button.primary'),
                icon: rect('.icon-button'),
                addMedia: rect('.add-media'),
                segment: rect('.inspector-top .segment button'),
                scaleButton: rect('.interface-scale-control button'),
            },
            focus: { outlineStyle: focusStyle.outlineStyle, outlineWidth: focusStyle.outlineWidth },
            preview: {
                metadata: document.querySelector('.stage-meta').textContent.replace(/\\s+/g, ' ').trim(),
                ratio: stage.width / stage.height,
                timelineMax: document.querySelector('.timeline').max,
                timelineValue: Number(document.querySelector('.timeline').value),
                timeLabel: document.querySelector('.transport time').textContent.replace(/\\s+/g, ' ').trim(),
            },
            projectDocument: localStorage.getItem('${PROJECT_KEY}'),
            exportSummary: document.querySelector('.export-summary').textContent.replace(/\\s+/g, ' ').trim(),
            exportFormats: Array.from(document.querySelectorAll('.format-cards button')).map((button) => ({
                text: button.textContent.replace(/\\s+/g, ' ').trim(),
                disabled: button.disabled,
            })),
            manifest: {
                format: manifest.format,
                product: manifest.product,
                schemaVersion: manifest.schemaVersion,
                interfaceScale: manifest.interfaceScale,
            },
        }
    })()`)
}

async function verifyBottomReachability(window) {
    const result = await window.webContents.executeJavaScript(`(async () => {
        const shell = document.querySelector('.app-shell')
        const inspector = document.querySelector('.inspector-scroll')
        shell.scrollTop = shell.scrollHeight
        inspector.scrollTop = inspector.scrollHeight
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const button = document.querySelector('.export-button').getBoundingClientRect()
        const reachable = button.bottom > 0 && button.top < innerHeight && button.left >= -1 && button.right <= innerWidth + 1
        const result = { reachable, button: { left: button.left, top: button.top, right: button.right, bottom: button.bottom } }
        shell.scrollTop = 0
        inspector.scrollTop = 0
        return result
    })()`)
    if (!result.reachable) throw new Error("The export action is clipped or unreachable at this Interface Scale.")
    await settleRenderer(window)
    return result
}

function assertInvariant(metrics) {
    const baseline = metrics["wide-100"]
    for (const [key, value] of Object.entries(metrics)) {
        if (value.interfaceScale !== Number(key.split("-")[1])) throw new Error(`${key} rendered the wrong Interface Scale.`)
        if (value.scaleLabel !== `${value.interfaceScale}%`) throw new Error(`${key} showed a stale Interface Scale label.`)
        if (value.manifest.interfaceScale !== value.interfaceScale) throw new Error(`${key} did not persist its visible Interface Scale.`)
        if (value.preview.metadata !== baseline.preview.metadata
            || value.preview.timelineMax !== baseline.preview.timelineMax
            || value.preview.timeLabel !== baseline.preview.timeLabel
            || value.preview.timelineValue !== baseline.preview.timelineValue
            || value.projectDocument !== baseline.projectDocument
            || value.exportSummary !== baseline.exportSummary
            || JSON.stringify(value.exportFormats) !== JSON.stringify(baseline.exportFormats)) {
            throw new Error(`${key} changed Project, Timeline, audio, or export-facing truth.`)
        }
        if (Math.abs(value.preview.ratio - baseline.preview.ratio) > 0.002) throw new Error(`${key} changed the preview canvas ratio.`)
        if (value.shell.scrollWidth > value.shell.clientWidth + 1) throw new Error(`${key} has horizontally clipped studio content.`)
        const physicalTargetFloor = value.interfaceScale < 100 ? 44 : 44 * value.interfaceScale / 100
        if (Object.values(value.targets).some((target) => target.height + 0.2 < physicalTargetFloor)) {
            throw new Error(`${key} has a primary target below its ${physicalTargetFloor}px physical floor.`)
        }
        if (value.focus.outlineStyle === "none" || parseFloat(value.focus.outlineWidth) < 2) throw new Error(`${key} lacks visible keyboard focus.`)
        if (!value.projectDocument) throw new Error(`${key} has no durable Project state to compare.`)
    }
}

async function runG08InterfaceSmoke(window, outputDirectory) {
    fs.mkdirSync(outputDirectory, { recursive: true })
    await resize(window, 1280, 900)
    await waitFor(window, `document.querySelector('.style-gallery-shell')`, "scene catalogue")
    await setScale(window, 100)
    const captures = { catalogue100: await capture(window, outputDirectory, "gallery-catalogue-100") }

    // Keyboard, persisted reload, and a real StorageEvent all converge without StrictMode leaks.
    await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true }))`)
    await waitFor(window, `document.querySelector('.interface-scale-value')?.textContent?.trim() === '105%'`, "keyboard scale increase")
    await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true }))`)
    await waitFor(window, `document.querySelector('.interface-scale-value')?.textContent?.trim() === '100%'`, "keyboard scale reset")
    await setScale(window, 125)
    await reloadRenderer(window)
    await waitFor(window, `document.querySelector('.style-gallery-shell') && document.querySelector('.interface-scale-value')?.textContent?.trim() === '125%'`, "persisted scale after reload")
    await window.webContents.executeJavaScript(`(() => {
        const current = JSON.parse(localStorage.getItem('${PRESENTATION_KEY}'))
        const next = { ...current, revision: current.revision + 1, writerId: 'ffffffffffffffff', interfaceScale: 130 }
        const text = JSON.stringify(next)
        localStorage.setItem('${PRESENTATION_KEY}', text)
        window.dispatchEvent(new StorageEvent('storage', { key: '${PRESENTATION_KEY}', newValue: text, storageArea: localStorage }))
    })()`)
    await waitFor(window, `document.querySelector('.interface-scale-value')?.textContent?.trim() === '130%'`, "real StorageEvent scale update")
    await setScale(window, 100)

    await window.webContents.executeJavaScript(`document.querySelector('button[data-style-id="opening-reel"]')?.click()`)
    await waitFor(window, `document.querySelector('.app-shell') && document.querySelector('.stage-shell')`, "Gallery studio")
    await waitFor(window, `!document.querySelector('.launch-screen')`, "launch transition", 15_000)
    await waitFor(window, `localStorage.getItem('${PROJECT_KEY}')`, "durable Project snapshot")
    await window.webContents.executeJavaScript(`document.querySelector('.title-actions .button.primary')?.click()`)
    await waitFor(window, `document.querySelector('.export-summary') && document.querySelectorAll('.format-cards button').length === 2`, "verified export controls")
    const host = await window.webContents.executeJavaScript(`(async () => ({
        identity: await window.galleryHost.identity(),
        capabilities: await window.galleryHost.exportCapabilities(),
    }))()`)
    if (host.identity.productId !== "galileo-gallery" || host.capabilities.formats.map((format) => format.id).join(",") !== "png-frames,mp4-h264-aac") {
        throw new Error("G08 did not exercise the current Linux HostPort and export capability seam.")
    }
    const formatTruth = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.format-cards button')).map((button) => ({ text: button.textContent.replace(/\\s+/g, ' ').trim(), disabled: button.disabled }))`)
    if (formatTruth[0]?.disabled || !formatTruth[0]?.text.startsWith("PNG Frames") || !formatTruth[1]?.disabled || !formatTruth[1]?.text.includes("Quiet Carousel only")) {
        throw new Error("G08 did not preserve the honest Scene-specific export capability boundary.")
    }
    await freezeStoryPose(window)

    const metrics = {}
    const reachability = {}
    for (const [viewportName, width, height] of [["wide", 1280, 900], ["minimum", 1080, 700]]) {
        await resize(window, width, height)
        for (const scale of [75, 100, 150, 200]) {
            await setScale(window, scale)
            await freezeStoryPose(window)
            const key = `${viewportName}-${scale}`
            metrics[key] = await readMetrics(window)
            captures[key] = await capture(window, outputDirectory, `gallery-studio-${key}`)
            reachability[key] = await verifyBottomReachability(window)
        }
    }
    assertInvariant(metrics)

    await resize(window, 1280, 900)
    await setScale(window, 100)
    const receipt = {
        task: "G08 integrated interface, scale, and HostPort smoke",
        source: {
            sha: process.env.GALLERY_SOURCE_SHA ?? null,
            tree: process.env.GALLERY_SOURCE_TREE ?? null,
        },
        host,
        captures,
        metrics,
        reachability,
        resetScale: Number(await window.webContents.executeJavaScript(`document.querySelector('[data-interface-scale]').dataset.interfaceScale`)),
    }
    fs.writeFileSync(path.join(outputDirectory, "renderer-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`)
    console.log(JSON.stringify({ receipt: path.join(outputDirectory, "renderer-receipt.json"), captures: receipt.captures }))
}

module.exports = { runG08InterfaceSmoke }
