const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const THEME_KEY = "galileo-gallery-interface-theme-v1"
const PROJECT_KEY = "galileo-gallery-project-v1"

const CONTEXTS = {
    catalogue: {
        shell: ".style-gallery-shell",
        strong: ".style-gallery-header h1",
        muted: ".style-gallery-header p",
        stable: [".style-gallery-header", ".style-gallery-tools", ".style-gallery-grid"],
    },
    studio: {
        shell: ".app-shell",
        strong: ".panel-heading h2",
        muted: ".brand-lockup span",
        stable: [".titlebar", ".library", ".studio", ".inspector"],
    },
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex")
}

async function settle(window) {
    await window.webContents.executeJavaScript(`(async () => {
        await document.fonts.ready
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        return true
    })()`)
}

async function capture(window, outputDirectory, name) {
    await settle(window)
    const image = await window.webContents.capturePage()
    const png = image.toPNG()
    const file = path.join(outputDirectory, `${name}.png`)
    fs.writeFileSync(file, png)
    return {
        file: path.basename(file),
        bytes: png.length,
        sha256: sha256(png),
        size: image.getSize(),
    }
}

async function reload(window) {
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Theme persistence reload timed out.")), 15_000)
        window.webContents.once("did-finish-load", () => {
            clearTimeout(timer)
            resolve()
        })
        window.webContents.reload()
    })
    await settle(window)
}

async function chooseTheme(window, target) {
    const result = await window.webContents.executeJavaScript(`(async () => {
        const target = ${JSON.stringify(target)}
        const control = document.querySelector("[data-interface-theme-control]")
        if (!control) throw new Error("Interface theme control is missing.")
        const current = document.documentElement.dataset.theme
        const stored = localStorage.getItem("galileo-gallery-interface-theme-v1")
        const source = document.documentElement.dataset.themeSource
        if (current === target && (stored !== target || source !== "user")) {
            control.click()
            await new Promise((resolve) => requestAnimationFrame(resolve))
            control.click()
        } else if (current !== target) {
            control.click()
        }
        const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches
        await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 20 : 280))
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return {
            theme: document.documentElement.dataset.theme,
            stored: localStorage.getItem(${JSON.stringify(THEME_KEY)}),
        }
    })()`)
    if (result.theme !== target || result.stored !== target) {
        throw new Error(`Theme control did not visibly persist ${target} mode: ${JSON.stringify(result)}`)
    }
    await settle(window)
}

async function readThemeSnapshot(window, context) {
    const config = CONTEXTS[context]
    if (!config) throw new Error(`Unknown theme verification context: ${context}`)
    return window.webContents.executeJavaScript(`(() => {
        const config = ${JSON.stringify(config)}
        const rect = (selector) => {
            const element = document.querySelector(selector)
            if (!element) throw new Error("Missing themed element: " + selector)
            const box = element.getBoundingClientRect()
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
        }
        const resolveColour = (value) => {
            const probe = document.createElement("span")
            probe.style.color = value
            probe.style.position = "fixed"
            probe.style.pointerEvents = "none"
            document.body.appendChild(probe)
            const resolved = getComputedStyle(probe).color
            probe.remove()
            return resolved
        }
        const parseColour = (value) => {
            const numbers = value.match(/[\\d.]+/g)?.map(Number) ?? []
            return { r: numbers[0] ?? 0, g: numbers[1] ?? 0, b: numbers[2] ?? 0 }
        }
        const luminance = (value) => {
            const colour = parseColour(value)
            const channel = (part) => {
                const normal = part / 255
                return normal <= .04045 ? normal / 12.92 : Math.pow((normal + .055) / 1.055, 2.4)
            }
            return .2126 * channel(colour.r) + .7152 * channel(colour.g) + .0722 * channel(colour.b)
        }
        const contrast = (a, b) => {
            const first = luminance(a)
            const second = luminance(b)
            return (Math.max(first, second) + .05) / (Math.min(first, second) + .05)
        }

        const root = document.documentElement
        const rootStyle = getComputedStyle(root)
        const control = document.querySelector("[data-interface-theme-control]")
        if (!control) throw new Error("Interface theme control is missing.")
        const controlStyle = getComputedStyle(control)
        const shell = document.querySelector(config.shell)
        if (!shell) throw new Error("Theme shell is missing.")
        const shellStyle = getComputedStyle(shell)
        const controlBox = control.getBoundingClientRect()
        control.focus()
        const focusStyle = getComputedStyle(control)
        const ink = resolveColour(rootStyle.getPropertyValue("--ink").trim())
        const muted = resolveColour(rootStyle.getPropertyValue("--muted").trim())
        const material = resolveColour(rootStyle.getPropertyValue("--material").trim())
        const stored = localStorage.getItem(${JSON.stringify(THEME_KEY)})
        const projectDocument = localStorage.getItem(${JSON.stringify(PROJECT_KEY)})
        return {
            theme: root.dataset.theme,
            source: root.dataset.themeSource,
            stored,
            colourScheme: rootStyle.colorScheme,
            metaThemeColour: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null,
            control: {
                label: control.getAttribute("aria-label"),
                pressed: control.getAttribute("aria-pressed"),
                icon: control.querySelector("[data-phosphor-icon]")?.getAttribute("data-phosphor-icon") ?? null,
                width: controlBox.width,
                height: controlBox.height,
                outlineStyle: focusStyle.outlineStyle,
                outlineWidth: focusStyle.outlineWidth,
            },
            colours: {
                ink,
                muted,
                material,
                strongContrast: contrast(ink, material),
                mutedContrast: contrast(muted, material),
                strongElement: getComputedStyle(document.querySelector(config.strong)).color,
                mutedElement: getComputedStyle(document.querySelector(config.muted)).color,
            },
            caret: rootStyle.getPropertyValue("--pd-select-caret").trim(),
            motion: {
                reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
                transitionDuration: shellStyle.transitionDuration,
            },
            shell: {
                clientWidth: shell.clientWidth,
                scrollWidth: shell.scrollWidth,
                clientHeight: shell.clientHeight,
                scrollHeight: shell.scrollHeight,
            },
            stable: Object.fromEntries(config.stable.map((selector) => [selector, rect(selector)])),
            projectDocument,
            projectContainsTheme: Boolean(projectDocument && (projectDocument.includes(${JSON.stringify(THEME_KEY)}) || projectDocument.includes('"interfaceTheme"'))),
        }
    })()`)
}

