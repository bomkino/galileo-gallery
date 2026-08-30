const COLORS = ["#e1544e", "#307aad", "#daa636", "#4b9a71", "#855cb0", "#dc7535", "#2b9fa4", "#c14c84", "#5c6fb8", "#919a3d", "#c26049", "#4e8b78"]
function card(context, item) {
  if (!item.visible) return
  context.save(); context.translate(item.x, item.y - item.lift * .14); context.rotate(item.rotation)
  const inset = Math.max(4, Math.min(item.width, item.height) * .06)
  context.fillStyle = "#f1ede2"; context.strokeStyle = "#252421"; context.lineWidth = Math.max(1, inset * .32)
  context.fillRect(-item.width / 2, -item.height / 2, item.width, item.height)
  context.strokeRect(-item.width / 2, -item.height / 2, item.width, item.height)
  context.fillStyle = item.failed ? "#45433f" : COLORS[item.sourceIndex % COLORS.length]
  context.fillRect(-item.width / 2 + inset, -item.height / 2 + inset, item.width - 2 * inset, item.height - 2 * inset)
  context.strokeStyle = "rgba(255,255,255,.55)"; context.lineWidth = Math.max(1, inset * .12)
  for (let row = -2; row <= 2; row += 1) { const y = row * (item.height - 2 * inset) * .12; context.beginPath(); context.moveTo(-item.width * .32, y); context.lineTo(item.width * .32, y); context.stroke() }
  if (item.failed) { context.strokeStyle = "#e0d8c9"; context.beginPath(); context.moveTo(-item.width*.3,-item.height*.3);context.lineTo(item.width*.3,item.height*.3);context.stroke();context.beginPath();context.moveTo(item.width*.3,-item.height*.3);context.lineTo(-item.width*.3,item.height*.3);context.stroke() }
  if (item.focusPlane) { context.strokeStyle = "#f7f4eb"; context.lineWidth = Math.max(2, inset * .2); context.strokeRect(-item.width / 2 - inset*.45, -item.height / 2 - inset*.45, item.width + inset*.9, item.height + inset*.9) }
  context.restore()
}
export function drawBrowser(context, state, { debug }) {
  if (debug) {
    context.save(); context.strokeStyle = "rgba(245,239,118,.5)"; context.setLineDash([7,7])
    context.beginPath(); context.ellipse(state.negativeSpace.x, state.negativeSpace.y, state.negativeSpace.rx, state.negativeSpace.ry, 0, 0, Math.PI*2); context.stroke()
    for (const item of state.cards) { context.beginPath(); context.moveTo(item.startX,item.startY); context.lineTo(item.fieldX,item.fieldY); context.stroke() }
    context.restore()
  }
  for (const item of state.cards) card(context, item)
}
