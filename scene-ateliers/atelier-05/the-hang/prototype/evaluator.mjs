const TAU = Math.PI * 2
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor
const fract = (value) => value - Math.floor(value)
const mix = (a, b, t) => a + (b - a) * t
const smoothstep = (value) => { const t = clamp(value); return t * t * (3 - 2 * t) }
const smootherstep = (value) => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10) }
const round = (value, digits = 6) => Number(value.toFixed(digits))
const hash01 = (index, salt) => fract(Math.sin((index + 1) * 193.7 + salt * 277.3) * 49371.174)

export const sceneMeta = {
  id: "the-hang",
  name: "The Hang — Suspended Gallery",
  motionSentence: "Frames descend from fixed upper anchors, share one gentle impulse, and settle with believable damping; every frame's pivot, length, arc, identity, and return remain continuous.",
  defaultFixture: "recommended",
  evidenceFixtures: ["one", "two", "recommended", "bounded-many", "mixed-failed"],
  representativeTime: 0.46,
  debugTime: 0.39,
  alphaSupported: true,
  alphaConsequence: "Not applicable: transparent output remains available; rail, wires, and frames are legitimate opaque Scene pixels.",
  resourceObservation: {
    maximumAcceptedSources: 10,
    evaluatedFramesPerStoryFrame: "exact accepted source count",
    physicalModel: "closed-form damped pendulum evaluation; no iterative integration or retained simulation state",
    evaluatorAllocationPolicy: "bounded fresh state; no timers, random state, listeners, media elements, retained velocities, or GPU resources",
    remountExpectation: "fixed pivots and lengths recompile identically from ordered sources and controls"
  },
  seamDelta(start, end, before) {
    const endById = new Map(end.cards.map((card) => [card.id, card]))
    let position = 0, angle = 0, length = 0
    for (const card of start.cards) {
      const other = endById.get(card.id)
      position = Math.max(position, Math.hypot(card.x - other.x, card.y - other.y))
      angle = Math.max(angle, Math.abs(card.angle - other.angle))
      length = Math.max(length, Math.abs(card.currentLength - other.currentLength))
    }
    return { startEndMaxPositionPx: round(position, 9), startEndMaxAngleRad: round(angle, 12), startEndMaxLengthPx: round(length, 9), beforeEndMaxAngleRad: round(Math.max(...before.cards.map((card) => Math.abs(card.angle))), 9) }
  }
}

