const crypto = require("node:crypto")
const fs = require("node:fs")
const { HostPortError } = require("./linux-host-port.cjs")

function fail() { throw new HostPortError("verification_failed") }

function boxHeader(buffer, offset, limit) {
    if (offset < 0 || offset + 8 > limit) fail()
    const small = buffer.readUInt32BE(offset)
    const type = buffer.toString("ascii", offset + 4, offset + 8)
    if (!/^[\x20-\x7e]{4}$/.test(type)) fail()
    let header = 8
    let size = small
    if (small === 1) {
        if (offset + 16 > limit) fail()
        const large = buffer.readBigUInt64BE(offset + 8)
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) fail()
        size = Number(large)
        header = 16
    } else if (small === 0) size = limit - offset
    if (size < header || offset + size > limit) fail()
    return { type, offset, size, header, dataOffset: offset + header, end: offset + size }
}

function topLevelFileBoxes(handle, bytes) {
    const boxes = []
    let offset = 0
    const header = Buffer.alloc(16)
    while (offset < bytes) {
        if (boxes.length >= 64) fail()
        header.fill(0)
        const read = fs.readSync(handle, header, 0, Math.min(16, bytes - offset), offset)
        if (read < 8) fail()
        const small = header.readUInt32BE(0)
        const type = header.toString("ascii", 4, 8)
        if (!/^[\x20-\x7e]{4}$/.test(type)) fail()
        let boxBytes = small
        let headerBytes = 8
        if (small === 1) {
            if (read < 16) fail()
            const large = header.readBigUInt64BE(8)
            if (large > BigInt(Number.MAX_SAFE_INTEGER)) fail()
            boxBytes = Number(large)
            headerBytes = 16
        } else if (small === 0) boxBytes = bytes - offset
        if (boxBytes < headerBytes || offset + boxBytes > bytes) fail()
        boxes.push({ type, offset, size: boxBytes, header: headerBytes })
        offset += boxBytes
    }
    if (offset !== bytes) fail()
    return boxes
}

function childBoxes(buffer, start, end, maximum = 4_096) {
    const boxes = []
    let offset = start
    while (offset < end) {
        if (boxes.length >= maximum) fail()
        const box = boxHeader(buffer, offset, end)
        boxes.push(box)
        offset = box.end
    }
    if (offset !== end) fail()
    return boxes
}

function one(boxes, type) {
    const found = boxes.filter((box) => box.type === type)
    if (found.length !== 1) fail()
    return found[0]
}

function assertPortableFileType(buffer) {
    const box = boxHeader(buffer, 0, buffer.length)
    if (box.type !== "ftyp" || box.end !== buffer.length || box.dataOffset + 16 > box.end || (box.end - box.dataOffset - 8) % 4 !== 0
        || buffer.toString("ascii", box.dataOffset, box.dataOffset + 4) !== "isom" || buffer.readUInt32BE(box.dataOffset + 4) !== 512) fail()
    const brands = []
    for (let offset = box.dataOffset + 8; offset < box.end; offset += 4) brands.push(buffer.toString("ascii", offset, offset + 4))
    const allowed = new Set(["isom", "iso2", "avc1", "mp41"])
    if (brands.some((brand) => !allowed.has(brand)) || [...allowed].some((brand) => !brands.includes(brand))) fail()
}

function fullBoxVersion(buffer, box) {
    if (box.dataOffset + 4 > box.end) fail()
    return buffer[box.dataOffset]
}

function fullBoxFlags(buffer, box) {
    if (box.dataOffset + 4 > box.end) fail()
    return buffer.readUIntBE(box.dataOffset + 1, 3)
}

function mediaHeader(buffer, box) {
    const version = fullBoxVersion(buffer, box)
    if (version === 0) {
        if (box.dataOffset + 20 > box.end) fail()
        return { timescale: buffer.readUInt32BE(box.dataOffset + 12), duration: BigInt(buffer.readUInt32BE(box.dataOffset + 16)) }
    }
    if (version === 1) {
        if (box.dataOffset + 32 > box.end) fail()
        return { timescale: buffer.readUInt32BE(box.dataOffset + 20), duration: buffer.readBigUInt64BE(box.dataOffset + 24) }
    }
    fail()
}

function assertMatrix(buffer, offset) {
    const expected = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000]
    for (let index = 0; index < expected.length; index += 1) {
        if (buffer.readInt32BE(offset + index * 4) !== expected[index]) fail()
    }
}

