export const LIGHT_TABLE_UNDERLIGHT_LAYER_Z = 0

export type LightTableKeyIntent =
    | { kind: "focus"; index: number }
    | { kind: "inspect"; index: number }
    | { kind: "clear-inspection" }

type PropagationEvent = {
    stopPropagation: () => void
}

type KeyboardActivationEvent = PropagationEvent & {
    preventDefault: () => void
}

export function lightTableArtworkLayerZ(evaluatorZ: number) {
    if (!Number.isFinite(evaluatorZ)) throw new Error("Light Table artwork layer is invalid.")
    return Math.max(LIGHT_TABLE_UNDERLIGHT_LAYER_Z + 1, evaluatorZ + 1)
}

export function lightTableKeyIntent(key: string, index: number, itemCount: number): LightTableKeyIntent | null {
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(itemCount) || itemCount < 1 || index < 0 || index >= itemCount) return null
    if (key === "ArrowRight" || key === "ArrowDown") return { kind: "focus", index: (index + 1) % itemCount }
    if (key === "ArrowLeft" || key === "ArrowUp") return { kind: "focus", index: (index - 1 + itemCount) % itemCount }
    if (key === "Home") return { kind: "focus", index: 0 }
    if (key === "End") return { kind: "focus", index: itemCount - 1 }
    if (key === "Enter" || key === " ") return { kind: "inspect", index }
    if (key === "Escape") return { kind: "clear-inspection" }
    return null
}

export function containLightTableKeyboardActivation(event: KeyboardActivationEvent, intent: LightTableKeyIntent | null) {
    if (!intent) return false
    event.preventDefault()
    event.stopPropagation()
    return true
}

export function activateLightTablePlane(event: PropagationEvent, index: number, inspect: (index: number) => void) {
    event.stopPropagation()
    inspect(index)
}

export function nextLightTableInspectionId(currentId: string | null, itemId: string) {
    if (!itemId) throw new Error("Light Table inspection identity is invalid.")
    return currentId === itemId ? null : itemId
}
