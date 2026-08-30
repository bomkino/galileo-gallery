import * as React from "react"
import { createPortal, flushSync } from "react-dom"
import OpeningReel from "./OpeningReel"
import ExpertControls, { type ExpertPreset, type ExpertTab } from "./ExpertControls"
import ProductSceneRenderer, { isAuthoredVitrine, productSceneDuration } from "./scenes/ProductSceneRenderer"
import { minimumVitrineFixedDuration, VITRINE_MIN_EXCHANGE_MS, VITRINE_MIN_HOLD_MS, vitrineStoryTimeMs } from "./scenes/vitrine"
import { assertVitrineV2Settings, exclusiveVitrineOpening, firstEligibleVitrineItem, isVitrineV2, reconcileVitrineConfig, VITRINE_MAX_DURATION_MS, VITRINE_MAX_ITEMS } from "./vitrineConfig"
import { assertShelfV2Settings, exclusiveShelfSpotlight, isShelfV2 } from "./shelfConfig"
import { SHELF_MAX_DURATION_MS, SHELF_MAX_ITEMS } from "./scenes/shelf"
import { productUndoKeys, reconcileProductSceneConfig, resetShelfSourceGeometry, type ProductUndoEntry, type ProductUndoKey } from "./productSceneRuntime"
import QuietCarouselRenderer, { quietCarouselTimeline } from "./scenes/QuietCarouselRenderer"
import StyleGallery from "./StyleGallery"
import { ensureReelAPI } from "./runtime"
import { admitShelfVideos } from "./shelfVideoAdmission"
import { exportCycleClock } from "./exportClock"
import { defaultAudioIntent } from "./audio/audioTimeline"
import { admitShelfMediaItems, applyProjectOpenTransaction, createProjectMutationLane, projectOpenNotice, withDecoderAdmissionGate } from "./projectOpen"
import { styleProfile, styleSettings } from "./styleProfiles"
import { placeholderItems, studioTimeline } from "./timeline"
import { GALLERY_STYLES, galleryScene, galleryStyle, latestSceneVersion, sceneVariants, supportsSceneVersion, supportsVerifiedPngFrames, type StyleDefinition } from "./styleRegistry"
import { InterfaceScaleControl, InterfaceScaleSurface } from "./presentation/InterfaceScaleSurface"
import { positionTooltip, sharedTooltipDelayGroup, type TooltipInput } from "./presentation/tooltipPresentation"
import type {
    ExportFormat,
    ExportProgress,
    ExportRequest,
    BackgroundStyle,
    CanvasPreset,
    DroppedMediaResult,
    MediaItem,
    MotionPreset,
    PosterFrame,
    ReelConfig,
    ReelSettings,
    SelectedMedia,
    TimelineMode,
} from "./types"

const Reel = OpeningReel as React.ComponentType<Record<string, unknown>>
const reelAPI = ensureReelAPI()
const usesLinuxHostPort = reelAPI.platform === "linux" && Boolean(window.galleryHost)

const LOCAL_PROJECT_KEY = "galileo-gallery-project-v1"
const LOCAL_SAVED_AT_KEY = "galileo-gallery-saved-at-v1"
const RECOVERY_INTERVAL_MS = 2 * 60 * 1000

function normalizeConfig(value: Partial<ReelConfig> | null | undefined): ReelConfig {
    const styleId = value?.styleId ?? "opening-reel"
    const sceneVersion = value?.sceneVersion ?? 1
    if (!supportsSceneVersion(styleId, sceneVersion)) throw new Error(`Unsupported Gallery Scene version: ${styleId} v${sceneVersion}`)
    const strictShelf = styleId === "the-shelf" && sceneVersion === 2
    if (strictShelf && (value?.settings?.ratioMode !== "auto" || value.settings.axis !== "horizontal"
        || !["dark", "light"].includes(value.settings.theme ?? "")
        || !["solid", "transparent"].includes(value.settings.backgroundStyle ?? "")
        || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > SHELF_MAX_ITEMS
        || value.items.some((item) => item.aspectMode !== "auto"))) {
        throw new Error("Saved Shelf v2 Project geometry or room intent is invalid.")
    }
    const config = {
        schemaVersion: 2,
        styleId,
        sceneVersion,
        items: Array.isArray(value?.items)
            ? value.items.map((item) => ({
                  ...item,
                  aspectMode: strictShelf ? item.aspectMode : item.aspectMode ?? "auto",
                  ratioW: item.ratioW ?? 16,
                  ratioH: item.ratioH ?? 9,
                  fit: item.fit ?? (styleId === "vitrine" && sceneVersion === 2 ? "contain" : value?.settings?.imageFit ?? "contain"),
                  crop: item.crop ?? { x: 0, y: 0, width: 1, height: 1 },
                  focal: item.focal ?? { x: 0.5, y: 0.5 },
              }))
            : [],
        settings: { ...styleSettings(styleId, sceneVersion), ...(value?.settings ?? {}) },
        timelineMode: value?.timelineMode ?? "automatic",
        timelineFixedDurationMs: value?.timelineFixedDurationMs ?? 0,
        timelineSegments: value?.timelineSegments ?? [],
        audio: value?.audio ?? defaultAudioIntent(),
    }
    return reconcileProductSceneConfig(config)
}

function applyStyleDefaults(current: ReelSettings, styleId: string, sceneVersion = 1): ReelSettings {
    const next = styleSettings(styleId, sceneVersion)
    return {
        ...next,
        canvasPreset: current.canvasPreset,
        canvasWidth: current.canvasWidth,
        canvasHeight: current.canvasHeight,
        imageFit: current.imageFit,
        autoplayVideos: current.autoplayVideos,
        loopVideos: current.loopVideos,
        ratioMode: styleId === "the-shelf" && sceneVersion === 2 ? "auto" : current.ratioMode,
        fixedRatio: current.fixedRatio,
        customRatioWidth: current.customRatioWidth,
        customRatioHeight: current.customRatioHeight,
        backgroundStyle: current.backgroundStyle,
        ground: current.ground,
        paper: current.paper,
        backgroundColor2: current.backgroundColor2,
        exportQuality: current.exportQuality,
    }
}

type LocalProjectRead = {
    config: ReelConfig
    savedAt: number
    pendingShelf?: { config: ReelConfig; savedAt: number }
}

function readLocalProject(): LocalProjectRead {
    const empty = normalizeConfig(null)
    try {
        const saved = localStorage.getItem(LOCAL_PROJECT_KEY)
        if (saved) {
            const config = normalizeConfig(JSON.parse(saved) as Partial<ReelConfig>)
            const savedAt = Number(localStorage.getItem(LOCAL_SAVED_AT_KEY)) || 0
            if (isShelfV2(config)) return { config: empty, savedAt, pendingShelf: { config, savedAt } }
            return {
                config,
                savedAt,
            }
        }
    } catch {
        // A disk recovery snapshot gets a chance after mount.
    }
    return { config: empty, savedAt: 0 }
}

function savedTimeLabel(savedAt: number | null) {
    if (!savedAt) return "Autosave on"
    return "Saved locally"
}

function exportButtonLabel(format: ExportFormat) {
    if (format === "png-frames") return "verified PNG Frames"
    if (format === "premiere") return "Premiere MOV"
    if (format === "mp4") return "MP4"
    return "WebM"
}

const CANVAS_PRESETS: Record<Exclude<CanvasPreset, "custom">, { width: number; height: number; label: string; short: string }> = {
    fullHD: { width: 1920, height: 1080, label: "Full HD · 16:9", short: "Wide" },
    fourK: { width: 3840, height: 2160, label: "4K · 16:9", short: "4K" },
    square: { width: 1080, height: 1080, label: "Social Square · 1:1", short: "Square" },
    portrait: { width: 1080, height: 1350, label: "Feed Portrait · 4:5", short: "Portrait" },
    vertical: { width: 1080, height: 1920, label: "Reel / Story / Short · 9:16", short: "Vertical" },
    presentation: { width: 1920, height: 1200, label: "Presentation · 16:10", short: "Deck" },
    cinema: { width: 2560, height: 1080, label: "Cinema Wide · 64:27", short: "Cinema" },
} as const

const MOTION_BASES: Record<Exclude<MotionPreset, "custom">, Pick<ReelSettings, "launchMs" | "arrivalMs" | "growMs" | "exitMs">> = {
    cut: { launchMs: 70, arrivalMs: 85, growMs: 260, exitMs: 220 },
    magnetic: { launchMs: 120, arrivalMs: 160, growMs: 420, exitMs: 340 },
    velvet: { launchMs: 180, arrivalMs: 280, growMs: 560, exitMs: 460 },
    dream: { launchMs: 260, arrivalMs: 480, growMs: 820, exitMs: 700 },
}

type InspectorTab = "design" | "expert" | "export"

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

function evenDimension(value: number) {
    return Math.max(64, Math.min(7680, Math.round(value / 2) * 2))
}

function canvasOutput(settings: ReelSettings) {
    if (settings.canvasPreset === "custom") {
        return { width: evenDimension(settings.canvasWidth), height: evenDimension(settings.canvasHeight), label: "Custom", short: "Custom" }
    }
    return CANVAS_PRESETS[settings.canvasPreset]
}

function Icon({ name, size = 16 }: { name: string; size?: number }) {
    const common = {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        "aria-hidden": true,
    }
    if (name === "plus")
        return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
    if (name === "play")
        return <svg {...common}><path d="m8 5 11 7-11 7V5Z" /></svg>
    if (name === "spark")
        return <svg {...common}><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></svg>
    if (name === "mute")
        return <svg {...common}><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="m18 9-6 6M12 9l6 6" /></svg>
    if (name === "skip")
        return <svg {...common}><path d="m5 7 8 5-8 5V7Z" /><path d="M17 7v10" /></svg>
    if (name === "trash")
        return <svg {...common}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /></svg>
    if (name === "grip")
        return <svg {...common}><circle cx="9" cy="7" r=".7" fill="currentColor" stroke="none" /><circle cx="15" cy="7" r=".7" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r=".7" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r=".7" fill="currentColor" stroke="none" /><circle cx="9" cy="17" r=".7" fill="currentColor" stroke="none" /><circle cx="15" cy="17" r=".7" fill="currentColor" stroke="none" /></svg>
    if (name === "film")
        return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4" /></svg>
    if (name === "folder")
        return <svg {...common}><path d="M3 7h7l2 2h9v10H3V7Z" /></svg>
    if (name === "close")
        return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>
    if (name === "check")
        return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>
    return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>
}

function idForMedia(media: SelectedMedia) {
    return `${Date.now().toString(36)}-${media.name}-${Math.random().toString(36).slice(2, 7)}`
}

function Tooltip({ text, children }: { text: string; children: React.ReactElement }) {
    const anchor = React.useRef<HTMLSpanElement | null>(null)
    const timer = React.useRef<number | null>(null)
    const visible = React.useRef(false)
    const pointerFocus = React.useRef(false)
    const [position, setPosition] = React.useState<ReturnType<typeof positionTooltip> & { instant: boolean } | null>(null)
    const hide = React.useCallback(() => {
        pointerFocus.current = false
        if (timer.current != null) window.clearTimeout(timer.current)
        timer.current = null
        if (visible.current) sharedTooltipDelayGroup.hidden()
        visible.current = false
        setPosition(null)
    }, [])
    const show = (input: TooltipInput) => {
        if (timer.current != null) window.clearTimeout(timer.current)
        const intent = sharedTooltipDelayGroup.intent(input)
        timer.current = window.setTimeout(() => {
            const rect = anchor.current?.getBoundingClientRect()
            if (!rect) return
            visible.current = true
            sharedTooltipDelayGroup.shown()
            setPosition({ ...positionTooltip(rect, window.innerWidth), instant: intent.instant })
        }, intent.delayMs)
    }
    React.useEffect(() => () => {
        if (timer.current != null) window.clearTimeout(timer.current)
        if (visible.current) sharedTooltipDelayGroup.hidden()
    }, [])
    return (
        <span
            className="tooltip-anchor"
            ref={anchor}
            onPointerEnter={() => show("pointer")}
            onPointerLeave={hide}
            onPointerDownCapture={() => { pointerFocus.current = true }}
            onPointerUpCapture={() => { pointerFocus.current = false }}
            onPointerCancel={() => { pointerFocus.current = false }}
            onFocusCapture={() => { if (!pointerFocus.current) show("keyboard") }}
            onBlurCapture={hide}
        >
            {children}
            {position ? createPortal(<span className={`tooltip-bubble ${position.above ? "is-above" : "is-below"}`} data-instant={position.instant ? "true" : "false"} role="tooltip" style={{ left: position.left, top: position.top, width: position.width }}>{text}</span>, document.body) : null}
        </span>
    )
}

function mediaRatio(media: SelectedMedia): Promise<number> {
    return new Promise((resolve) => {
        if (media.type === "image") {
            const image = new Image()
            image.onload = () => resolve(image.naturalWidth / image.naturalHeight || 16 / 9)
            image.onerror = () => resolve(16 / 9)
            image.src = media.url
            return
        }
        const video = document.createElement("video")
        const finish = (ratio: number) => {
            video.removeAttribute("src")
            video.load()
            resolve(ratio)
        }
        video.onloadedmetadata = () => finish(video.videoWidth / video.videoHeight || 16 / 9)
        video.onerror = () => finish(16 / 9)
        video.preload = "metadata"
        video.src = media.url
    })
}

async function hydrateMedia(media: SelectedMedia[], createVideoPreviews = true): Promise<{ items: MediaItem[]; failures: string[] }> {
    const results: Array<MediaItem | undefined> = Array(media.length)
    const failures: string[] = []
    let cursor = 0
    const workers = Array.from({ length: Math.min(2, media.length) }, async () => {
        while (cursor < media.length) {
            const index = cursor++
            const item = media[index]
            try {
                const previewUrl = item.type === "video" && createVideoPreviews
                    ? await reelAPI.createVideoProxy(item.url)
                    : undefined
                const ratio = await mediaRatio(previewUrl ? { ...item, url: previewUrl } : item)
                results[index] = {
                    ...item,
                    id: idForMedia(item),
                    ratio,
                    aspectMode: "auto" as const,
                    ratioW: 16,
                    ratioH: 9,
                    fit: "contain" as const,
                    crop: { x: 0, y: 0, width: 1, height: 1 },
                    focal: { x: 0.5, y: 0.5 },
                    ...(previewUrl ? { previewUrl } : {}),
                    spotlight: false,
                    muted: false,
                }
            } catch {
                failures.push(item.name)
            }
        }
    })
    await Promise.all(workers)
    return { items: results.filter((item): item is MediaItem => item != null), failures }
}

