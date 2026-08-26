const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const zlib = require("node:zlib")
const {
    cleanupAbandonedProjectImports,
    publicProjectImportFailure,
    rejectUnsupportedProjectArchive,
    withStagedProjectArchive,
} = require("../electron/project-import.cjs")

const TEST_LIMITS = Object.freeze({
    archiveBytes: 1024 * 1024,
    entryCount: 32,
    individualExpandedBytes: 64 * 1024,
    totalExpandedBytes: 128 * 1024,
    individualCompressionRatio: 50,
    aggregateCompressionRatio: 25,
    manifestBytes: 4096,
    pathBytes: 256,
    segmentBytes: 100,
    freeSpaceReserveBytes: 1,
})

function crc32(buffer) {
    let crc = 0xffffffff
    for (const byte of buffer) {
        crc ^= byte
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
        }
    }
    return (crc ^ 0xffffffff) >>> 0
}

function makeZip(entries) {
    const localParts = []
    const centralParts = []
    let offset = 0
    for (const input of entries) {
        const fileName = Buffer.from(input.name, "utf8")
        const data = Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data ?? "")
        const method = input.method === "deflate" ? 8 : 0
        const compressed = method === 8 ? zlib.deflateRawSync(data) : data
        const declaredSize = input.declaredSize ?? data.length
        const checksum = crc32(data)
        const flags = 0x800

        const local = Buffer.alloc(30)
        local.writeUInt32LE(0x04034b50, 0)
        local.writeUInt16LE(20, 4)
        local.writeUInt16LE(flags, 6)
        local.writeUInt16LE(method, 8)
        local.writeUInt32LE(checksum, 14)
        local.writeUInt32LE(compressed.length, 18)
        local.writeUInt32LE(declaredSize, 22)
        local.writeUInt16LE(fileName.length, 26)
        localParts.push(local, fileName, compressed)

        const central = Buffer.alloc(46)
        central.writeUInt32LE(0x02014b50, 0)
        central.writeUInt16LE(input.versionMadeBy ?? 20, 4)
        central.writeUInt16LE(20, 6)
        central.writeUInt16LE(flags, 8)
        central.writeUInt16LE(method, 10)
        central.writeUInt32LE(checksum, 16)
        central.writeUInt32LE(compressed.length, 20)
        central.writeUInt32LE(declaredSize, 24)
        central.writeUInt16LE(fileName.length, 28)
        central.writeUInt32LE(input.externalFileAttributes ?? 0, 38)
        central.writeUInt32LE(offset, 42)
        centralParts.push(central, fileName)
        offset += local.length + fileName.length + compressed.length
    }

    const centralDirectory = Buffer.concat(centralParts)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(entries.length, 8)
    end.writeUInt16LE(entries.length, 10)
    end.writeUInt32LE(centralDirectory.length, 12)
    end.writeUInt32LE(offset, 16)
    return Buffer.concat([...localParts, centralDirectory, end])
}

function writeFixture(folder, name, entries) {
    const target = path.join(folder, name)
    fs.writeFileSync(target, makeZip(entries))
    return target
}

function residue(stagingParent) {
    return fs.existsSync(stagingParent) ? fs.readdirSync(stagingParent) : []
}

async function expectCode(code, operation, stagingParent) {
    await assert.rejects(operation, (error) => error?.code === code)
    assert.deepEqual(residue(stagingParent), [], `${code} left staging residue`)
}

