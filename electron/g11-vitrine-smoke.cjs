const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const zlib = require("node:zlib")
const { spawnSync } = require("node:child_process")
const { BrowserWindow, ipcMain, session } = require("electron")
const { inspectPng } = require("./png-frames-runtime.cjs")
const evidenceFs = process.versions.electron ? require("original-fs") : fs

const PRESENTATION_KEY = "galileo-gallery:local-presentation:v1"
const PROJECT_KEY = "galileo-gallery-project-v1"
const GRANT = /^reel-media:\/\/grant\/[a-f0-9]{64}$/
const EXPECTED_FRAME_INTENTS = [
    { id: "vitrine-square", aspectMode: "custom", ratioW: 16, ratioH: 9, fit: "cover", crop: { x: 0, y: 0, width: 1, height: 1 }, focal: { x: 0.2, y: 0.3 } },
    { id: "vitrine-portrait", aspectMode: "auto", ratioW: 4, ratioH: 5, fit: "contain", crop: { x: 0, y: 0.25, width: 1, height: 0.5 }, focal: { x: 0.8, y: 0.7 } },
]
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex")
const parsePackagedFfmpegVersion = (output) => typeof output === "string"
    ? /^ffmpeg version ([0-9]+(?:\.[0-9]+){1,3}(?:-[^\s]+)?)\s/m.exec(output)?.[1] ?? null
    : null

function capturePathAuthority(resolved) {
    const root = path.parse(resolved).root
    const chain = []
    let current = root
    for (const part of resolved.slice(root.length).split(path.sep).filter(Boolean).slice(0, -1)) {
        current = path.join(current, part)
        const stat = evidenceFs.lstatSync(current)
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("G11 evidence ancestor is not an exact directory.")
        chain.push({ path: current, dev: stat.dev, ino: stat.ino })
    }
    return chain
}

function verifyPathAuthority(resolved, chain) {
    for (const expected of chain) {
        const stat = evidenceFs.lstatSync(expected.path)
        if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== expected.dev || stat.ino !== expected.ino) throw new Error("G11 evidence ancestor changed during read.")
    }
    const realpath = evidenceFs.realpathSync.native ?? evidenceFs.realpathSync
    if (realpath(resolved) !== resolved) throw new Error("G11 package evidence path contains a symbolic link.")
}

function readEvidenceFile(file, maximumBytes = Number.MAX_SAFE_INTEGER, includeBytes = false) {
    const resolved = path.resolve(file)
    const authority = capturePathAuthority(resolved)
    verifyPathAuthority(resolved, authority)
    const linked = evidenceFs.lstatSync(resolved)
    if (!linked.isFile() || linked.isSymbolicLink() || linked.size < 1 || linked.size > maximumBytes) throw new Error("G11 package evidence target is not a bounded regular file.")
    const descriptor = evidenceFs.openSync(resolved, evidenceFs.constants.O_RDONLY | (evidenceFs.constants.O_NOFOLLOW ?? 0))
    const hash = crypto.createHash("sha256")
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    const chunks = []
    let bytes = 0
    let before
    try {
        before = evidenceFs.fstatSync(descriptor)
        if (!before.isFile() || before.dev !== linked.dev || before.ino !== linked.ino || before.size !== linked.size
            || before.mtimeMs !== linked.mtimeMs || before.ctimeMs !== linked.ctimeMs) throw new Error("G11 package evidence target changed before hashing.")
        for (;;) {
            const count = evidenceFs.readSync(descriptor, buffer, 0, buffer.length, null)
            if (!count) break
            const chunk = buffer.subarray(0, count)
            hash.update(chunk)
            if (includeBytes) chunks.push(Buffer.from(chunk))
            bytes += count
            if (bytes > maximumBytes) throw new Error("G11 evidence file exceeds its byte bound.")
        }
        const after = evidenceFs.fstatSync(descriptor)
        const finalLink = evidenceFs.lstatSync(resolved)
        if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
            || finalLink.dev !== before.dev || finalLink.ino !== before.ino || finalLink.size !== before.size || finalLink.mtimeMs !== before.mtimeMs || finalLink.ctimeMs !== before.ctimeMs
            || bytes !== before.size) {
            throw new Error("G11 package evidence target changed during hashing.")
        }
        verifyPathAuthority(resolved, authority)
    } finally {
        evidenceFs.closeSync(descriptor)
    }
    return { evidence: { bytes, sha256: hash.digest("hex"), uid: before.uid, mode: before.mode & 0o7777 }, bytes: includeBytes ? Buffer.concat(chunks, bytes) : null }
}

function fileEvidence(file) {
    return readEvidenceFile(file).evidence
}

function stableFileBytes(file, maximumBytes) {
    return readEvidenceFile(file, maximumBytes, true).bytes
}

