export type StyleMode =
    | "opening"
    | "stack"
    | "spiral"
    | "focus"
    | "strip"
    | "contact"
    | "zoetrope"
    | "river"
    | "orbit"
    | "shelf"
    | "compare"
    | "fan"
    | "anatomy"
    | "coverflow"
    | "drift"
    | "orrery"
    | "build"
    | "hang"
    | "scatter"
    | "wave"
    | "hero"
    | "lighttable"

export type StyleCategory = "Reels" | "Carousels" | "Orbits" | "Editorial" | "Objects"

export type StyleDefinition = {
    id: string
    name: string
    presetName: string
    source: string
    mode: StyleMode
    category: StyleCategory
    description: string
    accent: string
    minItems: number
    familyId: string
}

export type SceneDefinition = {
    id: string
    name: string
    category: StyleCategory
    description: string
    accent: string
    defaultStyleId: string
    styleIds: string[]
}

const variants: StyleDefinition[] = [
    { id: "opening-reel", name: "Opening Reel", presetName: "Ceremonial River", source: "OpeningReel.tsx", mode: "opening", category: "Reels", description: "A ceremonial roll with authored pauses and a restrained finale.", accent: "#ff8a68", minItems: 3, familyId: "opening" },
    { id: "swipe-stack", name: "Stack", presetName: "Swipe", source: "SwipeStack.tsx", mode: "stack", category: "Carousels", description: "A physical deck: top card leaves, every card advances, then it returns underneath.", accent: "#df9bff", minItems: 3, familyId: "stack" },
    { id: "the-stack", name: "Stack", presetName: "Calm", source: "TheStack.tsx", mode: "stack", category: "Objects", description: "A physical deck: top card leaves, every card advances, then it returns underneath.", accent: "#9b8cff", minItems: 3, familyId: "stack" },
    { id: "hero-deck-object", name: "Stack", presetName: "Hero", source: "HeroDeckObject.tsx", mode: "hero", category: "Objects", description: "A physical deck: top card leaves, every card advances, then it returns underneath.", accent: "#ff8d74", minItems: 4, familyId: "stack" },
    { id: "spiral-image-vortex", name: "Spiral Vortex", presetName: "Vortex", source: "SpiralImageVortex.tsx", mode: "spiral", category: "Orbits", description: "Frames travel one continuous helix, passing naturally in front and behind.", accent: "#7ea7ff", minItems: 4, familyId: "spiral" },
    { id: "vitrine", name: "Vitrine", presetName: "Gallery Light", source: "Vitrine.tsx", mode: "focus", category: "Objects", description: "One precious frame at a time, cross-dissolved beneath a quiet light.", accent: "#f4c67a", minItems: 2, familyId: "vitrine" },
    { id: "filmstrip-river", name: "Ribbon", presetName: "Two-lane Filmstrip", source: "FilmstripRiver.tsx", mode: "strip", category: "Reels", description: "An endless material ribbon with invisible recycling beyond the frame.", accent: "#67d4c0", minItems: 4, familyId: "ribbon" },
    { id: "wave-ticker", name: "Ribbon", presetName: "Wave", source: "WaveTicker.tsx", mode: "wave", category: "Reels", description: "An endless material ribbon with invisible recycling beyond the frame.", accent: "#67d2d0", minItems: 5, familyId: "ribbon" },
    { id: "deck-contact-strip", name: "Contact Table", presetName: "Focus Strip", source: "DeckContactStrip.tsx", mode: "contact", category: "Editorial", description: "A working table for scanning frames: strip, grid, or illuminated review surface.", accent: "#f3a45f", minItems: 4, familyId: "contact-table" },
    { id: "contact-sheet", name: "Contact Table", presetName: "Contact Sheet", source: "ContactSheet.tsx", mode: "contact", category: "Editorial", description: "A working table for scanning frames: strip, grid, or illuminated review surface.", accent: "#e7ac62", minItems: 6, familyId: "contact-table" },
    { id: "light-table", name: "Contact Table", presetName: "Light Table", source: "LightTable.tsx", mode: "lighttable", category: "Editorial", description: "A working table for scanning frames: strip, grid, or illuminated review surface.", accent: "#ffd67c", minItems: 6, familyId: "contact-table" },
    { id: "deck-river", name: "Deck River", presetName: "Continuous", source: "DeckRiver.tsx", mode: "river", category: "Reels", description: "A depth corridor where frames approach, pass, and recede without teleporting.", accent: "#6e9fff", minItems: 4, familyId: "deck-river" },
    { id: "deck-river-loader", name: "Deck River", presetName: "Chapter Reveal", source: "DeckRiverLoader.tsx", mode: "river", category: "Reels", description: "A depth corridor where frames approach, pass, and recede without teleporting.", accent: "#a6c56e", minItems: 4, familyId: "deck-river" },
    { id: "orbit-ring", name: "Orbit", presetName: "Calm Ring", source: "OrbitRing.tsx", mode: "orbit", category: "Orbits", description: "Slides orbit with coherent depth, scale, light, and occlusion.", accent: "#6ccfee", minItems: 5, familyId: "orbit" },
    { id: "proximity-orbit", name: "Orbit", presetName: "Proximity", source: "ProximityOrbit.tsx", mode: "orbit", category: "Orbits", description: "Slides orbit with coherent depth, scale, light, and occlusion.", accent: "#79d6ba", minItems: 4, familyId: "orbit" },
    { id: "spin-image-orbit", name: "Orbit", presetName: "Wide Ellipse", source: "SpinImageOrbit.tsx", mode: "orbit", category: "Orbits", description: "Slides orbit with coherent depth, scale, light, and occlusion.", accent: "#75bfff", minItems: 5, familyId: "orbit" },
    { id: "zoetrope", name: "Orbit", presetName: "Zoetrope", source: "Zoetrope.tsx", mode: "zoetrope", category: "Reels", description: "Slides orbit with coherent depth, scale, light, and occlusion.", accent: "#ffcb66", minItems: 6, familyId: "orbit" },
    { id: "the-shelf", name: "Shelf", presetName: "Collected Editions", source: "TheShelf.tsx", mode: "shelf", category: "Objects", description: "Frames glide along a shelf with a stable baseline and measured perspective.", accent: "#d5a46f", minItems: 4, familyId: "shelf" },
    { id: "before-after-slider", name: "Before / After", presetName: "Auto Sweep", source: "BeforeAfterSlider.tsx", mode: "compare", category: "Editorial", description: "A reversible comparison sweep with gentle turnarounds and no hard reset.", accent: "#ff826c", minItems: 2, familyId: "compare" },
    { id: "slide-fan", name: "Fan", presetName: "Open Fan", source: "SlideFan.tsx", mode: "fan", category: "Objects", description: "A card fan that opens, selects, and settles around a shared hinge.", accent: "#e996ff", minItems: 4, familyId: "fan" },
    { id: "dealers-fan", name: "Fan", presetName: "Dealer's Pick", source: "DealersFan.tsx", mode: "fan", category: "Objects", description: "A card fan that opens, selects, and settles around a shared hinge.", accent: "#d8a1ff", minItems: 5, familyId: "fan" },
    { id: "slide-anatomy-object", name: "Assembly", presetName: "Slide Anatomy", source: "SlideAnatomyObject.tsx", mode: "anatomy", category: "Editorial", description: "A frame assembles, holds, and returns along the same physical path.", accent: "#ee8f70", minItems: 1, familyId: "assembly" },
    { id: "the-build", name: "Assembly", presetName: "The Build", source: "TheBuild.tsx", mode: "build", category: "Editorial", description: "A frame assembles, holds, and returns along the same physical path.", accent: "#ff775e", minItems: 1, familyId: "assembly" },
    { id: "coverflow-gallery", name: "Coverflow", presetName: "Classic", source: "CoverflowGallery.tsx", mode: "coverflow", category: "Carousels", description: "A restrained coverflow with one front plane and clean depth falloff.", accent: "#829cff", minItems: 4, familyId: "coverflow" },
    { id: "drift-deck", name: "Scatter", presetName: "Quiet Drift", source: "DriftDeck.tsx", mode: "drift", category: "Objects", description: "Prints share one table, breathing without collisions or random jumps.", accent: "#d891b8", minItems: 4, familyId: "scatter" },
    { id: "image-scatter-gallery", name: "Scatter", presetName: "Lively Prints", source: "ImageScatterGallery.tsx", mode: "scatter", category: "Carousels", description: "Prints share one table, breathing without collisions or random jumps.", accent: "#f18ab3", minItems: 5, familyId: "scatter" },
    { id: "the-orrery", name: "Orrery", presetName: "Solar System", source: "TheOrrery.tsx", mode: "orrery", category: "Orbits", description: "Nested orbital planes circle a stable primary slide.", accent: "#f1bd68", minItems: 5, familyId: "orrery" },
    { id: "the-hang", name: "The Hang", presetName: "Suspended Gallery", source: "TheHang.tsx", mode: "hang", category: "Objects", description: "Suspended frames swing from fixed pivots with a slow shared breath.", accent: "#76c6a7", minItems: 4, familyId: "hang" },
    { id: "cms-slideshow", name: "CMS Slideshow", presetName: "Autoplay Carousel", source: "CmsSlideshow.tsx", mode: "strip", category: "Carousels", description: "Source-faithful horizontal or vertical autoplay with a composed focus well.", accent: "#f3a56e", minItems: 4, familyId: "cms" },
]

