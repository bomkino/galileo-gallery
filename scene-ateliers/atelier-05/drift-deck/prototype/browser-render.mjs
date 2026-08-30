function drawCard(context, card) {
  context.save()
  context.translate(card.x, card.y - card.lift * 0.12)
  context.rotate(card.rotation)
  const inset = Math.max(4, Math.min(card.width, card.height) * 0.065)
  context.fillStyle = "#efebe0"
  context.strokeStyle = "#252421"
  context.lineWidth = Math.max(1, Math.min(card.width, card.height) * 0.025)
  context.fillRect(-card.width / 2, -card.height / 2, card.width, card.height)
  context.strokeRect(-card.width / 2, -card.height / 2, card.width, card.height)
  context.fillStyle = card.failed ? "#45433f" : ["#e1544e", "#307aad", "#daa636", "#4b9a71", "#855cb0", "#dc7535", "#2b9fa4", "#c14c84", "#5c6fb8", "#919a3d", "#c26049", "#4e8b78"][card.sourceIndex % 12]
  context.fillRect(-card.width / 2 + inset, -card.height / 2 + inset, card.width - inset * 2, card.height - inset * 2)
  context.strokeStyle = "rgba(255,255,255,.55)"
  context.lineWidth = Math.max(1, inset * 0.12)
  for (let stripe = -2; stripe <= 2; stripe += 1) {
    const y = stripe * (card.height - inset * 2) * 0.12
    context.beginPath(); context.moveTo(-card.width * 0.32, y); context.lineTo(card.width * 0.32, y); context.stroke()
  }
  if (card.failed) {
    context.strokeStyle = "#e0d8c9"; context.lineWidth = Math.max(2, inset * 0.22)
    context.beginPath(); context.moveTo(-card.width * .3, -card.height * .3); context.lineTo(card.width * .3, card.height * .3); context.stroke()
    context.beginPath(); context.moveTo(card.width * .3, -card.height * .3); context.lineTo(-card.width * .3, card.height * .3); context.stroke()
  }
  if (card.focusPlane) {
    context.strokeStyle = "#f7f4eb"; context.lineWidth = Math.max(2, inset * 0.18)
    context.strokeRect(-card.width / 2 - inset * .45, -card.height / 2 - inset * .45, card.width + inset * .9, card.height + inset * .9)
  }
  context.restore()
}

export function drawBrowser(context, state, { width, height, debug }) {
  if (debug) {
    context.save(); context.strokeStyle = "rgba(255,255,255,.2)"; context.setLineDash([8, 8])
    for (const card of state.cards) {
      context.beginPath(); context.arc(card.baseX, card.baseY, Math.min(card.width, card.height) * .13, 0, Math.PI * 2); context.stroke()
      context.beginPath(); context.moveTo(card.baseX, card.baseY); context.lineTo(card.x, card.y); context.stroke()
    }
    context.restore()
  }
  for (const card of state.cards) drawCard(context, card)
}
