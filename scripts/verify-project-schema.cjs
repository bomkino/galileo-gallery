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
const { fixtureConfig, writeMedia } = require("./fixtures/project-v2-fixture.cjs")

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

function writePcm16Wav(filePath, sampleFrames, channels = 2, sampleRate = 48_000) {
    const dataBytes = sampleFrames * channels * 2
    const bytes = Buffer.alloc(44 + dataBytes)
    bytes.write("RIFF", 0, "ascii")
    bytes.writeUInt32LE(bytes.length - 8, 4)
    bytes.write("WAVEfmt ", 8, "ascii")
    bytes.writeUInt32LE(16, 16)
    bytes.writeUInt16LE(1, 20)
    bytes.writeUInt16LE(channels, 22)
    bytes.writeUInt32LE(sampleRate, 24)
    bytes.writeUInt32LE(sampleRate * channels * 2, 28)
    bytes.writeUInt16LE(channels * 2, 32)
    bytes.writeUInt16LE(16, 34)
    bytes.write("data", 36, "ascii")
    bytes.writeUInt32LE(dataBytes, 40)
    let state = 0x12345678
    for (let sample = 0; sample < sampleFrames * channels; sample += 1) {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
        bytes.writeInt16LE((state & 0xffff) - 0x8000, 44 + sample * 2)
    }
    fs.writeFileSync(filePath, bytes)
    return filePath
}

