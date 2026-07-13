import type { ReelAPI } from "./types"

const unavailable = async () => {
    throw new Error("This action is available in the Galileo desktop app.")
}

const browserAPI: ReelAPI = {
    platform: "darwin",
    pickMedia: async () => [],
    getDroppedFile: async () => null,
    exportReel: unavailable,
    cancelExport: async () => undefined,
    revealFile: async () => undefined,
    loadRecovery: async () => null,
    saveRecovery: async (snapshot) => ({ savedAt: snapshot.savedAt }),
    createVideoProxy: async (url) => url,
    saveProject: async () => ({ cancelled: true }),
    openProject: async () => ({ cancelled: true }),
    saveTemplate: async () => ({ cancelled: true }),
    openTemplate: async () => ({ cancelled: true }),
    onExportProgress: () => () => undefined,
    onExportInit: () => () => undefined,
    onExportFrame: () => () => undefined,
    exportReady: () => undefined,
}

export function ensureReelAPI(): ReelAPI {
    return window.reelAPI ?? browserAPI
}
