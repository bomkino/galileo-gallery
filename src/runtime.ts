import type { GalleryHostPort, ReelAPI, ReelConfig } from "./types.ts"
import { hydrateHostAudio, validateHostAudioIntent } from "./audio/audioHost.ts"
import { compileAudioTimeline, defaultAudioIntent, type RationalTime } from "./audio/audioTimeline.ts"
import { mixAudioChunk } from "./audio/audioMixer.ts"
import { createHostPCMProvider } from "./audio/hostPcmProvider.ts"

const unavailable = async () => {
    throw new Error("This action is available in the Galileo desktop app.")
}

const browserAPI: ReelAPI = {
    platform: "darwin",
    pickMedia: async () => [],
    getDroppedFile: async (file) => ({ accepted: false, name: file.name || "Dropped item", reason: "unavailable" }),
    exportReel: unavailable,
    cancelExport: async () => undefined,
    revealFile: async () => undefined,
    loadRecovery: async () => null,
    saveRecovery: async (snapshot) => ({ savedAt: snapshot.savedAt }),
    createVideoProxy: async (url) => url,
    saveProject: async () => ({ cancelled: true }),
    openProject: async () => ({ cancelled: true }),
    cancelProjectOpen: async () => ({ cancelled: false }),
    saveTemplate: async () => ({ cancelled: true }),
    openTemplate: async () => ({ cancelled: true }),
    onExportProgress: () => () => undefined,
    onExportInit: () => () => undefined,
    onExportFrame: () => () => undefined,
    exportReady: () => undefined,
}

function validateHostConfig(value: unknown): ReelConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Host Project is invalid.")
    const config = value as Partial<ReelConfig>
    if (config.schemaVersion !== 2 || typeof config.styleId !== "string" || !config.settings || !Array.isArray(config.items) || config.items.length > 256) {
        throw new Error("Host Project is invalid.")
    }
    if (!config.items.every((item) => item && typeof item.id === "string" && ["image", "video"].includes(item.type) && /^reel-media:\/\/grant\/[a-f0-9]{64}$/.test(item.url))) {
        throw new Error("Host media authority is invalid.")
    }
    const normalized = config as ReelConfig
    validateHostAudioIntent(normalized.audio, normalized.items)
    return normalized
}

function gcd(left: number, right: number) {
    let a = Math.abs(left)
    let b = Math.abs(right)
    while (b) [a, b] = [b, a % b]
    return a
}

function frameDuration(frameCount: number, fps: number): RationalTime {
    const divisor = gcd(frameCount, fps)
    return { numerator: frameCount / divisor, denominator: fps / divisor }
}

function decodedAudioFrameWork(plan: ReturnType<typeof compileAudioTimeline>) {
    if (plan.master.muted) return 0
    const hasSolo = plan.lanes.some((lane) => lane.solo && !lane.muted)
    let frames = 0
    for (const lane of plan.lanes) {
        if (lane.muted || (hasSolo && !lane.solo)) continue
        for (const clip of lane.clips) if (!clip.muted) frames += Math.max(0, clip.timelineEndFrame - clip.timelineStartFrame)
    }
    return frames
}

function sourceDurationUs(sampleFrames: number, sampleRate: number) {
    const numerator = BigInt(sampleFrames) * 1_000_000n
    const denominator = BigInt(sampleRate)
    return Number((numerator * 2n + denominator) / (denominator * 2n))
}

function pcm16Base64(interleaved: Float32Array) {
    const bytes = new Uint8Array(interleaved.length * 2)
    const view = new DataView(bytes.buffer)
    for (let index = 0; index < interleaved.length; index += 1) {
        const sample = Math.max(-1, Math.min(1, interleaved[index]))
        view.setInt16(index * 2, sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767), true)
    }
    let binary = ""
    for (let offset = 0; offset < bytes.length; offset += 8_192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192))
    return btoa(binary)
}

