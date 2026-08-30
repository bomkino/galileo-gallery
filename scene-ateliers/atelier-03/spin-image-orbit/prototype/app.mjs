import { DEFAULTS, FIXTURES, CANVASES, CONTROL_BOUNDS, FIXED_MIN_MS, evaluate, canonicalSnapshot } from "./evaluator.mjs"
import {
  REVIEW_FPS,
  ReviewHistory,
  clampSourceIndex,
  createAuthoringSnapshot,
  decodeReviewState,
  dragTime,
  encodeReviewState,
  findReadableTime,
  formatReviewTime,
  isTextEntryTarget,
  stepReviewFrame,
} from "./review-runtime.mjs"

const SCENE = {"slug":"spin-image-orbit","fan":false,"defaultFixture":"six","defaultTime":3840,"featuredKey":"featuredIndex","controls":[{"id":"ellipseWidth","unit":"%"},{"id":"ellipseHeight","unit":"%"},{"id":"planeYaw","unit":"°"},{"id":"planePitch","unit":"°"},{"id":"cardSize","unit":"%"},{"id":"featuredIndex","unit":""}],"title":"Wide Ellipse","storyLabel":"Story featured source","inspectionWindow":false}
const $ = (id) => document.getElementById(id)
const query = new URLSearchParams(location.search)
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)")
const controlIds = SCENE.controls.map((control) => control.id)
const authoringControlIds = controlIds.filter((id) => id !== SCENE.featuredKey)
const reviewSpec = {
  defaultFixture: SCENE.defaultFixture,
  defaultCanvas: "wide",
  defaultTime: SCENE.defaultTime,
  fixtureIds: Object.keys(FIXTURES),
  canvasIds: Object.keys(CANVASES),
  defaults: DEFAULTS,
  controlBounds: CONTROL_BOUNDS,
  controlIds,
  featuredKey: SCENE.featuredKey,
}
const decoded = decodeReviewState(query, reviewSpec)
const nodes = new Map()
const stage = $("stage")
const cardsLayer = $("cards")
const scrub = $("scrub")
const play = $("play")
const status = $("status")
const readback = $("readback")
const diagnostics = $("diagnostics")
const timeOutput = $("timeOutput")
const fixedField = $("fixedField")
const reviewUrl = $("reviewUrl")
let rafId = 0
let dragRafId = 0
let editSession = null
let dragGesture = null

const state = {
  fixture: decoded.state.fixture,
  canvas: decoded.state.canvas,
  controls: { ...DEFAULTS, ...decoded.state.controls },
  timeMs: decoded.state.timeMs,
  reducedMotionOverride: decoded.state.reducedMotionOverride,
  inspectionIndex: null,
  playing: false,
  startedAt: 0,
  startTime: 0,
}
state.controls.reducedMotion = state.reducedMotionOverride === null ? motionPreference.matches : state.reducedMotionOverride
const history = new ReviewHistory(authoringSnapshot())
const runtime = {
  renders: 0,
  nodeCreates: 0,
  nodeRemoves: 0,
  nodeReuses: 0,
  playbackFrames: 0,
  dragFrames: 0,
  rafSchedules: 0,
  maxMounted: 0,
  lastMounted: 0,
  lastInspectionSeekScore: null,
}

document.documentElement.dataset.transparent = query.get("transparent") === "1" ? "true" : "false"
document.documentElement.dataset.silhouette = query.get("silhouette") === "1" ? "true" : "false"

defaultValues()
bind()
render()

function authoringSnapshot() {
  return createAuthoringSnapshot({
    fixture: state.fixture,
    canvas: state.canvas,
    controls: state.controls,
    reducedMotionOverride: state.reducedMotionOverride,
  })
}

function applyAuthoringSnapshot(snapshot) {
  pause()
  state.fixture = snapshot.fixture in FIXTURES ? snapshot.fixture : SCENE.defaultFixture
  state.canvas = snapshot.canvas in CANVASES ? snapshot.canvas : "wide"
  state.controls = { ...DEFAULTS, ...snapshot.controls }
  state.reducedMotionOverride = snapshot.reducedMotionOverride === true
    ? true
    : snapshot.reducedMotionOverride === false
      ? false
      : null
  state.controls.reducedMotion = state.reducedMotionOverride === null ? motionPreference.matches : state.reducedMotionOverride
  state.inspectionIndex = state.inspectionIndex === null ? null : clampSourceIndex(state.inspectionIndex, FIXTURES[state.fixture].length)
  clampStorySource()
  defaultValues()
  render()
}

