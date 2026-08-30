import * as React from "react"
import type { MediaItem, ReelConfig } from "../types"
import { sourceVideoTimeSeconds } from "./quietCarousel"
import { evaluateShelf, selectShelfLiveVideoIds, shelfStoryTimeMs } from "./shelf"
import { effectiveShelfRatio, shelfFocusIdsForConfig, shelfMediaFailureState, shelfParametersForConfig, shelfTimelineForConfig } from "../shelfConfig"
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

function ShelfVideo({ source, timeMs, loop, style, onFailure }: { source: string; timeMs: number; loop: boolean; style: React.CSSProperties; onFailure: () => void }) {
    const ref = React.useRef<HTMLVideoElement>(null)
    const seek = React.useCallback(() => {
        const video = ref.current
        if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return
        const target = sourceVideoTimeSeconds(timeMs, video.duration, loop)
        if (Math.abs(video.currentTime - target) > 0.0005) {
            try { video.currentTime = target } catch { onFailure() }
        }
    }, [loop, onFailure, timeMs])
    React.useEffect(() => {
        const video = ref.current
        if (!video) return
        video.pause()
        seek()
    }, [seek])
    React.useEffect(() => {
        const video = ref.current
        return () => {
            if (!video) return
            video.pause()
            video.removeAttribute("src")
            try { video.load() } catch { /* detached decoder teardown is best-effort */ }
        }
    }, [])
    return <video ref={ref} className="shelf-media" src={source} muted playsInline preload="auto" style={style} onLoadedMetadata={seek} onError={onFailure} />
}

function ShelfMedia({ item, source, timeMs, loop, fit, allowLiveVideo, frame, sourceRequired }: { item: MediaItem; source: string | null; timeMs: number; loop: boolean; fit: "contain" | "cover"; allowLiveVideo: boolean; frame: boolean; sourceRequired: boolean }) {
    const [failed, setFailed] = React.useState(false)
    React.useEffect(() => setFailed(false), [source])
    const style = mediaStyle(item, fit)
    const fail = React.useCallback(() => setFailed(true), [])
    const mediaFailed = shelfMediaFailureState(source, failed, sourceRequired)
    if (failed || !source) return <div className="shelf-placeholder" data-media-failed={mediaFailed ? "true" : "false"} data-media-required={sourceRequired ? "true" : "false"}><span>{item.type === "video" ? "VIDEO" : "FRAME"}</span></div>
    if (frame) return <img className="shelf-media" src={source} alt="" draggable={false} style={style} onError={fail} />
    if (item.type === "video" && !allowLiveVideo) return <div className="shelf-placeholder is-video-poster-pending" data-media-failed="false"><span>VIDEO</span></div>
    if (item.type === "video") return <ShelfVideo key={source} source={source} timeMs={timeMs} loop={loop} style={style} onFailure={fail} />
    return <img className="shelf-media" src={source} alt="" draggable={false} style={style} onError={fail} />
}

export default function ShelfRenderer({ config, timeMs, fps = 30, exportFrames, terminal = false, cataloguePreview = false, reducedMotion, exportMode = false }: Props) {
    const [systemReducedMotion, setSystemReducedMotion] = React.useState(() => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false))
    React.useEffect(() => {
        const query = window.matchMedia?.("(prefers-reduced-motion: reduce)")
        if (!query) return
        const update = () => setSystemReducedMotion(query.matches)
        query.addEventListener("change", update)
        return () => query.removeEventListener("change", update)
    }, [])
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
    const sourceTimeMs = effectiveReducedMotion ? 0 : shelfStoryTimeMs(timeMs, timeline.durationMs, config.settings.direction, terminal)
    const liveVideoIds = new Set(exportMode ? [] : selectShelfLiveVideoIds(evaluated.slots, sourceItems, config.settings.canvasWidth))
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
        className={`shelf-stage ${transparent ? "is-transparent" : ""}`}
        data-product-scene="the-shelf"
        data-scene-version="2"
        data-evaluator-hash={evaluated.stateHash}
        data-shelf-phrase={evaluated.phrase}
        data-shelf-phase={evaluated.phase}
        data-shelf-source-count={evaluated.count}
        data-shelf-render-count={evaluated.slots.length}
        data-shelf-overflow-count={evaluated.overflowedObservedSlots}
        data-shelf-live-video-count={liveVideoIds.size}
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
            const source = exported ?? (exportMode && item.type === "video" ? null : (item.previewUrl ?? item.url) || null)
            const crop = resolvedCrop(item)
            const focal = item.focal ?? { x: 0.5, y: 0.5 }
            const allowLiveVideo = item.type !== "video" || Boolean(exported) || liveVideoIds.has(slot.id)
            return <figure
                className={`shelf-card ${slot.focusProgress > 0 ? "is-focused" : ""} ${slot.visible ? "is-visible" : "is-guard"}`}
                data-media-id={slot.id}
                data-source-index={slot.sourceIndex}
                data-copy-index={slot.copyIndex}
                data-frame-fit={item.fit ?? parameters.fit}
                data-live-video={item.type === "video" && !exported && liveVideoIds.has(slot.id) ? "true" : "false"}
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
                key={slot.slotId}
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
                    <ShelfMedia item={item} source={source} timeMs={sourceTimeMs} loop={config.settings.loopVideos} fit={parameters.fit} allowLiveVideo={allowLiveVideo} frame={Boolean(exported)} sourceRequired={exportMode} />
                </div>
            </figure>
        })}
        <div className="shelf-status" role={announceSelection ? "status" : undefined} aria-live={announceSelection ? "polite" : "off"} aria-atomic="true">{statusMessage}</div>
    </div>
}
