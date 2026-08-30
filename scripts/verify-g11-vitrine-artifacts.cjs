const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { assertNoPrivateEvidence, inspectArtwork } = require("../electron/g11-vitrine-smoke.cjs")
const { inspectPng } = require("../electron/png-frames-runtime.cjs")
const approvedFfmpeg = require("./ffmpeg-approved-binaries.json")

const root = path.resolve(process.argv[2] || "artifacts/g11")
const projectPath = path.resolve(process.argv[3] || path.join(root, "vitrine-v2.galileo"))
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex")

function capturePathAuthority(resolved) {
    const rootPath = path.parse(resolved).root
    const chain = []
    let current = rootPath
    for (const part of resolved.slice(rootPath.length).split(path.sep).filter(Boolean).slice(0, -1)) {
        current = path.join(current, part)
        const stat = fs.lstatSync(current)
        assert(stat.isDirectory() && !stat.isSymbolicLink(), `${current} is not an exact artifact ancestor`)
        chain.push({ path: current, dev: stat.dev, ino: stat.ino })
    }
    return chain
}

function verifyPathAuthority(resolved, chain) {
    for (const expected of chain) {
        const stat = fs.lstatSync(expected.path)
        assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.dev === expected.dev && stat.ino === expected.ino, `${expected.path} changed during artifact read`)
    }
    assert.equal(fs.realpathSync.native(resolved), resolved, `${resolved} or an ancestor is a symbolic link`)
}