function movieHeader(buffer, box) {
    const version = fullBoxVersion(buffer, box)
    const expectedBytes = version === 0 ? 100 : version === 1 ? 112 : 0
    if (!expectedBytes || box.dataOffset + expectedBytes !== box.end || fullBoxFlags(buffer, box) !== 0) fail()
    const rateOffset = box.dataOffset + (version === 0 ? 20 : 32)
    const matrixOffset = rateOffset + 16
    if (buffer.readInt32BE(rateOffset) !== 0x00010000 || buffer.readUInt16BE(rateOffset + 4) !== 0x0100
        || buffer.readUInt16BE(rateOffset + 6) !== 0 || buffer.readBigUInt64BE(rateOffset + 8) !== 0n) fail()
    assertMatrix(buffer, matrixOffset)
    for (let offset = matrixOffset + 36; offset < matrixOffset + 60; offset += 4) if (buffer.readUInt32BE(offset) !== 0) fail()
    const nextTrackId = buffer.readUInt32BE(matrixOffset + 60)
    if (nextTrackId !== 3) fail()
    return { ...mediaHeader(buffer, box), nextTrackId }
}

function trackHeaderTiming(buffer, box) {
    const version = fullBoxVersion(buffer, box)
    if (version === 0) {
        if (box.dataOffset + 24 > box.end) fail()
        return BigInt(buffer.readUInt32BE(box.dataOffset + 20))
    }
    if (version === 1) {
        if (box.dataOffset + 36 > box.end) fail()
        return buffer.readBigUInt64BE(box.dataOffset + 28)
    }
    fail()
}

function sampleTableTiming(buffer, box) {
    if (fullBoxVersion(buffer, box) !== 0 || box.dataOffset + 8 > box.end) fail()
    const entryCount = buffer.readUInt32BE(box.dataOffset + 4)
    if (entryCount < 1 || entryCount > 1_000_000 || box.dataOffset + 8 + entryCount * 8 !== box.end) fail()
    let sampleCount = 0n
    let duration = 0n
    let aacPacketSchedule = true
    for (let index = 0; index < entryCount; index += 1) {
        const offset = box.dataOffset + 8 + index * 8
        const count = BigInt(buffer.readUInt32BE(offset))
        const delta = BigInt(buffer.readUInt32BE(offset + 4))
        if (count < 1n || delta < 1n) fail()
        sampleCount += count
        duration += count * delta
        const finalSinglePacket = index === entryCount - 1 && count === 1n
        if (finalSinglePacket ? delta > 1_024n : delta !== 1_024n) aacPacketSchedule = false
    }
    return { sampleCount, duration, entryCount, singleDelta: entryCount === 1 ? duration / sampleCount : null, aacPacketSchedule }
}

function compositionTiming(buffer, box, maximumSamples) {
    const version = fullBoxVersion(buffer, box)
    if (![0, 1].includes(version) || box.dataOffset + 8 > box.end) fail()
    const entryCount = buffer.readUInt32BE(box.dataOffset + 4)
    if (entryCount < 1 || entryCount > maximumSamples || box.dataOffset + 8 + entryCount * 8 !== box.end) fail()
    const runs = []
    let samples = 0
    for (let index = 0; index < entryCount; index += 1) {
        const offset = box.dataOffset + 8 + index * 8
        const count = buffer.readUInt32BE(offset)
        const compositionOffset = version === 0 ? BigInt(buffer.readUInt32BE(offset + 4)) : BigInt(buffer.readInt32BE(offset + 4))
        if (count < 1 || samples + count > maximumSamples) fail()
        samples += count
        runs.push({ count, offset: compositionOffset })
    }
    if (samples !== maximumSamples) fail()
    return runs
}

function syncSamples(buffer, box, maximumSamples) {
    if (fullBoxVersion(buffer, box) !== 0 || fullBoxFlags(buffer, box) !== 0 || box.dataOffset + 8 > box.end) fail()
    const entryCount = buffer.readUInt32BE(box.dataOffset + 4)
    if (entryCount < 1 || entryCount > maximumSamples || box.dataOffset + 8 + entryCount * 4 !== box.end) fail()
    const samples = []
    let previous = 0
    for (let index = 0; index < entryCount; index += 1) {
        const sample = buffer.readUInt32BE(box.dataOffset + 8 + index * 4)
        if (sample < 1 || sample > maximumSamples || sample <= previous) fail()
        samples.push(sample)
        previous = sample
    }
    if (samples[0] !== 1) fail()
    return samples
}

function sampleCount(buffer, box) {
    if (fullBoxVersion(buffer, box) !== 0 || box.dataOffset + 12 > box.end) fail()
    const fixedSize = buffer.readUInt32BE(box.dataOffset + 4)
    const count = buffer.readUInt32BE(box.dataOffset + 8)
    if (count < 1 || count > 1_000_000) fail()
    const expectedEnd = fixedSize === 0 ? box.dataOffset + 12 + count * 4 : box.dataOffset + 12
    if (expectedEnd !== box.end) fail()
    return count
}

function sampleEntry(buffer, stsd) {
    if (fullBoxVersion(buffer, stsd) !== 0 || stsd.dataOffset + 8 > stsd.end || buffer.readUInt32BE(stsd.dataOffset + 4) !== 1) fail()
    const entries = childBoxes(buffer, stsd.dataOffset + 8, stsd.end, 8)
    if (entries.length !== 1) fail()
    return entries[0]
}

