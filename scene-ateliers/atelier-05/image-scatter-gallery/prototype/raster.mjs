import { createSurface, drawArtwork, line, circle, rotatedRect } from "./raster-core.mjs"
export function renderState(state, { width, height, debug = false }) {
  const surface = createSurface(width, height, true, [0,0,0,0])
  if (debug) {
    // Ellipse approximation and route ownership lines.
    let previous = null
    for (let step = 0; step <= 96; step += 1) {
      const angle = Math.PI * 2 * step / 96
      const point = [state.negativeSpace.x + Math.cos(angle) * state.negativeSpace.rx, state.negativeSpace.y + Math.sin(angle) * state.negativeSpace.ry]
      if (previous) line(surface, previous[0], previous[1], point[0], point[1], Math.max(1, Math.min(width,height)/540), [246,226,91,190])
      previous = point
    }
    for (const card of state.cards) {
      line(surface, card.startX, card.startY, card.fieldX, card.fieldY, Math.max(1, Math.min(width,height)/720), [117,198,255,150])
      circle(surface, card.fieldX, card.fieldY, Math.max(2, Math.min(width,height)*.006), [117,198,255,210])
    }
  }
  for (const card of state.cards) if (card.visible) {
    const rendered = { ...card, y: card.y - card.lift * .14 }
    drawArtwork(surface, rendered)
    if (card.focusPlane) rotatedRect(surface, rendered.x, rendered.y, rendered.width*1.04, rendered.height*1.04, rendered.rotation, [0,0,0,0], [247,244,235,255], Math.max(2,Math.min(rendered.width,rendered.height)*.012))
  }
  return surface
}
export function renderSilhouette(state, { width, height }) {
  const surface = createSurface(width,height,false,[245,243,237,255])
  for (const card of state.cards) if (card.visible) rotatedRect(surface,card.x,card.y-card.lift*.14,card.width,card.height,card.rotation,[25,25,23,255])
  return surface
}
