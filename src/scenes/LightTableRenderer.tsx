import * as React from "react"
import type { MediaItem, ReelConfig } from "../types"
import {
    assertLightTableOpaqueIntent,
    lightTableParametersFromConfig,
    lightTableSourcesFromConfig,
    lightTableTimelineFromConfig,
    lightTableTimelineMediaCount,
} from "../lightTableConfig.ts"
import { evaluateLightTable, lightTableSourceTimeSeconds } from "./lightTable.ts"
import {
    LIGHT_TABLE_POSTER_MAX_BYTES,
    LIGHT_TABLE_POSTER_MAX_EDGE,
    createLightTablePosterEncodeGate,
    createLightTableVideoTargetCoordinator,
    lightTablePresentedFrameAtOrBeforeTarget,
    lightTableSeekConverged,
    lightTableVideoSeekTime,
    retainedLightTablePoster,
    sampledLightTableSourceTimeMs,
    selectLightTableVideoOwnerIds,
    shouldReplaceLightTablePoster,
    type LightTablePosterEncodeGate,
    type LightTablePosterRecord as PosterRecord,
    type LightTableVideoTargetRequest,
} from "./lightTableVideoPolicy.ts"
import {
    LIGHT_TABLE_UNDERLIGHT_LAYER_Z,
    activateLightTablePlane,
    containLightTableKeyboardActivation,
    lightTableArtworkLayerZ,
    lightTableKeyIntent,
    nextLightTableInspectionId,
} from "./lightTablePresentation.ts"
import "../lightTable.css"

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
    onInspectionItemChange?: (id: string | null) => void
}

function placeholderItems(): MediaItem[] {
    return [16 / 10, 4 / 5, 1.55, 3 / 4, 1, 16 / 9].map((ratio, index) => ({
        id: `light-table-placeholder-${index + 1}`,
        name: `Review frame ${index + 1}`,
        type: "image" as const,
        url: "",
        ratio,
        aspectMode: "auto" as const,
        ratioW: 16,
        ratioH: 9,
        fit: "contain" as const,
        crop: { x: 0, y: 0, width: 1, height: 1 },
        focal: { x: 0.5, y: 0.5 },
        caption: "",
        spotlight: false,
        muted: false,
    }))
}

function resolvedCrop(item: MediaItem) {
    const crop = item.crop
    if (!crop || ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)
        || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0
        || crop.x + crop.width > 1 + 1e-12 || crop.y + crop.height > 1 + 1e-12) return { x: 0, y: 0, width: 1, height: 1 }
    return crop
}

