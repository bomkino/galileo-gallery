const fs = require("node:fs")
const path = require("node:path")
const { HostPortError } = require("./linux-host-port.cjs")

function createG06PrivateFrameCache(parent) {
    if (typeof parent !== "string" || !path.isAbsolute(parent)) throw new HostPortError("invalid_request")
    fs.mkdirSync(parent, { recursive: true, mode: 0o700 })
    const parentStat = fs.lstatSync(parent)
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || (parentStat.mode & 0o077) !== 0
        || (typeof process.getuid === "function" && parentStat.uid !== process.getuid())) throw new HostPortError("verification_failed")
    const root = fs.mkdtempSync(path.join(parent, "job-"))
    let disposed = false
    return Object.freeze({
        root,
        folder(key) {
            if (disposed || typeof key !== "string" || !/^[a-f0-9]{40}$/.test(key)) throw new HostPortError("invalid_request")
            return path.join(root, key)
        },
        dispose() {
            if (disposed) return
            disposed = true
            fs.rmSync(root, { recursive: true, force: true })
        },
    })
}

function cleanupG06PrivateFrameCache(parent) {
    if (typeof parent !== "string" || !path.isAbsolute(parent) || !fs.existsSync(parent)) return Object.freeze({ removed: 0 })
    const parentStat = fs.lstatSync(parent)
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || (parentStat.mode & 0o077) !== 0
        || (typeof process.getuid === "function" && parentStat.uid !== process.getuid())) throw new HostPortError("verification_failed")
    let removed = 0
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
        if (!/^job-[A-Za-z0-9]{6}$/.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) continue
        const target = path.join(parent, entry.name)
        const stat = fs.lstatSync(target)
        if (!stat.isDirectory() || stat.isSymbolicLink() || (typeof process.getuid === "function" && stat.uid !== process.getuid())) continue
        fs.rmSync(target, { recursive: true, force: true })
        removed += 1
    }
    return Object.freeze({ removed })
}

module.exports = { cleanupG06PrivateFrameCache, createG06PrivateFrameCache }