function rbsp(nal) {
    const bytes = []
    let zeros = 0
    for (const byte of nal) {
        if (zeros >= 2 && byte === 0x03) { zeros = 0; continue }
        bytes.push(byte)
        zeros = byte === 0 ? zeros + 1 : 0
    }
    return Buffer.from(bytes)
}

function bitReader(buffer) {
    let bit = 0
    const readBits = (count) => {
        if (!Number.isSafeInteger(count) || count < 0 || count > 32 || bit + count > buffer.length * 8) fail()
        let value = 0
        for (let index = 0; index < count; index += 1) {
            value = value * 2 + ((buffer[Math.floor(bit / 8)] >> (7 - bit % 8)) & 1)
            bit += 1
        }
        return value
    }
    const readUE = () => {
        let zeros = 0
        while (readBits(1) === 0) { zeros += 1; if (zeros > 30) fail() }
        return (2 ** zeros - 1) + (zeros ? readBits(zeros) : 0)
    }
    const readSE = () => { const value = readUE(); return value % 2 ? (value + 1) / 2 : -(value / 2) }
    return { readBits, readSE, readUE }
}

function skipScalingList(reader, size) {
    let lastScale = 8
    let nextScale = 8
    for (let index = 0; index < size; index += 1) {
        if (nextScale !== 0) nextScale = (lastScale + reader.readSE() + 256) % 256
        if (nextScale !== 0) lastScale = nextScale
    }
}

function spsDimensions(nal) {
    if (nal.length < 5 || (nal[0] & 0x1f) !== 7) fail()
    const reader = bitReader(rbsp(nal.subarray(1)))
    const profile = reader.readBits(8)
    const compatibility = reader.readBits(8)
    const level = reader.readBits(8)
    reader.readUE()
    let chromaFormat = 1
    let separateColourPlane = false
    let bitDepthLuma = 8
    let bitDepthChroma = 8
    if (new Set([44, 83, 86, 100, 110, 118, 122, 128, 134, 135, 138, 139, 244]).has(profile)) {
        chromaFormat = reader.readUE()
        if (chromaFormat > 3) fail()
        if (chromaFormat === 3) separateColourPlane = Boolean(reader.readBits(1))
        bitDepthLuma = reader.readUE() + 8
        bitDepthChroma = reader.readUE() + 8
        reader.readBits(1)
        if (reader.readBits(1)) {
            const count = chromaFormat === 3 ? 12 : 8
            for (let index = 0; index < count; index += 1) if (reader.readBits(1)) skipScalingList(reader, index < 6 ? 16 : 64)
        }
    }
    reader.readUE()
    const pictureOrder = reader.readUE()
    if (pictureOrder === 0) reader.readUE()
    else if (pictureOrder === 1) {
        reader.readBits(1)
        reader.readSE()
        reader.readSE()
        const count = reader.readUE()
        if (count > 256) fail()
        for (let index = 0; index < count; index += 1) reader.readSE()
    } else if (pictureOrder !== 2) fail()
    reader.readUE()
    reader.readBits(1)
    const widthMbs = reader.readUE() + 1
    const heightMapUnits = reader.readUE() + 1
    const frameMbsOnly = reader.readBits(1)
    if (!frameMbsOnly) reader.readBits(1)
    reader.readBits(1)
    let cropLeft = 0
    let cropRight = 0
    let cropTop = 0
    let cropBottom = 0
    if (reader.readBits(1)) {
        cropLeft = reader.readUE(); cropRight = reader.readUE(); cropTop = reader.readUE(); cropBottom = reader.readUE()
    }
    if (!reader.readBits(1)) fail()
    let pixelAspect = "unspecified"
    if (reader.readBits(1)) {
        const aspectRatio = reader.readBits(8)
        if (aspectRatio === 1) pixelAspect = "square"
        else if (aspectRatio === 255) {
            const sarWidth = reader.readBits(16)
            const sarHeight = reader.readBits(16)
            pixelAspect = sarWidth > 0 && sarWidth === sarHeight ? "square" : "other"
        } else pixelAspect = "other"
    }
    if (reader.readBits(1)) reader.readBits(1)
    if (!reader.readBits(1)) fail()
    reader.readBits(3)
    const fullRange = Boolean(reader.readBits(1))
    if (!reader.readBits(1)) fail()
    const colourPrimaries = reader.readBits(8)
    const transfer = reader.readBits(8)
    const matrix = reader.readBits(8)
    const chromaArrayType = separateColourPlane ? 0 : chromaFormat
    const subWidth = chromaArrayType === 1 || chromaArrayType === 2 ? 2 : 1
    const subHeight = chromaArrayType === 1 ? 2 : 1
    const cropUnitX = chromaArrayType === 0 ? 1 : subWidth
    const cropUnitY = (chromaArrayType === 0 ? 1 : subHeight) * (2 - frameMbsOnly)
    const width = widthMbs * 16 - (cropLeft + cropRight) * cropUnitX
    const height = heightMapUnits * 16 * (2 - frameMbsOnly) - (cropTop + cropBottom) * cropUnitY
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 16_384 || height > 16_384) fail()
    return {
        width,
        height,
        colour: colourPrimaries === 1 && transfer === 1 && matrix === 1 && !fullRange ? "bt709-limited" : "other",
        pixelAspect,
        pixelFormat: chromaFormat === 1 && !separateColourPlane && bitDepthLuma === 8 && bitDepthChroma === 8 ? "yuv420p8" : "other",
        profile: profile === 100 ? "high" : "other",
        profileIdc: profile,
        compatibility,
        level,
        scan: frameMbsOnly ? "progressive" : "interlaced",
    }
}