function sourceStyle(item: MediaItem, fallbackFit: "contain" | "cover"): React.CSSProperties {
    const crop = resolvedCrop(item)
    const shared = { opacity: 1, filter: "none", mixBlendMode: "normal" as const }
    if (crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1) return {
        ...shared,
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
    return { ...shared, objectFit: item.fit ?? fallbackFit, objectPosition: `${focalX * 100}% ${focalY * 100}%` }
}

function LightTableVideo({ source, item, timeMs, fps, loop, fit, poster, targetKey, encodeGate, onPoster, onFailure, onUnavailable }: {
    source: string
    item: MediaItem
    timeMs: number
    fps: number
    loop: boolean
    fit: "contain" | "cover"
    poster?: PosterRecord
    targetKey: string
    encodeGate: LightTablePosterEncodeGate
    onPoster: (poster: PosterRecord) => void
    onFailure: () => void
    onUnavailable: (targetKey: string) => void
}) {
    const ref = React.useRef<HTMLVideoElement>(null)
    const sourceEpochRef = React.useRef(0)
    const frameCallbackRef = React.useRef<number | null>(null)
    const frameTimeoutRef = React.useRef<number | null>(null)
    const presentationTokenRef = React.useRef<symbol | null>(null)
    const seekCleanupRef = React.useRef<(() => void) | null>(null)
    const encodeTokenRef = React.useRef<symbol | null>(null)
    const onPosterRef = React.useRef(onPoster)
    const onUnavailableRef = React.useRef(onUnavailable)
    const desiredRef = React.useRef({ key: targetKey, timeMs, loop })
    desiredRef.current = { key: targetKey, timeMs, loop }
    const [targetCoordinator] = React.useState(() => createLightTableVideoTargetCoordinator(poster?.sequence ?? 0))
    const startRequestRef = React.useRef<(request: LightTableVideoTargetRequest) => void>(() => {})
    React.useLayoutEffect(() => {
        onPosterRef.current = onPoster
        onUnavailableRef.current = onUnavailable
    }, [onPoster, onUnavailable])
    const cancelPresentation = React.useCallback((video: HTMLVideoElement) => {
        presentationTokenRef.current = null
        seekCleanupRef.current?.()
        seekCleanupRef.current = null
        const callbackId = frameCallbackRef.current
        if (callbackId !== null && typeof video.cancelVideoFrameCallback === "function") video.cancelVideoFrameCallback(callbackId)
        frameCallbackRef.current = null
        if (frameTimeoutRef.current !== null) window.clearTimeout(frameTimeoutRef.current)
        frameTimeoutRef.current = null
    }, [])

    const continueWith = React.useCallback((next: LightTableVideoTargetRequest | null) => {
        if (next) startRequestRef.current(next)
    }, [])

    const settleUnavailable = React.useCallback((video: HTMLVideoElement, request: LightTableVideoTargetRequest, epoch: number) => {
        if (epoch !== sourceEpochRef.current || ref.current !== video || targetCoordinator.snapshot().inFlight?.sequence !== request.sequence) return false
        cancelPresentation(video)
        const result = targetCoordinator.settle(request.sequence, "unavailable")
        if (!result.accepted) return false
        onUnavailableRef.current(request.key)
        continueWith(result.next)
        return true
    }, [cancelPresentation, continueWith, targetCoordinator])

    const encodeCanvas = React.useCallback((canvas: HTMLCanvasElement, video: HTMLVideoElement, request: LightTableVideoTargetRequest, epoch: number) => {
        encodeTokenRef.current = encodeGate.schedule(item.id, (release) => {
            let settled = false
            const timeout = window.setTimeout(() => {
                if (settled) return
                settled = true
                release()
                if (epoch === sourceEpochRef.current) onUnavailableRef.current(request.key)
            }, 3_000)
            try {
                canvas.toBlob((blob) => {
                    if (settled) return
                    settled = true
                    window.clearTimeout(timeout)
                    release()
                    if (epoch !== sourceEpochRef.current || ref.current !== video) return
                    if (!blob || blob.size > LIGHT_TABLE_POSTER_MAX_BYTES) {
                        onUnavailableRef.current(request.key)
                        return
                    }
                    const url = URL.createObjectURL(blob)
                    onPosterRef.current({ source, targetKey: request.key, url, sequence: request.sequence })
                }, "image/png")
            } catch {
                settled = true
                window.clearTimeout(timeout)
                release()
                if (epoch === sourceEpochRef.current) onUnavailableRef.current(request.key)
            }
        })
        if (encodeTokenRef.current === null) onUnavailableRef.current(request.key)
    }, [encodeGate, item.id, source])

    const capture = React.useCallback((video: HTMLVideoElement, request: LightTableVideoTargetRequest, epoch: number, target: number, mediaTime: number) => {
        if (epoch !== sourceEpochRef.current || ref.current !== video || targetCoordinator.snapshot().inFlight?.sequence !== request.sequence) return false
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.seeking || !lightTableSeekConverged(video.currentTime, target, fps)
            || !lightTablePresentedFrameAtOrBeforeTarget(mediaTime, target)
            || video.videoWidth <= 0 || video.videoHeight <= 0) {
            settleUnavailable(video, request, epoch)
            return false
        }
        const canvas = document.createElement("canvas")
        const scale = Math.min(1, LIGHT_TABLE_POSTER_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight))
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        const context = canvas.getContext("2d", { alpha: false })
        if (!context) {
            settleUnavailable(video, request, epoch)
            return false
        }
        try {
            context.drawImage(video, 0, 0, canvas.width, canvas.height)
            cancelPresentation(video)
            const result = targetCoordinator.settle(request.sequence, "captured")
            if (!result.accepted) return false
            encodeCanvas(canvas, video, request, epoch)
            continueWith(result.next)
            return true
        } catch {
            settleUnavailable(video, request, epoch)
            return false
        }
    }, [cancelPresentation, continueWith, encodeCanvas, fps, settleUnavailable, targetCoordinator])

    const startRequest = React.useCallback((request: LightTableVideoTargetRequest) => {
        const video = ref.current
        if (!video || targetCoordinator.snapshot().inFlight?.sequence !== request.sequence) return
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
            targetCoordinator.defer(request.sequence)
            return
        }
        const epoch = sourceEpochRef.current
        cancelPresentation(video)
        video.pause()
        const requestedTarget = lightTableSourceTimeSeconds(request.timeMs, video.duration, request.loop)
        const target = lightTableVideoSeekTime(requestedTarget, video.duration)
        const confirm = () => {
            if (epoch !== sourceEpochRef.current || ref.current !== video || targetCoordinator.snapshot().inFlight?.sequence !== request.sequence) return
            if (typeof video.requestVideoFrameCallback !== "function") {
                settleUnavailable(video, request, epoch)
                return
            }
            const presentationToken = Symbol(request.key)
            presentationTokenRef.current = presentationToken
            try {
                const callbackId = video.requestVideoFrameCallback((_now, metadata) => {
                    if (presentationTokenRef.current !== presentationToken || epoch !== sourceEpochRef.current
                        || targetCoordinator.snapshot().inFlight?.sequence !== request.sequence) return
                    presentationTokenRef.current = null
                    frameCallbackRef.current = null
                    if (frameTimeoutRef.current !== null) window.clearTimeout(frameTimeoutRef.current)
                    frameTimeoutRef.current = null
                    capture(video, request, epoch, target, metadata.mediaTime)
                })
                if (presentationTokenRef.current !== presentationToken) {
                    if (typeof video.cancelVideoFrameCallback === "function") video.cancelVideoFrameCallback(callbackId)
                    return
                }
                frameCallbackRef.current = callbackId
                frameTimeoutRef.current = window.setTimeout(() => {
                    if (presentationTokenRef.current !== presentationToken || epoch !== sourceEpochRef.current
                        || targetCoordinator.snapshot().inFlight?.sequence !== request.sequence) return
                    settleUnavailable(video, request, epoch)
                }, 400)
            } catch {
                if (presentationTokenRef.current === presentationToken) settleUnavailable(video, request, epoch)
            }
        }
        if (!video.seeking && lightTableSeekConverged(video.currentTime, target, fps)) {
            confirm()
            return
        }
        const onSeeked = () => {
            if (epoch !== sourceEpochRef.current || targetCoordinator.snapshot().inFlight?.sequence !== request.sequence) return
            seekCleanupRef.current = null
            confirm()
        }
        video.addEventListener("seeked", onSeeked, { once: true })
        seekCleanupRef.current = () => video.removeEventListener("seeked", onSeeked)
        try {
            video.currentTime = target
        } catch {
            settleUnavailable(video, request, epoch)
        }
    }, [cancelPresentation, capture, fps, settleUnavailable, targetCoordinator])
    startRequestRef.current = startRequest

    const requestDesired = React.useCallback(() => {
        const next = targetCoordinator.request(desiredRef.current)
        if (next) startRequestRef.current(next)
    }, [targetCoordinator])

    React.useLayoutEffect(() => {
        const video = ref.current
        if (!video) return
        sourceEpochRef.current += 1
        targetCoordinator.reset()
        video.crossOrigin = "anonymous"
        video.src = source
        video.load()
        return () => {
            sourceEpochRef.current += 1
            targetCoordinator.reset()
            encodeGate.cancel(item.id, encodeTokenRef.current)
            encodeTokenRef.current = null
            cancelPresentation(video)
            video.pause()
            video.removeAttribute("src")
            video.load()
        }
    }, [cancelPresentation, encodeGate, item.id, source, targetCoordinator])
    React.useLayoutEffect(requestDesired, [loop, requestDesired, source, targetKey, timeMs])

    const ready = poster?.source === source && poster.targetKey === targetKey
    return <>
        {poster ? <img className="light-table-media product-export-media" data-story-poster="true" data-story-ready={ready ? "true" : "false"} data-story-target={targetKey} src={poster.url} alt="" aria-hidden="true" draggable={false} style={sourceStyle(item, fit)} /> : null}
        <video
            ref={ref}
            className="light-table-media product-export-media"
            data-video-source-owner="true"
            data-story-ready={ready ? "true" : "false"}
            data-story-target={targetKey}
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            onLoadedMetadata={requestDesired}
            onError={onFailure}
            style={{ ...sourceStyle(item, fit), position: "absolute", inset: 0, visibility: "hidden" }}
        />
    </>
}

