const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const ffmpegPath = require("ffmpeg-static")
const { HostPortError } = require("../electron/linux-host-port.cjs")
const { inspectMp4File } = require("../electron/mp4-inspector.cjs")

function nthBoxType(buffer, type, occurrence) {
    let offset = -1
    for (let index = 0; index < occurrence; index += 1) offset = buffer.indexOf(Buffer.from(type), offset + 1)
    return offset
}

async function run() {
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-mp4-inspector-"))
const target = path.join(temporary, "sample.mp4")
try {
    const encoded = spawnSync(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1",
        "-f", "lavfi", "-i", "color=c=0x336699:s=64x64:r=24:d=1",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-threads:v", "1", "-pix_fmt", "yuv420p", "-bf", "0",
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
        "-movflags", "+faststart", "-video_track_timescale", "24000", "-map_metadata", "-1", "-y", target,
    ], { encoding: "utf8", timeout: 30_000 })
    assert.equal(encoded.status, 0, encoded.stderr)
    const expected = { width: 64, height: 64, fps: 24, frameCount: 24, audioFrameCount: 48_000 }
    const inspected = await inspectMp4File(target, expected)
    assert.equal(inspected.fastStart, true)
    assert.deepEqual(inspected.video, { codec: "avc1", width: 64, height: 64, sampleCount: 24, fps: 24, colour: "bt709-limited" })
    assert.deepEqual({ codec: inspected.audio.codec, sampleRate: inspected.audio.sampleRate, channels: inspected.audio.channels, durationFrames: inspected.audio.durationFrames }, { codec: "mp4a", sampleRate: 48_000, channels: 2, durationFrames: 48_000 })
    assert.ok(inspected.audio.packetCount > 0)
    assert.match(inspected.sha256, /^[a-f0-9]{64}$/)

    const truncated = path.join(temporary, "truncated.mp4")
    const bytes = fs.readFileSync(target)
    fs.writeFileSync(truncated, bytes.subarray(0, Math.floor(bytes.length / 2)))
    await assert.rejects(inspectMp4File(truncated, expected), (error) => error instanceof HostPortError && error.code === "verification_failed")
    await assert.rejects(inspectMp4File(target, { ...expected, width: 66 }), (error) => error instanceof HostPortError && error.code === "verification_failed")

    const oversizedFileType = path.join(temporary, "oversized-file-type.mp4")
    const fileTypePadding = Buffer.alloc(1024 * 1024)
    const oversizedFileTypeBytes = Buffer.concat([bytes.subarray(0, 32), fileTypePadding, bytes.subarray(32)])
    oversizedFileTypeBytes.writeUInt32BE(32 + fileTypePadding.length, 0)
    fs.writeFileSync(oversizedFileType, oversizedFileTypeBytes)
    await assert.rejects(inspectMp4File(oversizedFileType, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "ftyp must stay at the exact 32-byte canonical allocation bound")

    const forgedTable = path.join(temporary, "forged-table.mp4")
    const forgedBytes = Buffer.from(bytes)
    const sampleTable = forgedBytes.indexOf(Buffer.from("stsz"))
    assert.ok(sampleTable > 0)
    forgedBytes.writeUInt32BE(0, sampleTable + 12)
    fs.writeFileSync(forgedTable, forgedBytes)
    await assert.rejects(inspectMp4File(forgedTable, expected), (error) => error instanceof HostPortError && error.code === "verification_failed")

    const forgedDecoderConfig = path.join(temporary, "forged-decoder-config.mp4")
    const forgedDecoderConfigBytes = Buffer.from(bytes)
    const decoderConfigType = forgedDecoderConfigBytes.indexOf(Buffer.from("avcC"))
    assert.ok(decoderConfigType > 0)
    forgedDecoderConfigBytes[decoderConfigType + 5] = 110
    forgedDecoderConfigBytes[decoderConfigType + 7] = 62
    fs.writeFileSync(forgedDecoderConfig, forgedDecoderConfigBytes)
    await assert.rejects(inspectMp4File(forgedDecoderConfig, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "avcC decoder-selection metadata must match every H.264 SPS")

    const badBrands = path.join(temporary, "bad-brands.mp4")
    const badBrandBytes = Buffer.from(bytes)
    badBrandBytes.write("zzzz", 8, "ascii")
    fs.writeFileSync(badBrands, badBrandBytes)
    await assert.rejects(inspectMp4File(badBrands, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "verified H.264 must advertise portable ISO/AVC brands")

    const zeroTrackId = path.join(temporary, "zero-track-id.mp4")
    const zeroTrackIdBytes = Buffer.from(bytes)
    const videoTrackHeaderType = zeroTrackIdBytes.indexOf(Buffer.from("tkhd"))
    assert.ok(videoTrackHeaderType > 0)
    zeroTrackIdBytes.writeUInt32BE(0, videoTrackHeaderType + 16)
    fs.writeFileSync(zeroTrackId, zeroTrackIdBytes)
    await assert.rejects(inspectMp4File(zeroTrackId, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "track identities must remain canonical and unique")

    const externalDataReference = path.join(temporary, "external-data-reference.mp4")
    const externalDataReferenceBytes = Buffer.from(bytes)
    const videoSampleType = externalDataReferenceBytes.indexOf(Buffer.from("avc1"))
    assert.ok(videoSampleType > 0)
    externalDataReferenceBytes.writeUInt16BE(0, videoSampleType + 10)
    fs.writeFileSync(externalDataReference, externalDataReferenceBytes)
    await assert.rejects(inspectMp4File(externalDataReference, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "sample entries must use the canonical self-contained data reference")

    const forgedSbr = path.join(temporary, "forged-sbr.mp4")
    const forgedSbrBytes = Buffer.from(bytes)
    const audioSpecificConfig = forgedSbrBytes.indexOf(Buffer.from([0x11, 0x90, 0x56, 0xe5, 0x00]))
    assert.ok(audioSpecificConfig > 0)
    forgedSbrBytes[audioSpecificConfig + 4] = 0x80
    fs.writeFileSync(forgedSbr, forgedSbrBytes)
    await assert.rejects(inspectMp4File(forgedSbr, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "AAC sync extensions must not silently enable SBR or change the playback rate")

    const cleanAperture = path.join(temporary, "clean-aperture.mp4")
    const cleanApertureBytes = Buffer.from(bytes)
    const avc1Type = cleanApertureBytes.indexOf(Buffer.from("avc1"))
    const insertion = avc1Type - 4 + cleanApertureBytes.readUInt32BE(avc1Type - 4)
    const apertureBox = Buffer.alloc(8)
    apertureBox.writeUInt32BE(8, 0)
    apertureBox.write("clap", 4, "ascii")
    const apertureForgery = Buffer.concat([cleanApertureBytes.subarray(0, insertion), apertureBox, cleanApertureBytes.subarray(insertion)])
    for (const type of ["avc1", "stsd", "stbl", "minf", "mdia", "trak", "moov"]) {
        const typeOffset = cleanApertureBytes.indexOf(Buffer.from(type))
        assert.ok(typeOffset > 0 && typeOffset < insertion)
        apertureForgery.writeUInt32BE(cleanApertureBytes.readUInt32BE(typeOffset - 4) + apertureBox.length, typeOffset - 4)
    }
    fs.writeFileSync(cleanAperture, apertureForgery)
    await assert.rejects(inspectMp4File(cleanAperture, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "clean-aperture metadata must not crop the verified Project canvas")

    const bFrameTrack = path.join(temporary, "b-frame-composition.mp4")
    const bFrameEncoded = spawnSync(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1",
        "-f", "lavfi", "-i", "color=c=0x336699:s=64x64:r=24:d=1",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-threads:v", "1", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
        "-movflags", "+faststart", "-video_track_timescale", "24000", "-map_metadata", "-1", "-y", bFrameTrack,
    ], { encoding: "utf8", timeout: 30_000 })
    assert.equal(bFrameEncoded.status, 0, bFrameEncoded.stderr)
    assert.ok(fs.readFileSync(bFrameTrack).indexOf(Buffer.from("ctts")) > 0)
    await assert.rejects(inspectMp4File(bFrameTrack, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "B-frame composition timestamps are outside the pinned monotonic Project clock")

    const missingFirstSync = path.join(temporary, "missing-first-sync.mp4")
    const missingFirstSyncBytes = Buffer.from(bytes)
    const syncTable = missingFirstSyncBytes.indexOf(Buffer.from("stss"))
    assert.ok(syncTable > 0 && missingFirstSyncBytes.readUInt32BE(syncTable + 8) >= 1)
    missingFirstSyncBytes.writeUInt32BE(2, syncTable + 12)
    fs.writeFileSync(missingFirstSync, missingFirstSyncBytes)
    await assert.rejects(inspectMp4File(missingFirstSync, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "sample one must remain a declared sync frame for start and scrub playback")

    const transformedTrack = path.join(temporary, "transformed-track.mp4")
    const transformedBytes = Buffer.from(bytes)
    const transformedTrackType = transformedBytes.indexOf(Buffer.from("tkhd"))
    assert.ok(transformedTrackType > 0)
    transformedBytes.writeInt32BE(0, transformedTrackType + 44)
    fs.writeFileSync(transformedTrack, transformedBytes)
    await assert.rejects(inspectMp4File(transformedTrack, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "a transformed display matrix must not impersonate the Project canvas")

    const mutedTrack = path.join(temporary, "muted-track.mp4")
    const mutedTrackBytes = Buffer.from(bytes)
    const firstTrackType = mutedTrackBytes.indexOf(Buffer.from("tkhd"))
    const secondTrackType = mutedTrackBytes.indexOf(Buffer.from("tkhd"), firstTrackType + 4)
    assert.ok(secondTrackType > firstTrackType)
    const audioTrackStart = secondTrackType - 4
    const audioTrackEnd = audioTrackStart + mutedTrackBytes.readUInt32BE(audioTrackStart)
    mutedTrackBytes.writeUInt16BE(0, audioTrackEnd - 48)
    fs.writeFileSync(mutedTrack, mutedTrackBytes)
    await assert.rejects(inspectMp4File(mutedTrack, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "a muted audio track header must not pass exact-audio verification")

    for (const [name, type, mutationOffset, message] of [
        ["panned-audio.mp4", "smhd", 8, "a panned sound header must not pass exact-audio verification"],
        ["transformed-video-header.mp4", "vmhd", 8, "a non-copy video graphics mode must not pass exact-video verification"],
    ]) {
        const mutated = Buffer.from(bytes)
        const typeOffset = mutated.indexOf(Buffer.from(type))
        assert.ok(typeOffset > 0)
        mutated.writeUInt16BE(0x0100, typeOffset + mutationOffset)
        const targetPath = path.join(temporary, name)
        fs.writeFileSync(targetPath, mutated)
        await assert.rejects(inspectMp4File(targetPath, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", message)
    }

    const alteredMovieRate = path.join(temporary, "altered-movie-rate.mp4")
    const alteredMovieRateBytes = Buffer.from(bytes)
    const movieHeaderType = alteredMovieRateBytes.indexOf(Buffer.from("mvhd"))
    assert.ok(movieHeaderType > 0)
    alteredMovieRateBytes.writeInt32BE(0x00020000, movieHeaderType + 24)
    fs.writeFileSync(alteredMovieRate, alteredMovieRateBytes)
    await assert.rejects(inspectMp4File(alteredMovieRate, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "movie presentation rate must remain canonical")

    const zeroMovieClock = path.join(temporary, "zero-movie-clock.mp4")
    const zeroMovieClockBytes = Buffer.from(bytes)
    zeroMovieClockBytes.writeUInt32BE(0, movieHeaderType + 16)
    zeroMovieClockBytes.writeUInt32BE(0, movieHeaderType + 20)
    let searchOffset = 0
    while ((searchOffset = zeroMovieClockBytes.indexOf(Buffer.from("tkhd"), searchOffset)) > 0) {
        zeroMovieClockBytes.writeUInt32BE(0, searchOffset + 24)
        searchOffset += 4
    }
    searchOffset = 0
    while ((searchOffset = zeroMovieClockBytes.indexOf(Buffer.from("elst"), searchOffset)) > 0) {
        zeroMovieClockBytes.writeUInt32BE(0, searchOffset + 12)
        searchOffset += 4
    }
    fs.writeFileSync(zeroMovieClock, zeroMovieClockBytes)
    await assert.rejects(inspectMp4File(zeroMovieClock, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "a zeroed movie clock must never define verified presentation timing")

    const irregularAudio = path.join(temporary, "irregular-audio-clock.mp4")
    const irregularAudioBytes = Buffer.from(bytes)
    const videoTiming = irregularAudioBytes.indexOf(Buffer.from("stts"))
    const audioTiming = irregularAudioBytes.indexOf(Buffer.from("stts"), videoTiming + 4)
    assert.ok(audioTiming > videoTiming && irregularAudioBytes.readUInt32BE(audioTiming + 8) === 2)
    const firstPacketCount = irregularAudioBytes.readUInt32BE(audioTiming + 12)
    const finalPacketCount = irregularAudioBytes.readUInt32BE(audioTiming + 20)
    assert.equal(finalPacketCount, 1)
    irregularAudioBytes.writeUInt32BE(irregularAudioBytes.readUInt32BE(audioTiming + 16) + 1, audioTiming + 16)
    irregularAudioBytes.writeUInt32BE(irregularAudioBytes.readUInt32BE(audioTiming + 24) - firstPacketCount, audioTiming + 24)
    fs.writeFileSync(irregularAudio, irregularAudioBytes)
    await assert.rejects(inspectMp4File(irregularAudio, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "irregular AAC packet timing must not preserve an exact-audio claim")

    const audioComposition = path.join(temporary, "audio-composition.mp4")
    const audioCompositionBytes = Buffer.from(bytes)
    const movie = nthBoxType(audioCompositionBytes, "moov", 1)
    const audioTrack = nthBoxType(audioCompositionBytes, "trak", 2)
    const audioMedia = nthBoxType(audioCompositionBytes, "mdia", 2)
    const audioMediaInfo = nthBoxType(audioCompositionBytes, "minf", 2)
    const audioSampleTable = nthBoxType(audioCompositionBytes, "stbl", 2)
    const audioChunkOffsets = nthBoxType(audioCompositionBytes, "stco", 2)
    const audioSampleSizes = nthBoxType(audioCompositionBytes, "stsz", 2)
    const audioPackets = audioCompositionBytes.readUInt32BE(audioSampleSizes + 12)
    assert.equal(audioPackets, 48)
    const compositionBytes = 16 + audioPackets * 8
    const compositionBox = Buffer.alloc(compositionBytes)
    compositionBox.writeUInt32BE(compositionBytes, 0)
    compositionBox.write("ctts", 4, "ascii")
    compositionBox[8] = 1
    compositionBox.writeUInt32BE(audioPackets, 12)
    for (let index = 0; index < audioPackets; index += 1) {
        compositionBox.writeUInt32BE(1, 16 + index * 8)
        compositionBox.writeInt32BE(index === 10 ? 1_024 : index === 11 ? -1_024 : 0, 20 + index * 8)
    }
    for (const typeOffset of [movie, audioTrack, audioMedia, audioMediaInfo, audioSampleTable]) {
        assert.ok(typeOffset > 0 && typeOffset < audioChunkOffsets)
        audioCompositionBytes.writeUInt32BE(audioCompositionBytes.readUInt32BE(typeOffset - 4) + compositionBytes, typeOffset - 4)
    }
    const audioCompositionForgery = Buffer.concat([audioCompositionBytes.subarray(0, audioChunkOffsets - 4), compositionBox, audioCompositionBytes.subarray(audioChunkOffsets - 4)])
    let chunkTable = -1
    while ((chunkTable = audioCompositionForgery.indexOf(Buffer.from("stco"), chunkTable + 1)) >= 0) {
        const count = audioCompositionForgery.readUInt32BE(chunkTable + 8)
        for (let index = 0; index < count; index += 1) {
            audioCompositionForgery.writeUInt32BE(audioCompositionForgery.readUInt32BE(chunkTable + 12 + index * 4) + compositionBytes, chunkTable + 12 + index * 4)
        }
    }
    fs.writeFileSync(audioComposition, audioCompositionForgery)
    await assert.rejects(inspectMp4File(audioComposition, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "AAC composition timestamps must not reorder the exact Project audio clock")

    const hiddenAudio = path.join(temporary, "hidden-audio-source.mp4")
    const hiddenAudioEncoded = spawnSync(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1",
        "-f", "lavfi", "-i", "color=c=0x336699:s=64x64:r=24:d=1",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-threads:v", "1", "-pix_fmt", "yuv420p", "-bf", "0",
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
        "-movflags", "+faststart", "-video_track_timescale", "24000", "-map_metadata", "-1", "-y", hiddenAudio,
    ], { encoding: "utf8", timeout: 30_000 })
    assert.equal(hiddenAudioEncoded.status, 0, hiddenAudioEncoded.stderr)
    const hiddenAudioBytes = fs.readFileSync(hiddenAudio)
    const hiddenMovieHeader = nthBoxType(hiddenAudioBytes, "mvhd", 1)
    const hiddenAudioTrackHeader = nthBoxType(hiddenAudioBytes, "tkhd", 2)
    const hiddenAudioEdit = nthBoxType(hiddenAudioBytes, "elst", 2)
    assert.equal(hiddenAudioBytes.readUInt32BE(hiddenMovieHeader + 20), 2_000)
    assert.equal(hiddenAudioBytes.readUInt32BE(hiddenAudioTrackHeader + 24), 2_000)
    assert.equal(hiddenAudioBytes.readUInt32BE(hiddenAudioEdit + 12), 2_000)
    hiddenAudioBytes.writeUInt32BE(1_000, hiddenMovieHeader + 20)
    hiddenAudioBytes.writeUInt32BE(1_000, hiddenAudioTrackHeader + 24)
    hiddenAudioBytes.writeUInt32BE(1_000, hiddenAudioEdit + 12)
    const hiddenAudioForgery = path.join(temporary, "hidden-audio-forgery.mp4")
    fs.writeFileSync(hiddenAudioForgery, hiddenAudioBytes)
    await assert.rejects(inspectMp4File(hiddenAudioForgery, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "an edited one-second story must not retain a hidden second of AAC media")

    const tinyBoxes = path.join(temporary, "tiny-box-bomb.mp4")
    const tinyBoxBytes = Buffer.alloc(65 * 8)
    for (let index = 0; index < 65; index += 1) { tinyBoxBytes.writeUInt32BE(8, index * 8); tinyBoxBytes.write("free", index * 8 + 4) }
    fs.writeFileSync(tinyBoxes, tinyBoxBytes)
    await assert.rejects(inspectMp4File(tinyBoxes, expected), (error) => error instanceof HostPortError && error.code === "verification_failed")

    const extraTrack = path.join(temporary, "extra-track.mp4")
    const extraEncoded = spawnSync(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1",
        "-f", "lavfi", "-i", "color=c=0x336699:s=64x64:r=24:d=1",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
        "-map", "0:v:0", "-map", "1:a:0", "-map", "1:a:0", "-c:v", "libx264", "-threads:v", "1", "-pix_fmt", "yuv420p", "-bf", "0",
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
        "-movflags", "+faststart", "-video_track_timescale", "24000", "-map_metadata", "-1", "-y", extraTrack,
    ], { encoding: "utf8", timeout: 30_000 })
    assert.equal(extraEncoded.status, 0, extraEncoded.stderr)
    await assert.rejects(inspectMp4File(extraTrack, expected), (error) => error instanceof HostPortError && error.code === "verification_failed")

    const offsetTrack = path.join(temporary, "offset-track.mp4")
    const offsetEncoded = spawnSync(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1", "-itsoffset", "1",
        "-f", "lavfi", "-i", "color=c=0x336699:s=64x64:r=24:d=1",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
        "-map", "0:v:0", "-map", "1:a:0", "-fps_mode", "passthrough", "-c:v", "libx264", "-threads:v", "1", "-pix_fmt", "yuv420p", "-bf", "0",
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
        "-movflags", "+faststart", "-video_track_timescale", "24000", "-map_metadata", "-1", "-y", offsetTrack,
    ], { encoding: "utf8", timeout: 30_000 })
    assert.equal(offsetEncoded.status, 0, offsetEncoded.stderr)
    await assert.rejects(inspectMp4File(offsetTrack, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "a delayed video edit must not impersonate the one-second Project clock")

    const irregularTrack = path.join(temporary, "irregular-cadence.mp4")
    const irregularEncoded = spawnSync(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1",
        "-f", "lavfi", "-i", "color=c=0x336699:s=64x64:r=24:d=1",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
        "-vf", "settb=expr=1/24000,setpts=N*1000-if(mod(N\\,2)\\,500\\,0)",
        "-map", "0:v:0", "-map", "1:a:0", "-fps_mode", "passthrough", "-c:v", "libx264", "-threads:v", "1", "-pix_fmt", "yuv420p", "-bf", "0",
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
        "-movflags", "+faststart", "-video_track_timescale", "24000", "-map_metadata", "-1", "-y", irregularTrack,
    ], { encoding: "utf8", timeout: 30_000 })
    assert.equal(irregularEncoded.status, 0, irregularEncoded.stderr)
    await assert.rejects(inspectMp4File(irregularTrack, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "variable sample cadence must not impersonate CFR")

    const swappedSource = path.join(temporary, "swapped-source.mp4")
    const swappedEncoded = spawnSync(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1",
        "-f", "lavfi", "-i", "color=c=0x336699:s=128x64:r=24:d=1",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-threads:v", "1", "-pix_fmt", "yuv420p", "-bf", "0",
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
        "-movflags", "+faststart", "-video_track_timescale", "24000", "-map_metadata", "-1", "-y", swappedSource,
    ], { encoding: "utf8", timeout: 30_000 })
    assert.equal(swappedEncoded.status, 0, swappedEncoded.stderr)
    const swappedBytes = fs.readFileSync(swappedSource)
    const trackType = swappedBytes.indexOf(Buffer.from("tkhd"))
    const sampleType = swappedBytes.indexOf(Buffer.from("avc1"))
    assert.ok(trackType > 4 && sampleType > 4)
    const trackStart = trackType - 4
    const trackEnd = trackStart + swappedBytes.readUInt32BE(trackStart)
    swappedBytes.writeUInt32BE(64 * 65_536, trackEnd - 8)
    swappedBytes.writeUInt32BE(128 * 65_536, trackEnd - 4)
    swappedBytes.writeUInt16BE(64, sampleType + 28)
    swappedBytes.writeUInt16BE(128, sampleType + 30)
    const swappedForgery = path.join(temporary, "swapped-forgery.mp4")
    fs.writeFileSync(swappedForgery, swappedBytes)
    await assert.rejects(inspectMp4File(swappedForgery, { ...expected, width: 64, height: 128 }), (error) => error instanceof HostPortError && error.code === "verification_failed", "forged container dimensions must not hide the H.264 SPS dimensions")

    const bt601Source = path.join(temporary, "bt601-source.mp4")
    const bt601Encoded = spawnSync(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1",
        "-f", "lavfi", "-i", "color=c=0x336699:s=64x64:r=24:d=1",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-threads:v", "1", "-pix_fmt", "yuv420p", "-bf", "0", "-c:a", "aac", "-ar", "48000", "-ac", "2",
        "-color_primaries", "smpte170m", "-color_trc", "smpte170m", "-colorspace", "smpte170m", "-color_range", "tv",
        "-movflags", "+faststart", "-video_track_timescale", "24000", "-map_metadata", "-1", "-y", bt601Source,
    ], { encoding: "utf8", timeout: 30_000 })
    assert.equal(bt601Encoded.status, 0, bt601Encoded.stderr)
    const bt601Bytes = fs.readFileSync(bt601Source)
    const containerColour = bt601Bytes.indexOf(Buffer.from("nclx"))
    assert.ok(containerColour > 0)
    bt601Bytes.writeUInt16BE(1, containerColour + 4)
    bt601Bytes.writeUInt16BE(1, containerColour + 6)
    bt601Bytes.writeUInt16BE(1, containerColour + 8)
    const forgedBt709 = path.join(temporary, "forged-bt709.mp4")
    fs.writeFileSync(forgedBt709, bt601Bytes)
    await assert.rejects(inspectMp4File(forgedBt709, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "BT.709 container tags must not hide BT.601 H.264 VUI")

    const nonSquareSource = path.join(temporary, "non-square-source.mp4")
    const nonSquareEncoded = spawnSync(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1",
        "-f", "lavfi", "-i", "color=c=0x336699:s=64x64:r=24:d=1",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
        "-vf", "setsar=2/1", "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-threads:v", "1", "-pix_fmt", "yuv420p", "-bf", "0",
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
        "-movflags", "+faststart", "-video_track_timescale", "24000", "-map_metadata", "-1", "-y", nonSquareSource,
    ], { encoding: "utf8", timeout: 30_000 })
    assert.equal(nonSquareEncoded.status, 0, nonSquareEncoded.stderr)
    const nonSquareBytes = fs.readFileSync(nonSquareSource)
    const nonSquareTrackType = nonSquareBytes.indexOf(Buffer.from("tkhd"))
    assert.ok(nonSquareTrackType > 0)
    const nonSquareTrackStart = nonSquareTrackType - 4
    const nonSquareTrackEnd = nonSquareTrackStart + nonSquareBytes.readUInt32BE(nonSquareTrackStart)
    nonSquareBytes.writeUInt32BE(64 * 65_536, nonSquareTrackEnd - 8)
    const forgedSquareDisplay = path.join(temporary, "forged-square-display.mp4")
    fs.writeFileSync(forgedSquareDisplay, nonSquareBytes)
    await assert.rejects(inspectMp4File(forgedSquareDisplay, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "container display geometry must not hide non-square H.264 pixels")

    const yuv444Source = path.join(temporary, "yuv444-source.mp4")
    const yuv444Encoded = spawnSync(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1",
        "-f", "lavfi", "-i", "color=c=0x336699:s=64x64:r=24:d=1",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-threads:v", "1", "-pix_fmt", "yuv444p", "-bf", "0",
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
        "-movflags", "+faststart", "-video_track_timescale", "24000", "-map_metadata", "-1", "-y", yuv444Source,
    ], { encoding: "utf8", timeout: 30_000 })
    assert.equal(yuv444Encoded.status, 0, yuv444Encoded.stderr)
    await assert.rejects(inspectMp4File(yuv444Source, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "verified compatibility must require 8-bit 4:2:0 H.264")

    const interlacedSource = path.join(temporary, "interlaced-source.mp4")
    const interlacedEncoded = spawnSync(ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1",
        "-f", "lavfi", "-i", "color=c=0x336699:s=64x64:r=24:d=1",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-threads:v", "1", "-pix_fmt", "yuv420p", "-bf", "0", "-flags:v", "+ilme+ildct", "-x264-params", "tff=1:bframes=0",
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
        "-movflags", "+faststart", "-video_track_timescale", "24000", "-map_metadata", "-1", "-y", interlacedSource,
    ], { encoding: "utf8", timeout: 30_000 })
    assert.equal(interlacedEncoded.status, 0, interlacedEncoded.stderr)
    await assert.rejects(inspectMp4File(interlacedSource, expected), (error) => error instanceof HostPortError && error.code === "verification_failed", "verified playback must require progressive H.264")
} finally {
    fs.rmSync(temporary, { recursive: true, force: true })
}

console.log("Verified: G06B bounded hierarchical fast-start MP4 structure, H.264/AAC format, BT.709, dimensions, frame rate, and exact presentation clocks.")
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
