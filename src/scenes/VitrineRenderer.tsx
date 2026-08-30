import * as React from "react"
import type { MediaItem, ReelConfig } from "../types"
import { sourceVideoTimeSeconds } from "./quietCarousel"
import { compileVitrineTimeline, evaluateVitrine, vitrineScene, vitrineStoryTimeMs } from "./vitrine"
import "../vitrine.css"

type Props = {
    config: ReelConfig
    timeMs: number
    fps?: number
    exportFrames?: Record<number, string>
    terminal?: boolean
    cataloguePreview?: boolean
    reducedMotion?: boolean
    exportMode?: boolean
    inspectionItemId?: string | null
}

function placeholderItems(): MediaItem[] {
    return [16 / 10, 4 / 5, 1].map((ratio, index) => ({
        id: `vitrine-placeholder-${index + 1}`,
        name: `Edition ${index + 1}`,
        type: "image" as const,
        url: "",
        ratio,
        caption: `Edition ${index + 1}`,
        spotlight: false,
        muted: false,
    }))
}

function resolvedRatio(item: MediaItem, config: ReelConfig) {
    const crop = resolvedCrop(item)
    if (crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1) return item.ratio * crop.width / crop.height
    if (item.aspectMode === "custom") return Math.max(1, item.ratioW ?? 16) / Math.max(1, item.ratioH ?? 9)
    if (item.aspectMode === "global" && config.settings.ratioMode === "fixed") {
        if (config.settings.fixedRatio === "wide2576") return 2576 / 1080
        if (config.settings.fixedRatio === "custom") return Math.max(1, config.settings.customRatioWidth) / Math.max(1, config.settings.customRatioHeight)
        return 16 / 9
    }
    return item.ratio || 16 / 9
}

function resolvedCrop(item: MediaItem) {
    const crop = item.crop
    if (!crop || ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)
        || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0
        || crop.x + crop.width > 1 + 1e-12 || crop.y + crop.height > 1 + 1e-12) return { x: 0, y: 0, width: 1, height: 1 }
    return crop
}

function mediaStyle(item: MediaItem, fallbackFit: "contain" | "cover"): React.CSSProperties {
    const crop = resolvedCrop(item)
    const cropped = crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1
    if (cropped) return {
        position: "absolute",
        left: `${-crop.x / crop.width * 100}%`,
        top: `${-crop.y / crop.height * 100}%`,
        width: `${100 / crop.width}%`,
        height: `${100 / crop.height}%`,
        maxWidth: "none",
        objectFit: "fill",
    }
    const focal = item.focal ?? { x: 0.5, y: 0.5 }
    const focalX = Number.isFinite(focal.x) ? Math.max(0, Math.min(1, focal.x)) : 0.5
    const focalY = Number.isFinite(focal.y) ? Math.max(0, Math.min(1, focal.y)) : 0.5
    return { objectFit: item.fit ?? fallbackFit, objectPosition: `${focalX * 100}% ${focalY * 100}%` }
}