function avcDimensions(buffer, box) {
    if (box.dataOffset + 7 > box.end || buffer[box.dataOffset] !== 1 || (buffer[box.dataOffset + 4] & 0xfc) !== 0xfc
        || (buffer[box.dataOffset + 4] & 0x03) !== 3 || (buffer[box.dataOffset + 5] & 0xe0) !== 0xe0) fail()
    const configurationProfile = buffer[box.dataOffset + 1]
    const configurationCompatibility = buffer[box.dataOffset + 2]
    const configurationLevel = buffer[box.dataOffset + 3]
    const spsCount = buffer[box.dataOffset + 5] & 0x1f
    if (spsCount < 1 || spsCount > 8) fail()
    let offset = box.dataOffset + 6
    let dimensions = null
    for (let index = 0; index < spsCount; index += 1) {
        if (offset + 2 > box.end) fail()
        const length = buffer.readUInt16BE(offset)
        offset += 2
        if (length < 1 || offset + length > box.end) fail()
        const current = spsDimensions(buffer.subarray(offset, offset + length))
        if (dimensions && (dimensions.width !== current.width || dimensions.height !== current.height || dimensions.colour !== current.colour
            || dimensions.pixelAspect !== current.pixelAspect || dimensions.pixelFormat !== current.pixelFormat
            || dimensions.profile !== current.profile || dimensions.scan !== current.scan || dimensions.profileIdc !== current.profileIdc
            || dimensions.compatibility !== current.compatibility || dimensions.level !== current.level)) fail()
        if (current.profileIdc !== configurationProfile || current.compatibility !== configurationCompatibility || current.level !== configurationLevel) fail()
        dimensions = current
        offset += length
    }
    if (offset >= box.end) fail()
    const ppsCount = buffer[offset]
    offset += 1
    if (ppsCount < 1 || ppsCount > 8) fail()
    for (let index = 0; index < ppsCount; index += 1) {
        if (offset + 2 > box.end) fail()
        const length = buffer.readUInt16BE(offset)
        offset += 2
        if (length < 1 || offset + length > box.end || (buffer[offset] & 0x1f) !== 8) fail()
        offset += length
    }
    if (offset < box.end) {
        if (![100, 110, 122, 144].includes(configurationProfile) || offset + 4 > box.end
            || (buffer[offset] & 0xfc) !== 0xfc || (buffer[offset] & 0x03) !== 1
            || (buffer[offset + 1] & 0xf8) !== 0xf8 || (buffer[offset + 1] & 0x07) !== 0
            || (buffer[offset + 2] & 0xf8) !== 0xf8 || (buffer[offset + 2] & 0x07) !== 0) fail()
        const extensionCount = buffer[offset + 3]
        offset += 4
        if (extensionCount > 8) fail()
        for (let index = 0; index < extensionCount; index += 1) {
            if (offset + 2 > box.end) fail()
            const length = buffer.readUInt16BE(offset)
            offset += 2
            if (length < 1 || offset + length > box.end || (buffer[offset] & 0x1f) !== 13) fail()
            offset += length
        }
    }
    if (offset !== box.end) fail()
    return dimensions
}

function videoEntry(buffer, entry) {
    if (entry.type !== "avc1" || entry.dataOffset + 78 > entry.end || buffer.readUInt16BE(entry.dataOffset + 6) !== 1) fail()
    const sampleWidth = buffer.readUInt16BE(entry.dataOffset + 24)
    const sampleHeight = buffer.readUInt16BE(entry.dataOffset + 26)
    if (sampleWidth < 1 || sampleHeight < 1) fail()
    const children = childBoxes(buffer, entry.dataOffset + 78, entry.end, 64)
    if (children.some((box) => box.type === "clap")) fail()
    const bitstream = avcDimensions(buffer, one(children, "avcC"))
    const pixelAspectBoxes = children.filter((box) => box.type === "pasp")
    if (pixelAspectBoxes.length > 1) fail()
    let containerPixelAspect = "unspecified"
    if (pixelAspectBoxes.length === 1) {
        const pixelAspect = pixelAspectBoxes[0]
        if (pixelAspect.dataOffset + 8 !== pixelAspect.end) fail()
        const horizontalSpacing = buffer.readUInt32BE(pixelAspect.dataOffset)
        const verticalSpacing = buffer.readUInt32BE(pixelAspect.dataOffset + 4)
        if (horizontalSpacing < 1 || horizontalSpacing !== verticalSpacing) fail()
        containerPixelAspect = "square"
    }
    const colour = one(children, "colr")
    if (colour.dataOffset + 11 > colour.end || buffer.toString("ascii", colour.dataOffset, colour.dataOffset + 4) !== "nclx") fail()
    const primaries = buffer.readUInt16BE(colour.dataOffset + 4)
    const transfer = buffer.readUInt16BE(colour.dataOffset + 6)
    const matrix = buffer.readUInt16BE(colour.dataOffset + 8)
    const fullRange = Boolean(buffer[colour.dataOffset + 10] & 0x80)
    if (primaries !== 1 || transfer !== 1 || matrix !== 1 || fullRange) fail()
    return { codec: "avc1", colour: "bt709-limited", bitstreamColour: bitstream.colour, bitstreamPixelAspect: bitstream.pixelAspect, containerPixelAspect,
        bitstreamPixelFormat: bitstream.pixelFormat, bitstreamProfile: bitstream.profile, bitstreamScan: bitstream.scan,
        sampleWidth, sampleHeight, bitstreamWidth: bitstream.width, bitstreamHeight: bitstream.height }
}

