import type { ExportRequest } from "./types.ts"

export function exportCycleClock(request: ExportRequest, timeMs: number) {
    const cycleDuration = request.cycleDurationMs ?? request.durationMs
    const repeats = Math.min(1000, Math.max(1, Math.round(request.config.settings.repeatCount)))
    if (["vitrine", "the-shelf"].includes(request.config.styleId) && request.config.sceneVersion === 2 && request.config.settings.playKind === "repeat") {
        return { timeMs: timeMs % Math.max(1, cycleDuration), durationMs: cycleDuration, terminal: true }
    }
    if (request.config.settings.playKind === "repeat" && request.finalCycleDurationMs) {
        const finalStart = cycleDuration * Math.max(0, repeats - 1)
        if (timeMs >= finalStart) return { timeMs: Math.max(0, timeMs - finalStart), durationMs: request.finalCycleDurationMs, terminal: true }
    }
    if (request.config.settings.playKind === "once") {
        return { timeMs: Math.min(timeMs, cycleDuration), durationMs: cycleDuration, terminal: true }
    }
    return { timeMs: timeMs % Math.max(1, cycleDuration), durationMs: cycleDuration, terminal: false }
}
