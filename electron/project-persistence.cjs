const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { pipeline } = require("node:stream/promises")
const AdmZip = require("adm-zip")
const { writeFileSafely } = require("./file-operations.cjs")
const {
    PROJECT_IMPORT_LIMITS,
    ProjectImportError,
    assertStagingSpace,
    withStagedProjectArchive,
} = require("./project-import.cjs")
const {
    ProjectSchemaError,
    canonicalProjectJSON,
    configFromPortableProject,
    inspectAudioFile,
    inspectMediaFile,
    portableProjectFromConfig,
    validatePortableProject,
} = require("./project-schema.cjs")

function checkpoint(signal) {
    if (signal?.aborted) throw new ProjectImportError("cancelled")
}

function containAuthoredCompressionRatios(archive, maximumRatio) {
    for (const entry of archive.getEntries()) {
        if (entry.isDirectory || entry.header.size === 0) continue
        const compressedBytes = Math.max(1, entry.getCompressedData().length)
        if (entry.header.size > compressedBytes * maximumRatio) {
            entry.header.method = 0
        }
    }
}

function importError(error) {
    if (error instanceof ProjectImportError) return error
    if (error instanceof ProjectSchemaError) return new ProjectImportError(error.code, { cause: error })
    if (error?.name === "AbortError" || error?.code === "ABORT_ERR") return new ProjectImportError("cancelled", { cause: error })
    return new ProjectImportError("internal_error", { cause: error })
}

function containedFile(contentsRoot, archivePath) {
    const target = path.resolve(contentsRoot, ...archivePath.split("/"))
    const relative = path.relative(contentsRoot, target)
    if (!relative || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
        throw new ProjectImportError("manifest_invalid")
    }
    return target
}

function readManifest(contentsRoot) {
    const target = containedFile(contentsRoot, "project/project.json")
    let stat
    try {
        stat = fs.lstatSync(target)
    } catch (error) {
        throw new ProjectImportError("manifest_missing", { cause: error })
    }
    if (!stat.isFile() || stat.size > PROJECT_IMPORT_LIMITS.manifestBytes) throw new ProjectImportError("manifest_invalid")
    try {
        return JSON.parse(fs.readFileSync(target, "utf8"))
    } catch (error) {
        throw new ProjectImportError("manifest_invalid", { cause: error })
    }
}

function validateEntrySet(entries, project) {
    const actualFiles = new Set(entries.filter((entry) => !entry.directory).map((entry) => entry.normalized))
    const actualDirectories = new Set(entries.filter((entry) => entry.directory).map((entry) => entry.normalized))
    const audioAssets = project.audio.sources.filter((entry) => entry.role !== "source-video")
    const expectedFiles = new Set(["project/project.json", ...project.media.map((entry) => entry.archivePath), ...audioAssets.map((entry) => entry.archivePath)])
    const allowedDirectories = new Set(["project", "project/media", ...(audioAssets.length ? ["project/audio"] : [])])
    for (const expected of expectedFiles) {
        if (!actualFiles.has(expected)) throw new ProjectImportError(expected === "project/project.json" ? "manifest_missing" : "media_missing")
    }
    for (const actual of actualFiles) {
        if (!expectedFiles.has(actual)) throw new ProjectImportError("unexpected_archive_entry")
    }
    for (const actual of actualDirectories) {
        if (!allowedDirectories.has(actual)) throw new ProjectImportError("unexpected_archive_entry")
    }
}

async function verifyMedia(contentsRoot, media, signal) {
    for (const entry of media) {
        checkpoint(signal)
        const target = containedFile(contentsRoot, entry.archivePath)
        let inspected
        try {
            inspected = await inspectMediaFile(target, signal)
        } catch (error) {
            if (error instanceof ProjectSchemaError) throw importError(error)
            if (error?.code === "ENOENT") throw new ProjectImportError("media_missing", { cause: error })
            throw error
        }
        if (inspected.signature !== entry.signature) throw new ProjectImportError("media_signature_mismatch")
        if (inspected.bytes !== entry.bytes) throw new ProjectImportError("media_hash_mismatch")
        if (inspected.sha256 !== entry.sha256) throw new ProjectImportError("media_hash_mismatch")
    }
}