export const ALL_STYLE_VARIANTS = variants

export const GALLERY_STYLES: SceneDefinition[] = [
    ["opening", "Opening Reel", "Reels", "Ceremonial river", "#ff8a68", "opening-reel", ["opening-reel"]],
    ["stack", "Stack", "Carousels", "Swipe, calm, and hero deck physics", "#df9bff", "swipe-stack", ["swipe-stack", "the-stack", "hero-deck-object"]],
    ["orbit", "Orbit", "Orbits", "Ring, proximity, ellipse, and zoetrope", "#6ccfee", "orbit-ring", ["orbit-ring", "proximity-orbit", "spin-image-orbit", "zoetrope"]],
    ["spiral", "Spiral Vortex", "Orbits", "A continuous helical flight", "#7ea7ff", "spiral-image-vortex", ["spiral-image-vortex"]],
    ["vitrine", "Vitrine", "Objects", "One precious frame under light", "#f4c67a", "vitrine", ["vitrine"]],
    ["ribbon", "Ribbon", "Reels", "Two-lane filmstrip or wave", "#67d4c0", "filmstrip-river", ["filmstrip-river", "wave-ticker"]],
    ["contact-table", "Contact Table", "Editorial", "Strip, sheet, or illuminated table", "#f3a45f", "deck-contact-strip", ["deck-contact-strip", "contact-sheet", "light-table"]],
    ["deck-river", "Deck River", "Reels", "Continuous corridor or chapter reveal", "#6e9fff", "deck-river", ["deck-river", "deck-river-loader"]],
    ["shelf", "Shelf", "Objects", "Collected frames on one baseline", "#d5a46f", "the-shelf", ["the-shelf"]],
    ["compare", "Before / After", "Editorial", "A reversible comparison sweep", "#ff826c", "before-after-slider", ["before-after-slider"]],
    ["fan", "Fan", "Objects", "Open fan or dealer's pick", "#e996ff", "slide-fan", ["slide-fan", "dealers-fan"]],
    ["assembly", "Assembly", "Editorial", "Slide anatomy or authored build", "#ee8f70", "slide-anatomy-object", ["slide-anatomy-object", "the-build"]],
    ["coverflow", "Coverflow", "Carousels", "Classic restrained depth browsing", "#829cff", "coverflow-gallery", ["coverflow-gallery"]],
    ["scatter", "Scatter", "Objects", "Quiet drift or lively prints", "#d891b8", "drift-deck", ["drift-deck", "image-scatter-gallery"]],
    ["orrery", "Orrery", "Orbits", "A nested slide solar system", "#f1bd68", "the-orrery", ["the-orrery"]],
    ["hang", "The Hang", "Objects", "A suspended spatial gallery", "#76c6a7", "the-hang", ["the-hang"]],
    ["cms", "CMS Slideshow", "Carousels", "Horizontal or vertical autoplay", "#f3a56e", "cms-slideshow", ["cms-slideshow"]],
].map(([id, name, category, description, accent, defaultStyleId, styleIds]) => ({ id, name, category, description, accent, defaultStyleId, styleIds } as SceneDefinition))

export function galleryStyle(id: string | undefined): StyleDefinition {
    return ALL_STYLE_VARIANTS.find((style) => style.id === id) ?? ALL_STYLE_VARIANTS[0]
}

export function galleryScene(styleId: string | undefined): SceneDefinition {
    const style = galleryStyle(styleId)
    return GALLERY_STYLES.find((scene) => scene.id === style.familyId) ?? GALLERY_STYLES[0]
}

export function sceneVariants(styleId: string | undefined): StyleDefinition[] {
    const scene = galleryScene(styleId)
    return scene.styleIds.map((id) => galleryStyle(id))
}