function defaultValues() {
  $("fixture").value = state.fixture
  $("canvas").value = state.canvas
  $("mode").value = state.controls.mode
  $("direction").value = state.controls.direction
  $("reducedMotion").checked = state.controls.reducedMotion
  $("fixedDurationMs").min = String(FIXED_MIN_MS)
  $("fixedDurationMs").value = String(state.controls.fixedDurationMs)
  for (const id of controlIds) {
    $(id).value = id === SCENE.featuredKey ? String(state.controls[id] + 1) : String(state.controls[id])
    updateOutput(id)
  }
  updateFeaturedBounds()
  updateFixedField()
  updatePlayButton()
  updateHistoryButtons()
}

function bind() {
  for (const id of ["fixture", "canvas", "mode", "direction"]) {
    $(id).addEventListener("change", () => commitImmediate(labelFor(id), () => {
      if (id === "fixture") state.fixture = $(id).value
      else if (id === "canvas") state.canvas = $(id).value
      else state.controls[id] = $(id).value
      clampStorySource()
      if (state.inspectionIndex !== null) state.inspectionIndex = clampSourceIndex(state.inspectionIndex, FIXTURES[state.fixture].length)
      updateFeaturedBounds()
      updateFixedField()
    }))
  }

  for (const id of [...controlIds, "fixedDurationMs"]) bindContinuousControl(id)

  $("reducedMotion").addEventListener("change", () => commitImmediate("Reduced motion", () => {
    state.reducedMotionOverride = $("reducedMotion").checked
    state.controls.reducedMotion = state.reducedMotionOverride
  }))

  motionPreference.addEventListener?.("change", (event) => {
    if (state.reducedMotionOverride !== null) return
    pause()
    state.controls.reducedMotion = event.matches
    $("reducedMotion").checked = event.matches
    render()
  })

  scrub.addEventListener("input", () => {
    pause()
    state.timeMs = Number(scrub.value)
    render()
  })
  play.addEventListener("click", togglePlayback)
  $("stepBack").addEventListener("click", () => stepFrame(-1))
  $("stepForward").addEventListener("click", () => stepFrame(1))
  $("undo").addEventListener("click", undo)
  $("redo").addEventListener("click", redo)
  $("copyReview").addEventListener("click", copyReviewState)
  $("reset").addEventListener("click", resetAuthoring)
  stage.addEventListener("keydown", inspectSource)
  document.addEventListener("keydown", globalKeys)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pause()
      abortCardDrag(true)
    }
  })
  window.addEventListener("blur", () => abortCardDrag(true))
}

function labelFor(id) {
  return { fixture: "Fixture", canvas: "Canvas", mode: "Timeline mode", direction: "Direction", fixedDurationMs: "Fixed duration" }[id]
    ?? (id === SCENE.featuredKey ? SCENE.storyLabel : document.querySelector(`label[for="${id}"]`)?.textContent?.trim() ?? id)
}

function bindContinuousControl(id) {
  const input = $(id)
  const begin = () => beginEdit(id)
  input.addEventListener("focus", begin)
  input.addEventListener("pointerdown", begin)
  input.addEventListener("keydown", begin)
  input.addEventListener("input", () => {
    beginEdit(id)
    pause()
    const value = readControlInput(id)
    if (value === null) {
      input.setAttribute("aria-invalid", "true")
      status.dataset.error = "true"
      status.textContent = `${labelFor(id)} is outside its supported bounds.`
      return
    }
    input.removeAttribute("aria-invalid")
    state.controls[id] = value
    if (id === SCENE.featuredKey) {
      clampStorySource()
      input.value = String(state.controls[id] + 1)
    }
    updateOutput(id)
    render()
  })
  input.addEventListener("change", () => {
    if (readControlInput(id) === null) restoreControlInput(id)
    commitEdit(id)
  })
  input.addEventListener("blur", () => commitEdit(id))
  input.addEventListener("pointerup", () => commitEdit(id))
}

