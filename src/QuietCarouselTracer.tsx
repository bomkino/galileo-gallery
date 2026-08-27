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
    parseQuietCarouselHostProject,
    quietCarouselFixtureItems,
    serializeQuietCarouselBrowserProject,
    timelineIntentForMode,
} from "./quietCarouselProject"
import type { ReelConfig, ReelSettings, TimelineMode } from "./types"
import { hydrateHostAudio } from "./audio/audioHost"
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

async function hydrateHostMedia(config: ReelConfig) {
    await Promise.all(config.items.map((item) => new Promise<void>((resolve, reject) => {
        const media = item.type === "video" ? document.createElement("video") : new Image()
        const timeout = window.setTimeout(() => { cleanup(); reject(new Error(`Timed out hydrating ${item.name}.`)) }, 15_000)
        const cleanup = () => {
            window.clearTimeout(timeout)
            media.removeAttribute("src")
            if (media instanceof HTMLMediaElement) media.load()
        }
        if (media instanceof HTMLVideoElement) {
            media.preload = "metadata"
            media.onloadedmetadata = () => { cleanup(); resolve() }
            media.onerror = () => { cleanup(); reject(new Error(`Could not hydrate ${item.name}.`)) }
            media.src = item.url
            media.load()
        } else {
            media.src = item.url
            media.decode().then(() => { cleanup(); resolve() }, () => { cleanup(); reject(new Error(`Could not hydrate ${item.name}.`)) })
        }
    })))
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
    const host = new URLSearchParams(window.location.search).get("host") === "linux" ? window.galleryHost : undefined
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

    const save = async () => {
        if (host) {
            try {
                const result = await host.saveProject(config)
                setNotice(result.cancelled ? "Save cancelled · Project unchanged" : "Saved portable Project · media included")
            } catch (error) {
                setNotice(error instanceof Error ? `Save failed · ${error.message}` : "Save failed")
            }
            return
        }
        try {
            localStorage.setItem(BROWSER_PROJECT_KEY, serializeQuietCarouselBrowserProject(config))
            setNotice("Saved in browser · exact Scene and Timeline intent")
        } catch {
            setNotice("Browser storage full · Project remains open")
        }
    }

    const reload = async () => {
        if (host) {
            let operationId = ""
            try {
                const candidate = await host.beginProjectOpen()
                if ("cancelled" in candidate) {
                    setNotice("Open cancelled · Project unchanged")
                    return
                }
                if ("failure" in candidate) {
                    setNotice(candidate.failure.message)
                    return
                }
                operationId = candidate.operationId
                const restored = parseQuietCarouselHostProject(candidate.config)
                await hydrateHostMedia(restored)
                await hydrateHostAudio(restored.audio)
                await host.acceptProjectOpen(operationId)
                setConfig(restored)
                setSelectedId(restored.items[0]?.id ?? "")
                setTimeMs(0)
                setNotice("Opened portable Project · Scene and Timeline verified")
            } catch (error) {
                if (operationId) await host.discardProjectOpen(operationId).catch(() => undefined)
                setNotice(error instanceof Error ? `Open failed · ${error.message}` : "Open failed · Project unchanged")
            }
            return
        }
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

    const chooseMedia = async () => {
        if (!host) {
            replaceWithFixture()
            return
        }
        try {
            const picked = await host.chooseMedia()
            if (!picked.length) {
                setNotice("Import cancelled · Project unchanged")
                return
            }
            const previousURLs = config.items.map((item) => item.url).filter((url) => url.startsWith("reel-media://grant/"))
            const importStamp = Date.now().toString(36)
            const imported = createQuietCarouselProject(picked.map((item, index) => ({
                ...item,
                id: `host-media-${importStamp}-${index + 1}`,
                ratio: 1,
                spotlight: index < 2,
                muted: false,
            })))
            setConfig(imported)
            setSelectedId(imported.items[0]?.id ?? "")
            setFailedMedia(new Set())
            setTimeMs(0)
            if (previousURLs.length) await host.releaseMedia(previousURLs).catch(() => undefined)
            setNotice(`${picked.length} source frame${picked.length === 1 ? "" : "s"} imported · order preserved`)
        } catch (error) {
            setNotice(error instanceof Error ? `Import failed · ${error.message}` : "Import failed · Project unchanged")
        }
    }

    const canvasRatio = config.settings.canvasWidth / config.settings.canvasHeight
    const activeSegment = timeline.segments.find((segment) => timeMs >= segment.startMs && timeMs < segment.endMs) ?? timeline.segments[0]

    return (
        <main
            className="qc-studio"
            data-g02-tracer="quiet-carousel-v1"
            data-axis={config.settings.axis}
            data-background={config.settings.backgroundStyle === "transparent" ? "transparent" : "solid"}
            data-canvas={`${config.settings.canvasWidth}x${config.settings.canvasHeight}`}
            data-direction={config.settings.direction}
            data-failed-media={failedMedia.size}
            data-fit={config.settings.imageFit}
            data-frame-count={config.items.length}
            data-frame-size={config.settings.slideHeight}
            data-gap={config.settings.gap}
            data-pace-ms={config.settings.paceMs}
            data-depth={config.settings.centerBump}
            data-playing={playing}
            data-time-ms={Math.round(timeMs)}
            data-timeline-duration-ms={timeline.durationMs}
            data-timeline-mode={config.timelineMode}
        >
            <header className="qc-appbar">
                <div>
                    <span className="qc-eyebrow">Galileo Gallery · browser tracer</span>
                    <strong>Quiet Carousel</strong>
                </div>
                <div className="qc-project-actions" aria-label="Project actions">
                    <span role="status">{notice}</span>
                    <button data-g02-action="fixture" type="button" onClick={() => void chooseMedia()}>{host ? "Add source frames" : "Import 8-frame fixture"}</button>
                    <button data-g02-action="save" type="button" onClick={() => void save()}>Save</button>
                    <button data-g02-action="reload" type="button" onClick={() => void reload()}>{host ? "Open" : "Reload"}</button>
                </div>
            </header>

            <section className="qc-workspace">
                <aside className="qc-frames" aria-label="Frames">
                    <div className="qc-panel-heading">
                        <div><span className="qc-eyebrow">Frames</span><strong>{config.items.length} ordered</strong></div>
                    </div>
                    <ol>
                        {config.items.map((item, index) => (
                            <li data-g02-frame-id={item.id} key={item.id}>
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
                            data-g02-stage="canvas"
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
                                        data-g02-stage-frame={item.id}
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
                        <button data-g02-action="play" type="button" onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</button>
                        <button data-g02-action="restart" type="button" onClick={() => setTimeMs(0)}>Restart</button>
                        <input data-g02-control="playhead" aria-label="Story playhead" type="range" min={0} max={timeline.durationMs} step={1} value={timeMs} onChange={(event) => { setPlaying(false); setTimeMs(Number(event.target.value)) }} />
                        <output>{formatDuration(timeMs)} / {formatDuration(timeline.durationMs)}</output>
                    </div>
                </section>

                <aside className="qc-inspector" aria-label="Contextual Inspector">
                    <div className="qc-panel-heading">
                        <div><span className="qc-eyebrow">Scene</span><strong>{quietCarouselScene.definition.name}</strong></div>
                        <button data-g02-action="reset" type="button" onClick={resetScene}>Reset</button>
                    </div>

                    <fieldset>
                        <legend>Canvas ratio</legend>
                        <div className="qc-segmented">
                            {RATIO_PRESETS.map((ratio) => (
                                <button data-g02-ratio={ratio.id} className={config.settings.canvasWidth === ratio.width && config.settings.canvasHeight === ratio.height ? "is-active" : ""} type="button" key={ratio.id} onClick={() => updateSettings({ canvasPreset: ratio.id, canvasWidth: ratio.width, canvasHeight: ratio.height })}>{ratio.label}</button>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend>Direction</legend>
                        <div className="qc-segmented">
                            {(["horizontal", "vertical"] as const).map((axis) => <button data-g02-axis={axis} className={config.settings.axis === axis ? "is-active" : ""} type="button" key={axis} onClick={() => updateSettings({ axis })}>{axis}</button>)}
                        </div>
                        <div className="qc-segmented">
                            {(["forward", "reverse"] as const).map((direction) => <button data-g02-direction={direction} className={config.settings.direction === direction ? "is-active" : ""} type="button" key={direction} onClick={() => updateSettings({ direction })}>{direction}</button>)}
                        </div>
                    </fieldset>

                    <label>{control("frame-size").label} <output>{config.settings.slideHeight}{control("frame-size").unit}</output><input data-g02-control="frame-size" type="range" min={control("frame-size").min} max={control("frame-size").max} step={control("frame-size").step} value={config.settings.slideHeight} onChange={(event) => updateSettings({ slideHeight: Number(event.target.value) })} /></label>
                    <label>{control("gap").label} <output>{config.settings.gap} {control("gap").unit}</output><input data-g02-control="gap" type="range" min={control("gap").min} max={control("gap").max} step={control("gap").step} value={config.settings.gap} onChange={(event) => updateSettings({ gap: Number(event.target.value) })} /></label>
                    <label>{control("pace").label} <output>{config.settings.paceMs}{control("pace").unit}</output><input data-g02-control="pace" type="range" min={control("pace").min} max={control("pace").max} step={control("pace").step} value={config.settings.paceMs} onChange={(event) => updateSettings({ paceMs: Number(event.target.value) })} /></label>
                    <label>{control("depth").label} <output>{config.settings.centerBump}{control("depth").unit}</output><input data-g02-control="depth" type="range" min={control("depth").min} max={control("depth").max} step={control("depth").step} value={config.settings.centerBump} onChange={(event) => updateSettings({ centerBump: Number(event.target.value) })} /></label>

                    <fieldset>
                        <legend>{control("fit").label}</legend>
                        <div className="qc-segmented">
                            {(["contain", "cover"] as const).map((fit) => <button data-g02-fit={fit} className={config.settings.imageFit === fit ? "is-active" : ""} type="button" key={fit} onClick={() => updateSettings({ imageFit: fit })}>{fit}</button>)}
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend>{control("background").label}</legend>
                        <div className="qc-segmented">
                            <button data-g02-background="solid" className={config.settings.backgroundStyle !== "transparent" ? "is-active" : ""} type="button" onClick={() => updateSettings({ backgroundStyle: "solid" })}>clean colour</button>
                            <button data-g02-background="transparent" className={config.settings.backgroundStyle === "transparent" ? "is-active" : ""} type="button" onClick={() => updateSettings({ backgroundStyle: "transparent" })}>transparent</button>
                        </div>
                        {config.settings.backgroundStyle !== "transparent" ? <input aria-label="Background colour" type="color" value={config.settings.ground || "#11110f"} onChange={(event) => updateSettings({ ground: event.target.value })} /> : null}
                    </fieldset>
                </aside>
            </section>

            <section className="qc-timeline" aria-label="Visual Timeline">
                <div className="qc-timeline-heading">
                    <div><span className="qc-eyebrow">Visual Timeline</span><strong>{formatDuration(timeline.durationMs)} · {timeline.frameCount} frames at 30 fps</strong></div>
                    <div className="qc-segmented">
                        {(["automatic", "fixed-duration", "directed"] as const).map((mode) => <button data-g02-timeline-mode={mode} className={config.timelineMode === mode ? "is-active" : ""} type="button" key={mode} onClick={() => setTimelineMode(mode)}>{mode === "fixed-duration" ? "fixed" : mode}</button>)}
                    </div>
                    {config.timelineMode === "fixed-duration" ? <label>Duration <input data-g02-control="fixed-duration" type="number" min={1000} max={60000} step={500} value={config.timelineFixedDurationMs} onChange={(event) => setConfig((current) => ({ ...current, timelineFixedDurationMs: Number(event.target.value) }))} /> ms</label> : null}
                </div>
                <SegmentStrip config={config} timeMs={timeMs} durationMs={timeline.durationMs} />
            </section>
        </main>
    )
}