async function admitShelfItems(items: MediaItem[]): Promise<MediaItem[]> {
    return admitShelfMediaItems(items, (sources) => admitShelfVideos(sources))
}

function sourceItems(items: MediaItem[]) {
    const source = items.length > 0 ? items : placeholderItems()
    return source.map((item) => {
        const aspectMode = item.aspectMode ?? "auto"
        const ratioW = aspectMode === "global" ? 0 : aspectMode === "custom" ? item.ratioW ?? 16 : item.ratio || 16 / 9
        const ratioH = aspectMode === "global" ? 0 : aspectMode === "custom" ? item.ratioH ?? 9 : 1
        return {
            mediaType: item.type,
            image: item.type === "image" && item.url ? { src: item.url, alt: item.name } : undefined,
            video: item.type === "video" ? item.previewUrl ?? item.url : undefined,
            caption: item.caption,
            spotlight: item.spotlight,
            muted: item.muted,
            ratioW,
            ratioH,
        }
    })
}

function reelProps(config: ReelConfig, canvasPose?: number, preparedSlides?: ReturnType<typeof sourceItems>) {
    const settings = config.settings
    return {
        slides: (preparedSlides ?? sourceItems(config.items)).map((slide) => ({ ...slide, spotlight: settings.spotlightsEnabled && slide.spotlight })),
        ratioMode: settings.ratioMode,
        fixedRatio: settings.fixedRatio,
        customRatioWidth: settings.customRatioWidth,
        customRatioHeight: settings.customRatioHeight,
        imageFit: settings.imageFit,
        autoplayVideos: settings.autoplayVideos,
        loopVideos: settings.loopVideos,
        paddingUnit: settings.paddingUnit,
        paddingTop: settings.paddingTop,
        paddingRight: settings.paddingRight,
        paddingBottom: settings.paddingBottom,
        paddingLeft: settings.paddingLeft,
        heroSize: settings.heroSize,
        finaleSize: settings.finaleSize,
        finaleEnabled: settings.finaleEnabled,
        centerBump: settings.centerBump,
        tilt: settings.tilt,
        sway: settings.sway,
        idleDim: settings.idleDim,
        idleMute: settings.idleMute,
        spotlightDim: settings.spotlightDim,
        speedBlur: settings.speedBlur,
        startMode: settings.startMode,
        playKind: settings.playKind,
        leadInMs: settings.leadInMs,
        paceMs: settings.paceMs,
        motionPreset: settings.motionPreset,
        launchMs: settings.launchMs,
        arrivalMs: settings.arrivalMs,
        growMs: settings.growMs,
        exitMs: settings.exitMs,
        holdMs: settings.holdMs,
        finaleGrowMs: settings.finaleGrowMs,
        finaleHoldMs: settings.finaleHoldMs,
        fadeMs: settings.fadeMs,
        canvasPose: canvasPose ?? settings.canvasPose,
        theme: settings.theme,
        ground: settings.ground || undefined,
        paper: settings.paper || undefined,
        backgroundStyle: settings.backgroundStyle,
        backgroundColor2: settings.backgroundColor2,
        backgroundAngle: settings.backgroundAngle,
        backgroundTexture: settings.backgroundTexture,
        slideHeight: settings.slideHeight,
        gap: settings.gap,
        direction: settings.direction,
        repeatCount: settings.repeatCount,
        cornerStyle: settings.cornerStyle,
        cornerSmoothing: settings.cornerSmoothing,
        captionGap: settings.captionGap,
        radius: settings.radius,
        shadow: settings.shadow,
        gridSize: settings.gridSize,
        gridStrength: settings.gridStrength,
        gridDrift: settings.gridDrift,
        vignette: settings.vignette,
        showHint: settings.showHint,
        style: { width: "100%", height: "100%" },
    }
}