function assertNoPrivateEvidence(value) {
    if (typeof value === "string") {
        const candidates = [value]
        for (let attempt = 0; attempt < 16; attempt += 1) {
            try {
                const decoded = decodeURIComponent(candidates[candidates.length - 1])
                if (decoded === candidates[candidates.length - 1]) break
                candidates.push(decoded)
            } catch { break }
        }
        for (const candidate of candidates) {
            const normalized = candidate.replace(/\\/g, "/").toLowerCase()
            if (/[a-z][a-z0-9+.-]*:\/\//i.test(candidate) || /(?:data|blob|file):/i.test(candidate)
                || path.posix.isAbsolute(candidate) || path.win32.isAbsolute(candidate)
                || /(?:^|[=:\s"'(?&])(?:[a-z]:)?\/+[^/]/.test(normalized)
                || /(?:^|[=:\s"'(?&])\/\/[^/]/.test(normalized)
                || /(?:^|[=:\s"'(?&])~(?:\/|$)/.test(normalized)
                || /(?:^|[=:\s"'(?&])(?:\.\.\/)+/.test(normalized)
                || /(?:^|[=:\s"'(?&])[a-z]:[^/]/.test(normalized)
                || /[a-z]:\//.test(normalized) || /%25(?:2f|5c)/i.test(candidate)) {
                throw new Error("G11 evidence leaked private authority or filesystem state.")
            }
        }
        return
    }
    if (Array.isArray(value)) {
        value.forEach(assertNoPrivateEvidence)
        return
    }
    if (value && typeof value === "object") Object.entries(value).forEach(([key, entry]) => {
        assertNoPrivateEvidence(key)
        assertNoPrivateEvidence(entry)
    })
}

async function until(window, expression, label, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return
        await wait(75)
    }
    throw new Error(`G11 Vitrine smoke timed out waiting for ${label}.`)
}

async function settle(window) {
    await window.webContents.executeJavaScript(`(async () => {
        await document.fonts.ready
        await Promise.all(Array.from(document.images).map(async (image) => {
            await image.decode()
            if (!image.complete || image.naturalWidth < 1 || image.naturalHeight < 1) throw new Error('Vitrine image did not decode.')
        }))
        const deadline = performance.now() + 10_000
        while ([...document.querySelectorAll('.vitrine-plane video, .vitrine-guard video')].some((video) => video.dataset.storyReady !== 'true')) {
            if (performance.now() >= deadline) {
                const states = [...document.querySelectorAll('.vitrine-plane video, .vitrine-guard video')].map((video) => ({
                    ready: video.dataset.storyReady, currentTime: video.currentTime, duration: video.duration,
                    seeking: video.seeking, paused: video.paused, readyState: video.readyState, networkState: video.networkState,
                    visibility: getComputedStyle(video).visibility, parent: video.parentElement?.className,
                }))
                throw new Error('Vitrine source video did not present its requested frame: ' + JSON.stringify(states))
            }
            await new Promise((resolve) => requestAnimationFrame(resolve))
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    })()`)
}

async function clickText(window, selector, text) {
    const clicked = await window.webContents.executeJavaScript(`(() => {
        const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find((candidate) => candidate.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))
        if (!element || element.disabled) return false
        element.click()
        return true
    })()`)
    if (!clicked) throw new Error(`G11 Vitrine smoke could not click ${text}.`)
}

async function projectAction(window, text, expectedNotice) {
    await clickText(window, ".project-menu summary", "Project")
    await clickText(window, ".project-menu button", text)
    await until(window, `document.querySelector('.autosave-status')?.textContent.includes(${JSON.stringify(expectedNotice)})`, expectedNotice)
    return window.webContents.executeJavaScript("document.querySelector('.autosave-status').textContent.trim()")
}

async function capture(window, directory, name) {
    await settle(window)
    const image = await window.webContents.capturePage()
    const bytes = image.toPNG()
    const target = path.join(directory, `${name}.png`)
    fs.writeFileSync(target, bytes)
    return { file: path.basename(target), bytes: bytes.length, sha256: sha256(bytes), size: image.getSize() }
}

async function presentationState(window) {
    const value = await window.webContents.executeJavaScript(`(() => {
        const raw = localStorage.getItem(${JSON.stringify(PRESENTATION_KEY)})
        const manifest = raw ? JSON.parse(raw) : null
        return { raw, manifest, visible: Number(document.querySelector('[data-interface-scale]')?.dataset.interfaceScale) }
    })()`)
    return {
        interfaceScale: value.visible,
        revision: value.manifest?.revision ?? null,
        sha256: value.raw ? sha256(value.raw) : null,
    }
}

async function setScale(window, target) {
    await window.webContents.executeJavaScript(`(async () => {
        const deadline = performance.now() + 10_000
        while (performance.now() < deadline) {
            const current = Number(document.querySelector('[data-interface-scale]')?.dataset.interfaceScale)
            if (current === ${target}) break
            const control = document.querySelector('.interface-scale-control')
            const button = control?.querySelector(current < ${target} ? 'button:last-child' : 'button:first-child')
            if (!button || button.disabled) throw new Error('Interface Scale control is missing or disabled before target.')
            button.click()
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        }
        const persistenceDeadline = performance.now() + 2_000
        while (performance.now() < persistenceDeadline) {
            const current = Number(document.querySelector('[data-interface-scale]')?.dataset.interfaceScale)
            const saved = JSON.parse(localStorage.getItem(${JSON.stringify(PRESENTATION_KEY)}))
            if (current === ${target} && saved?.interfaceScale === ${target}) return
            await new Promise((resolve) => requestAnimationFrame(resolve))
        }
        const current = Number(document.querySelector('[data-interface-scale]')?.dataset.interfaceScale)
        const saved = JSON.parse(localStorage.getItem(${JSON.stringify(PRESENTATION_KEY)}))
        throw new Error('Interface Scale did not persist: ' + JSON.stringify({ target: ${target}, current, saved: saved?.interfaceScale ?? null }))
    })()`)
    await settle(window)
}

async function setRange(window, label, value) {
    await window.webContents.executeJavaScript(`(() => {
        const input = document.querySelector('input[type="range"][aria-label="${label}"]')
        if (!input) throw new Error('Missing range: ${label}')
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, ${JSON.stringify(String(value))})
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await settle(window)
}

async function chooseSegment(window, label, option) {
    await window.webContents.executeJavaScript(`(() => {
        const row = [...document.querySelectorAll('.playback-direction')].find((candidate) => candidate.querySelector(':scope > span')?.textContent.trim() === ${JSON.stringify(label)})
        const button = [...(row?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent.trim() === ${JSON.stringify(option)})
        if (!button) throw new Error('Missing segment: ${label} / ${option}')
        button.click()
    })()`)
    await settle(window)
}

async function chooseNamedSegment(window, label, option) {
    await window.webContents.executeJavaScript(`(() => {
        const row = document.querySelector('.segment[aria-label=${JSON.stringify(label)}]')
        const button = [...(row?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent.trim() === ${JSON.stringify(option)})
        if (!button) throw new Error('Missing named segment: ${label} / ${option}')
        button.click()
    })()`)
    await settle(window)
}

async function segmentState(window, label) {
    return window.webContents.executeJavaScript(`(() => {
        const row = [...document.querySelectorAll('.playback-direction')].find((candidate) => candidate.querySelector(':scope > span')?.textContent.trim() === ${JSON.stringify(label)})
        const active = row?.querySelector('button[aria-pressed="true"]')
        return {
            active: active?.textContent.trim() ?? null,
            focused: document.activeElement?.textContent.trim() ?? null,
            depth: Number(document.documentElement.dataset.vitrineUndoDepth || 0),
        }
    })()`)
}

async function focusSegment(window, label, option) {
    const focused = await window.webContents.executeJavaScript(`(() => {
        const row = [...document.querySelectorAll('.playback-direction')].find((candidate) => candidate.querySelector(':scope > span')?.textContent.trim() === ${JSON.stringify(label)})
        const button = [...(row?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent.trim() === ${JSON.stringify(option)})
        button?.focus()
        return document.activeElement === button
    })()`)
    if (!focused) throw new Error(`Could not focus segment ${label} / ${option}.`)
}

async function keyboardInput(window, keyCode, modifiers = []) {
    window.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers })
    window.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers })
    await settle(window)
}

async function vitrineTargetEvidence(window) {
    const evidence = await window.webContents.executeJavaScript(`(() => {
        const targets = [
            ...${JSON.stringify(["Presentation scale · height cap", "Object turn", "Transition depth"])}.map((label) => ({
                label,
                element: document.querySelector('input[type="range"][aria-label="' + label + '"]'),
            })),
            ...${JSON.stringify(["Exchange direction", "Placard"])}.map((label) => {
                const row = [...document.querySelectorAll('.playback-direction')].find((candidate) => candidate.querySelector(':scope > span')?.textContent.trim() === label)
                return { label, element: row?.querySelector('button[aria-pressed="true"]') }
            }),
        ]
        return targets.map(({ label, element }) => {
            if (!element) throw new Error('Missing Vitrine target: ' + label)
            const box = element.getBoundingClientRect()
            return { label, width: box.width, height: box.height }
        })
    })()`)
    for (const target of evidence) {
        if (target.width < 43.75 || target.height < 43.75) throw new Error(`G11 ${target.label} target is smaller than 44 CSS px.`)
    }
    return evidence
}

async function rangePointerEvent(window, label, type) {
    await window.webContents.executeJavaScript(`(() => {
        const input = document.querySelector('input[type="range"][aria-label=${JSON.stringify(label)}]')
        if (!input) throw new Error('Missing range: ${label}')
        input.dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { bubbles: true, pointerId: 11, pointerType: 'mouse', isPrimary: true }))
    })()`)
    await settle(window)
}

async function rangeInput(window, label, value) {
    await window.webContents.executeJavaScript(`(() => {
        const input = document.querySelector('input[type="range"][aria-label=${JSON.stringify(label)}]')
        if (!input) throw new Error('Missing range: ${label}')
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, ${JSON.stringify(String(value))})
        input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await settle(window)
}

async function rangeValueAndUndoDepth(window, label) {
    return window.webContents.executeJavaScript(`(() => ({
        value: Number(document.querySelector('input[type="range"][aria-label=${JSON.stringify(label)}]')?.value),
        depth: Number(document.documentElement.dataset.vitrineUndoDepth || 0),
    }))()`)
}

async function undoVitrineControl(window) {
    await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }))`)
    await settle(window)
}

async function vitrineInteractionEvidence(window) {
    const label = "Object turn"
    const baseline = await rangeValueAndUndoDepth(window, label)
    assert.equal(baseline.value, 5)

    await rangePointerEvent(window, label, "pointerdown")
    await rangeInput(window, label, 6)
    await rangeInput(window, label, 7)
    await rangePointerEvent(window, label, "pointerup")
    const dragged = await rangeValueAndUndoDepth(window, label)
    assert.deepEqual(dragged, { value: 7, depth: baseline.depth + 1 }, "one drag must create one undo transaction")
    await undoVitrineControl(window)
    const dragUndone = await rangeValueAndUndoDepth(window, label)
    assert.deepEqual(dragUndone, baseline, "one undo must restore the complete drag")

    await window.webContents.executeJavaScript(`(() => {
        const input = document.querySelector('input[type="range"][aria-label=${JSON.stringify(label)}]')
        input.focus()
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', shiftKey: true, bubbles: true, cancelable: true }))
    })()`)
    await settle(window)
    await window.webContents.executeJavaScript(`document.querySelector('input[type="range"][aria-label=${JSON.stringify(label)}]').dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', code: 'ArrowUp', shiftKey: true, bubbles: true }))`)
    await settle(window)
    const shifted = await rangeValueAndUndoDepth(window, label)
    assert.deepEqual(shifted, { value: 7.5, depth: baseline.depth + 1 }, "Shift+Arrow must move exactly ten steps in one undo transaction")
    await undoVitrineControl(window)
    const shiftUndone = await rangeValueAndUndoDepth(window, label)
    assert.deepEqual(shiftUndone, baseline, "one undo must restore the Shift+Arrow change")

    const directionBaseline = await segmentState(window, "Exchange direction")
    assert.equal(directionBaseline.active, "Left")
    assert.equal(directionBaseline.depth, baseline.depth)
    await focusSegment(window, "Exchange direction", "Left")
    await keyboardInput(window, "Right")
    const directionArrow = await segmentState(window, "Exchange direction")
    assert.deepEqual(directionArrow, { active: "Right", focused: "Right", depth: baseline.depth + 1 }, "Arrow key must move, activate, and retain focus inside enum segment")
    await undoVitrineControl(window)
    const directionUndone = await segmentState(window, "Exchange direction")
    assert.equal(directionUndone.active, "Left", "one undo must restore enum keyboard change")
    assert.equal(directionUndone.focused, "Left", "enum undo must return focus to restored active option")
    assert.equal(directionUndone.depth, baseline.depth, "enum undo depth must return to baseline")

    const placardBaseline = await segmentState(window, "Placard")
    assert.equal(placardBaseline.active, "Clean")
    await focusSegment(window, "Placard", "Visible")
    await keyboardInput(window, "Space")
    const placardSpace = await segmentState(window, "Placard")
    assert.deepEqual(placardSpace, { active: "Visible", focused: "Visible", depth: baseline.depth + 1 }, "Space must activate focused boolean segment once")
    await undoVitrineControl(window)
    const placardUndone = await segmentState(window, "Placard")
    assert.equal(placardUndone.active, "Clean", "one undo must restore boolean keyboard change")
    assert.equal(placardUndone.focused, "Clean", "boolean undo must return focus to restored active option")
    assert.equal(placardUndone.depth, baseline.depth, "boolean undo depth must return to baseline")

    await setRange(window, label, 6)
    const beforeDefaults = await rangeValueAndUndoDepth(window, label)
    assert.equal(beforeDefaults.depth, baseline.depth + 1)
    await clickText(window, ".inspector-top button", "Expert")
    await until(window, "document.querySelector('.expert-presets')", "Vitrine Expert presets")
    await clickText(window, ".expert-presets button", "Restore Defaults")
    await clickText(window, ".inspector-top button", "Design")
    const restoredDefaults = await rangeValueAndUndoDepth(window, label)
    assert.deepEqual(restoredDefaults, baseline, "Restore Defaults must clear Vitrine undo and restore factory controls")
    await undoVitrineControl(window)
    const afterDefaultsUndo = await rangeValueAndUndoDepth(window, label)
    assert.deepEqual(afterDefaultsUndo, baseline, "stale undo must not cross Restore Defaults")
    return { baseline, dragged, dragUndone, shifted, shiftUndone, directionBaseline, directionArrow, directionUndone, placardBaseline, placardSpace, placardUndone, beforeDefaults, restoredDefaults, afterDefaultsUndo }
}

async function libraryKeyboardEvidence(window) {
    await window.webContents.executeJavaScript(`(() => {
        window.__g11RetiredVideos = []
        window.__g11VideoObserver?.disconnect()
        window.__g11VideoObserver = new MutationObserver((records) => {
            for (const record of records) for (const node of record.removedNodes) {
                if (node instanceof HTMLVideoElement) window.__g11RetiredVideos.push(node)
                if (node instanceof Element) window.__g11RetiredVideos.push(...node.querySelectorAll('video'))
            }
        })
        window.__g11VideoObserver.observe(document.querySelector('.stage'), { childList: true, subtree: true })
    })()`)
    const focusItem = async (id) => {
        const focused = await window.webContents.executeJavaScript(`(() => {
            const item = document.querySelector('[data-library-item=${JSON.stringify(id)}]')
            item?.focus()
            return document.activeElement === item
        })()`)
        if (!focused) throw new Error(`Could not focus library item ${id}.`)
    }
    const state = () => window.webContents.executeJavaScript(`(() => {
        const selected = document.querySelector('.media-row.is-selected [data-library-item]')
        const focused = document.activeElement?.dataset.libraryItem ?? null
        return { selected: selected?.dataset.libraryItem ?? null, focused, label: document.activeElement?.getAttribute('aria-label') ?? null }
    })()`)
    await focusItem("vitrine-square")
    await keyboardInput(window, "Down")
    await settle(window)
    const next = { ...(await state()), scene: await readScene(window) }
    assert.deepEqual({ selected: next.selected, focused: next.focused, label: next.label }, { selected: "vitrine-portrait", focused: "vitrine-portrait", label: "Vitrine Portrait.mp4, item 2 of 2" })
    assert.equal(next.scene.phrase, "single-still")
    assert.equal(next.scene.currentId, "vitrine-portrait")
    assert.equal(next.scene.inspectionId, "vitrine-portrait")
    assert.equal(next.scene.status, "Showing Field portrait, item 2 of 2")
    assert.equal(next.scene.planes[0].mediaTag, "VIDEO")
    assert.equal(next.scene.planes[0].storyReady, "true")
    await keyboardInput(window, "Up")
    await settle(window)
    const previous = { ...(await state()), scene: await readScene(window) }
    assert.deepEqual({ selected: previous.selected, focused: previous.focused, label: previous.label }, { selected: "vitrine-square", focused: "vitrine-square", label: "Vitrine Square.png, item 1 of 2" })
    assert.equal(previous.scene.phrase, "single-still")
    assert.equal(previous.scene.currentId, "vitrine-square")
    assert.equal(previous.scene.inspectionId, "vitrine-square")
    assert.equal(previous.scene.status, "Showing Signal square, item 1 of 2")
    await keyboardInput(window, "Down", ["alt"])
    const movedLater = await window.webContents.executeJavaScript(`({
        order: [...document.querySelectorAll('[data-library-item]')].map((item) => item.dataset.libraryItem),
        focused: document.activeElement?.dataset.libraryItem ?? null,
        selected: document.querySelector('.media-row.is-selected [data-library-item]')?.dataset.libraryItem ?? null,
        notice: document.querySelector('.autosave-status')?.textContent.trim() ?? null,
        shortcuts: document.activeElement?.getAttribute('aria-keyshortcuts') ?? null,
    })`)
    assert.deepEqual(movedLater.order, ["vitrine-portrait", "vitrine-square"])
    assert.equal(movedLater.focused, "vitrine-square")
    assert.equal(movedLater.selected, "vitrine-square")
    assert.match(movedLater.notice, /moved to position 2 of 2/)
    assert.equal(movedLater.shortcuts, "Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight")
    await keyboardInput(window, "Up", ["alt"])
    const movedEarlier = await window.webContents.executeJavaScript(`({
        order: [...document.querySelectorAll('[data-library-item]')].map((item) => item.dataset.libraryItem),
        focused: document.activeElement?.dataset.libraryItem ?? null,
        selected: document.querySelector('.media-row.is-selected [data-library-item]')?.dataset.libraryItem ?? null,
        notice: document.querySelector('.autosave-status')?.textContent.trim() ?? null,
    })`)
    assert.deepEqual(movedEarlier.order, ["vitrine-square", "vitrine-portrait"])
    assert.equal(movedEarlier.focused, "vitrine-square")
    assert.equal(movedEarlier.selected, "vitrine-square")
    assert.match(movedEarlier.notice, /moved to position 1 of 2/)
    await keyboardInput(window, "Down", ["control", "alt"])
    const voiceOverChord = await window.webContents.executeJavaScript(`({
        order: [...document.querySelectorAll('[data-library-item]')].map((item) => item.dataset.libraryItem),
        focused: document.activeElement?.dataset.libraryItem ?? null,
        selected: document.querySelector('.media-row.is-selected [data-library-item]')?.dataset.libraryItem ?? null,
    })`)
    assert.deepEqual(voiceOverChord, { order: ["vitrine-square", "vitrine-portrait"], focused: "vitrine-square", selected: "vitrine-square" }, "Control+Option VoiceOver navigation must not reorder or consume library focus")
    const retired = await window.webContents.executeJavaScript(`(async () => {
        const deadline = performance.now() + 2_000
        const released = (video) => !video.hasAttribute('src') && video.paused && video.readyState === HTMLMediaElement.HAVE_NOTHING && video.networkState === HTMLMediaElement.NETWORK_EMPTY
        while (performance.now() < deadline && !window.__g11RetiredVideos.every(released)) {
            await new Promise((resolve) => requestAnimationFrame(resolve))
        }
        const states = window.__g11RetiredVideos.map((video) => ({
            hasSourceAttribute: video.hasAttribute('src'), hasCurrentSource: Boolean(video.currentSrc),
            paused: video.paused, readyState: video.readyState, networkState: video.networkState,
        }))
        return { count: states.length, allCleared: states.every((state) => !state.hasSourceAttribute && state.paused && state.readyState === 0 && state.networkState === 0), states }
    })()`)
    if (retired.count < 1 || !retired.allCleared) throw new Error(`G11 source-video handoff did not release the retired decoder: ${JSON.stringify(retired)}`)
    await window.webContents.executeJavaScript("window.__g11VideoObserver.disconnect()")
    return { next, previous, movedLater, movedEarlier, voiceOverChord, retired }
}

async function documentBoundaryEvidence(window) {
    const label = "Presentation scale · height cap"
    const before = await rangeValueAndUndoDepth(window, label)
    assert.equal(before.value, 70)
    await setRange(window, label, 69)
    const dirty = await rangeValueAndUndoDepth(window, label)
    assert.equal(dirty.value, 69)
    assert.equal(dirty.depth, before.depth + 1)
    const notice = await projectAction(window, "Open project", "Project opened")
    await until(window, "document.querySelector('.vitrine-stage[data-scene-version=\"2\"]')", "reopened Vitrine after dirty control")
    const reopened = await rangeValueAndUndoDepth(window, label)
    assert.deepEqual(reopened, { value: 70, depth: 0 }, "opening another Project must clear document-scoped Vitrine undo")
    await undoVitrineControl(window)
    const afterUndo = await rangeValueAndUndoDepth(window, label)
    assert.deepEqual(afterUndo, reopened, "stale undo must not mutate the reopened Project")
    return { before, dirty, notice, reopened, afterUndo }
}

async function scrub(window, normalizedTime) {
    await window.webContents.executeJavaScript(`(async () => {
        const timeline = document.querySelector('.timeline')
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(timeline, ${JSON.stringify(String(normalizedTime))})
        timeline.dispatchEvent(new Event('input', { bubbles: true }))
        timeline.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })()`)
    await settle(window)
}

async function reducedTransportEvidence(window) {
    const before = await window.webContents.executeJavaScript("Number(document.querySelector('.timeline').value)")
    await window.webContents.executeJavaScript("document.querySelector('.transport-play').click()")
    await wait(300)
    const after = await window.webContents.executeJavaScript("Number(document.querySelector('.timeline').value)")
    if (after !== before) throw new Error("G11 reduced-motion preference allowed preview auto-advance.")
    return { before, after, paused: true }
}

async function continuousVideoHandoffEvidence(window) {
    await scrub(window, 0.33)
    const result = await window.webContents.executeJavaScript(`(async () => {
        const guard = document.querySelector('.vitrine-guard video')
        const guardReadyBefore = guard?.dataset.storyReady === 'true'
        document.querySelector('.transport-play').click()
        const deadline = performance.now() + 1_500
        let sawIncoming = false
        let hiddenIncomingFrames = 0
        let maxDecoders = 0
        const presentedTimes = []
        while (performance.now() < deadline) {
            await new Promise((resolve) => requestAnimationFrame(resolve))
            maxDecoders = Math.max(maxDecoders, document.querySelectorAll('.vitrine-stage video').length)
            const incoming = document.querySelector('.vitrine-plane[data-role="incoming"] video')
            if (incoming) {
                sawIncoming = true
                if (getComputedStyle(incoming).visibility !== 'visible') hiddenIncomingFrames += 1
                const presented = Number(incoming.dataset.storyPresentedTime)
                if (incoming.dataset.storyReady === 'true' && Number.isFinite(presented)
                    && (presentedTimes.length === 0 || Math.abs(presentedTimes.at(-1) - presented) > 0.0001)) presentedTimes.push(presented)
            }
            if (Number(document.querySelector('.timeline').value) >= 0.44) break
        }
        const timeline = document.querySelector('.timeline')
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(timeline, timeline.value)
        timeline.dispatchEvent(new Event('input', { bubbles: true }))
        timeline.dispatchEvent(new Event('change', { bubbles: true }))
        return { guardReadyBefore, sawIncoming, hiddenIncomingFrames, maxDecoders, presentedTimes }
    })()`)
    await settle(window)
    if (!result.guardReadyBefore || !result.sawIncoming || result.hiddenIncomingFrames !== 0 || result.maxDecoders > 2
        || result.presentedTimes.length < 2 || result.presentedTimes.some((value, index) => index > 0 && value <= result.presentedTimes[index - 1])) {
        throw new Error("G11 continuous video handoff was not prewarmed and continuously presentable.")
    }
    return result
}

const sceneExpression = `(() => {
    const stage = document.querySelector('.vitrine-stage')
    const logical = stage?.querySelector('.vitrine-logical-stage')
    if (!stage || !logical) throw new Error('Vitrine stage is missing.')
    const stageBox = stage.getBoundingClientRect()
    const logicalWidth = Number(stage.dataset.logicalWidth)
    const logicalHeight = Number(stage.dataset.logicalHeight)
    const normalizedBox = (element) => {
        const box = element.getBoundingClientRect()
        return {
            left: (box.left - stageBox.left) / stageBox.width,
            top: (box.top - stageBox.top) / stageBox.height,
            width: box.width / stageBox.width,
            height: box.height / stageBox.height,
        }
    }
    return {
        scene: stage.dataset.productScene,
        version: Number(stage.dataset.sceneVersion),
        hash: stage.dataset.evaluatorHash,
        phrase: stage.dataset.vitrinePhrase,
        currentId: stage.dataset.currentId || null,
        incomingId: stage.dataset.incomingId || null,
        semanticId: stage.dataset.semanticId || null,
        inspectionId: stage.dataset.vitrineInspection || null,
        transitionProgress: Number(stage.dataset.transitionProgress),
        interfaceScale: Number(document.querySelector('[data-interface-scale]')?.dataset.interfaceScale ?? 100),
        systemReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        exportMarker: {
            frameId: document.documentElement.dataset.exportFrameId ?? null,
            timeMs: document.documentElement.dataset.exportTimeMs ?? null,
        },
        stage: {
            clientWidth: stage.clientWidth,
            clientHeight: stage.clientHeight,
            visualWidth: stageBox.width,
            visualHeight: stageBox.height,
            logicalWidth,
            logicalHeight,
            perspective: parseFloat(getComputedStyle(logical).perspective),
        },
        planes: [...stage.querySelectorAll('.vitrine-plane')].map((plane) => {
            const media = plane.querySelector('.vitrine-media')
            const style = media ? getComputedStyle(media) : null
            const pose = {
                x: Number(plane.dataset.x), y: Number(plane.dataset.y), z: Number(plane.dataset.z),
                width: Number(plane.dataset.planeWidth), height: Number(plane.dataset.planeHeight),
                scale: Number(plane.dataset.planeScale), rotateX: Number(plane.dataset.rotateX), rotateY: Number(plane.dataset.rotateY),
            }
            return {
                id: plane.dataset.mediaId,
                role: plane.dataset.role,
                sourceIndex: Number(plane.dataset.sourceIndex),
                pose,
                normalizedPose: {
                    x: pose.x / logicalWidth, y: pose.y / logicalHeight, z: pose.z,
                    width: pose.width / logicalWidth, height: pose.height / logicalHeight,
                    scale: pose.scale, rotateX: pose.rotateX, rotateY: pose.rotateY,
                },
                box: normalizedBox(plane),
                frameIntent: {
                    fit: plane.dataset.frameFit,
                    crop: {
                        x: Number(plane.dataset.cropX), y: Number(plane.dataset.cropY),
                        width: Number(plane.dataset.cropWidth), height: Number(plane.dataset.cropHeight),
                    },
                    focal: { x: Number(plane.dataset.focalX), y: Number(plane.dataset.focalY) },
                },
                opacity: style?.opacity ?? null,
                filter: style?.filter ?? null,
                blend: style?.mixBlendMode ?? null,
                objectFit: style?.objectFit ?? null,
                objectPosition: style?.objectPosition ?? null,
                mediaGeometry: media ? {
                    left: media.style.left || null, top: media.style.top || null,
                    width: media.style.width || null, height: media.style.height || null,
                } : null,
                mediaTag: media?.tagName ?? null,
                storyReady: media?.dataset.storyReady ?? null,
                storyPresentedTime: media?.dataset.storyPresentedTime === undefined || media?.dataset.storyPresentedTime === "" ? null : Number(media.dataset.storyPresentedTime),
                shadow: getComputedStyle(plane).boxShadow,
                transform: plane.style.transform,
                failed: Boolean(plane.querySelector('[data-media-failed="true"]')),
            }
        }),
        placard: stage.querySelector('.vitrine-placard')?.dataset.mediaId ?? null,
        placardBox: stage.querySelector('.vitrine-placard') ? normalizedBox(stage.querySelector('.vitrine-placard')) : null,
        status: stage.querySelector('[role="status"]')?.textContent.trim() ?? null,
        background: getComputedStyle(stage).backgroundColor,
    }
})()`

async function readScene(window) {
    return window.webContents.executeJavaScript(sceneExpression)
}

function normalizedParity(left, right, tolerance = 0.006) {
    if (left.phrase !== right.phrase || left.planes.length !== right.planes.length || left.currentId !== right.currentId || left.incomingId !== right.incomingId) return false
    for (let index = 0; index < left.planes.length; index += 1) {
        const a = left.planes[index]
        const b = right.planes[index]
        if (a.id !== b.id || a.role !== b.role || a.objectFit !== b.objectFit || a.objectPosition !== b.objectPosition
            || JSON.stringify(a.frameIntent) !== JSON.stringify(b.frameIntent)
            || JSON.stringify(a.mediaGeometry) !== JSON.stringify(b.mediaGeometry)) return false
        for (const key of ["x", "y", "z", "width", "height", "scale", "rotateX", "rotateY"]) {
            if (Math.abs(a.normalizedPose[key] - b.normalizedPose[key]) > tolerance) return false
        }
        for (const key of ["left", "top", "width", "height"]) {
            if (Math.abs(a.box[key] - b.box[key]) > tolerance) return false
        }
    }
    return true
}

function observeExportFrames(targetFrames) {
    const observations = {}
    const pending = []
    const failures = []
    const listener = (event, payload) => {
        const frameIndex = Number(String(payload?.frameId ?? "").split("-").at(-1))
        if (payload?.error) failures.push(`frame ${frameIndex}: ${payload.error}`)
        if (!new RegExp(`^png-[a-f0-9]{24}-${frameIndex}$`).test(String(payload?.frameId ?? ""))) failures.push(`invalid frame identity ${payload?.frameId}`)
        if (!targetFrames.has(frameIndex)) return
        if (observations[frameIndex] || pending.some((entry) => entry.frameIndex === frameIndex)) {
            failures.push(`duplicate frame ${frameIndex}`)
            return
        }
        const exportWindow = BrowserWindow.fromWebContents(event.sender)
        if (!exportWindow) {
            failures.push(`missing export window for ${frameIndex}`)
            return
        }
        const promise = exportWindow.webContents.executeJavaScript(sceneExpression).then((value) => {
            if (value.exportMarker.frameId !== payload.frameId) throw new Error(`Export frame marker raced for ${payload.frameId}.`)
            const expectedTimeMs = frameIndex * 1_000 / 24
            if (value.exportMarker.timeMs !== String(expectedTimeMs)) {
                throw new Error(`Export frame ${frameIndex} carried the wrong exact story time.`)
            }
            if (value.planes.some((plane) => plane.failed || !["IMG", "VIDEO"].includes(plane.mediaTag)
                || (plane.mediaTag === "VIDEO" && plane.storyReady !== "true"))) throw new Error(`Export frame ${frameIndex} used an unverified source node.`)
            observations[frameIndex] = value
        })
        pending.push({ frameIndex, promise })
    }
    ipcMain.on("export:frame-ready", listener)
    return {
        async finish() {
            ipcMain.removeListener("export:frame-ready", listener)
            await Promise.all(pending.map((entry) => entry.promise))
            if (failures.length) throw new Error(failures.join("; "))
            for (const frameIndex of targetFrames) if (!observations[frameIndex]) throw new Error(`Missing export probe ${frameIndex}.`)
            return observations
        },
    }
}

function paeth(left, up, upperLeft) {
    const value = left + up - upperLeft
    const leftDistance = Math.abs(value - left)
    const upDistance = Math.abs(value - up)
    const diagonalDistance = Math.abs(value - upperLeft)
    return leftDistance <= upDistance && leftDistance <= diagonalDistance ? left : upDistance <= diagonalDistance ? up : upperLeft
}

function decodeRawRgbaPng(bytes, expectedWidth, expectedHeight) {
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("G11 PNG signature is invalid.")
    let offset = 8
    let width = 0
    let height = 0
    const idat = []
    while (offset < bytes.length) {
        const length = bytes.readUInt32BE(offset)
        const type = bytes.toString("ascii", offset + 4, offset + 8)
        const data = bytes.subarray(offset + 8, offset + 8 + length)
        if (type === "IHDR") {
            width = data.readUInt32BE(0)
            height = data.readUInt32BE(4)
            if (data[8] !== 8 || data[9] !== 6 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) throw new Error("G11 PNG is not non-interlaced RGBA8.")
        } else if (type === "IDAT") idat.push(data)
        offset += 12 + length
        if (type === "IEND") break
    }
    if (width !== expectedWidth || height !== expectedHeight || idat.length < 1) throw new Error("G11 PNG dimensions/chunks are invalid.")
    const inflated = zlib.inflateSync(Buffer.concat(idat))
    const stride = width * 4
    if (inflated.length !== height * (stride + 1)) throw new Error("G11 PNG scanline length is invalid.")
    const rgba = Buffer.alloc(width * height * 4)
    let source = 0
    for (let y = 0; y < height; y += 1) {
        const filter = inflated[source++]
        if (filter > 4) throw new Error("G11 PNG filter is invalid.")
        for (let x = 0; x < stride; x += 1) {
            const raw = inflated[source++]
            const target = y * stride + x
            const left = x >= 4 ? rgba[target - 4] : 0
            const up = y > 0 ? rgba[target - stride] : 0
            const upperLeft = y > 0 && x >= 4 ? rgba[target - stride - 4] : 0
            const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upperLeft)
            rgba[target] = (raw + predictor) & 0xff
        }
    }
    return rgba
}

function inspectArtwork(destination, manifest) {
    let transparentPixels = 0
    let partialAlphaPixels = 0
    let opaquePixels = 0
    let zeroAlphaRgbViolations = 0
    const palette = new Map([["239,78,74", 0], ["34,89,214", 0]])
    const tupleCounts = new Map([...palette.keys()].flatMap((rgb) => [64, 128, 192, 255].map((alpha) => [`${rgb},${alpha}`, 0])))
    for (const frameIndex of manifest.frames.keys()) {
        const frame = manifest.frames[frameIndex]
        const bytes = stableFileBytes(path.join(destination, frame.name), Math.max(1_000_000, frame.bytes))
        const inspected = inspectPng(bytes, { width: manifest.width, height: manifest.height, alpha: true })
        if (inspected.sha256 !== frame.sha256 || inspected.bytes !== frame.bytes) throw new Error("G11 PNG frame hash readback failed.")
        const rgba = decodeRawRgbaPng(bytes, manifest.width, manifest.height)
        for (let offset = 0; offset < rgba.length; offset += 4) {
            const red = rgba[offset]
            const green = rgba[offset + 1]
            const blue = rgba[offset + 2]
            const alpha = rgba[offset + 3]
            if (alpha === 0) {
                transparentPixels += 1
                if (red || green || blue) zeroAlphaRgbViolations += 1
            } else if (alpha === 255) {
                opaquePixels += 1
                const key = `${red},${green},${blue}`
                if (palette.has(key)) palette.set(key, palette.get(key) + 1)
            } else partialAlphaPixels += 1
            const tuple = `${red},${green},${blue},${alpha}`
            if (tupleCounts.has(tuple)) tupleCounts.set(tuple, tupleCounts.get(tuple) + 1)
        }
    }
    const paletteCounts = Object.fromEntries(palette)
    const sourceTupleCounts = Object.fromEntries(tupleCounts)
    if (transparentPixels < 1 || partialAlphaPixels < 1 || opaquePixels < 64 || zeroAlphaRgbViolations !== 0
        || Object.values(paletteCounts).some((count) => count < 1) || Object.values(sourceTupleCounts).some((count) => count < 1)) {
        throw new Error("G11 raw PNG alpha/source-pixel evidence failed.")
    }
    return { transparentPixels, partialAlphaPixels, opaquePixels, zeroAlphaRgbViolations, paletteCounts, sourceTupleCounts }
}

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical)
    if (!value || typeof value !== "object") return value
    return Object.keys(value).sort().reduce((result, key) => {
        result[key] = canonical(value[key])
        return result
    }, {})
}

function projectEvidence(projectDocument) {
    const project = JSON.parse(projectDocument)
    const grants = []
    const ordinals = new Map()
    const scrub = (value) => {
        if (typeof value === "string" && GRANT.test(value)) {
            grants.push(value)
            if (!ordinals.has(value)) ordinals.set(value, ordinals.size + 1)
            return `reel-media://grant/#${ordinals.get(value)}`
        }
        if (Array.isArray(value)) return value.map(scrub)
        if (!value || typeof value !== "object") return value
        return Object.keys(value).sort().reduce((result, key) => {
            result[key] = scrub(value[key])
            return result
        }, {})
    }
    return {
        project,
        semanticSha256: sha256(JSON.stringify(canonical(scrub(project)))),
        grantCount: new Set(grants).size,
        grantDigest: sha256([...new Set(grants)].sort().join("\n")),
    }
}

function projectFrameIntents(project) {
    return project.items.map((item) => ({
        id: item.id,
        aspectMode: item.aspectMode,
        ratioW: item.ratioW,
        ratioH: item.ratioH,
        fit: item.fit,
        crop: item.crop,
        focal: item.focal,
    }))
}

function assertSamePose(left, right, ignored = []) {
    const ignoredKeys = new Set(ignored)
    assert.deepEqual(left.planes.map((plane) => plane.id), right.planes.map((plane) => plane.id))
    left.planes.forEach((plane, index) => {
        for (const key of Object.keys(plane.pose)) {
            if (!ignoredKeys.has(key)) assert.equal(plane.pose[key], right.planes[index].pose[key], `${key} changed unexpectedly`)
        }
    })
}

async function causalControls(window) {
    await setRange(window, "Presentation scale · height cap", 62)
    await setRange(window, "Object turn", 5)
    await setRange(window, "Transition depth", 18)
    await chooseSegment(window, "Exchange direction", "Left")
    await chooseSegment(window, "Placard", "Clean")
    await scrub(window, 0.375)
    const baseline = await readScene(window)
    await setRange(window, "Presentation scale · height cap", 70)
    await scrub(window, 0.375)
    const presentationScale = await readScene(window)
    assert.equal(presentationScale.transitionProgress, baseline.transitionProgress)
    assert(presentationScale.planes.some((plane, index) => plane.pose.width !== baseline.planes[index].pose.width || plane.pose.height !== baseline.planes[index].pose.height))
    assert(presentationScale.planes.some((plane, index) => Math.abs(plane.box.width - baseline.planes[index].box.width) > 0.0001 || Math.abs(plane.box.height - baseline.planes[index].box.height) > 0.0001))
    await setRange(window, "Presentation scale · height cap", 62)

    await setRange(window, "Object turn", 8)
    await scrub(window, 0.375)
    const objectTurn = await readScene(window)
    assertSamePose(baseline, objectTurn, ["rotateY"])
    assert(objectTurn.planes.some((plane, index) => plane.pose.rotateY !== baseline.planes[index].pose.rotateY))
    assert(objectTurn.planes.some((plane, index) => plane.transform !== baseline.planes[index].transform
        && ["left", "top", "width", "height"].some((key) => Math.abs(plane.box[key] - baseline.planes[index].box[key]) > 0.0001)))
    await setRange(window, "Object turn", 5)

    await setRange(window, "Transition depth", 24)
    await scrub(window, 0.375)
    const transitionDepth = await readScene(window)
    assertSamePose(baseline, transitionDepth, ["y", "z", "scale", "rotateX"])
    assert(transitionDepth.planes.some((plane, index) => plane.pose.z !== baseline.planes[index].pose.z))
    assert(transitionDepth.planes.some((plane, index) => plane.transform !== baseline.planes[index].transform
        && ["left", "top", "width", "height"].some((key) => Math.abs(plane.box[key] - baseline.planes[index].box[key]) > 0.0001)))
    await setRange(window, "Transition depth", 18)

    await chooseSegment(window, "Exchange direction", "Right")
    await scrub(window, 0.375)
    const transitionDirection = await readScene(window)
    assert.equal(transitionDirection.currentId, baseline.currentId)
    assert.equal(transitionDirection.incomingId, baseline.incomingId)
    baseline.planes.forEach((plane, index) => {
        const mirror = transitionDirection.planes[index]
        assert(Math.abs(plane.pose.x + mirror.pose.x - baseline.stage.logicalWidth) < 0.0001)
        assert(Math.abs(plane.pose.rotateY + mirror.pose.rotateY) < 0.0001)
        assert(Math.abs((plane.box.left + plane.box.width / 2) + (mirror.box.left + mirror.box.width / 2) - 1) < 0.01)
        assert(Math.abs(plane.box.width - mirror.box.width) < 0.01)
        assert(Math.abs(plane.box.height - mirror.box.height) < 0.01)
        for (const key of ["y", "z", "width", "height", "scale", "rotateX"]) assert.equal(plane.pose[key], mirror.pose[key])
    })
    await chooseSegment(window, "Exchange direction", "Left")

    await chooseSegment(window, "Placard", "Visible")
    await scrub(window, 0.375)
    const placard = await readScene(window)
    assert.equal(baseline.placard, null)
    assert(placard.placard && placard.placardBox && placard.placardBox.width > 0 && placard.placardBox.height > 0)
    assertSamePose(baseline, placard)
    await chooseSegment(window, "Placard", "Clean")

    await setRange(window, "Presentation scale · height cap", 70)
    await setRange(window, "Object turn", 8)
    await setRange(window, "Transition depth", 24)
    await chooseSegment(window, "Exchange direction", "Right")
    await chooseSegment(window, "Placard", "Visible")
    return { baseline, presentationScale, objectTurn, transitionDepth, transitionDirection, placard }
}

async function runG11VitrineSmoke(window, evidenceRoot, mode = process.env.REEL_G11_RENDERER_MODE ?? "save") {
    if (!["save", "reopen"].includes(mode)) throw new Error("G11 Vitrine smoke mode is invalid.")
    const destinationValue = process.env.REEL_G11_PNG_DESTINATION
    const projectValue = process.env.REEL_G03_PROJECT_PATH
    if (!destinationValue || !projectValue) throw new Error("G11 Vitrine smoke needs Project and PNG destinations.")
    const destination = path.resolve(destinationValue)
    const projectPath = path.resolve(projectValue)
    fs.mkdirSync(evidenceRoot, { recursive: true })
    if (fs.realpathSync.native(evidenceRoot) !== path.resolve(evidenceRoot)) throw new Error("G11 evidence root contains a symbolic link.")
    const identity = await window.webContents.executeJavaScript("window.galleryHost.identity()")
    const lastPreferences = window.webContents.getLastWebPreferences()
    const rendererSecurity = {
        contextIsolation: lastPreferences.contextIsolation,
        nodeIntegration: lastPreferences.nodeIntegration,
        sandbox: lastPreferences.sandbox,
        partition: identity.rendererSecurity?.partition,
    }
    if (identity.productId !== "galileo-gallery" || identity.profile !== "g03-linux-host-port" || identity.packaged !== true
        || identity.sourceSha !== process.env.GALLERY_SOURCE_SHA || identity.sourceTree !== process.env.GALLERY_SOURCE_TREE
        || identity.platform !== "linux" || identity.architecture !== process.arch || identity.appVersion !== require("../package.json").version
        || JSON.stringify(rendererSecurity) !== JSON.stringify({ contextIsolation: true, nodeIntegration: false, sandbox: true, partition: "persist:galileo-gallery-g03" })
        || window.webContents.session !== session.fromPartition("persist:galileo-gallery-g03")) throw new Error("G11 packaged host identity is wrong.")
    assert.match(identity.buildId, /^g03-[a-z0-9]+$/, "G11 packaged build identity is invalid")
    const executable = fileEvidence(process.execPath)
    const appAsar = fileEvidence(path.join(process.resourcesPath, "app.asar"))
    const ffmpegPath = path.join(process.resourcesPath, "ffmpeg", "ffmpeg")
    const ffmpeg = fileEvidence(ffmpegPath)
    const ffmpegVersionRead = spawnSync(ffmpegPath, ["-version"], { encoding: "utf8", env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" } })
    if (ffmpegVersionRead.status !== 0) throw new Error("G11 packaged FFmpeg identity could not be executed.")
    const ffmpegVersion = parsePackagedFfmpegVersion(ffmpegVersionRead.stdout)
    if (!ffmpegVersion) throw new Error("G11 packaged FFmpeg version is malformed.")
    if (process.env.G11_EXPECTED_FFMPEG_SHA && process.env.G11_EXPECTED_FFMPEG_SHA !== ffmpeg.sha256) throw new Error("G11 packaged FFmpeg digest differs from runner identity.")
    const sandboxPath = path.join(path.dirname(process.execPath), "chrome-sandbox")
    const sandboxHelper = fileEvidence(sandboxPath)
    if (sandboxHelper.uid !== 0 || sandboxHelper.mode !== 0o4755) throw new Error("G11 packaged Chromium sandbox helper is not root-owned mode 4755.")
    if (process.env.G11_EXPECTED_EXECUTABLE_SHA && executable.sha256 !== process.env.G11_EXPECTED_EXECUTABLE_SHA) throw new Error("G11 executable digest is wrong.")
    if (process.env.G11_EXPECTED_APP_ASAR_SHA && appAsar.sha256 !== process.env.G11_EXPECTED_APP_ASAR_SHA) throw new Error("G11 app.asar digest is wrong.")

    await until(window, "document.querySelector('.style-gallery-shell')", "Scene catalogue")
    await clickText(window, "button", "Back to studio")
    await until(window, "document.querySelector('.app-shell')", "studio")
    const presentationInitial = await presentationState(window)
    if (mode === "reopen" && presentationInitial.interfaceScale !== 100) throw new Error("Saved Interface Scale did not reopen at 100%.")
    const openNotice = await projectAction(window, "Open project", "Project opened")
    await until(window, "document.querySelectorAll('.media-row').length === 2 && document.querySelector('.vitrine-stage[data-scene-version=\"2\"]')", "opened Vitrine v2 Project")
    await until(window, "!document.querySelector('.launch-screen')", "launch transition", 15_000)
    await scrub(window, 0.125)
    const decoderEvidence = await window.webContents.executeJavaScript(`({
        activePlanes: document.querySelectorAll('.vitrine-plane').length,
        activeVideos: document.querySelectorAll('.vitrine-stage video').length,
        readyVideos: document.querySelectorAll('.vitrine-stage video[data-story-ready="true"]').length,
        guardVideos: document.querySelectorAll('.vitrine-guard video[data-story-ready="true"]').length,
        libraryVideos: document.querySelectorAll('.media-list video').length,
    })`)
    if (decoderEvidence.activePlanes > 2 || decoderEvidence.activeVideos > 2 || decoderEvidence.readyVideos !== decoderEvidence.activeVideos || decoderEvidence.guardVideos !== 1 || decoderEvidence.libraryVideos !== 0) throw new Error(`G11 video guard or two-decoder budget is wrong: ${JSON.stringify(decoderEvidence)}`)
    const libraryKeyboard = await libraryKeyboardEvidence(window)

    let projectDocument = await window.webContents.executeJavaScript(`localStorage.getItem(${JSON.stringify(PROJECT_KEY)})`)
    let projectReceipt = projectEvidence(projectDocument)
    let project = projectReceipt.project
    if (project.styleId !== "vitrine" || project.sceneVersion !== 2 || project.items.map((item) => item.id).join(",") !== "vitrine-square,vitrine-portrait") throw new Error("G11 Project identity/order did not survive open.")
    assert.deepEqual(projectFrameIntents(project), EXPECTED_FRAME_INTENTS, "G11 per-frame fit/crop/focal intent did not open exactly")
    if (mode === "reopen" && (project.settings.slideHeight !== 70 || project.settings.tilt !== 8 || project.settings.sway !== 24
        || project.settings.transitionDirection !== "right" || project.settings.showHint !== true)) throw new Error("G11 saved Vitrine controls did not reopen.")

    const screenshots = {}
    let controlEvidence = null
    let interactionEvidence = null
    let saveNotice = null
    if (mode === "save") {
        interactionEvidence = await vitrineInteractionEvidence(window)
        controlEvidence = await causalControls(window)
        saveNotice = await projectAction(window, "Save project", "Project saved · media included")
        projectDocument = await window.webContents.executeJavaScript(`localStorage.getItem(${JSON.stringify(PROJECT_KEY)})`)
        projectReceipt = projectEvidence(projectDocument)
        project = projectReceipt.project
        assert.deepEqual(projectFrameIntents(project), EXPECTED_FRAME_INTENTS, "G11 per-frame fit/crop/focal intent did not save exactly")
        if (project.settings.slideHeight !== 70 || project.settings.tilt !== 8 || project.settings.sway !== 24
            || project.settings.transitionDirection !== "right" || project.settings.showHint !== true) throw new Error("G11 control changes were not saved.")
        interactionEvidence.documentBoundary = await documentBoundaryEvidence(window)
        projectDocument = await window.webContents.executeJavaScript(`localStorage.getItem(${JSON.stringify(PROJECT_KEY)})`)
        projectReceipt = projectEvidence(projectDocument)
        project = projectReceipt.project
    }

    await setScale(window, 100)
    await scrub(window, 0.125)
    const holdA = await readScene(window)
    if (holdA.planes.length !== 1 || holdA.planes[0].id !== "vitrine-square") throw new Error("G11 first readable object is wrong.")
    assert.deepEqual(holdA.planes[0].frameIntent, { fit: "cover", crop: { x: 0, y: 0, width: 1, height: 1 }, focal: { x: 0.2, y: 0.3 } })
    assert.equal(holdA.planes[0].objectFit, "cover")
    assert.equal(holdA.planes[0].objectPosition, "20% 30%")
    screenshots.hold = await capture(window, evidenceRoot, `vitrine-${mode}-hold-a`)
    const reducedTransport = mode === "reopen" ? await reducedTransportEvidence(window) : null
    const continuousVideoHandoff = mode === "save" ? await continuousVideoHandoffEvidence(window) : null
    await scrub(window, 0.375)
    const exchange = await readScene(window)
    if (mode === "save" && exchange.phrase !== "exchange") throw new Error("G11 authored preview exchange is wrong.")
    if (mode === "reopen" && exchange.phrase !== "reduced-motion-settled") throw new Error("G11 reduced-motion preview did not settle.")
    if (exchange.planes.some((plane) => plane.opacity !== "1" || plane.filter !== "none" || plane.blend !== "normal" || plane.shadow !== "none" || plane.failed)) throw new Error("G11 source treatment is not faithful.")
    screenshots.exchange = await capture(window, evidenceRoot, `vitrine-${mode}-exchange`)
    let semanticHandoff = null
    if (mode === "save") {
        await scrub(window, 0.42)
        semanticHandoff = await readScene(window)
        if (semanticHandoff.semanticId !== "vitrine-portrait" || semanticHandoff.status !== "Showing Field portrait, item 2 of 2") throw new Error("G11 semantic handoff did not announce the incoming source at the midpoint.")
    }
    await scrub(window, 0.5)
    const holdB = await readScene(window)
    if (mode === "save") {
        if (holdB.planes.length !== 1 || holdB.planes[0].id !== "vitrine-portrait") throw new Error("G11 handoff identity is wrong.")
        assert.deepEqual(holdB.planes[0].frameIntent, { fit: "contain", crop: { x: 0, y: 0.25, width: 1, height: 0.5 }, focal: { x: 0.8, y: 0.7 } })
        assert.equal(holdB.planes[0].objectFit, "fill")
        assert.equal(holdB.planes[0].mediaTag, "VIDEO")
        assert.equal(holdB.planes[0].storyReady, "true")
        assert.deepEqual(holdB.planes[0].mediaGeometry, { left: "0%", top: "-50%", width: "100%", height: "200%" })
        assert(Math.abs(holdB.planes[0].pose.width / holdB.planes[0].pose.height - 1.6) < 1e-9)
    } else {
        if (holdB.planes.length !== 1 || holdB.planes[0].id !== "vitrine-portrait" || holdB.currentId !== "vitrine-portrait") {
            throw new Error("G11 reduced-motion loop did not step discretely to its authored chapter.")
        }
        if (holdB.planes[0].mediaTag !== "VIDEO" || holdB.planes[0].storyPresentedTime !== 0) {
            throw new Error("G11 reduced-motion source video was not settled on its first frame.")
        }
    }

    let terminalVideo = null
    if (mode === "save") {
        await chooseNamedSegment(window, "End behavior", "Once")
        await scrub(window, 1)
        terminalVideo = await readScene(window)
        if (terminalVideo.phrase !== "exit" || terminalVideo.currentId !== "vitrine-portrait" || terminalVideo.planes[0]?.mediaTag !== "VIDEO"
            || terminalVideo.planes[0]?.storyReady !== "true" || terminalVideo.planes[0]?.storyPresentedTime < 1.9 || terminalVideo.planes[0]?.storyPresentedTime >= 2) {
            throw new Error("G11 finite source video did not retain a presentable verified final frame.")
        }
        await chooseNamedSegment(window, "End behavior", "Forever")
        await scrub(window, 0.5)
    }

    const scaleEvidence = {}
    const targetEvidence = {}
    for (const scale of [75, 100, 200]) {
        await setScale(window, scale)
        await scrub(window, 0.375)
        scaleEvidence[scale] = await readScene(window)
        targetEvidence[scale] = await vitrineTargetEvidence(window)
        screenshots[`scale${scale}`] = await capture(window, evidenceRoot, `vitrine-${mode}-scale-${scale}`)
        const sample = scaleEvidence[scale]
        if (sample.currentId !== exchange.currentId || sample.incomingId !== exchange.incomingId) throw new Error("Interface Scale changed Vitrine semantics.")
        if (Math.abs(sample.stage.perspective / sample.stage.logicalWidth - 1.46) > 0.0001) throw new Error("Vitrine perspective is not Project-canvas relative.")
        if (Math.abs(sample.stage.visualWidth / sample.stage.clientWidth - scale / 100) > 0.035) throw new Error("Interface Scale visual/logical geometry is wrong.")
        if (!normalizedParity(exchange, sample)) throw new Error("Interface Scale changed normalized Vitrine geometry.")
    }
    await setScale(window, 105)
    await setScale(window, 100)
    const presentationFinal = await presentationState(window)

    const designTruth = await window.webContents.executeJavaScript(`({
        motionGrid: Boolean(document.querySelector('.motion-grid')),
        backgroundGroup: document.querySelector('.background-style-grid')?.getAttribute('aria-label') ?? null,
        backgrounds: [...document.querySelectorAll('.background-style-grid button')].map((button) => ({ label: button.textContent.trim(), pressed: button.getAttribute('aria-pressed') })),
    })`)
    if (designTruth.motionGrid || designTruth.backgroundGroup !== "Room background"
        || designTruth.backgrounds.map((entry) => entry.label).join(",") !== "solid,transparent"
        || designTruth.backgrounds.filter((entry) => entry.pressed === "true").map((entry) => entry.label).join(",") !== "transparent") {
        throw new Error("G11 Design exposed noncausal or inaccessible Vitrine background controls.")
    }
    await clickText(window, ".inspector-top button", "Expert")
    const expertTruth = {}
    for (const tab of ["frame", "story", "timing", "look"]) {
        await clickText(window, ".expert-tabs button", tab)
        expertTruth[tab] = await window.webContents.executeJavaScript(`(() => {
            const body = document.querySelector('.expert-tab-body')
            return {
                text: body.textContent.replace(/\\s+/g, ' ').trim(),
                controls: [...body.querySelectorAll('.expert-field > span:first-child, .color-row > span:first-child, .toggle-copy > strong, .range-row > span:first-child')].map((node) => node.textContent.trim()),
            }
        })()`)
    }
    const presetTruth = await window.webContents.executeJavaScript("[...document.querySelectorAll('.expert-presets button')].map((button) => button.textContent.trim())")
    if (presetTruth.join(",") !== "Restore Defaults"
        || expertTruth.frame.controls.some((label) => /Padding|Autoplay clips/.test(label))
        || !/Presentation scale|Object turn|Transition depth|Placard/.test(expertTruth.story.text)
        || expertTruth.timing.controls.some((label) => /Starts|Lead-in|Motion feel/.test(label))
        || expertTruth.look.controls.join(",") !== "Background") throw new Error("G11 Expert controls are unsafe or noncausal.")

    await clickText(window, ".inspector-top button", "Export")
    await until(window, "document.querySelector('.export-panel')", "Export panel")
    const blockedAlphaTruth = await window.webContents.executeJavaScript(`(() => {
        const card = [...document.querySelectorAll('.format-cards button')].find((button) => button.textContent.includes('PNG Frames'))
        return { disabled: card?.disabled ?? false, text: card?.textContent.replace(/\\s+/g, ' ').trim() ?? '', exportDisabled: document.querySelector('.export-button')?.disabled ?? false }
    })()`)
    if (blockedAlphaTruth.disabled || blockedAlphaTruth.exportDisabled || !blockedAlphaTruth.text.includes("Verified sequence")) throw new Error("G11 explicitly-authored Placard was incorrectly blocked from transparent export.")
    await clickText(window, ".inspector-top button", "Design")
    await chooseSegment(window, "Placard", "Clean")
    await scrub(window, 0.375)
    const cleanAlphaPreview = await readScene(window)
    if (cleanAlphaPreview.placard !== null) throw new Error("G11 isolated alpha preview still contains Placard pixels.")
    await clickText(window, ".inspector-top button", "Export")
    await until(window, "document.querySelector('.export-panel')", "clean export panel")
    await window.webContents.executeJavaScript(`(() => {
        const rate = [...document.querySelectorAll('.compact-controls > div')].find((candidate) => candidate.querySelector('.field-label')?.textContent.trim() === 'Frame rate')
        ;[...rate.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === '24')?.click()
    })()`)
    const formatTruth = await window.webContents.executeJavaScript("[...document.querySelectorAll('.format-cards button')].map((button) => ({ text: button.textContent.replace(/\\s+/g, ' ').trim(), disabled: button.disabled }))")
    if (formatTruth[0]?.disabled || !formatTruth[0]?.text.includes("Verified sequence") || !formatTruth[1]?.disabled || !formatTruth[1]?.text.includes("Quiet Carousel only")) throw new Error("G11 export capability UI is false.")
    const observer = observeExportFrames(new Set([0, 6, 15, 18, 24, 47]))
    await clickText(window, ".export-button", "Export verified PNG Frames")
    await until(window, "document.querySelector('.export-success strong')?.textContent.includes('PNG Frames verified')", "verified PNG Frames", 120_000)
    const exportProbes = await observer.finish()
    if (mode === "save" && !normalizedParity(exchange, exportProbes[18])) throw new Error("G11 preview and PNG export do not share Project-canvas evaluator geometry.")
    if (exportProbes[6]?.phrase !== "readable-hold" || exportProbes[15]?.phrase !== "exchange" || exportProbes[24]?.planes[0]?.id !== "vitrine-portrait") throw new Error("G11 exported boundary phrases are wrong.")
    if (Object.values(exportProbes).some((probe) => probe.phrase === "reduced-motion-settled")) throw new Error("Reduced motion leaked into deterministic export.")
    if (Object.values(exportProbes).some((probe) => probe.placard !== null)) throw new Error("Placard contaminated the isolated transparent alpha proof.")

    const manifestPath = path.join(destination, "manifest.json")
    const manifestBytes = stableFileBytes(manifestPath, 5_000_000)
    const manifest = JSON.parse(manifestBytes)
    if (manifest.format !== "galileo-gallery-png-frames" || manifest.scene?.id !== "vitrine" || manifest.scene?.version !== 2
        || manifest.width !== 96 || manifest.height !== 64 || manifest.fps !== 24 || manifest.durationMs !== 2_000 || manifest.frameCount !== 48
        || manifest.frames.length !== 48 || manifest.alpha !== true || manifest.audio !== "none") throw new Error("G11 PNG manifest truth is wrong.")
    for (const frame of manifest.frames) {
        const bytes = stableFileBytes(path.join(destination, frame.name), 1_000_000)
        const inspected = inspectPng(bytes, { width: 96, height: 64, alpha: true })
        if (inspected.bytes !== frame.bytes || inspected.sha256 !== frame.sha256) throw new Error("G11 PNG manifest/frame identity mismatch.")
    }
    const artwork = inspectArtwork(destination, manifest)
    screenshots.success = await capture(window, evidenceRoot, `vitrine-${mode}-export-success`)
    const receipt = {
        mode,
        journey: { openNotice, saveNotice },
        package: {
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
            sandboxHelper,
            executable,
            appAsar,
            ffmpeg: { ...ffmpeg, version: ffmpegVersion },
        },
        project: {
            styleId: project.styleId,
            sceneVersion: project.sceneVersion,
            orderedMediaIds: project.items.map((item) => item.id),
            semanticSha256: projectReceipt.semanticSha256,
            grantCount: projectReceipt.grantCount,
            grantDigest: projectReceipt.grantDigest,
            archiveSha256: sha256(stableFileBytes(projectPath, 100_000_000)),
            audioSha256: sha256(JSON.stringify(canonical(project.audio))),
            frameIntents: projectFrameIntents(project),
            persistedControls: {
                presentationScale: project.settings.slideHeight,
                objectTurn: project.settings.tilt,
                transitionDepth: project.settings.sway,
                transitionDirection: project.settings.transitionDirection,
                placard: project.settings.showHint,
            },
        },
        presentation: { initial: presentationInitial, final: presentationFinal },
        preview: { holdA, exchange, semanticHandoff, holdB, terminalVideo, continuousVideoHandoff, reducedTransport, scales: scaleEvidence, cleanAlpha: cleanAlphaPreview, reducedMotionExpected: mode === "reopen" },
        controls: { causal: controlEvidence, interaction: interactionEvidence, libraryKeyboard, decoderEvidence, targets: targetEvidence, design: designTruth, expert: expertTruth, presets: presetTruth, blockedAlpha: blockedAlphaTruth, formats: formatTruth },
        export: { placardVisible: false, probes: exportProbes, manifestSha256: sha256(manifestBytes), frameHashes: manifest.frames.map((frame) => frame.sha256), artwork },
        screenshots,
    }
    assertNoPrivateEvidence(receipt)
    const serialized = JSON.stringify(receipt, null, 2)
    fs.writeFileSync(path.join(evidenceRoot, "receipt.json"), `${serialized}\n`)
}

module.exports = { assertNoPrivateEvidence, inspectArtwork, parsePackagedFfmpegVersion, runG11VitrineSmoke }
