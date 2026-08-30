const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { app, nativeImage, session } = require("electron")
const { assertNoPrivateEvidence } = require("./g11-vitrine-smoke.cjs")

const evidenceFs = process.versions.electron ? require("original-fs") : fs
const PROJECT_KEY = "galileo-gallery-project-v1"
const GRANT = /^reel-media:\/\/grant\/[a-f0-9]{64}$/
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex")

function capturePathAuthority(resolved) {
    const root = path.parse(resolved).root
    const chain = []
    let current = root
    for (const part of resolved.slice(root.length).split(path.sep).filter(Boolean).slice(0, -1)) {
        current = path.join(current, part)
        const stat = evidenceFs.lstatSync(current)
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Light Table evidence ancestor is not an exact directory.")
        chain.push({ path: current, dev: stat.dev, ino: stat.ino })
    }
    return chain
}

function verifyPathAuthority(resolved, chain) {
    for (const expected of chain) {
        const stat = evidenceFs.lstatSync(expected.path)
        if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== expected.dev || stat.ino !== expected.ino) throw new Error("Light Table evidence ancestor changed during hashing.")
    }
    const realpath = evidenceFs.realpathSync.native ?? evidenceFs.realpathSync
    if (realpath(resolved) !== resolved) throw new Error("Light Table evidence path contains a symbolic link.")
}

function fileEvidence(file) {
    const resolved = path.resolve(file)
    const authority = capturePathAuthority(resolved)
    verifyPathAuthority(resolved, authority)
    const linked = evidenceFs.lstatSync(resolved)
    if (!linked.isFile() || linked.isSymbolicLink() || linked.size < 1) throw new Error("Light Table package evidence is not an exact regular file.")
    const descriptor = evidenceFs.openSync(resolved, evidenceFs.constants.O_RDONLY | (evidenceFs.constants.O_NOFOLLOW ?? 0))
    const hash = crypto.createHash("sha256")
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let bytes = 0
    try {
        const before = evidenceFs.fstatSync(descriptor)
        if (before.dev !== linked.dev || before.ino !== linked.ino || before.size !== linked.size || before.mtimeMs !== linked.mtimeMs || before.ctimeMs !== linked.ctimeMs) throw new Error("Light Table package evidence changed before hashing.")
        for (;;) {
            const count = evidenceFs.readSync(descriptor, buffer, 0, buffer.length, null)
            if (!count) break
            hash.update(buffer.subarray(0, count))
            bytes += count
        }
        const after = evidenceFs.fstatSync(descriptor)
        const finalLink = evidenceFs.lstatSync(resolved)
        if (bytes !== before.size || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
            || finalLink.dev !== before.dev || finalLink.ino !== before.ino || finalLink.size !== before.size || finalLink.mtimeMs !== before.mtimeMs || finalLink.ctimeMs !== before.ctimeMs) throw new Error("Light Table package evidence changed while hashing.")
        verifyPathAuthority(resolved, authority)
        return { bytes, sha256: hash.digest("hex"), uid: before.uid, mode: before.mode & 0o7777 }
    } finally {
        evidenceFs.closeSync(descriptor)
    }
}

function exactTreeEvidence(directory) {
    const resolved = path.resolve(directory)
    if (!evidenceFs.existsSync(resolved)) return { exists: false, directories: 0, files: 0, bytes: 0, sha256: sha256("") }
    const root = evidenceFs.lstatSync(resolved)
    if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Light Table resource tree is unsafe.")
    const rows = []
    let directories = 0
    let files = 0
    let bytes = 0
    const walk = (current, relative) => {
        for (const entry of evidenceFs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
            const target = path.join(current, entry.name)
            const linked = evidenceFs.lstatSync(target)
            if (linked.isSymbolicLink()) throw new Error("Light Table resource tree contains a symbolic link.")
            const name = relative ? `${relative}/${entry.name}` : entry.name
            if (linked.isDirectory()) {
                directories += 1
                rows.push(["directory", name, linked.mode & 0o7777])
                walk(target, name)
            } else if (linked.isFile()) {
                const evidence = fileEvidence(target)
                files += 1
                bytes += evidence.bytes
                rows.push(["file", name, evidence.bytes, evidence.sha256, linked.mode & 0o7777])
            } else throw new Error("Light Table resource tree contains a special file.")
        }
    }
    walk(resolved, "")
    return { exists: true, directories, files, bytes, sha256: sha256(JSON.stringify(rows)) }
}

function acceptedRootEvidence() {
    const parent = path.join(app.getPath("userData"), "opened-project-media")
    const entries = evidenceFs.existsSync(parent)
        ? evidenceFs.readdirSync(parent, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && /^open-[a-f0-9-]{36}$/.test(entry.name))
        : []
    if (entries.length !== 1) throw new Error(`Light Table expected one accepted Project root, observed ${entries.length}.`)
    const target = path.join(parent, entries[0].name)
    const linked = evidenceFs.lstatSync(target)
    return { target, device: linked.dev, inode: linked.ino, tree: exactTreeEvidence(target) }
}

function stagingEvidence() {
    const evidence = exactTreeEvidence(path.join(app.getPath("userData"), "project-import-staging"))
    if (evidence.files || evidence.directories) throw new Error("Light Table Project import staging was not empty.")
    return evidence
}

async function until(window, expression, label, timeoutMs = 45_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return
        await wait(60)
    }
    throw new Error(`Light Table smoke timed out waiting for ${label}.`)
}

async function clickText(window, selector, text) {
    const clicked = await window.webContents.executeJavaScript(`(() => {
        const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find((candidate) => candidate.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))
        if (!element || element.disabled) return false
        element.click()
        return true
    })()`)
    if (!clicked) throw new Error(`Light Table smoke could not click ${text}.`)
}

async function projectAction(window, text, notice) {
    await clickText(window, ".project-menu summary", "Project")
    await clickText(window, ".project-menu button", text)
    await until(window, `document.querySelector('.autosave-status')?.textContent.includes(${JSON.stringify(notice)})`, notice)
    return window.webContents.executeJavaScript("document.querySelector('.autosave-status').textContent.trim()")
}

async function scrub(window, normalized) {
    await window.webContents.executeJavaScript(`(async () => {
        const timeline = document.querySelector('.timeline')
        if (!timeline) throw new Error('Light Table Timeline scrubber is unavailable.')
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(timeline, ${JSON.stringify(String(normalized))})
        timeline.dispatchEvent(new Event('input', { bubbles: true }))
        timeline.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })()`)
    await wait(100)
}

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical)
    if (!value || typeof value !== "object") return value
    return Object.keys(value).sort().reduce((result, key) => {
        result[key] = canonical(value[key])
        return result
    }, {})
}

