import { CANVASES, DEFAULTS, FIXTURES, evaluateShelf, summarize } from "./evaluator.mjs"

const stage = document.querySelector("#stage")
const fixtureSelect = document.querySelector("#fixture")
const canvasSelect = document.querySelector("#canvas")
const runKindSelect = document.querySelector("#runKind")
const spotlightSelect = document.querySelector("#spotlightId")
const finaleSelect = document.querySelector("#finaleId")
const transparent = document.querySelector("#transparent")
const reducedMotion = document.querySelector("#reducedMotion")
const scrub = document.querySelector("#scrub")
const readback = document.querySelector("#readback")
const timeOutput = document.querySelector("#time")
const playButton = document.querySelector("#play")
const resetButton = document.querySelector("#reset")
const controlIds = ["cardHeight", "gap", "leanAmount", "direction", "spotlightLift"]
const controls = Object.fromEntries(controlIds.map((id) => [id, document.querySelector(`#${id}`)]))

for (const key of Object.keys(FIXTURES)) fixtureSelect.add(new Option(key, key))
for (const key of Object.keys(CANVASES)) canvasSelect.add(new Option(key, key))
fixtureSelect.value = "ordinary8"
canvasSelect.value = "16:9"
for (const [key, value] of Object.entries(DEFAULTS)) controls[key].value = String(value)

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
  spotlightSelect.value = items.some((item) => item.id === priorSpotlight) ? priorSpotlight : items[Math.min(2, items.length - 1)]?.id ?? ""
  finaleSelect.value = items.some((item) => item.id === priorFinale) ? priorFinale : items.at(-1)?.id ?? spotlightSelect.value
}

function svgData(item) {
  const width = Math.max(100, Math.round(260 * item.ratio))
  const height = 260
  const numeric = Number.parseInt(item.id.replace(/\D/g, ""), 10) || 1
  const hue = (numeric * 37 + 18) % 360
  const cutout = item.id.includes("media-edge") || item.id.includes("mixed")
  const background = cutout ? "none" : `hsl(${hue} 34% 86%)`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${background}"/><rect x="${width * .10}" y="${height * .12}" width="${width * .34}" height="${height * .62}" rx="12" fill="hsl(${hue} 58% 42%)"/><circle cx="${width * .68}" cy="${height * .42}" r="${height * .17}" fill="hsl(${(hue + 145) % 360} 62% 57%)"/><path d="M${width * .52} ${height * .72} H${width * .88}" stroke="#241c16" stroke-width="12" stroke-linecap="round"/><text x="16" y="${height - 17}" font-family="monospace" font-size="17" fill="#241c16">${item.label}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function currentConfig() {
  return {
    cardHeight: Number(controls.cardHeight.value),
    gap: Number(controls.gap.value),
    leanAmount: Number(controls.leanAmount.value),
    direction: controls.direction.value,
    spotlightLift: Number(controls.spotlightLift.value),
  }
}

function render() {
  const items = FIXTURES[fixtureSelect.value]
  const canvas = CANVASES[canvasSelect.value]
  const state = evaluateShelf({
    items,
    config: currentConfig(),
    intent: { spotlightId: spotlightSelect.value, finaleId: finaleSelect.value },
    normalizedTime: Number(scrub.value),
    canvas,
    runKind: runKindSelect.value,
    reducedMotion: reducedMotion.checked,
  })

  stage.style.width = `${canvas.width}px`
  stage.style.height = `${canvas.height}px`
  stage.classList.toggle("is-transparent", transparent.checked)
  stage.replaceChildren()

  const ledge = document.createElement("div")
  ledge.className = "ledge"
  ledge.style.top = `${state.baselineY}px`
  stage.append(ledge)

  for (const slot of state.renderSlots) {
    const node = document.createElement("div")
    node.className = "card"
    node.dataset.mediaId = slot.id
    node.dataset.copyIndex = String(slot.copyIndex)
    node.style.width = `${slot.width}px`
    node.style.height = `${slot.height}px`
    node.style.left = `${slot.x - slot.width / 2}px`
    node.style.top = `${slot.y}px`
    node.style.zIndex = String(slot.zOrder)
    node.style.transform = `rotate(${slot.leanDeg}deg)`
    const item = items[slot.sourceIndex]
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

  const focused = state.renderSlots.find((slot) => slot.id === state.currentFocusId && slot.focusProgress > 0.85)
  if (focused && !transparent.checked) {
    const marker = document.createElement("div")
    marker.className = "focus-marker"
    marker.textContent = items[focused.sourceIndex].caption
    marker.style.left = `${focused.x}px`
    marker.style.top = `${focused.y - 18}px`
    stage.append(marker)
  }

  timeOutput.value = Number(scrub.value).toFixed(3)
  readback.textContent = JSON.stringify({
    ...summarize(state),
    fixture: fixtureSelect.value,
    canvasPreset: canvasSelect.value,
    transparent: transparent.checked,
    reducedMotion: reducedMotion.checked,
    exactSourceState: state.sourceStates,
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
  const count = Math.max(1, FIXTURES[fixtureSelect.value].length)
  const duration = Math.max(8, Math.min(42, count * 1.65))
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
  transparent.checked = false
  reducedMotion.checked = false
  scrub.value = "0"
  for (const [key, value] of Object.entries(DEFAULTS)) controls[key].value = String(value)
  refreshIntentOptions()
  render()
}

fixtureSelect.addEventListener("input", () => { refreshIntentOptions(); render() })
for (const element of [canvasSelect, runKindSelect, spotlightSelect, finaleSelect, transparent, reducedMotion, scrub, ...Object.values(controls)]) element.addEventListener("input", render)
playButton.addEventListener("click", () => setPlaying(!playing))
resetButton.addEventListener("click", reset)

window.prototypeApi = Object.freeze({
  render,
  setTime(value) { scrub.value = String(value); return render() },
  setFixture(value) { fixtureSelect.value = value; refreshIntentOptions(); return render() },
  setCanvas(value) { canvasSelect.value = value; return render() },
  setRunKind(value) { runKindSelect.value = value; return render() },
  setIntent(spotlightId, finaleId) { spotlightSelect.value = spotlightId; finaleSelect.value = finaleId; return render() },
  setTransparent(value) { transparent.checked = Boolean(value); return render() },
  setReducedMotion(value) { reducedMotion.checked = Boolean(value); return render() },
  setControl(id, value) { controls[id].value = String(value); return render() },
  reset,
})

refreshIntentOptions()
render()
