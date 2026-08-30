(function (root, factory) {
  const api = factory()
  if (typeof module === "object" && module.exports) module.exports = api
  root.LightTableCore = api
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict"

  const TAU = Math.PI * 2
  const MAX_VISIBLE = 24
  const MAX_DURATION_MS = 60_000
  const VALID_MODES = new Set(["automatic", "fixed-duration", "directed"])
  const DEFAULT_CONTROLS = Object.freeze({
    tableSpread: 0.72,
    overlap: 0.10,
    underlightStrength: 0.42,
    focusBehaviour: "route",
    nudgeRestraint: 0.28,
  })

  const EXPLICIT = Object.freeze({
    1: [[0.50, 0.50, 0]],
    2: [[0.33, 0.50, -2.8], [0.67, 0.50, 2.8]],
    5: [[0.25, 0.31, -4.0], [0.52, 0.27, 2.1], [0.73, 0.45, 4.1], [0.34, 0.68, 3.0], [0.62, 0.69, -3.2]],
    6: [[0.24, 0.31, -4.0], [0.50, 0.25, 2.1], [0.75, 0.36, 4.1], [0.27, 0.68, 3.0], [0.52, 0.63, -3.2], [0.76, 0.70, 1.3]],
  })

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))
  const mix = (from, to, amount) => from + (to - from) * amount
  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor
  const smooth = (value) => { const x = clamp(value, 0, 1); return x * x * (3 - 2 * x) }
  const smoother = (value) => { const x = clamp(value, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10) }

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
    return { value: mod(numeric, 1), sample: mod(numeric, 1), terminal: false }
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
      tableSpread: boundedNumber(source.tableSpread, DEFAULT_CONTROLS.tableSpread, 0.52, 0.92),
      overlap: boundedNumber(source.overlap, DEFAULT_CONTROLS.overlap, 0, 0.22),
      underlightStrength: boundedNumber(source.underlightStrength, DEFAULT_CONTROLS.underlightStrength, 0, 0.70),
      focusBehaviour: ["route", "loupe-only", "none"].includes(source.focusBehaviour) ? source.focusBehaviour : DEFAULT_CONTROLS.focusBehaviour,
      nudgeRestraint: boundedNumber(source.nudgeRestraint, DEFAULT_CONTROLS.nudgeRestraint, 0, 0.60),
    })
  }

  function minimumDurationMs(count) {
    const visited = clamp(Math.round(finiteNumber(count, 1)), 1, MAX_VISIBLE)
    return Math.max(6_000, 1_200 + visited * 680)
  }

  function automaticDurationMs(count) {
    const visible = clamp(Math.round(finiteNumber(count, 1)), 1, MAX_VISIBLE)
    return clamp(6_880 + 520 * visible, 8_000, 18_000)
  }

  function timelineBlueprint(count, targetDurationMs, mode) {
    const reviewMinimum = Math.max(1_600, Math.min(MAX_VISIBLE, Math.max(1, count)) * 420)
    const minimums = { wake: 500, review: reviewMinimum, final: 900, return: 500 }
    const base = { wake: 1_000, review: Math.max(reviewMinimum, targetDurationMs - 3_200), final: 1_400, return: 800 }
    return [
      { id: "wake", kind: "move", group: "opening", base: base.wake, preferred: mode === "directed" ? Math.max(minimums.wake, Math.round(base.wake / 2)) : base.wake, min: minimums.wake, requestedPaceScale: mode === "directed" ? 2 : 1 },
      { id: "review", kind: "cycle", group: "middle", base: base.review, preferred: base.review, min: minimums.review, requestedPaceScale: 1 },
      { id: "final-inspection", kind: "hold", group: "middle", base: base.final, preferred: base.final, min: minimums.final, requestedPaceScale: 1 },
      { id: "return", kind: "move", group: "finale", base: base.return, preferred: mode === "directed" ? Math.max(minimums.return, Math.round(base.return / 2)) : base.return, min: minimums.return, requestedPaceScale: mode === "directed" ? 2 : 1 },
    ]
  }

  function distributeDurations(targetDurationMs, blueprint) {
    const minimumTotal = blueprint.reduce((sum, segment) => sum + segment.min, 0)
    const target = Math.max(minimumTotal, Math.round(targetDurationMs))
    const flexible = blueprint.map((segment) => Math.max(0, segment.preferred - segment.min))
    const flexibleTotal = flexible.reduce((sum, value) => sum + value, 0)
    let remaining = target - minimumTotal
    let assigned = 0
    return blueprint.map((segment, index) => {
      const extra = index === blueprint.length - 1
        ? remaining - assigned
        : flexibleTotal > 0
          ? Math.floor(remaining * flexible[index] / flexibleTotal)
          : Math.floor(remaining / blueprint.length)
      assigned += extra
      const durationMs = segment.min + extra
      return Object.assign({}, segment, {
        durationMs,
        achievedPaceScale: segment.base / Math.max(1, durationMs),
      })
    })
  }

  function compileTimeline(intent, count, controls) {
    const normalizedCount = clamp(Math.round(finiteNumber(count, 1)), 1, MAX_VISIBLE)
    const issues = []
    const mode = normalizeMode(intent && intent.mode, issues)
    const automatic = automaticDurationMs(normalizedCount)
    const minimum = minimumDurationMs(normalizedCount)
    const requestedRaw = intent && Object.prototype.hasOwnProperty.call(intent, "durationMs") ? Number(intent.durationMs) : automatic
    let requested = Number.isFinite(requestedRaw) ? requestedRaw : automatic

    if (!Number.isFinite(requestedRaw) && mode !== "automatic") {
      issues.push({ code: "invalid-duration", requestedDurationMs: null, compiledDurationMs: Math.max(minimum, automatic) })
    }
    if (requested > MAX_DURATION_MS) {
      issues.push({ code: "duration-above-supported-maximum", requestedDurationMs: requested, maximumDurationMs: MAX_DURATION_MS })
      requested = MAX_DURATION_MS
    }

    let target = automatic
    if (mode !== "automatic") {
      target = requested
      if (target < minimum) {
        issues.push({
          code: mode === "directed" ? "directed-duration-compromise" : "duration-below-readable-minimum",
          requestedDurationMs: target,
          minimumDurationMs: minimum,
          compiledDurationMs: minimum,
        })
        target = minimum
      }
    }

    const blueprint = timelineBlueprint(normalizedCount, Math.max(target, minimum), mode)
    const segmentsWithDuration = mode === "automatic"
      ? distributeDurations(automatic, blueprint)
      : distributeDurations(target, blueprint)
    const durationMs = segmentsWithDuration.reduce((sum, segment) => sum + segment.durationMs, 0)
    let cursor = 0
    const segments = segmentsWithDuration.map((segment, index) => {
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
      sceneId: "light-table",
      mode,
      durationMs,
      minimumDurationMs: minimum,
      count: normalizedCount,
      controls: normalizeControls(controls),
      issues: Object.freeze(issues),
      segments: Object.freeze(segments),
    })
  }

  function phaseAt(compiled, time) {
    return compiled.segments.find((segment) => time < segment.end) || compiled.segments[compiled.segments.length - 1]
  }

  function focusState(time, sources, behaviour, reducedMotion, manualFocusIndex, compiled) {
    const count = sources.length
    const valid = sources.map((source, index) => ({ source, index })).filter(({ source }) => !source.failed)
    const lastValid = valid.length ? valid[valid.length - 1].index : Math.max(0, count - 1)
    if (Number.isInteger(manualFocusIndex) && manualFocusIndex >= 0 && manualFocusIndex < count) {
      return { index: manualFocusIndex, weight: 1, manual: true }
    }
    if (reducedMotion) return { index: valid.length ? valid[0].index : 0, weight: count ? 0.72 : 0, manual: false }
    if (behaviour === "none" || count === 0) return { index: null, weight: 0, manual: false }
    const phase = phaseAt(compiled, time)
    const phaseProgress = clamp((time - phase.start) / Math.max(1e-9, phase.end - phase.start), 0, 1)
    if (phase.id === "final-inspection") {
      const weight = smooth(Math.min(1, phaseProgress / 0.20)) * (1 - smooth(Math.max(0, (phaseProgress - 0.74) / 0.26)))
      return { index: lastValid, weight, manual: false }
    }
    if (phase.id === "return") return { index: lastValid, weight: (1 - smoother(phaseProgress)) * 0.35, manual: false }
    if (behaviour === "loupe-only" || phase.id === "wake") return { index: null, weight: 0, manual: false }
    const review = compiled.segments.find((segment) => segment.id === "review")
    const reviewProgress = clamp((time - review.start) / Math.max(1e-9, review.end - review.start), 0, 0.999999999)
    const stationFloat = reviewProgress * count
    const index = Math.min(count - 1, Math.floor(stationFloat))
    const local = stationFloat - index
    const enter = smooth(local / 0.22)
    const leave = 1 - smooth((local - 0.82) / 0.18)
    return { index, weight: clamp(enter * leave, 0, 1), manual: false }
  }

  function layoutName(count) {
    if (count === 1) return "single-inspection"
    if (count === 2) return "bilateral"
    if (count === 5) return "open-bay"
    if (count === 6) return "ordinary"
    return "bounded-review-grid"
  }

  function boundedSlots(count, canvasRatio) {
    if (EXPLICIT[count]) return EXPLICIT[count].map((slot) => slot.slice())
    const ratio = boundedNumber(canvasRatio, 16 / 9, 0.35, 3.0)
    const columns = clamp(Math.ceil(Math.sqrt(count * ratio)), 2, Math.min(7, count))
    const rows = Math.ceil(count / columns)
    const left = 0.10
    const right = 0.90
    const top = 0.12
    const bottom = 0.88
    return Array.from({ length: count }, (_, index) => {
      const row = Math.floor(index / columns)
      const column = index % columns
      const itemsInRow = Math.min(columns, count - row * columns)
      const rowOffset = (columns - itemsInRow) / 2
      const nx = columns === 1 ? 0.5 : (column + rowOffset) / Math.max(1, columns - 1)
      const ny = rows === 1 ? 0.5 : row / Math.max(1, rows - 1)
      const deterministicJitterX = Math.sin((index + 1) * 12.9898) * 0.008
      const deterministicJitterY = Math.sin((index + 1) * 78.233) * 0.008
      const rotation = Math.sin((index + 1) * 1.913) * 2.2
      return [mix(left, right, nx) + deterministicJitterX, mix(top, bottom, ny) + deterministicJitterY, rotation]
    })
  }

  function nominalWidthForCount(count) {
    if (count <= 1) return 0.56
    if (count === 2) return 0.38
    if (count <= 6) return 0.29
    if (count <= 12) return 0.17
    return 0.115
  }

  function frameWidthForRatio(count, sourceRatio, canvasRatio) {
    const ratio = boundedNumber(sourceRatio, 16 / 9, 0.25, 4)
    const stageRatio = boundedNumber(canvasRatio, 16 / 9, 0.35, 3)
    const nominalWidth = nominalWidthForCount(count)
    const maxNormalizedHeight = count <= 2 ? 0.62 : count <= 6 ? 0.40 : count <= 12 ? 0.21 : 0.15
    const widthFromHeight = maxNormalizedHeight * ratio / stageRatio
    return Math.min(nominalWidth, widthFromHeight)
  }

  function rectangleMetrics(frames, canvasRatio) {
    const stageRatio = boundedNumber(canvasRatio, 16 / 9, 0.35, 3)
    const rectangles = frames.map((frame) => {
      const width = frame.width * frame.scale
      const height = width * stageRatio / frame.ratio * frame.scale
      return { id: frame.id, left: frame.x - width / 2, right: frame.x + width / 2, top: frame.y - height / 2, bottom: frame.y + height / 2, area: width * height }
    })
    let maxOcclusionFraction = 0
    let intersectionCount = 0
    for (let leftIndex = 0; leftIndex < rectangles.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < rectangles.length; rightIndex += 1) {
        const left = rectangles[leftIndex]
        const right = rectangles[rightIndex]
        const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
        const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
        const area = width * height
        if (area > 0) {
          intersectionCount += 1
          maxOcclusionFraction = Math.max(maxOcclusionFraction, area / Math.max(1e-9, Math.min(left.area, right.area)))
        }
      }
    }
    const outOfBoundsCount = rectangles.filter((rectangle) => rectangle.left < 0 || rectangle.right > 1 || rectangle.top < 0 || rectangle.bottom > 1).length
    return { maxOcclusionFraction, intersectionCount, outOfBoundsCount }
  }

  function evaluate(compiled, time, sources, options) {
    const opts = options || {}
    if (!Array.isArray(sources)) throw new Error("sources must be an array")
    if (sources.length === 0) return { apply: "fail", code: "minimum-items", preservedCount: 0, sceneId: "light-table" }
    if (sources.length > MAX_VISIBLE) return { apply: "fail", code: "visible-limit", preservedCount: sources.length, visibleCount: 0, sceneId: "light-table" }

    const story = normalizeStoryTime(time)
    const sampleTime = story.sample
    const controls = normalizeControls(compiled && compiled.controls)
    const reducedMotion = Boolean(opts.reducedMotion)
    const canvasRatio = boundedNumber(opts.canvasRatio, 16 / 9, 0.35, 3.0)
    const focus = focusState(sampleTime, sources, controls.focusBehaviour, reducedMotion, opts.manualFocusIndex, compiled)
    const slots = boundedSlots(sources.length, canvasRatio)
    const spread = controls.tableSpread
    const many = sources.length > 6
    const overlapPull = controls.overlap * (many ? 0.16 : 0.72)

    const frames = slots.map((slot, index) => {
      const source = sources[index]
      const ratio = boundedNumber(source.ratio, 16 / 9, 0.25, 4)
      const width = frameWidthForRatio(sources.length, ratio, canvasRatio)
      const normalizedHeight = width * canvasRatio / ratio
      const baseX = 0.5 + (slot[0] - 0.5) * spread * (1 - overlapPull)
      const baseY = 0.5 + (slot[1] - 0.5) * spread * (1 - overlapPull * 0.82)
      const frequencyX = 1 + (index % 3)
      const frequencyY = 1 + ((index + 1) % 2)
      const phase = (index + 1) * 0.73
      const nudge = reducedMotion ? 0 : controls.nudgeRestraint
      const driftScale = many ? 0.55 : 1
      const driftX = Math.sin(TAU * frequencyX * sampleTime + phase) * nudge * 0.010 * driftScale
      const driftY = Math.sin(TAU * frequencyY * sampleTime + phase * 0.61) * nudge * 0.008 * driftScale
      const driftR = Math.sin(TAU * (1 + index % 2) * sampleTime + phase * 0.43) * nudge * (many ? 0.45 : 1.1)
      const ownFocus = focus.index === index ? focus.weight : 0
      const wakeSegment = compiled.segments.find((segment) => segment.id === "wake")
      const wakeProgress = wakeSegment ? clamp(sampleTime / Math.max(1e-9, wakeSegment.end), 0, 1) : 0
      const wake = wakeSegment && sampleTime < wakeSegment.end && !reducedMotion ? Math.sin(wakeProgress * Math.PI) : 0
      const scale = 1 + ownFocus * (many ? 0.035 : 0.055)
      const halfWidth = width * scale / 2
      const halfHeight = normalizedHeight * scale / 2
      const margin = 0.018
      return {
        id: source.id,
        sourceIndex: index,
        kind: source.kind || "image",
        failed: Boolean(source.failed),
        ratio,
        x: clamp(baseX + driftX + wake * (index % 2 ? 1 : -1) * 0.006, margin + halfWidth, 1 - margin - halfWidth),
        y: clamp(baseY + driftY + wake * 0.010 - ownFocus * 0.012, margin + halfHeight, 1 - margin - halfHeight),
        width,
        rotation: slot[2] + driftR,
        scale,
        z: index + 1 + (ownFocus > 0 ? 100 : 0),
        focusWeight: ownFocus,
        underlight: controls.underlightStrength * (0.24 + ownFocus * 0.76),
        underlightExpansion: 0.035 + ownFocus * 0.018,
        media: { opacity: 1, filter: "none", blend: "normal" },
      }
    })

    return {
      apply: "ok",
      sceneId: "light-table",
      normalizedTime: story.value,
      phase: story.terminal ? "seam" : phaseAt(compiled, sampleTime).id,
      phaseSeam: story.terminal || sampleTime === 0,
      layout: layoutName(sources.length),
      focusIndex: focus.index,
      focusWeight: focus.weight,
      reducedMotion,
      controls,
      capability: { transparentOutput: false },
      layoutMetrics: rectangleMetrics(frames, canvasRatio),
      frames,
    }
  }

  function makeSources(count, variant) {
    const ratios = [16 / 9, 4 / 3, 1, 3 / 4, 9 / 16, 4 / 5]
    return Array.from({ length: count }, (_, index) => ({
      id: `light-source-${String(index + 1).padStart(2, "0")}`,
      name: `Source ${String(index + 1).padStart(2, "0")}`,
      ratio: ratios[index % ratios.length],
      kind: variant === "video" && index === 1 ? "video" : "image",
      failed: variant === "failed" && index === 2,
      chart: variant === "colour-chart" || index === 0,
      paletteIndex: index,
    }))
  }

  function fixture(id) {
    switch (id) {
      case "zero": return []
      case "one": return makeSources(1, "ordinary")
      case "two": return makeSources(2, "ordinary")
      case "five": return makeSources(5, "ordinary")
      case "ordinary-six": return makeSources(6, "ordinary")
      case "many-12": return makeSources(12, "ordinary")
      case "many-24": return makeSources(24, "ordinary")
      case "too-many-25": return makeSources(25, "ordinary")
      case "failed-six": return makeSources(6, "failed")
      case "video-six": return makeSources(6, "video")
      case "colour-chart-six": return makeSources(6, "colour-chart")
      case "mixed-six": return makeSources(6, "ordinary")
      default: return makeSources(6, "ordinary")
    }
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`
    return JSON.stringify(value)
  }

  return Object.freeze({
    DEFAULT_CONTROLS,
    MAX_VISIBLE,
    automaticDurationMs,
    compileTimeline,
    evaluate,
    fixture,
    minimumDurationMs,
    normalizeControls,
    normalizeStoryTime,
    rectangleMetrics,
    stableStringify,
  })
})
