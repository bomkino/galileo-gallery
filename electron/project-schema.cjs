const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const PROJECT_FORMAT = "galileo-gallery-project"
const PRODUCT_ID = "galileo-gallery"
const PROJECT_SCHEMA_VERSION = 2
const ENGINE_VERSION = 1
const CANVAS_PRESET_DIMENSIONS = Object.freeze({
    fullHD: Object.freeze([1920, 1080]),
    fourK: Object.freeze([3840, 2160]),
    square: Object.freeze([1080, 1080]),
    portrait: Object.freeze([1080, 1350]),
    vertical: Object.freeze([1080, 1920]),
    presentation: Object.freeze([1920, 1200]),
    cinema: Object.freeze([2560, 1080]),
})

const SUPPORTED_SCENE_VERSIONS = Object.freeze({
    "opening-reel": Object.freeze([1]),
    "swipe-stack": Object.freeze([1]),
    "the-stack": Object.freeze([1]),
    "hero-deck-object": Object.freeze([1]),
    "spiral-image-vortex": Object.freeze([1]),
    vitrine: Object.freeze([1, 2]),
    "filmstrip-river": Object.freeze([1]),
    "wave-ticker": Object.freeze([1]),
    "deck-contact-strip": Object.freeze([1]),
    "contact-sheet": Object.freeze([1]),
    "light-table": Object.freeze([1]),
    "deck-river": Object.freeze([1]),
    "deck-river-loader": Object.freeze([1]),
    "orbit-ring": Object.freeze([1]),
    "proximity-orbit": Object.freeze([1]),
    "spin-image-orbit": Object.freeze([1]),
    zoetrope: Object.freeze([1]),
    "the-shelf": Object.freeze([2]),
    "before-after-slider": Object.freeze([1]),
    "slide-fan": Object.freeze([1]),
    "dealers-fan": Object.freeze([1]),
    "slide-anatomy-object": Object.freeze([1]),
    "the-build": Object.freeze([1]),
    "coverflow-gallery": Object.freeze([1]),
    "drift-deck": Object.freeze([1]),
    "image-scatter-gallery": Object.freeze([1]),
    "the-orrery": Object.freeze([1]),
    "the-hang": Object.freeze([1]),
    "cms-slideshow": Object.freeze([1]),
    "quiet-carousel": Object.freeze([1]),
})

const CANVAS_KEYS = [
    "canvasPreset", "canvasWidth", "canvasHeight", "ratioMode", "fixedRatio", "customRatioWidth", "customRatioHeight",
    "paddingUnit", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
]
const SCENE_PARAMETER_KEYS = [
    "imageFit", "autoplayVideos", "loopVideos", "captionGap", "motionPreset", "canvasPose",
    "spotlightsEnabled", "finaleEnabled", "heroSize", "finaleSize", "centerBump", "tilt", "sway",
    "idleDim", "idleMute", "spotlightDim", "speedBlur", "slideHeight", "gap", "cornerStyle",
    "cornerSmoothing", "radius", "shadow", "gridSize", "gridStrength", "gridDrift", "vignette", "showHint",
]
const LOOK_PARAMETER_KEYS = [
    "theme", "ground", "paper", "backgroundStyle", "backgroundColor2", "backgroundAngle", "backgroundTexture",
]
const TIMELINE_KEYS = [
    "mode", "fixedDurationMs", "segments", "playKind", "repeatCount", "axis", "direction", "startMode", "launchMs", "arrivalMs", "growMs",
    "exitMs", "paceMs", "leadInMs", "holdMs", "finaleGrowMs", "finaleHoldMs", "fadeMs",
]
const VITRINE_V2_TIMELINE_KEYS = [...TIMELINE_KEYS, "transitionDirection"]
const FRAME_KEYS = ["ratio", "aspectMode", "ratioW", "ratioH", "caption", "spotlight", "muted"]
const FRAME_INTENT_KEYS = [...FRAME_KEYS, "fit", "crop", "focal"]

function timelineKeysFor(sceneId, sceneVersion) {
    return sceneId === "vitrine" && sceneVersion === 2 ? VITRINE_V2_TIMELINE_KEYS : TIMELINE_KEYS
}

class ProjectSchemaError extends Error {
    constructor(code, message) {
        super(message)
        this.name = "ProjectSchemaError"
        this.code = code
    }
}

function fail(code, message) {
    throw new ProjectSchemaError(code, message)
}

function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
}

function record(value, code, label) {
    if (!isRecord(value)) fail(code, `${label} must be an object.`)
    return value
}

function exactKeys(value, keys, code, label) {
    const actual = Object.keys(record(value, code, label)).sort()
    const expected = [...keys].sort()
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
        fail(code, `${label} has missing or unsupported fields.`)
    }
}

function hasExactKeys(value, keys) {
    if (!isRecord(value)) return false
    const actual = Object.keys(value).sort()
    const expected = [...keys].sort()
    return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function stringValue(value, code, label, { values, pattern, max = 512, allowEmpty = false } = {}) {
    if (typeof value !== "string" || (!allowEmpty && value.length === 0) || value.length > max) {
        fail(code, `${label} is invalid.`)
    }
    if (values && !values.includes(value)) fail(code, `${label} is unsupported.`)
    if (pattern && !pattern.test(value)) fail(code, `${label} is invalid.`)
    return value
}

function numberValue(value, code, label, min, max, integer = false) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
        fail(code, `${label} is outside the supported range.`)
    }
    return value
}

function booleanValue(value, code, label) {
    if (typeof value !== "boolean") fail(code, `${label} must be true or false.`)
    return value
}

function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize)
    if (!isRecord(value)) return value
    return Object.keys(value).sort().reduce((result, key) => {
        result[key] = canonicalize(value[key])
        return result
    }, {})
}

function canonicalProjectJSON(project) {
    return `${JSON.stringify(canonicalize(project), null, 2)}\n`
}

function signatureForBytes(bytes) {
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "png"
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg"
    if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "gif"
    if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp"
    if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from("1a45dfa3", "hex"))) return "webm"
    if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
        const brand = bytes.subarray(8, 12).toString("ascii")
        return ["avif", "avis"].includes(brand) ? "avif" : "iso-media"
    }
    return null
}

function signatureKind(signature) {
    if (["png", "jpeg", "webp", "avif"].includes(signature)) return "image"
    if (["gif", "webm", "iso-media"].includes(signature)) return "video"
    return null
}

function extensionForSignature(signature) {
    return {
        png: ".png",
        jpeg: ".jpg",
        gif: ".gif",
        webp: ".webp",
        avif: ".avif",
        webm: ".webm",
        "iso-media": ".mp4",
    }[signature]
}