function VitrineVideo({ source, timeMs, loop, fps, style, onFailure }: { source: string; timeMs: number; loop: boolean; fps: number; style: React.CSSProperties; onFailure: () => void }) {
    const ref = React.useRef<HTMLVideoElement>(null)
    const revisionRef = React.useRef(0)
    const targetRef = React.useRef(0)
    const frameCallbackRef = React.useRef<number | null>(null)
    const animationFrameRef = React.useRef<number | null>(null)
    const [ready, setReady] = React.useState(false)
    const [hasPresented, setHasPresented] = React.useState(false)
    const [presentedTime, setPresentedTime] = React.useState<number | null>(null)
    const readyRef = React.useRef(false)
    const desiredRef = React.useRef<{ source: string; target: number } | null>(null)
    const seekCleanupRef = React.useRef<(() => void) | null>(null)
    const sampledTimeMs = Math.floor(Math.max(0, timeMs) * fps / 1_000 + 1e-9) * 1_000 / fps
    const cancelFrameConfirmation = React.useCallback((video?: HTMLVideoElement | null) => {
        const frameVideo = video as (HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void }) | null | undefined
        if (frameCallbackRef.current !== null) frameVideo?.cancelVideoFrameCallback?.(frameCallbackRef.current)
        if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
        frameCallbackRef.current = null
        animationFrameRef.current = null
    }, [])
    const confirmPresentedFrame = React.useCallback((video: HTMLVideoElement, revision: number, target: number) => {
        if (revision !== revisionRef.current || (!video.seeking && Math.abs(video.currentTime - target) > 0.0005)) return
        cancelFrameConfirmation(video)
        const frameVideo = video as HTMLVideoElement & {
            requestVideoFrameCallback?: (handler: (_now: number, metadata: { mediaTime: number }) => void) => number
        }
        const markReady = (mediaTime: number) => {
            if (revision === revisionRef.current && !video.seeking && Math.abs(targetRef.current - target) <= 0.0005
                && Math.abs(video.currentTime - target) <= 0.0005 && Number.isFinite(mediaTime)) {
                readyRef.current = true
                setHasPresented(true)
                setPresentedTime(mediaTime)
                setReady(true)
                return true
            }
            return false
        }
        const requestConfirmation = () => {
            if (revision !== revisionRef.current || Math.abs(targetRef.current - target) > 0.0005
                || (!video.seeking && Math.abs(video.currentTime - target) > 0.0005)) return
            if (frameVideo.requestVideoFrameCallback) {
                frameCallbackRef.current = frameVideo.requestVideoFrameCallback((_now, metadata) => {
                    frameCallbackRef.current = null
                    if (!markReady(metadata.mediaTime)) requestConfirmation()
                })
                return
            }
            animationFrameRef.current = requestAnimationFrame(() => {
                animationFrameRef.current = null
                if (!markReady(video.currentTime)) requestConfirmation()
            })
        }
        requestConfirmation()
    }, [cancelFrameConfirmation, fps])
    const sync = React.useCallback(() => {
        const video = ref.current
        if (!video) return
        if (!Number.isFinite(video.duration) || video.duration <= 0) return
        video.pause()
        const requestedTarget = sourceVideoTimeSeconds(sampledTimeMs, video.duration, loop)
        const target = !loop && requestedTarget >= video.duration
            ? Math.max(0, video.duration - 1 / Math.max(1, fps))
            : requestedTarget
        const desired = desiredRef.current
        if (desired?.source === source && Math.abs(desired.target - target) <= 0.0005
            && (readyRef.current || frameCallbackRef.current !== null || animationFrameRef.current !== null || seekCleanupRef.current !== null)) return
        seekCleanupRef.current?.()
        seekCleanupRef.current = null
        const revision = ++revisionRef.current
        readyRef.current = false
        setReady(false)
        setPresentedTime(null)
        cancelFrameConfirmation(video)
        desiredRef.current = { source, target }
        targetRef.current = target
        if (Math.abs(video.currentTime - target) <= 0.0005 && !video.seeking) {
            confirmPresentedFrame(video, revision, target)
            return
        }
        const onSeeked = () => {
            seekCleanupRef.current = null
            if (revision === revisionRef.current && !video.seeking && frameCallbackRef.current === null && animationFrameRef.current === null) {
                confirmPresentedFrame(video, revision, target)
            }
        }
        video.addEventListener("seeked", onSeeked, { once: true })
        seekCleanupRef.current = () => video.removeEventListener("seeked", onSeeked)
        if (Math.abs(video.currentTime - target) > 0.0005) video.currentTime = target
        confirmPresentedFrame(video, revision, target)
    }, [cancelFrameConfirmation, confirmPresentedFrame, loop, sampledTimeMs, source])
    React.useLayoutEffect(sync, [sync])
    React.useLayoutEffect(() => {
        const video = ref.current
        if (!video) return
        readyRef.current = false
        desiredRef.current = null
        setReady(false)
        setHasPresented(false)
        setPresentedTime(null)
        video.src = source
        video.load()
        return () => {
            revisionRef.current += 1
            readyRef.current = false
            desiredRef.current = null
            seekCleanupRef.current?.()
            seekCleanupRef.current = null
            cancelFrameConfirmation(video)
            video.pause()
            video.removeAttribute("src")
            video.load()
        }
    }, [cancelFrameConfirmation, source])
    return <video
        ref={ref}
        className="vitrine-media product-export-media"
        data-story-ready={ready ? "true" : "false"}
        data-story-presented-time={presentedTime ?? ""}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        onLoadedMetadata={sync}
        onError={onFailure}
        style={{ ...style, visibility: hasPresented ? "visible" : "hidden" }}
    />
}

function VitrineMedia({ item, source, index, timeMs, loop, fps, fit, exportMode }: { item: MediaItem; source: string; index: number; timeMs: number; loop: boolean; fps: number; fit: "contain" | "cover"; exportMode: boolean }) {
    const [failed, setFailed] = React.useState(false)
    React.useEffect(() => setFailed(false), [source])
    if (!source || failed) return <div className={`vitrine-placeholder vitrine-placeholder-${index + 1}`} data-media-failed={failed || exportMode ? "true" : "false"}><span>{failed ? "SOURCE UNAVAILABLE" : "OBJECT"}</span><strong>{String(index + 1).padStart(2, "0")}</strong></div>
    const style = mediaStyle(item, fit)
    if (item.type === "video" && source === (item.previewUrl ?? item.url)) return <VitrineVideo source={source} timeMs={timeMs} loop={loop} fps={fps} style={style} onFailure={() => setFailed(true)} />
    return <img className="vitrine-media product-export-media" src={source} alt="" aria-hidden="true" draggable={false} onError={() => setFailed(true)} style={style} />
}

