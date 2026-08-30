import { sceneMeta, controlDescriptors, fixtureNames, makeFixture, defaultControls, compileTimeline, evaluateScene } from "./evaluator.mjs"
import { drawBrowser } from "./browser-render.mjs"

const $ = (id) => document.getElementById(id)
$("title").textContent = sceneMeta.name
$("motion").textContent = sceneMeta.motionSentence
const canvas = $("stage")
const context = canvas.getContext("2d", { alpha: true })
let controls = defaultControls()
let playing = false
let story = 0
let last = performance.now()
let selectedIndex = 0

for (const name of fixtureNames) {
  const option = document.createElement("option")
  option.value = name; option.textContent = name
  $("fixture").append(option)
}
$("fixture").value = sceneMeta.defaultFixture

const controlElements = new Map()
for (const descriptor of controlDescriptors) {
  const wrapper = document.createElement("div")
  wrapper.className = "control"
  const row = document.createElement("div")
  row.className = "control-row"
  const label = document.createElement("span")
  label.textContent = descriptor.label
  const value = document.createElement("output")
  row.append(label, value)
  let input
  if (descriptor.type === "range") {
    input = document.createElement("input")
    input.type = "range"; input.min = descriptor.min; input.max = descriptor.max; input.step = descriptor.step
  } else {
    input = document.createElement("select")
    for (const optionValue of descriptor.options) {
      const option = document.createElement("option")
      option.value = optionValue; option.textContent = optionValue
      input.append(option)
    }
  }
  input.value = controls[descriptor.parameter]
  const refreshValue = () => { value.textContent = `${input.value}${descriptor.unit ?? ""}` }
  refreshValue()
  input.addEventListener("input", () => {
    controls = { ...controls, [descriptor.parameter]: descriptor.type === "range" ? Number(input.value) : input.value }
    refreshValue(); render()
  })
  wrapper.append(row, input)
  $("controls").append(wrapper)
  controlElements.set(descriptor.id, { input, value, descriptor, refreshValue })
}

function resizeCanvas() {
  const ratios = { "16:9": [960, 540], "9:16": [540, 960], "1:1": [720, 720], "4:5": [675, 844] }
  const [width, height] = ratios[$("canvas").value]
  canvas.width = width; canvas.height = height
}

function currentState() {
  const items = makeFixture($("fixture").value)
  const timeline = compileTimeline({ mode: $("mode").value, itemCount: items.length, controls })
  return evaluateScene({ items, controls, timeline, timeMs: story * timeline.durationMs, width: canvas.width, height: canvas.height, reducedMotion: $("reduced").checked, debug: $("debug").checked, selectedIndex })
}

function render() {
  const state = currentState()
  context.clearRect(0, 0, canvas.width, canvas.height)
  drawBrowser(context, state, { width: canvas.width, height: canvas.height, debug: $("debug").checked })
  $("scrub").value = Math.round(story * 1000)
  $("status").value = JSON.stringify({ phase: Number(state.phase.toFixed(4)), phaseName: state.phaseName, selectedIndex: state.selectedIndex, visible: state.cards.filter((card) => card.visible !== false).length, durationMs: state.timeline.durationMs }, null, 2)
}

function tick(now) {
  const delta = Math.min(100, now - last)
  last = now
  if (playing) {
    const items = makeFixture($("fixture").value)
    const timeline = compileTimeline({ mode: $("mode").value, itemCount: items.length, controls })
    story = (story + delta / timeline.durationMs) % 1
    render()
  }
  requestAnimationFrame(tick)
}

$("play").addEventListener("click", () => { playing = !playing; $("play").textContent = playing ? "Pause" : "Play" })
$("reset").addEventListener("click", () => {
  controls = defaultControls(); story = 0; selectedIndex = 0; playing = false; $("play").textContent = "Play"
  for (const { input, descriptor, refreshValue } of controlElements.values()) { input.value = controls[descriptor.parameter]; refreshValue() }
  render()
})
$("scrub").addEventListener("input", () => { story = Number($("scrub").value) / 1000; render() })
for (const id of ["mode", "fixture", "reduced", "debug"]) $(id).addEventListener("input", render)
$("canvas").addEventListener("input", () => { resizeCanvas(); render() })
canvas.addEventListener("keydown", (event) => {
  if (event.key === " ") { event.preventDefault(); $("play").click() }
  if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); selectedIndex += 1; render() }
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); selectedIndex -= 1; render() }
  if (event.key === "Home") { event.preventDefault(); story = 0; render() }
  if (event.key === "End") { event.preventDefault(); story = 0.999999; render() }
})
resizeCanvas(); render(); requestAnimationFrame(tick)
