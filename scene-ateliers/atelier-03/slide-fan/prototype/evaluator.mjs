export const SCENE_ID = "slide-fan"
export const DURATION_MS = 8400
export const FIXED_MIN_MS = 3200
export const DEFAULTS = Object.freeze({
  spreadAngle: 135,
  hingeHeight: 79,
  cardSize: 36,
  featuredLift: 14,
  paperBreath: 0.35,
  featuredIndex: 2,
  mode: "automatic",
  fixedDurationMs: 10000,
  direction: "forward",
  reducedMotion: false,
})

export const CONTROL_BOUNDS = Object.freeze({
  spreadAngle: [18, 170],
  hingeHeight: [68, 96],
  cardSize: [24, 58],
  featuredLift: [4, 26],
  paperBreath: [0, 1.2],
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
const pulse = (phase, riseStart, riseEnd, returnStart, returnEnd) =>
  ramp(phase, riseStart, riseEnd) * (1 - ramp(phase, returnStart, returnEnd))
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
  one: [{ id: "frame-01", ratio: 16 / 9, label: "ONE" }],
  two: [{ id: "frame-01", ratio: 16 / 9, label: "ONE" }, { id: "frame-02", ratio: 3 / 4, label: "TWO" }],
  five: [
    { id: "frame-01", ratio: 16 / 9, label: "OPEN" },
    { id: "frame-02", ratio: 1, label: "FAN" },
    { id: "frame-03", ratio: 4 / 5, label: "HINGE" },
    { id: "frame-04", ratio: 2.39, label: "LIFT" },
    { id: "frame-05", ratio: 3 / 4, label: "RETURN" },
  ],
  mixed: [
    { id: "mix-01", ratio: 2.39, label: "WIDE" }, { id: "mix-02", ratio: 3 / 4, label: "TALL" },
    { id: "mix-03", ratio: 1, label: "SQUARE" }, { id: "mix-04", ratio: 16 / 9, label: "FRAME" },
    { id: "mix-05", ratio: 4 / 5, label: "PORTRAIT" }, { id: "mix-06", ratio: 3 / 2, label: "ORDER" },
    { id: "mix-07", ratio: 9 / 16, label: "NARROW" },
  ],
  twelve: Array.from({ length: 12 }, (_, index) => ({
    id: `twelve-${String(index + 1).padStart(2, "0")}`,
    ratio: [16 / 9, 1, 4 / 5, 3 / 2][index % 4],
    label: String(index + 1).padStart(2, "0"),
  })),
  failed: [
    { id: "ok-01", ratio: 16 / 9, label: "OK" },
    { id: "failed-02", ratio: 4 / 5, label: "MISSING", failed: true },
    { id: "video-03", ratio: 16 / 9, label: "VIDEO", video: true },
    { id: "ok-04", ratio: 1, label: "OK" },
    { id: "ok-05", ratio: 3 / 4, label: "OK" },
  ],
  many127: Array.from({ length: 127 }, (_, index) => ({
    id: `many-${String(index + 1).padStart(3, "0")}`,
    ratio: [16 / 9, 1, 4 / 5, 2.39, 3 / 4][index % 5],
    label: String(index + 1),
    video: index % 37 === 0,
  })),
})

export const CANVASES = Object.freeze({
  wide: { width: 1280, height: 720, label: "16:9" },
  portrait: { width: 720, height: 1280, label: "9:16" },
  square: { width: 900, height: 900, label: "1:1" },
  fourFive: { width: 800, height: 1000, label: "4:5" },
})

const SEGMENT_TEMPLATE = Object.freeze([
  { id: "entry-open", kind: "travel", phaseStart: 0, phaseEnd: 0.24, fast: true },
  { id: "overview-hold", kind: "hold", phaseStart: 0.24, phaseEnd: 0.315 },
  { id: "spotlight-rise", kind: "travel", phaseStart: 0.315, phaseEnd: 0.395 },
  { id: "spotlight-hold", kind: "hold", phaseStart: 0.395, phaseEnd: 0.535 },
  { id: "spotlight-return", kind: "travel", phaseStart: 0.535, phaseEnd: 0.625 },
  { id: "settled-hold", kind: "hold", phaseStart: 0.625, phaseEnd: 0.655 },
  { id: "finale-rise", kind: "travel", phaseStart: 0.655, phaseEnd: 0.725, fast: true },
  { id: "finale-hold", kind: "hold", phaseStart: 0.725, phaseEnd: 0.805 },
  { id: "finale-release", kind: "travel", phaseStart: 0.805, phaseEnd: 0.865, fast: true },
  { id: "exit-close", kind: "travel", phaseStart: 0.865, phaseEnd: 1, fast: true },
])

