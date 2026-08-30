export const SCENE_ID = "proximity-orbit"
export const DURATION_MS = 9000
export const FIXED_MIN_MS = 3600
export const DEFAULTS = Object.freeze({
  orbitRadius: 36,
  proximityStrength: 68,
  pathProjection: 56,
  cardSize: 22,
  featuredIndex: 3,
  mode: "automatic",
  fixedDurationMs: 12000,
  direction: "forward",
  reducedMotion: false,
})
export const CONTROL_BOUNDS = Object.freeze({
  orbitRadius: [24, 50],
  proximityStrength: [0, 100],
  pathProjection: [25, 85],
  cardSize: [14, 30],
  featuredIndex: [0, 126],
  fixedDurationMs: [FIXED_MIN_MS, 60000],
})

const TAU = Math.PI * 2
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor
const smooth = (value) => {
  const x = clamp(value, 0, 1)
  return x * x * x * (x * (x * 6 - 15) + 10)
}
const ramp = (phase, start, end) => smooth((phase - start) / Math.max(1e-9, end - start))
const round = (value) => Number(value.toFixed(6))
const wrap = (value, count) => {
  let wrapped = mod(value, count)
  if (wrapped > count / 2) wrapped -= count
  return wrapped
}
const finite = (value, label) => {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new TypeError(`${SCENE_ID}: ${label} must be finite`)
  return number
}
const bounded = (value, bounds, label) => {
  const number = finite(value, label)
  if (number < bounds[0] || number > bounds[1]) throw new RangeError(`${SCENE_ID}: ${label} must be within ${bounds[0]}–${bounds[1]}`)
  return number
}

export const FIXTURES = Object.freeze({
  one: [{ id: "prox-01", ratio: 16 / 9, label: "ONE" }],
  two: [{ id: "prox-01", ratio: 16 / 9, label: "NEAR" }, { id: "prox-02", ratio: 3 / 4, label: "FAR" }],
  seven: [
    { id: "prox-01", ratio: 16 / 9, label: "FAR" }, { id: "prox-02", ratio: 1, label: "APPROACH" },
    { id: "prox-03", ratio: 4 / 5, label: "SHOULDER" }, { id: "prox-04", ratio: 2.39, label: "NEAR" },
    { id: "prox-05", ratio: 3 / 4, label: "DEPART" }, { id: "prox-06", ratio: 3 / 2, label: "REMOTE" },
    { id: "prox-07", ratio: 9 / 16, label: "FINALE" },
  ],
  mixed: [
    { id: "mix-01", ratio: 2.39, label: "WIDE" }, { id: "mix-02", ratio: 3 / 4, label: "TALL" },
    { id: "mix-03", ratio: 1, label: "SQUARE" }, { id: "mix-04", ratio: 16 / 9, label: "FRAME" },
    { id: "mix-05", ratio: 4 / 5, label: "PORTRAIT" }, { id: "mix-06", ratio: 3 / 2, label: "ORDER" },
    { id: "mix-07", ratio: 9 / 16, label: "NARROW" },
  ],
  failed: [
    { id: "ok-01", ratio: 16 / 9, label: "OK" }, { id: "failed-02", ratio: 4 / 5, label: "MISSING", failed: true },
    { id: "ok-03", ratio: 1, label: "OK" }, { id: "video-04", ratio: 16 / 9, label: "VIDEO", video: true },
    { id: "ok-05", ratio: 3 / 4, label: "OK" }, { id: "ok-06", ratio: 3 / 2, label: "OK" },
    { id: "ok-07", ratio: 9 / 16, label: "OK" },
  ],
  many127: Array.from({ length: 127 }, (_, index) => ({
    id: `many-${String(index + 1).padStart(3, "0")}`,
    ratio: [16 / 9, 1, 4 / 5, 2.39, 3 / 4][index % 5],
    label: String(index + 1),
    video: index % 47 === 0,
  })),
})
export const CANVASES = Object.freeze({
  wide: { width: 1280, height: 720, label: "16:9" },
  portrait: { width: 720, height: 1280, label: "9:16" },
  square: { width: 900, height: 900, label: "1:1" },
  fourFive: { width: 800, height: 1000, label: "4:5" },
})

const SEGMENT_TEMPLATE = Object.freeze([
  { id: "entry-emerge", kind: "travel", phaseStart: 0, phaseEnd: 0.08, fast: true },
  { id: "nonlinear-near-approach", kind: "travel", phaseStart: 0.08, phaseEnd: 0.36 },
  { id: "near-pass-hold", kind: "hold", phaseStart: 0.36, phaseEnd: 0.48 },
  { id: "near-to-finale", kind: "travel", phaseStart: 0.48, phaseEnd: 0.84 },
  { id: "finale-near-hold", kind: "hold", phaseStart: 0.84, phaseEnd: 0.92 },
  { id: "exit-recede", kind: "travel", phaseStart: 0.92, phaseEnd: 1, fast: true },
])