function runtimeProjectEvidence(raw) {
    const project = JSON.parse(raw)
    const grants = []
    const ordinals = new Map()
    const scrubGrants = (value) => {
        if (typeof value === "string" && GRANT.test(value)) {
            grants.push(value)
            if (!ordinals.has(value)) ordinals.set(value, ordinals.size + 1)
            return `grant-${ordinals.get(value)}`
        }
        if (Array.isArray(value)) return value.map(scrubGrants)
        if (!value || typeof value !== "object") return value
        return Object.keys(value).sort().reduce((result, key) => { result[key] = scrubGrants(value[key]); return result }, {})
    }
    const scrubbed = scrubGrants(project)
    return {
        project,
        ids: project.items.map((item) => item.id),
        grantCount: new Set(grants).size,
        grantDigest: sha256([...new Set(grants)].sort().join("\n")),
        semanticSha256: sha256(JSON.stringify(canonical(scrubbed))),
    }
}

async function currentProject(window) {
    const raw = await window.webContents.executeJavaScript(`localStorage.getItem(${JSON.stringify(PROJECT_KEY)})`)
    if (!raw) throw new Error("Light Table runtime Project was absent.")
    return { raw, evidence: runtimeProjectEvidence(raw) }
}

function archiveEvidence(file) {
    return fileEvidence(file)
}

async function packageEvidence(window) {
    const identity = await window.webContents.executeJavaScript("window.galleryHost.identity()")
    const preferences = window.webContents.getLastWebPreferences()
    const rendererSecurity = {
        contextIsolation: preferences.contextIsolation,
        nodeIntegration: preferences.nodeIntegration,
        sandbox: preferences.sandbox,
        partition: identity.rendererSecurity?.partition,
    }
    if (identity.productId !== "galileo-gallery" || identity.profile !== "g03-linux-host-port" || identity.packaged !== true
        || identity.sourceSha !== process.env.GALLERY_SOURCE_SHA || identity.sourceTree !== process.env.GALLERY_SOURCE_TREE
        || identity.platform !== "linux" || identity.architecture !== process.arch || identity.appVersion !== require("../package.json").version
        || JSON.stringify(rendererSecurity) !== JSON.stringify({ contextIsolation: true, nodeIntegration: false, sandbox: true, partition: "persist:galileo-gallery-g03" })
        || window.webContents.session !== session.fromPartition("persist:galileo-gallery-g03")) throw new Error("Light Table packaged host identity is wrong.")
    const executable = fileEvidence(process.execPath)
    const appAsar = fileEvidence(path.join(process.resourcesPath, "app.asar"))
    const ffmpeg = fileEvidence(path.join(process.resourcesPath, "ffmpeg", "ffmpeg"))
    const sandboxHelper = fileEvidence(path.join(path.dirname(process.execPath), "chrome-sandbox"))
    if (sandboxHelper.uid !== 0 || sandboxHelper.mode !== 0o4755) throw new Error("Light Table Chromium sandbox helper is not root-owned mode 4755.")
    for (const [label, evidence, expected] of [
        ["executable", executable, process.env.LIGHT_TABLE_EXPECTED_EXECUTABLE_SHA],
        ["app.asar", appAsar, process.env.LIGHT_TABLE_EXPECTED_APP_ASAR_SHA],
        ["FFmpeg", ffmpeg, process.env.LIGHT_TABLE_EXPECTED_FFMPEG_SHA],
        ["sandbox helper", sandboxHelper, process.env.LIGHT_TABLE_EXPECTED_SANDBOX_SHA],
    ]) if (expected && evidence.sha256 !== expected) throw new Error(`Light Table ${label} digest is wrong.`)
    return {
        productId: identity.productId,
        profile: identity.profile,
        sourceSha: identity.sourceSha,
        sourceTree: identity.sourceTree,
        buildId: identity.buildId,
        packaged: identity.packaged,
        platform: identity.platform,
        architecture: identity.architecture,
        appVersion: identity.appVersion,
        runtime: identity.runtime,
        rendererSecurity,
        executable,
        appAsar,
        ffmpeg,
        sandboxHelper,
    }
}

async function installResourceTracker(window) {
    await window.webContents.executeJavaScript(`(() => {
        if (window.__lightTableResources) throw new Error('Light Table resource tracker already exists.')
        const createElement = document.createElement
        const createObjectURL = URL.createObjectURL.bind(URL)
        const revokeObjectURL = URL.revokeObjectURL.bind(URL)
        const videos = new Set(document.querySelectorAll('video'))
        const retired = new Set()
        const blobs = new Set()
        let createdBlobs = 0
        let revokedBlobs = 0
        let maxConnectedOwners = 0
        document.createElement = function(name, options) {
            const node = createElement.call(this, name, options)
            if (String(name).toLowerCase() === 'video') videos.add(node)
            return node
        }
        URL.createObjectURL = function(value) {
            const url = createObjectURL(value)
            blobs.add(url)
            createdBlobs += 1
            return url
        }
        URL.revokeObjectURL = function(url) {
            if (blobs.delete(url)) revokedBlobs += 1
            return revokeObjectURL(url)
        }
        const owns = (video) => Boolean(video.getAttribute('src') || video.currentSrc)
        const sample = () => {
            let connectedOwners = 0
            for (const video of videos) {
                if (video.isConnected && owns(video)) connectedOwners += 1
                if (!video.isConnected) retired.add(video)
            }
            maxConnectedOwners = Math.max(maxConnectedOwners, connectedOwners)
        }
        const observer = new MutationObserver(sample)
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
        const timer = setInterval(sample, 4)
        window.__lightTableResources = {
            result() {
                sample()
                const owned = [...videos].filter(owns)
                return {
                    createdVideos: videos.size,
                    connectedOwners: owned.filter((video) => video.isConnected).length,
                    totalOwners: owned.length,
                    retiredVideos: retired.size,
                    retiredOwned: [...retired].filter(owns).length,
                    maxConnectedOwners,
                    createdBlobs,
                    revokedBlobs,
                    activeBlobs: blobs.size,
                }
            },
            stop() {
                clearInterval(timer)
                observer.disconnect()
                document.createElement = createElement
                URL.createObjectURL = createObjectURL
                URL.revokeObjectURL = revokeObjectURL
            },
        }
    })()`)
}

