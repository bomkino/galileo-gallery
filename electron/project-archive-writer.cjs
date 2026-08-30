const fs = require("node:fs")
const path = require("node:path")

const UINT16_MAX = 0xffff
const UINT32_MAX = 0xffffffff
const UINT32_MAX_BIGINT = BigInt(UINT32_MAX)
const STREAM_BUFFER_BYTES = 1024 * 1024
const DOS_TIME = 0
const DOS_DATE = 0x21
const UTF8_FLAG = 0x0800
const DATA_DESCRIPTOR_FLAG = 0x0008

const CRC32_TABLE = new Uint32Array(256)
for (let index = 0; index < CRC32_TABLE.length; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0)
    CRC32_TABLE[index] = value >>> 0
}

function updateCrc32(current, bytes, length = bytes.length) {
    let value = current
    for (let index = 0; index < length; index += 1) value = CRC32_TABLE[(value ^ bytes[index]) & 0xff] ^ (value >>> 8)
    return value >>> 0
}

function uint64(buffer, offset, value) {
    buffer.writeBigUInt64LE(value, offset)
}

function zip64Extra(values) {
    if (!values.length) return Buffer.alloc(0)
    const extra = Buffer.alloc(4 + values.length * 8)
    extra.writeUInt16LE(0x0001, 0)
    extra.writeUInt16LE(values.length * 8, 2)
    values.forEach((value, index) => uint64(extra, 4 + index * 8, value))
    return extra
}

function validateEntry(entry, seen) {
    if (!entry || typeof entry !== "object" || typeof entry.archivePath !== "string") throw new TypeError("Invalid stored ZIP entry.")
    const directory = entry.directory === true
    if (!entry.archivePath || entry.archivePath.includes("\\") || entry.archivePath.includes("\0")
        || path.posix.isAbsolute(entry.archivePath) || entry.archivePath.split("/").some((segment, index, segments) => !segment && index !== segments.length - 1)
        || entry.archivePath.split("/").some((segment) => segment === "." || segment === "..")
        || directory !== entry.archivePath.endsWith("/")) {
        throw new TypeError("Invalid stored ZIP path.")
    }
    const name = Buffer.from(entry.archivePath, "utf8")
    if (!name.length || name.length > UINT16_MAX) throw new TypeError("Stored ZIP path is too long.")
    if (seen.has(entry.archivePath)) throw new TypeError("Duplicate stored ZIP path.")
    seen.add(entry.archivePath)
    const bytes = directory ? 0 : entry.bytes
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new TypeError("Invalid stored ZIP entry size.")
    if (!directory && (typeof entry.sourceRelativePath !== "string" || !entry.sourceRelativePath
        || path.isAbsolute(entry.sourceRelativePath)
        || entry.sourceRelativePath.split(/[\\/]/).some((segment) => !segment || segment === "." || segment === ".."))) {
        throw new TypeError("Invalid stored ZIP source path.")
    }
    return { ...entry, bytes, directory, name, size: BigInt(bytes) }
}

function createStoredZipPlan(entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length > UINT16_MAX) throw new TypeError("Invalid stored ZIP entry table.")
    const seen = new Set()
    let offset = 0n
    const plannedEntries = entries.map((raw) => {
        const entry = validateEntry(raw, seen)
        const sizeZip64 = entry.size >= UINT32_MAX_BIGINT
        const localExtraBytes = sizeZip64 ? 20 : 0
        const descriptorBytes = entry.directory ? 0 : (sizeZip64 ? 24 : 16)
        const localOffset = offset
        offset += BigInt(30 + entry.name.length + localExtraBytes + descriptorBytes) + entry.size
        if (offset > BigInt(Number.MAX_SAFE_INTEGER)) throw new TypeError("Stored ZIP output is too large.")
        return { ...entry, localOffset, sizeZip64, localExtraBytes, descriptorBytes }
    })
    const centralOffset = offset
    for (const entry of plannedEntries) {
        const offsetZip64 = entry.localOffset >= UINT32_MAX_BIGINT
        const centralZip64ValueCount = (entry.sizeZip64 ? 2 : 0) + (offsetZip64 ? 1 : 0)
        entry.offsetZip64 = offsetZip64
        entry.centralExtraBytes = centralZip64ValueCount ? 4 + centralZip64ValueCount * 8 : 0
        offset += BigInt(46 + entry.name.length + entry.centralExtraBytes)
    }
    const centralBytes = offset - centralOffset
    const zip64End = entries.length >= UINT16_MAX || centralOffset >= UINT32_MAX_BIGINT || centralBytes >= UINT32_MAX_BIGINT
    offset += BigInt(zip64End ? 98 : 22)
    if (offset > BigInt(Number.MAX_SAFE_INTEGER)) throw new TypeError("Stored ZIP output is too large.")
    return Object.freeze({
        archiveBytes: Number(offset),
        centralBytes,
        centralOffset,
        entries: Object.freeze(plannedEntries.map((entry) => Object.freeze(entry))),
        zip64End,
    })
}

