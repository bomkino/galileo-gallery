const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const zlib = require("node:zlib")

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function sha256(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex")
}

function paeth(left, up, upperLeft) {
    const estimate = left + up - upperLeft
    const leftDistance = Math.abs(estimate - left)
    const upDistance = Math.abs(estimate - up)
    const upperLeftDistance = Math.abs(estimate - upperLeft)
    return leftDistance <= upDistance && leftDistance <= upperLeftDistance ? left : upDistance <= upperLeftDistance ? up : upperLeft
}

function alphaStats(png) {
    const signature = png.subarray(0, 8).toString("hex")
    if (signature !== "89504e470d0a1a0a") throw new Error("Alpha capture was not a PNG.")
    let width = 0
    let height = 0
    let bitDepth = 0
    let colorType = 0
    let interlace = 0
    const compressed = []
    for (let offset = 8; offset < png.length;) {
        const length = png.readUInt32BE(offset)
        const type = png.subarray(offset + 4, offset + 8).toString("ascii")
        const data = png.subarray(offset + 8, offset + 8 + length)
        if (type === "IHDR") {
            width = data.readUInt32BE(0)
            height = data.readUInt32BE(4)
            bitDepth = data[8]
            colorType = data[9]
            interlace = data[12]
        }
        if (type === "IDAT") compressed.push(data)
        offset += 12 + length
        if (type === "IEND") break
    }
    if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error(`Unsupported alpha PNG encoding: depth=${bitDepth}, color=${colorType}, interlace=${interlace}.`)
    }
    const bytesPerPixel = 4
    const rowBytes = width * bytesPerPixel
    const filtered = zlib.inflateSync(Buffer.concat(compressed))
    if (filtered.length !== (rowBytes + 1) * height) throw new Error("Alpha PNG scanline size is invalid.")
    const bitmap = Buffer.alloc(rowBytes * height)
    for (let row = 0; row < height; row += 1) {
        const sourceOffset = row * (rowBytes + 1)
        const targetOffset = row * rowBytes
        const filter = filtered[sourceOffset]
        for (let column = 0; column < rowBytes; column += 1) {
            const raw = filtered[sourceOffset + 1 + column]
            const left = column >= bytesPerPixel ? bitmap[targetOffset + column - bytesPerPixel] : 0
            const up = row > 0 ? bitmap[targetOffset + column - rowBytes] : 0
            const upperLeft = row > 0 && column >= bytesPerPixel ? bitmap[targetOffset + column - rowBytes - bytesPerPixel] : 0
            const reconstructed = filter === 0 ? raw
                : filter === 1 ? raw + left
                : filter === 2 ? raw + up
                : filter === 3 ? raw + Math.floor((left + up) / 2)
                : filter === 4 ? raw + paeth(left, up, upperLeft)
                : NaN
            if (!Number.isFinite(reconstructed)) throw new Error(`Unsupported PNG filter ${filter}.`)
            bitmap[targetOffset + column] = reconstructed & 0xff
        }
    }
    let transparent = 0
    let contaminatedTransparent = 0
    let partial = 0
    let opaque = 0
    for (let index = 3; index < bitmap.length; index += 4) {
        const alpha = bitmap[index]
        if (alpha === 0) {
            transparent += 1
            if (bitmap[index - 3] !== 0 || bitmap[index - 2] !== 0 || bitmap[index - 1] !== 0) contaminatedTransparent += 1
        }
        else if (alpha === 255) opaque += 1
        else partial += 1
    }
    return { transparent, contaminatedTransparent, partial, opaque, total: bitmap.length / 4 }
}

async function focusJourney(window) {
    window.show()
    window.focus()
    window.webContents.focus()
    await window.webContents.executeJavaScript(`document.querySelector('[data-g02-action="fixture"]')?.focus()`)
    const trace = []
    for (let index = 0; index < 8; index += 1) {
        trace.push(await window.webContents.executeJavaScript(`(() => {
            const node = document.activeElement
            return {
                tag: node?.tagName?.toLowerCase() ?? "",
                action: node?.dataset?.g02Action ?? "",
                control: node?.dataset?.g02Control ?? "",
                frame: node?.closest?.('[data-g02-frame-id]')?.dataset?.g02FrameId ?? "",
                text: node?.textContent?.trim().slice(0, 80) ?? "",
            }
        })()`))
        window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" })
        window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" })
        await wait(35)
    }
    return trace
}

