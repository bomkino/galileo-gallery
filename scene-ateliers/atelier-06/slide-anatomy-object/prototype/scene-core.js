(function (root, factory) {
  const api = factory()
  if (typeof module === "object" && module.exports) module.exports = api
  root.SlideAnatomyCore = api
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict"

  const MAX_DURATION_MS = 60_000
  const VALID_MODES = new Set(["automatic", "fixed-duration", "directed"])
  const DEFAULT_CONTROLS = Object.freeze({
    separationDepth: 0.58,
    lateralSpread: 0.52,
    perspective: 0.34,
    inspectionHoldMs: 2_100,
    labelVisibility: "known-structure",
  })

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))
  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor
  const jerk = (value) => { const x = clamp(value, 0, 1); return x * x * x * (10 + x * (-15 + 6 * x)) }
  const djerk = (value) => { const x = clamp(value, 0, 1); return 30 * x * x * (x - 1) * (x - 1) }

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
    const sample = mod(numeric, 1)
    return { value: sample, sample, terminal: false }
  }

  function normalizeMode(value, issues) {
    const mode = typeof value === "string" ? value : "automatic"
    if (VALID_MODES.has(mode)) return mode
    issues.push({ code: "invalid-timeline-mode", requestedMode: mode, compiledMode: "automatic" })
    return "automatic"
  }

  function normalizeControls(input) {
    const source = Object.assign({}, DEFAULT_CONTROLS, input || {})
    return Object.freeze({
      separationDepth: boundedNumber(source.separationDepth, DEFAULT_CONTROLS.separationDepth, 0.2, 0.9),
      lateralSpread: boundedNumber(source.lateralSpread, DEFAULT_CONTROLS.lateralSpread, 0.18, 0.82),
      perspective: boundedNumber(source.perspective, DEFAULT_CONTROLS.perspective, 0, 0.6),
      inspectionHoldMs: Math.round(boundedNumber(source.inspectionHoldMs, DEFAULT_CONTROLS.inspectionHoldMs, 1_200, 5_000)),
      labelVisibility: ["known-structure", "numbers-only", "hidden"].includes(source.labelVisibility) ? source.labelVisibility : DEFAULT_CONTROLS.labelVisibility,
    })
  }

  function blueprint(controls, mode) {
    const definitions = [
      { id: "resolved-entry", kind: "hold", group: "opening", base: 700, min: 500, paceScale: 1 },
      { id: "separate", kind: "move", group: "opening", base: 1_750, min: 1_000, paceScale: mode === "directed" ? 2 : 1 },
      { id: "inspection-hold", kind: "hold", group: "middle", base: controls.inspectionHoldMs, min: controls.inspectionHoldMs, paceScale: 1 },
      { id: "return", kind: "move", group: "finale", base: 1_750, min: 1_000, paceScale: mode === "directed" ? 2 : 1 },
      { id: "resolved-finale", kind: "hold", group: "finale", base: 700, min: 500, paceScale: 1 },
    ]
    return definitions.map((segment) => Object.assign({}, segment, {
      preferred: segment.kind === "move" && segment.paceScale > 1
        ? Math.max(segment.min, Math.round(segment.base / segment.paceScale))
        : segment.base,
    }))
  }

  function distribute(targetDurationMs, segments) {
    const minimum = segments.reduce((sum, segment) => sum + segment.min, 0)
    const target = Math.max(minimum, Math.round(targetDurationMs))
    const flexible = segments.map((segment) => Math.max(0, segment.preferred - segment.min))
    const flexibleTotal = flexible.reduce((sum, value) => sum + value, 0)
    const extraTotal = target - minimum
    let assigned = 0
    return segments.map((segment, index) => {
      const extra = index === segments.length - 1
        ? extraTotal - assigned
        : flexibleTotal > 0
          ? Math.floor(extraTotal * flexible[index] / flexibleTotal)
          : Math.floor(extraTotal / segments.length)
      assigned += extra
      const durationMs = segment.min + extra
      return Object.assign({}, segment, {
        durationMs,
        requestedPaceScale: segment.paceScale,
        achievedPaceScale: segment.base / Math.max(1, durationMs),
      })
    })
  }

  function compileTimeline(intent, controls) {
    const normalizedControls = normalizeControls(controls)
    const issues = []
    const mode = normalizeMode(intent && intent.mode, issues)
    const automaticSegments = blueprint(normalizedControls, "automatic")
    const modeSegments = blueprint(normalizedControls, mode)
    const automaticDuration = automaticSegments.reduce((sum, segment) => sum + segment.base, 0)
    const minimumDuration = modeSegments.reduce((sum, segment) => sum + segment.min, 0)
    const directedDuration = modeSegments.reduce((sum, segment) => sum + segment.preferred, 0)
    const hasRequested = intent && Object.prototype.hasOwnProperty.call(intent, "durationMs")
    const requestedRaw = hasRequested ? Number(intent.durationMs) : mode === "directed" ? directedDuration : automaticDuration
    let requested = Number.isFinite(requestedRaw) ? requestedRaw : (mode === "directed" ? directedDuration : automaticDuration)

    if (!Number.isFinite(requestedRaw) && mode !== "automatic") issues.push({ code: "invalid-duration", requestedDurationMs: null, compiledDurationMs: requested })
    if (requested > MAX_DURATION_MS) {
      issues.push({ code: "duration-above-supported-maximum", requestedDurationMs: requested, maximumDurationMs: MAX_DURATION_MS })
      requested = MAX_DURATION_MS
    }

    let target = mode === "automatic" ? automaticDuration : requested
    if (mode === "fixed-duration" && Number.isFinite(requestedRaw) && requestedRaw >= minimumDuration && requestedRaw < automaticDuration) {
      issues.push({ code: "fixed-duration-compression", requestedDurationMs: requestedRaw, automaticDurationMs: automaticDuration, minimumDurationMs: minimumDuration })
    }
    if (mode !== "automatic" && target < minimumDuration) {
      issues.push({
        code: mode === "directed" ? "directed-duration-compromise" : "duration-below-readable-minimum",
        requestedDurationMs: target,
        minimumDurationMs: minimumDuration,
        compiledDurationMs: minimumDuration,
      })
      target = minimumDuration
    }

    const durations = distribute(target, modeSegments)
    const durationMs = durations.reduce((sum, segment) => sum + segment.durationMs, 0)
    let cursor = 0
    const segments = durations.map((segment, index) => {
      const startMs = cursor
      cursor += segment.durationMs
      return Object.freeze(Object.assign({}, segment, {
        index,
        startMs,
        endMs: cursor,
        start: startMs / durationMs,
        end: cursor / durationMs,
      }))
    })

    return Object.freeze({
      sceneId: "slide-anatomy-object",
      mode,
      durationMs,
      minimumDurationMs: minimumDuration,
      controls: normalizedControls,
      segments: Object.freeze(segments),
      issues: Object.freeze(issues),
    })
  }

  function planeDefinitions(hasCaption) {
    const planes = [
      { id: "backing", label: "Backing", x: -0.15, y: 0.09, z: -1.0, rotation: -1.2 },
      { id: "source-frame", label: "Source frame", x: 0, y: 0, z: 0, rotation: 0 },
      { id: "frame-edge", label: "Frame edge", x: 0.14, y: -0.07, z: 0.75, rotation: 1.0 },
      { id: "safe-area", label: "Safe area", x: -0.10, y: -0.12, z: 1.35, rotation: -0.8 },
    ]
    if (hasCaption) planes.push({ id: "caption", label: "Caption", x: 0.15, y: 0.12, z: 1.95, rotation: 1.2 })
    return planes
  }

  function poseAt(progress, source, controls) {
    const amount = clamp(finiteNumber(progress, 0), 0, 1)
    const normalizedControls = normalizeControls(controls)
    const definitions = planeDefinitions(Boolean(source && source.caption))
    return {
      stage: {
        rotateX: -normalizedControls.perspective * 12 * amount,
        rotateY: normalizedControls.perspective * 15 * amount,
      },
      planes: definitions.map((definition, index) => ({
        id: definition.id,
        label: definition.label,
        x: definition.x * normalizedControls.lateralSpread * amount,
        y: definition.y * normalizedControls.lateralSpread * amount,
        z: definition.z * normalizedControls.separationDepth * amount,
        rotation: definition.rotation * normalizedControls.lateralSpread * amount,
        opacity: 1,
        zOrder: index + 1,
        sourceOwned: definition.id === "source-frame",
      })),
      accessibleStructure: definitions.map((definition) => definition.label),
    }
  }

  function evaluate(compiled, time, sources, options) {
    const opts = options || {}
    if (!Array.isArray(sources)) throw new Error("sources must be an array")
    if (sources.length === 0) return { sceneId: "slide-anatomy-object", apply: "fail", code: "minimum-items", preservedCount: 0 }
    if (sources[0].proposal) {
      return { sceneId: "slide-anatomy-object", apply: "blocked-proposal", code: "source-role-contract-required", requiredContract: "AT06-CONTRACT-SOURCE-ROLES", preservedCount: sources.length }
    }

    const source = sources[0]
    const extras = sources.slice(1)
    const story = normalizeStoryTime(time)
    const reverse = opts.direction === "reverse"
    const sampleTime = reverse ? mod(1 - story.sample, 1) : story.sample
    const segments = compiled.segments
    let progress = 0
    let velocity = 0
    let phase = "resolved-entry"

    if (story.terminal) {
      phase = "seam"
    } else if (opts.reducedMotion) {
      const separatedStart = segments[1].start
      const returnStart = segments[3].start
      if (sampleTime >= separatedStart && sampleTime < returnStart) {
        progress = 1
        phase = "reduced-separated"
      } else phase = "reduced-resolved"
    } else if (sampleTime < segments[0].end) {
      phase = segments[0].id
    } else if (sampleTime < segments[1].end) {
      const segment = segments[1]
      const span = Math.max(1e-9, segment.end - segment.start)
      const local = clamp((sampleTime - segment.start) / span, 0, 1)
      progress = jerk(local)
      velocity = djerk(local) / span
      phase = segment.id
    } else if (sampleTime < segments[2].end) {
      progress = 1
      phase = segments[2].id
    } else if (sampleTime < segments[3].end) {
      const segment = segments[3]
      const span = Math.max(1e-9, segment.end - segment.start)
      const local = clamp((sampleTime - segment.start) / span, 0, 1)
      progress = 1 - jerk(local)
      velocity = -djerk(local) / span
      phase = segment.id
    } else phase = segments[4].id

    if (reverse) velocity *= -1
    const pose = poseAt(progress, source, compiled.controls)
    return {
      sceneId: "slide-anatomy-object",
      apply: "ok",
      sourceModel: "flat-source",
      normalizedTime: story.value,
      phase: reverse && !story.terminal ? `${phase}-reverse` : phase,
      separationProgress: progress,
      velocity,
      consumedId: source.id,
      consumedCount: 1,
      preservedExtraIds: extras.map((item) => item.id),
      preservedExtraCount: extras.length,
      source: { id: source.id, failed: Boolean(source.failed), kind: source.kind || "image", caption: source.caption || null, media: { opacity: 1, filter: "none", blend: "normal" } },
      labelVisibility: compiled.controls.labelVisibility,
      transparentOutput: true,
      ...pose,
    }
  }

  function source(id, extra) {
    return Object.assign({ id, name: "Anatomy source", ratio: 16 / 9, kind: "image", failed: false, caption: "Project caption", transparent: true, proposal: false }, extra || {})
  }

  function fixture(id) {
    switch (id) {
      case "zero": return []
      case "one-no-caption": return [source("anatomy-source-01", { caption: null })]
      case "extra-three": return [source("anatomy-source-01"), source("extra-source-02", { caption: null }), source("extra-source-03", { caption: null })]
      case "explicit-many-proposal": return [source("proposal-source-01", { proposal: true }), source("proposal-source-02", { proposal: true }), source("proposal-source-03", { proposal: true })]
      case "transparent-source": return [source("anatomy-source-01", { transparent: true })]
      case "failed-source": return [source("anatomy-source-01", { failed: true })]
      case "video-source": return [source("anatomy-source-01", { kind: "video" })]
      default: return [source("anatomy-source-01")]
    }
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`
    return JSON.stringify(value)
  }

  return Object.freeze({
    DEFAULT_CONTROLS,
    compileTimeline,
    evaluate,
    fixture,
    jerk,
    djerk,
    normalizeControls,
    normalizeStoryTime,
    planeDefinitions,
    poseAt,
    stableStringify,
  })
})
