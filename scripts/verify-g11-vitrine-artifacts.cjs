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

function exactTreeEvidence(directory) {
    const resolved = path.resolve(directory)
    if (!fs.existsSync(resolved)) return { exists: false, directories: 0, files: 0, bytes: 0, sha256: sha256(Buffer.alloc(0)) }
    const rootStat = fs.lstatSync(resolved)
    assert(rootStat.isDirectory() && !rootStat.isSymbolicLink())
    assert.equal(fs.realpathSync.native(resolved), resolved)
    const rows = []
    let directories = 0
    let files = 0
    let bytes = 0
    const walk = (current, relative) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
            const target = path.join(current, entry.name)
            const linked = fs.lstatSync(target)
            assert.equal(linked.isSymbolicLink(), false)
            const name = relative ? `${relative}/${entry.name}` : entry.name
            if (linked.isDirectory()) {
                directories += 1
                rows.push(["directory", name, linked.mode & 0o7777])
                walk(target, name)
            } else {
                assert(linked.isFile())
                const file = stableRead(target, 4_000_000_000)
                files += 1
                bytes += file.bytes.length
                rows.push(["file", name, file.bytes.length, sha256(file.bytes), linked.mode & 0o7777])
            }
        }
    }
    walk(resolved, "")
    return { exists: true, directories, files, bytes, sha256: sha256(Buffer.from(JSON.stringify(rows))) }
}

