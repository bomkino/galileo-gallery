const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { app, session, nativeImage } = require("electron")
const { assertNoPrivateEvidence } = require("./g11-vitrine-smoke.cjs")
const { inspectPng } = require("./png-frames-runtime.cjs")

const evidenceFs = process.versions.electron ? require("original-fs") : fs
const PROJECT_KEY = "galileo-gallery-project-v1"
const GRANT = /^reel-media:\/\/grant\/[a-f0-9]{64}$/
const VIDEO_IDS = Array.from({ length: 10 }, (_, index) => `shelf-video-${index + 1}`)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex")

function fileEvidence(file) {
    const resolved = path.resolve(file)
    const linked = evidenceFs.lstatSync(resolved)
    const realpath = evidenceFs.realpathSync.native ?? evidenceFs.realpathSync
    if (!linked.isFile() || linked.isSymbolicLink() || linked.size < 1 || realpath(resolved) !== resolved) throw new Error("Shelf package evidence is not an exact regular file.")
    const descriptor = evidenceFs.openSync(resolved, evidenceFs.constants.O_RDONLY | (evidenceFs.constants.O_NOFOLLOW ?? 0))
    const hash = crypto.createHash("sha256")
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let bytes = 0
    try {
        const before = evidenceFs.fstatSync(descriptor)
        if (before.dev !== linked.dev || before.ino !== linked.ino || before.size !== linked.size || before.mtimeMs !== linked.mtimeMs || before.ctimeMs !== linked.ctimeMs) throw new Error("Shelf package evidence changed before hashing.")
        for (;;) {
            const count = evidenceFs.readSync(descriptor, buffer, 0, buffer.length, null)
            if (!count) break
            hash.update(buffer.subarray(0, count))
            bytes += count
        }
        const after = evidenceFs.fstatSync(descriptor)
        if (bytes !== before.size || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new Error("Shelf package evidence changed during hashing.")
        return { bytes, sha256: hash.digest("hex"), uid: before.uid, mode: before.mode & 0o7777 }
    } finally {
        evidenceFs.closeSync(descriptor)
    }
}

function exactTreeEvidence(directory) {
    const resolved = path.resolve(directory)
    if (!evidenceFs.existsSync(resolved)) return { exists: false, directories: 0, files: 0, bytes: 0, sha256: sha256("") }
    const root = evidenceFs.lstatSync(resolved)
    if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Shelf resource tree is unsafe.")
    const rows = []
    let directories = 0
    let files = 0
    let bytes = 0
    const walk = (current, relative) => {
        for (const entry of evidenceFs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
            const target = path.join(current, entry.name)
            const linked = evidenceFs.lstatSync(target)
            if (linked.isSymbolicLink()) throw new Error("Shelf resource tree contains a symbolic link.")
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
            } else throw new Error("Shelf resource tree contains a special file.")
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
    if (entries.length !== 1) throw new Error(`Shelf expected one accepted Project root, observed ${entries.length}.`)
    const target = path.join(parent, entries[0].name)
    const linked = evidenceFs.lstatSync(target)
    return { target, device: linked.dev, inode: linked.ino, tree: exactTreeEvidence(target) }
}

function stagingEvidence() {
    const evidence = exactTreeEvidence(path.join(app.getPath("userData"), "project-import-staging"))
    if (evidence.files || evidence.directories) throw new Error("Shelf Project import staging was not empty.")
    return evidence
}

async function until(window, expression, label, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return
        await wait(60)
    }
    throw new Error(`Shelf smoke timed out waiting for ${label}.`)
}

async function clickText(window, selector, text) {
    const clicked = await window.webContents.executeJavaScript(`(() => {
        const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find((candidate) => candidate.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))
        if (!element || element.disabled) return false
        element.click()
        return true
    })()`)
    if (!clicked) throw new Error(`Shelf smoke could not click ${text}.`)
}

async function projectAction(window, text, notice) {
    await clickText(window, ".project-menu summary", "Project")
    await clickText(window, ".project-menu button", text)
    await until(window, `document.querySelector('.autosave-status')?.textContent.includes(${JSON.stringify(notice)})`, notice, 45_000)
    return window.webContents.executeJavaScript("document.querySelector('.autosave-status').textContent.trim()")
}

async function scrub(window, normalized) {
    await window.webContents.executeJavaScript(`(async () => {
        const timeline = document.querySelector('.timeline')
        if (!timeline) throw new Error('Shelf Timeline scrubber is unavailable.')
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(timeline, ${JSON.stringify(String(normalized))})
        timeline.dispatchEvent(new Event('input', { bubbles: true }))
        timeline.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })()`)
    await wait(80)
}

async function capture(window, directory, name) {
    await wait(120)
    const image = await window.webContents.capturePage()
    const bytes = image.toPNG()
    const target = path.join(directory, `${name}.png`)
    evidenceFs.writeFileSync(target, bytes)
    return { file: path.basename(target), bytes: bytes.length, sha256: sha256(bytes), size: image.getSize() }
}

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical)
    if (!value || typeof value !== "object") return value
    return Object.keys(value).sort().reduce((result, key) => {
        result[key] = canonical(value[key])
        return result
    }, {})
}

function projectEvidence(raw) {
    const project = JSON.parse(raw)
    const grants = []
    const ordinals = new Map()
    const scrub = (value) => {
        if (typeof value === "string" && GRANT.test(value)) {
            grants.push(value)
            if (!ordinals.has(value)) ordinals.set(value, ordinals.size + 1)
            return `grant-${ordinals.get(value)}`
        }
        if (Array.isArray(value)) return value.map(scrub)
        if (!value || typeof value !== "object") return value
        return Object.keys(value).sort().reduce((result, key) => { result[key] = scrub(value[key]); return result }, {})
    }
    return {
        project,
        semanticSha256: sha256(JSON.stringify(canonical(scrub(project)))),
        grantDigest: sha256([...new Set(grants)].sort().join("\n")),
        grantCount: new Set(grants).size,
        ids: project.items.map((item) => item.id),
    }
}

