const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const PRESENTATION_KEY = "galileo-gallery:local-presentation:v1"
const PROJECT_KEY = "galileo-gallery-project-v1"
const THEME_KEY = "galileo-gallery:ui-theme:v1"

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex")
}

async function withTimeout(promise, label, timeoutMs = 12_000) {
    let timer
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}.`)), timeoutMs)
            }),
        ])
    } finally {
        clearTimeout(timer)
    }
}

async function waitForWindowVisible(window) {
    if (window.isVisible()) return
    await withTimeout(new Promise((resolve) => window.once('show', resolve)), 'main window visibility')
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
    await withTimeout(window.webContents.executeJavaScript(`(async () => {
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
        const nextPaintOpportunity = () => new Promise((resolve) => {
            let done = false
            const timer = setTimeout(() => {
                if (!done) {
                    done = true
                    resolve()
                }
            }, 100)
            requestAnimationFrame(() => {
                if (!done) {
                    done = true
                    clearTimeout(timer)
                    resolve()
                }
            })
        })
        await nextPaintOpportunity()
        await nextPaintOpportunity()
        await nextPaintOpportunity()
        return true
    })()`), 'renderer settle', 15_000)
}

async function resize(window, width, height) {
    window.setSize(width, height)
    await new Promise((resolve) => setTimeout(resolve, 120))
    await settleRenderer(window)
}

async function capture(window, outputDirectory, name) {
    await window.webContents.executeJavaScript(`document.activeElement instanceof HTMLElement && document.activeElement.blur()`)
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
        const brand = rect('.brand-lockup')
        const actions = rect('.title-actions')
        const primary = rect('.title-actions .button.primary')
        const autosaveElement = document.querySelector('.autosave-status')
        const autosaveStyle = autosaveElement ? getComputedStyle(autosaveElement) : null
        const autosaveRect = autosaveElement?.getBoundingClientRect()
        const autosaveVisible = Boolean(autosaveElement && autosaveStyle.display !== 'none' && autosaveStyle.visibility !== 'hidden' && autosaveRect.width > 0 && autosaveRect.height > 0)
        const autosave = autosaveRect ? { left: autosaveRect.left, top: autosaveRect.top, right: autosaveRect.right, bottom: autosaveRect.bottom, width: autosaveRect.width, height: autosaveRect.height } : null
        const overlaps = (a, b) => Boolean(a && b && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5)
        const selectElement = document.querySelector('.inspector select')
        if (!selectElement) throw new Error('Inspector select control is missing.')
        const selectStyle = getComputedStyle(selectElement)
        const inspectorPanelStyle = getComputedStyle(document.querySelector('.inspector > .inspector-scroll'))
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
        return {
            viewport: { width: innerWidth, height: innerHeight },
            interfaceScale: Number(scaleRoot.dataset.interfaceScale),
            scaleLabel: document.querySelector('.interface-scale-value').textContent.trim(),
            surfaceTransform: getComputedStyle(document.querySelector('.interface-scale-surface')).transform,
            shell: {
                display: getComputedStyle(shell).display,
                clientWidth: shell.clientWidth,
                scrollWidth: shell.scrollWidth,
                clientHeight: shell.clientHeight,
                scrollHeight: shell.scrollHeight,
            },
            headerGeometry: {
                brand,
                actions,
                primary,
                autosave,
                autosaveVisible,
                autosaveBrandOverlap: autosaveVisible && overlaps(autosave, brand),
                autosaveActionsOverlap: autosaveVisible && overlaps(autosave, actions),
            },
            controlPolish: {
                selectAppearance: selectStyle.appearance || selectStyle.webkitAppearance,
                selectBackgroundImage: selectStyle.backgroundImage,
                selectBackgroundPosition: selectStyle.backgroundPosition,
                selectBackgroundSize: selectStyle.backgroundSize,
                selectPaddingRight: parseFloat(selectStyle.paddingRight),
                inspectorAnimationName: inspectorPanelStyle.animationName,
                inspectorAnimationDuration: parseFloat(inspectorPanelStyle.animationDuration) || 0,
                reducedMotion,
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

async function verifyDisclosureMotion(window) {
    const result = await window.webContents.executeJavaScript(`(async () => {
        const projectBefore = localStorage.getItem('${PROJECT_KEY}')
        const trigger = document.querySelector('.project-trigger')
        const menu = document.querySelector('.project-menu-panel')
        const caret = document.querySelector('.menu-caret')
        if (!trigger || !menu || !caret) throw new Error('Project disclosure controls are missing.')
        const readRect = (element) => {
            const box = element.getBoundingClientRect()
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
        }
        const stableElements = ['.titlebar', '.library', '.studio', '.inspector'].map((selector) => document.querySelector(selector))
        const before = stableElements.map(readRect)
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
        trigger.click()
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const configuredStyle = getComputedStyle(menu)
        const configured = {
            duration: configuredStyle.transitionDuration,
            property: configuredStyle.transitionProperty,
        }
        await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 20 : 260))
        const openStyle = getComputedStyle(menu)
        const openRect = readRect(menu)
        const open = {
            expanded: trigger.getAttribute('aria-expanded'),
            hidden: menu.getAttribute('aria-hidden'),
            opacity: Number(openStyle.opacity),
            visibility: openStyle.visibility,
            transform: openStyle.transform,
            caretTransform: getComputedStyle(caret).transform,
            rect: openRect,
            insideViewport: openRect.left >= -1 && openRect.right <= innerWidth + 1 && openRect.top >= -1 && openRect.bottom <= innerHeight + 1,
        }
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 20 : 360))
        const closedStyle = getComputedStyle(menu)
        const after = stableElements.map(readRect)
        const maximumLayoutShift = Math.max(...before.flatMap((box, index) => {
            const next = after[index]
            return ['left', 'top', 'right', 'bottom', 'width', 'height'].map((key) => Math.abs(box[key] - next[key]))
        }))
        return {
            configured,
            reducedMotion,
            open,
            closed: {
                expanded: trigger.getAttribute('aria-expanded'),
                hidden: menu.getAttribute('aria-hidden'),
                opacity: Number(closedStyle.opacity),
                visibility: closedStyle.visibility,
                pointerEvents: closedStyle.pointerEvents,
                transform: closedStyle.transform,
                focusRestored: document.activeElement === trigger,
            },
            maximumLayoutShift,
            projectInvariant: projectBefore === localStorage.getItem('${PROJECT_KEY}'),
        }
    })()`)
    if (result.open.expanded !== 'true' || result.open.hidden !== 'false' || result.open.opacity < 0.99 || result.open.visibility !== 'visible' || !result.open.insideViewport) {
        throw new Error('Project menu did not open visibly inside the viewport.')
    }
    if (!result.reducedMotion && (!result.configured.duration || result.configured.duration.split(',').every((value) => parseFloat(value) < 0.15))) {
        throw new Error('Project menu has no premium disclosure transition.')
    }
    if (!result.reducedMotion && result.open.caretTransform === 'none') throw new Error('Project menu caret did not rotate.')
    if (result.closed.expanded !== 'false' || result.closed.hidden !== 'true' || result.closed.opacity > 0.01 || result.closed.pointerEvents !== 'none' || !result.closed.focusRestored) {
        throw new Error('Project menu did not close cleanly and restore trigger focus: ' + JSON.stringify(result.closed))
    }
    if (result.maximumLayoutShift > 0.75) throw new Error('Opening or closing Project menu shifted the application layout.')
    if (!result.projectInvariant) throw new Error('Project menu disclosure changed Project state.')
    await settleRenderer(window)
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
        const cardFit = Array.from(document.querySelectorAll('.style-card')).map((card) => {
            const cardBox = card.getBoundingClientRect()
            const miniature = card.querySelector(':scope > .style-miniature')?.getBoundingClientRect()
            const heading = card.querySelector(':scope > span')?.getBoundingClientRect()
            const copy = card.querySelector(':scope > p')?.getBoundingClientRect()
            const inside = (box) => Boolean(box
                && box.left >= cardBox.left - 1
                && box.right <= cardBox.right + 1
                && box.top >= cardBox.top - 1
                && box.bottom <= cardBox.bottom + 1)
            return {
                id: card.dataset.styleId,
                horizontalOverflow: Math.max(0, card.scrollWidth - card.clientWidth),
                miniatureInside: inside(miniature),
                headingInside: inside(heading),
                copyInside: inside(copy),
            }
        }).filter((card) => card.horizontalOverflow > 1 || !card.miniatureInside || !card.headingInside || !card.copyInside)
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
            cardFit,
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

async function setTheme(window, target) {
    const result = await window.webContents.executeJavaScript(`(async () => {
        const target = ${JSON.stringify(target)}
        const root = document.documentElement
        const toggle = document.querySelector('[data-ui-theme-toggle]')
        if (!toggle) throw new Error('Theme toggle is missing.')
        const selectors = document.querySelector('.app-shell')
            ? ['.titlebar', '.library', '.studio', '.inspector']
            : ['.style-gallery-header', '.style-gallery-tools', '.style-gallery-grid']
        const rect = (element) => {
            const box = element.getBoundingClientRect()
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
        }
        const stable = selectors.map((selector) => document.querySelector(selector)).filter(Boolean)
        const before = stable.map(rect)
        const projectBefore = localStorage.getItem('${PROJECT_KEY}')
        const storedBefore = localStorage.getItem('${THEME_KEY}')
        const sourceBefore = root.dataset.uiThemeSource
        const changed = root.dataset.uiTheme !== target || storedBefore !== target || sourceBefore !== 'stored'
        const waitForApplied = async (expected) => {
            const deadline = performance.now() + 1500
            while (root.dataset.uiTheme !== expected && performance.now() < deadline) {
                await new Promise((resolve) => requestAnimationFrame(resolve))
            }
            if (root.dataset.uiTheme !== expected) throw new Error('Theme toggle did not reach ' + expected)
        }
        toggle.focus({ preventScroll: true })
        if (root.dataset.uiTheme !== target) {
            toggle.click()
            await waitForApplied(target)
        } else if (storedBefore !== target || sourceBefore !== 'stored') {
            const opposite = target === 'dark' ? 'light' : 'dark'
            toggle.click()
            await waitForApplied(opposite)
            toggle.click()
            await waitForApplied(target)
        }
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
        await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 20 : 320))
        const after = stable.map(rect)
        const maximumLayoutShift = before.length === after.length && before.length
            ? Math.max(...before.flatMap((box, index) => ['left', 'top', 'right', 'bottom', 'width', 'height'].map((key) => Math.abs(box[key] - after[index][key]))))
            : Number.POSITIVE_INFINITY
        const computed = getComputedStyle(root)
        const meta = document.querySelector('meta[name="theme-color"]')?.content ?? ''
        return {
            requested: target,
            changed,
            applied: root.dataset.uiTheme,
            source: root.dataset.uiThemeSource,
            ready: root.dataset.uiThemeReady,
            stored: localStorage.getItem('${THEME_KEY}'),
            colorScheme: computed.colorScheme,
            meta,
            pressed: toggle.getAttribute('aria-pressed'),
            current: toggle.dataset.uiThemeCurrent,
            focusRetained: !changed || document.activeElement === toggle,
            maximumLayoutShift,
            projectInvariant: projectBefore === localStorage.getItem('${PROJECT_KEY}'),
        }
    })()`)
    if (result.applied !== target || result.stored !== target || result.source !== 'stored' || result.ready !== 'true') {
        throw new Error('Theme did not apply and persist: ' + JSON.stringify(result))
    }
    if (result.colorScheme !== target || result.current !== target || result.pressed !== String(target === 'dark')) {
        throw new Error('Theme control did not expose the applied mode: ' + JSON.stringify(result))
    }
    if (result.meta.toLowerCase() !== (target === 'dark' ? '#111210' : '#f3f0e9')) {
        throw new Error('Theme colour metadata is stale: ' + JSON.stringify(result))
    }
    if (!result.focusRetained || result.maximumLayoutShift > 0.75 || !result.projectInvariant) {
        throw new Error('Theme switch moved layout, lost focus, or changed Project truth: ' + JSON.stringify(result))
    }
    await settleRenderer(window)
    return result
}

async function verifyThemePersistence(window, target) {
    await setTheme(window, target)
    const result = await window.webContents.executeJavaScript(`(() => ({
        applied: document.documentElement.dataset.uiTheme,
        source: document.documentElement.dataset.uiThemeSource,
        stored: localStorage.getItem('${THEME_KEY}'),
        pressed: document.querySelector('[data-ui-theme-toggle]')?.getAttribute('aria-pressed'),
        project: localStorage.getItem('${PROJECT_KEY}'),
    }))()`)
    if (result.applied !== target || result.source !== 'stored' || result.stored !== target || result.pressed !== String(target === 'dark')) {
        throw new Error('Theme did not survive reload: ' + JSON.stringify(result))
    }
    return result
}

async function verifyThemeStorageSync(window) {
    const result = await window.webContents.executeJavaScript(`(async () => {
        const projectBefore = localStorage.getItem('${PROJECT_KEY}')
        const applyExternal = async (theme) => {
            localStorage.setItem('${THEME_KEY}', theme)
            window.dispatchEvent(new StorageEvent('storage', { key: '${THEME_KEY}', newValue: theme, storageArea: localStorage }))
            await new Promise((resolve) => setTimeout(resolve, 320))
            return {
                applied: document.documentElement.dataset.uiTheme,
                source: document.documentElement.dataset.uiThemeSource,
                pressed: document.querySelector('[data-ui-theme-toggle]')?.getAttribute('aria-pressed'),
            }
        }
        const dark = await applyExternal('dark')
        const light = await applyExternal('light')
        return { dark, light, projectInvariant: projectBefore === localStorage.getItem('${PROJECT_KEY}') }
    })()`)
    if (result.dark.applied !== 'dark' || result.dark.source !== 'stored' || result.dark.pressed !== 'true'
        || result.light.applied !== 'light' || result.light.source !== 'stored' || result.light.pressed !== 'false'
        || !result.projectInvariant) {
        throw new Error('StorageEvent theme convergence failed: ' + JSON.stringify(result))
    }
    await settleRenderer(window)
    return result
}

async function readAppearanceMetrics(window, surface) {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    return window.webContents.executeJavaScript(`(() => {
        const surface = ${JSON.stringify(surface)}
        const root = document.documentElement
        const parse = (value) => {
            const text = String(value).trim()
            const numbers = text.match(/[\\d.]+/g)?.map(Number) ?? []
            if (numbers.length < 3) return [0, 0, 0, 0]
            const channelScale = text.startsWith('color(srgb ') ? 255 : 1
            return [numbers[0] * channelScale, numbers[1] * channelScale, numbers[2] * channelScale, numbers.length > 3 ? numbers[3] : 1]
        }
        const over = (foreground, background) => {
            const alpha = foreground[3] + background[3] * (1 - foreground[3])
            if (alpha <= 0) return [0, 0, 0, 0]
            return [
                (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
                (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
                (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
                alpha,
            ]
        }
        const backgroundFor = (element) => {
            let result = [0, 0, 0, 0]
            let current = element
            while (current) {
                result = over(result, parse(getComputedStyle(current).backgroundColor))
                if (result[3] >= .999) break
                current = current.parentElement
            }
            const fallback = root.dataset.uiTheme === 'dark' ? [17, 18, 16, 1] : [243, 240, 233, 1]
            return over(result, fallback)
        }
        const luminance = (color) => {
            const rgb = color.slice(0, 3).map((value) => {
                const channel = value / 255
                return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
            })
            return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]
        }
        const contrast = (foreground, background) => {
            const first = luminance(foreground)
            const second = luminance(background)
            return (Math.max(first, second) + .05) / (Math.min(first, second) + .05)
        }
        const sample = (name, selector) => {
            const element = document.querySelector(selector)
            if (!element) throw new Error('Missing contrast sample: ' + selector)
            const background = backgroundFor(element)
            const foreground = over(parse(getComputedStyle(element).color), background)
            return { name, selector, ratio: contrast(foreground, background), color: getComputedStyle(element).color, background: background.join(',') }
        }
        const samples = surface === 'catalogue'
            ? [
                sample('catalogue heading', '.style-gallery-header h1'),
                sample('catalogue introduction', '.style-gallery-header p'),
                sample('catalogue card title', '.style-card > span > strong'),
                sample('catalogue selected card metadata', '.style-card.is-current > span > small'),
                sample('catalogue selected card description', '.style-card.is-current > p'),
                sample('catalogue selected card profile', '.style-card.is-current > p em'),
                sample('catalogue ordinary card metadata', '.style-card:not(.is-current) > span > small'),
                sample('catalogue ordinary card description', '.style-card:not(.is-current) > p'),
                sample('catalogue ordinary card profile', '.style-card:not(.is-current) > p em'),
                sample('catalogue search', '.style-search input'),
                sample('catalogue active filter', '.style-category-pills button.is-active'),
                sample('catalogue inactive filter', '.style-category-pills button:not(.is-active)'),
                sample('catalogue footer', '.style-gallery-footer'),
                sample('catalogue theme control', '[data-ui-theme-toggle]'),
            ]
            : [
                sample('studio brand', '.brand-lockup strong'),
                sample('studio subtitle', '.brand-lockup span'),
                sample('studio autosave status', '.autosave-status'),
                sample('studio panel heading', '.panel-heading h2'),
                sample('studio eyebrow', '.eyebrow'),
                sample('studio quiet button', '.title-actions .button.quiet'),
                sample('studio primary button', '.title-actions .button.primary'),
                sample('studio active workflow tab', '.inspector-top .segment button.is-active'),
                sample('studio inactive workflow tab', '.inspector-top .segment button:not(.is-active)'),
                sample('studio select', '.inspector select'),
                sample('studio export introduction', '.export-intro p'),
                sample('studio export summary label', '.export-summary span'),
                sample('studio export summary value', '.export-summary strong'),
                sample('studio theme control', '[data-ui-theme-toggle]'),
            ]
        const toggleElement = document.querySelector('[data-ui-theme-toggle]')
        toggleElement.focus({ preventScroll: true })
        const toggle = toggleElement.getBoundingClientRect()
        const toggleStyle = getComputedStyle(toggleElement)
        const focusBackground = backgroundFor(toggleElement.parentElement ?? toggleElement)
        const focusForeground = over(parse(toggleStyle.outlineColor), focusBackground)
        const focusWidth = Number.parseFloat(toggleStyle.outlineWidth) || 0
        const focusIndicator = {
            focusVisible: toggleElement.matches(':focus-visible'),
            style: toggleStyle.outlineStyle,
            width: focusWidth,
            physicalWidth: focusWidth * devicePixelRatio,
            ratio: contrast(focusForeground, focusBackground),
            color: toggleStyle.outlineColor,
            background: focusBackground.join(','),
        }
        const themeColor = document.querySelector('meta[name="theme-color"]')?.content ?? ''
        return {
            theme: root.dataset.uiTheme,
            source: root.dataset.uiThemeSource,
            ready: root.dataset.uiThemeReady,
            stored: localStorage.getItem('${THEME_KEY}'),
            colorScheme: getComputedStyle(root).colorScheme,
            themeColor,
            togglePressed: toggleElement.getAttribute('aria-pressed'),
            toggleLabel: toggleElement.getAttribute('aria-label'),
            toggle: { left: toggle.left, top: toggle.top, right: toggle.right, bottom: toggle.bottom, width: toggle.width, height: toggle.height },
            focusIndicator,
            rootOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
            samples,
        }
    })()`)
}

function cropPresentedFrame(frame, viewport, box, inset = 1) {
    const size = frame.getSize()
    const scaleX = size.width / viewport.width
    const scaleY = size.height / viewport.height
    const left = Math.max(0, Math.floor((box.left + inset) * scaleX))
    const top = Math.max(0, Math.floor((box.top + inset) * scaleY))
    const right = Math.min(size.width, Math.ceil((box.right - inset) * scaleX))
    const bottom = Math.min(size.height, Math.ceil((box.bottom - inset) * scaleY))
    if (right <= left || bottom <= top) throw new Error(`Invalid presented-frame crop: ${JSON.stringify({ size, viewport, box, inset })}`)
    return frame.crop({ x: left, y: top, width: right - left, height: bottom - top })
}

function pixelDeltaSummary(first, second) {
    if (first.length !== second.length || first.length % 4 !== 0) throw new Error('Presented-frame pixel buffers do not align.')
    let changed = 0
    let maxChannelDelta = 0
    for (let index = 0; index < first.length; index += 4) {
        let pixelChanged = false
        for (let channel = 0; channel < 4; channel += 1) {
            const delta = Math.abs(first[index + channel] - second[index + channel])
            maxChannelDelta = Math.max(maxChannelDelta, delta)
            if (delta) pixelChanged = true
        }
        if (pixelChanged) changed += 1
    }
    return { changedPixels: changed, pixelCount: first.length / 4, changedRatio: changed / (first.length / 4), maxChannelDelta }
}

function temporalStabilitySummary(previous, sample) {
    const delta = pixelDeltaSummary(previous.bitmap, sample.bitmap)
    const allowedChangedPixels = Math.max(32, Math.ceil(delta.pixelCount * .0001))
    return {
        previousBitmapSha256: previous.sha256,
        rawHashEqual: previous.sha256 === sample.sha256,
        changedPixels: delta.changedPixels,
        changedRatio: delta.changedRatio,
        maxChannelDelta: delta.maxChannelDelta,
        allowedChangedPixels,
        withinNoiseEnvelope: delta.maxChannelDelta <= 1 && delta.changedPixels <= allowedChangedPixels,
    }
}

function changedPixelCount(first, second) {
    return pixelDeltaSummary(first, second).changedPixels
}

let presentedFrameMarkerSerial = 0

function presentedFrameMarkerMatches(frame, viewport, token) {
    const size = frame.getSize()
    const scaleX = size.width / viewport.width
    const scaleY = size.height / viewport.height
    const swatchMatches = (cssLeft, cssRight, gray) => {
        const left = Math.max(0, Math.floor(cssLeft * scaleX))
        const top = Math.max(0, Math.floor(8 * scaleY))
        const right = Math.min(size.width, Math.ceil(cssRight * scaleX))
        const bottom = Math.min(size.height, Math.ceil(12 * scaleY))
        if (right <= left || bottom <= top) throw new Error('Presented-frame marker crop is invalid.')
        const bitmap = frame.crop({ x: left, y: top, width: right - left, height: bottom - top }).toBitmap()
        for (let index = 0; index < bitmap.length; index += 4) {
            const pixel = [bitmap[index], bitmap[index + 1], bitmap[index + 2]]
            if (pixel.some((value) => Math.abs(value - gray) > 2) || bitmap[index + 3] < 250) return false
        }
        return bitmap.length >= 4
    }
    return swatchMatches(6, 10, token.firstGray) && swatchMatches(14, 18, token.secondGray)
}

async function captureStablePresentedRegion(window, selector, label, inset = 0, options = {}) {
    const webContents = window.webContents
    const state = await webContents.executeJavaScript(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)})
        if (!element) throw new Error('Missing presented-frame region: ' + ${JSON.stringify(selector)})
        const box = element.getBoundingClientRect()
        return {
            viewport: { width: innerWidth, height: innerHeight },
            box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height },
            fullyVisible: box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
        }
    })()`)
    if (!state.fullyVisible || state.box.width < 40 || state.box.height < 40) {
        throw new Error(`Presented-frame region is not fully capturable: ${label}; ${JSON.stringify(state)}.`)
    }

    presentedFrameMarkerSerial += 1
    if (presentedFrameMarkerSerial > 95) throw new Error('Presented-frame marker budget was exhausted.')
    const markerToken = {
        firstGray: 24 + (presentedFrameMarkerSerial % 16) * 12,
        secondGray: 24 + Math.floor(presentedFrameMarkerSerial / 16) * 24,
    }
    const priorThrottling = webContents.getBackgroundThrottling()
    const maximumFrames = options.referenceBitmap ? 30 : 6
    let subscribed = false
    let active = true
    let matchingFrames = 0
    let previous = null
    let timer = null
    let pulseTimer = null
    let pulseSerial = 0
    let settle
    let fail
    const resultPromise = new Promise((resolve, reject) => {
        settle = resolve
        fail = reject
    })
    const stop = (callback, value) => {
        if (!active) return
        active = false
        clearTimeout(timer)
        clearInterval(pulseTimer)
        callback(value)
    }
    const onFrame = (image) => {
        if (!active || image.isEmpty()) return
        try {
            if (!presentedFrameMarkerMatches(image, state.viewport, markerToken)) return
            matchingFrames += 1
            const crop = cropPresentedFrame(image, state.viewport, state.box, inset)
            const bitmap = crop.toBitmap()
            const size = crop.getSize()
            const sample = { bitmap, sha256: sha256(bitmap), size }
            if (options.referenceBitmap) {
                const delta = pixelDeltaSummary(options.referenceBitmap, bitmap)
                if (delta.changedPixels < (options.minimumChangedPixels ?? 0)
                    || delta.changedPixels > (options.maximumChangedPixels ?? Number.POSITIVE_INFINITY)
                    || delta.maxChannelDelta > (options.maximumChannelDelta ?? Number.POSITIVE_INFINITY)) {
                    previous = null
                    if (matchingFrames < maximumFrames) return
                    stop(fail, new Error(`Presented-frame pixels never reached the required comparison state: ${label}; ${JSON.stringify(delta)}.`))
                    return
                }
            }
            const sameSize = previous
                && previous.size.width === sample.size.width
                && previous.size.height === sample.size.height
            const stability = sameSize ? temporalStabilitySummary(previous, sample) : null
            if (!stability?.withinNoiseEnvelope) {
                previous = sample
                if (matchingFrames < maximumFrames) return
                stop(fail, new Error(`Presented-frame pixels did not converge: ${label}; ${JSON.stringify(stability ?? { reason: 'bitmap dimensions changed' })}.`))
                return
            }
            stop(settle, { ...sample, stableFrames: 2, correlatedFrames: matchingFrames, stability })
        } catch (error) {
            stop(fail, error)
        }
    }
    try {
        if (!window.isVisible()) window.show()
        webContents.setBackgroundThrottling(false)
        await webContents.executeJavaScript(`(() => {
            const pulse = document.createElement('i')
            pulse.id = 'g08-frame-pulse'
            pulse.setAttribute('aria-hidden', 'true')
            pulse.style.cssText = 'position:fixed;left:4px;top:4px;width:16px;height:12px;z-index:2147483647;pointer-events:none'
            document.getElementById('g08-frame-pulse')?.remove()
            document.body.append(pulse)
        })()`)
        webContents.beginFrameSubscription(false, onFrame)
        subscribed = true
        const pulse = () => {
            if (!active) return
            const width = ++pulseSerial % 2 === 0 ? 16 : 17
            void webContents.executeJavaScript(`(() => {
                const pulse = document.getElementById('g08-frame-pulse')
                if (!pulse) throw new Error('Presented-frame pulse is missing.')
                pulse.style.backgroundImage = 'linear-gradient(to right, rgb(${markerToken.firstGray} ${markerToken.firstGray} ${markerToken.firstGray}) 0 50%, rgb(${markerToken.secondGray} ${markerToken.secondGray} ${markerToken.secondGray}) 50% 100%)'
                pulse.style.width = '${width}px'
                return pulse.offsetWidth
            })()`).catch((error) => stop(fail, error))
        }
        timer = setTimeout(() => stop(fail, new Error(`Timed out waiting for presented frame: ${label}.`)), 5_000)
        pulseTimer = setInterval(pulse, 100)
        pulse()
        const actual = await resultPromise
        const result = {
            method: 'frame-subscription',
            bitmapEncoding: 'electron-native-bitmap',
            bitmapBytes: actual.bitmap.length,
            bitmapSha256: actual.sha256,
            pixelWidth: actual.size.width,
            pixelHeight: actual.size.height,
            stableFrames: actual.stableFrames,
            correlatedFrames: actual.correlatedFrames,
            stability: actual.stability,
            bounds: state.box,
        }
        Object.defineProperty(result, 'bitmap', { value: actual.bitmap, enumerable: false })
        return result
    } finally {
        active = false
        clearTimeout(timer)
        clearInterval(pulseTimer)
        if (subscribed) webContents.endFrameSubscription()
        webContents.setBackgroundThrottling(priorThrottling)
        await webContents.executeJavaScript(`document.getElementById('g08-frame-pulse')?.remove()`)
    }
}

