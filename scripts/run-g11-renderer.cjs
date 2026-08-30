const fs = require("node:fs")
const crypto = require("node:crypto")
const os = require("node:os")
const path = require("node:path")
const { spawnSync, execFileSync } = require("node:child_process")

const root = path.resolve(process.env.REEL_G11_ARTIFACTS || "artifacts/g11")
const project = path.join(root, "vitrine-v2.galileo")
const corruptProject = path.join(root, "vitrine-corrupt.galileo")
const executable = path.resolve(process.env.REEL_G11_EXECUTABLE || "release/g03/linux-unpacked/galileo-gallery")
function capturePathAuthority(resolved) {
    const rootPath = path.parse(resolved).root
    const chain = []
    let current = rootPath
    for (const part of resolved.slice(rootPath.length).split(path.sep).filter(Boolean).slice(0, -1)) {
        current = path.join(current, part)
        const stat = fs.lstatSync(current)
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("G11 package ancestor is not an exact directory.")
        chain.push({ path: current, dev: stat.dev, ino: stat.ino })
    }
    return chain
}
function verifyPathAuthority(resolved, chain) {
    for (const expected of chain) {
        const stat = fs.lstatSync(expected.path)
        if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== expected.dev || stat.ino !== expected.ino) throw new Error("G11 package ancestor changed during hashing.")
    }
    if (fs.realpathSync.native(resolved) !== resolved) throw new Error("G11 package path contains a symbolic link.")
}
function digest(file) {
    const resolved = path.resolve(file)
    const authority = capturePathAuthority(resolved)
    verifyPathAuthority(resolved, authority)
    const linked = fs.lstatSync(resolved)
    if (!linked.isFile() || linked.isSymbolicLink() || linked.size < 1) throw new Error("G11 package path is not an exact regular file.")
    const handle = fs.openSync(resolved, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
    const hash = crypto.createHash("sha256")
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let bytes = 0
    let identity
    try {
        const before = fs.fstatSync(handle)
        identity = before
        if (before.dev !== linked.dev || before.ino !== linked.ino || before.size !== linked.size || before.mtimeMs !== linked.mtimeMs || before.ctimeMs !== linked.ctimeMs) throw new Error("G11 package changed before hashing.")
        for (;;) {
            const count = fs.readSync(handle, buffer, 0, buffer.length, null)
            if (!count) break
            hash.update(buffer.subarray(0, count))
            bytes += count
        }
        const after = fs.fstatSync(handle)
        const finalLink = fs.lstatSync(resolved)
        if (bytes !== before.size || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
            || finalLink.dev !== before.dev || finalLink.ino !== before.ino || finalLink.size !== before.size || finalLink.mtimeMs !== before.mtimeMs || finalLink.ctimeMs !== before.ctimeMs) throw new Error("G11 package changed during hashing.")
        verifyPathAuthority(resolved, authority)
    } finally {
        fs.closeSync(handle)
    }
    return { sha256: hash.digest("hex"), bytes, uid: identity.uid, mode: identity.mode & 0o7777 }
}
const appAsar = path.join(path.dirname(executable), "resources", "app.asar")
const packagedFfmpeg = path.join(path.dirname(executable), "resources", "ffmpeg", "ffmpeg")
const executableIdentity = digest(executable)
const appAsarIdentity = digest(appAsar)
const ffmpegIdentity = digest(packagedFfmpeg)
const executableSha = executableIdentity.sha256
const appAsarSha = appAsarIdentity.sha256
if (process.env.G11_EXPECTED_EXECUTABLE_SHA && process.env.G11_EXPECTED_EXECUTABLE_SHA !== executableSha) throw new Error("Caller supplied the wrong packaged executable digest.")
if (process.env.G11_EXPECTED_APP_ASAR_SHA && process.env.G11_EXPECTED_APP_ASAR_SHA !== appAsarSha) throw new Error("Caller supplied the wrong packaged app.asar digest.")
const sandboxHelper = path.join(path.dirname(executable), "chrome-sandbox")
if (process.getuid?.() === 0) throw new Error("G11 packaged renderer requires an unprivileged display runner; this container cannot drop UID, and --no-sandbox is forbidden.")
const sandboxIdentity = digest(sandboxHelper)
if (sandboxIdentity.uid !== 0 || sandboxIdentity.mode !== 0o4755) throw new Error("G11 packaged Chromium sandbox helper must be root-owned mode 4755.")
fs.mkdirSync(root, { recursive: true })
if (fs.realpathSync.native(root) !== root) throw new Error("G11 artifact root contains a symbolic link.")

function run(command, args, env = {}) {
    const result = spawnSync(command, args, { cwd: path.resolve("."), env: { ...process.env, ...env }, stdio: "inherit" })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`${path.basename(command)} exited with ${result.status}.`)
}

