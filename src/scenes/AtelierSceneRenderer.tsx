import * as React from "react"
import type { MediaItem, ReelConfig } from "../types"
import type { ParityCard, ParityDecoration, ParitySceneContract } from "./paritySupport/types.ts"
import { parityItems } from "./paritySupport/types.ts"
import "../atelierScene.css"

type Props = {
    contract: ParitySceneContract
    config: ReelConfig
    timeMs: number
    durationMs: number
    exportFrames?: Record<number, string>
    terminal?: boolean
    reducedMotion?: boolean
}

function Placeholder({ index }: { index: number }) {
    return <div className="atelier-placeholder" aria-hidden="true"><span>FRAME</span><strong>{String(index + 1).padStart(2, "0")}</strong></div>
}

function SyncedVideo({ item, timeMs, fit }: { item: MediaItem; timeMs: number; fit: "contain" | "cover" }) {
    const ref = React.useRef<HTMLVideoElement>(null)
    React.useLayoutEffect(() => {
        const video = ref.current
        if (!video) return
        const sync = () => {
            if (!Number.isFinite(video.duration) || video.duration <= 0) return
            video.pause()
            const target = Math.max(0, timeMs / 1000) % video.duration
            if (Math.abs(video.currentTime - target) > 0.02) video.currentTime = target
        }
        sync()
        video.addEventListener("loadedmetadata", sync)
        return () => {
            video.removeEventListener("loadedmetadata", sync)
            video.pause()
            video.removeAttribute("src")
            video.load()
        }
    }, [timeMs])
    return <video ref={ref} className="atelier-media product-export-media" src={item.previewUrl ?? item.url} muted playsInline preload="metadata" aria-hidden="true" style={{ objectFit: fit }} />
}

function Media({ item, index, card, frame, fit, timeMs }: { item: MediaItem; index: number; card: ParityCard; frame?: string; fit: "contain" | "cover"; timeMs: number }) {
    if (frame) return <img className="atelier-media product-export-media" src={frame} alt="" draggable={false} style={{ objectFit: fit }} />
    if (!item.url) return <Placeholder index={index} />
    if (item.type === "video") return <SyncedVideo item={item} timeMs={card.sourceTimeMs ?? timeMs} fit={fit} />
    return <img className="atelier-media product-export-media" src={item.url} alt="" aria-hidden="true" draggable={false} style={{ objectFit: fit }} />
}

function cardTransform(card: ParityCard) {
    return `translate3d(-50%,-50%,0) rotateX(${card.rotateX ?? 0}deg) rotateY(${card.rotateY ?? 0}deg) rotateZ(${card.rotation}deg) scale(${card.scale})`
}

function decorationTransform(decoration: ParityDecoration) {
    return `translate3d(-50%,-50%,0) rotateX(${decoration.rotateX ?? 0}deg) rotateY(${decoration.rotateY ?? 0}deg) rotateZ(${decoration.rotation ?? 0}deg) scale(${decoration.scale ?? 1})`
}

export default function AtelierSceneRenderer({ contract, config, timeMs, durationMs, exportFrames = {}, terminal = false, reducedMotion = false }: Props) {
    const items = parityItems(config, contract.recommendedItems).slice(0, contract.maximumItems)
    const frame = contract.evaluate({ config, timeMs, durationMs, terminal, reducedMotion })
    const settings = config.settings
    const background = settings.backgroundStyle === "transparent" && contract.alphaSupported
        ? "transparent"
        : frame.background ?? settings.ground
    return <div
        className={`atelier-scene atelier-scene-${contract.id}`}
        data-scene-id={contract.id}
        data-source-state={frame.stateHash}
        style={{ background }}
        role="img"
        aria-label={`${contract.id} gallery Scene`}
    >
        {frame.decorations?.map((decoration) => <div
            aria-hidden="true"
            className={`atelier-decoration is-${decoration.kind}`}
            key={decoration.id}
            style={{
                left: `${decoration.x}%`,
                top: `${decoration.y}%`,
                width: `${decoration.width}%`,
                height: `${decoration.height}%`,
                opacity: decoration.opacity,
                zIndex: decoration.z,
                transform: decorationTransform(decoration),
                color: decoration.color,
                background: decoration.kind === "box" ? decoration.fill : decoration.color ?? decoration.fill,
                borderColor: decoration.color,
                borderWidth: decoration.kind === "box" ? `${decoration.borderWidth ?? 1}px` : undefined,
                borderStyle: decoration.kind === "box" ? (decoration.dashed ? "dashed" : "solid") : undefined,
                borderRadius: `${decoration.radius ?? (decoration.kind === "dot" || decoration.kind === "glow" ? 999 : settings.radius)}px`,
                filter: decoration.blur ? `blur(${decoration.blur}px)` : undefined,
            }}
        >{decoration.label ? <span className="atelier-decoration-label">{decoration.label}</span> : null}</div>)}
        {frame.cards.map((card) => {
            const item = items[card.sourceIndex]
            if (!item || !card.visible) return null
            return <div
                className="atelier-card"
                data-source-id={card.id}
                key={card.id}
                style={{
                    left: `${card.x}%`,
                    top: `${card.y}%`,
                    width: `${card.width}%`,
                    height: `${card.height}%`,
                    opacity: card.opacity,
                    zIndex: card.z,
                    transform: cardTransform(card),
                    transformOrigin: card.transformOrigin,
                    filter: card.filter,
                    mixBlendMode: card.blend as React.CSSProperties["mixBlendMode"],
                    clipPath: card.clipPath,
                    borderRadius: `${settings.radius}px`,
                }}
            >
                <Media item={item} index={card.sourceIndex} card={card} frame={exportFrames[card.sourceIndex]} fit={settings.imageFit} timeMs={timeMs} />
                {item.caption ? <span className="atelier-caption" style={{ top: `calc(100% + ${settings.captionGap}px)` }}>{item.caption}</span> : null}
            </div>
        })}
    </div>
}
