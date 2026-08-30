(function (root, factory) {
  const api = factory()
  if (typeof module === "object" && module.exports) module.exports = api
  root.BeforeAfterCore = api
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict"

  const MAX_DURATION_MS = 60_000
  const VALID_MODES = new Set(["automatic", "fixed-duration", "directed"])
  const DEFAULT_CONTROLS = Object.freeze({
    initialSplit: 0.18,
    sweepRange: Object.freeze({ min: 0.12, max: 0.88 }),
    sweepDurationMs: 1_400,
    turnaroundHoldMs: 650,
    comparisonChrome: "labels-handle",
  })

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))
  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor
  const minimumJerk = (value) => { const x = clamp(value, 0, 1); return x * x * x * (10 + x * (-15 + 6 * x)) }
  const minimumJerkDerivative = (value) => { const x = clamp(value, 0, 1); return 30 * x * x * (x - 1) * (x - 1) }

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
    const sourceRange = Object.assign({}, DEFAULT_CONTROLS.sweepRange, source.sweepRange || {})
    const first = boundedNumber(sourceRange.min, DEFAULT_CONTROLS.sweepRange.min, 0.04, 0.95)
    const second = boundedNumber(sourceRange.max, DEFAULT_CONTROLS.sweepRange.max, 0.05, 0.96)
    let minimum = Math.min(first, second)
    let maximum = Math.max(first, second)
    if (maximum - minimum < 0.10) {
      const center = (maximum + minimum) / 2
      minimum = clamp(center - 0.05, 0.04, 0.86)
      maximum = clamp(center + 0.05, minimum + 0.10, 0.96)
    }
    const initialMinimum = Math.max(0.05, minimum)
    const initialMaximum = Math.min(0.95, maximum)
    return Object.freeze({
      initialSplit: boundedNumber(source.initialSplit, DEFAULT_CONTROLS.initialSplit, initialMinimum, initialMaximum),
      sweepRange: Object.freeze({ min: minimum, max: maximum }),
      sweepDurationMs: Math.round(boundedNumber(source.sweepDurationMs, DEFAULT_CONTROLS.sweepDurationMs, 800, 4_000)),
      turnaroundHoldMs: Math.round(boundedNumber(source.turnaroundHoldMs, DEFAULT_CONTROLS.turnaroundHoldMs, 300, 2_400)),
      comparisonChrome: ["labels-handle", "handle", "clean"].includes(source.comparisonChrome) ? source.comparisonChrome : DEFAULT_CONTROLS.comparisonChrome,
    })
  }

  function blueprint(controls, mode) {
    const returnBase = Math.max(480, Math.round(controls.sweepDurationMs * 0.4857142857))
    const definitions = [
      { id: "initial-hold", kind: "hold", group: "opening", base: 420, min: 400, paceScale: 1 },
      { id: "sweep-to-max", kind: "move", group: "opening", base: controls.sweepDurationMs, min: 900, paceScale: mode === "directed" ? 2 : 1 },
      { id: "max-hold", kind: "hold", group: "middle", base: controls.turnaroundHoldMs, min: 360, paceScale: 1 },
      { id: "sweep-to-min", kind: "move", group: "middle", base: controls.sweepDurationMs, min: 900, paceScale: 1 },
      { id: "min-hold", kind: "hold", group: "middle", base: controls.turnaroundHoldMs, min: 360, paceScale: 1 },
      { id: "return-to-initial", kind: "move", group: "finale", base: returnBase, min: 680, paceScale: mode === "directed" ? 2 : 1 },
    ]
    return definitions.map((segment) => Object.assign({}, segment, {
      preferred: segment.kind === "move" && segment.paceScale > 1
        ? Math.max(segment.min, Math.round(segment.base / segment.paceScale))
        : segment.base,
    }))
  }

  function distribute(targetDurationMs, segments) {
    const minimumTotal = segments.reduce((sum, segment) => sum + segment.min, 0)
    const target = Math.max(minimumTotal, Math.round(targetDurationMs))
    const flexible = segments.map((segment) => Math.max(0, segment.preferred - segment.min))
    const flexibleTotal = flexible.reduce((sum, value) => sum + value, 0)
    let assigned = 0
    const extraTotal = target - minimumTotal
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
    const automaticDuration = automaticSegments.reduce((sum, segment) => sum + segment.base, 0)
    const modeSegments = blueprint(normalizedControls, mode)
    const minimumDuration = modeSegments.reduce((sum, segment) => sum + segment.min, 0)
    const intrinsicDirected = modeSegments.reduce((sum, segment) => sum + segment.preferred, 0)
    const hasRequested = intent && Object.prototype.hasOwnProperty.call(intent, "durationMs")
    const requestedRaw = hasRequested ? Number(intent.durationMs) : mode === "directed" ? intrinsicDirected : automaticDuration
    let requested = Number.isFinite(requestedRaw) ? requestedRaw : (mode === "directed" ? intrinsicDirected : automaticDuration)

    if (!Number.isFinite(requestedRaw) && mode !== "automatic") {
      issues.push({ code: "invalid-duration", requestedDurationMs: null, compiledDurationMs: requested })
    }
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

    const compiledDurations = distribute(target, modeSegments)
    const durationMs = compiledDurations.reduce((sum, segment) => sum + segment.durationMs, 0)
    let cursor = 0
    const segments = compiledDurations.map((segment, index) => {
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
      sceneId: "before-after-slider",
      mode,
      durationMs,
      minimumDurationMs: minimumDuration,
      controls: normalizedControls,
      segments: Object.freeze(segments),
      issues: Object.freeze(issues),
    })
  }

  function travel(from, to, segment, time) {
    const span = Math.max(1e-9, segment.end - segment.start)
    const progress = clamp((time - segment.start) / span, 0, 1)
    const position = minimumJerk(progress)
    const derivative = minimumJerkDerivative(progress) / span
    return { split: from + (to - from) * position, velocity: (to - from) * derivative }
  }

  function result(split, velocity, phase, before, after, extras, controls, options, reducedMotion, normalizedTime) {
    const fit = ["contain", "cover"].includes(options.fit) ? options.fit : "contain"
    return {
      sceneId: "before-after-slider",
      apply: "ok",
      normalizedTime,
      split,
      velocity,
      phase,
      reducedMotion,
      consumedIds: [before.id, after.id],
      consumedCount: 2,
      preservedExtraIds: extras.map((source) => source.id),
      preservedExtraCount: extras.length,
      contentRect: { x: 0, y: 0, width: 1, height: 1 },
      fit,
      alignment: "center",
      chrome: controls.comparisonChrome,
      panes: {
        before: { id: before.id, side: "before", failed: Boolean(before.failed), clip: { left: 0, right: split }, media: { opacity: 1, filter: "none", blend: "normal" } },
        after: { id: after.id, side: "after", failed: Boolean(after.failed), clip: { left: 0, right: 1 }, media: { opacity: 1, filter: "none", blend: "normal" } },
      },
      capability: { transparentOutput: false },
    }
  }

  function evaluate(compiled, time, sources, options) {
    const opts = options || {}
    if (!Array.isArray(sources)) throw new Error("sources must be an array")
    if (sources.length === 0) return { sceneId: "before-after-slider", apply: "fail", code: "minimum-items", preservedCount: 0 }
    if (sources.length === 1) {
      return { sceneId: "before-after-slider", apply: "missing-pair", code: "missing-pair", preservedCount: 1, consumedCount: 1, duplicates: 0, side: { before: sources[0].id, after: null } }
    }

    const before = sources[0]
    const after = sources[1]
    const extras = sources.slice(2)
    const controls = normalizeControls(compiled && compiled.controls)
    const story = normalizeStoryTime(time)

    if (opts.reducedMotion) return result(controls.initialSplit, 0, "reduced-static", before, after, extras, controls, opts, true, story.value)
    const hasManualSplit = opts.manualSplit !== null && opts.manualSplit !== undefined
    const manualValue = Number(opts.manualSplit)
    if (hasManualSplit && Number.isFinite(manualValue)) {
      return result(clamp(manualValue, controls.sweepRange.min, controls.sweepRange.max), 0, "manual", before, after, extras, controls, opts, false, story.value)
    }
    if (story.terminal) return result(controls.initialSplit, 0, "seam", before, after, extras, controls, opts, false, 1)

    const reverse = opts.direction === "reverse"
    const sampleTime = reverse ? mod(1 - story.sample, 1) : story.sample
    const [initialHold, sweepToMax, maxHold, sweepToMin, minHold, returnToInitial] = compiled.segments
    let split = controls.initialSplit
    let velocity = 0
    let phase = initialHold.id

    if (sampleTime < initialHold.end) {
      phase = initialHold.id
    } else if (sampleTime < sweepToMax.end) {
      ({ split, velocity } = travel(controls.initialSplit, controls.sweepRange.max, sweepToMax, sampleTime))
      phase = sweepToMax.id
    } else if (sampleTime < maxHold.end) {
      split = controls.sweepRange.max
      phase = maxHold.id
    } else if (sampleTime < sweepToMin.end) {
      ({ split, velocity } = travel(controls.sweepRange.max, controls.sweepRange.min, sweepToMin, sampleTime))
      phase = sweepToMin.id
    } else if (sampleTime < minHold.end) {
      split = controls.sweepRange.min
      phase = minHold.id
    } else {
      ({ split, velocity } = travel(controls.sweepRange.min, controls.initialSplit, returnToInitial, sampleTime))
      phase = returnToInitial.id
    }
    if (reverse) velocity *= -1
    return result(split, velocity, reverse ? `${phase}-reverse` : phase, before, after, extras, controls, opts, false, story.value)
  }

  function source(id, ratio, width, height, extra) {
    return Object.assign({
      id,
      name: id === "before-source" ? "Before source" : "After source",
      ratio,
      width,
      height,
      failed: false,
      kind: "image",
      alphaEdge: false,
      variant: id === "before-source" ? "before" : "after",
    }, extra || {})
  }

  function fixture(id) {
    const pair = [source("before-source", 16 / 9, 1_920, 1_080), source("after-source", 16 / 9, 3_840, 2_160)]
    switch (id) {
      case "zero": return []
      case "one": return [pair[0]]
      case "extra-four": return pair.concat([source("extra-source-03", 1, 1_200, 1_200), source("extra-source-04", 3 / 4, 1_200, 1_600)])
      case "failed-before": return [source("before-source", 16 / 9, 1_920, 1_080, { failed: true }), pair[1]]
      case "failed-after": return [pair[0], source("after-source", 16 / 9, 3_840, 2_160, { failed: true })]
      case "both-failed": return [source("before-source", 16 / 9, 1, 1, { failed: true }), source("after-source", 16 / 9, 1, 1, { failed: true })]
      case "different-dimensions": return [source("before-source", 16 / 9, 640, 360), source("after-source", 16 / 9, 4_096, 2_304)]
      case "different-ratios": return [source("before-source", 4 / 3, 1_600, 1_200), source("after-source", 3 / 4, 1_200, 1_600)]
      case "alpha-edge": return [source("before-source", 16 / 9, 1_920, 1_080, { alphaEdge: true }), source("after-source", 16 / 9, 1_920, 1_080, { alphaEdge: true })]
      case "video-pair": return [source("before-source", 16 / 9, 1_920, 1_080, { kind: "video" }), source("after-source", 16 / 9, 1_920, 1_080, { kind: "video" })]
      default: return pair
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
    minimumJerk,
    minimumJerkDerivative,
    normalizeControls,
    normalizeStoryTime,
    stableStringify,
  })
})
