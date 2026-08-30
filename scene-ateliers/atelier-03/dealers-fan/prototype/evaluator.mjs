export const SCENE_ID = "dealers-fan"
export const DURATION_MS = 9500
export const FIXED_MIN_MS = 3600
export const DEFAULTS = Object.freeze({
  fanStep: 11,
  pivotDepth: 42,
  visibleWindow: 7,
  presentationLift: 17,
  cardSize: 35,
  spotlightIndex: 2,
  mode: "automatic",
  fixedDurationMs: 12000,
  direction: "forward",
  reducedMotion: false,
})

export const CONTROL_BOUNDS = Object.freeze({
  fanStep: [4, 18],
  pivotDepth: [18, 78],
  visibleWindow: [3, 11],
  presentationLift: [6, 30],
  cardSize: [22, 48],
  spotlightIndex: [0, 126],
  fixedDurationMs: [FIXED_MIN_MS, 60000],
})

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor
const smooth = (value) => {
  const x = clamp(value, 0, 1)
  return x * x * x * (x * (x * 6 - 15) + 10)
}
const ramp = (phase, start, end) => smooth((phase - start) / Math.max(1e-9, end - start))
const round = (value) => Number(value.toFixed(6))
const finite = (value, label) => {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new TypeError(`${SCENE_ID}: ${label} must be finite`)
  return number
}
const bounded = (value, bounds, label) => {
  const number = finite(value, label)
  if (number < bounds[0] || number > bounds[1]) {
    throw new RangeError(`${SCENE_ID}: ${label} must be within ${bounds[0]}–${bounds[1]}`)
  }
  return number
}

export const FIXTURES = Object.freeze({
  one: [{ id: "card-01", ratio: 16 / 9, label: "ONE" }],
  two: [{ id: "card-01", ratio: 16 / 9, label: "ONE" }, { id: "card-02", ratio: 3 / 4, label: "TWO" }],
  five: [
    { id: "card-01", ratio: 16 / 9, label: "APPROACH" },
    { id: "card-02", ratio: 1, label: "YIELD" },
    { id: "card-03", ratio: 4 / 5, label: "CROWN" },
    { id: "card-04", ratio: 2.39, label: "HANDOFF" },
    { id: "card-05", ratio: 3 / 4, label: "FINALE" },
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
    { id: "ok-05", ratio: 3 / 4, label: "OK" },
  ],
  many127: Array.from({ length: 127 }, (_, index) => ({
    id: `many-${String(index + 1).padStart(3, "0")}`,
    ratio: [16 / 9, 1, 4 / 5, 2.39, 3 / 4][index % 5],
    label: String(index + 1),
    video: index % 41 === 0,
  })),
})

export const CANVASES = Object.freeze({
  wide: { width: 1280, height: 720, label: "16:9" },
  portrait: { width: 720, height: 1280, label: "9:16" },
  square: { width: 900, height: 900, label: "1:1" },
  fourFive: { width: 800, height: 1000, label: "4:5" },
})

const SEGMENT_TEMPLATE = Object.freeze([
  { id: "entry-riffle", kind: "travel", phaseStart: 0, phaseEnd: 0.08, fast: true },
  { id: "deal-to-crown", kind: "travel", phaseStart: 0.08, phaseEnd: 0.34 },
  { id: "spotlight-crown-hold", kind: "hold", phaseStart: 0.34, phaseEnd: 0.46 },
  { id: "ordered-handoff", kind: "travel", phaseStart: 0.46, phaseEnd: 0.82 },
  { id: "finale-crown-hold", kind: "hold", phaseStart: 0.82, phaseEnd: 0.92 },
  { id: "terminal-yield", kind: "travel", phaseStart: 0.92, phaseEnd: 1, fast: true },
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
    if (travelBudget <= 0) throw new RangeError(`${SCENE_ID}: fixed duration cannot preserve literal crown holds`)
    durations = canonical.map((segment) => segment.kind === "hold" ? segment.canonicalMs : segment.canonicalMs * travelBudget / travelTotal)
  } else {
    durations = canonical.map((segment) => segment.kind === "travel" && segment.fast ? segment.canonicalMs / 2 : segment.canonicalMs)
  }
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
  return {
    phase: segment.phaseStart + (segment.phaseEnd - segment.phaseStart) * progress,
    phraseRole: segment.id,
  }
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
  const visibleWindow = Math.round(bounded(merged.visibleWindow, CONTROL_BOUNDS.visibleWindow, "visibleWindow"))
  if (visibleWindow % 2 === 0) throw new RangeError(`${SCENE_ID}: visibleWindow must be odd`)
  return {
    fanStep: bounded(merged.fanStep, CONTROL_BOUNDS.fanStep, "fanStep"),
    pivotDepth: bounded(merged.pivotDepth, CONTROL_BOUNDS.pivotDepth, "pivotDepth"),
    visibleWindow,
    presentationLift: bounded(merged.presentationLift, CONTROL_BOUNDS.presentationLift, "presentationLift"),
    cardSize: bounded(merged.cardSize, CONTROL_BOUNDS.cardSize, "cardSize"),
    spotlightIndex: Math.round(bounded(merged.spotlightIndex, CONTROL_BOUNDS.spotlightIndex, "spotlightIndex")),
    mode: ["automatic", "fixed-duration", "directed"].includes(merged.mode) ? merged.mode : DEFAULTS.mode,
    fixedDurationMs: bounded(merged.fixedDurationMs, CONTROL_BOUNDS.fixedDurationMs, "fixedDurationMs"),
    direction: merged.direction === "reverse" ? "reverse" : "forward",
    reducedMotion: merged.reducedMotion === true,
  }
}