const runs = [
    { id: "run-a", mode: "save", frameDirectory: "run-a-frames", visiblePlacardFrameDirectory: "vitrine-save-placard-visible-frames" },
    { id: "run-b", mode: "reopen", frameDirectory: "run-b-frames", visiblePlacardFrameDirectory: "vitrine-reopen-placard-visible-frames" },
]
assert.equal(fs.realpathSync.native(root), root, "G11 artifact root or an ancestor is a symbolic link")
assert(fs.lstatSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink())
const receiptFiles = runs.map((run) => boundedJSON(path.join(root, run.id, "receipt.json"), 20_000_000))
const receipts = receiptFiles.map((entry) => entry.value)
const manifestFiles = runs.map((run) => boundedJSON(path.join(root, run.frameDirectory, "manifest.json"), 5_000_000))
const manifests = manifestFiles.map((entry) => entry.value)
const visiblePlacardManifestFiles = runs.map((run) => boundedJSON(path.join(root, run.id, run.visiblePlacardFrameDirectory, "manifest.json"), 5_000_000))
const visiblePlacardManifests = visiblePlacardManifestFiles.map((entry) => entry.value)
const corruptOpenReceipt = boundedJSON(path.join(root, "run-corrupt-open", "receipt.json"), 2_000_000).value
const missingMediaReceipt = boundedJSON(path.join(root, "run-missing-media-export", "receipt.json"), 2_000_000).value
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
    "vitrine-corrupt.galileo",
    "corrupt-sources/vitrine-square.png",
    "corrupt-sources/vitrine-portrait.mp4",
    "run-corrupt-open/receipt.json",
    "run-missing-media-export/receipt.json",
    "missing-media-destination/prior.txt",
    ...runs.flatMap((run) => [
        `${run.id}/receipt.json`,
        `${run.frameDirectory}/manifest.json`,
        `${run.id}/${run.visiblePlacardFrameDirectory}/manifest.json`,
    ]),
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
        assert(["decoded", "presented"].includes(receipt.preview.continuousVideoHandoff.guardProofBefore))
        assert.equal(receipt.preview.continuousVideoHandoff.sawIncoming, true)
        assert.equal(receipt.preview.continuousVideoHandoff.hiddenIncomingFrames, 0)
        assert(receipt.preview.continuousVideoHandoff.maxDecoders >= 1 && receipt.preview.continuousVideoHandoff.maxDecoders <= 2)
        assert(receipt.preview.continuousVideoHandoff.presentedTimes.length >= 2)
        receipt.preview.continuousVideoHandoff.presentedTimes.forEach((value, presentedIndex, values) => {
            assert(Number.isFinite(value) && (presentedIndex === 0 || value > values[presentedIndex - 1]))
        })
        assert.equal(receipt.preview.continuousVideoHandoff.presentedFrames.length, receipt.preview.continuousVideoHandoff.presentedTimes.length)
        for (const frame of receipt.preview.continuousVideoHandoff.presentedFrames) {
            assert.equal(frame.proof, "presented")
            assert.equal(frame.seeking, false)
            assert.equal(frame.paused, true)
            assert.equal(frame.muted, true)
            assert.equal(frame.playbackRate, 1)
            assert(frame.presented <= frame.target + 0.0001)
            assert(frame.target - frame.presented < 1 / 12 + 0.0001)
        }
        assert.deepEqual(receipt.preview.sourceVideoSeekBurst.sequence, [0.43, 0.36, 0.44, 0.35, 0.42])
        assert.equal(receipt.preview.sourceVideoSeekBurst.final.ready, "true")
        assert.equal(receipt.preview.sourceVideoSeekBurst.final.proof, "presented")
        assert.equal(receipt.preview.sourceVideoSeekBurst.final.seeking, false)
        assert.equal(receipt.preview.sourceVideoSeekBurst.final.paused, true)
        assert.equal(receipt.preview.sourceVideoSeekBurst.final.muted, true)
        assert.equal(receipt.preview.sourceVideoSeekBurst.final.playbackRate, 1)
        assert(Math.abs(receipt.preview.sourceVideoSeekBurst.final.target - 20 / 24) < 0.0001)
        assert(receipt.preview.sourceVideoSeekBurst.final.presented <= receipt.preview.sourceVideoSeekBurst.final.target + 0.0001)
        assert(receipt.preview.sourceVideoSeekBurst.final.target - receipt.preview.sourceVideoSeekBurst.final.presented < 1 / 12 + 0.0001)
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
        const placardBox = receipt.controls.causal.placard.placardBox
        assert(placardBox.left >= -0.001 && placardBox.top >= -0.001
            && placardBox.left + placardBox.width <= 1.001 && placardBox.top + placardBox.height <= 1.001
            && placardBox.width > 0 && placardBox.width <= 0.55 && placardBox.height > 0 && placardBox.height <= 0.22)
        assert.deepEqual(receipt.controls.causal.restoredRhythm, { exchangeMs: 1_760, holdMs: 3_740 })
        assert.deepEqual(receipt.controls.causal.compactExportRhythm, { exchangeMs: 320, holdMs: 680 })
        assert.deepEqual(receipt.controls.causal.compactExportTimeline, { mode: "fixed-duration", fixedDurationMs: 2_000, activeOption: "Fixed", exactDurationMs: 2_000 })
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
        assert.equal(receipt.preview.sourceVideoSeekBurst, null)
        assert.equal(receipt.preview.holdB.currentId, "vitrine-portrait")
        assert.equal(receipt.preview.holdB.planes[0].id, "vitrine-portrait")
        assert.equal(receipt.preview.holdB.planes[0].mediaTag, "VIDEO")
        assert.equal(receipt.preview.holdB.planes[0].storyPresentedTime, 0)
        assert.equal(receipt.preview.semanticHandoff, null)
        assert.equal(receipt.preview.terminalVideo, null)
        assert.equal(receipt.controls.causal, null)
        assert.equal(receipt.controls.interaction, null)
    }
    for (const scene of [receipt.preview.holdA, receipt.preview.exchange, receipt.preview.semanticHandoff, receipt.preview.holdB, receipt.preview.terminalVideo].filter(Boolean)) {
        for (const plane of scene.planes.filter((candidate) => candidate.mediaTag === "VIDEO")) {
            assert.equal(plane.storyReady, "true")
            assert.equal(plane.storyProof, "presented")
            assert.equal(plane.storySeeking, false)
            assert.equal(plane.storyPaused, true)
            assert.equal(plane.storyMuted, true)
            assert.equal(plane.storyPlaybackRate, 1)
            assert(Number.isFinite(plane.storyTargetTime) && Number.isFinite(plane.storyPresentedTime))
            assert(plane.storyPresentedTime <= plane.storyTargetTime + 0.0001)
            assert(plane.storyTargetTime - plane.storyPresentedTime < 1 / 12 + 0.0001)
        }
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
    assert.deepEqual(receipt.controls.libraryKeyboard.movedProject.orderedMediaIds, ["vitrine-portrait", "vitrine-square"])
    assert.deepEqual(receipt.controls.libraryKeyboard.movedEarlier.order, ["vitrine-square", "vitrine-portrait"])
    assert.equal(receipt.controls.libraryKeyboard.movedEarlier.focused, "vitrine-square")
    assert.deepEqual(receipt.controls.libraryKeyboard.voiceOverChord, {
        order: ["vitrine-square", "vitrine-portrait"], focused: "vitrine-square", selected: "vitrine-square",
    })
    assert.deepEqual(receipt.controls.libraryKeyboard.restoredProject.orderedMediaIds, ["vitrine-square", "vitrine-portrait"])
    assert.equal(receipt.controls.libraryKeyboard.movedProject.grantCount, 2)
    assert.equal(receipt.controls.libraryKeyboard.restoredProject.grantCount, 2)
    if (run.mode === "save") {
        assert.match(receipt.controls.libraryKeyboard.movedSaveNotice, /Project saved · media included/)
        assert.match(receipt.controls.libraryKeyboard.movedReopenNotice, /Project opened/)
        assert.deepEqual(receipt.controls.libraryKeyboard.movedReopened.project.orderedMediaIds, ["vitrine-portrait", "vitrine-square"])
        assert.deepEqual(receipt.controls.libraryKeyboard.movedReopened.uiOrder, receipt.controls.libraryKeyboard.movedReopened.project.orderedMediaIds)
        assert.equal(receipt.controls.libraryKeyboard.movedReopened.project.semanticSha256, receipt.controls.libraryKeyboard.movedProject.semanticSha256)
        assert.equal(receipt.controls.libraryKeyboard.movedReopened.project.grantCount, 2)
        assert.notEqual(receipt.controls.libraryKeyboard.movedReopened.project.grantDigest, receipt.controls.libraryKeyboard.movedProject.grantDigest)
        assert.equal(receipt.controls.libraryKeyboard.restoredProject.grantDigest, receipt.controls.libraryKeyboard.movedReopened.project.grantDigest)
    } else {
        assert.equal(receipt.controls.libraryKeyboard.movedSaveNotice, null)
        assert.equal(receipt.controls.libraryKeyboard.movedReopenNotice, null)
        assert.equal(receipt.controls.libraryKeyboard.movedReopened, null)
        assert.equal(receipt.controls.libraryKeyboard.restoredProject.grantDigest, receipt.controls.libraryKeyboard.movedProject.grantDigest)
    }
    assert(receipt.controls.libraryKeyboard.retired.count >= 1)
    assert.equal(receipt.controls.libraryKeyboard.retired.allCleared, true)
    assert(receipt.controls.decoderEvidence.activePlanes <= 2)
    assert(receipt.controls.decoderEvidence.activeVideos <= 2)
    assert.equal(receipt.controls.decoderEvidence.readyVideos, receipt.controls.decoderEvidence.activeVideos)
    assert.equal(receipt.controls.decoderEvidence.guardVideos, receipt.mode === "save" ? 1 : 0)
    assert.equal(receipt.controls.decoderEvidence.libraryVideos, 0)
    if (receipt.mode === "reopen") {
        assert.equal(receipt.controls.decoderEvidence.reducedMotion, true)
        assert.equal(receipt.controls.decoderEvidence.phrase, "reduced-motion-settled")
    }
    for (const scale of [75, 100, 200]) {
        const sample = receipt.preview.scales[scale]
        assert.equal(sample.interfaceScale, scale)
        assert(Math.abs(sample.stage.perspective / sample.stage.logicalWidth - 1.46) < 0.0001)
        assert(Math.abs(sample.stage.visualWidth / sample.stage.clientWidth - scale / 100) < 0.035)
        assert.equal(receipt.controls.targets[scale].length, 5)
        for (const target of receipt.controls.targets[scale]) assert(target.width >= 43.75 && target.height >= 43.75)
        assert.equal(sample.placard, receipt.preview.exchange.placard)
        for (const key of ["left", "top", "width", "height"]) assert(Math.abs(sample.placardBox[key] - receipt.preview.exchange.placardBox[key]) <= 0.006)
    }
    const canvasResolutions = receipt.controls.canvasResolutions
    assert.deepEqual(Object.keys(canvasResolutions), ["fixture", "maximum", "restored", "aspectRatios"])
    assert.deepEqual([canvasResolutions.fixture.stage.logicalWidth, canvasResolutions.fixture.stage.logicalHeight], [96, 64])
    assert.deepEqual([canvasResolutions.maximum.stage.logicalWidth, canvasResolutions.maximum.stage.logicalHeight], [7_680, 5_120])
    assert.deepEqual([canvasResolutions.restored.stage.logicalWidth, canvasResolutions.restored.stage.logicalHeight], [96, 64])
    for (const sample of [canvasResolutions.fixture, canvasResolutions.maximum, canvasResolutions.restored]) {
        assert.equal(sample.placard, receipt.preview.exchange.placard)
        for (const child of Object.values(sample.placardChildren)) {
            assert(child.left >= sample.placardBox.left - 0.001 && child.top >= sample.placardBox.top - 0.001)
            assert(child.left + child.width <= sample.placardBox.left + sample.placardBox.width + 0.001)
            assert(child.top + child.height <= sample.placardBox.top + sample.placardBox.height + 0.001)
        }
    }
    for (const sample of [canvasResolutions.maximum, canvasResolutions.restored]) {
        assert.equal(sample.hash, canvasResolutions.fixture.hash)
        for (const key of ["left", "top", "width", "height"]) assert(Math.abs(sample.placardBox[key] - canvasResolutions.fixture.placardBox[key]) <= 0.006)
        for (const childKey of ["label", "caption"]) {
            for (const key of ["left", "top", "width", "height"]) assert(Math.abs(sample.placardChildren[childKey][key] - canvasResolutions.fixture.placardChildren[childKey][key]) <= 0.006)
        }
        for (const key of Object.keys(canvasResolutions.fixture.placardMetrics)) assert(Math.abs(sample.placardMetrics[key] - canvasResolutions.fixture.placardMetrics[key]) <= 0.0001)
    }
    const ratioSpecs = {
        portrait: { small: [64, 96], large: [5_120, 7_680] },
        "extreme-wide": { small: [3_840, 64], large: [7_680, 128] },
        "extreme-tall": { small: [64, 3_840], large: [128, 7_680] },
    }
    assert.deepEqual(Object.keys(canvasResolutions.aspectRatios), Object.keys(ratioSpecs))
    for (const [id, spec] of Object.entries(ratioSpecs)) {
        const pair = canvasResolutions.aspectRatios[id]
        assert.deepEqual([pair.small.stage.logicalWidth, pair.small.stage.logicalHeight], spec.small)
        assert.deepEqual([pair.large.stage.logicalWidth, pair.large.stage.logicalHeight], spec.large)
        assert.equal(pair.small.hash, pair.large.hash)
        assert.equal(pair.small.placard, pair.large.placard)
        for (const sample of [pair.small, pair.large]) {
            assert(Math.abs(Math.min(sample.stage.designWidth, sample.stage.designHeight) - 640) <= 0.05)
            assert(Math.abs(sample.stage.perspective / sample.stage.logicalWidth - 1.46) <= 0.0001)
            for (const child of Object.values(sample.placardChildren)) {
                assert(child.left >= sample.placardBox.left - 0.001 && child.top >= sample.placardBox.top - 0.001)
                assert(child.left + child.width <= sample.placardBox.left + sample.placardBox.width + 0.001)
                assert(child.top + child.height <= sample.placardBox.top + sample.placardBox.height + 0.001)
            }
        }
        assert.equal(pair.small.planes.length, pair.large.planes.length)
        for (let planeIndex = 0; planeIndex < pair.small.planes.length; planeIndex += 1) {
            const left = pair.small.planes[planeIndex]
            const right = pair.large.planes[planeIndex]
            assert.deepEqual({ id: left.id, role: left.role, frameIntent: left.frameIntent, mediaGeometry: left.mediaGeometry },
                { id: right.id, role: right.role, frameIntent: right.frameIntent, mediaGeometry: right.mediaGeometry })
            for (const key of ["x", "y", "z", "width", "height", "scale", "rotateX", "rotateY"]) assert(Math.abs(left.normalizedPose[key] - right.normalizedPose[key]) <= 0.006)
            for (const key of ["left", "top", "width", "height"]) assert(Math.abs(left.box[key] - right.box[key]) <= 0.006)
        }
        for (const key of ["left", "top", "width", "height"]) assert(Math.abs(pair.small.placardBox[key] - pair.large.placardBox[key]) <= 0.006)
        for (const childKey of ["label", "caption"]) {
            for (const key of ["left", "top", "width", "height"]) assert(Math.abs(pair.small.placardChildren[childKey][key] - pair.large.placardChildren[childKey][key]) <= 0.006)
        }
        for (const key of Object.keys(pair.small.placardMetrics)) assert(Math.abs(pair.small.placardMetrics[key] - pair.large.placardMetrics[key]) <= 0.0001)
    }
    assert.equal(receipt.controls.design.motionGrid, false)
    assert.equal(receipt.controls.design.backgroundGroup, "Room background")
    assert.deepEqual(receipt.controls.design.backgrounds, [{ label: "solid", pressed: "false" }, { label: "transparent", pressed: "true" }])
    assert.deepEqual(receipt.controls.design.keyboard.solid, {
        active: "solid",
        focused: "solid",
        projectBackground: "solid",
        stageTransparent: false,
        buttons: [{ label: "solid", pressed: "true" }, { label: "transparent", pressed: "false" }],
    })
    assert.deepEqual(receipt.controls.design.keyboard.restored, {
        active: "transparent",
        focused: "transparent",
        projectBackground: "transparent",
        stageTransparent: true,
        buttons: [{ label: "solid", pressed: "false" }, { label: "transparent", pressed: "true" }],
    })
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
    assert.equal(recomputedArtwork.sourceRgbTolerance, 2)
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
            assert.equal(plane.storyProof, "presented")
            assert.equal(plane.storySeeking, false)
            assert.equal(plane.storyPaused, true)
            assert.equal(plane.storyMuted, true)
            assert.equal(plane.storyPlaybackRate, 1)
            assert(plane.storyPresentedTime <= plane.storyTargetTime + 0.0001)
            assert(plane.storyTargetTime - plane.storyPresentedTime < 1 / 12 + 0.0001)
        }
        assert.equal(probe.placard, null)
        assert.notEqual(probe.phrase, "reduced-motion-settled")
    }
    assert.equal(receipt.export.probes[6].phrase, "readable-hold")
    assert.equal(receipt.export.probes[15].phrase, "readable-hold")
    assert.equal(receipt.export.probes[18].phrase, "exchange")
    assert.equal(receipt.export.probes[24].planes[0].id, "vitrine-portrait")

    const visiblePlacardManifestFile = visiblePlacardManifestFiles[index]
    const visiblePlacardManifest = visiblePlacardManifests[index]
    assertNoPrivateEvidence(visiblePlacardManifest)
    assert.deepEqual(visiblePlacardManifest.scene, { id: "vitrine", version: 2 })
    assert.equal(visiblePlacardManifest.width, 96)
    assert.equal(visiblePlacardManifest.height, 64)
    assert.equal(visiblePlacardManifest.fps, 24)
    assert.equal(visiblePlacardManifest.durationMs, 2_000)
    assert.equal(visiblePlacardManifest.frameCount, 48)
    assert.equal(visiblePlacardManifest.alpha, true)
    assert.equal(visiblePlacardManifest.audio, "none")
    assert.equal(visiblePlacardManifest.frames.length, 48)
    const visiblePlacardFrameRoot = path.join(root, run.id, run.visiblePlacardFrameDirectory)
    const visiblePlacardEntries = ["manifest.json"]
    const visiblePlacardHashes = []
    for (let frameIndex = 0; frameIndex < 48; frameIndex += 1) {
        const frame = visiblePlacardManifest.frames[frameIndex]
        assert.deepEqual(Object.keys(frame).sort(), ["bytes", "name", "sha256", "timeMs"])
        const expectedName = `frame-${String(frameIndex + 1).padStart(6, "0")}.png`
        assert.equal(frame.name, expectedName)
        assert.equal(frame.timeMs, frameIndex * 1_000 / 24)
        assert(Number.isSafeInteger(frame.bytes) && frame.bytes > 0 && frame.bytes < 1_000_000)
        assert.match(frame.sha256, /^[a-f0-9]{64}$/)
        const target = safeNamedFile(visiblePlacardFrameRoot, frame.name, /^frame-[0-9]{6}\.png$/, 1_000_000)
        const bytes = stableRead(target, 1_000_000).bytes
        assert.equal(bytes.length, frame.bytes)
        assert.equal(sha256(bytes), frame.sha256)
        const inspected = inspectPng(bytes, { width: 96, height: 64, alpha: true })
        assert.equal(inspected.bytes, frame.bytes)
        assert.equal(inspected.sha256, frame.sha256)
        visiblePlacardHashes.push(frame.sha256)
        visiblePlacardEntries.push(expectedName)
        expectedFiles.add(`${run.id}/${run.visiblePlacardFrameDirectory}/${expectedName}`)
    }
    assert.deepEqual(fs.readdirSync(visiblePlacardFrameRoot).sort(), visiblePlacardEntries.sort())
    const visiblePlacardProof = receipt.export.visiblePlacardProof
    assertNoPrivateEvidence(visiblePlacardProof)
    assert.equal(visiblePlacardProof.transparentWindow, true)
    assert.equal(visiblePlacardProof.shadowSuppressed, true)
    assert.equal(visiblePlacardProof.manifestSha256, sha256(visiblePlacardManifestFile.bytes))
    assert.deepEqual(visiblePlacardProof.frameHashes, visiblePlacardHashes)
    assert.deepEqual(Object.keys(visiblePlacardProof.probes), ["0", "18", "47"])
    const visiblePlacardProbeIds = new Set()
    for (const frameIndex of [0, 18, 47]) {
        const probe = visiblePlacardProof.probes[frameIndex]
        assert.match(probe.exportMarker.frameId, new RegExp(`^png-[a-f0-9]{24}-${frameIndex}$`))
        assert.equal(probe.exportMarker.timeMs, String(frameIndex * 1_000 / 24))
        assert.equal(visiblePlacardProbeIds.has(probe.exportMarker.frameId), false)
        visiblePlacardProbeIds.add(probe.exportMarker.frameId)
        assert.equal(probe.transparentExport, true)
        assert.equal(probe.placardExpected, true)
        assert.notEqual(probe.placard, null)
        assert.equal(probe.placardShadow, "none")
        assert(probe.planes.every((plane) => ["IMG", "VIDEO"].includes(plane.mediaTag) && plane.failed === false))
        for (const plane of probe.planes.filter((candidate) => candidate.id === "vitrine-portrait")) {
            assert.equal(plane.mediaTag, "VIDEO")
            assert.equal(plane.storyReady, "true")
            assert.equal(plane.storySeeking, false)
        }
    }

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
assert.deepEqual(visiblePlacardManifests[0].frames.map((frame) => frame.sha256), visiblePlacardManifests[1].frames.map((frame) => frame.sha256),
    "save and reopen visible-Placard exports must have identical frame hashes")