async function resourceState(window) {
    return window.webContents.executeJavaScript("window.__lightTableResources.result()")
}

async function videoOwnerSamples(window) {
    const samples = await window.webContents.executeJavaScript(`(() => [...document.querySelectorAll('video[data-video-source-owner="true"]')].map((video) => {
        const canvas = document.createElement('canvas')
        canvas.width = 12
        canvas.height = 9
        const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
        try { context.drawImage(video, 0, 0, 12, 9) } catch { return null }
        const pixels = context.getImageData(0, 0, 12, 9).data
        return {
            id: video.closest('.light-table-plane')?.dataset.mediaId,
            target: video.dataset.storyTarget,
            currentTime: video.currentTime,
            readyState: video.readyState,
            pixelsBase64: btoa(String.fromCharCode(...pixels)),
        }
    }).filter(Boolean))()`)
    return samples.map((sample) => {
        const pixels = Buffer.from(sample.pixelsBase64, "base64")
        if (pixels.length !== 12 * 9 * 4) throw new Error("Light Table compact owner sample is invalid.")
        return { id: sample.id, target: sample.target, currentTime: sample.currentTime, readyState: sample.readyState, digest: sha256(pixels) }
    })
}

async function currentPosterSamples(window, ids) {
    const samples = await window.webContents.executeJavaScript(`(() => ${JSON.stringify(ids)}.map((id) => {
        const plane = [...document.querySelectorAll('.light-table-plane')].find((candidate) => candidate.dataset.mediaId === id)
        const image = plane?.querySelector('img[data-story-poster="true"][data-story-ready="true"]')
        if (!image?.complete || image.naturalWidth < 1 || image.naturalHeight < 1) return null
        const canvas = document.createElement('canvas')
        canvas.width = 12
        canvas.height = 9
        const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
        try { context.drawImage(image, 0, 0, 12, 9) } catch { return null }
        const pixels = context.getImageData(0, 0, 12, 9).data
        return { id, target: image.dataset.storyTarget, pixelsBase64: btoa(String.fromCharCode(...pixels)) }
    }).filter(Boolean))()`)
    return samples.map((sample) => {
        const pixels = Buffer.from(sample.pixelsBase64, "base64")
        if (pixels.length !== 12 * 9 * 4) throw new Error("Light Table compact poster sample is invalid.")
        return { id: sample.id, target: sample.target, digest: sha256(pixels) }
    })
}

function rgb(hex) {
    return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)]
}

function colorMatches(pixels, expected) {
    let matches = 0
    for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] > 240 && Math.max(
            Math.abs(pixels[offset] - expected[0]),
            Math.abs(pixels[offset + 1] - expected[1]),
            Math.abs(pixels[offset + 2] - expected[2]),
        ) <= 38) matches += 1
    }
    return matches
}

async function planeEvidence(window) {
    const evidence = await window.webContents.executeJavaScript(`(() => {
        const stage = document.querySelector('.light-table-stage')
        if (!stage) return null
        const sample = (media) => {
            if (!media) return null
            if (media instanceof HTMLImageElement && (!media.complete || media.naturalWidth < 1)) return null
            if (media instanceof HTMLVideoElement && (media.dataset.storyReady !== 'true' || media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || media.videoWidth < 1)) return null
            const canvas = document.createElement('canvas')
            canvas.width = 12
            canvas.height = 9
            const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
            try { context.drawImage(media, 0, 0, 12, 9) } catch { return null }
            const pixels = context.getImageData(0, 0, 12, 9).data
            const pixelsBase64 = btoa(String.fromCharCode(...pixels))
            const style = getComputedStyle(media)
            return { pixelsBase64, tag: media.tagName.toLowerCase(), opacity: style.opacity, filter: style.filter, blend: style.mixBlendMode, objectFit: style.objectFit, objectPosition: style.objectPosition }
        }
        const planes = []
        for (const plane of stage.querySelectorAll('.light-table-plane')) {
            const readyVideo = plane.querySelector('video[data-story-ready="true"]')
            const image = plane.querySelector('img.light-table-media')
            const media = readyVideo || image
            const style = getComputedStyle(plane)
            planes.push({
                id: plane.dataset.mediaId,
                index: Number(plane.dataset.sourceIndex),
                sourceTimeMs: Number(plane.dataset.sourceTimeMs),
                opacity: plane.dataset.artworkOpacity,
                filter: plane.dataset.artworkFilter,
                blend: plane.dataset.artworkBlend,
                left: style.left,
                top: style.top,
                width: style.width,
                height: style.height,
                transform: style.transform,
                focused: plane.classList.contains('is-inspected'),
                media: sample(media),
            })
        }
        const stageStyle = getComputedStyle(stage)
        return {
            stage: {
                renderer: stage.dataset.lightTableRenderer,
                version: stage.dataset.sceneVersion,
                topology: stage.dataset.topology,
                opaque: stage.dataset.opaque,
                transparentSupported: stage.dataset.transparentSupported,
                underlightPlacement: stage.dataset.underlightPlacement,
                owners: Number(stage.dataset.videoSourceOwners),
                reducedMotion: stage.dataset.reducedMotion,
                background: stageStyle.backgroundColor,
            },
            planes,
        }
    })()`)
    if (!evidence) return null
    for (const plane of evidence.planes) {
        if (!plane.media) continue
        const pixels = Buffer.from(plane.media.pixelsBase64, "base64")
        if (pixels.length !== 12 * 9 * 4) throw new Error("Light Table compact pixel sample is invalid.")
        plane.media = { ...plane.media, pixels, digest: sha256(pixels) }
        delete plane.media.pixelsBase64
    }
    return evidence
}

async function captureStage(window, directory, name) {
    await wait(160)
    const bounds = await window.webContents.executeJavaScript(`(() => {
        const rect = document.querySelector('.light-table-stage').getBoundingClientRect()
        return { x: Math.max(0, Math.floor(rect.x)), y: Math.max(0, Math.floor(rect.y)), width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) }
    })()`)
    const image = await window.webContents.capturePage(bounds)
    const png = image.toPNG()
    const target = path.join(directory, `${name}.png`)
    evidenceFs.writeFileSync(target, png)
    const decoded = nativeImage.createFromBuffer(png)
    if (decoded.isEmpty()) throw new Error("Light Table screenshot did not decode.")
    const bitmap = decoded.toBitmap()
    let opaque = 0
    const colors = new Set()
    for (let offset = 0; offset < bitmap.length; offset += 4) {
        if (bitmap[offset + 3] === 255) opaque += 1
        if (offset % 128 === 0) colors.add(`${bitmap[offset]}:${bitmap[offset + 1]}:${bitmap[offset + 2]}:${bitmap[offset + 3]}`)
    }
    if (opaque !== bitmap.length / 4 || colors.size < 8) throw new Error("Light Table screenshot was not an opaque, populated pixel surface.")
    return { file: path.basename(target), bytes: png.length, sha256: sha256(png), size: decoded.getSize(), opaquePixels: opaque, sampledColors: colors.size }
}