function focusAt(phase, count, spotlightIndex) {
  if (count <= 1) return 0
  const last = count - 1
  const spotlight = clamp(Math.round(spotlightIndex), 0, last)
  if (phase < 0.08) return 0
  if (phase < 0.34) return spotlight * smooth((phase - 0.08) / 0.26)
  if (phase < 0.46) return spotlight
  if (phase < 0.82) return spotlight + (last - spotlight) * smooth((phase - 0.46) / 0.36)
  return last
}

function envelopeAt(phase, reducedMotion) {
  if (reducedMotion) return { spread: 1, opacity: 1 }
  return {
    spread: ramp(phase, 0, 0.08) * (1 - ramp(phase, 0.92, 1)),
    opacity: ramp(phase, 0.015, 0.075) * (1 - ramp(phase, 0.94, 1)),
  }
}

function nearestWindow(items, focus, limit) {
  if (items.length <= limit) return { start: 0, items }
  const half = Math.floor(limit / 2)
  const centre = clamp(Math.round(focus), 0, items.length - 1)
  const start = clamp(centre - half, 0, items.length - limit)
  return { start, items: items.slice(start, start + limit) }
}

function deriveGeometry(stage, controls, activeItems) {
  const portrait = stage.height > stage.width
  const shortAxis = Math.min(stage.width, stage.height)
  const depth = controls.pivotDepth / 100 + (portrait ? 0.12 : 0)
  const pivot = { x: stage.width / 2, y: stage.height * (1 + depth) }
  const crownBottomY = stage.height * (portrait ? 0.70 : 0.78)
  const armLength = pivot.y - crownBottomY
  const density = clamp(1 - (activeItems.length - 5) * 0.018, 0.82, 1)
  const requestedSize = controls.cardSize * (portrait ? 0.9 : 1) * density
  const requestedWidth = shortAxis * requestedSize / 100
  const minRatio = Math.min(...activeItems.map((item) => item.ratio))
  const safeMargin = shortAxis * 0.025
  const maxLift = shortAxis * controls.presentationLift / 100
  const maxScale = 1.07
  const heightCap = (crownBottomY - maxLift - safeMargin) * minRatio / maxScale
  const width = Math.max(1, Math.min(requestedWidth, heightCap))
  const radius = Math.floor(controls.visibleWindow / 2)
  const requestedStep = controls.fanStep * (portrait ? 0.76 : 1) * clamp(1 - (activeItems.length - 5) * 0.025, 0.78, 1)
  const fitsStep = (step) => {
    const cardWidth = width * maxScale
    const cardHeight = width / minRatio * maxScale
    for (let slot = -radius; slot <= radius; slot += 1) {
      // Check the whole opening path, not only the final angle. A shallow pivot can
      // otherwise leave an outer card's bottom edge below the stage while its x
      // bounds still look valid.
      for (let sample = 0; sample <= 12; sample += 1) {
        const radians = slot * step * (sample / 12) * Math.PI / 180
        const cosine = Math.cos(radians)
        const sine = Math.sin(radians)
        for (const lift of [0, maxLift]) {
          const bottomX = pivot.x + sine * (armLength + lift)
          const bottomY = pivot.y - cosine * (armLength + lift)
          const corners = [
            [-cardWidth / 2, -cardHeight],
            [cardWidth / 2, -cardHeight],
            [-cardWidth / 2, 0],
            [cardWidth / 2, 0],
          ]
          for (const [localX, localY] of corners) {
            const x = bottomX + localX * cosine - localY * sine
            const y = bottomY + localX * sine + localY * cosine
            if (x < safeMargin || x > stage.width - safeMargin || y < safeMargin || y > stage.height - safeMargin) return false
          }
        }
      }
    }
    return true
  }
  let low = 0
  let high = requestedStep
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const mid = (low + high) / 2
    if (fitsStep(mid)) low = mid
    else high = mid
  }
  return {
    portrait,
    shortAxis,
    depth,
    pivot,
    crownBottomY,
    armLength,
    requestedCardSize: requestedSize,
    cardSize: width / shortAxis * 100,
    cardWidth: width,
    requestedFanStep: requestedStep,
    fanStep: low,
    safetyCapActive: width < requestedWidth - 1e-6 || low < requestedStep - 1e-6,
  }
}