function assertIdentityTrackMatrix(buffer, trackHeader) {
    const version = fullBoxVersion(buffer, trackHeader)
    const expectedBytes = version === 0 ? 84 : version === 1 ? 96 : 0
    if (!expectedBytes || trackHeader.dataOffset + expectedBytes !== trackHeader.end || trackHeader.end - 44 < trackHeader.dataOffset) fail()
    const matrixOffset = trackHeader.end - 44
    assertMatrix(buffer, matrixOffset)
}

function assertTrackPresentation(buffer, trackHeader, handler) {
    assertIdentityTrackMatrix(buffer, trackHeader)
    const matrixOffset = trackHeader.end - 44
    if (buffer.readInt16BE(matrixOffset - 8) !== 0 || buffer.readInt16BE(matrixOffset - 6) !== (handler === "soun" ? 1 : 0)
        || buffer.readUInt16BE(matrixOffset - 4) !== (handler === "soun" ? 0x0100 : 0)
        || buffer.readUInt16BE(matrixOffset - 2) !== 0) fail()
    if (handler === "soun" && (buffer.readUInt32BE(trackHeader.end - 8) !== 0 || buffer.readUInt32BE(trackHeader.end - 4) !== 0)) fail()
    const trackIdOffset = trackHeader.dataOffset + (fullBoxVersion(buffer, trackHeader) === 0 ? 12 : 20)
    const trackId = buffer.readUInt32BE(trackIdOffset)
    if (trackId !== (handler === "vide" ? 1 : 2)) fail()
    return trackId
}

function assertSelfContainedDataReference(buffer, mediaInfoChildren) {
    const dataInfo = one(mediaInfoChildren, "dinf")
    const dataReference = one(childBoxes(buffer, dataInfo.dataOffset, dataInfo.end, 8), "dref")
    if (fullBoxVersion(buffer, dataReference) !== 0 || fullBoxFlags(buffer, dataReference) !== 0
        || dataReference.dataOffset + 8 > dataReference.end || buffer.readUInt32BE(dataReference.dataOffset + 4) !== 1) fail()
    const entries = childBoxes(buffer, dataReference.dataOffset + 8, dataReference.end, 8)
    const local = one(entries, "url ")
    if (fullBoxVersion(buffer, local) !== 0 || fullBoxFlags(buffer, local) !== 1 || local.dataOffset + 4 !== local.end) fail()
}

function assertMediaPresentation(buffer, mediaInfo, handler) {
    const children = childBoxes(buffer, mediaInfo.dataOffset, mediaInfo.end, 64)
    assertSelfContainedDataReference(buffer, children)
    if (handler === "vide") {
        const header = one(children, "vmhd")
        if (fullBoxVersion(buffer, header) !== 0 || fullBoxFlags(buffer, header) !== 1 || header.dataOffset + 12 !== header.end
            || buffer.readUInt16BE(header.dataOffset + 4) !== 0 || buffer.readUInt16BE(header.dataOffset + 6) !== 0
            || buffer.readUInt16BE(header.dataOffset + 8) !== 0 || buffer.readUInt16BE(header.dataOffset + 10) !== 0
            || children.some((candidate) => candidate.type === "smhd")) fail()
    } else if (handler === "soun") {
        const header = one(children, "smhd")
        if (fullBoxVersion(buffer, header) !== 0 || fullBoxFlags(buffer, header) !== 0 || header.dataOffset + 8 !== header.end
            || buffer.readInt16BE(header.dataOffset + 4) !== 0 || buffer.readUInt16BE(header.dataOffset + 6) !== 0
            || children.some((candidate) => candidate.type === "vmhd")) fail()
    } else fail()
    return children
}

