import * as React from "react"
import { createPortal } from "react-dom"
import OpeningReel from "./OpeningReel"
import ExpertControls, { type ExpertPreset, type ExpertTab } from "./ExpertControls"
import GalleryRenderer from "./GalleryRenderer"
import StyleGallery from "./StyleGallery"
import { ensureReelAPI } from "./runtime"
import { styleProfile, styleSettings } from "./styleProfiles"
import { placeholderItems, studioTimeline } from "./timeline"
import { GALLERY_STYLES, galleryScene, galleryStyle, sceneVariants, type StyleDefinition } from "./styleRegistry"
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
} from "./types"

const Reel = OpeningReel as React.ComponentType<Record<string, unknown>>
const reelAPI = ensureReelAPI()

const LOCAL_PROJECT_KEY = "galileo-gallery-project-v1"
const LOCAL_SAVED_AT_KEY = "galileo-gallery-saved-at-v1"
const RECOVERY_INTERVAL_MS = 2 * 60 * 1000

function normalizeConfig(value: Partial<ReelConfig> | null | undefined): ReelConfig {
    const styleId = value?.styleId ?? "opening-reel"
    return {
        schemaVersion: 2,
        styleId,
        items: Array.isArray(value?.items)
            ? value.items.map((item) => ({
                  ...item,
                  aspectMode: item.aspectMode ?? "auto",
                  ratioW: item.ratioW ?? 16,
                  ratioH: item.ratioH ?? 9,
              }))
            : [],
        settings: { ...styleSettings(styleId), ...(value?.settings ?? {}) },
    }
}

