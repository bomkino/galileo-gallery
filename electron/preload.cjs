const { contextBridge, ipcRenderer, webUtils } = require("electron")

contextBridge.exposeInMainWorld("reelAPI", {
    platform: process.platform,
    pickMedia: () => ipcRenderer.invoke("media:pick"),
    getDroppedFile: async (file) => {
        const filePath = webUtils.getPathForFile(file)
        return filePath ? ipcRenderer.invoke("media:from-path", filePath) : null
    },
    createVideoProxy: (url) => ipcRenderer.invoke("media:create-video-proxy", url),
    saveProject: (config) => ipcRenderer.invoke("project:save", config),
    openProject: () => ipcRenderer.invoke("project:open"),
    saveTemplate: (settings) => ipcRenderer.invoke("template:save", settings),
    openTemplate: () => ipcRenderer.invoke("template:open"),
    exportReel: (request) => ipcRenderer.invoke("export:start", request),
    cancelExport: () => ipcRenderer.invoke("export:cancel"),
    revealFile: (filePath) => ipcRenderer.invoke("export:reveal", filePath),
    loadRecovery: () => ipcRenderer.invoke("recovery:load"),
    saveRecovery: (snapshot) => ipcRenderer.invoke("recovery:save", snapshot),
    onExportProgress: (callback) => {
        const listener = (_event, payload) => callback(payload)
        ipcRenderer.on("export:progress", listener)
        return () => ipcRenderer.removeListener("export:progress", listener)
    },
    onExportInit: (callback) => {
        const listener = (_event, payload) => callback(payload)
        ipcRenderer.on("export:init", listener)
        return () => ipcRenderer.removeListener("export:init", listener)
    },
    onExportFrame: (callback) => {
        const listener = async (_event, payload) => {
            try {
                await callback(payload)
                ipcRenderer.send("export:frame-ready", {
                    exportId: payload.exportId,
                    frameId: payload.frameId,
                })
            } catch (error) {
                ipcRenderer.send("export:frame-ready", {
                    exportId: payload.exportId,
                    frameId: payload.frameId,
                    error: error instanceof Error ? error.message : String(error),
                })
            }
        }
        ipcRenderer.on("export:set-frame", listener)
        return () => ipcRenderer.removeListener("export:set-frame", listener)
    },
    exportReady: (exportId) => ipcRenderer.send("export:ready", { exportId }),
})