async function verifyAudio(contentsRoot, sources, signal) {
    for (const entry of sources.filter((source) => source.role !== "source-video")) {
        checkpoint(signal)
        const target = containedFile(contentsRoot, entry.archivePath)
        let inspected
        try {
            inspected = await inspectAudioFile(target, signal)
        } catch (error) {
            if (error instanceof ProjectSchemaError) throw importError(error)
            if (error?.code === "ENOENT") throw new ProjectImportError("media_missing", { cause: error })
            throw error
        }
        if (inspected.signature !== entry.signature) throw new ProjectImportError("media_signature_mismatch")
        if (inspected.bytes !== entry.bytes || inspected.sha256 !== entry.sha256) throw new ProjectImportError("media_hash_mismatch")
        if (inspected.sampleRate !== entry.sampleRate || inspected.channels !== entry.channels || inspected.sampleFrames !== entry.sampleFrames) {
            throw new ProjectImportError("media_signature_mismatch")
        }
    }
}

async function copyValidatedMedia(contentsRoot, project, openedProjectsRoot, mediaURLFromPath, signal) {
    fs.mkdirSync(openedProjectsRoot, { recursive: true, mode: 0o700 })
    const openedRootStat = fs.lstatSync(openedProjectsRoot)
    if (!openedRootStat.isDirectory() || openedRootStat.isSymbolicLink()) throw new ProjectImportError("internal_error")
    const projectRoot = path.join(openedProjectsRoot, `open-${crypto.randomUUID()}`)
    fs.mkdirSync(projectRoot, { recursive: false, mode: 0o700 })
    try {
        const urls = []
        for (const entry of project.media) {
            checkpoint(signal)
            const source = containedFile(contentsRoot, entry.archivePath)
            const destination = path.join(projectRoot, path.basename(entry.archivePath))
            await pipeline(
                fs.createReadStream(source),
                fs.createWriteStream(destination, { flags: "wx", mode: 0o600 }),
                { signal }
            )
            const copied = await inspectMediaFile(destination, signal)
            if (copied.bytes !== entry.bytes || copied.sha256 !== entry.sha256 || copied.signature !== entry.signature) {
                throw new ProjectImportError("media_hash_mismatch")
            }
            urls.push(mediaURLFromPath(destination))
        }
        const audioURLs = Object.create(null)
        for (const entry of project.audio.sources.filter((source) => source.role !== "source-video")) {
            checkpoint(signal)
            const source = containedFile(contentsRoot, entry.archivePath)
            const destination = path.join(projectRoot, path.basename(entry.archivePath))
            await pipeline(
                fs.createReadStream(source),
                fs.createWriteStream(destination, { flags: "wx", mode: 0o600 }),
                { signal }
            )
            const copied = await inspectAudioFile(destination, signal)
            if (copied.bytes !== entry.bytes || copied.sha256 !== entry.sha256 || copied.signature !== entry.signature
                || copied.sampleRate !== entry.sampleRate || copied.channels !== entry.channels || copied.sampleFrames !== entry.sampleFrames) {
                throw new ProjectImportError("media_hash_mismatch")
            }
            audioURLs[entry.id] = mediaURLFromPath(destination)
        }
        checkpoint(signal)
        return { projectRoot, urls, audioURLs }
    } catch (error) {
        fs.rmSync(projectRoot, { recursive: true, force: true })
        throw error
    }
}