export function evaluate(input = {}) {
  const items = validateItems(input.items ?? FIXTURES.five)
  const stage = validateStage(input.stage ?? CANVASES.wide)
  const controls = validateControls(input.controls)
  const timeline = compileTimeline(controls)
  const sampled = controls.reducedMotion
    ? { phase: 0.38, phraseRole: "reduced-motion-crown" }
    : sampleTimeline(input.timeMs ?? 0, timeline)
  const phase = round(sampled.phase)
  const focus = focusAt(phase, items.length, controls.spotlightIndex)
  const envelope = envelopeAt(phase, controls.reducedMotion)
  const window = nearestWindow(items, focus, controls.visibleWindow)
  const geometry = deriveGeometry(stage, controls, window.items)
  const radius = Math.floor(controls.visibleWindow / 2)
  const cards = window.items.map((item, localIndex) => {
    const sourceIndex = window.start + localIndex
    const distance = sourceIndex - focus
    const crown = smooth(1 - clamp(Math.abs(distance), 0, 1))
    const angle = distance * geometry.fanStep * envelope.spread
    const radians = angle * Math.PI / 180
    const fade = 1 - smooth((Math.abs(distance) - (radius - 0.75)) / 0.75)
    const width = geometry.cardWidth
    const height = width / item.ratio
    const lift = geometry.shortAxis * controls.presentationLift / 100 * crown
    const bottomX = geometry.pivot.x + Math.sin(radians) * (geometry.armLength + lift)
    const bottomY = geometry.pivot.y - Math.cos(radians) * (geometry.armLength + lift)
    const scale = 1 + 0.07 * crown
    const depthScore = Math.round((crown * 100000 + (1 - Math.min(Math.abs(distance), 10) / 10) * 1000) * 1000) * 256 + sourceIndex
    return {
      id: item.id,
      sourceIndex,
      localIndex,
      ratio: round(item.ratio),
      distance: round(distance),
      angleDeg: round(angle),
      bottomX: round(bottomX),
      bottomY: round(bottomY),
      width: round(width),
      height: round(height),
      scale: round(scale),
      containerOpacity: round(envelope.opacity * clamp(fade, 0, 1)),
      artworkOpacity: 1,
      artworkFilter: "none",
      blendMode: "normal",
      zIndex: depthScore,
      visible: fade > 0,
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
    focus: round(focus),
    nearestIndex: clamp(Math.round(focus), 0, items.length - 1),
    spotlightIndex: clamp(controls.spotlightIndex, 0, items.length - 1),
    window: { start: window.start, count: window.items.length, total: items.length },
    pivot: { x: round(geometry.pivot.x), y: round(geometry.pivot.y) },
    effective: {
      fanStep: round(geometry.fanStep),
      requestedFanStep: round(geometry.requestedFanStep),
      cardSize: round(geometry.cardSize),
      requestedCardSize: round(geometry.requestedCardSize),
      pivotDepth: round(geometry.depth * 100),
      armLength: round(geometry.armLength),
      crownBottomY: round(geometry.crownBottomY),
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
    focus: state.focus,
    nearestIndex: state.nearestIndex,
    spotlightIndex: state.spotlightIndex,
    window: state.window,
    pivot: state.pivot,
    effective: state.effective,
    cards: state.cards.map((card) => ({
      id: card.id,
      sourceIndex: card.sourceIndex,
      distance: card.distance,
      angleDeg: card.angleDeg,
      bottomX: card.bottomX,
      bottomY: card.bottomY,
      width: card.width,
      height: card.height,
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