function inspectMediaFile(filePath, signal) {
    if (signal?.aborted) fail("cancelled", "Project opening cancelled.")
    let stat
    try {
        stat = fs.statSync(filePath)
    } catch (error) {
        if (error?.code === "ENOENT") fail("media_missing", "A declared media source is missing.")
        throw error
    }
    if (!stat.isFile()) fail("media_missing", "A declared media source is missing.")
    const handle = fs.openSync(filePath, "r")
    const header = Buffer.alloc(32)
    let headerBytes = 0
    try {
        headerBytes = fs.readSync(handle, header, 0, header.length, 0)
    } finally {
        fs.closeSync(handle)
    }
    const signature = signatureForBytes(header.subarray(0, headerBytes))
    if (!signature) fail("media_signature_mismatch", "A media file has an unsupported signature.")
    const hash = crypto.createHash("sha256")
    const input = fs.createReadStream(filePath, { signal })
    return new Promise((resolve, reject) => {
        input.on("data", (chunk) => hash.update(chunk))
        input.once("error", (error) => reject(error?.name === "AbortError" ? new ProjectSchemaError("cancelled", "Project opening cancelled.") : error))
        input.once("end", () => resolve({ bytes: stat.size, sha256: hash.digest("hex"), signature }))
    })
}

function inspectAudioFile(filePath, signal) {
    if (signal?.aborted) fail("cancelled", "Project opening cancelled.")
    let stat
    try {
        stat = fs.statSync(filePath)
    } catch (error) {
        if (error?.code === "ENOENT") fail("media_missing", "A declared audio source is missing.")
        throw error
    }
    if (!stat.isFile() || stat.size < 46 || stat.size > 4_000_000_000) fail("media_signature_mismatch", "An audio source is not a supported PCM WAV file.")
    const handle = fs.openSync(filePath, "r")
    const header = Buffer.alloc(44)
    try {
        if (fs.readSync(handle, header, 0, header.length, 0) !== header.length) fail("media_signature_mismatch", "An audio source header is incomplete.")
    } finally {
        fs.closeSync(handle)
    }
    const channels = header.readUInt16LE(22)
    const sampleRate = header.readUInt32LE(24)
    const dataBytes = header.readUInt32LE(40)
    if (header.subarray(0, 4).toString("ascii") !== "RIFF"
        || header.readUInt32LE(4) !== stat.size - 8
        || header.subarray(8, 12).toString("ascii") !== "WAVE"
        || header.subarray(12, 16).toString("ascii") !== "fmt "
        || header.readUInt32LE(16) !== 16
        || header.readUInt16LE(20) !== 1
        || ![1, 2].includes(channels)
        || sampleRate < 8_000 || sampleRate > 192_000
        || header.readUInt32LE(28) !== sampleRate * channels * 2
        || header.readUInt16LE(32) !== channels * 2
        || header.readUInt16LE(34) !== 16
        || header.subarray(36, 40).toString("ascii") !== "data"
        || dataBytes !== stat.size - 44
        || dataBytes % (channels * 2) !== 0
        || dataBytes === 0) {
        fail("media_signature_mismatch", "An audio source is not a canonical PCM16 WAV file.")
    }
    const hash = crypto.createHash("sha256")
    const input = fs.createReadStream(filePath, { signal })
    return new Promise((resolve, reject) => {
        input.on("data", (chunk) => hash.update(chunk))
        input.once("error", (error) => reject(error?.name === "AbortError" ? new ProjectSchemaError("cancelled", "Project opening cancelled.") : error))
        input.once("end", () => resolve({
            bytes: stat.size,
            sha256: hash.digest("hex"),
            signature: "wav-pcm16",
            sampleRate,
            channels,
            sampleFrames: dataBytes / (channels * 2),
        }))
    })
}

function settingsSubset(settings, keys) {
    return Object.fromEntries(keys.map((key) => [key, settings[key]]))
}

function defaultAudioIntent() {
    return {
        id: "gallery-audio-intent",
        version: 1,
        sourceVideo: "per-media",
        sampleRate: 48_000,
        channels: 2,
        sources: [],
        lanes: [],
        ducking: {
            enabled: false,
            triggerLaneId: "presenter",
            targetLaneIds: [],
            amount: 0.5,
            attack: { numerator: 1, denominator: 20 },
            release: { numerator: 1, denominator: 5 },
        },
        master: { gain: 1, muted: false },
    }
}

