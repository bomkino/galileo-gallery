import * as React from "react"
import type { BackgroundStyle, MediaItem, MotionPreset, ReelSettings } from "./types"
import type { StyleProfile } from "./styleProfiles"

export type ExpertTab = "slides" | "frame" | "story" | "timing" | "look"
export type ExpertPreset = "original" | "fast" | "velvet" | "mixed"

type Props = {
    tab: ExpertTab
    onTab: (tab: ExpertTab) => void
    settings: ReelSettings
    items: MediaItem[]
    selectedItemId: string | null
    onSelectItem: (id: string) => void
    onSetting: <K extends keyof ReelSettings>(key: K, value: ReelSettings[K]) => void
    onItem: (id: string, patch: Partial<MediaItem>) => void
    onPreset: (preset: ExpertPreset) => void
    freezePreview: boolean
    onFreezePreview: (value: boolean) => void
    isOpeningReel: boolean
    profile: StyleProfile
}

function ControlGroup({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
    return (
        <section className="control-section expert-group">
            <div className="section-title">
                <span className="eyebrow">{eyebrow}</span>
                <h3>{title}</h3>
            </div>
            {children}
        </section>
    )
}

function Range({
    label,
    value,
    min,
    max,
    step = 1,
    suffix = "",
    onChange,
}: {
    label: string
    value: number
    min: number
    max: number
    step?: number
    suffix?: string
    onChange: (value: number) => void
}) {
    const progress = ((value - min) / Math.max(1, max - min)) * 100
    return (
        <div className="range-row expert-range">
            <span>{label}</span>
            <label className="range-value" aria-label={`${label} value`}>
                <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => {
                    if (Number.isFinite(event.target.valueAsNumber)) onChange(Math.min(max, Math.max(min, event.target.valueAsNumber)))
                }} />
                {suffix ? <small>{suffix}</small> : null}
            </label>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                style={{ "--range-progress": `${progress}%` } as React.CSSProperties}
                onChange={(event) => onChange(Number(event.target.value))}
            />
        </div>
    )
}

