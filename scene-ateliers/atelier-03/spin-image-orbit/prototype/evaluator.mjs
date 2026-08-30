export const SCENE_ID = "spin-image-orbit"
export const DURATION_MS = 9600
export const FIXED_MIN_MS = 3800
export const DEFAULTS = Object.freeze({
  ellipseWidth: 88,
  ellipseHeight: 34,
  planeYaw: 26,
  planePitch: 14,
  cardSize: 21,
  featuredIndex: 2,
  mode: "automatic",
  fixedDurationMs: 12800,
  direction: "forward",
  reducedMotion: false,
})
export const CONTROL_BOUNDS = Object.freeze({
  ellipseWidth: [58, 110],
  ellipseHeight: [16, 58],
  planeYaw: [-42, 42],
  planePitch: [-18, 30],
  cardSize: [14, 28],
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
const radians = (degrees) => degrees * Math.PI / 180
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
  one: [{ id: "wide-01", ratio: 16 / 9, label: "ONE" }],
  two: [{ id: "wide-01", ratio: 16 / 9, label: "FRONT" }, { id: "wide-02", ratio: 3 / 4, label: "REAR" }],
  six: [
    { id: "wide-01", ratio: 16 / 9, label: "REAR" }, { id: "wide-02", ratio: 1, label: "APPROACH" },
    { id: "wide-03", ratio: 4 / 5, label: "FEATURE" }, { id: "wide-04", ratio: 2.39, label: "DEPART" },
    { id: "wide-05", ratio: 3 / 4, label: "SHOULDER" }, { id: "wide-06", ratio: 3 / 2, label: "FINALE" },
  ],
  mixed: [
    { id: "mix-01", ratio: 2.39, label: "WIDE" }, { id: "mix-02", ratio: 3 / 4, label: "TALL" },
    { id: "mix-03", ratio: 1, label: "SQUARE" }, { id: "mix-04", ratio: 16 / 9, label: "FRAME" },
    { id: "mix-05", ratio: 4 / 5, label: "PORTRAIT" }, { id: "mix-06", ratio: 3 / 2, label: "ORDER" },
  ],
  failed: [
    { id: "ok-01", ratio: 16 / 9, label: "OK" }, { id: "failed-02", ratio: 4 / 5, label: "MISSING", failed: true },
    { id: "ok-03", ratio: 1, label: "OK" }, { id: "video-04", ratio: 16 / 9, label: "VIDEO", video: true },
    { id: "ok-05", ratio: 3 / 4, label: "OK" }, { id: "ok-06", ratio: 3 / 2, label: "OK" },
  ],
  many127: Array.from({ length: 127 }, (_, index) => ({
    id: `many-${String(index + 1).padStart(3, "0")}`,
    ratio: [16 / 9, 1, 4 / 5, 2.39, 3 / 4][index % 5],
    label: String(index + 1),
    video: index % 31 === 0,
  })),
})
export const CANVASES = Object.freeze({
  wide: { width: 1280, height: 720, label: "16:9" },
  portrait: { width: 720, height: 1280, label: "9:16" },
  square: { width: 900, height: 900, label: "1:1" },
  fourFive: { width: 800, height: 1000, label: "4:5" },
})

const SEGMENT_TEMPLATE = Object.freeze([
  { id: "entry-assemble", kind: "travel", phaseStart: 0, phaseEnd: 0.08, fast: true },
  { id: "pan-to-shoulder", kind: "travel", phaseStart: 0.08, phaseEnd: 0.30 },
  { id: "shoulder-to-front", kind: "travel", phaseStart: 0.30, phaseEnd: 0.40 },
  { id: "spotlight-front-hold", kind: "hold", phaseStart: 0.40, phaseEnd: 0.50 },
  { id: "pan-to-finale", kind: "travel", phaseStart: 0.50, phaseEnd: 0.84 },
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
    ellipseWidth: bounded(merged.ellipseWidth, CONTROL_BOUNDS.ellipseWidth, "ellipseWidth"),
    ellipseHeight: bounded(merged.ellipseHeight, CONTROL_BOUNDS.ellipseHeight, "ellipseHeight"),
    planeYaw: bounded(merged.planeYaw, CONTROL_BOUNDS.planeYaw, "planeYaw"),
    planePitch: bounded(merged.planePitch, CONTROL_BOUNDS.planePitch, "planePitch"),
    cardSize: bounded(merged.cardSize, CONTROL_BOUNDS.cardSize, "cardSize"),
    featuredIndex: Math.round(bounded(merged.featuredIndex, CONTROL_BOUNDS.featuredIndex, "featuredIndex")),
    mode: ["automatic", "fixed-duration", "directed"].includes(merged.mode) ? merged.mode : DEFAULTS.mode,
    fixedDurationMs: bounded(merged.fixedDurationMs, CONTROL_BOUNDS.fixedDurationMs, "fixedDurationMs"),
    direction: merged.direction === "reverse" ? "reverse" : "forward",
    reducedMotion: merged.reducedMotion === true,
  }
}

