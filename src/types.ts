export type MediaKind = "image" | "video"
export type MotionPreset = "cut" | "magnetic" | "velvet" | "dream" | "custom"
export type ExportFormat = "mp4" | "premiere" | "webm" | "webm-small"
export type ExportQuality = "master" | "high" | "optimized"
export type PosterFrame = "first" | "last" | "none"
export type CanvasPreset = "fullHD" | "fourK" | "square" | "portrait" | "vertical" | "presentation" | "cinema" | "custom"
export type BackgroundStyle = "solid" | "gradient" | "halo" | "paper" | "transparent"

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
    items: MediaItem[]
    settings: ReelSettings
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
    phase: "preparing" | "rendering" | "encoding" | "done" | "cancelled" | "error"
    progress: number
    frame?: number
    totalFrames?: number
    outputPath?: string
    posterPath?: string
    message?: string
}

export type SelectedMedia = Omit<MediaItem, "id" | "ratio" | "spotlight" | "muted">

export interface ReelAPI {
    platform: "darwin" | "win32" | "linux"
    pickMedia(): Promise<SelectedMedia[]>
    getDroppedFile(file: File): Promise<SelectedMedia | null>
    exportReel(request: ExportRequest): Promise<{ cancelled?: boolean; outputPath?: string; posterPath?: string }>
    cancelExport(): Promise<void>
    revealFile(path: string): Promise<void>
    loadRecovery(): Promise<RecoverySnapshot | null>
    saveRecovery(snapshot: RecoverySnapshot): Promise<{ savedAt: number }>
    createVideoProxy(url: string): Promise<string>
    saveProject(config: ReelConfig): Promise<{ cancelled?: boolean; outputPath?: string }>
    openProject(): Promise<{ cancelled?: boolean; config?: ReelConfig; sourcePath?: string }>
    saveTemplate(settings: ReelSettings): Promise<{ cancelled?: boolean; outputPath?: string }>
    openTemplate(): Promise<{ cancelled?: boolean; settings?: Partial<ReelSettings>; sourcePath?: string }>
    onExportProgress(callback: (progress: ExportProgress) => void): () => void
    onExportInit(callback: (payload: { exportId: string; request: ExportRequest; videoFrames: Record<number, ExportVideoFrameSet> }) => void): () => void
    onExportFrame(callback: (payload: { exportId: string; frameId: string; timeMs: number }) => Promise<void>): () => void
    exportReady(exportId: string): void
}

declare global {
    interface Window {
        reelAPI: ReelAPI
    }
}