function validateTimelineInput(config = {}) {
  const mode = ["automatic", "fixed-duration", "directed"].includes(config.mode) ? config.mode : DEFAULTS.mode
  const direction = config.direction === "reverse" ? "reverse" : "forward"
  const fixedDurationMs = config.fixedDurationMs === undefined
    ? DEFAULTS.fixedDurationMs
    : bounded(config.fixedDurationMs, CONTROL_BOUNDS.fixedDurationMs, "fixedDurationMs")
  return { mode, direction, fixedDurationMs }
}
export function compileTimeline(config = {}) {
  const input = validateTimelineInput(config)
  const canonical = SEGMENT_TEMPLATE.map((segment) => ({ ...segment, canonicalMs: (segment.phaseEnd - segment.phaseStart) * DURATION_MS }))
  const holdTotal = canonical.filter((segment) => segment.kind === "hold").reduce((sum, segment) => sum + segment.canonicalMs, 0)
  let durations
  if (input.mode === "automatic") durations = canonical.map((segment) => segment.canonicalMs)
  else if (input.mode === "fixed-duration") {
    const travelBudget = input.fixedDurationMs - holdTotal
    const travelTotal = DURATION_MS - holdTotal
    if (travelBudget <= 0) throw new RangeError(`${SCENE_ID}: fixed duration cannot preserve literal near holds`)
    durations = canonical.map((segment) => segment.kind === "hold" ? segment.canonicalMs : segment.canonicalMs * travelBudget / travelTotal)
  } else durations = canonical.map((segment) => segment.kind === "travel" && segment.fast ? segment.canonicalMs / 2 : segment.canonicalMs)
  let elapsed = 0
  const segments = canonical.map((segment, index) => {
    const startMs = elapsed
    elapsed += durations[index]
    return { ...segment, startMs: round(startMs), endMs: round(elapsed), durationMs: round(durations[index]) }
  })
  return { mode: input.mode, direction: input.direction, durationMs: round(elapsed), literalHoldMs: round(holdTotal), segments }
}
function sampleTimeline(timeMs, timeline) {
  const raw = round(mod(finite(timeMs ?? 0, "timeMs"), timeline.durationMs))
  const oriented = round(timeline.direction === "reverse" ? mod(timeline.durationMs - raw, timeline.durationMs) : raw)
  const segment = timeline.segments.find((candidate) => oriented < candidate.endMs) ?? timeline.segments.at(-1)
  const progress = clamp((oriented - segment.startMs) / Math.max(1e-9, segment.durationMs), 0, 1)
  return { phase: segment.phaseStart + (segment.phaseEnd - segment.phaseStart) * progress, phraseRole: segment.id }
}

function validateItems(source) {
  if (!Array.isArray(source) || source.length < 1 || source.length > 127) throw new RangeError(`${SCENE_ID}: ordered media must contain 1–127 items`)
  const ids = new Set()
  return source.map((item, index) => {
    if (!item || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id)) throw new TypeError(`${SCENE_ID}: source ${index} needs a unique non-empty id`)
    ids.add(item.id)
    const ratio = finite(item.ratio ?? 16 / 9, `source ${item.id} ratio`)
    if (ratio < 0.2 || ratio > 5) throw new RangeError(`${SCENE_ID}: source ratio must be within 0.2–5`)
    return { ...item, ratio }
  })
}
function validateStage(source) {
  const width = finite(source?.width, "stage width")
  const height = finite(source?.height, "stage height")
  if (width < 1 || height < 1 || width > 16384 || height > 16384) throw new RangeError(`${SCENE_ID}: stage dimensions are outside 1–16384`)
  return { width, height }
}
function validateControls(source = {}) {
  const merged = { ...DEFAULTS, ...source }
  return {
    orbitRadius: bounded(merged.orbitRadius, CONTROL_BOUNDS.orbitRadius, "orbitRadius"),
    proximityStrength: bounded(merged.proximityStrength, CONTROL_BOUNDS.proximityStrength, "proximityStrength"),
    pathProjection: bounded(merged.pathProjection, CONTROL_BOUNDS.pathProjection, "pathProjection"),
    cardSize: bounded(merged.cardSize, CONTROL_BOUNDS.cardSize, "cardSize"),
    featuredIndex: Math.round(bounded(merged.featuredIndex, CONTROL_BOUNDS.featuredIndex, "featuredIndex")),
    mode: ["automatic", "fixed-duration", "directed"].includes(merged.mode) ? merged.mode : DEFAULTS.mode,
    fixedDurationMs: bounded(merged.fixedDurationMs, CONTROL_BOUNDS.fixedDurationMs, "fixedDurationMs"),
    direction: merged.direction === "reverse" ? "reverse" : "forward",
    reducedMotion: merged.reducedMotion === true,
  }
}

