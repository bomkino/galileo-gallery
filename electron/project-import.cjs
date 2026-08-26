const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { Transform } = require("node:stream")
const { pipeline } = require("node:stream/promises")
const yauzl = require("yauzl")

const PROJECT_IMPORT_LIMITS = Object.freeze({
    archiveBytes: 16 * 1024 * 1024 * 1024,
    entryCount: 4096,
    individualExpandedBytes: 8 * 1024 * 1024 * 1024,
    totalExpandedBytes: 32 * 1024 * 1024 * 1024,
    individualCompressionRatio: 200,
    aggregateCompressionRatio: 100,
    manifestBytes: 2 * 1024 * 1024,
    pathBytes: 1024,
    segmentBytes: 255,
    freeSpaceReserveBytes: 1024 * 1024 * 1024,
})

const PUBLIC_MESSAGES = Object.freeze({
    cancelled: "Project opening cancelled. Your current project was not changed.",
    source_unavailable: "This project file could not be read. Your current project was not changed.",
    archive_too_large: "This project archive exceeds Gallery's import limit.",
    too_many_entries: "This project archive contains too many files.",
    entry_too_large: "A file inside this project archive exceeds Gallery's import limit.",
    expanded_size_exceeded: "This project archive expands beyond Gallery's safe staging limit.",
    compression_ratio_exceeded: "This project archive has an unsafe compression ratio.",
    insufficient_staging_space: "There is not enough free space to open this project safely.",
    unsafe_entry_name: "This project archive contains an unsafe file name.",
    duplicate_entry: "This project archive contains conflicting file names.",
    unsupported_archive_entry: "This project archive contains an unsupported file entry.",
    corrupt_archive: "This project archive is damaged or is not a valid ZIP archive.",
    manifest_missing: "This file is not a supported Galileo Gallery project.",
    manifest_invalid: "This project manifest is invalid.",
    legacy_project_unsupported: "Experimental Galileo Gallery v1 projects are not supported. The original file was left untouched.",
    wrong_product: "This file belongs to another product or project format.",
    future_version_unsupported: "This project was created by a newer Gallery version and cannot be opened here.",
    import_conflict: "Another project is already opening.",
    internal_error: "Gallery could not open this project safely. Your current project was not changed.",
})

const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const STAGING_NAME = /^import-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

class ProjectImportError extends Error {
    constructor(code, options = {}) {
        super(PUBLIC_MESSAGES[code] ?? PUBLIC_MESSAGES.internal_error, options)
        this.name = "ProjectImportError"
        this.code = PUBLIC_MESSAGES[code] ? code : "internal_error"
    }
}

function checkpoint(signal) {
    if (signal?.aborted) throw new ProjectImportError("cancelled")
}

function isAbortError(error) {
    return error?.name === "AbortError" || error?.code === "ABORT_ERR"
}

function asProjectImportError(error, fallbackCode = "internal_error") {
    if (error instanceof ProjectImportError) return error
    if (isAbortError(error)) return new ProjectImportError("cancelled", { cause: error })
    return new ProjectImportError(fallbackCode, { cause: error })
}

function publicProjectImportFailure(error) {
    const safe = asProjectImportError(error)
    return Object.freeze({ code: safe.code, message: safe.message })
}

function mergeLimits(overrides) {
    const limits = { ...PROJECT_IMPORT_LIMITS, ...(overrides ?? {}) }
    for (const [name, value] of Object.entries(limits)) {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new TypeError(`Invalid project import limit: ${name}`)
        }
    }
    return Object.freeze(limits)
}

