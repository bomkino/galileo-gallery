const crypto = require("node:crypto")
const { HostPortError } = require("./linux-host-port.cjs")

const PNG_FRAMES_MIME = "application/vnd.galileo.png-frames-directory"
const SNAPSHOT_ID = /^[a-f0-9]{32}$/
const DESTINATION_GRANT = /^[a-f0-9]{64}$/
const MAX_DECODED_VIDEO_BYTES = 2 * 1024 * 1024 * 1024
const MAX_VITRINE_DURATION_MS = 24 * 60 * 60 * 1000
const CANVAS_PRESET_DIMENSIONS = Object.freeze({
    fullHD: Object.freeze([1920, 1080]),
    fourK: Object.freeze([3840, 2160]),
    square: Object.freeze([1080, 1080]),
    portrait: Object.freeze([1080, 1350]),
    vertical: Object.freeze([1080, 1920]),
    presentation: Object.freeze([1920, 1200]),
    cinema: Object.freeze([2560, 1080]),
})
const CONFIG_KEYS = new Set(["schemaVersion", "styleId", "sceneVersion", "items", "settings", "timelineMode", "timelineFixedDurationMs", "timelineSegments", "audio"])
const ITEM_KEYS = new Set(["id", "name", "type", "url", "previewUrl", "ratio", "aspectMode", "ratioW", "ratioH", "fit", "crop", "focal", "caption", "spotlight", "muted"])
const SETTINGS_KEYS = new Set([
    "canvasPreset", "canvasWidth", "canvasHeight", "ratioMode", "fixedRatio", "customRatioWidth", "customRatioHeight", "imageFit",
    "autoplayVideos", "loopVideos", "paddingUnit", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "captionGap",
    "motionPreset", "launchMs", "arrivalMs", "growMs", "exitMs", "paceMs", "axis", "direction", "transitionDirection", "startMode",
    "playKind", "repeatCount", "leadInMs", "holdMs", "finaleGrowMs", "finaleHoldMs", "fadeMs", "canvasPose", "spotlightsEnabled",
    "finaleEnabled", "heroSize", "finaleSize", "centerBump", "tilt", "sway", "idleDim", "idleMute", "spotlightDim", "speedBlur",
    "slideHeight", "gap", "cornerStyle", "cornerSmoothing", "radius", "shadow", "gridSize", "gridStrength", "gridDrift", "vignette",
    "showHint", "theme", "ground", "paper", "backgroundStyle", "backgroundColor2", "backgroundAngle", "backgroundTexture", "exportQuality",
])

function plainRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
}

function onlyAllowedKeys(value, allowed) {
    return plainRecord(value) && Object.keys(value).every((key) => allowed.has(key))
}