function frontTurn(index, count, prior) {
  if (count <= 1) return prior
  let turn = 1 - index / count
  while (turn < prior - 1e-9) turn += 1
  return turn
}
function approach(value, strength) {
  const u = clamp(value, 0, 1)
  const nearAmplitude = 0.14 + 0.14 * strength
  const nearTime = 0.26 + 0.20 * strength
  const split = 1 - nearTime
  if (u < split) return (1 - nearAmplitude) * smooth(u / split)
  return (1 - nearAmplitude) + nearAmplitude * smooth((u - split) / nearTime)
}
function depart(value, strength) { return 1 - approach(1 - value, strength) }
function between(value, strength) { return value < 0.5 ? 0.5 * depart(value * 2, strength) : 0.5 + 0.5 * approach(value * 2 - 1, strength) }
function turnAt(phase, count, featuredIndex, strength) {
  if (count <= 1) return 0
  const selected = clamp(Math.round(featuredIndex), 0, count - 1)
  const finale = count - 1
  const spotlightTurn = frontTurn(selected, count, 0)
  const finaleTurn = frontTurn(finale, count, spotlightTurn)
  if (phase < 0.08) return 0
  if (phase < 0.36) return spotlightTurn * approach((phase - 0.08) / 0.28, strength)
  if (phase < 0.48) return spotlightTurn
  if (phase < 0.84) return spotlightTurn + (finaleTurn - spotlightTurn) * between((phase - 0.48) / 0.36, strength)
  return finaleTurn
}
function assemblyAt(phase, reducedMotion) { return reducedMotion ? 1 : ramp(phase, 0, 0.08) * (1 - ramp(phase, 0.92, 1)) }
function windowFor(count, frontContinuous) {
  if (count <= 20) return { indices: Array.from({ length: count }, (_, index) => index), slots: Math.max(1, count), large: false }
  const slots = 16
  const centre = Math.round(frontContinuous)
  const start = centre - Math.floor(slots / 2)
  return { indices: Array.from({ length: slots }, (_, index) => mod(start + index, count)), slots, large: true }
}
function safeScaleAt(x, y, width, height, stage, ceiling) {
  const margin = Math.min(stage.width, stage.height) * 0.025
  const xRoom = Math.max(0, Math.min(x - margin, stage.width - margin - x))
  const yRoom = Math.max(0, Math.min(y - margin, stage.height - margin - y))
  return Math.max(0.12, Math.min(ceiling, 2 * xRoom / Math.max(1, width), 2 * yRoom / Math.max(1, height)))
}

