export type MediaKind = "image" | "video"
export type MotionPreset = "cut" | "magnetic" | "velvet" | "dream" | "custom"
export type ExportFormat = "png-frames" | "mp4" | "premiere" | "webm" | "webm-small"
export type ExportQuality = "master" | "high" | "optimized"
export type PosterFrame = "first" | "last" | "none"
export type CanvasPreset = "fullHD" | "fourK" | "square" | "portrait" | "vertical" | "presentation" | "cinema" | "custom"
export type BackgroundStyle = "solid" | "gradient" | "halo" | "paper" | "transparent"
export type TimelineMode = "automatic" | "fixed-duration" | "directed"

export type VisualTimelineSegment = {
    id: string
    kind: "cycle" | "hold"
    cycles: number
    paceScale: number
    durationMs: number
}

export type MediaItem = {
    id: string
    name: string
    type: MediaKind
    url: string
    previewUrl?: string
    ratio: number
    aspectMode?: "auto" | "global" | "custom"
    ratioW?: number
    ratioH?: number
    fit?: "contain" | "cover"
    crop?: { x: number; y: number; width: number; height: number }
    focal?: { x: number; y: number }
    caption?: string
    spotlight: boolean
    muted: boolean
}

export type ReelSettings = {
    canvasPreset: CanvasPreset
    canvasWidth: number
    canvasHeight: number
    ratioMode: "auto" | "fixed"
    fixedRatio: "sixteenNine" | "wide2576" | "custom"
    customRatioWidth: number
    customRatioHeight: number
    imageFit: "contain" | "cover"
    autoplayVideos: boolean
    loopVideos: boolean
    paddingUnit: "px" | "percent"
    paddingTop: number
    paddingRight: number
    paddingBottom: number
    paddingLeft: number
    captionGap: number
    motionPreset: MotionPreset
    launchMs: number
    arrivalMs: number
    growMs: number
    exitMs: number
    paceMs: number
    axis: "horizontal" | "vertical"
    direction: "forward" | "reverse"
    transitionDirection: "left" | "right"
    startMode: "auto" | "click"
    playKind: "once" | "repeat" | "loop"
    repeatCount: number
    leadInMs: number
    holdMs: number
    finaleGrowMs: number
    finaleHoldMs: number
    fadeMs: number
    canvasPose: number
    spotlightsEnabled: boolean
    finaleEnabled: boolean
    heroSize: number
    finaleSize: number
    centerBump: number
    tilt: number
    sway: number
    idleDim: number
    idleMute: number
    spotlightDim: number
    speedBlur: number
    slideHeight: number
    gap: number
    cornerStyle: "rounded" | "squircle"
    cornerSmoothing: number
    radius: number
    shadow: number
    gridSize: number
    gridStrength: number
    gridDrift: number
    vignette: number
    showHint: boolean
    tableSpread: number
    overlap: number
    underlightStrength: number
    focusBehavior: "route" | "loupe-only" | "none"
    nudgeRestraint: number
    theme: "auto" | "dark" | "light"
    ground: string
    paper: string
    backgroundStyle: BackgroundStyle
    backgroundColor2: string
    backgroundAngle: number
    backgroundTexture: number
    exportQuality: ExportQuality
}

export type ReelConfig = {
    schemaVersion?: number
    styleId: string
    sceneVersion?: number
    items: MediaItem[]
    settings: ReelSettings
    timelineMode?: TimelineMode
    timelineFixedDurationMs?: number
    timelineSegments?: VisualTimelineSegment[]
    audio?: AudioTimelineIntent
}

export type PortableGalleryAudioSource =
    | {
        id: string
        name: string
        role: "source-video"
        mediaId: string
        sampleRate: number
        channels: 1 | 2
        sampleFrames: number
    }
    | {
        id: string
        name: string
        role: "presenter" | "soundtrack"
        archivePath: string
        bytes: number
        sha256: string
        signature: "wav-pcm16"
        sampleRate: number
        channels: 1 | 2
        sampleFrames: number
    }

