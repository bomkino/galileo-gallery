export const SCENE_ID = "orbit-ring"
export const DURATION_MS = 11000
export const FIXED_MIN_MS = 3800
export const DEFAULTS = Object.freeze({
  ringRadius: 38,
  planeTilt: 12,
  cardSize: 24,
  featuredIndex: 2,
  mode: "automatic",
  fixedDurationMs: 14000,
  direction: "forward",
  reducedMotion: false,
})
export const CONTROL_BOUNDS = Object.freeze({
  ringRadius: [24, 48],
  planeTilt: [4, 24],
  cardSize: [16, 34],
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
  one: [{ id: "ring-01", ratio: 16 / 9, label: "ONE" }],
  two: [{ id: "ring-01", ratio: 16 / 9, label: "FRONT" }, { id: "ring-02", ratio: 3 / 4, label: "REAR" }],
  six: [
    { id: "ring-01", ratio: 16 / 9, label: "GATE" }, { id: "ring-02", ratio: 1, label: "SHOULDER" },
    { id: "ring-03", ratio: 4 / 5, label: "HOLD" }, { id: "ring-04", ratio: 2.39, label: "REAR" },
    { id: "ring-05", ratio: 3 / 4, label: "RETURN" }, { id: "ring-06", ratio: 3 / 2, label: "FINALE" },
  ],
  mixed: [
    { id: "mix-01", ratio: 2.39, label: "WIDE" }, { id: "mix-02", ratio: 3 / 4, label: "TALL" },
    { id: "mix-03", ratio: 1, label: "SQUARE" }, { id: "mix-04", ratio: 16 / 9, label: "FRAME" },
    { id: "mix-05", ratio: 4 / 5, label: "PORTRAIT" }, { id: "mix-06", ratio: 3 / 2, label: "ORDER" },
    { id: "mix-07", ratio: 9 / 16, label: "NARROW" },
  ],
  failed: [
    { id: "ok-01", ratio: 16 / 9, label: "OK" }, { id: "failed-02", ratio: 4 / 5, label: "MISSING", failed: true },
    { id: "video-03", ratio: 16 / 9, label: "VIDEO", video: true }, { id: "ok-04", ratio: 1, label: "OK" },
    { id: "ok-05", ratio: 3 / 4, label: "OK" }, { id: "ok-06", ratio: 3 / 2, label: "OK" },
  ],
  many127: Array.from({ length: 127 }, (_, index) => ({
    id: `many-${String(index + 1).padStart(3, "0")}`,
    ratio: [16 / 9, 1, 4 / 5, 2.39, 3 / 4][index % 5],
    label: String(index + 1),
    video: index % 43 === 0,
  })),
})
export const CANVASES = Object.freeze({
  wide: { width: 1280, height: 720, label: "16:9" },
  portrait: { width: 720, height: 1280, label: "9:16" },
  square: { width: 900, height: 900, label: "1:1" },
  fourFive: { width: 800, height: 1000, label: "4:5" },
})

const SEGMENT_TEMPLATE = Object.freeze([
  { id: "entry-assemble", kind: "travel", phaseStart: 0, phaseEnd: 0.10, fast: true },
  { id: "orbit-to-spotlight", kind: "travel", phaseStart: 0.10, phaseEnd: 0.38 },
  { id: "spotlight-front-hold", kind: "hold", phaseStart: 0.38, phaseEnd: 0.50 },
  { id: "orbit-to-finale", kind: "travel", phaseStart: 0.50, phaseEnd: 0.84 },
  { id: "finale-front-hold", kind: "hold", phaseStart: 0.84, phaseEnd: 0.92 },
  { id: "exit-disassemble", kind: "travel", phaseStart: 0.92, phaseEnd: 1, fast: true },
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
    if (travelBudget <= 0) throw new RangeError(`${SCENE_ID}: fixed duration cannot preserve literal front holds`)
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
    ringRadius: bounded(merged.ringRadius, CONTROL_BOUNDS.ringRadius, "ringRadius"),
    planeTilt: bounded(merged.planeTilt, CONTROL_BOUNDS.planeTilt, "planeTilt"),
    cardSize: bounded(merged.cardSize, CONTROL_BOUNDS.cardSize, "cardSize"),
    featuredIndex: Math.round(bounded(merged.featuredIndex, CONTROL_BOUNDS.featuredIndex, "featuredIndex")),
    mode: ["automatic", "fixed-duration", "directed"].includes(merged.mode) ? merged.mode : DEFAULTS.mode,
    fixedDurationMs: bounded(merged.fixedDurationMs, CONTROL_BOUNDS.fixedDurationMs, "fixedDurationMs"),
    direction: merged.direction === "reverse" ? "reverse" : "forward",
    reducedMotion: merged.reducedMotion === true,
  }
}

function nextFrontTurn(index, count, prior) {
  if (count <= 1) return prior
  let turn = 1 - index / count
  while (turn < prior - 1e-9) turn += 1
  return turn
}
function turnAt(phase, count, featuredIndex) {
  if (count <= 1) return 0
  const selected = clamp(Math.round(featuredIndex), 0, count - 1)
  const finale = count - 1
  const spotlightTurn = nextFrontTurn(selected, count, 0)
  const finaleTurn = nextFrontTurn(finale, count, spotlightTurn)
  if (phase < 0.10) return 0
  if (phase < 0.38) return spotlightTurn * smooth((phase - 0.10) / 0.28)
  if (phase < 0.50) return spotlightTurn
  if (phase < 0.84) return spotlightTurn + (finaleTurn - spotlightTurn) * smooth((phase - 0.50) / 0.34)
  return finaleTurn
}
function assemblyAt(phase, reducedMotion) {
  return reducedMotion ? 1 : ramp(phase, 0, 0.10) * (1 - ramp(phase, 0.92, 1))
}
function windowFor(count, frontContinuous) {
  if (count <= 24) return { indices: Array.from({ length: count }, (_, index) => index), slots: Math.max(1, count), large: false }
  const slots = 18
  const centre = Math.round(frontContinuous)
  const start = centre - Math.floor(slots / 2)
  return { indices: Array.from({ length: slots }, (_, index) => mod(start + index, count)), slots, large: true }
}

