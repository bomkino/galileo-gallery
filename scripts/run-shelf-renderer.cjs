const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { execFileSync, spawnSync } = require("node:child_process")

const root = path.resolve(process.env.REEL_SHELF_ARTIFACTS || "artifacts/shelf")
const executable = path.resolve(process.env.REEL_SHELF_EXECUTABLE || "release/g03/linux-unpacked/galileo-gallery")

function digest(file) {
    const resolved = path.resolve(file)
    const linked = fs.lstatSync(resolved)
    if (!linked.isFile() || linked.isSymbolicLink() || fs.realpathSync.native(resolved) !== resolved) throw new Error("Shelf package target is not an exact regular file.")
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
        if (bytes !== before.size || after.dev !== before.dev || after.ino !== before.ino || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new Error("Shelf package target changed while hashing.")
        return { sha256: hash.digest("hex"), bytes, uid: before.uid, mode: before.mode & 0o7777 }
    } finally { fs.closeSync(descriptor) }
}

function fixture(project, sources, setName) {
    const result = spawnSync(process.execPath, ["scripts/create-shelf-smoke-project.cjs", project, sources, setName], { cwd: path.resolve("."), encoding: "utf8" })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(result.stderr || `Could not create ${setName} Shelf fixture.`)
    return JSON.parse(result.stdout.trim())
}

function run(command, args, env) {
    const result = spawnSync(command, args, { cwd: path.resolve("."), env: { ...process.env, ...env }, stdio: "inherit" })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`${path.basename(command)} exited with ${result.status}.`)
}

if (process.getuid?.() === 0) throw new Error("Shelf packaged evidence requires an unprivileged X display runner; --no-sandbox is forbidden.")
fs.mkdirSync(root, { recursive: true })
if (fs.realpathSync.native(root) !== root) throw new Error("Shelf artifact root contains a symbolic link.")
const appAsar = path.join(path.dirname(executable), "resources", "app.asar")
const ffmpeg = path.join(path.dirname(executable), "resources", "ffmpeg", "ffmpeg")
const sandbox = path.join(path.dirname(executable), "chrome-sandbox")
const executableEvidence = digest(executable)
const appAsarEvidence = digest(appAsar)
const ffmpegEvidence = digest(ffmpeg)
const sandboxEvidence = digest(sandbox)
if (sandboxEvidence.uid !== 0 || sandboxEvidence.mode !== 0o4755) throw new Error("Shelf sandbox helper must be root-owned mode 4755.")
if (process.env.SHELF_EXPECTED_EXECUTABLE_SHA && process.env.SHELF_EXPECTED_EXECUTABLE_SHA !== executableEvidence.sha256) throw new Error("Caller supplied the wrong Shelf executable digest.")
if (process.env.SHELF_EXPECTED_APP_ASAR_SHA && process.env.SHELF_EXPECTED_APP_ASAR_SHA !== appAsarEvidence.sha256) throw new Error("Caller supplied the wrong Shelf app.asar digest.")

