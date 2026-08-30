(function () {
  "use strict"

  const Core = globalThis.TheBuildCore
  const stage = document.getElementById("stage")
  const object = document.getElementById("build-object")
  const frame = document.getElementById("frame")
  const guides = document.getElementById("guides")
  const sourceWindow = document.getElementById("source-window")
  const caption = document.getElementById("caption")
  const cursor = document.getElementById("cursor")
  const proposal = document.getElementById("proposal")
  const story = document.getElementById("story")
  const emptyHint = document.getElementById("empty-hint")
  const status = document.getElementById("status")
  const params = new URLSearchParams(location.search)
  const ids = [
    "play", "pause", "reset", "time", "time-output", "mode", "duration", "duration-output",
    "fixture", "ratio", "direction", "reduced", "debug", "detail", "guide-density",
    "cursor-visibility", "beat-hold", "beat-hold-output", "finale-hold", "finale-hold-output",
  ]
  const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]))

  const state = {
    fixtureId: params.get("fixture") || "one-caption",
    ratioId: params.get("ratio") || "16:9",
    mode: params.get("mode") || "automatic",
    requestedDurationMs: Number(params.get("duration") || 11_600),
    direction: params.get("direction") === "reverse" ? "reverse" : "forward",
    reduced: params.get("reduced") === "1",
    debug: params.get("debug") === "1",
    time: Number(params.get("t") || 0),
    controls: { ...Core.DEFAULT_CONTROLS },
    sources: [],
    compiled: null,
    playing: false,
    raf: 0,
    startStamp: 0,
    startTime: 0,
    guideSignature: "",
  }
  if (params.get("capture") === "1") document.body.classList.add("capture")

  function hashPixels(canvas) {
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data
    let hash = 2166136261
    for (let index = 0; index < data.length; index += 1) {
      hash ^= data[index]
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16).padStart(8, "0")
  }

  function drawSource(canvas, source) {
    canvas.width = 960
    canvas.height = 540
    const context = canvas.getContext("2d", { alpha: true })
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = "rgba(27,58,96,.94)"
    context.fillRect(42, 34, 876, 472)
    context.clearRect(92, 84, 160, 160)
    const gradient = context.createLinearGradient(260, 40, 880, 500)
    gradient.addColorStop(0, "rgba(241,91,75,.96)")
    gradient.addColorStop(.55, "rgba(248,169,32,.72)")
    gradient.addColorStop(1, "rgba(95,182,165,.44)")
    context.fillStyle = gradient
    context.fillRect(286, 72, 568, 330)
    context.strokeStyle = "rgba(255,255,255,.72)"
    context.lineWidth = 2
    for (let index = 0; index < 12; index += 1) {
      context.beginPath()
      context.moveTo(42 + index * 73, 34)
      context.lineTo(42 + index * 73, 506)
      context.stroke()
    }
    for (let index = 0; index < 7; index += 1) {
      context.beginPath()
      context.moveTo(42, 34 + index * 67)
      context.lineTo(918, 34 + index * 67)
      context.stroke()
    }
    context.fillStyle = "#fff"
    context.font = "700 42px system-ui"
    context.fillText("INTACT FINISHED SOURCE", 72, 470)
    canvas.dataset.sourceHash = hashPixels(canvas)
    canvas.setAttribute("aria-label", source.name || "Intact finished Project source")
  }

  function makeSource(source) {
    sourceWindow.replaceChildren()
    if (source.failed) {
      const failed = document.createElement("div")
      failed.className = "failed"
      failed.textContent = "Primary source unavailable"
      sourceWindow.appendChild(failed)
      return
    }
    const canvas = document.createElement("canvas")
    drawSource(canvas, source)
    sourceWindow.appendChild(canvas)
    if (source.kind === "video") {
      const badge = document.createElement("span")
      badge.className = "video-badge"
      badge.textContent = "PROJECT STORY TIME"
      sourceWindow.appendChild(badge)
    }
  }

  function contextForSources() {
    return { hasCaption: Boolean(state.sources[0] && state.sources[0].caption) }
  }

  function compile() {
    state.compiled = Core.compileTimeline({ mode: state.mode, durationMs: state.requestedDurationMs }, state.controls, contextForSources())
  }

  function syncSources() {
    state.sources = Core.fixture(state.fixtureId)
    const first = state.sources[0]
    if (first && !first.proposal) {
      makeSource(first)
      caption.textContent = first.caption || ""
    } else {
      sourceWindow.replaceChildren()
      caption.textContent = ""
    }
    state.guideSignature = ""
    compile()
    syncUi()
    return render()
  }

  function current() {
    return Core.evaluate(state.compiled, state.time, state.sources, { reducedMotion: state.reduced, direction: state.direction })
  }

  function renderGuides(result) {
    const signature = result.guideLines.map((line) => `${line.id}:${line.position}`).join("|")
    if (signature === state.guideSignature) return
    state.guideSignature = signature
    guides.replaceChildren(...result.guideLines.map((line) => {
      const node = document.createElement("i")
      node.className = `guide-line ${line.axis}`
      if (line.axis === "v") node.style.left = `${line.position * 100}%`
      else node.style.top = `${line.position * 100}%`
      return node
    }))
  }

  function storyLabel(id) {
    const labels = {
      "empty-stage-hold": "Empty presentation frame",
      "frame-apparatus": "Presentation frame placed",
      "frame-hold": "Frame held for reading",
      "placement-guides": "Known canvas guides placed",
      "guides-hold": "Guide relationship held",
      "alignment-check": "Known alignment scaffold inspected",
      "source-window": "Finished source placed intact",
      "source-hold": "Source placement held",
      "caption-if-known": "Project caption placed",
      cleanup: "Presentation scaffolding removed",
      "resolved-hold": "Exact finished source held",
      deconstruct: "Presentation apparatus removed for loop",
    }
    return labels[id] || id
  }

  function updateStory() {
    story.replaceChildren(...state.compiled.segments.map((segment) => {
      const item = document.createElement("li")
      item.textContent = storyLabel(segment.id)
      return item
    }))
  }

  function updateTransport() {
    els.play.disabled = state.playing
    els.pause.disabled = !state.playing
    els.duration.disabled = state.mode === "automatic"
  }

  function render() {
    stage.dataset.canvas = state.ratioId
    stage.classList.toggle("debug", state.debug)
    const result = current()
    if (result.apply !== "ok") {
      object.hidden = true
      proposal.hidden = false
      proposal.textContent = result.apply === "blocked-proposal"
        ? "These files are not marked as authored build stages. Gallery preserved them. AT06-CONTRACT-AUTHORED-STAGES is required before they can become construction beats."
        : "The Build needs one primary source. No construction history was fabricated."
      status.textContent = proposal.textContent
      updateTransport()
      return result
    }

    object.hidden = false
    proposal.hidden = true
    renderGuides(result)
    frame.style.opacity = String(result.apparatus.frameOpacity)
    frame.style.transform = `translateY(${result.apparatus.frameY * 100}%) scale(${result.apparatus.frameScale})`
    guides.style.opacity = String(result.apparatus.guideOpacity)
    sourceWindow.style.clipPath = `inset(0 ${result.apparatus.sourceClipRight * 100}% 0 0)`
    caption.style.opacity = String(result.apparatus.captionOpacity)
    caption.hidden = !result.source.caption
    cursor.style.opacity = String(result.cursor.opacity)
    cursor.style.left = `${result.cursor.x * 100}%`
    cursor.style.top = `${result.cursor.y * 100}%`
    emptyHint.hidden = result.frameProgress > .005 || result.sourceReveal > .005
    updateStory()
    els.time.value = String(state.time)
    els["time-output"].value = state.time.toFixed(3)
    const issue = state.compiled.issues[0]
    const captionBasis = state.compiled.context.hasCaption ? "caption source" : "no caption"
    els["duration-output"].value = `Compiled ${(state.compiled.durationMs / 1000).toFixed(1)} s · floor ${(state.compiled.minimumDurationMs / 1000).toFixed(1)} s · ${captionBasis}${issue ? ` · ${issue.code}` : ""}`
    els["duration-output"].dataset.issue = String(Boolean(issue))
    status.textContent = `${result.phaseId} · source ${result.sourceReveal.toFixed(3)} · guides ${result.guideProgress.toFixed(3)}${result.preservedExtraCount ? ` · ${result.preservedExtraCount} extra preserved` : ""}`
    updateTransport()
    return result
  }

  function play() {
    if (state.playing || !state.compiled) return
    state.playing = true
    state.startStamp = performance.now()
    state.startTime = state.time
    updateTransport()
    const tick = (now) => {
      if (!state.playing) return
      state.time = (state.startTime + (now - state.startStamp) / state.compiled.durationMs) % 1
      render()
      state.raf = requestAnimationFrame(tick)
    }
    state.raf = requestAnimationFrame(tick)
  }

  function pause() {
    state.playing = false
    cancelAnimationFrame(state.raf)
    updateTransport()
  }

  function reset() {
    pause()
    state.time = 0
    state.requestedDurationMs = 11_600
    state.direction = "forward"
    state.controls = { ...Core.DEFAULT_CONTROLS }
    syncSources()
  }

  function scrubTo(value) {
    pause()
    state.time = Math.min(1, Math.max(0, Number(value) || 0))
    render()
  }

  function onStageKeydown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault()
      if (state.playing) pause()
      else play()
      return
    }
    let value = state.time
    if (event.key === "ArrowRight" || event.key === "ArrowUp") value += .01
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") value -= .01
    else if (event.key === "PageUp") value += .1
    else if (event.key === "PageDown") value -= .1
    else if (event.key === "Home") value = 0
    else if (event.key === "End") value = 1
    else return
    event.preventDefault()
    scrubTo(value)
  }

  function syncUi() {
    els.mode.value = state.mode
    els.duration.value = String(state.requestedDurationMs)
    els.fixture.value = state.fixtureId
    els.ratio.value = state.ratioId
    els.direction.value = state.direction
    els.reduced.checked = state.reduced
    els.debug.checked = state.debug
    els.detail.value = state.controls.buildDetail
    els["guide-density"].value = state.controls.guideDensity
    els["cursor-visibility"].value = state.controls.cursorVisibility
    els["beat-hold"].value = String(state.controls.perBeatHoldMs)
    els["finale-hold"].value = String(state.controls.finaleHoldMs)
    els["beat-hold-output"].value = `${(state.controls.perBeatHoldMs / 1000).toFixed(2)} s`
    els["finale-hold-output"].value = `${(state.controls.finaleHoldMs / 1000).toFixed(2)} s`
    updateTransport()
  }

  function recompileAndRender() {
    compile()
    state.guideSignature = ""
    syncUi()
    return render()
  }

  stage.addEventListener("keydown", onStageKeydown)
  els.play.onclick = play
  els.pause.onclick = pause
  els.reset.onclick = reset
  els.time.oninput = () => { pause(); state.time = Number(els.time.value); render() }
  els.mode.onchange = () => { state.mode = els.mode.value; recompileAndRender() }
  els.duration.onchange = () => { state.requestedDurationMs = Number(els.duration.value); recompileAndRender() }
  els.fixture.onchange = () => { state.fixtureId = els.fixture.value; syncSources() }
  els.ratio.onchange = () => { state.ratioId = els.ratio.value; render() }
  els.direction.onchange = () => { state.direction = els.direction.value; render() }
  els.reduced.onchange = () => { state.reduced = els.reduced.checked; render() }
  els.debug.onchange = () => { state.debug = els.debug.checked; render() }
  els.detail.onchange = () => { state.controls.buildDetail = els.detail.value; recompileAndRender() }
  els["guide-density"].onchange = () => { state.controls.guideDensity = els["guide-density"].value; recompileAndRender() }
  els["cursor-visibility"].onchange = () => { state.controls.cursorVisibility = els["cursor-visibility"].value; recompileAndRender() }
  els["beat-hold"].oninput = () => { state.controls.perBeatHoldMs = Number(els["beat-hold"].value); recompileAndRender() }
  els["finale-hold"].oninput = () => { state.controls.finaleHoldMs = Number(els["finale-hold"].value); recompileAndRender() }

  function inspect() {
    const result = current()
    const canvas = sourceWindow.querySelector("canvas")
    const style = canvas ? getComputedStyle(canvas) : null
    return {
      sceneId: "the-build",
      evaluation: result,
      sourceHash: canvas ? hashPixels(canvas) : null,
      sourceInitialHash: canvas ? canvas.dataset.sourceHash : null,
      mediaStyle: style ? { opacity: style.opacity, filter: style.filter, mixBlendMode: style.mixBlendMode, objectFit: style.objectFit, objectPosition: style.objectPosition } : null,
      dom: { frames: object.querySelectorAll(".frame").length, guides: guides.children.length, canvases: sourceWindow.querySelectorAll("canvas").length, cursors: object.querySelectorAll(".cursor").length },
      accessibility: { story: [...story.children].map((item) => item.textContent), status: status.textContent, emptyHint: emptyHint.textContent, emptyHintHidden: emptyHint.hidden },
      compiled: state.compiled,
    }
  }

  function setTime(value) { pause(); state.time = Number(value); return render() }
  function setFixture(value) { pause(); state.fixtureId = value; return syncSources() }
  function setCanvas(value) { state.ratioId = value; syncUi(); return render() }
  function setMode(value) { state.mode = value; return recompileAndRender() }
  function setDuration(value) { state.requestedDurationMs = Number(value); recompileAndRender(); return state.compiled }
  function setDirection(value) { state.direction = value; syncUi(); return render() }
  function setReduced(value) { state.reduced = Boolean(value); syncUi(); return render() }
  function setControl(id, value) {
    const map = { "build-detail": "buildDetail", "guide-density": "guideDensity", "cursor-visibility": "cursorVisibility", "per-beat-hold": "perBeatHoldMs", "finale-hold": "finaleHoldMs" }
    if (!Object.prototype.hasOwnProperty.call(map, id)) throw new Error(`Unknown control: ${id}`)
    state.controls[map[id]] = value
    return recompileAndRender()
  }
  function compileFor(intent, controls, context) { return Core.compileTimeline(intent, controls || state.controls, context || contextForSources()) }
  function dispose() { pause(); sourceWindow.replaceChildren(); guides.replaceChildren(); story.replaceChildren(); state.sources = []; state.compiled = null; state.guideSignature = "" }
  function mount() { if (!state.compiled) syncSources(); return inspect() }

  syncSources()
  globalThis.__atelier = {
    ready: true,
    sceneId: "the-build",
    inspect,
    setTime,
    setFixture,
    setCanvas,
    setMode,
    setDuration,
    setDirection,
    setReduced,
    setControl,
    play,
    pause,
    reset,
    dispose,
    mount,
    compileFor,
    evaluateNormalized: (time) => Core.evaluate(state.compiled, time, state.sources, { reducedMotion: state.reduced, direction: state.direction }),
  }
})()