function assertOrderedPlanes(evidence, ids) {
    if (!evidence) throw new Error("Light Table plane evidence is absent.")
    assert.deepEqual(evidence.planes.map((plane) => plane.id), ids)
    assert.deepEqual(evidence.planes.map((plane) => plane.index), ids.map((_id, index) => index))
    assert.equal(evidence.stage.renderer, "v2")
    assert.equal(evidence.stage.version, "2")
    assert.equal(evidence.stage.opaque, "true")
    assert.equal(evidence.stage.transparentSupported, "false")
    assert.equal(evidence.stage.underlightPlacement, "table-layer-below-all-artwork")
    assert.doesNotMatch(evidence.stage.background, /^rgba\([^)]*,\s*0\)$/)
    for (const plane of evidence.planes) {
        assert.equal(plane.opacity, "1")
        assert.equal(plane.filter, "none")
        assert.equal(plane.blend, "normal")
        if (plane.media) {
            assert.equal(plane.media.opacity, "1")
            assert.equal(plane.media.filter, "none")
            assert.equal(plane.media.blend, "normal")
        }
    }
}

async function setRangeGesture(window, label, values) {
    return window.webContents.executeJavaScript(`(async () => {
        const input = document.querySelector('input[type="range"][aria-label=${JSON.stringify(label)}]')
        if (!input) throw new Error('Light Table range is unavailable: ' + ${JSON.stringify(label)})
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse' }))
        for (const value of ${JSON.stringify(values)}) {
            setter.call(input, String(value))
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
            await new Promise((resolve) => requestAnimationFrame(resolve))
        }
        input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'mouse' }))
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return { value: Number(input.value), undoDepth: Number(document.documentElement.dataset.productSceneUndoDepth) }
    })()`)
}

async function undo(window) {
    await window.webContents.executeJavaScript(`(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'z', code: 'KeyZ', ctrlKey: true }))
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })()`)
}

async function controlEvidence(window) {
    await clickText(window, ".inspector-top button", "Look")
    await until(window, "document.querySelector('input[aria-label=\"Table spread\"]')", "Light Table controls")
    const initial = (await currentProject(window)).evidence.project.settings
    const tableSpread = await setRangeGesture(window, "Table spread", [0.84, 0.85, 0.86])
    assert.deepEqual(tableSpread, { value: 0.86, undoDepth: 1 })
    await undo(window)
    const groupedUndo = await window.webContents.executeJavaScript(`(() => ({
        value: Number(document.querySelector('input[aria-label="Table spread"]').value),
        undoDepth: Number(document.documentElement.dataset.productSceneUndoDepth),
        notice: document.querySelector('.autosave-status').textContent.trim(),
    }))()`)
    assert.equal(groupedUndo.value, initial.tableSpread)
    assert.equal(groupedUndo.undoDepth, 0)
    assert.match(groupedUndo.notice, /Light Table control change undone/)

    await setRangeGesture(window, "Table spread", [0.89])
    await setRangeGesture(window, "Overlap", [0.04])
    await setRangeGesture(window, "Under-light", [0.18])
    await clickText(window, '.segment[aria-label="Focus behavior"] button', "None")
    await setRangeGesture(window, "Nudge restraint", [0.07])
    await until(window, `(() => { try { const project = JSON.parse(localStorage.getItem(${JSON.stringify(PROJECT_KEY)})); return project.settings.tableSpread === 0.89 && project.settings.overlap === 0.04 && project.settings.underlightStrength === 0.18 && project.settings.focusBehavior === 'none' && project.settings.nudgeRestraint === 0.07 } catch { return false } })()`, "persisted Light Table control changes")
    const changed = (await currentProject(window)).evidence.project.settings
    assert.deepEqual({
        tableSpread: changed.tableSpread,
        overlap: changed.overlap,
        underlightStrength: changed.underlightStrength,
        focusBehavior: changed.focusBehavior,
        nudgeRestraint: changed.nudgeRestraint,
    }, { tableSpread: 0.89, overlap: 0.04, underlightStrength: 0.18, focusBehavior: "none", nudgeRestraint: 0.07 })
    assert.equal(await window.webContents.executeJavaScript("Number(document.documentElement.dataset.productSceneUndoDepth)"), 5)

    await clickText(window, "button", "Reset Light Table controls")
    await until(window, `(() => { try { const project = JSON.parse(localStorage.getItem(${JSON.stringify(PROJECT_KEY)})); return project.settings.tableSpread === 0.72 && project.settings.overlap === 0.1 && project.settings.underlightStrength === 0.42 && project.settings.focusBehavior === 'route' && project.settings.nudgeRestraint === 0.28 && project.timelineMode === 'automatic' } catch { return false } })()`, "persisted Light Table control reset")
    const resetProject = (await currentProject(window)).evidence.project
    const reset = {
        tableSpread: resetProject.settings.tableSpread,
        overlap: resetProject.settings.overlap,
        underlightStrength: resetProject.settings.underlightStrength,
        focusBehavior: resetProject.settings.focusBehavior,
        nudgeRestraint: resetProject.settings.nudgeRestraint,
        theme: resetProject.settings.theme,
        ground: resetProject.settings.ground,
        backgroundStyle: resetProject.settings.backgroundStyle,
        timelineMode: resetProject.timelineMode,
        timelineFixedDurationMs: resetProject.timelineFixedDurationMs,
        timelineSegments: resetProject.timelineSegments,
        undoDepth: await window.webContents.executeJavaScript("Number(document.documentElement.dataset.productSceneUndoDepth)"),
    }
    assert.deepEqual(reset, {
        tableSpread: 0.72,
        overlap: 0.1,
        underlightStrength: 0.42,
        focusBehavior: "route",
        nudgeRestraint: 0.28,
        theme: "light",
        ground: "#e8e6de",
        backgroundStyle: "solid",
        timelineMode: "automatic",
        timelineFixedDurationMs: 0,
        timelineSegments: [],
        undoDepth: 0,
    })
    return { initial: { tableSpread: initial.tableSpread, overlap: initial.overlap, underlightStrength: initial.underlightStrength, focusBehavior: initial.focusBehavior, nudgeRestraint: initial.nudgeRestraint }, groupedGesture: tableSpread, groupedUndo, changed: { tableSpread: changed.tableSpread, overlap: changed.overlap, underlightStrength: changed.underlightStrength, focusBehavior: changed.focusBehavior, nudgeRestraint: changed.nudgeRestraint }, reset }
}