assert.equal(sha256(visiblePlacardManifestFiles[0].bytes), sha256(visiblePlacardManifestFiles[1].bytes),
    "save and reopen visible-Placard manifests must have identical digests")

function verifyFailurePackage(receipt) {
    assertNoPrivateEvidence(receipt)
    assert.equal(receipt.package.productId, "galileo-gallery")
    assert.equal(receipt.package.profile, "g03-linux-host-port")
    assert.equal(receipt.package.packaged, true)
    assert.equal(receipt.package.platform, "linux")
    assert.equal(receipt.package.architecture, "x64")
    assert.equal(receipt.package.sourceSha, receipts[0].package.sourceSha)
    assert.equal(receipt.package.sourceTree, receipts[0].package.sourceTree)
    assert.equal(receipt.package.buildId, receipts[0].package.buildId)
    assert.deepEqual(receipt.package.runtime, receipts[0].package.runtime)
    assert.deepEqual(receipt.package.rendererSecurity, receipts[0].package.rendererSecurity)
    for (const key of ["sandboxHelper", "executable", "appAsar", "ffmpeg"]) {
        evidenceShape(receipt.package[key])
        assert.equal(receipt.package[key].sha256, receipts[0].package[key].sha256)
        assert.equal(receipt.package[key].bytes, receipts[0].package[key].bytes)
    }
    assert.equal(receipt.package.sandboxHelper.uid, 0)
    assert.equal(receipt.package.sandboxHelper.mode, 0o4755)
}