function readControlInput(id) {
  const input = $(id)
  const raw = Number(input.value)
  if (!Number.isFinite(raw)) return null
  const value = id === SCENE.featuredKey ? raw - 1 : raw
  const bounds = CONTROL_BOUNDS[id]
  if (bounds && (value < bounds[0] || value > bounds[1])) return null
  return value
}

function restoreControlInput(id) {
  const input = $(id)
  input.value = id === SCENE.featuredKey ? String(state.controls[id] + 1) : String(state.controls[id])
  input.removeAttribute("aria-invalid")
  updateOutput(id)
  render()
}

function beginEdit(id) {
  if (editSession?.id === id) return
  if (editSession) commitEdit(editSession.id)
  editSession = { id, before: authoringSnapshot() }
}

function commitEdit(id) {
  if (!editSession || editSession.id !== id) return
  history.commitFrom(editSession.before, authoringSnapshot(), labelFor(id))
  editSession = null
  updateHistoryButtons()
}

function commitImmediate(label, mutation) {
  if (editSession) commitEdit(editSession.id)
  pause()
  const before = authoringSnapshot()
  mutation()
  history.commitFrom(before, authoringSnapshot(), label)
  defaultValues()
  render()
}

function clampStorySource() {
  state.controls[SCENE.featuredKey] = clampSourceIndex(state.controls[SCENE.featuredKey], FIXTURES[state.fixture].length)
}

function updateFeaturedBounds() {
  const items = FIXTURES[state.fixture]
  const field = $(SCENE.featuredKey)
  clampStorySource()
  field.min = "1"
  field.max = String(items.length)
  field.value = String(state.controls[SCENE.featuredKey] + 1)
  updateOutput(SCENE.featuredKey)
}

function inspectSource(event) {
  const items = FIXTURES[state.fixture]
  const current = state.inspectionIndex ?? state.controls[SCENE.featuredKey]
  const page = Math.max(1, Math.floor((window.__ATELIER_PREVIEW__?.window?.count ?? 5) * 0.8))
  let next = current
  if (event.key === "ArrowRight" || event.key === "ArrowDown") next += 1
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next -= 1
  else if (event.key === "PageDown") next += page
  else if (event.key === "PageUp") next -= page
  else if (event.key === "Home") next = 0
  else if (event.key === "End") next = items.length - 1
  else return
  event.preventDefault()
  setInspection(next, true)
}

function setInspection(index, seek = true) {
  pause()
  state.inspectionIndex = clampSourceIndex(index, FIXTURES[state.fixture].length)
  if (seek) {
    const authored = evaluateState(state.timeMs, state.controls)
    const inspectionControls = displayControls()
    const found = findReadableTime({
      durationMs: authored.durationMs,
      sourceIndex: state.inspectionIndex,
      evaluateAt: (timeMs) => evaluateState(timeMs, inspectionControls),
    })
    if (found.mounted) state.timeMs = found.timeMs
    runtime.lastInspectionSeekScore = Number.isFinite(found.score) ? Number(found.score.toFixed(4)) : null
  }
  render()
}

function displayControls() {
  if (!SCENE.inspectionWindow || state.inspectionIndex === null || FIXTURES[state.fixture].length <= 12) return state.controls
  return { ...state.controls, [SCENE.featuredKey]: state.inspectionIndex }
}

function updateOutput(id) {
  const output = document.querySelector(`[data-value="${id}"]`)
  if (!output) return
  const unit = SCENE.controls.find((control) => control.id === id)?.unit ?? ""
  output.textContent = `${$(id).value}${unit}`
}

function updateFixedField() {
  const fixed = state.controls.mode === "fixed-duration"
  fixedField.hidden = !fixed
  $("fixedDurationMs").disabled = !fixed
}

function updatePlayButton() {
  play.textContent = state.playing ? "Pause" : "Play"
  play.setAttribute("aria-pressed", state.playing ? "true" : "false")
}

function updateHistoryButtons() {
  $("undo").disabled = !history.canUndo
  $("redo").disabled = !history.canRedo
  const depth = history.depth
  $("undo").title = depth.undo ? `Undo (${depth.undo})` : "Nothing to undo"
  $("redo").title = depth.redo ? `Redo (${depth.redo})` : "Nothing to redo"
}

function pause() {
  state.playing = false
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  updatePlayButton()
}

function schedulePlayback() {
  if (rafId || !state.playing) return
  runtime.rafSchedules += 1
  rafId = requestAnimationFrame(tick)
}

