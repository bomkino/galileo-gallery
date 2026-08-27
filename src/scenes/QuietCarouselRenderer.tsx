import * as React from "react"
import { compileQuietTimeline, evaluateQuietCarousel, quietCarouselScene, sourceVideoTimeSeconds } from "./quietCarousel.ts"
import type { ReelConfig } from "../types.ts"
import "../quietCarousel.css"

type Props = { config: ReelConfig; timeMs: number; fps?: number; exportFrames?: Record<number, string> }

function SyncedQuietVideo({ item, timeMs, loop, fit }: { item: ReelConfig["items"][number]; timeMs: number; loop: boolean; fit: "contain" | "cover" }) {
    const ref = React.useRef<HTMLVideoElement>(null)
    const sync = React.useCallback(() => {
        const video = ref.current
        if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return
        video.pause()
        const target = sourceVideoTimeSeconds(timeMs, video.duration, loop)
        if (Math.abs(video.currentTime - target) > 0.04) video.currentTime = target
    }, [loop, timeMs])
    React.useEffect(sync, [sync])
    return <video className="qc-export-media" ref={ref} src={item.url} muted playsInline preload="metadata" aria-label={item.name}
        onLoadedMetadata={sync} style={{ display: "block", width: "100%", height: "100%", objectFit: fit, opacity: 1, filter: "none" }} />
}

export function quietCarouselTimeline(config: ReelConfig, fps = 30) {
    return compileQuietTimeline({
        mode: config.timelineMode ?? "automatic", axis: config.settings.axis, direction: config.settings.direction,
        mediaCount: config.items.length, paceMs: config.settings.paceMs, fixedDurationMs: config.timelineFixedDurationMs ?? 0,
        segments: config.timelineSegments ?? [], fps,
    })
}

export default function QuietCarouselRenderer({ config, timeMs, fps = 30, exportFrames }: Props) {
    const ref = React.useRef<HTMLDivElement>(null)
    const [size, setSize] = React.useState({ width: config.settings.canvasWidth, height: config.settings.canvasHeight })
    React.useLayoutEffect(() => {
        const element = ref.current
        if (!element) return
        const update = () => {
            const bounds = element.getBoundingClientRect()
            if (bounds.width > 0 && bounds.height > 0) setSize({ width: bounds.width, height: bounds.height })
        }
        update()
        const observer = new ResizeObserver(update)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])
    const timeline = React.useMemo(() => quietCarouselTimeline(config, fps), [config, fps])
    const parameters = quietCarouselScene.parameters({
        frameSize: config.settings.slideHeight, gap: config.settings.gap, paceMs: config.settings.paceMs, depth: config.settings.centerBump,
        fit: config.settings.imageFit,
        background: config.settings.backgroundStyle === "transparent" ? { kind: "transparent" } : { kind: "solid", color: config.settings.ground || "#11110f" },
    })
    const evaluated = evaluateQuietCarousel({ items: config.items, parameters, timeline, timeMs, stageWidth: size.width, stageHeight: size.height })
    return <div className={`qc-stage qc-export-stage ${config.settings.backgroundStyle === "transparent" ? "is-transparent" : ""}`} data-quiet-carousel-renderer="v1" ref={ref}
        style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", backgroundColor: evaluated.render.background.kind === "transparent" ? "transparent" : evaluated.render.background.color }}>
        {evaluated.frames.filter((frame) => frame.visible).map((frame) => {
            const item = config.items[frame.sourceIndex]
            const source = exportFrames?.[frame.sourceIndex] ?? item.url
            return <figure className="qc-frame" key={frame.id} style={{ width: frame.width, height: frame.height, zIndex: frame.z, transform: `translate3d(${frame.x - frame.width / 2}px, ${frame.y - frame.height / 2}px, 0) scale(${frame.scale})` }}>
                {item.type === "video" && !exportFrames?.[frame.sourceIndex]
                    ? <SyncedQuietVideo item={item} timeMs={timeMs} loop={config.settings.loopVideos} fit={evaluated.render.fit} />
                    : <img className="qc-export-media" src={source} alt="" draggable={false} style={{ objectFit: evaluated.render.fit, opacity: 1, filter: "none" }} />}
            </figure>
        })}
    </div>
}
