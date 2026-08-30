import type { MediaItem } from "../types"

export const LIGHT_TABLE_MAX_VIDEO_OWNERS = 2
export const LIGHT_TABLE_POSTER_MAX_EDGE = 1_600
export const LIGHT_TABLE_POSTER_MAX_BYTES = 4 * 1024 * 1024

type PosterEncodeToken = symbol
type PosterEncodeTask = { token: PosterEncodeToken; run: (release: () => void) => void }

export function createLightTablePosterEncodeGate(limit = LIGHT_TABLE_MAX_VIDEO_OWNERS) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Light Table poster encode limit is invalid.")
    const queued = new Map<string, PosterEncodeTask>()
    let active = 0
    let maximumObserved = 0
    let disposed = false

    const pump = () => {
        if (disposed) return
        while (active < limit && queued.size > 0) {
            const [ownerId, task] = queued.entries().next().value as [string, PosterEncodeTask]
            queued.delete(ownerId)
            active += 1
            maximumObserved = Math.max(maximumObserved, active)
            let released = false
            const release = () => {
                if (released) return
                released = true
                active = Math.max(0, active - 1)
                pump()
            }
            try {
                task.run(release)
            } catch {
                release()
            }
        }
    }

    return {
        schedule(ownerId: string, run: PosterEncodeTask["run"]) {
            if (disposed || !ownerId) return null
            const token = Symbol(ownerId)
            queued.set(ownerId, { token, run })
            pump()
            return token
        },
        cancel(ownerId: string, token: PosterEncodeToken | null) {
            if (!token || queued.get(ownerId)?.token !== token) return false
            queued.delete(ownerId)
            return true
        },
        dispose() {
            disposed = true
            queued.clear()
        },
        snapshot() {
            return { active, queued: queued.size, maximumObserved, limit, disposed }
        },
    }
}

export type LightTablePosterEncodeGate = ReturnType<typeof createLightTablePosterEncodeGate>

export type LightTablePosterRecord = {
    source: string
    targetKey: string
    url: string
}

export function matchingLightTablePoster(poster: LightTablePosterRecord | undefined, source: string, targetKey: string) {
    return poster?.source === source && poster.targetKey === targetKey ? poster : undefined
}

export function sampledLightTableSourceTimeMs(timeMs: number, fps: number) {
    if (!Number.isFinite(timeMs) || !Number.isFinite(fps) || fps <= 0) return 0
    return Math.max(0, Math.floor(timeMs / 1_000 * fps) / fps * 1_000)
}

export function selectLightTableVideoOwnerIds(
    items: readonly Pick<MediaItem, "id" | "type" | "url" | "previewUrl">[],
    focusId: string | null,
    targetKey: string,
    posters: ReadonlyMap<string, LightTablePosterRecord>,
    failedIds: ReadonlySet<string>,
    unavailableKeys: ReadonlySet<string>,
) {
    const pending = items.filter((item) => {
        if (item.type !== "video" || failedIds.has(item.id)) return false
        const source = item.previewUrl ?? item.url
        if (!source || unavailableKeys.has(`${item.id}:${source}:${targetKey}`)) return false
        const poster = posters.get(item.id)
        return !poster || poster.source !== source || poster.targetKey !== targetKey
    })
    pending.sort((left, right) => Number(right.id === focusId) - Number(left.id === focusId))
    return pending.slice(0, LIGHT_TABLE_MAX_VIDEO_OWNERS).map((item) => item.id)
}