verifyFailurePackage(corruptOpenReceipt)
verifyFailurePackage(missingMediaReceipt)
assert.equal(corruptOpenReceipt.mode, "corrupt-open")
assert.match(corruptOpenReceipt.journey.validOpenNotice, /Project opened/)
assert.match(corruptOpenReceipt.journey.corruptOpenNotice, /Could not hydrate Vitrine Portrait\.mp4\./)
const corruptProject = stableRead(path.join(root, "vitrine-corrupt.galileo"), 100_000_000).bytes
assert.equal(corruptOpenReceipt.corruptArchive.bytes, corruptProject.length)
assert.equal(corruptOpenReceipt.corruptArchive.sha256, sha256(corruptProject))
assert.equal(corruptOpenReceipt.corruptArchive.signatureAccepted, true)
assert.equal(corruptOpenReceipt.corruptArchive.browserAccepted, false)
const corruptVideo = stableRead(path.join(root, "corrupt-sources", "vitrine-portrait.mp4"), 1_000_000).bytes
assert.equal(corruptVideo.length, 128)
assert.equal(corruptVideo.toString("ascii", 4, 8), "ftyp")
assert.equal(corruptVideo.toString("ascii", 8, 12), "isom")
assert(corruptOpenReceipt.chromium.createdVideos >= 1)
assert.equal(corruptOpenReceipt.chromium.disconnectedLoadeddata, 0)
assert.equal(corruptOpenReceipt.chromium.disconnectedErrors, 1)
assert.equal(corruptOpenReceipt.priorProject.semanticSha256After, corruptOpenReceipt.priorProject.semanticSha256Before)
assert.equal(corruptOpenReceipt.priorProject.grantDigestAfter, corruptOpenReceipt.priorProject.grantDigestBefore)
assert.equal(corruptOpenReceipt.priorProject.documentSha256After, corruptOpenReceipt.priorProject.documentSha256Before)
assert.equal(corruptOpenReceipt.containment.acceptedRootIdentityPreserved, true)
assert.deepEqual(corruptOpenReceipt.containment.acceptedRootAfter, corruptOpenReceipt.containment.acceptedRootBefore)
assert.equal(corruptOpenReceipt.containment.acceptedRootAfter.files, 2)
for (const staging of [corruptOpenReceipt.containment.stagingBefore, corruptOpenReceipt.containment.stagingAfter]) {
    assert.equal(staging.projectImport.directories, 0)
    assert.equal(staging.projectImport.files, 0)
    assert.equal(staging.privateFrames.directories, 0)
    assert.equal(staging.privateFrames.files, 0)
}

