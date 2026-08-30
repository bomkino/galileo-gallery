(function () {
  "use strict"

  const Core = globalThis.SlideAnatomyCore
  const stage = document.getElementById("stage")
  const object = document.getElementById("object")
  const proposal = document.getElementById("proposal")
  const structure = document.getElementById("structure")
  const target = document.getElementById("inspection-target")
  const status = document.getElementById("status")
  const params = new URLSearchParams(location.search)
  const ids = [
    "play", "pause", "reset", "time", "time-output", "mode", "duration", "duration-output",
    "fixture", "ratio", "direction", "reduced", "debug", "depth", "depth-output", "spread",
    "spread-output", "perspective", "perspective-output", "hold", "hold-output", "labels",
  ]
  const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]))

  const state = {
    fixtureId: params.get("fixture") || "one-caption",
    ratioId: params.get("ratio") || "16:9",
    mode: params.get("mode") || "automatic",
    requestedDurationMs: Number(params.get("duration") || 7_000),
    direction: params.get("direction") === "reverse" ? "reverse" : "forward",
    reduced: params.get("reduced") === "1",
    debug: params.get("debug") === "1",
    time: Number(params.get("t") || 0),
    manualSeparated: null,
    controls: { ...Core.DEFAULT_CONTROLS },
    sources: [],
    compiled: null,
    playing: false,
    raf: 0,
    startStamp: 0,
    startTime: 0,
    nodes: new Map(),
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
    canvas.width = 720
    canvas.height = 405
    const context = canvas.getContext("2d", { alpha: true })
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = "rgba(33,72,112,.92)"
    context.fillRect(40, 30, 640, 345)
    context.clearRect(120, 90, 130, 130)
    const gradient = context.createLinearGradient(280, 0, 650, 405)
    gradient.addColorStop(0, "rgba(239,91,76,.92)")
    gradient.addColorStop(1, "rgba(252,163,17,.38)")
    context.fillStyle = gradient
    context.fillRect(280, 70, 340, 220)
    context.strokeStyle = "rgba(255,255,255,.8)"
    context.lineWidth = 2
    for (let index = 0; index < 9; index += 1) {
      context.beginPath()
      context.moveTo(40 + index * 80, 30)
      context.lineTo(40 + index * 80, 375)
      context.stroke()
    }
    context.fillStyle = "#fff"
    context.font = "700 34px system-ui"
    context.fillText("INTACT SOURCE", 64, 350)
    canvas.dataset.sourceHash = hashPixels(canvas)
    canvas.setAttribute("aria-label", source.name || "Intact Project source")
  }

  function makePlane(definition, source, index) {
    const plane = document.createElement("div")
    plane.className = `plane ${definition.id}`
    plane.dataset.id = definition.id
    if (definition.id === "source-frame") {
      if (source.failed) {
        const failed = document.createElement("div")
        failed.className = "failed"
        failed.textContent = "Source unavailable"
        plane.appendChild(failed)
      } else {
        const canvas = document.createElement("canvas")
        drawSource(canvas, source)
        plane.appendChild(canvas)
        if (source.kind === "video") {
          const badge = document.createElement("span")
          badge.className = "video-badge"
          badge.textContent = "PROJECT STORY TIME"
          plane.appendChild(badge)
        }
      }
    } else if (definition.id === "caption") {
      plane.textContent = source.caption
    }
    const label = document.createElement("span")
    label.className = "label"
    label.dataset.number = String(index + 1).padStart(2, "0")
    label.textContent = definition.label
    plane.appendChild(label)
    object.appendChild(plane)
    return plane
  }

  function compile() {
    state.compiled = Core.compileTimeline({ mode: state.mode, durationMs: state.requestedDurationMs }, state.controls)
  }

  function syncSources() {
    state.sources = Core.fixture(state.fixtureId)
    compile()
    object.replaceChildren()
    state.nodes.clear()
    const first = state.sources[0]
    if (first && !first.proposal) {
      Core.planeDefinitions(Boolean(first.caption)).forEach((definition, index) => {
        state.nodes.set(definition.id, makePlane(definition, first, index))
      })
    }
    syncUi()
    return render()
  }

  function current() {
    const options = { reducedMotion: state.reduced, direction: state.direction }
    const result = Core.evaluate(state.compiled, state.time, state.sources, options)
    if (state.manualSeparated === null || result.apply !== "ok") return result
    const progress = state.manualSeparated ? 1 : 0
    const pose = Core.poseAt(progress, state.sources[0], state.compiled.controls)
    return {
      ...result,
      separationProgress: progress,
      velocity: 0,
      phase: state.manualSeparated ? "manual-inspection" : "manual-resolved",
      ...pose,
    }
  }

  function updateTransport() {
    els.play.disabled = state.playing
    els.pause.disabled = !state.playing
  }

  function updateInspectionButton() {
    const separated = state.manualSeparated === true
    target.setAttribute("aria-pressed", String(separated))
    target.textContent = separated ? "Resolve source" : "Inspect planes"
  }

  function render() {
    stage.dataset.canvas = state.ratioId
    stage.classList.toggle("debug", state.debug)
    object.classList.toggle("labels-numbers", state.controls.labelVisibility === "numbers-only")
    object.classList.toggle("labels-hidden", state.controls.labelVisibility === "hidden")
    const result = current()

    if (result.apply !== "ok") {
      object.hidden = true
      target.hidden = true
      proposal.hidden = false
      proposal.textContent = result.apply === "blocked-proposal"
        ? "Ordered anatomy layers are blocked. Arbitrary Project media are not semantic layers. This proposal requires AT06-CONTRACT-SOURCE-ROLES."
        : "Slide Anatomy needs one source. No presentation structure was fabricated."
      status.textContent = proposal.textContent
      updateTransport()
      return result
    }

    object.hidden = false
    target.hidden = false
    proposal.hidden = true
    object.style.transform = `rotateX(${result.stage.rotateX}deg) rotateY(${result.stage.rotateY}deg)`
    result.planes.forEach((planeState) => {
      const node = state.nodes.get(planeState.id)
      if (!node) return
      node.style.transform = `translate3d(${planeState.x * 100}%,${planeState.y * 100}%,${planeState.z * 220}px) rotateZ(${planeState.rotation}deg)`
      node.style.zIndex = String(planeState.zOrder)
    })
    structure.replaceChildren(...result.accessibleStructure.map((label) => {
      const item = document.createElement("li")
      item.textContent = label
      return item
    }))
    els.time.value = String(state.time)
    els["time-output"].value = state.time.toFixed(3)
    const issue = state.compiled.issues[0]
    els["duration-output"].value = `Compiled ${(state.compiled.durationMs / 1000).toFixed(1)} s · floor ${(state.compiled.minimumDurationMs / 1000).toFixed(1)} s${issue ? ` · ${issue.code}` : ""}`
    els["duration-output"].dataset.issue = String(Boolean(issue))
    status.textContent = `${result.phase} · separation ${result.separationProgress.toFixed(3)} · ${result.preservedExtraCount ? `${result.preservedExtraCount} extra preserved` : "flat source"}`
    updateInspectionButton()
    updateTransport()
    return result
  }

  function play() {
    if (state.playing || !state.compiled) return
    state.playing = true
    state.manualSeparated = null
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
    state.manualSeparated = null
    state.requestedDurationMs = 7_000
    state.direction = "forward"
    state.controls = { ...Core.DEFAULT_CONTROLS }
    syncSources()
  }

  function toggleInspection() {
    pause()
    state.manualSeparated = state.manualSeparated === true ? false : true
    render()
  }

  target.addEventListener("click", toggleInspection)
  target.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    pause()
    state.manualSeparated = false
    render()
  })

  function syncUi() {
    els.mode.value = state.mode
    els.duration.value = String(state.requestedDurationMs)
    els.fixture.value = state.fixtureId
    els.ratio.value = state.ratioId
    els.direction.value = state.direction
    els.reduced.checked = state.reduced
    els.debug.checked = state.debug
    els.depth.value = String(state.controls.separationDepth)
    els.spread.value = String(state.controls.lateralSpread)
    els.perspective.value = String(state.controls.perspective)
    els.hold.value = String(state.controls.inspectionHoldMs)
    els.labels.value = state.controls.labelVisibility
    els["depth-output"].value = `${Math.round(state.controls.separationDepth * 100)}%`
    els["spread-output"].value = `${Math.round(state.controls.lateralSpread * 100)}%`
    els["perspective-output"].value = `${Math.round(state.controls.perspective * 100)}%`
    els["hold-output"].value = `${(state.controls.inspectionHoldMs / 1000).toFixed(2)} s`
    updateInspectionButton()
    updateTransport()
  }

  function recompileAndRender() {
    compile()
    syncUi()
    return render()
  }

  els.play.onclick = play
  els.pause.onclick = pause
  els.reset.onclick = reset
  els.time.oninput = () => { pause(); state.manualSeparated = null; state.time = Number(els.time.value); render() }
  els.mode.onchange = () => { state.mode = els.mode.value; recompileAndRender() }
  els.duration.onchange = () => { state.requestedDurationMs = Number(els.duration.value); recompileAndRender() }
  els.fixture.onchange = () => { state.fixtureId = els.fixture.value; state.manualSeparated = null; syncSources() }
  els.ratio.onchange = () => { state.ratioId = els.ratio.value; render() }
  els.direction.onchange = () => { state.direction = els.direction.value; state.manualSeparated = null; render() }
  els.reduced.onchange = () => { state.reduced = els.reduced.checked; state.manualSeparated = null; render() }
  els.debug.onchange = () => { state.debug = els.debug.checked; render() }
  els.depth.oninput = () => { state.controls.separationDepth = Number(els.depth.value); recompileAndRender() }
  els.spread.oninput = () => { state.controls.lateralSpread = Number(els.spread.value); recompileAndRender() }
  els.perspective.oninput = () => { state.controls.perspective = Number(els.perspective.value); recompileAndRender() }
  els.hold.oninput = () => { state.controls.inspectionHoldMs = Number(els.hold.value); recompileAndRender() }
  els.labels.onchange = () => { state.controls.labelVisibility = els.labels.value; recompileAndRender() }

  function inspect() {
    const result = current()
    const canvas = object.querySelector("canvas")
    const style = canvas ? getComputedStyle(canvas) : null
    return {
      sceneId: "slide-anatomy-object",
      evaluation: result,
      sourceHash: canvas ? hashPixels(canvas) : null,
      sourceInitialHash: canvas ? canvas.dataset.sourceHash : null,
      mediaStyle: style ? { opacity: style.opacity, filter: style.filter, mixBlendMode: style.mixBlendMode, objectFit: style.objectFit, objectPosition: style.objectPosition } : null,
      planeTransforms: Object.fromEntries([...state.nodes].map(([id, node]) => [id, node.style.transform])),
      dom: { planes: object.querySelectorAll(".plane").length, canvases: object.querySelectorAll("canvas").length, labels: object.querySelectorAll(".label").length },
      accessibility: {
        structure: [...structure.children].map((item) => item.textContent),
        targetLabel: target.textContent,
        targetPressed: target.getAttribute("aria-pressed"),
        targetHidden: target.hidden,
      },
      compiled: state.compiled,
    }
  }

  function setTime(value) { pause(); state.manualSeparated = null; state.time = Number(value); return render() }
  function setFixture(value) { pause(); state.fixtureId = value; state.manualSeparated = null; return syncSources() }
  function setCanvas(value) { state.ratioId = value; syncUi(); return render() }
  function setMode(value) { state.mode = value; return recompileAndRender() }
  function setDuration(value) { state.requestedDurationMs = Number(value); recompileAndRender(); return state.compiled }
  function setDirection(value) { state.direction = value; state.manualSeparated = null; syncUi(); return render() }
  function setReduced(value) { state.reduced = Boolean(value); state.manualSeparated = null; syncUi(); return render() }
  function setManualSeparated(value) { pause(); state.manualSeparated = Boolean(value); return render() }
  function setControl(id, value) {
    const map = { "separation-depth": "separationDepth", "lateral-spread": "lateralSpread", perspective: "perspective", "inspection-hold": "inspectionHoldMs", "label-visibility": "labelVisibility" }
    if (!Object.prototype.hasOwnProperty.call(map, id)) throw new Error(`Unknown control: ${id}`)
    state.controls[map[id]] = value
    return recompileAndRender()
  }
  function dispose() { pause(); state.manualSeparated = null; object.replaceChildren(); structure.replaceChildren(); state.nodes.clear(); state.sources = []; state.compiled = null }
  function mount() { if (!state.compiled) syncSources(); return inspect() }

  syncSources()
  globalThis.__atelier = {
    ready: true,
    sceneId: "slide-anatomy-object",
    inspect,
    setTime,
    setFixture,
    setCanvas,
    setMode,
    setDuration,
    setDirection,
    setReduced,
    setManualSeparated,
    setControl,
    play,
    pause,
    reset,
    dispose,
    mount,
    compileFor: (intent, controls) => Core.compileTimeline(intent, controls || state.controls),
    evaluateNormalized: (time) => Core.evaluate(state.compiled, time, state.sources, { reducedMotion: state.reduced, direction: state.direction }),
    poseAt: (progress) => Core.poseAt(progress, state.sources[0], state.compiled.controls),
  }
})()