async function run() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-project-import-"))
    const fixtures = path.join(root, "fixtures")
    const staging = path.join(root, "staging")
    const priorProjectFile = path.join(root, "prior-project.galileo")
    fs.mkdirSync(fixtures)
    fs.writeFileSync(priorProjectFile, "known-prior-project-bytes")
    const priorProjectHash = crypto.createHash("sha256").update(fs.readFileSync(priorProjectFile)).digest("hex")
    try {
        const valid = writeFixture(fixtures, "safe.galileo", [
            { name: "project/project.json", data: JSON.stringify({ type: "test", version: 1 }) },
            { name: "project/media/frame.png", data: "synthetic-frame" },
        ])
        const inspected = await withStagedProjectArchive(
            { sourcePath: valid, stagingParent: staging, limits: TEST_LIMITS },
            async ({ contentsRoot, entries, expandedBytes }) => {
                assert.equal(entries.length, 2)
                assert.equal(expandedBytes, Buffer.byteLength(JSON.stringify({ type: "test", version: 1 })) + 15)
                assert.equal(fs.readFileSync(path.join(contentsRoot, "project/media/frame.png"), "utf8"), "synthetic-frame")
                return "inspected"
            }
        )
        assert.equal(inspected, "inspected")
        assert.deepEqual(residue(staging), [])

        const traversal = writeFixture(fixtures, "traversal.galileo", [{ name: "../escape.txt", data: "escape" }])
        await expectCode("unsafe_entry_name", () => withStagedProjectArchive(
            { sourcePath: traversal, stagingParent: staging, limits: TEST_LIMITS },
            async () => undefined
        ), staging)
        assert.equal(fs.existsSync(path.join(root, "escape.txt")), false)

        for (const [name, unsafeName] of [
            ["absolute", "/absolute.txt"],
            ["drive", "C:/drive.txt"],
            ["unc", "//server/share.txt"],
            ["backslash", "project\\escape.txt"],
            ["nul", "project/bad\0name.txt"],
            ["empty-segment", "project//frame.png"],
            ["dot-segment", "project/./frame.png"],
            ["reserved-device", "project/CON"],
            ["trailing-dot", "project/frame.png."],
            ["non-nfc", "project/e\u0301.png"],
        ]) {
            const fixture = writeFixture(fixtures, `${name}.galileo`, [{ name: unsafeName, data: "unsafe" }])
            await expectCode("unsafe_entry_name", () => withStagedProjectArchive(
                { sourcePath: fixture, stagingParent: staging, limits: TEST_LIMITS },
                async () => undefined
            ), staging)
        }

        const duplicate = writeFixture(fixtures, "duplicate.galileo", [
            { name: "project/Frame.png", data: "one" },
            { name: "project/frame.png", data: "two" },
        ])
        await expectCode("duplicate_entry", () => withStagedProjectArchive(
            { sourcePath: duplicate, stagingParent: staging, limits: TEST_LIMITS },
            async () => undefined
        ), staging)

        const parentConflict = writeFixture(fixtures, "parent-conflict.galileo", [
            { name: "project/media", data: "file" },
            { name: "project/media/frame.png", data: "child" },
        ])
        await expectCode("duplicate_entry", () => withStagedProjectArchive(
            { sourcePath: parentConflict, stagingParent: staging, limits: TEST_LIMITS },
            async () => undefined
        ), staging)

        const twoEntries = writeFixture(fixtures, "two-entries.galileo", [
            { name: "project/a", data: "12345678" },
            { name: "project/b", data: "12345678" },
        ])
        await expectCode("too_many_entries", () => withStagedProjectArchive(
            { sourcePath: twoEntries, stagingParent: staging, limits: { ...TEST_LIMITS, entryCount: 1 } },
            async () => undefined
        ), staging)
        await expectCode("expanded_size_exceeded", () => withStagedProjectArchive(
            { sourcePath: twoEntries, stagingParent: staging, limits: { ...TEST_LIMITS, totalExpandedBytes: 10 } },
            async () => undefined
        ), staging)
        await expectCode("archive_too_large", () => withStagedProjectArchive(
            { sourcePath: twoEntries, stagingParent: staging, limits: { ...TEST_LIMITS, archiveBytes: 10 } },
            async () => undefined
        ), staging)

        const largeEntry = writeFixture(fixtures, "large-entry.galileo", [{ name: "project/large", data: "12345678901" }])
        await expectCode("entry_too_large", () => withStagedProjectArchive(
            { sourcePath: largeEntry, stagingParent: staging, limits: { ...TEST_LIMITS, individualExpandedBytes: 10 } },
            async () => undefined
        ), staging)

        const forgedFourGigabyteEntry = writeFixture(fixtures, "forged-four-gigabyte.galileo", [{
            name: "project/forged.bin",
            data: "x",
            method: "deflate",
            declaredSize: 0xfffffffe,
        }])
        await expectCode("entry_too_large", () => withStagedProjectArchive(
            { sourcePath: forgedFourGigabyteEntry, stagingParent: staging, limits: TEST_LIMITS },
            async () => undefined
        ), staging)

        const compressed = writeFixture(fixtures, "compressed.galileo", [
            { name: "project/compressed", data: "A".repeat(4096), method: "deflate" },
        ])
        await expectCode("compression_ratio_exceeded", () => withStagedProjectArchive(
            {
                sourcePath: compressed,
                stagingParent: staging,
                limits: { ...TEST_LIMITS, individualCompressionRatio: 2, aggregateCompressionRatio: 2 },
            },
            async () => undefined
        ), staging)

        const mixedCompression = writeFixture(fixtures, "mixed-compression.galileo", [
            { name: "project/manifest-like.json", data: "A".repeat(4096), method: "deflate" },
            { name: "project/media.bin", data: crypto.randomBytes(60 * 1024) },
        ])
        await withStagedProjectArchive(
            {
                sourcePath: mixedCompression,
                stagingParent: staging,
                limits: { ...TEST_LIMITS, individualCompressionRatio: 200 },
            },
            async () => undefined
        )
        assert.deepEqual(residue(staging), [])

        const symlink = writeFixture(fixtures, "symlink.galileo", [{
            name: "project/link",
            data: "../../escape",
            versionMadeBy: (3 << 8) | 20,
            externalFileAttributes: (0o120777 << 16) >>> 0,
        }])
        await expectCode("unsupported_archive_entry", () => withStagedProjectArchive(
            { sourcePath: symlink, stagingParent: staging, limits: TEST_LIMITS },
            async () => undefined
        ), staging)

        const controller = new AbortController()
        await expectCode("cancelled", () => withStagedProjectArchive({
            sourcePath: twoEntries,
            stagingParent: staging,
            limits: TEST_LIMITS,
            onEntry: ({ index }) => {
                if (index === 1) controller.abort()
            },
            signal: controller.signal,
        }, async () => undefined), staging)

        const legacy = writeFixture(fixtures, "legacy-v1.galileo", [{
            name: "project/project.json",
            data: JSON.stringify({ type: "galileo-gallery-project", version: 1, config: { items: [] } }),
        }])
        const legacyHash = crypto.createHash("sha256").update(fs.readFileSync(legacy)).digest("hex")
        await expectCode("legacy_project_unsupported", () => rejectUnsupportedProjectArchive({
            sourcePath: legacy,
            stagingParent: staging,
            limits: TEST_LIMITS,
        }), staging)
        assert.equal(crypto.createHash("sha256").update(fs.readFileSync(legacy)).digest("hex"), legacyHash)

        const future = writeFixture(fixtures, "future.galileo", [{
            name: "project/project.json",
            data: JSON.stringify({ type: "galileo-gallery-project", version: 99 }),
        }])
        await expectCode("future_version_unsupported", () => rejectUnsupportedProjectArchive({
            sourcePath: future,
            stagingParent: staging,
            limits: TEST_LIMITS,
        }), staging)

        const wrongProduct = writeFixture(fixtures, "wrong-product.galileo", [{
            name: "project/project.json",
            data: JSON.stringify({ type: "pitchdog-drift-project", version: 1 }),
        }])
        await expectCode("wrong_product", () => rejectUnsupportedProjectArchive({
            sourcePath: wrongProduct,
            stagingParent: staging,
            limits: TEST_LIMITS,
        }), staging)

        fs.mkdirSync(staging, { recursive: true })
        const abandoned = path.join(staging, "import-12345678-1234-4123-8123-123456789abc")
        const active = path.join(staging, "import-abcdefab-cdef-4abc-8def-abcdefabcdef")
        const unrelated = path.join(staging, "keep-me")
        fs.mkdirSync(abandoned)
        fs.mkdirSync(active)
        fs.writeFileSync(path.join(active, ".owner.json"), JSON.stringify({ pid: process.pid }))
        fs.mkdirSync(unrelated)
        cleanupAbandonedProjectImports(staging)
        assert.equal(fs.existsSync(abandoned), false)
        assert.equal(fs.existsSync(active), true)
        assert.equal(fs.existsSync(unrelated), true)
        fs.rmSync(active, { recursive: true })
        fs.rmSync(unrelated, { recursive: true })

        const redirectedTarget = path.join(root, "redirected-staging-target")
        const redirectedParent = path.join(root, "redirected-staging-link")
        fs.mkdirSync(redirectedTarget)
        fs.writeFileSync(path.join(redirectedTarget, "keep.txt"), "keep")
        fs.symlinkSync(redirectedTarget, redirectedParent, "dir")
        await assert.rejects(() => withStagedProjectArchive(
            { sourcePath: valid, stagingParent: redirectedParent, limits: TEST_LIMITS },
            async () => undefined
        ), (error) => error?.code === "internal_error")
        assert.equal(fs.readFileSync(path.join(redirectedTarget, "keep.txt"), "utf8"), "keep")

        const publicFailure = publicProjectImportFailure(Object.assign(new Error(`/private/user/path/${legacy}`), { code: "unknown" }))
        assert.equal(publicFailure.code, "internal_error")
        assert.equal(publicFailure.message.includes(root), false)
        assert.equal(
            crypto.createHash("sha256").update(fs.readFileSync(priorProjectFile)).digest("hex"),
            priorProjectHash
        )

        console.log("Verified: bounded archive staging rejects traversal, conflicts, quotas, bombs, special files, cancellation, legacy v1, wrong product, and future versions without residue or source mutation.")
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
}

run().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
