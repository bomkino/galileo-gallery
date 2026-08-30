const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const AdmZip = require("adm-zip")
const { canonicalProjectJSON, validatePortableProject } = require("../electron/project-schema.cjs")

const root = path.resolve(process.argv[2] || "artifacts/light-table")
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex")

function exactFile(file) {
    const resolved = path.resolve(file)
    const linked = fs.lstatSync(resolved)
    if (!linked.isFile() || linked.isSymbolicLink() || fs.realpathSync.native(resolved) !== resolved) throw new Error("Light Table artifact is not an exact regular file.")
    const bytes = fs.readFileSync(resolved)
    const after = fs.lstatSync(resolved)
    if (after.dev !== linked.dev || after.ino !== linked.ino || after.size !== linked.size || after.mtimeMs !== linked.mtimeMs || after.ctimeMs !== linked.ctimeMs) throw new Error("Light Table artifact changed while reading.")
    return { bytes, sha256: sha256(bytes) }
}

function json(file) {
    return JSON.parse(exactFile(file).bytes.toString("utf8"))
}

function assertNoPrivateEvidence(value) {
    if (typeof value === "string") {
        const candidates = [value]
        for (let attempt = 0; attempt < 16; attempt += 1) {
            try {
                const decoded = decodeURIComponent(candidates.at(-1))
                if (decoded === candidates.at(-1)) break
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
                || /[a-z]:\//.test(normalized)) throw new Error("Light Table artifact leaked private authority or filesystem state.")
        }
        return
    }
    if (Array.isArray(value)) return value.forEach(assertNoPrivateEvidence)
    if (value && typeof value === "object") Object.entries(value).forEach(([key, entry]) => { assertNoPrivateEvidence(key); assertNoPrivateEvidence(entry) })
}

function archive(file) {
    const source = exactFile(file)
    const zip = new AdmZip(source.bytes)
    const manifestEntry = zip.getEntry("project/project.json")
    if (!manifestEntry || manifestEntry.isDirectory) throw new Error("Light Table Project manifest is absent.")
    const text = manifestEntry.getData().toString("utf8")
    const project = validatePortableProject(JSON.parse(text))
    assert.equal(text, canonicalProjectJSON(project))
    assertNoPrivateEvidence(project)
    for (const media of project.media) {
        const entry = zip.getEntry(media.archivePath)
        if (!entry || entry.isDirectory) throw new Error(`Light Table archive media is absent for ${media.id}.`)
        const bytes = entry.getData()
        assert.equal(bytes.length, media.bytes)
        assert.equal(sha256(bytes), media.sha256)
    }
    return { file: source, project, manifestText: text, manifestSha256: sha256(text) }
}

function expectedPackage(receipt, runner) {
    assert.equal(receipt.productId, "galileo-gallery")
    assert.equal(receipt.profile, "g03-linux-host-port")
    assert.equal(receipt.packaged, true)
    assert.equal(receipt.platform, "linux")
    assert.equal(receipt.sourceSha, process.env.LIGHT_TABLE_EXPECTED_SHA)
    assert.equal(receipt.sourceTree, process.env.LIGHT_TABLE_EXPECTED_TREE)
    assert.match(receipt.buildId, /^g03-[a-z0-9]+$/)
    assert.deepEqual(receipt.rendererSecurity, { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: "persist:galileo-gallery-g03" })
    assert.equal(receipt.executable.sha256, process.env.LIGHT_TABLE_EXPECTED_EXECUTABLE_SHA)
    assert.equal(receipt.appAsar.sha256, process.env.LIGHT_TABLE_EXPECTED_APP_ASAR_SHA)
    assert.equal(receipt.ffmpeg.sha256, process.env.LIGHT_TABLE_EXPECTED_FFMPEG_SHA)
    assert.equal(receipt.sandboxHelper.sha256, process.env.LIGHT_TABLE_EXPECTED_SANDBOX_SHA)
    assert.equal(receipt.sandboxHelper.uid, 0)
    assert.equal(receipt.sandboxHelper.mode, 0o4755)
    assert.deepEqual({ executable: receipt.executable, appAsar: receipt.appAsar, ffmpeg: receipt.ffmpeg, sandboxHelper: receipt.sandboxHelper }, runner.package)
}

function screenshot(evidence, directory) {
    const target = exactFile(path.join(root, directory, evidence.file))
    assert.equal(target.sha256, evidence.sha256)
    assert.equal(target.bytes.length, evidence.bytes)
    assert(evidence.size.width > 100 && evidence.size.height > 100)
    assert.equal(evidence.opaquePixels, evidence.size.width * evidence.size.height)
    assert(evidence.sampledColors >= 8)
}

const fixture = json(path.join(root, "fixture-evidence.json"))
const runner = json(path.join(root, "runner-receipt.json"))
const normal = json(path.join(root, "run-normal", "receipt.json"))
const reduced = json(path.join(root, "run-reopen-reduced", "receipt.json"))
for (const receipt of [fixture, runner, normal, reduced]) assertNoPrivateEvidence(receipt)
assert.equal(fixture.format, "galileo-gallery-light-table-fixture-evidence")
assert.equal(fixture.one.mediaIds.length, 1)
assert.equal(fixture.one.videoIds.length, 0)
assert.equal(fixture.many.mediaIds.length, 24)
assert.equal(new Set(fixture.many.mediaIds).size, 24)
assert.equal(fixture.many.videoIds.length, 6)
assert.equal(new Set(fixture.many.sourceSha256).size, 24)
assert.equal(fixture.many.colors.length, 24)

assert.equal(runner.format, "galileo-gallery-light-table-runner-evidence")
assert.deepEqual(runner.modes, ["normal", "reopen-reduced"])
assert.equal(runner.sourceSha, process.env.LIGHT_TABLE_EXPECTED_SHA)
assert.equal(runner.sourceTree, process.env.LIGHT_TABLE_EXPECTED_TREE)
assert.equal(runner.runtimeRootsRemoved, true)
assert.equal(runner.disabledExportDestinationAbsent, true)

assert.equal(normal.format, "galileo-gallery-light-table-renderer-evidence")
assert.equal(normal.mode, "normal")
assert.equal(normal.reducedMotionForced, false)
assert.equal(reduced.format, normal.format)
assert.equal(reduced.mode, "reopen-reduced")
assert.equal(reduced.reducedMotionForced, true)
expectedPackage(normal.package, runner)
expectedPackage(reduced.package, runner)
assert.deepEqual(normal.package, reduced.package)

assert.deepEqual(normal.journey.project.one.ids, fixture.one.mediaIds)
assert.equal(normal.journey.project.one.grantCount, 1)
assert.deepEqual(normal.journey.project.many.ids, fixture.many.mediaIds)
assert.equal(normal.journey.project.many.grantCount, 24)
assert.equal(normal.journey.project.many.priorRootRetired, true)
assert.deepEqual(normal.journey.rendering.oneCorrelation.id, fixture.one.mediaIds[0])
assert.equal(normal.journey.rendering.oneCorrelation.expectedColor, fixture.one.colors[0])
assert(normal.journey.rendering.oneCorrelation.matches >= 8)
assert.match(normal.journey.rendering.oneCorrelation.digest, /^[a-f0-9]{64}$/)
assert.deepEqual(normal.journey.rendering.correlations.map((entry) => entry.id), fixture.many.mediaIds)
for (const [index, correlation] of normal.journey.rendering.correlations.entries()) {
    assert.equal(correlation.expectedColor, fixture.many.colors[index])
    assert(correlation.matches >= 8)
    assert.match(correlation.digest, /^[a-f0-9]{64}$/)
    assert(["img", "video"].includes(correlation.tag))
}
assert.deepEqual(normal.journey.rendering.stage, {
    renderer: "v2",
    version: "2",
    topology: "bounded-review-grid",
    opaque: "true",
    transparentSupported: "false",
    underlightPlacement: "table-layer-below-all-artwork",
    owners: 0,
    reducedMotion: "false",
    background: normal.journey.rendering.stage.background,
})
assert.doesNotMatch(normal.journey.rendering.stage.background, /^rgba\([^)]*,\s*0\)$/)
for (const evidence of Object.values(normal.journey.rendering.screenshots)) screenshot(evidence, "run-normal")