function maxGeometryDelta(first, second) {
    let maximum = 0
    for (const selector of Object.keys(first)) {
        const a = first[selector]
        const b = second[selector]
        for (const key of ["left", "top", "right", "bottom", "width", "height"]) {
            maximum = Math.max(maximum, Math.abs(a[key] - b[key]))
        }
    }
    return maximum
}

function assertThemeSnapshot(snapshot, mode, context) {
    const next = mode === "dark" ? "light" : "dark"
    const expectedIcon = next === "dark" ? "moon" : "sun"
    if (snapshot.theme !== mode || snapshot.stored !== mode || snapshot.source !== "user") {
        throw new Error(`${context} did not expose persisted ${mode} mode: ${JSON.stringify(snapshot)}`)
    }
    if (snapshot.colourScheme !== mode) throw new Error(`${context} did not expose ${mode} color-scheme.`)
    const expectedThemeColour = mode === "dark" ? "#151613" : "#f3f0e9"
    if (snapshot.metaThemeColour?.toLowerCase() !== expectedThemeColour) throw new Error(`${context} did not update the application theme colour for ${mode} mode.`)
    if (snapshot.control.label !== `Switch to ${next} mode`
        || snapshot.control.pressed !== String(mode === "dark")
        || snapshot.control.icon !== expectedIcon) {
        throw new Error(`${context} theme control does not truthfully describe ${mode} state.`)
    }
    if (snapshot.control.width < 44 || snapshot.control.height < 44) {
        throw new Error(`${context} theme control is smaller than 44px.`)
    }
    if (snapshot.control.outlineStyle === "none" || parseFloat(snapshot.control.outlineWidth) < 2) {
        throw new Error(`${context} theme control lacks visible keyboard focus.`)
    }
    if (snapshot.shell.scrollWidth > snapshot.shell.clientWidth + 1) {
        throw new Error(`${context} ${mode} mode introduces horizontal clipping.`)
    }
    if (snapshot.colours.strongContrast < 7 || snapshot.colours.mutedContrast < 4.5) {
        throw new Error(`${context} ${mode} palette misses interface contrast: ${JSON.stringify(snapshot.colours)}`)
    }
    if (snapshot.projectContainsTheme) {
        throw new Error(`${context} leaked interface theme preference into Project data.`)
    }
    if (!snapshot.motion.reduced && snapshot.motion.transitionDuration.split(",").every((value) => parseFloat(value) < .15)) {
        throw new Error(`${context} theme change has no restrained colour transition.`)
    }
}

async function verifySystemFallback(window, context) {
    await window.webContents.executeJavaScript(`localStorage.removeItem(${JSON.stringify(THEME_KEY)})`)
    await reload(window)
    const expected = await window.webContents.executeJavaScript(`matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"`)
    const snapshot = await readThemeSnapshot(window, context)
    if (snapshot.theme !== expected || snapshot.source !== "system" || snapshot.stored !== null) {
        throw new Error(`${context} did not follow the operating-system theme on first run: ${JSON.stringify(snapshot)}`)
    }
    return { expected, snapshot }
}

