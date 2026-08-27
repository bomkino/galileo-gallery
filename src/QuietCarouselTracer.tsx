import * as React from "react"
import {
    compileQuietTimeline,
    evaluateQuietCarousel,
    quietCarouselScene,
    type QuietCarouselParameters,
} from "./scenes/quietCarousel"
import {
    createQuietCarouselProject,
    parseQuietCarouselBrowserProject,
    quietCarouselFixtureItems,
    serializeQuietCarouselBrowserProject,
    timelineIntentForMode,
} from "./quietCarouselProject"
import type { ReelConfig, ReelSettings, TimelineMode } from "./types"
import "./quietCarousel.css"

const BROWSER_PROJECT_KEY = "galileo-gallery-g02-quiet-carousel-v1"
const control = (id: (typeof quietCarouselScene.controls)[number]["id"]) => quietCarouselScene.controls.find((candidate) => candidate.id === id)!
const RATIO_PRESETS = [
    { id: "fullHD", label: "16:9", width: 1920, height: 1080 },
    { id: "vertical", label: "9:16", width: 1080, height: 1920 },
    { id: "square", label: "1:1", width: 1080, height: 1080 },
    { id: "portrait", label: "4:5", width: 1080, height: 1350 },
] as const

function storedProject() {
    try {
        const stored = localStorage.getItem(BROWSER_PROJECT_KEY)
        return stored ? parseQuietCarouselBrowserProject(stored) : createQuietCarouselProject()
    } catch {
        return createQuietCarouselProject()
    }
}