async function clockSnapshot(window, normalized) {
    await scrub(window, normalized)
    const evidence = await planeEvidence(window)
    const sourceTimes = [...new Set(evidence.planes.map((plane) => plane.sourceTimeMs))]
    if (sourceTimes.length !== 1) throw new Error("Light Table planes did not share one evaluator clock.")
    return {
        normalized,
        sourceTimeMs: sourceTimes[0],
        topology: evidence.stage.topology,
        focused: evidence.planes.filter((plane) => plane.focused).map((plane) => plane.id),
        geometrySha256: sha256(JSON.stringify(evidence.planes.map((plane) => [plane.id, plane.left, plane.top, plane.width, plane.height, plane.transform]))),
    }
}

async function timelineEvidence(window) {
    const automatic = await clockSnapshot(window, 0.25)
    assert.equal(automatic.sourceTimeMs, 4_500)
    await clickText(window, '.segment[aria-label="Timeline mode"] button', "Fixed")
    await until(window, "document.querySelector('input[aria-label=\"Exact duration\"]')", "Light Table exact-duration control")
    await setRangeGesture(window, "Exact duration", [24_000])
    await until(window, `(() => { try { const project = JSON.parse(localStorage.getItem(${JSON.stringify(PROJECT_KEY)})); return project.timelineMode === 'fixed-duration' && project.timelineFixedDurationMs === 24000 } catch { return false } })()`, "persisted Light Table fixed clock")
    const fixedProject = (await currentProject(window)).evidence.project
    assert.equal(fixedProject.timelineMode, "fixed-duration")
    assert.equal(fixedProject.timelineFixedDurationMs, 24_000)
    const fixed = await clockSnapshot(window, 0.25)
    assert.equal(fixed.sourceTimeMs, 6_000)

    await clickText(window, '.segment[aria-label="Timeline mode"] button', "Directed")
    await until(window, `(() => { try { const project = JSON.parse(localStorage.getItem(${JSON.stringify(PROJECT_KEY)})); return project.timelineMode === 'directed' && project.timelineSegments?.length === 4 } catch { return false } })()`, "persisted Light Table directed clock")
    const directedProject = (await currentProject(window)).evidence.project
    assert.equal(directedProject.timelineMode, "directed")
    assert.equal(directedProject.timelineFixedDurationMs, 0)
    assert.deepEqual(directedProject.timelineSegments.map(({ id, kind, cycles, paceScale }) => ({ id, kind, cycles, paceScale })), [
        { id: "wake", kind: "cycle", cycles: 1, paceScale: 2 },
        { id: "review", kind: "cycle", cycles: 1, paceScale: 1 },
        { id: "final-inspection", kind: "hold", cycles: 1, paceScale: 1 },
        { id: "return", kind: "cycle", cycles: 1, paceScale: 2 },
    ])
    assert.equal(directedProject.timelineSegments.reduce((sum, segment) => sum + segment.durationMs, 0), 18_000)
    const directed = await clockSnapshot(window, 0.25)
    assert.equal(directed.sourceTimeMs, 4_500)
    const normalLater = await clockSnapshot(window, 0.75)
    assert.notEqual(normalLater.geometrySha256, directed.geometrySha256)
    const start = await clockSnapshot(window, 0)
    const terminal = await clockSnapshot(window, 1)
    assert.equal(start.sourceTimeMs, 0)
    assert.equal(terminal.sourceTimeMs, 18_000)
    assert.equal(terminal.geometrySha256, start.geometrySha256)
    return { automatic, fixed, directed, normalLater, start, terminal, directedSegments: directedProject.timelineSegments }
}

async function installRetargetProbe(window) {
    await window.webContents.executeJavaScript(`(() => {
        if (window.__lightTableRetarget) throw new Error('Light Table retarget probe already exists.')
        const request = HTMLVideoElement.prototype.requestVideoFrameCallback
        const cancel = HTMLVideoElement.prototype.cancelVideoFrameCallback
        if (typeof request !== 'function' || typeof cancel !== 'function') throw new Error('Light Table retarget probe requires native frame callbacks.')
        const pending = new Map()
        const archived = new Map()
        const videoIds = new WeakMap()
        let nextVideoId = 1
        let holding = true
        const keyFor = (video, handle) => {
            if (!videoIds.has(video)) videoIds.set(video, nextVideoId++)
            return videoIds.get(video) + ':' + handle
        }
        HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {
            let handle = 0
            handle = request.call(this, (now, metadata) => {
                if (holding) pending.set(keyFor(this, handle), { callback, now, metadata })
                else callback(now, metadata)
            })
            return handle
        }
        HTMLVideoElement.prototype.cancelVideoFrameCallback = function(handle) {
            const key = keyFor(this, handle)
            const held = pending.get(key)
            if (held) archived.set(key, held)
            pending.delete(key)
            return cancel.call(this, handle)
        }
        window.__lightTableRetarget = {
            pending: () => pending.size,
            archived: () => archived.size,
            releaseStale() {
                const callbacks = [...archived.values()]
                archived.clear()
                for (const entry of callbacks) entry.callback(entry.now, entry.metadata)
            },
            releaseCurrent() {
                holding = false
                const callbacks = [...pending.values()]
                pending.clear()
                for (const entry of callbacks) entry.callback(entry.now, entry.metadata)
            },
            restore() {
                pending.clear()
                archived.clear()
                HTMLVideoElement.prototype.requestVideoFrameCallback = request
                HTMLVideoElement.prototype.cancelVideoFrameCallback = cancel
                delete window.__lightTableRetarget
            },
        }
    })()`)
}