function normalizedTimelineInput(config = {}) {
  const mode = ["automatic", "fixed-duration", "directed"].includes(config.mode) ? config.mode : DEFAULTS.mode
  const direction = config.direction === "reverse" ? "reverse" : "forward"
  const fixedDurationMs = config.fixedDurationMs === undefined
    ? DEFAULTS.fixedDurationMs
    : bounded(config.fixedDurationMs, CONTROL_BOUNDS.fixedDurationMs, "fixedDurationMs")
  return { mode, direction, fixedDurationMs }
}

export function compileTimeline(config = {}) {
  const input = normalizedTimelineInput(config)
  const canonical = SEGMENT_TEMPLATE.map((segment) => ({
    ...segment,
    canonicalMs: (segment.phaseEnd - segment.phaseStart) * DURATION_MS,
  }))
  const holdTotal = canonical.filter((segment) => segment.kind === "hold").reduce((sum, segment) => sum + segment.canonicalMs, 0)
  let durations
  if (input.mode === "automatic") {
    durations = canonical.map((segment) => segment.canonicalMs)
  } else if (input.mode === "fixed-duration") {
    const travelTotal = DURATION_MS - holdTotal
    const travelBudget = input.fixedDurationMs - holdTotal
    if (travelBudget <= 0) throw new RangeError(`${SCENE_ID}: fixed duration cannot preserve literal holds`)
    durations = canonical.map((segment) => segment.kind === "hold"
      ? segment.canonicalMs
      : segment.canonicalMs * travelBudget / travelTotal)
  } else {
    durations = canonical.map((segment) => segment.kind === "travel" && segment.fast
      ? segment.canonicalMs / 2
      : segment.canonicalMs)
  }
  let elapsed = 0
  const segments = canonical.map((segment, index) => {
    const startMs = elapsed
    elapsed += durations[index]
    return { ...segment, startMs: round(startMs), endMs: round(elapsed), durationMs: round(durations[index]) }
  })
  return {
    mode: input.mode,
    direction: input.direction,
    durationMs: round(elapsed),
    spatialDirection: "unsupported",
    temporalDirection: input.direction,
    literalHoldMs: round(holdTotal),
    segments,
  }
}

function sampleTimeline(timeMs, timeline) {
  const raw = round(mod(finite(timeMs ?? 0, "timeMs"), timeline.durationMs))
  const oriented = round(timeline.direction === "reverse" ? mod(timeline.durationMs - raw, timeline.durationMs) : raw)
  const segment = timeline.segments.find((candidate) => oriented < candidate.endMs) ?? timeline.segments.at(-1)
  const progress = clamp((oriented - segment.startMs) / Math.max(1e-9, segment.durationMs), 0, 1)
  return {
    phase: segment.phaseStart + (segment.phaseEnd - segment.phaseStart) * progress,
    phraseRole: segment.id,
    localProgress: progress,
  }
}

function validateItems(source) {
  if (!Array.isArray(source) || source.length < 1 || source.length > 127) {
    throw new RangeError(`${SCENE_ID}: ordered media must contain 1–127 items`)
  }
  const ids = new Set()
  return source.map((item, index) => {
    if (!item || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id)) {
      throw new TypeError(`${SCENE_ID}: source ${index} needs a unique non-empty id`)
    }
    ids.add(item.id)
    const ratio = finite(item.ratio ?? 16 / 9, `source ${item.id} ratio`)
    if (ratio < 0.2 || ratio > 5) throw new RangeError(`${SCENE_ID}: source ratio must be within 0.2–5`)
    return { ...item, ratio }
  })
}

function validateStage(source) {
  const width = finite(source?.width, "stage width")
  const height = finite(source?.height, "stage height")
  if (width < 1 || height < 1 || width > 16384 || height > 16384) {
    throw new RangeError(`${SCENE_ID}: stage dimensions are outside 1–16384`)
  }
  return { width, height }
}

function validateControls(source = {}) {
  const merged = { ...DEFAULTS, ...source }
  return {
    spreadAngle: bounded(merged.spreadAngle, CONTROL_BOUNDS.spreadAngle, "spreadAngle"),
    hingeHeight: bounded(merged.hingeHeight, CONTROL_BOUNDS.hingeHeight, "hingeHeight"),
    cardSize: bounded(merged.cardSize, CONTROL_BOUNDS.cardSize, "cardSize"),
    featuredLift: bounded(merged.featuredLift, CONTROL_BOUNDS.featuredLift, "featuredLift"),
    paperBreath: bounded(merged.paperBreath, CONTROL_BOUNDS.paperBreath, "paperBreath"),
    featuredIndex: Math.round(bounded(merged.featuredIndex, CONTROL_BOUNDS.featuredIndex, "featuredIndex")),
    mode: ["automatic", "fixed-duration", "directed"].includes(merged.mode) ? merged.mode : DEFAULTS.mode,
    fixedDurationMs: bounded(merged.fixedDurationMs, CONTROL_BOUNDS.fixedDurationMs, "fixedDurationMs"),
    direction: merged.direction === "reverse" ? "reverse" : "forward",
    reducedMotion: merged.reducedMotion === true,
  }
}

