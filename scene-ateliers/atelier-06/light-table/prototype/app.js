(function () {
  "use strict"
  const Core = globalThis.LightTableCore
  const stage = document.getElementById("stage")
  const status = document.getElementById("status")
  const params = new URLSearchParams(location.search)
  const ids = [
    "play", "pause", "reset", "time", "time-output", "mode", "duration", "duration-output", "fixture", "ratio", "reduced", "debug",
    "spread", "spread-output", "overlap", "overlap-output", "underlight", "underlight-output", "focus", "nudge", "nudge-output",
  ]
  const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]))
  const ratioMap = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "4:5": 4 / 5 }
  const palettes = [
    ["#ef5b4c", "#14213d", "#fca311", "#f4f1de"],
    ["#176b87", "#64ccc5", "#dafffb", "#04364a"],
    ["#704264", "#bb8493", "#e0c2c0", "#f4f1f0"],
    ["#586f7c", "#b8dbd9", "#f4f4f9", "#2f4550"],
    ["#3a5a40", "#a3b18a", "#dad7cd", "#344e41"],
    ["#7f5539", "#ddb892", "#ede0d4", "#9c6644"],
  ]

  const state = {
    fixtureId: params.get("fixture") || "ordinary-six",
    mode: params.get("mode") || "automatic",
    requestedDurationMs: Number(params.get("duration") || 10_000),
    ratioId: params.get("ratio") || "16:9",
    reducedMotion: params.get("reduced") === "1",
    debug: params.get("debug") === "1",
    time: Number(params.get("t") || 0),
    playing: false,
    manualFocusIndex: null,
    rovingIndex: 0,
    controls: { ...Core.DEFAULT_CONTROLS },
    sources: [],
    compiled: null,
    raf: 0,
    startStamp: 0,
    startTime: 0,
    nodes: new Map(),
  }

  let resizeObserver = null
  function connectStageObserver() {
    if (resizeObserver) return
    resizeObserver = new ResizeObserver(() => render())
    resizeObserver.observe(stage)
  }
  function disconnectStageObserver() {
    if (!resizeObserver) return
    resizeObserver.disconnect()
    resizeObserver = null
  }

  if (params.get("capture") === "1") document.body.classList.add("capture")
  if (params.has("spread")) state.controls.tableSpread = Number(params.get("spread"))
  if (params.has("overlap")) state.controls.overlap = Number(params.get("overlap"))
  if (params.has("underlight")) state.controls.underlightStrength = Number(params.get("underlight"))
  if (params.has("focus")) state.controls.focusBehaviour = params.get("focus")
  if (params.has("nudge")) state.controls.nudgeRestraint = Number(params.get("nudge"))

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
    const ratio = source.ratio
    if (ratio >= 1) {
      canvas.width = 360
      canvas.height = Math.max(90, Math.round(360 / ratio))
    } else {
      canvas.height = 360
      canvas.width = Math.max(90, Math.round(360 * ratio))
    }
    const context = canvas.getContext("2d", { alpha: true })
    const palette = palettes[source.paletteIndex % palettes.length]
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = palette[3]
    context.fillRect(0, 0, canvas.width, canvas.height)
    const third = canvas.width / 3
    context.fillStyle = palette[0]
    context.fillRect(0, 0, third, canvas.height * 0.58)
    context.fillStyle = palette[1]
    context.fillRect(third, 0, third, canvas.height * 0.58)
    context.fillStyle = palette[2]
    context.fillRect(third * 2, 0, canvas.width - third * 2, canvas.height * 0.58)
    const rampY = Math.floor(canvas.height * 0.58)
    for (let x = 0; x < canvas.width; x += 1) {
      const value = Math.round(255 * x / Math.max(1, canvas.width - 1))
      context.fillStyle = `rgb(${value},${value},${value})`
      context.fillRect(x, rampY, 1, Math.max(1, canvas.height - rampY))
    }
    context.strokeStyle = "#000"
    context.lineWidth = 2
    context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2)
    context.fillStyle = "rgba(255,255,255,.90)"
    context.font = `700 ${Math.max(12, canvas.height * 0.08)}px system-ui`
    context.fillText(String(source.paletteIndex + 1).padStart(2, "0"), 12, canvas.height - 14)
    canvas.dataset.sourceHash = hashPixels(canvas)
  }

  function setRovingIndex(index, moveFocus) {
    if (!state.sources.length) return
    state.rovingIndex = Math.max(0, Math.min(state.sources.length - 1, index))
    state.sources.forEach((source, sourceIndex) => {
      const node = state.nodes.get(source.id)
      if (node) node.item.tabIndex = sourceIndex === state.rovingIndex ? 0 : -1
    })
    const target = state.nodes.get(state.sources[state.rovingIndex].id)
    if (moveFocus && target) target.item.focus()
  }

  function createNode(source, index) {
    const item = document.createElement("button")
    item.type = "button"
    item.className = "item"
    item.tabIndex = index === state.rovingIndex ? 0 : -1
    item.setAttribute("aria-label", `${source.name}${source.failed ? ", failed media" : ""}. Press Enter or Space to pin review focus.`)
    item.setAttribute("aria-pressed", "false")
    item.dataset.id = source.id
    item.dataset.index = String(index + 1)

    const light = document.createElement("span")
    light.className = "underlight"
    light.setAttribute("aria-hidden", "true")
    const frame = document.createElement("span")
    frame.className = "frame"
    const mediaWrap = document.createElement("span")
    mediaWrap.className = "media-wrap"
    let canvas = null
    if (source.failed) {
      const failed = document.createElement("span")
      failed.className = "failed"
      failed.textContent = "Source unavailable"
      mediaWrap.appendChild(failed)
    } else {
      canvas = document.createElement("canvas")
      canvas.className = "media"
      canvas.setAttribute("aria-hidden", "true")
      drawSource(canvas, source)
      mediaWrap.appendChild(canvas)
    }
    frame.appendChild(mediaWrap)
    if (source.kind === "video") {
      const badge = document.createElement("span")
      badge.className = "video-badge"
      badge.textContent = "STORY-TIME VIDEO"
      frame.appendChild(badge)
    }
    const debugBox = document.createElement("span")
    debugBox.className = "debug-box"
    frame.appendChild(debugBox)
    item.append(light, frame)
    item.addEventListener("keydown", onItemKeydown)
    item.addEventListener("focus", () => setRovingIndex(index, false))
    item.addEventListener("click", () => {
      state.manualFocusIndex = state.manualFocusIndex === index ? null : index
      render()
    })
    stage.appendChild(item)
    return { item, light, frame, canvas }
  }

  function compile() {
    state.compiled = Core.compileTimeline({ mode: state.mode, durationMs: state.requestedDurationMs }, Math.max(1, state.sources.length), state.controls)
    state.controls = { ...state.compiled.controls }
  }

  function syncSources() {
    state.sources = Core.fixture(state.fixtureId)
    state.nodes.forEach(({ item }) => item.remove())
    state.nodes.clear()
    state.rovingIndex = Math.min(state.rovingIndex, Math.max(0, state.sources.length - 1))
    state.sources.forEach((source, index) => state.nodes.set(source.id, createNode(source, index)))
    setRovingIndex(state.rovingIndex, false)
    compile()
    syncUi()
  }

  function currentEvaluation(time = state.time) {
    return Core.evaluate(state.compiled, time, state.sources, {
      reducedMotion: state.reducedMotion,
      manualFocusIndex: state.manualFocusIndex,
      canvasRatio: ratioMap[state.ratioId],
    })
  }

  function updateTransport() {
    els.play.disabled = state.playing
    els.pause.disabled = !state.playing
  }

  function render() {
    stage.classList.toggle("is-debug", state.debug)
    stage.style.aspectRatio = String(ratioMap[state.ratioId])
    const result = currentEvaluation()
    if (result.apply !== "ok") {
      status.textContent = result.code === "minimum-items"
        ? "Light Table needs at least one source. Nothing is duplicated or invented."
        : "Light Table renders at most 24 sources. All Project media remain preserved."
      updateTransport()
      return result
    }

    const bounds = stage.getBoundingClientRect()
    result.frames.forEach((frameState) => {
      const node = state.nodes.get(frameState.id)
      if (!node) return
      const widthPx = Math.max(36, bounds.width * frameState.width)
      const heightPx = widthPx / frameState.ratio
      node.item.style.width = `${widthPx}px`
      node.item.style.height = `${heightPx}px`
      node.item.style.transform = `translate3d(${frameState.x * bounds.width - widthPx / 2}px,${frameState.y * bounds.height - heightPx / 2}px,0) rotate(${frameState.rotation}deg) scale(${frameState.scale})`
      node.item.style.zIndex = String(frameState.z)
      node.item.dataset.focus = String(frameState.focusWeight > 0.08)
      node.item.setAttribute("aria-pressed", String(state.manualFocusIndex === frameState.sourceIndex))
      node.light.style.opacity = String(frameState.underlight)
      const expansion = frameState.underlightExpansion * 100
      node.light.style.inset = `${-expansion}%`
    })

    els.time.value = String(state.time)
    els["time-output"].value = state.time.toFixed(3)
    const issue = state.compiled.issues[0]
    els["duration-output"].value = `Compiled ${(state.compiled.durationMs / 1000).toFixed(1)} s${issue ? ` · ${issue.code}` : ""}`
    els["duration-output"].dataset.issue = String(Boolean(issue))
    const occlusion = Math.round(result.layoutMetrics.maxOcclusionFraction * 100)
    status.textContent = `${result.phase} · ${result.layout} · focus ${result.focusIndex === null ? "none" : result.focusIndex + 1} · max overlap ${occlusion}%`
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
    state.manualFocusIndex = null
    state.rovingIndex = 0
    state.requestedDurationMs = 10_000
    state.controls = { ...Core.DEFAULT_CONTROLS }
    syncSources()
    render()
  }

  function onItemKeydown(event) {
    const index = state.sources.findIndex((source) => source.id === event.currentTarget.dataset.id)
    let next = index
    if (["ArrowRight", "ArrowDown"].includes(event.key)) next = Math.min(state.sources.length - 1, index + 1)
    else if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = Math.max(0, index - 1)
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = state.sources.length - 1
    else if (event.key === "Escape") {
      state.manualFocusIndex = null
      render()
      event.preventDefault()
      return
    } else return
    event.preventDefault()
    setRovingIndex(next, true)
  }

  function syncRangeOutput(id, digits = 2) {
    els[`${id}-output`].value = Number(els[id].value).toFixed(digits)
  }

  function syncUi() {
    els.time.value = String(state.time)
    els.mode.value = state.mode
    els.duration.value = String(state.requestedDurationMs)
    els.fixture.value = state.fixtureId
    els.ratio.value = state.ratioId
    els.reduced.checked = state.reducedMotion
    els.debug.checked = state.debug
    els.spread.value = String(state.controls.tableSpread)
    els.overlap.value = String(state.controls.overlap)
    els.underlight.value = String(state.controls.underlightStrength)
    els.focus.value = state.controls.focusBehaviour
    els.nudge.value = String(state.controls.nudgeRestraint)
    for (const id of ["spread", "overlap", "underlight", "nudge"]) syncRangeOutput(id)
    updateTransport()
  }

  function recompileAndRender() {
    compile()
    syncUi()
    render()
  }

  els.play.addEventListener("click", play)
  els.pause.addEventListener("click", pause)
  els.reset.addEventListener("click", reset)
  els.time.addEventListener("input", () => { pause(); state.time = Number(els.time.value); render() })
  els.mode.addEventListener("change", () => { state.mode = els.mode.value; recompileAndRender() })
  els.duration.addEventListener("change", () => { state.requestedDurationMs = Number(els.duration.value); recompileAndRender() })
  els.fixture.addEventListener("change", () => { state.fixtureId = els.fixture.value; state.manualFocusIndex = null; state.rovingIndex = 0; syncSources(); render() })
  els.ratio.addEventListener("change", () => { state.ratioId = els.ratio.value; render() })
  els.reduced.addEventListener("change", () => { state.reducedMotion = els.reduced.checked; render() })
  els.debug.addEventListener("change", () => { state.debug = els.debug.checked; render() })
  els.spread.addEventListener("input", () => { state.controls.tableSpread = Number(els.spread.value); recompileAndRender() })
  els.overlap.addEventListener("input", () => { state.controls.overlap = Number(els.overlap.value); recompileAndRender() })
  els.underlight.addEventListener("input", () => { state.controls.underlightStrength = Number(els.underlight.value); recompileAndRender() })
  els.focus.addEventListener("change", () => { state.controls.focusBehaviour = els.focus.value; recompileAndRender() })
  els.nudge.addEventListener("input", () => { state.controls.nudgeRestraint = Number(els.nudge.value); recompileAndRender() })
  connectStageObserver()

  function inspect() {
    const evaluation = currentEvaluation()
    const sourceHashes = {}
    const mediaStyles = {}
    const frameBounds = []
    state.nodes.forEach((node, id) => {
      sourceHashes[id] = node.canvas ? hashPixels(node.canvas) : null
      if (node.canvas) {
        const style = getComputedStyle(node.canvas)
        mediaStyles[id] = { opacity: style.opacity, filter: style.filter, mixBlendMode: style.mixBlendMode }
      }
      const bounds = node.item.getBoundingClientRect()
      frameBounds.push({ id, left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom })
    })
    return {
      sceneId: "light-table",
      evaluation,
      sourceHashes,
      mediaStyles,
      frameBounds,
      dom: {
        items: stage.querySelectorAll(".item").length,
        underlights: stage.querySelectorAll(".underlight").length,
        canvases: stage.querySelectorAll("canvas.media").length,
      },
      accessibility: {
        groupLabel: stage.getAttribute("aria-label"),
        tabIndices: [...stage.querySelectorAll(".item")].map((item) => item.tabIndex),
        roles: [...stage.querySelectorAll(".item")].map((item) => item.getAttribute("role")),
        pressed: [...stage.querySelectorAll(".item")].map((item) => item.getAttribute("aria-pressed")),
      },
      compiled: state.compiled,
    }
  }

  function setTime(value) { pause(); state.time = Number(value); return render() }
  function setFixture(id) { pause(); state.fixtureId = id; state.manualFocusIndex = null; state.rovingIndex = 0; syncSources(); return render() }
  function setCanvas(id) { state.ratioId = id; syncUi(); return render() }
  function setMode(mode) { state.mode = mode; recompileAndRender(); return currentEvaluation() }
  function setDuration(value) { state.requestedDurationMs = Number(value); recompileAndRender(); return state.compiled }
  function setReduced(value) { state.reducedMotion = Boolean(value); syncUi(); return render() }
  function setControl(id, value) {
    const map = { "table-spread": "tableSpread", overlap: "overlap", "underlight-strength": "underlightStrength", "focus-behaviour": "focusBehaviour", "nudge-restraint": "nudgeRestraint" }
    state.controls[map[id]] = value
    recompileAndRender()
    return currentEvaluation()
  }
  function dispose() {
    pause()
    disconnectStageObserver()
    state.manualFocusIndex = null
    state.rovingIndex = 0
    state.nodes.forEach((node) => node.item.remove())
    state.nodes.clear()
    state.sources = []
    state.compiled = null
  }
  function mount() {
    connectStageObserver()
    if (!state.compiled) {
      syncSources()
      render()
    }
    return inspect()
  }

  syncSources()
  render()
  globalThis.__atelier = {
    ready: true,
    sceneId: "light-table",
    inspect,
    setTime,
    setFixture,
    setCanvas,
    setMode,
    setDuration,
    setReduced,
    setControl,
    play,
    pause,
    reset,
    dispose,
    mount,
    compileFor: (intent, controls, count) => Core.compileTimeline(intent, count || Math.max(1, state.sources.length), controls || state.controls),
    evaluateNormalized: (time) => Core.evaluate(state.compiled, time, state.sources, { reducedMotion: state.reducedMotion, canvasRatio: ratioMap[state.ratioId] }),
  }
})()