assert.equal(missingMediaReceipt.mode, "missing-media-export")
assert.match(missingMediaReceipt.journey.validOpenNotice, /Project opened/)
assert.equal(missingMediaReceipt.project.semanticSha256After, missingMediaReceipt.project.semanticSha256Before)
assert.equal(missingMediaReceipt.project.documentSha256After, missingMediaReceipt.project.documentSha256Before)
assert.equal(missingMediaReceipt.removedMedia.exactAppOwnedRegularFile, true)
assert.equal(missingMediaReceipt.removedMedia.absentBeforeExport, true)
const validVideo = stableRead(path.join(root, "sources", "vitrine-portrait.mp4"), 100_000_000).bytes
assert.equal(missingMediaReceipt.removedMedia.bytes, validVideo.length)
assert.equal(missingMediaReceipt.removedMedia.sha256, sha256(validVideo))
assert.equal(missingMediaReceipt.acceptedProject.rootIdentityPreserved, true)
assert.equal(missingMediaReceipt.acceptedProject.beforeRemoval.files, 2)
assert.equal(missingMediaReceipt.acceptedProject.afterRemoval.files, 1)
assert.equal(missingMediaReceipt.acceptedProject.beforeRemoval.bytes, missingMediaReceipt.acceptedProject.afterRemoval.bytes + validVideo.length)
assert.deepEqual(missingMediaReceipt.acceptedProject.afterFailure, missingMediaReceipt.acceptedProject.afterRemoval)
assert.match(missingMediaReceipt.export.failureMessage, /^(?:internal_error|verification_failed)$/)
assert.equal(missingMediaReceipt.export.readySignals, 0)
assert.equal(missingMediaReceipt.export.frameReadySignals, 0)
assert.equal(missingMediaReceipt.export.successVisible, false)
assert.equal(missingMediaReceipt.destination.targetExistedBefore, false)
assert.equal(missingMediaReceipt.destination.targetExistsAfter, false)
assert.deepEqual(missingMediaReceipt.destination.after, missingMediaReceipt.destination.before)
const sentinelTree = exactTreeEvidence(path.join(root, "missing-media-destination"))
assert.deepEqual(missingMediaReceipt.destination.before, sentinelTree)
assert.equal(fs.existsSync(path.join(root, "missing-media-destination", "attempted-frames")), false)
assert.equal(stableRead(path.join(root, "missing-media-destination", "prior.txt"), 1_024).bytes.toString("utf8"), "preserve-g11-missing-media-sentinel\n")
for (const staging of Object.values(missingMediaReceipt.cleanup)) {
    assert.equal(staging.directories, 0)
    assert.equal(staging.files, 0)
}

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
