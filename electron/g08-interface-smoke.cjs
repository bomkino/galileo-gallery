const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

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

async function capture(window, outputDirectory, name) {
    const image = await window.webContents.capturePage()
    const png = image.toPNG()
    const file = path.join(outputDirectory, `${name}.png`)
    fs.writeFileSync(file, png)
    return { file: path.basename(file), bytes: png.length, sha256: sha256(png), size: image.getSize() }
}

async function readMetrics(window) {
    return window.webContents.executeJavaScript(`(() => {
        const rect = (selector) => {
            const element = document.querySelector(selector)
            if (!element) throw new Error('Missing interface element: ' + selector)
            const box = element.getBoundingClientRect()
            return { width: box.width, height: box.height }
        }
        const scaleRoot = document.querySelector('[data-interface-scale]')
        const stage = rect('.stage-shell')
        const focusTarget = document.querySelector('.title-actions .button.primary')
        focusTarget.focus()
        const focusStyle = getComputedStyle(focusTarget)
        const manifest = JSON.parse(localStorage.getItem('galileo-gallery:local-presentation:v1'))
        return {
            interfaceScale: Number(scaleRoot.dataset.interfaceScale),
            surfaceTransform: getComputedStyle(document.querySelector('.interface-scale-surface')).transform,
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

async function setScale(window, target) {
    await window.webContents.executeJavaScript(`(async () => {
        const group = document.querySelector('.interface-scale-control')
        const increase = group.querySelector('button:last-child')
        const decrease = group.querySelector('button:first-child')
        for (let guard = 0; guard < 30; guard += 1) {
            const current = Number(document.querySelector('[data-interface-scale]').dataset.interfaceScale)
            if (current === ${target}) return
            ;(current < ${target} ? increase : decrease).click()
            await new Promise((resolve) => setTimeout(resolve, 35))
        }
        throw new Error('Interface Scale did not reach ${target}%.')
    })()`)
    await waitFor(window, `document.querySelector('[data-interface-scale]')?.dataset.interfaceScale === '${target}'`, `${target}% Interface Scale`)
}

async function runG08InterfaceSmoke(window, outputDirectory) {
    fs.mkdirSync(outputDirectory, { recursive: true })
    await waitFor(window, `document.querySelector('.style-gallery-shell')`, "scene catalogue")
    await setScale(window, 100)
    const catalogue = await capture(window, outputDirectory, "gallery-catalogue-100")

    await window.webContents.executeJavaScript(`document.querySelector('button[data-style-id="opening-reel"]')?.click()`)
    await waitFor(window, `document.querySelector('.app-shell')`, "Gallery studio")
    await waitFor(window, `!document.querySelector('.launch-screen')`, "launch transition", 15_000)

    // Exercise Figma-like keyboard scaling and make the default an explicit persisted choice.
    await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true }))`)
    await waitFor(window, `document.querySelector('[data-interface-scale]')?.dataset.interfaceScale === '105'`, "keyboard scale increase")
    await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true }))`)
    await waitFor(window, `document.querySelector('[data-interface-scale]')?.dataset.interfaceScale === '100'`, "keyboard scale reset")
    const studio100 = await capture(window, outputDirectory, "gallery-studio-100")
    const at100 = await readMetrics(window)
    await setScale(window, 150)
    const studio150 = await capture(window, outputDirectory, "gallery-studio-150")
    const at150 = await readMetrics(window)

    if (at100.interfaceScale !== 100 || at150.interfaceScale !== 150) throw new Error("Interface Scale state did not match the rendered shell.")
    if (at100.manifest.interfaceScale !== 100 || at150.manifest.interfaceScale !== 150) throw new Error("Interface Scale was not persisted locally.")
    if (at100.preview.metadata !== at150.preview.metadata || at100.preview.timelineMax !== at150.preview.timelineMax) {
        throw new Error("Interface Scale changed project-facing preview metadata.")
    }
    if (Math.abs(at100.preview.ratio - at150.preview.ratio) > 0.002) throw new Error("Interface Scale changed the preview canvas ratio.")
    if (Object.values(at100.targets).some((target) => target.height < 44)) throw new Error("A primary interface target is smaller than 44px.")
    if (Object.values(at150.targets).some((target) => target.height < 66)) throw new Error("A 150% interface target did not scale physically.")
    if (at100.focus.outlineStyle === "none" || parseFloat(at100.focus.outlineWidth) < 2) throw new Error("Keyboard focus treatment is not visible.")

    await setScale(window, 100)
    const receipt = {
        task: "G08 interface presentation smoke",
        source: {
            sha: process.env.GALLERY_SOURCE_SHA ?? null,
            tree: process.env.GALLERY_SOURCE_TREE ?? null,
        },
        captures: { catalogue, studio100, studio150 },
        metrics: { at100, at150 },
        resetScale: Number(await window.webContents.executeJavaScript(`document.querySelector('[data-interface-scale]').dataset.interfaceScale`)),
    }
    fs.writeFileSync(path.join(outputDirectory, "renderer-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`)
    console.log(JSON.stringify({ receipt: path.join(outputDirectory, "renderer-receipt.json"), captures: receipt.captures }))
}

module.exports = { runG08InterfaceSmoke }
