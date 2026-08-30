import { CANVASES, DEFAULTS, FIXTURES, evaluateVitrine, summarize } from "./evaluator.mjs"

const stage = document.querySelector("#stage")
const fixtureSelect = document.querySelector("#fixture")
const canvasSelect = document.querySelector("#canvas")
const runKindSelect = document.querySelector("#runKind")
const timelineDirection = document.querySelector("#timelineDirection")
const spotlightSelect = document.querySelector("#spotlightId")
const finaleSelect = document.querySelector("#finaleId")
const transparent = document.querySelector("#transparent")
const reducedMotion = document.querySelector("#reducedMotion")
const scrub = document.querySelector("#scrub")
const readback = document.querySelector("#readback")
const timeOutput = document.querySelector("#time")
const playButton = document.querySelector("#play")
const resetButton = document.querySelector("#reset")
const controlIds = ["presentationScale", "objectTurnAmplitude", "transitionDepth", "transitionDirection", "placardVisibility"]
const controls = Object.fromEntries(controlIds.map((id) => [id, document.querySelector(`#${id}`)]))

for (const key of Object.keys(FIXTURES)) fixtureSelect.add(new Option(key, key))
for (const key of Object.keys(CANVASES)) canvasSelect.add(new Option(key, key))
fixtureSelect.value = "ordinary8"
canvasSelect.value = "16:9"
for (const [key, value] of Object.entries(DEFAULTS)) {
  if (typeof value === "boolean") controls[key].checked = value
  else controls[key].value = String(value)
}

let playing = false
let lastStamp = null
let frameRequest = null

function refreshIntentOptions() {
  const items = FIXTURES[fixtureSelect.value]
  const priorSpotlight = spotlightSelect.value
  const priorFinale = finaleSelect.value
  spotlightSelect.replaceChildren()
  finaleSelect.replaceChildren()
  for (const item of items) {
    spotlightSelect.add(new Option(item.label, item.id))
    finaleSelect.add(new Option(item.label, item.id))
  }
  spotlightSelect.value = items.some((item) => item.id === priorSpotlight) ? priorSpotlight : items[0]?.id ?? ""
  finaleSelect.value = items.some((item) => item.id === priorFinale && item.id !== spotlightSelect.value)
    ? priorFinale
    : items.find((item) => item.id !== spotlightSelect.value)?.id ?? spotlightSelect.value
}

function svgData(item) {
  const width = Math.max(120, Math.round(260 * item.ratio))
  const height = 260
  const numeric = Number.parseInt(item.id.replace(/\D/g, ""), 10) || 1
  const hue = (numeric * 47 + 25) % 360
  const cutout = item.id.includes("media-edge") || item.id.includes("mixed")
  const background = cutout ? "none" : `hsl(${hue} 38% 88%)`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${background}"/><path d="M${width * .12} ${height * .78} L${width * .33} ${height * .18} L${width * .55} ${height * .72} L${width * .78} ${height * .25}" fill="none" stroke="hsl(${hue} 64% 39%)" stroke-width="18" stroke-linecap="round"/><circle cx="${width * .66}" cy="${height * .55}" r="${height * .13}" fill="hsl(${(hue + 145) % 360} 62% 56%)"/><text x="18" y="${height - 18}" font-family="monospace" font-size="18" fill="#211a11">${item.label}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function currentConfig() {
  return {
    presentationScale: Number(controls.presentationScale.value),
    objectTurnAmplitude: Number(controls.objectTurnAmplitude.value),
    transitionDepth: Number(controls.transitionDepth.value),
    transitionDirection: controls.transitionDirection.value,
    placardVisibility: controls.placardVisibility.checked,
  }
}

