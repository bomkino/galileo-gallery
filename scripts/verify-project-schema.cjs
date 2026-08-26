const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const AdmZip = require("adm-zip")
const {
    openPortableProjectArchive,
    savePortableProjectArchive,
} = require("../electron/project-persistence.cjs")
const {
    canonicalProjectJSON,
    validatePortableProject,
} = require("../electron/project-schema.cjs")

const SETTINGS = {
    canvasPreset: "fullHD", canvasWidth: 1920, canvasHeight: 1080, ratioMode: "auto", fixedRatio: "sixteenNine",
    customRatioWidth: 16, customRatioHeight: 9, imageFit: "contain", autoplayVideos: true, loopVideos: true,
    paddingUnit: "px", paddingTop: 6, paddingRight: 6, paddingBottom: 6, paddingLeft: 6, captionGap: 10,
    motionPreset: "magnetic", launchMs: 120, arrivalMs: 160, growMs: 420, exitMs: 340, paceMs: 230,
    axis: "horizontal", direction: "forward", startMode: "auto", playKind: "repeat", repeatCount: 5,
    leadInMs: 800, holdMs: 900, finaleGrowMs: 750, finaleHoldMs: 2600, fadeMs: 600, canvasPose: 62,
    spotlightsEnabled: false, finaleEnabled: false, heroSize: 70, finaleSize: 100, centerBump: 5, tilt: 10,
    sway: 70, idleDim: 30, idleMute: 45, spotlightDim: 55, speedBlur: 3, slideHeight: 44, gap: 30,
    cornerStyle: "squircle", cornerSmoothing: 60, radius: 16, shadow: 35, gridSize: 54, gridStrength: 7,
    gridDrift: 30, vignette: 12, showHint: true, theme: "dark", ground: "", paper: "",
    backgroundStyle: "solid", backgroundColor2: "#4a2f2a", backgroundAngle: 145, backgroundTexture: 8,
    exportQuality: "high",
}

function fixtureConfig(media) {
    return {
        schemaVersion: 2,
        styleId: "cms-slideshow",
        items: [
            { id: "frame-one", name: "First frame.png", type: "image", url: media[0], ratio: 4 / 3, aspectMode: "auto", ratioW: 16, ratioH: 9, caption: "Opening", spotlight: true, muted: false },
            { id: "frame-two", name: "Second frame.webp", type: "image", url: media[1], ratio: 9 / 16, aspectMode: "custom", ratioW: 9, ratioH: 16, spotlight: false, muted: true },
        ],
        settings: { ...SETTINGS, canvasPreset: "vertical", canvasWidth: 1080, canvasHeight: 1920, axis: "vertical" },
    }
}

function writeMedia(root) {
    const first = path.join(root, "private-source-one.png")
    const second = path.join(root, "private-source-two.webp")
    fs.writeFileSync(first, Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("gallery-fixture-one")]))
    fs.writeFileSync(second, Buffer.concat([Buffer.from("RIFF0000WEBP", "ascii"), Buffer.from("gallery-fixture-two")]))
    return [first, second]
}

function archiveManifest(archivePath) {
    const zip = new AdmZip(archivePath)
    return JSON.parse(zip.readAsText("project/project.json"))
}

function rewriteArchive(source, destination, changeManifest, changeEntries = () => {}) {
    const original = new AdmZip(source)
    const manifest = changeManifest(archiveManifest(source))
    const next = new AdmZip()
    for (const entry of original.getEntries()) {
        if (entry.isDirectory || entry.entryName === "project/project.json") continue
        next.addFile(entry.entryName, entry.getData())
    }
    next.addFile("project/project.json", Buffer.from(canonicalProjectJSON(manifest)))
    changeEntries(next, manifest)
    next.writeZip(destination)
}

