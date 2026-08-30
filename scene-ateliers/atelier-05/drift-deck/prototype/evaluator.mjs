const TAU = Math.PI * 2
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor
const fract = (value) => value - Math.floor(value)
const mix = (from, to, amount) => from + (to - from) * amount
const smoothstep = (value) => { const t = clamp(value); return t * t * (3 - 2 * t) }
const smootherstep = (value) => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10) }
const round = (value, digits = 6) => Number(value.toFixed(digits))
const hash01 = (index, salt) => fract(Math.sin((index + 1) * 127.1 + salt * 311.7) * 43758.5453123)

export const sceneMeta = {
  id: "drift-deck",
  name: "Scatter — Quiet Drift",
  motionSentence: "Prints occupy remembered places on one quiet table, following separate loop-closed micro-currents; focus lifts one print and returns it without collision, jump, or z-order surprise.",
  defaultFixture: "recommended",
  evidenceFixtures: ["one", "two", "recommended", "bounded-many", "mixed-failed"],
  representativeTime: 0.463,
  debugTime: 0.327,
  alphaSupported: true,
  alphaConsequence: "Not applicable: this candidate supports clean transparent output.",
  resourceObservation: {
    maximumAcceptedSources: 12,
    evaluatedCardsPerFrame: "exact source count, bounded at 12",
    mountedCardPolicy: "one card object per accepted source; no duplicate loop copies",
    evaluatorAllocationPolicy: "fresh bounded state only; no timers, listeners, media elements, retained history, or GPU resources",
    remountExpectation: "stateless evaluator; browser shell owns one animation-frame callback and removes no external resources"
  },
  seamDelta(start, end, before) {
    const byId = new Map(end.cards.map((card) => [card.id, card]))
    let maxPosition = 0, maxRotation = 0, maxLift = 0
    for (const card of start.cards) {
      const other = byId.get(card.id)
      maxPosition = Math.max(maxPosition, Math.hypot(card.x - other.x, card.y - other.y))
      maxRotation = Math.max(maxRotation, Math.abs(card.rotation - other.rotation))
      maxLift = Math.max(maxLift, Math.abs(card.lift - other.lift))
    }
    return {
      startEndMaxPositionPx: round(maxPosition, 9),
      startEndMaxRotationRad: round(maxRotation, 12),
      startEndMaxLiftPx: round(maxLift, 9),
      beforeEndMaxPositionPx: round(Math.max(...before.cards.map((card) => {
        const other = byId.get(card.id); return Math.hypot(card.x - other.x, card.y - other.y)
      })), 6)
    }
  }
}

export const controlDescriptors = [
  { id: "composition-spread", parameter: "compositionSpread", label: "Composition spread", type: "range", default: 64, min: 36, max: 92, step: 1, unit: "%" },
  { id: "overlap-depth", parameter: "overlapDepth", label: "Overlap / depth", type: "range", default: 42, min: 0, max: 80, step: 1, unit: "%" },
  { id: "drift-strength", parameter: "driftStrength", label: "Drift strength", type: "range", default: 34, min: 0, max: 70, step: 1, unit: "%" },
  { id: "focus-lift", parameter: "focusLift", label: "Focus lift", type: "range", default: 28, min: 0, max: 60, step: 1, unit: "%" },
  { id: "cycle-pace", parameter: "cyclePace", label: "Cycle pace", type: "range", default: 10.5, min: 6, max: 18, step: 0.5, unit: "s" }
]

export const defaultControls = () => Object.fromEntries(controlDescriptors.map((descriptor) => [descriptor.parameter, descriptor.default]))
export const canonicalTimes = [0, 0.041667, 0.083333, 0.166667, 0.25, 0.333333, 0.416667, 0.5, 0.583333, 0.666667, 0.75, 0.833333, 0.916667, 0.999999, 1]
export const phaseBoundaries = [0, 0.08, 0.78, 0.9, 1]
export const fixtureNames = ["one", "two", "recommended", "bounded-many", "mixed-failed"]