async function retargetEvidence(window) {
    await scrub(window, 0)
    await until(window, "[...document.querySelectorAll('.light-table-plane img.light-table-media')].length >= 24 && [...document.querySelectorAll('.light-table-plane img.light-table-media')].every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) && document.querySelectorAll('video[data-video-source-owner=\"true\"]').length === 0", "all Light Table source posters", 90_000)
    await installRetargetProbe(window)
    try {
        await scrub(window, 0.025)
        await until(window, "window.__lightTableRetarget.pending() === 2", "held Light Table B callbacks", 30_000)
        const samplesB = await videoOwnerSamples(window)
        assert.equal(samplesB.length, 2)
        assert(samplesB.every((sample) => sample.currentTime > 0.35 && sample.currentTime < 0.55))
        const targetB = samplesB.map((sample) => sample.target)
        await scrub(window, 0.075)
        await until(window, "window.__lightTableRetarget.pending() === 2 && window.__lightTableRetarget.archived() >= 2", "retargeted Light Table A callbacks", 30_000)
        const samplesA = await videoOwnerSamples(window)
        assert.equal(samplesA.length, 2)
        assert(samplesA.every((sample) => sample.currentTime > 1.25 && sample.currentTime < 1.45))
        assert.deepEqual(samplesA.map((sample) => sample.id), samplesB.map((sample) => sample.id))
        assert(samplesA.every((sample, index) => sample.digest !== samplesB[index].digest))
        const targetA = [...new Set(samplesA.map((sample) => sample.target))]
        assert.equal(targetA.length, 1)
        const beforeStale = await window.webContents.executeJavaScript(`(() => ({
            ready: document.querySelectorAll('video[data-story-ready="true"]').length,
            posters: document.querySelectorAll('.light-table-plane img.light-table-media').length,
            targets: [...document.querySelectorAll('video[data-video-source-owner="true"]')].map((video) => video.dataset.storyTarget),
        }))()`)
        const resourcesBeforeStale = await resourceState(window)
        await window.webContents.executeJavaScript("window.__lightTableRetarget.releaseStale()")
        await wait(120)
        const afterStale = await window.webContents.executeJavaScript(`(() => ({
            ready: document.querySelectorAll('video[data-story-ready="true"]').length,
            posters: document.querySelectorAll('.light-table-plane img.light-table-media').length,
            targets: [...document.querySelectorAll('video[data-video-source-owner="true"]')].map((video) => video.dataset.storyTarget),
        }))()`)
        const samplesAfterStale = await videoOwnerSamples(window)
        const resourcesAfterStale = await resourceState(window)
        assert.deepEqual(afterStale, beforeStale)
        assert.deepEqual(samplesAfterStale, samplesA)
        assert.deepEqual({
            createdBlobs: resourcesAfterStale.createdBlobs,
            revokedBlobs: resourcesAfterStale.revokedBlobs,
            activeBlobs: resourcesAfterStale.activeBlobs,
        }, {
            createdBlobs: resourcesBeforeStale.createdBlobs,
            revokedBlobs: resourcesBeforeStale.revokedBlobs,
            activeBlobs: resourcesBeforeStale.activeBlobs,
        })
        await window.webContents.executeJavaScript("window.__lightTableRetarget.releaseCurrent()")
        await until(window, "(() => { const posters = [...document.querySelectorAll('.light-table-plane img[data-story-poster=\"true\"][data-story-ready=\"true\"]')]; return posters.length === 6 && posters.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) && document.querySelectorAll('video[data-video-source-owner=\"true\"]').length === 0 })()", "decoded current Light Table retarget posters", 30_000)
        await until(window, `(() => { const state = window.__lightTableResources.result(); return state.createdBlobs === ${resourcesBeforeStale.createdBlobs + 6} && state.revokedBlobs === ${resourcesBeforeStale.revokedBlobs + 6} && state.activeBlobs === 6 })()`, "current Light Table poster resource replacement", 30_000)
        const afterCurrent = await window.webContents.executeJavaScript(`(() => ({
            readyPosters: document.querySelectorAll('.light-table-plane img[data-story-poster="true"][data-story-ready="true"]').length,
            owners: document.querySelectorAll('video[data-video-source-owner="true"]').length,
            targets: [...document.querySelectorAll('.light-table-plane img[data-story-poster="true"][data-story-ready="true"]')].map((image) => image.dataset.storyTarget),
        }))()`)
        const samplesAfterCurrent = await currentPosterSamples(window, samplesA.map((sample) => sample.id))
        assert.equal(afterCurrent.readyPosters, 6)
        assert.equal(afterCurrent.owners, 0)
        assert.deepEqual([...new Set(afterCurrent.targets)], targetA)
        assert.equal(samplesAfterCurrent.length, 2)
        assert(samplesAfterCurrent.every((sample) => sample.target === targetA[0]))
        assert(samplesAfterCurrent.every((sample, index) => sample.digest !== samplesB[index].digest))
        return { targetB, targetA: targetA[0], samplesB, samplesA, beforeStale, afterStale, samplesAfterStale, resourcesBeforeStale, resourcesAfterStale, afterCurrent, samplesAfterCurrent, staleCallbacksDelivered: true, staleCallbacksPublished: false }
    } finally {
        await window.webContents.executeJavaScript("window.__lightTableRetarget?.restore()")
    }
}

async function exportUnavailableEvidence(window, sentinel) {
    if (evidenceFs.existsSync(sentinel)) throw new Error("Light Table export sentinel already exists.")
    await clickText(window, ".inspector-top button", "Export")
    await until(window, "document.querySelector('.export-panel')", "Light Table Export panel")
    const evidence = await window.webContents.executeJavaScript(`(() => {
        const formatButtons = [...document.querySelectorAll('.format-cards button')]
        const button = document.querySelector('.export-button')
        return {
            formats: formatButtons.map((entry) => ({ label: entry.textContent.replace(/\\s+/g, ' ').trim(), disabled: entry.disabled })),
            disabled: Boolean(button?.disabled),
            label: button?.textContent.trim() ?? null,
            copy: document.querySelector('.export-panel')?.textContent.replace(/\\s+/g, ' ').trim() ?? '',
            progress: document.querySelector('[data-export-phase]')?.getAttribute('data-export-phase') ?? null,
        }
    })()`)
    if (!evidence.disabled || evidence.formats.some((entry) => !entry.disabled)
        || !evidence.copy.includes("Light Table v2 export is unavailable until its rendered output is verified.")
        || evidence.progress !== null || evidenceFs.existsSync(sentinel)) throw new Error("Light Table export availability was not truthfully disabled.")
    await window.webContents.executeJavaScript("document.querySelector('.export-button').click()")
    await wait(200)
    const afterAttempt = await window.webContents.executeJavaScript("document.querySelector('[data-export-phase]')?.getAttribute('data-export-phase') ?? null")
    if (afterAttempt !== null || evidenceFs.existsSync(sentinel)) throw new Error("Disabled Light Table export admitted work after activation.")
    return {
        disabled: evidence.disabled,
        label: evidence.label,
        formatCount: evidence.formats.length,
        allFormatsDisabled: evidence.formats.every((entry) => entry.disabled),
        unavailableCopyPresent: true,
        copySha256: sha256(evidence.copy),
        progress: afterAttempt,
        attemptedActivation: true,
        destinationAbsent: true,
    }
}