async function currentProject(window) {
    const raw = await window.webContents.executeJavaScript(`localStorage.getItem(${JSON.stringify(PROJECT_KEY)})`)
    return { raw, evidence: projectEvidence(raw) }
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
        || identity.platform !== "linux" || identity.architecture !== process.arch
        || JSON.stringify(rendererSecurity) !== JSON.stringify({ contextIsolation: true, nodeIntegration: false, sandbox: true, partition: "persist:galileo-gallery-g03" })
        || window.webContents.session !== session.fromPartition("persist:galileo-gallery-g03")) throw new Error("Shelf packaged host identity is wrong.")
    const executable = fileEvidence(process.execPath)
    const appAsar = fileEvidence(path.join(process.resourcesPath, "app.asar"))
    const ffmpeg = fileEvidence(path.join(process.resourcesPath, "ffmpeg", "ffmpeg"))
    const sandboxHelper = fileEvidence(path.join(path.dirname(process.execPath), "chrome-sandbox"))
    if (sandboxHelper.uid !== 0 || sandboxHelper.mode !== 0o4755) throw new Error("Shelf Chromium sandbox helper is not root-owned mode 4755.")
    if (process.env.SHELF_EXPECTED_EXECUTABLE_SHA && executable.sha256 !== process.env.SHELF_EXPECTED_EXECUTABLE_SHA) throw new Error("Shelf executable digest is wrong.")
    if (process.env.SHELF_EXPECTED_APP_ASAR_SHA && appAsar.sha256 !== process.env.SHELF_EXPECTED_APP_ASAR_SHA) throw new Error("Shelf app.asar digest is wrong.")
    if (process.env.SHELF_EXPECTED_FFMPEG_SHA && ffmpeg.sha256 !== process.env.SHELF_EXPECTED_FFMPEG_SHA) throw new Error("Shelf FFmpeg digest is wrong.")
    if (process.env.SHELF_EXPECTED_SANDBOX_SHA && sandboxHelper.sha256 !== process.env.SHELF_EXPECTED_SANDBOX_SHA) throw new Error("Shelf Chromium sandbox helper digest is wrong.")
    return {
        productId: identity.productId,
        profile: identity.profile,
        buildId: identity.buildId,
        sourceSha: identity.sourceSha,
        sourceTree: identity.sourceTree,
        packaged: identity.packaged,
        runtime: identity.runtime,
        rendererSecurity,
        executable,
        appAsar,
        ffmpeg,
        sandboxHelper,
    }
}

async function installDecoderTracker(window) {
    await window.webContents.executeJavaScript(`(() => {
        if (window.__shelfDecoderTracker) throw new Error('Shelf decoder tracker already exists.')
        const original = document.createElement
        const videos = new Set(document.querySelectorAll('video'))
        const retired = new Set()
        let maxOwners = 0
        let maxConnected = 0
        document.createElement = function(name, options) {
            const node = original.call(this, name, options)
            if (String(name).toLowerCase() === 'video') videos.add(node)
            return node
        }
        const owns = (video) => Boolean(video.getAttribute('src') || video.currentSrc)
        const sample = () => {
            let owners = 0
            let connected = 0
            for (const video of videos) {
                if (owns(video)) owners += 1
                if (video.isConnected && owns(video)) connected += 1
                if (!video.isConnected) retired.add(video)
            }
            maxOwners = Math.max(maxOwners, owners)
            maxConnected = Math.max(maxConnected, connected)
        }
        const observer = new MutationObserver(sample)
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
        const timer = setInterval(sample, 4)
        window.__shelfDecoderTracker = {
            sample,
            result() {
                sample()
                const owned = [...videos].filter(owns)
                const connected = owned.filter((video) => video.isConnected)
                const retiredOwned = [...retired].filter(owns)
                return { created: videos.size, maxOwners, maxConnected, owned: owned.length, connected: connected.length, retired: retired.size, retiredOwned: retiredOwned.length }
            },
            stop() { clearInterval(timer); observer.disconnect(); document.createElement = original },
        }
    })()`)
}

async function decoderState(window) {
    return window.webContents.executeJavaScript("window.__shelfDecoderTracker.result()")
}

async function mediaSamples(window) {
    return window.webContents.executeJavaScript(`(async () => {
        const sample = async (media) => {
            if (!media || !media.isConnected) return null
            if (media instanceof HTMLImageElement && (!media.complete || media.naturalWidth < 1)) return null
            if (media instanceof HTMLVideoElement && (media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || media.videoWidth < 1)) return null
            if (media instanceof HTMLCanvasElement && (media.dataset.storyReady !== 'true' || media.width < 1 || media.height < 1)) return null
            try {
                const canvas = document.createElement('canvas')
                canvas.width = 16
                canvas.height = 12
                const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
                context.drawImage(media, 0, 0, 16, 12)
                const pixels = [...context.getImageData(0, 0, 16, 12).data]
                const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(pixels)))].map((value) => value.toString(16).padStart(2, '0')).join('')
                const targetValue = media.dataset.storyTargetTime
                const presentedValue = media.dataset.storyPresentedTime
                const targetTime = Number(targetValue)
                const presentedTime = Number(presentedValue)
                return {
                    pixels,
                    digest,
                    targetTime: targetValue !== undefined && targetValue !== "" && Number.isFinite(targetTime) ? targetTime : null,
                    presentedTime: presentedValue !== undefined && presentedValue !== "" && Number.isFinite(presentedTime) ? presentedTime : null,
                }
            } catch {
                return null
            }
        }
        const samples = new Map()
        let liveNodeCount = 0
        for (const card of document.querySelectorAll('.shelf-card')) {
            const id = card.dataset.mediaId
            if (!id) continue
            const video = card.querySelector('video.shelf-video-decoder')
            const surface = card.querySelector('canvas.shelf-video-surface')
            const poster = card.querySelector('img[data-source-poster="true"], img.shelf-video-poster')
            if (video) liveNodeCount += 1
            if (!surface && !poster) continue
            const current = samples.get(id) ?? { id, live: null, poster: null, liveNode: false, posterNode: false }
            current.liveNode ||= Boolean(video)
            current.posterNode ||= Boolean(poster)
            if (!current.live && surface) current.live = await sample(surface)
            if (!current.poster && poster) current.poster = await sample(poster)
            samples.set(id, current)
        }
        const stage = document.querySelector('.shelf-stage')
        return {
            result: [...samples.values()],
            liveNodeCount,
            stage: stage ? {
                liveCount: Number(stage.dataset.shelfLiveVideoCount),
                posterCount: Number(stage.dataset.shelfPosterCount || 0),
                posterPending: Number(stage.dataset.shelfPosterPending || 0),
                sourceCount: Number(stage.dataset.shelfSourceCount),
                renderCount: Number(stage.dataset.shelfRenderCount),
                phrase: stage.dataset.shelfPhrase,
            } : null,
        }
    })()`)
}