function togglePlayback() {
  if (state.playing) { pause(); return }
  state.playing = true
  state.startedAt = performance.now()
  state.startTime = state.timeMs
  updatePlayButton()
  schedulePlayback()
}

function tick(now) {
  rafId = 0
  if (!state.playing) return
  const duration = evaluateState(0, state.controls).durationMs
  state.timeMs = (state.startTime + now - state.startedAt) % duration
  runtime.playbackFrames += 1
  render()
  schedulePlayback()
}

function stepFrame(delta) {
  pause()
  const duration = evaluateState(0, state.controls).durationMs
  state.timeMs = stepReviewFrame(state.timeMs, duration, delta, REVIEW_FPS)
  render()
}

function evaluateState(timeMs = state.timeMs, controls = state.controls) {
  return evaluate({
    items: FIXTURES[state.fixture],
    stage: CANVASES[state.canvas],
    controls,
    timeMs,
  })
}

function createCard(card, item) {
  const article = document.createElement("article")
  article.className = "card"
  article.dataset.id = card.id
  article.dataset.sourceIndex = String(card.sourceIndex)
  article.setAttribute("role", "img")
  article.addEventListener("pointerdown", beginCardDrag)
  article.addEventListener("pointermove", moveCardDrag)
  article.addEventListener("pointerup", finishCardDrag)
  article.addEventListener("pointercancel", cancelCardDrag)
  article.addEventListener("lostpointercapture", finishCardDrag)
  const art = document.createElement("div")
  art.className = "art"
  const label = document.createElement("span")
  label.className = "art-label"
  art.append(label)
  article.append(art)
  cardsLayer.append(article)
  const node = { article, art, label, sourceIndex: -1 }
  nodes.set(card.id, node)
  runtime.nodeCreates += 1
  updateCardContent(node, card, item)
  return node
}

function updateCardContent(node, card, item) {
  node.article.dataset.sourceIndex = String(card.sourceIndex)
  if (node.sourceIndex === card.sourceIndex && node.failed === card.failed && node.video === card.video) return
  node.sourceIndex = card.sourceIndex
  node.failed = card.failed
  node.video = card.video
  node.label.textContent = card.failed ? "MISSING" : item?.label ?? card.id
  node.art.style.setProperty("--h", String((card.sourceIndex * 47 + 210) % 360))
  node.article.classList.toggle("failed", card.failed)
  node.article.classList.toggle("video", card.video)
  node.article.setAttribute("aria-label", `Source ${card.sourceIndex + 1}: ${node.label.textContent}`)
}

function syncCards(output) {
  const items = FIXTURES[state.fixture]
  const active = new Set(output.cards.map((card) => card.id))
  for (const [id, node] of nodes) {
    if (!active.has(id)) {
      node.article.remove()
      nodes.delete(id)
      runtime.nodeRemoves += 1
    }
  }
  const ordered = [...output.cards].sort((a, b) => a.zIndex - b.zIndex || a.sourceIndex - b.sourceIndex)
  for (const card of ordered) {
    const item = items[card.sourceIndex]
    const existing = nodes.get(card.id)
    const node = existing ?? createCard(card, item)
    if (existing) runtime.nodeReuses += 1
    updateCardContent(node, card, item)
    const article = node.article
    article.classList.toggle("is-inspected", state.inspectionIndex === card.sourceIndex)
    article.style.left = `${(SCENE.fan ? card.bottomX : card.x) / CANVASES[state.canvas].width * 100}%`
    article.style.top = `${(SCENE.fan ? card.bottomY : card.y) / CANVASES[state.canvas].height * 100}%`
    article.style.width = `${card.width / CANVASES[state.canvas].width * 100}%`
    article.style.height = `${card.height / CANVASES[state.canvas].height * 100}%`
    article.style.opacity = String(card.containerOpacity)
    article.style.pointerEvents = card.containerOpacity >= 0.08 ? "auto" : "none"
    article.setAttribute("aria-hidden", card.containerOpacity >= 0.08 ? "false" : "true")
    article.style.zIndex = String(card.zIndex)
    article.style.transformOrigin = SCENE.fan ? "50% 100%" : "50% 50%"
    article.style.transform = SCENE.fan
      ? `translate(-50%, -100%) rotate(${card.angleDeg}deg) scale(${card.scale})`
      : `translate(-50%, -50%) scale(${card.scale})`
    cardsLayer.append(article)
  }
  runtime.lastMounted = ordered.length
  runtime.maxMounted = Math.max(runtime.maxMounted, ordered.length)
}