function LightTableMedia({ item, source, index, timeMs, fps, loop, fit, exportFrame, exportMode, ownsVideo, poster, targetKey, encodeGate, onPoster, onFailure, onUnavailable }: {
    item: MediaItem
    source: string
    index: number
    timeMs: number
    fps: number
    loop: boolean
    fit: "contain" | "cover"
    exportFrame: boolean
    exportMode: boolean
    ownsVideo: boolean
    poster?: PosterRecord
    targetKey: string
    encodeGate: LightTablePosterEncodeGate
    onPoster: (poster: PosterRecord) => void
    onFailure: () => void
    onUnavailable: (targetKey: string) => void
}) {
    if (!source) return <div className="light-table-placeholder" data-media-failed={exportMode ? "true" : undefined} aria-hidden="true"><span>FRAME</span><strong>{String(index + 1).padStart(2, "0")}</strong></div>
    if (item.type === "video" && !exportFrame) {
        if (exportMode) return <div className="light-table-placeholder is-failed" data-media-failed="true" aria-hidden="true"><span>SOURCE FRAME REQUIRED</span><strong>{String(index + 1).padStart(2, "0")}</strong></div>
        if (ownsVideo) return <LightTableVideo source={source} item={item} timeMs={timeMs} fps={fps} loop={loop} fit={fit} poster={poster} targetKey={targetKey} encodeGate={encodeGate} onPoster={onPoster} onFailure={onFailure} onUnavailable={onUnavailable} />
        if (poster) return <img className="light-table-media product-export-media" data-story-poster="true" data-story-ready={poster.targetKey === targetKey ? "true" : "false"} data-story-target={targetKey} src={poster.url} alt="" aria-hidden="true" draggable={false} style={sourceStyle(item, fit)} />
        return <div className="light-table-placeholder" aria-hidden="true"><span>VIDEO PREPARING</span><strong>{String(index + 1).padStart(2, "0")}</strong></div>
    }
    return <img className="light-table-media product-export-media" src={source} alt="" aria-hidden="true" draggable={false} onError={onFailure} style={sourceStyle(item, fit)} />
}