function portableProjectFromConfig(config, media, audioAssets = []) {
    if (!isRecord(config) || !Array.isArray(config.items) || !isRecord(config.settings) || media.length !== config.items.length) {
        fail("manifest_invalid", "The current Project cannot be serialized safely.")
    }
    const audio = config.audio ?? defaultAudioIntent()
    const assetsById = new Map(audioAssets.map((entry) => [entry.id, entry]))
    const project = {
        format: PROJECT_FORMAT,
        product: PRODUCT_ID,
        schemaVersion: PROJECT_SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        media: config.items.map((item, index) => ({
            id: item.id,
            name: item.name,
            kind: item.type,
            archivePath: media[index].archivePath,
            bytes: media[index].bytes,
            sha256: media[index].sha256,
            signature: media[index].signature,
            frame: {
                ratio: item.ratio,
                aspectMode: item.aspectMode ?? "auto",
                ratioW: item.ratioW ?? 16,
                ratioH: item.ratioH ?? 9,
                fit: item.fit ?? (config.styleId === "vitrine" && (config.sceneVersion ?? 1) === 2 ? "contain" : config.settings.imageFit),
                crop: item.crop ?? { x: 0, y: 0, width: 1, height: 1 },
                focal: item.focal ?? { x: 0.5, y: 0.5 },
                caption: item.caption ?? "",
                spotlight: item.spotlight,
                muted: item.muted,
            },
        })),
        canvas: settingsSubset(config.settings, CANVAS_KEYS),
        scene: {
            id: config.styleId,
            version: config.sceneVersion ?? 1,
            parameters: settingsSubset(config.settings, SCENE_PARAMETER_KEYS),
        },
        look: {
            id: `gallery-look.${config.settings.backgroundStyle}`,
            version: 1,
            parameters: settingsSubset(config.settings, LOOK_PARAMETER_KEYS),
        },
        timeline: {
            mode: config.timelineMode ?? "automatic",
            fixedDurationMs: config.timelineFixedDurationMs ?? 0,
            segments: config.timelineSegments ?? [],
            ...settingsSubset(config.settings, timelineKeysFor(config.styleId, config.sceneVersion ?? 1).filter((key) => !["mode", "fixedDurationMs", "segments"].includes(key))),
        },
        audio: {
            id: audio.id,
            version: audio.version,
            sourceVideo: audio.sourceVideo,
            sampleRate: audio.sampleRate,
            channels: audio.channels,
            sources: audio.sources.map((source) => source.role === "source-video"
                ? {
                    id: source.id,
                    name: source.name ?? source.id,
                    role: source.role,
                    mediaId: source.mediaId,
                    sampleRate: source.sampleRate,
                    channels: source.channels,
                    sampleFrames: source.sampleFrames,
                }
                : {
                    id: source.id,
                    name: source.name ?? source.id,
                    role: source.role,
                    ...(assetsById.get(source.id) ?? {}),
                    sampleRate: source.sampleRate,
                    channels: source.channels,
                    sampleFrames: source.sampleFrames,
                }),
            lanes: audio.lanes.map((lane) => ({
                id: lane.id,
                name: lane.name,
                role: lane.role,
                gain: lane.gain,
                muted: lane.muted,
                solo: lane.solo,
                clips: lane.clips.map((clip) => ({
                    id: clip.id,
                    sourceId: clip.sourceId,
                    timelineStart: clip.timelineStart,
                    sourceIn: clip.sourceIn,
                    sourceSpan: clip.sourceSpan,
                    duration: clip.duration,
                    loop: clip.loop,
                    gain: clip.gain,
                    muted: clip.muted,
                    fadeIn: clip.fadeIn,
                    fadeOut: clip.fadeOut,
                })),
            })),
            ducking: {
                enabled: audio.ducking.enabled,
                triggerLaneId: audio.ducking.triggerLaneId,
                targetLaneIds: audio.ducking.targetLaneIds,
                amount: audio.ducking.amount,
                attack: audio.ducking.attack,
                release: audio.ducking.release,
            },
            master: { gain: audio.master.gain, muted: audio.master.muted },
        },
        exportIntent: { quality: config.settings.exportQuality },
    }
    return validatePortableProject(project)
}

function validateMedia(media) {
    if (!Array.isArray(media) || media.length > 4095) fail("manifest_invalid", "The ordered media table is invalid.")
    const ids = new Set()
    const archivePaths = new Set()
    return media.map((entry, index) => {
        exactKeys(entry, ["id", "name", "kind", "archivePath", "bytes", "sha256", "signature", "frame"], "manifest_invalid", `media[${index}]`)
        stringValue(entry.id, "manifest_invalid", `media[${index}].id`, { pattern: /^[^/\\\u0000-\u001f]+$/, max: 200 })
        if (ids.has(entry.id)) fail("manifest_invalid", "Media identities must be unique.")
        ids.add(entry.id)
        stringValue(entry.name, "manifest_invalid", `media[${index}].name`, { pattern: /^[^/\\\u0000-\u001f]+$/, max: 512 })
        stringValue(entry.kind, "manifest_invalid", `media[${index}].kind`, { values: ["image", "video"] })
        stringValue(entry.signature, "media_signature_mismatch", `media[${index}].signature`, { values: ["png", "jpeg", "gif", "webp", "avif", "webm", "iso-media"] })
        if (signatureKind(entry.signature) !== entry.kind) fail("media_signature_mismatch", "Media kind and signature disagree.")
        stringValue(entry.sha256, "manifest_invalid", `media[${index}].sha256`, { pattern: /^[a-f0-9]{64}$/ })
        const expectedPath = `project/media/${String(index + 1).padStart(4, "0")}-${entry.sha256.slice(0, 16)}${extensionForSignature(entry.signature)}`
        if (entry.archivePath !== expectedPath || archivePaths.has(entry.archivePath)) {
            fail("manifest_invalid", "A media archive path is invalid or duplicated.")
        }
        archivePaths.add(entry.archivePath)
        numberValue(entry.bytes, "manifest_invalid", `media[${index}].bytes`, 1, Number.MAX_SAFE_INTEGER, true)
        if (!hasExactKeys(entry.frame, FRAME_KEYS) && !hasExactKeys(entry.frame, FRAME_INTENT_KEYS)) {
            fail("manifest_invalid", `media[${index}].frame has missing or unsupported fields.`)
        }
        numberValue(entry.frame.ratio, "manifest_invalid", "Frame ratio", 1 / 10_000, 10_000)
        stringValue(entry.frame.aspectMode, "manifest_invalid", "Frame aspect mode", { values: ["auto", "global", "custom"] })
        numberValue(entry.frame.ratioW, "manifest_invalid", "Frame ratio width", 1, 10000)
        numberValue(entry.frame.ratioH, "manifest_invalid", "Frame ratio height", 1, 10000)
        stringValue(entry.frame.caption, "manifest_invalid", "Frame caption", { allowEmpty: true, max: 4000 })
        booleanValue(entry.frame.spotlight, "manifest_invalid", "Frame spotlight")
        booleanValue(entry.frame.muted, "manifest_invalid", "Frame mute")
        if (hasExactKeys(entry.frame, FRAME_INTENT_KEYS)) {
            stringValue(entry.frame.fit, "manifest_invalid", "Frame fit", { values: ["contain", "cover"] })
            exactKeys(entry.frame.crop, ["x", "y", "width", "height"], "manifest_invalid", "Frame crop")
            numberValue(entry.frame.crop.x, "manifest_invalid", "Frame crop x", 0, 1)
            numberValue(entry.frame.crop.y, "manifest_invalid", "Frame crop y", 0, 1)
            numberValue(entry.frame.crop.width, "manifest_invalid", "Frame crop width", 1 / 10_000, 1)
            numberValue(entry.frame.crop.height, "manifest_invalid", "Frame crop height", 1 / 10_000, 1)
            if (entry.frame.crop.x + entry.frame.crop.width > 1 + 1e-12 || entry.frame.crop.y + entry.frame.crop.height > 1 + 1e-12) {
                fail("manifest_invalid", "Frame crop exceeds source bounds.")
            }
            exactKeys(entry.frame.focal, ["x", "y"], "manifest_invalid", "Frame focal point")
            numberValue(entry.frame.focal.x, "manifest_invalid", "Frame focal x", 0, 1)
            numberValue(entry.frame.focal.y, "manifest_invalid", "Frame focal y", 0, 1)
        }
        return entry
    })
}