function render() {
  const items = FIXTURES[fixtureSelect.value]
  const canvas = CANVASES[canvasSelect.value]
  const state = evaluateVitrine({
    items,
    config: currentConfig(),
    intent: {
      direction: timelineDirection.value,
      spotlightId: spotlightSelect.value,
      finaleId: finaleSelect.value,
    },
    normalizedTime: Number(scrub.value),
    canvas,
    runKind: runKindSelect.value,
    reducedMotion: reducedMotion.checked,
  })

  stage.style.width = `${canvas.width}px`
  stage.style.height = `${canvas.height}px`
  stage.classList.toggle("is-transparent", transparent.checked)
  stage.replaceChildren()

  for (const card of state.renderSlots) {
    const node = document.createElement("div")
    node.className = `card is-${card.role}`
    node.dataset.mediaId = card.id
    node.dataset.role = card.role
    node.style.width = `${card.width}px`
    node.style.height = `${card.height}px`
    node.style.left = `${card.x - card.width / 2}px`
    node.style.top = `${card.y - card.height / 2}px`
    node.style.zIndex = String(card.zOrder)
    node.style.transform = `perspective(1500px) scale(${card.scale}) rotateX(${card.rotateXDeg}deg) rotateY(${card.rotateYDeg}deg)`
    const item = items[card.sourceIndex]
    if (item.kind === "failed") {
      const failed = document.createElement("div")
      failed.className = "failed"
      failed.textContent = `${item.label} / FAILED MEDIA`
      node.append(failed)
    } else {
      const image = document.createElement("img")
      image.alt = item.label
      image.draggable = false
      image.src = svgData(item)
      node.append(image)
    }
    stage.append(node)
  }

  if (state.placardVisible && state.placard) {
    const placard = document.createElement("div")
    placard.className = "placard"
    placard.textContent = `${state.placard.caption} · ${state.placard.mediaId}`
    stage.append(placard)
  }

  timeOutput.value = Number(scrub.value).toFixed(3)
  readback.textContent = JSON.stringify({
    ...summarize(state),
    fixture: fixtureSelect.value,
    canvasPreset: canvasSelect.value,
    transparent: transparent.checked,
    reducedMotion: reducedMotion.checked,
    exactSourceState: state.sourceStates.map((card) => ({
      id: card.id,
      role: card.role,
      active: card.active,
      artworkOpacity: card.artworkOpacity,
      artworkFilter: card.artworkFilter,
      artworkBlend: card.artworkBlend,
    })),
  }, null, 2)
  document.documentElement.dataset.ready = "true"
  window.__lastState = state
  return state
}

function tick(stamp) {
  if (!playing) return
  if (lastStamp === null) lastStamp = stamp
  const delta = Math.min(100, stamp - lastStamp)
  lastStamp = stamp
  const duration = Math.max(5.5, FIXTURES[fixtureSelect.value].length * 5.5)
  scrub.value = String((Number(scrub.value) + delta / (duration * 1000)) % 1)
  render()
  frameRequest = requestAnimationFrame(tick)
}

function setPlaying(value) {
  playing = value
  playButton.textContent = playing ? "Pause" : "Play"
  lastStamp = null
  if (frameRequest) cancelAnimationFrame(frameRequest)
  if (playing) frameRequest = requestAnimationFrame(tick)
}

function reset() {
  setPlaying(false)
  fixtureSelect.value = "ordinary8"
  canvasSelect.value = "16:9"
  runKindSelect.value = "loop"
  timelineDirection.value = "forward"
  transparent.checked = false
  reducedMotion.checked = false
  scrub.value = "0"
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (typeof value === "boolean") controls[key].checked = value
    else controls[key].value = String(value)
  }
  refreshIntentOptions()
  render()
}

fixtureSelect.addEventListener("input", () => { refreshIntentOptions(); render() })
spotlightSelect.addEventListener("input", () => {
  if (finaleSelect.value === spotlightSelect.value) finaleSelect.value = FIXTURES[fixtureSelect.value].find((item) => item.id !== spotlightSelect.value)?.id ?? spotlightSelect.value
  render()
})
for (const element of [canvasSelect, runKindSelect, timelineDirection, finaleSelect, transparent, reducedMotion, scrub, ...Object.values(controls)]) element.addEventListener("input", render)
playButton.addEventListener("click", () => setPlaying(!playing))
resetButton.addEventListener("click", reset)

window.prototypeApi = Object.freeze({
  render,
  setTime(value) { scrub.value = String(value); return render() },
  setFixture(value) { fixtureSelect.value = value; refreshIntentOptions(); return render() },
  setCanvas(value) { canvasSelect.value = value; return render() },
  setRunKind(value) { runKindSelect.value = value; return render() },
  setDirection(value) { timelineDirection.value = value; return render() },
  setIntent(spotlightId, finaleId) { spotlightSelect.value = spotlightId; finaleSelect.value = finaleId; return render() },
  setTransparent(value) { transparent.checked = Boolean(value); return render() },
  setReducedMotion(value) { reducedMotion.checked = Boolean(value); return render() },
  setControl(id, value) { if (typeof DEFAULTS[id] === "boolean") controls[id].checked = Boolean(value); else controls[id].value = String(value); return render() },
  reset,
})

refreshIntentOptions()
render()