assert.deepEqual(normal.journey.controls.initial, { tableSpread: 0.83, overlap: 0.17, underlightStrength: 0.61, focusBehavior: "loupe-only", nudgeRestraint: 0.49 })
assert.deepEqual(normal.journey.controls.groupedGesture, { value: 0.86, undoDepth: 1 })
assert.equal(normal.journey.controls.groupedUndo.value, 0.83)
assert.equal(normal.journey.controls.groupedUndo.undoDepth, 0)
assert.deepEqual(normal.journey.controls.changed, { tableSpread: 0.89, overlap: 0.04, underlightStrength: 0.18, focusBehavior: "none", nudgeRestraint: 0.07 })
assert.deepEqual(normal.journey.controls.reset, {
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

const clocks = normal.journey.clocks
assert.equal(clocks.automatic.sourceTimeMs, 4_500)
assert.equal(clocks.fixed.sourceTimeMs, 6_000)
assert.equal(clocks.directed.sourceTimeMs, 4_500)
assert.equal(clocks.normalLater.sourceTimeMs, 13_500)
assert.notEqual(clocks.directed.geometrySha256, clocks.normalLater.geometrySha256)
assert.equal(clocks.start.sourceTimeMs, 0)
assert.equal(clocks.terminal.sourceTimeMs, 18_000)
assert.equal(clocks.start.geometrySha256, clocks.terminal.geometrySha256)
assert.deepEqual(clocks.directedSegments.map(({ id, kind, cycles, paceScale }) => ({ id, kind, cycles, paceScale })), [
    { id: "wake", kind: "cycle", cycles: 1, paceScale: 2 },
    { id: "review", kind: "cycle", cycles: 1, paceScale: 1 },
    { id: "final-inspection", kind: "hold", cycles: 1, paceScale: 1 },
    { id: "return", kind: "cycle", cycles: 1, paceScale: 2 },
])
assert.equal(clocks.directedSegments.reduce((sum, segment) => sum + segment.durationMs, 0), 18_000)

assert.equal(normal.journey.retarget.staleCallbacksDelivered, true)
assert.equal(normal.journey.retarget.staleCallbacksPublished, false)
assert.deepEqual(normal.journey.retarget.beforeStale, normal.journey.retarget.afterStale)
assert.equal(normal.journey.retarget.samplesB.length, 2)
assert.equal(normal.journey.retarget.samplesA.length, 2)
assert.deepEqual(normal.journey.retarget.samplesA.map((sample) => sample.id), normal.journey.retarget.samplesB.map((sample) => sample.id))
assert(normal.journey.retarget.samplesB.every((sample) => sample.currentTime > 0.35 && sample.currentTime < 0.55))
assert(normal.journey.retarget.samplesA.every((sample) => sample.currentTime > 1.25 && sample.currentTime < 1.45))
assert(normal.journey.retarget.samplesA.every((sample, index) => sample.digest !== normal.journey.retarget.samplesB[index].digest))
assert.deepEqual(normal.journey.retarget.samplesAfterStale, normal.journey.retarget.samplesA)
assert.deepEqual({
    createdBlobs: normal.journey.retarget.resourcesBeforeStale.createdBlobs,
    revokedBlobs: normal.journey.retarget.resourcesBeforeStale.revokedBlobs,
    activeBlobs: normal.journey.retarget.resourcesBeforeStale.activeBlobs,
}, {
    createdBlobs: normal.journey.retarget.resourcesAfterStale.createdBlobs,
    revokedBlobs: normal.journey.retarget.resourcesAfterStale.revokedBlobs,
    activeBlobs: normal.journey.retarget.resourcesAfterStale.activeBlobs,
})
assert.equal(normal.journey.retarget.afterCurrent.readyPosters, 6)
assert.equal(normal.journey.retarget.afterCurrent.owners, 0)
assert.deepEqual([...new Set(normal.journey.retarget.afterCurrent.targets)], [normal.journey.retarget.targetA])
assert.equal(normal.journey.retarget.samplesAfterCurrent.length, 2)
assert(normal.journey.retarget.samplesAfterCurrent.every((sample) => sample.target === normal.journey.retarget.targetA))
assert(normal.journey.retarget.samplesAfterCurrent.every((sample, index) => sample.digest !== normal.journey.retarget.samplesB[index].digest))
assert.equal(normal.journey.retarget.resourcesAfterStale.activeBlobs, 6)
for (const unavailable of [normal.journey.exportUnavailable, reduced.journey.exportUnavailable]) {
    assert.equal(unavailable.disabled, true)
    assert(unavailable.formatCount >= 2)
    assert.equal(unavailable.allFormatsDisabled, true)
    assert.equal(unavailable.unavailableCopyPresent, true)
    assert.equal(unavailable.progress, null)
    assert.equal(unavailable.attemptedActivation, true)
    assert.equal(unavailable.destinationAbsent, true)
    assert.match(unavailable.copySha256, /^[a-f0-9]{64}$/)
}
assert.equal(normal.journey.resources.beforeTeardown.maxConnectedOwners, 2)
assert(normal.journey.resources.beforeTeardown.connectedOwners <= 2)
for (const teardown of [normal.journey.resources.teardown, reduced.journey.resources.teardown]) {
    assert.equal(teardown.connectedOwners, 0)
    assert.equal(teardown.totalOwners, 0)
    assert.equal(teardown.retiredOwned, 0)
    assert.equal(teardown.activeBlobs, 0)
    assert.equal(teardown.createdBlobs, teardown.revokedBlobs)
}
for (const staging of [normal.journey.containment.staging, reduced.journey.containment.staging]) {
    assert.equal(staging.files, 0)
    assert.equal(staging.directories, 0)
    assert.equal(staging.bytes, 0)
    assert.equal(staging.sha256, sha256(""))
}

assert.deepEqual(reduced.journey.project.ids, fixture.many.mediaIds)
assert.equal(reduced.journey.project.grantCount, 24)
assert.equal(reduced.journey.project.canonicalReopenComparedExternally, true)
assert.equal(reduced.journey.reducedMotion.stage.reducedMotion, "true")
assert.equal(reduced.journey.reducedMotion.first.sourceTimeMs, 4_500)
assert.equal(reduced.journey.reducedMotion.later.sourceTimeMs, 13_500)
assert.equal(reduced.journey.reducedMotion.first.geometrySha256, reduced.journey.reducedMotion.later.geometrySha256)
assert.equal(reduced.journey.reducedMotion.start.geometrySha256, reduced.journey.reducedMotion.terminal.geometrySha256)
assert.equal(reduced.journey.reducedMotion.terminal.sourceTimeMs, 18_000)
assert.equal(reduced.journey.reducedMotion.staticGeometry, true)
screenshot(reduced.journey.screenshot, "run-reopen-reduced")

const oneArchive = archive(path.join(root, "light-table-one.galileo"))
const manyArchive = archive(path.join(root, "light-table-24.galileo"))
const savedArchive = archive(path.join(root, "light-table-saved.galileo"))
const reopenedArchive = archive(path.join(root, "light-table-reopened.galileo"))
assert.deepEqual(oneArchive.project.media.map((entry) => entry.id), fixture.one.mediaIds)
assert.deepEqual(oneArchive.project.media.map((entry) => entry.sha256), fixture.one.sourceSha256)
assert.deepEqual(manyArchive.project.media.map((entry) => entry.id), fixture.many.mediaIds)
assert.deepEqual(manyArchive.project.media.map((entry) => entry.sha256), fixture.many.sourceSha256)
assert.equal(savedArchive.file.sha256, normal.journey.project.saved.archiveSha256)
assert.equal(savedArchive.file.bytes.length, normal.journey.project.saved.archiveBytes)
assert.equal(savedArchive.file.sha256, reduced.journey.project.savedArchiveSha256)
assert.equal(reopenedArchive.file.sha256, reduced.journey.project.reopenedArchiveSha256)
assert.equal(savedArchive.manifestText, reopenedArchive.manifestText)
assert.deepEqual(savedArchive.project.media.map((entry) => entry.id), fixture.many.mediaIds)
assert.deepEqual(savedArchive.project.media.map((entry) => entry.sha256), fixture.many.sourceSha256)
assert.equal(savedArchive.project.scene.id, "light-table")
assert.equal(savedArchive.project.scene.version, 2)
assert.equal(savedArchive.project.timeline.mode, "directed")
assert.equal(savedArchive.project.look.parameters.backgroundStyle, "solid")
assert.equal(savedArchive.project.scene.parameters.tableSpread, 0.72)
assert.equal(savedArchive.project.scene.parameters.overlap, 0.1)
assert.equal(savedArchive.project.scene.parameters.focusBehavior, "route")
assert.equal(savedArchive.project.scene.parameters.nudgeRestraint, 0.28)
assert.equal(savedArchive.project.look.parameters.underlightStrength, 0.42)

for (const directory of ["run-normal", "run-reopen-reduced"]) {
    assert.equal(fs.existsSync(path.join(root, directory, "failure.json")), false)
}
console.log("Verified: exact packaged Light Table identity; canonical save/open/reopen; ordered 1/24 media; five-control grouped undo/reset; automatic/fixed/directed and terminal clocks; normal/reduced motion; opaque source-correlated pixels; two-owner and stale-callback containment; truthful disabled export; teardown; and path-free evidence.")