function unmodifiedPrimaryPointer(event) {
  return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
}

function beginCardDrag(event) {
  if (dragGesture || !unmodifiedPrimaryPointer(event)) return
  event.preventDefault()
  event.stopPropagation()
  pause()
  const article = event.currentTarget
  dragGesture = {
    pointerId: event.pointerId,
    article,
    sourceIndex: Number(article.dataset.sourceIndex),
    startX: event.clientX,
    lastX: event.clientX,
    startTime: state.timeMs,
    deltaX: 0,
    moved: false,
  }
  article.setPointerCapture?.(event.pointerId)
  stage.classList.add("is-scrubbing")
}

function moveCardDrag(event) {
  if (!dragGesture || dragGesture.pointerId !== event.pointerId) return
  event.preventDefault()
  event.stopPropagation()
  dragGesture.lastX = event.clientX
  dragGesture.deltaX = event.clientX - dragGesture.startX
  dragGesture.moved ||= Math.abs(dragGesture.deltaX) > 4
  if (dragRafId) return
  runtime.rafSchedules += 1
  dragRafId = requestAnimationFrame(applyCardDrag)
}

function applyCardDrag() {
  dragRafId = 0
  if (!dragGesture) return
  const duration = evaluateState(0, state.controls).durationMs
  state.timeMs = dragTime(dragGesture.startTime, dragGesture.deltaX, Math.max(1, stage.clientWidth), duration)
  runtime.dragFrames += 1
  render()
}

function abortCardDrag(restoreTime = true) {
  const gesture = dragGesture
  if (!gesture) return false
  if (dragRafId) cancelAnimationFrame(dragRafId)
  dragRafId = 0
  dragGesture = null
  stage.classList.remove("is-scrubbing")
  if (gesture.article.hasPointerCapture?.(gesture.pointerId)) gesture.article.releasePointerCapture?.(gesture.pointerId)
  if (restoreTime) state.timeMs = gesture.startTime
  render()
  return true
}

function finishCardDrag(event) {
  if (!dragGesture || dragGesture.pointerId !== event.pointerId) return
  if (dragRafId) { cancelAnimationFrame(dragRafId); dragRafId = 0; applyCardDrag() }
  const gesture = dragGesture
  dragGesture = null
  stage.classList.remove("is-scrubbing")
  if (gesture.article.hasPointerCapture?.(gesture.pointerId)) gesture.article.releasePointerCapture?.(gesture.pointerId)
  if (!gesture.moved) setInspection(gesture.sourceIndex, true)
}

function cancelCardDrag(event) {
  if (!dragGesture || dragGesture.pointerId !== event.pointerId) return
  abortCardDrag(true)
}

function undo() {
  if (editSession) commitEdit(editSession.id)
  const result = history.undo(authoringSnapshot())
  if (!result) return
  applyAuthoringSnapshot(result.snapshot)
  announce(`Undid ${result.label}`)
}

function redo() {
  if (editSession) commitEdit(editSession.id)
  const result = history.redo(authoringSnapshot())
  if (!result) return
  applyAuthoringSnapshot(result.snapshot)
  announce(`Redid ${result.label}`)
}

function resetAuthoring() {
  if (editSession) commitEdit(editSession.id)
  pause()
  const before = authoringSnapshot()
  state.controls = { ...DEFAULTS, reducedMotion: motionPreference.matches }
  state.reducedMotionOverride = null
  state.timeMs = SCENE.defaultTime
  state.inspectionIndex = null
  clampStorySource()
  history.commitFrom(before, authoringSnapshot(), "Reset Scene")
  defaultValues()
  render()
}

function globalKeys(event) {
  if (event.key === "Escape") {
    if (dragGesture) {
      event.preventDefault()
      abortCardDrag(true)
      return
    }
    if (state.inspectionIndex !== null) { event.preventDefault(); state.inspectionIndex = null; render() }
    return
  }
  if (isTextEntryTarget(event.target)) return
  const command = event.metaKey || event.ctrlKey
  if (command && event.key.toLowerCase() === "z") {
    event.preventDefault()
    if (event.shiftKey) redo(); else undo()
  } else if (event.code === "Space") {
    event.preventDefault(); togglePlayback()
  } else if (event.key === ",") {
    event.preventDefault(); stepFrame(-1)
  } else if (event.key === ".") {
    event.preventDefault(); stepFrame(1)
  }
}