export type PortableGalleryAudioClip = {
    id: string
    sourceId: string
    timelineStart: RationalTime
    sourceIn: RationalTime
    sourceSpan: RationalTime
    duration: RationalTime
    loop: boolean
    gain: number
    muted: boolean
    fadeIn: RationalTime
    fadeOut: RationalTime
}

export type PortableGalleryAudioLane = {
    id: string
    name: string
    role: "source-video" | "presenter" | "soundtrack"
    gain: number
    muted: boolean
    solo: boolean
    clips: PortableGalleryAudioClip[]
}

export type PortableGalleryMedia = {
    id: string
    name: string
    kind: MediaKind
    archivePath: string
    bytes: number
    sha256: string
    signature: "png" | "jpeg" | "gif" | "webp" | "avif" | "webm" | "iso-media"
    frame: {
        ratio: number
        aspectMode: "auto" | "global" | "custom"
        ratioW: number
        ratioH: number
        caption: string
        spotlight: boolean
        muted: boolean
    }
}

export type PortableGalleryCanvas = Pick<ReelSettings,
    | "canvasPreset" | "canvasWidth" | "canvasHeight" | "ratioMode" | "fixedRatio"
    | "customRatioWidth" | "customRatioHeight" | "paddingUnit" | "paddingTop"
    | "paddingRight" | "paddingBottom" | "paddingLeft"
>

export type PortableGallerySceneParameters = Pick<ReelSettings,
    | "imageFit" | "autoplayVideos" | "loopVideos" | "captionGap" | "motionPreset"
    | "canvasPose" | "spotlightsEnabled" | "finaleEnabled" | "heroSize" | "finaleSize"
    | "centerBump" | "tilt" | "sway" | "idleDim" | "idleMute" | "spotlightDim"
    | "speedBlur" | "slideHeight" | "gap" | "cornerStyle" | "cornerSmoothing"
    | "radius" | "shadow" | "gridSize" | "gridStrength" | "gridDrift" | "vignette" | "showHint"
    | "tableSpread" | "overlap" | "focusBehavior" | "nudgeRestraint"
>

export type PortableGalleryLookParameters = Pick<ReelSettings,
    | "theme" | "ground" | "paper" | "backgroundStyle" | "backgroundColor2"
    | "backgroundAngle" | "backgroundTexture"
    | "underlightStrength"
>

export type PortableGalleryTimeline = {
    mode: TimelineMode
    fixedDurationMs: number
    segments: VisualTimelineSegment[]
    transitionDirection?: "left" | "right"
} & Pick<ReelSettings,
    | "playKind" | "repeatCount" | "axis" | "direction" | "startMode" | "launchMs"
    | "arrivalMs" | "growMs" | "exitMs" | "paceMs" | "leadInMs" | "holdMs"
    | "finaleGrowMs" | "finaleHoldMs" | "fadeMs"
>

export type PortableGalleryProjectV2 = {
    format: "galileo-gallery-project"
    product: "galileo-gallery"
    schemaVersion: 2
    engineVersion: 1
    media: PortableGalleryMedia[]
    canvas: PortableGalleryCanvas
    scene: { id: string; version: 1 | 2; parameters: PortableGallerySceneParameters }
    look: { id: string; version: 1; parameters: PortableGalleryLookParameters }
    timeline: PortableGalleryTimeline
    audio: {
        id: "gallery-audio-intent"
        version: 1
        sourceVideo: "per-media"
        sampleRate: number
        channels: 1 | 2
        sources: PortableGalleryAudioSource[]
        lanes: PortableGalleryAudioLane[]
        ducking: {
            enabled: boolean
            triggerLaneId: string
            targetLaneIds: string[]
            amount: number
            attack: RationalTime
            release: RationalTime
        }
        master: { gain: number; muted: boolean }
    }
    exportIntent: { quality: ExportQuality }
}

export type RecoverySnapshot = {
    config: ReelConfig
    savedAt: number
}