async function expectFailure(code, archivePath, roots, priorProject) {
    const beforeBytes = fs.readFileSync(archivePath)
    let currentProject = priorProject
    await assert.rejects(
        async () => {
            const opened = await openPortableProjectArchive({
                sourcePath: archivePath,
                stagingParent: roots.staging,
                openedProjectsRoot: roots.opened,
                mediaURLFromPath: (filePath) => filePath,
            })
            currentProject = opened.config
        },
        (error) => error?.code === code
    )
    assert.strictEqual(currentProject, priorProject, `${code} replaced the prior Project`)
    assert.deepEqual(fs.readFileSync(archivePath), beforeBytes, `${code} changed the source archive`)
    assert.deepEqual(fs.existsSync(roots.staging) ? fs.readdirSync(roots.staging) : [], [], `${code} left staging residue`)
}

async function run() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-project-schema-"))
    const roots = { staging: path.join(root, "staging"), opened: path.join(root, "opened") }
    try {
        const mediaPaths = writeMedia(root)
        const config = fixtureConfig(mediaPaths)
        const projectPath = path.join(root, "canonical.galileo")
        const saved = await savePortableProjectArchive({
            config,
            outputPath: projectPath,
            tempRoot: root,
            mediaPathFromURL: (url) => url,
        })
        const manifest = archiveManifest(projectPath)
        assert.deepEqual(manifest, saved.project)
        assert.equal(canonicalProjectJSON(manifest), canonicalProjectJSON(validatePortableProject(structuredClone(manifest))))
        assert.deepEqual(manifest.media.map((entry) => entry.name), ["First frame.png", "Second frame.webp"])
        assert.deepEqual(manifest.media.map((entry) => entry.sha256), mediaPaths.map((file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")))
        assert.deepEqual(manifest.media.map((entry) => entry.signature), ["png", "webp"])
        assert.equal(manifest.scene.id, "cms-slideshow")
        assert.equal(manifest.scene.version, 1)
        assert.equal(manifest.timeline.mode, "automatic")
        assert.deepEqual(manifest.audio, { id: "gallery-audio-intent", version: 1, sourceVideo: "per-media", lanes: [], master: { gain: 1, muted: false } })

        const portableText = canonicalProjectJSON(manifest)
        for (const forbidden of [...mediaPaths, "reel-media://", "grant", "interfaceScale", "mcp", "waveform", "cache", "jobId"]) {
            assert.equal(portableText.includes(forbidden), false, `portable manifest leaked ${forbidden}`)
        }

        const opened = await openPortableProjectArchive({
            sourcePath: projectPath,
            stagingParent: roots.staging,
            openedProjectsRoot: roots.opened,
            mediaURLFromPath: (filePath) => filePath,
        })
        assert.deepEqual({ ...opened.config, items: opened.config.items.map((item, index) => ({ ...item, url: mediaPaths[index] })) }, config)
        assert.deepEqual(opened.project, manifest)
        assert(opened.config.items.every((item) => fs.existsSync(item.url)))
        assert.deepEqual(fs.readdirSync(roots.staging), [])

        const reopenedPath = path.join(root, "reopened.galileo")
        const reopenedSave = await savePortableProjectArchive({
            config: opened.config,
            outputPath: reopenedPath,
            tempRoot: root,
            mediaPathFromURL: (url) => url,
        })
        assert.equal(canonicalProjectJSON(reopenedSave.project), canonicalProjectJSON(manifest))

        const protectedDestination = path.join(root, "protected.galileo")
        fs.writeFileSync(protectedDestination, "known-prior-project-bytes")
        await assert.rejects(
            savePortableProjectArchive({
                config: { ...config, sceneId: "invalid", items: [{ ...config.items[0], url: path.join(root, "missing.png") }] },
                outputPath: protectedDestination,
                tempRoot: root,
                mediaPathFromURL: (url) => url,
            }),
            (error) => error?.code === "media_missing"
        )
        assert.equal(fs.readFileSync(protectedDestination, "utf8"), "known-prior-project-bytes")

        const priorProject = Object.freeze({ identity: "known-prior-project", revision: 7 })
        const cases = [
            ["wrong_product", (project) => ({ ...project, product: "pitchdog-drift" })],
            ["future_version_unsupported", (project) => ({ ...project, schemaVersion: 99 })],
            ["canvas_invalid", (project) => ({ ...project, canvas: { ...project.canvas, canvasWidth: 1 } })],
            ["scene_invalid", (project) => ({ ...project, scene: { ...project.scene, version: 2 } })],
            ["look_invalid", (project) => ({ ...project, look: { ...project.look, id: "gallery-look.paper" } })],
            ["look_invalid", (project) => ({ ...project, look: { ...project.look, parameters: { ...project.look.parameters, ground: "/Users/alice/private" } } })],
            ["timeline_invalid", (project) => ({ ...project, timeline: { ...project.timeline, mode: "mystery" } })],
            ["audio_invalid", (project) => ({ ...project, audio: { ...project.audio, lanes: [{}] } })],
        ]
        for (const [code, mutate] of cases) {
            const target = path.join(root, `${code}.galileo`)
            rewriteArchive(projectPath, target, mutate)
            await expectFailure(code, target, roots, priorProject)
        }

        const missing = path.join(root, "missing.galileo")
        rewriteArchive(projectPath, missing, (project) => project, (zip, project) => zip.deleteFile(project.media[0].archivePath))
        await expectFailure("media_missing", missing, roots, priorProject)

        const unexpected = path.join(root, "unexpected.galileo")
        rewriteArchive(projectPath, unexpected, (project) => project, (zip) => zip.addFile("project/undeclared.bin", Buffer.from("no")))
        await expectFailure("unexpected_archive_entry", unexpected, roots, priorProject)

        const hashMismatch = path.join(root, "hash-mismatch.galileo")
        rewriteArchive(projectPath, hashMismatch, (project) => project, (zip, project) => {
            zip.deleteFile(project.media[0].archivePath)
            zip.addFile(project.media[0].archivePath, Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("changed")]))
        })
        await expectFailure("media_hash_mismatch", hashMismatch, roots, priorProject)

        const signatureMismatch = path.join(root, "signature-mismatch.galileo")
        rewriteArchive(projectPath, signatureMismatch, (project) => project, (zip, project) => {
            zip.deleteFile(project.media[0].archivePath)
            zip.addFile(project.media[0].archivePath, Buffer.from("ffd8ff006a706567", "hex"))
        })
        await expectFailure("media_signature_mismatch", signatureMismatch, roots, priorProject)

        const legacy = path.join(root, "legacy-v1.galileo")
        const legacyZip = new AdmZip()
        legacyZip.addFile("project/project.json", Buffer.from(JSON.stringify({ type: "galileo-gallery-project", version: 1, config: {} })))
        legacyZip.writeZip(legacy)
        await expectFailure("legacy_project_unsupported", legacy, roots, priorProject)

        const controller = new AbortController()
        controller.abort()
        await assert.rejects(
            openPortableProjectArchive({
                sourcePath: projectPath,
                stagingParent: roots.staging,
                openedProjectsRoot: roots.opened,
                mediaURLFromPath: (filePath) => filePath,
                signal: controller.signal,
            }),
            (error) => error?.code === "cancelled"
        )
        assert.deepEqual(fs.readdirSync(roots.staging), [])

        const midCommitController = new AbortController()
        const openedBeforeCancel = fs.readdirSync(roots.opened).sort()
        await assert.rejects(
            openPortableProjectArchive({
                sourcePath: projectPath,
                stagingParent: roots.staging,
                openedProjectsRoot: roots.opened,
                mediaURLFromPath: (filePath) => {
                    midCommitController.abort()
                    return filePath
                },
                signal: midCommitController.signal,
            }),
            (error) => error?.code === "cancelled"
        )
        assert.deepEqual(fs.readdirSync(roots.opened).sort(), openedBeforeCancel)
        assert.deepEqual(fs.readdirSync(roots.staging), [])

        console.log("Verified: clean v2 Project schema, canonical save/open/reopen, media identity/hash/signature, privacy exclusions, typed failures, cancellation, and prior-state preservation.")
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
}

run().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