function applyStyleDefaults(current: ReelSettings, styleId: string): ReelSettings {
    const next = styleSettings(styleId)
    return {
        ...next,
        canvasPreset: current.canvasPreset,
        canvasWidth: current.canvasWidth,
        canvasHeight: current.canvasHeight,
        imageFit: current.imageFit,
        autoplayVideos: current.autoplayVideos,
        loopVideos: current.loopVideos,
        ratioMode: current.ratioMode,
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

function readLocalProject() {
    try {
        const saved = localStorage.getItem(LOCAL_PROJECT_KEY)
        if (saved) {
            return {
                config: normalizeConfig(JSON.parse(saved) as Partial<ReelConfig>),
                savedAt: Number(localStorage.getItem(LOCAL_SAVED_AT_KEY)) || 0,
            }
        }
    } catch {
        // A disk recovery snapshot gets a chance after mount.
    }
    return { config: normalizeConfig(null), savedAt: 0 }
}

function savedTimeLabel(savedAt: number | null) {
    if (!savedAt) return "Autosave on"
    return `Saved ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(savedAt)}`
}

function exportButtonLabel(format: ExportFormat) {
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
    const [position, setPosition] = React.useState<{ left: number; top: number; above: boolean } | null>(null)
    const hide = React.useCallback(() => {
        if (timer.current != null) window.clearTimeout(timer.current)
        timer.current = null
        setPosition(null)
    }, [])
    const show = (delay = 360) => {
        if (timer.current != null) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
            const rect = anchor.current?.getBoundingClientRect()
            if (!rect) return
            const width = Math.min(240, window.innerWidth - 24)
            const above = rect.top > 64
            setPosition({
                left: clamp(rect.left + rect.width / 2 - width / 2, 12, window.innerWidth - width - 12),
                top: above ? rect.top - 10 : rect.bottom + 10,
                above,
            })
        }, delay)
    }
    React.useEffect(() => () => {
        if (timer.current != null) window.clearTimeout(timer.current)
    }, [])
    return (
        <span className="tooltip-anchor" ref={anchor} onPointerEnter={() => show()} onPointerLeave={hide} onFocusCapture={() => show(0)} onBlurCapture={hide}>
            {children}
            {position ? createPortal(<span className={`tooltip-bubble ${position.above ? "is-above" : "is-below"}`} role="tooltip" style={{ left: position.left, top: position.top }}>{text}</span>, document.body) : null}
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

async function hydrateMedia(media: SelectedMedia[]): Promise<{ items: MediaItem[]; failures: string[] }> {
    const results: Array<MediaItem | undefined> = Array(media.length)
    const failures: string[] = []
    let cursor = 0
    const workers = Array.from({ length: Math.min(3, media.length) }, async () => {
        while (cursor < media.length) {
            const index = cursor++
            const item = media[index]
            try {
                const previewUrl = item.type === "video"
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

function exportCycleClock(request: ExportRequest, timeMs: number) {
    const cycleDuration = request.cycleDurationMs ?? request.durationMs
    const repeats = Math.max(1, Math.round(request.config.settings.repeatCount))
    if (request.config.settings.playKind === "repeat" && request.finalCycleDurationMs) {
        const finalStart = cycleDuration * Math.max(0, repeats - 1)
        if (timeMs >= finalStart) return { timeMs: Math.max(0, timeMs - finalStart), durationMs: request.finalCycleDurationMs, terminal: true }
    }
    if (request.config.settings.playKind === "once") {
        return { timeMs: Math.min(timeMs, cycleDuration), durationMs: cycleDuration, terminal: true }
    }
    return { timeMs: timeMs % Math.max(1, cycleDuration), durationMs: cycleDuration, terminal: false }
}

async function waitForExportFrameImages() {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>("img.orl-export-frame, img.galileo-media"))
    await Promise.all(images.map(async (image) => {
        await image.decode()
        if (!image.complete || image.naturalWidth < 1 || image.naturalHeight < 1) {
            throw new Error("Export video frame could not be decoded.")
        }
    }))
}

function ExportView() {
    const [payload, setPayload] = React.useState<{
        exportId: string
        request: ExportRequest
        videoFrames: Record<number, { fps: number; frames: string[] }>
    } | null>(null)
    const [timeMs, setTimeMs] = React.useState(0)
    const [frameOverrides, setFrameOverrides] = React.useState<Record<number, string>>({})
    const exportProps = React.useMemo(() => payload ? reelProps(payload.request.config) : null, [payload])

    React.useEffect(() => reelAPI.onExportInit(setPayload), [])
    React.useEffect(
        () =>
            reelAPI.onExportFrame(async (frame) => {
                setTimeMs(frame.timeMs)
                const nextFrames: Record<number, string> = {}
                if (payload) {
                    const clock = exportCycleClock(payload.request, frame.timeMs)
                    for (const [key, set] of Object.entries(payload.videoFrames)) {
                        if (!set.frames.length) continue
                        const sourceFrame = Math.floor((clock.timeMs / 1000) * set.fps)
                        const frameIndex = payload.request.config.settings.loopVideos
                            ? sourceFrame % set.frames.length
                            : Math.min(sourceFrame, set.frames.length - 1)
                        nextFrames[Number(key)] = set.frames[frameIndex]
                    }
                }
                setFrameOverrides(nextFrames)
                await nextPaint()
                await nextPaint()
                await waitForExportFrameImages()
                await nextPaint()
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
            await waitForExportFrameImages()
            await nextPaint()
            if (!cancelled) reelAPI.exportReady(payload.exportId)
        }
        prepare()
        return () => {
            cancelled = true
            delete document.documentElement.dataset.exportTransparent
        }
    }, [payload])

    if (!payload) return <div className="export-canvas" />
    const clock = exportCycleClock(payload.request, timeMs)
    const pose = (clock.timeMs / Math.max(1, clock.durationMs)) * 100
    return (
        <div className={`export-canvas ${payload.request.config.settings.backgroundStyle === "transparent" ? "is-transparent" : ""}`}>
            {payload.request.config.styleId === "opening-reel" ? (
                <Reel {...exportProps} canvasPose={pose} canvasTimeMs={clock.timeMs} staticPose exportFrames={frameOverrides} />
            ) : (
                <GalleryRenderer
                    config={payload.request.config}
                    timeMs={clock.timeMs}
                    durationMs={clock.durationMs}
                    exportFrames={frameOverrides}
                    terminal={clock.terminal}
                />
            )}
        </div>
    )
}

function Segment<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T
    options: Array<{ value: T; label: string }>
    onChange: (value: T) => void
}) {
    return (
        <div className="segment">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className={value === option.value ? "is-active" : ""}
                    aria-pressed={value === option.value}
                    onClick={() => onChange(option.value)}
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
}: {
    label: string
    value: number
    min: number
    max: number
    step?: number
    suffix?: string
    onChange: (value: number) => void
}) {
    const progress = ((value - min) / (max - min)) * 100
    return (
        <div className="range-row">
            <span>{label}</span>
            <label className="range-value" aria-label={`${label} value`}>
                <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => {
                    if (Number.isFinite(event.target.valueAsNumber)) onChange(clamp(event.target.valueAsNumber, min, max))
                }} />
                {suffix ? <small>{suffix}</small> : null}
            </label>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                style={{ "--range-progress": `${progress}%` } as React.CSSProperties}
                onChange={(event) => onChange(Number(event.target.value))}
            />
        </div>
    )
}

function AppView() {
    const initialProject = React.useRef(readLocalProject())
    const [config, setConfig] = React.useState<ReelConfig>(initialProject.current.config)
    const [inspector, setInspector] = React.useState<InspectorTab>("design")
    const [expertTab, setExpertTab] = React.useState<ExpertTab>("slides")
    const [fps, setFps] = React.useState(30)
    const [format, setFormat] = React.useState<ExportFormat>("mp4")
    const [posterFrame, setPosterFrame] = React.useState<PosterFrame>("first")
    const [reelKey, setReelKey] = React.useState(0)
    const [startedAt, setStartedAt] = React.useState(() => performance.now())
    const [previewStarted, setPreviewStarted] = React.useState(false)
    const [playhead, setPlayhead] = React.useState(0)
    const [playIteration, setPlayIteration] = React.useState(1)
    const [progress, setProgress] = React.useState<ExportProgress | null>(null)
    const [lastExport, setLastExport] = React.useState<string | null>(null)
    const [lastPoster, setLastPoster] = React.useState<string | null>(null)
    const [dragIndex, setDragIndex] = React.useState<number | null>(null)
    const [isDropping, setDropping] = React.useState(false)
    const [selectedItemId, setSelectedItemId] = React.useState<string | null>(config.items[0]?.id ?? null)
    const [freezePreview, setFreezePreview] = React.useState(false)
    const [isScrubbing, setIsScrubbing] = React.useState(false)
    const [scrubPaused, setScrubPaused] = React.useState(false)
    const [processingMedia, setProcessingMedia] = React.useState(0)
    const [recoveryReady, setRecoveryReady] = React.useState(false)
    const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(initialProject.current.savedAt || null)
    const [launchPhase, setLaunchPhase] = React.useState<"visible" | "leaving" | "gone">("visible")
    const [showStyleGallery, setShowStyleGallery] = React.useState(true)
    const [saveNotice, setSaveNotice] = React.useState<string | null>(null)
    const [documentVisible, setDocumentVisible] = React.useState(() => document.visibilityState !== "hidden")
    const configRef = React.useRef(config)
    const hiddenAtRef = React.useRef<number | null>(null)
    const videoProxyJobs = React.useRef(new Set<string>())
    const playbackShapeRef = React.useRef("")

    const output = canvasOutput(config.settings)
    const timeline = React.useMemo(
        () => studioTimeline(config, output.width, output.height),
        [config, output.width, output.height]
    )
    const duration = timeline.durationMs
    const repeatCount = clamp(Math.round(config.settings.repeatCount), 2, 20)
    const finalCycleDuration = React.useMemo(
        () => config.settings.playKind === "repeat"
            ? studioTimeline({ ...config, settings: { ...config.settings, playKind: "once" } }, output.width, output.height).durationMs
            : duration,
        [config, duration, output.height, output.width]
    )
    const playbackDuration = config.settings.playKind === "repeat"
        ? duration * (repeatCount - 1) + finalCycleDuration
        : duration
    const terminalCycle = config.settings.playKind === "once" || (config.settings.playKind === "repeat" && playIteration === repeatCount)
    const activeCycleDuration = terminalCycle && config.settings.playKind === "repeat" ? finalCycleDuration : duration
    const liveSlides = React.useMemo(() => sourceItems(config.items), [config.items])
    const activeStyle = galleryStyle(config.styleId)
    const activeScene = galleryScene(config.styleId)
    const activeVariants = sceneVariants(config.styleId)
    const activeProfile = styleProfile(config.styleId)
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
    const isExporting = progress && ["preparing", "rendering", "encoding"].includes(progress.phase)
    const restart = React.useCallback(() => {
        setReelKey((key) => key + 1)
        setStartedAt(performance.now())
        setPreviewStarted(!isOpeningReel && !freezePreview)
        setScrubPaused(false)
        setIsScrubbing(false)
        setPlayhead(0)
        setPlayIteration(1)
    }, [isOpeningReel, freezePreview])

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
        setStartedAt(performance.now())
        setPreviewStarted(true)
        setScrubPaused(false)
        setPlayhead(0)
        setPlayIteration(1)
    }, [])

    const transportAction = React.useCallback(() => {
        if (!scrubPaused || isOpeningReel || playhead >= 0.999) {
            restart()
            return
        }
        setScrubPaused(false)
        setStartedAt(performance.now() - playhead * duration)
        setPreviewStarted(true)
    }, [duration, isOpeningReel, playhead, restart, scrubPaused])

    const beginScrub = React.useCallback(() => {
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
            setPreviewStarted(!isOpeningReel)
            setPlayhead(0)
        }
    }, [config.settings.canvasPose, isOpeningReel])

    React.useEffect(() => {
        configRef.current = config
    }, [config])

    React.useEffect(() => {
        if (config.settings.backgroundStyle === "transparent" && format === "mp4") {
            setFormat("webm")
        }
    }, [config.settings.backgroundStyle, format])

    React.useEffect(() => {
        const missing = config.items.filter((item) => {
            const jobKey = `${item.id}:${item.url}`
            return item.type === "video" && !item.previewUrl && !videoProxyJobs.current.has(jobKey)
        })
        missing.forEach((item) => {
            const jobKey = `${item.id}:${item.url}`
            videoProxyJobs.current.add(jobKey)
            setProcessingMedia((count) => count + 1)
            reelAPI
                .createVideoProxy(item.url)
                .then((previewUrl) => {
                    setConfig((current) => ({
                        ...current,
                        items: current.items.map((currentItem) =>
                            currentItem.id === item.id && currentItem.url === item.url
                                ? { ...currentItem, previewUrl }
                                : currentItem
                        ),
                    }))
                })
                .catch(() => setSaveNotice(`Could not prepare ${item.name} for preview.`))
                .finally(() => {
                    videoProxyJobs.current.delete(jobKey)
                    setProcessingMedia((count) => Math.max(0, count - 1))
                })
        })
    }, [config.items])

    React.useEffect(() => {
        if (!selectedItemId && config.items[0]) setSelectedItemId(config.items[0].id)
        if (selectedItemId && !config.items.some((item) => item.id === selectedItemId)) {
            setSelectedItemId(config.items[0]?.id ?? null)
        }
    }, [config.items, selectedItemId])

    React.useEffect(() => {
        if (isStaticPreview) document.documentElement.dataset.reelStatic = "true"
        else delete document.documentElement.dataset.reelStatic
        return () => {
            delete document.documentElement.dataset.reelStatic
        }
    }, [isStaticPreview])

    React.useEffect(() => {
        let alive = true
        reelAPI
            .loadRecovery()
            .then((snapshot) => {
                if (!alive || !snapshot) return
                if (snapshot.savedAt > initialProject.current.savedAt) {
                    setConfig(normalizeConfig(snapshot.config))
                    setLastSavedAt(snapshot.savedAt)
                }
            })
            .catch(() => {
                // Local autosave remains available if recovery file is unavailable.
            })
            .finally(() => {
                if (alive) setRecoveryReady(true)
            })
        return () => {
            alive = false
        }
    }, [])

    React.useEffect(() => {
        if (!recoveryReady) return
        const savedAt = Date.now()
        localStorage.setItem(LOCAL_PROJECT_KEY, JSON.stringify(config))
        localStorage.setItem(LOCAL_SAVED_AT_KEY, String(savedAt))
        setLastSavedAt(savedAt)
    }, [config, recoveryReady])

    React.useEffect(() => {
        if (!recoveryReady) return
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
    }, [config, recoveryReady])

    React.useEffect(() => {
        if (!recoveryReady) return
        let alive = true
        const checkpoint = async () => {
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
    }, [recoveryReady])

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
        if (!previewStarted) {
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
    }, [startedAt, duration, finalCycleDuration, playbackDuration, repeatCount, reelKey, previewStarted, config.settings.playKind, documentVisible, freezePreview, isScrubbing, scrubPaused])

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
            if (target && ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName)) return
            if (event.code === "Space" || event.key.toLowerCase() === "r") {
                event.preventDefault()
                transportAction()
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [transportAction])

    const addMedia = async (media?: SelectedMedia[]) => {
        const picked = media ?? (await reelAPI.pickMedia())
        if (!picked.length) return
        const videoCount = picked.filter((item) => item.type === "video").length
        if (videoCount) setProcessingMedia((count) => count + videoCount)
        try {
            const hydrated = await hydrateMedia(picked)
            if (hydrated.items.length) setConfig((current) => ({ ...current, items: [...current.items, ...hydrated.items] }))
            if (hydrated.failures.length) setSaveNotice(`${hydrated.items.length} added · ${hydrated.failures.length} could not be prepared`)
            restart()
        } catch (error) {
            setSaveNotice(error instanceof Error ? error.message : "Could not prepare that media.")
        } finally {
            if (videoCount) setProcessingMedia((count) => Math.max(0, count - videoCount))
        }
    }

    const updateSettings = <K extends keyof ReelSettings>(key: K, value: ReelSettings[K]) => {
        setConfig((current) => ({
            ...current,
            settings: (() => {
                if (key === "motionPreset") {
                    const preset = value as MotionPreset
                    return preset === "custom"
                        ? { ...current.settings, motionPreset: preset }
                        : { ...current.settings, ...MOTION_BASES[preset], motionPreset: preset }
                }
                if (["launchMs", "arrivalMs", "growMs", "exitMs"].includes(key)) {
                    const base = current.settings.motionPreset === "custom"
                        ? {}
                        : MOTION_BASES[current.settings.motionPreset]
                    return { ...current.settings, ...base, [key]: value, motionPreset: "custom" as const }
                }
                return { ...current.settings, [key]: value }
            })(),
        }))
    }

    const setCanvasPreset = (preset: CanvasPreset) => {
        setConfig((current) => ({
            ...current,
            settings: { ...current.settings, canvasPreset: preset },
        }))
        restart()
    }

    const updateItem = (id: string, patch: Partial<MediaItem>) => {
        setConfig((current) => ({
            ...current,
            items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        }))
    }

    const applyExpertPreset = (preset: ExpertPreset) => {
        const patches: Record<Exclude<ExpertPreset, "original">, Partial<ReelSettings>> = {
            fast: { motionPreset: "cut", paceMs: 150, holdMs: 550, finaleGrowMs: 520, finaleHoldMs: 1800, tilt: 12, speedBlur: 2 },
            velvet: { motionPreset: "velvet", paceMs: 300, holdMs: 1200, finaleGrowMs: 1000, finaleHoldMs: 3200, tilt: 8, sway: 55 },
            mixed: { ratioMode: "auto", imageFit: "contain", paddingUnit: "percent", paddingTop: 1.2, paddingRight: 1.2, paddingBottom: 1.2, paddingLeft: 1.2, gap: 36, slideHeight: 46 },
        }
        setConfig((current) => ({
            ...current,
            settings: preset === "original"
                ? applyStyleDefaults(current.settings, current.styleId)
                : {
                      ...current.settings,
                      ...(patches[preset].motionPreset && patches[preset].motionPreset !== "custom" ? MOTION_BASES[patches[preset].motionPreset] : {}),
                      ...patches[preset],
                  },
        }))
        restart()
    }

    const removeItem = (id: string) => {
        setConfig((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) }))
        restart()
    }

    const moveItem = (from: number, to: number) => {
        if (from === to) return
        setConfig((current) => {
            const items = [...current.items]
            const [item] = items.splice(from, 1)
            items.splice(to, 0, item)
            return { ...current, items }
        })
        restart()
    }

    const exportReel = async () => {
        setLastExport(null)
        setLastPoster(null)
        setInspector("export")
        try {
            await reelAPI.exportReel({
                config,
                width: output.width,
                height: output.height,
                fps,
                durationMs: playbackDuration,
                cycleDurationMs: duration,
                finalCycleDurationMs: finalCycleDuration,
                format,
                posterFrame,
                quality: config.settings.exportQuality,
            })
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
            const result = await reelAPI.saveProject(config)
            if (!result.cancelled) setSaveNotice("Project saved · media included")
        } catch (error) {
            setSaveNotice(error instanceof Error ? error.message : "Project save failed")
        }
    }

    const openProject = async () => {
        try {
            const result = await reelAPI.openProject()
            if (!result.config) return
            const next = normalizeConfig(result.config)
            setConfig(next)
            setSelectedItemId(next.items[0]?.id ?? null)
            setSaveNotice("Project opened")
            restart()
        } catch (error) {
            setSaveNotice(error instanceof Error ? error.message : "Project open failed")
        }
    }

    const saveTemplate = async () => {
        try {
            const result = await reelAPI.saveTemplate(config.settings)
            if (!result.cancelled) setSaveNotice("Template saved")
        } catch (error) {
            setSaveNotice(error instanceof Error ? error.message : "Template save failed")
        }
    }

    const openTemplate = async () => {
        try {
            const result = await reelAPI.openTemplate()
            if (!result.settings) return
            setConfig((current) => ({
                ...current,
                settings: { ...styleSettings(current.styleId), ...result.settings },
            }))
            setSaveNotice("Template applied")
            restart()
        } catch (error) {
            setSaveNotice(error instanceof Error ? error.message : "Template open failed")
        }
    }

    const finaleId = config.settings.finaleEnabled
        ? [...config.items].reverse().find((item) => !item.muted)?.id
        : undefined

    const chooseStyle = (style: StyleDefinition) => {
        setConfig((current) => ({
            ...current,
            schemaVersion: 2,
            styleId: style.id,
            settings: applyStyleDefaults(current.settings, style.id),
        }))
        setShowStyleGallery(false)
        setReelKey((key) => key + 1)
        setStartedAt(performance.now())
        setPreviewStarted(style.id !== "opening-reel")
        setScrubPaused(false)
        setPlayhead(0)
        setPlayIteration(1)
    }

    if (showStyleGallery) {
        return (
            <StyleGallery
                currentStyleId={config.styleId}
                onChoose={chooseStyle}
                onClose={config.styleId ? () => chooseStyle(activeStyle) : undefined}
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
                const results: DroppedMediaResult[] = await Promise.all(
                    Array.from(event.dataTransfer.files).map(reelAPI.getDroppedFile)
                )
                const media = results.flatMap((result) => result.accepted ? [result.media] : [])
                const rejected = results.filter((result) => !result.accepted)
                await addMedia(media)
                if (rejected.length) {
                    setSaveNotice(`${media.length ? `${media.length} added · ` : ""}${rejected.length} unsupported ${rejected.length === 1 ? "item" : "items"} skipped`)
                }
            }}
        >
            <header className="titlebar">
                <div className="brand-lockup">
                    <img className="galileo-app-icon compact" src="./icon.svg" alt="" aria-hidden="true" />
                    <div>
                        <strong>Galileo Gallery</strong>
                        <span>{activeScene.name} · {activeStyle.presetName} · {config.items.length || activeProfile.recommendedItems} frames · {formatDuration(playbackDuration)}</span>
                    </div>
                </div>
                <div className="autosave-status" aria-live="polite">
                    <i />{saveNotice ?? savedTimeLabel(lastSavedAt)}
                </div>
                <div className="title-actions">
                    <button className="button quiet" type="button" onClick={() => setShowStyleGallery(true)}>
                        <Icon name="spark" /> Styles
                    </button>
                    <details className="project-menu">
                        <summary className="button quiet"><Icon name="folder" /> Project</summary>
                        <div>
                            <button type="button" onClick={(event) => { void openProject(); event.currentTarget.closest("details")?.removeAttribute("open") }}>Open project</button>
                            <button type="button" onClick={(event) => { void saveProject(); event.currentTarget.closest("details")?.removeAttribute("open") }}>Save project <small>media + progress</small></button>
                            <span />
                            <button type="button" onClick={(event) => { void openTemplate(); event.currentTarget.closest("details")?.removeAttribute("open") }}>Apply template</button>
                            <button type="button" onClick={(event) => { void saveTemplate(); event.currentTarget.closest("details")?.removeAttribute("open") }}>Save template <small>settings only</small></button>
                        </div>
                    </details>
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
                        <span className="eyebrow">Sequence</span>
                        <h2>Frames</h2>
                    </div>
                    <button className="icon-button" type="button" aria-label="Add media" onClick={() => addMedia()}>
                        <Icon name="plus" />
                    </button>
                </div>
                <div className="library-scroll">
                    {config.items.length === 0 ? (
                        <button className="empty-library" type="button" onClick={() => addMedia()}>
                            <span className="empty-orbit"><Icon name="film" size={23} /></span>
                            <strong>Bring your frames</strong>
                            <span>Drop photos, GIFs, or videos here. Add one file or many.</span>
                        </button>
                    ) : (
                        <div className="media-list">
                            {config.items.map((item, index) => (
                                <article
                                    className={`media-row ${dragIndex === index ? "is-dragging" : ""} ${selectedItemId === item.id ? "is-selected" : ""}`}
                                    key={item.id}
                                    draggable
                                    onClick={() => setSelectedItemId(item.id)}
                                    onDragStart={() => setDragIndex(index)}
                                    onDragEnd={() => setDragIndex(null)}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={() => {
                                        if (dragIndex != null) moveItem(dragIndex, index)
                                        setDragIndex(null)
                                    }}
                                >
                                    <span className="drag-handle"><Icon name="grip" /></span>
                                    <div className="media-thumb">
                                        {item.type === "video" ? (
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
                                            {item.muted ? <span>Beat skipped</span> : item.spotlight ? <span>Spotlight</span> : <span>{item.type}</span>}
                                        </div>
                                    </div>
                                    <div className="media-actions">
                                        {activeProfile.supportsSpotlight ? <Tooltip text={item.spotlight ? `Remove ${activeProfile.focusLabel.toLowerCase()}. Frame returns to normal flow.` : `${activeProfile.focusLabel}. Uses this motion world's ${activeProfile.focusBehavior} beat without leaving the canvas.`}><button
                                            type="button"
                                            className={item.spotlight ? "is-active" : ""}
                                            aria-label={item.spotlight ? "Remove spotlight" : "Make spotlight"}
                                            onClick={() => updateItem(item.id, { spotlight: !item.spotlight })}
                                        >
                                            <Icon name="spark" />
                                        </button></Tooltip> : null}
                                        <Tooltip text="Skip story beat. Frame stays visible, but cannot Spotlight or become Finale."><button
                                            type="button"
                                            className={item.muted ? "is-active danger" : ""}
                                            aria-label={item.muted ? "Include as story beat" : "Skip as story beat"}
                                            onClick={() => updateItem(item.id, { muted: !item.muted })}
                                        >
                                            <Icon name="skip" />
                                        </button></Tooltip>
                                        <Tooltip text="Remove frame from this project."><button type="button" aria-label="Remove frame" onClick={() => removeItem(item.id)}>
                                            <Icon name="trash" />
                                        </button></Tooltip>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
                <button className="add-media" type="button" onClick={() => addMedia()}>
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
                        {isOpeningReel ? (
                            <Reel {...liveReelProps} staticPose={isStaticPreview} onPlaybackStart={handlePlaybackStart} />
                        ) : (
                            <GalleryRenderer config={config} timeMs={previewPose * activeCycleDuration} durationMs={activeCycleDuration} terminal={terminalCycle} />
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
                        value={inspector}
                        options={[{ value: "design", label: "Design" }, { value: "expert", label: "Expert" }, { value: "export", label: "Export" }]}
                        onChange={setInspector}
                    />
                </div>

                {inspector === "design" ? (
                    <div className="inspector-scroll">
                        <section className="control-section style-current-panel">
                            <div className="section-title">
                                <span className="eyebrow">Motion world</span>
                                <h3>{activeScene.name}</h3>
                            </div>
                            <p>{activeStyle.description}</p>
                            <p className="profile-guidance">Best for {activeProfile.bestFor.toLowerCase()}. {activeProfile.transparentReady ? "Ready for transparent overlays." : "Best with its authored room tone."}</p>
                            {activeVariants.length > 1 ? <label className="scene-preset-select"><span>Scene preset</span><select value={activeStyle.id} onChange={(event) => chooseStyle(galleryStyle(event.target.value))}>{activeVariants.map((variant) => <option value={variant.id} key={variant.id}>{variant.presetName} · {variant.source.replace(".tsx", "")}</option>)}</select></label> : null}
                            <button type="button" className="button quiet" onClick={() => setShowStyleGallery(true)}>Browse all {GALLERY_STYLES.length} scenes</button>
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
                            <div className="motion-grid">
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
                            </div>
                            <RangeControl label={isOpeningReel ? "River pace" : "Motion pace"} value={config.settings.paceMs} min={60} max={8000} step={10} suffix="ms" onChange={(value) => updateSettings("paceMs", value)} />
                        </section>
                        <section className="control-section">
                            <div className="section-title">
                                <span className="eyebrow">Playback</span>
                                <h3>End behavior</h3>
                            </div>
                            <Segment
                                value={config.settings.playKind}
                                options={[{ value: "once", label: "Once" }, { value: "repeat", label: "Loop ×" }, { value: "loop", label: "Forever" }]}
                                onChange={(value) => updateSettings("playKind", value)}
                            />
                            {config.settings.playKind === "repeat" ? <RangeControl label="Loop count" value={config.settings.repeatCount} min={2} max={20} suffix="×" onChange={(value) => updateSettings("repeatCount", Math.round(value))} /> : null}
                            {activeProfile.axisControl ? <div className="playback-direction">
                                <span>Axis</span>
                                <Segment value={config.settings.axis} options={[{ value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }]} onChange={(value) => updateSettings("axis", value)} />
                            </div> : null}
                            {activeProfile.directional ? <div className="playback-direction">
                                <span>Direction</span>
                                <Segment value={config.settings.direction} options={[{ value: "forward", label: directionLabels[0] }, { value: "reverse", label: directionLabels[1] }]} onChange={(value) => updateSettings("direction", value)} />
                            </div> : null}
                            <p className="preset-note">{config.settings.playKind === "loop" ? "Seamless website preview. Motion returns to its first pose." : config.settings.playKind === "repeat" ? `${repeatCount} complete showcase cycles.` : "One authored showcase cycle."}</p>
                        </section>
                        <section className="control-section">
                            <div className="section-title">
                                <span className="eyebrow">Story</span>
                                <h3>Scale & presence</h3>
                            </div>
                            {activeProfile.supportsSpotlight ? <Segment value={config.settings.spotlightsEnabled ? "on" : "off"} options={[{ value: "on", label: `${activeProfile.focusLabel} on` }, { value: "off", label: "Off" }]} onChange={(value) => updateSettings("spotlightsEnabled", value === "on")} /> : null}
                            {activeProfile.supportsFinale ? <Segment value={config.settings.finaleEnabled ? "on" : "off"} options={[{ value: "on", label: "Final beat on" }, { value: "off", label: "Off" }]} onChange={(value) => updateSettings("finaleEnabled", value === "on")} /> : null}
                            {activeProfile.supportsSpotlight && config.settings.spotlightsEnabled ? <RangeControl label={`${activeProfile.focusLabel} size`} value={config.settings.heroSize} min={24} max={80} suffix="%" onChange={(value) => updateSettings("heroSize", value)} /> : null}
                            {activeProfile.supportsFinale && config.settings.finaleEnabled ? <RangeControl label="Final beat size" value={config.settings.finaleSize} min={30} max={84} suffix="%" onChange={(value) => updateSettings("finaleSize", value)} /> : null}
                            <RangeControl label={isOpeningReel ? "Frame height" : "Frame size"} value={config.settings.slideHeight} min={15} max={100} suffix="%" onChange={(value) => updateSettings("slideHeight", value)} />
                            <RangeControl label="Breathing room" value={config.settings.gap} min={0} max={240} suffix="px" onChange={(value) => updateSettings("gap", value)} />
                            <Segment value={config.settings.cornerStyle} options={[{ value: "squircle", label: "Squircle" }, { value: "rounded", label: "Rounded" }]} onChange={(value) => updateSettings("cornerStyle", value)} />
                            {config.settings.cornerStyle === "squircle" ? <RangeControl label="Corner smoothing" value={config.settings.cornerSmoothing} min={0} max={100} suffix="%" onChange={(value) => updateSettings("cornerSmoothing", value)} /> : null}
                            <RangeControl label="Corner radius" value={config.settings.radius} min={0} max={96} suffix="px" onChange={(value) => updateSettings("radius", value)} />
                        </section>
                        <section className="control-section">
                            <div className="section-title">
                                <span className="eyebrow">Atmosphere</span>
                                <h3>Room tone</h3>
                            </div>
                            <Segment
                                value={config.settings.theme}
                                options={[{ value: "dark", label: "Night" }, { value: "light", label: "Paper" }]}
                                onChange={(value) => updateSettings("theme", value)}
                            />
                            <div className="background-style-grid">
                                {(["solid", "gradient", "halo", "paper", "transparent"] as BackgroundStyle[]).map((style) => (
                                    <button type="button" className={config.settings.backgroundStyle === style ? "is-active" : ""} onClick={() => updateSettings("backgroundStyle", style)} key={style}>
                                        <i data-style={style} /><span>{style}</span>
                                    </button>
                                ))}
                            </div>
                            <RangeControl label="Grid ink" value={config.settings.gridStrength} min={0} max={20} step={0.5} suffix="%" onChange={(value) => updateSettings("gridStrength", value)} />
                        </section>
                    </div>
                ) : inspector === "expert" ? (
                    <div className="inspector-scroll expert-scroll">
                        <ExpertControls
                            tab={expertTab}
                            onTab={setExpertTab}
                            settings={config.settings}
                            items={config.items}
                            selectedItemId={selectedItemId}
                            onSelectItem={setSelectedItemId}
                            onSetting={updateSettings}
                            onItem={updateItem}
                            onPreset={applyExpertPreset}
                            freezePreview={freezePreview}
                            onFreezePreview={handleFreezePreview}
                            isOpeningReel={isOpeningReel}
                            profile={activeProfile}
                        />
                    </div>
                ) : (
                    <div className="inspector-scroll export-panel">
                        <section className="control-section export-intro">
                            <span className="export-mark"><Icon name="film" size={22} /></span>
                            <div>
                                <span className="eyebrow">Frame-perfect video</span>
                                <h3>Make the gallery film</h3>
                                <p>Original videos are decoded by FFmpeg and rendered silently, frame by frame.</p>
                            </div>
                        </section>
                        <section className="control-section">
                            <span className="field-label">Format</span>
                            <div className="format-cards">
                                {([
                                    ["mp4", "MP4", "H.264 · universal"],
                                    ["premiere", "Premiere", "ProRes · professional editing"],
                                    ["webm", "WebM", "VP9 · pristine"],
                                    ["webm-small", "WebM Small", "VP9 · web-ready"],
                                ] as Array<[ExportFormat, string, string]>).map(([value, title, detail]) => (
                                    <button type="button" disabled={config.settings.backgroundStyle === "transparent" && value === "mp4"} className={format === value ? "is-active" : ""} onClick={() => setFormat(value)} key={value}>
                                        <span>{title}</span><small>{detail}</small>
                                        {format === value ? <Icon name="check" /> : null}
                                    </button>
                                ))}
                            </div>
                            {format === "premiere" ? (
                                <p className="preset-note">{config.settings.backgroundStyle === "transparent" ? "Transparency uses ProRes 4444. Master uses ProRes 4444 XQ for compositing." : "Optimized: ProRes 422 LT. High: ProRes 422. Master: ProRes 422 HQ."}</p>
                            ) : null}
                            {config.settings.backgroundStyle === "transparent" ? <p className="preset-note">Transparent export: Premiere or WebM. Social platforms flatten transparency; use this for compositing.</p> : null}
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
                                    <label><span>Width</span><input type="number" min="64" max="7680" step="2" value={config.settings.canvasWidth} onChange={(event) => updateSettings("canvasWidth", Number(event.target.value))} /></label>
                                    <label><span>Height</span><input type="number" min="64" max="7680" step="2" value={config.settings.canvasHeight} onChange={(event) => updateSettings("canvasHeight", Number(event.target.value))} /></label>
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
                            <div>
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
                            </div>
                        </section>
                        <section className="export-summary">
                            <div><span>Runtime</span><strong>{formatDuration(playbackDuration)}</strong></div>
                            <div><span>Frames</span><strong>{Math.ceil((playbackDuration / 1000) * fps).toLocaleString()}</strong></div>
                            <div><span>Quality</span><strong>{config.settings.exportQuality === "master" ? "Master" : config.settings.exportQuality === "high" ? "High" : "Optimized"}</strong></div>
                        </section>

                        {progress?.phase === "error" ? <p className="export-error">{progress.message}</p> : null}
                        {isExporting ? (
                            <div className={`export-progress ${progress?.phase === "preparing" ? "is-preparing" : ""}`}>
                                <div><span style={{ transform: `scaleX(${progress?.progress ?? 0})` }} /></div>
                                <p>{progress?.message ?? (progress?.phase === "preparing" ? "Preparing media…" : progress?.phase === "encoding" ? "Finishing the file…" : `Drawing frame ${progress?.frame ?? 0} of ${progress?.totalFrames ?? 0}`)}</p>
                                <button type="button" onClick={() => reelAPI.cancelExport()}>Cancel</button>
                            </div>
                        ) : lastExport ? (
                            <div className="export-success">
                                <span><Icon name="check" /></span>
                                <div><strong>Reel exported</strong><small>{lastExport.split("/").pop()}{lastPoster ? " + poster JPG" : ""}</small></div>
                                <button type="button" onClick={() => reelAPI.revealFile(lastExport)}><Icon name="folder" /></button>
                            </div>
                        ) : null}

                        <button className="export-button" type="button" disabled={!!isExporting} onClick={exportReel}>
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
                        <img src="./icon.svg" alt="" />
                        <span className="launch-glint" />
                    </div>
                    <div className="launch-copy">
                        <strong>Galileo Gallery</strong>
                        <span>Motion worlds for your frames</span>
                    </div>
                    <div className="launch-progress"><span /></div>
                </div>
            ) : null}
        </div>
    )
}

export default function App() {
    const isExport = new URLSearchParams(window.location.search).has("export")
    return isExport ? <ExportView /> : <AppView />
}
