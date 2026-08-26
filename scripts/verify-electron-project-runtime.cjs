const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const AdmZip = require("adm-zip")
const { fixtureConfig, writeMedia } = require("./fixtures/project-v2-fixture.cjs")

function mediaURL(filePath) {
    return `reel-media://file/${Buffer.from(filePath).toString("base64url")}`
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-electron-project-"))
try {
    const userData = path.join(root, "user-data")
    const projectPath = path.join(root, "runtime-round-trip.galileo")
    fs.mkdirSync(userData, { recursive: true })
    const mediaPaths = writeMedia(root)
    const config = fixtureConfig(mediaPaths.map(mediaURL))
    fs.writeFileSync(
        path.join(userData, "galileo-gallery-recovery.json"),
        JSON.stringify({ config, savedAt: Date.now() })
    )

    const electronPath = require("electron")
    const version = spawnSync(electronPath, ["--no-sandbox", "--version"], { encoding: "utf8" })
    assert.equal(version.status, 0, version.stderr)
    assert.match(version.stdout, /v43\.1\.0/)

    const result = spawnSync(electronPath, ["--no-sandbox", ".", "--headless", "--disable-gpu"], {
        cwd: path.resolve(__dirname, ".."),
        env: {
            ...process.env,
            REEL_USER_DATA_DIR: userData,
            REEL_PROJECT_SMOKE_OUTPUT: projectPath,
        },
        encoding: "utf8",
        timeout: 45_000,
    })
    if (result.error) throw result.error
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    const receipt = JSON.parse(result.stdout.split(/\r?\n/).find((line) => line.startsWith("{")))
    assert.deepEqual(receipt, { projectItems: 2, templateSettings: Object.keys(config.settings).length, mediaExists: true })

    const archive = new AdmZip(projectPath)
    const manifest = JSON.parse(archive.readAsText("project/project.json"))
    assert.deepEqual(
        manifest.media.map((entry) => entry.sha256),
        mediaPaths.map((filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"))
    )
    assert.equal(manifest.scene.id, "cms-slideshow")
    assert.equal(manifest.canvas.canvasPreset, "vertical")
    assert.equal(manifest.timeline.axis, "vertical")
    assert.deepEqual(fs.readdirSync(path.join(userData, "project-import-staging")), [])
    console.log(`Verified: Electron v43.1.0 main-process Project save/open/reopen preserved 2 ordered media hashes, vertical canvas, Scene, Timeline, and staging cleanup.`)
} finally {
    fs.rmSync(root, { recursive: true, force: true })
}
