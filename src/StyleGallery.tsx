import * as React from "react"
import ProductSceneRenderer from "./scenes/ProductSceneRenderer"
import { GALLERY_STYLES, galleryScene, galleryStyle, latestSceneVersion, type SceneDefinition, type StyleCategory, type StyleDefinition } from "./styleRegistry"
import { styleProfile, styleSettings } from "./styleProfiles"
import { InterfaceScaleControl } from "./presentation/InterfaceScaleSurface"

type Props = {
    currentStyleId: string
    onChoose: (style: StyleDefinition) => void
    onClose?: () => void
}

const CATEGORIES: Array<"All" | StyleCategory> = ["All", "Reels", "Carousels", "Orbits", "Editorial", "Objects"]

function Miniature({ scene }: { scene: SceneDefinition }) {
    const style = galleryStyle(scene.defaultStyleId)
    const version = latestSceneVersion(style.id)
    const profile = styleProfile(style.id, version)
    return (
        <div className="style-miniature" aria-hidden="true" style={{ "--mini-accent": style.accent } as React.CSSProperties}>
            <ProductSceneRenderer config={{ schemaVersion: 2, styleId: style.id, sceneVersion: version, items: [], settings: styleSettings(style.id, version) }} timeMs={profile.cycleBaseMs * 0.31} durationMs={profile.cycleBaseMs} cataloguePreview />
            <b>{String(GALLERY_STYLES.indexOf(scene) + 1).padStart(2, "0")}</b>
        </div>
    )
}

export default function StyleGallery({ currentStyleId, onChoose, onClose }: Props) {
    const [category, setCategory] = React.useState<(typeof CATEGORIES)[number]>("All")
    const [query, setQuery] = React.useState("")
    const visible = GALLERY_STYLES.filter((style) =>
        (category === "All" || style.category === category) &&
        `${style.name} ${style.description} ${style.styleIds.map((id) => galleryStyle(id).presetName).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())
    )
    const currentSceneId = galleryScene(currentStyleId).id

    return (
        <div className="style-gallery-shell">
            <header className="style-gallery-header">
                <img className="galileo-app-icon" src="./icon.png" alt="" aria-hidden="true" />
                <div>
                    <span className="eyebrow">Galileo Gallery</span>
                    <h1>Choose a Scene.</h1>
                    <p>{GALLERY_STYLES.length} curated Scenes · 29 registered presets.</p>
                </div>
                <div className="style-gallery-actions">
                    <InterfaceScaleControl />
                    {onClose ? <button type="button" className="button quiet" onClick={onClose}>Back to studio</button> : null}
                </div>
            </header>
            <div className="style-gallery-tools">
                <div className="style-category-pills">
                    {CATEGORIES.map((item) => <button type="button" className={category === item ? "is-active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)} key={item}>{item}</button>)}
                </div>
                <label className="style-search"><span>Search Scenes</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Orbit, reel, stack…" /></label>
            </div>
            <main className="style-gallery-grid">
                {visible.length === 0 ? <div className="style-gallery-empty">
                    <strong>No Scenes found.</strong>
                    <p>Try another phrase or clear the current filters.</p>
                    <button type="button" className="button quiet" onClick={() => { setCategory("All"); setQuery("") }}>Clear filters</button>
                </div> : null}
                {visible.map((scene) => {
                    const style = galleryStyle(scene.defaultStyleId)
                    const presetCount = scene.styleIds.length
                    const isCurrent = currentSceneId === scene.id
                    return <button type="button" aria-label={`${scene.name}. ${scene.description}`} aria-pressed={isCurrent} data-style-id={style.id} className={`style-card ${isCurrent ? "is-current" : ""}`} onClick={() => onChoose(style)} key={scene.id}>
                        <Miniature scene={scene} />
                        <span><strong>{scene.name}</strong><small>{presetCount > 1 ? `${presetCount} presets` : scene.category}</small></span>
                        <p>{scene.description}<em>{styleProfile(style.id, latestSceneVersion(style.id)).bestFor}</em></p>
                    </button>
                })}
            </main>
            <footer className="style-gallery-footer"><span>{visible.length} Scenes</span><p>Pick freely. Frames stay with you; merged Scenes expose their original behaviors as presets.</p></footer>
        </div>
    )
}