export const controlDescriptors = [
  { id: "hang-spread", parameter: "hangSpread", label: "Hang spread", type: "range", default: 74, min: 45, max: 95, step: 1, unit: "%" },
  { id: "length-variance", parameter: "lengthVariance", label: "Length variance", type: "range", default: 36, min: 0, max: 70, step: 1, unit: "%" },
  { id: "impulse-strength", parameter: "impulseStrength", label: "Impulse strength", type: "range", default: 32, min: 0, max: 65, step: 1, unit: "%" },
  { id: "damping", parameter: "damping", label: "Damping", type: "range", default: 68, min: 35, max: 92, step: 1, unit: "%" },
  { id: "focus-lift", parameter: "focusLift", label: "Focus lift", type: "range", default: 20, min: 0, max: 50, step: 1, unit: "%" }
]
export const defaultControls = () => Object.fromEntries(controlDescriptors.map((descriptor) => [descriptor.parameter, descriptor.default]))
export const canonicalTimes = [0, 0.041667, 0.083333, 0.166667, 0.25, 0.333333, 0.416667, 0.5, 0.583333, 0.666667, 0.75, 0.833333, 0.916667, 0.999999, 1]
export const phaseBoundaries = [0, 0.14, 0.24, 0.78, 0.9, 1]
export const fixtureNames = ["one", "two", "recommended", "bounded-many", "mixed-failed"]
const RATIOS = [4 / 5, 16 / 9, 3 / 4, 1, 2.39, 9 / 16, 3 / 2, 5 / 4, 1.91, 2 / 3]
function fixture(count, failedIndex = -1) {
  return Array.from({ length: count }, (_, index) => ({
    id: `hanging-frame-${String(index + 1).padStart(2, "0")}`,
    sourceIndex: index,
    ratio: RATIOS[index % RATIOS.length],
    fit: index % 4 === 1 ? "cover" : "contain",
    failed: index === failedIndex,
    type: index === 3 ? "video" : "image",
    videoDurationSeconds: index === 3 ? 8.8 : null
  }))
}
export function makeFixture(name) {
  if (name === "one") return fixture(1)
  if (name === "two") return fixture(2)
  if (name === "bounded-many") return fixture(10, 7)
  if (name === "mixed-failed") return fixture(8, 4)
  return fixture(6)
}
export function sourceVideoTimeSeconds(timeMs, durationSeconds, loop = true) {
  if (!Number.isFinite(timeMs) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const seconds = Math.max(0, timeMs / 1000)
  return loop ? mod(seconds, durationSeconds) : Math.min(seconds, durationSeconds)
}

export function compileTimeline({ mode = "automatic", itemCount = 1, controls = defaultControls(), direction = "forward" } = {}) {
  const count = Math.max(1, Math.min(10, Math.round(itemCount)))
  const baseMs = 12500
  if (mode === "fixed-duration") return { mode, direction, durationMs: 15000, cycleCount: 1, segments: [{ id: "fixed-impulse", kind: "cycle", cycles: 1, paceScale: baseMs / 15000, startMs: 0, endMs: 15000, cycleStart: 0, cycleEnd: 1 }] }
  if (mode === "directed") {
    const source = [{ id: "fast-opening", cycles: 2, paceScale: 2 }, { id: "regular-middle", cycles: 1, paceScale: 1 }, { id: "fast-finale", cycles: 1, paceScale: 2 }]
    let elapsed = 0, cycleStart = 0
    const segments = source.map((segment) => { const duration = baseMs * segment.cycles / segment.paceScale; const out = { ...segment, kind: "cycle", startMs: elapsed, endMs: elapsed + duration, cycleStart, cycleEnd: cycleStart + segment.cycles }; elapsed += duration; cycleStart += segment.cycles; return out })
    return { mode, direction, durationMs: elapsed, cycleCount: 4, segments }
  }
  return { mode: "automatic", direction, durationMs: baseMs, cycleCount: 1, segments: [{ id: "automatic-impulse", kind: "cycle", cycles: 1, paceScale: 1, startMs: 0, endMs: baseMs, cycleStart: 0, cycleEnd: 1 }] }
}
function temporal(timeline, timeMs) {
  const local = mod(timeMs, timeline.durationMs)
  const segment = timeline.segments.find((candidate) => local < candidate.endMs) ?? timeline.segments.at(-1)
  const progress = clamp((local - segment.startMs) / Math.max(1, segment.endMs - segment.startMs))
  const cycles = (segment.cycleStart ?? 0) + segment.cycles * progress
  const forward = fract(cycles)
  const phase = timeline.direction === "reverse" ? fract(1 - forward) : forward
  return { localTimeMs: local, phase, segmentId: segment.id, velocity: (timeline.direction === "reverse" ? -1 : 1) * segment.cycles / Math.max(1, segment.endMs - segment.startMs) }
}

function phaseEnvelope(phase) {
  if (phase < 0.14) return { name: "descent", lengthGain: smootherstep(phase / 0.14), swingGain: 0, finale: 0 }
  if (phase < 0.24) return { name: "shared-impulse", lengthGain: 1, swingGain: smootherstep((phase - 0.14) / 0.10), finale: 0 }
  if (phase < 0.78) return { name: "damped-settle", lengthGain: 1, swingGain: 1, settle: (phase - 0.24) / 0.54, finale: 0 }
  if (phase < 0.90) return { name: "finale-restraint", lengthGain: 1, swingGain: 1 - smootherstep((phase - 0.78) / 0.12), settle: 1, finale: smootherstep((phase - 0.78) / 0.12) }
  return { name: "retraction", lengthGain: 1 - smootherstep((phase - 0.90) / 0.10), swingGain: 0, settle: 1, finale: 1 }
}
function anchorLayout(index, count, width, height, spreadControl) {
  const spread = clamp(spreadControl / 100, 0.45, 0.95)
  const portrait = height / width > 1.2
  const rows = (portrait && count > 4) || count > 8 ? 2 : 1
  const columns = Math.ceil(count / rows)
  const row = Math.floor(index / columns)
  const rowStart = row * columns
  const countInRow = Math.min(columns, count - rowStart)
  const column = index - rowStart
  let x
  if (countInRow === 1) x = width * 0.5
  else if (count === 2) x = width * (column === 0 ? 0.36 : 0.64)
  else x = width * (0.5 + (column / (countInRow - 1) - 0.5) * spread * 0.86)
  const y = height * (0.065 + row * 0.18 + (column % 3) * 0.008)
  const spacing = countInRow <= 1 ? width * 0.6 : width * spread * 0.86 / (countInRow - 1)
  return { x, y, row, column, rows, columns, spacing }
}
function collisionPairs(cards) {
  const pairs = []
  for (let a = 0; a < cards.length; a += 1) for (let b = a + 1; b < cards.length; b += 1) {
    const A = cards[a], B = cards[b]
    if (Math.abs(A.x - B.x) < (A.width + B.width) * 0.47 && Math.abs(A.y - B.y) < (A.height + B.height) * 0.47) pairs.push(`${A.id}|${B.id}`)
  }
  return pairs
}

export function evaluateScene({ items, controls = defaultControls(), timeline, timeMs, width, height, reducedMotion = false, debug = false, selectedIndex = 0 }) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 10) throw new Error("The Hang accepts 1–10 ordered sources in this atelier candidate.")
  const temporalState = temporal(timeline, timeMs)
  const phase = temporalState.phase
  const envelope = phaseEnvelope(phase)
  const count = items.length
  const minDimension = Math.min(width, height)
  const lengthVariance = clamp(controls.lengthVariance / 100, 0, 0.7)
  const impulse = reducedMotion ? 0 : clamp(controls.impulseStrength / 100, 0, 0.65)
  const dampingRate = mix(2.8, 8.2, clamp((controls.damping - 35) / (92 - 35)))
  const focusProgress = envelope.name === "damped-settle" ? envelope.settle * count : count - 1
  const active = reducedMotion ? mod(Math.round(selectedIndex), count) : Math.min(count - 1, Math.floor(clamp(focusProgress, 0, count - 1e-9)))
  const focusWave = reducedMotion ? 0.4 : envelope.name === "damped-settle" ? Math.sin(Math.PI * fract(focusProgress)) * (1 - envelope.settle * 0.35) : envelope.name === "finale-restraint" ? envelope.finale : envelope.name === "retraction" ? 1 - smootherstep((phase - .9) / .1) : 0
  const baseFrameHeight = minDimension * (count === 1 ? 0.42 : count === 2 ? 0.31 : count <= 6 ? 0.215 : 0.17)
  const cards = items.map((item, index) => {
    const anchor = anchorLayout(index, count, width, height, controls.hangSpread)
    const px = anchor.x
    const py = anchor.y
    const rowLengthBase = anchor.rows === 2 ? (anchor.row === 0 ? 0.29 : 0.48) : 0.34
    const baseLength = height * (count === 1 ? 0.42 : rowLengthBase + hash01(index, 2) * (anchor.rows === 2 ? 0.07 : 0.13))
    const variance = (hash01(index, 3) - 0.5) * height * 0.18 * lengthVariance
    const fullLength = clamp(baseLength + variance, height * 0.23, height * 0.61)
    const desiredHeight = baseFrameHeight * (0.9 + hash01(index, 1) * 0.18)
    const desiredWidth = desiredHeight * clamp(item.ratio, 0.56, 2.4)
    const maxWidth = count <= 2 ? width * 0.34 : anchor.spacing * 0.46
    const cardWidth = Math.min(desiredWidth, maxWidth)
    const cardHeight = cardWidth / clamp(item.ratio, 0.56, 2.4)
    const delay = count <= 1 ? 0 : index / (count - 1) * 0.065
    const impulseLocal = clamp((phase - 0.14 - delay) / Math.max(0.001, 0.64 - delay))
    const periodScale = Math.sqrt(fullLength / Math.max(1, height * 0.4))
    const oscillations = 2.15 / Math.max(0.72, periodScale)
    const damping = Math.exp(-dampingRate * impulseLocal)
    const oneRestraint = count === 1 ? 0.32 : 1
    const desiredAngle = impulse * 0.24 * oneRestraint * damping * Math.sin(TAU * oscillations * impulseLocal)
    const safeTravel = count <= 2 ? fullLength * 0.18 : anchor.spacing * 0.18
    const safeAngle = Math.asin(clamp(safeTravel / Math.max(1, fullLength), 0, 0.3))
    const rawAngle = clamp(desiredAngle, -safeAngle, safeAngle)
    const focused = index === active && focusWave > 0.001
    const restraint = focused ? 1 - focusWave * 0.45 : 1
    const angle = envelope.swingGain * rawAngle * restraint
    const focusShorten = focused ? minDimension * 0.045 * clamp(controls.focusLift / 100, 0, 0.5) * focusWave : 0
    const currentLength = Math.max(0, fullLength * (reducedMotion ? 1 : envelope.lengthGain) - focusShorten)
    const x = px + Math.sin(angle) * currentLength
    const y = py + Math.cos(angle) * currentLength
    return {
      ...item,
      pivotX: px, pivotY: py,
      anchorRow: anchor.row, anchorColumn: anchor.column, anchorSpacing: anchor.spacing,
      fullLength, currentLength,
      periodScale, phaseDelay: delay,
      angle,
      x, y,
      width: cardWidth, height: cardHeight,
      rotation: angle,
      focused, focusPlane: focused,
      baseZ: index, z: focused ? 1000 + index : index,
      visible: reducedMotion || envelope.lengthGain > 0.015,
      artworkOpacity: 1, artworkFilter: "none", blendMode: "normal",
      sourceVideoTimeSeconds: item.type === "video" ? sourceVideoTimeSeconds(timeMs, item.videoDurationSeconds, true) : null
    }
  }).sort((a, b) => a.z - b.z)
  return { sceneId: sceneMeta.id, width, height, phase, phaseName: envelope.name, selectedIndex: active, temporal: temporalState, timeline, controls: { ...controls }, cards, collisionPairs: collisionPairs(cards.filter((card) => card.visible)), debug }
}