const RATIOS = [16 / 9, 3 / 4, 1, 4 / 5, 2.39, 9 / 16, 3 / 2, 5 / 4, 1.91, 2 / 3, 4 / 3, 1.2]
function fixture(count, failedIndex = -1) {
  return Array.from({ length: count }, (_, index) => ({
    id: `quiet-print-${String(index + 1).padStart(2, "0")}`,
    sourceIndex: index,
    ratio: RATIOS[index % RATIOS.length],
    fit: index % 4 === 0 ? "cover" : "contain",
    focalPoint: [round(0.28 + hash01(index, 8) * 0.44, 4), round(0.3 + hash01(index, 9) * 0.4, 4)],
    failed: index === failedIndex,
    type: index === 2 ? "video" : "image",
    videoDurationSeconds: index === 2 ? 7.25 : null
  }))
}
export function makeFixture(name) {
  if (name === "one") return fixture(1)
  if (name === "two") return fixture(2)
  if (name === "bounded-many") return fixture(12, 8)
  if (name === "mixed-failed") return fixture(7, 3)
  return fixture(5)
}

export function sourceVideoTimeSeconds(timeMs, durationSeconds, loop = true) {
  if (!Number.isFinite(timeMs) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const seconds = Math.max(0, timeMs / 1000)
  return loop ? mod(seconds, durationSeconds) : Math.min(seconds, durationSeconds)
}

export function compileTimeline({ mode = "automatic", itemCount = 1, controls = defaultControls(), direction = "forward" } = {}) {
  const count = Math.max(1, Math.min(12, Math.round(itemCount)))
  const baseMs = clamp(Number(controls.cyclePace) || 10.5, 6, 18) * 1000
  if (mode === "fixed-duration") {
    return { mode, direction, durationMs: 14000, cycleCount: 1, segments: [{ id: "fixed-phrase", kind: "cycle", cycles: 1, paceScale: baseMs / 14000, startMs: 0, endMs: 14000 }] }
  }
  if (mode === "directed") {
    const source = [
      { id: "fast-opening", cycles: 2, paceScale: 2 },
      { id: "regular-middle", cycles: 1, paceScale: 1 },
      { id: "fast-finale", cycles: 1, paceScale: 2 }
    ]
    let elapsed = 0, cycleStart = 0
    const segments = source.map((segment) => {
      const duration = baseMs * segment.cycles / segment.paceScale
      const compiled = { ...segment, kind: "cycle", startMs: elapsed, endMs: elapsed + duration, cycleStart, cycleEnd: cycleStart + segment.cycles }
      elapsed += duration; cycleStart += segment.cycles
      return compiled
    })
    return { mode, direction, durationMs: elapsed, cycleCount: 4, segments }
  }
  return { mode: "automatic", direction, durationMs: baseMs, cycleCount: 1, segments: [{ id: "automatic-phrase", kind: "cycle", cycles: 1, paceScale: 1, startMs: 0, endMs: baseMs, cycleStart: 0, cycleEnd: 1 }] }
}

function temporal(timeline, timeMs) {
  const local = mod(timeMs, timeline.durationMs)
  const segment = timeline.segments.find((candidate) => local < candidate.endMs) ?? timeline.segments.at(-1)
  const progress = clamp((local - segment.startMs) / Math.max(1, segment.endMs - segment.startMs))
  const cycles = (segment.cycleStart ?? 0) + segment.cycles * progress
  const forwardPhase = fract(cycles)
  const phase = timeline.direction === "reverse" ? fract(1 - forwardPhase) : forwardPhase
  const velocity = (timeline.direction === "reverse" ? -1 : 1) * segment.cycles / Math.max(1, segment.endMs - segment.startMs)
  return { localTimeMs: local, phase, velocity, segmentId: segment.id }
}

const GENERAL_SLOTS = [
  [0.30, 0.37, -0.055], [0.51, 0.33, 0.031], [0.70, 0.43, -0.021], [0.39, 0.57, 0.026],
  [0.61, 0.64, -0.043], [0.22, 0.57, 0.018], [0.79, 0.31, 0.041], [0.29, 0.73, -0.028],
  [0.76, 0.69, 0.014], [0.51, 0.49, -0.009], [0.16, 0.29, -0.018], [0.84, 0.54, 0.029]
]

function baseLayouts(items, width, height, controls) {
  const count = items.length
  const minDimension = Math.min(width, height)
  const spread = clamp(controls.compositionSpread / 100, 0.36, 0.92)
  const depth = clamp(controls.overlapDepth / 100, 0, 0.8)
  const baseHeight = minDimension * (count === 1 ? 0.52 : count === 2 ? 0.43 : count <= 5 ? mix(0.29, 0.35, depth) : mix(0.19, 0.245, depth))
  return items.map((item, index) => {
    let sx, sy, rotation
    if (count === 1) [sx, sy, rotation] = [0.5, 0.5, 0]
    else if (count === 2) [sx, sy, rotation] = index === 0 ? [0.38, 0.49, -0.035] : [0.62, 0.51, 0.029]
    else [sx, sy, rotation] = GENERAL_SLOTS[index]
    sx = 0.5 + (sx - 0.5) * (0.68 + spread * 0.52)
    sy = 0.5 + (sy - 0.5) * (0.72 + spread * 0.45)
    const cardHeight = baseHeight * (0.92 + hash01(index, 1) * 0.16)
    const cardWidth = Math.min(width * 0.47, cardHeight * clamp(item.ratio, 0.58, 2.4))
    return { x: sx * width, y: sy * height, width: cardWidth, height: cardHeight, rotation, baseZ: index, id: item.id }
  })
}

function phaseEnvelope(phase) {
  if (phase < 0.08) return { phaseName: "entry", motionGain: smootherstep(phase / 0.08), focusProgress: 0, focusGain: 0 }
  if (phase < 0.78) return { phaseName: "micro-currents", motionGain: 1, focusProgress: (phase - 0.08) / 0.70, focusGain: 1 }
  if (phase < 0.90) {
    const progress = (phase - 0.78) / 0.12
    return { phaseName: "finale-stillness", motionGain: 1 - smootherstep(progress), focusProgress: 1, focusGain: smootherstep(progress) }
  }
  const progress = (phase - 0.90) / 0.10
  return { phaseName: "return", motionGain: 0, focusProgress: 1, focusGain: 1 - smootherstep(progress) }
}

function overlapSignature(cards) {
  const pairs = []
  for (let a = 0; a < cards.length; a += 1) {
    for (let b = a + 1; b < cards.length; b += 1) {
      const A = cards[a], B = cards[b]
      const overlapX = Math.abs(A.x - B.x) < (A.width + B.width) * 0.44
      const overlapY = Math.abs(A.y - B.y) < (A.height + B.height) * 0.44
      if (overlapX && overlapY) pairs.push(`${A.id}|${B.id}`)
    }
  }
  return pairs.join(",")
}

export function evaluateScene({ items, controls = defaultControls(), timeline, timeMs, width, height, reducedMotion = false, debug = false, selectedIndex = 0 }) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 12) throw new Error("Quiet Drift accepts 1–12 ordered sources in this atelier candidate.")
  const temporalState = temporal(timeline, timeMs)
  const phase = temporalState.phase
  const envelope = phaseEnvelope(phase)
  const baselines = baseLayouts(items, width, height, controls)
  const count = items.length
  const minDimension = Math.min(width, height)
  const strength = reducedMotion ? 0 : clamp(controls.driftStrength / 100, 0, 0.7)
  const amplitude = minDimension * 0.045 * strength * envelope.motionGain
  const focusCycle = envelope.focusProgress * count
  const active = reducedMotion ? mod(Math.round(selectedIndex), count) : Math.min(count - 1, Math.floor(clamp(focusCycle, 0, count - 1e-9)))
  const localFocus = reducedMotion ? 1 : Math.sin(Math.PI * fract(focusCycle))
  const finaleIndex = count - 1
  const focusIndex = envelope.phaseName === "finale-stillness" || envelope.phaseName === "return" ? finaleIndex : active
  const focusGain = reducedMotion ? 0.42 : (envelope.phaseName === "micro-currents" ? localFocus : envelope.focusGain)
  const liftPx = minDimension * 0.038 * clamp(controls.focusLift / 100, 0, 0.6) * focusGain
  const cards = items.map((item, index) => {
    const baseline = baselines[index]
    const angle = TAU * phase
    const h1 = 1 + Math.floor(hash01(index, 2) * 2)
    const h2 = h1 + 1 + Math.floor(hash01(index, 3) * 2)
    const offset = hash01(index, 4) * TAU
    const dx = amplitude * (0.67 * Math.sin(h1 * angle + offset) + 0.33 * Math.sin(h2 * angle - offset * 0.7))
    const dy = amplitude * (0.62 * Math.cos(h2 * angle + offset * 0.5) + 0.38 * Math.sin(h1 * angle - offset))
    const rotationalDrift = strength * envelope.motionGain * (0.015 * Math.sin(h1 * angle + offset))
    const focused = index === focusIndex && focusGain > 0.001
    const lift = focused ? liftPx : 0
    return {
      ...item,
      x: baseline.x + dx,
      y: baseline.y + dy,
      baseX: baseline.x,
      baseY: baseline.y,
      width: baseline.width,
      height: baseline.height,
      rotation: baseline.rotation + rotationalDrift,
      baseRotation: baseline.rotation,
      baseZ: baseline.baseZ,
      focusPlane: focused,
      z: focused ? 1000 + baseline.baseZ : baseline.baseZ,
      lift,
      visible: true,
      artworkOpacity: 1,
      artworkFilter: "none",
      blendMode: "normal",
      sourceVideoTimeSeconds: item.type === "video" ? sourceVideoTimeSeconds(timeMs, item.videoDurationSeconds, true) : null
    }
  }).sort((a, b) => a.z - b.z)
  return {
    sceneId: sceneMeta.id,
    width, height,
    phase, phaseName: envelope.phaseName,
    selectedIndex: focusIndex,
    temporal: temporalState,
    timeline,
    controls: { ...controls },
    cards,
    baselineOverlapSignature: overlapSignature(baselines),
    currentOverlapSignature: overlapSignature(cards),
    debug
  }
}