function rgb(hex) {
    return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)]
}

function expectedMatches(pixels, expected) {
    let matches = 0
    for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] > 240 && Math.max(Math.abs(pixels[offset] - expected[0]), Math.abs(pixels[offset + 1] - expected[1]), Math.abs(pixels[offset + 2] - expected[2])) <= 28) matches += 1
    }
    return matches
}

function looseMatches(left, right) {
    let matches = 0
    for (let offset = 0; offset < Math.min(left.length, right.length); offset += 4) {
        if (Math.max(Math.abs(left[offset] - right[offset]), Math.abs(left[offset + 1] - right[offset + 1]), Math.abs(left[offset + 2] - right[offset + 2]), Math.abs(left[offset + 3] - right[offset + 3])) <= 12) matches += 1
    }
    return matches
}

function regionMatches(pixels, expected) {
    let matches = 0
    for (let y = 0; y < 5; y += 1) {
        for (let x = 0; x < 5; x += 1) {
            const offset = (y * 16 + x) * 4
            if (pixels[offset + 3] > 240 && Math.max(
                Math.abs(pixels[offset] - expected[0]),
                Math.abs(pixels[offset + 1] - expected[1]),
                Math.abs(pixels[offset + 2] - expected[2]),
            ) <= 40) matches += 1
        }
    }
    return matches
}

function expectedVfrFrame(contract, targetTime) {
    return contract.frames.filter((frame) => frame.ptsSeconds <= targetTime + 0.0001).at(-1) ?? contract.frames[0]
}

async function surfaceState(window) {
    return window.webContents.executeJavaScript(`(async () => {
        const surface = document.querySelector('canvas.shelf-video-surface')
        if (!surface || surface.width < 1 || surface.height < 1) return null
        const sample = document.createElement('canvas')
        sample.width = 16
        sample.height = 12
        const context = sample.getContext('2d', { alpha: true, willReadFrequently: true })
        context.drawImage(surface, 0, 0, 16, 12)
        const pixels = new Uint8Array(context.getImageData(0, 0, 16, 12).data)
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))].map((value) => value.toString(16).padStart(2, '0')).join('')
        return {
            digest,
            ready: surface.dataset.storyReady === 'true',
            targetTime: surface.dataset.storyTargetTime === '' ? null : Number(surface.dataset.storyTargetTime),
            presentedTime: surface.dataset.storyPresentedTime === '' ? null : Number(surface.dataset.storyPresentedTime),
        }
    })()`)
}

async function installVfrHoldProbe(window) {
    await window.webContents.executeJavaScript(`(() => {
        if (window.__shelfVfrHold) throw new Error('Shelf VFR hold probe already exists.')
        const request = HTMLVideoElement.prototype.requestVideoFrameCallback
        const cancel = HTMLVideoElement.prototype.cancelVideoFrameCallback
        const play = HTMLMediaElement.prototype.play
        if (typeof request !== 'function' || typeof cancel !== 'function') throw new Error('Shelf VFR hold probe requires native frame callbacks.')
        const pending = new Map()
        const archived = new Map()
        let holding = false
        let playCalls = 0
        HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {
            let handle = 0
            handle = request.call(this, (now, metadata) => {
                if (holding) pending.set(handle, { callback, now, metadata })
                else callback(now, metadata)
            })
            return handle
        }
        HTMLVideoElement.prototype.cancelVideoFrameCallback = function(handle) {
            const held = pending.get(handle)
            if (held) archived.set(handle, held)
            pending.delete(handle)
            return cancel.call(this, handle)
        }
        HTMLMediaElement.prototype.play = function() {
            playCalls += 1
            return play.call(this)
        }
        window.__shelfVfrHold = {
            hold() { holding = true },
            pending() { return pending.size },
            archived() { return archived.size },
            playCalls() { return playCalls },
            releaseStale() {
                const callbacks = [...archived.values()]
                archived.clear()
                for (const entry of callbacks) entry.callback(entry.now, entry.metadata)
            },
            release() {
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
                HTMLMediaElement.prototype.play = play
                delete window.__shelfVfrHold
            },
        }
    })()`)
}