async function captureCatalogueSceneProof(window, themeSwitches) {
    const ids = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.style-card[data-style-id]')).map((card) => card.dataset.styleId)`)
    if (ids.length !== 29 || new Set(ids).size !== 29) throw new Error(`G08 expected 29 Scene miniatures, found ${ids.length}.`)
    const webContents = window.webContents
    const priorThrottling = webContents.getBackgroundThrottling()
    let pendingFrame = null
    let pulseSerial = 0
    let subscribed = false
    const light = {}
    const dark = {}
    const comparisons = {}
    const onFrame = (image) => {
        if (!pendingFrame || image.isEmpty()) return
        const current = pendingFrame
        try {
            if (!presentedFrameMarkerMatches(image, current.state.viewport, current.markerToken)) return
            current.matchingFrames += 1
            // Exclude the miniature's 1px border and 2px rounded-clip antialiasing; those pixels belong to UI chrome, not the Scene.
            const crop = cropPresentedFrame(image, current.state.viewport, current.state.box, 2)
            const bitmap = crop.toBitmap()
            const size = crop.getSize()
            const sample = { bitmap, sha256: sha256(bitmap), size }
            if (current.referenceBitmap) {
                const delta = pixelDeltaSummary(current.referenceBitmap, bitmap)
                const didNotChangeEnough = delta.changedPixels < current.minimumChangedPixels
                const changedTooMuch = delta.changedPixels > current.maximumChangedPixels || delta.maxChannelDelta > current.maximumChannelDelta
                if (didNotChangeEnough || changedTooMuch) {
                    current.previous = null
                    if (current.matchingFrames < current.maximumFrames) return
                    current.fail(new Error(`Presented-frame pixels never reached the required comparison state: ${current.label}; ${JSON.stringify(delta)}.`))
                    return
                }
            }
            const sameSize = current.previous
                && current.previous.size.width === sample.size.width
                && current.previous.size.height === sample.size.height
            const stability = sameSize ? temporalStabilitySummary(current.previous, sample) : null
            if (!stability?.withinNoiseEnvelope) {
                current.previous = sample
                if (current.matchingFrames < current.maximumFrames) return
                current.fail(new Error(`Presented-frame pixels did not converge: ${current.label}; ${JSON.stringify(stability ?? { reason: 'bitmap dimensions changed' })}.`))
                return
            }
            pendingFrame = null
            clearTimeout(current.timer)
            clearInterval(current.pulseTimer)
            current.resolve({ ...sample, stableFrames: 2, correlatedFrames: current.matchingFrames, stability })
        } catch (error) {
            current.fail(error)
        }
    }
    const nextStablePresentedCrop = (label, state, options = {}) => {
        if (pendingFrame) throw new Error('Presented-frame sampler already has a pending request.')
        return new Promise((resolve, reject) => {
            presentedFrameMarkerSerial += 1
            if (presentedFrameMarkerSerial > 95) throw new Error('Presented-frame marker budget was exhausted.')
            const markerToken = {
                firstGray: 24 + (presentedFrameMarkerSerial % 16) * 12,
                secondGray: 24 + Math.floor(presentedFrameMarkerSerial / 16) * 24,
            }
            const request = {
                resolve,
                reject,
                timer: null,
                pulseTimer: null,
                matchingFrames: 0,
                previous: null,
                markerToken,
                state,
                label,
                fail: null,
                referenceBitmap: options.referenceBitmap ?? null,
                minimumChangedPixels: options.minimumChangedPixels ?? 0,
                maximumChangedPixels: options.maximumChangedPixels ?? Number.POSITIVE_INFINITY,
                maximumChannelDelta: options.maximumChannelDelta ?? Number.POSITIVE_INFINITY,
                maximumFrames: options.referenceBitmap ? 30 : 6,
            }
            const fail = (error) => {
                if (pendingFrame !== request) return
                pendingFrame = null
                clearTimeout(request.timer)
                clearInterval(request.pulseTimer)
                reject(error)
            }
            request.fail = fail
            const pulse = () => {
                if (pendingFrame !== request) return
                const width = ++pulseSerial % 2 === 0 ? 12 : 13
                void webContents.executeJavaScript(`(() => {
                    const pulse = document.getElementById('g08-frame-pulse')
                    if (!pulse) throw new Error('Presented-frame pulse is missing.')
                    pulse.style.backgroundImage = 'linear-gradient(to right, rgb(${markerToken.firstGray} ${markerToken.firstGray} ${markerToken.firstGray}) 0 50%, rgb(${markerToken.secondGray} ${markerToken.secondGray} ${markerToken.secondGray}) 50% 100%)'
                    pulse.style.width = '${width + 4}px'
                    return pulse.offsetWidth
                })()`).catch(fail)
            }
            const timer = setTimeout(() => {
                fail(new Error(`Timed out waiting for presented frame: ${label}.`))
            }, 5_000)
            request.timer = timer
            pendingFrame = request
            request.pulseTimer = setInterval(pulse, 100)
            pulse()
        })
    }
    try {
        if (!window.isVisible()) window.show()
        webContents.setBackgroundThrottling(false)
        await webContents.executeJavaScript(`(() => {
            let style = document.getElementById('g08-catalogue-proof-style')
            if (!style) {
                style = document.createElement('style')
                style.id = 'g08-catalogue-proof-style'
                style.textContent = 'html[data-g08-proof="true"] .style-card:not([data-g08-proof-target="true"]){display:none!important}html[data-g08-proof="true"] .style-card[data-g08-proof-target="true"]{transition:none!important;transform:none!important}[data-g08-paint-mask="true"]>*{visibility:hidden!important}#g08-frame-pulse{position:fixed;left:4px;top:4px;width:16px;height:12px;z-index:2147483647;pointer-events:none}'
                document.head.append(style)
            }
            let pulse = document.getElementById('g08-frame-pulse')
            if (!pulse) {
                pulse = document.createElement('i')
                pulse.id = 'g08-frame-pulse'
                pulse.setAttribute('aria-hidden', 'true')
                document.body.append(pulse)
            }
            document.documentElement.dataset.g08Proof = 'true'
        })()`)
        webContents.beginFrameSubscription(false, onFrame)
        subscribed = true
        themeSwitches.push(await setTheme(window, 'light'))
        const readTargetState = async (id) => withTimeout(webContents.executeJavaScript(`(async () => {
                const cards = Array.from(document.querySelectorAll('.style-card[data-style-id]'))
                cards.forEach((card) => { delete card.dataset.g08ProofTarget })
                const card = cards.find((candidate) => candidate.dataset.styleId === ${JSON.stringify(id)})
                if (!card) throw new Error('Missing catalogue Scene card: ' + ${JSON.stringify(id)})
                card.dataset.g08ProofTarget = 'true'
                card.scrollIntoView({ block: 'center', inline: 'nearest' })
                const scene = card.querySelector('.style-miniature > :not(b)')
                if (!scene) throw new Error('Missing catalogue Scene renderer: ' + ${JSON.stringify(id)})
                if (scene.matches('.vitrine-stage')) {
                    const deadline = performance.now() + 2_000
                    let priorMetrics = null
                    let stableMetrics = null
                    while (!stableMetrics && performance.now() < deadline) {
                        await new Promise((resolve) => {
                            let done = false
                            const timer = setTimeout(() => {
                                if (!done) {
                                    done = true
                                    resolve()
                                }
                            }, 100)
                            requestAnimationFrame(() => {
                                if (!done) {
                                    done = true
                                    clearTimeout(timer)
                                    resolve()
                                }
                            })
                        })
                        const style = getComputedStyle(scene)
                        const width = Number.parseFloat(style.width)
                        const height = Number.parseFloat(style.height)
                        const compensation = Number(scene.dataset.vitrineMetricCompensation)
                        const shortEdge = Number(scene.dataset.vitrineShortEdge)
                        const expectedShortEdge = Math.min(width, height)
                        const metrics = Number.isFinite(compensation) && compensation > 0
                            && Number.isFinite(shortEdge) && shortEdge > 0
                            && Number.isFinite(expectedShortEdge) && expectedShortEdge > 0
                            && Math.abs(shortEdge - expectedShortEdge) <= .01
                            ? [compensation, shortEdge, width, height].map((value) => Number(value.toFixed(4))).join(':')
                            : null
                        if (metrics && metrics === priorMetrics) stableMetrics = metrics
                        priorMetrics = metrics
                    }
                    if (!stableMetrics) throw new Error('Vitrine catalogue metrics did not settle to two valid frames.')
                }
                const box = scene.getBoundingClientRect()
                const layers = Array.from(scene.querySelectorAll('.atelier-card, .vitrine-plane, .galileo-card'))
                const visibleLayers = layers.filter((layer) => {
                    const style = getComputedStyle(layer)
                    const rect = layer.getBoundingClientRect()
                    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > .01 && rect.width > 1 && rect.height > 1
                }).length
                const paintProperties = [
                    'display', 'visibility', 'opacity', 'color', 'color-scheme', 'background-color', 'background-image',
                    'background-position', 'background-size', 'background-repeat', 'background-clip', 'background-origin',
                    'border-top-color', 'border-top-width', 'border-top-style', 'border-right-color', 'border-right-width',
                    'border-right-style', 'border-bottom-color', 'border-bottom-width', 'border-bottom-style',
                    'border-left-color', 'border-left-width', 'border-left-style', 'border-top-left-radius',
                    'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
                    'outline-color', 'outline-width', 'outline-style', 'outline-offset', 'box-shadow', 'filter', 'backdrop-filter',
                    'mix-blend-mode', 'clip-path', 'transform', 'transform-origin', 'perspective', 'font-family',
                    'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-variation-settings', 'line-height',
                    'letter-spacing', 'text-shadow', 'text-decoration-color', 'text-decoration-line', 'text-decoration-style',
                    'text-transform', 'white-space', 'overflow', 'overflow-x', 'overflow-y', 'isolation', 'z-index',
                    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'mask-image', 'mask-position',
                    'mask-size', 'mask-repeat', 'object-fit', 'object-position',
                ]
                const styleValues = (element, pseudo = null) => {
                    const style = getComputedStyle(element, pseudo)
                    return paintProperties.map((property) => style.getPropertyValue(property))
                }
                const paintNodes = [scene, ...scene.querySelectorAll('*')]
                const paintSignature = paintNodes.map((element) => {
                    const rect = element.getBoundingClientRect()
                    const before = getComputedStyle(element, '::before').content
                    const after = getComputedStyle(element, '::after').content
                    return {
                        tag: element.tagName,
                        className: typeof element.className === 'string' ? element.className : '',
                        key: element.dataset.sourceId || element.dataset.mediaId || element.dataset.role || '',
                        text: Array.from(element.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent || '').join('').replace(/\s+/g, ' ').trim(),
                        media: element instanceof HTMLImageElement
                            ? [element.getAttribute('src') || '', element.currentSrc || '', element.naturalWidth, element.naturalHeight]
                            : element instanceof HTMLVideoElement
                                ? [element.getAttribute('src') || '', element.currentSrc || '', element.videoWidth, element.videoHeight, Number(element.currentTime.toFixed(4)), element.dataset.storyFrameProof || '']
                                : null,
                        rect: [rect.left - box.left, rect.top - box.top, rect.width, rect.height].map((value) => Number(value.toFixed(4))),
                        style: styleValues(element),
                        before: before === 'none' ? null : [before, ...styleValues(element, '::before')],
                        after: after === 'none' ? null : [after, ...styleValues(element, '::after')],
                    }
                })
                return {
                    viewport: { width: innerWidth, height: innerHeight },
                    box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height },
                    fullyVisible: box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
                    visibleLayers,
                    stateHash: scene.dataset.sourceState || scene.dataset.evaluatorHash || '',
                    sceneTheme: scene.dataset.sceneTheme || '',
                    colorScheme: getComputedStyle(scene).colorScheme,
                    paintNodes: paintNodes.length,
                    paintSignature: JSON.stringify(paintSignature),
                }
            })()`), `${id} catalogue Scene state`, 4_000)
        const assertTargetState = (id, state) => {
            if (!state.fullyVisible || state.box.width < 40 || state.box.height < 40 || state.visibleLayers < 1 || !state.stateHash
                || !['light', 'dark'].includes(state.sceneTheme) || state.colorScheme !== state.sceneTheme || state.paintNodes < 1) {
                throw new Error(`Catalogue Scene ${id} is not fully capturable: ${JSON.stringify(state)}`)
            }
        }
        const resultFor = (actual, state) => ({
                method: 'frame-subscription',
                bitmapEncoding: 'electron-native-bitmap',
                bitmapBytes: actual.bitmap.length,
                bitmapSha256: actual.sha256,
                pixelWidth: actual.size.width,
                pixelHeight: actual.size.height,
                stableFrames: actual.stableFrames,
                correlatedFrames: actual.correlatedFrames,
                stability: actual.stability,
                bounds: state.box,
                scene: {
                    visibleLayers: state.visibleLayers,
                    stateHash: state.stateHash,
                    sceneTheme: state.sceneTheme,
                    colorScheme: state.colorScheme,
                    paintNodes: state.paintNodes,
                    paintSignature: sha256(state.paintSignature),
                },
            })
        for (const id of ids) {
            const lightState = await readTargetState(id)
            assertTargetState(id, lightState)
            const lightActual = await nextStablePresentedCrop(`${id} light`, lightState)

            themeSwitches.push(await setTheme(window, 'dark'))
            const darkState = await readTargetState(id)
            assertTargetState(id, darkState)
            const expectedPixels = lightActual.bitmap.length / 4
            const allowedChangedPixels = Math.max(32, Math.ceil(expectedPixels * .0001))
            const darkActual = await nextStablePresentedCrop(`${id} dark`, darkState)
            const delta = pixelDeltaSummary(lightActual.bitmap, darkActual.bitmap)
            comparisons[id] = {
                rawHashEqual: lightActual.sha256 === darkActual.sha256,
                changedPixels: delta.changedPixels,
                changedRatio: delta.changedRatio,
                maxChannelDelta: delta.maxChannelDelta,
                allowedChangedPixels,
                withinNoiseEnvelope: delta.changedPixels <= allowedChangedPixels,
            }
            if (!comparisons[id].withinNoiseEnvelope) throw new Error(`UI theme leaked into catalogue Scene ${id}: ${JSON.stringify(comparisons[id])}`)

            themeSwitches.push(await setTheme(window, 'light'))
            await webContents.executeJavaScript(`(() => {
                const scene = document.querySelector('.style-card[data-g08-proof-target="true"] .style-miniature > :not(b)')
                if (!scene) throw new Error('Missing catalogue Scene paint target.')
                scene.dataset.g08PaintMask = 'true'
                return scene.getBoundingClientRect().width
            })()`)
            const pixels = lightActual.bitmap.length / 4
            const minimum = Math.max(128, Math.ceil(pixels * .005))
            const masked = await nextStablePresentedCrop(`${id} paint mask`, lightState, { referenceBitmap: lightActual.bitmap, minimumChangedPixels: minimum })
            const changed = changedPixelCount(lightActual.bitmap, masked.bitmap)
            if (changed < minimum) throw new Error(`Catalogue Scene ${id} lacks materially painted content: ${changed}/${pixels} pixels.`)
            await webContents.executeJavaScript(`(() => {
                const scene = document.querySelector('.style-card[data-g08-proof-target="true"] .style-miniature > :not(b)')
                delete scene.dataset.g08PaintMask
                return scene.getBoundingClientRect().width
            })()`)

            light[id] = { ...resultFor(lightActual, lightState), paintedPixels: changed, paintedRatio: changed / pixels }
            dark[id] = resultFor(darkActual, darkState)
        }
        if (new Set(Object.values(light).map((entry) => entry.scene.stateHash)).size !== ids.length
            || new Set(Object.values(dark).map((entry) => entry.scene.stateHash)).size !== ids.length) {
            throw new Error('G08 Scene provenance hashes are not unique across the 29-Scene catalogue.')
        }
    } finally {
        if (pendingFrame) {
            pendingFrame.fail(new Error('Presented-frame sampler closed with a pending request.'))
        }
        if (subscribed) webContents.endFrameSubscription()
        webContents.setBackgroundThrottling(priorThrottling)
        await webContents.executeJavaScript(`(() => {
            delete document.documentElement.dataset.g08Proof
            document.querySelectorAll('[data-g08-proof-target]').forEach((card) => { delete card.dataset.g08ProofTarget })
            document.querySelectorAll('[data-g08-paint-mask]').forEach((scene) => { delete scene.dataset.g08PaintMask })
            document.getElementById('g08-catalogue-proof-style')?.remove()
            document.getElementById('g08-frame-pulse')?.remove()
        })()`)
        await resetCatalogueScroll(window)
    }
    return { light, dark, comparisons }
}

