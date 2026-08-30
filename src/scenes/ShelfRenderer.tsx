import * as React from "react"
import type { MediaItem, ReelConfig } from "../types"
import { sourceVideoTimeSeconds } from "./quietCarousel"
import { evaluateShelf, selectShelfLiveVideoIds, shelfSourceTimeMs } from "./shelf"
import { effectiveShelfRatio, shelfFocusIdsForConfig, shelfMediaFailureState, shelfParametersForConfig, shelfTimelineForConfig } from "../shelfConfig"
import { reconcileShelfPosterRecords, shelfPosterKey, type ShelfPosterRecord } from "./shelfPosterCache"
import "../shelf.css"

type Props = {
    config: ReelConfig
    timeMs: number
    fps?: number
    exportFrames?: Record<number, string>
    terminal?: boolean
    cataloguePreview?: boolean
    reducedMotion?: boolean
    exportMode?: boolean
}

function placeholderItems(): MediaItem[] {
    return [16 / 9, 4 / 5, 1, 3 / 2, 9 / 16, 2.1, 5 / 4, 1].map((ratio, index) => ({
        id: `shelf-placeholder-${index + 1}`,
        name: `Edition ${index + 1}`,
        type: "image" as const,
        url: "",
        ratio,
        aspectMode: "auto" as const,
        ratioW: 16,
        ratioH: 9,
        fit: "contain" as const,
        crop: { x: 0, y: 0, width: 1, height: 1 },
        focal: { x: 0.5, y: 0.5 },
        caption: `Edition ${index + 1}`,
        spotlight: index === 3,
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

type PresentedFrameVideo = HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void) => number
    cancelVideoFrameCallback?: (handle: number) => void
}

function ShelfVideo({ source, sourceKey, poster, timeMs, loop, fps, style, onFailure, onPresented, onPosterFailure }: {
    source: string
    sourceKey: string
    poster: string | null
    timeMs: number
    loop: boolean
    style: React.CSSProperties
    onFailure: () => void
    fps: number
    onPresented: (key: string, surface: HTMLCanvasElement, replace: boolean) => void
    onPosterFailure: (key: string) => void
}) {
    const ref = React.useRef<HTMLVideoElement>(null)
    const surfaceRef = React.useRef<HTMLCanvasElement>(null)
    const frameHandle = React.useRef<number | null>(null)
    const seekCleanupRef = React.useRef<(() => void) | null>(null)
    const epochRef = React.useRef(0)
    const loadedSourceRef = React.useRef<string | null>(null)
    const confirmedTargetRef = React.useRef<number | null>(null)
    const desiredTargetRef = React.useRef<number | null>(null)
    const inFlightTargetRef = React.useRef<number | null>(null)
    const hasPresentedRef = React.useRef(false)
    const readyRef = React.useRef(false)
    const [hasPresented, setHasPresented] = React.useState(false)
    const [ready, setReady] = React.useState(false)
    const [presentedTime, setPresentedTime] = React.useState<number | null>(null)
    const [presentedTarget, setPresentedTarget] = React.useState<number | null>(null)
    const cancelPending = React.useCallback((video: PresentedFrameVideo | null) => {
        if (frameHandle.current !== null) video?.cancelVideoFrameCallback?.(frameHandle.current)
        frameHandle.current = null
        seekCleanupRef.current?.()
        seekCleanupRef.current = null
        video?.pause()
    }, [])
    const sync = React.useCallback(() => {
        const video = ref.current as PresentedFrameVideo | null
        if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return
        if (typeof video.requestVideoFrameCallback !== "function") {
            onFailure()
            return
        }
        const sampledTimeMs = Math.floor(Math.max(0, timeMs) * fps / 1_000 + 1e-9) * 1_000 / fps
        const requested = sourceVideoTimeSeconds(sampledTimeMs, video.duration, loop)
        const target = requested
        const tolerance = Math.max(0.0005, 1 / Math.max(1, fps))
        const matchesTarget = (value: number | null) => value !== null && Math.abs(value - target) <= 0.000001
        desiredTargetRef.current = target
        if (matchesTarget(inFlightTargetRef.current)) return
        if (matchesTarget(confirmedTargetRef.current) && inFlightTargetRef.current === null) return
        const epoch = ++epochRef.current
        inFlightTargetRef.current = target
        readyRef.current = false
        setReady(false)
        setPresentedTime(null)
        setPresentedTarget(null)
        cancelPending(video)
        const isCurrent = () => epochRef.current === epoch && loadedSourceRef.current === source && matchesTarget(desiredTargetRef.current)
        const fail = () => {
            if (!isCurrent()) return
            inFlightTargetRef.current = null
            onFailure()
        }
        let seekComplete = false
        let presentedMediaTime: number | null = null
        const publish = () => {
            if (!isCurrent() || !seekComplete || presentedMediaTime === null || !video.isConnected) return
            const surface = surfaceRef.current
            const dimensionsValid = Number.isFinite(video.videoWidth) && video.videoWidth > 0 && Number.isFinite(video.videoHeight) && video.videoHeight > 0
            const frameValid = presentedMediaTime >= 0 && presentedMediaTime <= target + 0.0001
                && Math.abs(video.currentTime - target) <= tolerance
                && !video.seeking && video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            if (!surface || !dimensionsValid || !frameValid) {
                fail()
                return
            }
            const staging = document.createElement("canvas")
            staging.width = video.videoWidth
            staging.height = video.videoHeight
            const stagingContext = staging.getContext("2d", { alpha: true })
            if (!stagingContext) {
                fail()
                return
            }
            try { stagingContext.drawImage(video, 0, 0, staging.width, staging.height) } catch {
                fail()
                return
            }
            if (!isCurrent() || video.seeking || Math.abs(video.currentTime - target) > tolerance) return
            if (hasPresentedRef.current && (surface.width !== staging.width || surface.height !== staging.height)) {
                fail()
                return
            }
            const context = surface.getContext("2d", { alpha: true })
            if (!context) {
                fail()
                return
            }
            if (!hasPresentedRef.current) {
                surface.width = staging.width
                surface.height = staging.height
            }
            const composite = context.globalCompositeOperation
            try {
                context.globalCompositeOperation = "copy"
                context.drawImage(staging, 0, 0, surface.width, surface.height)
            } catch {
                fail()
                return
            } finally {
                context.globalCompositeOperation = composite
            }
            seekCleanupRef.current?.()
            seekCleanupRef.current = null
            confirmedTargetRef.current = target
            inFlightTargetRef.current = null
            hasPresentedRef.current = true
            readyRef.current = true
            setHasPresented(true)
            setReady(true)
            setPresentedTime(presentedMediaTime)
            setPresentedTarget(target)
            onPresented(sourceKey, surface, true)
        }
        const arm = () => {
            if (!isCurrent() || frameHandle.current !== null || !video.isConnected) return false
            const handle = video.requestVideoFrameCallback?.((_now, metadata) => {
                if (frameHandle.current === handle) frameHandle.current = null
                if (!isCurrent() || !video.isConnected) return
                if (!Number.isFinite(metadata.mediaTime)) {
                    fail()
                    return
                }
                presentedMediaTime = metadata.mediaTime
                publish()
            })
            if (handle !== undefined) frameHandle.current = handle
            return handle !== undefined
        }
        const seekTarget = () => {
            if (!isCurrent()) return
            video.pause()
            const onSeeked = () => {
                seekCleanupRef.current = null
                if (!isCurrent()) return
                seekComplete = true
                publish()
            }
            video.addEventListener("seeked", onSeeked, { once: true })
            seekCleanupRef.current = () => video.removeEventListener("seeked", onSeeked)
            if (!arm()) {
                seekCleanupRef.current?.()
                seekCleanupRef.current = null
                fail()
                return
            }
            try { video.currentTime = target } catch { fail() }
        }
        if (!video.seeking && Math.abs(video.currentTime - target) <= 0.000001) {
            const detourDistance = Math.min(video.duration / 2, Math.max(0.25, 2 / Math.max(1, fps)))
            const detour = target + detourDistance < video.duration ? target + detourDistance : Math.max(0, target - detourDistance)
            if (Math.abs(detour - target) > 0.000001) {
                const onDetour = () => {
                    seekCleanupRef.current = null
                    seekTarget()
                }
                video.addEventListener("seeked", onDetour, { once: true })
                seekCleanupRef.current = () => video.removeEventListener("seeked", onDetour)
                try { video.currentTime = detour } catch { fail() }
                return
            }
        }
        seekTarget()
    }, [cancelPending, fps, loop, onFailure, onPresented, source, sourceKey, timeMs])
    React.useLayoutEffect(() => {
        const video = ref.current as PresentedFrameVideo | null
        if (!video) return
        epochRef.current += 1
        loadedSourceRef.current = source
        confirmedTargetRef.current = null
        desiredTargetRef.current = null
        inFlightTargetRef.current = null
        hasPresentedRef.current = false
        readyRef.current = false
        setHasPresented(false)
        setReady(false)
        setPresentedTime(null)
        setPresentedTarget(null)
        video.src = source
        video.load()
        return () => {
            epochRef.current += 1
            loadedSourceRef.current = null
            desiredTargetRef.current = null
            inFlightTargetRef.current = null
            cancelPending(video)
            const surface = surfaceRef.current
            if (hasPresentedRef.current && surface) onPresented(sourceKey, surface, true)
            hasPresentedRef.current = false
            readyRef.current = false
            video.removeAttribute("src")
            try { video.load() } catch { /* detached decoder teardown is best-effort */ }
        }
    }, [cancelPending, onPresented, source, sourceKey])
    React.useLayoutEffect(sync, [sync])
    return <>
        {!hasPresented && poster ? <img className="shelf-media shelf-video-poster" src={poster} alt="" draggable={false} style={style} data-poster-owner={sourceKey} onError={() => onPosterFailure(sourceKey)} /> : null}
        <canvas
            ref={surfaceRef}
            className="shelf-media shelf-video-surface"
            aria-hidden="true"
            style={{ ...style, visibility: hasPresented ? "visible" : "hidden" }}
            data-story-ready={ready ? "true" : "false"}
            data-story-frame-proof={ready ? "presented" : "none"}
            data-story-presented-time={presentedTime ?? ""}
            data-story-target-time={presentedTarget ?? ""}
        />
        <video
            ref={ref}
            className="shelf-video-decoder"
            crossOrigin="anonymous"
            muted
            playsInline
            preload="auto"
            data-source-owner={sourceKey}
            aria-hidden="true"
            onLoadedMetadata={sync}
            onError={onFailure}
        />
    </>
}

function ShelfMedia({ item, source, sourceKey, poster, timeMs, loop, fps, fit, allowLiveVideo, frame, sourceRequired, onPresented, onPosterFailure }: {
    item: MediaItem
    source: string | null
    sourceKey: string
    poster: string | null
    timeMs: number
    loop: boolean
    fps: number
    fit: "contain" | "cover"
    allowLiveVideo: boolean
    frame: boolean
    sourceRequired: boolean
    onPresented: (key: string, surface: HTMLCanvasElement, replace: boolean) => void
    onPosterFailure: (key: string) => void
}) {
    const [failed, setFailed] = React.useState(false)
    React.useEffect(() => setFailed(false), [source])
    const style = mediaStyle(item, fit)
    const fail = React.useCallback(() => setFailed(true), [])
    const mediaFailed = shelfMediaFailureState(source, failed, sourceRequired)
    if (failed || !source) return <div className="shelf-placeholder" data-media-failed={mediaFailed ? "true" : "false"} data-media-required={sourceRequired ? "true" : "false"}><span>{item.type === "video" ? "VIDEO" : "FRAME"}</span></div>
    if (frame) return <img className="shelf-media" src={source} alt="" draggable={false} style={style} onError={fail} />
    if (item.type === "video" && !allowLiveVideo && poster) return <img className="shelf-media shelf-video-poster" src={poster} alt="" draggable={false} style={style} data-poster-owner={sourceKey} onError={() => onPosterFailure(sourceKey)} />
    if (item.type === "video" && !allowLiveVideo) return <div className="shelf-placeholder is-video-poster-pending" data-media-failed="false"><span>VIDEO</span></div>
    if (item.type === "video") return <ShelfVideo key={sourceKey} source={source} sourceKey={sourceKey} poster={poster} timeMs={timeMs} loop={loop} fps={fps} style={style} onFailure={fail} onPresented={onPresented} onPosterFailure={onPosterFailure} />
    return <img className="shelf-media" src={source} alt="" draggable={false} style={style} onError={fail} />
}

export default function ShelfRenderer({ config, timeMs, fps = 30, exportFrames, terminal = false, cataloguePreview = false, reducedMotion, exportMode = false }: Props) {
    const [systemReducedMotion, setSystemReducedMotion] = React.useState(() => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false))
    const [, setPosterRevision] = React.useState(0)
    const posterRecordsRef = React.useRef(new Map<string, ShelfPosterRecord>())
    const posterEncodesRef = React.useRef(new Map<string, symbol>())
    const posterFailuresRef = React.useRef(new Set<string>())
    const validPosterKeysRef = React.useRef(new Set<string>())
    const observedPosterKeysRef = React.useRef<string[]>([])
    const posterLimitRef = React.useRef(0)
    const posterClockRef = React.useRef(0)
    const mountGenerationRef = React.useRef(0)
    const disposedRef = React.useRef(false)
    const stageRef = React.useRef<HTMLDivElement>(null)
    const pendingPosterRetirementsRef = React.useRef(new Set<string>())
    const revokePoster = React.useCallback((url: string) => {
        try { URL.revokeObjectURL(url) } catch { /* a stale renderer-owned URL is already retired */ }
    }, [])
    const queuePosterRetirement = React.useCallback((url: string) => {
        pendingPosterRetirementsRef.current.add(url)
    }, [])
    const discardPoster = React.useCallback((key: string) => {
        const record = posterRecordsRef.current.get(key)
        if (!record) return
        const next = new Map(posterRecordsRef.current)
        next.delete(key)
        posterRecordsRef.current = next
        queuePosterRetirement(record.url)
        setPosterRevision((revision) => revision + 1)
    }, [queuePosterRetirement])
    const capturePoster = React.useCallback((key: string, surface: HTMLCanvasElement, replace: boolean) => {
        const previous = posterRecordsRef.current.get(key)
        if (disposedRef.current || !validPosterKeysRef.current.has(key) || (!replace && previous)
            || posterEncodesRef.current.has(key) || posterEncodesRef.current.size >= 2 || (!previous && posterFailuresRef.current.has(key))) return
        const width = surface.width
        const height = surface.height
        if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext("2d", { alpha: true })
        if (!context) {
            posterFailuresRef.current.add(key)
            return
        }
        try { context.drawImage(surface, 0, 0, width, height) } catch {
            posterFailuresRef.current.add(key)
            return
        }
        const token = Symbol(key)
        posterEncodesRef.current.set(key, token)
        const encoded = (blob: Blob | null) => {
            if (posterEncodesRef.current.get(key) !== token) return
            posterEncodesRef.current.delete(key)
            if (!blob) {
                if (!previous) posterFailuresRef.current.add(key)
                return
            }
            const url = URL.createObjectURL(blob)
            if (disposedRef.current || !validPosterKeysRef.current.has(key)) {
                revokePoster(url)
                return
            }
            const next = new Map(posterRecordsRef.current)
            next.set(key, { key, url, touched: ++posterClockRef.current })
            const reconciled = reconcileShelfPosterRecords(next, validPosterKeysRef.current, observedPosterKeysRef.current, posterLimitRef.current)
            posterRecordsRef.current = reconciled.keep
            for (const retired of reconciled.revoke) {
                if (retired === url) revokePoster(retired)
                else queuePosterRetirement(retired)
            }
            setPosterRevision((revision) => revision + 1)
        }
        try { canvas.toBlob(encoded, "image/png") } catch {
            posterEncodesRef.current.delete(key)
            if (!previous) posterFailuresRef.current.add(key)
        }
    }, [queuePosterRetirement, revokePoster])
    React.useEffect(() => {
        const query = window.matchMedia?.("(prefers-reduced-motion: reduce)")
        if (!query) return
        const update = () => setSystemReducedMotion(query.matches)
        query.addEventListener("change", update)
        return () => query.removeEventListener("change", update)
    }, [])
    React.useEffect(() => {
        disposedRef.current = false
        const generation = ++mountGenerationRef.current
        return () => {
            disposedRef.current = true
            queueMicrotask(() => {
                if (mountGenerationRef.current !== generation || !disposedRef.current) return
                for (const record of posterRecordsRef.current.values()) revokePoster(record.url)
                for (const url of pendingPosterRetirementsRef.current) revokePoster(url)
                posterRecordsRef.current.clear()
                pendingPosterRetirementsRef.current.clear()
                posterEncodesRef.current.clear()
                posterFailuresRef.current.clear()
            })
        }
    }, [revokePoster])
    const sourceItems = config.items.length ? config.items : cataloguePreview ? placeholderItems() : []
    const items = React.useMemo(() => sourceItems.map((item) => ({
        id: item.id,
        ratio: effectiveShelfRatio(item, config.settings),
        caption: item.caption ?? item.name,
    })), [config.settings, sourceItems])
    const timeline = React.useMemo(() => shelfTimelineForConfig(config, fps, items.length), [config, fps, items.length])
    const parameters = shelfParametersForConfig(config)
    const { spotlightId, finaleId } = shelfFocusIdsForConfig({ ...config, items: sourceItems })
    const effectiveReducedMotion = reducedMotion ?? (!exportMode && systemReducedMotion)
    const evaluated = evaluateShelf({
        items,
        parameters,
        timeline,
        timeMs,
        stageWidth: config.settings.canvasWidth,
        stageHeight: config.settings.canvasHeight,
        terminal,
        reducedMotion: effectiveReducedMotion,
        spotlightId,
        finaleId,
    })
    const sourceTimeMs = effectiveReducedMotion ? 0 : shelfSourceTimeMs(timeMs, timeline.durationMs, config.settings.direction, terminal)
    const liveVideoIds = new Set(exportMode ? [] : selectShelfLiveVideoIds(evaluated.slots, sourceItems, config.settings.canvasWidth))
    const liveSlotIds = new Set<string>()
    for (const id of liveVideoIds) {
        const owner = evaluated.slots
            .filter((slot) => slot.id === id && sourceItems[slot.sourceIndex]?.type === "video")
            .sort((left, right) => Number(right.visible) - Number(left.visible)
                || Math.abs(left.x - config.settings.canvasWidth / 2) - Math.abs(right.x - config.settings.canvasWidth / 2)
                || left.copyIndex - right.copyIndex)[0]
        if (owner) liveSlotIds.add(owner.slotId)
    }
    const validPosterKeys = new Set(sourceItems.filter((item) => item.type === "video" && item.url).map(shelfPosterKey))
    const observedPosterKeys = evaluated.slots
        .filter((slot) => sourceItems[slot.sourceIndex]?.type === "video")
        .sort((left, right) => Number(right.visible) - Number(left.visible)
            || Math.abs(left.x - config.settings.canvasWidth / 2) - Math.abs(right.x - config.settings.canvasWidth / 2)
            || left.sourceIndex - right.sourceIndex)
        .map((slot) => shelfPosterKey(sourceItems[slot.sourceIndex]))
        .filter((key, index, keys) => keys.indexOf(key) === index)
    React.useLayoutEffect(() => {
        validPosterKeysRef.current = validPosterKeys
        observedPosterKeysRef.current = observedPosterKeys
        posterLimitRef.current = evaluated.maxObservedNodes
        for (const key of [...posterFailuresRef.current]) if (!validPosterKeys.has(key)) posterFailuresRef.current.delete(key)
        const next = new Map(posterRecordsRef.current)
        for (const key of observedPosterKeys) {
            const record = next.get(key)
            if (record) next.set(key, { ...record, touched: ++posterClockRef.current })
        }
        const reconciled = reconcileShelfPosterRecords(next, validPosterKeys, observedPosterKeys, evaluated.maxObservedNodes)
        const changed = reconciled.keep.size !== posterRecordsRef.current.size || reconciled.revoke.length > 0
        posterRecordsRef.current = reconciled.keep
        for (const retired of reconciled.revoke) queuePosterRetirement(retired)
        if (changed) setPosterRevision((revision) => revision + 1)
    }, [evaluated.maxObservedNodes, observedPosterKeys.join("\u0000"), queuePosterRetirement, [...validPosterKeys].join("\u0000")])
    React.useLayoutEffect(() => {
        const stage = stageRef.current
        if (!stage || pendingPosterRetirementsRef.current.size === 0) return
        const connectedSources = new Set(
            [...stage.querySelectorAll<HTMLImageElement>("img.shelf-video-poster")]
                .filter((image) => image.isConnected)
                .flatMap((image) => [image.currentSrc, image.getAttribute("src") ?? ""])
                .filter(Boolean),
        )
        for (const url of pendingPosterRetirementsRef.current) {
            if (connectedSources.has(url)) continue
            pendingPosterRetirementsRef.current.delete(url)
            revokePoster(url)
        }
    })
    const transparent = config.settings.backgroundStyle === "transparent"
    const background = transparent ? "transparent" : config.settings.ground || (config.settings.theme === "light" ? "#ede9df" : "#11110f")
    const nearest = evaluated.slots.filter((slot) => slot.visible).sort((left, right) => Math.abs(left.x - config.settings.canvasWidth / 2) - Math.abs(right.x - config.settings.canvasWidth / 2))[0]
    const semanticIndex = nearest?.sourceIndex ?? -1
    const semanticItem = semanticIndex >= 0 ? sourceItems[semanticIndex] : null
    const semanticLabel = semanticItem ? semanticItem.caption || semanticItem.name || semanticItem.id : null
    const announceSelection = terminal || effectiveReducedMotion
    const statusMessage = announceSelection && semanticLabel
        ? `${semanticLabel}, item ${semanticIndex + 1} of ${sourceItems.length}`
        : sourceItems.length > 0 ? `Shelf, ${sourceItems.length} items` : "Shelf is empty"
    return <div
        ref={stageRef}
        className={`shelf-stage ${transparent ? "is-transparent" : ""}`}
        data-product-scene="the-shelf"
        data-scene-version="2"
        data-evaluator-hash={evaluated.stateHash}
        data-shelf-phrase={evaluated.phrase}
        data-shelf-phase={evaluated.phase}
        data-shelf-source-count={evaluated.count}
        data-shelf-render-count={evaluated.slots.length}
        data-shelf-overflow-count={evaluated.overflowedObservedSlots}
        data-shelf-live-video-count={liveSlotIds.size}
        data-shelf-poster-count={posterRecordsRef.current.size}
        data-shelf-duplicate-media={evaluated.duplicateProjectMedia ? "true" : "false"}
        role="group"
        aria-label={`Shelf scene, ${sourceItems.length} ${sourceItems.length === 1 ? "item" : "items"}`}
        style={{ background } as React.CSSProperties}
    >
        <div className="shelf-field" aria-hidden="true" />
        {evaluated.baselineY !== null ? <div className="shelf-baseline" aria-hidden="true" style={{ top: `${evaluated.baselineY / config.settings.canvasHeight * 100}%` }} /> : null}
        {evaluated.slots.map((slot) => {
            const item = sourceItems[slot.sourceIndex]
            if (!item) return null
            const exported = exportFrames?.[slot.sourceIndex]
            const source = exported ?? (exportMode && item.type === "video" ? null : item.url || null)
            const sourceKey = shelfPosterKey(item)
            const poster = item.type === "video" ? posterRecordsRef.current.get(sourceKey)?.url ?? null : null
            const crop = resolvedCrop(item)
            const focal = item.focal ?? { x: 0.5, y: 0.5 }
            const allowLiveVideo = item.type !== "video" || Boolean(exported) || liveSlotIds.has(slot.slotId)
            return <figure
                className={`shelf-card ${slot.focusProgress > 0 ? "is-focused" : ""} ${slot.visible ? "is-visible" : "is-guard"}`}
                data-media-id={slot.id}
                data-source-index={slot.sourceIndex}
                data-copy-index={slot.copyIndex}
                data-frame-fit={item.fit ?? parameters.fit}
                data-live-video={item.type === "video" && !exported && liveSlotIds.has(slot.slotId) ? "true" : "false"}
                data-poster-key={item.type === "video" ? sourceKey : undefined}
                data-x={slot.x}
                data-bottom-y={slot.bottomY}
                data-plane-width={slot.width}
                data-plane-height={slot.height}
                data-base-lean={slot.baseLeanDeg}
                data-lean={slot.leanDeg}
                data-focus-progress={slot.focusProgress}
                data-crop-x={crop.x}
                data-crop-y={crop.y}
                data-crop-width={crop.width}
                data-crop-height={crop.height}
                data-focal-x={focal.x}
                data-focal-y={focal.y}
                aria-hidden="true"
                key={`${slot.slotId}:${sourceKey}`}
                style={{
                    left: `${slot.x / config.settings.canvasWidth * 100}%`,
                    top: `${slot.bottomY / config.settings.canvasHeight * 100}%`,
                    width: `${slot.width / config.settings.canvasWidth * 100}%`,
                    height: `${slot.height / config.settings.canvasHeight * 100}%`,
                    zIndex: slot.focusProgress > 0 ? 2 : 1,
                    transform: `translate(-50%,-100%) rotate(${slot.leanDeg}deg)`,
                    opacity: 1,
                    filter: "none",
                    mixBlendMode: "normal",
                }}
            >
                <div className="shelf-artwork-plane">
                    <ShelfMedia item={item} source={source} sourceKey={sourceKey} poster={poster} timeMs={sourceTimeMs} loop={config.settings.loopVideos} fps={fps} fit={parameters.fit} allowLiveVideo={allowLiveVideo} frame={Boolean(exported)} sourceRequired={exportMode} onPresented={capturePoster} onPosterFailure={discardPoster} />
                </div>
            </figure>
        })}
        <div className="shelf-status" role={announceSelection ? "status" : undefined} aria-live={announceSelection ? "polite" : "off"} aria-atomic="true">{statusMessage}</div>
    </div>
}