function ownExact(value, keys) {
    if (!plainRecord(value)) return false
    const actual = Object.keys(value).sort()
    const expected = [...keys].sort()
    return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function integer(value, minimum, maximum) {
    return Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

function cloneAndFreeze(value) {
    let clone
    try { clone = JSON.parse(JSON.stringify(value)) } catch { throw new HostPortError("invalid_request") }
    function freeze(candidate) {
        if (!candidate || typeof candidate !== "object" || Object.isFrozen(candidate)) return candidate
        for (const child of Object.values(candidate)) freeze(child)
        return Object.freeze(candidate)
    }
    return freeze(clone)
}

function finiteNumber(value, minimum, maximum) {
    return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
}

function safeText(value, maximum, pattern) {
    return typeof value === "string" && value.length > 0 && value.length <= maximum && (!pattern || pattern.test(value))
}

function safeCrop(value) {
    if (value === undefined) return { x: 0, y: 0, width: 1, height: 1 }
    if (!ownExact(value, ["x", "y", "width", "height"])
        || !finiteNumber(value.x, 0, 1) || !finiteNumber(value.y, 0, 1)
        || !finiteNumber(value.width, 1 / 10_000, 1) || !finiteNumber(value.height, 1 / 10_000, 1)
        || value.x + value.width > 1 + 1e-12 || value.y + value.height > 1 + 1e-12) throw new HostPortError("invalid_request")
    return { x: value.x, y: value.y, width: value.width, height: value.height }
}

function safeFocal(value) {
    if (value === undefined) return { x: 0.5, y: 0.5 }
    if (!ownExact(value, ["x", "y"]) || !finiteNumber(value.x, 0, 1) || !finiteNumber(value.y, 0, 1)) throw new HostPortError("invalid_request")
    return { x: value.x, y: value.y }
}

function safeItem(item, ids) {
    if (!onlyAllowedKeys(item, ITEM_KEYS)
        || !safeText(item.id, 200, /^[^/\\\u0000-\u001f]+$/) || ids.has(item.id)
        || !safeText(item.name, 512, /^[^/\\\u0000-\u001f]+$/)
        || !["image", "video"].includes(item.type) || typeof item.url !== "string"
        || !/^reel-media:\/\/grant\/[a-f0-9]{64}$/.test(item.url)
        || !finiteNumber(item.ratio, 1 / 10_000, 10_000)
        || !["auto", "global", "custom"].includes(item.aspectMode ?? "auto")
        || !finiteNumber(item.ratioW ?? 16, 1, 10_000) || !finiteNumber(item.ratioH ?? 9, 1, 10_000)
        || !["contain", "cover"].includes(item.fit ?? "contain")
        || (item.caption !== undefined && (typeof item.caption !== "string" || item.caption.length > 4_000))
        || typeof item.spotlight !== "boolean" || typeof item.muted !== "boolean") throw new HostPortError("invalid_request")
    ids.add(item.id)
    return {
        id: item.id,
        name: item.name,
        type: item.type,
        url: item.url,
        ratio: item.ratio,
        aspectMode: item.aspectMode ?? "auto",
        ratioW: item.ratioW ?? 16,
        ratioH: item.ratioH ?? 9,
        fit: item.fit ?? "contain",
        crop: safeCrop(item.crop),
        focal: safeFocal(item.focal),
        ...(item.caption ? { caption: item.caption } : {}),
        spotlight: item.spotlight,
        muted: item.muted,
    }
}

function safeTimelineSegments(value) {
    if (value === undefined) return []
    if (!Array.isArray(value) || value.length > 64) throw new HostPortError("invalid_request")
    return value.map((segment) => {
        if (!ownExact(segment, ["id", "kind", "cycles", "paceScale", "durationMs"])
            || !safeText(segment.id, 120, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            || !["cycle", "hold"].includes(segment.kind)
            || !integer(segment.cycles, 0, 1_000)
            || !finiteNumber(segment.paceScale, 0.05, 20)
            || !finiteNumber(segment.durationMs, 0, MAX_VITRINE_DURATION_MS)) throw new HostPortError("invalid_request")
        return { id: segment.id, kind: segment.kind, cycles: segment.cycles, paceScale: segment.paceScale, durationMs: segment.durationMs }
    })
}

function safeSettings(settings, sceneId) {
    if (!onlyAllowedKeys(settings, SETTINGS_KEYS)) throw new HostPortError("invalid_request")
    const backgroundStyle = settings.backgroundStyle
    if (!["solid", "gradient", "halo", "paper", "transparent"].includes(backgroundStyle)) throw new HostPortError("invalid_request")
    const ground = settings.ground ?? ""
    if (typeof ground !== "string" || (ground !== "" && !/^#[0-9a-fA-F]{6}$/.test(ground))) throw new HostPortError("invalid_request")
    const axis = settings.axis ?? "horizontal"
    const direction = settings.direction ?? "forward"
    const imageFit = settings.imageFit ?? "contain"
    const playKind = settings.playKind ?? "loop"
    const repeatCount = settings.repeatCount ?? 1
    const canvasWidth = settings.canvasWidth ?? 1920
    const canvasHeight = settings.canvasHeight ?? 1080
    const canvasPreset = settings.canvasPreset ?? "custom"
    const ratioMode = settings.ratioMode ?? "auto"
    const fixedRatio = settings.fixedRatio ?? "sixteenNine"
    const customRatioWidth = settings.customRatioWidth ?? 16
    const customRatioHeight = settings.customRatioHeight ?? 9
    const loopVideos = settings.loopVideos ?? true
    const presetDimensions = CANVAS_PRESET_DIMENSIONS[canvasPreset]
    if (![...Object.keys(CANVAS_PRESET_DIMENSIONS), "custom"].includes(canvasPreset)
        || !integer(canvasWidth, 64, 7_680) || !integer(canvasHeight, 64, 7_680) || canvasWidth % 2 !== 0 || canvasHeight % 2 !== 0
        || (presetDimensions && (canvasWidth !== presetDimensions[0] || canvasHeight !== presetDimensions[1]))
        || !["auto", "fixed"].includes(ratioMode) || !["sixteenNine", "wide2576", "custom"].includes(fixedRatio)
        || !finiteNumber(customRatioWidth, 1, 10_000) || !finiteNumber(customRatioHeight, 1, 10_000)
        || !["contain", "cover"].includes(imageFit) || typeof loopVideos !== "boolean"
        || !["horizontal", "vertical"].includes(axis) || !["forward", "reverse"].includes(direction)
        || !["once", "repeat", "loop"].includes(playKind) || !integer(repeatCount, 1, 1_000)) throw new HostPortError("invalid_request")
    const common = { canvasWidth, canvasHeight, ratioMode, fixedRatio, customRatioWidth, customRatioHeight, imageFit, loopVideos, axis, direction, playKind, repeatCount, backgroundStyle, ground }
    if (sceneId === "quiet-carousel") {
        const paceMs = settings.paceMs ?? 800
        const slideHeight = settings.slideHeight ?? 56
        const gap = settings.gap ?? 24
        const centerBump = settings.centerBump ?? 0
        if (!finiteNumber(paceMs, 180, 4_000) || !finiteNumber(slideHeight, 24, 78) || !finiteNumber(gap, 0, 240) || !finiteNumber(centerBump, 0, 40)) throw new HostPortError("invalid_request")
        return { ...common, paceMs, slideHeight, gap, centerBump }
    }
    const transitionDirection = settings.transitionDirection
    const holdMs = settings.holdMs
    const paceMs = settings.paceMs
    const slideHeight = settings.slideHeight
    const tilt = settings.tilt
    const sway = settings.sway
    const theme = settings.theme ?? "dark"
    if (!["left", "right"].includes(transitionDirection) || !finiteNumber(holdMs, 600, 6_000) || !finiteNumber(paceMs, 280, 1_800)
        || !finiteNumber(slideHeight, 42, 78) || !finiteNumber(tilt, 0, 9) || !finiteNumber(sway, 8, 30)
        || typeof settings.showHint !== "boolean" || typeof settings.spotlightsEnabled !== "boolean" || typeof settings.finaleEnabled !== "boolean"
        || !["dark", "light", "auto"].includes(theme) || !["solid", "transparent"].includes(backgroundStyle)) throw new HostPortError("invalid_request")
    return { ...common, transitionDirection, holdMs, paceMs, slideHeight, tilt, sway, showHint: settings.showHint, spotlightsEnabled: settings.spotlightsEnabled, finaleEnabled: settings.finaleEnabled, theme }
}

function minimumVitrineCycleDuration(mediaCount, holdMs, exchangeMs) {
    const span = holdMs + exchangeMs
    const computed = mediaCount * Math.max(600 * span / holdMs, 280 * span / exchangeMs)
    const nearest = Math.round(computed)
    return Math.abs(computed - nearest) <= 1e-9 ? nearest : Math.ceil(computed)
}

function validatedVitrineClock(config) {
    const settings = config.settings
    if (!settings || settings.axis !== "horizontal"
        || !["forward", "reverse"].includes(settings.direction)
        || !["left", "right"].includes(settings.transitionDirection)
        || !["contain", "cover"].includes(settings.imageFit)
        || !["once", "repeat", "loop"].includes(settings.playKind)
        || typeof settings.showHint !== "boolean"
        || typeof settings.loopVideos !== "boolean"
        || typeof settings.spotlightsEnabled !== "boolean"
        || typeof settings.finaleEnabled !== "boolean"
        || !integer(settings.repeatCount, 1, 1_000)) throw new HostPortError("invalid_request")
    if (!config.items.every((item) => typeof item.muted === "boolean" && typeof item.spotlight === "boolean")) throw new HostPortError("invalid_request")
    for (const item of config.items) {
        const crop = item.crop
        const cropped = crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1
        let effectiveRatio = item.ratio
        if (cropped) effectiveRatio *= crop.width / crop.height
        else if (item.aspectMode === "custom") effectiveRatio = item.ratioW / item.ratioH
        else if (item.aspectMode === "global" && settings.ratioMode === "fixed") {
            effectiveRatio = settings.fixedRatio === "wide2576" ? 2576 / 1080
                : settings.fixedRatio === "custom" ? settings.customRatioWidth / settings.customRatioHeight : 16 / 9
        }
        if (!finiteNumber(effectiveRatio, 1 / 10_000, 10_000)) throw new HostPortError("invalid_request")
    }
    const eligibleCount = config.items.filter((item) => !item.muted).length
    const openingMarkers = config.items.filter((item) => item.spotlight)
    if (eligibleCount < 1 || openingMarkers.length > 1 || openingMarkers.some((item) => item.muted)
        || (settings.spotlightsEnabled && openingMarkers.length !== 1)
        || (!settings.spotlightsEnabled && openingMarkers.length !== 0)) throw new HostPortError("invalid_request")
    const holdMs = settings.holdMs
    const exchangeMs = settings.paceMs
    if (!finiteNumber(holdMs, 600, 6_000) || !finiteNumber(exchangeMs, 280, 1_800)) throw new HostPortError("invalid_request")
    const baseCycleMs = eligibleCount * (holdMs + exchangeMs)
    const minimumCycleMs = minimumVitrineCycleDuration(eligibleCount, holdMs, exchangeMs)
    const mode = config.timelineMode ?? "automatic"
    const fixedDurationMs = config.timelineFixedDurationMs ?? 0
    const segments = config.timelineSegments ?? []
    if (!["automatic", "fixed-duration", "directed"].includes(mode) || !Array.isArray(segments) || segments.length > 64) throw new HostPortError("invalid_request")
    if (settings.playKind !== "loop" && mode === "directed") throw new HostPortError("invalid_request")
    let cycleDurationMs
    if (mode === "automatic") {
        if (fixedDurationMs !== 0 || segments.length !== 0) throw new HostPortError("invalid_request")
        cycleDurationMs = baseCycleMs
    } else if (mode === "fixed-duration") {
        if (!finiteNumber(fixedDurationMs, Math.max(1_000, minimumCycleMs), MAX_VITRINE_DURATION_MS) || segments.length !== 0) throw new HostPortError("invalid_request")
        cycleDurationMs = fixedDurationMs
    } else {
        if (fixedDurationMs !== 0 || segments.length < 1) throw new HostPortError("invalid_request")
        const ids = new Set()
        cycleDurationMs = 0
        for (const segment of segments) {
            if (!ownExact(segment, ["id", "kind", "cycles", "paceScale", "durationMs"])
                || typeof segment.id !== "string" || segment.id.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment.id) || ids.has(segment.id)
                || !["cycle", "hold"].includes(segment.kind)
                || !integer(segment.cycles, 0, 1_000)
                || !finiteNumber(segment.paceScale, 0.05, 20)
                || !finiteNumber(segment.durationMs, 0, MAX_VITRINE_DURATION_MS)) throw new HostPortError("invalid_request")
            ids.add(segment.id)
            if ((segment.kind === "cycle" && segment.cycles < 1) || (segment.kind === "hold" && segment.cycles !== 0)) throw new HostPortError("invalid_request")
            const durationMs = segment.durationMs > 0
                ? segment.durationMs
                : segment.kind === "hold"
                    ? holdMs
                    : baseCycleMs * segment.cycles / segment.paceScale
            if (!finiteNumber(durationMs, 1, MAX_VITRINE_DURATION_MS)
                || (segment.kind === "hold" && durationMs < 600)
                || (segment.kind === "cycle" && durationMs / segment.cycles < minimumCycleMs)) throw new HostPortError("invalid_request")
            cycleDurationMs += durationMs
        }
        if (!finiteNumber(cycleDurationMs, 1, MAX_VITRINE_DURATION_MS)) throw new HostPortError("invalid_request")
    }
    const finalCycleDurationMs = cycleDurationMs
    const durationMs = settings.playKind === "repeat" ? cycleDurationMs * settings.repeatCount : cycleDurationMs
    if (!finiteNumber(durationMs, 1, MAX_VITRINE_DURATION_MS)) throw new HostPortError("invalid_request")
    return { cycleDurationMs, finalCycleDurationMs, durationMs }
}

function validatedScene(config) {
    if (!config || typeof config !== "object" || Array.isArray(config) || config.schemaVersion !== 2) throw new HostPortError("unsupported_capability")
    if (!plainRecord(config)) throw new HostPortError("invalid_request")
    const version = config.sceneVersion ?? 1
    const supported = (config.styleId === "quiet-carousel" && version === 1) || (config.styleId === "vitrine" && version === 2)
    if (!supported) throw new HostPortError("unsupported_capability")
    if (!onlyAllowedKeys(config, CONFIG_KEYS)) throw new HostPortError("invalid_request")
    const maximumItems = config.styleId === "vitrine" ? 127 : 256
    if (!Array.isArray(config.items) || config.items.length < 1 || config.items.length > maximumItems) throw new HostPortError("invalid_request")
    const ids = new Set()
    const items = config.items.map((item) => safeItem(item, ids))
    const timelineMode = config.timelineMode ?? "automatic"
    const timelineFixedDurationMs = config.timelineFixedDurationMs ?? 0
    const timelineSegments = safeTimelineSegments(config.timelineSegments)
    if (!["automatic", "fixed-duration", "directed"].includes(timelineMode) || !finiteNumber(timelineFixedDurationMs, 0, MAX_VITRINE_DURATION_MS)) throw new HostPortError("invalid_request")
    const safeConfig = {
        schemaVersion: 2,
        styleId: config.styleId,
        ...(version === 1 ? {} : { sceneVersion: version }),
        items,
        settings: safeSettings(config.settings, config.styleId),
        timelineMode,
        timelineFixedDurationMs,
        timelineSegments,
    }
    if (config.styleId === "vitrine") {
        return { id: config.styleId, version, clock: validatedVitrineClock(safeConfig), config: safeConfig }
    }
    return { id: config.styleId, version, config: safeConfig }
}

function reachableMediaIndexes(config) {
    const allIndexes = config.items.map((_item, index) => index)
    if (config.styleId !== "vitrine" || config.sceneVersion !== 2) return allIndexes
    const eligibleIndexes = config.items
        .map((item, index) => !item.muted ? index : -1)
        .filter((index) => index >= 0)
    if (config.settings.playKind === "loop") return eligibleIndexes
    const eligible = config.items.map((item, index) => ({ item, index })).filter(({ item }) => !item.muted)
    const opening = config.settings.spotlightsEnabled
        ? eligible.find(({ item }) => item.spotlight) ?? eligible[0]
        : eligible[0]
    const finale = config.settings.finaleEnabled ? eligible[eligible.length - 1] : opening
    return [...new Set([opening?.index, finale?.index])].filter((index) => index !== undefined)
}

function reachableVideoIndexes(config) {
    return reachableMediaIndexes(config).filter((index) => config.items[index].type === "video")
}

function createPngFramesSnapshot(intent, randomBytes = crypto.randomBytes) {
    if (!ownExact(intent, ["config", "width", "height", "fps", "durationMs", "cycleDurationMs", "finalCycleDurationMs", "transparent"])) throw new HostPortError("invalid_request")
    const scene = validatedScene(intent.config)
    if (!integer(intent.width, 64, 7680) || !integer(intent.height, 64, 7680) || !integer(intent.fps, 1, 120)
        || typeof intent.durationMs !== "number" || !Number.isFinite(intent.durationMs) || intent.durationMs < 1 || intent.durationMs > 24 * 60 * 60 * 1000
        || typeof intent.cycleDurationMs !== "number" || !Number.isFinite(intent.cycleDurationMs) || intent.cycleDurationMs < 1 || intent.cycleDurationMs > intent.durationMs
        || typeof intent.finalCycleDurationMs !== "number" || !Number.isFinite(intent.finalCycleDurationMs) || intent.finalCycleDurationMs < 1 || intent.finalCycleDurationMs > intent.durationMs
        || typeof intent.transparent !== "boolean") throw new HostPortError("invalid_request")
    if (scene.clock && (intent.durationMs !== scene.clock.durationMs
        || intent.cycleDurationMs !== scene.clock.cycleDurationMs
        || intent.finalCycleDurationMs !== scene.clock.finalCycleDurationMs)) throw new HostPortError("invalid_request")
    if (intent.width !== scene.config.settings.canvasWidth || intent.height !== scene.config.settings.canvasHeight) throw new HostPortError("invalid_request")
    if (intent.transparent !== (scene.config.settings.backgroundStyle === "transparent")) throw new HostPortError("invalid_request")
    const frameCount = Math.max(1, Math.round(intent.durationMs * intent.fps / 1000))
    if (frameCount > 216_000 || intent.width * intent.height * frameCount > 100_000_000_000) throw new HostPortError("resource_limit")
    if (scene.id !== "vitrine") {
        const videoCount = reachableVideoIndexes(scene.config).length
        const decodeDurationMs = Math.min(intent.durationMs, Math.max(intent.cycleDurationMs, intent.finalCycleDurationMs))
        const decodeFrameCount = Math.max(1, Math.round(intent.fps * decodeDurationMs / 1000))
        if (videoCount > 0 && videoCount * decodeFrameCount > 128) throw new HostPortError("resource_limit")
        const worstDecodedFrameBytes = intent.width * intent.height * 4 + intent.height + 1024 * 1024
        if (videoCount * decodeFrameCount * worstDecodedFrameBytes > MAX_DECODED_VIDEO_BYTES) throw new HostPortError("resource_limit")
    }
    const snapshotId = randomBytes(16).toString("hex")
    if (!SNAPSHOT_ID.test(snapshotId)) throw new HostPortError("internal_error")
    return cloneAndFreeze({
        snapshotId,
        version: 1,
        format: "png-frames",
        scene: { id: scene.id, version: scene.version },
        config: scene.config,
        width: intent.width,
        height: intent.height,
        fps: intent.fps,
        durationMs: intent.durationMs,
        cycleDurationMs: intent.cycleDurationMs,
        finalCycleDurationMs: intent.finalCycleDurationMs,
        frameCount,
        alpha: intent.transparent,
        audio: "none",
    })
}

function pngFramesCapabilities() {
    return Object.freeze({
        version: 1,
        formats: Object.freeze([Object.freeze({
            id: "png-frames",
            available: true,
            alpha: true,
            audio: false,
            sceneVersions: Object.freeze([
                Object.freeze({ id: "quiet-carousel", versions: Object.freeze([1]) }),
                Object.freeze({ id: "vitrine", versions: Object.freeze([2]) }),
            ]),
            consequence: "PNG Frames preserve straight alpha when requested and never contain audio; Project audio intent is unchanged.",
        })]),
    })
}

function pngFramesPreflight(snapshot) {
    return Object.freeze({
        snapshotId: snapshot.snapshotId,
        format: snapshot.format,
        width: snapshot.width,
        height: snapshot.height,
        fps: snapshot.fps,
        durationMs: snapshot.durationMs,
        frameCount: snapshot.frameCount,
        alpha: snapshot.alpha,
        audio: snapshot.audio,
        consequence: pngFramesCapabilities().formats[0].consequence,
    })
}

module.exports = { DESTINATION_GRANT, PNG_FRAMES_MIME, SNAPSHOT_ID, createPngFramesSnapshot, pngFramesCapabilities, pngFramesPreflight, reachableMediaIndexes, reachableVideoIndexes }