export type ExportRequest = {
    config: ReelConfig
    width: number
    height: number
    fps: number
    durationMs: number
    cycleDurationMs?: number
    finalCycleDurationMs?: number
    format: ExportFormat
    posterFrame: PosterFrame
    quality: ExportQuality
    outputPath?: string
}

export type ExportVideoFrameSet = {
    fps: number
    frames: string[]
}

export type ExportProgress = {
    exportId: string
    phase: "preparing" | "rendering" | "encoding" | "verifying" | "done" | "cancelled" | "error"
    progress: number
    frame?: number
    totalFrames?: number
    outputPath?: string
    posterPath?: string
    message?: string
}

export type SelectedMedia = Omit<MediaItem, "id" | "ratio" | "spotlight" | "muted">

export type DroppedMediaResult =
    | { accepted: true; media: SelectedMedia }
    | { accepted: false; name: string; reason: "unavailable" | "not-a-file" | "unsupported-type" }

export type ProjectImportFailureCode =
    | "archive_too_large"
    | "too_many_entries"
    | "entry_too_large"
    | "expanded_size_exceeded"
    | "compression_ratio_exceeded"
    | "insufficient_staging_space"
    | "unsafe_entry_name"
    | "duplicate_entry"
    | "unsupported_archive_entry"
    | "corrupt_archive"
    | "manifest_missing"
    | "manifest_invalid"
    | "legacy_project_unsupported"
    | "wrong_product"
    | "future_version_unsupported"
    | "unexpected_archive_entry"
    | "media_missing"
    | "media_hash_mismatch"
    | "media_signature_mismatch"
    | "canvas_invalid"
    | "scene_invalid"
    | "look_invalid"
    | "timeline_invalid"
    | "audio_invalid"
    | "source_unavailable"
    | "import_conflict"
    | "internal_error"

export type ProjectOpenResult =
    | { cancelled: true }
    | { failure: { code: ProjectImportFailureCode; message: string } }
    | { config: ReelConfig; operationId: string }

export interface ReelAPI {
    platform: "darwin" | "win32" | "linux"
    pickMedia(): Promise<SelectedMedia[]>
    getDroppedFile(file: File): Promise<DroppedMediaResult>
    exportReel(request: ExportRequest): Promise<{ cancelled?: boolean; outputPath?: string; posterPath?: string }>
    cancelExport(): Promise<void>
    revealFile(path: string): Promise<void>
    loadRecovery(): Promise<RecoverySnapshot | null>
    saveRecovery(snapshot: RecoverySnapshot): Promise<{ savedAt: number }>
    createVideoProxy(url: string): Promise<string>
    saveProject(config: ReelConfig): Promise<{ cancelled?: boolean; outputPath?: string }>
    openProject(): Promise<ProjectOpenResult>
    acceptProjectOpen(operationId: string): Promise<unknown>
    discardProjectOpen(operationId: string): Promise<unknown>
    cancelProjectOpen(): Promise<{ cancelled: boolean }>
    saveTemplate(settings: ReelSettings): Promise<{ cancelled?: boolean; outputPath?: string }>
    openTemplate(): Promise<{ cancelled?: boolean; settings?: Partial<ReelSettings>; sourcePath?: string }>
    onExportProgress(callback: (progress: ExportProgress) => void): () => void
    onExportInit(callback: (payload: { exportId: string; request: ExportRequest; videoFrames: Record<number, ExportVideoFrameSet> }) => void): () => void
    onExportFrame(callback: (payload: { exportId: string; frameId: string; timeMs: number }) => Promise<void>): () => void
    exportReady(exportId: string): void
}

