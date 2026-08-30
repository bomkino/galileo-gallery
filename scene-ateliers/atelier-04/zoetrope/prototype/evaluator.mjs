export const SCENE_ID = "zoetrope"
export const EVALUATOR_VERSION = 1
export const TAU = Math.PI * 2

export const DEFAULTS = Object.freeze({
  cylinderRadius: 0.39,
  cardSize: 0.31,
  ringTiltDeg: -4,
  cadenceCharacter: "ratchet",
  direction: "forward",
})

export const CONTROL_BOUNDS = Object.freeze({
  cylinderRadius: [0.28, 0.48],
  cardSize: [0.22, 0.42],
  ringTiltDeg: [-12, 8],
  cadenceCharacter: ["ratchet", "flywheel"],
  direction: ["forward", "reverse"],
})

export const CANVASES = Object.freeze({
  "16:9": { width: 960, height: 540 },
  "9:16": { width: 405, height: 720 },
  "1:1": { width: 640, height: 640 },
  "4:5": { width: 576, height: 720 },
})

const RATIOS = [16 / 9, 4 / 5, 1, 3 / 2, 9 / 16, 2.1, 5 / 4]

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

export function mod(value, divisor = 1) {
  return ((value % divisor) + divisor) % divisor
}

export function smoothstep(value) {
  const x = clamp(value)
  return x * x * (3 - 2 * x)
}