function normalizeArchivePath(fileName, limits) {
    if (typeof fileName !== "string" || !fileName || fileName.includes("\0") || fileName.includes("\\")) {
        throw new ProjectImportError("unsafe_entry_name")
    }
    if (Buffer.byteLength(fileName, "utf8") > limits.pathBytes) {
        throw new ProjectImportError("unsafe_entry_name")
    }
    if (fileName.startsWith("/") || fileName.startsWith("//") || /^[a-zA-Z]:/.test(fileName)) {
        throw new ProjectImportError("unsafe_entry_name")
    }

    const directory = fileName.endsWith("/")
    const value = directory ? fileName.slice(0, -1) : fileName
    const segments = value.split("/")
    if (!value || segments.some((segment) => !segment || segment === "." || segment === "..")) {
        throw new ProjectImportError("unsafe_entry_name")
    }

    for (const segment of segments) {
        if (
            segment !== segment.normalize("NFC") ||
            Buffer.byteLength(segment, "utf8") > limits.segmentBytes ||
            /[<>:"|?*\u0000-\u001f]/.test(segment) ||
            /[. ]$/.test(segment) ||
            WINDOWS_DEVICE_NAME.test(segment)
        ) {
            throw new ProjectImportError("unsafe_entry_name")
        }
    }

    const normalized = segments.join("/")
    return Object.freeze({
        directory,
        normalized,
        comparisonKey: normalized.toLocaleLowerCase("en-US"),
        segments,
    })
}

function unixEntryType(entry) {
    const originatingSystem = entry.versionMadeBy >>> 8
    if (originatingSystem !== 3) return 0
    return (entry.externalFileAttributes >>> 16) & 0xf000
}

function assertSupportedEntry(entry, archivePath) {
    if ((entry.generalPurposeBitFlag & 0x1) !== 0 || ![0, 8].includes(entry.compressionMethod)) {
        throw new ProjectImportError("unsupported_archive_entry")
    }
    const entryType = unixEntryType(entry)
    if (archivePath.directory) {
        if (entry.uncompressedSize !== 0 || (entryType !== 0 && entryType !== 0x4000)) {
            throw new ProjectImportError("unsupported_archive_entry")
        }
    } else if (entryType !== 0 && entryType !== 0x8000) {
        throw new ProjectImportError("unsupported_archive_entry")
    }
}

function assertNoPathConflict(seen, archivePath) {
    const key = archivePath.comparisonKey
    if (seen.has(key)) throw new ProjectImportError("duplicate_entry")

    const parents = key.split("/")
    parents.pop()
    let parent = ""
    for (const segment of parents) {
        parent = parent ? `${parent}/${segment}` : segment
        if (seen.get(parent) === "file") throw new ProjectImportError("duplicate_entry")
    }
    if (!archivePath.directory) {
        for (const existing of seen.keys()) {
            if (existing.startsWith(`${key}/`)) throw new ProjectImportError("duplicate_entry")
        }
    }
    seen.set(key, archivePath.directory ? "directory" : "file")
}

function entryRatio(entry) {
    if (entry.uncompressedSize === 0) return 0
    if (entry.compressedSize === 0) return Number.POSITIVE_INFINITY
    return Math.ceil(entry.uncompressedSize / entry.compressedSize)
}

async function openZip(archivePath) {
    try {
        return await yauzl.openPromise(archivePath, {
            autoClose: true,
            decodeStrings: false,
            validateEntrySizes: true,
        })
    } catch (error) {
        throw new ProjectImportError("corrupt_archive", { cause: error })
    }
}

function decodeEntryName(entry) {
    const raw = Buffer.from(entry.fileName)
    if ((entry.generalPurposeBitFlag & 0x800) === 0) {
        if (raw.some((byte) => byte > 0x7f)) throw new ProjectImportError("unsafe_entry_name")
        return raw.toString("ascii")
    }
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(raw)
    } catch (error) {
        throw new ProjectImportError("unsafe_entry_name", { cause: error })
    }
}

async function scanArchive(archivePath, limits, signal) {
    const zip = await openZip(archivePath)
    const entries = []
    const seen = new Map()
    let totalCompressed = 0
    let totalExpanded = 0
    try {
        for await (const entry of zip.eachEntry()) {
            checkpoint(signal)
            if (entries.length >= limits.entryCount) throw new ProjectImportError("too_many_entries")
            if (![entry.compressedSize, entry.uncompressedSize].every(Number.isSafeInteger)) {
                throw new ProjectImportError("corrupt_archive")
            }
            const fileName = decodeEntryName(entry)
            const archivePathInfo = normalizeArchivePath(fileName, limits)
            assertSupportedEntry(entry, archivePathInfo)
            assertNoPathConflict(seen, archivePathInfo)
            if (entry.uncompressedSize > limits.individualExpandedBytes) {
                throw new ProjectImportError("entry_too_large")
            }
            if (entryRatio(entry) > limits.individualCompressionRatio) {
                throw new ProjectImportError("compression_ratio_exceeded")
            }
            totalCompressed += entry.compressedSize
            totalExpanded += entry.uncompressedSize
            if (totalExpanded > limits.totalExpandedBytes) {
                throw new ProjectImportError("expanded_size_exceeded")
            }
            entries.push(Object.freeze({
                fileName,
                fileNameHex: Buffer.from(entry.fileName).toString("hex"),
                normalized: archivePathInfo.normalized,
                segments: archivePathInfo.segments,
                directory: archivePathInfo.directory,
                compressedSize: entry.compressedSize,
                uncompressedSize: entry.uncompressedSize,
                crc32: entry.crc32,
                externalFileAttributes: entry.externalFileAttributes,
            }))
        }
    } catch (error) {
        throw asProjectImportError(error, "corrupt_archive")
    } finally {
        zip.close()
    }
    if (!entries.length) throw new ProjectImportError("manifest_missing")
    if (totalExpanded > 0 && Math.ceil(totalExpanded / Math.max(totalCompressed, 1)) > limits.aggregateCompressionRatio) {
        throw new ProjectImportError("compression_ratio_exceeded")
    }
    return Object.freeze({ entries: Object.freeze(entries), totalCompressed, totalExpanded })
}

