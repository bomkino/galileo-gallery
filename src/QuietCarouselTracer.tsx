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
import { compileAudioTimeline, defaultAudioIntent, type AudioLaneRole, type RationalTime } from "./audio/audioTimeline"
import { mixAudioChunk } from "./audio/audioMixer"
import { createHostPCMProvider, readHostWaveform } from "./audio/hostPcmProvider"
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

function rational(numerator: number, denominator: number): RationalTime {
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator < 1) throw new Error("Time is outside the supported precision.")
    let left = Math.abs(numerator)
    let right = Math.abs(denominator)
    while (right) [left, right] = [right, left % right]
    return { numerator: numerator / left, denominator: denominator / left }
}

function millisecondsTime(milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error("Time is outside the supported range.")
    return rational(Math.round(milliseconds * 1000), 1_000_000)
}

function roleLabel(role: AudioLaneRole) {
    return role === "presenter" ? "Presenter" : role === "soundtrack" ? "Soundtrack" : "Source video"
}

function timeSeconds(value: RationalTime) {
    return value.numerator / value.denominator
}

function externalAudioOnly(audio = defaultAudioIntent()) {
    const sources = audio.sources.filter((source) => source.role !== "source-video")
    const sourceIds = new Set(sources.map((source) => source.id))
    const lanes = audio.lanes.filter((lane) => lane.role !== "source-video").map((lane) => ({ ...lane, clips: lane.clips.filter((clip) => sourceIds.has(clip.sourceId)) }))
    const laneIds = new Set(lanes.map((lane) => lane.id))
    return { ...audio, sources, lanes, ducking: { ...audio.ducking, targetLaneIds: audio.ducking.targetLaneIds.filter((id) => laneIds.has(id)), enabled: audio.ducking.enabled && laneIds.has(audio.ducking.triggerLaneId) && audio.ducking.targetLaneIds.some((id) => laneIds.has(id)) } }
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

function visualTimelineForConfig(config: ReelConfig) {
    return compileQuietTimeline({
        mode: config.timelineMode ?? "automatic",
        axis: config.settings.axis,
        direction: config.settings.direction,
        mediaCount: config.items.length,
        paceMs: config.settings.paceMs,
        fixedDurationMs: config.timelineFixedDurationMs ?? 0,
        segments: config.timelineSegments ?? [],
        fps: 30,
    })
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
    const [audioBusy, setAudioBusy] = React.useState(false)
    const [previewing, setPreviewing] = React.useState(false)
    const [audioDiagnostic, setAudioDiagnostic] = React.useState("No audio mix checked")
    const [audioDiagnosticHash, setAudioDiagnosticHash] = React.useState("")
    const [waveforms, setWaveforms] = React.useState<Record<string, Array<{ minimum: number; maximum: number; rms: number }>>>({})
    const stageRef = React.useRef<HTMLDivElement>(null)
    const audioPreviewRef = React.useRef<{ controller: AbortController; context: AudioContext; source?: AudioBufferSourceNode } | null>(null)
    const audioRevisionRef = React.useRef(0)
    const timeRef = React.useRef(timeMs)
    const stageSize = useStageSize(stageRef)

    const timeline = React.useMemo(() => visualTimelineForConfig(config), [config])

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
        audioRevisionRef.current += 1
        setAudioDiagnosticHash("")
        setAudioDiagnostic((current) => current.startsWith("Checked ") ? "Audio changed · run Check mix" : current)
        audioPreviewRef.current?.controller.abort()
        try { audioPreviewRef.current?.source?.stop() } catch { /* Preview already stopped. */ }
        void audioPreviewRef.current?.context.close()
        audioPreviewRef.current = null
        setPreviewing(false)
    }, [config.audio, timeline.durationMs])

    React.useEffect(() => {
        timeRef.current = timeMs
        setAudioDiagnosticHash("")
        setAudioDiagnostic((current) => current.startsWith("Checked ") ? "Playhead changed · run Check mix" : current)
    }, [timeMs])

    React.useEffect(() => () => {
        audioPreviewRef.current?.controller.abort()
        try { audioPreviewRef.current?.source?.stop() } catch { /* Preview already stopped. */ }
        void audioPreviewRef.current?.context.close()
    }, [])

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
                if (config.audio) {
                    const plan = compileAudioTimeline(config.audio, { duration: millisecondsTime(timeline.durationMs) })
                    if (plan.issues.length) throw new Error("Audio sources do not match the current visual story.")
                }
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
                const restoredTimeline = visualTimelineForConfig(restored)
                if (restored.audio) {
                    const restoredAudio = compileAudioTimeline(restored.audio, { duration: millisecondsTime(restoredTimeline.durationMs) })
                    if (restoredAudio.issues.length) throw new Error("Opened audio does not match the visual story.")
                }
                const restoredWaveforms: Record<string, Array<{ minimum: number; maximum: number; rms: number }>> = {}
                for (const source of (restored.audio?.sources ?? []).filter((candidate) => candidate.role !== "source-video" && candidate.url)) {
                    const waveform = await readHostWaveform(host, source.url!, Math.min(48, source.sampleFrames))
                    restoredWaveforms[source.id] = waveform.buckets
                }
                await host.acceptProjectOpen(operationId)
                setConfig(restored)
                setWaveforms(restoredWaveforms)
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
        setConfig({ ...reset, audio: config.audio })
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
            imported.audio = externalAudioOnly(config.audio)
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

    const addAudio = async (role: "presenter" | "soundtrack") => {
        if (!host || audioBusy) return
        setAudioBusy(true)
        const revision = audioRevisionRef.current
        let pickedURL = ""
        try {
            const placementMs = role === "presenter" ? Math.min(Math.round(timeMs), Math.max(0, timeline.durationMs - 1)) : 0
            setPlaying(false)
            const picked = await host.chooseAudio(role)
            if (!picked) {
                setNotice(`${roleLabel(role)} selection cancelled · audio unchanged`)
                return
            }
            pickedURL = picked.url
            const currentAudio = config.audio ?? defaultAudioIntent()
            if (currentAudio.sources.length > 0 && picked.sampleRate !== currentAudio.sampleRate) {
                throw new Error(`Use ${currentAudio.sampleRate} Hz PCM16 WAV to match this Project.`)
            }
            const sampleRate = currentAudio.sources.length ? currentAudio.sampleRate : picked.sampleRate
            const stamp = `${role}-${Date.now().toString(36)}`
            const sourceId = `${stamp}-source`
            const laneId = `${stamp}-lane`
            const storyTime = millisecondsTime(timeline.durationMs)
            const sourceTime = rational(picked.sampleFrames, picked.sampleRate)
            const sourceDurationMs = picked.sampleFrames * 1000 / picked.sampleRate
            const remainingMs = timeline.durationMs - placementMs
            const duration = role === "soundtrack" ? storyTime : sourceDurationMs >= remainingMs ? millisecondsTime(remainingMs) : sourceTime
            const retainedSources = currentAudio.sources.filter((source) => source.role !== role)
            const retainedLanes = currentAudio.lanes.filter((lane) => lane.role !== role)
            const source = { id: sourceId, name: picked.name, role, url: picked.url, sampleRate: picked.sampleRate, channels: picked.channels, sampleFrames: picked.sampleFrames }
            const lane = {
                id: laneId,
                name: roleLabel(role),
                role,
                gain: 1,
                muted: false,
                solo: false,
                clips: [{
                    id: `${stamp}-clip`, sourceId, timelineStart: millisecondsTime(placementMs), sourceIn: { numerator: 0, denominator: 1 },
                    sourceSpan: sourceTime, duration, loop: role === "soundtrack", gain: 1, muted: false,
                    fadeIn: { numerator: 0, denominator: 1 }, fadeOut: { numerator: 0, denominator: 1 },
                }],
            }
            const sources = [...retainedSources, source]
            const lanes = [...retainedLanes, lane]
            const presenter = lanes.find((candidate) => candidate.role === "presenter")
            const soundtrack = lanes.find((candidate) => candidate.role === "soundtrack")
            const audio = {
                ...currentAudio,
                sampleRate,
                sources,
                lanes,
                ducking: {
                    ...currentAudio.ducking,
                    enabled: Boolean(currentAudio.ducking.enabled && presenter && soundtrack),
                    triggerLaneId: presenter?.id ?? "presenter",
                    targetLaneIds: soundtrack ? [soundtrack.id] : [],
                },
            }
            compileAudioTimeline(audio, { duration: storyTime })
            const provider = createHostPCMProvider(host, audio)
            await provider.read(sourceId, 0, Math.min(256, picked.sampleFrames))
            const waveform = await readHostWaveform(host, picked.url, Math.min(48, picked.sampleFrames))
            if (revision !== audioRevisionRef.current) throw new Error("Project changed while audio was loading. Try again.")
            const replacedURLs = currentAudio.sources.filter((candidate) => candidate.role === role && candidate.url).map((candidate) => candidate.url!)
            setConfig((current) => ({ ...current, audio }))
            const retainedIds = new Set(sources.map((candidate) => candidate.id))
            setWaveforms((current) => ({ ...Object.fromEntries(Object.entries(current).filter(([id]) => retainedIds.has(id))), [sourceId]: waveform.buckets }))
            if (replacedURLs.length) await host.releaseMedia(replacedURLs).catch(() => undefined)
            pickedURL = ""
            setAudioDiagnostic(`${roleLabel(role)} decoded · ${picked.sampleRate} Hz · ${picked.channels === 1 ? "mono" : "stereo"}`)
            setNotice(`${roleLabel(role)} added · waveform and PCM verified`)
        } catch (error) {
            if (pickedURL) await host.releaseMedia([pickedURL]).catch(() => undefined)
            setNotice(error instanceof Error ? `Audio unchanged · ${error.message}` : "Audio unchanged · source could not be verified")
        } finally {
            setAudioBusy(false)
        }
    }

    const updateAudioLane = (laneId: string, patch: { gain?: number; muted?: boolean; solo?: boolean }) => {
        setConfig((current) => ({ ...current, audio: { ...(current.audio ?? defaultAudioIntent()), lanes: (current.audio ?? defaultAudioIntent()).lanes.map((lane) => lane.id === laneId ? { ...lane, ...patch } : lane) } }))
        setAudioDiagnostic("Audio controls changed · run Check mix")
        setAudioDiagnosticHash("")
    }

    const updateAudioClipStart = (laneId: string, startMs: number) => {
        const bounded = Math.max(0, Math.min(Math.round(startMs), Math.max(0, timeline.durationMs - 1)))
        setConfig((current) => ({ ...current, audio: { ...(current.audio ?? defaultAudioIntent()), lanes: (current.audio ?? defaultAudioIntent()).lanes.map((lane) => lane.id === laneId ? { ...lane, clips: lane.clips.map((clip, index) => index === 0 ? { ...clip, timelineStart: millisecondsTime(bounded) } : clip) } : lane) } }))
        setAudioDiagnostic("Audio placement changed · run Check mix")
        setAudioDiagnosticHash("")
    }

    const resetAudio = async () => {
        const urls = (config.audio?.sources ?? []).filter((source) => source.role !== "source-video" && source.url).map((source) => source.url!)
        setConfig((current) => ({ ...current, audio: defaultAudioIntent() }))
        setWaveforms({})
        setAudioDiagnostic("No audio mix checked")
        setAudioDiagnosticHash("")
        if (host && urls.length) await host.releaseMedia(urls).catch(() => undefined)
        setNotice("Audio reset · visual Project preserved")
    }

    const checkAudioMix = async () => {
        if (!host || !config.audio || audioBusy) return
        setAudioBusy(true)
        const revision = audioRevisionRef.current
        setPlaying(false)
        const probeTime = timeMs
        try {
            const storyTime = millisecondsTime(timeline.durationMs)
            const plan = compileAudioTimeline(config.audio, { duration: storyTime })
            if (plan.issues.length) throw new Error("Audio sources do not match the Project mix format.")
            const startFrame = Math.min(Math.floor(probeTime * plan.sampleRate / 1000), Math.max(0, plan.durationFrames - 1))
            const frameCount = Math.min(plan.chunkFrames, plan.durationFrames - startFrame)
            const mixed = await mixAudioChunk(plan, createHostPCMProvider(host, config.audio), startFrame, frameCount)
            const bytes = mixed.interleaved.buffer.slice(mixed.interleaved.byteOffset, mixed.interleaved.byteOffset + mixed.interleaved.byteLength)
            const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((value) => value.toString(16).padStart(2, "0")).join("")
            if (revision !== audioRevisionRef.current || Math.abs(timeRef.current - probeTime) > 0.001) throw new Error("Project or playhead changed during the PCM check.")
            setAudioDiagnosticHash(digest)
            setAudioDiagnostic(`Checked ${frameCount} frames · peak ${mixed.peak.toFixed(3)} · clipped ${mixed.clippedSamples}`)
        } catch (error) {
            setAudioDiagnostic(error instanceof Error ? error.message : "Audio mix check failed")
        } finally {
            setAudioBusy(false)
        }
    }

    const previewAudio = async () => {
        if (!host || !config.audio || audioBusy) return
        audioPreviewRef.current?.controller.abort()
        try { audioPreviewRef.current?.source?.stop() } catch { /* Preview already stopped. */ }
        void audioPreviewRef.current?.context.close()
        const controller = new AbortController()
        const context = new AudioContext({ sampleRate: config.audio.sampleRate })
        if (context.sampleRate !== config.audio.sampleRate) {
            void context.close()
            setNotice(`Preview unavailable · audio device uses ${context.sampleRate} Hz, Project uses ${config.audio.sampleRate} Hz`)
            return
        }
        const revision = audioRevisionRef.current
        setPlaying(false)
        const probeTime = timeMs
        audioPreviewRef.current = { controller, context }
        setAudioBusy(true)
        try {
            const plan = compileAudioTimeline(config.audio, { duration: millisecondsTime(timeline.durationMs) })
            if (plan.issues.length) throw new Error("Audio sources do not match the Project mix format.")
            const startFrame = Math.min(Math.floor(probeTime * plan.sampleRate / 1000), Math.max(0, plan.durationFrames - 1))
            const frameCount = Math.min(plan.sampleRate * 2, plan.durationFrames - startFrame)
            const buffer = context.createBuffer(plan.channels, frameCount, plan.sampleRate)
            const provider = createHostPCMProvider(host, config.audio)
            let cursor = 0
            while (cursor < frameCount) {
                const count = Math.min(plan.chunkFrames, frameCount - cursor)
                const mixed = await mixAudioChunk(plan, provider, startFrame + cursor, count, controller.signal)
                for (let channel = 0; channel < plan.channels; channel += 1) {
                    const output = buffer.getChannelData(channel)
                    for (let frame = 0; frame < count; frame += 1) output[cursor + frame] = mixed.interleaved[frame * plan.channels + channel]
                }
                cursor += count
            }
            const source = context.createBufferSource()
            source.buffer = buffer
            source.connect(context.destination)
            audioPreviewRef.current = { controller, context, source }
            source.onended = () => { if (audioPreviewRef.current?.source === source) audioPreviewRef.current = null; setPreviewing(false); void context.close() }
            if (revision !== audioRevisionRef.current || Math.abs(timeRef.current - probeTime) > 0.001) throw new Error("Project or playhead changed during preview preparation.")
            source.start()
            setPreviewing(true)
            setNotice(`Previewing ${(frameCount / plan.sampleRate).toFixed(1)} s from the playhead`)
        } catch (error) {
            audioPreviewRef.current = null
            setPreviewing(false)
            void context.close()
            setNotice(error instanceof Error ? `Preview unavailable · ${error.message}` : "Preview unavailable")
        } finally {
            setAudioBusy(false)
        }
    }

    const cancelAudio = async () => {
        audioRevisionRef.current += 1
        audioPreviewRef.current?.controller.abort()
        try { audioPreviewRef.current?.source?.stop() } catch { /* Preview already stopped. */ }
        void audioPreviewRef.current?.context.close()
        audioPreviewRef.current = null
        setPreviewing(false)
        if (host) await host.cancelAudio().catch(() => undefined)
        setAudioBusy(false)
        setNotice("Audio work cancelled")
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
            data-audio-lanes={config.audio?.lanes.length ?? 0}
            data-audio-diagnostic-hash={audioDiagnosticHash}
        >
            <header className="qc-appbar">
                <div>
                    <span className="qc-eyebrow">Galileo Gallery · browser tracer</span>
                    <strong>Quiet Carousel</strong>
                </div>
                <div className="qc-project-actions" aria-label="Project actions">
                    <span role="status">{notice}</span>
                    <button data-g02-action="fixture" type="button" disabled={audioBusy} onClick={() => void chooseMedia()}>{host ? "Add source frames" : "Import 8-frame fixture"}</button>
                    <button data-g02-action="save" type="button" disabled={audioBusy} onClick={() => void save()}>Save</button>
                    <button data-g02-action="reload" type="button" disabled={audioBusy} onClick={() => void reload()}>{host ? "Open" : "Reload"}</button>
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
                        <button data-g02-action="play" type="button" disabled={audioBusy || previewing} onClick={() => setPlaying((value) => !value)}>{playing ? "Pause motion" : config.audio?.lanes.length ? "Play motion" : "Play"}</button>
                        <button data-g02-action="restart" type="button" disabled={audioBusy || previewing} onClick={() => setTimeMs(0)}>Restart</button>
                        <input data-g02-control="playhead" aria-label="Story playhead" disabled={audioBusy || previewing} type="range" min={0} max={timeline.durationMs} step={1} value={timeMs} onChange={(event) => { setPlaying(false); setTimeMs(Number(event.target.value)) }} />
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
                <details className="qc-audio" data-g05-audio="timeline" data-g05-diagnostic-hash={audioDiagnosticHash}>
                    <summary><span><span className="qc-eyebrow">Audio</span><strong>{config.audio?.lanes.length ? `${config.audio.lanes.length} authored lane${config.audio.lanes.length === 1 ? "" : "s"}` : "Optional · source sound is independent"}</strong></span><span role="status" aria-live="polite">{audioDiagnostic}</span></summary>
                    <div className="qc-audio-body">
                        <div className="qc-audio-actions">
                            <button data-g05-action="presenter" type="button" disabled={!host || audioBusy} onClick={() => void addAudio("presenter")}>Add Presenter</button>
                            <button data-g05-action="soundtrack" type="button" disabled={!host || audioBusy} onClick={() => void addAudio("soundtrack")}>Add Soundtrack</button>
                            <button data-g05-action="check-mix" type="button" disabled={!host || audioBusy || !config.audio?.lanes.length} onClick={() => void checkAudioMix()}>Check mix</button>
                            <button data-g05-action="preview" type="button" disabled={!host || audioBusy || !config.audio?.lanes.length} onClick={() => void previewAudio()}>Preview 2 s</button>
                            {audioBusy || previewing ? <button data-g05-action="cancel" type="button" onClick={() => void cancelAudio()}>{previewing ? "Stop preview" : "Cancel audio"}</button> : null}
                            <button data-g05-action="reset" type="button" disabled={audioBusy || !config.audio?.lanes.length} onClick={() => void resetAudio()}>Reset audio</button>
                        </div>
                        <div className="qc-audio-lanes">
                            {(config.audio?.lanes ?? []).map((lane) => {
                                const source = config.audio?.sources.find((candidate) => candidate.id === lane.clips[0]?.sourceId)
                                const waveform = source ? waveforms[source.id] : undefined
                                return <article data-g05-lane={lane.role} data-g05-waveform-ready={Boolean(waveform)} data-g05-waveform-energy={(waveform ?? []).reduce((sum, bucket) => sum + bucket.rms, 0).toFixed(6)} key={lane.id}>
                                    <div><strong>{lane.name}</strong><span>{source ? `${source.sampleRate} Hz · ${source.channels === 1 ? "mono" : "stereo"}` : "Source unavailable"}</span></div>
                                    <div className="qc-waveform" aria-label={`${lane.name} waveform`}>{(waveform ?? Array.from({ length: 24 }, () => ({ rms: 0 }))).map((bucket, index) => <i key={index} style={{ height: `${Math.max(2, bucket.rms * 100)}%` }} />)}</div>
                                    <label>Start <input data-g05-control={`${lane.role}-start`} disabled={audioBusy} type="number" min={0} max={Math.max(0, Math.floor(timeline.durationMs - 1))} step={10} value={Math.round(timeSeconds(lane.clips[0]?.timelineStart ?? { numerator: 0, denominator: 1 }) * 1000)} onChange={(event) => updateAudioClipStart(lane.id, Number(event.target.value))} /> ms</label>
                                    <label>Gain {lane.gain.toFixed(2)}<input data-g05-control={`${lane.role}-gain`} aria-valuetext={`${lane.gain.toFixed(2)} times`} disabled={audioBusy} type="range" min={0} max={2} step={0.01} value={lane.gain} onChange={(event) => updateAudioLane(lane.id, { gain: Number(event.target.value) })} /></label>
                                    <button data-g05-control={`${lane.role}-mute`} aria-pressed={lane.muted} disabled={audioBusy} className={lane.muted ? "is-active" : ""} type="button" onClick={() => updateAudioLane(lane.id, { muted: !lane.muted })}>Mute</button>
                                    <button data-g05-control={`${lane.role}-solo`} aria-pressed={lane.solo} disabled={audioBusy} className={lane.solo ? "is-active" : ""} type="button" onClick={() => updateAudioLane(lane.id, { solo: !lane.solo })}>Solo</button>
                                </article>
                            })}
                        </div>
                        <div className="qc-audio-master">
                            <label>Master {(config.audio?.master.gain ?? 1).toFixed(2)}<input data-g05-control="master-gain" aria-valuetext={`${(config.audio?.master.gain ?? 1).toFixed(2)} times`} disabled={audioBusy} type="range" min={0} max={2} step={0.01} value={config.audio?.master.gain ?? 1} onChange={(event) => setConfig((current) => ({ ...current, audio: { ...(current.audio ?? defaultAudioIntent()), master: { ...(current.audio ?? defaultAudioIntent()).master, gain: Number(event.target.value) } } }))} /></label>
                            <button data-g05-control="master-mute" aria-pressed={config.audio?.master.muted ?? false} disabled={audioBusy} className={config.audio?.master.muted ? "is-active" : ""} type="button" onClick={() => setConfig((current) => ({ ...current, audio: { ...(current.audio ?? defaultAudioIntent()), master: { ...(current.audio ?? defaultAudioIntent()).master, muted: !(current.audio ?? defaultAudioIntent()).master.muted } } }))}>Master mute</button>
                            <button data-g05-control="duck" aria-pressed={config.audio?.ducking.enabled ?? false} className={config.audio?.ducking.enabled ? "is-active" : ""} disabled={audioBusy || !config.audio?.lanes.some((lane) => lane.role === "presenter") || !config.audio?.lanes.some((lane) => lane.role === "soundtrack")} type="button" onClick={() => setConfig((current) => ({ ...current, audio: { ...(current.audio ?? defaultAudioIntent()), ducking: { ...(current.audio ?? defaultAudioIntent()).ducking, enabled: !(current.audio ?? defaultAudioIntent()).ducking.enabled } } }))}>Presenter ducks music</button>
                        </div>
                    </div>
                </details>
            </section>
        </main>
    )
}