async function hydrateHostConfig(config: ReelConfig, host: GalleryHostPort) {
    await Promise.all(config.items.map((item) => new Promise<void>((resolve, reject) => {
        const media = item.type === "video" ? document.createElement("video") : new Image()
        const timeout = window.setTimeout(() => finish(new Error(`Timed out hydrating ${item.name}.`)), 15_000)
        const finish = (error?: Error) => {
            window.clearTimeout(timeout)
            media.removeAttribute("src")
            if (media instanceof HTMLMediaElement) media.load()
            if (error) reject(error)
            else resolve()
        }
        if (media instanceof HTMLVideoElement) {
            media.preload = "metadata"
            media.onloadedmetadata = () => finish()
            media.onerror = () => finish(new Error(`Could not hydrate ${item.name}.`))
            media.src = item.url
            media.load()
        } else {
            media.src = item.url
            media.decode().then(() => finish(), () => finish(new Error(`Could not hydrate ${item.name}.`)))
        }
    })))
    await hydrateHostAudio(config.audio)
    for (const source of config.audio?.sources ?? []) {
        if (source.role !== "source-video" || !source.url) continue
        const prepared = await host.prepareVideoAudio(source.url, sourceDurationUs(source.sampleFrames, source.sampleRate))
        if (prepared.sampleRate !== source.sampleRate || prepared.channels !== source.channels || prepared.sampleFrames !== source.sampleFrames) {
            throw new Error(`Could not hydrate ${source.name ?? source.id}.`)
        }
    }
}