export interface GalleryHostPort {
    platform: "linux"
    identity(): Promise<Record<string, unknown>>
    chooseMedia(): Promise<SelectedMedia[]>
    releaseMedia(urls: string[]): Promise<{ released: number }>
    chooseAudio(role: "presenter" | "soundtrack"): Promise<null | { name: string; role: "presenter" | "soundtrack"; url: string; sampleRate: number; channels: 1 | 2; sampleFrames: number }>
    prepareVideoAudio(url: string, durationUs: number): Promise<{ sampleRate: 48000; channels: 2; sampleFrames: number }>
    decodeAudio(url: string, startFrame: number, frameCount: number): Promise<{ sampleRate: number; channels: 1 | 2; startFrame: number; frameCount: number; samples: number[] }>
    audioWaveform(url: string, buckets: number): Promise<{ sampleRate: number; channels: 1 | 2; sampleFrames: number; buckets: Array<{ minimum: number; maximum: number; rms: number }> }>
    cancelAudio(): Promise<{ cancelled: number }>
    exportCapabilities(): Promise<{ version: 1; formats: Array<
        | { id: "png-frames"; available: true; alpha: true; audio: false; sceneVersions: [{ id: "quiet-carousel"; versions: [1]; video: true }, { id: "vitrine"; versions: [2]; video: true }, { id: "the-shelf"; versions: [2]; video: false }]; consequence: string }
        | { id: "mp4-h264-aac"; available: boolean; alpha: false; audio: true; sceneIds: ["quiet-carousel"]; consequence: string }
    > }>
    preflightPngFrames(intent: { config: ReelConfig; width: number; height: number; fps: number; durationMs: number; cycleDurationMs: number; finalCycleDurationMs: number; transparent: boolean }): Promise<{ snapshotId: string; format: "png-frames"; width: number; height: number; fps: number; durationMs: number; frameCount: number; alpha: boolean; audio: "none"; consequence: string }>
    choosePngFramesDestination(suggestedName: string): Promise<{ cancelled: true } | { cancelled: false; destinationGrant: string }>
    startPngFramesExport(snapshotId: string, destinationGrant: string): Promise<{ format: "png-frames"; frameCount: number; width: number; height: number; alpha: boolean; audio: "none"; manifestSha256: string }>
    preflightH264(intent: { config: ReelConfig; width: number; height: number; fps: number; durationMs: number; cycleDurationMs: number; finalCycleDurationMs: number; quality: ExportQuality }): Promise<{ snapshotId: string; format: "mp4-h264-aac"; width: number; height: number; fps: number; durationMs: number; frameCount: number; alpha: false; audio: "aac-48khz-stereo"; audioFrameCount: number; consequence: string }>
    appendH264Audio(snapshotId: string, startFrame: number, pcm16Base64: string): Promise<{ acceptedFrames: number; nextFrame: number }>
    finishH264Audio(snapshotId: string): Promise<{ snapshotId: string; sampleRate: 48000; channels: 2; sampleFrames: number; bytes: number; sha256: string }>
    chooseH264Destination(suggestedName: string): Promise<{ cancelled: true } | { cancelled: false; destinationGrant: string }>
    startH264Export(snapshotId: string, destinationGrant: string): Promise<{ format: "mp4-h264-aac"; frameCount: number; width: number; height: number; alpha: false; audio: "aac-48khz-stereo"; audioFrameCount: number; bytes: number; sha256: string; videoDecodeSha256: string; audioDecodeSha256: string }>
    cancelExport(): Promise<{ cancelled: boolean }>
    onExportProgress(callback: (progress: ExportProgress) => void): () => void
    saveProject(config: ReelConfig): Promise<{ cancelled?: boolean; savedAt?: number; documentId?: string }>
    beginProjectOpen(): Promise<
        | { cancelled: true }
        | { failure: { code: ProjectImportFailureCode; message: string } }
        | { operationId: string; candidateGeneration: number; config: ReelConfig }
    >
    acceptProjectOpen(operationId: string): Promise<{ generation: number }>
    discardProjectOpen(operationId: string): Promise<{ discarded: boolean }>
    cancelProjectOpen(): Promise<{ cancelled: boolean }>
}

declare global {
    interface Window {
        reelAPI: ReelAPI
        galleryHost?: GalleryHostPort
    }
}
import type { AudioTimelineIntent, RationalTime } from "./audio/audioTimeline.ts"