async function enterStudio(window) {
    await until(window, "document.querySelector('.style-gallery-shell')", "Scene catalogue")
    await clickText(window, "button", "Back to studio")
    await until(window, "document.querySelector('.app-shell')", "studio")
}

async function openProjectAt(window, projectPath, expectedCount) {
    const previous = process.env.REEL_G03_PROJECT_PATH
    process.env.REEL_G03_PROJECT_PATH = projectPath
    try {
        const notice = await projectAction(window, "Open project", "Project opened")
        await until(window, `document.querySelectorAll('.media-row').length === ${expectedCount} && document.querySelectorAll('.light-table-plane').length === ${expectedCount} && document.querySelector('.light-table-stage[data-scene-version="2"]')`, `${expectedCount}-source Light Table v2 Project`, 60_000)
        await until(window, "!document.querySelector('.launch-screen')", "launch transition", 15_000)
        return notice
    } finally {
        process.env.REEL_G03_PROJECT_PATH = previous
    }
}

async function teardown(window) {
    await clickText(window, "button", "Scenes")
    await until(window, "document.querySelector('.style-gallery-shell') && !document.querySelector('.light-table-stage')", "Light Table teardown catalogue")
    await wait(400)
    const state = await resourceState(window)
    if (state.connectedOwners !== 0 || state.totalOwners !== 0 || state.retiredOwned !== 0 || state.activeBlobs !== 0 || state.createdBlobs !== state.revokedBlobs) {
        throw new Error(`Light Table resource teardown is incomplete: ${JSON.stringify(state)}`)
    }
    await window.webContents.executeJavaScript("window.__lightTableResources.stop()")
    return state
}

async function runNormalJourney(window, evidenceRoot, fixture) {
    const onePath = path.resolve(process.env.REEL_LIGHT_TABLE_ONE_PROJECT)
    const manyPath = path.resolve(process.env.REEL_LIGHT_TABLE_MANY_PROJECT)
    const savedPath = path.resolve(process.env.REEL_LIGHT_TABLE_SAVED_PROJECT)
    const exportSentinel = path.resolve(process.env.REEL_LIGHT_TABLE_EXPORT_SENTINEL)
    const oneNotice = await openProjectAt(window, onePath, 1)
    await scrub(window, 0.5)
    await until(window, "(() => { const image = document.querySelector('.light-table-plane img.light-table-media'); return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0 })()", "decoded one-source Light Table media")
    const oneProject = await currentProject(window)
    const oneRoot = acceptedRootEvidence()
    const onePlanes = await planeEvidence(window)
    assertOrderedPlanes(onePlanes, fixture.one.mediaIds)
    assert.equal(onePlanes.stage.topology, "single-inspection")
    if (!onePlanes.planes[0].media) throw new Error("One-source Light Table pixels were unavailable.")
    const oneMatches = colorMatches(onePlanes.planes[0].media.pixels, rgb(fixture.one.colors[0]))
    if (oneMatches < 8) throw new Error("One-source Light Table pixels did not correlate with its source.")
    const oneCorrelation = { id: onePlanes.planes[0].id, digest: onePlanes.planes[0].media.digest, expectedColor: fixture.one.colors[0], matches: oneMatches }
    const oneScreenshot = await captureStage(window, evidenceRoot, "light-table-normal-one")

    const manyNotice = await openProjectAt(window, manyPath, 24)
    await scrub(window, 0)
    const manyProject = await currentProject(window)
    const manyRoot = acceptedRootEvidence()
    if (evidenceFs.existsSync(oneRoot.target)) throw new Error("Light Table 24-source open retained the 1-source accepted root.")
    assert.deepEqual(manyProject.evidence.ids, fixture.many.mediaIds)
    assert.equal(manyProject.evidence.grantCount, 24)
    let manyPlanes = await planeEvidence(window)
    assertOrderedPlanes(manyPlanes, fixture.many.mediaIds)
    assert.equal(manyPlanes.stage.topology, "bounded-review-grid")
    await until(window, "[...document.querySelectorAll('.light-table-plane img.light-table-media')].length >= 24 && [...document.querySelectorAll('.light-table-plane img.light-table-media')].every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)", "all Light Table media pixels", 90_000)
    manyPlanes = await planeEvidence(window)
    assertOrderedPlanes(manyPlanes, fixture.many.mediaIds)
    const correlations = manyPlanes.planes.map((plane, index) => {
        if (!plane.media) throw new Error(`Light Table source pixels were unavailable for ${plane.id}.`)
        const matches = colorMatches(plane.media.pixels, rgb(fixture.many.colors[index]))
        if (matches < 8) throw new Error(`Light Table source pixels did not correlate for ${plane.id}.`)
        return { id: plane.id, digest: plane.media.digest, expectedColor: fixture.many.colors[index], matches, tag: plane.media.tag, objectFit: plane.media.objectFit, objectPosition: plane.media.objectPosition }
    })
    const sourceScreenshot = await captureStage(window, evidenceRoot, "light-table-normal-24")
    const controls = await controlEvidence(window)
    const retarget = await retargetEvidence(window)
    const clocks = await timelineEvidence(window)
    const exportUnavailable = await exportUnavailableEvidence(window, exportSentinel)
    process.env.REEL_G03_PROJECT_PATH = savedPath
    const saveNotice = await projectAction(window, "Save project", "Project saved")
    const saved = archiveEvidence(savedPath)
    const ownershipBeforeTeardown = await resourceState(window)
    if (ownershipBeforeTeardown.maxConnectedOwners !== 2 || ownershipBeforeTeardown.connectedOwners > 2 || ownershipBeforeTeardown.retiredOwned !== 0) {
        throw new Error(`Light Table did not hold its exact two-owner bound: ${JSON.stringify(ownershipBeforeTeardown)}`)
    }
    const finalScreenshot = await captureStage(window, evidenceRoot, "light-table-normal-terminal")
    const finalTeardown = await teardown(window)
    return {
        project: {
            one: { notice: oneNotice, ids: oneProject.evidence.ids, semanticSha256: oneProject.evidence.semanticSha256, grantCount: oneProject.evidence.grantCount, root: oneRoot.tree },
            many: { notice: manyNotice, ids: manyProject.evidence.ids, semanticSha256: manyProject.evidence.semanticSha256, grantCount: manyProject.evidence.grantCount, root: manyRoot.tree, priorRootRetired: true },
            saveNotice,
            saved: { archiveSha256: saved.sha256, archiveBytes: saved.bytes },
        },
        rendering: { stage: manyPlanes.stage, oneCorrelation, correlations, screenshots: { one: oneScreenshot, many: sourceScreenshot, terminal: finalScreenshot } },
        controls,
        clocks,
        retarget,
        exportUnavailable,
        resources: { beforeTeardown: ownershipBeforeTeardown, teardown: finalTeardown },
        containment: { staging: stagingEvidence() },
    }
}