export function createHostBackedAPI(host: GalleryHostPort): ReelAPI {
    let exportOwned = false
    let exportCancelled = false
    let hostExportAllocated = false
    let exportAudioController: AbortController | null = null
    return {
        ...browserAPI,
        platform: host.platform,
        pickMedia: () => host.chooseMedia(),
        saveProject: (config) => host.saveProject(config),
        openProject: async () => {
            const candidate = await host.beginProjectOpen()
            if ("cancelled" in candidate || "failure" in candidate) return candidate
            try {
                const config = validateHostConfig(candidate.config)
                await hydrateHostConfig(config, host)
                await host.acceptProjectOpen(candidate.operationId)
                return { config }
            } catch (error) {
                await host.discardProjectOpen(candidate.operationId).catch(() => undefined)
                throw error
            }
        },
        cancelProjectOpen: () => host.cancelProjectOpen(),
        exportReel: async (request) => {
            if (exportOwned || hostExportAllocated) throw new Error("An export is already running or still owned by the host.")
            if (!["png-frames", "mp4"].includes(request.format)) throw new Error("This Linux host slice supports verified PNG Frames and opaque H.264/AAC MP4.")
            exportOwned = true
            exportCancelled = false
            try {
                const capabilities = await host.exportCapabilities()
                const capabilityId = request.format === "png-frames" ? "png-frames" : "mp4-h264-aac"
                const capability = capabilities.formats.find((candidate) => candidate.id === capabilityId)
                if (!capability) throw new Error(`${request.format === "png-frames" ? "PNG Frames" : "H.264/AAC"} is unavailable on this host.`)
                if (!capability.available) throw new Error(capability.consequence)
                if (request.format === "mp4" && (!("sceneIds" in capability) || !capability.sceneIds.includes(request.config.styleId as "quiet-carousel"))) {
                    throw new Error("Verified H.264/AAC currently supports Quiet Carousel only. Choose PNG Frames for this Scene.")
                }
                if (exportCancelled) return { cancelled: true }
                const date = new Date().toISOString().slice(0, 10)
                if (request.format === "png-frames") {
                    const preflight = await host.preflightPngFrames({
                        config: request.config,
                        width: request.width,
                        height: request.height,
                        fps: request.fps,
                        durationMs: request.durationMs,
                        cycleDurationMs: request.cycleDurationMs ?? request.durationMs,
                        finalCycleDurationMs: request.finalCycleDurationMs ?? request.cycleDurationMs ?? request.durationMs,
                        transparent: request.config.settings.backgroundStyle === "transparent",
                    })
                    hostExportAllocated = true
                    if (exportCancelled) { await host.cancelExport(); hostExportAllocated = false; return { cancelled: true } }
                    const destination = await host.choosePngFramesDestination(`Galileo Gallery ${date} PNG Frames`)
                    if (destination.cancelled || exportCancelled) { await host.cancelExport(); hostExportAllocated = false; return { cancelled: true } }
                    await host.startPngFramesExport(preflight.snapshotId, destination.destinationGrant)
                    hostExportAllocated = false
                } else {
                    const authoredIntent = request.config.audio ?? defaultAudioIntent()
                    if (authoredIntent.sampleRate !== 48_000 || authoredIntent.channels !== 2) {
                        throw new Error("Verified H.264/AAC currently requires a 48 kHz stereo Project audio master.")
                    }
                    const requestedFrameCount = Math.max(1, Math.round(request.durationMs * request.fps / 1000))
                    const plan = compileAudioTimeline(authoredIntent, { duration: frameDuration(requestedFrameCount, request.fps), sampleRate: 48_000, channels: 2, chunkFrames: 65_536 })
                    if (plan.issues.length) throw new Error("Verified H.264/AAC cannot resolve one or more authored audio sources.")
                    if (decodedAudioFrameWork(plan) > plan.durationFrames * 64) {
                        throw new Error("Authored audio exceeds the verified 64× story-work bound. Reduce overlapping clips before H.264/AAC export.")
                    }
                    const preflight = await host.preflightH264({
                        config: request.config,
                        width: request.width,
                        height: request.height,
                        fps: request.fps,
                        durationMs: request.durationMs,
                        cycleDurationMs: request.cycleDurationMs ?? request.durationMs,
                        finalCycleDurationMs: request.finalCycleDurationMs ?? request.cycleDurationMs ?? request.durationMs,
                        quality: request.quality,
                    })
                    hostExportAllocated = true
                    if (plan.durationFrames !== preflight.audioFrameCount) throw new Error("H.264 audio clock does not match the immutable video snapshot.")
                    const provider = createHostPCMProvider(host, authoredIntent)
                    exportAudioController = new AbortController()
                    for (let startFrame = 0; startFrame < plan.durationFrames; startFrame += plan.chunkFrames) {
                        if (exportCancelled) { await host.cancelExport(); hostExportAllocated = false; return { cancelled: true } }
                        const frameCount = Math.min(plan.chunkFrames, plan.durationFrames - startFrame)
                        const mixed = await mixAudioChunk(plan, provider, startFrame, frameCount, exportAudioController.signal)
                        const accepted = await host.appendH264Audio(preflight.snapshotId, startFrame, pcm16Base64(mixed.interleaved))
                        if (accepted.acceptedFrames !== frameCount || accepted.nextFrame !== startFrame + frameCount) throw new Error("Host rejected deterministic H.264 audio staging.")
                    }
                    if (exportCancelled) { await host.cancelExport(); hostExportAllocated = false; return { cancelled: true } }
                    const audio = await host.finishH264Audio(preflight.snapshotId)
                    if (audio.sampleFrames !== preflight.audioFrameCount) throw new Error("Host staged the wrong H.264 audio duration.")
                    if (exportCancelled) { await host.cancelExport(); hostExportAllocated = false; return { cancelled: true } }
                    const destination = await host.chooseH264Destination(`Galileo Gallery ${date}.mp4`)
                    if (destination.cancelled || exportCancelled) { await host.cancelExport(); hostExportAllocated = false; return { cancelled: true } }
                    await host.startH264Export(preflight.snapshotId, destination.destinationGrant)
                    hostExportAllocated = false
                }
                return {}
            } catch (error) {
                const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined
                if (request.format === "mp4") {
                    exportAudioController?.abort()
                    const cleanup = await Promise.allSettled([host.cancelAudio(), host.cancelExport()])
                    if (cleanup[1].status === "fulfilled") hostExportAllocated = false
                }
                if (exportCancelled || code === "cancelled") return { cancelled: true }
                if (request.format === "mp4" && code === "conflict") {
                    const conflict = new Error("Choose a new filename; overwrite is not supported yet.") as Error & { code: string; diagnosticId?: unknown }
                    conflict.code = "conflict"
                    if (error && typeof error === "object" && "diagnosticId" in error) conflict.diagnosticId = (error as { diagnosticId?: unknown }).diagnosticId
                    throw conflict
                }
                throw error
            } finally {
                exportAudioController = null
                exportOwned = false
            }
        },
        cancelExport: async () => {
            exportCancelled = true
            exportAudioController?.abort()
            void host.cancelAudio().catch(() => undefined)
            const acknowledgementRequired = exportOwned && hostExportAllocated
            try {
                const result = await host.cancelExport()
                if (result.cancelled) hostExportAllocated = false
                if (acknowledgementRequired && !result.cancelled) throw new Error("The host did not acknowledge export cancellation.")
            } catch (error) {
                if (acknowledgementRequired) exportCancelled = false
                throw error
            }
        },
        onExportProgress: (callback) => host.onExportProgress(callback),
    }
}

export function ensureReelAPI(): ReelAPI {
    return window.reelAPI ?? (window.galleryHost ? createHostBackedAPI(window.galleryHost) : browserAPI)
}
