import * as React from "react"
import type { MediaItem, ReelConfig } from "../types"
import { sourceVideoTimeSeconds } from "./quietCarousel"
import { compileZoetropeTimeline, evaluateZoetrope, zoetropeDesignSpace } from "./zoetrope"
import { effectiveZoetropeRatio, zoetropeParametersFromSettings } from "../zoetropeConfig"
import "../zoetrope.css"

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
    return [16 / 9, 4 / 5, 1, 3 / 2, 9 / 16, 5 / 4].map((ratio, index) => ({
        id: `zoetrope-placeholder-${index + 1}`,
        name: `Frame ${index + 1}`,
        type: "image" as const,
        url: "",
        ratio,
        aspectMode: "auto" as const,
        ratioW: 16,
        ratioH: 9,
        fit: "contain" as const,
        crop: { x: 0, y: 0, width: 1, height: 1 },
        focal: { x: 0.5, y: 0.5 },
        caption: `Frame ${index + 1}`,
        spotlight: index === 0,
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
    return {
        objectFit: item.fit ?? fallbackFit,
        objectPosition: `${Math.max(0, Math.min(1, focal.x)) * 100}% ${Math.max(0, Math.min(1, focal.y)) * 100}%`,
    }
}

function seekVideoFrame(video: HTMLVideoElement, timeMs: number, loop: boolean, fps: number) {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return
    const sampledTimeMs = Math.floor(Math.max(0, timeMs) * fps / 1_000 + 1e-9) * 1_000 / fps
    const requested = sourceVideoTimeSeconds(sampledTimeMs, video.duration, loop)
    const target = loop ? requested : Math.min(requested, Math.max(0, video.duration - 1 / Math.max(1, fps)))
    if (Math.abs(video.currentTime - target) > 0.0005) video.currentTime = target
}

function ZoetropeVideo({ source, timeMs, loop, fps, prewarm, style }: { source: string; timeMs: number; loop: boolean; fps: number; prewarm: boolean; style?: React.CSSProperties }) {
    const ref = React.useRef<HTMLVideoElement>(null)
    const seekIntentRef = React.useRef({ timeMs, loop, fps })
    React.useLayoutEffect(() => {
        seekIntentRef.current = { timeMs, loop, fps }
        const video = ref.current
        if (video) seekVideoFrame(video, timeMs, loop, fps)
    }, [fps, loop, source, timeMs])
    React.useLayoutEffect(() => {
        const video = ref.current
        if (!video) return
        const seek = () => {
            const intent = seekIntentRef.current
            seekVideoFrame(video, intent.timeMs, intent.loop, intent.fps)
        }
        video.addEventListener("loadedmetadata", seek)
        return () => video.removeEventListener("loadedmetadata", seek)
    }, [source])
    React.useEffect(() => {
        const video = ref.current
        if (!video) return
        video.dataset.mediaFailed = "false"
        video.src = source
        video.load()
        return () => {
            video.pause()
            video.removeAttribute("src")
            video.load()
        }
    }, [source])
    return <video ref={ref} muted playsInline preload={prewarm ? "metadata" : "auto"} aria-hidden="true" data-decoder-role={prewarm ? "prewarm" : "gate"} data-media-failed="false" onError={(event) => {
        const video = event.currentTarget
        video.dataset.mediaFailed = "true"
        video.pause()
        video.removeAttribute("src")
        video.load()
    }} style={style} />
}

function PosterOrPlaceholder({ item, source, fit, exportMode }: { item: MediaItem; source: string; fit: "contain" | "cover"; exportMode: boolean }) {
    const [failed, setFailed] = React.useState(false)
    if (!source || failed) {
        return <div className="zoetrope-placeholder" aria-hidden="true" data-media-failed={exportMode ? "true" : "false"}><span>{item.name || item.id}</span></div>
    }
    return <img className={exportMode ? "product-export-media" : undefined} src={source} alt="" draggable={false} data-media-failed="false" onError={() => setFailed(true)} style={mediaStyle(item, fit)} />
}

export function ZoetropeRenderer({ config, timeMs, fps = 30, exportFrames = {}, terminal = false, cataloguePreview = false, reducedMotion = false, exportMode = false }: Props) {
    const source = config.items.length ? config.items : cataloguePreview ? placeholderItems() : []
    const sourceItems = source.map((item, originalIndex) => ({ item: { ...item, ratio: effectiveZoetropeRatio(item, config.settings) }, originalIndex })).filter(({ item }) => !item.muted)
    const items = sourceItems.map(({ item }) => item)
    const parameters = zoetropeParametersFromSettings(config.settings)
    const timeline = React.useMemo(() => compileZoetropeTimeline({
        mode: config.timelineMode ?? "automatic",
        mediaCount: Math.max(1, items.length),
        stationMs: config.settings.paceMs,
        fixedDurationMs: config.timelineFixedDurationMs ?? 0,
        segments: config.timelineSegments ?? [],
        fps,
    }), [config.timelineFixedDurationMs, config.timelineMode, config.timelineSegments, config.settings.paceMs, fps, items.length])
    const spotlightId = (config.settings.spotlightsEnabled ? items.find((item) => item.spotlight) : undefined)?.id ?? items[0]?.id
    const finaleId = config.settings.finaleEnabled ? items.at(-1)?.id : spotlightId
    const width = Math.max(1, config.settings.canvasWidth)
    const height = Math.max(1, config.settings.canvasHeight)
    const { designWidth, designHeight } = zoetropeDesignSpace(width, height)
    const frame = evaluateZoetrope({ items, parameters, timeline, timeMs, stageWidth: designWidth, stageHeight: designHeight, terminal, reducedMotion, exportMode, spotlightId, finaleId })
    const renderedIds = new Set(frame.renderSlots.map((slot) => slot.id))
    const hiddenDecoders = frame.sourceStates.filter((state) => state.decoderRole && !renderedIds.has(state.id))
    const transparent = config.settings.backgroundStyle === "transparent"
    const background = transparent ? "transparent" : config.settings.ground || (config.settings.theme === "light" ? "#ece8dd" : "#11110f")
    const accessibleLabel = items.length === 0 ? "Empty zoetrope." : `Zoetrope showing ${items.length} media ${items.length === 1 ? "item" : "items"}.`
    return <div className={`zoetrope-stage ${transparent ? "is-transparent" : ""}`} role="img" aria-label={accessibleLabel} data-product-scene="zoetrope" data-scene-version="2" data-evaluator-hash={frame.stateHash} data-zoetrope-phrase={frame.phrase} data-gate-id={frame.gateId ?? ""} data-successor-id={frame.successorId ?? ""} data-live-video-decoders={frame.liveVideoDecoderCount} data-logical-width={width} data-logical-height={height} data-design-width={designWidth} data-design-height={designHeight} style={{ background }}>
        <div className="zoetrope-assembly" aria-hidden="true" style={{ transform: `scale(${frame.apparatusScale})` }}>
            <div className="zoetrope-cylinder" aria-hidden="true" />
            <div className="zoetrope-gate" aria-hidden="true" />
            {frame.renderSlots.map((slot) => {
            const item = items[slot.sourceIndex]
            const originalIndex = sourceItems[slot.sourceIndex]?.originalIndex ?? slot.sourceIndex
            const exportSource = exportFrames[originalIndex]
            const posterSource = exportMode
                ? (item.type === "video" ? exportSource ?? "" : exportSource ?? item.url)
                : exportSource ?? item.previewUrl ?? (item.type === "image" ? item.url : "")
            const decoderSource = item.url
            const style = mediaStyle(item, config.settings.imageFit)
            return <figure className={`zoetrope-card is-${slot.role}`} data-media-id={slot.id} data-source-index={originalIndex} data-role={slot.role} data-decoder-role={slot.decoderRole ?? "none"} data-depth={slot.depth} data-x={slot.x} data-y={slot.y} data-plane-width={slot.width} data-plane-height={slot.height} key={slot.id} style={{ left: `${slot.x / designWidth * 100}%`, top: `${slot.y / designHeight * 100}%`, width: `${slot.width / designWidth * 100}%`, height: `${slot.height / designHeight * 100}%`, zIndex: Math.round((slot.depth + 1) * 5_000), transform: `translate(-50%, -50%) translateZ(${slot.z / designWidth * 100}cqw) rotateY(${slot.rotateY}deg) rotateZ(${slot.rotateZ}deg) scale(${slot.scale})` }}>
                {item.type === "video" && slot.decoderRole && !exportMode && decoderSource
                    ? <ZoetropeVideo source={decoderSource} timeMs={reducedMotion ? 0 : timeMs} loop={config.settings.loopVideos} fps={fps} prewarm={slot.decoderRole === "prewarm"} style={style} />
                    : <PosterOrPlaceholder key={`${exportMode ? "export" : "preview"}:${posterSource || "missing"}`} item={item} source={posterSource} fit={config.settings.imageFit} exportMode={exportMode} />}
            </figure>
            })}
            {hiddenDecoders.map((state) => {
            const item = items[state.sourceIndex]
            return item.url ? <div className="zoetrope-decoder-guard" key={`guard-${state.id}`} data-media-id={state.id} data-decoder-role={state.decoderRole} aria-hidden="true">
                <ZoetropeVideo source={item.url} timeMs={reducedMotion ? 0 : timeMs} loop={config.settings.loopVideos} fps={fps} prewarm={state.decoderRole === "prewarm"} />
            </div> : null
            })}
        </div>
    </div>
}