async function vfrConformanceEvidence(window, contract, mode, runtime) {
    if (!contract || contract.id !== "shelf-video-1" || !Array.isArray(contract.frames) || contract.frames.length !== 4
        || contract.short?.id !== "shelf-video-2" || !Array.isArray(contract.short.frames) || contract.short.frames.length !== 1) throw new Error("Shelf VFR contract is invalid.")
    if (runtime?.electron !== "43.1.0" || runtime?.chromium !== "150.0.7871.47") throw new Error("Shelf VFR conformance ran on an unpinned browser runtime.")
    const manifest = contract.frames.map((frame, index) => {
        if (frame.index !== index || !Number.isFinite(frame.ptsSeconds) || !Number.isFinite(frame.durationSeconds) || frame.durationSeconds <= 0 || !/^[0-9a-f]{6}$/.test(frame.markerColor)) {
            throw new Error("Shelf VFR frame manifest is invalid.")
        }
        return frame
    })
    await until(window, "document.querySelectorAll('canvas.shelf-video-surface[data-story-ready=\"true\"]').length === 2", "both Shelf VFR bootstrap frames")
    let shortBootstrap = null
    if (mode === "reduced") {
        shortBootstrap = await window.webContents.executeJavaScript(`(() => {
            const surface = document.querySelector('.shelf-card[data-media-id="shelf-video-2"] canvas.shelf-video-surface')
            return surface ? { ready: surface.dataset.storyReady === 'true', targetTime: Number(surface.dataset.storyTargetTime), presentedTime: Number(surface.dataset.storyPresentedTime) } : null
        })()`)
        assert.deepEqual(shortBootstrap, { ready: true, targetTime: 0, presentedTime: 0 })
    }
    const probeTargets = mode === "reduced"
        ? [0, 0.2, 0.72, 1]
        : [0, 1 / 6, 0.2, 0.7, 11 / 15, 29 / 30, 1, 31 / 30]
    const observed = new Map()
    for (const requestedTarget of probeTargets) {
        await scrub(window, requestedTarget * 1_000 / 8_000)
        const expectedTarget = mode === "reduced" ? 0 : Math.floor(requestedTarget * 30 + 1e-9) / 30
        await until(window, `(() => { const surface = document.querySelector('canvas.shelf-video-surface'); return surface?.dataset.storyReady === 'true' && Math.abs(Number(surface.dataset.storyTargetTime) - ${JSON.stringify(expectedTarget)}) <= 0.0005 })()`, "proved Shelf VFR target")
        const samples = await mediaSamples(window)
        const live = samples.result.find((entry) => entry.id === contract.id)?.live
        if (!live || live.targetTime === null || live.presentedTime === null) throw new Error("Shelf VFR surface did not publish a proved frame.")
        const expected = expectedVfrFrame(contract, live.targetTime)
        if (Math.abs(live.presentedTime - expected.ptsSeconds) > 0.0001) throw new Error(`Shelf VFR PTS mismatch at ${live.targetTime}.`)
        const markerMatches = regionMatches(live.pixels, rgb(expected.markerColor))
        if (markerMatches < 8) throw new Error(`Shelf VFR marker mismatch at ${live.targetTime}.`)
        observed.set(expected.index, { requestedTarget, targetTime: live.targetTime, presentedTime: live.presentedTime, markerColor: expected.markerColor, markerMatches, digest: live.digest })
    }
    const expectedIndexes = mode === "reduced" ? [0] : manifest.map((frame) => frame.index)
    assert.deepEqual([...observed.keys()].sort((left, right) => left - right), expectedIndexes)

    let terminal = null
    if (mode === "normal") {
        await scrub(window, 1)
        await until(window, `(() => { const surface = document.querySelector('canvas.shelf-video-surface'); return surface?.dataset.storyReady === 'true' && Math.abs(Number(surface.dataset.storyTargetTime) - ${JSON.stringify(contract.durationSeconds)}) <= 0.0005 })()`, "terminal Shelf VFR target")
        const samples = await mediaSamples(window)
        const live = samples.result.find((entry) => entry.id === contract.id)?.live
        const expected = manifest.at(-1)
        if (!live || live.targetTime === null || live.presentedTime === null || Math.abs(live.targetTime - contract.durationSeconds) > 0.0005 || Math.abs(live.presentedTime - expected.ptsSeconds) > 0.0001) {
            throw new Error("Shelf VFR terminal source frame is wrong.")
        }
        const markerMatches = regionMatches(live.pixels, rgb(expected.markerColor))
        if (markerMatches < 8) throw new Error("Shelf VFR terminal marker is wrong.")
        terminal = { targetTime: live.targetTime, presentedTime: live.presentedTime, markerColor: expected.markerColor, markerMatches, digest: live.digest }
    }

    let rapidRetarget = null
    if (mode === "normal") {
        await scrub(window, 0)
        await until(window, "document.querySelector('canvas.shelf-video-surface')?.dataset.storyReady === 'true'", "Shelf VFR initial frame")
        const before = await surfaceState(window)
        await installVfrHoldProbe(window)
        try {
            await window.webContents.executeJavaScript("window.__shelfVfrHold.hold()")
            await scrub(window, (11 / 15) * 1_000 / 8_000)
            await until(window, "window.__shelfVfrHold.pending() === 1", "held Shelf VFR B callback")
            const pendingB = await surfaceState(window)
            assert.equal(pendingB.digest, before.digest)
            assert.equal(pendingB.ready, false)
            await scrub(window, 0)
            await until(window, "window.__shelfVfrHold.pending() === 1", "held Shelf VFR A callback")
            const pendingA = await surfaceState(window)
            assert.equal(pendingA.digest, before.digest)
            assert.equal(pendingA.ready, false)
            await until(window, "window.__shelfVfrHold.archived() >= 1", "archived stale Shelf VFR callback")
            await window.webContents.executeJavaScript("window.__shelfVfrHold.releaseStale()")
            const staleDelivered = await surfaceState(window)
            assert.equal(staleDelivered.digest, before.digest)
            assert.equal(staleDelivered.ready, false)
            await window.webContents.executeJavaScript("window.__shelfVfrHold.release()")
            await until(window, "document.querySelector('canvas.shelf-video-surface')?.dataset.storyReady === 'true'", "released Shelf VFR A frame")
            const after = await surfaceState(window)
            assert.equal(after.digest, before.digest)
            const playCalls = await window.webContents.executeJavaScript("window.__shelfVfrHold.playCalls()")
            assert.equal(playCalls, 0)
            rapidRetarget = { before, pendingB, pendingA, staleDelivered, after, playCalls, staleCallbackDelivered: true, staleCallbackPublished: false }
        } finally {
            await window.webContents.executeJavaScript("window.__shelfVfrHold?.restore()")
        }
    }
    return { scope: "package-identity-pinned-Chromium-precise-seek-conformance", runtime, manifest, shortManifest: contract.short, shortBootstrap, observed: [...observed.values()], terminal, rapidRetarget }
}

async function collectPosterJourney(window, colors, label) {
    const live = new Map()
    const posters = new Map()
    let maximumLive = 0
    let maximumRendered = 0
    const observedPhrases = new Set()
    for (let step = 0; step <= 64; step += 1) {
        await scrub(window, step / 64)
        const evidence = await mediaSamples(window)
        if (!evidence.stage) throw new Error("Shelf stage disappeared during poster journey.")
        maximumLive = Math.max(maximumLive, evidence.stage.liveCount, evidence.liveNodeCount)
        maximumRendered = Math.max(maximumRendered, evidence.stage.renderCount)
        observedPhrases.add(evidence.stage.phrase)
        for (const entry of evidence.result) {
            if (entry.live && VIDEO_IDS.includes(entry.id) && !live.has(entry.id)) live.set(entry.id, entry.live)
            if (entry.poster && VIDEO_IDS.includes(entry.id) && !posters.has(entry.id)) posters.set(entry.id, entry.poster)
        }
        if (live.size === 10 && posters.size === 10) break
    }
    if (live.size !== 10 || posters.size !== 10) throw new Error(`${label} did not observe source and poster evidence for all 10 videos: ${live.size}/${posters.size}.`)
    if (maximumLive > 2) throw new Error(`${label} exceeded two connected live Shelf decoders.`)
    const correlation = VIDEO_IDS.map((id, index) => {
        const source = live.get(id)
        const poster = posters.get(id)
        const sourceColorMatches = expectedMatches(source.pixels, rgb(colors[index]))
        const posterColorMatches = expectedMatches(poster.pixels, rgb(colors[index]))
        const posterSourceMatches = looseMatches(source.pixels, poster.pixels)
        if (sourceColorMatches < 2 || posterColorMatches < 2 || posterSourceMatches < 2) {
            throw new Error(`${label} source/poster pixels did not correlate for ${id}.`)
        }
        return { id, sourceSha256: source.digest, posterSha256: poster.digest, sourceColorMatches, posterColorMatches, posterSourceMatches }
    })
    return { correlation, maximumLive, maximumRendered, observedPhrases: [...observedPhrases].filter(Boolean).sort() }
}