function localHeader(entry) {
    const extra = entry.sizeZip64 ? zip64Extra([entry.size, entry.size]) : Buffer.alloc(0)
    const header = Buffer.alloc(30 + entry.name.length + extra.length)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(entry.sizeZip64 ? 45 : 20, 4)
    header.writeUInt16LE(UTF8_FLAG | (entry.directory ? 0 : DATA_DESCRIPTOR_FLAG), 6)
    header.writeUInt16LE(0, 8)
    header.writeUInt16LE(DOS_TIME, 10)
    header.writeUInt16LE(DOS_DATE, 12)
    header.writeUInt32LE(0, 14)
    header.writeUInt32LE(entry.sizeZip64 ? UINT32_MAX : 0, 18)
    header.writeUInt32LE(entry.sizeZip64 ? UINT32_MAX : 0, 22)
    header.writeUInt16LE(entry.name.length, 26)
    header.writeUInt16LE(extra.length, 28)
    entry.name.copy(header, 30)
    extra.copy(header, 30 + entry.name.length)
    return header
}

function dataDescriptor(entry, crc32) {
    const descriptor = Buffer.alloc(entry.sizeZip64 ? 24 : 16)
    descriptor.writeUInt32LE(0x08074b50, 0)
    descriptor.writeUInt32LE(crc32, 4)
    if (entry.sizeZip64) {
        uint64(descriptor, 8, entry.size)
        uint64(descriptor, 16, entry.size)
    } else {
        descriptor.writeUInt32LE(entry.bytes, 8)
        descriptor.writeUInt32LE(entry.bytes, 12)
    }
    return descriptor
}

function centralHeader(entry, crc32) {
    const extraValues = []
    if (entry.sizeZip64) extraValues.push(entry.size, entry.size)
    if (entry.offsetZip64) extraValues.push(entry.localOffset)
    const extra = zip64Extra(extraValues)
    const header = Buffer.alloc(46 + entry.name.length + extra.length)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(0x031e, 4)
    header.writeUInt16LE(entry.sizeZip64 || entry.offsetZip64 ? 45 : 20, 6)
    header.writeUInt16LE(UTF8_FLAG | (entry.directory ? 0 : DATA_DESCRIPTOR_FLAG), 8)
    header.writeUInt16LE(0, 10)
    header.writeUInt16LE(DOS_TIME, 12)
    header.writeUInt16LE(DOS_DATE, 14)
    header.writeUInt32LE(crc32, 16)
    header.writeUInt32LE(entry.sizeZip64 ? UINT32_MAX : entry.bytes, 20)
    header.writeUInt32LE(entry.sizeZip64 ? UINT32_MAX : entry.bytes, 24)
    header.writeUInt16LE(entry.name.length, 28)
    header.writeUInt16LE(extra.length, 30)
    header.writeUInt16LE(0, 32)
    header.writeUInt16LE(0, 34)
    header.writeUInt16LE(0, 36)
    header.writeUInt32LE(((entry.directory ? 0o040700 : 0o100600) << 16) >>> 0, 38)
    header.writeUInt32LE(entry.offsetZip64 ? UINT32_MAX : Number(entry.localOffset), 42)
    entry.name.copy(header, 46)
    extra.copy(header, 46 + entry.name.length)
    return header
}

