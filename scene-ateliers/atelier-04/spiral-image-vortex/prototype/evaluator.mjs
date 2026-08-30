export const SCENE_ID = "spiral-image-vortex"
export const EVALUATOR_VERSION = 1
export const TAU = Math.PI * 2

export const DEFAULTS = Object.freeze({
  turns: 3,
  radialSpread: 0.34,
  depthPitch: 0.28,
  cardSize: 0.22,
  direction: "forward",
})

export const CONTROL_BOUNDS = Object.freeze({
  turns: [2, 5],
  radialSpread: [0.22, 0.46],
  depthPitch: [0.16, 0.42],
  cardSize: [0.16, 0.30],
  direction: ["forward", "reverse"],
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
export function stableHash(text) { let hash = 2166136261; for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619) } return hash >>> 0 }

export function makeItems(count, kind = "ordinary") {
  return Array.from({ length: count }, (_, index) => ({
    id: `${kind}-${String(index + 1).padStart(3, "0")}`,
    label: `THREAD ${String(index + 1).padStart(2, "0")}`,
    ratio: kind === "mixed" ? RATIOS[index % RATIOS.length] : index % 3 === 1 ? 4 / 5 : index % 3 === 2 ? 1 : 16 / 9,
    kind: kind === "media-edge" && index === 1 ? "video" : kind === "media-edge" && index === 4 ? "failed" : "image",
    videoDurationSeconds: kind === "media-edge" && index === 1 ? 4 : undefined,
  }))
}

export const FIXTURES = Object.freeze({
  one: makeItems(1, "one"),
  two: makeItems(2, "two"),
  ordinary8: makeItems(8, "ordinary"),
  mixed21: makeItems(21, "mixed"),
  many127: makeItems(127, "many"),
  mediaEdge: makeItems(8, "media-edge"),
})