function formatDuration(value: number) {
    const seconds = Math.round(value / 100) / 10
    return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)} s`
}

function useStageSize(ref: React.RefObject<HTMLDivElement | null>) {
    const [size, setSize] = React.useState({ width: 960, height: 540 })
    React.useLayoutEffect(() => {
        const node = ref.current
        if (!node) return
        const measure = () => {
            const rect = node.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height })
        }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(node)
        return () => observer.disconnect()
    }, [ref])
    return size
}

function paramsFromConfig(config: ReelConfig): QuietCarouselParameters {
    return {
        frameSize: config.settings.slideHeight,
        gap: config.settings.gap,
        paceMs: config.settings.paceMs,
        depth: config.settings.centerBump,
        fit: config.settings.imageFit,
        background: config.settings.backgroundStyle === "transparent"
            ? { kind: "transparent" }
            : { kind: "solid", color: config.settings.ground || "#11110f" },
    }
}

function SegmentStrip({ config, timeMs, durationMs }: { config: ReelConfig; timeMs: number; durationMs: number }) {
    const timeline = compileQuietTimeline({
        mode: config.timelineMode ?? "automatic",
        axis: config.settings.axis,
        direction: config.settings.direction,
        mediaCount: config.items.length,
        paceMs: config.settings.paceMs,
        fixedDurationMs: config.timelineFixedDurationMs ?? 0,
        segments: config.timelineSegments ?? [],
        fps: 30,
    })
    return (
        <div className="qc-segment-strip" aria-label="Compiled Timeline segments">
            {timeline.segments.map((segment) => (
                <div
                    className={`qc-segment qc-segment-${segment.kind}`}
                    key={segment.id}
                    style={{ width: `${(segment.durationMs / durationMs) * 100}%` }}
                    title={`${segment.id}: ${formatDuration(segment.durationMs)}`}
                >
                    <strong>{segment.kind === "hold" ? "Hold" : `${segment.paceScale > 1 ? "Fast" : "Regular"} ×${segment.cycles}`}</strong>
                    <span>{formatDuration(segment.durationMs)}</span>
                </div>
            ))}
            <i style={{ left: `${(timeMs / durationMs) * 100}%` }} />
        </div>
    )
}

export default function QuietCarouselTracer() {
    const [config, setConfig] = React.useState<ReelConfig>(storedProject)
    const [selectedId, setSelectedId] = React.useState(config.items[0]?.id ?? "")
    const [playing, setPlaying] = React.useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    const [timeMs, setTimeMs] = React.useState(0)
    const [notice, setNotice] = React.useState("Browser Project ready")
    const [failedMedia, setFailedMedia] = React.useState<Set<string>>(() => new Set())
    const stageRef = React.useRef<HTMLDivElement>(null)
    const stageSize = useStageSize(stageRef)

    const timeline = React.useMemo(() => compileQuietTimeline({
        mode: config.timelineMode ?? "automatic",
        axis: config.settings.axis,
        direction: config.settings.direction,
        mediaCount: config.items.length,
        paceMs: config.settings.paceMs,
        fixedDurationMs: config.timelineFixedDurationMs ?? 0,
        segments: config.timelineSegments ?? [],
        fps: 30,
    }), [config])

    const evaluated = React.useMemo(() => evaluateQuietCarousel({
        items: config.items,
        parameters: paramsFromConfig(config),
        timeline,
        timeMs,
        stageWidth: stageSize.width,
        stageHeight: stageSize.height,
    }), [config, stageSize, timeMs, timeline])

    React.useEffect(() => {
        try {
            localStorage.setItem(BROWSER_PROJECT_KEY, serializeQuietCarouselBrowserProject(config))
        } catch {
            setNotice("Browser storage full · Project remains open")
        }
    }, [config])

    React.useEffect(() => {
        setTimeMs((value) => value % timeline.durationMs)
    }, [timeline.durationMs])

    React.useEffect(() => {
        if (!playing) return
        let frame = 0
        let previous = performance.now()
        const tick = (now: number) => {
            const delta = Math.min(80, now - previous)
            previous = now
            setTimeMs((value) => (value + delta) % timeline.durationMs)
            frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
    }, [playing, timeline.durationMs])

    const updateSettings = (patch: Partial<ReelSettings>) => {
        setConfig((current) => ({ ...current, settings: { ...current.settings, ...patch } }))
    }

    const setTimelineMode = (mode: TimelineMode) => {
        setConfig((current) => ({ ...current, ...timelineIntentForMode(mode) }))
        setTimeMs(0)
    }

    const save = () => {
        localStorage.setItem(BROWSER_PROJECT_KEY, serializeQuietCarouselBrowserProject(config))
        setNotice("Saved in browser · exact Scene and Timeline intent")
    }

    const reload = () => {
        try {
            const stored = localStorage.getItem(BROWSER_PROJECT_KEY)
            if (!stored) throw new Error("No browser Project saved.")
            const restored = parseQuietCarouselBrowserProject(stored)
            setConfig(restored)
            setSelectedId(restored.items[0]?.id ?? "")
            setTimeMs(0)
            setNotice("Reloaded exact browser Project")
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "Browser Project could not be reloaded.")
        }
    }

    const resetScene = () => {
        const reset = createQuietCarouselProject(config.items)
        setConfig(reset)
        setTimeMs(0)
        setNotice("Quiet Carousel reset")
    }

    const replaceWithFixture = () => {
        const fixture = createQuietCarouselProject(quietCarouselFixtureItems())
        setConfig(fixture)
        setSelectedId(fixture.items[0]?.id ?? "")
        setFailedMedia(new Set())
        setTimeMs(0)
        setNotice("Eight synthetic frames imported · order preserved")
    }

    const canvasRatio = config.settings.canvasWidth / config.settings.canvasHeight
    const activeSegment = timeline.segments.find((segment) => timeMs >= segment.startMs && timeMs < segment.endMs) ?? timeline.segments[0]

    return (
        <main className="qc-studio" data-g02-tracer="quiet-carousel-v1">
            <header className="qc-appbar">
                <div>
                    <span className="qc-eyebrow">Galileo Gallery · browser tracer</span>
                    <strong>Quiet Carousel</strong>
                </div>
                <div className="qc-project-actions" aria-label="Project actions">
                    <span role="status">{notice}</span>
                    <button type="button" onClick={replaceWithFixture}>Import 8-frame fixture</button>
                    <button type="button" onClick={save}>Save</button>
                    <button type="button" onClick={reload}>Reload</button>
                </div>
            </header>

            <section className="qc-workspace">
                <aside className="qc-frames" aria-label="Frames">
                    <div className="qc-panel-heading">
                        <div><span className="qc-eyebrow">Frames</span><strong>{config.items.length} ordered</strong></div>
                    </div>
                    <ol>
                        {config.items.map((item, index) => (
                            <li key={item.id}>
                                <button className={selectedId === item.id ? "is-selected" : ""} type="button" onClick={() => setSelectedId(item.id)}>
                                    <span>{String(index + 1).padStart(2, "0")}</span>
                                    <img src={item.url} alt="" loading="lazy" />
                                    <strong>{item.name}</strong>
                                    {failedMedia.has(item.id) ? <em>Unavailable · order kept</em> : null}
                                </button>
                            </li>
                        ))}
                    </ol>
                </aside>

                <section className="qc-stage-area" aria-label="Stage">
                    <div className="qc-stage-meta">
                        <span>{RATIO_PRESETS.find((ratio) => ratio.width === config.settings.canvasWidth && ratio.height === config.settings.canvasHeight)?.label ?? "Custom"}</span>
                        <span>{config.settings.axis} · {config.settings.direction}</span>
                        <span>{activeSegment?.id}</span>
                    </div>
                    <div className="qc-stage-shell">
                        <div
                            className={`qc-stage ${config.settings.backgroundStyle === "transparent" ? "is-transparent" : ""}`}
                            ref={stageRef}
                            style={{
                                aspectRatio: canvasRatio,
                                backgroundColor: evaluated.render.background.kind === "transparent" ? "transparent" : evaluated.render.background.color,
                                "--qc-ratio": canvasRatio,
                            } as React.CSSProperties}
                        >
                            {evaluated.frames.filter((frame) => frame.visible || frame.id === selectedId).map((frame) => {
                                const item = config.items[frame.sourceIndex]
                                return (
                                    <figure
                                        className={`qc-frame ${selectedId === item.id ? "is-selected" : ""} ${failedMedia.has(item.id) ? "is-failed" : ""}`}
                                        key={frame.id}
                                        style={{
                                            width: frame.width,
                                            height: frame.height,
                                            zIndex: frame.z,
                                            visibility: frame.visible ? "visible" : "hidden",
                                            transform: `translate3d(${frame.x - frame.width / 2}px, ${frame.y - frame.height / 2}px, 0) scale(${frame.scale})`,
                                        }}
                                        onPointerDown={() => setSelectedId(item.id)}
                                    >
                                        {failedMedia.has(item.id) ? <div>Media unavailable</div> : (
                                            <img
                                                src={item.url}
                                                alt={item.name}
                                                draggable={false}
                                                style={{ objectFit: evaluated.render.fit, opacity: evaluated.render.artworkOpacity, filter: evaluated.render.artworkFilter }}
                                                onError={() => setFailedMedia((current) => new Set(current).add(item.id))}
                                            />
                                        )}
                                    </figure>
                                )
                            })}
                        </div>
                    </div>
                    <div className="qc-transport">
                        <button type="button" onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</button>
                        <button type="button" onClick={() => setTimeMs(0)}>Restart</button>
                        <input aria-label="Story playhead" type="range" min={0} max={timeline.durationMs} step={1} value={timeMs} onChange={(event) => { setPlaying(false); setTimeMs(Number(event.target.value)) }} />
                        <output>{formatDuration(timeMs)} / {formatDuration(timeline.durationMs)}</output>
                    </div>
                </section>

                <aside className="qc-inspector" aria-label="Contextual Inspector">
                    <div className="qc-panel-heading">
                        <div><span className="qc-eyebrow">Scene</span><strong>{quietCarouselScene.definition.name}</strong></div>
                        <button type="button" onClick={resetScene}>Reset</button>
                    </div>

                    <fieldset>
                        <legend>Canvas ratio</legend>
                        <div className="qc-segmented">
                            {RATIO_PRESETS.map((ratio) => (
                                <button className={config.settings.canvasWidth === ratio.width && config.settings.canvasHeight === ratio.height ? "is-active" : ""} type="button" key={ratio.id} onClick={() => updateSettings({ canvasPreset: ratio.id, canvasWidth: ratio.width, canvasHeight: ratio.height })}>{ratio.label}</button>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend>Direction</legend>
                        <div className="qc-segmented">
                            {(["horizontal", "vertical"] as const).map((axis) => <button className={config.settings.axis === axis ? "is-active" : ""} type="button" key={axis} onClick={() => updateSettings({ axis })}>{axis}</button>)}
                        </div>
                        <div className="qc-segmented">
                            {(["forward", "reverse"] as const).map((direction) => <button className={config.settings.direction === direction ? "is-active" : ""} type="button" key={direction} onClick={() => updateSettings({ direction })}>{direction}</button>)}
                        </div>
                    </fieldset>

                    <label>{control("frame-size").label} <output>{config.settings.slideHeight}{control("frame-size").unit}</output><input type="range" min={control("frame-size").min} max={control("frame-size").max} step={control("frame-size").step} value={config.settings.slideHeight} onChange={(event) => updateSettings({ slideHeight: Number(event.target.value) })} /></label>
                    <label>{control("gap").label} <output>{config.settings.gap} {control("gap").unit}</output><input type="range" min={control("gap").min} max={control("gap").max} step={control("gap").step} value={config.settings.gap} onChange={(event) => updateSettings({ gap: Number(event.target.value) })} /></label>
                    <label>{control("pace").label} <output>{config.settings.paceMs}{control("pace").unit}</output><input type="range" min={control("pace").min} max={control("pace").max} step={control("pace").step} value={config.settings.paceMs} onChange={(event) => updateSettings({ paceMs: Number(event.target.value) })} /></label>
                    <label>{control("depth").label} <output>{config.settings.centerBump}{control("depth").unit}</output><input type="range" min={control("depth").min} max={control("depth").max} step={control("depth").step} value={config.settings.centerBump} onChange={(event) => updateSettings({ centerBump: Number(event.target.value) })} /></label>

                    <fieldset>
                        <legend>{control("fit").label}</legend>
                        <div className="qc-segmented">
                            {(["contain", "cover"] as const).map((fit) => <button className={config.settings.imageFit === fit ? "is-active" : ""} type="button" key={fit} onClick={() => updateSettings({ imageFit: fit })}>{fit}</button>)}
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend>{control("background").label}</legend>
                        <div className="qc-segmented">
                            <button className={config.settings.backgroundStyle !== "transparent" ? "is-active" : ""} type="button" onClick={() => updateSettings({ backgroundStyle: "solid" })}>clean colour</button>
                            <button className={config.settings.backgroundStyle === "transparent" ? "is-active" : ""} type="button" onClick={() => updateSettings({ backgroundStyle: "transparent" })}>transparent</button>
                        </div>
                        {config.settings.backgroundStyle !== "transparent" ? <input aria-label="Background colour" type="color" value={config.settings.ground || "#11110f"} onChange={(event) => updateSettings({ ground: event.target.value })} /> : null}
                    </fieldset>
                </aside>
            </section>

            <section className="qc-timeline" aria-label="Visual Timeline">
                <div className="qc-timeline-heading">
                    <div><span className="qc-eyebrow">Visual Timeline</span><strong>{formatDuration(timeline.durationMs)} · {timeline.frameCount} frames at 30 fps</strong></div>
                    <div className="qc-segmented">
                        {(["automatic", "fixed-duration", "directed"] as const).map((mode) => <button className={config.timelineMode === mode ? "is-active" : ""} type="button" key={mode} onClick={() => setTimelineMode(mode)}>{mode === "fixed-duration" ? "fixed" : mode}</button>)}
                    </div>
                    {config.timelineMode === "fixed-duration" ? <label>Duration <input type="number" min={1000} max={60000} step={500} value={config.timelineFixedDurationMs} onChange={(event) => setConfig((current) => ({ ...current, timelineFixedDurationMs: Number(event.target.value) }))} /> ms</label> : null}
                </div>
                <SegmentStrip config={config} timeMs={timeMs} durationMs={timeline.durationMs} />
            </section>
        </main>
    )
}