function formatDuration(ms: number) {
    const seconds = ms / 1000
    return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`
}

function nextPaint() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function waitForExportFrameImages(expectVitrineMetrics = false) {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>("img.orl-export-frame, img.galileo-media, .qc-export-stage img, img.product-export-media, .shelf-stage img.shelf-media"))
    await Promise.all(images.map(async (image) => {
        try {
            await image.decode()
        } catch {
            await nextPaint()
            if (!image.isConnected) return
            throw new Error("Export video frame could not be decoded.")
        }
        if (!image.complete || image.naturalWidth < 1 || image.naturalHeight < 1) {
            throw new Error("Export video frame could not be decoded.")
        }
    }))
    for (let attempt = 0; attempt < 300; attempt += 1) {
        await nextPaint()
        if (document.querySelector('[data-media-failed="true"]')) throw new Error("Export source media could not be decoded.")
        const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video.product-export-media'))
        const stage = document.querySelector<HTMLElement>('.vitrine-stage[data-product-scene="vitrine"]')
        let vitrineMetricsReady = !expectVitrineMetrics
        if (expectVitrineMetrics && stage) {
            const style = getComputedStyle(stage)
            const width = Number.parseFloat(style.width)
            const height = Number.parseFloat(style.height)
            const expected = Math.min(width, height)
            const committed = Number(stage.dataset.vitrineShortEdge)
            const compensation = Number(stage.dataset.vitrineMetricCompensation)
            const cssValue = Number.parseFloat(style.getPropertyValue("--vitrine-short-edge"))
            const expectsPlacard = stage.dataset.vitrinePlacardExpected === "true"
            const placard = stage.querySelector<HTMLElement>(".vitrine-placard")
            const placardStyle = placard ? getComputedStyle(placard) : null
            const consumedGap = placardStyle ? Number.parseFloat(placardStyle.columnGap) : Number.NaN
            const placardStateReady = expectsPlacard
                ? Boolean(placardStyle && Number.isFinite(consumedGap) && Math.abs(consumedGap - expected * 0.0234375) <= 0.001)
                : !placard
            const transparentShadowReady = !placardStyle || document.documentElement.dataset.exportTransparent !== "true" || placardStyle.boxShadow === "none"
            vitrineMetricsReady = Number.isFinite(expected) && expected > 0
                && Math.abs(committed - expected) <= 0.001
                && Number.isFinite(compensation) && compensation > 0
                && Math.abs(cssValue - expected) <= 0.001
                && placardStateReady
                && transparentShadowReady
        }
        if (vitrineMetricsReady && videos.every((video) => video.dataset.storyReady === "true" && !video.seeking)) return
    }
    if (expectVitrineMetrics) throw new Error("Export Vitrine layout metrics or source video did not reach the requested frame.")
    throw new Error("Export source video did not reach the requested story frame.")
}

type ExportPayload = {
    exportId: string
    request: ExportRequest
    videoFrames: Record<number, { fps: number; frames: string[] }>
}

function exportFrameOverrides(payload: ExportPayload, timeMs: number) {
    const clock = exportCycleClock(payload.request, timeMs)
    const sourceTimeMs = payload.request.config.styleId === "vitrine" && payload.request.config.sceneVersion === 2
        ? vitrineStoryTimeMs(clock.timeMs, clock.durationMs, payload.request.config.settings.direction, clock.terminal)
        : clock.timeMs
    const nextFrames: Record<number, string> = {}
    for (const [key, set] of Object.entries(payload.videoFrames)) {
        if (!set.frames.length) continue
        const sourceFrame = Math.floor((sourceTimeMs / 1000) * set.fps)
        const frameIndex = payload.request.config.settings.loopVideos
            ? sourceFrame % set.frames.length
            : Math.min(sourceFrame, set.frames.length - 1)
        nextFrames[Number(key)] = set.frames[frameIndex]
    }
    return nextFrames
}

function ExportView() {
    const [payload, setPayload] = React.useState<ExportPayload | null>(null)
    const [timeMs, setTimeMs] = React.useState(0)
    const [frameOverrides, setFrameOverrides] = React.useState<Record<number, string>>({})
    const exportProps = React.useMemo(() => payload ? reelProps(payload.request.config) : null, [payload])

    React.useEffect(() => reelAPI.onExportInit((nextPayload) => {
        delete document.documentElement.dataset.exportFrameId
        delete document.documentElement.dataset.exportTimeMs
        setTimeMs(0)
        setFrameOverrides(exportFrameOverrides(nextPayload, 0))
        setPayload(nextPayload)
    }), [])
    React.useEffect(
        () =>
            reelAPI.onExportFrame(async (frame) => {
                delete document.documentElement.dataset.exportFrameId
                delete document.documentElement.dataset.exportTimeMs
                setTimeMs(frame.timeMs)
                setFrameOverrides(payload ? exportFrameOverrides(payload, frame.timeMs) : {})
                await nextPaint()
                await nextPaint()
                await waitForExportFrameImages(Boolean(payload && isAuthoredVitrine(payload.request.config)))
                await nextPaint()
                document.documentElement.dataset.exportFrameId = frame.frameId
                document.documentElement.dataset.exportTimeMs = String(frame.timeMs)
            }),
        [payload]
    )

    React.useEffect(() => {
        if (!payload) return
        if (payload.request.config.settings.backgroundStyle === "transparent") {
            document.documentElement.dataset.exportTransparent = "true"
        } else {
            delete document.documentElement.dataset.exportTransparent
        }
        let cancelled = false
        const prepare = async () => {
            await nextPaint()
            await nextPaint()
            await waitForExportFrameImages(Boolean(payload && isAuthoredVitrine(payload.request.config)))
            await nextPaint()
            if (!cancelled) reelAPI.exportReady(payload.exportId)
        }
        prepare()
        return () => {
            cancelled = true
            delete document.documentElement.dataset.exportTransparent
            delete document.documentElement.dataset.exportFrameId
            delete document.documentElement.dataset.exportTimeMs
        }
    }, [payload])

    if (!payload) return <div className="export-canvas" />
    const clock = exportCycleClock(payload.request, timeMs)
    const pose = (clock.timeMs / Math.max(1, clock.durationMs)) * 100
    return (
        <div className={`export-canvas ${payload.request.config.settings.backgroundStyle === "transparent" ? "is-transparent" : ""}`}>
            {payload.request.config.styleId === "quiet-carousel" ? (
                <QuietCarouselRenderer config={payload.request.config} timeMs={clock.timeMs} fps={payload.request.fps} exportFrames={frameOverrides} />
            ) : payload.request.config.styleId === "opening-reel" ? (
                <Reel {...exportProps} canvasPose={pose} canvasTimeMs={clock.timeMs} staticPose exportFrames={frameOverrides} />
            ) : (
                <ProductSceneRenderer
                    config={payload.request.config}
                    timeMs={clock.timeMs}
                    durationMs={clock.durationMs}
                    fps={payload.request.fps}
                    exportFrames={frameOverrides}
                    terminal={clock.terminal}
                    reducedMotion={false}
                    exportMode
                />
            )}
        </div>
    )
}

function Segment<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label?: string
    value: T
    options: Array<{ value: T; label: string }>
    onChange: (value: T) => void
}) {
    const moveFocus = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        const backward = event.key === "ArrowLeft" || event.key === "ArrowUp"
        const forward = event.key === "ArrowRight" || event.key === "ArrowDown"
        if (!backward && !forward && event.key !== "Home" && event.key !== "End") return
        event.preventDefault()
        const nextIndex = event.key === "Home"
            ? 0
            : event.key === "End"
                ? options.length - 1
                : (index + (forward ? 1 : -1) + options.length) % options.length
        const next = options[nextIndex]
        onChange(next.value)
        const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")
        buttons?.[nextIndex]?.focus()
    }
    return (
        <div className="segment" role="group" aria-label={label}>
            {options.map((option, index) => (
                <button
                    key={option.value}
                    type="button"
                    className={value === option.value ? "is-active" : ""}
                    aria-pressed={value === option.value}
                    tabIndex={value === option.value ? 0 : -1}
                    onClick={() => onChange(option.value)}
                    onKeyDown={(event) => moveFocus(event, index)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}

function RangeControl({
    label,
    value,
    min,
    max,
    step = 1,
    suffix,
    onChange,
    onBegin,
    onEnd,
}: {
    label: string
    value: number
    min: number
    max: number
    step?: number
    suffix?: string
    onChange: (value: number) => void
    onBegin?: () => void
    onEnd?: () => void
}) {
    const progress = clamp(((value - min) / Math.max(1, max - min)) * 100, 0, 100)
    const shiftArrow = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!event.shiftKey || !["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"].includes(event.key)) return
        event.preventDefault()
        const direction = ["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1
        onChange(clamp(value + direction * step * 10, min, max))
    }
    return (
        <div className="range-row">
            <span>{label}</span>
            <label className="range-value" aria-label={`${label} value`}>
                <input type="number" min={min} max={max} step={step} value={value} onFocus={onBegin} onBlur={onEnd} onKeyDown={shiftArrow} onChange={(event) => {
                    if (Number.isFinite(event.target.valueAsNumber)) onChange(clamp(event.target.valueAsNumber, min, max))
                }} />
                {suffix ? <small>{suffix}</small> : null}
            </label>
            <input
                aria-label={label}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                style={{ "--range-progress": `${progress}%` } as React.CSSProperties}
                onPointerDown={onBegin}
                onPointerUp={onEnd}
                onPointerCancel={onEnd}
                onLostPointerCapture={onEnd}
                onBlur={onEnd}
                onKeyDown={(event) => { onBegin?.(); shiftArrow(event) }}
                onKeyUp={onEnd}
                onChange={(event) => onChange(Number(event.target.value))}
            />
        </div>
    )
}

function AppView() {
    const initialProject = React.useRef(readLocalProject())
    const [config, setConfigState] = React.useState<ReelConfig>(initialProject.current.config)
    const [inspector, setInspector] = React.useState<InspectorTab>("design")
    const [expertTab, setExpertTab] = React.useState<ExpertTab>("slides")
    const [fps, setFps] = React.useState(30)
    const [format, setFormat] = React.useState<ExportFormat>(usesLinuxHostPort ? "png-frames" : "mp4")
    const [posterFrame, setPosterFrame] = React.useState<PosterFrame>("first")
    const [reelKey, setReelKey] = React.useState(0)
    const [startedAt, setStartedAt] = React.useState(() => performance.now())
    const [previewStarted, setPreviewStarted] = React.useState(false)
    const [playhead, setPlayhead] = React.useState(0)
    const [playIteration, setPlayIteration] = React.useState(1)
    const [progress, setProgress] = React.useState<ExportProgress | null>(null)
    const [lastExport, setLastExport] = React.useState<string | null>(null)
    const [lastPoster, setLastPoster] = React.useState<string | null>(null)
    const [lastExportFormat, setLastExportFormat] = React.useState<ExportFormat | null>(null)
    const [dragIndex, setDragIndex] = React.useState<number | null>(null)
    const [isDropping, setDropping] = React.useState(false)
    const [selectedItemId, setSelectedItemId] = React.useState<string | null>(config.items[0]?.id ?? null)
    const [inspectionItemId, setInspectionItemId] = React.useState<string | null>(null)
    const [freezePreview, setFreezePreview] = React.useState(false)
    const [isScrubbing, setIsScrubbing] = React.useState(false)
    const [scrubPaused, setScrubPaused] = React.useState(false)
    const [processingMedia, setProcessingMedia] = React.useState(0)
    const [recoveryReady, setRecoveryReady] = React.useState(false)
    const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(initialProject.current.savedAt || null)
    const [launchPhase, setLaunchPhase] = React.useState<"visible" | "leaving" | "gone">("visible")
    const [showStyleGallery, setShowStyleGallery] = React.useState(true)
    const [saveNotice, setSaveNotice] = React.useState<string | null>(null)
    const [projectOpening, setProjectOpening] = React.useState(false)
    const [decoderAdmissionGated, setDecoderAdmissionGated] = React.useState(false)
    const projectOpeningRef = React.useRef(false)
    const projectOpenExclusiveRef = React.useRef(false)
    const projectOpenCommitRef = React.useRef(false)
    const projectOpenCancelRequestedRef = React.useRef(false)
    const [documentVisible, setDocumentVisible] = React.useState(() => document.visibilityState !== "hidden")
    const [systemReducedMotion, setSystemReducedMotion] = React.useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
    const configRef = React.useRef(config)
    const configEpochRef = React.useRef(0)
    const [projectMutationLane] = React.useState(createProjectMutationLane)
    const hiddenAtRef = React.useRef<number | null>(null)
    const videoProxyJobs = React.useRef(new Set<string>())
    const playbackShapeRef = React.useRef("")
    const productUndoStackRef = React.useRef<ProductUndoEntry[]>([])
    const productTransactionRef = React.useRef<ProductUndoEntry | null>(null)
    const recoveryWriteBlockRef = React.useRef<{ config: ReelConfig; epoch: number } | null>(null)

    const applyConfig = React.useCallback((recipe: ReelConfig | ((current: ReelConfig) => ReelConfig)) => {
        if (projectOpenExclusiveRef.current && !projectOpenCommitRef.current) {
            setSaveNotice("Finish opening the Project before making another change.")
            return false
        }
        try {
            const current = configRef.current
            const candidate = typeof recipe === "function" ? recipe(current) : recipe
            const next = reconcileProductSceneConfig(candidate)
            configRef.current = next
            configEpochRef.current += 1
            setConfigState(next)
            return true
        } catch (error) {
            setSaveNotice(error instanceof Error ? error.message : "That Project change was rejected.")
            return false
        }
    }, [])

    const runWithDecoderAdmissionGate = React.useCallback(<T,>(work: () => Promise<T>) => withDecoderAdmissionGate({
        unmount: () => flushSync(() => setDecoderAdmissionGated(true)),
        paint: nextPaint,
        remount: () => flushSync(() => setDecoderAdmissionGated(false)),
    }, work), [])

    const recoveryWritesAllowed = React.useCallback((candidate: ReelConfig) => {
        const blocked = recoveryWriteBlockRef.current
        if (!blocked) return true
        if (candidate === blocked.config && configEpochRef.current === blocked.epoch) return false
        recoveryWriteBlockRef.current = null
        return true
    }, [])

    const output = canvasOutput(config.settings)
    const timeline = React.useMemo(
        () => studioTimeline(config, output.width, output.height),
        [config, output.width, output.height]
    )
    const quietTimeline = React.useMemo(() => quietCarouselTimeline(config, fps), [config, fps])
    const authoredSceneDuration = React.useMemo(() => productSceneDuration(config, fps), [config, fps])
    const duration = config.styleId === "quiet-carousel" ? quietTimeline.durationMs : authoredSceneDuration ?? timeline.durationMs
    const repeatCount = clamp(Math.round(config.settings.repeatCount), 1, 1000)
    const finalCycleDuration = React.useMemo(
        () => config.settings.playKind === "repeat"
            ? config.styleId === "quiet-carousel"
                ? duration
                : productSceneDuration({ ...config, settings: { ...config.settings, playKind: "once" } }, fps)
                    ?? studioTimeline({ ...config, settings: { ...config.settings, playKind: "once" } }, output.width, output.height).durationMs
            : duration,
        [config, duration, fps, output.height, output.width]
    )
    const playbackDuration = config.settings.playKind === "repeat"
        ? duration * (repeatCount - 1) + finalCycleDuration
        : duration
    const terminalCycle = config.settings.playKind === "once"
        || ((isAuthoredVitrine(config) || isShelfV2(config)) && config.settings.playKind === "repeat")
        || (config.settings.playKind === "repeat" && playIteration === repeatCount)
    const activeCycleDuration = terminalCycle && config.settings.playKind === "repeat" ? finalCycleDuration : duration
    const liveSlides = React.useMemo(() => sourceItems(config.items), [config.items])
    const activeStyle = galleryStyle(config.styleId)
    const activeScene = galleryScene(config.styleId)
    const verifiedH264Scene = usesLinuxHostPort && config.styleId === "quiet-carousel"
    const verifiedH264Audio = !config.audio || (config.audio.sampleRate === 48_000 && config.audio.channels === 2)
    const activeVariants = sceneVariants(config.styleId)
    const activeProfile = styleProfile(config.styleId, config.sceneVersion ?? 1)
    const authoredVitrine = isAuthoredVitrine(config)
    const authoredShelf = isShelfV2(config)
    const authoredProductScene = authoredVitrine || authoredShelf
    const reducedProductPreview = authoredProductScene && systemReducedMotion
    const shelfPngVideoBlocked = authoredShelf && config.items.some((item) => item.type === "video")
    const verifiedPngScene = usesLinuxHostPort && supportsVerifiedPngFrames(config.styleId, config.sceneVersion ?? 1) && !shelfPngVideoBlocked
    const directedPaceScale = authoredVitrine && config.timelineMode === "directed"
        ? Math.max(1, ...(config.timelineSegments ?? []).filter((segment) => segment.kind === "cycle" && segment.durationMs === 0).map((segment) => segment.paceScale))
        : 1
    const vitrineHoldMinimum = VITRINE_MIN_HOLD_MS * directedPaceScale
    const vitrineExchangeMinimum = VITRINE_MIN_EXCHANGE_MS * directedPaceScale
    const vitrineFixedMinimum = authoredVitrine
        ? minimumVitrineFixedDuration(Math.max(1, config.items.filter((item) => !item.muted).length), config.settings.holdMs, config.settings.paceMs)
        : 1_000
    const isOpeningReel = activeStyle.id === "opening-reel"
    const directionLabels = activeProfile.axisControl
        ? config.settings.axis === "vertical" ? ["Up", "Down"] as const : ["Left", "Right"] as const
        : activeProfile.directionLabels ?? ["Forward", "Reverse"] as const
    const isStaticPreview = freezePreview || isScrubbing || scrubPaused
    const previewPose = freezePreview ? config.settings.canvasPose / 100 : playhead
    const openingCanvasPose = isStaticPreview ? previewPose * 100 : undefined
    const liveReelProps = React.useMemo(
        () => reelProps(config, openingCanvasPose, liveSlides),
        [config, liveSlides, openingCanvasPose]
    )
    const previewRatio = output.width / output.height
    const previewStyle = React.useMemo(
        () => ({ width: `min(100%, calc((100vh - 210px) * ${previewRatio}))` }),
        [previewRatio]
    )
    const isExporting = progress && ["preparing", "rendering", "encoding", "verifying"].includes(progress.phase)
    const restart = React.useCallback(() => {
        setInspectionItemId(null)
        setReelKey((key) => key + 1)
        setStartedAt(performance.now())
        setPreviewStarted(!isOpeningReel && !freezePreview && !reducedProductPreview)
        setScrubPaused(false)
        setIsScrubbing(false)
        setPlayhead(0)
        setPlayIteration(1)
    }, [isOpeningReel, freezePreview, reducedProductPreview])

    const updateUndoDepth = React.useCallback(() => {
        const depth = String(productUndoStackRef.current.length)
        document.documentElement.dataset.productSceneUndoDepth = depth
        document.documentElement.dataset.vitrineUndoDepth = depth
    }, [])
    const clearProductUndo = React.useCallback(() => {
        productTransactionRef.current = null
        productUndoStackRef.current = []
        updateUndoDepth()
    }, [updateUndoDepth])
    const beginProductSetting = React.useCallback((key: keyof ReelSettings) => {
        const keys = productUndoKeys(configRef.current)
        if (!keys?.has(key) || productTransactionRef.current) return
        const undoKey = key as ProductUndoKey
        productTransactionRef.current = { key: undoKey, value: configRef.current.settings[undoKey] }
    }, [])
    const endProductSetting = React.useCallback((key: keyof ReelSettings) => {
        const transaction = productTransactionRef.current
        if (!transaction || transaction.key !== key) return
        productTransactionRef.current = null
        if (transaction.value !== configRef.current.settings[key]) {
            productUndoStackRef.current.push(transaction)
            if (productUndoStackRef.current.length > 100) productUndoStackRef.current.shift()
            updateUndoDepth()
        }
    }, [updateUndoDepth])
    const undoProductSetting = React.useCallback(() => {
        productTransactionRef.current = null
        const previous = productUndoStackRef.current.pop()
        if (!previous) return false
        if (!productUndoKeys(configRef.current)?.has(previous.key)) {
            clearProductUndo()
            return false
        }
        const sceneName = isShelfV2(configRef.current) ? "Shelf" : "Vitrine"
        if (!applyConfig((current) => ({ ...current, settings: { ...current.settings, [previous.key]: previous.value } }))) {
            productUndoStackRef.current.push(previous)
            updateUndoDepth()
            return false
        }
        setSaveNotice(`${sceneName} control change undone.`)
        updateUndoDepth()
        restart()
        const groupLabel = previous.key === "transitionDirection" ? "Exchange direction" : previous.key === "showHint" ? "Placard" : previous.key === "direction" ? "Direction" : null
        if (groupLabel) requestAnimationFrame(() => document.querySelector<HTMLElement>(`.segment[aria-label="${groupLabel}"] button[aria-pressed="true"]`)?.focus())
        return true
    }, [applyConfig, clearProductUndo, restart, updateUndoDepth])

    React.useEffect(() => updateUndoDepth(), [updateUndoDepth])

    const playbackShape = [
        config.settings.axis,
        config.settings.direction,
        config.settings.motionPreset,
        config.settings.playKind,
        repeatCount,
    ].join(":")

    React.useEffect(() => {
        if (!playbackShapeRef.current) {
            playbackShapeRef.current = playbackShape
            return
        }
        if (playbackShapeRef.current === playbackShape) return
        playbackShapeRef.current = playbackShape
        restart()
    }, [playbackShape, restart])

    const handlePlaybackStart = React.useCallback(() => {
        setInspectionItemId(null)
        setStartedAt(performance.now())
        setPreviewStarted(true)
        setScrubPaused(false)
        setPlayhead(0)
        setPlayIteration(1)
    }, [])

    const transportAction = React.useCallback(() => {
        setInspectionItemId(null)
        if (reducedProductPreview) {
            setPreviewStarted(false)
            setScrubPaused(true)
            return
        }
        if (!scrubPaused || isOpeningReel || playhead >= 0.999) {
            restart()
            return
        }
        setScrubPaused(false)
        setStartedAt(performance.now() - playhead * duration)
        setPreviewStarted(true)
    }, [duration, isOpeningReel, playhead, reducedProductPreview, restart, scrubPaused])

    const beginScrub = React.useCallback(() => {
        setInspectionItemId(null)
        setIsScrubbing(true)
        setScrubPaused(true)
        setPreviewStarted(false)
    }, [])

    const finishScrub = React.useCallback(() => {
        setIsScrubbing(false)
        setScrubPaused(true)
        setPreviewStarted(false)
    }, [])

    const setScrubPosition = React.useCallback((value: number) => {
        setInspectionItemId(null)
        setScrubPaused(true)
        setPreviewStarted(false)
        setPlayhead(clamp(value, 0, 1))
    }, [])

    const handleFreezePreview = React.useCallback((value: boolean) => {
        setFreezePreview(value)
        if (value) {
            setPreviewStarted(false)
            setScrubPaused(true)
            setPlayhead(config.settings.canvasPose / 100)
        } else {
            setScrubPaused(false)
            setReelKey((key) => key + 1)
            setStartedAt(performance.now())
            setPreviewStarted(!isOpeningReel && !reducedProductPreview)
            setPlayhead(0)
        }
    }, [config.settings.canvasPose, isOpeningReel, reducedProductPreview])

    React.useEffect(() => {
        const query = window.matchMedia?.("(prefers-reduced-motion: reduce)")
        if (!query) return
        const update = () => setSystemReducedMotion(query.matches)
        query.addEventListener("change", update)
        return () => query.removeEventListener("change", update)
    }, [])

    React.useEffect(() => {
        if (format === "mp4" && ((usesLinuxHostPort && (!verifiedH264Scene || !verifiedH264Audio)) || config.settings.backgroundStyle === "transparent")) {
            setFormat(usesLinuxHostPort ? "png-frames" : "webm")
        }
    }, [config.settings.backgroundStyle, format, usesLinuxHostPort, verifiedH264Audio, verifiedH264Scene])

    React.useEffect(() => {
        if (!recoveryReady || authoredProductScene) return
        const missing = config.items.filter((item) => {
            const jobKey = `${item.id}:${item.url}`
            return item.type === "video" && !item.previewUrl && !videoProxyJobs.current.has(jobKey)
        })
        const availableWorkers = Math.max(0, 2 - videoProxyJobs.current.size)
        missing.slice(0, availableWorkers).forEach((item) => {
            const jobKey = `${item.id}:${item.url}`
            videoProxyJobs.current.add(jobKey)
            setProcessingMedia((count) => count + 1)
            reelAPI
                .createVideoProxy(item.url)
                .then((previewUrl) => projectMutationLane.run(async () => {
                    const current = configRef.current
                    if (isVitrineV2(current) || isShelfV2(current)
                        || !current.items.some((currentItem) => currentItem.id === item.id && currentItem.url === item.url)) return
                    applyConfig((current) => ({
                        ...current,
                        items: current.items.map((currentItem) =>
                            currentItem.id === item.id && currentItem.url === item.url
                                ? { ...currentItem, previewUrl }
                                : currentItem
                        ),
                    }))
                }))
                .catch(() => setSaveNotice(`Could not prepare ${item.name} for preview.`))
                .finally(() => {
                    videoProxyJobs.current.delete(jobKey)
                    setProcessingMedia((count) => Math.max(0, count - 1))
                })
        })
    }, [applyConfig, authoredProductScene, config.items, playIteration, previewPose, processingMedia, projectMutationLane, recoveryReady, showStyleGallery])

    React.useEffect(() => {
        if (!selectedItemId && config.items[0]) setSelectedItemId(config.items[0].id)
        if (selectedItemId && !config.items.some((item) => item.id === selectedItemId)) {
            setSelectedItemId(config.items[0]?.id ?? null)
        }
    }, [config.items, selectedItemId])

    React.useEffect(() => {
        if (!authoredVitrine || (inspectionItemId && !config.items.some((item) => item.id === inspectionItemId))) setInspectionItemId(null)
    }, [authoredVitrine, config.items, inspectionItemId])

    React.useEffect(() => {
        if (isStaticPreview) document.documentElement.dataset.reelStatic = "true"
        else delete document.documentElement.dataset.reelStatic
        return () => {
            delete document.documentElement.dataset.reelStatic
        }
    }, [isStaticPreview])

    React.useEffect(() => {
        let alive = true
        void (async () => {
            let diskRecovery: Awaited<ReturnType<typeof reelAPI.loadRecovery>> = null
            try {
                diskRecovery = await reelAPI.loadRecovery()
            } catch {
                // Local autosave remains available if recovery file is unavailable.
            }

            let candidate = initialProject.current.pendingShelf
            if (diskRecovery && diskRecovery.savedAt > initialProject.current.savedAt) {
                try {
                    candidate = { config: normalizeConfig(diskRecovery.config), savedAt: diskRecovery.savedAt }
                } catch {
                    // Invalid disk recovery cannot displace a valid local candidate or current Project.
                }
            }
            if (!candidate || !alive) return

            await projectMutationLane.run(async () => {
                if (!alive) return
                const baseline = configRef.current
                const recoveryEpoch = configEpochRef.current
                try {
                    const restore = async () => {
                        const recovered = isShelfV2(candidate.config)
                            ? normalizeConfig({ ...candidate.config, items: await admitShelfItems(candidate.config.items) })
                            : candidate.config
                        if (!alive || configRef.current !== baseline || configEpochRef.current !== recoveryEpoch) return
                        clearProductUndo()
                        if (applyConfig(recovered)) setLastSavedAt(candidate.savedAt)
                    }
                    if (isShelfV2(candidate.config)) await runWithDecoderAdmissionGate(restore)
                    else await restore()
                } catch {
                    if (isShelfV2(candidate.config) && alive && configRef.current === baseline && configEpochRef.current === recoveryEpoch) {
                        recoveryWriteBlockRef.current = { config: baseline, epoch: recoveryEpoch }
                    }
                    // Failed Shelf admission preserves current Project and leaves recovery available for next launch.
                }
            })
        })().finally(() => {
            if (alive) setRecoveryReady(true)
        })
        return () => {
            alive = false
        }
    }, [applyConfig, clearProductUndo, projectMutationLane, runWithDecoderAdmissionGate])

    React.useEffect(() => {
        if (!recoveryReady || !recoveryWritesAllowed(config)) return
        const savedAt = Date.now()
        localStorage.setItem(LOCAL_PROJECT_KEY, JSON.stringify(config))
        localStorage.setItem(LOCAL_SAVED_AT_KEY, String(savedAt))
        setLastSavedAt(savedAt)
    }, [config, recoveryReady, recoveryWritesAllowed])

    React.useEffect(() => {
        if (!recoveryReady || !recoveryWritesAllowed(config)) return
        let alive = true
        const timer = window.setTimeout(async () => {
            const savedAt = Date.now()
            try {
                await reelAPI.saveRecovery({ config, savedAt })
                if (alive) setLastSavedAt(savedAt)
            } catch {
                // Instant local autosave still protects current work.
            }
        }, 750)
        return () => {
            alive = false
            window.clearTimeout(timer)
        }
    }, [config, recoveryReady, recoveryWritesAllowed])

    React.useEffect(() => {
        if (!recoveryReady) return
        let alive = true
        const checkpoint = async () => {
            if (!recoveryWritesAllowed(configRef.current)) return
            const savedAt = Date.now()
            try {
                await reelAPI.saveRecovery({ config: configRef.current, savedAt })
                if (alive) setLastSavedAt(savedAt)
            } catch {
                // Instant local autosave still protects current work.
            }
        }
        void checkpoint()
        const interval = window.setInterval(checkpoint, RECOVERY_INTERVAL_MS)
        return () => {
            alive = false
            window.clearInterval(interval)
        }
    }, [recoveryReady, recoveryWritesAllowed])

    React.useEffect(() => {
        if (!recoveryReady) return
        const leave = window.setTimeout(() => setLaunchPhase("leaving"), 650)
        const finish = window.setTimeout(() => setLaunchPhase("gone"), 1200)
        return () => {
            window.clearTimeout(leave)
            window.clearTimeout(finish)
        }
    }, [recoveryReady])

    React.useEffect(() => {
        if (!saveNotice) return
        const timer = window.setTimeout(() => setSaveNotice(null), 3200)
        return () => window.clearTimeout(timer)
    }, [saveNotice])

    React.useEffect(() => {
        const onVisibilityChange = () => {
            const now = performance.now()
            if (document.visibilityState === "hidden") {
                hiddenAtRef.current = now
                setDocumentVisible(false)
                return
            }
            const hiddenAt = hiddenAtRef.current
            hiddenAtRef.current = null
            if (hiddenAt != null) setStartedAt((current) => current + now - hiddenAt)
            setDocumentVisible(true)
        }
        document.addEventListener("visibilitychange", onVisibilityChange)
        return () => document.removeEventListener("visibilitychange", onVisibilityChange)
    }, [])

    React.useEffect(() => {
        let raf = 0
        if (reducedProductPreview || !previewStarted) {
            if (!scrubPaused && !freezePreview && !isScrubbing) setPlayhead(0)
            return
        }
        if (!documentVisible) return
        const tick = () => {
            const elapsed = performance.now() - startedAt
            if (config.settings.playKind === "loop") {
                setPlayhead((elapsed % duration) / duration)
                setPlayIteration(Math.floor(elapsed / duration) + 1)
                raf = requestAnimationFrame(tick)
                return
            }
            if (config.settings.playKind === "repeat") {
                if (elapsed >= playbackDuration) {
                    setPlayhead(1)
                    setPlayIteration(repeatCount)
                    return
                }
                const finishedLoops = Math.min(repeatCount - 1, Math.floor(elapsed / duration))
                const finalCycle = finishedLoops === repeatCount - 1
                const cycleElapsed = finalCycle ? elapsed - duration * (repeatCount - 1) : elapsed % duration
                setPlayIteration(finishedLoops + 1)
                setPlayhead(cycleElapsed / (finalCycle ? finalCycleDuration : duration))
                raf = requestAnimationFrame(tick)
                return
            }
            setPlayhead(Math.min(1, elapsed / duration))
            if (elapsed < duration) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [startedAt, duration, finalCycleDuration, playbackDuration, repeatCount, reelKey, previewStarted, config.settings.playKind, documentVisible, freezePreview, isScrubbing, scrubPaused, reducedProductPreview])

    React.useEffect(
        () =>
            reelAPI.onExportProgress((next) => {
                setProgress(next)
                if (next.phase === "done" && next.outputPath) setLastExport(next.outputPath)
                if (next.phase === "done" && next.posterPath) setLastPoster(next.posterPath)
            }),
        []
    )

    React.useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null
            const textEditing = Boolean(target && (target.tagName === "TEXTAREA" || target.isContentEditable
                || (target.tagName === "INPUT" && (target as HTMLInputElement).type !== "range")))
            if (!textEditing && (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z" && undoProductSetting()) {
                event.preventDefault()
                return
            }
            if (target && ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName)) return
            if (event.code === "Space" || event.key.toLowerCase() === "r") {
                event.preventDefault()
                transportAction()
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [transportAction, undoProductSetting])

    const addMedia = async (media?: SelectedMedia[], expectedEpoch = configEpochRef.current): Promise<{ committed: number; rejected: number } | null> => {
        if (projectOpeningRef.current || isExporting) return null
        return projectMutationLane.run(async () => {
            if (projectOpeningRef.current || isExporting) return null
            const picked = media ?? (await reelAPI.pickMedia())
            if (!picked.length) return { committed: 0, rejected: 0 }
            if (configEpochRef.current !== expectedEpoch) {
                setSaveNotice("Project changed while media was being chosen. Nothing was added.")
                return null
            }
            const baseline = configRef.current
            if (isVitrineV2(baseline) && baseline.items.length + picked.length > VITRINE_MAX_ITEMS) {
                setSaveNotice(`Vitrine supports at most ${VITRINE_MAX_ITEMS} ordered media items. Nothing was added.`)
                return null
            }
            if (isShelfV2(baseline) && baseline.items.length + picked.length > SHELF_MAX_ITEMS) {
                setSaveNotice(`Shelf supports at most ${SHELF_MAX_ITEMS} ordered media items. Nothing was added.`)
                return null
            }
            const videoCount = picked.filter((item) => item.type === "video").length
            if (videoCount) setProcessingMedia((count) => count + videoCount)
            try {
                const prepare = async () => {
                    const hydrated = await hydrateMedia(picked, !isVitrineV2(baseline) && !isShelfV2(baseline))
                    let preparedItems = hydrated.items
                    if (isShelfV2(baseline)) preparedItems = await admitShelfItems(preparedItems)
                    if (configEpochRef.current !== expectedEpoch || configRef.current !== baseline) {
                        setSaveNotice("Project changed while media was being prepared. Nothing was added.")
                        return null
                    }
                    if (preparedItems.length && !applyConfig({ ...baseline, items: [...baseline.items, ...preparedItems] })) return null
                    if (hydrated.failures.length) setSaveNotice(`${preparedItems.length} added · ${hydrated.failures.length} could not be prepared`)
                    if (preparedItems.length) restart()
                    return { committed: preparedItems.length, rejected: hydrated.failures.length }
                }
                return isShelfV2(baseline) ? await runWithDecoderAdmissionGate(prepare) : await prepare()
            } catch (error) {
                setSaveNotice(error instanceof Error ? error.message : "Could not prepare that media.")
                return null
            } finally {
                if (videoCount) setProcessingMedia((count) => Math.max(0, count - videoCount))
            }
        })
    }

    const inspectLibraryItem = React.useCallback((id: string) => {
        setSelectedItemId(id)
        if (!authoredVitrine) return
        setInspectionItemId(id)
        setPreviewStarted(false)
        setScrubPaused(true)
        setIsScrubbing(false)
    }, [authoredVitrine])

    const updateSettings = <K extends keyof ReelSettings>(key: K, value: ReelSettings[K]) => {
        const before = configRef.current
        if (before.settings[key] === value) return
        const undoKey = key as ProductUndoKey
        const undoable = Boolean(productUndoKeys(before)?.has(key))
        const settings = (() => {
            if (key === "motionPreset") {
                const preset = value as MotionPreset
                return preset === "custom"
                    ? { ...before.settings, motionPreset: preset }
                    : { ...before.settings, ...MOTION_BASES[preset], motionPreset: preset }
            }
            if (["launchMs", "arrivalMs", "growMs", "exitMs"].includes(key)) {
                const base = before.settings.motionPreset === "custom"
                    ? {}
                    : MOTION_BASES[before.settings.motionPreset]
                return { ...before.settings, ...base, [key]: value, motionPreset: "custom" as const }
            }
            return { ...before.settings, [key]: value }
        })()
        let next = { ...before, settings }
        if (isVitrineV2(before) && key === "spotlightsEnabled" && value === true && !before.items.some((item) => item.spotlight && !item.muted)) {
            const opening = firstEligibleVitrineItem(before.items)
            if (opening) next = { ...next, items: exclusiveVitrineOpening(before.items, opening.id) }
        }
        if (isShelfV2(before) && key === "spotlightsEnabled" && value === true && !before.items.some((item) => item.spotlight && !item.muted)) {
            const opening = before.items.find((item) => !item.muted)
            if (opening) next = { ...next, items: exclusiveShelfSpotlight(before.items, opening.id) }
        }
        if (isVitrineV2(before) && before.timelineMode === "fixed-duration" && ["holdMs", "paceMs"].includes(key)) {
            next = {
                ...next,
                timelineFixedDurationMs: Math.max(before.timelineFixedDurationMs ?? 0, minimumVitrineFixedDuration(Math.max(1, before.items.filter((item) => !item.muted).length), settings.holdMs, settings.paceMs)),
            }
        }
        if (!applyConfig(next)) return
        if (undoable && !productTransactionRef.current) {
            productUndoStackRef.current.push({ key: undoKey, value: before.settings[undoKey] })
            if (productUndoStackRef.current.length > 100) productUndoStackRef.current.shift()
            updateUndoDepth()
        }
    }

    const updateTimelineMode = (mode: TimelineMode) => {
        const current = configRef.current
        if (!isVitrineV2(current) && !isShelfV2(current)) return
        const mediaCount = Math.max(1, current.items.filter((item) => !item.muted).length)
        let applied = false
        if (mode === "automatic") {
            applied = applyConfig({ ...current, timelineMode: mode, timelineFixedDurationMs: 0, timelineSegments: [] })
        } else if (mode === "fixed-duration") {
            applied = applyConfig({
                ...current,
                timelineMode: mode,
                timelineFixedDurationMs: isShelfV2(current)
                    ? Math.max(1_000, current.timelineFixedDurationMs ?? 0)
                    : Math.max(current.timelineFixedDurationMs ?? 0, mediaCount * (current.settings.holdMs + current.settings.paceMs), minimumVitrineFixedDuration(mediaCount, current.settings.holdMs, current.settings.paceMs)),
                timelineSegments: [],
            })
        } else {
            applied = applyConfig({
                ...current,
                timelineMode: mode,
                timelineFixedDurationMs: 0,
                settings: isShelfV2(current) ? current.settings : {
                    ...current.settings,
                    holdMs: Math.max(current.settings.holdMs, VITRINE_MIN_HOLD_MS * 2),
                    paceMs: Math.max(current.settings.paceMs, VITRINE_MIN_EXCHANGE_MS * 2),
                },
                timelineSegments: [
                    { id: "fast-opening", kind: "cycle", cycles: 2, paceScale: 2, durationMs: 0 },
                    { id: "regular-middle", kind: "cycle", cycles: 1, paceScale: 1, durationMs: 0 },
                    { id: "fast-finale", kind: "cycle", cycles: 1, paceScale: 2, durationMs: 0 },
                ],
            })
        }
        if (applied) restart()
    }

    const setCanvasPreset = (preset: CanvasPreset) => {
        const applied = applyConfig((current) => {
            const dimensions = preset === "custom" ? null : CANVAS_PRESETS[preset]
            return {
                ...current,
                settings: {
                    ...current.settings,
                    canvasPreset: preset,
                    ...(dimensions ? { canvasWidth: dimensions.width, canvasHeight: dimensions.height } : {}),
                },
            }
        })
        if (applied) restart()
    }

    const updateItem = (id: string, patch: Partial<MediaItem>) => {
        const current = configRef.current
        if (isVitrineV2(current) && patch.muted === true && current.items.filter((item) => !item.muted && item.id !== id).length === 0) {
            setSaveNotice("Vitrine needs one eligible opening/finale object. This frame was kept in the story.")
            return
        }
        applyConfig((source) => {
            if (isShelfV2(source)) {
                let items = source.items.map((item) => (item.id === id ? { ...item, ...patch } : item))
                let settings = source.settings
                if (patch.spotlight === true) {
                    items = exclusiveShelfSpotlight(items, id)
                    settings = { ...settings, spotlightsEnabled: true }
                } else if (patch.spotlight === false && source.items.find((item) => item.id === id)?.spotlight) {
                    items = exclusiveShelfSpotlight(items, null)
                    settings = { ...settings, spotlightsEnabled: false }
                } else if (patch.muted === true && source.items.find((item) => item.id === id)?.spotlight) {
                    const replacement = items.find((item) => !item.muted)
                    items = exclusiveShelfSpotlight(items, replacement?.id ?? null)
                    settings = { ...settings, spotlightsEnabled: Boolean(replacement) }
                }
                return { ...source, settings, items }
            }
            if (!isVitrineV2(source)) return { ...source, items: source.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) }
            let items = source.items.map((item) => (item.id === id ? { ...item, ...patch } : item))
            let settings = source.settings
            if (patch.spotlight === true) {
                items = exclusiveVitrineOpening(items, id)
                settings = { ...settings, spotlightsEnabled: true }
            } else if (patch.spotlight === false && source.items.find((item) => item.id === id)?.spotlight) {
                items = exclusiveVitrineOpening(items, null)
                settings = { ...settings, spotlightsEnabled: false }
            } else if (patch.muted === true && source.items.find((item) => item.id === id)?.spotlight) {
                const replacement = firstEligibleVitrineItem(items)
                items = exclusiveVitrineOpening(items, replacement?.id ?? null)
                settings = { ...settings, spotlightsEnabled: Boolean(replacement) }
            }
            return { ...source, settings, items }
        })
    }

    const applyExpertPreset = (preset: ExpertPreset) => {
        const patches: Record<Exclude<ExpertPreset, "original">, Partial<ReelSettings>> = {
            fast: { motionPreset: "cut", paceMs: 150, holdMs: 550, finaleGrowMs: 520, finaleHoldMs: 1800, tilt: 12, speedBlur: 2 },
            velvet: { motionPreset: "velvet", paceMs: 300, holdMs: 1200, finaleGrowMs: 1000, finaleHoldMs: 3200, tilt: 8, sway: 55 },
            mixed: { ratioMode: "auto", imageFit: "contain", paddingUnit: "percent", paddingTop: 1.2, paddingRight: 1.2, paddingBottom: 1.2, paddingLeft: 1.2, gap: 36, slideHeight: 46 },
        }
        if (productUndoKeys(configRef.current)) clearProductUndo()
        const applied = applyConfig((current) => {
            if (isShelfV2(current)) return resetShelfSourceGeometry({
                ...current,
                settings: {
                    ...applyStyleDefaults(current.settings, current.styleId, 2),
                    ratioMode: "auto",
                    axis: "horizontal",
                    theme: current.settings.theme === "light" ? "light" : "dark",
                    backgroundStyle: current.settings.backgroundStyle === "transparent" ? "transparent" : "solid",
                },
                timelineMode: "automatic",
                timelineFixedDurationMs: 0,
                timelineSegments: [],
            })
            if (isVitrineV2(current)) return reconcileVitrineConfig({
                ...current,
                settings: applyStyleDefaults(current.settings, current.styleId, 2),
                timelineMode: "automatic",
                timelineFixedDurationMs: 0,
                timelineSegments: [],
            })
            return {
                ...current,
                settings: preset === "original"
                    ? applyStyleDefaults(current.settings, current.styleId, current.sceneVersion ?? 1)
                    : {
                      ...current.settings,
                      ...(patches[preset].motionPreset && patches[preset].motionPreset !== "custom" ? MOTION_BASES[patches[preset].motionPreset] : {}),
                      ...patches[preset],
                    },
            }
        })
        if (applied) restart()
    }

    const removeItem = (id: string) => {
        if (isShelfV2(configRef.current) && configRef.current.items.length <= 1) {
            setSaveNotice("Shelf needs at least one ordered media item. The last edition was kept.")
            return
        }
        const applied = applyConfig((current) => {
            let items = current.items.filter((item) => item.id !== id)
            if (isShelfV2(current)) {
                const marker = items.find((item) => item.spotlight && !item.muted)
                if (current.settings.spotlightsEnabled && !marker) items = exclusiveShelfSpotlight(items, items.find((item) => !item.muted)?.id ?? null)
                return { ...current, items }
            }
            if (!isVitrineV2(current) || items.length === 0) return { ...current, items }
            if (items.every((item) => item.muted)) items = items.map((item, index) => index === 0 ? { ...item, muted: false } : item)
            const marker = items.find((item) => item.spotlight && !item.muted)
            if (current.settings.spotlightsEnabled && !marker) items = exclusiveVitrineOpening(items, firstEligibleVitrineItem(items)?.id ?? null)
            return reconcileVitrineConfig({ ...current, items })
        })
        if (applied) restart()
    }

    const moveItem = (from: number, to: number) => {
        if (from === to) return
        const applied = applyConfig((current) => {
            const items = [...current.items]
            const [item] = items.splice(from, 1)
            items.splice(to, 0, item)
            return { ...current, items }
        })
        if (applied) restart()
    }

    const exportReel = async () => {
        if (isExporting) return
        const exportConfig = configRef.current
        const requestedFormat = format
        if (usesLinuxHostPort && requestedFormat === "png-frames" && !verifiedPngScene) {
            setProgress({ exportId: "failed", phase: "error", progress: 0, message: shelfPngVideoBlocked ? "Verified Shelf PNG Frames currently support still images only." : "Verified PNG Frames currently support Quiet Carousel v1, Vitrine v2, and image-only Shelf v2." })
            return
        }
        if (usesLinuxHostPort && requestedFormat === "mp4" && (!verifiedH264Scene || !verifiedH264Audio)) {
            setProgress({ exportId: "failed", phase: "error", progress: 0, message: !verifiedH264Scene ? "Verified H.264/AAC currently supports Quiet Carousel only. Choose PNG Frames for this Scene." : "Verified H.264/AAC requires a 48 kHz stereo Project audio master. Choose PNG Frames or update Project audio." })
            return
        }
        setLastExport(null)
        setLastPoster(null)
        setLastExportFormat(requestedFormat)
        setInspector("export")
        setProgress({ exportId: "png-pending", phase: "preparing", progress: 0, message: "Creating an immutable export snapshot…" })
        try {
            const result = await reelAPI.exportReel({
                config: { ...exportConfig, settings: { ...exportConfig.settings, repeatCount } },
                width: output.width,
                height: output.height,
                fps,
                durationMs: playbackDuration,
                cycleDurationMs: duration,
                finalCycleDurationMs: finalCycleDuration,
                format: requestedFormat,
                posterFrame,
                quality: config.settings.exportQuality,
            })
            if (result.cancelled) setProgress({ exportId: "png-cancelled", phase: "cancelled", progress: 0, message: "Export cancelled." })
        } catch (error) {
            setProgress({
                exportId: "failed",
                phase: "error",
                progress: 0,
                message: error instanceof Error ? error.message : String(error),
            })
        }
    }

    const saveProject = async () => {
        try {
            const result = await reelAPI.saveProject(configRef.current)
            if (!result.cancelled) setSaveNotice("Project saved · media included")
        } catch (error) {
            setSaveNotice(error instanceof Error ? error.message : "Project save failed")
        }
    }

    const openProject = async () => {
        if (projectOpeningRef.current) return
        projectOpeningRef.current = true
        projectOpenCancelRequestedRef.current = false
        setProjectOpening(true)
        setSaveNotice("Opening project…")
        try {
            const application = await projectMutationLane.run(() => runWithDecoderAdmissionGate(async () => {
                projectOpenExclusiveRef.current = true
                try {
                    return await applyProjectOpenTransaction({
                        current: () => ({ config: configRef.current, epoch: configEpochRef.current }),
                        open: () => projectOpenCancelRequestedRef.current ? Promise.resolve({ cancelled: true as const }) : reelAPI.openProject(),
                        normalize: normalizeConfig,
                        cancelled: () => projectOpenCancelRequestedRef.current,
                        stillCurrent: (baseline, epoch) => configRef.current === baseline && configEpochRef.current === epoch,
                        accept: (operationId) => reelAPI.acceptProjectOpen(operationId),
                        discard: (operationId) => reelAPI.discardProjectOpen(operationId),
                        commit: (next) => {
                            projectOpenCommitRef.current = true
                            try { return applyConfig(next) } finally { projectOpenCommitRef.current = false }
                        },
                    })
                } finally {
                    projectOpenExclusiveRef.current = false
                }
            }))
            if (application.state === "cancelled" || application.state === "failure") {
                setSaveNotice(projectOpenNotice(application.result))
                return
            }
            if (application.state === "stale") {
                setSaveNotice("Project changed while opening. The opened candidate was not applied.")
                return
            }
            const next = application.config
            clearProductUndo()
            setSaveNotice("Project opened")
            setSelectedItemId(next.items[0]?.id ?? null)
            setInspectionItemId(null)
            restart()
        } catch (error) {
            setSaveNotice(error instanceof Error ? error.message : "Project open failed")
        } finally {
            projectOpeningRef.current = false
            projectOpenCancelRequestedRef.current = false
            setProjectOpening(false)
        }
    }

    const cancelProjectOpen = async () => {
        projectOpenCancelRequestedRef.current = true
        await reelAPI.cancelProjectOpen()
    }

    const saveTemplate = async () => {
        try {
            const result = await reelAPI.saveTemplate(configRef.current.settings)
            if (!result.cancelled) setSaveNotice("Template saved")
        } catch (error) {
            setSaveNotice(error instanceof Error ? error.message : "Template save failed")
        }
    }

    const openTemplate = async () => {
        if (projectOpeningRef.current) return
        await projectMutationLane.run(async () => {
            const baseline = configRef.current
            const templateEpoch = configEpochRef.current
            try {
                const result = await reelAPI.openTemplate()
                if (!result.settings) return
                if (configEpochRef.current !== templateEpoch || configRef.current !== baseline) {
                    setSaveNotice("Project changed while the template was opening. Nothing was applied.")
                    return
                }
                const settings = { ...styleSettings(baseline.styleId, baseline.sceneVersion ?? 1), ...result.settings }
                if (isVitrineV2(baseline)) assertVitrineV2Settings(settings)
                if (isShelfV2(baseline)) assertShelfV2Settings(settings)
                if (!applyConfig({ ...baseline, settings })) return
                clearProductUndo()
                setSaveNotice("Template applied")
                restart()
            } catch (error) {
                setSaveNotice(error instanceof Error ? error.message : "Template open failed")
            }
        })
    }

    const finaleId = config.settings.finaleEnabled
        ? [...config.items].reverse().find((item) => !item.muted)?.id
        : undefined

    const chooseStyle = async (style: StyleDefinition) => {
        if (projectOpeningRef.current || isExporting) return
        try {
            await projectMutationLane.run(async () => {
                if (projectOpeningRef.current || isExporting) return
                const current = configRef.current
                const styleEpoch = configEpochRef.current
                const sceneVersion = latestSceneVersion(style.id)
                if (style.id === "vitrine" && sceneVersion === 2 && current.items.length < 1) {
                    setSaveNotice("Add at least one photo or video before choosing Vitrine.")
                    setShowStyleGallery(false)
                    return
                }
                if (style.id === "vitrine" && sceneVersion === 2 && current.items.length > VITRINE_MAX_ITEMS) {
                    setSaveNotice(`Vitrine supports at most ${VITRINE_MAX_ITEMS} ordered media items. Remove ${current.items.length - VITRINE_MAX_ITEMS} before choosing it.`)
                    setShowStyleGallery(false)
                    return
                }
                if (style.id === "the-shelf" && sceneVersion === 2 && current.items.length < 1) {
                    setSaveNotice("Add at least one photo or video before choosing Shelf.")
                    setShowStyleGallery(false)
                    return
                }
                if (style.id === "the-shelf" && sceneVersion === 2 && current.items.length > SHELF_MAX_ITEMS) {
                    setSaveNotice(`Shelf supports at most ${SHELF_MAX_ITEMS} ordered media items. Remove ${current.items.length - SHELF_MAX_ITEMS} before choosing it.`)
                    setShowStyleGallery(false)
                    return
                }
                const defaults = applyStyleDefaults(current.settings, style.id, sceneVersion)
                const settings = style.id === "vitrine" && sceneVersion === 2
                    ? { ...defaults, axis: "horizontal" as const, backgroundStyle: defaults.backgroundStyle === "transparent" ? "transparent" as const : "solid" as const }
                    : style.id === "the-shelf" && sceneVersion === 2
                        ? {
                            ...defaults,
                            ratioMode: "auto" as const,
                            axis: "horizontal" as const,
                            theme: defaults.theme === "light" ? "light" as const : "dark" as const,
                            backgroundStyle: defaults.backgroundStyle === "transparent" ? "transparent" as const : "solid" as const,
                        }
                    : defaults
                let candidate = normalizeConfig({
                    ...current,
                    schemaVersion: 2,
                    styleId: style.id,
                    sceneVersion,
                    settings,
                    ...(style.id === "the-shelf" && sceneVersion === 2 ? { items: current.items.map((item) => ({ ...item, aspectMode: "auto" as const })) } : {}),
                    ...((style.id === "vitrine" || style.id === "the-shelf") && sceneVersion === 2 ? { timelineMode: "automatic" as const, timelineFixedDurationMs: 0, timelineSegments: [] } : {}),
                })
                const admitAndCommit = async () => {
                    if (isShelfV2(candidate)) candidate = normalizeConfig({ ...candidate, items: await admitShelfItems(candidate.items) })
                    if (configRef.current !== current || configEpochRef.current !== styleEpoch) {
                        setSaveNotice("Project changed while Shelf media was being admitted. Nothing was applied.")
                        return
                    }
                    if (!applyConfig(candidate)) return
                    clearProductUndo()
                    setInspectionItemId(null)
                    setShowStyleGallery(false)
                    setReelKey((key) => key + 1)
                    setStartedAt(performance.now())
                    setPreviewStarted(style.id !== "opening-reel")
                    setScrubPaused(false)
                    setPlayhead(0)
                    setPlayIteration(1)
                }
                if (isShelfV2(candidate)) await runWithDecoderAdmissionGate(admitAndCommit)
                else await admitAndCommit()
            })
        } catch (error) {
            setSaveNotice(error instanceof Error ? error.message : "Could not prepare Shelf media.")
        }
    }

    if (showStyleGallery) {
        return (
            <StyleGallery
                currentStyleId={config.styleId}
                onChoose={chooseStyle}
                onClose={config.styleId ? () => setShowStyleGallery(false) : undefined}
            />
        )
    }

    return (
        <div
            className={`app-shell platform-${reelAPI.platform} ${isDropping ? "is-dropping" : ""}`}
            onDragOver={(event) => {
                event.preventDefault()
                if (event.dataTransfer.types.includes("Files")) setDropping(true)
            }}
            onDragLeave={(event) => {
                const next = event.relatedTarget as Node | null
                if (!next || !event.currentTarget.contains(next)) setDropping(false)
            }}
            onDrop={async (event) => {
                event.preventDefault()
                setDropping(false)
                if (projectOpeningRef.current || isExporting) {
                    setSaveNotice("Finish the current Project operation before adding media.")
                    return
                }
                const dropEpoch = configEpochRef.current
                const results: DroppedMediaResult[] = await Promise.all(
                    Array.from(event.dataTransfer.files).map(reelAPI.getDroppedFile)
                )
                const media = results.flatMap((result) => result.accepted ? [result.media] : [])
                const rejected = results.filter((result) => !result.accepted)
                const admitted = await addMedia(media, dropEpoch)
                if (admitted && (rejected.length || admitted.rejected)) {
                    const rejectedCount = rejected.length + admitted.rejected
                    setSaveNotice(`${admitted.committed ? `${admitted.committed} added · ` : ""}${rejectedCount} unsupported ${rejectedCount === 1 ? "item" : "items"} skipped`)
                }
            }}
        >
            <header className="titlebar">
                <div className="brand-lockup">
                    <img className="galileo-app-icon compact" src="./icon.png" alt="" aria-hidden="true" />
                    <div>
                        <strong>Galileo Gallery</strong>
                        <span>{activeScene.name} · {activeStyle.presetName} · {config.items.length || activeProfile.recommendedItems} frames · {formatDuration(playbackDuration)}</span>
                    </div>
                </div>
                <div className="autosave-status" aria-live="polite">
                    <i />{saveNotice ?? savedTimeLabel(lastSavedAt)}
                </div>
                <div className="title-actions">
                    <InterfaceScaleControl />
                    <button className="button quiet" type="button" disabled={projectOpening || Boolean(isExporting)} onClick={() => setShowStyleGallery(true)}>
                        <Icon name="spark" /> Scenes
                    </button>
                    <details className="project-menu">
                        <summary className="button quiet"><Icon name="folder" /> Project</summary>
                        <div>
                            <button type="button" disabled={projectOpening || Boolean(isExporting)} onClick={(event) => { void openProject(); event.currentTarget.closest("details")?.removeAttribute("open") }}>Open project</button>
                            <button type="button" onClick={(event) => { void saveProject(); event.currentTarget.closest("details")?.removeAttribute("open") }}>Save project <small>media + progress</small></button>
                            <span />
                            <button type="button" disabled={projectOpening || Boolean(isExporting) || processingMedia > 0} onClick={(event) => { void openTemplate(); event.currentTarget.closest("details")?.removeAttribute("open") }}>Apply template</button>
                            <button type="button" onClick={(event) => { void saveTemplate(); event.currentTarget.closest("details")?.removeAttribute("open") }}>Save template <small>settings only</small></button>
                        </div>
                    </details>
                    {projectOpening ? (
                        <button className="button quiet" type="button" onClick={() => void cancelProjectOpen()}>
                            Cancel open
                        </button>
                    ) : null}
                    <button className="button quiet" type="button" onClick={restart}>
                        <Icon name="play" /> Restart
                    </button>
                    <button className="button primary compact" type="button" onClick={() => setInspector("export")}>
                        Export
                    </button>
                </div>
            </header>

            <aside className="library panel-material">
                <div className="panel-heading">
                    <div>
                        <span className="eyebrow">01 · Sequence</span>
                        <h2>Slides</h2>
                    </div>
                    <button className="icon-button" type="button" aria-label="Add media" disabled={projectOpening || Boolean(isExporting)} onClick={() => void addMedia()}>
                        <Icon name="plus" />
                    </button>
                </div>
                <div className="library-scroll">
                    {config.items.length === 0 ? (
                        <button className="empty-library" type="button" disabled={projectOpening || Boolean(isExporting)} onClick={() => void addMedia()}>
                            <span className="empty-orbit"><Icon name="film" size={23} /></span>
                            <strong>Bring your frames</strong>
                            <span>Drop photos, GIFs, or videos here. Add one file or many.</span>
                        </button>
                    ) : (
                        <div className="media-list">
                            <p className="visually-hidden" id="media-reorder-help">Use Alt plus an arrow key to move the focused frame earlier or later in the sequence.</p>
                            {config.items.map((item, index) => (
                                <article
                                    className={`media-row ${dragIndex === index ? "is-dragging" : ""} ${selectedItemId === item.id ? "is-selected" : ""}`}
                                    key={item.id}
                                    draggable
                                    onDragStart={() => setDragIndex(index)}
                                    onDragEnd={() => setDragIndex(null)}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={() => {
                                        if (dragIndex != null) moveItem(dragIndex, index)
                                        setDragIndex(null)
                                    }}
                                >
                                    <button
                                        className="media-select"
                                        type="button"
                                        tabIndex={selectedItemId === item.id ? 0 : -1}
                                        aria-label={`${item.name}, item ${index + 1} of ${config.items.length}`}
                                        aria-describedby="media-reorder-help"
                                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
                                        data-library-item={item.id}
                                        onClick={() => inspectLibraryItem(item.id)}
                                        onKeyDown={(event) => {
                                            if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
                                                && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
                                                event.preventDefault()
                                                const nextIndex = index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1)
                                                if (nextIndex < 0 || nextIndex >= config.items.length) return
                                                moveItem(index, nextIndex)
                                                setSaveNotice(`${item.name} moved to position ${nextIndex + 1} of ${config.items.length}`)
                                                requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-library-item="${CSS.escape(item.id)}"]`)?.focus())
                                                return
                                            }
                                            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
                                            if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
                                            event.preventDefault()
                                            const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? config.items.length - 1
                                                : (index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) + config.items.length) % config.items.length
                                            const nextItem = config.items[nextIndex]
                                            inspectLibraryItem(nextItem.id)
                                            requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-library-item="${CSS.escape(nextItem.id)}"]`)?.focus())
                                        }}
                                    >
                                        <span className="drag-handle"><Icon name="grip" /></span>
                                        <div className="media-thumb">
                                            {item.type === "video" && (authoredProductScene || decoderAdmissionGated) ? (
                                                <div className="deferred-video-thumbnail" aria-label="Video thumbnail deferred"><Icon name="film" size={20} /></div>
                                            ) : item.type === "video" ? (
                                                <video src={item.previewUrl ?? item.url} muted autoPlay loop playsInline preload="auto" />
                                            ) : (
                                                <img src={item.url} alt="" />
                                            )}
                                            <span>{String(index + 1).padStart(2, "0")}</span>
                                        </div>
                                        <div className="media-copy">
                                            <strong title={item.name}>{item.name}</strong>
                                            <div>
                                                {finaleId === item.id ? <span className="finale-pill">Finale</span> : null}
                                                {item.muted ? <span>Beat skipped</span> : item.spotlight ? <span>{authoredProductScene ? "Opening" : "Spotlight"}</span> : <span>{item.type}</span>}
                                            </div>
                                        </div>
                                    </button>
                                    <div className="media-actions">
                                        {activeProfile.supportsSpotlight && (!authoredProductScene || config.settings.playKind !== "loop") ? <Tooltip text={item.spotlight ? `Remove ${authoredProductScene ? "opening object" : activeProfile.focusLabel.toLowerCase()}. Frame returns to normal flow.` : authoredProductScene ? "Use as the finite presentation's opening object." : `${activeProfile.focusLabel}. Uses this Scene's ${activeProfile.focusBehavior} beat without leaving the canvas.`}><button
                                            type="button"
                                            className={item.spotlight ? "is-active" : ""}
                                            aria-label={item.spotlight ? `Remove ${authoredProductScene ? "opening object" : "spotlight"}` : `Make ${authoredProductScene ? "opening object" : "spotlight"}`}
                                            onClick={() => updateItem(item.id, { spotlight: !item.spotlight })}
                                        >
                                            <Icon name="spark" />
                                        </button></Tooltip> : null}
                                        {!authoredProductScene || config.settings.playKind !== "loop" ? <Tooltip text="Skip story beat. Frame stays in the Project, but cannot become the finite opening or finale."><button
                                            type="button"
                                            className={item.muted ? "is-active danger" : ""}
                                            aria-label={item.muted ? "Include as story beat" : "Skip as story beat"}
                                            onClick={() => updateItem(item.id, { muted: !item.muted })}
                                        >
                                            <Icon name="skip" />
                                        </button></Tooltip> : null}
                                        <Tooltip text={authoredShelf && config.items.length <= 1 ? "Shelf needs one ordered media item." : "Remove frame from this project."}><button type="button" aria-label="Remove frame" disabled={authoredShelf && config.items.length <= 1} onClick={() => removeItem(item.id)}>
                                            <Icon name="trash" />
                                        </button></Tooltip>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
                <button className="add-media" type="button" disabled={projectOpening || Boolean(isExporting)} onClick={() => void addMedia()}>
                    <Icon name="plus" /> Add photos or videos
                </button>
            </aside>

            <main className="studio">
                <div className="stage-meta" style={previewStyle}>
                    <span>Preview</span>
                    <span>{output.width} × {output.height} · {fps} fps</span>
                </div>
                <div className={`stage-shell ${config.settings.backgroundStyle === "transparent" ? "is-transparent" : ""}`} style={{ ...previewStyle, aspectRatio: `${output.width} / ${output.height}` }}>
                    <div className="stage" key={reelKey} onClick={!isOpeningReel ? transportAction : undefined}>
                        {decoderAdmissionGated ? (
                            <div data-decoder-admission-gate="true" aria-hidden="true" />
                        ) : config.styleId === "quiet-carousel" ? (
                            <QuietCarouselRenderer config={config} timeMs={previewPose * activeCycleDuration} fps={fps} />
                        ) : isOpeningReel ? (
                            <Reel {...liveReelProps} staticPose={isStaticPreview} onPlaybackStart={handlePlaybackStart} />
                        ) : (
                            <ProductSceneRenderer config={config} timeMs={previewPose * activeCycleDuration} durationMs={activeCycleDuration} fps={fps} terminal={terminalCycle} reducedMotion={reducedProductPreview} inspectionItemId={inspectionItemId} />
                        )}
                    </div>
                    {processingMedia > 0 ? (
                        <div className="processing-overlay" role="status" aria-live="polite">
                            <span className="processing-orbit" aria-hidden="true"><i /></span>
                            <strong>Preparing {processingMedia === 1 ? "video" : `${processingMedia} videos`}</strong>
                            <small>Building a smooth local preview…</small>
                            <span className="processing-bar" aria-hidden="true"><i /></span>
                        </div>
                    ) : null}
                    <span className="stage-sheen" aria-hidden="true" />
                </div>
                <div className="transport" style={previewStyle}>
                    <Tooltip text={scrubPaused ? "Play from this frame." : "Restart animation. Space or R works too."}><button className="transport-play" type="button" aria-label={scrubPaused ? "Play from scrubbed position" : "Restart animation"} onClick={transportAction}>
                        <Icon name="play" size={15} />
                    </button></Tooltip>
                    <input
                        className="timeline"
                        type="range"
                        min={0}
                        max={1}
                        step={0.001}
                        value={playhead}
                        aria-label="Scrub animation timeline"
                        style={{ "--timeline-progress": `${playhead * 100}%` } as React.CSSProperties}
                        onPointerDown={beginScrub}
                        onPointerUp={finishScrub}
                        onPointerCancel={finishScrub}
                        onKeyDown={beginScrub}
                        onKeyUp={finishScrub}
                        onChange={(event) => setScrubPosition(Number(event.target.value))}
                    />
                        <time>{formatDuration(playhead * activeCycleDuration)} / {formatDuration(activeCycleDuration)}{config.settings.playKind === "repeat" ? ` · ${playIteration}/${repeatCount}` : ""}</time>
                </div>
                <p className="studio-note">Drag timeline to inspect any frame. Space plays again.{activeProfile.directional ? ` Moving ${config.settings.direction === "reverse" ? directionLabels[1] : directionLabels[0]}.` : ""}</p>
            </main>

            <aside className="inspector panel-material">
                <div className="inspector-top">
                    <Segment
                        label="Slides, Look, Motion, Export workflow"
                        value={inspector}
                        options={[{ value: "design", label: "Look" }, { value: "expert", label: "Motion" }, { value: "export", label: "Export" }]}
                        onChange={setInspector}
                    />
                </div>

                {inspector === "design" ? (
                    <div className="inspector-scroll">
                        <section className="control-section style-current-panel">
                            <div className="section-title">
                                <span className="eyebrow">Scene</span>
                                <h3>{activeScene.name}</h3>
                            </div>
                            <p>{activeStyle.description}</p>
                            <p className="profile-guidance">Best for {activeProfile.bestFor.toLowerCase()}. {activeProfile.transparentReady ? "Ready for transparent overlays." : "Best with its authored room tone."}</p>
                            {activeVariants.length > 1 ? <label className="scene-preset-select"><span>Scene preset</span><select value={activeStyle.id} onChange={(event) => { void chooseStyle(galleryStyle(event.target.value)) }}>{activeVariants.map((variant) => <option value={variant.id} key={variant.id}>{variant.presetName} · {variant.source.replace(".tsx", "")}</option>)}</select></label> : null}
                            <button type="button" className="button quiet" onClick={() => setShowStyleGallery(true)}>Browse all {GALLERY_STYLES.length} Scenes</button>
                        </section>
                        <section className="control-section">
                            <div className="section-title">
                                <span className="eyebrow">Canvas</span>
                                <h3>Shape the room</h3>
                            </div>
                            <div className="canvas-preset-grid">
                                {(["fullHD", "square", "portrait", "vertical", "cinema"] as CanvasPreset[]).map((preset) => {
                                    const item = CANVAS_PRESETS[preset as Exclude<CanvasPreset, "custom">]
                                    return (
                                        <button type="button" className={config.settings.canvasPreset === preset ? "is-active" : ""} onClick={() => setCanvasPreset(preset)} key={preset}>
                                            <i style={{ aspectRatio: `${item.width} / ${item.height}` }} />
                                            <span>{item.short}</span>
                                        </button>
                                    )
                                })}
                            </div>
                            <p className="preset-note">{output.label} · {output.width}×{output.height}</p>
                        </section>
                        <section className="control-section">
                            <div className="section-title">
                                <span className="eyebrow">Rhythm</span>
                                <h3>Motion feel</h3>
                            </div>
                            {!authoredProductScene ? <div className="motion-grid">
                                {(["cut", "magnetic", "velvet", "dream"] as MotionPreset[]).map((preset) => (
                                    <button
                                        type="button"
                                        className={config.settings.motionPreset === preset ? "is-active" : ""}
                                        onClick={() => updateSettings("motionPreset", preset)}
                                        key={preset}
                                    >
                                        <i />{preset}
                                    </button>
                                ))}
                            </div> : null}
                            {authoredVitrine && config.settings.playKind === "once" ? <p className="preset-note">Finite entry, opening hold, selected finale exchange, finale hold, and exit use Vitrine's authored phrase.</p> : <>
                                <RangeControl label={authoredVitrine ? "Loop exchange" : authoredShelf ? "Walking pace" : isOpeningReel ? "River pace" : "Motion pace"} value={config.settings.paceMs} min={authoredVitrine ? vitrineExchangeMinimum : authoredShelf ? 180 : 60} max={authoredVitrine ? 1800 : 8000} step={authoredVitrine ? 20 : 10} suffix="ms" onChange={(value) => updateSettings("paceMs", value)} />
                                {authoredVitrine ? <RangeControl label="Loop readable hold" value={config.settings.holdMs} min={vitrineHoldMinimum} max={6000} step={10} suffix="ms" onChange={(value) => updateSettings("holdMs", value)} /> : null}
                            </>}
                        </section>
                        <section className="control-section">
                            <div className="section-title">
                                <span className="eyebrow">Playback</span>
                                <h3>End behavior</h3>
                            </div>
                            <Segment
                                label="End behavior"
                                value={config.settings.playKind}
                                options={[{ value: "once", label: "Once" }, { value: "repeat", label: "Loop ×" }, { value: "loop", label: "Forever" }]}
                                onChange={(value) => updateSettings("playKind", value)}
                            />
                            {config.settings.playKind === "repeat" ? <RangeControl label="Loop count" value={config.settings.repeatCount} min={1} max={1000} suffix="×" onChange={(value) => updateSettings("repeatCount", Math.round(value))} /> : null}
                            {authoredProductScene ? <div className="playback-direction">
                                <span>Timeline</span>
                                <Segment label="Timeline mode" value={config.timelineMode ?? "automatic"} options={authoredShelf || config.settings.playKind === "loop" ? [{ value: "automatic", label: "Auto" }, { value: "fixed-duration", label: "Fixed" }, { value: "directed", label: "Directed" }] : [{ value: "automatic", label: "Auto" }, { value: "fixed-duration", label: "Fixed" }]} onChange={updateTimelineMode} />
                            </div> : null}
                            {authoredProductScene && config.timelineMode === "fixed-duration" ? <RangeControl label="Exact duration" value={Math.max(config.timelineFixedDurationMs ?? 0, authoredShelf ? 1_000 : vitrineFixedMinimum)} min={authoredShelf ? 1_000 : vitrineFixedMinimum} max={authoredShelf ? SHELF_MAX_DURATION_MS : VITRINE_MAX_DURATION_MS} step={1} suffix="ms" onChange={(value) => applyConfig((current) => ({ ...current, timelineFixedDurationMs: value }))} /> : null}
                            {authoredProductScene && config.timelineMode === "directed" ? <p className="preset-note">Fast ×2 → regular ×1 → fast ×1. Holds remain still; every exchange uses the same evaluator.</p> : null}
                            {activeProfile.axisControl ? <div className="playback-direction">
                                <span>Axis</span>
                                <Segment value={config.settings.axis} options={[{ value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }]} onChange={(value) => updateSettings("axis", value)} />
                            </div> : null}
                            {activeProfile.directional && !authoredVitrine ? <div className="playback-direction">
                                <span>Direction</span>
                                <Segment label="Direction" value={config.settings.direction} options={[{ value: "forward", label: directionLabels[0] }, { value: "reverse", label: directionLabels[1] }]} onChange={(value) => updateSettings("direction", value)} />
                            </div> : null}
                            {authoredVitrine ? <div className="playback-direction">
                                <span>Story order</span>
                                <Segment value={config.settings.direction} options={[{ value: "forward", label: "Forward" }, { value: "reverse", label: "Reverse" }]} onChange={(value) => updateSettings("direction", value)} />
                            </div> : null}
                            <p className="preset-note">{config.settings.playKind === "loop" ? "Seamless website preview. Motion returns to its first pose." : config.settings.playKind === "repeat" ? `${repeatCount} complete showcase cycles.` : "One authored showcase cycle."}</p>
                        </section>
                        <section className="control-section">
                            <div className="section-title">
                                <span className="eyebrow">Story</span>
                                <h3>Scale & presence</h3>
                            </div>
                            {authoredVitrine ? <>
                                <RangeControl label="Presentation scale · height cap" value={config.settings.slideHeight} min={42} max={78} suffix="%" onBegin={() => beginProductSetting("slideHeight")} onEnd={() => endProductSetting("slideHeight")} onChange={(value) => updateSettings("slideHeight", value)} />
                                <RangeControl label="Object turn" value={config.settings.tilt} min={0} max={9} step={0.25} suffix="°" onBegin={() => beginProductSetting("tilt")} onEnd={() => endProductSetting("tilt")} onChange={(value) => updateSettings("tilt", value)} />
                                <RangeControl label="Transition depth" value={config.settings.sway} min={8} max={30} suffix="%" onBegin={() => beginProductSetting("sway")} onEnd={() => endProductSetting("sway")} onChange={(value) => updateSettings("sway", value)} />
                                <div className="playback-direction"><span>Exchange direction</span><Segment label="Exchange direction" value={config.settings.transitionDirection} options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} onChange={(value) => updateSettings("transitionDirection", value)} /></div>
                                {config.settings.playKind !== "loop" ? <>
                                    <div className="playback-direction"><span>Opening object</span><Segment value={config.settings.spotlightsEnabled ? "marked" : "first"} options={[{ value: "marked", label: "Marked" }, { value: "first", label: "First" }]} onChange={(value) => updateSettings("spotlightsEnabled", value === "marked")} /></div>
                                    <div className="playback-direction"><span>Finite finale</span><Segment value={config.settings.finaleEnabled ? "on" : "off"} options={[{ value: "on", label: "Last frame" }, { value: "off", label: "Same object" }]} onChange={(value) => updateSettings("finaleEnabled", value === "on")} /></div>
                                </> : <p className="preset-note">Opening and finale choices are saved for Once/Repeat; Forever uses the ordered loop only.</p>}
                                <div className="playback-direction"><span>Placard</span><Segment label="Placard" value={config.settings.showHint ? "on" : "off"} options={[{ value: "on", label: "Visible" }, { value: "off", label: "Clean" }]} onChange={(value) => updateSettings("showHint", value === "on")} /></div>
                                <p className="preset-note">Artwork stays opacity 1, filter none, and normal blend through holds and exchanges.</p>
                            </> : authoredShelf ? <>
                                {config.settings.playKind !== "loop" ? <>
                                    <div className="playback-direction"><span>Opening edition</span><Segment value={config.settings.spotlightsEnabled ? "marked" : "first"} options={[{ value: "marked", label: "Marked" }, { value: "first", label: "First" }]} onChange={(value) => updateSettings("spotlightsEnabled", value === "marked")} /></div>
                                    <div className="playback-direction"><span>Finite finale</span><Segment value={config.settings.finaleEnabled ? "on" : "off"} options={[{ value: "on", label: "Last frame" }, { value: "off", label: "Opening frame" }]} onChange={(value) => updateSettings("finaleEnabled", value === "on")} /></div>
                                </> : <p className="preset-note">Opening and finale choices stay saved while Forever walks the unbroken shelf.</p>}
                                <RangeControl label="Card height" value={config.settings.slideHeight} min={28} max={58} step={1} suffix="%" onBegin={() => beginProductSetting("slideHeight")} onEnd={() => endProductSetting("slideHeight")} onChange={(value) => updateSettings("slideHeight", value)} />
                                <RangeControl label="Breathing room" value={config.settings.gap} min={8} max={120} step={1} suffix="px" onBegin={() => beginProductSetting("gap")} onEnd={() => endProductSetting("gap")} onChange={(value) => updateSettings("gap", value)} />
                                <RangeControl label="Edition lean" value={config.settings.tilt} min={0} max={6} step={0.25} suffix="°" onBegin={() => beginProductSetting("tilt")} onEnd={() => endProductSetting("tilt")} onChange={(value) => updateSettings("tilt", value)} />
                                <RangeControl label="Shelf lift" value={config.settings.centerBump} min={3} max={14} step={0.5} suffix="%" onBegin={() => beginProductSetting("centerBump")} onEnd={() => endProductSetting("centerBump")} onChange={(value) => updateSettings("centerBump", value)} />
                                <p className="preset-note">Natural source geometry stays fixed. Fit, crop, and focal point change pixels inside the plane only.</p>
                            </> : <>
                                {activeProfile.supportsSpotlight ? <Segment value={config.settings.spotlightsEnabled ? "on" : "off"} options={[{ value: "on", label: `${activeProfile.focusLabel} on` }, { value: "off", label: "Off" }]} onChange={(value) => updateSettings("spotlightsEnabled", value === "on")} /> : null}
                                {activeProfile.supportsFinale ? <Segment value={config.settings.finaleEnabled ? "on" : "off"} options={[{ value: "on", label: "Final beat on" }, { value: "off", label: "Off" }]} onChange={(value) => updateSettings("finaleEnabled", value === "on")} /> : null}
                                {activeProfile.supportsSpotlight && config.settings.spotlightsEnabled ? <RangeControl label={`${activeProfile.focusLabel} size`} value={config.settings.heroSize} min={24} max={80} suffix="%" onChange={(value) => updateSettings("heroSize", value)} /> : null}
                                {activeProfile.supportsFinale && config.settings.finaleEnabled ? <RangeControl label="Final beat size" value={config.settings.finaleSize} min={30} max={84} suffix="%" onChange={(value) => updateSettings("finaleSize", value)} /> : null}
                                <RangeControl label={isOpeningReel ? "Frame height" : "Frame size"} value={config.settings.slideHeight} min={15} max={100} suffix="%" onChange={(value) => updateSettings("slideHeight", value)} />
                                <RangeControl label="Breathing room" value={config.settings.gap} min={0} max={240} suffix="px" onChange={(value) => updateSettings("gap", value)} />
                                <Segment value={config.settings.cornerStyle} options={[{ value: "squircle", label: "Squircle" }, { value: "rounded", label: "Rounded" }]} onChange={(value) => updateSettings("cornerStyle", value)} />
                                {config.settings.cornerStyle === "squircle" ? <RangeControl label="Corner smoothing" value={config.settings.cornerSmoothing} min={0} max={100} suffix="%" onChange={(value) => updateSettings("cornerSmoothing", value)} /> : null}
                                <RangeControl label="Corner radius" value={config.settings.radius} min={0} max={96} suffix="px" onChange={(value) => updateSettings("radius", value)} />
                            </>}
                        </section>
                        <section className="control-section">
                            <div className="section-title">
                                <span className="eyebrow">Atmosphere</span>
                                <h3>Room tone</h3>
                            </div>
                            {config.settings.backgroundStyle !== "transparent" ? <Segment
                                value={config.settings.theme}
                                options={[{ value: "dark", label: "Night" }, { value: "light", label: "Paper" }]}
                                onChange={(value) => updateSettings("theme", value)}
                            /> : null}
                            <div className="background-style-grid" role="group" aria-label="Room background">
                                {((authoredProductScene ? ["solid", "transparent"] : ["solid", "gradient", "halo", "paper", "transparent"]) as BackgroundStyle[]).map((style) => (
                                    <button type="button" aria-pressed={config.settings.backgroundStyle === style} className={config.settings.backgroundStyle === style ? "is-active" : ""} onClick={() => updateSettings("backgroundStyle", style)} key={style}>
                                        <i data-style={style} /><span>{style}</span>
                                    </button>
                                ))}
                            </div>
                            {!authoredProductScene ? <RangeControl label="Grid ink" value={config.settings.gridStrength} min={0} max={20} step={0.5} suffix="%" onChange={(value) => updateSettings("gridStrength", value)} /> : <p className="preset-note">Solid room or clean transparency. Authored Looks arrive in G10D without touching artwork pixels.</p>}
                        </section>
                    </div>
                ) : inspector === "expert" ? (
                    <div className="inspector-scroll expert-scroll motion-workspace">
                        <header className="motion-workspace-intro">
                            <span className="eyebrow">03 · Motion</span>
                            <h3>Shape the movement.</h3>
                            <p>Start broad, then tune only what the story needs.</p>
                        </header>
                        <ExpertControls
                            tab={expertTab}
                            onTab={setExpertTab}
                            settings={config.settings}
                            items={config.items}
                            selectedItemId={selectedItemId}
                            onSelectItem={setSelectedItemId}
                            onSetting={updateSettings}
                            onSettingStart={beginProductSetting}
                            onSettingEnd={endProductSetting}
                            onItem={updateItem}
                            onPreset={applyExpertPreset}
                            freezePreview={freezePreview}
                            onFreezePreview={handleFreezePreview}
                            isOpeningReel={isOpeningReel}
                            profile={activeProfile}
                            isVitrineV2={authoredVitrine}
                            isShelfV2={authoredShelf}
                            vitrineHoldMinimum={vitrineHoldMinimum}
                            vitrineExchangeMinimum={vitrineExchangeMinimum}
                        />
                    </div>
                ) : (
                    <div className="inspector-scroll export-panel">
                        <section className="control-section export-intro">
                            <span className="export-mark"><Icon name="film" size={22} /></span>
                            <div>
                                <span className="eyebrow">Frame-perfect video</span>
                                <h3>Make the gallery film</h3>
                                <p>{usesLinuxHostPort ? "Original media and authored audio follow one deterministic story clock." : "This legacy exporter renders original media without Project audio."}</p>
                            </div>
                        </section>
                        <section className="control-section">
                            <span className="field-label">Format</span>
                            <div className="format-cards">
                                {(usesLinuxHostPort ? [
                                    ["png-frames", "PNG Frames", verifiedPngScene ? "Verified sequence · straight alpha" : shelfPngVideoBlocked ? "Shelf video export not yet verified" : "Quiet Carousel, Vitrine, or image-only Shelf"],
                                    ["mp4", "MP4", !verifiedH264Scene ? "Quiet Carousel only · use PNG Frames" : !verifiedH264Audio ? "Needs 48 kHz stereo audio · use PNG Frames" : "Verified H.264 · AAC · opaque"],
                                ] : [
                                    ["mp4", "MP4", "H.264 · universal"],
                                    ["premiere", "Premiere", "ProRes · professional editing"],
                                    ["webm", "WebM", "VP9 · pristine"],
                                    ["webm-small", "WebM Small", "VP9 · web-ready"],
                                ] as Array<[ExportFormat, string, string]>).map(([value, title, detail]) => (
                                    <button type="button" disabled={Boolean(isExporting) || (value === "png-frames" && usesLinuxHostPort && !verifiedPngScene) || (value === "mp4" && ((usesLinuxHostPort && (!verifiedH264Scene || !verifiedH264Audio)) || config.settings.backgroundStyle === "transparent"))} className={format === value ? "is-active" : ""} onClick={() => setFormat(value as ExportFormat)} key={value}>
                                        <span>{title}</span><small>{detail}</small>
                                        {format === value ? <Icon name="check" /> : null}
                                    </button>
                                ))}
                            </div>
                            {format === "premiere" ? (
                                <p className="preset-note">{config.settings.backgroundStyle === "transparent" ? "Transparency uses ProRes 4444. Master uses ProRes 4444 XQ for compositing." : "Optimized: ProRes 422 LT. High: ProRes 422. Master: ProRes 422 HQ."}</p>
                            ) : null}
                            {format === "png-frames" ? <p className="preset-note">{verifiedPngScene || !usesLinuxHostPort ? "PNG Frames preserve straight alpha when requested and never contain audio. Project audio stays unchanged." : shelfPngVideoBlocked ? "Verified Shelf PNG Frames currently support still images only." : "Choose Quiet Carousel v1, Vitrine v2, or image-only Shelf v2 for verified PNG Frames."}</p> : null}
                            {usesLinuxHostPort && format === "mp4" ? <p className="preset-note">H.264/AAC is a verified opaque BT.709 MP4 with the authored mix when the Project audio master is 48 kHz stereo.</p> : null}
                            {config.settings.backgroundStyle === "transparent" ? <p className="preset-note">{usesLinuxHostPort ? verifiedPngScene ? "Transparent export uses verified PNG Frames. MP4 remains opaque." : "This Scene has no verified transparent export yet." : "Transparent export: Premiere or WebM. Social platforms flatten transparency; use this for compositing."}</p> : null}
                        </section>
                        <section className="control-section compact-controls">
                            <label>
                                <span className="field-label">Canvas</span>
                                <select value={config.settings.canvasPreset} onChange={(event) => setCanvasPreset(event.target.value as CanvasPreset)}>
                                    {Object.entries(CANVAS_PRESETS).map(([value, item]) => (
                                        <option value={value} key={value}>{item.label} · {item.width}×{item.height}</option>
                                    ))}
                                    <option value="custom">Custom size</option>
                                </select>
                            </label>
                            {config.settings.canvasPreset === "custom" ? (
                                <div className="canvas-dimensions">
                                    <label><span>Width</span><input type="number" min="64" max="7680" step="2" value={config.settings.canvasWidth} onChange={(event) => updateSettings("canvasWidth", Math.round(Number(event.target.value) / 2) * 2)} /></label>
                                    <label><span>Height</span><input type="number" min="64" max="7680" step="2" value={config.settings.canvasHeight} onChange={(event) => updateSettings("canvasHeight", Math.round(Number(event.target.value) / 2) * 2)} /></label>
                                </div>
                            ) : null}
                            <div>
                                <span className="field-label">Quality</span>
                                <Segment
                                    value={config.settings.exportQuality}
                                    options={[{ value: "master", label: "Master" }, { value: "high", label: "High" }, { value: "optimized", label: "Optimized" }]}
                                    onChange={(value) => updateSettings("exportQuality", value)}
                                />
                                <p className="preset-note">{config.settings.exportQuality === "master" ? "Very high quality for Premiere and finishing. Largest file." : config.settings.exportQuality === "high" ? "High-detail working export." : "Smaller delivery file."}</p>
                            </div>
                            <div>
                                <span className="field-label">Frame rate</span>
                                <Segment
                                    value={String(fps)}
                                    options={[24, 30, 60].map((value) => ({ value: String(value), label: String(value) }))}
                                    onChange={(value) => setFps(Number(value))}
                                />
                            </div>
                            {!usesLinuxHostPort && format !== "png-frames" ? <div>
                                <span className="field-label">Poster JPG</span>
                                <Segment
                                    value={posterFrame}
                                    options={[
                                        { value: "first", label: "First" },
                                        { value: "last", label: "Last" },
                                        { value: "none", label: "Off" },
                                    ]}
                                    onChange={setPosterFrame}
                                />
                            </div> : null}
                        </section>
                        <section className="export-summary">
                            <div><span>Runtime</span><strong>{formatDuration(playbackDuration)}</strong></div>
                            <div><span>Frames</span><strong>{Math.max(1, authoredShelf && usesLinuxHostPort && format === "png-frames" ? Math.ceil((playbackDuration / 1000) * fps) : Math.round((playbackDuration / 1000) * fps)).toLocaleString()}</strong></div>
                            <div><span>Quality</span><strong>{config.settings.exportQuality === "master" ? "Master" : config.settings.exportQuality === "high" ? "High" : "Optimized"}</strong></div>
                        </section>

                        {progress?.phase === "error" ? <p className="export-error">{progress.message}</p> : null}
                        {progress?.phase === "cancelled" ? (
                            <p className="export-cancelled" role="status" data-export-phase="cancelled">{progress.message ?? "Export cancelled."}</p>
                        ) : null}
                        {isExporting ? (
                            <div className={`export-progress ${progress?.phase === "preparing" ? "is-preparing" : ""}`}>
                                <div><span style={{ transform: `scaleX(${progress?.progress ?? 0})` }} /></div>
                                <p>{progress?.message ?? (progress?.phase === "preparing" ? "Preparing media…" : progress?.phase === "encoding" ? "Encoding H.264 and AAC…" : progress?.phase === "verifying" ? "Decoding and verifying the finished file…" : `Drawing frame ${progress?.frame ?? 0} of ${progress?.totalFrames ?? 0}`)}</p>
                                <button type="button" onClick={() => void reelAPI.cancelExport().catch((error) => setProgress({
                                    exportId: "cancel-failed",
                                    phase: "error",
                                    progress: 0,
                                    message: error instanceof Error ? `Could not cancel export: ${error.message}` : "Could not cancel export.",
                                }))}>Cancel</button>
                            </div>
                        ) : progress?.phase === "done" ? (
                            <div className="export-success">
                                <span><Icon name="check" /></span>
                                <div><strong>{lastExportFormat === "png-frames" ? "PNG Frames verified" : usesLinuxHostPort ? "H.264/AAC verified" : "Reel exported"}</strong><small>{lastExport ? `${lastExport.split("/").pop()}${lastPoster ? " + poster JPG" : ""}` : "Destination verified, preserved, and committed"}</small></div>
                                {lastExport ? <button type="button" onClick={() => reelAPI.revealFile(lastExport)}><Icon name="folder" /></button> : <span />}
                            </div>
                        ) : null}

                        <button className="export-button" type="button" disabled={!!isExporting || (usesLinuxHostPort && format === "png-frames" && !verifiedPngScene) || (usesLinuxHostPort && format === "mp4" && (!verifiedH264Scene || !verifiedH264Audio || config.settings.backgroundStyle === "transparent"))} onClick={exportReel}>
                            {isExporting ? "Exporting…" : `Export ${exportButtonLabel(format)}`}
                            <Icon name="film" />
                        </button>
                        <p className="privacy-note">Everything stays on this computer.</p>
                    </div>
                )}
            </aside>

            {isDropping ? (
                <div className="drop-overlay">
                    <div><Icon name="plus" size={26} /><strong>Drop frames anywhere</strong><span>One file or many · photos, GIFs, and silent video</span></div>
                </div>
            ) : null}
            {launchPhase !== "gone" ? (
                <div className={`launch-screen ${launchPhase === "leaving" ? "is-leaving" : ""}`} role="status" aria-label="Galileo Gallery is ready">
                    <div className="launch-object" aria-hidden="true">
                        <span className="launch-frame launch-frame-back" />
                        <span className="launch-frame launch-frame-middle" />
                        <img src="./icon.png" alt="" />
                        <span className="launch-glint" />
                    </div>
                    <div className="launch-copy">
                        <strong>Galileo Gallery</strong>
                        <span>Scenes for your frames</span>
                    </div>
                    <div className="launch-progress"><span /></div>
                </div>
            ) : null}
        </div>
    )
}

export default function App() {
    const isExport = new URLSearchParams(window.location.search).has("export")
    return isExport ? <ExportView /> : <InterfaceScaleSurface><AppView /></InterfaceScaleSurface>
}
