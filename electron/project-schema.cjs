const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const PROJECT_FORMAT = "galileo-gallery-project"
const PRODUCT_ID = "galileo-gallery"
const PROJECT_SCHEMA_VERSION = 2
const ENGINE_VERSION = 1

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
    return value !== null && typeof value === "object" && !Array.isArray(value)
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

function settingsSubset(settings, keys) {
    return Object.fromEntries(keys.map((key) => [key, settings[key]]))
}

function portableProjectFromConfig(config, media) {
    if (!isRecord(config) || !Array.isArray(config.items) || !isRecord(config.settings) || media.length !== config.items.length) {
        fail("manifest_invalid", "The current Project cannot be serialized safely.")
    }
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
                caption: item.caption ?? "",
                spotlight: item.spotlight,
                muted: item.muted,
            },
        })),
        canvas: settingsSubset(config.settings, CANVAS_KEYS),
        scene: {
            id: config.styleId,
            version: 1,
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
            ...settingsSubset(config.settings, TIMELINE_KEYS.filter((key) => !["mode", "fixedDurationMs", "segments"].includes(key))),
        },
        audio: {
            id: "gallery-audio-intent",
            version: 1,
            sourceVideo: "per-media",
            lanes: [],
            master: { gain: 1, muted: false },
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
        exactKeys(entry.frame, ["ratio", "aspectMode", "ratioW", "ratioH", "caption", "spotlight", "muted"], "manifest_invalid", `media[${index}].frame`)
        numberValue(entry.frame.ratio, "manifest_invalid", "Frame ratio", 0.01, 100)
        stringValue(entry.frame.aspectMode, "manifest_invalid", "Frame aspect mode", { values: ["auto", "global", "custom"] })
        numberValue(entry.frame.ratioW, "manifest_invalid", "Frame ratio width", 1, 10000)
        numberValue(entry.frame.ratioH, "manifest_invalid", "Frame ratio height", 1, 10000)
        stringValue(entry.frame.caption, "manifest_invalid", "Frame caption", { allowEmpty: true, max: 4000 })
        booleanValue(entry.frame.spotlight, "manifest_invalid", "Frame spotlight")
        booleanValue(entry.frame.muted, "manifest_invalid", "Frame mute")
        return entry
    })
}

function validateCanvas(canvas) {
    exactKeys(canvas, CANVAS_KEYS, "canvas_invalid", "Canvas")
    stringValue(canvas.canvasPreset, "canvas_invalid", "Canvas preset", { values: ["fullHD", "fourK", "square", "portrait", "vertical", "presentation", "cinema", "custom"] })
    numberValue(canvas.canvasWidth, "canvas_invalid", "Canvas width", 64, 7680, true)
    numberValue(canvas.canvasHeight, "canvas_invalid", "Canvas height", 64, 7680, true)
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
    numberValue(scene.version, "scene_invalid", "Scene version", 1, 1, true)
    exactKeys(scene.parameters, SCENE_PARAMETER_KEYS, "scene_invalid", "Scene parameters")
    stringValue(scene.parameters.imageFit, "scene_invalid", "Frame fit", { values: ["contain", "cover"] })
    stringValue(scene.parameters.motionPreset, "scene_invalid", "Motion preset", { values: ["cut", "magnetic", "velvet", "dream", "custom"] })
    stringValue(scene.parameters.cornerStyle, "scene_invalid", "Corner style", { values: ["rounded", "squircle"] })
    for (const key of ["autoplayVideos", "loopVideos", "spotlightsEnabled", "finaleEnabled", "showHint"]) booleanValue(scene.parameters[key], "scene_invalid", key)
    for (const key of SCENE_PARAMETER_KEYS.filter((key) => !["imageFit", "motionPreset", "cornerStyle", "autoplayVideos", "loopVideos", "spotlightsEnabled", "finaleEnabled", "showHint"].includes(key))) {
        numberValue(scene.parameters[key], "scene_invalid", key, key === "tilt" ? -360 : 0, 10000)
    }
}