function stableRead(file, maximumBytes) {
    const resolved = path.resolve(file)
    const authority = capturePathAuthority(resolved)
    verifyPathAuthority(resolved, authority)
    const stat = fs.lstatSync(resolved)
    assert(stat.isFile() && !stat.isSymbolicLink(), `${file} is not a regular artifact file`)
    assert(stat.size > 0 && stat.size <= maximumBytes, `${file} has an unsafe artifact size`)
    const handle = fs.openSync(resolved, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
    try {
        const before = fs.fstatSync(handle)
        assert(before.isFile() && before.dev === stat.dev && before.ino === stat.ino && before.size === stat.size
            && before.mtimeMs === stat.mtimeMs && before.ctimeMs === stat.ctimeMs, `${file} changed before read`)
        const bytes = fs.readFileSync(handle)
        const after = fs.fstatSync(handle)
        const finalLink = fs.lstatSync(resolved)
        assert.equal(bytes.length, before.size)
        for (const key of ["dev", "ino", "size", "mtimeMs", "ctimeMs"]) {
            assert.equal(after[key], before[key], `${file} changed during descriptor read`)
            assert.equal(finalLink[key], before[key], `${file} path identity changed during read`)
        }
        verifyPathAuthority(resolved, authority)
        return { stat: before, bytes }
    } finally {
        fs.closeSync(handle)
    }
}

function regularFile(file, maximumBytes) { return stableRead(file, maximumBytes).stat }

function boundedJSON(file, maximumBytes) {
    const { bytes } = stableRead(file, maximumBytes)
    return { bytes, value: JSON.parse(bytes.toString("utf8")) }
}

function safeNamedFile(directory, name, pattern, maximumBytes) {
    assert.equal(typeof name, "string")
    assert.equal(name, path.basename(name))
    assert.equal(/[\\/]/.test(name), false)
    assert.match(name, pattern)
    const parent = path.resolve(directory)
    assert.equal(fs.realpathSync.native(parent), parent)
    const parentStat = fs.lstatSync(parent)
    assert(parentStat.isDirectory() && !parentStat.isSymbolicLink())
    const target = path.resolve(parent, name)
    assert.equal(path.dirname(target), parent)
    stableRead(target, maximumBytes)
    return target
}

function evidenceShape(value) {
    assert(Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes < 1_000_000_000)
    assert.match(value.sha256, /^[a-f0-9]{64}$/)
}

const runs = [
    { id: "run-a", mode: "save", frameDirectory: "run-a-frames" },
    { id: "run-b", mode: "reopen", frameDirectory: "run-b-frames" },
]
assert.equal(fs.realpathSync.native(root), root, "G11 artifact root or an ancestor is a symbolic link")
assert(fs.lstatSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink())
const receiptFiles = runs.map((run) => boundedJSON(path.join(root, run.id, "receipt.json"), 20_000_000))
const receipts = receiptFiles.map((entry) => entry.value)
const manifestFiles = runs.map((run) => boundedJSON(path.join(root, run.frameDirectory, "manifest.json"), 5_000_000))
const manifests = manifestFiles.map((entry) => entry.value)
assert.deepEqual(receipts.map((receipt) => receipt.mode), ["save", "reopen"])

const expectedFrameIntents = [
    { id: "vitrine-square", aspectMode: "custom", ratioW: 16, ratioH: 9, fit: "cover", crop: { x: 0, y: 0, width: 1, height: 1 }, focal: { x: 0.2, y: 0.3 } },
    { id: "vitrine-portrait", aspectMode: "auto", ratioW: 4, ratioH: 5, fit: "contain", crop: { x: 0, y: 0.25, width: 1, height: 0.5 }, focal: { x: 0.8, y: 0.7 } },
]
const expectedScreenshots = ["exchange", "export-success", "hold-a", "scale-100", "scale-200", "scale-75"]
const expectedFiles = new Set([
    "vitrine-v2.galileo",
    "sources/vitrine-square.png",
    "sources/vitrine-portrait.mp4",
    ...runs.flatMap((run) => [`${run.id}/receipt.json`, `${run.frameDirectory}/manifest.json`]),
])

for (const [index, receipt] of receipts.entries()) {
    const run = runs[index]
    assertNoPrivateEvidence(receipt)
    assertNoPrivateEvidence(manifests[index])
    if (process.env.G11_EXPECTED_SHA) assert.equal(receipt.package.sourceSha, process.env.G11_EXPECTED_SHA)
    if (process.env.G11_EXPECTED_TREE) assert.equal(receipt.package.sourceTree, process.env.G11_EXPECTED_TREE)
    assert.equal(receipt.package.productId, "galileo-gallery")
    assert.equal(receipt.package.profile, "g03-linux-host-port")
    assert.equal(receipt.package.packaged, true)
    assert.equal(receipt.package.platform, "linux")
    assert.equal(receipt.package.architecture, "x64")
    assert.equal(receipt.package.appVersion, require("../package.json").version)
    assert.deepEqual(receipt.package.rendererSecurity, { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: "persist:galileo-gallery-g03" })
    assert.match(receipt.package.runtime.electron, /^43\.1\.0$/)
    assert.match(receipt.package.runtime.chromium, /^\d+\.\d+\.\d+\.\d+$/)
    assert.match(receipt.package.runtime.node, /^\d+\.\d+\.\d+$/)
    assert.match(receipt.package.buildId, /^g03-[a-z0-9]+$/)
    evidenceShape(receipt.package.executable)
    evidenceShape(receipt.package.appAsar)
    evidenceShape(receipt.package.ffmpeg)
    assert.equal(receipt.package.ffmpeg.version, approvedFfmpeg.version)
    assert.equal(receipt.package.ffmpeg.sha256, approvedFfmpeg.sha256["linux-x64"])
    evidenceShape(receipt.package.sandboxHelper)
    assert.equal(receipt.package.sandboxHelper.uid, 0)
    assert.equal(receipt.package.sandboxHelper.mode, 0o4755)
    if (process.env.G11_EXPECTED_EXECUTABLE_SHA) assert.equal(receipt.package.executable.sha256, process.env.G11_EXPECTED_EXECUTABLE_SHA)
    if (process.env.G11_EXPECTED_APP_ASAR_SHA) assert.equal(receipt.package.appAsar.sha256, process.env.G11_EXPECTED_APP_ASAR_SHA)
    if (process.env.G11_EXPECTED_FFMPEG_SHA) assert.equal(receipt.package.ffmpeg.sha256, process.env.G11_EXPECTED_FFMPEG_SHA)

    assert.equal(receipt.project.styleId, "vitrine")
    assert.equal(receipt.project.sceneVersion, 2)
    assert.deepEqual(receipt.project.orderedMediaIds, ["vitrine-square", "vitrine-portrait"])
    assert.deepEqual(receipt.project.frameIntents, expectedFrameIntents)
    assert(receipt.project.grantCount >= 2)
    assert.match(receipt.project.grantDigest, /^[a-f0-9]{64}$/)
    assert.deepEqual(receipt.project.persistedControls, {
        presentationScale: 70,
        objectTurn: 8,
        transitionDepth: 24,
        transitionDirection: "right",
        placard: true,
    })
    assert.match(receipt.journey.openNotice, /Project opened/)
    if (index === 0) assert.match(receipt.journey.saveNotice, /Project saved · media included/)
    else assert.equal(receipt.journey.saveNotice, null)

    assert.equal(receipt.preview.holdA.planes[0].id, "vitrine-square")
    assert.equal(receipt.preview.holdA.planes[0].objectFit, "cover")
    assert.equal(receipt.preview.holdA.planes[0].objectPosition, "20% 30%")
    if (index === 0) {
        assert.equal(receipt.preview.exchange.phrase, "exchange")
        assert(receipt.preview.exchange.planes.length <= 2 && receipt.preview.exchange.planes.some((plane) => plane.mediaTag === "VIDEO" && plane.storyReady === "true"))
        assert.equal(receipt.preview.reducedMotionExpected, false)
        assert.equal(receipt.preview.continuousVideoHandoff.guardReadyBefore, true)
        assert.equal(receipt.preview.continuousVideoHandoff.sawIncoming, true)
        assert.equal(receipt.preview.continuousVideoHandoff.hiddenIncomingFrames, 0)
        assert(receipt.preview.continuousVideoHandoff.maxDecoders >= 1 && receipt.preview.continuousVideoHandoff.maxDecoders <= 2)
        assert(receipt.preview.continuousVideoHandoff.presentedTimes.length >= 2)
        receipt.preview.continuousVideoHandoff.presentedTimes.forEach((value, presentedIndex, values) => {
            assert(Number.isFinite(value) && (presentedIndex === 0 || value > values[presentedIndex - 1]))
        })
        assert.equal(receipt.preview.reducedTransport, null)
        assert.equal(receipt.preview.semanticHandoff.semanticId, "vitrine-portrait")
        assert.equal(receipt.preview.semanticHandoff.status, "Showing Field portrait, item 2 of 2")
        assert.equal(receipt.preview.holdB.planes[0].id, "vitrine-portrait")
        assert.equal(receipt.preview.holdB.planes[0].objectFit, "fill")
        assert.equal(receipt.preview.holdB.planes[0].mediaTag, "VIDEO")
        assert.equal(receipt.preview.holdB.planes[0].storyReady, "true")
        assert.deepEqual(receipt.preview.holdB.planes[0].mediaGeometry, { left: "0%", top: "-50%", width: "100%", height: "200%" })
        assert.equal(receipt.preview.terminalVideo.phrase, "exit")
        assert.equal(receipt.preview.terminalVideo.planes[0].mediaTag, "VIDEO")
        assert(receipt.preview.terminalVideo.planes[0].storyPresentedTime >= 1.9 && receipt.preview.terminalVideo.planes[0].storyPresentedTime < 2)
        assert(receipt.controls.causal)
        const interaction = receipt.controls.interaction
        assert.deepEqual({ value: interaction.baseline.value, dragged: interaction.dragged.value, dragUndone: interaction.dragUndone.value, shifted: interaction.shifted.value, shiftUndone: interaction.shiftUndone.value }, {
            value: 5, dragged: 7, dragUndone: 5, shifted: 7.5, shiftUndone: 5,
        })
        assert.equal(interaction.dragged.depth, interaction.baseline.depth + 1)
        assert.equal(interaction.dragUndone.depth, interaction.baseline.depth)
        assert.equal(interaction.shifted.depth, interaction.baseline.depth + 1)
        assert.equal(interaction.shiftUndone.depth, interaction.baseline.depth)
        assert.deepEqual(interaction.directionArrow, { active: "Right", focused: "Right", depth: interaction.baseline.depth + 1 })
        assert.deepEqual(interaction.directionUndone, { active: "Left", focused: "Left", depth: interaction.baseline.depth })
        assert.deepEqual(interaction.placardSpace, { active: "Visible", focused: "Visible", depth: interaction.baseline.depth + 1 })
        assert.deepEqual(interaction.placardUndone, { active: "Clean", focused: "Clean", depth: interaction.baseline.depth })
        assert.deepEqual(interaction.restoredDefaults, interaction.baseline)
        assert.deepEqual(interaction.afterDefaultsUndo, interaction.baseline)
        assert.deepEqual(interaction.documentBoundary.reopened, { value: 70, depth: 0 })
        assert.deepEqual(interaction.documentBoundary.afterUndo, interaction.documentBoundary.reopened)
    } else {
        assert.equal(receipt.preview.exchange.phrase, "reduced-motion-settled")
        assert.equal(receipt.preview.exchange.systemReducedMotion, true)
        assert.equal(receipt.preview.reducedMotionExpected, true)
        assert.deepEqual(receipt.preview.reducedTransport, { before: 0.125, after: 0.125, paused: true })
        assert.equal(receipt.preview.continuousVideoHandoff, null)
        assert.equal(receipt.preview.holdB.currentId, "vitrine-portrait")
        assert.equal(receipt.preview.holdB.planes[0].id, "vitrine-portrait")
        assert.equal(receipt.preview.holdB.planes[0].mediaTag, "VIDEO")
        assert.equal(receipt.preview.holdB.planes[0].storyPresentedTime, 0)
        assert.equal(receipt.preview.semanticHandoff, null)
        assert.equal(receipt.preview.terminalVideo, null)
        assert.equal(receipt.controls.causal, null)
        assert.equal(receipt.controls.interaction, null)
    }
    assert.equal(receipt.controls.libraryKeyboard.next.selected, "vitrine-portrait")
    assert.equal(receipt.controls.libraryKeyboard.next.scene.inspectionId, "vitrine-portrait")
    assert.equal(receipt.controls.libraryKeyboard.next.scene.phrase, "single-still")
    assert.equal(receipt.controls.libraryKeyboard.next.scene.status, "Showing Field portrait, item 2 of 2")
    assert.equal(receipt.controls.libraryKeyboard.next.scene.planes[0].mediaTag, "VIDEO")
    assert.equal(receipt.controls.libraryKeyboard.next.scene.planes[0].storyReady, "true")
    assert.equal(receipt.controls.libraryKeyboard.previous.selected, "vitrine-square")
    assert.equal(receipt.controls.libraryKeyboard.previous.scene.status, "Showing Signal square, item 1 of 2")
    assert.deepEqual(receipt.controls.libraryKeyboard.movedLater.order, ["vitrine-portrait", "vitrine-square"])
    assert.equal(receipt.controls.libraryKeyboard.movedLater.focused, "vitrine-square")
    assert.deepEqual(receipt.controls.libraryKeyboard.movedEarlier.order, ["vitrine-square", "vitrine-portrait"])
    assert.equal(receipt.controls.libraryKeyboard.movedEarlier.focused, "vitrine-square")
    assert.deepEqual(receipt.controls.libraryKeyboard.voiceOverChord, {
        order: ["vitrine-square", "vitrine-portrait"], focused: "vitrine-square", selected: "vitrine-square",
    })
    assert(receipt.controls.libraryKeyboard.retired.count >= 1)
    assert.equal(receipt.controls.libraryKeyboard.retired.allCleared, true)
    assert(receipt.controls.decoderEvidence.activePlanes <= 2)
    assert(receipt.controls.decoderEvidence.activeVideos <= 2)
    assert.equal(receipt.controls.decoderEvidence.readyVideos, receipt.controls.decoderEvidence.activeVideos)
    assert.equal(receipt.controls.decoderEvidence.guardVideos, 1)
    assert.equal(receipt.controls.decoderEvidence.libraryVideos, 0)
    for (const scale of [75, 100, 200]) {
        const sample = receipt.preview.scales[scale]
        assert.equal(sample.interfaceScale, scale)
        assert(Math.abs(sample.stage.perspective / sample.stage.logicalWidth - 1.46) < 0.0001)
        assert(Math.abs(sample.stage.visualWidth / sample.stage.clientWidth - scale / 100) < 0.035)
        assert.equal(receipt.controls.targets[scale].length, 5)
        for (const target of receipt.controls.targets[scale]) assert(target.width >= 43.75 && target.height >= 43.75)
    }
    assert.equal(receipt.controls.design.motionGrid, false)
    assert.equal(receipt.controls.design.backgroundGroup, "Room background")
    assert.deepEqual(receipt.controls.design.backgrounds, [{ label: "solid", pressed: "false" }, { label: "transparent", pressed: "true" }])
    assert.deepEqual(receipt.controls.presets, ["Restore Defaults"])
    assert.equal(receipt.controls.blockedAlpha.disabled, false)
    assert.equal(receipt.controls.blockedAlpha.exportDisabled, false)
    assert.match(receipt.controls.blockedAlpha.text, /Verified sequence/)
    assert.equal(receipt.controls.formats[0].disabled, false)
    assert.equal(receipt.controls.formats[1].disabled, true)

    const manifest = manifests[index]
    assert.deepEqual(manifest.scene, { id: "vitrine", version: 2 })
    assert.equal(manifest.width, 96)
    assert.equal(manifest.height, 64)
    assert.equal(manifest.fps, 24)
    assert.equal(manifest.durationMs, 2_000)
    assert.equal(manifest.frameCount, 48)
    assert.equal(manifest.alpha, true)
    assert.equal(manifest.audio, "none")
    assert.equal(manifest.frames.length, 48)
    const frameRoot = path.join(root, run.frameDirectory)
    const expectedEntries = ["manifest.json"]
    const actualHashes = []
    for (let frameIndex = 0; frameIndex < 48; frameIndex += 1) {
        const frame = manifest.frames[frameIndex]
        assert.deepEqual(Object.keys(frame).sort(), ["bytes", "name", "sha256", "timeMs"])
        const expectedName = `frame-${String(frameIndex + 1).padStart(6, "0")}.png`
        assert.equal(frame.name, expectedName)
        assert.equal(frame.timeMs, frameIndex * 1_000 / 24)
        assert(Number.isSafeInteger(frame.bytes) && frame.bytes > 0 && frame.bytes < 1_000_000)
        assert.match(frame.sha256, /^[a-f0-9]{64}$/)
        const target = safeNamedFile(frameRoot, frame.name, /^frame-[0-9]{6}\.png$/, 1_000_000)
        const bytes = stableRead(target, 1_000_000).bytes
        assert.equal(bytes.length, frame.bytes)
        assert.equal(sha256(bytes), frame.sha256)
        actualHashes.push(frame.sha256)
        expectedEntries.push(expectedName)
        expectedFiles.add(`${run.frameDirectory}/${expectedName}`)
    }
    assert.deepEqual(fs.readdirSync(frameRoot).sort(), expectedEntries.sort())
    assert.deepEqual(receipt.export.frameHashes, actualHashes)
    assert.equal(receipt.export.placardVisible, false)
    assert.equal(receipt.export.manifestSha256, sha256(manifestFiles[index].bytes))
    const recomputedArtwork = inspectArtwork(frameRoot, manifest)
    assert.deepEqual(receipt.export.artwork, recomputedArtwork)
    assert.equal(recomputedArtwork.zeroAlphaRgbViolations, 0)
    assert.deepEqual(Object.keys(recomputedArtwork.sourceTupleCounts).sort(), [
        ...["239,78,74", "34,89,214"].flatMap((rgb) => [64, 128, 192, 255].map((alpha) => `${rgb},${alpha}`)),
    ].sort())
    assert(Object.values(recomputedArtwork.sourceTupleCounts).every((count) => count > 0))

    const probeIds = new Set()
    for (const [key, probe] of Object.entries(receipt.export.probes)) {
        const frameIndex = Number(key)
        assert([0, 6, 15, 18, 24, 47].includes(frameIndex))
        assert.match(probe.exportMarker.frameId, new RegExp(`^png-[a-f0-9]{24}-${frameIndex}$`))
        assert.equal(probe.exportMarker.timeMs, String(frameIndex * 1_000 / 24))
        assert.equal(probeIds.has(probe.exportMarker.frameId), false)
        probeIds.add(probe.exportMarker.frameId)
        assert(probe.planes.every((plane) => ["IMG", "VIDEO"].includes(plane.mediaTag) && plane.failed === false))
        for (const plane of probe.planes.filter((candidate) => candidate.id === "vitrine-portrait")) {
            assert.equal(plane.mediaTag, "VIDEO")
            assert.equal(plane.storyReady, "true")
        }
        assert.equal(probe.placard, null)
        assert.notEqual(probe.phrase, "reduced-motion-settled")
    }
    assert.equal(receipt.export.probes[6].phrase, "readable-hold")
    assert.equal(receipt.export.probes[15].phrase, "exchange")
    assert.equal(receipt.export.probes[24].planes[0].id, "vitrine-portrait")

    const screenshotNames = new Set()
    for (const screenshot of Object.values(receipt.screenshots)) {
        const pattern = new RegExp(`^vitrine-${run.mode}-(?:hold-a|exchange|scale-(?:75|100|200)|export-success)\\.png$`)
        const target = safeNamedFile(path.join(root, run.id), screenshot.file, pattern, 100_000_000)
        assert.equal(screenshotNames.has(screenshot.file), false)
        screenshotNames.add(screenshot.file)
        const bytes = stableRead(target, 100_000_000).bytes
        assert.equal(bytes.length, screenshot.bytes)
        assert.equal(sha256(bytes), screenshot.sha256)
        assert(bytes.length > 10_000)
        assert.deepEqual(Object.keys(screenshot.size).sort(), ["height", "width"])
        assert(Number.isSafeInteger(screenshot.size.width) && screenshot.size.width >= 640 && screenshot.size.width <= 7680)
        assert(Number.isSafeInteger(screenshot.size.height) && screenshot.size.height >= 480 && screenshot.size.height <= 4320)
        const inspectedScreenshot = inspectPng(bytes, { width: screenshot.size.width, height: screenshot.size.height, alpha: false })
        assert.equal(inspectedScreenshot.bytes, screenshot.bytes)
        assert.equal(inspectedScreenshot.sha256, screenshot.sha256)
        expectedFiles.add(`${run.id}/${screenshot.file}`)
    }
    assert.deepEqual([...screenshotNames].map((name) => name.replace(`vitrine-${run.mode}-`, "").replace(/\.png$/, "")).sort(), expectedScreenshots)
}

const projectStat = regularFile(projectPath, 100_000_000)
assert(projectStat.size > 1_000)
const projectSha = sha256(stableRead(projectPath, 100_000_000).bytes)
for (const receipt of receipts) assert.equal(receipt.project.archiveSha256, projectSha)

assert.equal(receipts[0].package.sourceSha, receipts[1].package.sourceSha)
assert.equal(receipts[0].package.sourceTree, receipts[1].package.sourceTree)
assert.equal(receipts[0].package.buildId, receipts[1].package.buildId)
assert.deepEqual(receipts[0].package.executable, receipts[1].package.executable)
assert.deepEqual(receipts[0].package.appAsar, receipts[1].package.appAsar)
assert.deepEqual(receipts[0].package.ffmpeg, receipts[1].package.ffmpeg)
assert.deepEqual(receipts[0].package.sandboxHelper, receipts[1].package.sandboxHelper)
assert.deepEqual(receipts[0].package.runtime, receipts[1].package.runtime)
assert.deepEqual(receipts[0].package.rendererSecurity, receipts[1].package.rendererSecurity)
assert.equal(receipts[0].project.semanticSha256, receipts[1].project.semanticSha256)
assert.notEqual(receipts[0].project.grantDigest, receipts[1].project.grantDigest)
assert.equal(receipts[0].project.audioSha256, receipts[1].project.audioSha256)
assert.deepEqual(receipts[0].project.frameIntents, receipts[1].project.frameIntents)
assert.equal(receipts[0].presentation.final.interfaceScale, 100)
assert.equal(receipts[1].presentation.initial.interfaceScale, 100)
assert.equal(receipts[0].presentation.final.revision, receipts[1].presentation.initial.revision)
assert.equal(receipts[0].presentation.final.sha256, receipts[1].presentation.initial.sha256)
assert.deepEqual(receipts[0].export.frameHashes, receipts[1].export.frameHashes, "normal and reduced-motion exports must have identical frame hashes")
assert.equal(receipts[0].export.manifestSha256, receipts[1].export.manifestSha256)

function artifactFiles(directory) {
    const found = []
    const walk = (current) => {
        const currentStat = fs.lstatSync(current)
        assert(currentStat.isDirectory() && !currentStat.isSymbolicLink(), `${current} is not an exact artifact directory`)
        assert.equal(fs.realpathSync.native(current), path.resolve(current), `${current} contains a symbolic-link boundary`)
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const target = path.join(current, entry.name)
            const linked = fs.lstatSync(target)
            assert.equal(linked.isSymbolicLink(), false, `${target} must not be a symbolic link`)
            if (linked.isDirectory()) walk(target)
            else {
                assert(linked.isFile(), `${target} must be a regular artifact file`)
                found.push(path.relative(root, target).split(path.sep).join("/"))
            }
        }
    }
    walk(directory)
    return found.sort()
}
assert.deepEqual(artifactFiles(root), [...expectedFiles].sort(), "G11 evidence tree must contain only verifier-declared files")

console.log("Verified: exact packaged Vitrine identity, save/relaunch/reopen, private-authority rotation, per-frame framing intent, five causal controls with grouped undo and 44px targets, 75–200% parity, reduced-preview/authored-export separation, exact clocks, deterministic PNG hashes, raw alpha/source tuples, and no PNG audio.")