export function evaluate(input = {}) {
  const items = validateItems(input.items ?? FIXTURES.seven)
  const stage = validateStage(input.stage ?? CANVASES.wide)
  const controls = validateControls(input.controls)
  const timeline = compileTimeline(controls)
  const sampled = controls.reducedMotion
    ? { phase: 0.40, phraseRole: "reduced-motion-near" }
    : sampleTimeline(input.timeMs ?? 0, timeline)
  const phase = round(sampled.phase)
  const strength = clamp(controls.proximityStrength / 100, 0, 1)
  const turn = turnAt(phase, items.length, controls.featuredIndex, strength)
  const assembly = assemblyAt(phase, controls.reducedMotion)
  const frontContinuous = items.length ? mod(-turn * items.length, items.length) : 0
  const window = windowFor(items.length, frontContinuous)
  const portrait = stage.height > stage.width
  const shortAxis = Math.min(stage.width, stage.height)
  const requestedRadius = shortAxis * controls.orbitRadius / 100 * (portrait ? 0.94 : 1)
  const margin = shortAxis * 0.025
  const radius = Math.min(requestedRadius, stage.width / 2 - margin)
  const projection = clamp(controls.pathProjection / 100, 0.25, 0.85)
  const verticalRadius = radius * (0.16 + 0.36 * projection) * (portrait ? 1.2 : 1)
  const depthRadius = radius * (0.70 + 0.55 * projection) * (portrait ? 1.1 : 1)
  const centreX = stage.width / 2
  const centreY = stage.height * (portrait ? 0.50 : 0.51)
  const camera = depthRadius * 2.45 + 1
  const density = clamp(1 - (window.slots - 7) * 0.018, 0.78, 1)
  const requestedSize = controls.cardSize * (portrait ? 0.88 : 1) * density
  const cardWidth = shortAxis * requestedSize / 100
  const cards = window.indices.map((sourceIndex, localIndex) => {
    const item = items[sourceIndex]
    const cyclicDistance = wrap(sourceIndex - frontContinuous, items.length)
    const slotDistance = window.large ? cyclicDistance : cyclicDistance * window.slots / items.length
    const angle = TAU * slotDistance / window.slots + Math.PI / 2
    const sine = Math.sin(angle)
    const cosine = Math.cos(angle)
    const xPath = radius * cosine
    const zPath = depthRadius * sine
    const yPath = verticalRadius * sine + 0.08 * radius * Math.cos(2 * angle)
    const frontness = clamp((sine + 1) / 2, 0, 1)
    const perspective = clamp(camera / (camera - zPath), 0.62, 1.34)
    const nearKernel = Math.pow(smooth(frontness), 2)
    const rawScale = perspective * (1 + 0.42 * strength * nearKernel)
    const width = cardWidth
    const height = width / item.ratio
    const x = centreX + assembly * xPath
    const y = centreY + assembly * yPath
    const safeScaleCap = safeScaleAt(x, y, width, height, stage, 1.70)
    const scale = 0.76 + assembly * (Math.min(rawScale, safeScaleCap) - 0.76)
    const guardDistance = window.slots / 2 - Math.abs(slotDistance)
    const guardOpacity = window.large ? ramp(guardDistance, 1.00, 2.00) : 1
    const alpha = assembly * guardOpacity * (0.18 + 0.82 * Math.pow(frontness, 1.9))
    const depth = assembly * zPath
    return {
      id: item.id,
      sourceIndex,
      localIndex,
      cyclicDistance: round(cyclicDistance),
      slotDistance: round(slotDistance),
      angleRad: round(angle),
      x: round(x),
      y: round(y),
      depth: round(depth),
      frontness: round(frontness),
      guardOpacity: round(guardOpacity),
      width: round(width),
      height: round(height),
      rawScale: round(rawScale),
      safeScaleCap: round(safeScaleCap),
      scale: round(scale),
      containerOpacity: round(alpha),
      artworkOpacity: 1,
      artworkFilter: "none",
      blendMode: "normal",
      zIndex: Math.round(depth * 1000) * 1000 + sourceIndex,
      failed: Boolean(item.failed),
      video: Boolean(item.video),
    }
  })
  return {
    scene: SCENE_ID,
    timeMs: round(finite(input.timeMs ?? 0, "timeMs")),
    durationMs: timeline.durationMs,
    phase,
    phraseRole: sampled.phraseRole,
    turn: round(turn),
    frontContinuous: round(frontContinuous),
    featuredIndex: clamp(controls.featuredIndex, 0, items.length - 1),
    window: { count: cards.length, total: items.length, large: window.large, slotCount: window.slots, sourceIndices: window.indices },
    effective: {
      orbitRadius: round(radius),
      requestedOrbitRadius: round(requestedRadius),
      verticalRadius: round(verticalRadius),
      depthRadius: round(depthRadius),
      cardSize: round(requestedSize),
      centreX: round(centreX),
      centreY: round(centreY),
      proximityStrength: round(strength),
      safetyCapActive: cards.some((card) => card.safeScaleCap < Math.min(card.rawScale, 1.70) - 1e-6) || radius < requestedRadius - 1e-6,
    },
    cards,
    timeline: { mode: timeline.mode, literalHoldMs: timeline.literalHoldMs },
    resources: { evaluated: items.length, mounted: cards.length, videoDemand: Math.min(2, cards.filter((card) => card.video && card.frontness > 0.2).length) },
  }
}

export function canonicalSnapshot(state) {
  return {
    scene: state.scene,
    durationMs: state.durationMs,
    phase: state.phase,
    phraseRole: state.phraseRole,
    turn: state.turn,
    frontContinuous: state.frontContinuous,
    featuredIndex: state.featuredIndex,
    window: state.window,
    effective: state.effective,
    cards: state.cards.map((card) => ({
      id: card.id,
      sourceIndex: card.sourceIndex,
      cyclicDistance: card.cyclicDistance,
      slotDistance: card.slotDistance,
      angleRad: card.angleRad,
      x: card.x,
      y: card.y,
      depth: card.depth,
      frontness: card.frontness,
      guardOpacity: card.guardOpacity,
      width: card.width,
      height: card.height,
      rawScale: card.rawScale,
      safeScaleCap: card.safeScaleCap,
      scale: card.scale,
      containerOpacity: card.containerOpacity,
      artworkOpacity: card.artworkOpacity,
      artworkFilter: card.artworkFilter,
      blendMode: card.blendMode,
      zIndex: card.zIndex,
      failed: card.failed,
      video: card.video,
    })),
  }
}