export function smootherstep(value) {
  const x = clamp(value)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

export function stableHash(text) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function makeItems(count, kind = "ordinary") {
  return Array.from({ length: count }, (_, index) => {
    const ratio = kind === "mixed" ? RATIOS[index % RATIOS.length] : index % 3 === 1 ? 4 / 5 : index % 3 === 2 ? 1 : 16 / 9
    return {
      id: `${kind}-${String(index + 1).padStart(3, "0")}`,
      label: `FRAME ${String(index + 1).padStart(2, "0")}`,
      ratio,
      kind: kind === "media-edge" && index === 1 ? "video" : kind === "media-edge" && index === 3 ? "failed" : "image",
      videoDurationSeconds: kind === "media-edge" && index === 1 ? 3 : undefined,
    }
  })
}

export const FIXTURES = Object.freeze({
  one: makeItems(1, "one"),
  two: makeItems(2, "two"),
  ordinary6: makeItems(6, "ordinary"),
  mixed20: makeItems(20, "mixed"),
  many127: makeItems(127, "many"),
  mediaEdge: makeItems(6, "media-edge"),
})

export function sourceVideoTimeSeconds(storySeconds, durationSeconds, loop = true) {
  if (!Number.isFinite(storySeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const seconds = Math.max(0, storySeconds)
  return loop ? mod(seconds, durationSeconds) : Math.min(seconds, durationSeconds)
}

export function validateConfig(input = {}) {
  const value = { ...DEFAULTS, ...input }
  const [radiusMin, radiusMax] = CONTROL_BOUNDS.cylinderRadius
  const [sizeMin, sizeMax] = CONTROL_BOUNDS.cardSize
  const [tiltMin, tiltMax] = CONTROL_BOUNDS.ringTiltDeg
  if (!Number.isFinite(value.cylinderRadius) || value.cylinderRadius < radiusMin || value.cylinderRadius > radiusMax) throw new Error("cylinderRadius out of bounds")
  if (!Number.isFinite(value.cardSize) || value.cardSize < sizeMin || value.cardSize > sizeMax) throw new Error("cardSize out of bounds")
  if (!Number.isFinite(value.ringTiltDeg) || value.ringTiltDeg < tiltMin || value.ringTiltDeg > tiltMax) throw new Error("ringTiltDeg out of bounds")
  if (!CONTROL_BOUNDS.cadenceCharacter.includes(value.cadenceCharacter)) throw new Error("cadenceCharacter invalid")
  if (!CONTROL_BOUNDS.direction.includes(value.direction)) throw new Error("direction invalid")
  return value
}

export function compileTimeline({ mode = "automatic", mediaCount, fixedDurationSeconds = 6, segments = [], fps = 30 } = {}) {
  const count = Math.max(1, Math.round(mediaCount || 1))
  const slotSeconds = 0.43
  const baseDurationSeconds = clamp(count * slotSeconds, 2.4, 18)
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
    const weighted = source.map((segment) => ({ ...segment, weight: segment.kind === "hold" ? Math.max(0.2, segment.durationSeconds || 0.65) : Math.max(0.05, segment.cycles || 1) / clamp(segment.paceScale || 1, 0.05, 20) }))
    const totalWeight = weighted.reduce((sum, segment) => sum + segment.weight, 0)
    let cursor = 0
    compiledSegments = weighted.map((segment) => {
      const start = cursor / totalWeight
      cursor += segment.weight
      return { id: segment.id, kind: segment.kind, start, end: cursor / totalWeight, cycles: segment.kind === "hold" ? 0 : Math.max(1, Math.round(segment.cycles || 1)) }
    })
    durationSeconds = baseDurationSeconds * totalWeight
  } else {
    compiledSegments = [{ id: "automatic-cycle", kind: "cycle", start: 0, end: 1, cycles: 1 }]
  }
  return { mode, durationSeconds, frameCount: Math.max(1, Math.ceil(durationSeconds * boundedFps)), segments: compiledSegments }
}

export function evaluateTimeline(compiled, normalizedTime) {
  const t = mod(normalizedTime, 1)
  const segment = compiled.segments.find((entry) => t < entry.end) || compiled.segments[compiled.segments.length - 1]
  const span = Math.max(1e-9, segment.end - segment.start)
  const local = clamp((t - segment.start) / span)
  let cyclesBefore = 0
  for (const entry of compiled.segments) {
    if (entry === segment) break
    cyclesBefore += entry.cycles
  }
  const cycle = cyclesBefore + segment.cycles * local
  return { cycle, velocity: segment.kind === "hold" ? 0 : segment.cycles / (compiled.durationSeconds * span), segmentId: segment.id }
}

function cadenceTravel(cycle, count, character) {
  const raw = cycle * count
  const beat = Math.floor(raw)
  const local = mod(raw, 1)
  if (character === "flywheel") return beat + smootherstep(local)
  const travelWindow = 0.68
  const travelled = local < travelWindow ? smootherstep(local / travelWindow) : 1
  return beat + travelled
}

function finiteEnvelope(t) {
  const x = clamp(t)
  if (x < 0.1) return { assembly: smootherstep(x / 0.1), phrase: "entry", motionScale: smoothstep(x / 0.1), hold: false }
  if (x < 0.72) return { assembly: 1, phrase: "cycle", motionScale: 1, hold: false }
  if (x < 0.84) return { assembly: 1, phrase: "spotlight", motionScale: 0, hold: true }
  if (x < 0.94) return { assembly: 1, phrase: "finale", motionScale: 0, hold: true }
  return { assembly: 1 - smootherstep((x - 0.94) / 0.06), phrase: "exit", motionScale: 0, hold: true }
}

export function evaluateZoetrope({
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
  const safeItems = Array.isArray(items) && items.length ? items : []
  const count = safeItems.length
  const parameters = validateConfig(config)
  const directionSign = parameters.direction === "reverse" ? -1 : 1
  const timeline = compileTimeline({ mode: timelineMode, mediaCount: Math.max(1, count), segments: timelineSegments })
  const t = runKind === "finite" ? clamp(normalizedTime) : mod(normalizedTime, 1)
  const envelope = runKind === "finite" ? finiteEnvelope(t) : { assembly: 1, phrase: "cycle", motionScale: 1, hold: false }
  const temporal = evaluateTimeline(timeline, t)
  const baseCycle = runKind === "finite" ? clamp((t - 0.1) / 0.62) : temporal.cycle
  const travel = reducedMotion || envelope.hold ? Math.round(baseCycle * Math.max(1, count)) : cadenceTravel(baseCycle, Math.max(1, count), parameters.cadenceCharacter)
  let phase = count <= 1 ? 0 : mod(directionSign * travel / count, 1)
  const targetId = envelope.phrase === "spotlight" ? spotlightId : envelope.phrase === "finale" ? (finaleId || spotlightId) : null
  if (targetId && count > 1) {
    const targetIndex = safeItems.findIndex((item) => item.id === targetId)
    if (targetIndex >= 0) phase = mod(targetIndex / count, 1)
  }

  const width = Math.max(1, canvas.width)
  const height = Math.max(1, canvas.height)
  const portrait = height > width
  const radiusCapacity = Math.min(width * 0.48, height * (portrait ? 0.34 : 0.64))
  const radius = radiusCapacity * (parameters.cylinderRadius / 0.48) * envelope.assembly
  const cardHeight = Math.min(height * (portrait ? 0.27 : parameters.cardSize), width * (portrait ? 0.42 : 0.30))
  const centerX = width * 0.5
  const centerY = height * (portrait ? 0.51 : 0.52)
  const tilt = parameters.ringTiltDeg * Math.PI / 180
  const gateRadians = Math.max(0.13, Math.min(0.38, TAU / Math.max(6, count) * 0.75))

  const all = safeItems.map((item, index) => {
    const theta = mod(TAU * (index / Math.max(1, count) - phase) + Math.PI, TAU) - Math.PI
    const depthUnit = Math.cos(theta)
    const x = centerX + Math.sin(theta) * radius
    const y = centerY + Math.sin(theta) * radius * Math.sin(tilt) + (1 - depthUnit) * height * 0.012
    const ratio = clamp(Number(item.ratio) || 16 / 9, 0.2, 4)
    const itemHeight = cardHeight * (portrait && ratio > 1.4 ? 0.82 : 1)
    const itemWidth = itemHeight * ratio
    const scale = 0.68 + (depthUnit + 1) * 0.16
    const frontGate = Math.abs(theta) <= gateRadians
    const behindCore = depthUnit < -0.78
    const projectedOnStage = x + itemWidth * scale * 0.55 > 0 && x - itemWidth * scale * 0.55 < width
    return {
      id: item.id,
      sourceIndex: index,
      sourceKind: item.kind,
      x,
      y,
      width: itemWidth,
      height: itemHeight,
      scale,
      rotateYDeg: theta * 180 / Math.PI,
      rotateZDeg: parameters.ringTiltDeg,
      depth: depthUnit,
      zOrder: Math.round(10000 + depthUnit * 4000),
      frontGate,
      readable: frontGate && depthUnit > 0.9,
      visible: projectedOnStage && !behindCore,
      artworkOpacity: 1,
      artworkFilter: "none",
      artworkBlend: "normal",
      sourceVideoTimeSeconds: item.kind === "video" ? sourceVideoTimeSeconds(t * timeline.durationSeconds, item.videoDurationSeconds || 1, true) : null,
      failed: item.kind === "failed",
    }
  })

  const visible = all.filter((entry) => entry.visible).sort((a, b) => a.depth - b.depth || a.sourceIndex - b.sourceIndex)
  const maxObservedNodes = portrait ? 15 : 19
  let renderSlots = visible
  if (visible.length > maxObservedNodes) {
    const byImportance = [...visible].sort((a, b) => {
      const aScore = Math.abs(a.x - centerX) / width + (1 - a.depth) * 0.18
      const bScore = Math.abs(b.x - centerX) / width + (1 - b.depth) * 0.18
      return aScore - bScore || a.sourceIndex - b.sourceIndex
    }).slice(0, maxObservedNodes)
    const keep = new Set(byImportance.map((entry) => entry.id))
    renderSlots = visible.filter((entry) => keep.has(entry.id))
  }

  return {
    sceneId: SCENE_ID,
    evaluatorVersion: EVALUATOR_VERSION,
    normalizedTime: t,
    runKind,
    phrase: envelope.phrase,
    phase,
    cadenceCharacter: parameters.cadenceCharacter,
    direction: parameters.direction,
    count,
    canvas: { width, height },
    frontGateRadians: gateRadians,
    maxObservedNodes,
    stateCount: all.length,
    renderNodeCount: renderSlots.length,
    artworkContract: { opacity: 1, filter: "none", blend: "normal" },
    cards: all,
    renderSlots,
  }
}

export function sampleCadence({ count = 6, fps = 24, character = "ratchet", durationSeconds = 2.58 } = {}) {
  const frames = Math.max(2, Math.ceil(durationSeconds * fps))
  const samples = []
  let prior = null
  let maxAngularStepDeg = 0
  let gateSamples = 0
  for (let frame = 0; frame <= frames; frame += 1) {
    const t = frame / frames
    const phase = mod(cadenceTravel(t, count, character) / count, 1)
    if (prior !== null) {
      let delta = Math.abs(phase - prior)
      delta = Math.min(delta, 1 - delta)
      maxAngularStepDeg = Math.max(maxAngularStepDeg, delta * 360)
    }
    const local = mod(t * count, 1)
    if (character === "ratchet" && local >= 0.68) gateSamples += 1
    samples.push({ frame, timeSeconds: frame / fps, phase })
    prior = phase
  }
  return { fps, frameCount: frames + 1, maxAngularStepDeg, gateSamples, samples }
}

export function summarize(state) {
  const front = state.cards.filter((card) => card.frontGate).sort((a, b) => b.depth - a.depth)[0] || null
  return {
    sceneId: state.sceneId,
    evaluatorVersion: state.evaluatorVersion,
    normalizedTime: Number(state.normalizedTime.toFixed(6)),
    runKind: state.runKind,
    phrase: state.phrase,
    phase: Number(state.phase.toFixed(6)),
    count: state.count,
    canvas: state.canvas,
    direction: state.direction,
    cadenceCharacter: state.cadenceCharacter,
    frontId: front?.id ?? null,
    frontDepth: front ? Number(front.depth.toFixed(6)) : null,
    renderNodeCount: state.renderNodeCount,
    stateCount: state.stateCount,
    artworkContract: state.artworkContract,
  }
}