function descriptor(buffer, start, end) {
    if (start >= end) fail()
    const tag = buffer[start]
    let length = 0
    let cursor = start + 1
    let terminated = false
    for (let index = 0; index < 4; index += 1) {
        if (cursor >= end) fail()
        const byte = buffer[cursor++]
        length = length * 128 + (byte & 0x7f)
        if (!(byte & 0x80)) { terminated = true; break }
    }
    if (!terminated || length < 0 || cursor + length > end) fail()
    return { tag, dataOffset: cursor, end: cursor + length }
}

function verifyAacLc(buffer, esds) {
    if (fullBoxVersion(buffer, esds) !== 0) fail()
    const es = descriptor(buffer, esds.dataOffset + 4, esds.end)
    if (es.tag !== 0x03 || es.dataOffset + 3 > es.end) fail()
    const flags = buffer[es.dataOffset + 2]
    if (flags !== 0) fail()
    const decoder = descriptor(buffer, es.dataOffset + 3, es.end)
    if (decoder.tag !== 0x04 || decoder.dataOffset + 13 > decoder.end || buffer[decoder.dataOffset] !== 0x40 || (buffer[decoder.dataOffset + 1] >> 2) !== 5) fail()
    const specific = descriptor(buffer, decoder.dataOffset + 13, decoder.end)
    if (specific.tag !== 0x05 || specific.dataOffset + 5 !== specific.end
        || !buffer.subarray(specific.dataOffset, specific.end).equals(Buffer.from([0x11, 0x90, 0x56, 0xe5, 0x00]))) fail()
    const first = buffer[specific.dataOffset]
    const second = buffer[specific.dataOffset + 1]
    const audioObjectType = first >> 3
    const frequencyIndex = ((first & 0x07) << 1) | (second >> 7)
    const channelConfig = (second >> 3) & 0x0f
    if (audioObjectType !== 2 || frequencyIndex !== 3 || channelConfig !== 2 || (second & 0x07) !== 0) fail()
}

function audioEntry(buffer, entry) {
    if (entry.type !== "mp4a" || entry.dataOffset + 28 > entry.end || buffer.readUInt16BE(entry.dataOffset + 6) !== 1 || buffer.readUInt16BE(entry.dataOffset + 8) !== 0) fail()
    const channels = buffer.readUInt16BE(entry.dataOffset + 16)
    const sampleRateFixed = buffer.readUInt32BE(entry.dataOffset + 24)
    if (sampleRateFixed % 65_536 !== 0) fail()
    const sampleRate = sampleRateFixed / 65_536
    const children = childBoxes(buffer, entry.dataOffset + 28, entry.end, 64)
    verifyAacLc(buffer, one(children, "esds"))
    return { codec: "mp4a", profile: "aac-lc", channels, sampleRate }
}

function trackEdit(buffer, trackChildren) {
    const editBoxes = trackChildren.filter((box) => box.type === "edts")
    if (editBoxes.length > 1) fail()
    if (editBoxes.length === 0) fail()
    const editList = one(childBoxes(buffer, editBoxes[0].dataOffset, editBoxes[0].end, 8), "elst")
    const version = fullBoxVersion(buffer, editList)
    if (editList.dataOffset + 8 > editList.end || buffer.readUInt32BE(editList.dataOffset + 4) !== 1) fail()
    if (version === 0) {
        if (editList.dataOffset + 20 !== editList.end) fail()
        if (buffer.readInt16BE(editList.dataOffset + 16) !== 1 || buffer.readInt16BE(editList.dataOffset + 18) !== 0) fail()
        return { segmentDuration: BigInt(buffer.readUInt32BE(editList.dataOffset + 8)), mediaTime: BigInt(buffer.readInt32BE(editList.dataOffset + 12)) }
    }
    if (version === 1) {
        if (editList.dataOffset + 28 !== editList.end) fail()
        if (buffer.readInt16BE(editList.dataOffset + 24) !== 1 || buffer.readInt16BE(editList.dataOffset + 26) !== 0) fail()
        return { segmentDuration: buffer.readBigUInt64BE(editList.dataOffset + 8), mediaTime: buffer.readBigInt64BE(editList.dataOffset + 16) }
    }
    fail()
}