async function copyReviewState() {
  const value = buildReviewUrl()
  reviewUrl.value = value
  try {
    await navigator.clipboard.writeText(value)
    announce("Review state copied. It changes prototype review state only; it is not a Galileo Project.")
  } catch {
    reviewUrl.hidden = false
    reviewUrl.focus()
    reviewUrl.select()
    announce("Clipboard unavailable. Review URL selected for manual copy.")
  }
}

function buildReviewUrl() {
  const base = location.href.split(/[?#]/)[0]
  return `${base}?${encodeReviewState({
    fixture: state.fixture,
    canvas: state.canvas,
    controls: state.controls,
    timeMs: state.timeMs,
    reducedMotionOverride: state.reducedMotionOverride,
  }, reviewSpec)}`
}

function announce(message) {
  status.dataset.notice = message
  status.textContent = message
}

function render() {
  try {
    runtime.renders += 1
    const canonicalOutput = evaluateState(state.timeMs, state.controls)
    const previewOutput = evaluateState(state.timeMs, displayControls())
    const canvas = CANVASES[state.canvas]
    const storyTime = ((state.timeMs % canonicalOutput.durationMs) + canonicalOutput.durationMs) % canonicalOutput.durationMs
    state.timeMs = storyTime
    stage.style.setProperty("--ratio", String(canvas.width / canvas.height))
    stage.style.aspectRatio = `${canvas.width}/${canvas.height}`
    syncCards(previewOutput)
    scrub.max = String(canonicalOutput.durationMs)
    scrub.value = String(storyTime)
    timeOutput.value = formatReviewTime(storyTime, canonicalOutput.durationMs, REVIEW_FPS)
    const storySource = state.controls[SCENE.featuredKey]
    const inspection = state.inspectionIndex === null ? "" : ` · inspecting source ${state.inspectionIndex + 1} (review only)`
    const inspectionWindow = SCENE.inspectionWindow && state.inspectionIndex !== null && FIXTURES[state.fixture].length > 12 ? " · temporary inspection window" : ""
    status.dataset.error = "false"
    status.textContent = `${canonicalOutput.phraseRole} · story source ${storySource + 1}/${canonicalOutput.window.total}${inspection}${inspectionWindow} · ${previewOutput.window.count} mounted · ${canonicalOutput.timeline.mode}`
    const depth = history.depth
    diagnostics.textContent = JSON.stringify({
      fps: REVIEW_FPS,
      renders: runtime.renders,
      mounted: runtime.lastMounted,
      maxMounted: runtime.maxMounted,
      nodeCreates: runtime.nodeCreates,
      nodeRemoves: runtime.nodeRemoves,
      nodeReuses: runtime.nodeReuses,
      rafSchedules: runtime.rafSchedules,
      playbackFrames: runtime.playbackFrames,
      dragFrames: runtime.dragFrames,
      history: depth,
      inspectionSource: state.inspectionIndex === null ? null : state.inspectionIndex + 1,
      inspectionMutatesCanonicalState: false,
      lastInspectionSeekScore: runtime.lastInspectionSeekScore,
    }, null, 2)
    readback.textContent = JSON.stringify({
      canonical: canonicalSnapshot(canonicalOutput),
      review: {
        frameFps: REVIEW_FPS,
        frameTimeMs: storyTime,
        inspectionSourceIndex: state.inspectionIndex,
        inspectionOnly: true,
        previewWindowOverride: SCENE.inspectionWindow && state.inspectionIndex !== null && FIXTURES[state.fixture].length > 12,
      },
    }, null, 2)
    reviewUrl.value = buildReviewUrl()
    updateHistoryButtons()
    window.__ATELIER_STATE__ = canonicalOutput
    window.__ATELIER_PREVIEW__ = previewOutput
    window.__ATELIER_RUNTIME__ = { ...runtime, history: depth, inspectionIndex: state.inspectionIndex }
    window.__ATELIER_READY__ = true
  } catch (error) {
    pause()
    status.textContent = error instanceof Error ? error.message : String(error)
    status.dataset.error = "true"
  }
}
