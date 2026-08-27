import { DEFAULT_SETTINGS } from "./defaults.ts"
import { defaultCasinoTimeline, QUIET_CAROUSEL_ID, quietCarouselScene } from "./scenes/quietCarousel.ts"
import type { MediaItem, ReelConfig, TimelineMode, VisualTimelineSegment } from "./types.ts"

const BROWSER_PROJECT_FORMAT = "galileo-gallery-browser-project"
const BROWSER_PROJECT_VERSION = 1

const fixtureColours = ["#ff6f61", "#f2c14e", "#4ecdc4", "#5f6caf", "#c77dff", "#5cb85c", "#f78fb3", "#84a9ac"]
const fixtureRatios = [16 / 9, 4 / 3, 1, 3 / 4, 16 / 10, 9 / 16, 3 / 2, 4 / 5]

function fixtureSource(index: number, colour: string, ratio: number) {
    const width = 1200
    const height = Math.round(width / ratio)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${colour}"/><circle cx="${180 + index * 90}" cy="${Math.min(height * 0.45, 180 + (index % 3) * 150)}" r="${Math.min(96, height * 0.14)}" fill="#fff" fill-opacity=".2"/><text x="64" y="${height - 64}" fill="#fff" font-family="system-ui" font-size="${Math.min(72, height * 0.12)}" font-weight="700">FRAME ${String(index + 1).padStart(2, "0")}</text></svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function quietCarouselFixtureItems(count = 8): MediaItem[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `quiet-frame-${String(index + 1).padStart(2, "0")}`,
        name: `Frame ${String(index + 1).padStart(2, "0")}`,
        type: "image" as const,
        url: fixtureSource(index, fixtureColours[index % fixtureColours.length], fixtureRatios[index % fixtureRatios.length]),
        ratio: fixtureRatios[index % fixtureRatios.length],
        aspectMode: "auto" as const,
        ratioW: 16,
        ratioH: 9,
        spotlight: false,
        muted: false,
    }))
}

export function createQuietCarouselProject(items = quietCarouselFixtureItems()): ReelConfig {
    const defaults = quietCarouselScene.defaults()
    return {
        schemaVersion: 2,
        styleId: QUIET_CAROUSEL_ID,
        items,
        timelineMode: "automatic",
        timelineFixedDurationMs: 12000,
        timelineSegments: [],
        settings: {
            ...DEFAULT_SETTINGS,
            canvasPreset: "fullHD",
            canvasWidth: 1920,
            canvasHeight: 1080,
            imageFit: defaults.fit,
            motionPreset: "custom",
            paceMs: defaults.paceMs,
            axis: "horizontal",
            direction: "forward",
            playKind: "repeat",
            repeatCount: 1,
            slideHeight: defaults.frameSize,
            gap: defaults.gap,
            centerBump: defaults.depth,
            tilt: 0,
            sway: 0,
            idleDim: 0,
            idleMute: 0,
            spotlightDim: 0,
            speedBlur: 0,
            radius: 0,
            shadow: 0,
            gridStrength: 0,
            gridDrift: 0,
            vignette: 0,
            showHint: false,
            theme: "dark",
            ground: defaults.background.kind === "solid" ? defaults.background.color : "#11110f",
            paper: "#11110f",
            backgroundStyle: defaults.background.kind,
            backgroundTexture: 0,
        },
    }
}

export function timelineIntentForMode(mode: TimelineMode): Pick<ReelConfig, "timelineMode" | "timelineFixedDurationMs" | "timelineSegments"> {
    if (mode === "directed") return { timelineMode: mode, timelineFixedDurationMs: 0, timelineSegments: defaultCasinoTimeline() }
    if (mode === "fixed-duration") return { timelineMode: mode, timelineFixedDurationMs: 12000, timelineSegments: [] }
    return { timelineMode: mode, timelineFixedDurationMs: 0, timelineSegments: [] }
}