function trackDetails(moov) {
    const moovHeader = boxHeader(moov, 0, moov.length)
    if (moovHeader.type !== "moov" || moovHeader.end !== moov.length) fail()
    const moovChildren = childBoxes(moov, moovHeader.dataOffset, moovHeader.end, 128)
    const movieTiming = movieHeader(moov, one(moovChildren, "mvhd"))
    const tracks = moovChildren.filter((box) => box.type === "trak")
    if (tracks.length !== 2) fail()
    return tracks.map((track) => {
        const trackChildren = childBoxes(moov, track.dataOffset, track.end, 64)
        if (trackChildren.some((box) => box.type === "tapt")) fail()
        const media = one(trackChildren, "mdia")
        const trackHeader = one(trackChildren, "tkhd")
        if (fullBoxFlags(moov, trackHeader) !== 0x03) fail()
        const trackDuration = trackHeaderTiming(moov, trackHeader)
        const edit = trackEdit(moov, trackChildren)
        const mediaChildren = childBoxes(moov, media.dataOffset, media.end, 64)
        const handlerBox = one(mediaChildren, "hdlr")
        if (fullBoxVersion(moov, handlerBox) !== 0 || handlerBox.dataOffset + 12 > handlerBox.end) fail()
        const handler = moov.toString("ascii", handlerBox.dataOffset + 8, handlerBox.dataOffset + 12)
        const trackId = assertTrackPresentation(moov, trackHeader, handler)
        const timing = mediaHeader(moov, one(mediaChildren, "mdhd"))
        if (!Number.isSafeInteger(timing.timescale) || timing.timescale < 1 || timing.duration < 1n) fail()
        const mediaInfo = one(mediaChildren, "minf")
        const sampleTable = one(assertMediaPresentation(moov, mediaInfo, handler), "stbl")
        const tableChildren = childBoxes(moov, sampleTable.dataOffset, sampleTable.end, 256)
        const count = sampleCount(moov, one(tableChildren, "stsz"))
        const tableTiming = sampleTableTiming(moov, one(tableChildren, "stts"))
        if (tableTiming.duration !== timing.duration) fail()
        const entry = sampleEntry(moov, one(tableChildren, "stsd"))
        if (handler === "vide") {
            const codec = videoEntry(moov, entry)
            if (tableChildren.some((box) => box.type === "ctts")) fail()
            const syncBoxes = tableChildren.filter((box) => box.type === "stss")
            if ((count === 1 && syncBoxes.length !== 0) || (count > 1 && syncBoxes.length !== 1)) fail()
            const sync = count === 1 ? [1] : syncSamples(moov, syncBoxes[0], count)
            if (trackHeader.end - 8 < trackHeader.dataOffset) fail()
            const width = moov.readUInt32BE(trackHeader.end - 8) / 65_536
            const height = moov.readUInt32BE(trackHeader.end - 4) / 65_536
            return { handler, trackId, count, width, height, movieTimescale: movieTiming.timescale, movieDuration: movieTiming.duration, trackDuration, timescale: timing.timescale, duration: timing.duration, timedSamples: tableTiming.sampleCount, timingEntries: tableTiming.entryCount, sampleDelta: tableTiming.singleDelta, sync, edit, ...codec }
        }
        if (handler === "soun") {
            if (tableChildren.some((box) => box.type === "ctts" || box.type === "stss")) fail()
            return { handler, trackId, count, movieTimescale: movieTiming.timescale, movieDuration: movieTiming.duration, trackDuration, timescale: timing.timescale, duration: timing.duration, timedSamples: tableTiming.sampleCount, aacPacketSchedule: tableTiming.aacPacketSchedule, edit, ...audioEntry(moov, entry) }
        }
        fail()
    })
}

function sameIdentity(left, right) {
    return left.isFile() && left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs
}

function ensureNotAborted(signal) {
    if (signal?.aborted) throw new HostPortError("cancelled")
}

function readAt(handle, buffer, offset, length, position) {
    return new Promise((resolve, reject) => {
        fs.read(handle, buffer, offset, length, position, (error, bytesRead) => error ? reject(error) : resolve(bytesRead))
    })
}

function yieldToHost() {
    return new Promise((resolve) => setImmediate(resolve))
}

async function readExactly(handle, buffer, position, signal) {
    let offset = 0
    while (offset < buffer.length) {
        ensureNotAborted(signal)
        const count = await readAt(handle, buffer, offset, Math.min(1024 * 1024, buffer.length - offset), position + offset)
        if (!count) fail()
        offset += count
        await yieldToHost()
    }
    ensureNotAborted(signal)
}

async function hashHandle(handle, expected, signal) {
    const hash = crypto.createHash("sha256")
    const buffer = Buffer.alloc(1024 * 1024)
    if (!sameIdentity(fs.fstatSync(handle), expected)) fail()
    let position = 0
    while (position < expected.size) {
        ensureNotAborted(signal)
        const count = await readAt(handle, buffer, 0, Math.min(buffer.length, expected.size - position), position)
        if (!count) fail()
        hash.update(buffer.subarray(0, count))
        position += count
        await yieldToHost()
    }
    ensureNotAborted(signal)
    if (!sameIdentity(fs.fstatSync(handle), expected)) fail()
    return hash.digest("hex")
}