async function verifyDarkProjectMenu(window, outputDirectory) {
    const result = await window.webContents.executeJavaScript(`(async () => {
        const trigger = document.querySelector(".project-trigger")
        const panel = document.querySelector(".project-menu-panel")
        if (!trigger || !panel) throw new Error("Project menu is missing in dark mode.")
        const before = [".titlebar", ".library", ".studio", ".inspector"].map((selector) => {
            const box = document.querySelector(selector).getBoundingClientRect()
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
        })
        trigger.click()
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
        await new Promise((resolve) => setTimeout(resolve, reduced ? 20 : 280))
        const style = getComputedStyle(panel)
        const box = panel.getBoundingClientRect()
        return {
            open: trigger.getAttribute("aria-expanded"),
            hidden: panel.getAttribute("aria-hidden"),
            opacity: Number(style.opacity),
            colour: style.color,
            background: style.backgroundColor,
            insideViewport: box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
            before,
        }
    })()`)
    if (result.open !== "true" || result.hidden !== "false" || result.opacity < .99 || !result.insideViewport) {
        throw new Error(`Dark Project menu did not open cleanly: ${JSON.stringify(result)}`)
    }
    const screenshot = await capture(window, outputDirectory, "gallery-studio-dark-project-menu")
    const close = await window.webContents.executeJavaScript(`(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
        await new Promise((resolve) => setTimeout(resolve, reduced ? 20 : 360))
        const after = [".titlebar", ".library", ".studio", ".inspector"].map((selector) => {
            const box = document.querySelector(selector).getBoundingClientRect()
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
        })
        return {
            expanded: document.querySelector(".project-trigger").getAttribute("aria-expanded"),
            hidden: document.querySelector(".project-menu-panel").getAttribute("aria-hidden"),
            after,
        }
    })()`)
    const maximumLayoutShift = Math.max(...result.before.flatMap((box, index) =>
        ["left", "top", "right", "bottom", "width", "height"].map((key) => Math.abs(box[key] - close.after[index][key]))
    ))
    if (close.expanded !== "false" || close.hidden !== "true" || maximumLayoutShift > .75) {
        throw new Error(`Dark Project menu did not close without layout shift: ${JSON.stringify({ close, maximumLayoutShift })}`)
    }
    await settle(window)
    return { ...result, maximumLayoutShift, screenshot }
}

async function verifyThemeModes(window, outputDirectory, context, options = {}) {
    fs.mkdirSync(outputDirectory, { recursive: true })
    const projectBefore = await window.webContents.executeJavaScript(`localStorage.getItem(${JSON.stringify(PROJECT_KEY)})`)
    const system = options.verifySystem ? await verifySystemFallback(window, context) : null

    await chooseTheme(window, "light")
    const light = await readThemeSnapshot(window, context)
    assertThemeSnapshot(light, "light", context)
    const captures = {
        [`theme-${context}-light`]: await capture(window, outputDirectory, `gallery-${context}-light`),
    }

    await chooseTheme(window, "dark")
    const dark = await readThemeSnapshot(window, context)
    assertThemeSnapshot(dark, "dark", context)
    captures[`theme-${context}-dark`] = await capture(window, outputDirectory, `gallery-${context}-dark`)

    const maximumLayoutShift = maxGeometryDelta(light.stable, dark.stable)
    if (maximumLayoutShift > .75) {
        throw new Error(`${context} theme switch changes interface geometry by ${maximumLayoutShift}px.`)
    }
    if (light.caret === dark.caret) throw new Error(`${context} did not switch to a light-on-dark select caret.`)
    if (light.colours.ink === dark.colours.ink || light.colours.material === dark.colours.material) {
        throw new Error(`${context} light and dark palettes are not materially distinct.`)
    }
    if (projectBefore !== dark.projectDocument) {
        throw new Error(`${context} theme switching changed Project state.`)
    }

    const darkProjectMenu = context === "studio"
        ? await verifyDarkProjectMenu(window, outputDirectory)
        : null
    if (darkProjectMenu) captures["theme-studio-dark-project-menu"] = darkProjectMenu.screenshot

    let persistence = null
    if (options.verifyPersistence) {
        await reload(window)
        const persisted = await readThemeSnapshot(window, context)
        assertThemeSnapshot(persisted, "dark", `${context} reload`)
        persistence = { theme: persisted.theme, source: persisted.source, stored: persisted.stored }
    }

    await window.webContents.executeJavaScript(`(() => {
        const text = "light"
        localStorage.setItem(${JSON.stringify(THEME_KEY)}, text)
        window.dispatchEvent(new StorageEvent("storage", {
            key: ${JSON.stringify(THEME_KEY)},
            newValue: text,
            storageArea: localStorage,
        }))
    })()`)
    await new Promise((resolve) => setTimeout(resolve, 60))
    const storageSync = await readThemeSnapshot(window, context)
    assertThemeSnapshot(storageSync, "light", `${context} storage sync`)

    const projectAfter = await window.webContents.executeJavaScript(`localStorage.getItem(${JSON.stringify(PROJECT_KEY)})`)
    if (projectBefore !== projectAfter) throw new Error(`${context} theme verification changed Project state.`)

    return {
        context,
        system,
        persistence,
        storageSync: {
            theme: storageSync.theme,
            source: storageSync.source,
            stored: storageSync.stored,
        },
        maximumLayoutShift,
        light,
        dark,
        darkProjectMenu,
        captures,
    }
}

module.exports = { verifyThemeModes }