function nextTurn(targetPhase, sourceIndex, count, prior) {
  if (count <= 1) return prior
  let turn = targetPhase - sourceIndex / count
  while (turn < prior - 1e-9) turn += 1
  return turn
}
function assemblyAt(phase, reducedMotion) { return reducedMotion ? 1 : ramp(phase, 0, 0.08) * (1 - ramp(phase, 0.92, 1)) }
function phraseAt(phase, count, featuredIndex, frontPhase) {
  if (count <= 1) return { turn: frontPhase, role: "single-front", featuredTurn: frontPhase, finaleTurn: frontPhase }
  const selected = clamp(Math.round(featuredIndex), 0, count - 1)
  const finale = count - 1
  const shoulderOffset = 0.17
  const featuredTurn = nextTurn(frontPhase, selected, count, 0)
  const shoulderTurn = nextTurn(mod(frontPhase - shoulderOffset, 1), selected, count, 0)
  // Dense windows must not make a short featured-to-finale shortcut that skips
  // most ordered identities. After the featured hold, bounded-many phrases
  // complete one full panoramic turn before resolving the finale at the same
  // analytical front gate. Small sets already mount every source and keep the
  // shorter authored phrase.
  const finalePrior = count > 24 ? featuredTurn + 1 : featuredTurn
  const finaleTurn = nextTurn(frontPhase, finale, count, finalePrior)
  if (phase < 0.08) return { turn: 0, role: "entry-assemble", featuredTurn, finaleTurn }
  if (phase < 0.30) return { turn: shoulderTurn * smooth((phase - 0.08) / 0.22), role: "pan-to-shoulder", featuredTurn, finaleTurn }
  if (phase < 0.40) return { turn: shoulderTurn + (featuredTurn - shoulderTurn) * smooth((phase - 0.30) / 0.10), role: "shoulder-to-front", featuredTurn, finaleTurn }
  if (phase < 0.50) return { turn: featuredTurn, role: "spotlight-front-hold", featuredTurn, finaleTurn }
  if (phase < 0.84) return { turn: featuredTurn + (finaleTurn - featuredTurn) * smooth((phase - 0.50) / 0.34), role: "pan-to-finale", featuredTurn, finaleTurn }
  return { turn: finaleTurn, role: phase < 0.92 ? "finale-front-hold" : "exit-disassemble", featuredTurn, finaleTurn }
}
function windowFor(count, frontContinuous) {
  if (count <= 24) return { indices: Array.from({ length: count }, (_, index) => index), slots: Math.max(1, count), large: false }
  const slots = 18
  const centre = Math.round(frontContinuous)
  const start = centre - Math.floor(slots / 2)
  return { indices: Array.from({ length: slots }, (_, index) => mod(start + index, count)), slots, large: true }
}
function transformPoint(angle, geometry) {
  const u = geometry.majorRadius * Math.cos(angle)
  const v = geometry.minorRadius * Math.sin(angle)
  const xAfterYaw = u * Math.cos(geometry.yaw)
  const zAfterYaw = -u * Math.sin(geometry.yaw)
  const yAfterYaw = v
  return {
    x: xAfterYaw,
    y: yAfterYaw * Math.cos(geometry.pitch) - zAfterYaw * Math.sin(geometry.pitch),
    z: yAfterYaw * Math.sin(geometry.pitch) + zAfterYaw * Math.cos(geometry.pitch),
  }
}
function safeScaleAt(x, y, width, height, stage, ceiling) {
  const margin = Math.min(stage.width, stage.height) * 0.025
  const xRoom = Math.max(0, Math.min(x - margin, stage.width - margin - x))
  const yRoom = Math.max(0, Math.min(y - margin, stage.height - margin - y))
  return Math.max(0.12, Math.min(ceiling, 2 * xRoom / Math.max(1, width), 2 * yRoom / Math.max(1, height)))
}
function derivePlane(stage, controls, activeItems, slots) {
  const portrait = stage.height > stage.width
  const shortAxis = Math.min(stage.width, stage.height)
  const requestedEllipseWidth = portrait ? Math.min(controls.ellipseWidth, 80) : controls.ellipseWidth
  const requestedEllipseHeight = portrait ? Math.max(controls.ellipseHeight, 44) : controls.ellipseHeight
  const yaw = radians(portrait ? controls.planeYaw * 0.68 : controls.planeYaw)
  const pitch = radians(portrait ? clamp(controls.planePitch + 7, -18, 30) : controls.planePitch)
  const requestedMajorRadius = stage.width * clamp(requestedEllipseWidth, 58, 110) / 200
  const requestedMinorRadius = stage.height * clamp(requestedEllipseHeight, 16, 58) / 200
  const density = clamp(1 - Math.max(0, slots - 6) * 0.022, 0.72, 1)
  const requestedSize = controls.cardSize * (portrait ? 0.86 : 1) * density
  const requestedCardWidth = shortAxis * requestedSize / 100
  const minRatio = Math.min(...activeItems.map((item) => item.ratio))
  const margin = shortAxis * 0.025
  const maxScale = 1.28
  const centreX = stage.width / 2
  const centreY = stage.height * (portrait ? 0.50 : 0.51)

  // Card size and path share the same safety budget. This preserves the ellipse
  // rather than clamping individual cards after their centres have left the stage.
  const horizontalRoom = Math.max(1, Math.min(centreX - margin, stage.width - margin - centreX))
  const verticalRoom = Math.max(1, Math.min(centreY - margin, stage.height - margin - centreY))
  const cardWidthCap = Math.max(1, Math.min(
    requestedCardWidth,
    2 * horizontalRoom / maxScale,
    2 * verticalRoom * minRatio / maxScale,
  ))
  const halfWidth = cardWidthCap * maxScale / 2
  const halfHeight = cardWidthCap / minRatio * maxScale / 2
  const xBudget = Math.max(0, horizontalRoom - halfWidth)
  const yBudget = Math.max(0, verticalRoom - halfHeight)
  const requestedXAmplitude = Math.abs(requestedMajorRadius * Math.cos(yaw))
  const requestedYAmplitude = Math.hypot(
    requestedMinorRadius * Math.cos(pitch),
    requestedMajorRadius * Math.sin(yaw) * Math.sin(pitch),
  )
  const pathScale = Math.max(0, Math.min(
    1,
    requestedXAmplitude > 1e-9 ? xBudget / requestedXAmplitude : 1,
    requestedYAmplitude > 1e-9 ? yBudget / requestedYAmplitude : 1,
  ))
  const majorRadius = requestedMajorRadius * pathScale
  const minorRadius = requestedMinorRadius * pathScale
  const cosineCoefficient = -majorRadius * Math.sin(yaw) * Math.cos(pitch)
  const sineCoefficient = minorRadius * Math.sin(pitch)
  const depthMax = Math.max(1, Math.hypot(cosineCoefficient, sineCoefficient))
  const frontAngle = Math.atan2(sineCoefficient, cosineCoefficient)
  const frontPhase = mod(frontAngle / TAU, 1)
  return {
    portrait,
    shortAxis,
    requestedMajorRadius,
    requestedMinorRadius,
    majorRadius,
    minorRadius,
    pathScale,
    yaw,
    pitch,
    depthMax,
    frontAngle,
    frontPhase,
    requestedSize,
    requestedCardWidth,
    cardWidth: cardWidthCap,
    minRatio,
    centreX,
    centreY,
    centreShiftX: 0,
    centreShiftY: 0,
    safetyCapActive: pathScale < 1 - 1e-6 || cardWidthCap < requestedCardWidth - 1e-6,
  }
}