async function runReducedReopen(window, evidenceRoot, fixture) {
    const savedPath = path.resolve(process.env.REEL_LIGHT_TABLE_SAVED_PROJECT)
    const reopenedPath = path.resolve(process.env.REEL_LIGHT_TABLE_REOPENED_PROJECT)
    const exportSentinel = path.resolve(process.env.REEL_LIGHT_TABLE_EXPORT_SENTINEL)
    const openNotice = await openProjectAt(window, savedPath, 24)
    await scrub(window, 0.25)
    const project = await currentProject(window)
    assert.deepEqual(project.evidence.ids, fixture.many.mediaIds)
    const root = acceptedRootEvidence()
    const first = await clockSnapshot(window, 0.25)
    const later = await clockSnapshot(window, 0.75)
    assert.equal(first.sourceTimeMs, 4_500)
    assert.equal(later.sourceTimeMs, 13_500)
    assert.equal(first.geometrySha256, later.geometrySha256)
    const start = await clockSnapshot(window, 0)
    const terminal = await clockSnapshot(window, 1)
    assert.equal(start.geometrySha256, terminal.geometrySha256)
    assert.equal(terminal.sourceTimeMs, 18_000)
    const stage = await planeEvidence(window)
    assertOrderedPlanes(stage, fixture.many.mediaIds)
    assert.equal(stage.stage.reducedMotion, "true")
    const screenshot = await captureStage(window, evidenceRoot, "light-table-reduced-reopen")
    const exportUnavailable = await exportUnavailableEvidence(window, exportSentinel)
    process.env.REEL_G03_PROJECT_PATH = reopenedPath
    const saveNotice = await projectAction(window, "Save project", "Project saved")
    const saved = archiveEvidence(savedPath)
    const reopened = archiveEvidence(reopenedPath)
    const beforeTeardown = await resourceState(window)
    if (beforeTeardown.maxConnectedOwners > 2 || beforeTeardown.connectedOwners > 2 || beforeTeardown.retiredOwned !== 0) throw new Error("Reduced Light Table exceeded or leaked video ownership.")
    const finalTeardown = await teardown(window)
    return {
        project: { openNotice, saveNotice, ids: project.evidence.ids, semanticSha256: project.evidence.semanticSha256, grantCount: project.evidence.grantCount, root: root.tree, savedArchiveSha256: saved.sha256, reopenedArchiveSha256: reopened.sha256, canonicalReopenComparedExternally: true },
        reducedMotion: { stage: stage.stage, first, later, start, terminal, staticGeometry: true },
        exportUnavailable,
        resources: { beforeTeardown, teardown: finalTeardown },
        screenshot,
        containment: { staging: stagingEvidence() },
    }
}

async function runLightTableRendererSmoke(window, evidenceRoot, mode = process.env.REEL_LIGHT_TABLE_RENDERER_MODE ?? "normal") {
    if (!["normal", "reopen-reduced"].includes(mode)) throw new Error("Light Table smoke mode is invalid.")
    const fixture = JSON.parse(process.env.REEL_LIGHT_TABLE_FIXTURE_CONTRACT || "null")
    if (!fixture?.one?.mediaIds || fixture.many?.mediaIds?.length !== 24 || fixture.many?.videoIds?.length !== 6
        || !process.env.REEL_LIGHT_TABLE_ONE_PROJECT || !process.env.REEL_LIGHT_TABLE_MANY_PROJECT
        || !process.env.REEL_LIGHT_TABLE_SAVED_PROJECT || !process.env.REEL_LIGHT_TABLE_REOPENED_PROJECT
        || !process.env.REEL_LIGHT_TABLE_EXPORT_SENTINEL) throw new Error("Light Table smoke fixture environment is incomplete.")
    evidenceFs.mkdirSync(evidenceRoot, { recursive: true })
    let packageIdentity = null
    try {
        packageIdentity = await packageEvidence(window)
        const reducedMotion = await window.webContents.executeJavaScript("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
        if (reducedMotion !== (mode === "reopen-reduced")) throw new Error("Light Table motion environment does not match its requested mode.")
        await installResourceTracker(window)
        await enterStudio(window)
        const journey = mode === "normal"
            ? await runNormalJourney(window, evidenceRoot, fixture)
            : await runReducedReopen(window, evidenceRoot, fixture)
        const receipt = {
            format: "galileo-gallery-light-table-renderer-evidence",
            version: 1,
            mode,
            reducedMotionForced: reducedMotion,
            package: packageIdentity,
            journey,
        }
        assertNoPrivateEvidence(receipt)
        evidenceFs.writeFileSync(path.join(evidenceRoot, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`)
    } catch (error) {
        let screenshot = null
        try { screenshot = await captureStage(window, evidenceRoot, `light-table-${mode}-failure`) } catch {}
        const rawMessage = String(error?.message ?? error)
        let message = rawMessage
        try { assertNoPrivateEvidence(message) } catch { message = "Light Table packaged renderer evidence failed; inspect the CI log for the private diagnostic." }
        const failure = { format: "galileo-gallery-light-table-renderer-failure", version: 1, mode, package: packageIdentity, screenshot, name: error?.name ?? "Error", message, diagnosticSha256: sha256(rawMessage) }
        try {
            assertNoPrivateEvidence(failure)
            evidenceFs.writeFileSync(path.join(evidenceRoot, "failure.json"), `${JSON.stringify(failure, null, 2)}\n`)
        } catch {}
        throw error
    }
}

module.exports = { runLightTableRendererSmoke }