async function alphaPreviewEvidence(window, expected) {
    for (let step = 0; step <= 32; step += 1) {
        await scrub(window, step / 32)
        const value = await window.webContents.executeJavaScript(`(() => {
            const stage = document.querySelector('.shelf-stage')
            const image = document.querySelector('.shelf-card[data-media-id="shelf-alpha"] img.shelf-media')
            if (!stage || !image || !image.complete || image.naturalWidth < 1) return null
            const canvas = document.createElement('canvas')
            canvas.width = image.naturalWidth
            canvas.height = image.naturalHeight
            const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
            context.drawImage(image, 0, 0)
            const data = context.getImageData(0, 0, canvas.width, canvas.height).data
            const counts = { transparent: 0, partial: 0, opaque: 0 }
            for (let offset = 3; offset < data.length; offset += 4) {
                if (data[offset] === 0) counts.transparent += 1
                else if (data[offset] === 255) counts.opaque += 1
                else counts.partial += 1
            }
            return { counts, stageBackground: getComputedStyle(stage).backgroundColor, transparentClass: stage.classList.contains('is-transparent') }
        })()`)
        if (!value) continue
        assert.deepEqual(value.counts, expected)
        if (!value.transparentClass || !/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(value.stageBackground)) throw new Error("Shelf transparent preview compositor state is wrong.")
        return { ...value, claim: "preview-compositor-only; no export claim" }
    }
    throw new Error("Shelf alpha fixture was never rendered during the preview journey.")
}

async function installCancelProbe(window) {
    await window.webContents.executeJavaScript(`(() => {
        if (window.__shelfCancelProbe) throw new Error('Shelf cancel probe already exists.')
        const original = document.createElement
        const pending = new Map()
        let nextId = 1
        let started = 0
        document.createElement = function(name, options) {
            const node = original.call(this, name, options)
            if (String(name).toLowerCase() === 'video') {
                node.requestVideoFrameCallback = (callback) => { const id = nextId++; pending.set(id, callback); started += 1; return id }
                node.cancelVideoFrameCallback = (id) => pending.delete(id)
            }
            return node
        }
        window.__shelfCancelProbe = { get started() { return started }, get pending() { return pending.size }, restore() { document.createElement = original } }
    })()`)
}

async function cancelOpenEvidence(window, candidatePath) {
    const priorPath = process.env.REEL_G03_PROJECT_PATH
    const before = await currentProject(window)
    const rootBefore = acceptedRootEvidence()
    await installCancelProbe(window)
    process.env.REEL_G03_PROJECT_PATH = candidatePath
    let notice
    let probe
    try {
        await clickText(window, ".project-menu summary", "Project")
        await clickText(window, ".project-menu button", "Open project")
        await until(window, "window.__shelfCancelProbe.started > 0 && [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Cancel open'))", "pending Shelf frame admission", 20_000)
        await clickText(window, "button", "Cancel open")
        await until(window, "document.querySelector('.autosave-status')?.textContent.toLowerCase().includes('cancel')", "cancelled Shelf open", 20_000)
        notice = await window.webContents.executeJavaScript("document.querySelector('.autosave-status').textContent.trim()")
    } finally {
        process.env.REEL_G03_PROJECT_PATH = priorPath
        probe = await window.webContents.executeJavaScript(`(() => { const value = { started: window.__shelfCancelProbe.started, pending: window.__shelfCancelProbe.pending }; window.__shelfCancelProbe.restore(); delete window.__shelfCancelProbe; return value })()`)
    }
    await wait(200)
    const after = await currentProject(window)
    const rootAfter = acceptedRootEvidence()
    assert.equal(after.raw, before.raw)
    assert.equal(rootAfter.device, rootBefore.device)
    assert.equal(rootAfter.inode, rootBefore.inode)
    assert.equal(probe.pending, 0)
    return { notice, probe, priorDocumentPreserved: true, priorRootPreserved: true, staging: stagingEvidence() }
}

async function corruptOpenEvidence(window, corruptPath) {
    const priorPath = process.env.REEL_G03_PROJECT_PATH
    const before = await currentProject(window)
    const rootBefore = acceptedRootEvidence()
    process.env.REEL_G03_PROJECT_PATH = corruptPath
    let notice
    try {
        await clickText(window, ".project-menu summary", "Project")
        await clickText(window, ".project-menu button", "Open project")
        await until(window, `document.querySelector('.autosave-status')?.textContent.includes('Shelf Video 4.mp4')`, "corrupt Shelf rejection", 25_000)
        notice = await window.webContents.executeJavaScript("document.querySelector('.autosave-status').textContent.trim()")
    } finally {
        process.env.REEL_G03_PROJECT_PATH = priorPath
    }
    await wait(200)
    const after = await currentProject(window)
    const rootAfter = acceptedRootEvidence()
    assert.equal(after.raw, before.raw)
    assert.equal(rootAfter.device, rootBefore.device)
    assert.equal(rootAfter.inode, rootBefore.inode)
    return { notice, priorDocumentPreserved: true, priorRootPreserved: true, staging: stagingEvidence() }
}

async function exportUnavailableEvidence(window) {
    await clickText(window, "button", "Export")
    await wait(80)
    const evidence = await window.webContents.executeJavaScript(`(() => {
        const button = document.querySelector('.export-button')
        const panel = button?.closest('.inspector-content, aside') ?? document.body
        return { disabled: Boolean(button?.disabled), label: button?.textContent.trim() ?? null, consequence: panel.textContent.replace(/\s+/g, ' ').trim() }
    })()`)
    const verifiedScenePolicy = /Shelf video export not yet verified|Shelf PNG Frames currently support still images only/.test(evidence.consequence)
    const transparentExportUnverified = /This Scene has no verified transparent export yet/.test(evidence.consequence)
    if (!evidence.disabled || !verifiedScenePolicy || !transparentExportUnverified) throw new Error("Shelf export availability was not truthfully disabled.")
    return { disabled: evidence.disabled, label: evidence.label, verifiedScenePolicy, transparentExportUnverified, consequenceSha256: sha256(evidence.consequence) }
}

