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

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
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
        const optionalRect = (selector) => {
            const element = document.querySelector(selector)
            if (!element || getComputedStyle(element).display === 'none') return null
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
            header: {
                autosave: optionalRect('.autosave-status'),
                scale: rect('.interface-scale-control'),
            },
            scrollGutters: {
                library: getComputedStyle(document.querySelector('.library-scroll')).scrollbarGutter,
                studio: getComputedStyle(document.querySelector('.studio')).scrollbarGutter,
                inspector: getComputedStyle(document.querySelector('.inspector-scroll')).scrollbarGutter,
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
            icons: {
                titleAction: rect('.title-actions > .button.quiet svg'),
                library: rect('.icon-button svg'),
                addMedia: rect('.add-media svg'),
                transport: rect('.transport-play svg'),
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
            manifest: {
                format: manifest.format,
                product: manifest.product,
                schemaVersion: manifest.schemaVersion,
                interfaceScale: manifest.interfaceScale,
            },
        }
    })()`)
}

async function verifyCatalogueVocabulary(window) {
    return window.webContents.executeJavaScript(`(async () => {
        const input = document.querySelector('.style-search input')
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        const initial = input.value
        const current = Array.from(document.querySelectorAll('.style-card[aria-pressed="true"]')).map((card) => card.dataset.styleId)
        setValue.call(input, 'no-scene-can-match-this-query')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const result = {
            heading: document.querySelector('.style-gallery-header h1')?.textContent?.trim(),
            summary: document.querySelector('.style-gallery-header p')?.textContent?.trim(),
            search: document.querySelector('.style-search span')?.textContent?.trim(),
            empty: document.querySelector('.style-gallery-empty strong')?.textContent?.trim(),
            footer: document.querySelector('.style-gallery-footer span')?.textContent?.trim(),
            current,
        }
        setValue.call(input, initial)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return result
    })()`)
}

async function verifySceneCardPressFeedback(window) {
    const point = await window.webContents.executeJavaScript(`(() => {
        const card = document.querySelector('.style-card')
        if (!card) throw new Error('Scene card is missing.')
        card.style.transition = 'none'
        card.__g08Blocker = (event) => event.stopImmediatePropagation()
        card.addEventListener('click', card.__g08Blocker, { capture: true })
        const box = card.getBoundingClientRect()
        return { x: Math.round((box.left + box.right) / 2), y: Math.round((box.top + box.bottom) / 2) }
    })()`)
    window.webContents.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y })
    await delay(30)
    const hoverTransform = await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.style-card')).transform`)
    window.webContents.sendInputEvent({ type: "mouseDown", x: point.x, y: point.y, button: "left", clickCount: 1 })
    await delay(30)
    const pressed = await window.webContents.executeJavaScript(`(() => {
        const card = document.querySelector('.style-card')
        return { active: card.matches(':active'), transform: getComputedStyle(card).transform, boxShadow: getComputedStyle(card).boxShadow }
    })()`)
    window.webContents.sendInputEvent({ type: "mouseUp", x: 1, y: 1, button: "left", clickCount: 1 })
    window.webContents.sendInputEvent({ type: "mouseMove", x: 1, y: 1 })
    await window.webContents.executeJavaScript(`(() => {
        const card = document.querySelector('.style-card')
        card.style.removeProperty('transition')
        card.removeEventListener('click', card.__g08Blocker, { capture: true })
        delete card.__g08Blocker
    })()`)
    if (!pressed.active || pressed.transform === hoverTransform || pressed.transform === "none") {
        throw new Error("Scene card hover suppresses its physical press feedback.")
    }
    return { hoverTransform, ...pressed }
}