async function runG02RendererSmoke(window, outputDirectory) {
    fs.mkdirSync(outputDirectory, { recursive: true })

    const journey = await window.webContents.executeJavaScript(`(async () => {
        const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
        const settle = async () => {
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            await wait(30)
        }
        const root = () => document.querySelector('[data-g02-tracer="quiet-carousel-v1"]')
        const required = (selector) => {
            const node = document.querySelector(selector)
            if (!node) throw new Error('Missing renderer smoke selector: ' + selector)
            return node
        }
        const click = async (selector) => {
            required(selector).click()
            await settle()
        }
        const setInput = async (selector, value) => {
            const input = required(selector)
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value))
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
            await settle()
        }
        const state = () => ({ ...root().dataset })
        const visibleFrameGeometry = () => {
            const node = Array.from(document.querySelectorAll('[data-g02-stage-frame]')).find((candidate) => getComputedStyle(candidate).visibility !== 'hidden')
            if (!node) throw new Error('No visible Stage frame available for control diagnostics.')
            const rect = node.getBoundingClientRect()
            return { width: rect.width, height: rect.height, transform: getComputedStyle(node).transform }
        }

        for (let attempt = 0; attempt < 100 && !root(); attempt += 1) await wait(50)
        if (!root()) throw new Error('Quiet Carousel tracer did not mount.')
        if (state().playing === 'true') await click('[data-g02-action="play"]')

        await click('[data-g02-action="fixture"]')
        if (state().frameCount !== '8') throw new Error('Fixture did not retain eight ordered frames.')

        const order = Array.from(document.querySelectorAll('[data-g02-frame-id]')).map((node) => node.dataset.g02FrameId)
        await click('[data-g02-ratio="portrait"]')
        await click('[data-g02-axis="vertical"]')
        await click('[data-g02-direction="reverse"]')
        const beforeFrameSize = visibleFrameGeometry()
        await setInput('[data-g02-control="frame-size"]', 64)
        const afterFrameSize = visibleFrameGeometry()
        const beforeGap = visibleFrameGeometry()
        await setInput('[data-g02-control="gap"]', 144)
        const afterGap = visibleFrameGeometry()
        await setInput('[data-g02-control="pace"]', 1000)
        const beforeDepth = visibleFrameGeometry()
        await setInput('[data-g02-control="depth"]', 24)
        const afterDepth = visibleFrameGeometry()
        await click('[data-g02-fit="cover"]')
        await click('[data-g02-background="transparent"]')

        const modes = []
        await click('[data-g02-timeline-mode="automatic"]')
        modes.push({ mode: state().timelineMode, durationMs: Number(state().timelineDurationMs) })
        await click('[data-g02-timeline-mode="fixed-duration"]')
        await setInput('[data-g02-control="fixed-duration"]', 14500)
        modes.push({ mode: state().timelineMode, durationMs: Number(state().timelineDurationMs) })
        await click('[data-g02-timeline-mode="directed"]')
        modes.push({ mode: state().timelineMode, durationMs: Number(state().timelineDurationMs) })

        await click('[data-g02-action="save"]')
        const storageBytes = localStorage.getItem('galileo-gallery-g02-quiet-carousel-v1')?.length ?? 0
        await click('[data-g02-action="reset"]')
        await click('[data-g02-action="reload"]')
        const reloaded = state()
        const notice = required('[role="status"]').textContent.trim()

        const playhead = required('[data-g02-control="playhead"]')
        await setInput('[data-g02-control="playhead"]', Math.round(Number(playhead.max) * 0.37))
        const scrubbed = state()

        const visibleFrame = () => Array.from(document.querySelectorAll('[data-g02-stage-frame]')).find((node) => getComputedStyle(node).visibility !== 'hidden')
        const beforeNode = visibleFrame()
        const motionFrameId = beforeNode?.dataset.g02StageFrame ?? ''
        const beforeMotion = { frameId: motionFrameId, timeMs: Number(state().timeMs), transform: beforeNode ? getComputedStyle(beforeNode).transform : '' }
        await click('[data-g02-action="play"]')
        await wait(750)
        const afterNode = document.querySelector('[data-g02-stage-frame="' + CSS.escape(motionFrameId) + '"]')
        const afterMotion = { frameId: afterNode?.dataset.g02StageFrame ?? '', timeMs: Number(state().timeMs), transform: afterNode ? getComputedStyle(afterNode).transform : '' }
        await click('[data-g02-action="play"]')

        const sourceImages = Array.from(document.querySelectorAll('.qc-frames img'))
        await Promise.all(sourceImages.map((image) => image.decode().catch(() => undefined)))
        const decodedSources = sourceImages.map((image, index) => ({
            id: order[index],
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            sourceRatio: image.naturalWidth / image.naturalHeight,
        }))
        const stageImage = visibleFrame()?.querySelector('img')
        if (!stageImage) throw new Error('No visible decoded Stage image was available.')
        const sourceTreatment = {
            opacity: getComputedStyle(stageImage).opacity,
            filter: getComputedStyle(stageImage).filter,
            mixBlendMode: getComputedStyle(stageImage).mixBlendMode,
            objectFit: getComputedStyle(stageImage).objectFit,
        }
        const stage = required('[data-g02-stage="canvas"]')
        const stageRect = stage.getBoundingClientRect()
        return {
            order,
            controlEffects: { beforeFrameSize, afterFrameSize, beforeGap, afterGap, beforeDepth, afterDepth },
            modes,
            storageBytes,
            reloaded,
            notice,
            scrubbed,
            beforeMotion,
            afterMotion,
            decodedSources,
            sourceTreatment,
            stage: { width: stageRect.width, height: stageRect.height },
            nodeCount: document.getElementsByTagName('*').length,
            userAgent: navigator.userAgent,
        }
    })()`)

    const focus = await focusJourney(window)
    const interfaceImage = await window.webContents.capturePage()
    const interfacePNG = interfaceImage.toPNG()
    const interfacePath = path.join(outputDirectory, "quiet-carousel-ui.png")
    fs.writeFileSync(interfacePath, interfacePNG)

    await window.webContents.executeJavaScript(`(() => {
        document.documentElement.dataset.g02AlphaCapture = 'true'
        document.querySelector('[data-g02-background="transparent"]')?.click()
    })()`)
    await wait(180)
    const alphaImage = await window.webContents.capturePage()
    const alphaPNG = alphaImage.toPNG()
    const alphaPath = path.join(outputDirectory, "quiet-carousel-alpha.png")
    fs.writeFileSync(alphaPath, alphaPNG)

    const failedMedia = await window.webContents.executeJavaScript(`(async () => {
        document.documentElement.removeAttribute('data-g02-alpha-capture')
        const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
        const frame = Array.from(document.querySelectorAll('[data-g02-stage-frame]')).find((node) => getComputedStyle(node).visibility !== 'hidden')
        const image = frame?.querySelector('img')
        if (!image) throw new Error('No visible Stage image available for failed-media journey.')
        image.dispatchEvent(new Event('error', { bubbles: true }))
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        await wait(30)
        return Number(document.querySelector('[data-g02-tracer]')?.dataset.failedMedia ?? 0)
    })()`)
    journey.failedMedia = failedMedia
    const failureImage = await window.webContents.capturePage()
    const failurePNG = failureImage.toPNG()
    const failurePath = path.join(outputDirectory, "quiet-carousel-failed-media.png")
    fs.writeFileSync(failurePath, failurePNG)

    const receipt = {
        schema: "galileo-gallery-g02-renderer-receipt-v1",
        capturedAt: new Date().toISOString(),
        platform: process.platform,
        architecture: process.arch,
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        journey,
        keyboardFocus: focus,
        captures: {
            interface: {
                file: path.basename(interfacePath),
                bytes: interfacePNG.length,
                sha256: sha256(interfacePNG),
                size: interfaceImage.getSize(),
            },
            alpha: {
                file: path.basename(alphaPath),
                bytes: alphaPNG.length,
                sha256: sha256(alphaPNG),
                size: alphaImage.getSize(),
                pixels: alphaStats(alphaPNG),
            },
            failedMedia: {
                file: path.basename(failurePath),
                bytes: failurePNG.length,
                sha256: sha256(failurePNG),
                size: failureImage.getSize(),
            },
        },
    }
    fs.writeFileSync(path.join(outputDirectory, "renderer-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`)
    console.log(JSON.stringify({
        receipt: path.join(outputDirectory, "renderer-receipt.json"),
        interfaceSha256: receipt.captures.interface.sha256,
        alphaSha256: receipt.captures.alpha.sha256,
        transparentPixels: receipt.captures.alpha.pixels.transparent,
    }))
}

module.exports = { runG02RendererSmoke }
