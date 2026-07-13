const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {
    inspectDroppedPath,
    writeFileSafely,
} = require("../electron/file-operations.cjs")

async function run() {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-file-operations-"))
    try {
        const destination = path.join(folder, "existing.mp4")
        fs.writeFileSync(destination, "known-good")

        await assert.rejects(
            writeFileSafely(destination, (temporary) => {
                fs.writeFileSync(temporary, "incomplete")
                throw new Error("forced writer failure")
            }),
            /forced writer failure/
        )
        assert.equal(fs.readFileSync(destination, "utf8"), "known-good")
        assert.deepEqual(fs.readdirSync(folder), ["existing.mp4"])

        await writeFileSafely(destination, (temporary) => {
            fs.writeFileSync(temporary, "replacement")
        })
        assert.equal(fs.readFileSync(destination, "utf8"), "replacement")
        assert.deepEqual(fs.readdirSync(folder), ["existing.mp4"])

        fs.writeFileSync(destination, "restorable")
        const originalRename = fs.renameSync
        let renameCount = 0
        fs.renameSync = (...args) => {
            renameCount += 1
            if (renameCount === 1 || renameCount === 3) throw new Error("forced replacement failure")
            return originalRename(...args)
        }
        try {
            await assert.rejects(
                writeFileSafely(destination, (temporary) => fs.writeFileSync(temporary, "uncommitted")),
                /forced replacement failure/
            )
        } finally {
            fs.renameSync = originalRename
        }
        assert.equal(fs.readFileSync(destination, "utf8"), "restorable")
        assert.deepEqual(fs.readdirSync(folder), ["existing.mp4"])

        const image = path.join(folder, "frame.JPG")
        const text = path.join(folder, "notes.txt")
        fs.writeFileSync(image, "image")
        fs.writeFileSync(text, "text")
        assert.deepEqual(inspectDroppedPath(image), { accepted: true, name: "frame.JPG", type: "image" })
        assert.deepEqual(inspectDroppedPath(text), { accepted: false, name: "notes.txt", reason: "unsupported-type" })
        assert.deepEqual(inspectDroppedPath(folder), { accepted: false, name: path.basename(folder), reason: "not-a-file" })

        console.log("Verified: safe replacement preserves existing files, cleans staging files, and validates dropped media.")
    } finally {
        fs.rmSync(folder, { recursive: true, force: true })
    }
}

run().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