function assertContained(root, segments) {
    const destination = path.resolve(root, ...segments)
    const relative = path.relative(root, destination)
    if (!relative || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
        throw new ProjectImportError("unsafe_entry_name")
    }
    return destination
}

function availableBytes(folder) {
    if (typeof fs.statfsSync !== "function") return Number.POSITIVE_INFINITY
    const disk = fs.statfsSync(folder)
    return Number(disk.bavail) * Number(disk.bsize)
}

function assertStagingSpace(folder, neededBytes, limits) {
    if (availableBytes(folder) - neededBytes < limits.freeSpaceReserveBytes) {
        throw new ProjectImportError("insufficient_staging_space")
    }
}

async function copyArchiveToStaging(sourcePath, archivePath, limits, signal) {
    let stat
    try {
        stat = fs.lstatSync(sourcePath)
    } catch (error) {
        throw new ProjectImportError("source_unavailable", { cause: error })
    }
    if (!stat.isFile()) throw new ProjectImportError("source_unavailable")
    if (stat.size > limits.archiveBytes) throw new ProjectImportError("archive_too_large")
    assertStagingSpace(path.dirname(archivePath), stat.size, limits)
    checkpoint(signal)

    let copied = 0
    const meter = new Transform({
        transform(chunk, _encoding, callback) {
            copied += chunk.length
            if (copied > limits.archiveBytes) {
                callback(new ProjectImportError("archive_too_large"))
                return
            }
            callback(null, chunk)
        },
    })
    try {
        await pipeline(
            fs.createReadStream(sourcePath),
            meter,
            fs.createWriteStream(archivePath, { flags: "wx", mode: 0o400 }),
            { signal }
        )
    } catch (error) {
        throw asProjectImportError(error, "source_unavailable")
    }
    if (copied !== stat.size) throw new ProjectImportError("source_unavailable")
    checkpoint(signal)
}

function entryMatchesPlan(entry, planned) {
    return Buffer.from(entry.fileName).toString("hex") === planned.fileNameHex &&
        entry.compressedSize === planned.compressedSize &&
        entry.uncompressedSize === planned.uncompressedSize &&
        entry.crc32 === planned.crc32 &&
        entry.externalFileAttributes === planned.externalFileAttributes
}

async function extractArchive(archivePath, contentsRoot, plan, limits, signal, onEntry) {
    assertStagingSpace(path.dirname(contentsRoot), plan.totalExpanded, limits)
    fs.mkdirSync(contentsRoot, { recursive: false, mode: 0o700 })
    const zip = await openZip(archivePath)
    let index = 0
    try {
        for await (const entry of zip.eachEntry()) {
            checkpoint(signal)
            const planned = plan.entries[index]
            if (!planned || !entryMatchesPlan(entry, planned)) {
                throw new ProjectImportError("corrupt_archive")
            }
            const destination = assertContained(contentsRoot, planned.segments)
            if (planned.directory) {
                fs.mkdirSync(destination, { recursive: true, mode: 0o700 })
            } else {
                fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
                let expanded = 0
                const meter = new Transform({
                    transform(chunk, _encoding, callback) {
                        expanded += chunk.length
                        if (expanded > planned.uncompressedSize || expanded > limits.individualExpandedBytes) {
                            callback(new ProjectImportError("expanded_size_exceeded"))
                            return
                        }
                        callback(null, chunk)
                    },
                })
                const input = await zip.openReadStreamPromise(entry)
                await pipeline(
                    input,
                    meter,
                    fs.createWriteStream(destination, { flags: "wx", mode: 0o600 }),
                    { signal }
                )
                if (expanded !== planned.uncompressedSize) throw new ProjectImportError("corrupt_archive")
            }
            index += 1
            await onEntry?.(Object.freeze({ index, entry: planned }))
            checkpoint(signal)
        }
    } catch (error) {
        throw asProjectImportError(error, "corrupt_archive")
    } finally {
        zip.close()
    }
    if (index !== plan.entries.length) throw new ProjectImportError("corrupt_archive")
}