function compareCatalogueSceneHashes(light, dark, comparisons) {
    const lightIds = Object.keys(light).sort()
    const darkIds = Object.keys(dark).sort()
    if (lightIds.join(',') !== darkIds.join(',')) throw new Error('Theme Scene-isolation sets do not match.')
    return lightIds.filter((id) => light[id].pixelWidth !== dark[id].pixelWidth
        || light[id].pixelHeight !== dark[id].pixelHeight
        || light[id].scene.stateHash !== dark[id].scene.stateHash
        || light[id].scene.sceneTheme !== dark[id].scene.sceneTheme
        || light[id].scene.colorScheme !== dark[id].scene.colorScheme
        || light[id].scene.visibleLayers !== dark[id].scene.visibleLayers
        || light[id].scene.paintNodes !== dark[id].scene.paintNodes
        || light[id].scene.paintSignature !== dark[id].scene.paintSignature
        || !comparisons[id]?.withinNoiseEnvelope)
}

function assertAppearance(appearance, expectedTheme, key, physicalTargetFloor) {
    if (appearance.theme !== expectedTheme || appearance.source !== 'stored' || appearance.stored !== expectedTheme || appearance.ready !== 'true') {
        throw new Error(`${key} has stale theme state: ${JSON.stringify(appearance)}`)
    }
    if (appearance.colorScheme !== expectedTheme || appearance.togglePressed !== String(expectedTheme === 'dark')) {
        throw new Error(`${key} exposes the wrong native colour scheme or toggle state.`)
    }
    const expectedAction = expectedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
    if (appearance.toggleLabel !== expectedAction) throw new Error(`${key} exposes the wrong theme-toggle action name.`)
    if (!appearance.focusIndicator.focusVisible || appearance.focusIndicator.style === 'none' || appearance.focusIndicator.physicalWidth < 2 || appearance.focusIndicator.ratio < 3) {
        throw new Error(`${key} has an invisible or sub-3:1 focus indicator: ${JSON.stringify(appearance.focusIndicator)}`)
    }
    const expectedMeta = expectedTheme === 'dark' ? '#111210' : '#f3f0e9'
    if (appearance.themeColor.toLowerCase() !== expectedMeta) throw new Error(`${key} has stale theme-colour metadata.`)
    if (appearance.rootOverflow > 1) throw new Error(`${key} has root-level horizontal overflow.`)
    if (appearance.toggle.height + .2 < physicalTargetFloor || appearance.toggle.width + .2 < physicalTargetFloor) {
        throw new Error(`${key} theme toggle is below its ${physicalTargetFloor}px physical floor.`)
    }
    const weak = appearance.samples.filter((sample) => sample.ratio < 4.5)
    if (weak.length) throw new Error(`${key} has sub-4.5 text contrast: ${JSON.stringify(weak)}`)
}