const originalProject = path.join(root, "shelf-original.galileo")
const replacementProject = path.join(root, "shelf-replacement.galileo")
const corruptProject = path.join(root, "shelf-corrupt.galileo")
const vfrProject = path.join(root, "shelf-vfr.galileo")
const imageProject = path.join(root, "shelf-image-only.galileo")
const original = fixture(originalProject, path.join(root, "sources-original"), "original")
const replacement = fixture(replacementProject, path.join(root, "sources-replacement"), "replacement")
const corrupt = fixture(corruptProject, path.join(root, "sources-corrupt"), "corrupt")
const vfr = fixture(vfrProject, path.join(root, "sources-vfr"), "vfr")
const imageOnly = fixture(imageProject, path.join(root, "sources-image-only"), "image-only")
if (new Set(original.videoSha256).size !== 10 || new Set(replacement.videoSha256).size !== 10 || new Set([...original.videoSha256, ...replacement.videoSha256]).size !== 20) {
    throw new Error("Shelf original and replacement MP4 fixtures are not 20 distinct sources.")
}
const validReplayMatches = original.videoSha256.filter((digestValue, index) => index !== 3 && digestValue === corrupt.videoSha256[index]).length
if (validReplayMatches !== 9 || original.videoSha256[3] === corrupt.videoSha256[3]) throw new Error("Shelf deterministic or corrupt fixture proof is wrong.")
fs.writeFileSync(path.join(root, "fixture-evidence.json"), `${JSON.stringify({
    format: "galileo-gallery-shelf-fixture-evidence",
    version: 1,
    originalVideoSha256: original.videoSha256,
    replacementVideoSha256: replacement.videoSha256,
    corruptVideoSha256: corrupt.videoSha256,
    validReplayMatches,
    corruptIndex: 3,
    alpha: { sha256: original.alphaSha256, counts: original.alphaCounts },
    vfr: { videoSha256: vfr.videoSha256, contract: vfr.vfr },
    imageOnly: { mediaIds: imageOnly.mediaIds, videoIds: imageOnly.videoIds, alphaSha256: imageOnly.alphaSha256, alphaCounts: imageOnly.alphaCounts },
}, null, 2)}\n`)
const sourceSha = process.env.GALLERY_SOURCE_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
const sourceTree = process.env.GALLERY_SOURCE_TREE || execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim()
const runtimes = []

try {
    for (const mode of ["normal", "reduced"]) {
        const runtime = fs.mkdtempSync(path.join(os.tmpdir(), `galileo-shelf-${mode}-`))
        runtimes.push(runtime)
        run(executable, mode === "reduced" ? ["--force-prefers-reduced-motion=reduce"] : [], {
            GALLERY_SOURCE_SHA: sourceSha,
            GALLERY_SOURCE_TREE: sourceTree,
            REEL_USER_DATA_DIR: runtime,
            REEL_G03_PROJECT_PATH: originalProject,
            REEL_SHELF_PROJECT_PATH: originalProject,
            REEL_SHELF_REPLACEMENT_PROJECT_PATH: replacementProject,
            REEL_SHELF_CORRUPT_PROJECT_PATH: corruptProject,
            REEL_SHELF_VFR_PROJECT_PATH: vfrProject,
            REEL_SHELF_IMAGE_PROJECT_PATH: imageProject,
            REEL_G11_PNG_DESTINATION: path.join(root, `shelf-${mode}-png-frames`),
            REEL_SHELF_RENDERER_OUTPUT: path.join(root, `run-${mode}`),
            REEL_SHELF_RENDERER_MODE: mode,
            REEL_SHELF_COLORS: JSON.stringify(original.colors),
            REEL_SHELF_REPLACEMENT_COLORS: JSON.stringify(replacement.colors),
            REEL_SHELF_ALPHA_COUNTS: JSON.stringify(original.alphaCounts),
            REEL_SHELF_VFR_CONTRACT: JSON.stringify(vfr.vfr),
            SHELF_EXPECTED_EXECUTABLE_SHA: executableEvidence.sha256,
            SHELF_EXPECTED_APP_ASAR_SHA: appAsarEvidence.sha256,
            SHELF_EXPECTED_FFMPEG_SHA: ffmpegEvidence.sha256,
            SHELF_EXPECTED_SANDBOX_SHA: sandboxEvidence.sha256,
        })
    }
    run(process.execPath, ["scripts/verify-opened-project-resources.cjs", root, ...runtimes], {
        SHELF_EXPECTED_SHA: sourceSha,
        SHELF_EXPECTED_TREE: sourceTree,
        SHELF_EXPECTED_EXECUTABLE_SHA: executableEvidence.sha256,
        SHELF_EXPECTED_APP_ASAR_SHA: appAsarEvidence.sha256,
        SHELF_EXPECTED_FFMPEG_SHA: ffmpegEvidence.sha256,
        SHELF_EXPECTED_SANDBOX_SHA: sandboxEvidence.sha256,
    })
} finally {
    for (const runtime of runtimes) fs.rmSync(runtime, { recursive: true, force: true })
}