function sourcePhase(id) {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return mod(hash >>> 0, 1000) / 1000
}

function activeWindow(items, featuredIndex) {
  if (items.length <= 12) return { start: 0, items }
  const selected = clamp(featuredIndex, 0, items.length - 1)
  const start = clamp(selected - 5, 0, items.length - 12)
  return { start, items: items.slice(start, start + 12) }
}

function effectiveLayout(stage, controls, activeItems) {
  const mounted = activeItems.length
  const portrait = stage.height > stage.width
  const shortAxis = Math.min(stage.width, stage.height)
  const countFactor = mounted <= 2 ? 0.58 : mounted <= 5 ? 1 : clamp(1 - (mounted - 5) * 0.028, 0.72, 1)
  const spread = controls.spreadAngle * (portrait ? 0.68 : 1) * countFactor
  const requestedHingeHeight = clamp(controls.hingeHeight + (portrait ? 3 : 0), 68, 94)
  const requestedHingeY = stage.height * requestedHingeHeight / 100
  const requestedSize = controls.cardSize * (portrait ? 0.91 : 1) * clamp(1 - (mounted - 5) * 0.018, 0.76, 1)
  const requestedWidth = shortAxis * requestedSize / 100
  const minRatio = Math.min(...activeItems.map((item) => item.ratio))
  const maxAngle = Math.abs(spread) * Math.PI / 360
  const safeTop = stage.height * 0.035
  const safeSide = shortAxis * 0.025
  const lift = shortAxis * controls.featuredLift / 100
  const breath = shortAxis * controls.paperBreath / 100
  const maxScale = 1.025

  const maxTrigBlend = (cosineCoefficient, sineCoefficient) => {
    const peak = clamp(Math.atan2(sineCoefficient, cosineCoefficient), 0, maxAngle)
    return cosineCoefficient * Math.cos(peak) + sineCoefficient * Math.sin(peak)
  }
  const boundsForWidth = (width) => {
    // The most dangerous crop can happen halfway through opening, not at the
    // final fan angle. These analytic extrema cover the complete opening arc.
    const scaledHalfWidth = maxScale * width * 0.5
    const scaledHeight = maxScale * width / minRatio
    const sideExtent = maxTrigBlend(scaledHalfWidth, lift + scaledHeight)
    const topExtent = breath + maxTrigBlend(lift + scaledHeight, scaledHalfWidth)
    const bottomExtent = breath + scaledHalfWidth * Math.sin(maxAngle)
    return {
      sideExtent,
      topExtent,
      bottomExtent,
      minimumHingeY: safeTop + topExtent,
      maximumHingeY: stage.height - safeTop - bottomExtent,
    }
  }
  const fitsWidth = (width) => {
    const bounds = boundsForWidth(width)
    return bounds.sideExtent <= stage.width / 2 - safeSide && bounds.minimumHingeY <= bounds.maximumHingeY
  }
  let low = 0
  let high = requestedWidth
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const mid = (low + high) / 2
    if (fitsWidth(mid)) low = mid
    else high = mid
  }
  const width = Math.max(1, low)
  const bounds = boundsForWidth(width)
  const hingeY = clamp(requestedHingeY, bounds.minimumHingeY, bounds.maximumHingeY)
  const hingeHeight = hingeY / stage.height * 100
  return {
    portrait,
    shortAxis,
    spread,
    requestedHingeHeight,
    hingeHeight,
    requestedCardSize: requestedSize,
    cardSize: width / shortAxis * 100,
    cardWidth: width,
    safetyCapActive: width < requestedWidth - 1e-6 || Math.abs(hingeY - requestedHingeY) > 1e-6,
    minRatio,
  }
}

