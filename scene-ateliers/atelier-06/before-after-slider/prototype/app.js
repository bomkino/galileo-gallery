(function () {
  "use strict"
  const Core = globalThis.BeforeAfterCore
  const stage = document.getElementById("stage")
  const comparison = document.getElementById("comparison")
  const beforePane = comparison.querySelector(".before-pane")
  const afterPane = comparison.querySelector(".after-pane")
  const slider = document.getElementById("slider")
  const divider = document.getElementById("divider")
  const missing = document.getElementById("missing")
  const status = document.getElementById("status")
  const params = new URLSearchParams(location.search)
  const ids = [
    "play", "pause", "reset", "time", "time-output", "mode", "duration", "duration-output", "fixture", "ratio", "direction", "reduced", "debug",
    "initial", "initial-output", "minimum", "minimum-output", "maximum", "maximum-output", "sweep", "sweep-output", "hold", "hold-output", "chrome",
  ]
  const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]))
  const palettes = { before: ["#ef5b4c", "#14213d", "#fca311"], after: ["#176b87", "#64ccc5", "#dafffb"] }

  const state = {
    fixtureId: params.get("fixture") || "aligned-pair",
    ratioId: params.get("ratio") || "16:9",
    direction: params.get("direction") || "forward",
    mode: params.get("mode") || "automatic",
    requestedDurationMs: Number(params.get("duration") || 5_200),
    reduced: params.get("reduced") === "1",
    debug: params.get("debug") === "1",
    time: Number(params.get("t") || 0),
    manualSplit: null,
    controls: { ...Core.DEFAULT_CONTROLS, sweepRange: { ...Core.DEFAULT_CONTROLS.sweepRange } },
    sources: [],
    compiled: null,
    playing: false,
    raf: 0,
    startStamp: 0,
    startTime: 0,
    background: "neutral",
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
    const scale = source.width > 2_500 ? 0.18 : 0.32
    canvas.width = Math.max(160, Math.round(source.width * scale))
    canvas.height = Math.max(120, Math.round(source.height * scale))
    const context = canvas.getContext("2d", { alpha: true })
    context.clearRect(0, 0, canvas.width, canvas.height)
    const palette = palettes[source.variant]
    context.fillStyle = palette[2]
    context.fillRect(0, 0, canvas.width, canvas.height)
    const columns = 12
    const rows = 8
    for (let x = 0; x <= columns; x += 1) {
      context.strokeStyle = x % 3 === 0 ? palette[0] : "rgba(0,0,0,.32)"
      context.lineWidth = x % 3 === 0 ? 2 : 1
      context.beginPath()
      context.moveTo(x * canvas.width / columns, 0)
      context.lineTo(x * canvas.width / columns, canvas.height)
      context.stroke()
    }
    for (let y = 0; y <= rows; y += 1) {
      context.strokeStyle = y % 2 === 0 ? palette[1] : "rgba(255,255,255,.45)"
      context.lineWidth = y % 2 === 0 ? 2 : 1
      context.beginPath()
      context.moveTo(0, y * canvas.height / rows)
      context.lineTo(canvas.width, y * canvas.height / rows)
      context.stroke()
    }
    context.fillStyle = source.variant === "before" ? "rgba(239,91,76,.78)" : "rgba(23,107,135,.78)"
    context.beginPath()
    context.arc(canvas.width * 0.63, canvas.height * 0.46, Math.min(canvas.width, canvas.height) * 0.16, 0, Math.PI * 2)
    context.fill()
    if (source.alphaEdge) {
      const gradient = context.createRadialGradient(canvas.width * 0.3, canvas.height * 0.65, 0, canvas.width * 0.3, canvas.height * 0.65, Math.min(canvas.width, canvas.height) * 0.22)
      gradient.addColorStop(0, palette[0])
      gradient.addColorStop(0.7, palette[0])
      gradient.addColorStop(1, "rgba(0,0,0,0)")
      context.fillStyle = gradient
      context.beginPath()
      context.arc(canvas.width * 0.3, canvas.height * 0.65, Math.min(canvas.width, canvas.height) * 0.22, 0, Math.PI * 2)
      context.fill()
    }
    context.fillStyle = "#111"
    context.font = `700 ${Math.max(12, canvas.height * 0.08)}px system-ui`
    context.fillText(source.variant.toUpperCase(), 12, canvas.height - 14)
    canvas.dataset.sourceHash = hashPixels(canvas)
  }

  function paneContent(pane, source) {
    pane.replaceChildren()
    if (!source) return
    if (source.failed) {
      const placeholder = document.createElement("div")
      placeholder.className = "placeholder"
      placeholder.textContent = `${source.variant} source unavailable`
      pane.appendChild(placeholder)
      return
    }
    const canvas = document.createElement("canvas")
    canvas.className = "media"
    drawSource(canvas, source)
    pane.appendChild(canvas)
    if (source.kind === "video") {
      const badge = document.createElement("span")
      badge.className = "video-badge"
      badge.textContent = "SHARED STORY TIME"
      pane.appendChild(badge)
    }
  }

  function compile() {
    state.compiled = Core.compileTimeline({ mode: state.mode, durationMs: state.requestedDurationMs }, state.controls)
    state.controls = { ...state.compiled.controls, sweepRange: { ...state.compiled.controls.sweepRange } }
  }

  function syncSources() {
    state.sources = Core.fixture(state.fixtureId)
    compile()
    paneContent(beforePane, state.sources[0])
    paneContent(afterPane, state.sources[1])
    syncUi()
  }

  function current() {
    return Core.evaluate(state.compiled, state.time, state.sources, {
      manualSplit: state.manualSplit,
      reducedMotion: state.reduced,
      fit: "contain",
      direction: state.direction,
    })
  }

  function updateTransport() {
    els.play.disabled = state.playing
    els.pause.disabled = !state.playing
  }

  function render() {
    stage.dataset.canvas = state.ratioId
    comparison.classList.toggle("debug", state.debug)
    comparison.classList.toggle("clean", state.controls.comparisonChrome === "clean")
    comparison.classList.toggle("handle-only", state.controls.comparisonChrome === "handle")
    const result = current()
    if (result.apply !== "ok") {
      comparison.hidden = true
      missing.hidden = false
      missing.textContent = result.code === "missing-pair"
        ? "Add a second source. Gallery will not duplicate the first and call it a comparison."
        : "Before / After needs two sources. No media was fabricated."
      status.textContent = missing.textContent
      updateTransport()
      return result
    }

    comparison.hidden = false
    missing.hidden = true
    const percentage = result.split * 100
    beforePane.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`
    divider.style.left = `${percentage}%`
    slider.min = String(Math.round(state.controls.sweepRange.min * 100))
    slider.max = String(Math.round(state.controls.sweepRange.max * 100))
    slider.value = String(Math.round(percentage))
    slider.setAttribute("aria-valuemin", slider.min)
    slider.setAttribute("aria-valuemax", slider.max)
    slider.setAttribute("aria-valuenow", String(Math.round(percentage)))
    slider.setAttribute("aria-valuetext", `${Math.round(percentage)} percent of Before visible`)
    els.time.value = String(state.time)
    els["time-output"].value = state.time.toFixed(3)
    const issue = state.compiled.issues[0]
    els["duration-output"].value = `Compiled ${(state.compiled.durationMs / 1000).toFixed(1)} s${issue ? ` · ${issue.code}` : ""}`
    els["duration-output"].dataset.issue = String(Boolean(issue))
    status.textContent = `${result.phase} · split ${percentage.toFixed(1)}% · ${result.preservedExtraCount ? `${result.preservedExtraCount} extra preserved` : "exact pair"}`
    updateTransport()
    return result
  }

  function play() {
    if (state.playing || !state.compiled) return
    state.playing = true
    state.startStamp = performance.now()
    state.startTime = state.time
    state.manualSplit = null
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
    state.manualSplit = null
    state.requestedDurationMs = 5_200
    state.direction = "forward"
    state.controls = { ...Core.DEFAULT_CONTROLS, sweepRange: { ...Core.DEFAULT_CONTROLS.sweepRange } }
    syncSources()
    render()
  }

  function manual(value) {
    pause()
    state.manualSplit = Math.min(state.controls.sweepRange.max, Math.max(state.controls.sweepRange.min, value))
    render()
  }

  slider.addEventListener("input", () => manual(Number(slider.value) / 100))
  slider.addEventListener("keydown", (event) => {
    let value = state.manualSplit ?? current().split
    if (event.key === "PageUp") value += 0.10
    else if (event.key === "PageDown") value -= 0.10
    else if (event.key === "Home") value = state.controls.sweepRange.min
    else if (event.key === "End") value = state.controls.sweepRange.max
    else return
    event.preventDefault()
    manual(value)
  })

  function syncUi() {
    els.mode.value = state.mode
    els.duration.value = String(state.requestedDurationMs)
    els.fixture.value = state.fixtureId
    els.ratio.value = state.ratioId
    els.direction.value = state.direction
    els.reduced.checked = state.reduced
    els.debug.checked = state.debug
    els.initial.value = String(state.controls.initialSplit)
    els.minimum.value = String(state.controls.sweepRange.min)
    els.maximum.value = String(state.controls.sweepRange.max)
    els.sweep.value = String(state.controls.sweepDurationMs)
    els.hold.value = String(state.controls.turnaroundHoldMs)
    els.chrome.value = state.controls.comparisonChrome
    els["initial-output"].value = `${Math.round(state.controls.initialSplit * 100)}%`
    els["minimum-output"].value = `${Math.round(state.controls.sweepRange.min * 100)}%`
    els["maximum-output"].value = `${Math.round(state.controls.sweepRange.max * 100)}%`
    els["sweep-output"].value = `${(state.controls.sweepDurationMs / 1000).toFixed(2)} s`
    els["hold-output"].value = `${(state.controls.turnaroundHoldMs / 1000).toFixed(2)} s`
    updateTransport()
  }

  function recompileAndRender() {
    compile()
    syncUi()
    render()
  }

  els.play.onclick = play
  els.pause.onclick = pause
  els.reset.onclick = reset
  els.time.oninput = () => { pause(); state.manualSplit = null; state.time = Number(els.time.value); render() }
  els.mode.onchange = () => { state.mode = els.mode.value; recompileAndRender() }
  els.duration.onchange = () => { state.requestedDurationMs = Number(els.duration.value); recompileAndRender() }
  els.fixture.onchange = () => { state.fixtureId = els.fixture.value; state.manualSplit = null; syncSources(); render() }
  els.ratio.onchange = () => { state.ratioId = els.ratio.value; render() }
  els.direction.onchange = () => { state.direction = els.direction.value; state.manualSplit = null; render() }
  els.reduced.onchange = () => { state.reduced = els.reduced.checked; state.manualSplit = null; render() }
  els.debug.onchange = () => { state.debug = els.debug.checked; render() }
  els.initial.oninput = () => { state.controls.initialSplit = Number(els.initial.value); state.manualSplit = null; recompileAndRender() }
  els.minimum.oninput = () => { state.controls.sweepRange.min = Number(els.minimum.value); state.manualSplit = null; recompileAndRender() }
  els.maximum.oninput = () => { state.controls.sweepRange.max = Number(els.maximum.value); state.manualSplit = null; recompileAndRender() }
  els.sweep.oninput = () => { state.controls.sweepDurationMs = Number(els.sweep.value); recompileAndRender() }
  els.hold.oninput = () => { state.controls.turnaroundHoldMs = Number(els.hold.value); recompileAndRender() }
  els.chrome.onchange = () => { state.controls.comparisonChrome = els.chrome.value; recompileAndRender() }

  function inspect() {
    const result = current()
    const beforeRect = beforePane.getBoundingClientRect()
    const afterRect = afterPane.getBoundingClientRect()
    const comparisonRect = comparison.getBoundingClientRect()
    const sourceHashes = {}
    comparison.querySelectorAll("canvas.media").forEach((canvas) => {
      sourceHashes[canvas.parentElement.dataset.side || canvas.parentElement.className] = hashPixels(canvas)
    })
    const mediaStyles = [...comparison.querySelectorAll("canvas.media")].map((canvas) => {
      const style = getComputedStyle(canvas)
      return { opacity: style.opacity, filter: style.filter, mixBlendMode: style.mixBlendMode, objectFit: style.objectFit, objectPosition: style.objectPosition }
    })
    return {
      sceneId: "before-after-slider",
      evaluation: result,
      rects: {
        before: { x: beforeRect.x, y: beforeRect.y, width: beforeRect.width, height: beforeRect.height },
        after: { x: afterRect.x, y: afterRect.y, width: afterRect.width, height: afterRect.height },
        comparison: { x: comparisonRect.x, y: comparisonRect.y, width: comparisonRect.width, height: comparisonRect.height },
      },
      sourceHashes,
      mediaStyles,
      dom: { panes: comparison.querySelectorAll(".pane").length, canvases: comparison.querySelectorAll("canvas.media").length, sliders: comparison.querySelectorAll("input[type=range]").length },
      accessibility: {
        role: slider.getAttribute("role") || slider.tagName.toLowerCase(),
        label: slider.getAttribute("aria-label"),
        min: slider.getAttribute("aria-valuemin"),
        max: slider.getAttribute("aria-valuemax"),
        now: slider.getAttribute("aria-valuenow"),
        valueText: slider.getAttribute("aria-valuetext"),
      },
      compiled: state.compiled,
    }
  }

  function setTime(value) { pause(); state.manualSplit = null; state.time = Number(value); return render() }
  function setFixture(value) { pause(); state.fixtureId = value; state.manualSplit = null; syncSources(); return render() }
  function setCanvas(value) { state.ratioId = value; syncUi(); return render() }
  function setMode(value) { state.mode = value; recompileAndRender(); return current() }
  function setDuration(value) { state.requestedDurationMs = Number(value); recompileAndRender(); return state.compiled }
  function setDirection(value) { state.direction = value; state.manualSplit = null; syncUi(); return render() }
  function setReduced(value) { state.reduced = Boolean(value); state.manualSplit = null; syncUi(); return render() }
  function setManualSplit(value) { manual(Number(value)); return render() }
  function setControl(id, value) {
    if (id === "initial-split") state.controls.initialSplit = Number(value)
    else if (id === "sweep-range") state.controls.sweepRange = { min: Number(value.min), max: Number(value.max) }
    else if (id === "sweep-duration") state.controls.sweepDurationMs = Number(value)
    else if (id === "turnaround-hold") state.controls.turnaroundHoldMs = Number(value)
    else if (id === "comparison-chrome") state.controls.comparisonChrome = value
    state.manualSplit = null
    recompileAndRender()
    return current()
  }
  function setBackground(kind) {
    state.background = kind
    const map = { neutral: "#ecebe6", black: "#000", white: "#fff", red: "#c91d2e", blue: "#1455c0", checker: "repeating-conic-gradient(#fff 0 25%,#999 0 50%) 0/24px 24px" }
    stage.style.background = map[kind] || map.neutral
    return kind
  }
  function dispose() {
    pause()
    state.manualSplit = null
    beforePane.replaceChildren()
    afterPane.replaceChildren()
    state.sources = []
    state.compiled = null
  }
  function mount() {
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
    sceneId: "before-after-slider",
    inspect,
    setTime,
    setFixture,
    setCanvas,
    setMode,
    setDuration,
    setDirection,
    setReduced,
    setManualSplit,
    setControl,
    setBackground,
    play,
    pause,
    reset,
    dispose,
    mount,
    compileFor: (intent, controls) => Core.compileTimeline(intent, controls || state.controls),
    evaluateNormalized: (time) => Core.evaluate(state.compiled, time, state.sources, { reducedMotion: state.reduced, direction: state.direction }),
  }
})()
