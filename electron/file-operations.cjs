const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"])
const VIDEO_EXTENSIONS = new Set([".gif", ".mp4", ".webm", ".mov", ".m4v"])
const SUPPORTED_MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS])

function temporarySiblingPath(destination, label = "partial") {
    const extension = path.extname(destination)
    const stem = path.basename(destination, extension)
    return path.join(
        path.dirname(destination),
        `.${stem}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.${label}${extension}`
    )
}

function removeTemporary(target) {
    if (!target) return
    try {
        const stat = fs.lstatSync(target)
        if (stat.isDirectory() && !stat.isSymbolicLink()) return
        fs.unlinkSync(target)
    } catch (error) {
        if (error?.code !== "ENOENT") throw error
    }
}

function replaceableDestination(destination) {
    let stat
    try {
        stat = fs.lstatSync(destination)
    } catch (error) {
        if (error?.code === "ENOENT") return null
        throw error
    }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Destination is not a replaceable regular file.")
    return stat
}

function sameFileIdentity(left, right) {
    return ["dev", "ino", "mode", "size"].every((key) => left[key] === right[key])
}

function replaceFile(temporary, destination) {
    let destinationStat = replaceableDestination(destination)
    try {
        fs.renameSync(temporary, destination)
        return
    } catch (error) {
        destinationStat = replaceableDestination(destination)
        if (!destinationStat) throw error
    }

    // Windows cannot rename over an existing file. Keep the old file recoverable
    // while using sibling renames so replacement never crosses volumes.
    const backup = temporarySiblingPath(destination, "backup")
    let movedExisting = false
    let committed = false
    try {
        fs.renameSync(destination, backup)
        movedExisting = true
        const movedStat = replaceableDestination(backup)
        if (!sameFileIdentity(destinationStat, movedStat)) throw new Error("Destination changed during replacement.")
        fs.renameSync(temporary, destination)
        committed = true
    } catch (error) {
        if (movedExisting && fs.existsSync(backup) && !fs.existsSync(destination)) {
            fs.renameSync(backup, destination)
        }
        throw error
    } finally {
        if (committed) removeTemporary(backup)
    }
}

async function writeFileSafely(destination, writer) {
    replaceableDestination(destination)
    const temporary = temporarySiblingPath(destination)
    try {
        await writer(temporary)
        replaceFile(temporary, destination)
    } catch (error) {
        removeTemporary(temporary)
        throw error
    }
}

function mediaKindForPath(filePath) {
    const extension = path.extname(filePath).toLowerCase()
    if (IMAGE_EXTENSIONS.has(extension)) return "image"
    if (VIDEO_EXTENSIONS.has(extension)) return "video"
    return null
}

function inspectDroppedPath(filePath) {
    const name = filePath ? path.basename(filePath) : "Dropped item"
    if (!filePath) return { accepted: false, name, reason: "unavailable" }
    try {
        if (!fs.statSync(filePath).isFile()) {
            return { accepted: false, name, reason: "not-a-file" }
        }
    } catch {
        return { accepted: false, name, reason: "unavailable" }
    }
    const type = mediaKindForPath(filePath)
    if (!type) return { accepted: false, name, reason: "unsupported-type" }
    return { accepted: true, name, type }
}

module.exports = {
    SUPPORTED_MEDIA_EXTENSIONS,
    inspectDroppedPath,
    mediaKindForPath,
    removeTemporary,
    replaceFile,
    temporarySiblingPath,
    writeFileSafely,
}
