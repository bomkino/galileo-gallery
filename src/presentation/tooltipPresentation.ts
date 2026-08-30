export const TOOLTIP_INITIAL_DELAY_MS = 360
export const TOOLTIP_GRACE_MS = 420
export const TOOLTIP_MAX_WIDTH = 280
export const TOOLTIP_VIEWPORT_GUTTER = 16

export type TooltipInput = "pointer" | "keyboard"

export type TooltipIntent = Readonly<{
    delayMs: number
    instant: boolean
}>

export type TooltipRect = Readonly<{
    left: number
    top: number
    right: number
    bottom: number
    width: number
}>

export type TooltipPosition = Readonly<{
    left: number
    top: number
    width: number
    above: boolean
}>

function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(Math.max(value, minimum), maximum)
}

export function positionTooltip(anchor: TooltipRect, viewportWidth: number): TooltipPosition {
    const safeViewportWidth = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0
    const gutter = Math.min(TOOLTIP_VIEWPORT_GUTTER, safeViewportWidth / 2)
    const width = Math.max(0, Math.min(TOOLTIP_MAX_WIDTH, safeViewportWidth - gutter * 2))
    const maximumLeft = Math.max(gutter, safeViewportWidth - width - gutter)
    const above = anchor.top > 64
    return {
        left: clamp(anchor.left + anchor.width / 2 - width / 2, gutter, maximumLeft),
        top: above ? anchor.top - 10 : anchor.bottom + 10,
        width,
        above,
    }
}

export function createTooltipDelayGroup(now: () => number = () => Date.now()) {
    let visible = false
    let warmUntil = Number.NEGATIVE_INFINITY

    return Object.freeze({
        intent(input: TooltipInput): TooltipIntent {
            const instant = input === "keyboard" || visible || now() <= warmUntil
            return Object.freeze({ delayMs: instant ? 0 : TOOLTIP_INITIAL_DELAY_MS, instant })
        },
        shown() {
            visible = true
        },
        hidden() {
            if (!visible) return
            visible = false
            warmUntil = now() + TOOLTIP_GRACE_MS
        },
    })
}

export const sharedTooltipDelayGroup = createTooltipDelayGroup()
