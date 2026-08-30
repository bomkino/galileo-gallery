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

export function createLightTableMountCleanupGate(schedule: (task: () => void) => void = queueMicrotask) {
    let generation = 0
    return {
        begin() {
            generation += 1
            return generation
        },
        defer(mountGeneration: number, cleanup: () => void) {
            schedule(() => {
                if (generation === mountGeneration) cleanup()
            })
        },
        snapshot() {
            return { generation }
        },
    }
}

export type LightTableMountCleanupGate = ReturnType<typeof createLightTableMountCleanupGate>

export type LightTableUnavailableState = Readonly<{
    scope: string
    keys: ReadonlySet<string>
}>

const EMPTY_LIGHT_TABLE_UNAVAILABLE_KEYS: ReadonlySet<string> = new Set()

export function lightTableUnavailableKeysForScope(state: LightTableUnavailableState, scope: string) {
    return state.scope === scope ? state.keys : EMPTY_LIGHT_TABLE_UNAVAILABLE_KEYS
}

export function recordLightTableUnavailableKey(state: LightTableUnavailableState, scope: string, key: string): LightTableUnavailableState {
    if (!scope || !key) return state
    const keys = lightTableUnavailableKeysForScope(state, scope)
    if (state.scope === scope && keys.has(key)) return state
    return Object.freeze({ scope, keys: new Set([...keys, key]) })
}

export type LightTablePosterRecord = {
    source: string
    targetKey: string
    url: string
    sequence?: number
}

export function matchingLightTablePoster(poster: LightTablePosterRecord | undefined, source: string, targetKey: string) {
    return poster?.source === source && poster.targetKey === targetKey ? poster : undefined
}

export function retainedLightTablePoster(poster: LightTablePosterRecord | undefined, source: string) {
    return poster?.source === source ? poster : undefined
}

export function shouldReplaceLightTablePoster(previous: LightTablePosterRecord | undefined, incoming: LightTablePosterRecord) {
    if (!previous || previous.source !== incoming.source) return true
    if (previous.targetKey === incoming.targetKey) return false
    if (Number.isSafeInteger(previous.sequence) && Number.isSafeInteger(incoming.sequence)) {
        return (incoming.sequence as number) > (previous.sequence as number)
    }
    return true
}

export function sampledLightTableSourceTimeMs(timeMs: number, fps: number) {
    if (!Number.isFinite(timeMs) || !Number.isFinite(fps) || fps <= 0) return 0
    const framePosition = timeMs * fps / 1_000
    const nearestFrame = Math.round(framePosition)
    const boundaryEpsilon = Number.EPSILON * Math.max(1, Math.abs(framePosition)) * 8
    const frameIndex = Math.abs(framePosition - nearestFrame) <= boundaryEpsilon ? nearestFrame : Math.floor(framePosition)
    return Math.max(0, frameIndex / fps * 1_000)
}

export function lightTableSeekConverged(currentTime: number, targetTime: number, fps: number) {
    if (![currentTime, targetTime, fps].every(Number.isFinite) || targetTime < 0 || fps <= 0) return false
    return Math.abs(currentTime - targetTime) <= Math.max(0.0005, 0.5 / Math.max(1, fps))
}

export function lightTablePresentedFrameAtOrBeforeTarget(mediaTime: number, targetTime: number) {
    if (![mediaTime, targetTime].every(Number.isFinite) || mediaTime < 0 || targetTime < 0) return false
    return mediaTime <= targetTime + 0.0005
}

export function lightTableVideoSeekTime(requestedTime: number, durationSeconds: number) {
    if (![requestedTime, durationSeconds].every(Number.isFinite) || durationSeconds <= 0) return 0
    const clamped = Math.max(0, Math.min(requestedTime, durationSeconds))
    if (clamped < durationSeconds) return clamped
    const decrement = Math.max(Number.MIN_VALUE, Math.abs(durationSeconds) * Number.EPSILON)
    return Math.max(0, durationSeconds - decrement)
}

export type LightTableVideoTargetIntent = {
    key: string
    timeMs: number
    loop: boolean
}

export type LightTableVideoTargetRequest = LightTableVideoTargetIntent & {
    sequence: number
}

export function createLightTableVideoTargetCoordinator(initialSequence = 0) {
    if (!Number.isSafeInteger(initialSequence) || initialSequence < 0) throw new Error("Light Table video sequence is invalid.")
    let desired: LightTableVideoTargetIntent | null = null
    let inFlight: LightTableVideoTargetRequest | null = null
    let completedKey: string | null = null
    let blockedKey: string | null = null
    let sequence = initialSequence

    const take = () => {
        if (inFlight || !desired || desired.key === completedKey || desired.key === blockedKey) return null
        inFlight = Object.freeze({ ...desired, sequence: sequence += 1 })
        return inFlight
    }

    return {
        request(intent: LightTableVideoTargetIntent) {
            if (!intent || typeof intent.key !== "string" || !intent.key || !Number.isFinite(intent.timeMs) || intent.timeMs < 0 || typeof intent.loop !== "boolean") {
                throw new Error("Light Table video target is invalid.")
            }
            if (desired?.key !== intent.key) blockedKey = null
            desired = { ...intent }
            return take()
        },
        resume() {
            return take()
        },
        defer(requestSequence: number) {
            if (!inFlight || inFlight.sequence !== requestSequence) return false
            inFlight = null
            return true
        },
        settle(requestSequence: number, outcome: "captured" | "unavailable") {
            if (!inFlight || inFlight.sequence !== requestSequence) return { accepted: false, settled: null, next: null }
            const settled = inFlight
            inFlight = null
            if (outcome === "captured") completedKey = settled.key
            else blockedKey = settled.key
            return { accepted: true, settled, next: take() }
        },
        reset() {
            desired = null
            inFlight = null
            completedKey = null
            blockedKey = null
        },
        snapshot() {
            return { desired, inFlight, completedKey, blockedKey, sequence }
        },
    }
}

export function selectLightTableVideoOwnerIds(
    items: readonly Pick<MediaItem, "id" | "type" | "url" | "previewUrl">[],
    focusId: string | null,
    targetKey: string,
    posters: ReadonlyMap<string, LightTablePosterRecord>,
    failedIds: ReadonlySet<string>,
    unavailableKeys: ReadonlySet<string>,
    retainedOwnerIds: ReadonlySet<string> = new Set(),
) {
    const pending = items.filter((item) => {
        if (item.type !== "video" || failedIds.has(item.id)) return false
        const source = item.previewUrl ?? item.url
        if (!source || unavailableKeys.has(`${item.id}:${source}:${targetKey}`)) return false
        const poster = posters.get(item.id)
        return !poster || poster.source !== source || poster.targetKey !== targetKey
    })
    pending.sort((left, right) => {
        const retained = Number(retainedOwnerIds.has(right.id)) - Number(retainedOwnerIds.has(left.id))
        return retained || Number(right.id === focusId) - Number(left.id === focusId)
    })
    return pending.slice(0, LIGHT_TABLE_MAX_VIDEO_OWNERS).map((item) => item.id)
}
