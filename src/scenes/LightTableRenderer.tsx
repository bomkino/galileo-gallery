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
    matchingLightTablePoster,
    sampledLightTableSourceTimeMs,
    selectLightTableVideoOwnerIds,
    type LightTablePosterEncodeGate,
    type LightTablePosterRecord as PosterRecord,
} from "./lightTableVideoPolicy.ts"
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

function LightTableVideo({ source, item, timeMs, fps, loop, fit, posterUrl, targetKey, encodeGate, onPoster, onFailure, onUnavailable }: {
    source: string
    item: MediaItem
    timeMs: number
    fps: number
    loop: boolean
    fit: "contain" | "cover"
    posterUrl?: string
    targetKey: string
    encodeGate: LightTablePosterEncodeGate
    onPoster: (poster: PosterRecord) => void
    onFailure: () => void
    onUnavailable: () => void
}) {
    const ref = React.useRef<HTMLVideoElement>(null)
    const epochRef = React.useRef(0)
    const frameCallbackRef = React.useRef<number | null>(null)
    const frameTimeoutRef = React.useRef<number | null>(null)
    const seekCleanupRef = React.useRef<(() => void) | null>(null)
    const encodeTokenRef = React.useRef<symbol | null>(null)
    const onPosterRef = React.useRef(onPoster)
    const onUnavailableRef = React.useRef(onUnavailable)
    const [ready, setReady] = React.useState(false)
    React.useLayoutEffect(() => {
        onPosterRef.current = onPoster
        onUnavailableRef.current = onUnavailable
    }, [onPoster, onUnavailable])
    const cancel = React.useCallback((video: HTMLVideoElement) => {
        seekCleanupRef.current?.()
        seekCleanupRef.current = null
        const callbackId = frameCallbackRef.current
        if (callbackId !== null && typeof video.cancelVideoFrameCallback === "function") video.cancelVideoFrameCallback(callbackId)
        frameCallbackRef.current = null
        if (frameTimeoutRef.current !== null) window.clearTimeout(frameTimeoutRef.current)
        frameTimeoutRef.current = null
    }, [])
    const capture = React.useCallback((video: HTMLVideoElement, epoch: number, target: number) => {
        if (epoch !== epochRef.current || ref.current !== video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false
        const targetTolerance = Math.max(0.0005, 0.5 / Math.max(1, fps))
        if (!Number.isFinite(video.currentTime) || Math.abs(video.currentTime - target) > targetTolerance || video.videoWidth <= 0 || video.videoHeight <= 0) return false
        const canvas = document.createElement("canvas")
        const scale = Math.min(1, LIGHT_TABLE_POSTER_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight))
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        const context = canvas.getContext("2d", { alpha: false })
        if (!context) {
            onUnavailableRef.current()
            return true
        }
        try {
            context.drawImage(video, 0, 0, canvas.width, canvas.height)
            encodeTokenRef.current = encodeGate.schedule(item.id, (release) => {
                let settled = false
                const timeout = window.setTimeout(() => {
                    if (settled) return
                    settled = true
                    release()
                    if (epoch === epochRef.current) onUnavailableRef.current()
                }, 3_000)
                try {
                    canvas.toBlob((blob) => {
                        if (settled) return
                        settled = true
                        window.clearTimeout(timeout)
                        release()
                        if (epoch !== epochRef.current || ref.current !== video) return
                        if (!blob || blob.size > LIGHT_TABLE_POSTER_MAX_BYTES) {
                            onUnavailableRef.current()
                            return
                        }
                        const url = URL.createObjectURL(blob)
                        onPosterRef.current({ source, targetKey, url })
                        setReady(true)
                    }, "image/png")
                } catch {
                    settled = true
                    window.clearTimeout(timeout)
                    release()
                    if (epoch === epochRef.current) onUnavailableRef.current()
                }
            })
            if (encodeTokenRef.current === null) onUnavailableRef.current()
            return true
        } catch {
            onUnavailableRef.current()
            return true
        }
    }, [encodeGate, fps, item.id, source, targetKey])
    const sync = React.useCallback(() => {
        const video = ref.current
        if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return
        const epoch = epochRef.current + 1
        epochRef.current = epoch
        cancel(video)
        video.pause()
        const target = lightTableSourceTimeSeconds(timeMs, video.duration, loop)
        setReady(false)
        const confirm = () => {
            if (epoch !== epochRef.current || ref.current !== video) return
            if (typeof video.requestVideoFrameCallback === "function") {
                frameCallbackRef.current = video.requestVideoFrameCallback((_now, metadata) => {
                    frameCallbackRef.current = null
                    if (frameTimeoutRef.current !== null) window.clearTimeout(frameTimeoutRef.current)
                    frameTimeoutRef.current = null
                    if (epoch !== epochRef.current) return
                    if (Math.abs(metadata.mediaTime - target) > Math.max(0.0005, 0.5 / Math.max(1, fps))) {
                        onUnavailableRef.current()
                        return
                    }
                    if (!capture(video, epoch, target)) onUnavailableRef.current()
                })
                frameTimeoutRef.current = window.setTimeout(() => {
                    frameTimeoutRef.current = null
                    if (epoch !== epochRef.current) return
                    const callbackId = frameCallbackRef.current
                    if (callbackId !== null && typeof video.cancelVideoFrameCallback === "function") video.cancelVideoFrameCallback(callbackId)
                    frameCallbackRef.current = null
                    if (!capture(video, epoch, target)) onUnavailableRef.current()
                }, 400)
                void video.play().then(() => video.pause()).catch(() => {
                    cancel(video)
                    if (!capture(video, epoch, target)) onUnavailableRef.current()
                })
                return
            }
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (!capture(video, epoch, target)) onUnavailableRef.current()
            }))
        }
        if (!video.seeking && Math.abs(video.currentTime - target) <= Math.max(0.0005, 0.5 / Math.max(1, fps))) {
            confirm()
            return
        }
        const onSeeked = () => {
            seekCleanupRef.current = null
            confirm()
        }
        video.addEventListener("seeked", onSeeked, { once: true })
        seekCleanupRef.current = () => video.removeEventListener("seeked", onSeeked)
        video.currentTime = target
    }, [cancel, capture, fps, loop, timeMs])
    React.useLayoutEffect(sync, [sync])
    React.useLayoutEffect(() => {
        const video = ref.current
        if (!video) return
        epochRef.current += 1
        video.crossOrigin = "anonymous"
        video.src = source
        video.load()
        return () => {
            epochRef.current += 1
            encodeGate.cancel(item.id, encodeTokenRef.current)
            encodeTokenRef.current = null
            cancel(video)
            video.pause()
            video.removeAttribute("src")
            video.load()
        }
    }, [cancel, encodeGate, item.id, source])
    return <>
        {posterUrl ? <img className="light-table-media product-export-media" src={posterUrl} alt="" aria-hidden="true" draggable={false} style={sourceStyle(item, fit)} /> : null}
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
            onLoadedMetadata={sync}
            onError={onFailure}
            style={{ ...sourceStyle(item, fit), position: "absolute", inset: 0, visibility: ready ? "visible" : "hidden" }}
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
    onUnavailable: () => void
}) {
    if (!source) return <div className="light-table-placeholder" aria-hidden="true"><span>FRAME</span><strong>{String(index + 1).padStart(2, "0")}</strong></div>
    if (item.type === "video" && !exportFrame) {
        if (exportMode) return <div className="light-table-placeholder is-failed" data-media-failed="true" aria-hidden="true"><span>SOURCE FRAME REQUIRED</span><strong>{String(index + 1).padStart(2, "0")}</strong></div>
        if (ownsVideo) return <LightTableVideo source={source} item={item} timeMs={timeMs} fps={fps} loop={loop} fit={fit} posterUrl={poster?.url} targetKey={targetKey} encodeGate={encodeGate} onPoster={onPoster} onFailure={onFailure} onUnavailable={onUnavailable} />
        if (poster) return <img className="light-table-media product-export-media" src={poster.url} alt="" aria-hidden="true" draggable={false} style={sourceStyle(item, fit)} />
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

export default function LightTableRenderer({ config, timeMs, fps = 30, exportFrames, cataloguePreview = false, reducedMotion, exportMode = false, inspectionItemId = null }: Props) {
    assertLightTableOpaqueIntent(config.settings.backgroundStyle)
    const stageRef = React.useRef<HTMLDivElement>(null)
    const [size, setSize] = React.useState({ width: config.settings.canvasWidth, height: config.settings.canvasHeight })
    const [failedIds, setFailedIds] = React.useState<ReadonlySet<string>>(new Set())
    const [posters, setPosters] = React.useState<ReadonlyMap<string, PosterRecord>>(new Map())
    const [unavailableKeys, setUnavailableKeys] = React.useState<ReadonlySet<string>>(new Set())
    const posterUrlsRef = React.useRef(new Set<string>())
    const [rovingIndex, setRovingIndex] = React.useState(0)
    const [localInspectionId, setLocalInspectionId] = React.useState<string | null>(null)
    const [encodeGate] = React.useState(() => createLightTablePosterEncodeGate())
    const prefersReducedMotion = useReducedMotion(reducedMotion, exportMode)
    const items = React.useMemo(() => config.items.length ? config.items : cataloguePreview ? placeholderItems() : [], [cataloguePreview, config.items])
    const sourceIdentity = React.useMemo(() => JSON.stringify(items.map((item) => [item.id, item.type, item.url, item.previewUrl ?? ""])), [items])
    const workingConfig = React.useMemo(() => ({ ...config, items }), [config, items])

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
            posterUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
            posterUrlsRef.current.clear()
            return new Map()
        })
    }, [sourceIdentity])
    React.useEffect(() => () => {
        encodeGate.dispose()
        posterUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
        posterUrlsRef.current.clear()
    }, [encodeGate])

    const parameters = React.useMemo(() => lightTableParametersFromConfig(workingConfig), [workingConfig])
    const timeline = React.useMemo(() => lightTableTimelineFromConfig(workingConfig, fps, lightTableTimelineMediaCount(items.length, cataloguePreview)), [cataloguePreview, fps, items.length, workingConfig])
    const sources = React.useMemo(() => lightTableSourcesFromConfig(workingConfig, failedIds), [failedIds, workingConfig])
    const requestedInspectionId = inspectionItemId && items.some((item) => item.id === inspectionItemId) ? inspectionItemId : localInspectionId
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
    const videoOwnerIds = React.useMemo(
        () => exportMode ? new Set<string>() : new Set(selectLightTableVideoOwnerIds(items, evaluated.focusId, targetKey, posters, failedIds, unavailableKeys)),
        [evaluated.focusId, exportMode, failedIds, items, posters, targetKey, unavailableKeys],
    )

    const retirePoster = React.useCallback((url: string) => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
            URL.revokeObjectURL(url)
            posterUrlsRef.current.delete(url)
        }))
    }, [])
    const publishPoster = React.useCallback((id: string, poster: PosterRecord) => {
        posterUrlsRef.current.add(poster.url)
        setPosters((current) => {
            const previous = current.get(id)
            if (previous?.source === poster.source && previous.targetKey === poster.targetKey) {
                URL.revokeObjectURL(poster.url)
                posterUrlsRef.current.delete(poster.url)
                return current
            }
            const next = new Map(current)
            next.set(id, poster)
            if (previous) retirePoster(previous.url)
            return next
        })
    }, [retirePoster])

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
        setLocalInspectionId((current) => current === item.id ? null : item.id)
    }, [failedIds, items])
    const handleKey = React.useCallback((event: React.KeyboardEvent, index: number) => {
        if (!items.length || exportMode) return
        let nextIndex: number | null = null
        if (["ArrowRight", "ArrowDown"].includes(event.key)) nextIndex = (index + 1) % items.length
        if (["ArrowLeft", "ArrowUp"].includes(event.key)) nextIndex = (index - 1 + items.length) % items.length
        if (event.key === "Home") nextIndex = 0
        if (event.key === "End") nextIndex = items.length - 1
        if (nextIndex != null) {
            event.preventDefault()
            setRovingIndex(nextIndex)
            requestAnimationFrame(() => focusPlane(nextIndex as number))
            return
        }
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            inspect(index)
        }
        if (event.key === "Escape") {
            event.preventDefault()
            setLocalInspectionId(null)
        }
    }, [exportMode, focusPlane, inspect, items.length])

    return <div
        ref={stageRef}
        className="light-table-stage"
        data-light-table-renderer="v2"
        data-scene-version="2"
        data-topology={evaluated.topology}
        data-opaque="true"
        data-transparent-supported="false"
        data-video-source-owners={videoOwnerIds.size}
        data-reduced-motion={prefersReducedMotion ? "true" : "false"}
        role={exportMode ? undefined : "group"}
        aria-label={exportMode ? undefined : "Light Table review surface"}
        style={{ "--light-table-surface": evaluated.render.background.color } as React.CSSProperties}
    >
        {evaluated.planes.map((plane) => {
            const item = items[plane.sourceIndex]
            const exportSource = exportFrames?.[plane.sourceIndex]
            const source = exportSource ?? item.previewUrl ?? item.url
            const poster = matchingLightTablePoster(posters.get(plane.id), source, targetKey)
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
                data-underlight-placement={evaluated.render.underlightPlacement}
                role={exportMode ? undefined : "button"}
                tabIndex={exportMode ? -1 : plane.sourceIndex === rovingIndex ? 0 : -1}
                aria-label={exportMode ? undefined : `Inspect ${item.name}`}
                aria-pressed={exportMode ? undefined : activeInspectionId === item.id}
                aria-disabled={exportMode ? undefined : plane.failed}
                onClick={exportMode ? undefined : () => inspect(plane.sourceIndex)}
                onKeyDown={exportMode ? undefined : (event) => handleKey(event, plane.sourceIndex)}
                key={plane.id}
                style={{
                    left: plane.x,
                    top: plane.y,
                    width: plane.width,
                    height: plane.height,
                    zIndex: plane.z,
                    transform: `translate3d(-50%, -50%, 0) rotate(${plane.rotation}deg) scale(${plane.scale})`,
                    "--light-table-frame-inset": `${shortEdge * 0.015}px`,
                    "--light-table-hairline": `${Math.max(0.35, shortEdge * 0.004)}px`,
                    "--light-table-underlight-blur": `${shortEdge * 0.08}px`,
                    "--light-table-shadow-y": `${shortEdge * 0.045}px`,
                    "--light-table-shadow-blur": `${shortEdge * 0.13}px`,
                    "--light-table-focus-gap": `${shortEdge * 0.028}px`,
                    "--light-table-focus-width": `${focusWidth}px`,
                    "--light-table-focus-mid": `${focusWidth * 2}px`,
                    "--light-table-focus-outer": `${focusWidth * 3.5}px`,
                } as React.CSSProperties}
            >
                <span className="light-table-underlight" aria-hidden="true" style={{ opacity: plane.underlightOpacity, inset: `${-plane.underlightExpansion * 100}%` }} />
                <figure className="light-table-frame">
                    <div className="light-table-media-window">
                        {plane.failed
                            ? <div className="light-table-placeholder is-failed" aria-hidden="true"><span>SOURCE UNAVAILABLE</span><strong>{String(plane.sourceIndex + 1).padStart(2, "0")}</strong></div>
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
                                onUnavailable={() => setUnavailableKeys((current) => new Set(current).add(`${plane.id}:${source}:${targetKey}`))}
                            />}
                    </div>
                </figure>
                <span className="light-table-focus-ring" aria-hidden="true" style={{ opacity: plane.focusWeight }} />
            </div>
        })}
    </div>
}
