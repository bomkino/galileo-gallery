export const SCENE_ID = "the-shelf"
export const EVALUATOR_VERSION = 1
export const TAU = Math.PI * 2

export const DEFAULTS = Object.freeze({
  cardHeight: 0.42,
  gap: 34,
  leanAmount: 2.5,
  direction: "forward",
  spotlightLift: 0.08,
})

export const CONTROL_BOUNDS = Object.freeze({
  cardHeight: [0.28, 0.58],
  gap: [8, 120],
  leanAmount: [0, 6],
  direction: ["forward", "reverse"],
  spotlightLift: [0.03, 0.14],
})

export const CANVASES = Object.freeze({
  "16:9": { width: 960, height: 540 },
  "9:16": { width: 405, height: 720 },
  "1:1": { width: 640, height: 640 },
  "4:5": { width: 576, height: 720 },
})

const RATIOS = [16 / 9, 4 / 5, 1, 3 / 2, 9 / 16, 2.1, 5 / 4]

export function clamp(value, min = 0, max = 1) { return Math.min(max, Math.max(min, value)) }
export function mod(value, divisor = 1) { return ((value % divisor) + divisor) % divisor }
export function smootherstep(value) { const x = clamp(value); return x * x * x * (x * (x * 6 - 15) + 10) }
export function mix(a, b, amount) { return a + (b - a) * amount }
export function stableHash(text) { let hash = 2166136261; for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619) } return hash >>> 0 }

export function makeItems(count, kind = "ordinary") {
  return Array.from({ length: count }, (_, index) => ({
    id: `${kind}-${String(index + 1).padStart(3, "0")}`,
    label: `EDITION ${String(index + 1).padStart(2, "0")}`,
    caption: index % 2 ? `Collected print ${index + 1}` : `Archive edition ${index + 1}`,
    ratio: kind === "mixed" ? RATIOS[index % RATIOS.length] : index % 3 === 1 ? 4 / 5 : index % 3 === 2 ? 1 : 16 / 9,
    kind: kind === "media-edge" && index === 3 ? "video" : kind === "media-edge" && index === 6 ? "failed" : "image",
    videoDurationSeconds: kind === "media-edge" && index === 3 ? 6.25 : undefined,
  }))
}

export const FIXTURES = Object.freeze({
  one: makeItems(1, "one"),
  two: makeItems(2, "two"),
  four: makeItems(4, "four"),
  ordinary8: makeItems(8, "ordinary"),
  mixed21: makeItems(21, "mixed"),
  many127: makeItems(127, "many"),
  mediaEdge: makeItems(9, "media-edge"),
})

