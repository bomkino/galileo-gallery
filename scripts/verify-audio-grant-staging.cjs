const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { createAudioGrantStaging } = require("../electron/audio-grant-staging.cjs")

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-g05-audio-stage-"))
const source = path.join(temporary, "source.wav")
fs.writeFileSync(source, Buffer.from("deterministic-audio-source"))
const inspect = async (filePath, signal) => {
    if (signal?.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled" })
    const bytes = await fs.promises.readFile(filePath)
    return { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), sampleRate: 48_000, channels: 1, sampleFrames: bytes.length }
}

async function run() {
    const root = path.join(temporary, "audio-grants")
    const stager = createAudioGrantStaging({ root, inspect, freeSpaceReserveBytes: 8, availableBytes: () => 1_000_000, randomUUID: () => "00000000-0000-4000-8000-000000000001" })
    const staged = await stager.stage(source)
    assert.equal(fs.readFileSync(staged.filePath, "utf8"), "deterministic-audio-source")
    assert.equal(staged.inspection.sha256, (await inspect(source)).sha256)
    assert.equal(fs.statSync(staged.filePath).mode & 0o777, 0o600)
    assert.equal(stager.remove(staged.filePath), true)
    assert.equal(fs.existsSync(path.dirname(staged.filePath)), false)

    const residue = path.join(root, "selection-00000000-0000-4000-8000-000000000002")
    const unrelated = path.join(root, "keep-me")
    fs.mkdirSync(residue)
    fs.mkdirSync(unrelated)
    stager.cleanupResidue()
    assert.equal(fs.existsSync(residue), false)
    assert.equal(fs.existsSync(unrelated), true)

    const lowSpace = createAudioGrantStaging({ root: path.join(temporary, "low-space"), inspect, freeSpaceReserveBytes: 100, availableBytes: () => 100 })
    await assert.rejects(() => lowSpace.stage(source), (error) => error.code === "resource_limit")

    if (process.platform !== "win32") {
        const target = path.join(temporary, "symlink-target")
        const linked = path.join(temporary, "symlink-root")
        fs.mkdirSync(target)
        fs.symlinkSync(target, linked, "dir")
        const hostileRoot = createAudioGrantStaging({ root: linked, inspect })
        await assert.rejects(() => hostileRoot.stage(source), (error) => error.code === "host_unavailable")
        assert.equal(fs.readdirSync(target).length, 0)
    }

    const cancellationRoot = path.join(temporary, "cancelled")
    const waitingInspect = (_filePath, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { code: "cancelled" })), { once: true }))
    const cancellable = createAudioGrantStaging({ root: cancellationRoot, inspect: waitingInspect, availableBytes: () => 1_000_000_000_000 })
    const controller = new AbortController()
    const pending = cancellable.stage(source, controller.signal)
    controller.abort()
    await assert.rejects(() => pending, (error) => error.code === "cancelled")
    assert.deepEqual(fs.readdirSync(cancellationRoot), [])

    console.log("Verified: G05 audio staging root containment, disk reserve, bounded private copy, hash identity, cancellation, revocation cleanup, and crash residue sweep.")
}

run().catch((error) => {
    console.error(error)
    process.exitCode = 1
}).finally(() => fs.rmSync(temporary, { recursive: true, force: true }))