function validateCanvas(canvas) {
    exactKeys(canvas, CANVAS_KEYS, "canvas_invalid", "Canvas")
    stringValue(canvas.canvasPreset, "canvas_invalid", "Canvas preset", { values: ["fullHD", "fourK", "square", "portrait", "vertical", "presentation", "cinema", "custom"] })
    numberValue(canvas.canvasWidth, "canvas_invalid", "Canvas width", 64, 7680, true)
    numberValue(canvas.canvasHeight, "canvas_invalid", "Canvas height", 64, 7680, true)
    if (canvas.canvasWidth % 2 !== 0 || canvas.canvasHeight % 2 !== 0) fail("canvas_invalid", "Canvas dimensions must be even pixels.")
    const presetDimensions = CANVAS_PRESET_DIMENSIONS[canvas.canvasPreset]
    if (presetDimensions && (canvas.canvasWidth !== presetDimensions[0] || canvas.canvasHeight !== presetDimensions[1])) {
        fail("canvas_invalid", "Canvas preset dimensions do not match the named preset.")
    }
    stringValue(canvas.ratioMode, "canvas_invalid", "Canvas ratio mode", { values: ["auto", "fixed"] })
    stringValue(canvas.fixedRatio, "canvas_invalid", "Fixed ratio", { values: ["sixteenNine", "wide2576", "custom"] })
    numberValue(canvas.customRatioWidth, "canvas_invalid", "Custom ratio width", 1, 10000)
    numberValue(canvas.customRatioHeight, "canvas_invalid", "Custom ratio height", 1, 10000)
    stringValue(canvas.paddingUnit, "canvas_invalid", "Canvas padding unit", { values: ["px", "percent"] })
    for (const key of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) numberValue(canvas[key], "canvas_invalid", key, 0, 4000)
}

function validateScene(scene) {
    exactKeys(scene, ["id", "version", "parameters"], "scene_invalid", "Scene")
    stringValue(scene.id, "scene_invalid", "Scene id", { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, max: 120 })
    numberValue(scene.version, "scene_invalid", "Scene version", 1, 1_000, true)
    if (!Object.hasOwn(SUPPORTED_SCENE_VERSIONS, scene.id)) fail("scene_invalid", "This Project names an unsupported Gallery Scene.")
    const supportedVersions = SUPPORTED_SCENE_VERSIONS[scene.id]
    if (!supportedVersions.includes(scene.version)) {
        if (scene.version > Math.max(...supportedVersions)) fail("future_version_unsupported", "This Scene version was created by a newer Gallery version and cannot be opened here.")
        fail("scene_invalid", "This Gallery Scene version is unsupported.")
    }
    exactKeys(scene.parameters, SCENE_PARAMETER_KEYS, "scene_invalid", "Scene parameters")
    stringValue(scene.parameters.imageFit, "scene_invalid", "Frame fit", { values: ["contain", "cover"] })
    stringValue(scene.parameters.motionPreset, "scene_invalid", "Motion preset", { values: ["cut", "magnetic", "velvet", "dream", "custom"] })
    stringValue(scene.parameters.cornerStyle, "scene_invalid", "Corner style", { values: ["rounded", "squircle"] })
    for (const key of ["autoplayVideos", "loopVideos", "spotlightsEnabled", "finaleEnabled", "showHint"]) booleanValue(scene.parameters[key], "scene_invalid", key)
    for (const key of SCENE_PARAMETER_KEYS.filter((key) => !["imageFit", "motionPreset", "cornerStyle", "autoplayVideos", "loopVideos", "spotlightsEnabled", "finaleEnabled", "showHint"].includes(key))) {
        numberValue(scene.parameters[key], "scene_invalid", key, key === "tilt" ? -360 : 0, 10000)
    }
    if (scene.id === "vitrine" && scene.version === 2) {
        numberValue(scene.parameters.slideHeight, "scene_invalid", "Vitrine presentation scale", 42, 78)
        numberValue(scene.parameters.tilt, "scene_invalid", "Vitrine object turn", 0, 9)
        numberValue(scene.parameters.sway, "scene_invalid", "Vitrine transition depth", 8, 30)
    }
}