export function sourceVideoTimeSeconds(storySeconds, durationSeconds, loop = true) {
  if (!Number.isFinite(storySeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const seconds = Math.max(0, storySeconds)
  return loop ? mod(seconds, durationSeconds) : Math.min(seconds, durationSeconds)
}

export function validateConfig(input = {}) {
  const value = { ...DEFAULTS, ...input }
  if (!Number.isInteger(value.turns) || value.turns < 2 || value.turns > 5) throw new Error("turns out of bounds")
  for (const key of ["radialSpread", "depthPitch", "cardSize"]) {
    const [min, max] = CONTROL_BOUNDS[key]
    if (!Number.isFinite(value[key]) || value[key] < min || value[key] > max) throw new Error(`${key} out of bounds`)
  }
  if (!CONTROL_BOUNDS.direction.includes(value.direction)) throw new Error("direction invalid")
  return value
}

export function compileTimeline({ mode = "automatic", fixedDurationSeconds = 9, segments = [], fps = 30 } = {}) {
  const baseDurationSeconds = 9
  const boundedFps = clamp(Number(fps) || 30, 1, 120)
  let durationSeconds = baseDurationSeconds
  let compiledSegments
  if (mode === "fixed-duration") {
    durationSeconds = clamp(Number(fixedDurationSeconds) || baseDurationSeconds, 1, 24 * 60 * 60)
    compiledSegments = [{ id: "fixed-cycle", kind: "cycle", start: 0, end: 1, cycles: 1 }]
  } else if (mode === "directed") {
    const source = segments.length ? segments : [
      { id: "fast-opening", kind: "cycle", cycles: 2, paceScale: 2 },
      { id: "regular-middle", kind: "cycle", cycles: 1, paceScale: 1 },
      { id: "fast-finale", kind: "cycle", cycles: 1, paceScale: 2 },
    ]
    const weighted = source.map((segment) => ({ ...segment, weight: segment.kind === "hold" ? Math.max(0.2, segment.durationSeconds || 0.8) : Math.max(0.05, segment.cycles || 1) / clamp(segment.paceScale || 1, 0.05, 20) }))
    const total = weighted.reduce((sum, segment) => sum + segment.weight, 0)
    let cursor = 0
    compiledSegments = weighted.map((segment) => { const start = cursor / total; cursor += segment.weight; return { id: segment.id, kind: segment.kind, start, end: cursor / total, cycles: segment.kind === "hold" ? 0 : Math.max(1, Math.round(segment.cycles || 1)) } })
    durationSeconds = baseDurationSeconds * total
  } else compiledSegments = [{ id: "automatic-cycle", kind: "cycle", start: 0, end: 1, cycles: 1 }]
  return { mode, durationSeconds, frameCount: Math.max(1, Math.ceil(durationSeconds * boundedFps)), segments: compiledSegments }
}

export function evaluateTimeline(compiled, normalizedTime) {
  const t = mod(normalizedTime, 1)
  const segment = compiled.segments.find((entry) => t < entry.end) || compiled.segments.at(-1)
  const span = Math.max(1e-9, segment.end - segment.start)
  const local = clamp((t - segment.start) / span)
  let before = 0
  for (const entry of compiled.segments) { if (entry === segment) break; before += entry.cycles }
  return { cycle: before + segment.cycles * local, velocity: segment.kind === "hold" ? 0 : segment.cycles / (compiled.durationSeconds * span), segmentId: segment.id }
}

function finiteEnvelope(t) {
  const x = clamp(t)
  if (x < 0.10) return { phrase: "entry", reveal: smootherstep(x / 0.10), hold: false }
  if (x < 0.72) return { phrase: "cycle", reveal: 1, hold: false }
  if (x < 0.84) return { phrase: "spotlight", reveal: 1, hold: true }
  if (x < 0.94) return { phrase: "finale", reveal: 1, hold: true }
  return { phrase: "exit", reveal: 1 - smootherstep((x - 0.94) / 0.06), hold: true }
}

function safeBaseU(index, count) {
  if (count <= 1) return 0.5
  if (count < 4) return (index + 1) / (count + 1)
  return index / count
}

export function evaluateVortex({
  items,
  config = DEFAULTS,
  normalizedTime = 0,
  canvas = CANVASES["16:9"],
  runKind = "loop",
  reducedMotion = false,
  spotlightId = null,
  finaleId = null,
  timelineMode = "automatic",
  timelineSegments = [],
} = {}) {
  const safeItems = Array.isArray(items) ? items : []
  const count = safeItems.length
  const parameters = validateConfig(config)
  const directionSign = parameters.direction === "reverse" ? -1 : 1
  const timeline = compileTimeline({ mode: timelineMode, segments: timelineSegments })
  const t = runKind === "finite" ? clamp(normalizedTime) : mod(normalizedTime, 1)
  const envelope = runKind === "finite" ? finiteEnvelope(t) : { phrase: "cycle", reveal: 1, hold: false }
  const temporal = evaluateTimeline(timeline, t)
  const movingPhase = runKind === "finite" ? clamp((t - 0.10) / 0.62) : temporal.cycle
  let phase = reducedMotion || envelope.hold ? Math.round(movingPhase * Math.max(1, count)) / Math.max(1, count) : movingPhase
  const targetId = envelope.phrase === "spotlight" ? spotlightId : envelope.phrase === "finale" ? (finaleId || spotlightId) : null
  if (targetId && count > 0) {
    const targetIndex = safeItems.findIndex((item) => item.id === targetId)
    if (targetIndex >= 0) phase = mod(directionSign * (safeBaseU(targetIndex, count) - 0.5), 1)
  }
  phase = mod(directionSign * phase, 1)

  const width = Math.max(1, canvas.width)
  const height = Math.max(1, canvas.height)
  const portrait = height > width
  const centerX = width * 0.5
  const centerY = height * 0.5
  const radiusCapacity = Math.min(width * (portrait ? 0.48 : 0.44), height * 0.46)
  const radius = radiusCapacity * (parameters.radialSpread / 0.46)
  const verticalSpan = height * (0.90 + parameters.depthPitch * parameters.turns * 0.90)
  const cardHeight = Math.min(height * parameters.cardSize, width * (portrait ? 0.34 : 0.24))
  const seamWindow = 0.065
  const revealHalf = 0.5 * envelope.reveal
  const angleOffset = -Math.PI / 2

  const cards = safeItems.map((item, index) => {
    const baseU = safeBaseU(index, Math.max(1, count))
    const u = mod(baseU - phase, 1)
    const angle = TAU * parameters.turns * u + angleOffset
    const depth = Math.sin(angle)
    const x = centerX + Math.cos(angle) * radius
    const y = centerY + (u - 0.5) * verticalSpan
    const ratio = clamp(Number(item.ratio) || 16 / 9, 0.2, 4)
    const itemHeight = cardHeight * (portrait && ratio > 1.5 ? 0.82 : 1)
    const itemWidth = itemHeight * ratio
    const scale = 0.68 + (depth + 1) * 0.16
    const seamZone = u < seamWindow || u > 1 - seamWindow
    const revealed = Math.abs(u - 0.5) <= revealHalf + 1e-9
    const outsideWithMargin = y + itemHeight * scale * 0.65 < 0 || y - itemHeight * scale * 0.65 > height
    const visible = revealed && !seamZone && !outsideWithMargin
    const nearPass = depth > 0.88 && visible
    return {
      id: item.id,
      sourceIndex: index,
      sourceKind: item.kind,
      u,
      angle,
      x,
      y,
      width: itemWidth,
      height: itemHeight,
      scale,
      depth,
      rotateYDeg: -Math.cos(angle) * 20,
      rotateZDeg: Math.sin(angle) * 3.5,
      zOrder: Math.round(10000 + depth * 4000 - Math.abs(u - 0.5) * 50),
      visible,
      seamZone,
      outsideWithMargin,
      nearPass,
      readable: nearPass,
      artworkOpacity: 1,
      artworkFilter: "none",
      artworkBlend: "normal",
      sourceVideoTimeSeconds: item.kind === "video" ? sourceVideoTimeSeconds(t * timeline.durationSeconds, item.videoDurationSeconds || 1, true) : null,
      failed: item.kind === "failed",
    }
  })

  const visible = cards.filter((entry) => entry.visible).sort((a, b) => a.depth - b.depth || a.u - b.u || a.sourceIndex - b.sourceIndex)
  const maxObservedNodes = portrait ? 17 : 23
  let renderSlots = visible
  if (visible.length > maxObservedNodes) {
    const important = [...visible].sort((a, b) => {
      const aScore = Math.abs(a.y - centerY) / height + (1 - a.depth) * 0.12
      const bScore = Math.abs(b.y - centerY) / height + (1 - b.depth) * 0.12
      return aScore - bScore || a.sourceIndex - b.sourceIndex
    }).slice(0, maxObservedNodes)
    const keep = new Set(important.map((entry) => entry.id))
    renderSlots = visible.filter((entry) => keep.has(entry.id))
  }

  return {
    sceneId: SCENE_ID,
    evaluatorVersion: EVALUATOR_VERSION,
    normalizedTime: t,
    runKind,
    phrase: envelope.phrase,
    phase,
    direction: parameters.direction,
    count,
    canvas: { width, height },
    turns: parameters.turns,
    seamWindow,
    stateCount: cards.length,
    renderNodeCount: renderSlots.length,
    maxObservedNodes,
    artworkContract: { opacity: 1, filter: "none", blend: "normal" },
    cards,
    renderSlots,
  }
}

export function seamProbe({ items = FIXTURES.ordinary8, config = DEFAULTS, canvas = CANVASES["16:9"], sourceIndex = 0 } = {}) {
  const samples = []
  for (const time of [0.93, 0.95, 0.97, 0.99, 0, 0.01, 0.03, 0.05, 0.07]) {
    const state = evaluateVortex({ items, config, normalizedTime: time, canvas })
    const card = state.cards[sourceIndex]
    samples.push({ time, u: card.u, x: card.x, y: card.y, depth: card.depth, visible: card.visible, seamZone: card.seamZone, outsideWithMargin: card.outsideWithMargin })
  }
  return samples
}

export function crossingProbe({ items = FIXTURES.ordinary8, config = DEFAULTS, canvas = CANVASES["16:9"] } = {}) {
  const samples = []
  for (let step = 0; step <= 80; step += 1) {
    const time = step / 80
    const state = evaluateVortex({ items, config, normalizedTime: time, canvas })
    const ordered = state.renderSlots.map((card) => card.id)
    samples.push({ time, ordered, depths: Object.fromEntries(state.renderSlots.map((card) => [card.id, card.depth])) })
  }
  return samples
}

export function summarize(state) {
  const near = state.cards.filter((card) => card.nearPass).sort((a, b) => b.depth - a.depth)[0] || null
  return {
    sceneId: state.sceneId,
    evaluatorVersion: state.evaluatorVersion,
    normalizedTime: Number(state.normalizedTime.toFixed(6)),
    runKind: state.runKind,
    phrase: state.phrase,
    phase: Number(state.phase.toFixed(6)),
    direction: state.direction,
    count: state.count,
    canvas: state.canvas,
    turns: state.turns,
    nearId: near?.id ?? null,
    nearDepth: near ? Number(near.depth.toFixed(6)) : null,
    renderNodeCount: state.renderNodeCount,
    stateCount: state.stateCount,
    artworkContract: state.artworkContract,
  }
}