export function summarizeState(state) {
  const visible = state.cards.filter((card) => card.visible)
  return {
    phase: round(state.phase), phaseName: state.phaseName, segmentId: state.temporal.segmentId,
    selectedIndex: state.selectedIndex, visibleCount: visible.length,
    identityOrder: state.cards.map((card) => card.id),
    collisionPairs: state.collisionPairs,
    maximumAngleRad: round(Math.max(0, ...visible.map((card) => Math.abs(card.angle)))),
    firstFrames: visible.slice(0, 3).map((card) => ({ id: card.id, pivotX: round(card.pivotX, 3), pivotY: round(card.pivotY, 3), length: round(card.currentLength, 3), angle: round(card.angle, 7), x: round(card.x, 3), y: round(card.y, 3), focused: card.focused })),
    sourceTreatment: { artworkOpacity: 1, artworkFilter: "none", blendMode: "normal" }
  }
}
export const testVectorCases = canonicalTimes.slice(0, 12).map((normalizedTime, index) => ({
  id: `the-hang-canonical-${String(index).padStart(2, "0")}`,
  fixture: index % 5 === 0 ? "one" : index % 5 === 1 ? "two" : index % 5 === 2 ? "recommended" : index % 5 === 3 ? "bounded-many" : "mixed-failed",
  canvas: index % 4 === 0 ? [1920, 1080] : index % 4 === 1 ? [1080, 1920] : index % 4 === 2 ? [1080, 1080] : [1080, 1350],
  normalizedTime, mode: index % 3 === 0 ? "automatic" : index % 3 === 1 ? "fixed-duration" : "directed", reducedMotion: index === 10, selectedIndex: 4
})).concat([
  { id: "the-hang-seam-start", fixture: "bounded-many", canvas: [1920,1080], normalizedTime: 0 },
  { id: "the-hang-seam-end", fixture: "bounded-many", canvas: [1920,1080], normalizedTime: 1 },
  { id: "the-hang-low-impulse", fixture: "recommended", canvas: [1920,1080], normalizedTime: 0.37, controls: { impulseStrength: 0 } },
  { id: "the-hang-high-impulse", fixture: "recommended", canvas: [1920,1080], normalizedTime: 0.37, controls: { impulseStrength: 65, damping: 35 } }
])
