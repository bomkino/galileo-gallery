import type { MediaItem, ReelConfig, SceneParameterValue } from "../../types"

export type ParityControl = {
    id: string
    parameter: string
    label: string
    type: "range" | "choice"
    default: number | string | boolean
    min?: number
    max?: number
    step?: number
    options?: readonly (number | string | boolean)[]
    unit?: string
}

export type ParityCard = {
    id: string
    sourceIndex: number
    x: number
    y: number
    width: number
    height: number
    scale: number
    rotation: number
    rotateX?: number
    rotateY?: number
    z: number
    opacity: number
    visible: boolean
    filter: string
    blend: string
    clipPath?: string
    transformOrigin?: string
    sourceTimeMs?: number
}

export type ParityDecoration = {
    id: string
    kind: "box" | "line" | "dot" | "glow"
    x: number
    y: number
    width: number
    height: number
    rotation?: number
    rotateX?: number
    rotateY?: number
    scale?: number
    z: number
    opacity: number
    color?: string
    fill?: string
    borderWidth?: number
    dashed?: boolean
    radius?: number
    blur?: number
    label?: string
}

export type ParityFrame = {
    sceneId: string
    durationMs: number
    phase: number
    terminal: boolean
    cards: ParityCard[]
    decorations?: ParityDecoration[]
    background?: string
    opaque?: boolean
    stateHash?: string
}

export type ParityEvaluationInput = {
    config: ReelConfig
    timeMs: number
    durationMs: number
    reducedMotion?: boolean
    terminal?: boolean
}

export type ParitySceneContract = {
    id: string
    atelier: "A01" | "A02" | "A03" | "A04" | "A05" | "A06"
    sourcePath: string
    sourceSha256: string
    recommendedItems: number
    maximumItems: number
    looping: boolean
    alphaSupported: boolean
    defaultParameters: Readonly<Record<string, number | string | boolean>>
    controls: readonly ParityControl[]
    durationMs(config: ReelConfig): number
    evaluate(input: ParityEvaluationInput): ParityFrame
}

export function parityItems(config: ReelConfig, recommendedItems: number): MediaItem[] {
    if (config.items.length) return config.items
    return Array.from({ length: recommendedItems }, (_, index) => ({
        id: `parity-placeholder-${index + 1}`,
        name: `Frame ${index + 1}`,
        type: "image" as const,
        url: "",
        ratio: [16 / 9, 4 / 5, 1, 3 / 4, 16 / 10][index % 5],
        caption: "",
        spotlight: false,
        muted: false,
    }))
}

export function authoredParameters(config: ReelConfig, defaults: Readonly<Record<string, number | string | boolean>>) {
    const candidate: Record<string, SceneParameterValue> | undefined = config.sceneParameters
    return { ...defaults, ...(candidate ?? {}) }
}

export function stableFrameHash(value: unknown) {
    const text = JSON.stringify(value)
    let hash = 0x811c9dc5
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(16).padStart(8, "0")
}