function Select<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string
    value: T
    options: Array<{ value: T; label: string }>
    onChange: (value: T) => void
}) {
    return (
        <label className="expert-field">
            <span>{label}</span>
            <select value={value} onChange={(event) => onChange(event.target.value as T)}>
                {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
        </label>
    )
}

function Toggle({ label, detail, checked, onChange }: { label: string; detail?: string; checked: boolean; onChange: (value: boolean) => void }) {
    return (
        <label className="toggle-row">
            <span><strong>{label}</strong>{detail ? <small>{detail}</small> : null}</span>
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
            <i aria-hidden="true" />
        </label>
    )
}

function NumberPair({
    firstLabel,
    first,
    secondLabel,
    second,
    onFirst,
    onSecond,
}: {
    firstLabel: string
    first: number
    secondLabel: string
    second: number
    onFirst: (value: number) => void
    onSecond: (value: number) => void
}) {
    return (
        <div className="number-pair">
            <label><span>{firstLabel}</span><input type="number" min="1" max="10000" step="1" value={first} onChange={(event) => onFirst(Number(event.target.value))} /></label>
            <label><span>{secondLabel}</span><input type="number" min="1" max="10000" step="1" value={second} onChange={(event) => onSecond(Number(event.target.value))} /></label>
        </div>
    )
}

function ColorControl({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (value: string) => void }) {
    return (
        <div className="color-row">
            <span>{label}</span>
            <div>
                <input type="color" value={value || fallback} onChange={(event) => onChange(event.target.value)} />
                <button type="button" className={value ? "" : "is-active"} onClick={() => onChange("")}>{value ? "Reset" : "Theme"}</button>
            </div>
        </div>
    )
}

function Presets({ onPreset }: { onPreset: (preset: ExpertPreset) => void }) {
    return (
        <div className="expert-presets">
            <span className="eyebrow">Starting points</span>
            <div>
                <button type="button" title="Restore every control to its factory value" onClick={() => onPreset("original")}>Restore Defaults</button>
                <button type="button" onClick={() => onPreset("fast")}>Fast Cut</button>
                <button type="button" onClick={() => onPreset("velvet")}>Velvet</button>
                <button type="button" onClick={() => onPreset("mixed")}>Mixed Media</button>
            </div>
        </div>
    )
}

export default function ExpertControls(props: Props) {
    const { settings, items } = props
    const selected = items.find((item) => item.id === props.selectedItemId) ?? items[0]
    const directionLabels = props.profile.axisControl
        ? settings.axis === "vertical" ? ["Up", "Down"] as const : ["Left", "Right"] as const
        : props.profile.directionLabels ?? ["Forward", "Reverse"] as const

    return (
        <div className="expert-panel">
            <Presets onPreset={props.onPreset} />
            <div className="expert-tabs" role="tablist" aria-label="Expert controls">
                {(["slides", "frame", "story", "timing", "look"] as ExpertTab[]).map((tab) => (
                    <button type="button" role="tab" aria-selected={props.tab === tab} className={props.tab === tab ? "is-active" : ""} onClick={() => props.onTab(tab)} key={tab}>{tab}</button>
                ))}
            </div>

            {props.tab === "slides" ? (
                <div className="expert-tab-body">
                    {selected ? (
                        <>
                            <ControlGroup eyebrow="Selected frame" title={selected.name}>
                                <div className="selected-media-card">
                                    {selected.type === "image" ? <img src={selected.url} alt="" /> : <video src={selected.previewUrl ?? selected.url} muted autoPlay loop playsInline preload="auto" />}
                                    <select value={selected.id} onChange={(event) => props.onSelectItem(event.target.value)}>
                                        {items.map((item, index) => <option value={item.id} key={item.id}>{String(index + 1).padStart(2, "0")} · {item.name}</option>)}
                                    </select>
                                </div>
                                <Toggle label="Spotlight" detail="Stops and grows at center." checked={selected.spotlight} onChange={(value) => props.onItem(selected.id, { spotlight: value })} />
                                <Toggle label="Skip story beat" detail="Still appears; never spotlights or becomes finale." checked={selected.muted} onChange={(value) => props.onItem(selected.id, { muted: value })} />
                                <label className="expert-field"><span>Caption · optional</span><input type="text" maxLength={120} placeholder="A quiet line beneath this frame" value={selected.caption ?? ""} onChange={(event) => props.onItem(selected.id, { caption: event.target.value })} /></label>
                            </ControlGroup>
                            <ControlGroup eyebrow="Geometry" title="Frame ratio">
                                <Select
                                    label="Aspect behavior"
                                    value={selected.aspectMode ?? "auto"}
                                    options={[
                                        { value: "auto", label: "Auto from this media" },
                                        { value: "global", label: "Use global frame ratio" },
                                        { value: "custom", label: "Custom for this frame" },
                                    ]}
                                    onChange={(value) => props.onItem(selected.id, { aspectMode: value })}
                                />
                                {(selected.aspectMode ?? "auto") === "custom" ? (
                                    <NumberPair
                                        firstLabel="Ratio W"
                                        first={selected.ratioW ?? 16}
                                        secondLabel="Ratio H"
                                        second={selected.ratioH ?? 9}
                                        onFirst={(value) => props.onItem(selected.id, { ratioW: value })}
                                        onSecond={(value) => props.onItem(selected.id, { ratioH: value })}
                                    />
                                ) : null}
                                <p className="expert-help">Detected media ratio: {selected.ratio.toFixed(3)}. Global behavior lives under Frame.</p>
                            </ControlGroup>
                        </>
                    ) : (
                        <div className="expert-empty"><strong>Add media first</strong><span>Per-slide ratio controls appear here.</span></div>
                    )}
                </div>
            ) : null}

            {props.tab === "frame" ? (
                <div className="expert-tab-body">
                    <ControlGroup eyebrow="Global geometry" title="Aspect ratio">
                        <Select label="Ratio source" value={settings.ratioMode} options={[{ value: "auto", label: "Auto from each image" }, { value: "fixed", label: "One fixed ratio" }]} onChange={(value) => props.onSetting("ratioMode", value)} />
                        {settings.ratioMode === "fixed" ? (
                            <>
                                <Select label="Fixed ratio" value={settings.fixedRatio} options={[{ value: "sixteenNine", label: "16:9 · 1920×1080" }, { value: "wide2576", label: "2.385:1 · 2576×1080" }, { value: "custom", label: "Custom" }]} onChange={(value) => props.onSetting("fixedRatio", value)} />
                                {settings.fixedRatio === "custom" ? <NumberPair firstLabel="Ratio W" first={settings.customRatioWidth} secondLabel="Ratio H" second={settings.customRatioHeight} onFirst={(value) => props.onSetting("customRatioWidth", value)} onSecond={(value) => props.onSetting("customRatioHeight", value)} /> : null}
                            </>
                        ) : null}
                        <Select label="Media fit" value={settings.imageFit} options={[{ value: "contain", label: "Contain · show everything" }, { value: "cover", label: "Cover · fill frame" }]} onChange={(value) => props.onSetting("imageFit", value)} />
                    </ControlGroup>
                    <ControlGroup eyebrow="Paper" title="Padding">
                        <Select label="Unit" value={settings.paddingUnit} options={[{ value: "px", label: "Pixels" }, { value: "percent", label: "% of image width" }]} onChange={(value) => props.onSetting("paddingUnit", value)} />
                        <Range label="Top" value={settings.paddingTop} min={0} max={settings.paddingUnit === "px" ? 400 : 30} suffix={settings.paddingUnit === "px" ? "px" : "%"} onChange={(value) => props.onSetting("paddingTop", value)} />
                        <Range label="Right" value={settings.paddingRight} min={0} max={settings.paddingUnit === "px" ? 400 : 30} suffix={settings.paddingUnit === "px" ? "px" : "%"} onChange={(value) => props.onSetting("paddingRight", value)} />
                        <Range label="Bottom" value={settings.paddingBottom} min={0} max={settings.paddingUnit === "px" ? 400 : 30} suffix={settings.paddingUnit === "px" ? "px" : "%"} onChange={(value) => props.onSetting("paddingBottom", value)} />
                        <Range label="Left" value={settings.paddingLeft} min={0} max={settings.paddingUnit === "px" ? 400 : 30} suffix={settings.paddingUnit === "px" ? "px" : "%"} onChange={(value) => props.onSetting("paddingLeft", value)} />
                        <Range label="Caption gap" value={settings.captionGap} min={0} max={80} suffix="px" onChange={(value) => props.onSetting("captionGap", value)} />
                    </ControlGroup>
                    <ControlGroup eyebrow="Video" title="Playback">
                        <Toggle label="Autoplay clips" detail="Muted playback inside moving frames." checked={settings.autoplayVideos} onChange={(value) => props.onSetting("autoplayVideos", value)} />
                        <Toggle label="Loop source clips" detail="Repeat clips shorter than the gallery film." checked={settings.loopVideos} onChange={(value) => props.onSetting("loopVideos", value)} />
                        <p className="expert-help">Gallery films are silent. Export decodes original video frame by frame at normal source speed.</p>
                    </ControlGroup>
                </div>
            ) : null}

            {props.tab === "story" ? (
                <div className="expert-tab-body">
                    <ControlGroup eyebrow="Story" title={props.profile.focusLabel}>
                        {props.profile.supportsSpotlight ? <Toggle label={`${props.profile.focusLabel} beats`} detail={`Honor marked frames with this world's contained ${props.profile.focusBehavior} gesture.`} checked={settings.spotlightsEnabled} onChange={(value) => props.onSetting("spotlightsEnabled", value)} /> : null}
                        {props.profile.supportsFinale ? <Toggle label="Final beat" detail="Optional closing gesture. Off keeps every loop visually even." checked={settings.finaleEnabled} onChange={(value) => props.onSetting("finaleEnabled", value)} /> : null}
                        {props.profile.supportsSpotlight && settings.spotlightsEnabled ? <Range label={`${props.profile.focusLabel} size`} value={settings.heroSize} min={24} max={80} suffix="%" onChange={(value) => props.onSetting("heroSize", value)} /> : null}
                        {props.profile.supportsFinale && settings.finaleEnabled ? <Range label="Final beat size" value={settings.finaleSize} min={30} max={84} suffix="%" onChange={(value) => props.onSetting("finaleSize", value)} /> : null}
                        <Range label="Center swell" value={settings.centerBump} min={0} max={30} step={0.5} suffix="%" onChange={(value) => props.onSetting("centerBump", value)} />
                    </ControlGroup>
                    <ControlGroup eyebrow="Physicality" title="Depth & drift">
                        <Range label="Tilt" value={settings.tilt} min={0} max={45} suffix="°" onChange={(value) => props.onSetting("tilt", value)} />
                        <Range label="Sway" value={settings.sway} min={0} max={200} suffix="%" onChange={(value) => props.onSetting("sway", value)} />
                        <Range label="Speed blur" value={settings.speedBlur} min={0} max={20} step={0.5} suffix="px" onChange={(value) => props.onSetting("speedBlur", value)} />
                    </ControlGroup>
                    <ControlGroup eyebrow="Focus" title="Room response">
                        <Range label="Idle dim" value={settings.idleDim} min={0} max={85} suffix="%" onChange={(value) => props.onSetting("idleDim", value)} />
                        <Range label="Idle mute" value={settings.idleMute} min={0} max={100} suffix="%" onChange={(value) => props.onSetting("idleMute", value)} />
                        <Range label="Spotlight dim" value={settings.spotlightDim} min={0} max={92} suffix="%" onChange={(value) => props.onSetting("spotlightDim", value)} />
                    </ControlGroup>
                </div>
            ) : null}

            {props.tab === "timing" ? (
                <div className="expert-tab-body">
                    <ControlGroup eyebrow="Playback" title="Start & mode">
                        <Select label="Starts" value={settings.startMode} options={[{ value: "auto", label: "On load" }, { value: "click", label: "On click" }]} onChange={(value) => props.onSetting("startMode", value)} />
                        {props.profile.axisControl ? <Select label="Axis" value={settings.axis} options={[{ value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }]} onChange={(value) => props.onSetting("axis", value)} /> : null}
                        {props.profile.directional ? <Select label="Direction" value={settings.direction} options={[{ value: "forward", label: directionLabels[0] }, { value: "reverse", label: directionLabels[1] }]} onChange={(value) => props.onSetting("direction", value)} /> : null}
                        <Select label="Mode" value={settings.playKind} options={[{ value: "once", label: "Once · hold finale" }, { value: "repeat", label: "Repeat · finite loops" }, { value: "loop", label: "Loop · forever" }]} onChange={(value) => props.onSetting("playKind", value)} />
                        {settings.playKind === "repeat" ? <Range label="Loop count" value={settings.repeatCount} min={2} max={20} suffix="×" onChange={(value) => props.onSetting("repeatCount", Math.round(value))} /> : null}
                        <Range label="Lead-in" value={settings.leadInMs} min={0} max={4000} step={50} suffix="ms" onChange={(value) => props.onSetting("leadInMs", value)} />
                        <Range label="Motion pace" value={settings.paceMs} min={60} max={8000} step={25} suffix="ms" onChange={(value) => props.onSetting("paceMs", value)} />
                    </ControlGroup>
                    <ControlGroup eyebrow="Motion" title="Catch & release">
                        <Select label="Motion feel" value={settings.motionPreset} options={(["cut", "magnetic", "velvet", "dream", "custom"] as MotionPreset[]).map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onChange={(value) => props.onSetting("motionPreset", value)} />
                        <Range label="Launch" value={settings.launchMs} min={0} max={1200} step={10} suffix="ms" onChange={(value) => props.onSetting("launchMs", value)} />
                        <Range label="Arrival" value={settings.arrivalMs} min={20} max={2000} step={10} suffix="ms" onChange={(value) => props.onSetting("arrivalMs", value)} />
                        <Range label="Spotlight grow" value={settings.growMs} min={120} max={2000} step={20} suffix="ms" onChange={(value) => props.onSetting("growMs", value)} />
                        <Range label="Spotlight exit" value={settings.exitMs} min={120} max={2000} step={20} suffix="ms" onChange={(value) => props.onSetting("exitMs", value)} />
                        <p className="expert-help">Preset supplies baseline physics. First fine-tune promotes it to Custom without losing that feel.</p>
                    </ControlGroup>
                    <ControlGroup eyebrow="Story beats" title="Holds & finale">
                        <Range label="Spotlight hold" value={settings.holdMs} min={0} max={5000} step={50} suffix="ms" onChange={(value) => props.onSetting("holdMs", value)} />
                        <Range label="Finale grow" value={settings.finaleGrowMs} min={200} max={3000} step={50} suffix="ms" onChange={(value) => props.onSetting("finaleGrowMs", value)} />
                        <Range label="Finale hold" value={settings.finaleHoldMs} min={200} max={10000} step={100} suffix="ms" onChange={(value) => props.onSetting("finaleHoldMs", value)} />
                        <Range label="Others fade" value={settings.fadeMs} min={120} max={3000} step={20} suffix="ms" onChange={(value) => props.onSetting("fadeMs", value)} />
                    </ControlGroup>
                    <ControlGroup eyebrow="Art direction" title="Canvas pose">
                        <Toggle label="Freeze preview" detail="Scrub exact timeline math." checked={props.freezePreview} onChange={props.onFreezePreview} />
                        <Range label="Canvas pose" value={settings.canvasPose} min={0} max={100} step={0.5} suffix="%" onChange={(value) => props.onSetting("canvasPose", value)} />
                    </ControlGroup>
                </div>
            ) : null}

            {props.tab === "look" ? (
                <div className="expert-tab-body">
                    <ControlGroup eyebrow="Palette" title="Theme & paper">
                        <Select label="Theme" value={settings.theme} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }, { value: "auto", label: "Follow system" }]} onChange={(value) => props.onSetting("theme", value)} />
                        <Select label="Background" value={settings.backgroundStyle} options={[{ value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }, { value: "halo", label: "Soft halo" }, { value: "paper", label: "Textured paper" }, { value: "transparent", label: "Transparent" }]} onChange={(value) => props.onSetting("backgroundStyle", value)} />
                        <ColorControl label="Ground" value={settings.ground} fallback={settings.theme === "light" ? "#f3f1ea" : "#141312"} onChange={(value) => props.onSetting("ground", value)} />
                        {!(["solid", "transparent"] as BackgroundStyle[]).includes(settings.backgroundStyle) ? <ColorControl label="Second color" value={settings.backgroundColor2} fallback="#4a2f2a" onChange={(value) => props.onSetting("backgroundColor2", value)} /> : null}
                        <ColorControl label="Paper" value={settings.paper} fallback={settings.theme === "light" ? "#fbfaf6" : "#211f1c"} onChange={(value) => props.onSetting("paper", value)} />
                        {settings.backgroundStyle === "gradient" ? <Range label="Gradient angle" value={settings.backgroundAngle} min={0} max={360} suffix="°" onChange={(value) => props.onSetting("backgroundAngle", value)} /> : null}
                        <Range label="Surface texture" value={settings.backgroundTexture} min={0} max={40} suffix="%" onChange={(value) => props.onSetting("backgroundTexture", value)} />
                    </ControlGroup>
                    <ControlGroup eyebrow="Cards" title="Size & separation">
                        <Range label="Slide height" value={settings.slideHeight} min={15} max={100} suffix="%" onChange={(value) => props.onSetting("slideHeight", value)} />
                        <Range label="Gap" value={settings.gap} min={0} max={320} suffix="px" onChange={(value) => props.onSetting("gap", value)} />
                        <Select label="Corner shape" value={settings.cornerStyle} options={[{ value: "rounded", label: "Rounded" }, { value: "squircle", label: "Apple-like squircle" }]} onChange={(value) => props.onSetting("cornerStyle", value)} />
                        {settings.cornerStyle === "squircle" ? <Range label="Smoothing" value={settings.cornerSmoothing} min={0} max={100} suffix="%" onChange={(value) => props.onSetting("cornerSmoothing", value)} /> : null}
                        <Range label="Radius" value={settings.radius} min={0} max={96} suffix="px" onChange={(value) => props.onSetting("radius", value)} />
                        <Range label="Shadow" value={settings.shadow} min={0} max={100} suffix="%" onChange={(value) => props.onSetting("shadow", value)} />
                    </ControlGroup>
                    <ControlGroup eyebrow="Atmosphere" title="Grid & cinema">
                        <Range label="Grid cell" value={settings.gridSize} min={12} max={200} step={2} suffix="px" onChange={(value) => props.onSetting("gridSize", value)} />
                        <Range label="Grid ink" value={settings.gridStrength} min={0} max={30} step={0.5} suffix="%" onChange={(value) => props.onSetting("gridStrength", value)} />
                        <Range label="Grid drift" value={settings.gridDrift} min={0} max={100} suffix="%" onChange={(value) => props.onSetting("gridDrift", value)} />
                        <Range label="Vignette" value={settings.vignette} min={0} max={45} suffix="%" onChange={(value) => props.onSetting("vignette", value)} />
                        {settings.startMode === "click" ? <Toggle label="Click hint" checked={settings.showHint} onChange={(value) => props.onSetting("showHint", value)} /> : null}
                    </ControlGroup>
                </div>
            ) : null}
        </div>
    )
}