async function verifyTooltipBehavior(window) {
    const anchor = await window.webContents.executeJavaScript(`(() => {
        const element = document.querySelector('.transport .tooltip-anchor')
        if (!element) throw new Error('Transport tooltip anchor is missing.')
        const box = element.getBoundingClientRect()
        return { x: Math.round((box.left + box.right) / 2), y: Math.round((box.top + box.bottom) / 2) }
    })()`)
    window.webContents.sendInputEvent({ type: "mouseMove", x: 1, y: 1 })
    await delay(30)
    window.webContents.sendInputEvent({ type: "mouseMove", x: anchor.x, y: anchor.y })
    await delay(120)
    const premature = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.tooltip-bubble'))`)
    if (premature) throw new Error("The first pointer tooltip skipped its protective delay.")
    await waitFor(window, `document.querySelector('.tooltip-bubble')`, "first delayed tooltip", 1_000)
    const first = await window.webContents.executeJavaScript(`(() => {
        const element = document.querySelector('.tooltip-bubble')
        const box = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
            instant: element.dataset.instant,
            animationName: style.animationName,
            transitionDuration: style.transitionDuration,
            left: box.left,
            right: box.right,
            viewportWidth: innerWidth,
        }
    })()`)
    window.webContents.sendInputEvent({ type: "mouseMove", x: 1, y: 1 })
    await waitFor(window, `!document.querySelector('.tooltip-bubble')`, "pointer tooltip dismissal")
    window.webContents.sendInputEvent({ type: "mouseMove", x: anchor.x, y: anchor.y })
    await waitFor(window, `document.querySelector('.tooltip-bubble')?.dataset.instant === 'true'`, "grace-window tooltip", 250)
    const adjacent = await window.webContents.executeJavaScript(`(() => {
        const element = document.querySelector('.tooltip-bubble')
        return { instant: element.dataset.instant, transitionDuration: getComputedStyle(element).transitionDuration }
    })()`)
    window.webContents.sendInputEvent({ type: "mouseMove", x: 1, y: 1 })
    await waitFor(window, `!document.querySelector('.tooltip-bubble')`, "grace-window tooltip dismissal")
    const keyboard = await window.webContents.executeJavaScript(`(async () => {
        const button = document.querySelector('.transport .tooltip-anchor button')
        button.focus()
        await new Promise((resolve) => setTimeout(() => requestAnimationFrame(resolve), 0))
        const element = document.querySelector('.tooltip-bubble')
        if (!element) throw new Error('Keyboard tooltip did not appear immediately.')
        const style = getComputedStyle(element)
        const result = { instant: element.dataset.instant, animationName: style.animationName, transitionDuration: style.transitionDuration }
        button.blur()
        return result
    })()`)
    if (first.instant !== "false" || first.animationName !== "none" || first.left < 15.5 || first.right > first.viewportWidth - 15.5) {
        throw new Error("The first tooltip did not use delayed, clamped, transition-only geometry.")
    }
    if (adjacent.instant !== "true" || adjacent.transitionDuration !== "0s") throw new Error("A tooltip inside the shared grace window was not instant.")
    if (keyboard.instant !== "true" || keyboard.animationName !== "none" || keyboard.transitionDuration !== "0s") throw new Error("Keyboard focus animated its tooltip.")
    return { first, adjacent, keyboard }
}