async function savePortableProjectArchive(options) {
    const limits = Object.freeze({ ...PROJECT_IMPORT_LIMITS, ...(options.limits ?? {}) })
    let temporary = null
    try {
        if (!options.config || typeof options.config !== "object" || Array.isArray(options.config)
            || !Array.isArray(options.config.items) || options.config.items.length > 256) {
            throw new ProjectSchemaError("manifest_invalid", "The current Project cannot be serialized safely.")
        }
        const configuredAudioSources = options.config.audio?.sources ?? []
        if (!Array.isArray(configuredAudioSources) || configuredAudioSources.length > 512) throw new ProjectSchemaError("audio_invalid", "Audio source table is invalid.")
        const externalAudio = configuredAudioSources.filter((source) => source.role !== "source-video")
        const authoredEntryCount = 1 + options.config.items.length + externalAudio.length + 2 + (externalAudio.length ? 1 : 0)
        if (authoredEntryCount > limits.entryCount) throw new ProjectImportError("too_many_entries")

        const placeholderMedia = options.config.items.map((item, index) => {
            const signature = item?.type === "video" ? "iso-media" : "png"
            const extension = signature === "iso-media" ? ".mp4" : ".png"
            const sha256 = crypto.createHash("sha256").update(`project-save-media-${index}`).digest("hex")
            return { archivePath: `project/media/${String(index + 1).padStart(4, "0")}-${sha256.slice(0, 16)}${extension}`, bytes: 1, sha256, signature }
        })
        const placeholderAudio = externalAudio.map((source, index) => {
            const sha256 = crypto.createHash("sha256").update(`project-save-audio-${index}`).digest("hex")
            return { id: source?.id, archivePath: `project/audio/${String(index + 1).padStart(4, "0")}-${sha256.slice(0, 16)}.wav`, bytes: 46, sha256, signature: "wav-pcm16" }
        })
        portableProjectFromConfig(options.config, placeholderMedia, placeholderAudio)

        let authoredExpandedBytes = 0
        const media = []
        const mediaSources = []
        for (let index = 0; index < options.config.items.length; index += 1) {
            const item = options.config.items[index]
            const source = options.mediaPathFromURL(item.url)
            let sourceStat
            try { sourceStat = fs.lstatSync(source) } catch (error) { throw new ProjectImportError("media_missing", { cause: error }) }
            if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new ProjectSchemaError("media_signature_mismatch", "Media source is not a regular file.")
            if (sourceStat.size > limits.individualExpandedBytes) throw new ProjectImportError("entry_too_large")
            authoredExpandedBytes += sourceStat.size
            if (authoredExpandedBytes > limits.totalExpandedBytes) throw new ProjectImportError("expanded_size_exceeded")
            const sourceInspection = await inspectMediaFile(source)
            if (sourceInspection.bytes !== sourceStat.size) throw new ProjectSchemaError("media_hash_mismatch", "Media source changed while saving.")
            const provisionalName = `${String(index + 1).padStart(4, "0")}-${sourceInspection.sha256.slice(0, 16)}`
            const extension = {
                png: ".png", jpeg: ".jpg", gif: ".gif", webp: ".webp", avif: ".avif", webm: ".webm", "iso-media": ".mp4",
            }[sourceInspection.signature]
            const archivePath = `project/media/${provisionalName}${extension}`
            media.push({ archivePath, ...sourceInspection })
            mediaSources.push({ source, fileName: `${provisionalName}${extension}`, inspection: sourceInspection })
        }
        const audioAssets = []
        const audioSources = []
        for (let index = 0; index < externalAudio.length; index += 1) {
            const source = externalAudio[index]
            const sourcePath = options.mediaPathFromURL(source.url)
            let sourceStat
            try { sourceStat = fs.lstatSync(sourcePath) } catch (error) { throw new ProjectImportError("media_missing", { cause: error }) }
            if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new ProjectSchemaError("media_signature_mismatch", "Audio source is not a regular file.")
            if (sourceStat.size > limits.individualExpandedBytes) throw new ProjectImportError("entry_too_large")
            authoredExpandedBytes += sourceStat.size
            if (authoredExpandedBytes > limits.totalExpandedBytes) throw new ProjectImportError("expanded_size_exceeded")
            const inspected = await inspectAudioFile(sourcePath)
            if (inspected.bytes !== sourceStat.size) throw new ProjectSchemaError("media_hash_mismatch", "Audio source changed while saving.")
            if (inspected.sampleRate !== source.sampleRate || inspected.channels !== source.channels || inspected.sampleFrames !== source.sampleFrames) {
                throw new ProjectSchemaError("audio_invalid", "Audio source identity and decoded format disagree.")
            }
            const fileName = `${String(index + 1).padStart(4, "0")}-${inspected.sha256.slice(0, 16)}.wav`
            const archivePath = `project/audio/${fileName}`
            audioAssets.push({ id: source.id, archivePath, bytes: inspected.bytes, sha256: inspected.sha256, signature: inspected.signature })
            audioSources.push({ source: sourcePath, fileName, inspection: inspected })
        }
        const project = portableProjectFromConfig(options.config, media, audioAssets)
        const projectJSON = canonicalProjectJSON(project)
        const manifestBytes = Buffer.byteLength(projectJSON)
        if (manifestBytes > limits.manifestBytes) throw new ProjectImportError("entry_too_large")
        authoredExpandedBytes += manifestBytes
        if (authoredExpandedBytes > limits.totalExpandedBytes) throw new ProjectImportError("expanded_size_exceeded")
        assertStagingSpace(options.tempRoot, authoredExpandedBytes, limits)

        temporary = fs.mkdtempSync(path.join(options.tempRoot, "galileo-gallery-save-"))
        const projectFolder = path.join(temporary, "project")
        const mediaFolder = path.join(projectFolder, "media")
        fs.mkdirSync(mediaFolder, { recursive: true, mode: 0o700 })
        for (const entry of mediaSources) {
            const destination = path.join(mediaFolder, entry.fileName)
            await pipeline(
                fs.createReadStream(entry.source, { start: 0, end: entry.inspection.bytes - 1 }),
                fs.createWriteStream(destination, { flags: "wx", mode: 0o600 })
            )
            const copied = await inspectMediaFile(destination)
            if (copied.bytes !== entry.inspection.bytes || copied.sha256 !== entry.inspection.sha256 || copied.signature !== entry.inspection.signature) {
                throw new ProjectSchemaError("media_hash_mismatch", "Media source changed while saving.")
            }
        }
        if (audioSources.length) fs.mkdirSync(path.join(projectFolder, "audio"), { recursive: false, mode: 0o700 })
        for (const entry of audioSources) {
            const destination = path.join(projectFolder, "audio", entry.fileName)
            await pipeline(
                fs.createReadStream(entry.source, { start: 0, end: entry.inspection.bytes - 1 }),
                fs.createWriteStream(destination, { flags: "wx", mode: 0o600 })
            )
            const copied = await inspectAudioFile(destination)
            if (copied.bytes !== entry.inspection.bytes || copied.sha256 !== entry.inspection.sha256 || copied.signature !== entry.inspection.signature) {
                throw new ProjectSchemaError("media_hash_mismatch", "Audio source changed while saving.")
            }
        }
        fs.writeFileSync(path.join(projectFolder, "project.json"), projectJSON, { flag: "wx", mode: 0o600 })
        await writeFileSafely(options.outputPath, (stagedOutputPath) => {
            // AdmZip is confined to app-authored output. Untrusted input is streamed only by G01A/yauzl.
            const archive = new AdmZip()
            archive.addLocalFolder(projectFolder, "project")
            containAuthoredCompressionRatios(archive, Math.min(limits.aggregateCompressionRatio, limits.individualCompressionRatio))
            archive.writeZip(stagedOutputPath)
            if (fs.statSync(stagedOutputPath).size > limits.archiveBytes) throw new ProjectImportError("archive_too_large")
        })
        return { outputPath: options.outputPath, project }
    } catch (error) {
        throw importError(error)
    } finally {
        if (temporary) fs.rmSync(temporary, { recursive: true, force: true })
    }
}

