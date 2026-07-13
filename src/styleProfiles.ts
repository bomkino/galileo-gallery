import { DEFAULT_SETTINGS } from "./defaults"
import type { ReelSettings } from "./types"

export type FocusBehavior = "center" | "lift" | "depth" | "glow" | "pause" | "reveal" | "none"

export type StyleProfile = {
    id: string
    recommendedItems: number
    renderSlots?: number
    cycleBaseMs: number
    loopCount: number
    directional: boolean
    axisControl?: boolean
    directionLabels?: readonly [string, string]
    focusBehavior: FocusBehavior
    supportsSpotlight: boolean
    supportsFinale: boolean
    focusLabel: string
    bestFor: string
    transparentReady: boolean
    settings: Partial<ReelSettings>
}

const common: Partial<ReelSettings> = {
    playKind: "repeat",
    repeatCount: 5,
    spotlightsEnabled: false,
    finaleEnabled: false,
    cornerStyle: "squircle",
    cornerSmoothing: 60,
}

function profile(value: Omit<StyleProfile, "settings"> & { settings?: Partial<ReelSettings> }): StyleProfile {
    const orbit = ["orbit-ring", "proximity-orbit", "spin-image-orbit", "zoetrope", "the-orrery"].includes(value.id)
    const labels = value.directionLabels ?? (orbit ? ["Counterclockwise", "Clockwise"] : ["Forward", "Reverse"])
    return { ...value, directionLabels: labels, axisControl: value.id === "cms-slideshow", settings: { ...common, repeatCount: value.loopCount, ...value.settings } }
}

