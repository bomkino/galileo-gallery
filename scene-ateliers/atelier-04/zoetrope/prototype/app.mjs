import { CANVASES, DEFAULTS, FIXTURES, evaluateZoetrope, summarize } from "./evaluator.mjs"

const stage = document.querySelector("#stage")
const fixtureSelect = document.querySelector("#fixture")
const canvasSelect = document.querySelector("#canvas")
const runKindSelect = document.querySelector("#runKind")
const scrub = document.querySelector("#scrub")
const readback = document.querySelector("#readback")
const timeOutput = document.querySelector("#time")
const playButton = document.querySelector("#play")
const resetButton = document.querySelector("#reset")
const transparent = document.querySelector("#transparent")
const reducedMotion = document.querySelector("#reducedMotion")
const controlIds = ["cylinderRadius", "cardSize", "ringTiltDeg", "cadenceCharacter", "direction"]
const controls = Object.fromEntries(controlIds.map((id) => [id, document.querySelector(`#${id}`)]))

for (const key of Object.keys(FIXTURES)) fixtureSelect.add(new Option(key, key))
for (const key of Object.keys(CANVASES)) canvasSelect.add(new Option(key, key))
fixtureSelect.value = "ordinary6"
canvasSelect.value = "16:9"
for (const [key, value] of Object.entries(DEFAULTS)) controls[key].value = String(value)

let playing = false
let lastStamp = null
let frameRequest = null

function svgData(item) {
  const width = Math.max(120, Math.round(240 * item.ratio))
  const height = 240
  const hue = (Number.parseInt(item.id.replace(/\D/g, ""), 10) * 47 + 18) % 360
  const transparentCut = item.id.includes("mixed") || item.id.includes("media-edge")
  const background = transparentCut ? "none" : `hsl(${hue} 45% 84%)`
  const shape = `<path d="M 0 ${height * .72} L ${width * .32} ${height * .18} L ${width * .66} ${height * .82} L ${width} ${height * .28}" fill="none" stroke="hsl(${hue} 75% 34%)" stroke-width="18"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${background}"/><circle cx="${width * .74}" cy="${height * .28}" r="${height * .18}" fill="hsl(${(hue + 150) % 360} 55% 54%)"/>${shape}<text x="18" y="${height - 20}" font-family="monospace" font-size="18" fill="#171614">${item.label}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function currentConfig() {
  return {
    cylinderRadius: Number(controls.cylinderRadius.value),
    cardSize: Number(controls.cardSize.value),
    ringTiltDeg: Number(controls.ringTiltDeg.value),
    cadenceCharacter: controls.cadenceCharacter.value,
    direction: controls.direction.value,
  }
}

function render() {
  const items = FIXTURES[fixtureSelect.value]
  const canvas = CANVASES[canvasSelect.value]
  const state = evaluateZoetrope({
    items,
    config: currentConfig(),
    normalizedTime: Number(scrub.value),
    canvas,
    runKind: runKindSelect.value,
    reducedMotion: reducedMotion.checked,
    spotlightId: items[Math.min(2, items.length - 1)]?.id,
    finaleId: items.at(-1)?.id,
  })
  stage.style.width = `${canvas.width}px`
  stage.style.height = `${canvas.height}px`
  stage.classList.toggle("is-transparent", transparent.checked)
  stage.replaceChildren()
  if (!transparent.checked) {
    const gate = document.createElement("div")
    gate.className = "gate"
    stage.append(gate)
  }
  for (const card of state.renderSlots) {
    const node = document.createElement("div")
    node.className = "card"
    node.dataset.mediaId = card.id
    node.dataset.sourceIndex = String(card.sourceIndex)
    node.style.width = `${card.width}px`
    node.style.height = `${card.height}px`
    node.style.left = `${card.x - card.width / 2}px`
    node.style.top = `${card.y - card.height / 2}px`
    node.style.zIndex = String(card.zOrder)
    node.style.transform = `scale(${card.scale}) perspective(1200px) rotateY(${card.rotateYDeg}deg) rotateZ(${card.rotateZDeg}deg)`
    const shell = document.createElement("div")
    shell.className = "art-shell"
    const item = items[card.sourceIndex]
    if (item.kind === "failed") {
      const failed = document.createElement("div")
      failed.className = "failed"
      failed.textContent = `${item.label} / FAILED MEDIA`
      shell.append(failed)
    } else {
      const image = document.createElement("img")
      image.alt = item.label
      image.draggable = false
      image.src = svgData(item)
      shell.append(image)
    }
    node.append(shell)
    stage.append(node)
  }
  timeOutput.value = Number(scrub.value).toFixed(3)
  readback.textContent = JSON.stringify({
    ...summarize(state),
    fixture: fixtureSelect.value,
    canvasPreset: canvasSelect.value,
    transparent: transparent.checked,
    reducedMotion: reducedMotion.checked,
    exactState: state.cards.map((card) => ({ id: card.id, x: +card.x.toFixed(3), y: +card.y.toFixed(3), depth: +card.depth.toFixed(6), frontGate: card.frontGate, readable: card.readable })),
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
  scrub.value = String((Number(scrub.value) + delta / 6000) % 1)
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
  fixtureSelect.value = "ordinary6"
  canvasSelect.value = "16:9"
  runKindSelect.value = "loop"
  scrub.value = "0"
  transparent.checked = false
  reducedMotion.checked = false
  for (const [key, value] of Object.entries(DEFAULTS)) controls[key].value = String(value)
  render()
}

for (const element of [fixtureSelect, canvasSelect, runKindSelect, scrub, transparent, reducedMotion, ...Object.values(controls)]) element.addEventListener("input", render)
playButton.addEventListener("click", () => setPlaying(!playing))
resetButton.addEventListener("click", reset)

window.prototypeApi = Object.freeze({
  render,
  setTime(value) { scrub.value = String(value); return render() },
  setFixture(value) { fixtureSelect.value = value; return render() },
  setCanvas(value) { canvasSelect.value = value; return render() },
  setTransparent(value) { transparent.checked = Boolean(value); return render() },
  setControl(id, value) { controls[id].value = String(value); return render() },
  reset,
})

render()
