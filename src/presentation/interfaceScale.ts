export const INTERFACE_SCALE_VALUES = Object.freeze([
    75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125,
    130, 135, 140, 145, 150, 155, 160, 165, 170, 175,
    180, 185, 190, 195, 200,
] as const)

export type InterfaceScale = (typeof INTERFACE_SCALE_VALUES)[number]

export const DEFAULT_INTERFACE_SCALE: InterfaceScale = 100
export const MIN_INTERFACE_SCALE: InterfaceScale = 75
export const MAX_INTERFACE_SCALE: InterfaceScale = 200
export const INTERFACE_SCALE_STEP = 5 as const

export type InterfaceScaleSnapshot = Readonly<{
    interfaceScale: InterfaceScale
}>

export type InterfaceScaleListener = (snapshot: InterfaceScaleSnapshot) => void

export interface InterfaceScaleModel {
    getSnapshot(): InterfaceScaleSnapshot
    setInterfaceScale(value: InterfaceScale): InterfaceScaleSnapshot
    resetInterfaceScale(): InterfaceScaleSnapshot
    subscribe(listener: InterfaceScaleListener): () => void
}

const valueSet: ReadonlySet<number> = new Set(INTERFACE_SCALE_VALUES)

export function isInterfaceScale(value: unknown): value is InterfaceScale {
    return typeof value === "number" && Number.isInteger(value) && valueSet.has(value)
}

export function coerceInterfaceScale(value: number): InterfaceScale {
    if (!Number.isFinite(value)) return DEFAULT_INTERFACE_SCALE
    const bounded = Math.min(MAX_INTERFACE_SCALE, Math.max(MIN_INTERFACE_SCALE, value))
    const stepped = Math.round(bounded / INTERFACE_SCALE_STEP) * INTERFACE_SCALE_STEP
    return stepped as InterfaceScale
}

export function interfaceScaleRatio(value: InterfaceScale): number {
    return value / 100
}

export function createInterfaceScaleModel(initial: InterfaceScale = DEFAULT_INTERFACE_SCALE): InterfaceScaleModel {
    if (!isInterfaceScale(initial)) throw new TypeError("Initial Interface Scale must be a 75–200 percent step of 5.")
    let snapshot: InterfaceScaleSnapshot = Object.freeze({ interfaceScale: initial })
    const listeners = new Set<InterfaceScaleListener>()

    const setInterfaceScale = (value: InterfaceScale): InterfaceScaleSnapshot => {
        if (!isInterfaceScale(value)) throw new TypeError("Interface Scale must be a 75–200 percent step of 5.")
        if (value === snapshot.interfaceScale) return snapshot
        snapshot = Object.freeze({ interfaceScale: value })
        for (const listener of [...listeners]) {
            try {
                listener(snapshot)
            } catch {
                // A presentation observer cannot prevent other observers or state updates.
            }
        }
        return snapshot
    }

    return {
        getSnapshot: () => snapshot,
        setInterfaceScale,
        resetInterfaceScale: () => setInterfaceScale(DEFAULT_INTERFACE_SCALE),
        subscribe: (listener) => {
            if (typeof listener !== "function") throw new TypeError("Interface Scale listener must be a function.")
            listeners.add(listener)
            let subscribed = true
            return () => {
                if (!subscribed) return
                subscribed = false
                listeners.delete(listener)
            }
        },
    }
}