async function verifyLinearIndeterminateProgress(window) {
    const result = await window.webContents.executeJavaScript(`(() => {
        const fixture = document.createElement('div')
        fixture.innerHTML = '<div class="export-progress is-preparing"><div><span></span></div></div><div class="launch-progress"><span></span></div><span class="processing-bar"><i></i></span>'
        document.body.append(fixture)
        const exportStyle = getComputedStyle(fixture.querySelector('.export-progress span'))
        const launchStyle = getComputedStyle(fixture.querySelector('.launch-progress span'))
        const processingStyle = getComputedStyle(fixture.querySelector('.processing-bar i'))
        const value = {
            exportName: exportStyle.animationName,
            exportTiming: exportStyle.animationTimingFunction,
            launchName: launchStyle.animationName,
            launchTiming: launchStyle.animationTimingFunction,
            processingName: processingStyle.animationName,
            processingTiming: processingStyle.animationTimingFunction,
        }
        fixture.remove()
        return value
    })()`)
    if (result.exportName === "none" || result.exportTiming !== "linear"
        || result.launchName === "none" || result.launchTiming !== "linear"
        || result.processingName === "none" || result.processingTiming !== "linear") {
        throw new Error("Indeterminate progress motion is not linear.")
    }
    return result
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
            header: {
                icon: rect('.style-gallery-header > .galileo-app-icon'),
                copy: rect('.style-gallery-header > :nth-child(2)'),
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

function targetFloor(interfaceScale) {
    return interfaceScale < 100 ? 44 : 44 * interfaceScale / 100
}

function assertTargetFloor(label, targets, interfaceScale) {
    const floor = targetFloor(interfaceScale)
    const undersized = Object.entries(targets).find(([, target]) => target.width + 0.2 < floor || target.height + 0.2 < floor)
    if (undersized) throw new Error(`${label} has ${undersized[0]} below its ${floor}px physical target floor.`)
}

function rectSeparation(first, second) {
    const horizontal = Math.max(first.left - second.right, second.left - first.right, 0)
    const vertical = Math.max(first.top - second.bottom, second.top - first.bottom, 0)
    return Math.max(horizontal, vertical)
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
        if (value.header.autosave && value.header.autosave.right > value.header.scale.left - 1) {
            throw new Error(`${key} lets autosave overlap Interface Scale.`)
        }
        assertTargetFloor(key, value.targets, value.interfaceScale)
        if (Object.values(value.scrollGutters).some((gutter) => !gutter.includes("stable"))) throw new Error(`${key} can jump when a rail scrollbar appears.`)
        const ratio = value.interfaceScale / 100
        const badIcon = Object.entries(value.icons).find(([, icon]) => {
            const logicalWidth = icon.width / ratio
            const logicalHeight = icon.height / ratio
            return logicalWidth < 21.5 || logicalWidth > 24.5 || logicalHeight < 21.5 || logicalHeight > 24.5 || Math.abs(logicalWidth - logicalHeight) > 0.2
        })
        if (badIcon) throw new Error(`${key} has an incoherent ${badIcon[0]} icon size.`)
        if (value.focus.outlineStyle === "none" || parseFloat(value.focus.outlineWidth) < 2) throw new Error(`${key} lacks visible keyboard focus.`)
        if (!value.projectDocument) throw new Error(`${key} has no durable Project state to compare.`)
    }
}

async function runG08InterfaceSmoke(window, outputDirectory) {
    fs.mkdirSync(outputDirectory, { recursive: true })
    await resize(window, 1280, 900)
    await waitFor(window, `document.querySelector('.style-gallery-shell')`, "scene catalogue")
    await setScale(window, 100)
    const catalogueVocabulary = await verifyCatalogueVocabulary(window)
    if (catalogueVocabulary.heading !== "Choose a Scene."
        || !catalogueVocabulary.summary?.includes("curated Scenes")
        || catalogueVocabulary.search !== "Search Scenes"
        || catalogueVocabulary.empty !== "No Scenes found."
        || !catalogueVocabulary.footer?.endsWith("Scenes")
        || catalogueVocabulary.current.length !== 1) {
        throw new Error("The catalogue does not use the Product Scene vocabulary consistently.")
    }
    const sceneCardPress = await verifySceneCardPressFeedback(window)
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
        if (value.shell.scrollWidth > value.shell.clientWidth + 1) throw new Error(`${key} has horizontally clipped catalogue content.`)
        assertTargetFloor(key, value.targets, scale)
        const headerGap = rectSeparation(value.header.icon, value.header.copy)
        if (headerGap + 0.5 < 18 * scale / 100) throw new Error(`${key} lets the Gallery mark crowd its headline.`)
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
    const formatTruth = await window.webContents.executeJavaScript(`(() => {
        const luminance = (value) => {
            const channels = value.match(/[\\d.]+/g).slice(0, 3).map((channel) => Number(channel) / 255)
            const linear = channels.map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
            return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2]
        }
        const contrast = (foreground, background) => {
            const [bright, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
            return (bright + .05) / (dark + .05)
        }
        const paper = 'rgb(251, 250, 246)'
        return Array.from(document.querySelectorAll('.format-cards button')).map((button) => {
            const titleColor = getComputedStyle(button.querySelector('span')).color
            const detailColor = getComputedStyle(button.querySelector('small')).color
            return {
                text: button.textContent.replace(/\\s+/g, ' ').trim(),
                disabled: button.disabled,
                opacity: getComputedStyle(button).opacity,
                cursor: getComputedStyle(button).cursor,
                titleColor,
                detailColor,
                titleContrast: contrast(titleColor, paper),
                detailContrast: contrast(detailColor, paper),
            }
        })
    })()`)
    if (!formatTruth[0]?.disabled || !formatTruth[0]?.text.includes("Quiet Carousel v1 or Vitrine v2 only") || !formatTruth[1]?.disabled || !formatTruth[1]?.text.includes("Quiet Carousel only")) {
        throw new Error("G08 did not preserve the honest Scene-specific export capability boundary.")
    }
    if (formatTruth.some((card) => card.opacity !== "1" || card.cursor !== "not-allowed" || card.titleContrast < 4.5 || card.detailContrast < 4.5)) {
        throw new Error("Disabled export cards hide or wash out their availability explanation.")
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
    const sceneVocabulary = await window.webContents.executeJavaScript(`(async () => {
        const tabs = Array.from(document.querySelectorAll('.inspector-top .segment button'))
        tabs.find((button) => button.textContent.trim() === 'Look').click()
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const value = {
            eyebrow: document.querySelector('.style-current-panel .eyebrow')?.textContent?.trim(),
            browse: document.querySelector('.style-current-panel .button')?.textContent?.replace(/\\s+/g, ' ').trim(),
        }
        tabs.find((button) => button.textContent.trim() === 'Export').click()
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return value
    })()`)
    if (sceneVocabulary.eyebrow !== "Scene" || !sceneVocabulary.browse?.endsWith("Scenes")) throw new Error("Studio Scene naming drifted.")
    const tooltipBehavior = await verifyTooltipBehavior(window)
    const progressMotion = await verifyLinearIndeterminateProgress(window)
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
        catalogueVocabulary,
        sceneCardPress,
        sceneVocabulary,
        formatTruth,
        tooltipBehavior,
        progressMotion,
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
