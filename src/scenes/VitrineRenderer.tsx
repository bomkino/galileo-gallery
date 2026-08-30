import * as React from "react"
import type { MediaItem, ReelConfig } from "../types"
import { sourceVideoTimeSeconds } from "./quietCarousel"
import { compileVitrineTimeline, evaluateVitrine, vitrineDesignSpace, vitrineScene, vitrineStoryTimeMs } from "./vitrine"
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

type VideoTarget = { source: string; target: number }

type VideoSeekOperation = VideoTarget & { epoch: number }

function sameVideoTarget(left: VideoTarget | null, right: VideoTarget | null) {
    return Boolean(left && right && left.source === right.source && Math.abs(left.target - right.target) <= 0.0005)
}

function VitrineVideo({ source, timeMs, loop, fps, style, prewarm, onFailure }: { source: string; timeMs: number; loop: boolean; fps: number; style: React.CSSProperties; prewarm: boolean; onFailure: () => void }) {
    const ref = React.useRef<HTMLVideoElement>(null)
    const epochRef = React.useRef(0)
    const frameCallbackRef = React.useRef<number | null>(null)
    const animationFrameRef = React.useRef<number | null>(null)
    const pumpFrameRef = React.useRef<number | null>(null)
    const [ready, setReady] = React.useState(false)
    const [hasPresented, setHasPresented] = React.useState(false)
    const [presentedTime, setPresentedTime] = React.useState<number | null>(null)
    const [presentedTarget, setPresentedTarget] = React.useState<number | null>(null)
    const [decodedTime, setDecodedTime] = React.useState<number | null>(null)
    const [decodedTarget, setDecodedTarget] = React.useState<number | null>(null)
    const [frameProof, setFrameProof] = React.useState<"none" | "decoded" | "presented">("none")
    const readyRef = React.useRef(false)
    const frameProofRef = React.useRef<"none" | "decoded" | "presented">("none")
    const prewarmRef = React.useRef(prewarm)
    const kickedPlaybackRateRef = React.useRef<number | null>(null)
    const loadedSourceRef = React.useRef<string | null>(null)
    const desiredRef = React.useRef<VideoTarget | null>(null)
    const activeRef = React.useRef<VideoSeekOperation | null>(null)
    const confirmedRef = React.useRef<(VideoTarget & { mediaTime: number }) | null>(null)
    const seekCleanupRef = React.useRef<(() => void) | null>(null)
    const pumpRef = React.useRef<() => void>(() => undefined)
    prewarmRef.current = prewarm
    const sampledTimeMs = Math.floor(Math.max(0, timeMs) * fps / 1_000 + 1e-9) * 1_000 / fps
    const restorePlaybackRate = React.useCallback((video?: HTMLVideoElement | null) => {
        if (!video || kickedPlaybackRateRef.current === null) return
        video.playbackRate = kickedPlaybackRateRef.current
        kickedPlaybackRateRef.current = null
    }, [])
    const cancelFrameConfirmation = React.useCallback((video?: HTMLVideoElement | null) => {
        const frameVideo = video as (HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void }) | null | undefined
        if (frameCallbackRef.current !== null) frameVideo?.cancelVideoFrameCallback?.(frameCallbackRef.current)
        if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
        frameCallbackRef.current = null
        animationFrameRef.current = null
        if (video) {
            video.pause()
            restorePlaybackRate(video)
        }
    }, [restorePlaybackRate])
    const schedulePump = React.useCallback(() => {
        if (pumpFrameRef.current !== null) return
        const frameId = requestAnimationFrame(() => {
            if (pumpFrameRef.current === frameId) pumpFrameRef.current = null
            pumpRef.current()
        })
        pumpFrameRef.current = frameId
    }, [])
    const seekToPresentedFrame = React.useCallback((video: HTMLVideoElement, operation: VideoSeekOperation, decodedAtTarget = false) => {
        const isCurrent = () => activeRef.current === operation && operation.epoch === epochRef.current
            && loadedSourceRef.current === operation.source && ref.current === video
        if (!isCurrent()) return
        cancelFrameConfirmation(video)
        const frameVideo = video as HTMLVideoElement & {
            requestVideoFrameCallback?: (handler: (_now: number, metadata: { mediaTime: number }) => void) => number
        }
        const targetTolerance = Math.max(0.0005, 0.5 / Math.max(1, fps))
        let seekComplete = decodedAtTarget
        let presentedMediaTime: number | null = null
        const finishFrame = (proof: "decoded" | "presented") => {
            if (isCurrent() && seekComplete && !video.seeking && Number.isFinite(presentedMediaTime)) {
                const frameMatches = proof === "decoded"
                    ? Math.abs(video.currentTime - operation.target) <= targetTolerance
                    : (presentedMediaTime as number) >= 0
                        && (presentedMediaTime as number) <= operation.target + 0.0001
                if (!frameMatches) {
                    video.pause()
                    restorePlaybackRate(video)
                    activeRef.current = null
                    schedulePump()
                    return false
                }
                video.pause()
                restorePlaybackRate(video)
                activeRef.current = null
                confirmedRef.current = { source: operation.source, target: operation.target, mediaTime: presentedMediaTime as number }
                setHasPresented(true)
                if (proof === "decoded") {
                    setDecodedTime(presentedMediaTime)
                    setDecodedTarget(operation.target)
                    setPresentedTime(null)
                    setPresentedTarget(null)
                } else {
                    video.dataset.storyFrameProof = "presented"
                    video.dataset.storyPresentedTime = String(presentedMediaTime)
                    video.dataset.storyTargetTime = String(operation.target)
                    setDecodedTime(null)
                    setDecodedTarget(null)
                    setPresentedTime(presentedMediaTime)
                    setPresentedTarget(operation.target)
                }
                frameProofRef.current = proof
                setFrameProof(proof)
                const latest = desiredRef.current
                const converged = sameVideoTarget(latest, operation)
                readyRef.current = converged
                if (proof === "presented") video.dataset.storyReady = converged ? "true" : "false"
                setReady(converged)
                if (!converged) schedulePump()
                return true
            }
            return false
        }
        const schedulePaintFallback = () => {
            const firstFrame = requestAnimationFrame(() => {
                if (animationFrameRef.current !== firstFrame || !isCurrent()) return
                const secondFrame = requestAnimationFrame(() => {
                    if (animationFrameRef.current === secondFrame) animationFrameRef.current = null
                    if (!isCurrent()) return
                    presentedMediaTime = video.currentTime
                    finishFrame("presented")
                })
                animationFrameRef.current = secondFrame
            })
            animationFrameRef.current = firstFrame
        }
        const schedulePresentationKick = () => {
            if (animationFrameRef.current !== null) return
            const firstFrame = requestAnimationFrame(() => {
                if (animationFrameRef.current !== firstFrame) return
                if (!isCurrent()) {
                    animationFrameRef.current = null
                    return
                }
                const secondFrame = requestAnimationFrame(() => {
                    if (animationFrameRef.current === secondFrame) animationFrameRef.current = null
                    if (!isCurrent() || !seekComplete || frameCallbackRef.current === null || !video.paused) return
                    if (kickedPlaybackRateRef.current === null) kickedPlaybackRateRef.current = video.playbackRate
                    video.playbackRate = 0.25
                    void video.play().catch(() => {
                        if (isCurrent()) restorePlaybackRate(video)
                    })
                })
                animationFrameRef.current = secondFrame
            })
            animationFrameRef.current = firstFrame
        }
        const armFrameCallback = () => {
            if (!isCurrent() || !frameVideo.requestVideoFrameCallback || frameCallbackRef.current !== null) return
            const callbackId = frameVideo.requestVideoFrameCallback((_now, metadata) => {
                if (frameCallbackRef.current === callbackId) frameCallbackRef.current = null
                if (!isCurrent()) return
                if (Number.isFinite(metadata.mediaTime)) presentedMediaTime = metadata.mediaTime
                if (!seekComplete) return
                finishFrame("presented")
            })
            frameCallbackRef.current = callbackId
        }
        const onSeeked = () => {
            seekCleanupRef.current = null
            if (!isCurrent()) return
            seekComplete = true
            if (prewarmRef.current && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                cancelFrameConfirmation(video)
                presentedMediaTime = video.currentTime
                finishFrame("decoded")
                return
            }
            if (Number.isFinite(presentedMediaTime)) {
                finishFrame("presented")
                return
            }
            if (!frameVideo.requestVideoFrameCallback) {
                schedulePaintFallback()
                return
            }
            if (frameCallbackRef.current === null) armFrameCallback()
            schedulePresentationKick()
        }
        if (decodedAtTarget) {
            if (!isCurrent() || video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
                || Math.abs(video.currentTime - operation.target) > targetTolerance) {
                activeRef.current = null
                schedulePump()
                return
            }
            if (typeof frameVideo.requestVideoFrameCallback === "function") {
                armFrameCallback()
                schedulePresentationKick()
            } else schedulePaintFallback()
            return
        }
        video.addEventListener("seeked", onSeeked, { once: true })
        seekCleanupRef.current = () => video.removeEventListener("seeked", onSeeked)
        video.currentTime = operation.target
        if (frameCallbackRef.current === null) armFrameCallback()
    }, [cancelFrameConfirmation, fps, restorePlaybackRate, schedulePump])
    const startSeek = React.useCallback((video: HTMLVideoElement, request: VideoTarget) => {
        if (activeRef.current || loadedSourceRef.current !== request.source || ref.current !== video) return
        const operation = { ...request, epoch: epochRef.current }
        activeRef.current = operation
        readyRef.current = false
        setReady(false)
        seekCleanupRef.current?.()
        seekCleanupRef.current = null
        cancelFrameConfirmation(video)
        if (!video.seeking && Math.abs(video.currentTime - request.target) <= 0.0005) {
            const detourDistance = Math.min(video.duration / 2, Math.max(0.25, 2 / Math.max(1, fps)))
            const detour = request.target + detourDistance < video.duration ? request.target + detourDistance : Math.max(0, request.target - detourDistance)
            if (Math.abs(detour - request.target) > 0.0005) {
                const onDetourSeeked = () => {
                    seekCleanupRef.current = null
                    if (activeRef.current === operation && operation.epoch === epochRef.current
                        && loadedSourceRef.current === request.source && ref.current === video) seekToPresentedFrame(video, operation)
                }
                video.addEventListener("seeked", onDetourSeeked, { once: true })
                seekCleanupRef.current = () => video.removeEventListener("seeked", onDetourSeeked)
                video.currentTime = detour
                return
            }
        }
        seekToPresentedFrame(video, operation)
    }, [cancelFrameConfirmation, fps, seekToPresentedFrame])
    const pump = React.useCallback(() => {
        const video = ref.current
        if (!video) return
        const desired = desiredRef.current
        if (!desired || loadedSourceRef.current !== desired.source || activeRef.current) return
        if (!Number.isFinite(video.duration) || video.duration <= 0) return
        video.pause()
        const confirmed = confirmedRef.current
        const targetTolerance = Math.max(0.0005, 0.5 / Math.max(1, fps))
        const proof = frameProofRef.current
        const proofReady = prewarmRef.current ? proof === "decoded" || proof === "presented" : proof === "presented"
        if (proofReady && sameVideoTarget(confirmed, desired) && !video.seeking && Math.abs(video.currentTime - desired.target) <= targetTolerance) {
            readyRef.current = true
            setReady(true)
            return
        }
        startSeek(video, desired)
    }, [fps, startSeek])
    pumpRef.current = pump
    const sync = React.useCallback(() => {
        const video = ref.current
        if (!video || loadedSourceRef.current !== source) return
        if (!Number.isFinite(video.duration) || video.duration <= 0) return
        video.pause()
        const requestedTarget = sourceVideoTimeSeconds(sampledTimeMs, video.duration, loop)
        const target = !loop && requestedTarget >= video.duration
            ? Math.max(0, video.duration - 1 / Math.max(1, fps))
            : requestedTarget
        const next = { source, target }
        if (sameVideoTarget(desiredRef.current, next)
            && (readyRef.current || activeRef.current !== null || pumpFrameRef.current !== null)) return
        desiredRef.current = next
        if (!sameVideoTarget(confirmedRef.current, next)) {
            readyRef.current = false
            setReady(false)
            frameProofRef.current = "none"
            setFrameProof("none")
        }
        pump()
    }, [fps, loop, pump, sampledTimeMs, source])
    React.useLayoutEffect(sync, [sync])
    React.useLayoutEffect(() => {
        const video = ref.current
        if (prewarm || !video || frameProofRef.current !== "decoded") return
        readyRef.current = false
        video.dataset.storyReady = "false"
        setReady(false)
        const desired = desiredRef.current
        const targetTolerance = Math.max(0.0005, 0.5 / Math.max(1, fps))
        if (!sameVideoTarget(confirmedRef.current, desired)
            || activeRef.current || loadedSourceRef.current !== source || video.seeking
            || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
            || Math.abs(video.currentTime - (desired?.target ?? Number.NaN)) > targetTolerance) return
        const operation = { ...(desired as VideoTarget), epoch: epochRef.current }
        activeRef.current = operation
        seekToPresentedFrame(video, operation, true)
    }, [fps, frameProof, prewarm, seekToPresentedFrame, source])
    React.useLayoutEffect(() => {
        const video = ref.current
        if (!video) return
        epochRef.current += 1
        loadedSourceRef.current = source
        readyRef.current = false
        desiredRef.current = null
        activeRef.current = null
        confirmedRef.current = null
        frameProofRef.current = "none"
        setReady(false)
        setHasPresented(false)
        setPresentedTime(null)
        setPresentedTarget(null)
        setDecodedTime(null)
        setDecodedTarget(null)
        setFrameProof("none")
        video.src = source
        video.load()
        return () => {
            epochRef.current += 1
            activeRef.current = null
            loadedSourceRef.current = null
            readyRef.current = false
            desiredRef.current = null
            confirmedRef.current = null
            frameProofRef.current = "none"
            seekCleanupRef.current?.()
            seekCleanupRef.current = null
            cancelFrameConfirmation(video)
            if (pumpFrameRef.current !== null) cancelAnimationFrame(pumpFrameRef.current)
            pumpFrameRef.current = null
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
        data-story-target-time={presentedTarget ?? ""}
        data-story-decoded-time={decodedTime ?? ""}
        data-story-decoded-target-time={decodedTarget ?? ""}
        data-story-frame-proof={frameProof}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        onLoadedMetadata={sync}
        onError={onFailure}
        style={{ ...style, visibility: hasPresented ? "visible" : "hidden" }}
    />
}

function VitrineMedia({ item, source, index, timeMs, loop, fps, fit, exportMode, prewarm }: { item: MediaItem; source: string; index: number; timeMs: number; loop: boolean; fps: number; fit: "contain" | "cover"; exportMode: boolean; prewarm: boolean }) {
    const [failed, setFailed] = React.useState(false)
    React.useEffect(() => setFailed(false), [source])
    if (!source || failed) return <div className={`vitrine-placeholder vitrine-placeholder-${index + 1}`} data-media-failed={failed || exportMode ? "true" : "false"}><span>{failed ? "SOURCE UNAVAILABLE" : "OBJECT"}</span><strong>{String(index + 1).padStart(2, "0")}</strong></div>
    const style = mediaStyle(item, fit)
    if (item.type === "video" && source === (item.previewUrl ?? item.url)) return <VitrineVideo source={source} timeMs={timeMs} loop={loop} fps={fps} style={style} prewarm={prewarm} onFailure={() => setFailed(true)} />
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
    const metricFrame = React.useRef<number | null>(null)
    const clearMetricReadiness = React.useCallback(() => {
        const element = ref.current
        if (!element) return
        delete element.dataset.vitrineShortEdge
        delete element.dataset.vitrineMetricCompensation
    }, [])
    const syncMetrics = React.useCallback(() => {
        const element = ref.current
        if (!element || !element.isConnected) return
        const style = getComputedStyle(element)
        const width = Number.parseFloat(style.width)
        const height = Number.parseFloat(style.height)
        if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
            clearMetricReadiness()
            return
        }
        const shortEdge = Math.min(width, height)
        const values = {
            gap: shortEdge * 0.0234375,
            paddingX: shortEdge * 0.03125,
            border: shortEdge * 0.00390625,
            shadowY: shortEdge * 0.015625,
            shadowBlur: shortEdge * 0.046875,
            labelFont: shortEdge * 0.0390625,
            captionFont: shortEdge * 0.0546875,
        }
        const metrics = [
            ["--vitrine-short-edge", shortEdge],
            ["--vitrine-placard-gap", values.gap],
            ["--vitrine-placard-padding-x", values.paddingX],
            ["--vitrine-placard-border", values.border],
            ["--vitrine-placard-shadow-y", values.shadowY],
            ["--vitrine-placard-shadow-blur", values.shadowBlur],
            ["--vitrine-placard-label-size", values.labelFont],
            ["--vitrine-placard-caption-size", values.captionFont],
        ] as const
        for (const [name, value] of metrics) element.style.setProperty(name, `${value}px`)

        const expectsPlacard = element.dataset.vitrinePlacardExpected === "true"
        const placard = element.querySelector<HTMLElement>(".vitrine-placard")
        if (!expectsPlacard) {
            if (placard) {
                clearMetricReadiness()
                return
            }
            element.dataset.vitrineMetricCompensation = "1"
            element.dataset.vitrineShortEdge = String(shortEdge)
            return
        }
        const label = placard?.querySelector<HTMLElement>("span") ?? null
        const caption = placard?.querySelector<HTMLElement>("strong") ?? null
        if (!placard || !placard.isConnected || !element.contains(placard) || !label || !caption) {
            clearMetricReadiness()
            return
        }

        const applyPlacardMetrics = (factor: number) => {
            placard.style.gap = `${values.gap * factor}px`
            placard.style.padding = `${values.gap * factor}px ${values.paddingX * factor}px`
            placard.style.borderWidth = "0"
            placard.style.outlineWidth = `${values.border}px`
            placard.style.boxShadow = `0 ${values.shadowY * factor}px ${values.shadowBlur * factor}px rgba(0, 0, 0, .12)`
            label.style.fontSize = `${values.labelFont * factor}px`
            caption.style.fontSize = `${values.captionFont * factor}px`
        }
        let compensation = 1
        applyPlacardMetrics(compensation)
        for (let pass = 0; pass < 2; pass += 1) {
            if (element !== ref.current || !element.isConnected || !placard.isConnected || !element.contains(placard)) {
                clearMetricReadiness()
                return
            }
            const actual = Number.parseFloat(getComputedStyle(placard).columnGap)
            if (Number.isFinite(actual) && actual > 0 && Math.abs(actual - values.gap) <= 0.001) break
            const correction = Number.isFinite(actual) && actual > 0 ? values.gap / actual : Number.NaN
            const nextCompensation = compensation * correction
            if (!Number.isFinite(correction) || correction < 0.25 || correction > 4
                || !Number.isFinite(nextCompensation) || nextCompensation < 0.25 || nextCompensation > 4) {
                clearMetricReadiness()
                return
            }
            compensation = nextCompensation
            applyPlacardMetrics(compensation)
        }
        const verifiedGap = Number.parseFloat(getComputedStyle(placard).columnGap)
        if (element !== ref.current || !element.isConnected || !placard.isConnected || !element.contains(placard)
            || !Number.isFinite(verifiedGap) || Math.abs(verifiedGap - values.gap) > 0.001) {
            clearMetricReadiness()
            return
        }
        element.dataset.vitrineMetricCompensation = String(compensation)
        element.dataset.vitrineShortEdge = String(shortEdge)
    }, [clearMetricReadiness])
    const scheduleMetrics = React.useCallback(() => {
        clearMetricReadiness()
        if (metricFrame.current !== null) cancelAnimationFrame(metricFrame.current)
        metricFrame.current = requestAnimationFrame(() => {
            metricFrame.current = null
            syncMetrics()
        })
    }, [clearMetricReadiness, syncMetrics])
    const placardRef = React.useCallback((node: HTMLDivElement | null) => {
        clearMetricReadiness()
        if (!node) {
            scheduleMetrics()
            return
        }
        scheduleMetrics()
    }, [clearMetricReadiness, scheduleMetrics])
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
    React.useLayoutEffect(() => {
        const element = ref.current
        if (!element) return
        scheduleMetrics()
        const observer = new ResizeObserver(scheduleMetrics)
        observer.observe(element)
        const interfaceScale = element.closest<HTMLElement>("[data-interface-scale]")
        const scaleObserver = interfaceScale ? new MutationObserver(scheduleMetrics) : null
        if (interfaceScale && scaleObserver) scaleObserver.observe(interfaceScale, {
            attributes: true,
            attributeFilter: ["data-interface-scale"],
            subtree: false,
        })
        return () => {
            if (metricFrame.current !== null) {
                cancelAnimationFrame(metricFrame.current)
                metricFrame.current = null
            }
            observer.disconnect()
            scaleObserver?.disconnect()
            clearMetricReadiness()
        }
    }, [logicalWidth, logicalHeight, clearMetricReadiness, scheduleMetrics])
    const { designWidth, designHeight, projectScale } = vitrineDesignSpace(logicalWidth, logicalHeight)
    const effectiveReducedMotion = reducedMotion ?? (!exportMode && systemReducedMotion)
    const evaluated = evaluateVitrine({
        items,
        parameters,
        timeline,
        timeMs: inspectedSource ? 0 : timeMs,
        stageWidth: designWidth,
        stageHeight: designHeight,
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
    return <div className={`vitrine-stage ${transparent ? "is-transparent" : ""}`} data-product-scene="vitrine" data-scene-version="2" data-evaluator-hash={evaluated.stateHash} data-vitrine-phrase={evaluated.phrase} data-current-id={evaluated.currentId ?? ""} data-incoming-id={evaluated.incomingId ?? ""} data-semantic-id={semanticId ?? ""} data-vitrine-inspection={inspectedSource?.item.id ?? ""} data-vitrine-placard-expected={evaluated.placard ? "true" : "false"} data-transition-progress={evaluated.transitionProgress} data-logical-width={logicalWidth} data-logical-height={logicalHeight} ref={ref} style={{ background } as React.CSSProperties}>
        <div className="vitrine-logical-stage" style={{ width: "100%", height: "100%", transform: "none" } as React.CSSProperties}>
            <div className="vitrine-field" aria-hidden="true" />
            {renderPlanes.map(({ plane, guard }) => {
                const item = items[plane.sourceIndex]
                const originalSourceIndex = sourceItems[plane.sourceIndex]?.sourceIndex ?? plane.sourceIndex
                const source = exportMode && item.type === "video"
                    ? exportFrames?.[originalSourceIndex] ?? item.url
                    : exportFrames?.[originalSourceIndex] ?? item.previewUrl ?? item.url
                const crop = resolvedCrop(item)
                const focal = item.focal ?? { x: 0.5, y: 0.5 }
                const projectPlane = {
                    x: plane.x * projectScale,
                    y: plane.y * projectScale,
                    width: plane.width * projectScale,
                    height: plane.height * projectScale,
                }
                const viewportPlane = {
                    left: (plane.x - plane.width / 2) / designWidth * 100,
                    top: (plane.y - plane.height / 2) / designHeight * 100,
                    width: plane.width / designWidth * 100,
                    height: plane.height / designHeight * 100,
                }
                return <figure className={guard ? "vitrine-guard" : `vitrine-plane is-${plane.role}`} data-media-id={plane.id} data-source-index={originalSourceIndex} data-role={guard ? "guard" : plane.role} data-frame-fit={item.fit ?? evaluated.render.fit} data-crop-x={crop.x} data-crop-y={crop.y} data-crop-width={crop.width} data-crop-height={crop.height} data-focal-x={focal.x} data-focal-y={focal.y} data-x={projectPlane.x} data-y={projectPlane.y} data-z={plane.z} data-plane-width={projectPlane.width} data-plane-height={projectPlane.height} data-plane-scale={plane.scale} data-rotate-x={plane.rotateX} data-rotate-y={plane.rotateY} aria-hidden="true" key={plane.id} style={guard ? { position: "absolute", width: 1, height: 1, left: -10_000, top: -10_000, opacity: 0, pointerEvents: "none", overflow: "hidden" } : { left: `${viewportPlane.left}%`, top: `${viewportPlane.top}%`, width: `${viewportPlane.width}%`, height: `${viewportPlane.height}%`, zIndex: plane.role === "incoming" ? 1_001 : 1_000, transform: `rotateX(${plane.rotateX}deg) rotateY(${plane.rotateY}deg) scale(${plane.scale})` }}>
                    <VitrineMedia item={item} source={source} index={originalSourceIndex} timeMs={sourceTimeMs} loop={config.settings.loopVideos} fps={fps} fit={evaluated.render.fit} exportMode={exportMode} prewarm={guard} />
                </figure>
            })}
        </div>
        <div className="vitrine-design-overlay" data-design-width={designWidth} data-design-height={designHeight} data-project-width={logicalWidth} data-project-height={logicalHeight} style={{ width: "100%", height: "100%", transform: "none" }}>
            {evaluated.placard ? <div className="vitrine-placard" data-media-id={evaluated.placard.mediaId} ref={placardRef}><span>Vitrine</span><strong>{evaluated.placard.caption}</strong></div> : null}
        </div>
        <div className="vitrine-status" role="status" aria-live="polite" aria-atomic="true">{currentLabel ? `Showing ${currentLabel}, item ${semanticIndex + 1} of ${allSourceItems.length}` : "Vitrine is empty"}</div>
    </div>
}