const fixture = spawnSync(process.execPath, ["scripts/create-g11-vitrine-smoke-project.cjs", project, path.join(root, "sources")], { cwd: path.resolve("."), encoding: "utf8" })
if (fixture.error) throw fixture.error
if (fixture.status !== 0) throw new Error(fixture.stderr || "Could not create G11 Vitrine fixture.")
const corruptFixture = spawnSync(process.execPath, ["scripts/create-g11-vitrine-smoke-project.cjs", corruptProject, path.join(root, "corrupt-sources"), "--corrupt-video"], { cwd: path.resolve("."), encoding: "utf8" })
if (corruptFixture.error) throw corruptFixture.error
if (corruptFixture.status !== 0) throw new Error(corruptFixture.stderr || "Could not create corrupt G11 Vitrine fixture.")

const sourceSha = process.env.GALLERY_SOURCE_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
const sourceTree = process.env.GALLERY_SOURCE_TREE || execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim()
const runtimeRoots = []
const temporaryRuntime = (label) => {
    const runtime = fs.mkdtempSync(path.join(os.tmpdir(), `galileo-g11-${label}-`))
    runtimeRoots.push(runtime)
    return runtime
}
const runtimeRoot = temporaryRuntime("shared")

try {
    for (const [runId, mode] of [["run-a", "save"], ["run-b", "reopen"]]) {
        const executableArgs = mode === "reopen" ? ["--force-prefers-reduced-motion=reduce"] : []
        run(executable, executableArgs, {
            GALLERY_SOURCE_SHA: sourceSha,
            GALLERY_SOURCE_TREE: sourceTree,
            REEL_USER_DATA_DIR: runtimeRoot,
            REEL_G03_PROJECT_PATH: project,
            REEL_G11_RENDERER_OUTPUT: path.join(root, runId),
            REEL_G11_RENDERER_MODE: mode,
            REEL_G11_PNG_DESTINATION: path.join(root, `${runId}-frames`),
            G11_EXPECTED_EXECUTABLE_SHA: executableSha,
            G11_EXPECTED_APP_ASAR_SHA: appAsarSha,
            G11_EXPECTED_FFMPEG_SHA: ffmpegIdentity.sha256,
        })
    }
    run(executable, [], {
        GALLERY_SOURCE_SHA: sourceSha,
        GALLERY_SOURCE_TREE: sourceTree,
        REEL_USER_DATA_DIR: temporaryRuntime("corrupt-open"),
        REEL_G03_PROJECT_PATH: project,
        REEL_G11_CORRUPT_PROJECT_PATH: corruptProject,
        REEL_G11_RENDERER_OUTPUT: path.join(root, "run-corrupt-open"),
        REEL_G11_RENDERER_MODE: "corrupt-open",
        G11_EXPECTED_EXECUTABLE_SHA: executableSha,
        G11_EXPECTED_APP_ASAR_SHA: appAsarSha,
        G11_EXPECTED_FFMPEG_SHA: ffmpegIdentity.sha256,
    })
    const sentinelParent = path.join(root, "missing-media-destination")
    fs.mkdirSync(sentinelParent, { recursive: false, mode: 0o700 })
    fs.writeFileSync(path.join(sentinelParent, "prior.txt"), "preserve-g11-missing-media-sentinel\n", { flag: "wx", mode: 0o600 })
    run(executable, [], {
        GALLERY_SOURCE_SHA: sourceSha,
        GALLERY_SOURCE_TREE: sourceTree,
        REEL_USER_DATA_DIR: temporaryRuntime("missing-media"),
        REEL_G03_PROJECT_PATH: project,
        REEL_G11_RENDERER_OUTPUT: path.join(root, "run-missing-media-export"),
        REEL_G11_RENDERER_MODE: "missing-media-export",
        REEL_G11_PNG_DESTINATION: path.join(sentinelParent, "attempted-frames"),
        G11_EXPECTED_EXECUTABLE_SHA: executableSha,
        G11_EXPECTED_APP_ASAR_SHA: appAsarSha,
        G11_EXPECTED_FFMPEG_SHA: ffmpegIdentity.sha256,
    })
    run(process.execPath, ["scripts/verify-g11-vitrine-artifacts.cjs", root, project], {
        G11_EXPECTED_SHA: sourceSha,
        G11_EXPECTED_TREE: sourceTree,
        G11_EXPECTED_EXECUTABLE_SHA: executableSha,
        G11_EXPECTED_APP_ASAR_SHA: appAsarSha,
        G11_EXPECTED_FFMPEG_SHA: ffmpegIdentity.sha256,
    })
} finally {
    for (const runtime of runtimeRoots) fs.rmSync(runtime, { recursive: true, force: true })
}