function maximumRectDifference(first, second) {
    const fields = ['left', 'top', 'right', 'bottom', 'width', 'height']
    return Math.max(...fields.map((field) => Math.abs(first[field] - second[field])))
}

function assertInvariant(metrics, themeSwitches) {
    const baseline = metrics["light-wide-100"]
    if (!baseline) throw new Error('Light wide 100% baseline is missing.')
    for (const [key, value] of Object.entries(metrics)) {
        const [theme, _viewport, scaleText] = key.split('-')
        const expectedScale = Number(scaleText)
        if (!value.designSystem.bodyFont.includes('PD Body')) throw new Error(`${key} did not resolve PD Body.`)
        if (!value.designSystem.headingFont.includes('PD Head')) throw new Error(`${key} did not resolve PD Head.`)
        if (!value.designSystem.eyebrowFont.includes('PD Eyebrow')) throw new Error(`${key} did not resolve PD Eyebrow.`)
        if (!value.designSystem.fontReady) throw new Error(`${key} did not load every pitch.dog font role.`)
        if (value.designSystem.phosphorIcons < 6) throw new Error(`${key} rendered too few Phosphor interface icons.`)
        if (value.designSystem.rogueControlSvgs !== 0) throw new Error(`${key} rendered a non-Phosphor control SVG.`)
        if (value.designSystem.spacingTokens.some((token) => !token)) throw new Error(`${key} lost a pitch.dog spacing token.`)
        if (value.interfaceScale !== expectedScale) throw new Error(`${key} rendered the wrong Interface Scale.`)
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
            || Math.abs(value.preview.shellRatio - value.preview.declaredRatio) > .002
            || Math.abs(value.preview.planeRatio - value.preview.declaredRatio) > .002) {
            throw new Error(`${key} changed or distorted the preview canvas ratio.`)
        }
        if (value.shell.scrollWidth > value.shell.clientWidth + 1) throw new Error(`${key} has horizontally clipped studio content.`)
        if (value.headerGeometry.autosaveBrandOverlap || value.headerGeometry.autosaveActionsOverlap) {
            throw new Error(`${key} lets autosave status collide with a titlebar neighbour.`)
        }
        const caretFile = theme === 'dark' ? 'caret-down-light' : 'caret-down'
        const caretColour = theme === 'dark' ? '%23f4efe7' : '%23181917'
        const caretImage = value.controlPolish.selectBackgroundImage.toLowerCase()
        const hasThemeCorrectCaret = caretImage.includes(caretFile) || caretImage.includes(caretColour)
        if (value.controlPolish.selectAppearance !== 'none'
            || !hasThemeCorrectCaret
            || value.controlPolish.selectPaddingRight < 44) {
            throw new Error(`${key} lost the explicit, theme-correct, comfortably inset select caret.`)
        }
        if (!value.controlPolish.reducedMotion && (value.controlPolish.inspectorAnimationName === 'none' || value.controlPolish.inspectorAnimationDuration < .15)) {
            throw new Error(`${key} lost inspector panel reveal motion.`)
        }
        if (value.shell.display === 'flex' && value.headerGeometry.primary.width + 2 < value.headerGeometry.actions.width) {
            throw new Error(`${key} leaves the primary Export action stranded in a short wrapped row.`)
        }
        if (value.regions.titlebar.bottom > value.regions.library.top + 1) throw new Error(`${key} lets the header overlap the Slides rail.`)
        const physicalTargetFloor = value.interfaceScale < 100 ? 44 : 44 * value.interfaceScale / 100
        if (Object.values(value.targets).some((target) => target.height + .2 < physicalTargetFloor)) {
            throw new Error(`${key} has a primary target below its ${physicalTargetFloor}px physical floor.`)
        }
        if (value.focus.outlineStyle === 'none' || parseFloat(value.focus.outlineWidth) < 2) throw new Error(`${key} lacks visible keyboard focus.`)
        if (!value.projectDocument) throw new Error(`${key} has no durable Project state to compare.`)
        assertAppearance(value.appearance, theme, key, physicalTargetFloor)
    }

    for (const viewport of ['wide', 'minimum']) {
        for (const scale of [75, 100, 150, 200]) {
            const light = metrics[`light-${viewport}-${scale}`]
            const dark = metrics[`dark-${viewport}-${scale}`]
            if (!light || !dark) throw new Error(`Missing paired theme metrics for ${viewport}-${scale}.`)
            for (const region of Object.keys(light.regions)) {
                if (maximumRectDifference(light.regions[region], dark.regions[region]) > .75) {
                    throw new Error(`Theme switching moved ${region} at ${viewport}-${scale}.`)
                }
            }
            for (const target of Object.keys(light.targets)) {
                if (maximumRectDifference(light.targets[target], dark.targets[target]) > .75) {
                    throw new Error(`Theme switching resized ${target} at ${viewport}-${scale}.`)
                }
            }
        }
    }

    if (!themeSwitches.some((entry) => entry.changed)) throw new Error('The theme-control journey never changed theme.')
    if (themeSwitches.some((entry) => entry.maximumLayoutShift > .75 || !entry.projectInvariant || !entry.focusRetained)) {
        throw new Error('A theme switch moved layout, changed Project truth, or lost trigger focus.')
    }
}