function deriveGeometry(stage, controls, items, slots) {
  const portrait = stage.height > stage.width
  const shortAxis = Math.min(stage.width, stage.height)
  const density = clamp(1 - (slots - 6) * 0.025, 0.70, 1)
  const requestedSize = controls.cardSize * (portrait ? 0.90 : 1) * density
  const requestedWidth = shortAxis * requestedSize / 100
  const minRatio = Math.min(...items.map((item) => item.ratio))
  const tilt = controls.planeTilt * (portrait ? 1.18 : 1) * Math.PI / 180
  const safeMargin = shortAxis * 0.025
  const maxScale = 1.14
  const cardWidthCap = Math.min(
    (stage.width - 2 * safeMargin) / maxScale,
    (stage.height - 2 * safeMargin) * minRatio / maxScale,
  )
  const cardWidth = Math.max(1, Math.min(requestedWidth, cardWidthCap))
  const maxHalfWidth = cardWidth * maxScale / 2
  const maxHalfHeight = cardWidth / minRatio * maxScale / 2
  const centreX = stage.width / 2
  const centreY = stage.height * (portrait ? 0.46 : 0.50)
  const requestedRadius = shortAxis * controls.ringRadius / 100 * (portrait ? 0.94 : 1)
  const horizontalCap = centreX - safeMargin - maxHalfWidth
  const verticalRoom = Math.min(centreY - safeMargin - maxHalfHeight, stage.height - safeMargin - centreY - maxHalfHeight)
  const verticalCap = Math.abs(Math.sin(tilt)) < 1e-6 ? Number.POSITIVE_INFINITY : verticalRoom / Math.abs(Math.sin(tilt))
  const radius = Math.max(1, Math.min(requestedRadius, horizontalCap, verticalCap))
  return {
    portrait,
    shortAxis,
    density,
    tilt,
    requestedSize,
    cardSize: cardWidth / shortAxis * 100,
    cardWidth,
    requestedRadius,
    radius,
    centreX,
    centreY,
    safetyCapActive: cardWidth < requestedWidth - 1e-6 || radius < requestedRadius - 1e-6,
  }
}

export function evaluate(input = {}) {
  const items = validateItems(input.items ?? FIXTURES.six)
  const stage = validateStage(input.stage ?? CANVASES.wide)
  const controls = validateControls(input.controls)
  const timeline = compileTimeline(controls)
  const sampled = controls.reducedMotion
    ? { phase: 0.42, phraseRole: "reduced-motion-front" }
    : sampleTimeline(input.timeMs ?? 0, timeline)
  const phase = round(sampled.phase)
  const turn = turnAt(phase, items.length, controls.featuredIndex)
  const assembly = assemblyAt(phase, controls.reducedMotion)
  const frontContinuous = items.length ? mod(-turn * items.length, items.length) : 0
  const window = windowFor(items.length, frontContinuous)
  const activeItems = window.indices.map((index) => items[index])
  const geometry = deriveGeometry(stage, controls, activeItems, window.slots)
  const focalLength = geometry.radius * 4.2 + 1
  const cards = window.indices.map((sourceIndex, localIndex) => {
    const item = items[sourceIndex]
    const cyclicDistance = wrap(sourceIndex - frontContinuous, items.length)
    const slotDistance = window.large ? cyclicDistance : cyclicDistance * window.slots / items.length
    const angle = TAU * slotDistance / window.slots + Math.PI / 2
    const xLocal = geometry.radius * Math.cos(angle)
    const zLocal = geometry.radius * Math.sin(angle)
    const depth = zLocal * Math.cos(geometry.tilt) * assembly
    const frontness = clamp((zLocal / geometry.radius + 1) / 2, 0, 1)
    const perspective = clamp(focalLength / (focalLength - depth), 0.76, 1.14)
    const width = geometry.cardWidth
    const height = width / item.ratio
    const guardDistance = window.slots / 2 - Math.abs(slotDistance)
    const guardOpacity = window.large ? ramp(guardDistance, 1.00, 2.00) : 1
    const alpha = assembly * guardOpacity * (0.38 + 0.62 * Math.pow(frontness, 1.4))
    const x = geometry.centreX + xLocal * assembly
    const y = geometry.centreY + zLocal * Math.sin(geometry.tilt) * assembly
    const rotateYDeg = clamp(-xLocal / Math.max(1, geometry.radius) * 7, -7, 7) * assembly
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
      scale: round(0.84 + assembly * (perspective - 0.84)),
      rotateYDeg: round(rotateYDeg),
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
      ringRadius: round(geometry.radius),
      requestedRingRadius: round(geometry.requestedRadius),
      planeTiltDeg: round(geometry.tilt * 180 / Math.PI),
      cardSize: round(geometry.cardSize),
      requestedCardSize: round(geometry.requestedSize),
      centreX: round(geometry.centreX),
      centreY: round(geometry.centreY),
      safetyCapActive: geometry.safetyCapActive,
    },
    cards,
    timeline: { mode: timeline.mode, literalHoldMs: timeline.literalHoldMs },
    resources: { evaluated: items.length, mounted: cards.length, videoDemand: Math.min(2, cards.filter((card) => card.video).length) },
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
      scale: card.scale,
      rotateYDeg: card.rotateYDeg,
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