export function vitrineTimeline(config: ReelConfig, fps = 30, mediaCount = config.items.filter((item) => !item.muted).length || 1) {
    return compileVitrineTimeline({
        mode: config.timelineMode ?? "automatic",
        mediaCount,
        holdMs: config.settings.holdMs,
        exchangeMs: config.settings.paceMs,
        fixedDurationMs: config.timelineFixedDurationMs ?? 0,
        segments: config.timelineSegments ?? [],
        fps,
    })
}

export default function VitrineRenderer({ config, timeMs, fps = 30, exportFrames, terminal = false, cataloguePreview = false, reducedMotion, exportMode = false, inspectionItemId = null }: Props) {
    const ref = React.useRef<HTMLDivElement>(null)
    const [size, setSize] = React.useState({ width: config.settings.canvasWidth, height: config.settings.canvasHeight })
    React.useLayoutEffect(() => {
        const element = ref.current
        if (!element) return
        const update = () => {
            if (element.clientWidth > 0 && element.clientHeight > 0) {
                setSize((current) => current.width === element.clientWidth && current.height === element.clientHeight
                    ? current
                    : { width: element.clientWidth, height: element.clientHeight })
            }
        }
        update()
        const observer = new ResizeObserver(update)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])
    const [systemReducedMotion, setSystemReducedMotion] = React.useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
    React.useEffect(() => {
        const query = window.matchMedia?.("(prefers-reduced-motion: reduce)")
        if (!query) return
        const update = () => setSystemReducedMotion(query.matches)
        query.addEventListener("change", update)
        return () => query.removeEventListener("change", update)
    }, [])
    const allSourceItems = (config.items.length ? config.items : cataloguePreview ? placeholderItems() : [])
        .map((item, sourceIndex) => ({ item: { ...item, ratio: resolvedRatio(item, config) }, sourceIndex }))
    const inspectedSource = inspectionItemId ? allSourceItems.find(({ item }) => item.id === inspectionItemId) : undefined
    const sourceItems = inspectedSource ? [inspectedSource] : allSourceItems.filter(({ item }) => !item.muted)
    const items = sourceItems.map(({ item }) => item)
    const timeline = React.useMemo(() => vitrineTimeline(config, fps, items.length || 1), [config, fps, items.length])
    const parameters = vitrineScene.parameters({
        presentationScale: config.settings.slideHeight / 100,
        objectTurnAmplitude: config.settings.tilt,
        transitionDepth: config.settings.sway / 100,
        direction: config.settings.direction,
        transitionDirection: config.settings.transitionDirection,
        placardVisible: config.settings.showHint,
        fit: config.settings.imageFit,
    })
    const eligibleItems = items.filter((item) => !item.muted)
    const spotlightId = (config.settings.spotlightsEnabled ? eligibleItems.find((item) => item.spotlight) : undefined)?.id ?? eligibleItems[0]?.id
    const finaleId = config.settings.finaleEnabled ? eligibleItems.at(-1)?.id : spotlightId
    const logicalWidth = Math.max(1, config.settings.canvasWidth)
    const logicalHeight = Math.max(1, config.settings.canvasHeight)
    const effectiveReducedMotion = reducedMotion ?? (!exportMode && systemReducedMotion)
    const evaluated = evaluateVitrine({
        items,
        parameters,
        timeline,
        timeMs: inspectedSource ? 0 : timeMs,
        stageWidth: logicalWidth,
        stageHeight: logicalHeight,
        terminal: inspectedSource ? false : terminal,
        reducedMotion: inspectedSource ? false : effectiveReducedMotion,
        spotlightId,
        finaleId,
    })
    const sourceTimeMs = inspectedSource || effectiveReducedMotion ? 0 : vitrineStoryTimeMs(timeMs, timeline.durationMs, parameters.direction, terminal)
    const transparent = config.settings.backgroundStyle === "transparent"
    const background = transparent ? "transparent" : config.settings.ground || (config.settings.theme === "light" ? "#ede9df" : "#11110f")
    const semanticId = evaluated.incomingId && evaluated.transitionProgress >= 0.5 ? evaluated.incomingId : evaluated.currentId
    const semanticIndex = allSourceItems.findIndex(({ item }) => item.id === semanticId)
    const semanticItem = semanticIndex >= 0 ? allSourceItems[semanticIndex].item : null
    const currentLabel = semanticItem ? semanticItem.caption || semanticItem.name || semanticItem.id : null
    const currentItemIndex = items.findIndex((item) => item.id === evaluated.currentId)
    const guardIndex = !exportMode && !inspectedSource && evaluated.phrase === "readable-hold" && items.length > 1 && currentItemIndex >= 0
        ? (currentItemIndex + (parameters.direction === "reverse" ? -1 : 1) + items.length) % items.length
        : -1
    const guardedItem = guardIndex >= 0 && items[guardIndex]?.type === "video" ? items[guardIndex] : null
    const guardedSize = guardedItem ? { width: 1, height: 1 } : null
    const renderPlanes: Array<{ plane: (typeof evaluated.planes)[number]; guard: boolean }> = [
        ...(guardedItem && guardedSize ? [{
            guard: true,
            plane: {
                id: guardedItem.id, sourceIndex: guardIndex, role: "incoming" as const,
                x: -10_000, y: -10_000, z: 0, width: guardedSize.width, height: guardedSize.height,
                scale: 1, rotateY: 0, rotateX: 0, opacity: 1 as const, filter: "none" as const, blend: "normal" as const,
            },
        }] : []),
        ...evaluated.planes.map((plane) => ({ plane, guard: false })),
    ]
    return <div className={`vitrine-stage ${transparent ? "is-transparent" : ""}`} data-product-scene="vitrine" data-scene-version="2" data-evaluator-hash={evaluated.stateHash} data-vitrine-phrase={evaluated.phrase} data-current-id={evaluated.currentId ?? ""} data-incoming-id={evaluated.incomingId ?? ""} data-semantic-id={semanticId ?? ""} data-vitrine-inspection={inspectedSource?.item.id ?? ""} data-transition-progress={evaluated.transitionProgress} data-logical-width={logicalWidth} data-logical-height={logicalHeight} ref={ref} style={{ background } as React.CSSProperties}>
        <div className="vitrine-logical-stage" style={{ width: logicalWidth, height: logicalHeight, transform: `scale(${size.width / logicalWidth}, ${size.height / logicalHeight})`, "--vitrine-perspective": `${logicalWidth * 1.46}px` } as React.CSSProperties}>
            <div className="vitrine-field" aria-hidden="true" />
            {renderPlanes.map(({ plane, guard }) => {
                const item = items[plane.sourceIndex]
                const originalSourceIndex = sourceItems[plane.sourceIndex]?.sourceIndex ?? plane.sourceIndex
                const source = exportMode && item.type === "video"
                    ? exportFrames?.[originalSourceIndex] ?? item.url
                    : exportFrames?.[originalSourceIndex] ?? item.previewUrl ?? item.url
                const crop = resolvedCrop(item)
                const focal = item.focal ?? { x: 0.5, y: 0.5 }
                return <figure className={guard ? "vitrine-guard" : `vitrine-plane is-${plane.role}`} data-media-id={plane.id} data-source-index={originalSourceIndex} data-role={guard ? "guard" : plane.role} data-frame-fit={item.fit ?? evaluated.render.fit} data-crop-x={crop.x} data-crop-y={crop.y} data-crop-width={crop.width} data-crop-height={crop.height} data-focal-x={focal.x} data-focal-y={focal.y} data-x={plane.x} data-y={plane.y} data-z={plane.z} data-plane-width={plane.width} data-plane-height={plane.height} data-plane-scale={plane.scale} data-rotate-x={plane.rotateX} data-rotate-y={plane.rotateY} aria-hidden="true" key={plane.id} style={guard ? { position: "absolute", width: 1, height: 1, left: -10_000, top: -10_000, opacity: 0, pointerEvents: "none", overflow: "hidden" } : { width: plane.width, height: plane.height, zIndex: plane.role === "incoming" ? 1_001 : 1_000, transform: `translate3d(${plane.x - plane.width / 2}px, ${plane.y - plane.height / 2}px, 0) rotateX(${plane.rotateX}deg) rotateY(${plane.rotateY}deg) scale(${plane.scale})` }}>
                    <VitrineMedia item={item} source={source} index={originalSourceIndex} timeMs={sourceTimeMs} loop={config.settings.loopVideos} fps={fps} fit={evaluated.render.fit} exportMode={exportMode} />
                </figure>
            })}
            {evaluated.placard ? <div className="vitrine-placard" data-media-id={evaluated.placard.mediaId}><span>Vitrine</span><strong>{evaluated.placard.caption}</strong></div> : null}
        </div>
        <div className="vitrine-status" role="status" aria-live="polite" aria-atomic="true">{currentLabel ? `Showing ${currentLabel}, item ${semanticIndex + 1} of ${allSourceItems.length}` : "Vitrine is empty"}</div>
    </div>
}