function useReducedMotion(explicit: boolean | undefined, exportMode: boolean) {
    const [system, setSystem] = React.useState(() => explicit === undefined && !exportMode && typeof window !== "undefined"
        ? Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
        : false)
    React.useEffect(() => {
        if (explicit !== undefined || exportMode) return
        const query = window.matchMedia?.("(prefers-reduced-motion: reduce)")
        if (!query) return
        const update = () => setSystem(query.matches)
        update()
        query.addEventListener("change", update)
        return () => query.removeEventListener("change", update)
    }, [explicit, exportMode])
    return explicit ?? (exportMode ? false : system)
}

export default function LightTableRenderer({ config, timeMs, fps = 30, exportFrames, cataloguePreview = false, reducedMotion, exportMode = false, inspectionItemId = null, onInspectionItemChange }: Props) {
    assertLightTableOpaqueIntent(config.settings.backgroundStyle)
    const stageRef = React.useRef<HTMLDivElement>(null)
    const [size, setSize] = React.useState({ width: config.settings.canvasWidth, height: config.settings.canvasHeight })
    const [failedIds, setFailedIds] = React.useState<ReadonlySet<string>>(new Set())
    const [posters, setPosters] = React.useState<ReadonlyMap<string, PosterRecord>>(new Map())
    const [unavailableKeys, setUnavailableKeys] = React.useState<ReadonlySet<string>>(new Set())
    const posterUrlsRef = React.useRef(new Set<string>())
    const pendingPosterRetirementsRef = React.useRef(new Set<string>())
    const [rovingIndex, setRovingIndex] = React.useState(0)
    const [localInspectionId, setLocalInspectionId] = React.useState<string | null>(null)
    const [encodeGate] = React.useState(() => createLightTablePosterEncodeGate())
    const prefersReducedMotion = useReducedMotion(reducedMotion, exportMode)
    const items = React.useMemo(() => config.items.length ? config.items : cataloguePreview ? placeholderItems() : [], [cataloguePreview, config.items])
    const sourceIdentity = React.useMemo(() => JSON.stringify(items.map((item) => [item.id, item.type, item.url, item.previewUrl ?? ""])), [items])
    const currentVideoSources = React.useMemo(() => new Map(items.filter((item) => item.type === "video").map((item) => [item.id, item.previewUrl ?? item.url])), [sourceIdentity])
    const currentVideoSourcesRef = React.useRef(currentVideoSources)
    const workingConfig = React.useMemo(() => ({ ...config, items }), [config, items])
    const revokePoster = React.useCallback((url: string) => {
        try { URL.revokeObjectURL(url) } catch { /* a renderer-owned URL may already be retired */ }
        posterUrlsRef.current.delete(url)
        pendingPosterRetirementsRef.current.delete(url)
    }, [])
    const queuePosterRetirement = React.useCallback((url: string) => {
        pendingPosterRetirementsRef.current.add(url)
    }, [])
    React.useLayoutEffect(() => {
        currentVideoSourcesRef.current = currentVideoSources
    }, [currentVideoSources])

    React.useLayoutEffect(() => {
        const stage = stageRef.current
        if (!stage) return
        const update = () => {
            const bounds = stage.getBoundingClientRect()
            if (bounds.width > 0 && bounds.height > 0) setSize({ width: bounds.width, height: bounds.height })
        }
        update()
        const observer = new ResizeObserver(update)
        observer.observe(stage)
        return () => observer.disconnect()
    }, [])

    React.useEffect(() => {
        const ids = new Set(items.map((item) => item.id))
        setRovingIndex((current) => Math.max(0, Math.min(items.length - 1, current)))
        if (localInspectionId && !ids.has(localInspectionId)) setLocalInspectionId(null)
    }, [items, localInspectionId])

    React.useEffect(() => {
        setFailedIds(new Set())
        setUnavailableKeys(new Set())
        setPosters((current) => {
            let next: Map<string, PosterRecord> | null = null
            current.forEach((poster, id) => {
                if (currentVideoSources.get(id) === poster.source) return
                next ??= new Map(current)
                next.delete(id)
                queuePosterRetirement(poster.url)
            })
            return next ?? current
        })
    }, [currentVideoSources, queuePosterRetirement, sourceIdentity])
    React.useLayoutEffect(() => {
        const stage = stageRef.current
        if (!stage || pendingPosterRetirementsRef.current.size === 0) return
        const connectedSources = new Set(
            [...stage.querySelectorAll<HTMLImageElement>('img[data-story-poster="true"]')]
                .filter((image) => image.isConnected)
                .flatMap((image) => [image.currentSrc, image.getAttribute("src") ?? ""])
                .filter(Boolean),
        )
        for (const url of pendingPosterRetirementsRef.current) {
            if (!connectedSources.has(url)) revokePoster(url)
        }
    })
    React.useEffect(() => () => {
        encodeGate.dispose()
        for (const url of [...posterUrlsRef.current]) revokePoster(url)
        pendingPosterRetirementsRef.current.clear()
    }, [encodeGate, revokePoster])

    const parameters = React.useMemo(() => lightTableParametersFromConfig(workingConfig), [workingConfig])
    const timeline = React.useMemo(() => lightTableTimelineFromConfig(workingConfig, fps, lightTableTimelineMediaCount(items.length, cataloguePreview)), [cataloguePreview, fps, items.length, workingConfig])
    const sources = React.useMemo(() => lightTableSourcesFromConfig(workingConfig, failedIds), [failedIds, workingConfig])
    const controlledInspection = typeof onInspectionItemChange === "function"
    const requestedInspectionId = inspectionItemId && items.some((item) => item.id === inspectionItemId)
        ? inspectionItemId
        : controlledInspection ? null : localInspectionId
    const activeInspectionId = exportMode || !requestedInspectionId || failedIds.has(requestedInspectionId) ? null : requestedInspectionId
    const manualFocusIndex = activeInspectionId ? items.findIndex((item) => item.id === activeInspectionId) : null
    const evaluated = evaluateLightTable({
        items: sources,
        parameters,
        timeline,
        timeMs,
        stageWidth: size.width,
        stageHeight: size.height,
        reducedMotion: prefersReducedMotion,
        manualFocusIndex: manualFocusIndex != null && manualFocusIndex >= 0 ? manualFocusIndex : null,
    })

    const sampledSourceTimeMs = sampledLightTableSourceTimeMs(timeMs, fps)
    const targetKey = `${config.settings.loopVideos ? "loop" : "clamp"}:${Math.round(sampledSourceTimeMs * 1_000)}`
    React.useEffect(() => setUnavailableKeys(new Set()), [sourceIdentity, targetKey])
    const committedVideoOwnerIdsRef = React.useRef<ReadonlySet<string>>(new Set())
    const videoOwnerIds = React.useMemo(
        () => exportMode ? new Set<string>() : new Set(selectLightTableVideoOwnerIds(items, evaluated.focusId, targetKey, posters, failedIds, unavailableKeys, committedVideoOwnerIdsRef.current)),
        [evaluated.focusId, exportMode, failedIds, items, posters, targetKey, unavailableKeys],
    )
    React.useLayoutEffect(() => {
        committedVideoOwnerIdsRef.current = videoOwnerIds
    }, [videoOwnerIds])

    const publishPoster = React.useCallback((id: string, poster: PosterRecord) => {
        if (currentVideoSourcesRef.current.get(id) !== poster.source) {
            revokePoster(poster.url)
            return
        }
        posterUrlsRef.current.add(poster.url)
        setPosters((current) => {
            const previous = current.get(id)
            if (!shouldReplaceLightTablePoster(previous, poster)) {
                revokePoster(poster.url)
                return current
            }
            const next = new Map(current)
            next.set(id, poster)
            if (previous) queuePosterRetirement(previous.url)
            return next
        })
    }, [queuePosterRetirement, revokePoster])

    const markFailed = React.useCallback((id: string) => setFailedIds((current) => new Set([...current, id])), [])
    const focusPlane = React.useCallback((index: number) => {
        const stage = stageRef.current
        const next = stage?.querySelector<HTMLElement>(`[data-source-index="${index}"]`)
        next?.focus()
    }, [])
    const inspect = React.useCallback((index: number) => {
        const item = items[index]
        if (!item || failedIds.has(item.id)) return
        setRovingIndex(index)
        const nextId = nextLightTableInspectionId(activeInspectionId, item.id)
        if (onInspectionItemChange) onInspectionItemChange(nextId)
        else setLocalInspectionId(nextId)
    }, [activeInspectionId, failedIds, items, onInspectionItemChange])
    const handleKey = React.useCallback((event: React.KeyboardEvent, index: number) => {
        if (!items.length || exportMode) return
        const intent = lightTableKeyIntent(event.key, index, items.length)
        if (!containLightTableKeyboardActivation(event, intent) || !intent) return
        if (intent.kind === "focus") {
            setRovingIndex(intent.index)
            requestAnimationFrame(() => focusPlane(intent.index))
        } else if (intent.kind === "inspect") inspect(intent.index)
        else if (onInspectionItemChange) onInspectionItemChange(null)
        else setLocalInspectionId(null)
    }, [exportMode, focusPlane, inspect, items.length, onInspectionItemChange])

    return <div
        ref={stageRef}
        className="light-table-stage"
        data-light-table-renderer="v2"
        data-scene-version="2"
        data-topology={evaluated.topology}
        data-opaque="true"
        data-transparent-supported="false"
        data-evaluator-hash={evaluated.stateHash}
        data-light-table-phase={evaluated.segmentId}
        data-light-table-focus={evaluated.focusId ?? ""}
        data-underlight-placement={evaluated.render.underlightPlacement}
        data-video-source-owners={videoOwnerIds.size}
        data-reduced-motion={prefersReducedMotion ? "true" : "false"}
        role={exportMode ? undefined : "group"}
        aria-label={exportMode ? undefined : "Light Table review surface"}
        style={{ "--light-table-surface": evaluated.render.background.color } as React.CSSProperties}
    >
        <div
            className="light-table-underlight-layer"
            data-light-table-layer="underlights"
            aria-hidden="true"
            style={{ zIndex: LIGHT_TABLE_UNDERLIGHT_LAYER_Z }}
        >
            {evaluated.planes.map((plane) => {
                const shortEdge = Math.min(plane.width, plane.height)
                return <span
                    className="light-table-underlight-anchor"
                    data-underlight-for={plane.id}
                    key={plane.id}
                    style={{
                        left: plane.x,
                        top: plane.y,
                        width: plane.width,
                        height: plane.height,
                        transform: `translate3d(-50%, -50%, 0) rotate(${plane.rotation}deg) scale(${plane.scale})`,
                        "--light-table-underlight-blur": `${shortEdge * 0.08}px`,
                    } as React.CSSProperties}
                >
                    <span className="light-table-underlight" style={{ opacity: plane.underlightOpacity, inset: `${-plane.underlightExpansion * 100}%` }} />
                </span>
            })}
        </div>
        {evaluated.planes.map((plane) => {
            const item = items[plane.sourceIndex]
            const exportSource = exportFrames?.[plane.sourceIndex]
            const source = exportSource ?? item.previewUrl ?? item.url
            const poster = retainedLightTablePoster(posters.get(plane.id), source)
            const focused = evaluated.focusId === plane.id
            const shortEdge = Math.min(plane.width, plane.height)
            const focusWidth = Math.max(0.5, shortEdge * 0.006)
            return <div
                className={`light-table-plane ${focused ? "is-inspected" : ""} ${plane.failed ? "is-failed" : ""}`}
                data-media-id={plane.id}
                data-source-index={plane.sourceIndex}
                data-source-time-ms={plane.sourceTimeMs}
                data-artwork-opacity={plane.opacity}
                data-artwork-filter={plane.filter}
                data-artwork-blend={plane.blend}
                data-light-table-layer="artwork"
                data-light-table-interactive={exportMode ? undefined : "true"}
                role={exportMode ? undefined : "button"}
                tabIndex={exportMode ? -1 : plane.sourceIndex === rovingIndex ? 0 : -1}
                aria-label={exportMode ? undefined : `Inspect ${item.name}`}
                aria-pressed={exportMode ? undefined : activeInspectionId === item.id}
                aria-disabled={exportMode ? undefined : plane.failed}
                onClick={exportMode ? undefined : (event) => activateLightTablePlane(event, plane.sourceIndex, inspect)}
                onKeyDown={exportMode ? undefined : (event) => handleKey(event, plane.sourceIndex)}
                key={plane.id}
                style={{
                    left: plane.x,
                    top: plane.y,
                    width: plane.width,
                    height: plane.height,
                    zIndex: lightTableArtworkLayerZ(plane.z),
                    transform: `translate3d(-50%, -50%, 0) rotate(${plane.rotation}deg) scale(${plane.scale})`,
                    "--light-table-frame-inset": `${shortEdge * 0.015}px`,
                    "--light-table-hairline": `${Math.max(0.35, shortEdge * 0.004)}px`,
                    "--light-table-shadow-y": `${shortEdge * 0.045}px`,
                    "--light-table-shadow-blur": `${shortEdge * 0.13}px`,
                    "--light-table-focus-gap": `${shortEdge * 0.028}px`,
                    "--light-table-focus-width": `${focusWidth}px`,
                    "--light-table-focus-mid": `${focusWidth * 2}px`,
                    "--light-table-focus-outer": `${focusWidth * 3.5}px`,
                } as React.CSSProperties}
            >
                <figure className="light-table-frame">
                    <div className="light-table-media-window">
                        {plane.failed
                            ? <div className="light-table-placeholder is-failed" data-media-failed={exportMode ? "true" : undefined} aria-hidden="true"><span>SOURCE UNAVAILABLE</span><strong>{String(plane.sourceIndex + 1).padStart(2, "0")}</strong></div>
                            : <LightTableMedia
                                item={item}
                                source={source}
                                index={plane.sourceIndex}
                                timeMs={sampledSourceTimeMs}
                                fps={fps}
                                loop={config.settings.loopVideos}
                                fit={parameters.fit}
                                exportFrame={Boolean(exportSource)}
                                exportMode={exportMode}
                                ownsVideo={videoOwnerIds.has(plane.id)}
                                poster={poster}
                                targetKey={targetKey}
                                encodeGate={encodeGate}
                                onPoster={(poster) => publishPoster(plane.id, poster)}
                                onFailure={() => markFailed(plane.id)}
                                onUnavailable={(unavailableTargetKey) => setUnavailableKeys((current) => new Set(current).add(`${plane.id}:${source}:${unavailableTargetKey}`))}
                            />}
                    </div>
                </figure>
                <span className="light-table-focus-ring" aria-hidden="true" style={{ opacity: plane.focusWeight }} />
            </div>
        })}
    </div>
}