function audioFixture(presenterPath, soundtrackPath) {
    return {
        id: "gallery-audio-intent",
        version: 1,
        sourceVideo: "per-media",
        sampleRate: 48_000,
        channels: 2,
        sources: [
            { id: "presenter-source", name: "Presenter.wav", role: "presenter", url: presenterPath, sampleRate: 48_000, channels: 2, sampleFrames: 4_800 },
            { id: "soundtrack-source", name: "Soundtrack.wav", role: "soundtrack", url: soundtrackPath, sampleRate: 48_000, channels: 2, sampleFrames: 9_600 },
        ],
        lanes: [
            {
                id: "presenter-lane", name: "Presenter", role: "presenter", gain: 1, muted: false, solo: false,
                clips: [{
                    id: "presenter-clip", sourceId: "presenter-source", timelineStart: { numerator: 1, denominator: 20 }, sourceIn: { numerator: 0, denominator: 1 },
                    sourceSpan: { numerator: 1, denominator: 10 }, duration: { numerator: 1, denominator: 10 }, loop: false, gain: 1, muted: false,
                    fadeIn: { numerator: 1, denominator: 100 }, fadeOut: { numerator: 1, denominator: 100 },
                }],
            },
            {
                id: "soundtrack-lane", name: "Soundtrack", role: "soundtrack", gain: 0.8, muted: false, solo: false,
                clips: [{
                    id: "soundtrack-clip", sourceId: "soundtrack-source", timelineStart: { numerator: 0, denominator: 1 }, sourceIn: { numerator: 0, denominator: 1 },
                    sourceSpan: { numerator: 1, denominator: 5 }, duration: { numerator: 3, denominator: 10 }, loop: true, gain: 0.75, muted: false,
                    fadeIn: { numerator: 1, denominator: 100 }, fadeOut: { numerator: 1, denominator: 100 },
                }],
            },
        ],
        ducking: {
            enabled: true,
            triggerLaneId: "presenter-lane",
            targetLaneIds: ["soundtrack-lane"],
            amount: 0.5,
            attack: { numerator: 1, denominator: 20 },
            release: { numerator: 1, denominator: 5 },
        },
        master: { gain: 0.9, muted: false },
    }
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
        assert.equal(manifest.timeline.fixedDurationMs, 0)
        assert.deepEqual(manifest.timeline.segments, [])
        assert.deepEqual(manifest.audio, config.audio)

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

        const presenterPath = writePcm16Wav(path.join(root, "private-presenter.wav"), 4_800)
        const soundtrackPath = writePcm16Wav(path.join(root, "private-soundtrack.wav"), 9_600)
        const audioConfig = { ...config, audio: audioFixture(presenterPath, soundtrackPath) }
        const audioProjectPath = path.join(root, "audio-round-trip.galileo")
        const audioSaved = await savePortableProjectArchive({ config: audioConfig, outputPath: audioProjectPath, tempRoot: root, mediaPathFromURL: (url) => url })
        assert.deepEqual(audioSaved.project.audio.sources.map((source) => source.role), ["presenter", "soundtrack"])
        assert.deepEqual(audioSaved.project.audio.sources.map((source) => source.archivePath), [
            `project/audio/0001-${audioSaved.project.audio.sources[0].sha256.slice(0, 16)}.wav`,
            `project/audio/0002-${audioSaved.project.audio.sources[1].sha256.slice(0, 16)}.wav`,
        ])
        assert.equal(canonicalProjectJSON(audioSaved.project).includes(presenterPath), false)
        assert.equal(canonicalProjectJSON(audioSaved.project).includes(soundtrackPath), false)
        const audioOpened = await openPortableProjectArchive({
            sourcePath: audioProjectPath,
            stagingParent: roots.staging,
            openedProjectsRoot: roots.opened,
            mediaURLFromPath: (filePath) => filePath,
        })
        assert(audioOpened.config.audio.sources.every((source) => fs.existsSync(source.url)))
        const normalizedOpenedAudio = {
            ...audioOpened.config.audio,
            sources: audioOpened.config.audio.sources.map((source, index) => ({ ...source, url: [presenterPath, soundtrackPath][index] })),
        }
        assert.deepEqual(normalizedOpenedAudio, audioConfig.audio)
        const audioReopenedPath = path.join(root, "audio-reopened.galileo")
        const audioReopened = await savePortableProjectArchive({ config: audioOpened.config, outputPath: audioReopenedPath, tempRoot: root, mediaPathFromURL: (url) => url })
        assert.equal(canonicalProjectJSON(audioReopened.project), canonicalProjectJSON(audioSaved.project))

        const sourceVideoManifest = structuredClone(manifest)
        sourceVideoManifest.media[0] = {
            ...sourceVideoManifest.media[0],
            kind: "video",
            signature: "webm",
            archivePath: `project/media/0001-${sourceVideoManifest.media[0].sha256.slice(0, 16)}.webm`,
        }
        sourceVideoManifest.audio = audioFixture(presenterPath, soundtrackPath)
        sourceVideoManifest.audio.sources = [{
            id: "source-video-audio", name: "Frame audio", role: "source-video", mediaId: "frame-one", sampleRate: 48_000, channels: 2, sampleFrames: 48_000,
        }]
        sourceVideoManifest.audio.lanes = [{
            id: "source-video-lane", name: "Source video", role: "source-video", gain: 1, muted: false, solo: false,
            clips: [{ id: "source-video-clip", sourceId: "source-video-audio", timelineStart: { numerator: 0, denominator: 1 }, sourceIn: { numerator: 0, denominator: 1 }, sourceSpan: { numerator: 1, denominator: 1 }, duration: { numerator: 1, denominator: 1 }, loop: false, gain: 1, muted: false, fadeIn: { numerator: 0, denominator: 1 }, fadeOut: { numerator: 0, denominator: 1 } }],
        }]
        sourceVideoManifest.audio.ducking = { ...sourceVideoManifest.audio.ducking, enabled: false, targetLaneIds: [] }
        assert.equal(validatePortableProject(sourceVideoManifest).audio.sources[0].mediaId, "frame-one")
        const duplicateSourceVideo = structuredClone(sourceVideoManifest)
        duplicateSourceVideo.audio.sources.push({ ...duplicateSourceVideo.audio.sources[0], id: "source-video-audio-duplicate" })
        assert.throws(() => validatePortableProject(duplicateSourceVideo), (error) => error?.code === "audio_invalid")

        await assert.rejects(
            savePortableProjectArchive({
                config: { ...config, items: Array.from({ length: 4_094 }, (_, index) => ({ ...config.items[0], id: `quota-${index}`, url: path.join(root, "never-read.png") })) },
                outputPath: path.join(root, "too-many-authored-entries.galileo"),
                tempRoot: root,
                mediaPathFromURL: (url) => url,
            }),
            (error) => error?.code === "too_many_entries"
        )

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
            ["timeline_invalid", (project) => ({ ...project, timeline: { ...project.timeline, mode: "fixed-duration", fixedDurationMs: 0 } })],
            ["timeline_invalid", (project) => ({ ...project, timeline: { ...project.timeline, mode: "directed", segments: [{ id: "bad", kind: "cycle", cycles: 0, paceScale: 1, durationMs: 1000 }] } })],
            ["audio_invalid", (project) => ({ ...project, audio: { ...project.audio, lanes: [{}] } })],
            ["audio_invalid", (project) => ({ ...project, audio: { ...project.audio, sources: [{ id: "bad", name: "Bad", role: "soundtrack", archivePath: "../../bad.wav", bytes: 46, sha256: "a".repeat(64), signature: "wav-pcm16", sampleRate: 48000, channels: 2, sampleFrames: 1 }] } })],
            ["audio_invalid", (project) => ({ ...project, audio: { ...project.audio, ducking: { ...project.audio.ducking, amount: 2 } } })],
            ["audio_invalid", (project) => ({ ...project, audio: { ...project.audio, ducking: { ...project.audio.ducking, attack: { numerator: 2, denominator: 4 } } } })],
            ["audio_invalid", (project) => ({ ...project, audio: { ...project.audio, lanes: [{ id: "private-lane", name: "/Users/alice/private.wav", role: "soundtrack", gain: 1, muted: false, solo: false, clips: [] }] } })],
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

        const audioMissing = path.join(root, "audio-missing.galileo")
        rewriteArchive(audioProjectPath, audioMissing, (project) => project, (zip, project) => zip.deleteFile(project.audio.sources[0].archivePath))
        await expectFailure("media_missing", audioMissing, roots, priorProject)

        const audioHashMismatch = path.join(root, "audio-hash-mismatch.galileo")
        rewriteArchive(audioProjectPath, audioHashMismatch, (project) => project, (zip, project) => {
            const source = project.audio.sources[0]
            const bytes = zip.readFile(source.archivePath)
            bytes[bytes.length - 1] ^= 0xff
            zip.deleteFile(source.archivePath)
            zip.addFile(source.archivePath, bytes)
        })
        await expectFailure("media_hash_mismatch", audioHashMismatch, roots, priorProject)

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

        const audioCancelController = new AbortController()
        const openedBeforeAudioCancel = fs.readdirSync(roots.opened).sort()
        let promotedResources = 0
        await assert.rejects(
            openPortableProjectArchive({
                sourcePath: audioProjectPath,
                stagingParent: roots.staging,
                openedProjectsRoot: roots.opened,
                mediaURLFromPath: (filePath) => {
                    promotedResources += 1
                    if (promotedResources === audioConfig.items.length + 1) audioCancelController.abort()
                    return filePath
                },
                signal: audioCancelController.signal,
            }),
            (error) => error?.code === "cancelled"
        )
        assert.deepEqual(fs.readdirSync(roots.opened).sort(), openedBeforeAudioCancel)
        assert.deepEqual(fs.readdirSync(roots.staging), [])

        console.log("Verified: clean v2 Project schema, canonical visual/audio save/open/reopen, ordered hashes, three audio roles, privacy exclusions, typed failures, cancellation, and prior-state preservation.")
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
}

run().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