async function imageOnlyPngEvidence(window, projectPath, destination, evidenceRoot, mode, priorRoot) {
    if (evidenceFs.existsSync(destination)) throw new Error("Shelf image-only PNG destination already exists.")
    const priorPath = process.env.REEL_G03_PROJECT_PATH
    process.env.REEL_G03_PROJECT_PATH = projectPath
    let notice
    try {
        notice = await projectAction(window, "Open project", "Project opened")
    } finally {
        process.env.REEL_G03_PROJECT_PATH = priorPath
    }
    await until(window, "document.querySelectorAll('.media-row').length === 1 && document.querySelector('.shelf-stage[data-scene-version=\"2\"] img.shelf-media')", "image-only Shelf v2 Project", 45_000)
    const project = await currentProject(window)
    const acceptedRoot = acceptedRootEvidence()
    if (evidenceFs.existsSync(priorRoot.target)) throw new Error("Image-only Shelf acceptance retained the VFR Project root.")
    assert.equal(project.evidence.project.styleId, "the-shelf")
    assert.equal(project.evidence.project.sceneVersion, 2)
    assert.equal(project.evidence.project.timelineMode, "fixed-duration")
    assert.equal(project.evidence.project.timelineFixedDurationMs, 1_000)
    assert.equal(project.evidence.project.settings.canvasWidth, 64)
    assert.equal(project.evidence.project.settings.canvasHeight, 64)
    assert.equal(project.evidence.project.settings.backgroundStyle, "transparent")
    assert.equal(project.evidence.project.settings.playKind, "once")
    assert.equal(project.evidence.project.settings.repeatCount, 1)
    assert.equal(project.evidence.project.settings.loopVideos, false)
    assert.deepEqual(project.evidence.ids, ["shelf-alpha"])
    assert.equal(project.evidence.project.items[0].type, "image")
    assert.equal(project.evidence.grantCount, 1)

    await clickText(window, ".inspector-top button", "Export")
    await until(window, "Boolean(document.querySelector('.export-panel'))", "Shelf Export inspector")
    const activeFormat = await window.webContents.executeJavaScript("document.querySelector('.format-cards button.is-active')?.textContent ?? ''")
    if (!activeFormat.includes("PNG Frames")) {
        await clickText(window, ".format-cards button", "PNG Frames")
        await until(window, "document.querySelector('.format-cards button.is-active')?.textContent.includes('PNG Frames') && !document.querySelector('.export-button')?.disabled", "enabled image-only Shelf PNG format")
    }
    const admission = await window.webContents.executeJavaScript(`(() => {
        const png = [...document.querySelectorAll('.format-cards button')].find((button) => button.textContent.includes('PNG Frames'))
        if (!png) return null
        const button = document.querySelector('.export-button')
        return {
            formatDisabled: png.disabled,
            exportDisabled: Boolean(button?.disabled),
            label: button?.textContent.trim() ?? null,
            copy: document.querySelector('.export-panel')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
        }
    })()`)
    if (!admission || admission.formatDisabled || admission.exportDisabled || !admission.label?.includes("Export verified PNG Frames")
        || !admission.copy.includes("PNG Frames preserve straight alpha")) throw new Error("Image-only Shelf PNG export was not truthfully enabled.")
    await window.webContents.executeJavaScript(`(() => {
        window.__shelfPngProgress = []
        window.galleryHost.onExportProgress((progress) => window.__shelfPngProgress.push({
            phase: progress.phase,
            frame: progress.frame ?? null,
            totalFrames: progress.totalFrames ?? null,
        }))
    })()`)
    await clickText(window, ".export-button", "Export verified PNG Frames")
    await until(window, "document.querySelector('.export-success strong')?.textContent.includes('PNG Frames verified')", "verified image-only Shelf PNG Frames", 120_000)
    const publicOutcome = await window.webContents.executeJavaScript(`(() => ({
        status: document.querySelector('.export-success strong')?.textContent.trim() ?? null,
        progress: window.__shelfPngProgress,
    }))()`)
    for (const phase of ["preparing", "rendering", "done"]) {
        if (!publicOutcome.progress.some((entry) => entry.phase === phase)) throw new Error(`Shelf image-only PNG export did not expose ${phase}.`)
    }

    const destinationStat = evidenceFs.lstatSync(destination)
    if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink()) throw new Error("Shelf PNG destination is not an exact directory.")
    const manifestPath = path.join(destination, "manifest.json")
    const manifestBytes = evidenceFs.readFileSync(manifestPath)
    const manifest = JSON.parse(manifestBytes.toString("utf8"))
    if (manifest.format !== "galileo-gallery-png-frames" || manifest.version !== 1
        || manifest.scene?.id !== "the-shelf" || manifest.scene?.version !== 2
        || manifest.width !== 64 || manifest.height !== 64 || manifest.fps !== 30
        || manifest.durationMs !== 1_000 || manifest.frameCount !== 30 || manifest.frames?.length !== 30
        || manifest.alpha !== true || manifest.audio !== "none") throw new Error("Shelf image-only PNG manifest is invalid.")
    const expectedEntries = ["manifest.json", ...manifest.frames.map((frame) => frame.name)].sort()
    assert.deepEqual(evidenceFs.readdirSync(destination).sort(), expectedEntries)

    const alpha = { transparent: 0, partial: 0, opaque: 0, artwork: 0, contaminatedTransparentRgb: 0 }
    const frames = manifest.frames.map((frame, index) => {
        const expectedName = `frame-${String(index + 1).padStart(6, "0")}.png`
        if (frame.name !== expectedName || Math.abs(frame.timeMs - index * 1_000 / 30) > 1e-9) throw new Error("Shelf PNG frame clock is wrong.")
        const target = path.join(destination, frame.name)
        const linked = evidenceFs.lstatSync(target)
        if (!linked.isFile() || linked.isSymbolicLink()) throw new Error("Shelf PNG frame is not an exact regular file.")
        const bytes = evidenceFs.readFileSync(target)
        const inspected = inspectPng(bytes, { width: 64, height: 64, alpha: true })
        if (inspected.sha256 !== frame.sha256 || inspected.bytes !== frame.bytes) throw new Error("Shelf PNG frame hash or length is wrong.")
        const image = nativeImage.createFromBuffer(bytes)
        if (image.isEmpty() || image.getSize().width !== 64 || image.getSize().height !== 64) throw new Error("Shelf PNG native readback is invalid.")
        const bitmap = image.toBitmap()
        if (bitmap.length !== 64 * 64 * 4) throw new Error("Shelf PNG bitmap readback length is wrong.")
        for (let offset = 0; offset < bitmap.length; offset += 4) {
            const blue = bitmap[offset]
            const green = bitmap[offset + 1]
            const red = bitmap[offset + 2]
            const value = bitmap[offset + 3]
            if (value === 0) {
                alpha.transparent += 1
                if (red || green || blue) alpha.contaminatedTransparentRgb += 1
            } else if (value === 255) alpha.opaque += 1
            else alpha.partial += 1
            if (value > 0 && Math.max(red, green, blue) - Math.min(red, green, blue) > 12) alpha.artwork += 1
        }
        return { name: frame.name, timeMs: frame.timeMs, bytes: inspected.bytes, sha256: inspected.sha256 }
    })
    if (alpha.transparent < 30 || alpha.partial < 30 || alpha.opaque < 30 || alpha.artwork < 30 || alpha.contaminatedTransparentRgb !== 0) {
        throw new Error(`Shelf PNG alpha/artwork readback is wrong: ${JSON.stringify(alpha)}`)
    }
    const screenshot = await capture(window, evidenceRoot, `shelf-${mode}-image-png-export`)
    return {
        notice,
        project: { semanticSha256: project.evidence.semanticSha256, grantDigest: project.evidence.grantDigest, grantCount: project.evidence.grantCount, root: acceptedRoot.tree },
        status: publicOutcome.status,
        progress: publicOutcome.progress,
        manifest: {
            sha256: sha256(manifestBytes),
            scene: manifest.scene,
            dimensions: [manifest.width, manifest.height],
            fps: manifest.fps,
            durationMs: manifest.durationMs,
            frameCount: manifest.frameCount,
            alpha: manifest.alpha,
            audio: manifest.audio,
            frameEvidenceSha256: sha256(JSON.stringify(frames)),
        },
        alpha,
        cleanTransparentRgb: true,
        screenshot,
    }
}