const profiles = [
    profile({ id: "opening-reel", recommendedItems: 14, cycleBaseMs: 11600, loopCount: 5, directional: true, focusBehavior: "center", supportsSpotlight: true, supportsFinale: true, focusLabel: "Center stage", bestFor: "Ceremonial deck reveals and chapter openings", transparentReady: true, settings: { slideHeight: 44, gap: 30, radius: 3, paceMs: 230, heroSize: 70, finaleSize: 84, direction: "forward", canvasPose: 62 } }),
    profile({ id: "swipe-stack", recommendedItems: 4, cycleBaseMs: 7600, loopCount: 5, directional: true, focusBehavior: "lift", supportsSpotlight: true, supportsFinale: true, focusLabel: "Top card", bestFor: "Tactile case-study beats", transparentReady: true, settings: { slideHeight: 42, gap: 42, radius: 8, paceMs: 540, tilt: 28, heroSize: 52, finaleSize: 58 } }),
    profile({ id: "spiral-image-vortex", recommendedItems: 6, cycleBaseMs: 9000, loopCount: 5, directional: true, focusBehavior: "depth", supportsSpotlight: true, supportsFinale: true, focusLabel: "Near pass", bestFor: "Energetic transitions and graphic swarms", transparentReady: true, settings: { slideHeight: 24, gap: 6, radius: 8, paceMs: 500, heroSize: 36 } }),
    profile({ id: "vitrine", recommendedItems: 3, cycleBaseMs: 18000, loopCount: 3, directional: true, focusBehavior: "glow", supportsSpotlight: true, supportsFinale: true, focusLabel: "Gallery light", bestFor: "One precious slide at a time", transparentReady: true, settings: { slideHeight: 60, gap: 24, radius: 18, paceMs: 6000, sway: 12, heroSize: 66, finaleSize: 72 } }),
    profile({ id: "filmstrip-river", recommendedItems: 6, cycleBaseMs: 8000, loopCount: 5, directional: true, focusBehavior: "lift", supportsSpotlight: true, supportsFinale: true, focusLabel: "Frame leap", bestFor: "Cinematic contact reels", transparentReady: true, settings: { slideHeight: 34, gap: 28, radius: 6, paceMs: 430, heroSize: 48 } }),
    profile({ id: "deck-contact-strip", recommendedItems: 6, cycleBaseMs: 10000, loopCount: 5, directional: true, focusBehavior: "glow", supportsSpotlight: true, supportsFinale: true, focusLabel: "Focus well", bestFor: "Captioned editorial sequences", transparentReady: true, settings: { slideHeight: 30, gap: 18, radius: 5, paceMs: 620, captionGap: 12, heroSize: 44, finaleSize: 52 } }),
    profile({ id: "the-stack", recommendedItems: 5, cycleBaseMs: 14000, loopCount: 5, directional: true, focusBehavior: "lift", supportsSpotlight: true, supportsFinale: true, focusLabel: "Top card", bestFor: "Calm deck showcases", transparentReady: true, settings: { slideHeight: 50, gap: 16, radius: 8, paceMs: 2800, heroSize: 56, finaleSize: 62 } }),
    profile({ id: "zoetrope", recommendedItems: 7, cycleBaseMs: 7000, loopCount: 5, directional: true, focusBehavior: "depth", supportsSpotlight: true, supportsFinale: true, focusLabel: "Front frame", bestFor: "Fast cylindrical reels", transparentReady: true, settings: { slideHeight: 34, gap: 18, radius: 10, paceMs: 430, tilt: 4, idleDim: 65, heroSize: 44 } }),
    profile({ id: "deck-river", recommendedItems: 6, cycleBaseMs: 10500, loopCount: 5, directional: true, focusBehavior: "depth", supportsSpotlight: true, supportsFinale: true, focusLabel: "Near field", bestFor: "Immersive deck fly-throughs", transparentReady: true, settings: { slideHeight: 38, gap: 30, radius: 8, paceMs: 850, sway: 100, heroSize: 46, finaleSize: 52 } }),
    profile({ id: "proximity-orbit", recommendedItems: 7, cycleBaseMs: 9000, loopCount: 5, directional: true, focusBehavior: "depth", supportsSpotlight: true, supportsFinale: true, focusLabel: "Proximity swell", bestFor: "Circular slide constellations", transparentReady: true, settings: { slideHeight: 30, gap: 34, radius: 10, paceMs: 500, direction: "reverse", heroSize: 44 } }),
    profile({ id: "the-shelf", recommendedItems: 6, cycleBaseMs: 8500, loopCount: 5, directional: true, directionLabels: ["Left", "Right"], focusBehavior: "lift", supportsSpotlight: true, supportsFinale: true, focusLabel: "Shelf lift", bestFor: "Collected work and editions", transparentReady: true, settings: { slideHeight: 38, gap: 36, radius: 8, paceMs: 470, heroSize: 48 } }),
    profile({ id: "before-after-slider", recommendedItems: 2, cycleBaseMs: 5200, loopCount: 5, directional: false, focusBehavior: "reveal", supportsSpotlight: false, supportsFinale: true, focusLabel: "Reveal", bestFor: "Before-and-after comparisons", transparentReady: false, settings: { slideHeight: 68, gap: 0, radius: 18, paceMs: 520, theme: "light", heroSize: 68 } }),
    profile({ id: "slide-fan", recommendedItems: 5, cycleBaseMs: 7800, loopCount: 5, directional: false, focusBehavior: "lift", supportsSpotlight: true, supportsFinale: true, focusLabel: "Featured card", bestFor: "Generous deck overviews", transparentReady: true, settings: { slideHeight: 42, gap: 42, radius: 10, paceMs: 620, heroSize: 48, finaleSize: 54 } }),
    profile({ id: "orbit-ring", recommendedItems: 6, cycleBaseMs: 11000, loopCount: 5, directional: true, focusBehavior: "depth", supportsSpotlight: true, supportsFinale: true, focusLabel: "Front orbit", bestFor: "Calm spatial galleries", transparentReady: true, settings: { slideHeight: 34, gap: 24, radius: 10, paceMs: 650, heroSize: 46 } }),
    profile({ id: "deck-river-loader", recommendedItems: 6, cycleBaseMs: 9200, loopCount: 3, directional: true, focusBehavior: "reveal", supportsSpotlight: true, supportsFinale: true, focusLabel: "Reveal hold", bestFor: "Loader-like chapter transitions", transparentReady: true, settings: { slideHeight: 36, gap: 26, radius: 8, paceMs: 470, holdMs: 420, finaleGrowMs: 520, finaleSize: 48 } }),
    profile({ id: "slide-anatomy-object", recommendedItems: 1, cycleBaseMs: 7000, loopCount: 5, directional: false, focusBehavior: "reveal", supportsSpotlight: true, supportsFinale: true, focusLabel: "Assembly", bestFor: "Explaining one slide's structure", transparentReady: true, settings: { slideHeight: 64, gap: 18, radius: 10, paceMs: 700, finaleSize: 68 } }),
    profile({ id: "coverflow-gallery", recommendedItems: 5, cycleBaseMs: 14000, loopCount: 5, directional: true, directionLabels: ["Right", "Left"], focusBehavior: "depth", supportsSpotlight: true, supportsFinale: true, focusLabel: "Front cover", bestFor: "Classic portfolio browsing", transparentReady: true, settings: { slideHeight: 28, gap: 18, radius: 8, paceMs: 2800, heroSize: 40, finaleSize: 46 } }),
    profile({ id: "drift-deck", recommendedItems: 4, cycleBaseMs: 9000, loopCount: 5, directional: false, focusBehavior: "lift", supportsSpotlight: true, supportsFinale: true, focusLabel: "Quiet focus", bestFor: "Soft atmospheric interludes", transparentReady: true, settings: { slideHeight: 40, gap: 22, radius: 12, paceMs: 1125, sway: 7, heroSize: 48, finaleSize: 54 } }),
    profile({ id: "the-orrery", recommendedItems: 9, cycleBaseMs: 12000, loopCount: 5, directional: true, focusBehavior: "depth", supportsSpotlight: true, supportsFinale: true, focusLabel: "Primary body", bestFor: "Dense systems and ecosystems", transparentReady: true, settings: { slideHeight: 32, gap: 24, radius: 8, paceMs: 620, heroSize: 38, finaleSize: 44 } }),
    profile({ id: "the-build", recommendedItems: 1, cycleBaseMs: 11600, loopCount: 3, directional: false, focusBehavior: "reveal", supportsSpotlight: true, supportsFinale: true, focusLabel: "Final build", bestFor: "Authored poster construction", transparentReady: true, settings: { slideHeight: 66, gap: 18, radius: 12, paceMs: 900, finaleHoldMs: 2600, finaleSize: 72 } }),
    profile({ id: "the-hang", recommendedItems: 8, cycleBaseMs: 12500, loopCount: 5, directional: true, focusBehavior: "lift", supportsSpotlight: true, supportsFinale: true, focusLabel: "Gallery piece", bestFor: "Playful suspended collections", transparentReady: true, settings: { slideHeight: 24, gap: 28, radius: 8, paceMs: 850, canvasPose: 55, heroSize: 34, finaleSize: 40 } }),
    profile({ id: "contact-sheet", recommendedItems: 8, cycleBaseMs: 11000, loopCount: 5, directional: true, focusBehavior: "glow", supportsSpotlight: true, supportsFinale: true, focusLabel: "Selection", bestFor: "Many-slide editorial surveys", transparentReady: false, settings: { slideHeight: 28, gap: 28, radius: 4, paceMs: 620, heroSize: 34, finaleSize: 38 } }),
    profile({ id: "image-scatter-gallery", recommendedItems: 7, cycleBaseMs: 9000, loopCount: 5, directional: true, focusBehavior: "lift", supportsSpotlight: true, supportsFinale: true, focusLabel: "Print lift", bestFor: "Lively image mosaics", transparentReady: true, settings: { slideHeight: 22, gap: 20, radius: 8, paceMs: 550, heroSize: 30 } }),
    profile({ id: "spin-image-orbit", recommendedItems: 6, cycleBaseMs: 9000, loopCount: 5, directional: true, focusBehavior: "depth", supportsSpotlight: true, supportsFinale: true, focusLabel: "Near curve", bestFor: "Wide elliptical motion", transparentReady: true, settings: { slideHeight: 28, gap: 24, radius: 10, paceMs: 500, direction: "reverse", heroSize: 40 } }),
    profile({ id: "dealers-fan", recommendedItems: 5, cycleBaseMs: 9500, loopCount: 5, directional: true, focusBehavior: "lift", supportsSpotlight: true, supportsFinale: true, focusLabel: "Dealer's pick", bestFor: "Confident show-and-tell moments", transparentReady: true, settings: { slideHeight: 44, gap: 18, radius: 10, paceMs: 700, heroSize: 50, finaleSize: 56 } }),
    profile({ id: "wave-ticker", recommendedItems: 5, cycleBaseMs: 8000, loopCount: 5, directional: true, directionLabels: ["Right", "Left"], focusBehavior: "lift", supportsSpotlight: true, supportsFinale: true, focusLabel: "Wave crest", bestFor: "Energetic website and social ribbons", transparentReady: true, settings: { slideHeight: 28, gap: 32, radius: 8, paceMs: 500, direction: "forward", heroSize: 36 } }),
    profile({ id: "cms-slideshow", recommendedItems: 5, cycleBaseMs: 12000, loopCount: 5, directional: true, focusBehavior: "depth", supportsSpotlight: true, supportsFinale: true, focusLabel: "Carousel focus", bestFor: "Steady case-study carousels", transparentReady: true, settings: { axis: "horizontal", slideHeight: 36, gap: 22, radius: 18, paceMs: 720, heroSize: 44, finaleSize: 50 } }),
    profile({ id: "hero-deck-object", recommendedItems: 5, cycleBaseMs: 19000, loopCount: 5, directional: true, focusBehavior: "lift", supportsSpotlight: true, supportsFinale: true, focusLabel: "Hero slide", bestFor: "Premium website hero objects", transparentReady: true, settings: { slideHeight: 46, gap: 18, radius: 22, paceMs: 3800, heroSize: 52, finaleSize: 58 } }),
    profile({ id: "light-table", recommendedItems: 5, cycleBaseMs: 10000, loopCount: 5, directional: false, focusBehavior: "glow", supportsSpotlight: true, supportsFinale: true, focusLabel: "Loupe", bestFor: "Review-room and process stories", transparentReady: false, settings: { slideHeight: 32, gap: 20, radius: 6, paceMs: 1000, sway: 5, heroSize: 40, finaleSize: 46, theme: "light" } }),
]

export const STYLE_PROFILES: Record<string, StyleProfile> = Object.fromEntries(profiles.map((item) => [item.id, item]))

export function styleProfile(id: string | undefined): StyleProfile {
    return STYLE_PROFILES[id ?? ""] ?? STYLE_PROFILES["opening-reel"]
}

export function styleSettings(id: string | undefined): ReelSettings {
    return { ...DEFAULT_SETTINGS, ...styleProfile(id).settings }
}

export function styleCycleDuration(id: string, itemCount: number, settings: ReelSettings): number {
    const value = styleProfile(id)
    const countScale = Math.max(0.65, itemCount / Math.max(1, value.recommendedItems))
    const defaultPace = Math.max(1, Number(value.settings.paceMs ?? DEFAULT_SETTINGS.paceMs))
    const paceScale = Math.max(0.25, Math.min(4, settings.paceMs / defaultPace))
    return Math.round(value.cycleBaseMs * countScale * paceScale)
}