function validateLook(look) {
    exactKeys(look, ["id", "version", "parameters"], "look_invalid", "Look")
    stringValue(look.id, "look_invalid", "Look id", { pattern: /^gallery-look\.[a-z-]+$/, max: 120 })
    numberValue(look.version, "look_invalid", "Look version", 1, 1, true)
    exactKeys(look.parameters, LOOK_PARAMETER_KEYS, "look_invalid", "Look parameters")
    stringValue(look.parameters.theme, "look_invalid", "Look theme", { values: ["auto", "dark", "light"] })
    stringValue(look.parameters.ground, "look_invalid", "Look ground", { allowEmpty: true, pattern: /^(?:#[0-9a-fA-F]{6})?$/, max: 7 })
    stringValue(look.parameters.paper, "look_invalid", "Look paper", { allowEmpty: true, pattern: /^(?:#[0-9a-fA-F]{6})?$/, max: 7 })
    stringValue(look.parameters.backgroundStyle, "look_invalid", "Background style", { values: ["solid", "gradient", "halo", "paper", "transparent"] })
    if (look.id !== `gallery-look.${look.parameters.backgroundStyle}`) fail("look_invalid", "Look identity and parameters disagree.")
    stringValue(look.parameters.backgroundColor2, "look_invalid", "Background colour", { pattern: /^#[0-9a-fA-F]{6}$/ })
    numberValue(look.parameters.backgroundAngle, "look_invalid", "Background angle", -3600, 3600)
    numberValue(look.parameters.backgroundTexture, "look_invalid", "Background texture", 0, 100)
}

function validateTimeline(timeline, scene) {
    const timelineKeys = timelineKeysFor(scene.id, scene.version)
    exactKeys(timeline, timelineKeys, "timeline_invalid", "Timeline")
    stringValue(timeline.mode, "timeline_invalid", "Timeline mode", { values: ["automatic", "fixed-duration", "directed"] })
    stringValue(timeline.playKind, "timeline_invalid", "Playback kind", { values: ["once", "repeat", "loop"] })
    if (scene.id === "vitrine" && scene.version === 2 && timeline.playKind !== "loop" && timeline.mode === "directed") {
        fail("timeline_invalid", "Finite Vitrine cannot carry directed segments; use Automatic or Fixed duration.")
    }
    stringValue(timeline.axis, "timeline_invalid", "Timeline axis", { values: ["horizontal", "vertical"] })
    stringValue(timeline.direction, "timeline_invalid", "Timeline direction", { values: ["forward", "reverse"] })
    if (scene.id === "vitrine" && scene.version === 2) stringValue(timeline.transitionDirection, "timeline_invalid", "Vitrine transition direction", { values: ["left", "right"] })
    stringValue(timeline.startMode, "timeline_invalid", "Timeline start mode", { values: ["auto", "click"] })
    numberValue(timeline.fixedDurationMs, "timeline_invalid", "Fixed duration", 0, 24 * 60 * 60 * 1000)
    if (!Array.isArray(timeline.segments) || timeline.segments.length > 64) {
        fail("timeline_invalid", "Timeline segments are invalid.")
    }
    const segmentIds = new Set()
    let directedDurationMs = 0
    for (const [index, segment] of timeline.segments.entries()) {
        exactKeys(segment, ["id", "kind", "cycles", "paceScale", "durationMs"], "timeline_invalid", `Timeline segment ${index + 1}`)
        stringValue(segment.id, "timeline_invalid", "Timeline segment id", { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, max: 120 })
        if (segmentIds.has(segment.id)) fail("timeline_invalid", "Timeline segment identities must be unique.")
        segmentIds.add(segment.id)
        stringValue(segment.kind, "timeline_invalid", "Timeline segment kind", { values: ["cycle", "hold"] })
        numberValue(segment.cycles, "timeline_invalid", "Timeline segment cycles", 0, 1000, true)
        numberValue(segment.paceScale, "timeline_invalid", "Timeline segment pace", 0.05, 20)
        numberValue(segment.durationMs, "timeline_invalid", "Timeline segment duration", 0, 24 * 60 * 60 * 1000)
        directedDurationMs += segment.durationMs
        if (segment.kind === "cycle" && segment.cycles < 1) fail("timeline_invalid", "A cycle segment must contain at least one cycle.")
        if (segment.kind === "hold" && segment.cycles !== 0) fail("timeline_invalid", "A hold segment cannot contain cycles.")
    }
    if (directedDurationMs > 24 * 60 * 60 * 1000) fail("timeline_invalid", "Directed Timeline exceeds the supported duration.")
    if (timeline.mode === "automatic" && (timeline.fixedDurationMs !== 0 || timeline.segments.length !== 0)) {
        fail("timeline_invalid", "Automatic Timeline cannot contain fixed or directed intent.")
    }
    if (timeline.mode === "fixed-duration" && (timeline.fixedDurationMs < 1000 || timeline.segments.length !== 0)) {
        fail("timeline_invalid", "Fixed Timeline duration is invalid.")
    }
    if (timeline.mode === "directed" && (timeline.fixedDurationMs !== 0 || timeline.segments.length === 0)) {
        fail("timeline_invalid", "Directed Timeline needs explicit segments.")
    }
    numberValue(timeline.repeatCount, "timeline_invalid", "Repeat count", 1, 1000, true)
    for (const key of timelineKeys.filter((key) => !["mode", "fixedDurationMs", "segments", "playKind", "axis", "direction", "transitionDirection", "startMode", "repeatCount"].includes(key))) {
        numberValue(timeline[key], "timeline_invalid", key, 0, 24 * 60 * 60 * 1000)
    }
}

function minimumVitrineFixedDuration(mediaCount, holdMs, exchangeMs) {
    const count = Math.max(1, mediaCount)
    const span = holdMs + exchangeMs
    const computed = count * Math.max(600 * span / holdMs, 280 * span / exchangeMs)
    const nearest = Math.round(computed)
    return Math.abs(computed - nearest) <= 1e-9 ? nearest : Math.ceil(computed)
}

function validateVitrineV2Project(project) {
    if (project.scene.id !== "vitrine" || project.scene.version !== 2) return
    if (project.media.length < 1 || project.media.length > 127) fail("scene_invalid", "Vitrine supports 1 to 127 ordered media items.")
    for (const entry of project.media) {
        if (!hasExactKeys(entry.frame, FRAME_INTENT_KEYS)) fail("manifest_invalid", "Vitrine v2 requires explicit per-frame fit, crop, and focal intent.")
        const frame = entry.frame
        const cropped = frame.crop.x !== 0 || frame.crop.y !== 0 || frame.crop.width !== 1 || frame.crop.height !== 1
        let effectiveRatio = frame.ratio
        if (cropped) effectiveRatio *= frame.crop.width / frame.crop.height
        else if (frame.aspectMode === "custom") effectiveRatio = frame.ratioW / frame.ratioH
        else if (frame.aspectMode === "global" && project.canvas.ratioMode === "fixed") {
            effectiveRatio = project.canvas.fixedRatio === "wide2576" ? 2576 / 1080
                : project.canvas.fixedRatio === "custom" ? project.canvas.customRatioWidth / project.canvas.customRatioHeight : 16 / 9
        }
        if (!Number.isFinite(effectiveRatio) || effectiveRatio < 1 / 10_000 || effectiveRatio > 10_000) {
            fail("manifest_invalid", "Vitrine effective frame ratio is outside the supported range.")
        }
    }
    if (project.media.every((entry) => entry.frame.muted)) fail("scene_invalid", "Vitrine needs at least one eligible opening/finale object.")
    const openingMarkers = project.media.filter((entry) => entry.frame.spotlight)
    if (openingMarkers.length > 1) fail("scene_invalid", "Vitrine supports one opening object marker.")
    if (openingMarkers.some((entry) => entry.frame.muted)
        || (project.scene.parameters.spotlightsEnabled && openingMarkers.length !== 1)
        || (!project.scene.parameters.spotlightsEnabled && openingMarkers.length !== 0)) {
        fail("scene_invalid", "Vitrine opening-object intent is inconsistent.")
    }
    if (project.timeline.axis !== "horizontal") fail("timeline_invalid", "Vitrine uses a fixed horizontal object exchange.")
    const holdMs = numberValue(project.timeline.holdMs, "timeline_invalid", "Vitrine readable hold", 600, 6_000)
    const exchangeMs = numberValue(project.timeline.paceMs, "timeline_invalid", "Vitrine exchange duration", 280, 1_800)
    if (!["solid", "transparent"].includes(project.look.parameters.backgroundStyle)) {
        fail("look_invalid", "Vitrine v2 supports a solid room or clean transparency only.")
    }
    const eligibleCount = project.media.filter((entry) => !entry.frame.muted).length
    const minimumCycleMs = minimumVitrineFixedDuration(eligibleCount, holdMs, exchangeMs)
    let cycleDurationMs = eligibleCount * (holdMs + exchangeMs)
    if (project.timeline.mode === "fixed-duration" && project.timeline.fixedDurationMs < minimumCycleMs) {
        fail("timeline_invalid", `Vitrine fixed duration must be at least ${minimumCycleMs} ms for this media count.`)
    }
    if (project.timeline.mode === "fixed-duration") cycleDurationMs = project.timeline.fixedDurationMs
    if (project.timeline.mode === "directed") {
        const baseCycleMs = Math.max(1, eligibleCount) * (holdMs + exchangeMs)
        let totalDurationMs = 0
        for (const segment of project.timeline.segments) {
            if (segment.kind === "hold") {
                const durationMs = segment.durationMs > 0 ? segment.durationMs : holdMs
                if (durationMs < 600) fail("timeline_invalid", "Vitrine directed holds must be at least 600 ms.")
                totalDurationMs += durationMs
                continue
            }
            const durationMs = segment.durationMs > 0 ? segment.durationMs : baseCycleMs * segment.cycles / segment.paceScale
            if (durationMs / segment.cycles < minimumCycleMs) {
                fail("timeline_invalid", `Vitrine directed cycles must be at least ${minimumCycleMs} ms each.`)
            }
            totalDurationMs += durationMs
        }
        if (totalDurationMs > 24 * 60 * 60 * 1000) fail("timeline_invalid", "Directed Timeline exceeds the supported duration.")
        cycleDurationMs = totalDurationMs
    }
    const totalDurationMs = project.timeline.playKind === "repeat" ? cycleDurationMs * project.timeline.repeatCount : cycleDurationMs
    if (totalDurationMs > 24 * 60 * 60 * 1000) fail("timeline_invalid", "Vitrine playback exceeds the supported duration.")
}

function automaticShelfDuration(mediaCount, paceMs) {
    return Math.min(42_000, Math.max(8_000, Math.max(1, mediaCount) * paceMs))
}

function validateShelfV2Project(project) {
    if (project.scene.id !== "the-shelf" || project.scene.version !== 2) return
    if (project.media.length < 1 || project.media.length > 127) fail("scene_invalid", "Shelf supports 1 to 127 ordered media items.")
    if (project.canvas.ratioMode !== "auto") fail("canvas_invalid", "Shelf canvas ratio intent must remain independent from natural frame ratios.")
    for (const entry of project.media) {
        if (!hasExactKeys(entry.frame, FRAME_INTENT_KEYS)) fail("manifest_invalid", "Shelf v2 requires explicit per-frame fit, crop, and focal intent.")
        if (entry.frame.aspectMode !== "auto") fail("manifest_invalid", "Shelf v2 requires each frame to use its natural source ratio.")
        numberValue(entry.frame.ratio, "manifest_invalid", "Shelf natural frame ratio", 0.2, 4)
        // Crop and focal intent affect pixels inside the natural-ratio plane. They never alter Shelf geometry.
    }

    numberValue(project.scene.parameters.slideHeight, "scene_invalid", "Shelf card height", 28, 58)
    numberValue(project.scene.parameters.gap, "scene_invalid", "Shelf gap", 8, 120)
    numberValue(project.scene.parameters.tilt, "scene_invalid", "Shelf lean amount", 0, 6)
    numberValue(project.scene.parameters.centerBump, "scene_invalid", "Shelf Spotlight lift", 3, 14)
    if (project.timeline.axis !== "horizontal") fail("timeline_invalid", "Shelf uses one fixed horizontal baseline.")
    if (!["solid", "transparent"].includes(project.look.parameters.backgroundStyle)) {
        fail("look_invalid", "Shelf v2 supports a solid field or clean transparency only.")
    }
    if (!["dark", "light"].includes(project.look.parameters.theme)) fail("look_invalid", "Shelf v2 requires an explicit dark or light clean Look.")

    const spotlightMarkers = project.media.filter((entry) => entry.frame.spotlight)
    if (spotlightMarkers.length > 1
        || spotlightMarkers.some((entry) => entry.frame.muted)
        || (project.scene.parameters.spotlightsEnabled && spotlightMarkers.length !== 1)
        || (!project.scene.parameters.spotlightsEnabled && spotlightMarkers.length !== 0)) {
        fail("scene_invalid", "Shelf Spotlight intent is inconsistent.")
    }

    const paceMs = numberValue(project.timeline.paceMs, "timeline_invalid", "Shelf walking pace", 180, 8_000)
    const baseCycleMs = automaticShelfDuration(project.media.length, paceMs)
    let cycleDurationMs = baseCycleMs
    if (project.timeline.mode === "fixed-duration") cycleDurationMs = project.timeline.fixedDurationMs
    if (project.timeline.mode === "directed") {
        cycleDurationMs = 0
        for (const segment of project.timeline.segments) {
            const durationMs = segment.durationMs > 0
                ? segment.durationMs
                : segment.kind === "hold"
                    ? Math.max(250, paceMs)
                    : baseCycleMs * segment.cycles / segment.paceScale
            if (!Number.isFinite(durationMs) || durationMs < 1 || durationMs > 24 * 60 * 60 * 1_000) {
                fail("timeline_invalid", "A directed Shelf segment duration is invalid.")
            }
            cycleDurationMs += durationMs
        }
    }
    if (!Number.isFinite(cycleDurationMs) || cycleDurationMs < 1 || cycleDurationMs > 24 * 60 * 60 * 1_000) {
        fail("timeline_invalid", "Shelf Timeline exceeds the supported duration.")
    }
    const totalDurationMs = project.timeline.playKind === "repeat" ? cycleDurationMs * project.timeline.repeatCount : cycleDurationMs
    if (!Number.isFinite(totalDurationMs) || totalDurationMs > 24 * 60 * 60 * 1_000) {
        fail("timeline_invalid", "Shelf playback exceeds the supported duration.")
    }
}

function greatestCommonDivisor(left, right) {
    let a = Math.abs(left)
    let b = Math.abs(right)
    while (b) [a, b] = [b, a % b]
    return a
}

function rationalValue(value, label) {
    exactKeys(value, ["numerator", "denominator"], "audio_invalid", label)
    numberValue(value.numerator, "audio_invalid", `${label} numerator`, 0, Number.MAX_SAFE_INTEGER, true)
    numberValue(value.denominator, "audio_invalid", `${label} denominator`, 1, 1_000_000, true)
    if (greatestCommonDivisor(value.numerator, value.denominator) !== 1) fail("audio_invalid", `${label} must be reduced.`)
    if (BigInt(value.numerator) > BigInt(24 * 60 * 60) * BigInt(value.denominator)) fail("audio_invalid", `${label} exceeds the supported duration.`)
    return value
}

function rationalFrames(value, sampleRate) {
    const numerator = BigInt(value.numerator) * BigInt(sampleRate)
    const denominator = BigInt(value.denominator)
    return Number((numerator * 2n + denominator) / (denominator * 2n))
}

function validateAudio(audio, media) {
    exactKeys(audio, ["id", "version", "sourceVideo", "sampleRate", "channels", "sources", "lanes", "ducking", "master"], "audio_invalid", "Audio intent")
    if (audio.id !== "gallery-audio-intent" || audio.version !== 1 || audio.sourceVideo !== "per-media") fail("audio_invalid", "Audio intent identity is invalid.")
    numberValue(audio.sampleRate, "audio_invalid", "Audio sample rate", 8_000, 192_000, true)
    numberValue(audio.channels, "audio_invalid", "Audio channels", 1, 2, true)
    if (!Array.isArray(audio.sources) || audio.sources.length > 512 || !Array.isArray(audio.lanes) || audio.lanes.length > 32) fail("audio_invalid", "Audio tables are invalid.")
    const mediaById = new Map(media.map((entry) => [entry.id, entry]))
    const sources = new Map()
    const sourceVideoMediaIds = new Set()
    let assetIndex = 0
    for (const [index, source] of audio.sources.entries()) {
        const commonKeys = ["id", "name", "role", "sampleRate", "channels", "sampleFrames"]
        const keys = source.role === "source-video" ? [...commonKeys, "mediaId"] : [...commonKeys, "archivePath", "bytes", "sha256", "signature"]
        exactKeys(source, keys, "audio_invalid", `Audio source ${index + 1}`)
        stringValue(source.id, "audio_invalid", "Audio source id", { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, max: 120 })
        if (sources.has(source.id)) fail("audio_invalid", "Audio source identities must be unique.")
        stringValue(source.name, "audio_invalid", "Audio source name", { pattern: /^[^/\\\u0000-\u001f]+$/, max: 512 })
        stringValue(source.role, "audio_invalid", "Audio source role", { values: ["source-video", "presenter", "soundtrack"] })
        numberValue(source.sampleRate, "audio_invalid", "Audio source sample rate", 8_000, 192_000, true)
        if (source.sampleRate !== audio.sampleRate) fail("audio_invalid", "Audio source and master sample rates disagree.")
        numberValue(source.channels, "audio_invalid", "Audio source channels", 1, 2, true)
        numberValue(source.sampleFrames, "audio_invalid", "Audio source frames", 1, source.sampleRate * 24 * 60 * 60, true)
        if (source.role === "source-video") {
            stringValue(source.mediaId, "audio_invalid", "Source-video media id", { pattern: /^[^/\\\u0000-\u001f]+$/, max: 200 })
            if (mediaById.get(source.mediaId)?.kind !== "video") fail("audio_invalid", "Source-video audio must reference an ordered video frame.")
            if (sourceVideoMediaIds.has(source.mediaId)) fail("audio_invalid", "Each ordered video can own only one source-video audio identity.")
            sourceVideoMediaIds.add(source.mediaId)
        } else {
            assetIndex += 1
            stringValue(source.signature, "audio_invalid", "Audio source signature", { values: ["wav-pcm16"] })
            stringValue(source.sha256, "audio_invalid", "Audio source hash", { pattern: /^[a-f0-9]{64}$/ })
            const expectedPath = `project/audio/${String(assetIndex).padStart(4, "0")}-${source.sha256.slice(0, 16)}.wav`
            if (source.archivePath !== expectedPath) fail("audio_invalid", "Audio archive path is invalid.")
            numberValue(source.bytes, "audio_invalid", "Audio source bytes", 46, 4_000_000_000, true)
        }
        sources.set(source.id, source)
    }
    const laneIds = new Set()
    const clipIds = new Set()
    let clipCount = 0
    for (const [laneIndex, lane] of audio.lanes.entries()) {
        exactKeys(lane, ["id", "name", "role", "gain", "muted", "solo", "clips"], "audio_invalid", `Audio lane ${laneIndex + 1}`)
        stringValue(lane.id, "audio_invalid", "Audio lane id", { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, max: 120 })
        if (laneIds.has(lane.id)) fail("audio_invalid", "Audio lane identities must be unique.")
        laneIds.add(lane.id)
        stringValue(lane.name, "audio_invalid", "Audio lane name", { pattern: /^[^/\\\u0000-\u001f]+$/, max: 200 })
        stringValue(lane.role, "audio_invalid", "Audio lane role", { values: ["source-video", "presenter", "soundtrack"] })
        numberValue(lane.gain, "audio_invalid", "Audio lane gain", 0, 4)
        booleanValue(lane.muted, "audio_invalid", "Audio lane mute")
        booleanValue(lane.solo, "audio_invalid", "Audio lane solo")
        if (!Array.isArray(lane.clips)) fail("audio_invalid", "Audio clip table is invalid.")
        clipCount += lane.clips.length
        if (clipCount > 4096) fail("audio_invalid", "Audio clip table is too large.")
        for (const [clipIndex, clip] of lane.clips.entries()) {
            exactKeys(clip, ["id", "sourceId", "timelineStart", "sourceIn", "sourceSpan", "duration", "loop", "gain", "muted", "fadeIn", "fadeOut"], "audio_invalid", `Audio clip ${clipIndex + 1}`)
            stringValue(clip.id, "audio_invalid", "Audio clip id", { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, max: 120 })
            if (clipIds.has(clip.id)) fail("audio_invalid", "Audio clip identities must be unique.")
            clipIds.add(clip.id)
            stringValue(clip.sourceId, "audio_invalid", "Audio clip source", { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, max: 120 })
            const source = sources.get(clip.sourceId)
            if (!source || source.role !== lane.role) fail("audio_invalid", "Audio clip source and lane role disagree.")
            for (const key of ["timelineStart", "sourceIn", "sourceSpan", "duration", "fadeIn", "fadeOut"]) rationalValue(clip[key], `Audio clip ${key}`)
            const sourceIn = rationalFrames(clip.sourceIn, source.sampleRate)
            const sourceSpan = rationalFrames(clip.sourceSpan, source.sampleRate)
            const duration = rationalFrames(clip.duration, audio.sampleRate)
            const timelineStart = rationalFrames(clip.timelineStart, audio.sampleRate)
            const fadeIn = rationalFrames(clip.fadeIn, audio.sampleRate)
            const fadeOut = rationalFrames(clip.fadeOut, audio.sampleRate)
            if (sourceSpan < 1 || duration < 1 || timelineStart + duration > audio.sampleRate * 24 * 60 * 60 || sourceIn + sourceSpan > source.sampleFrames || (!clip.loop && duration > sourceSpan) || fadeIn + fadeOut > duration) {
                fail("audio_invalid", "Audio clip spans or fades are invalid.")
            }
            booleanValue(clip.loop, "audio_invalid", "Audio clip loop")
            numberValue(clip.gain, "audio_invalid", "Audio clip gain", 0, 4)
            booleanValue(clip.muted, "audio_invalid", "Audio clip mute")
        }
    }
    exactKeys(audio.ducking, ["enabled", "triggerLaneId", "targetLaneIds", "amount", "attack", "release"], "audio_invalid", "Audio ducking")
    booleanValue(audio.ducking.enabled, "audio_invalid", "Audio ducking enabled")
    stringValue(audio.ducking.triggerLaneId, "audio_invalid", "Audio ducking trigger", { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, max: 120 })
    if (!Array.isArray(audio.ducking.targetLaneIds) || audio.ducking.targetLaneIds.length > 32 || new Set(audio.ducking.targetLaneIds).size !== audio.ducking.targetLaneIds.length) fail("audio_invalid", "Audio ducking targets are invalid.")
    for (const target of audio.ducking.targetLaneIds) stringValue(target, "audio_invalid", "Audio ducking target", { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, max: 120 })
    numberValue(audio.ducking.amount, "audio_invalid", "Audio ducking amount", 0, 1)
    rationalValue(audio.ducking.attack, "Audio ducking attack")
    rationalValue(audio.ducking.release, "Audio ducking release")
    if (audio.ducking.enabled) {
        const trigger = audio.lanes.find((lane) => lane.id === audio.ducking.triggerLaneId)
        if (trigger?.role !== "presenter" || audio.ducking.targetLaneIds.some((id) => id === trigger.id || !laneIds.has(id))) fail("audio_invalid", "Audio ducking lanes are invalid.")
    }
    exactKeys(audio.master, ["gain", "muted"], "audio_invalid", "Audio master")
    numberValue(audio.master.gain, "audio_invalid", "Audio master gain", 0, 4)
    booleanValue(audio.master.muted, "audio_invalid", "Audio master mute")
}

function validatePortableProject(input) {
    record(input, "manifest_invalid", "Project manifest")
    if (input.format !== PROJECT_FORMAT || input.product !== PRODUCT_ID) fail("wrong_product", "This file belongs to another product or project format.")
    if (Number.isInteger(input.schemaVersion) && input.schemaVersion > PROJECT_SCHEMA_VERSION) {
        fail("future_version_unsupported", "This project was created by a newer Gallery version and cannot be opened here.")
    }
    if (input.schemaVersion !== PROJECT_SCHEMA_VERSION || input.engineVersion !== ENGINE_VERSION) {
        fail("manifest_invalid", "This Gallery Project schema version is unsupported.")
    }
    exactKeys(input, ["format", "product", "schemaVersion", "engineVersion", "media", "canvas", "scene", "look", "timeline", "audio", "exportIntent"], "manifest_invalid", "Project manifest")
    validateMedia(input.media)
    validateCanvas(input.canvas)
    validateScene(input.scene)
    validateLook(input.look)
    validateTimeline(input.timeline, input.scene)
    validateVitrineV2Project(input)
    validateShelfV2Project(input)
    validateAudio(input.audio, input.media)
    exactKeys(input.exportIntent, ["quality"], "manifest_invalid", "Export intent")
    stringValue(input.exportIntent.quality, "manifest_invalid", "Export quality", { values: ["master", "high", "optimized"] })
    return input
}

function configFromPortableProject(project, urls, audioURLs = {}) {
    if (urls.length !== project.media.length) fail("manifest_invalid", "The hydrated media table is incomplete.")
    return {
        schemaVersion: PROJECT_SCHEMA_VERSION,
        styleId: project.scene.id,
        ...(project.scene.version === 1 ? {} : { sceneVersion: project.scene.version }),
        items: project.media.map((entry, index) => ({
            id: entry.id,
            name: entry.name,
            type: entry.kind,
            url: urls[index],
            ratio: entry.frame.ratio,
            aspectMode: entry.frame.aspectMode,
            ratioW: entry.frame.ratioW,
            ratioH: entry.frame.ratioH,
            fit: entry.frame.fit ?? (project.scene.id === "vitrine" && project.scene.version === 2 ? "contain" : project.scene.parameters.imageFit),
            crop: entry.frame.crop ?? { x: 0, y: 0, width: 1, height: 1 },
            focal: entry.frame.focal ?? { x: 0.5, y: 0.5 },
            ...(entry.frame.caption ? { caption: entry.frame.caption } : {}),
            spotlight: entry.frame.spotlight,
            muted: entry.frame.muted,
        })),
        settings: {
            ...project.canvas,
            ...project.scene.parameters,
            ...project.look.parameters,
            transitionDirection: project.timeline.transitionDirection ?? "left",
            ...Object.fromEntries(timelineKeysFor(project.scene.id, project.scene.version).filter((key) => !["mode", "fixedDurationMs", "segments"].includes(key)).map((key) => [key, project.timeline[key]])),
            exportQuality: project.exportIntent.quality,
        },
        timelineMode: project.timeline.mode,
        timelineFixedDurationMs: project.timeline.fixedDurationMs,
        timelineSegments: project.timeline.segments,
        audio: {
            id: project.audio.id,
            version: project.audio.version,
            sourceVideo: project.audio.sourceVideo,
            sampleRate: project.audio.sampleRate,
            channels: project.audio.channels,
            sources: project.audio.sources.map((source) => ({
                id: source.id,
                name: source.name,
                role: source.role,
                ...(source.role === "source-video"
                    ? { mediaId: source.mediaId, url: urls[project.media.findIndex((entry) => entry.id === source.mediaId)] }
                    : { url: audioURLs[source.id] }),
                sampleRate: source.sampleRate,
                channels: source.channels,
                sampleFrames: source.sampleFrames,
            })),
            lanes: project.audio.lanes,
            ducking: project.audio.ducking,
            master: project.audio.master,
        },
    }
}

module.exports = {
    ENGINE_VERSION,
    PRODUCT_ID,
    PROJECT_FORMAT,
    PROJECT_SCHEMA_VERSION,
    SUPPORTED_SCENE_VERSIONS,
    ProjectSchemaError,
    canonicalProjectJSON,
    configFromPortableProject,
    defaultAudioIntent,
    inspectAudioFile,
    inspectMediaFile,
    portableProjectFromConfig,
    signatureForBytes,
    validatePortableProject,
}