async function playbackControlEvidence(window) {
    await clickText(window, ".inspector-top button", "Look")
    await until(window, "document.querySelector('.segment[aria-label=\"Direction\"]')", "Shelf playback controls")
    const evidence = await window.webContents.executeJavaScript(`(() => {
        const active = (label) => document.querySelector('.segment[aria-label="' + label + '"] button[aria-pressed="true"]')?.textContent.trim() ?? null
        return {
            direction: active('Direction'),
            endBehavior: active('End behavior'),
            timelineMode: active('Timeline mode'),
            repeatCount: Number(document.querySelector('input[aria-label="Loop count"]')?.value),
        }
    })()`)
    assert.deepEqual(evidence, { direction: "Right", endBehavior: "Loop ×", timelineMode: "Auto", repeatCount: 2 })
    return evidence
}

async function finalTeardown(window) {
    await clickText(window, "button", "Scenes")
    await until(window, "document.querySelector('.style-gallery-shell')", "Shelf teardown Scene catalogue")
    await wait(300)
    const state = await decoderState(window)
    if (state.connected !== 0 || state.owned !== 0 || state.retiredOwned !== 0) throw new Error(`Shelf decoder teardown is incomplete: ${JSON.stringify(state)}`)
    await window.webContents.executeJavaScript("window.__shelfDecoderTracker.stop()")
    return state
}

