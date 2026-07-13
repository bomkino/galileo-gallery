import * as React from "react"
import GalleryRenderer from "./GalleryRenderer"
import { GALLERY_STYLES, galleryScene, galleryStyle, type SceneDefinition, type StyleCategory, type StyleDefinition } from "./styleRegistry"
import { styleProfile, styleSettings } from "./styleProfiles"

type Props = {
    currentStyleId: string
    onChoose: (style: StyleDefinition) => void
    onClose?: () => void
}

const CATEGORIES: Array<"All" | StyleCategory> = ["All", "Reels", "Carousels", "Orbits", "Editorial", "Objects"]

function Miniature({ scene }: { scene: SceneDefinition }) {
    const style = galleryStyle(scene.defaultStyleId)
    const profile = styleProfile(style.id)
    return (
        <div className="style-miniature" aria-hidden="true" style={{ "--mini-accent": style.accent } as React.CSSProperties}>
            <GalleryRenderer config={{ schemaVersion: 2, styleId: style.id, items: [], settings: styleSettings(style.id) }} timeMs={profile.cycleBaseMs * 0.31} durationMs={profile.cycleBaseMs} />
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

    return (
        <div className="style-gallery-shell">
            <header className="style-gallery-header">
                <img className="galileo-app-icon" src="./icon.svg" alt="" aria-hidden="true" />
                <div>
                    <span className="eyebrow">Galileo Gallery</span>
                    <h1>Choose a motion world.</h1>
                    <p>{GALLERY_STYLES.length} motion scenes · 29 source-faithful presets.</p>
                </div>
                {onClose ? <button type="button" className="button quiet" onClick={onClose}>Back to studio</button> : null}
            </header>
            <div className="style-gallery-tools">
                <div className="style-category-pills">
                    {CATEGORIES.map((item) => <button type="button" className={category === item ? "is-active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)} key={item}>{item}</button>)}
                </div>
                <label className="style-search"><span>Search styles</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Orbit, reel, stack…" /></label>
            </div>
            <main className="style-gallery-grid">
                {visible.length === 0 ? <div className="style-gallery-empty">
                    <strong>No motion worlds found.</strong>
                    <p>Try another phrase or clear the current filters.</p>
                    <button type="button" className="button quiet" onClick={() => { setCategory("All"); setQuery("") }}>Clear filters</button>
                </div> : null}
                {visible.map((scene) => {
                    const style = galleryStyle(scene.defaultStyleId)
                    const presetCount = scene.styleIds.length
                    return <button type="button" aria-label={`${scene.name}. ${scene.description}`} data-style-id={style.id} className={`style-card ${galleryScene(currentStyleId).id === scene.id ? "is-current" : ""}`} onClick={() => onChoose(style)} key={scene.id}>
                        <Miniature scene={scene} />
                        <span><strong>{scene.name}</strong><small>{presetCount > 1 ? `${presetCount} presets` : scene.category}</small></span>
                        <p>{scene.description}<em>{styleProfile(style.id).bestFor}</em></p>
                    </button>
                })}
            </main>
            <footer className="style-gallery-footer"><span>{visible.length} scenes</span><p>Pick freely. Frames stay with you; merged scenes expose their original behaviors as presets.</p></footer>
        </div>
    )
}