export function evaluate(input = {}) {
  const items = validateItems(input.items ?? FIXTURES.six)
  const stage = validateStage(input.stage ?? CANVASES.wide)
  const controls = validateControls(input.controls)
  const timeline = compileTimeline(controls)
  const sampled = controls.reducedMotion
    ? { phase: 0.44, phraseRole: "reduced-motion-front" }
    : sampleTimeline(input.timeMs ?? 0, timeline)
  const phase = round(sampled.phase)
  const preliminary = derivePlane(stage, controls, items.slice(0, Math.min(items.length, 18)), Math.min(items.length, 18))
  const phrase = phraseAt(phase, items.length, controls.featuredIndex, preliminary.frontPhase)
  const turn = controls.reducedMotion
    ? (items.length <= 1 ? preliminary.frontPhase : nextTurn(preliminary.frontPhase, clamp(controls.featuredIndex, 0, items.length - 1), items.length, 0))
    : phrase.turn
  const assembly = assemblyAt(phase, controls.reducedMotion)
  const frontContinuous = items.length ? mod(items.length * (preliminary.frontPhase - turn), items.length) : 0
  const window = windowFor(items.length, frontContinuous)
  const activeItems = window.indices.map((index) => items[index])
  const geometry = derivePlane(stage, controls, activeItems, window.slots)
  const cameraDistance = Math.max(geometry.majorRadius, geometry.minorRadius) * 2.75 + 1
  const cards = window.indices.map((sourceIndex, localIndex) => {
    const item = items[sourceIndex]
    const cyclicDistance = wrap(sourceIndex - frontContinuous, items.length)
    const slotDistance = window.large ? cyclicDistance : cyclicDistance * window.slots / items.length
    const angle = geometry.frontAngle + TAU * slotDistance / window.slots
    const point = transformPoint(angle, geometry)
    const frontness = clamp((point.z / geometry.depthMax + 1) / 2, 0, 1)
    const perspective = clamp(cameraDistance / (cameraDistance - point.z), 0.72, 1.28)
    const width = geometry.cardWidth
    const height = width / item.ratio
    const x = geometry.centreX + assembly * point.x
    const y = geometry.centreY + assembly * point.y
    const safeScaleCap = safeScaleAt(x, y, width, height, stage, 1.28)
    const scale = 0.78 + assembly * (Math.min(perspective, safeScaleCap) - 0.78)
    const guardDistance = window.slots / 2 - Math.abs(slotDistance)
    const guardOpacity = window.large ? ramp(guardDistance, 1.30, 2.30) : 1
    const alpha = assembly * guardOpacity * (0.32 + 0.68 * smooth(frontness))
    const shoulderDistance = Math.abs(wrap(angle / TAU - geometry.frontPhase, 1))
    const zone = shoulderDistance <= 0.065 ? "front" : shoulderDistance <= 0.235 ? "shoulder" : "rear"
    const depth = assembly * point.z
    return {
      id: item.id,
      sourceIndex,
      localIndex,
      cyclicDistance: round(cyclicDistance),
      slotDistance: round(slotDistance),
      thetaRad: round(angle),
      x: round(x),
      y: round(y),
      depth: round(depth),
      frontness: round(frontness),
      guardOpacity: round(guardOpacity),
      perspective: round(perspective),
      width: round(width),
      height: round(height),
      safeScaleCap: round(safeScaleCap),
      scale: round(scale),
      containerOpacity: round(alpha),
      artworkOpacity: 1,
      artworkFilter: "none",
      blendMode: "normal",
      cameraFacing: true,
      zone,
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
    phraseRole: phrase.role === "single-front" ? phrase.role : sampled.phraseRole,
    turn: round(turn),
    frontContinuous: round(frontContinuous),
    featuredIndex: clamp(controls.featuredIndex, 0, items.length - 1),
    window: { count: cards.length, total: items.length, large: window.large, slotCount: window.slots, sourceIndices: window.indices },
    effective: {
      ellipseWidth: round(geometry.majorRadius * 2),
      ellipseHeight: round(geometry.minorRadius * 2),
      planeYawDeg: round(geometry.yaw * 180 / Math.PI),
      planePitchDeg: round(geometry.pitch * 180 / Math.PI),
      frontAngleRad: round(geometry.frontAngle),
      frontPhase: round(geometry.frontPhase),
      zMax: round(geometry.depthMax),
      requestedEllipseWidth: round(geometry.requestedMajorRadius * 2),
      requestedEllipseHeight: round(geometry.requestedMinorRadius * 2),
      pathScale: round(geometry.pathScale),
      cardSize: round(geometry.cardWidth / geometry.shortAxis * 100),
      requestedCardSize: round(geometry.requestedSize),
      centreX: round(geometry.centreX),
      centreY: round(geometry.centreY),
      centreShiftX: round(geometry.centreShiftX),
      centreShiftY: round(geometry.centreShiftY),
      safetyCapActive: geometry.safetyCapActive || cards.some((card) => card.safeScaleCap < Math.min(card.perspective, 1.28) - 1e-6),
    },
    cards,
    timeline: { mode: timeline.mode, literalHoldMs: timeline.literalHoldMs },
    resources: { evaluated: items.length, mounted: cards.length, videoDemand: Math.min(2, cards.filter((card) => card.video && card.zone !== "rear").length) },
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
      thetaRad: card.thetaRad,
      x: card.x,
      y: card.y,
      depth: card.depth,
      frontness: card.frontness,
      guardOpacity: card.guardOpacity,
      perspective: card.perspective,
      width: card.width,
      height: card.height,
      safeScaleCap: card.safeScaleCap,
      scale: card.scale,
      containerOpacity: card.containerOpacity,
      artworkOpacity: card.artworkOpacity,
      artworkFilter: card.artworkFilter,
      blendMode: card.blendMode,
      cameraFacing: card.cameraFacing,
      zone: card.zone,
      zIndex: card.zIndex,
      failed: card.failed,
      video: card.video,
    })),
  }
}
