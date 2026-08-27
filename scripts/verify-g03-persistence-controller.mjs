import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { createQuietCarouselProject, parseQuietCarouselHostProject } from "../src/quietCarouselProject.ts"

const require = createRequire(import.meta.url)
const { createLinuxHostController } = require("../electron/linux-host-controller.cjs")
const { openPortableProjectArchive, savePortableProjectArchive } = require("../electron/project-persistence.cjs")

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-g03-persistence-"))
const source = path.resolve("build/icon.png")
const projectPath = path.join(temporary, "round-trip.galileo")
const frame = { url: "gallery-app://app/index.html" }
const sender = { id: 81, mainFrame: frame }
const event = { sender, senderFrame: frame }
let host
let lastError

function envelope(operation, payload = {}, generation = host.snapshot().generation) {
    return { protocol: 1, requestId: `persistence-${operation.replaceAll(".", "-")}`, operation, generation, payload }
}

try {
    host = createLinuxHostController({
        owner: "window-81",
        webContentsId: 81,
        identity: () => ({}),
        onError: (_operation, error) => { lastError = error },
        chooseMedia: ({ grantMedia }) => [{ name: "icon.png", type: "image", url: grantMedia(source, "image/png").mediaURL }],
        saveProject: ({ config, mediaPath }) => savePortableProjectArchive({ config, outputPath: projectPath, tempRoot: temporary, mediaPathFromURL: mediaPath }),
        openProject: ({ signal, grantMedia }) => openPortableProjectArchive({
            sourcePath: projectPath,
            stagingParent: path.join(temporary, "staging"),
            openedProjectsRoot: path.join(temporary, "opened"),
            mediaURLFromPath: (filePath) => grantMedia(filePath, "image/png").mediaURL,
            signal,
        }),
    })
    const chosen = await host.handle(event, envelope("media.choose"))
    assert.equal(chosen.ok, true)
    const config = createQuietCarouselProject([{
        ...chosen.value[0],
        id: "host-media-test-1",
        ratio: 1,
        spotlight: false,
        muted: false,
    }])
    const saved = await host.handle(event, envelope("project.save", { config }))
    assert.equal(saved.ok, true, `${JSON.stringify(saved)} ${lastError?.stack ?? ""}`)
    assert(fs.statSync(projectPath).size > 1_000)
    const candidate = await host.handle(event, envelope("project.open.begin"))
    assert.equal(candidate.ok, true)
    const restored = parseQuietCarouselHostProject(candidate.value.config)
    assert.equal(restored.items.length, 1)
    const accepted = await host.handle(event, envelope("project.open.accept", { operationId: candidate.value.operationId }))
    assert.equal(accepted.ok, true)
    assert.equal(host.snapshot().generation, 2)
    console.log("Verified: G03 HostPort real PNG import, portable save, staged reopen, grant-backed renderer validation, and two-phase accept.")
} finally {
    host?.dispose()
    fs.rmSync(temporary, { recursive: true, force: true })
}
