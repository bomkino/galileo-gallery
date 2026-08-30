import * as React from "react"
import GalleryRenderer from "../GalleryRenderer"
import type { ReelConfig } from "../types"
import VitrineRenderer, { vitrineTimeline } from "./VitrineRenderer"
import { VITRINE_ID, VITRINE_VERSION } from "./vitrine"

type Props = {
    config: ReelConfig
    timeMs: number
    durationMs: number
    fps?: number
    exportFrames?: Record<number, string>
    terminal?: boolean
    cataloguePreview?: boolean
    reducedMotion?: boolean
    exportMode?: boolean
    inspectionItemId?: string | null
}

export function isAuthoredVitrine(config: Pick<ReelConfig, "styleId" | "sceneVersion">) {
    return config.styleId === VITRINE_ID && config.sceneVersion === VITRINE_VERSION
}

export function productSceneDuration(config: ReelConfig, fps = 30) {
    return isAuthoredVitrine(config) ? vitrineTimeline(config, fps).durationMs : null
}

export default function ProductSceneRenderer(props: Props) {
    if (isAuthoredVitrine(props.config)) {
        return <VitrineRenderer config={props.config} timeMs={props.timeMs} fps={props.fps} exportFrames={props.exportFrames} terminal={props.terminal} cataloguePreview={props.cataloguePreview} reducedMotion={props.reducedMotion} exportMode={props.exportMode} inspectionItemId={props.inspectionItemId} />
    }
    return <GalleryRenderer config={props.config} timeMs={props.timeMs} durationMs={props.durationMs} exportFrames={props.exportFrames} terminal={props.terminal} />
}
