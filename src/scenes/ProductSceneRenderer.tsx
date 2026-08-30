import * as React from "react"
import GalleryRenderer from "../GalleryRenderer"
import type { ReelConfig } from "../types"
import ShelfRenderer from "./ShelfRenderer"
import { isShelfV2, shelfTimelineForConfig } from "../shelfConfig"
import VitrineRenderer, { vitrineTimeline } from "./VitrineRenderer"
import { VITRINE_ID, VITRINE_VERSION } from "./vitrine"
import LightTableRenderer from "./LightTableRenderer"
import { isLightTableV2, lightTableTimelineFromConfig, lightTableTimelineMediaCount } from "../lightTableConfig"

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
    onInspectionItemChange?: (id: string | null) => void
}

export function isAuthoredVitrine(config: Pick<ReelConfig, "styleId" | "sceneVersion">) {
    return config.styleId === VITRINE_ID && config.sceneVersion === VITRINE_VERSION
}

export function productSceneDuration(config: ReelConfig, fps = 30, cataloguePreview = false) {
    if (isAuthoredVitrine(config)) return vitrineTimeline(config, fps).durationMs
    if (isShelfV2(config)) return shelfTimelineForConfig(config, fps).durationMs
    if (isLightTableV2(config)) return lightTableTimelineFromConfig(config, fps, lightTableTimelineMediaCount(config.items.length, cataloguePreview)).durationMs
    return null
}

export default function ProductSceneRenderer(props: Props) {
    if (isAuthoredVitrine(props.config)) {
        return <VitrineRenderer config={props.config} timeMs={props.timeMs} fps={props.fps} exportFrames={props.exportFrames} terminal={props.terminal} cataloguePreview={props.cataloguePreview} reducedMotion={props.reducedMotion} exportMode={props.exportMode} inspectionItemId={props.inspectionItemId} />
    }
    if (isShelfV2(props.config)) {
        return <ShelfRenderer config={props.config} timeMs={props.timeMs} fps={props.fps} exportFrames={props.exportFrames} terminal={props.terminal} cataloguePreview={props.cataloguePreview} reducedMotion={props.reducedMotion} exportMode={props.exportMode} />
    }
    if (isLightTableV2(props.config)) {
        return <LightTableRenderer config={props.config} timeMs={props.timeMs} fps={props.fps} exportFrames={props.exportFrames} terminal={props.terminal} cataloguePreview={props.cataloguePreview} reducedMotion={props.reducedMotion} exportMode={props.exportMode} inspectionItemId={props.inspectionItemId} onInspectionItemChange={props.onInspectionItemChange} />
    }
    return <GalleryRenderer config={props.config} timeMs={props.timeMs} durationMs={props.durationMs} exportFrames={props.exportFrames} terminal={props.terminal} />
}