export function summarizeState(state) {
  const visible = state.cards.filter((card) => card.visible !== false)
  return {
    phase: round(state.phase),
    phaseName: state.phaseName,
    segmentId: state.temporal.segmentId,
    selectedIndex: state.selectedIndex,
    visibleCount: visible.length,
    identityOrder: visible.map((card) => card.id),
    overlapSignature: state.currentOverlapSignature,
    baselineOverlapSignature: state.baselineOverlapSignature,
    maxLiftPx: round(Math.max(0, ...visible.map((card) => card.lift))),
    firstCards: visible.slice(0, 3).map((card) => ({ id: card.id, x: round(card.x, 3), y: round(card.y, 3), rotation: round(card.rotation, 6), z: card.z, focusPlane: card.focusPlane })),
    sourceTreatment: { artworkOpacity: 1, artworkFilter: "none", blendMode: "normal" }
  }
}

export const testVectorCases = canonicalTimes.slice(0, 12).map((normalizedTime, index) => ({
  id: `quiet-drift-canonical-${String(index).padStart(2, "0")}`,
  fixture: index % 4 === 0 ? "one" : index % 4 === 1 ? "two" : index % 4 === 2 ? "recommended" : "mixed-failed",
  canvas: index % 4 === 0 ? [1920, 1080] : index % 4 === 1 ? [1080, 1920] : index % 4 === 2 ? [1080, 1080] : [1080, 1350],
  normalizedTime,
  mode: index % 3 === 0 ? "automatic" : index % 3 === 1 ? "fixed-duration" : "directed",
  reducedMotion: index === 10,
  selectedIndex: 2
})).concat([
  { id: "quiet-drift-seam-start", fixture: "bounded-many", canvas: [1920, 1080], normalizedTime: 0, mode: "automatic" },
  { id: "quiet-drift-seam-end", fixture: "bounded-many", canvas: [1920, 1080], normalizedTime: 1, mode: "automatic" },
  { id: "quiet-drift-control-low", fixture: "recommended", canvas: [1920, 1080], normalizedTime: 0.42, controls: { driftStrength: 0, focusLift: 0 } },
  { id: "quiet-drift-control-high", fixture: "recommended", canvas: [1920, 1080], normalizedTime: 0.42, controls: { driftStrength: 70, focusLift: 60 } }
])