async function runShelfRendererSmoke(window, evidenceRoot, mode = process.env.REEL_SHELF_RENDERER_MODE ?? "normal") {
    if (!["normal", "reduced"].includes(mode)) throw new Error("Shelf smoke mode is invalid.")
    const originalValue = process.env.REEL_SHELF_PROJECT_PATH
    const replacementValue = process.env.REEL_SHELF_REPLACEMENT_PROJECT_PATH
    const corruptValue = process.env.REEL_SHELF_CORRUPT_PROJECT_PATH
    const vfrValue = process.env.REEL_SHELF_VFR_PROJECT_PATH
    const imageValue = process.env.REEL_SHELF_IMAGE_PROJECT_PATH
    const pngDestinationValue = process.env.REEL_G11_PNG_DESTINATION
    const colors = JSON.parse(process.env.REEL_SHELF_COLORS || "null")
    const replacementColors = JSON.parse(process.env.REEL_SHELF_REPLACEMENT_COLORS || "null")
    const alphaCounts = JSON.parse(process.env.REEL_SHELF_ALPHA_COUNTS || "null")
    const vfrContract = JSON.parse(process.env.REEL_SHELF_VFR_CONTRACT || "null")
    if (!colors || !replacementColors || !alphaCounts || !vfrContract || !originalValue || !replacementValue || !corruptValue || !vfrValue || !imageValue || !pngDestinationValue) throw new Error("Shelf smoke fixture environment is incomplete.")
    const originalPath = path.resolve(originalValue)
    const replacementPath = path.resolve(replacementValue)
    const corruptPath = path.resolve(corruptValue)
    const vfrPath = path.resolve(vfrValue)
    const imagePath = path.resolve(imageValue)
    const pngDestination = path.resolve(pngDestinationValue)
    evidenceFs.mkdirSync(evidenceRoot, { recursive: true })
    let packageIdentity = null
    try {
        packageIdentity = await packageEvidence(window)
        const reducedMotion = await window.webContents.executeJavaScript("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
        if (reducedMotion !== (mode === "reduced")) throw new Error("Shelf renderer motion environment does not match its requested mode.")
        await installDecoderTracker(window)
        await until(window, "document.querySelector('.style-gallery-shell')", "Scene catalogue")
        await clickText(window, "button", "Back to studio")
        await until(window, "document.querySelector('.app-shell')", "studio")
        const openNotice = await projectAction(window, "Open project", "Project opened")
        await until(window, "document.querySelectorAll('.media-row').length === 11 && document.querySelector('.shelf-stage[data-scene-version=\"2\"]')", "Shelf v2 Project", 45_000)
        await until(window, "!document.querySelector('.launch-screen')", "launch transition", 15_000)
        const original = await currentProject(window)
        assert.equal(original.evidence.project.styleId, "the-shelf")
        assert.equal(original.evidence.project.sceneVersion, 2)
        assert.equal(original.evidence.project.settings.direction, "reverse")
        assert.equal(original.evidence.project.settings.playKind, "repeat")
        assert.equal(original.evidence.project.settings.repeatCount, 2)
        assert.deepEqual(original.evidence.ids.filter((id) => id.startsWith("shelf-video-")), VIDEO_IDS)
        const playbackControls = await playbackControlEvidence(window)
        const originalRoot = acceptedRootEvidence()
        const originalJourney = await collectPosterJourney(window, colors, `${mode} original`)
        const alphaPreview = await alphaPreviewEvidence(window, alphaCounts)
        const originalScreenshot = await capture(window, evidenceRoot, `shelf-${mode}-original`)

        process.env.REEL_G03_PROJECT_PATH = replacementPath
        const replaceNotice = await projectAction(window, "Open project", "Project opened")
        await until(window, "document.querySelectorAll('.media-row').length === 11 && document.querySelector('.shelf-stage')", "same-ID Shelf replacement", 45_000)
        const replacement = await currentProject(window)
        const replacementRoot = acceptedRootEvidence()
        assert.deepEqual(replacement.evidence.ids, original.evidence.ids)
        assert.notEqual(replacement.evidence.grantDigest, original.evidence.grantDigest)
        assert.notEqual(replacementRoot.inode, originalRoot.inode)
        if (evidenceFs.existsSync(originalRoot.target)) throw new Error("Same-ID Shelf replacement retained the old accepted Project root.")
        const replacementJourney = await collectPosterJourney(window, replacementColors, `${mode} replacement`)
        for (let index = 0; index < VIDEO_IDS.length; index += 1) {
            assert.notEqual(replacementJourney.correlation[index].sourceSha256, originalJourney.correlation[index].sourceSha256)
            assert.notEqual(replacementJourney.correlation[index].posterSha256, originalJourney.correlation[index].posterSha256)
        }
        const replacementRetirement = await decoderState(window)
        if (replacementRetirement.retiredOwned !== 0) throw new Error("Same-ID Shelf source replacement retained old decoder ownership.")
        const replacementScreenshot = await capture(window, evidenceRoot, `shelf-${mode}-replacement`)
        const corrupt = await corruptOpenEvidence(window, corruptPath)
        const cancelled = await cancelOpenEvidence(window, originalPath)
        const exportUnavailable = await exportUnavailableEvidence(window)
        process.env.REEL_G03_PROJECT_PATH = vfrPath
        const vfrNotice = await projectAction(window, "Open project", "Project opened")
        await until(window, "document.querySelectorAll('.media-row').length === 2 && document.querySelector('.shelf-stage')", "sparse and short Shelf VFR Project", 45_000)
        const vfrProject = await currentProject(window)
        const vfrRoot = acceptedRootEvidence()
        assert.deepEqual(vfrProject.evidence.ids, [vfrContract.id, vfrContract.short.id])
        if (evidenceFs.existsSync(replacementRoot.target)) throw new Error("Shelf VFR acceptance retained the replaced Project root.")
        const vfr = await vfrConformanceEvidence(window, vfrContract, mode, packageIdentity.runtime)
        const imageOnlyPng = await imageOnlyPngEvidence(window, imagePath, pngDestination, evidenceRoot, mode, vfrRoot)
        const ownershipBeforeTeardown = await decoderState(window)
        if (ownershipBeforeTeardown.maxOwners > 2 || ownershipBeforeTeardown.maxConnected > 2 || ownershipBeforeTeardown.retiredOwned !== 0) {
            throw new Error(`Shelf exceeded or leaked its two-decoder ownership bound: ${JSON.stringify(ownershipBeforeTeardown)}`)
        }
        const teardown = await finalTeardown(window)
        const receipt = {
            format: "galileo-gallery-shelf-renderer-evidence",
            version: 1,
            mode,
            reducedMotionForced: reducedMotion,
            package: packageIdentity,
            project: {
                openNotice,
                replaceNotice,
                original: { semanticSha256: original.evidence.semanticSha256, grantDigest: original.evidence.grantDigest, grantCount: original.evidence.grantCount, root: originalRoot.tree },
                replacement: { semanticSha256: replacement.evidence.semanticSha256, grantDigest: replacement.evidence.grantDigest, grantCount: replacement.evidence.grantCount, root: replacementRoot.tree },
                vfr: { notice: vfrNotice, semanticSha256: vfrProject.evidence.semanticSha256, grantDigest: vfrProject.evidence.grantDigest, grantCount: vfrProject.evidence.grantCount, root: vfrRoot.tree },
                imageOnly: imageOnlyPng.project,
                sameIds: replacement.evidence.ids,
                reverseRepeat: { direction: replacement.evidence.project.settings.direction, playKind: replacement.evidence.project.settings.playKind, repeatCount: replacement.evidence.project.settings.repeatCount },
                playbackControls,
            },
            preview: { original: originalJourney, replacement: replacementJourney, alpha: alphaPreview, vfr },
            rollback: { corrupt, cancelled },
            exportUnavailable,
            exportImageOnly: imageOnlyPng,
            decoderOwnership: { replacementRetirement, beforeTeardown: ownershipBeforeTeardown, teardown },
            containment: { staging: stagingEvidence(), oldRootRetired: true },
            screenshots: { original: originalScreenshot, replacement: replacementScreenshot },
        }
        assertNoPrivateEvidence(receipt)
        evidenceFs.writeFileSync(path.join(evidenceRoot, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`)
    } catch (error) {
        let screenshot = null
        try { screenshot = await capture(window, evidenceRoot, `shelf-${mode}-failure`) } catch {}
        const rawMessage = String(error?.message ?? error)
        let message = rawMessage
        try { assertNoPrivateEvidence(message) } catch { message = "Shelf packaged renderer evidence failed; inspect the CI log for the private diagnostic." }
        const failure = {
            format: "galileo-gallery-shelf-renderer-failure",
            version: 1,
            mode,
            package: packageIdentity,
            screenshot,
            name: error?.name ?? "Error",
            message,
            diagnosticSha256: sha256(rawMessage),
        }
        try {
            assertNoPrivateEvidence(failure)
            evidenceFs.mkdirSync(evidenceRoot, { recursive: true })
            evidenceFs.writeFileSync(path.join(evidenceRoot, "failure.json"), `${JSON.stringify(failure, null, 2)}\n`)
        } catch {}
        throw error
    }
}

module.exports = { runShelfRendererSmoke }