function validateLook(look) {
    exactKeys(look, ["id", "version", "parameters"], "look_invalid", "Look")
    stringValue(look.id, "look_invalid", "Look id", { pattern: /^gallery-look\.[a-z-]+$/, max: 120 })
    numberValue(look.version, "look_invalid", "Look version", 1, 1, true)
    exactKeys(look.parameters, LOOK_PARAMETER_KEYS, "look_invalid", "Look parameters")
    stringValue(look.parameters.theme, "look_invalid", "Look theme", { values: ["auto", "dark", "light"] })
    stringValue(look.parameters.ground, "look_invalid", "Look ground", { allowEmpty: true, pattern: /^(?:#[0-9a-fA-F]{3,8})?$/, max: 9 })
    stringValue(look.parameters.paper, "look_invalid", "Look paper", { allowEmpty: true, pattern: /^(?:#[0-9a-fA-F]{3,8})?$/, max: 9 })
    stringValue(look.parameters.backgroundStyle, "look_invalid", "Background style", { values: ["solid", "gradient", "halo", "paper", "transparent"] })
    if (look.id !== `gallery-look.${look.parameters.backgroundStyle}`) fail("look_invalid", "Look identity and parameters disagree.")
    stringValue(look.parameters.backgroundColor2, "look_invalid", "Background colour", { pattern: /^#[0-9a-fA-F]{6}$/ })
    numberValue(look.parameters.backgroundAngle, "look_invalid", "Background angle", -3600, 3600)
    numberValue(look.parameters.backgroundTexture, "look_invalid", "Background texture", 0, 100)
}

function validateTimeline(timeline) {
    exactKeys(timeline, TIMELINE_KEYS, "timeline_invalid", "Timeline")
    stringValue(timeline.mode, "timeline_invalid", "Timeline mode", { values: ["automatic", "fixed-duration", "directed"] })
    stringValue(timeline.playKind, "timeline_invalid", "Playback kind", { values: ["once", "repeat", "loop"] })
    stringValue(timeline.axis, "timeline_invalid", "Timeline axis", { values: ["horizontal", "vertical"] })
    stringValue(timeline.direction, "timeline_invalid", "Timeline direction", { values: ["forward", "reverse"] })
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
    for (const key of TIMELINE_KEYS.filter((key) => !["mode", "fixedDurationMs", "segments", "playKind", "axis", "direction", "startMode", "repeatCount"].includes(key))) {
        numberValue(timeline[key], "timeline_invalid", key, 0, 24 * 60 * 60 * 1000)
    }
}

function validateAudio(audio) {
    exactKeys(audio, ["id", "version", "sourceVideo", "lanes", "master"], "audio_invalid", "Audio intent")
    if (audio.id !== "gallery-audio-intent" || audio.version !== 1 || audio.sourceVideo !== "per-media" || !Array.isArray(audio.lanes) || audio.lanes.length !== 0) {
        fail("audio_invalid", "Audio intent identity is invalid.")
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
    validateTimeline(input.timeline)
    validateAudio(input.audio)
    exactKeys(input.exportIntent, ["quality"], "manifest_invalid", "Export intent")
    stringValue(input.exportIntent.quality, "manifest_invalid", "Export quality", { values: ["master", "high", "optimized"] })
    return input
}

function configFromPortableProject(project, urls) {
    if (urls.length !== project.media.length) fail("manifest_invalid", "The hydrated media table is incomplete.")
    return {
        schemaVersion: PROJECT_SCHEMA_VERSION,
        styleId: project.scene.id,
        items: project.media.map((entry, index) => ({
            id: entry.id,
            name: entry.name,
            type: entry.kind,
            url: urls[index],
            ratio: entry.frame.ratio,
            aspectMode: entry.frame.aspectMode,
            ratioW: entry.frame.ratioW,
            ratioH: entry.frame.ratioH,
            ...(entry.frame.caption ? { caption: entry.frame.caption } : {}),
            spotlight: entry.frame.spotlight,
            muted: entry.frame.muted,
        })),
        settings: {
            ...project.canvas,
            ...project.scene.parameters,
            ...project.look.parameters,
            ...Object.fromEntries(TIMELINE_KEYS.filter((key) => !["mode", "fixedDurationMs", "segments"].includes(key)).map((key) => [key, project.timeline[key]])),
            exportQuality: project.exportIntent.quality,
        },
        timelineMode: project.timeline.mode,
        timelineFixedDurationMs: project.timeline.fixedDurationMs,
        timelineSegments: project.timeline.segments,
    }
}

module.exports = {
    ENGINE_VERSION,
    PRODUCT_ID,
    PROJECT_FORMAT,
    PROJECT_SCHEMA_VERSION,
    ProjectSchemaError,
    canonicalProjectJSON,
    configFromPortableProject,
    inspectMediaFile,
    portableProjectFromConfig,
    signatureForBytes,
    validatePortableProject,
}