async function inspectMp4Handle(handle, expected, options = {}) {
    const maximumBytes = options.maximumBytes ?? 16 * 1024 * 1024 * 1024
    const maximumMoovBytes = options.maximumMoovBytes ?? 64 * 1024 * 1024
    const stat = fs.fstatSync(handle)
    if (!stat.isFile() || stat.size < 128 || stat.size > maximumBytes) fail()
    let boxes
    let moov
    boxes = topLevelFileBoxes(handle, stat.size)
    const moovBox = one(boxes, "moov")
    const mdatBox = one(boxes, "mdat")
    const ftypBox = one(boxes, "ftyp")
    if (ftypBox.offset !== 0 || ftypBox.size !== 32 || moovBox.offset > mdatBox.offset || moovBox.size > maximumMoovBytes || mdatBox.size <= mdatBox.header) fail()
    const ftyp = Buffer.alloc(ftypBox.size)
    await readExactly(handle, ftyp, ftypBox.offset, options.signal)
    assertPortableFileType(ftyp)
    moov = Buffer.alloc(moovBox.size)
    await readExactly(handle, moov, moovBox.offset, options.signal)
    if (!sameIdentity(fs.fstatSync(handle), stat)) fail()
    const tracks = trackDetails(moov)
    const video = tracks.find((track) => track.handler === "vide")
    const audio = tracks.find((track) => track.handler === "soun")
    const expectedMovieDuration = (BigInt(expected.frameCount) * 1_000n + BigInt(expected.fps) - 1n) / BigInt(expected.fps)
    const expectedAudioSegmentFloor = BigInt(expected.audioFrameCount) * BigInt(audio?.movieTimescale ?? 0) / 48_000n
    const expectedAudioSegmentCeil = (BigInt(expected.audioFrameCount) * BigInt(audio?.movieTimescale ?? 0) + 47_999n) / 48_000n
    const expectedVideoMediaTime = 0n
    const expectedAudioMediaEnd = 1_024n + BigInt(expected.audioFrameCount)
    const exactAudioPresentation = audio?.edit && audio.edit.mediaTime === 1_024n
        && audio.edit.segmentDuration >= expectedAudioSegmentFloor && audio.edit.segmentDuration <= expectedAudioSegmentCeil
        && audio.duration >= expectedAudioMediaEnd && audio.duration < expectedAudioMediaEnd + 1_024n
        && BigInt(audio.count) === (audio.duration + 1_023n) / 1_024n
    const exactVideoPresentation = video?.edit && video.edit.mediaTime === expectedVideoMediaTime
        && video.edit.segmentDuration === expectedMovieDuration
    const exactPixelAspect = video?.bitstreamPixelAspect === "square"
        ? video.containerPixelAspect !== "other"
        : video?.bitstreamPixelAspect === "unspecified" && video.containerPixelAspect === "unspecified"
    const expectedSync = []
    for (let sample = 1; sample <= expected.frameCount; sample += expected.fps * 2) expectedSync.push(sample)
    const exactSync = Array.isArray(video?.sync) && video.sync.length === expectedSync.length
        && video.sync.every((sample, index) => sample === expectedSync[index])
    if (!video || !audio || tracks.length !== 2 || video.movieTimescale !== 1_000 || audio.movieTimescale !== 1_000
        || video.movieDuration !== expectedMovieDuration || audio.movieDuration !== expectedMovieDuration || expectedMovieDuration < 1n
        || video.width !== expected.width || video.height !== expected.height || video.count !== expected.frameCount
        || video.timedSamples !== BigInt(expected.frameCount) || video.duration * BigInt(expected.fps) !== BigInt(video.timescale) * BigInt(expected.frameCount)
        || video.timingEntries !== 1 || video.sampleDelta * BigInt(expected.fps) !== BigInt(video.timescale)
        || video.trackDuration !== expectedMovieDuration
        || video.sampleWidth !== expected.width || video.sampleHeight !== expected.height || video.bitstreamWidth !== expected.width || video.bitstreamHeight !== expected.height
        || video.colour !== "bt709-limited" || video.bitstreamColour !== "bt709-limited" || !exactPixelAspect || video.bitstreamPixelFormat !== "yuv420p8"
        || video.bitstreamProfile !== "high" || video.bitstreamScan !== "progressive"
        || audio.profile !== "aac-lc" || audio.sampleRate !== 48_000 || audio.channels !== 2 || audio.timescale !== 48_000
        || audio.timedSamples !== BigInt(audio.count) || !audio.aacPacketSchedule || audio.trackDuration !== expectedMovieDuration
        || !exactVideoPresentation || !exactSync || !exactAudioPresentation) fail()
    const sha256 = await hashHandle(handle, stat, options.signal)
    return Object.freeze({
        bytes: stat.size,
        sha256,
        identity: Object.freeze({ device: stat.dev, inode: stat.ino, bytes: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs }),
        fastStart: true,
        video: Object.freeze({ codec: video.codec, width: video.width, height: video.height, sampleCount: video.count, fps: expected.fps, colour: video.colour }),
        audio: Object.freeze({ codec: audio.codec, profile: audio.profile, packetCount: audio.count, sampleRate: audio.sampleRate, channels: audio.channels, durationFrames: expected.audioFrameCount }),
    })
}

async function inspectMp4File(filePath, expected, options = {}) {
    const pathStat = fs.lstatSync(filePath)
    if (!pathStat.isFile() || pathStat.isSymbolicLink()) fail()
    const handle = fs.openSync(filePath, "r")
    try {
        const opened = fs.fstatSync(handle)
        if (!sameIdentity(opened, pathStat)) fail()
        return await inspectMp4Handle(handle, expected, options)
    } finally { fs.closeSync(handle) }
}

module.exports = { inspectMp4File, inspectMp4Handle }
