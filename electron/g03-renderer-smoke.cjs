const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex")

async function runG03RendererSmoke(window, outputDirectory, mode) {
    fs.mkdirSync(outputDirectory, { recursive: true })
    const journey = await window.webContents.executeJavaScript(`(async () => {
        const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
        const required = (selector) => {
            const node = document.querySelector(selector)
            if (!node) throw new Error('Missing G03 selector: ' + selector)
            return node
        }
        const waitFor = async (predicate, label) => {
            for (let attempt = 0; attempt < 160; attempt += 1) {
                const value = predicate()
                if (value) return value
                await wait(50)
            }
            throw new Error('Timed out waiting for ' + label)
        }
        await waitFor(() => document.querySelector('[data-g02-tracer="quiet-carousel-v1"]'), 'Quiet Carousel')
        const notice = () => required('[role="status"]').textContent.trim()
        const click = (selector) => required(selector).click()
        const mode = ${JSON.stringify(mode)}
        if (!window.galleryHost) throw new Error('Frozen Gallery HostPort was not exposed.')
        const identity = await window.galleryHost.identity()
        if (mode === 'save') {
            click('[data-g02-action="fixture"]')
            await waitFor(() => /source frame/.test(notice()), 'opaque media import')
            click('[data-g02-ratio="vertical"]')
            click('[data-g02-axis="vertical"]')
            click('[data-g02-action="save"]')
            await waitFor(() => /Saved portable Project/.test(notice()), 'portable Project save')
        } else {
            click('[data-g02-action="reload"]')
            await waitFor(() => /Opened portable Project/.test(notice()), 'portable Project reopen')
        }
        const root = required('[data-g02-tracer="quiet-carousel-v1"]')
        const mediaURLs = Array.from(document.querySelectorAll('.qc-frames img')).map((image) => image.src)
        await Promise.all(Array.from(document.querySelectorAll('.qc-frames img')).map((image) => image.decode()))
        const child = window.open('https://attacker.example/', '_blank')
        const remoteFetchBlocked = await fetch('https://attacker.example/tracker').then(() => false, () => true)
        const rawMediaBlocked = await fetch('reel-media://file/' + 'YXR0YWNr').then(() => false, () => true)
        const permissionState = await navigator.permissions.query({ name: 'camera' }).then((value) => value.state, () => 'denied')
        const download = document.createElement('a')
        download.href = 'data:text/plain,g03-download-must-not-land'
        download.download = 'g03-denied.txt'
        document.body.append(download)
        download.click()
        download.remove()
        const navigation = document.createElement('a')
        navigation.href = 'https://attacker.example/navigation'
        document.body.append(navigation)
        navigation.click()
        navigation.remove()
        await wait(120)
        const securedIdentity = await window.galleryHost.identity()
        return {
            mode,
            identity: securedIdentity,
            notice: notice(),
            frameCount: Number(root.dataset.frameCount),
            canvas: root.dataset.canvas,
            axis: root.dataset.axis,
            mediaURLs,
            rawPathVisible: document.documentElement.outerHTML.includes(${JSON.stringify(process.env.REEL_G03_MEDIA_SOURCES ?? "__no-source__")}),
            storageBytes: JSON.stringify(localStorage).length,
            nodeAccess: { process: typeof window.process, require: typeof window.require },
            popupDenied: child === null,
            remoteFetchBlocked,
            rawMediaBlocked,
            permissionState,
            location: window.location.href,
        }
    })()`)
    await wait(120)
    const image = await window.webContents.capturePage()
    const png = image.toPNG()
    const screenshot = path.join(outputDirectory, `g03-${mode}.png`)
    fs.writeFileSync(screenshot, png)
    const receipt = {
        schema: "galileo-gallery-g03-renderer-receipt-v1",
        capturedAt: new Date().toISOString(),
        platform: process.platform,
        architecture: process.arch,
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        journey,
        capture: { file: path.basename(screenshot), bytes: png.length, sha256: sha256(png), size: image.getSize() },
    }
    fs.writeFileSync(path.join(outputDirectory, `renderer-${mode}.json`), `${JSON.stringify(receipt, null, 2)}\n`)
    console.log(JSON.stringify({ mode, receipt: path.join(outputDirectory, `renderer-${mode}.json`), screenshotSha256: receipt.capture.sha256 }))
}

module.exports = { runG03RendererSmoke }