function createStagingDirectory(stagingParent) {
    ensureStagingParent(stagingParent)
    const stagingPath = path.join(stagingParent, `import-${crypto.randomUUID()}`)
    fs.mkdirSync(stagingPath, { recursive: false, mode: 0o700 })
    fs.writeFileSync(
        path.join(stagingPath, ".owner.json"),
        JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
        { flag: "wx", mode: 0o600 }
    )
    return stagingPath
}

function ensureStagingParent(stagingParent) {
    fs.mkdirSync(stagingParent, { recursive: true, mode: 0o700 })
    const stat = fs.lstatSync(stagingParent)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ProjectImportError("internal_error")
}

function cleanupAbandonedProjectImports(stagingParent) {
    if (!fs.existsSync(stagingParent)) return
    const parent = fs.lstatSync(stagingParent)
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw new ProjectImportError("internal_error")
    for (const entry of fs.readdirSync(stagingParent, { withFileTypes: true })) {
        if (!entry.isDirectory() || !STAGING_NAME.test(entry.name)) continue
        const target = path.join(stagingParent, entry.name)
        const stat = fs.lstatSync(target)
        if (stat.isDirectory() && !stat.isSymbolicLink() && !stagingOwnerIsRunning(target)) {
            fs.rmSync(target, { recursive: true, force: true })
        }
    }
}

function stagingOwnerIsRunning(stagingPath) {
    let owner
    try {
        owner = JSON.parse(fs.readFileSync(path.join(stagingPath, ".owner.json"), "utf8"))
    } catch {
        return false
    }
    if (!Number.isSafeInteger(owner?.pid) || owner.pid <= 0) return false
    try {
        process.kill(owner.pid, 0)
        return true
    } catch (error) {
        return error?.code === "EPERM"
    }
}

async function withStagedProjectArchive(options, inspect) {
    const limits = mergeLimits(options.limits)
    const stagingParent = path.resolve(options.stagingParent)
    let stagingPath = null
    try {
        checkpoint(options.signal)
        cleanupAbandonedProjectImports(stagingParent)
        stagingPath = createStagingDirectory(stagingParent)
        const archivePath = path.join(stagingPath, "source.galileo")
        const contentsRoot = path.join(stagingPath, "contents")
        await copyArchiveToStaging(options.sourcePath, archivePath, limits, options.signal)
        const plan = await scanArchive(archivePath, limits, options.signal)
        await extractArchive(archivePath, contentsRoot, plan, limits, options.signal, options.onEntry)
        checkpoint(options.signal)
        return await inspect(Object.freeze({
            contentsRoot,
            entries: plan.entries,
            archiveBytes: fs.statSync(archivePath).size,
            expandedBytes: plan.totalExpanded,
        }))
    } catch (error) {
        throw asProjectImportError(error)
    } finally {
        if (stagingPath) fs.rmSync(stagingPath, { recursive: true, force: true })
    }
}

function readManifest(contentsRoot, limits) {
    const candidates = ["project/project.json", "project.json"]
    const manifestRelative = candidates.find((candidate) => fs.existsSync(assertContained(contentsRoot, candidate.split("/"))))
    if (!manifestRelative) throw new ProjectImportError("manifest_missing")
    const manifestPath = assertContained(contentsRoot, manifestRelative.split("/"))
    const stat = fs.lstatSync(manifestPath)
    if (!stat.isFile() || stat.size > limits.manifestBytes) throw new ProjectImportError("manifest_invalid")
    try {
        return JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    } catch (error) {
        throw new ProjectImportError("manifest_invalid", { cause: error })
    }
}

async function rejectUnsupportedProjectArchive(options) {
    const limits = mergeLimits(options.limits)
    return withStagedProjectArchive({ ...options, limits }, async ({ contentsRoot }) => {
        checkpoint(options.signal)
        const manifest = readManifest(contentsRoot, limits)
        if (["galileo-gallery-project", "opening-reel-project"].includes(manifest?.type) && manifest?.version === 1) {
            throw new ProjectImportError("legacy_project_unsupported")
        }
        if (manifest?.type !== "galileo-gallery-project") throw new ProjectImportError("wrong_product")
        if (Number.isInteger(manifest?.version) && manifest.version > 1) {
            throw new ProjectImportError("future_version_unsupported")
        }
        throw new ProjectImportError("manifest_invalid")
    })
}

module.exports = {
    PROJECT_IMPORT_LIMITS,
    ProjectImportError,
    cleanupAbandonedProjectImports,
    normalizeArchivePath,
    publicProjectImportFailure,
    rejectUnsupportedProjectArchive,
    withStagedProjectArchive,
}