export function evaluate(input = {}) {
  const items = validateItems(input.items ?? FIXTURES.five)
  const stage = validateStage(input.stage ?? CANVASES.wide)
  const controls = validateControls(input.controls)
  const timeline = compileTimeline(controls)
  const sampled = controls.reducedMotion
    ? { phase: 0.24, phraseRole: "reduced-motion-overview", localProgress: 1 }
    : sampleTimeline(input.timeMs ?? 0, timeline)
  const phase = round(sampled.phase)
  const selected = clamp(controls.featuredIndex, 0, items.length - 1)
  const window = activeWindow(items, selected)
  const layout = effectiveLayout(stage, controls, window.items)
  const hinge = { x: stage.width * 0.5, y: stage.height * layout.hingeHeight / 100 }
  const mounted = window.items.length
  const openOut = controls.reducedMotion ? 1 : 1 - ramp(phase, 0.865, 0.985)
  const spotlight = pulse(phase, 0.315, 0.395, 0.535, 0.625)
  const finale = pulse(phase, 0.655, 0.725, 0.805, 0.865)
  const finaleIndex = items.length <= 12 ? items.length - 1 : window.start + window.items.length - 1
  const finaleLocal = finaleIndex - window.start
  const stableMask = (controls.reducedMotion ? 0 : 1) * ramp(phase, 0.20, 0.24) * (1 - ramp(phase, 0.29, 0.315))
  const cards = window.items.map((item, localIndex) => {
    const sourceIndex = window.start + localIndex
    const position = mounted <= 1 ? 0 : localIndex / (mounted - 1) - 0.5
    const centreDistance = Math.abs(localIndex - (mounted - 1) / 2)
    const stagger = mounted <= 1 ? 0 : Math.abs(position) * 0.035 + centreDistance * 0.003
    const openIn = controls.reducedMotion ? 1 : ramp(phase, 0.015 + stagger, 0.175 + stagger)
    const open = clamp(Math.min(openIn, openOut), 0, 1)
    const slotAngle = position * layout.spread
    let angle = slotAngle * open
    const selectedLift = sourceIndex === selected ? spotlight : 0
    const finaleLift = sourceIndex === finaleIndex ? finale * 0.8 : 0
    if (finale > 0 && finaleLocal >= 0 && finaleLocal < mounted) {
      const finalPosition = mounted <= 1 ? 0 : finaleLocal / (mounted - 1) - 0.5
      const target = finalPosition * layout.spread
      angle += (target - angle) * 0.09 * finale
    }
    const radians = angle * Math.PI / 180
    const cardWidth = layout.cardWidth
    const cardHeight = cardWidth / item.ratio
    const liftPx = layout.shortAxis * controls.featuredLift / 100 * (selectedLift + finaleLift)
    const breathPx = layout.shortAxis * controls.paperBreath / 100 * stableMask * Math.sin(TAU * (2 * phase + sourcePhase(item.id)))
    const bottomX = hinge.x + Math.sin(radians) * liftPx
    const bottomY = hinge.y - Math.cos(radians) * liftPx + breathPx
    const scale = 1 + 0.025 * (selectedLift + finaleLift)
    const promoted = (sourceIndex === selected ? spotlight : 0) + (sourceIndex === finaleIndex ? finale : 0)
    const centreRank = Math.round((mounted - centreDistance) * 100)
    return {
      id: item.id,
      sourceIndex,
      localIndex,
      ratio: round(item.ratio),
      angleDeg: round(angle),
      bottomX: round(bottomX),
      bottomY: round(bottomY),
      width: round(cardWidth),
      height: round(cardHeight),
      scale: round(scale),
      containerOpacity: 1,
      artworkOpacity: 1,
      artworkFilter: "none",
      blendMode: "normal",
      zIndex: Math.round((centreRank + promoted * 10000) * 1000) * 256 + sourceIndex,
      visible: true,
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
    window: { start: window.start, count: mounted, total: items.length },
    selectedIndex: selected,
    finaleIndex,
    hinge: { x: round(hinge.x), y: round(hinge.y) },
    effective: {
      spreadAngle: round(layout.spread),
      requestedCardSize: round(layout.requestedCardSize),
      cardSize: round(layout.cardSize),
      requestedHingeHeight: round(layout.requestedHingeHeight),
      hingeHeight: round(layout.hingeHeight),
      safetyCapActive: layout.safetyCapActive,
    },
    spotlight: round(spotlight),
    finale: round(finale),
    cards,
    timeline: { mode: timeline.mode, literalHoldMs: timeline.literalHoldMs },
    resources: { evaluated: items.length, mounted, videoDemand: Math.min(3, cards.filter((card) => card.video).length) },
  }
}

export function canonicalSnapshot(state) {
  return {
    scene: state.scene,
    durationMs: state.durationMs,
    phase: state.phase,
    phraseRole: state.phraseRole,
    window: state.window,
    selectedIndex: state.selectedIndex,
    finaleIndex: state.finaleIndex,
    hinge: state.hinge,
    effective: state.effective,
    cards: state.cards.map((card) => ({
      id: card.id,
      sourceIndex: card.sourceIndex,
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
