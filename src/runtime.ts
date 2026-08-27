import type { GalleryHostPort, ReelAPI } from "./types"

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

function hostBackedAPI(host: GalleryHostPort): ReelAPI {
    return {
        ...browserAPI,
        platform: host.platform,
        pickMedia: () => host.chooseMedia(),
        saveProject: (config) => host.saveProject(config),
        openProject: async () => {
            const candidate = await host.beginProjectOpen()
            if ("cancelled" in candidate || "failure" in candidate) return candidate
            try {
                await host.acceptProjectOpen(candidate.operationId)
                return { config: candidate.config }
            } catch (error) {
                await host.discardProjectOpen(candidate.operationId).catch(() => undefined)
                throw error
            }
        },
        cancelProjectOpen: () => host.cancelProjectOpen(),
    }
}

export function ensureReelAPI(): ReelAPI {
    return window.reelAPI ?? (window.galleryHost ? hostBackedAPI(window.galleryHost) : browserAPI)
}
