const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { execFileSync, spawnSync } = require("node:child_process")

const root = path.resolve(process.env.REEL_LIGHT_TABLE_ARTIFACTS || "artifacts/light-table")
const executable = path.resolve(process.env.REEL_LIGHT_TABLE_EXECUTABLE || "release/g03/linux-unpacked/galileo-gallery")

function capturePathAuthority(resolved) {
    const rootPath = path.parse(resolved).root
    const chain = []
    let current = rootPath
    for (const part of resolved.slice(rootPath.length).split(path.sep).filter(Boolean).slice(0, -1)) {
        current = path.join(current, part)
        const stat = fs.lstatSync(current)
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Light Table package ancestor is not an exact directory.")
        chain.push({ path: current, dev: stat.dev, ino: stat.ino })
    }
    return chain
}

function verifyPathAuthority(resolved, chain) {
    for (const expected of chain) {
        const stat = fs.lstatSync(expected.path)
        if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== expected.dev || stat.ino !== expected.ino) throw new Error("Light Table package ancestor changed during hashing.")
    }
    if (fs.realpathSync.native(resolved) !== resolved) throw new Error("Light Table package path contains a symbolic link.")
}

function digest(file) {
    const resolved = path.resolve(file)
    const authority = capturePathAuthority(resolved)
    verifyPathAuthority(resolved, authority)
    const linked = fs.lstatSync(resolved)
    if (!linked.isFile() || linked.isSymbolicLink()) throw new Error("Light Table package target is not an exact regular file.")
    const descriptor = fs.openSync(resolved, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
    const hash = crypto.createHash("sha256")
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let bytes = 0
    try {
        const before = fs.fstatSync(descriptor)
        for (;;) {
            const count = fs.readSync(descriptor, buffer, 0, buffer.length, null)
            if (!count) break
            hash.update(buffer.subarray(0, count))
            bytes += count
        }
        const after = fs.fstatSync(descriptor)
        const finalLink = fs.lstatSync(resolved)
        if (bytes !== before.size || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
            || finalLink.dev !== before.dev || finalLink.ino !== before.ino || finalLink.size !== before.size || finalLink.mtimeMs !== before.mtimeMs || finalLink.ctimeMs !== before.ctimeMs) throw new Error("Light Table package target changed while hashing.")
        verifyPathAuthority(resolved, authority)
        return { sha256: hash.digest("hex"), bytes, uid: before.uid, mode: before.mode & 0o7777 }
    } finally {
        fs.closeSync(descriptor)
    }
}

function fixture(project, sources, setName) {
    const result = spawnSync(process.execPath, ["scripts/create-light-table-smoke-project.cjs", project, sources, setName], { cwd: path.resolve("."), encoding: "utf8" })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(result.stderr || `Could not create ${setName} Light Table fixture.`)
    return JSON.parse(result.stdout.trim())
}

function run(command, args, env) {
    const result = spawnSync(command, args, { cwd: path.resolve("."), env: { ...process.env, ...env }, stdio: "inherit" })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`${path.basename(command)} exited with ${result.status}.`)
}

if (process.getuid?.() === 0) throw new Error("Light Table packaged evidence requires an unprivileged X display runner; --no-sandbox is forbidden.")
fs.mkdirSync(root, { recursive: true })
if (fs.realpathSync.native(root) !== root) throw new Error("Light Table artifact root contains a symbolic link.")
const appAsar = path.join(path.dirname(executable), "resources", "app.asar")
const ffmpeg = path.join(path.dirname(executable), "resources", "ffmpeg", "ffmpeg")
const sandbox = path.join(path.dirname(executable), "chrome-sandbox")
const executableEvidence = digest(executable)
const appAsarEvidence = digest(appAsar)
const ffmpegEvidence = digest(ffmpeg)
const sandboxEvidence = digest(sandbox)
if (sandboxEvidence.uid !== 0 || sandboxEvidence.mode !== 0o4755) throw new Error("Light Table sandbox helper must be root-owned mode 4755.")
if (process.env.LIGHT_TABLE_EXPECTED_EXECUTABLE_SHA && process.env.LIGHT_TABLE_EXPECTED_EXECUTABLE_SHA !== executableEvidence.sha256) throw new Error("Caller supplied the wrong Light Table executable digest.")
if (process.env.LIGHT_TABLE_EXPECTED_APP_ASAR_SHA && process.env.LIGHT_TABLE_EXPECTED_APP_ASAR_SHA !== appAsarEvidence.sha256) throw new Error("Caller supplied the wrong Light Table app.asar digest.")

