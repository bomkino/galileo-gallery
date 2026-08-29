const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const runtimeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-gallery-g08-"))
const outputDirectory = path.resolve(process.env.REEL_G08_RENDERER_OUTPUT || "artifacts/g08")

try {
    const result = spawnSync(require("electron"), [path.resolve(".")], {
        cwd: path.resolve("."),
        env: {
            ...process.env,
            REEL_USER_DATA_DIR: runtimeDirectory,
            REEL_G08_RENDERER_OUTPUT: outputDirectory,
        },
        stdio: "inherit",
    })
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
} finally {
    fs.rmSync(runtimeDirectory, { recursive: true, force: true })
}
