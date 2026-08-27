import type { GalleryHostPort, ReelAPI, ReelConfig } from "./types.ts"
import { hydrateHostAudio, validateHostAudioIntent } from "./audio/audioHost.ts"

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

async function hydrateHostConfig(config: ReelConfig) {
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
}

export function createHostBackedAPI(host: GalleryHostPort): ReelAPI {
    let exportOwned = false
    let exportCancelled = false
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
                await hydrateHostConfig(config)
                await host.acceptProjectOpen(candidate.operationId)
                return { config }
            } catch (error) {
                await host.discardProjectOpen(candidate.operationId).catch(() => undefined)
                throw error
            }
        },
        cancelProjectOpen: () => host.cancelProjectOpen(),
        exportReel: async (request) => {
            if (exportOwned) throw new Error("An export is already running.")
            if (request.format !== "png-frames") throw new Error("This Linux host slice currently supports verified PNG Frames only.")
            exportOwned = true
            exportCancelled = false
            try {
                const capabilities = await host.exportCapabilities()
                const capability = capabilities.formats.find((candidate) => candidate.id === "png-frames")
                if (!capability?.available) throw new Error("PNG Frames are unavailable on this host.")
                if (exportCancelled) return { cancelled: true }
                const preflight = await host.preflightPngFrames({
                    config: request.config,
                    width: request.width,
                    height: request.height,
                    fps: request.fps,
                    durationMs: request.durationMs,
                    transparent: request.config.settings.backgroundStyle === "transparent",
                })
                if (exportCancelled) {
                    await host.cancelExport()
                    return { cancelled: true }
                }
                const date = new Date().toISOString().slice(0, 10)
                const destination = await host.choosePngFramesDestination(`Galileo Gallery ${date} PNG Frames`)
                if (destination.cancelled || exportCancelled) {
                    await host.cancelExport()
                    return { cancelled: true }
                }
                await host.startPngFramesExport(preflight.snapshotId, destination.destinationGrant)
                return {}
            } catch (error) {
                const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined
                if (exportCancelled || code === "cancelled") return { cancelled: true }
                throw error
            } finally {
                exportOwned = false
            }
        },
        cancelExport: async () => {
            exportCancelled = true
            await host.cancelExport()
        },
        onExportProgress: (callback) => host.onExportProgress(callback),
    }
}

export function ensureReelAPI(): ReelAPI {
    return window.reelAPI ?? (window.galleryHost ? createHostBackedAPI(window.galleryHost) : browserAPI)
}