export function sourceVideoTimeSeconds(storySeconds, durationSeconds, loop = true) {
  if (!Number.isFinite(storySeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const seconds = Math.max(0, storySeconds)
  return loop ? mod(seconds, durationSeconds) : Math.min(seconds, durationSeconds)
}

export function validateConfig(input = {}) {
  const value = { ...DEFAULTS, ...input }
  for (const key of ["cardHeight", "gap", "leanAmount", "spotlightLift"]) {
    const [minimum, maximum] = CONTROL_BOUNDS[key]
    if (!Number.isFinite(value[key]) || value[key] < minimum || value[key] > maximum) throw new Error(`${key} out of bounds`)
  }
  if (!CONTROL_BOUNDS.direction.includes(value.direction)) throw new Error("direction invalid")
  return value
}

export function compileTimeline({ mode = "automatic", mediaCount = 1, fixedDurationSeconds = 12, segments = [], fps = 30 } = {}) {
  const count = Math.max(1, Math.round(mediaCount || 1))
  const canonicalDuration = Math.max(8, Math.min(42, count * 1.65))
  const boundedFps = clamp(Number(fps) || 30, 1, 120)
  let durationSeconds = canonicalDuration
  let compiledSegments
  if (mode === "fixed-duration") {
    durationSeconds = clamp(Number(fixedDurationSeconds) || canonicalDuration, 1, 24 * 60 * 60)
    compiledSegments = [{ id: "fixed-shelf-cycle", kind: "cycle", start: 0, end: 1, cycles: 1 }]
  } else if (mode === "directed") {
    const source = segments.length ? segments : [
      { id: "walking-entry", kind: "cycle", cycles: 1, paceScale: 1 },
      { id: "spotlight-hold", kind: "hold", durationSeconds: 1.8 },
      { id: "walking-finale", kind: "cycle", cycles: 1, paceScale: 1 },
    ]
    const weighted = source.map((segment) => ({
      ...segment,
      weight: segment.kind === "hold"
        ? Math.max(0.25, Number(segment.durationSeconds) || 1)
        : Math.max(0.05, Number(segment.cycles) || 1) / clamp(Number(segment.paceScale) || 1, 0.05, 20),
    }))
    const total = weighted.reduce((sum, segment) => sum + segment.weight, 0)
    let cursor = 0
    compiledSegments = weighted.map((segment) => {
      const start = cursor / total
      cursor += segment.weight
      return { id: segment.id, kind: segment.kind, start, end: cursor / total, cycles: segment.kind === "hold" ? 0 : Math.max(1, Math.round(segment.cycles || 1)) }
    })
    durationSeconds = Math.max(1, total * 3)
  } else compiledSegments = [{ id: "automatic-shelf-cycle", kind: "cycle", start: 0, end: 1, cycles: 1 }]
  return { mode, durationSeconds, frameCount: Math.max(1, Math.ceil(durationSeconds * boundedFps)), segments: compiledSegments }
}

function itemDimensions(item, canvas, parameters) {
  const ratio = clamp(Number(item.ratio) || 16 / 9, 0.2, 4)
  const baseHeight = canvas.height * parameters.cardHeight
  const widthLimit = canvas.width * (canvas.height > canvas.width ? 0.82 : 0.58)
  const height = Math.min(baseHeight, widthLimit / ratio)
  return { width: height * ratio, height, ratio }
}

export function buildLayout(items, canvas, config = DEFAULTS) {
  const parameters = validateConfig(config)
  const safeItems = Array.isArray(items) ? items : []
  const dimensions = safeItems.map((item) => itemDimensions(item, canvas, parameters))
  const maximumWidth = Math.max(0, ...dimensions.map((entry) => entry.width))
  const minimumLoopLength = canvas.width + maximumWidth * 2 + 96
  const naturalLength = dimensions.reduce((sum, entry) => sum + entry.width, 0) + parameters.gap * Math.max(0, safeItems.length)
  const trackLength = safeItems.length <= 1 ? Math.max(1, naturalLength) : Math.max(naturalLength, minimumLoopLength)
  const effectiveGap = safeItems.length ? parameters.gap + Math.max(0, trackLength - naturalLength) / safeItems.length : parameters.gap
  const centres = []
  let cursor = effectiveGap * 0.5
  for (const entry of dimensions) {
    centres.push(cursor + entry.width * 0.5)
    cursor += entry.width + effectiveGap
  }
  const baseline = canvas.height * (canvas.height > canvas.width ? 0.78 : 0.80)
  const origin = safeItems.length === 1 ? canvas.width * 0.5 - (centres[0] || 0) : canvas.width * 0.08
  return { dimensions, maximumWidth, naturalLength, trackLength, effectiveGap, centres, baseline, origin }
}

function baseLean(id, amount) {
  if (amount === 0) return 0
  const normalized = (stableHash(id) / 0xffffffff) * 2 - 1
  const signedFloor = Math.abs(normalized) < 0.18 ? (normalized < 0 ? -0.18 : 0.18) : normalized
  return signedFloor * amount
}

function directedDelta(from, to, direction) {
  return direction === "reverse" ? -mod(from - to, 1) : mod(to - from, 1)
}

function alignPhase(itemIndex, layout, canvas) {
  return mod((layout.origin + layout.centres[itemIndex] - canvas.width * 0.5) / layout.trackLength, 1)
}

function resolveIntentId(items, value, fallbackIndex) {
  if (items.some((item) => item.id === value)) return value
  return items[Math.min(Math.max(0, fallbackIndex), Math.max(0, items.length - 1))]?.id ?? null
}

function finiteEnvelope(t, items, layout, canvas, parameters, intent) {
  const spotlightId = resolveIntentId(items, intent.spotlightId, Math.min(2, items.length - 1))
  const finaleId = resolveIntentId(items, intent.finaleId, items.length - 1)
  const spotlightIndex = Math.max(0, items.findIndex((item) => item.id === spotlightId))
  const finaleIndex = Math.max(0, items.findIndex((item) => item.id === finaleId))
  const spotlightPhase = alignPhase(spotlightIndex, layout, canvas)
  const finalePhase = alignPhase(finaleIndex, layout, canvas)
  const direction = parameters.direction
  const entrySign = direction === "forward" ? 1 : -1
  const x = clamp(t)

  if (x < 0.10) {
    return { phrase: "entry", phase: 0, assemblyOffset: entrySign * canvas.width * 0.42 * (1 - smootherstep(x / 0.10)), focusId: null, focusProgress: 0, spotlightId, finaleId }
  }
  if (x < 0.46) {
    const q = smootherstep((x - 0.10) / 0.36)
    return { phrase: "walking-to-spotlight", phase: mod(directedDelta(0, spotlightPhase, direction) * q, 1), assemblyOffset: 0, focusId: spotlightId, focusProgress: smootherstep(clamp((x - 0.38) / 0.08)), spotlightId, finaleId }
  }
  if (x < 0.72) {
    return { phrase: "spotlight-hold", phase: spotlightPhase, assemblyOffset: 0, focusId: spotlightId, focusProgress: 1, spotlightId, finaleId }
  }
  if (x < 0.86) {
    const q = smootherstep((x - 0.72) / 0.14)
    return { phrase: "walking-to-finale", phase: mod(spotlightPhase + directedDelta(spotlightPhase, finalePhase, direction) * q, 1), assemblyOffset: 0, focusId: q < 0.5 ? spotlightId : finaleId, focusProgress: 1 - Math.abs(q - 0.5) * 2, spotlightId, finaleId }
  }
  if (x < 0.96) {
    return { phrase: "finale-hold", phase: finalePhase, assemblyOffset: 0, focusId: finaleId, focusProgress: 1, spotlightId, finaleId }
  }
  return { phrase: "exit", phase: finalePhase, assemblyOffset: -entrySign * canvas.width * 0.42 * smootherstep((x - 0.96) / 0.04), focusId: finaleId, focusProgress: 1 - smootherstep((x - 0.96) / 0.04), spotlightId, finaleId }
}

function renderCopies(item, sourceIndex, dimensions, centre, layout, canvas, phase, assemblyOffset, parameters, focusId, focusProgress, timelineSeconds) {
  const copies = []
  const baseX = layout.origin + centre - phase * layout.trackLength + assemblyOffset
  const lean = baseLean(item.id, parameters.leanAmount)
  const focus = item.id === focusId ? clamp(focusProgress) : 0
  const lift = canvas.height * parameters.spotlightLift * focus
  for (let copyIndex = -1; copyIndex <= 1; copyIndex += 1) {
    const x = baseX + copyIndex * layout.trackLength
    const left = x - dimensions.width * 0.5
    const right = x + dimensions.width * 0.5
    const visible = right > -48 && left < canvas.width + 48
    if (!visible) continue
    copies.push({
      slotId: `${item.id}@${copyIndex}`,
      id: item.id,
      sourceIndex,
      sourceKind: item.kind,
      copyIndex,
      x,
      y: layout.baseline - dimensions.height - lift,
      width: dimensions.width,
      height: dimensions.height,
      baselineY: layout.baseline,
      bottomY: layout.baseline - lift,
      lift,
      baseLeanDeg: lean,
      leanDeg: lean * (1 - focus),
      focusProgress: focus,
      zOrder: 10000 + sourceIndex + Math.round(focus * 2000),
      artworkOpacity: 1,
      artworkFilter: "none",
      artworkBlend: "normal",
      sourceVideoTimeSeconds: item.kind === "video" ? sourceVideoTimeSeconds(timelineSeconds, item.videoDurationSeconds || 1, true) : null,
      failed: item.kind === "failed",
      caption: item.caption || "",
    })
  }
  return copies
}

export function evaluateShelf({
  items,
  config = DEFAULTS,
  intent = {},
  normalizedTime = 0,
  canvas = CANVASES["16:9"],
  runKind = "loop",
  reducedMotion = false,
  timelineMode = "automatic",
  timelineSegments = [],
  fixedDurationSeconds = 0,
} = {}) {
  const safeItems = Array.isArray(items) ? items : []
  const parameters = validateConfig(config)
  const safeCanvas = { width: Math.max(1, canvas.width), height: Math.max(1, canvas.height) }
  const layout = buildLayout(safeItems, safeCanvas, parameters)
  const timeline = compileTimeline({ mode: timelineMode, mediaCount: safeItems.length, fixedDurationSeconds, segments: timelineSegments })
  const rawTime = runKind === "finite" ? clamp(normalizedTime) : mod(normalizedTime, 1)
  let phrase = "walking-loop"
  let phase = safeItems.length <= 1 ? 0 : mod((parameters.direction === "reverse" ? -1 : 1) * rawTime, 1)
  let assemblyOffset = 0
  let focusId = null
  let focusProgress = 0
  let spotlightId = resolveIntentId(safeItems, intent.spotlightId, Math.min(2, safeItems.length - 1))
  let finaleId = resolveIntentId(safeItems, intent.finaleId, safeItems.length - 1)

  if (safeItems.length === 0) phrase = "empty"
  else if (safeItems.length === 1) phrase = "single-still"
  else if (reducedMotion) {
    phrase = "reduced-motion-settled"
    focusId = spotlightId
    focusProgress = 1
    const index = Math.max(0, safeItems.findIndex((item) => item.id === focusId))
    phase = alignPhase(index, layout, safeCanvas)
  } else if (runKind === "finite") {
    const finiteParameters = parameters.direction === "reverse" ? { ...parameters, direction: "forward" } : parameters
    const finite = finiteEnvelope(parameters.direction === "reverse" ? 1 - rawTime : rawTime, safeItems, layout, safeCanvas, finiteParameters, intent)
    phrase = finite.phrase
    phase = finite.phase
    assemblyOffset = finite.assemblyOffset
    focusId = finite.focusId
    focusProgress = finite.focusProgress
    spotlightId = finite.spotlightId
    finaleId = finite.finaleId
  }

  const sourceStates = safeItems.map((item, sourceIndex) => ({
    id: item.id,
    sourceIndex,
    sourceKind: item.kind,
    width: layout.dimensions[sourceIndex].width,
    height: layout.dimensions[sourceIndex].height,
    ratio: layout.dimensions[sourceIndex].ratio,
    baseLeanDeg: baseLean(item.id, parameters.leanAmount),
    trackCentre: layout.centres[sourceIndex],
    artworkOpacity: 1,
    artworkFilter: "none",
    artworkBlend: "normal",
  }))

  let renderSlots = []
  for (let sourceIndex = 0; sourceIndex < safeItems.length; sourceIndex += 1) {
    renderSlots.push(...renderCopies(
      safeItems[sourceIndex], sourceIndex, layout.dimensions[sourceIndex], layout.centres[sourceIndex], layout,
      safeCanvas, phase, assemblyOffset, parameters, focusId, focusProgress, rawTime * timeline.durationSeconds,
    ))
  }

  if (safeItems.length === 1) renderSlots = renderSlots.filter((slot) => slot.copyIndex === 0)
  const maxObservedNodes = safeCanvas.height > safeCanvas.width ? 12 : 18
  if (renderSlots.length > maxObservedNodes) {
    renderSlots = renderSlots
      .sort((a, b) => Math.abs(a.x - safeCanvas.width * 0.5) - Math.abs(b.x - safeCanvas.width * 0.5) || a.sourceIndex - b.sourceIndex)
      .slice(0, maxObservedNodes)
  }
  renderSlots.sort((a, b) => a.zOrder - b.zOrder || a.sourceIndex - b.sourceIndex || a.copyIndex - b.copyIndex)

  return {
    sceneId: SCENE_ID,
    evaluatorVersion: EVALUATOR_VERSION,
    axis: "horizontal-only",
    normalizedTime: rawTime,
    runKind,
    phrase,
    direction: parameters.direction,
    phase,
    count: safeItems.length,
    canvas: safeCanvas,
    baselineY: layout.baseline,
    trackLength: layout.trackLength,
    naturalTrackLength: layout.naturalLength,
    effectiveGap: layout.effectiveGap,
    currentFocusId: focusId,
    focusProgress,
    spotlightId,
    finaleId,
    renderNodeCount: renderSlots.length,
    maxObservedNodes,
    duplicateProjectMedia: false,
    compiledDurationSeconds: timeline.durationSeconds,
    artworkContract: { opacity: 1, filter: "none", blend: "normal" },
    sourceStates,
    renderSlots,
  }
}

export function recyclingSeamProbe(items = FIXTURES.ordinary8, canvas = CANVASES["16:9"], config = DEFAULTS) {
  const parameters = validateConfig(config)
  const layout = buildLayout(items, canvas, parameters)
  return items.map((item, sourceIndex) => {
    const dimensions = layout.dimensions[sourceIndex]
    const normalizedBaseX = mod(layout.origin + layout.centres[sourceIndex], layout.trackLength)
    const exitBase = (normalizedBaseX + dimensions.width * 0.5) / layout.trackLength
    const entryBase = (normalizedBaseX + layout.trackLength - dimensions.width * 0.5 - canvas.width) / layout.trackLength
    const cycleBase = Math.floor(exitBase)
    const currentBaseX = normalizedBaseX - cycleBase * layout.trackLength
    const exitPhase = exitBase - cycleBase
    let nextEntryPhase = entryBase - cycleBase
    while (nextEntryPhase < exitPhase) nextEntryPhase += 1
    const previousRightAtExit = currentBaseX - exitPhase * layout.trackLength + dimensions.width * 0.5
    const nextLeftAtExit = currentBaseX - exitPhase * layout.trackLength + layout.trackLength - dimensions.width * 0.5
    const nextLeftAtEntry = currentBaseX - nextEntryPhase * layout.trackLength + layout.trackLength - dimensions.width * 0.5
    const previousRightAtEntry = currentBaseX - nextEntryPhase * layout.trackLength + dimensions.width * 0.5
    return {
      id: item.id,
      sourceIndex,
      width: dimensions.width,
      trackLength: layout.trackLength,
      exitPhase,
      nextEntryPhase,
      previousRightAtExit,
      nextLeftAtExit,
      nextLeftAtEntry,
      previousRightAtEntry,
      seamOutsideVisibleStage: previousRightAtExit <= 1e-7 && nextLeftAtExit >= canvas.width && nextLeftAtEntry >= canvas.width - 1e-7 && previousRightAtEntry <= 0,
    }
  })
}

export function summarize(state) {
  return {
    sceneId: state.sceneId,
    evaluatorVersion: state.evaluatorVersion,
    axis: state.axis,
    normalizedTime: Number(state.normalizedTime.toFixed(6)),
    runKind: state.runKind,
    phrase: state.phrase,
    direction: state.direction,
    phase: Number(state.phase.toFixed(6)),
    count: state.count,
    canvas: state.canvas,
    baselineY: Number(state.baselineY.toFixed(3)),
    trackLength: Number(state.trackLength.toFixed(3)),
    naturalTrackLength: Number(state.naturalTrackLength.toFixed(3)),
    effectiveGap: Number(state.effectiveGap.toFixed(3)),
    currentFocusId: state.currentFocusId,
    focusProgress: Number(state.focusProgress.toFixed(6)),
    spotlightId: state.spotlightId,
    finaleId: state.finaleId,
    renderNodeCount: state.renderNodeCount,
    maxObservedNodes: state.maxObservedNodes,
    duplicateProjectMedia: state.duplicateProjectMedia,
    compiledDurationSeconds: Number(state.compiledDurationSeconds.toFixed(6)),
    visibleSlots: state.renderSlots.map((slot) => ({
      id: slot.id,
      copyIndex: slot.copyIndex,
      x: Number(slot.x.toFixed(3)),
      bottomY: Number(slot.bottomY.toFixed(3)),
      width: Number(slot.width.toFixed(3)),
      height: Number(slot.height.toFixed(3)),
      baseLeanDeg: Number(slot.baseLeanDeg.toFixed(6)),
      leanDeg: Number(slot.leanDeg.toFixed(6)),
      lift: Number(slot.lift.toFixed(3)),
      focusProgress: Number(slot.focusProgress.toFixed(6)),
    })),
    artworkContract: state.artworkContract,
  }
}
