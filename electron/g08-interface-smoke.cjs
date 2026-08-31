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
            try {
                await image.decode()
            } catch (error) {
                throw new Error('Interface image decode failed: ' + (image.currentSrc || image.src) + ' · ' + error)
            }
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
        const stage = rect('.stage')
        const stageShellElement = document.querySelector('.stage-shell')
        const stageShell = rect('.stage-shell')
        const declaredAspect = getComputedStyle(stageShellElement).aspectRatio
        const aspectParts = declaredAspect.split('/').map(Number)
        const declaredRatio = aspectParts.length === 2 && aspectParts.every(Number.isFinite)
            ? aspectParts[0] / aspectParts[1]
            : Number.NaN
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
            regions: {
                titlebar: rect('.titlebar'),
                library: rect('.library'),
                studio: rect('.studio'),
                inspector: rect('.inspector'),
            },
            targets: {
                primary: rect('.title-actions .button.primary'),
                icon: rect('.icon-button'),
                addMedia: rect('.add-media'),
                segment: rect('.inspector-top .segment button'),
                scaleButton: rect('.interface-scale-control button'),
                format: rect('.format-cards button'),
                export: rect('.export-button'),
                timeline: rect('.timeline'),
            },
            focus: { outlineStyle: focusStyle.outlineStyle, outlineWidth: focusStyle.outlineWidth },
            preview: {
                metadata: document.querySelector('.stage-meta').textContent.replace(/\\s+/g, ' ').trim(),
                planeRatio: stage.width / stage.height,
                shellRatio: stageShell.width / stageShell.height,
                declaredAspect,
                declaredRatio,
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
            designSystem: {
                bodyFont: getComputedStyle(document.body).fontFamily,
                headingFont: getComputedStyle(document.querySelector('.panel-heading h2')).fontFamily,
                eyebrowFont: getComputedStyle(document.querySelector('.eyebrow')).fontFamily,
                fontReady: ['PD Head', 'PD Body', 'PD Body Alt', 'PD Eyebrow'].every((family) => document.fonts.check('12px \"' + family + '\"')),
                phosphorIcons: document.querySelectorAll('[data-phosphor-icon]').length,
                rogueControlSvgs: Array.from(document.querySelectorAll('.titlebar button svg, .library button svg, .inspector button svg, .transport button svg')).filter((svg) => !svg.hasAttribute('data-phosphor-icon')).length,
                spacingTokens: ['--pd-space-1', '--pd-space-2', '--pd-space-3', '--pd-space-4', '--pd-space-6', '--pd-space-8', '--pd-space-10'].map((token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim()),
            },
            manifest: {
                format: manifest.format,
                product: manifest.product,
                schemaVersion: manifest.schemaVersion,
                interfaceScale: manifest.interfaceScale,
            },
        }
    })()`)
}

async function verifyWorkflowNavigation(window) {
    return window.webContents.executeJavaScript(`(async () => {
        const before = localStorage.getItem('${PROJECT_KEY}')
        const slides = document.querySelector('.library .panel-heading h2')?.textContent?.trim()
        const buttons = Array.from(document.querySelectorAll('.inspector-top .segment button'))
        const tabs = buttons.map((button) => button.textContent.trim())
        const seams = ['.style-current-panel', '.motion-workspace-intro', '.export-intro']
        const steps = []
        for (let index = 0; index < buttons.length; index += 1) {
            const button = buttons[index]
            button.click()
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            const active = document.querySelector('.inspector-top .segment button.is-active')?.textContent?.trim()
            const seam = document.querySelector(seams[index])
            steps.push({
                active,
                seam: seams[index],
                visible: Boolean(seam && seam.getClientRects().length),
                projectInvariant: before === localStorage.getItem('${PROJECT_KEY}'),
            })
        }
        buttons[0].focus()
        buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const arrow = {
            active: document.querySelector('.inspector-top .segment button.is-active')?.textContent?.trim(),
            focused: document.activeElement?.textContent?.trim(),
        }
        document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const end = {
            active: document.querySelector('.inspector-top .segment button.is-active')?.textContent?.trim(),
            focused: document.activeElement?.textContent?.trim(),
        }
        return {
            slides,
            tabs,
            steps,
            keyboard: { arrow, end },
            projectInvariant: before === localStorage.getItem('${PROJECT_KEY}'),
            active: document.querySelector('.inspector-top .segment button.is-active')?.textContent?.trim(),
        }
    })()`)
}

async function readCatalogueMetrics(window) {
    return window.webContents.executeJavaScript(`(() => {
        const rect = (selector) => {
            const element = document.querySelector(selector)
            if (!element) throw new Error('Missing catalogue element: ' + selector)
            const box = element.getBoundingClientRect()
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
        }
        const scaleRoot = document.querySelector('[data-interface-scale]')
        const shell = document.querySelector('.style-gallery-shell')
        return {
            viewport: { width: innerWidth, height: innerHeight },
            interfaceScale: Number(scaleRoot.dataset.interfaceScale),
            scaleLabel: document.querySelector('.interface-scale-value').textContent.trim(),
            shell: {
                clientWidth: shell.clientWidth,
                scrollWidth: shell.scrollWidth,
                clientHeight: shell.clientHeight,
                scrollHeight: shell.scrollHeight,
            },
            targets: {
                scaleButton: rect('.interface-scale-control button'),
                category: rect('.style-category-pills button'),
                search: rect('.style-search input'),
                scene: rect('.style-card'),
            },
        }
    })()`)
}

async function scrollCatalogueToBottom(window) {
    const result = await window.webContents.executeJavaScript(`(async () => {
        const shell = document.querySelector('.style-gallery-shell')
        const cards = Array.from(document.querySelectorAll('.style-card'))
        shell.scrollTop = shell.scrollHeight
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const box = cards.at(-1).getBoundingClientRect()
        const visibleTop = Math.max(0, box.top)
        const visibleBottom = Math.min(innerHeight, box.bottom)
        const hit = document.elementFromPoint((box.left + box.right) / 2, (visibleTop + visibleBottom) / 2)
        const unobscured = Boolean(hit && cards.at(-1).contains(hit))
        return {
            reachable: box.bottom > 0 && box.top < innerHeight && box.left >= -1 && box.right <= innerWidth + 1 && unobscured,
            unobscured,
            lastScene: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
        }
    })()`)
    if (!result.reachable) throw new Error('The final Scene card is clipped or unreachable at this Interface Scale.')
    await settleRenderer(window)
    return result
}

async function resetCatalogueScroll(window) {
    await window.webContents.executeJavaScript(`document.querySelector('.style-gallery-shell').scrollTop = 0`)
    await settleRenderer(window)
}

async function verifyBottomReachability(window) {
    const result = await window.webContents.executeJavaScript(`(async () => {
        const shell = document.querySelector('.app-shell')
        const inspector = document.querySelector('.inspector-scroll')
        shell.scrollTop = shell.scrollHeight
        inspector.scrollTop = inspector.scrollHeight
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const buttonElement = document.querySelector('.export-button')
        const button = buttonElement.getBoundingClientRect()
        const hit = document.elementFromPoint((button.left + button.right) / 2, (button.top + button.bottom) / 2)
        const unobscured = Boolean(hit && buttonElement.contains(hit))
        const reachable = button.bottom > 0 && button.top < innerHeight && button.left >= -1 && button.right <= innerWidth + 1 && unobscured
        const result = { reachable, unobscured, button: { left: button.left, top: button.top, right: button.right, bottom: button.bottom } }
        shell.scrollTop = 0
        document.querySelector('.studio').scrollTop = 0
        inspector.scrollTop = 0
        return result
    })()`)
    if (!result.reachable) throw new Error("The export action is clipped or unreachable at this Interface Scale.")
    await settleRenderer(window)
    return result
}

async function scrollPreviewIntoView(window) {
    const result = await window.webContents.executeJavaScript(`(async () => {
        const stage = document.querySelector('.stage-shell')
        stage.scrollIntoView({ block: 'center', inline: 'nearest' })
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const box = stage.getBoundingClientRect()
        const visibleTop = Math.max(0, box.top)
        const visibleBottom = Math.min(innerHeight, box.bottom)
        const visibleHeight = Math.max(0, visibleBottom - visibleTop)
        const hit = document.elementFromPoint((box.left + box.right) / 2, (visibleTop + visibleBottom) / 2)
        const unobscured = Boolean(hit && stage.contains(hit))
        const requiredHeight = Math.min(box.height, innerHeight) * 0.8
        return {
            reachable: visibleHeight >= requiredHeight && box.left >= -1 && box.right <= innerWidth + 1 && unobscured,
            unobscured,
            visibleHeight,
            requiredHeight,
            stage: { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height },
        }
    })()`)
    if (!result.reachable) throw new Error('The preview canvas is clipped or obscured at this Interface Scale.')
    await settleRenderer(window)
    return result
}

async function resetStudioScroll(window) {
    await window.webContents.executeJavaScript(`(() => {
        document.querySelector('.app-shell').scrollTop = 0
        document.querySelector('.studio').scrollTop = 0
        document.querySelector('.inspector-scroll').scrollTop = 0
    })()`)
    await settleRenderer(window)
}

function assertInvariant(metrics) {
    const baseline = metrics["wide-100"]
    for (const [key, value] of Object.entries(metrics)) {
        if (!value.designSystem.bodyFont.includes('PD Body')) throw new Error(`${key} did not resolve PD Body.`)
        if (!value.designSystem.headingFont.includes('PD Head')) throw new Error(`${key} did not resolve PD Head.`)
        if (!value.designSystem.eyebrowFont.includes('PD Eyebrow')) throw new Error(`${key} did not resolve PD Eyebrow.`)
        if (!value.designSystem.fontReady) throw new Error(`${key} did not load every pitch.dog font role.`)
        if (value.designSystem.phosphorIcons < 4) throw new Error(`${key} rendered too few Phosphor interface icons.`)
        if (value.designSystem.rogueControlSvgs !== 0) throw new Error(`${key} rendered a non-Phosphor control SVG.`)
        if (value.designSystem.spacingTokens.some((token) => !token)) throw new Error(`${key} lost a pitch.dog spacing token.`)
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
        if (!Number.isFinite(value.preview.declaredRatio)
            || Math.abs(value.preview.declaredRatio - baseline.preview.declaredRatio) > Number.EPSILON
            || Math.abs(value.preview.shellRatio - value.preview.declaredRatio) > 0.002
            || Math.abs(value.preview.planeRatio - value.preview.declaredRatio) > 0.002) {
            throw new Error(`${key} changed or distorted the preview canvas ratio.`)
        }
        if (value.shell.scrollWidth > value.shell.clientWidth + 1) throw new Error(`${key} has horizontally clipped studio content.`)
        if (value.regions.titlebar.bottom > value.regions.library.top + 1) {
            throw new Error(`${key} lets the header overlap the Slides rail.`)
        }
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

    const catalogueMetrics = {}
    const catalogueReachability = {}
    await resize(window, 1080, 700)
    for (const scale of [75, 200]) {
        await setScale(window, scale)
        const key = `minimum-${scale}`
        catalogueMetrics[key] = await readCatalogueMetrics(window)
        const value = catalogueMetrics[key]
        const physicalTargetFloor = scale < 100 ? 44 : 44 * scale / 100
        if (value.shell.scrollWidth > value.shell.clientWidth + 1) throw new Error(`${key} has horizontally clipped catalogue content.`)
        if (Object.values(value.targets).some((target) => target.height + 0.2 < physicalTargetFloor)) {
            throw new Error(`${key} has a catalogue target below its ${physicalTargetFloor}px physical floor.`)
        }
        captures[`catalogue-${key}-top`] = await capture(window, outputDirectory, `gallery-catalogue-${key}-top`)
        catalogueReachability[key] = await scrollCatalogueToBottom(window)
        captures[`catalogue-${key}-bottom`] = await capture(window, outputDirectory, `gallery-catalogue-${key}-bottom`)
        await resetCatalogueScroll(window)
    }

    await resize(window, 1280, 900)
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
    if (!formatTruth[0]?.disabled || !formatTruth[0]?.text.includes("Quiet Carousel v1 or Vitrine v2 only") || !formatTruth[1]?.disabled || !formatTruth[1]?.text.includes("Quiet Carousel only")) {
        throw new Error("G08 did not preserve the honest Scene-specific export capability boundary.")
    }
    const workflow = await verifyWorkflowNavigation(window)
    if (workflow.slides !== "Slides"
        || workflow.tabs.join(",") !== "Look,Motion,Export"
        || workflow.steps.some((step, index) => step.active !== workflow.tabs[index] || !step.visible || !step.projectInvariant)
        || workflow.keyboard.arrow.active !== "Motion"
        || workflow.keyboard.arrow.focused !== "Motion"
        || workflow.keyboard.end.active !== "Export"
        || workflow.keyboard.end.focused !== "Export"
        || workflow.active !== "Export"
        || !workflow.projectInvariant) {
        throw new Error("G08 did not preserve the Slides, Look, Motion, Export workflow without changing Project truth.")
    }
    await freezeStoryPose(window)

    const metrics = {}
    const reachability = {}
    const previewReachability = {}
    for (const [viewportName, width, height] of [["wide", 1280, 900], ["minimum", 1080, 700]]) {
        await resize(window, width, height)
        for (const scale of [75, 100, 150, 200]) {
            await setScale(window, scale)
            await freezeStoryPose(window)
            const key = `${viewportName}-${scale}`
            metrics[key] = await readMetrics(window)
            captures[key] = await capture(window, outputDirectory, `gallery-studio-${key}`)
            reachability[key] = await verifyBottomReachability(window)
            previewReachability[key] = await scrollPreviewIntoView(window)
            captures[`preview-${key}`] = await capture(window, outputDirectory, `gallery-preview-${key}`)
            await resetStudioScroll(window)
            fs.writeFileSync(path.join(outputDirectory, "renderer-progress.json"), JSON.stringify({
                source: {
                    sha: process.env.GALLERY_SOURCE_SHA ?? null,
                    tree: process.env.GALLERY_SOURCE_TREE ?? null,
                },
                captures,
                catalogueMetrics,
                catalogueReachability,
                metrics,
                reachability,
                previewReachability,
            }, null, 2) + "\n")
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
        workflow,
        captures,
        catalogueMetrics,
        catalogueReachability,
        metrics,
        reachability,
        previewReachability,
        resetScale: Number(await window.webContents.executeJavaScript(`document.querySelector('[data-interface-scale]').dataset.interfaceScale`)),
    }
    fs.writeFileSync(path.join(outputDirectory, "renderer-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`)
    console.log(JSON.stringify({ receipt: path.join(outputDirectory, "renderer-receipt.json"), captures: receipt.captures }))
}

module.exports = { runG08InterfaceSmoke }
