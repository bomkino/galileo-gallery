import { createSurface, drawArtwork, line, circle, rotatedRect } from "./raster-core.mjs"

export function renderState(state, { width, height, debug = false }) {
  const surface = createSurface(width, height, true, [0, 0, 0, 0])
  if (debug) {
    for (const card of state.cards) {
      circle(surface, card.baseX, card.baseY, Math.max(2, Math.min(card.width, card.height) * 0.018), [255, 255, 255, 180])
      line(surface, card.baseX, card.baseY, card.x, card.y, Math.max(1, Math.round(Math.min(width, height) / 540)), [126, 206, 255, 180])
    }
  }
  for (const card of state.cards) {
    const rendered = { ...card, y: card.y - card.lift * 0.12 }
    drawArtwork(surface, rendered)
    if (card.focusPlane) {
      rotatedRect(surface, rendered.x, rendered.y, rendered.width * 1.04, rendered.height * 1.04, rendered.rotation, [0, 0, 0, 0], [246, 243, 234, 255], Math.max(2, Math.min(rendered.width, rendered.height) * 0.012))
    }
  }
  return surface
}

export function renderSilhouette(state, { width, height }) {
  const surface = createSurface(width, height, false, [245, 243, 237, 255])
  for (const card of state.cards) {
    rotatedRect(surface, card.x, card.y - card.lift * 0.12, card.width, card.height, card.rotation, [25, 25, 23, 255])
  }
  return surface
}