async function runG08InterfaceSmoke(window, outputDirectory) {
    fs.mkdirSync(outputDirectory, { recursive: true })
    const captures = {}
    const themeSwitches = []
    await waitForWindowVisible(window)

    await resize(window, 1280, 900)
    await waitFor(window, `document.querySelector('.style-gallery-shell')`, 'scene catalogue')
    await setScale(window, 100)

    const themePersistence = {
        light: await verifyThemePersistence(window, 'light'),
        dark: await verifyThemePersistence(window, 'dark'),
    }
    const themeStorageSync = await verifyThemeStorageSync(window)
    themeSwitches.push(await setTheme(window, 'light'))
    captures.catalogueLight100 = await capture(window, outputDirectory, 'gallery-catalogue-light-100')
    themeSwitches.push(await setTheme(window, 'dark'))
    captures.catalogueDark100 = await capture(window, outputDirectory, 'gallery-catalogue-dark-100')
    if (captures.catalogueLight100.sha256 === captures.catalogueDark100.sha256) throw new Error('Catalogue light and dark modes are visually identical.')

    // Keyboard, stored state, executable first-paint scenarios, and a real StorageEvent cover persistence without mutating this proof renderer.
    await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true }))`)
    await waitFor(window, `document.querySelector('.interface-scale-value')?.textContent?.trim() === '105%'`, 'keyboard scale increase')
    await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true }))`)
    await waitFor(window, `document.querySelector('.interface-scale-value')?.textContent?.trim() === '100%'`, 'keyboard scale reset')
    await setScale(window, 125)
    await window.webContents.executeJavaScript(`(() => {
        const current = JSON.parse(localStorage.getItem('${PRESENTATION_KEY}'))
        const next = { ...current, revision: current.revision + 1, writerId: 'ffffffffffffffff', interfaceScale: 130 }
        const text = JSON.stringify(next)
        localStorage.setItem('${PRESENTATION_KEY}', text)
        window.dispatchEvent(new StorageEvent('storage', { key: '${PRESENTATION_KEY}', newValue: text, storageArea: localStorage }))
    })()`)
    await waitFor(window, `document.querySelector('.interface-scale-value')?.textContent?.trim() === '130%'`, 'real StorageEvent scale update')
    await setScale(window, 100)

    const catalogueMetrics = {}
    const catalogueReachability = {}
    await resize(window, 1080, 700)
    for (const theme of ['light', 'dark']) {
        themeSwitches.push(await setTheme(window, theme))
        for (const scale of [75, 200]) {
            await setScale(window, scale)
            const key = `${theme}-minimum-${scale}`
            const value = await readCatalogueMetrics(window)
            value.appearance = await readAppearanceMetrics(window, 'catalogue')
            catalogueMetrics[key] = value
            const physicalTargetFloor = scale < 100 ? 44 : 44 * scale / 100
            if (value.shell.scrollWidth > value.shell.clientWidth + 1) throw new Error(`${key} has horizontally clipped catalogue content.`)
            if (value.cardFit.length) throw new Error(`${key} has Scene-card content outside its container: ${JSON.stringify(value.cardFit)}`)
            if (Object.values(value.targets).some((target) => target.height + .2 < physicalTargetFloor)) {
                throw new Error(`${key} has a catalogue target below its ${physicalTargetFloor}px physical floor.`)
            }
            assertAppearance(value.appearance, theme, key, physicalTargetFloor)
            captures[`catalogue-${key}-top`] = await capture(window, outputDirectory, `gallery-catalogue-${key}-top`)
            catalogueReachability[key] = await scrollCatalogueToBottom(window)
            captures[`catalogue-${key}-bottom`] = await capture(window, outputDirectory, `gallery-catalogue-${key}-bottom`)
            await resetCatalogueScroll(window)
        }
    }

    const catalogueSceneProof = await captureCatalogueSceneProof(window, themeSwitches)
    const catalogueMiniaturesLight = catalogueSceneProof.light
    const catalogueMiniaturesDark = catalogueSceneProof.dark
    const catalogueComparisons = catalogueSceneProof.comparisons
    const catalogueThemeLeaks = compareCatalogueSceneHashes(catalogueMiniaturesLight, catalogueMiniaturesDark, catalogueComparisons)
    if (catalogueThemeLeaks.length) throw new Error('UI theme leaked into Scene catalogue rendering: ' + catalogueThemeLeaks.join(', '))

    await resize(window, 1280, 900)
    await setScale(window, 100)
    themeSwitches.push(await setTheme(window, 'light'))
    await window.webContents.executeJavaScript(`document.querySelector('button[data-style-id="opening-reel"]')?.click()`)
    await waitFor(window, `document.querySelector('.app-shell') && document.querySelector('.stage-shell')`, 'Gallery studio')
    await waitFor(window, `!document.querySelector('.launch-screen')`, 'launch transition', 15_000)
    await waitFor(window, `localStorage.getItem('${PROJECT_KEY}')`, 'durable Project snapshot')
    await window.webContents.executeJavaScript(`document.querySelector('.title-actions .button.primary')?.click()`)
    await waitFor(window, `document.querySelector('.export-summary') && document.querySelectorAll('.format-cards button').length === 2`, 'verified export controls')
    const host = await window.webContents.executeJavaScript(`(async () => ({
        identity: await window.galleryHost.identity(),
        capabilities: await window.galleryHost.exportCapabilities(),
    }))()`)
    if (host.identity.productId !== 'galileo-gallery' || host.capabilities.formats.map((format) => format.id).join(',') !== 'png-frames,mp4-h264-aac') {
        throw new Error('G08 did not exercise the current Linux HostPort and export capability seam.')
    }
    const formatTruth = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.format-cards button')).map((button) => ({ text: button.textContent.replace(/\\s+/g, ' ').trim(), disabled: button.disabled }))`)
    if (!formatTruth[0]?.disabled || !formatTruth[0]?.text.includes('Quiet Carousel v1 or Vitrine v2 only') || !formatTruth[1]?.disabled || !formatTruth[1]?.text.includes('Quiet Carousel only')) {
        throw new Error('G08 did not preserve the honest Scene-specific export capability boundary.')
    }

    const disclosure = {}
    for (const theme of ['light', 'dark']) {
        themeSwitches.push(await setTheme(window, theme))
        disclosure[theme] = await verifyDisclosureMotion(window)
        await window.webContents.executeJavaScript(`document.querySelector('.project-trigger')?.click()`)
        await waitFor(window, `document.querySelector('.project-menu')?.classList.contains('is-open')`, `open Project menu in ${theme}`)
        await new Promise((resolve) => setTimeout(resolve, disclosure[theme].reducedMotion ? 20 : 260))
        captures[`projectMenu-${theme}-100`] = await capture(window, outputDirectory, `gallery-project-menu-${theme}-100`)
        await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
        await new Promise((resolve) => setTimeout(resolve, disclosure[theme].reducedMotion ? 20 : 360))
    }

    themeSwitches.push(await setTheme(window, 'light'))
    const workflow = await verifyWorkflowNavigation(window)
    if (workflow.slides !== 'Slides'
        || workflow.tabs.join(',') !== 'Look,Motion,Export'
        || workflow.steps.some((step, index) => step.active !== workflow.tabs[index] || !step.visible || !step.projectInvariant)
        || workflow.keyboard.arrow.active !== 'Motion'
        || workflow.keyboard.arrow.focused !== 'Motion'
        || workflow.keyboard.end.active !== 'Export'
        || workflow.keyboard.end.focused !== 'Export'
        || workflow.active !== 'Export'
        || !workflow.projectInvariant) {
        throw new Error('G08 did not preserve the Slides, Look, Motion, Export workflow without changing Project truth.')
    }
    await freezeStoryPose(window)

    const metrics = {}
    const reachability = {}
    const previewReachability = {}
    for (const theme of ['light', 'dark']) {
        themeSwitches.push(await setTheme(window, theme))
        for (const [viewportName, width, height] of [['wide', 1280, 900], ['minimum', 1080, 700]]) {
            await resize(window, width, height)
            for (const scale of [75, 100, 150, 200]) {
                await setScale(window, scale)
                await freezeStoryPose(window)
                const key = `${theme}-${viewportName}-${scale}`
                const value = await readMetrics(window)
                value.appearance = await readAppearanceMetrics(window, 'studio')
                metrics[key] = value
                captures[key] = await capture(window, outputDirectory, `gallery-studio-${key}`)
                reachability[key] = await verifyBottomReachability(window)
                previewReachability[key] = await scrollPreviewIntoView(window)
                captures[`preview-${key}`] = await capture(window, outputDirectory, `gallery-preview-${key}`)
                await resetStudioScroll(window)
                fs.writeFileSync(path.join(outputDirectory, 'renderer-progress.json'), JSON.stringify({
                    source: { sha: process.env.GALLERY_SOURCE_SHA ?? null, tree: process.env.GALLERY_SOURCE_TREE ?? null },
                    captures,
                    disclosure,
                    themePersistence,
                    themeStorageSync,
                    themeSwitches,
                    catalogueMetrics,
                    catalogueReachability,
                    metrics,
                    reachability,
                    previewReachability,
                }, null, 2) + '\n')
            }
        }
    }
    assertInvariant(metrics, themeSwitches)

    await resize(window, 1280, 900)
    await setScale(window, 100)
    await freezeStoryPose(window)
    themeSwitches.push(await setTheme(window, 'light'))
    const stageLight = await captureStablePresentedRegion(window, '.stage', 'studio light Scene', 2)
    captures.studioLightFinal = await capture(window, outputDirectory, 'gallery-studio-light-final')
    const studioPixelCount = stageLight.bitmap.length / 4
    const studioAllowedChangedPixels = Math.max(32, Math.ceil(studioPixelCount * .0001))
    themeSwitches.push(await setTheme(window, 'dark'))
    const stageDark = await captureStablePresentedRegion(window, '.stage', 'studio dark Scene', 2)
    captures.studioDarkFinal = await capture(window, outputDirectory, 'gallery-studio-dark-final')
    if (captures.studioLightFinal.sha256 === captures.studioDarkFinal.sha256) throw new Error('Studio light and dark modes are visually identical.')
    const studioDelta = pixelDeltaSummary(stageLight.bitmap, stageDark.bitmap)
    const studioComparison = {
        rawHashEqual: stageLight.bitmapSha256 === stageDark.bitmapSha256,
        changedPixels: studioDelta.changedPixels,
        changedRatio: studioDelta.changedRatio,
        maxChannelDelta: studioDelta.maxChannelDelta,
        allowedChangedPixels: studioAllowedChangedPixels,
        withinNoiseEnvelope: studioDelta.changedPixels <= studioAllowedChangedPixels,
    }
    if (!studioComparison.withinNoiseEnvelope) throw new Error('UI theme leaked into the authored Scene preview: ' + JSON.stringify(studioComparison))

    themeSwitches.push(await setTheme(window, 'light'))
    const receipt = {
        schemaVersion: 2,
        task: 'G08 dual-theme interface, scale, fit, and HostPort smoke',
        source: { sha: process.env.GALLERY_SOURCE_SHA ?? null, tree: process.env.GALLERY_SOURCE_TREE ?? null },
        host,
        workflow,
        disclosure,
        themePersistence,
        themeStorageSync,
        themeSwitches,
        visualIsolation: {
            schemaVersion: 2,
            catalogue: { light: catalogueMiniaturesLight, dark: catalogueMiniaturesDark, comparisons: catalogueComparisons, mismatches: catalogueThemeLeaks },
            studio: { light: stageLight, dark: stageDark, comparison: studioComparison },
        },
        captures,
        catalogueMetrics,
        catalogueReachability,
        metrics,
        reachability,
        previewReachability,
        resetScale: Number(await window.webContents.executeJavaScript(`document.querySelector('[data-interface-scale]').dataset.interfaceScale`)),
        resetTheme: await window.webContents.executeJavaScript(`document.documentElement.dataset.uiTheme`),
    }
    fs.writeFileSync(path.join(outputDirectory, 'renderer-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`)
    console.log(JSON.stringify({ receipt: path.join(outputDirectory, 'renderer-receipt.json'), captures: receipt.captures }))
}

module.exports = { runG08InterfaceSmoke }
