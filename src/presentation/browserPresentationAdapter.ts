import {
    createInterfaceScaleModel,
    DEFAULT_INTERFACE_SCALE,
    isInterfaceScale,
    type InterfaceScale,
    type InterfaceScaleListener,
    type InterfaceScaleModel,
    type InterfaceScaleSnapshot,
} from "./interfaceScale.ts"
import {
    comparePresentationManifestOrder,
    createPresentationManifest,
    isPresentationWriterId,
    MAX_PRESENTATION_REVISION,
    nextPresentationRevision,
    PRESENTATION_MANIFEST_STORAGE_KEY,
    serializePresentationManifest,
    tryParsePresentationManifest,
    type PresentationManifest,
} from "./presentationManifest.ts"

export type PresentationStorage = Pick<Storage, "getItem" | "setItem">

export type PresentationStorageEvent = Readonly<{
    key: string | null
    newValue: string | null
    storageArea?: Storage | null
}>

export type PresentationStorageEvents = {
    addEventListener(type: "storage", listener: (event: PresentationStorageEvent) => void): void
    removeEventListener(type: "storage", listener: (event: PresentationStorageEvent) => void): void
}

export interface BrowserPresentationAdapter extends InterfaceScaleModel {
    readonly storageKey: typeof PRESENTATION_MANIFEST_STORAGE_KEY
    dispose(): void
}

export type BrowserPresentationAdapterOptions = Readonly<{
    storage?: PresentationStorage | null
    events?: PresentationStorageEvents | null
    writerId?: string
}>

function createWriterId(): string {
    if (!globalThis.crypto?.getRandomValues) {
        throw new Error("Secure browser randomness is unavailable for the presentation writer identity.")
    }
    return [...globalThis.crypto.getRandomValues(new Uint8Array(8))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("")
}

function defaultStorage(): PresentationStorage | null {
    if (typeof window === "undefined") return null
    try {
        return window.localStorage
    } catch {
        return null
    }
}

function defaultEvents(): PresentationStorageEvents | null {
    return typeof window === "undefined" ? null : window
}

function readManifest(storage: PresentationStorage | null): PresentationManifest | null {
    if (!storage) return null
    try {
        return tryParsePresentationManifest(storage.getItem(PRESENTATION_MANIFEST_STORAGE_KEY))
    } catch {
        return null
    }
}

export function createBrowserPresentationAdapter(
    options: BrowserPresentationAdapterOptions = {},
): BrowserPresentationAdapter {
    const storage = options.storage === undefined ? defaultStorage() : options.storage
    const events = options.events === undefined ? defaultEvents() : options.events
    const writerId = options.writerId ?? createWriterId()
    if (!isPresentationWriterId(writerId)) throw new TypeError("Presentation writer identity must be 16 lowercase hexadecimal characters.")
    const initialManifest = readManifest(storage)
    const model = createInterfaceScaleModel(initialManifest?.interfaceScale ?? DEFAULT_INTERFACE_SCALE)
    const subscriptions = new Set<() => void>()
    let currentManifest = initialManifest ?? createPresentationManifest()
    let hasUnpersistedLocalState = false
    let disposed = false
    let listening = false

    const persist = (manifest: PresentationManifest): boolean => {
        if (!storage) return false
        try {
            storage.setItem(
                PRESENTATION_MANIFEST_STORAGE_KEY,
                serializePresentationManifest(manifest),
            )
            return true
        } catch {
            // Presentation state remains usable when storage is blocked or full.
            return false
        }
    }

    const onStorage = (event: PresentationStorageEvent) => {
        if (disposed || (event.key !== null && event.key !== PRESENTATION_MANIFEST_STORAGE_KEY)) return
        if (event.storageArea && storage && event.storageArea !== storage) return

        if (event.key === null || event.newValue === null) {
            if (hasUnpersistedLocalState || currentManifest.revision >= MAX_PRESENTATION_REVISION) {
                hasUnpersistedLocalState = !persist(currentManifest)
                return
            }
            currentManifest = createPresentationManifest(
                DEFAULT_INTERFACE_SCALE,
                nextPresentationRevision(currentManifest.revision),
                writerId,
            )
            model.setInterfaceScale(currentManifest.interfaceScale)
            hasUnpersistedLocalState = !persist(currentManifest)
            return
        }

        const next = tryParsePresentationManifest(event.newValue)
        if (!next) return
        const order = comparePresentationManifestOrder(next, currentManifest)
        if (order < 0) {
            hasUnpersistedLocalState = !persist(currentManifest)
            return
        }
        if (order === 0) {
            hasUnpersistedLocalState = false
            return
        }
        currentManifest = next
        hasUnpersistedLocalState = false
        model.setInterfaceScale(currentManifest.interfaceScale)
    }

    const startListening = () => {
        if (disposed || listening || !events) return
        events.addEventListener("storage", onStorage)
        listening = true
    }

    const stopListening = () => {
        if (!listening || !events) return
        events.removeEventListener("storage", onStorage)
        listening = false
    }

    const setInterfaceScale = (value: InterfaceScale): InterfaceScaleSnapshot => {
        if (disposed) throw new Error("Browser presentation adapter is disposed.")
        if (!isInterfaceScale(value)) throw new TypeError("Interface Scale must be a 75–200 percent step of 5.")
        const previous = model.getSnapshot()
        if (value === previous.interfaceScale) return previous
        const nextRevision = nextPresentationRevision(currentManifest.revision)
        currentManifest = createPresentationManifest(value, nextRevision, writerId)
        hasUnpersistedLocalState = !persist(currentManifest)
        // Establish the adapter's causal winner before model observers run. Observers are
        // synchronous and may reenter through set/reset; the nested mutation must advance
        // from this manifest instead of being overwritten by the outer call.
        return model.setInterfaceScale(value)
    }

    return {
        storageKey: PRESENTATION_MANIFEST_STORAGE_KEY,
        getSnapshot: model.getSnapshot,
        subscribe(listener: InterfaceScaleListener): () => void {
            if (disposed) return () => undefined
            startListening()
            const removeFromModel = model.subscribe(listener)
            let subscribed = true
            const unsubscribe = () => {
                if (!subscribed) return
                subscribed = false
                subscriptions.delete(unsubscribe)
                removeFromModel()
                if (subscriptions.size === 0) stopListening()
            }
            subscriptions.add(unsubscribe)
            return unsubscribe
        },
        setInterfaceScale,
        resetInterfaceScale: () => setInterfaceScale(DEFAULT_INTERFACE_SCALE),
        dispose() {
            if (disposed) return
            disposed = true
            for (const unsubscribe of [...subscriptions]) unsubscribe()
            stopListening()
        },
    }
}
