const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {
    cleanupG06PrivateFrameCache,
    createG06PrivateFrameCache,
    privateCacheDirectoryIsSafe,
} = require("../electron/g06-private-frame-cache.cjs")

const syntheticDirectoryStat = ({ mode = 0o40700, uid = 1000, symbolicLink = false } = {}) => ({
    isDirectory: () => true,
    isSymbolicLink: () => symbolicLink,
    mode,
    uid,
})

assert.equal(
    privateCacheDirectoryIsSafe(syntheticDirectoryStat({ mode: 0o40777, uid: 2000 }), { platform: "win32", uid: 1000 }),
    true,
    "Windows must rely on its ACL rather than synthetic POSIX mode and uid fields"
)
assert.equal(
    privateCacheDirectoryIsSafe(syntheticDirectoryStat({ symbolicLink: true }), { platform: "win32", uid: 1000 }),
    false,
    "Windows cache parents must still reject reparse-point/symlink traversal"
)
assert.equal(
    privateCacheDirectoryIsSafe(syntheticDirectoryStat({ mode: 0o40755 }), { platform: "linux", uid: 1000 }),
    false,
    "POSIX cache parents must retain owner-only mode enforcement"
)

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-g06-cache-"))
try {
    const parent = path.join(temporary, "g06-export-video-frames")
    const legacy = path.join(temporary, "export-video-frames")
    fs.mkdirSync(legacy)
    fs.writeFileSync(path.join(legacy, "do-not-use"), "legacy")
    const cache = createG06PrivateFrameCache(parent)
    assert.equal(path.dirname(cache.root), parent)
    assert.match(path.basename(cache.root), /^job-[A-Za-z0-9]+$/)
    const key = "a".repeat(40)
    const folder = cache.folder(key)
    assert.equal(path.dirname(folder), cache.root)
    fs.mkdirSync(folder)
    fs.writeFileSync(path.join(folder, "frame-000001.png"), "private")
    assert.deepEqual(fs.readdirSync(legacy), ["do-not-use"], "G06 must never read or write the legacy shared cache")
    assert.throws(() => cache.folder("../escape"), (error) => error.code === "invalid_request")
    const root = cache.root
    cache.dispose()
    assert.equal(fs.existsSync(root), false, "private job frames must be removed on close/cancel")
    cache.dispose()
    const crashed = path.join(parent, "job-ABC123")
    fs.mkdirSync(crashed)
    fs.writeFileSync(path.join(crashed, "large-frame.png"), "residue")
    fs.mkdirSync(path.join(parent, "keep-user-folder"))
    fs.writeFileSync(path.join(parent, "job-BAD999"), "special-entry")
    const outside = path.join(temporary, "outside")
    fs.mkdirSync(outside)
    fs.symlinkSync(outside, path.join(parent, "job-SYM123"), process.platform === "win32" ? "junction" : undefined)
    assert.deepEqual(cleanupG06PrivateFrameCache(parent), { removed: 1 })
    assert.equal(fs.existsSync(crashed), false)
    assert.equal(fs.existsSync(path.join(parent, "keep-user-folder")), true)
    assert.equal(fs.lstatSync(path.join(parent, "job-SYM123")).isSymbolicLink(), true)
    if (process.platform !== "win32") {
        fs.chmodSync(parent, 0o755)
        assert.throws(() => cleanupG06PrivateFrameCache(parent), (error) => error.code === "verification_failed", "unsafe cache-parent modes must refuse cleanup")
    }
    console.log("Verified: G06 source-video frames stay in an unpredictable owner-only per-job cache, never touch the legacy cache, remain contained, and are removed idempotently.")
} finally {
    fs.rmSync(temporary, { recursive: true, force: true })
}
