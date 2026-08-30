(function (root, factory) {
  const api = factory()
  if (typeof module === "object" && module.exports) module.exports = api
  root.TheBuildCore = api
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict"

  const MAX_DURATION_MS = 60_000
  const VALID_MODES = new Set(["automatic", "fixed-duration", "directed"])
  const DEFAULT_CONTROLS = Object.freeze({
    buildDetail: "regular",
    guideDensity: "standard",
    cursorVisibility: "off",
    perBeatHoldMs: 600,
    finaleHoldMs: 2_000,
  })

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))
  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor
  const ease = (value) => { const x = clamp(value, 0, 1); return x * x * x * (10 + x * (-15 + 6 * x)) }
  const dease = (value) => { const x = clamp(value, 0, 1); return 30 * x * x * (x - 1) * (x - 1) }

  function finiteNumber(value, fallback) {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : fallback
  }

  function boundedNumber(value, fallback, minimum, maximum) {
    return clamp(finiteNumber(value, fallback), minimum, maximum)
  }

  function normalizeStoryTime(value) {
    const numeric = finiteNumber(value, 0)
    if (numeric === 1) return { value: 1, sample: 0, terminal: true }
    const sample = numeric >= 0 && numeric < 1 ? numeric : mod(numeric, 1)
    return { value: sample, sample, terminal: false }
  }

  function normalizeControls(input) {
    const source = Object.assign({}, DEFAULT_CONTROLS, input || {})
    return Object.freeze({
      buildDetail: ["concise", "regular", "detailed"].includes(source.buildDetail) ? source.buildDetail : DEFAULT_CONTROLS.buildDetail,
      guideDensity: ["minimal", "standard", "technical"].includes(source.guideDensity) ? source.guideDensity : DEFAULT_CONTROLS.guideDensity,
      cursorVisibility: ["off", "causal"].includes(source.cursorVisibility) ? source.cursorVisibility : DEFAULT_CONTROLS.cursorVisibility,
      perBeatHoldMs: Math.round(boundedNumber(source.perBeatHoldMs, DEFAULT_CONTROLS.perBeatHoldMs, 420, 1_600)),
      finaleHoldMs: Math.round(boundedNumber(source.finaleHoldMs, DEFAULT_CONTROLS.finaleHoldMs, 1_200, 5_000)),
    })
  }

  function normalizeContext(input) {
    return Object.freeze({ hasCaption: !input || input.hasCaption !== false })
  }

  function segment(id, base, min, kind, group) {
    return { id, base, min, kind, group }
  }

  function beatBlueprint(controlsInput, contextInput) {
    const controls = normalizeControls(controlsInput)
    const context = normalizeContext(contextInput)
    const hold = controls.perBeatHoldMs
    let beats

    if (controls.buildDetail === "concise") {
      beats = [
        segment("empty-stage-hold", 420, 320, "hold", "opening"),
        segment("frame-apparatus", 900, 650, "move", "opening"),
        segment("placement-guides", 850, 600, "move", "opening"),
        segment("source-window", 1_400, 1_050, "move", "middle"),
        segment("source-hold", Math.max(500, hold), 420, "hold", "middle"),
        segment("cleanup", 800, 600, "move", "finale"),
        segment("resolved-hold", controls.finaleHoldMs, 1_200, "hold", "middle"),
        segment("deconstruct", 1_000, 750, "move", "finale"),
      ]
    } else {
      beats = [
        segment("empty-stage-hold", 600, 420, "hold", "opening"),
        segment("frame-apparatus", 1_100, 760, "move", "opening"),
        segment("frame-hold", Math.max(420, hold - 100), 420, "hold", "opening"),
        segment("placement-guides", 1_100, 760, "move", "opening"),
        segment("guides-hold", hold, 420, "hold", "middle"),
        segment("source-window", 1_700, 1_200, "move", "middle"),
        segment("source-hold", hold + 200, 520, "hold", "middle"),
        segment("cleanup", 1_000, 700, "move", "finale"),
        segment("resolved-hold", controls.finaleHoldMs, 1_200, "hold", "middle"),
        segment("deconstruct", 1_300, 900, "move", "finale"),
      ]
      if (controls.buildDetail === "detailed") {
        const sourceIndex = beats.findIndex((beat) => beat.id === "source-window")
        beats.splice(sourceIndex, 0, segment("alignment-check", 800, 520, "hold", "middle"))
      }
    }

    if (context.hasCaption) {
      const cleanupIndex = beats.findIndex((beat) => beat.id === "cleanup")
      beats.splice(cleanupIndex, 0, segment("caption-if-known", controls.buildDetail === "concise" ? 800 : 900, 600, "move", "middle"))
    }
    return beats
  }

  function distribute(targetDurationMs, beats, preferredDurations, requestedPaceScales) {
    const minimumDurationMs = beats.reduce((sum, beat) => sum + beat.min, 0)
    const target = Math.max(minimumDurationMs, Math.round(targetDurationMs))
    const preferred = preferredDurations || beats.map((beat) => beat.base)
    const flexible = beats.map((beat, index) => Math.max(0, preferred[index] - beat.min))
    const flexibleTotal = flexible.reduce((sum, value) => sum + value, 0)
    const extraTotal = target - minimumDurationMs
    let assigned = 0
    return beats.map((beat, index) => {
      const extra = index === beats.length - 1
        ? extraTotal - assigned
        : flexibleTotal > 0
          ? Math.floor(extraTotal * flexible[index] / flexibleTotal)
          : Math.floor(extraTotal / beats.length)
      assigned += extra
      const durationMs = beat.min + extra
      const requestedPaceScale = requestedPaceScales ? requestedPaceScales[index] : beat.base / Math.max(1, preferred[index])
      return Object.assign({}, beat, {
        durationMs,
        requestedPaceScale,
        achievedPaceScale: beat.base / Math.max(1, durationMs),
      })
    })
  }

  function compileTimeline(intent, controlsInput, contextInput) {
    const controls = normalizeControls(controlsInput)
    const context = normalizeContext(contextInput)
    const issues = []
    const rawMode = intent && typeof intent.mode === "string" ? intent.mode : "automatic"
    const mode = VALID_MODES.has(rawMode) ? rawMode : "automatic"
    if (mode !== rawMode) issues.push({ code: "invalid-timeline-mode", requestedMode: rawMode, compiledMode: mode })

    const beats = beatBlueprint(controls, context)
    const automaticDurationMs = beats.reduce((sum, beat) => sum + beat.base, 0)
    const minimumDurationMs = beats.reduce((sum, beat) => sum + beat.min, 0)
    const directedPaceScales = beats.map((beat) => beat.kind === "move" && (beat.group === "opening" || beat.group === "finale") ? 2 : 1)
    const directedPreferred = beats.map((beat, index) => Math.max(beat.min, Math.round(beat.base / directedPaceScales[index])))
    const directedDurationMs = directedPreferred.reduce((sum, value) => sum + value, 0)

    const hasRequested = intent && Object.prototype.hasOwnProperty.call(intent, "durationMs")
    const rawRequested = hasRequested ? Number(intent.durationMs) : NaN
    let requested = Number.isFinite(rawRequested) ? rawRequested : (mode === "directed" ? directedDurationMs : automaticDurationMs)
    if (mode !== "automatic" && hasRequested && !Number.isFinite(rawRequested)) {
      issues.push({ code: "invalid-duration", requestedDurationMs: null, compiledDurationMs: requested })
    }
    if (requested > MAX_DURATION_MS) {
      issues.push({ code: "duration-above-supported-maximum", requestedDurationMs: requested, maximumDurationMs: MAX_DURATION_MS })
      requested = MAX_DURATION_MS
    }

    let targetDurationMs = automaticDurationMs
    let preferred = beats.map((beat) => beat.base)
    if (mode === "fixed-duration") {
      targetDurationMs = requested
      if (targetDurationMs < minimumDurationMs) {
        issues.push({ code: "duration-below-readable-minimum", requestedDurationMs: targetDurationMs, minimumDurationMs, compiledDurationMs: minimumDurationMs })
        targetDurationMs = minimumDurationMs
      } else if (targetDurationMs < automaticDurationMs) {
        issues.push({ code: "fixed-duration-compression", requestedDurationMs: targetDurationMs, automaticDurationMs, minimumDurationMs })
      }
    } else if (mode === "directed") {
      preferred = directedPreferred
      targetDurationMs = requested
      if (targetDurationMs < minimumDurationMs) {
        issues.push({ code: "duration-below-readable-minimum", requestedDurationMs: targetDurationMs, minimumDurationMs, compiledDurationMs: minimumDurationMs })
        targetDurationMs = minimumDurationMs
      } else if (targetDurationMs < directedDurationMs) {
        issues.push({ code: "directed-duration-compromise", requestedDurationMs: targetDurationMs, directedDurationMs, minimumDurationMs })
      }
    }

    const durations = distribute(targetDurationMs, beats, preferred, mode === "directed" ? directedPaceScales : null)
    const durationMs = durations.reduce((sum, beat) => sum + beat.durationMs, 0)
    let cursor = 0
    const segments = durations.map((beat, index) => {
      const startMs = cursor
      cursor += beat.durationMs
      return Object.freeze(Object.assign({}, beat, {
        index,
        startMs,
        endMs: cursor,
        start: startMs / durationMs,
        end: cursor / durationMs,
      }))
    })

    return Object.freeze({
      sceneId: "the-build",
      mode,
      durationMs,
      automaticDurationMs,
      minimumDurationMs,
      directedDurationMs,
      controls,
      context,
      segments: Object.freeze(segments),
      issues: Object.freeze(issues),
    })
  }

  function guidesFor(density) {
    if (density === "minimal") return [{ id: "v-center", axis: "v", position: .5 }, { id: "h-center", axis: "h", position: .5 }]
    if (density === "technical") return [
      { id: "v-safe-left", axis: "v", position: .1 }, { id: "v-third-left", axis: "v", position: 1 / 3 },
      { id: "v-center", axis: "v", position: .5 }, { id: "v-third-right", axis: "v", position: 2 / 3 },
      { id: "v-safe-right", axis: "v", position: .9 }, { id: "h-safe-top", axis: "h", position: .1 },
      { id: "h-center", axis: "h", position: .5 }, { id: "h-safe-bottom", axis: "h", position: .9 },
    ]
    return [
      { id: "v-safe-left", axis: "v", position: .1 }, { id: "v-center", axis: "v", position: .5 },
      { id: "v-safe-right", axis: "v", position: .9 }, { id: "h-center", axis: "h", position: .5 },
    ]
  }

  function baseState() {
    return { frameProgress: 0, guideProgress: 0, sourceReveal: 0, captionProgress: 0, cleanupProgress: 0, resolvedProgress: 0, velocity: 0 }
  }

  function applyCompleted(state, id, hasCaption) {
    if (["frame-apparatus", "frame-hold"].includes(id)) state.frameProgress = 1
    if (["placement-guides", "guides-hold", "alignment-check"].includes(id)) { state.frameProgress = 1; state.guideProgress = 1 }
    if (["source-window", "source-hold"].includes(id)) { state.frameProgress = 1; state.guideProgress = 1; state.sourceReveal = 1 }
    if (id === "caption-if-known") { state.frameProgress = 1; state.guideProgress = 1; state.sourceReveal = 1; state.captionProgress = hasCaption ? 1 : 0 }
    if (id === "cleanup") { state.frameProgress = 1; state.guideProgress = 0; state.sourceReveal = 1; state.captionProgress = hasCaption ? 1 : 0; state.cleanupProgress = 1; state.resolvedProgress = 1 }
    if (id === "resolved-hold") { state.frameProgress = 1; state.guideProgress = 0; state.sourceReveal = 1; state.captionProgress = hasCaption ? 1 : 0; state.cleanupProgress = 1; state.resolvedProgress = 1 }
    if (id === "deconstruct") { state.frameProgress = 0; state.guideProgress = 0; state.sourceReveal = 0; state.captionProgress = 0; state.cleanupProgress = 1; state.resolvedProgress = 0 }
  }

  function stateFor(compiled, time, hasCaption, reverse) {
    const story = normalizeStoryTime(time)
    if (story.terminal) return Object.assign(baseState(), { phaseId: "seam", phaseIndex: compiled.segments.length, phaseProgress: 1, normalizedTime: 1 })
    const sampleTime = reverse ? (story.sample === 0 ? 0 : 1 - story.sample) : story.sample
    const state = baseState()
    const active = compiled.segments.find((segment) => sampleTime < segment.end) || compiled.segments[compiled.segments.length - 1]
    for (const segment of compiled.segments) {
      if (segment.index >= active.index) break
      applyCompleted(state, segment.id, hasCaption)
    }
    const span = Math.max(1e-9, active.end - active.start)
    const local = clamp((sampleTime - active.start) / span, 0, 1)
    const eased = ease(local)
    const velocity = dease(local) / span

    if (active.id === "frame-apparatus") { state.frameProgress = eased; state.velocity = velocity }
    else if (active.id === "placement-guides") { state.frameProgress = 1; state.guideProgress = eased; state.velocity = velocity }
    else if (active.id === "source-window") { state.frameProgress = 1; state.guideProgress = 1; state.sourceReveal = eased; state.velocity = velocity }
    else if (active.id === "caption-if-known") { state.frameProgress = 1; state.guideProgress = 1; state.sourceReveal = 1; state.captionProgress = hasCaption ? eased : 0; state.velocity = hasCaption ? velocity : 0 }
    else if (active.id === "cleanup") { state.frameProgress = 1; state.sourceReveal = 1; state.captionProgress = hasCaption ? 1 : 0; state.guideProgress = 1 - eased; state.cleanupProgress = eased; state.resolvedProgress = eased; state.velocity = velocity }
    else if (active.id === "resolved-hold") { applyCompleted(state, active.id, hasCaption) }
    else if (active.id === "deconstruct") { state.frameProgress = 1 - eased; state.sourceReveal = 1 - eased; state.captionProgress = hasCaption ? 1 - eased : 0; state.guideProgress = 0; state.cleanupProgress = 1; state.resolvedProgress = 1 - eased; state.velocity = -velocity }
    else applyCompleted(state, active.id, hasCaption)

    if (reverse) state.velocity *= -1
    return Object.assign(state, {
      phaseId: reverse ? `${active.id}-reverse` : active.id,
      phaseIndex: active.index,
      phaseProgress: local,
      normalizedTime: story.value,
    })
  }

  function reducedState(time, hasCaption, reverse) {
    const story = normalizeStoryTime(time)
    if (story.terminal) return Object.assign(baseState(), { phaseId: "seam", phaseIndex: 4, phaseProgress: 1, normalizedTime: 1 })
    const sample = reverse ? (story.sample === 0 ? 0 : 1 - story.sample) : story.sample
    let state
    if (sample < .25) state = Object.assign(baseState(), { phaseId: "reduced-empty", phaseIndex: 0, phaseProgress: 0 })
    else if (sample < .5) state = Object.assign(baseState(), { frameProgress: 1, guideProgress: 1, phaseId: "reduced-guides", phaseIndex: 1, phaseProgress: 1 })
    else if (sample < .75) state = Object.assign(baseState(), { frameProgress: 1, guideProgress: 1, sourceReveal: 1, phaseId: "reduced-source", phaseIndex: 2, phaseProgress: 1 })
    else state = Object.assign(baseState(), { frameProgress: 1, guideProgress: 0, sourceReveal: 1, captionProgress: hasCaption ? 1 : 0, cleanupProgress: 1, resolvedProgress: 1, phaseId: "reduced-resolved", phaseIndex: 3, phaseProgress: 1 })
    if (reverse) state.phaseId += "-reverse"
    state.normalizedTime = story.value
    return state
  }

  function evaluate(compiled, time, sources, options) {
    const opts = options || {}
    if (!Array.isArray(sources)) throw new Error("sources must be an array")
    if (sources.length === 0) return { sceneId: "the-build", apply: "fail", code: "minimum-items", preservedCount: 0 }
    if (sources[0].proposal) {
      return { sceneId: "the-build", apply: "blocked-proposal", code: "source-role-contract-required", requiredContract: "AT06-CONTRACT-AUTHORED-STAGES", preservedCount: sources.length }
    }
    const source = sources[0]
    const extras = sources.slice(1)
    const hasCaption = Boolean(source.caption)
    const reverse = opts.direction === "reverse"
    const state = opts.reducedMotion ? reducedState(time, hasCaption, reverse) : stateFor(compiled, time, hasCaption, reverse)
    const cursorOn = compiled.controls.cursorVisibility === "causal" && !opts.reducedMotion && state.phaseId.replace(/-reverse$/, "") === "source-window"
    const cursorProgress = cursorOn ? state.phaseProgress : 0
    return {
      sceneId: "the-build",
      apply: "ok",
      sourceModel: "flat-source-presentation-build",
      consumedId: source.id,
      consumedCount: 1,
      preservedExtraIds: extras.map((item) => item.id),
      preservedExtraCount: extras.length,
      source: { id: source.id, failed: Boolean(source.failed), kind: source.kind || "image", caption: source.caption || null, media: { opacity: 1, filter: "none", blend: "normal" } },
      guideLines: guidesFor(compiled.controls.guideDensity),
      cursor: { opacity: cursorOn ? Math.sin(Math.PI * cursorProgress) : 0, x: .28 + .48 * ease(cursorProgress), y: .30 + .30 * ease(cursorProgress) },
      apparatus: {
        frameOpacity: state.frameProgress,
        frameY: (1 - state.frameProgress) * .06,
        frameScale: .96 + .04 * state.frameProgress,
        guideOpacity: state.guideProgress,
        sourceClipRight: 1 - state.sourceReveal,
        captionOpacity: state.captionProgress,
      },
      transparentOutput: true,
      ...state,
    }
  }

  function source(id, extra) {
    return Object.assign({ id, name: "Build source", ratio: 16 / 9, kind: "image", failed: false, caption: "Project caption", transparent: true, proposal: false }, extra || {})
  }

  function fixture(id) {
    switch (id) {
      case "zero": return []
      case "one-no-caption": return [source("build-source-01", { caption: null })]
      case "extra-three": return [source("build-source-01"), source("extra-source-02", { caption: null }), source("extra-source-03", { caption: null })]
      case "explicit-stages-proposal": return [source("stage-proposal-01", { proposal: true }), source("stage-proposal-02", { proposal: true }), source("stage-proposal-03", { proposal: true })]
      case "transparent-source": return [source("build-source-01", { transparent: true })]
      case "failed-source": return [source("build-source-01", { failed: true })]
      case "video-source": return [source("build-source-01", { kind: "video" })]
      default: return [source("build-source-01")]
    }
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`
    return JSON.stringify(value)
  }

  return Object.freeze({
    DEFAULT_CONTROLS,
    normalizeControls,
    normalizeContext,
    normalizeStoryTime,
    beatBlueprint,
    compileTimeline,
    guidesFor,
    evaluate,
    fixture,
    stableStringify,
  })
})