async function openPortableProjectArchive(options) {
    try {
        return await withStagedProjectArchive(options, async ({ contentsRoot, entries }) => {
            checkpoint(options.signal)
            const raw = readManifest(contentsRoot)
            if (["galileo-gallery-project", "opening-reel-project"].includes(raw?.type) && raw?.version === 1) {
                throw new ProjectImportError("legacy_project_unsupported")
            }
            let project
            try {
                project = validatePortableProject(raw)
            } catch (error) {
                throw importError(error)
            }
            validateEntrySet(entries, project)
            await verifyMedia(contentsRoot, project.media, options.signal)
            await verifyAudio(contentsRoot, project.audio.sources, options.signal)
            const committed = await copyValidatedMedia(
                contentsRoot,
                project,
                options.openedProjectsRoot,
                options.mediaURLFromPath,
                options.signal
            )
            try {
                return {
                    config: configFromPortableProject(project, committed.urls, committed.audioURLs),
                    project,
                    resourceRoot: committed.projectRoot,
                    sourcePath: options.sourcePath,
                }
            } catch (error) {
                fs.rmSync(committed.projectRoot, { recursive: true, force: true })
                throw error
            }
        })
    } catch (error) {
        throw importError(error)
    }
}

module.exports = {
    openPortableProjectArchive,
    savePortableProjectArchive,
    validateEntrySet,
}