const oneProject = path.join(root, "light-table-one.galileo")
const manyProject = path.join(root, "light-table-24.galileo")
const savedProject = path.join(root, "light-table-saved.galileo")
const reopenedProject = path.join(root, "light-table-reopened.galileo")
const exportSentinel = path.join(root, "light-table-export-must-not-exist")
const one = fixture(oneProject, path.join(root, "sources-one"), "one")
const many = fixture(manyProject, path.join(root, "sources-24"), "twenty-four")
if (one.mediaIds.length !== 1 || one.videoIds.length !== 0 || many.mediaIds.length !== 24 || many.videoIds.length !== 6
    || new Set(many.mediaIds).size !== 24 || new Set(many.sourceSha256).size !== 24 || many.colors.length !== 24) {
    throw new Error("Light Table boundary fixture contract is wrong.")
}
const fixtureContract = { one, many }
fs.writeFileSync(path.join(root, "fixture-evidence.json"), `${JSON.stringify({
    format: "galileo-gallery-light-table-fixture-evidence",
    version: 1,
    one: { mediaIds: one.mediaIds, videoIds: one.videoIds, sourceSha256: one.sourceSha256, colors: one.colors },
    many: { mediaIds: many.mediaIds, videoIds: many.videoIds, sourceSha256: many.sourceSha256, colors: many.colors },
}, null, 2)}\n`)

const sourceSha = process.env.GALLERY_SOURCE_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
const sourceTree = process.env.GALLERY_SOURCE_TREE || execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim()
const runtimes = []
let completed = false
try {
    for (const mode of ["normal", "reopen-reduced"]) {
        const runtime = fs.mkdtempSync(path.join(os.tmpdir(), `galileo-light-table-${mode}-`))
        runtimes.push(runtime)
        run(executable, mode === "reopen-reduced" ? ["--force-prefers-reduced-motion=reduce"] : [], {
            GALLERY_SOURCE_SHA: sourceSha,
            GALLERY_SOURCE_TREE: sourceTree,
            REEL_USER_DATA_DIR: runtime,
            REEL_G03_PROJECT_PATH: mode === "normal" ? oneProject : savedProject,
            REEL_LIGHT_TABLE_ONE_PROJECT: oneProject,
            REEL_LIGHT_TABLE_MANY_PROJECT: manyProject,
            REEL_LIGHT_TABLE_SAVED_PROJECT: savedProject,
            REEL_LIGHT_TABLE_REOPENED_PROJECT: reopenedProject,
            REEL_LIGHT_TABLE_EXPORT_SENTINEL: exportSentinel,
            REEL_LIGHT_TABLE_FIXTURE_CONTRACT: JSON.stringify(fixtureContract),
            REEL_LIGHT_TABLE_RENDERER_OUTPUT: path.join(root, `run-${mode}`),
            REEL_LIGHT_TABLE_RENDERER_MODE: mode,
            REEL_G11_PNG_DESTINATION: exportSentinel,
            LIGHT_TABLE_EXPECTED_EXECUTABLE_SHA: executableEvidence.sha256,
            LIGHT_TABLE_EXPECTED_APP_ASAR_SHA: appAsarEvidence.sha256,
            LIGHT_TABLE_EXPECTED_FFMPEG_SHA: ffmpegEvidence.sha256,
            LIGHT_TABLE_EXPECTED_SANDBOX_SHA: sandboxEvidence.sha256,
        })
    }
    completed = true
} finally {
    for (const runtime of runtimes) fs.rmSync(runtime, { recursive: true, force: true })
}

if (!completed) throw new Error("Light Table packaged renderer journey did not complete.")
if (runtimes.some((runtime) => fs.existsSync(runtime))) throw new Error("Light Table runtime teardown did not remove its private roots.")
if (fs.existsSync(exportSentinel)) throw new Error("Disabled Light Table export created an output.")
fs.writeFileSync(path.join(root, "runner-receipt.json"), `${JSON.stringify({
    format: "galileo-gallery-light-table-runner-evidence",
    version: 1,
    modes: ["normal", "reopen-reduced"],
    sourceSha,
    sourceTree,
    package: { executable: executableEvidence, appAsar: appAsarEvidence, ffmpeg: ffmpegEvidence, sandboxHelper: sandboxEvidence },
    runtimeRootsRemoved: runtimes.length === 2,
    disabledExportDestinationAbsent: true,
}, null, 2)}\n`)
run(process.execPath, ["scripts/verify-light-table-renderer-artifacts.cjs", root], {
    LIGHT_TABLE_EXPECTED_SHA: sourceSha,
    LIGHT_TABLE_EXPECTED_TREE: sourceTree,
    LIGHT_TABLE_EXPECTED_EXECUTABLE_SHA: executableEvidence.sha256,
    LIGHT_TABLE_EXPECTED_APP_ASAR_SHA: appAsarEvidence.sha256,
    LIGHT_TABLE_EXPECTED_FFMPEG_SHA: ffmpegEvidence.sha256,
    LIGHT_TABLE_EXPECTED_SANDBOX_SHA: sandboxEvidence.sha256,
})
