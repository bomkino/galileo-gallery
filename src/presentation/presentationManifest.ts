import {
    DEFAULT_INTERFACE_SCALE,
    isInterfaceScale,
    type InterfaceScale,
} from "./interfaceScale.ts"

export const PRESENTATION_MANIFEST_STORAGE_KEY = "galileo-gallery:local-presentation:v1"
export const PRESENTATION_MANIFEST_MAX_BYTES = 512
export const MAX_PRESENTATION_REVISION = 2_147_483_647
export const PRESENTATION_SYSTEM_WRITER_ID = "0000000000000000"

export type PresentationManifest = Readonly<{
    format: "galileo-gallery-local-presentation"
    product: "galileo-gallery"
    schemaVersion: 1
    revision: number
    writerId: string
    interfaceScale: InterfaceScale
}>

const manifestKeys = ["format", "interfaceScale", "product", "revision", "schemaVersion", "writerId"].sort()
const writerIdPattern = /^[a-f0-9]{16}$/

function utf8Bytes(value: string): number {
    return new TextEncoder().encode(value).byteLength
}

export function createPresentationManifest(
    interfaceScale: InterfaceScale = DEFAULT_INTERFACE_SCALE,
    revision = 0,
    writerId = PRESENTATION_SYSTEM_WRITER_ID,
): PresentationManifest {
    if (!isInterfaceScale(interfaceScale)) throw new TypeError("Local presentation manifest has an invalid Interface Scale.")
    if (!isPresentationRevision(revision)) throw new TypeError("Local presentation manifest has an invalid revision.")
    if (!isPresentationWriterId(writerId)) throw new TypeError("Local presentation manifest has an invalid writer identity.")
    return Object.freeze({
        format: "galileo-gallery-local-presentation",
        product: "galileo-gallery",
        schemaVersion: 1,
        revision,
        writerId,
        interfaceScale,
    })
}

export function isPresentationRevision(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_PRESENTATION_REVISION
}

export function isPresentationWriterId(value: unknown): value is string {
    return typeof value === "string" && writerIdPattern.test(value)
}

export function comparePresentationManifestOrder(
    left: PresentationManifest,
    right: PresentationManifest,
): -1 | 0 | 1 {
    if (left.revision !== right.revision) return left.revision < right.revision ? -1 : 1
    if (left.writerId !== right.writerId) return left.writerId < right.writerId ? -1 : 1
    if (left.interfaceScale !== right.interfaceScale) return left.interfaceScale < right.interfaceScale ? -1 : 1
    return 0
}

export function nextPresentationRevision(revision: number): number {
    if (!isPresentationRevision(revision) || revision >= MAX_PRESENTATION_REVISION) {
        throw new Error("Local presentation revision is exhausted.")
    }
    return revision + 1
}

export function parsePresentationManifest(text: string): PresentationManifest {
    if (typeof text !== "string" || utf8Bytes(text) > PRESENTATION_MANIFEST_MAX_BYTES) {
        throw new Error("Local presentation manifest exceeds its byte limit.")
    }

    let candidate: unknown
    try {
        candidate = JSON.parse(text)
    } catch {
        throw new Error("Local presentation manifest is not valid JSON.")
    }

    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        throw new Error("Local presentation manifest is invalid.")
    }
    const record = candidate as Record<string, unknown>
    if (Object.keys(record).sort().join("\0") !== manifestKeys.join("\0")) {
        throw new Error("Local presentation manifest has unexpected fields.")
    }
    if (
        record.format !== "galileo-gallery-local-presentation"
        || record.product !== "galileo-gallery"
        || record.schemaVersion !== 1
        || !isPresentationRevision(record.revision)
        || !isPresentationWriterId(record.writerId)
        || !isInterfaceScale(record.interfaceScale)
    ) {
        throw new Error("Local presentation manifest has an unsupported identity or Interface Scale.")
    }
    return createPresentationManifest(record.interfaceScale, record.revision, record.writerId)
}

export function tryParsePresentationManifest(text: string | null): PresentationManifest | null {
    if (text === null) return null
    try {
        return parsePresentationManifest(text)
    } catch {
        return null
    }
}

export function serializePresentationManifest(manifest: PresentationManifest): string {
    const validated = createPresentationManifest(manifest.interfaceScale, manifest.revision, manifest.writerId)
    return JSON.stringify(validated)
}