function isTimelineSegment(value: unknown): value is VisualTimelineSegment {
    if (!value || typeof value !== "object") return false
    const segment = value as Record<string, unknown>
    return typeof segment.id === "string"
        && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment.id) && segment.id.length <= 120
        && ["cycle", "hold"].includes(String(segment.kind))
        && typeof segment.cycles === "number" && Number.isInteger(segment.cycles) && segment.cycles >= 0 && segment.cycles <= 1000
        && typeof segment.paceScale === "number" && Number.isFinite(segment.paceScale) && segment.paceScale >= 0.05 && segment.paceScale <= 20
        && typeof segment.durationMs === "number" && Number.isFinite(segment.durationMs) && segment.durationMs >= 0 && segment.durationMs <= 24 * 60 * 60 * 1000
        && (segment.kind === "cycle" ? segment.cycles >= 1 : segment.cycles === 0)
}

function isFixtureMedia(value: unknown): value is MediaItem {
    if (!value || typeof value !== "object") return false
    const item = value as Record<string, unknown>
    return typeof item.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) && item.id.length <= 120
        && typeof item.name === "string" && item.name.length > 0 && item.name.length <= 512
        && item.type === "image"
        && typeof item.url === "string" && item.url.startsWith("data:image/svg+xml;charset=utf-8,") && item.url.length <= 2_000_000
        && typeof item.ratio === "number" && Number.isFinite(item.ratio) && item.ratio >= 0.05 && item.ratio <= 20
        && typeof item.spotlight === "boolean" && typeof item.muted === "boolean"
}

export function serializeQuietCarouselBrowserProject(config: ReelConfig) {
    return JSON.stringify({ format: BROWSER_PROJECT_FORMAT, version: BROWSER_PROJECT_VERSION, config })
}

export function parseQuietCarouselBrowserProject(text: string): ReelConfig {
    const parsed = JSON.parse(text) as { format?: unknown; version?: unknown; config?: Partial<ReelConfig> }
    if (parsed.format !== BROWSER_PROJECT_FORMAT || parsed.version !== BROWSER_PROJECT_VERSION || !parsed.config) {
        throw new Error("Browser Project identity is invalid.")
    }
    const config = parsed.config
    if (config.styleId !== QUIET_CAROUSEL_ID || !Array.isArray(config.items) || config.items.length < 1 || config.items.length > 256 || !config.items.every(isFixtureMedia) || !config.settings) {
        throw new Error("Quiet Carousel Project is invalid.")
    }
    if (new Set(config.items.map((item) => item.id)).size !== config.items.length) throw new Error("Frame identities must be unique.")
    const mode = config.timelineMode ?? "automatic"
    if (!["automatic", "fixed-duration", "directed"].includes(mode)) throw new Error("Timeline mode is invalid.")
    if (!Array.isArray(config.timelineSegments) || !config.timelineSegments.every(isTimelineSegment)) throw new Error("Timeline segments are invalid.")
    if (config.timelineSegments.length > 64 || new Set(config.timelineSegments.map((segment) => segment.id)).size !== config.timelineSegments.length) throw new Error("Timeline segments are invalid.")
    if (config.timelineSegments.reduce((total, segment) => total + segment.durationMs, 0) > 24 * 60 * 60 * 1000) throw new Error("Timeline segments exceed the supported duration.")
    const fixedDurationMs = config.timelineFixedDurationMs ?? 0
    if (!Number.isFinite(fixedDurationMs) || fixedDurationMs < 0 || fixedDurationMs > 24 * 60 * 60 * 1000) throw new Error("Fixed Timeline duration is invalid.")
    if (mode === "automatic" && (fixedDurationMs !== 0 || config.timelineSegments.length !== 0)) throw new Error("Automatic Timeline intent is invalid.")
    if (mode === "fixed-duration" && (fixedDurationMs < 1000 || config.timelineSegments.length !== 0)) throw new Error("Fixed Timeline intent is invalid.")
    if (mode === "directed" && (fixedDurationMs !== 0 || config.timelineSegments.length === 0)) throw new Error("Directed Timeline intent is invalid.")
    quietCarouselScene.parameters({
        frameSize: config.settings.slideHeight,
        gap: config.settings.gap,
        paceMs: config.settings.paceMs,
        depth: config.settings.centerBump,
        fit: config.settings.imageFit,
        background: config.settings.backgroundStyle === "transparent"
            ? { kind: "transparent" }
            : { kind: "solid", color: config.settings.ground || "#11110f" },
    })
    return config as ReelConfig
}
