function assertLegacyExportScene(request) {
    if (!request || typeof request !== "object" || !request.config || typeof request.config !== "object") {
        throw new Error("Legacy export request is invalid.")
    }
    if (request.config.styleId === "the-shelf" && request.config.sceneVersion === 2) {
        throw new Error("Shelf v2 export is unavailable until its source-video clock and rendered output are verified.")
    }
}

module.exports = { assertLegacyExportScene }
