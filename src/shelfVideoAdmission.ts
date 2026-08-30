export type ShelfVideoAdmissionSource = {
    id: string
    name: string
    type: "image" | "video"
    url: string
}

export type ShelfVideoAdmission = {
    id: string
    url: string
    width: number
    height: number
}

type AdmissionEnvironment = {
    createVideo: () => HTMLVideoElement
    requestPaint: (callback: FrameRequestCallback) => number
    setTimeout: (callback: () => void, milliseconds: number) => number
    clearTimeout: (handle: number) => void
    haveCurrentData: number
}

export type ShelfVideoAdmissionOptions = {
    signal?: AbortSignal
    timeoutMs?: number
    environment?: Partial<AdmissionEnvironment>
}

function cancelled() {
    const error = new Error("Shelf video admission cancelled.")
    error.name = "AbortError"
    return error
}

function admissionError(item: ShelfVideoAdmissionSource, reason: string) {
    return new Error(`Could not admit ${item.name}: ${reason}`)
}

function environment(overrides: Partial<AdmissionEnvironment> = {}): AdmissionEnvironment {
    return {
        createVideo: overrides.createVideo ?? (() => document.createElement("video")),
        requestPaint: overrides.requestPaint ?? ((callback) => window.requestAnimationFrame(callback)),
        setTimeout: overrides.setTimeout ?? ((callback, milliseconds) => window.setTimeout(callback, milliseconds)),
        clearTimeout: overrides.clearTimeout ?? ((handle) => window.clearTimeout(handle)),
        haveCurrentData: overrides.haveCurrentData ?? 2,
    }
}

function drainTwoPaints(env: AdmissionEnvironment) {
    return new Promise<void>((resolve) => {
        let settled = false
        let timeoutHandle: number | null = null
        const finish = () => {
            if (settled) return
            settled = true
            if (timeoutHandle !== null) env.clearTimeout(timeoutHandle)
            resolve()
        }
        timeoutHandle = env.setTimeout(finish, 250)
        try {
            env.requestPaint(() => {
                if (settled) return
                try { env.requestPaint(finish) } catch { finish() }
            })
        } catch {
            finish()
        }
    })
}

async function admitOneVideo(
    item: ShelfVideoAdmissionSource,
    signal: AbortSignal,
    timeoutMs: number,
    env: AdmissionEnvironment,
    failBatch: (error: Error) => void
): Promise<ShelfVideoAdmission> {
    const video = env.createVideo()
    let frameCallbackId: number | null = null
    let timeoutHandle: number | null = null
    let settled = false
    let resolveAdmission: ((value: ShelfVideoAdmission) => void) | null = null
    let rejectAdmission: ((error: Error) => void) | null = null

    const admitted = new Promise<ShelfVideoAdmission>((resolve, reject) => {
        resolveAdmission = resolve
        rejectAdmission = reject
    })

    const cleanup = async () => {
        if (timeoutHandle !== null) env.clearTimeout(timeoutHandle)
        timeoutHandle = null
        signal.removeEventListener("abort", onAbort)
        video.onerror = null
        if (frameCallbackId !== null && typeof video.cancelVideoFrameCallback === "function") {
            try { video.cancelVideoFrameCallback(frameCallbackId) } catch { /* Decoder teardown remains authoritative. */ }
        }
        frameCallbackId = null
        try { video.pause() } catch { /* Continue deterministic source retirement. */ }
        video.removeAttribute("src")
        try { video.load() } catch { /* Continue deterministic source retirement. */ }
        try { video.remove() } catch { /* A detached decoder is already outside the document. */ }
        await drainTwoPaints(env)
    }

    const finish = (result: ShelfVideoAdmission | Error) => {
        if (settled) return
        settled = true
        if (result instanceof Error && result.name !== "AbortError") failBatch(result)
        void cleanup().then(() => {
            if (result instanceof Error) rejectAdmission?.(result)
            else resolveAdmission?.(result)
        }, () => rejectAdmission?.(result instanceof Error ? result : admissionError(item, "decoder cleanup failed.")))
    }

    function onAbort() {
        finish(cancelled())
    }

    if (signal.aborted) {
        finish(cancelled())
        return admitted
    }

    signal.addEventListener("abort", onAbort, { once: true })
    video.muted = true
    video.playsInline = true
    video.preload = "auto"
    video.onerror = () => finish(admissionError(item, "the original source could not decode."))

    if (typeof video.requestVideoFrameCallback !== "function") {
        finish(admissionError(item, "frame-ready decoding is unavailable."))
        return admitted
    }

    frameCallbackId = video.requestVideoFrameCallback((_now, metadata) => {
        const width = video.videoWidth
        const height = video.videoHeight
        if (!Number.isFinite(metadata?.mediaTime) || !Number.isFinite(width) || width <= 0
            || !Number.isFinite(height) || height <= 0 || video.readyState < env.haveCurrentData) {
            finish(admissionError(item, "the decoded frame has invalid geometry or readiness."))
            return
        }
        finish({ id: item.id, url: item.url, width, height })
    })
    timeoutHandle = env.setTimeout(() => finish(admissionError(item, "frame decoding timed out.")), timeoutMs)

    // Admission is deliberately performed against the original, app-owned URL.
    video.src = item.url
    try {
        video.load()
        void video.play().catch(() => finish(admissionError(item, "the original source could not play.")))
    } catch {
        finish(admissionError(item, "the original source could not load."))
    }
    return admitted
}

export async function admitShelfVideos(
    items: readonly ShelfVideoAdmissionSource[],
    options: ShelfVideoAdmissionOptions = {}
): Promise<ShelfVideoAdmission[]> {
    const timeoutMs = options.timeoutMs ?? 15_000
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error("Shelf video admission timeout is invalid.")
    const signal = options.signal
    if (signal?.aborted) throw cancelled()
    const videos = items.filter((item) => item.type === "video")
    if (videos.length === 0) return []

    const env = environment(options.environment)
    const batchController = new AbortController()
    let cursor = 0
    let stopped = false
    let firstFailure: Error | null = null
    const results = new Array<ShelfVideoAdmission>(videos.length)
    const stop = () => {
        stopped = true
        batchController.abort()
    }
    const failBatch = (error: Error) => {
        if (firstFailure === null && !signal?.aborted) firstFailure = error
        stop()
    }
    const onAbort = () => stop()
    signal?.addEventListener("abort", onAbort, { once: true })

    const workers = Array.from({ length: Math.min(2, videos.length) }, async () => {
        while (!stopped) {
            const index = cursor
            if (index >= videos.length) return
            cursor += 1
            try {
                results[index] = await admitOneVideo(videos[index], batchController.signal, timeoutMs, env, failBatch)
            } catch (error) {
                if (error instanceof Error && error.name !== "AbortError" && firstFailure === null) firstFailure = error
                stop()
            }
        }
    })

    try {
        await Promise.allSettled(workers)
        if (signal?.aborted) throw cancelled()
        if (firstFailure !== null) throw firstFailure
        return results
    } finally {
        signal?.removeEventListener("abort", onAbort)
        stop()
    }
}
