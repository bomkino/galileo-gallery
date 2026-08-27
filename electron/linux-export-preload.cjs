const { contextBridge, ipcRenderer } = require("electron")

const api = Object.freeze({
    platform: "linux",
    onExportInit(callback) {
        const listener = (_event, payload) => callback(payload)
        ipcRenderer.on("export:init", listener)
        return () => ipcRenderer.removeListener("export:init", listener)
    },
    onExportFrame(callback) {
        const listener = async (_event, payload) => {
            try {
                await callback(payload)
                ipcRenderer.send("export:frame-ready", { exportId: payload.exportId, frameId: payload.frameId })
            } catch {
                ipcRenderer.send("export:frame-ready", { exportId: payload.exportId, frameId: payload.frameId, error: "frame_failed" })
            }
        }
        ipcRenderer.on("export:set-frame", listener)
        return () => ipcRenderer.removeListener("export:set-frame", listener)
    },
    exportReady(exportId) {
        ipcRenderer.send("export:ready", { exportId })
    },
})

contextBridge.exposeInMainWorld("reelAPI", api)