function endRecords(plan) {
    const count = BigInt(plan.entries.length)
    if (!plan.zip64End) {
        const end = Buffer.alloc(22)
        end.writeUInt32LE(0x06054b50, 0)
        end.writeUInt16LE(plan.entries.length, 8)
        end.writeUInt16LE(plan.entries.length, 10)
        end.writeUInt32LE(Number(plan.centralBytes), 12)
        end.writeUInt32LE(Number(plan.centralOffset), 16)
        return end
    }
    const end = Buffer.alloc(98)
    end.writeUInt32LE(0x06064b50, 0)
    uint64(end, 4, 44n)
    end.writeUInt16LE(0x032d, 12)
    end.writeUInt16LE(45, 14)
    uint64(end, 24, count)
    uint64(end, 32, count)
    uint64(end, 40, plan.centralBytes)
    uint64(end, 48, plan.centralOffset)
    end.writeUInt32LE(0x07064b50, 56)
    uint64(end, 64, plan.centralOffset + plan.centralBytes)
    end.writeUInt32LE(1, 72)
    end.writeUInt32LE(0x06054b50, 76)
    end.writeUInt16LE(UINT16_MAX, 84)
    end.writeUInt16LE(UINT16_MAX, 86)
    end.writeUInt32LE(UINT32_MAX, 88)
    end.writeUInt32LE(UINT32_MAX, 92)
    return end
}

async function writeAll(handle, bytes) {
    let offset = 0
    while (offset < bytes.length) {
        const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset)
        if (bytesWritten <= 0) throw new Error("Stored ZIP output stopped accepting bytes.")
        offset += bytesWritten
    }
}

function containedSource(sourceRoot, relativePath) {
    const source = path.resolve(sourceRoot, ...relativePath.split(/[\\/]/))
    const relative = path.relative(sourceRoot, source)
    if (!relative || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) throw new TypeError("Invalid stored ZIP source path.")
    return source
}

async function writeStoredZip(outputPath, plan, sourceRoot) {
    if (!plan || !Array.isArray(plan.entries) || !Number.isSafeInteger(plan.archiveBytes)) throw new TypeError("Invalid stored ZIP plan.")
    const root = path.resolve(sourceRoot)
    const output = await fs.promises.open(outputPath, "wx", 0o600)
    const crc32s = []
    const buffer = Buffer.allocUnsafe(STREAM_BUFFER_BYTES)
    let written = 0
    try {
        for (const entry of plan.entries) {
            const header = localHeader(entry)
            await writeAll(output, header)
            written += header.length
            if (entry.directory) {
                crc32s.push(0)
                continue
            }
            const sourcePath = containedSource(root, entry.sourceRelativePath)
            const stat = await fs.promises.lstat(sourcePath)
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== entry.bytes) throw new Error("Stored ZIP source changed before archival.")
            const input = await fs.promises.open(sourcePath, "r")
            let copied = 0
            let crc32 = UINT32_MAX
            try {
                while (copied < entry.bytes) {
                    const requested = Math.min(buffer.length, entry.bytes - copied)
                    const { bytesRead } = await input.read(buffer, 0, requested, copied)
                    if (bytesRead <= 0) throw new Error("Stored ZIP source ended early.")
                    crc32 = updateCrc32(crc32, buffer, bytesRead)
                    await writeAll(output, buffer.subarray(0, bytesRead))
                    copied += bytesRead
                    written += bytesRead
                }
                const trailing = await input.read(buffer, 0, 1, copied)
                if (trailing.bytesRead !== 0) throw new Error("Stored ZIP source grew during archival.")
            } finally {
                await input.close()
            }
            crc32 = (crc32 ^ UINT32_MAX) >>> 0
            crc32s.push(crc32)
            const descriptor = dataDescriptor(entry, crc32)
            await writeAll(output, descriptor)
            written += descriptor.length
        }
        for (let index = 0; index < plan.entries.length; index += 1) {
            const header = centralHeader(plan.entries[index], crc32s[index])
            await writeAll(output, header)
            written += header.length
        }
        const end = endRecords(plan)
        await writeAll(output, end)
        written += end.length
        if (written !== plan.archiveBytes) throw new Error("Stored ZIP byte plan mismatch.")
        await output.sync()
    } finally {
        await output.close()
    }
}

module.exports = {
    createStoredZipPlan,
    writeStoredZip,
}
