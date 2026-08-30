const TAU = Math.PI * 2
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor
const fract = (value) => value - Math.floor(value)
const mix = (a, b, t) => a + (b - a) * t
const smoothstep = (value) => { const t = clamp(value); return t * t * (3 - 2 * t) }
const smootherstep = (value) => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10) }
const round = (value, digits = 6) => Number(value.toFixed(digits))
const hash01 = (index, salt) => fract(Math.sin((index + 1) * 173.3 + salt * 227.9) * 41593.2731)

export const sceneMeta = {
  id: "image-scatter-gallery",
  name: "Scatter — Lively Prints",
  motionSentence: "Prints travel from assigned perimeter routes into a repeatable field, exchange attention through short physical lifts, and return along owned routes; group energy never destroys individual readability.",
  defaultFixture: "recommended",
  evidenceFixtures: ["one", "two", "recommended", "bounded-many", "mixed-failed"],
  representativeTime: 0.49,
  debugTime: 0.16,
  alphaSupported: true,
  alphaConsequence: "Not applicable: this candidate supports clean transparent output.",
  resourceObservation: {
    maximumAcceptedSources: 24,
    activeCohortMaximum: 12,
    evaluatedCardsPerFrame: "all ordered identities retained in state; at most 12 visible/renderable",
    cohortPolicy: "deterministic contiguous source-order cohorts; every identity owns one route and appears during the compiled phrase",
    evaluatorAllocationPolicy: "bounded fresh state only; no random packing, intervals, retained history, media elements, or GPU resources",
    remountExpectation: "route ownership recompiles identically from source order and controls"
  },
  seamDelta(start, end, before) {
    const endById = new Map(end.cards.map((card) => [card.id, card]))
    let position = 0, rotation = 0, visibleMismatch = 0
    for (const card of start.cards) {
      const other = endById.get(card.id)
      position = Math.max(position, Math.hypot(card.x - other.x, card.y - other.y))
      rotation = Math.max(rotation, Math.abs(card.rotation - other.rotation))
      if (card.visible !== other.visible) visibleMismatch += 1
    }
    return { startEndMaxPositionPx: round(position, 9), startEndMaxRotationRad: round(rotation, 12), visibleMismatch, beforeEndVisibleCount: before.cards.filter((card) => card.visible).length }
  }
}

export const controlDescriptors = [
  { id: "field-spread", parameter: "fieldSpread", label: "Field spread", type: "range", default: 72, min: 45, max: 95, step: 1, unit: "%" },
  { id: "energy", parameter: "energy", label: "Energy", type: "range", default: 58, min: 20, max: 100, step: 1, unit: "%" },
  { id: "negative-space", parameter: "negativeSpace", label: "Negative space", type: "choice", default: "right-quiet", options: ["right-quiet", "left-quiet", "center-clear", "upper-clear"] },
  { id: "route-character", parameter: "routeCharacter", label: "Route character", type: "choice", default: "arcs", options: ["arcs", "diagonals", "hooks"] },
  { id: "focus-lift", parameter: "focusLift", label: "Focus lift", type: "range", default: 34, min: 0, max: 70, step: 1, unit: "%" }
]
export const defaultControls = () => Object.fromEntries(controlDescriptors.map((descriptor) => [descriptor.parameter, descriptor.default]))
export const canonicalTimes = [0, 0.041667, 0.083333, 0.166667, 0.25, 0.333333, 0.416667, 0.5, 0.583333, 0.666667, 0.75, 0.833333, 0.916667, 0.999999, 1]
export const phaseBoundaries = [0, 0.22, 0.72, 0.86, 1]
export const fixtureNames = ["one", "two", "recommended", "bounded-many", "mixed-failed"]
const RATIOS = [16 / 9, 3 / 4, 1, 2.39, 4 / 5, 9 / 16, 3 / 2, 5 / 4, 1.91, 2 / 3, 4 / 3, 1.2]
function fixture(count, failedIndex = -1) {
  return Array.from({ length: count }, (_, index) => ({
    id: `lively-print-${String(index + 1).padStart(2, "0")}`,
    sourceIndex: index,
    ratio: RATIOS[index % RATIOS.length],
    fit: index % 3 === 0 ? "cover" : "contain",
    focalPoint: [round(0.24 + hash01(index, 7) * 0.52, 4), round(0.28 + hash01(index, 8) * 0.44, 4)],
    failed: index === failedIndex,
    type: index === 4 ? "video" : "image",
    videoDurationSeconds: index === 4 ? 6.4 : null
  }))
}
export function makeFixture(name) {
  if (name === "one") return fixture(1)
  if (name === "two") return fixture(2)
  if (name === "bounded-many") return fixture(24, 17)
  if (name === "mixed-failed") return fixture(12, 5)
  return fixture(9)
}
export function sourceVideoTimeSeconds(timeMs, durationSeconds, loop = true) {
  if (!Number.isFinite(timeMs) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const seconds = Math.max(0, timeMs / 1000)
  return loop ? mod(seconds, durationSeconds) : Math.min(seconds, durationSeconds)
}

export function compileTimeline({ mode = "automatic", itemCount = 1, controls = defaultControls(), direction = "forward" } = {}) {
  const count = Math.max(1, Math.min(24, Math.round(itemCount)))
  const cohorts = Math.ceil(count / 12)
  const baseMs = 9000
  if (mode === "fixed-duration") return { mode, direction, durationMs: 16000, cycleCount: cohorts, cohorts, segments: [{ id: "fixed-field", kind: "cycle", cycles: cohorts, paceScale: cohorts * baseMs / 16000, startMs: 0, endMs: 16000, cycleStart: 0, cycleEnd: cohorts }] }
  if (mode === "directed") {
    const pattern = [
      { id: "fast-opening", cycles: 2 * cohorts, paceScale: 2 },
      { id: "regular-middle", cycles: 1 * cohorts, paceScale: 1 },
      { id: "fast-finale", cycles: 1 * cohorts, paceScale: 2 }
    ]
    let elapsed = 0, cycleStart = 0
    const segments = pattern.map((segment) => {
      const duration = baseMs * segment.cycles / segment.paceScale
      const out = { ...segment, kind: "cycle", startMs: elapsed, endMs: elapsed + duration, cycleStart, cycleEnd: cycleStart + segment.cycles }
      elapsed += duration; cycleStart += segment.cycles
      return out
    })
    return { mode, direction, durationMs: elapsed, cycleCount: 4 * cohorts, cohorts, segments }
  }
  const durationMs = baseMs * cohorts
  return { mode: "automatic", direction, durationMs, cycleCount: cohorts, cohorts, segments: [{ id: "automatic-field", kind: "cycle", cycles: cohorts, paceScale: 1, startMs: 0, endMs: durationMs, cycleStart: 0, cycleEnd: cohorts }] }
}

function temporal(timeline, timeMs) {
  const local = mod(timeMs, timeline.durationMs)
  const segment = timeline.segments.find((candidate) => local < candidate.endMs) ?? timeline.segments.at(-1)
  const progress = clamp((local - segment.startMs) / Math.max(1, segment.endMs - segment.startMs))
  const cycles = (segment.cycleStart ?? 0) + segment.cycles * progress
  const signed = timeline.direction === "reverse" ? timeline.cycleCount - cycles : cycles
  const cycleIndex = mod(Math.floor(signed + 1e-10), timeline.cohorts)
  return { localTimeMs: local, phase: fract(signed), cycleIndex, logicalCycle: signed, segmentId: segment.id, velocity: (timeline.direction === "reverse" ? -1 : 1) * segment.cycles / Math.max(1, segment.endMs - segment.startMs) }
}

const FIELD_SLOTS = [
  [0.17, 0.20], [0.37, 0.16], [0.61, 0.18], [0.83, 0.28],
  [0.16, 0.46], [0.39, 0.41], [0.66, 0.43], [0.84, 0.55],
  [0.20, 0.74], [0.42, 0.69], [0.66, 0.76], [0.83, 0.79]
]
const NEGATIVE_SPACE = {
  "right-quiet": { x: 0.69, y: 0.49, rx: 0.18, ry: 0.22 },
  "left-quiet": { x: 0.31, y: 0.51, rx: 0.18, ry: 0.22 },
  "center-clear": { x: 0.5, y: 0.5, rx: 0.17, ry: 0.19 },
  "upper-clear": { x: 0.51, y: 0.29, rx: 0.2, ry: 0.16 }
}
function enforceNegativeSpace(point, exclusion) {
  let [x, y] = point
  const dx = (x - exclusion.x) / exclusion.rx
  const dy = (y - exclusion.y) / exclusion.ry
  const distance = Math.hypot(dx, dy)
  if (distance < 1.12) {
    const scale = 1.12 / Math.max(0.01, distance)
    x = exclusion.x + dx * scale * exclusion.rx
    y = exclusion.y + dy * scale * exclusion.ry
  }
  return [clamp(x, 0.09, 0.91), clamp(y, 0.09, 0.91)]
}
function fieldPoint(index, count, controls) {
  if (count === 1) return [0.5, 0.5]
  if (count === 2) return index === 0 ? [0.28, 0.48] : [0.72, 0.52]
  const raw = FIELD_SLOTS[index % 12]
  const spread = clamp(controls.fieldSpread / 100, 0.45, 0.95)
  const point = [0.5 + (raw[0] - 0.5) * (0.72 + spread * 0.42), 0.5 + (raw[1] - 0.5) * (0.72 + spread * 0.42)]
  return enforceNegativeSpace(point, NEGATIVE_SPACE[controls.negativeSpace] ?? NEGATIVE_SPACE["right-quiet"])
}
function edgePoint(routeSlot) {
  const edge = routeSlot % 4
  const lane = Math.floor(routeSlot / 4)
  const v = 0.18 + lane * 0.28
  if (edge === 0) return [-0.16, clamp(v, 0.12, 0.88), "left"]
  if (edge === 1) return [clamp(v + 0.08, 0.12, 0.88), -0.18, "top"]
  if (edge === 2) return [1.16, clamp(v + 0.04, 0.12, 0.88), "right"]
  return [clamp(v + 0.18, 0.12, 0.88), 1.18, "bottom"]
}
function cubic(a, b, c, d, t) {
  const u = 1 - t
  return u ** 3 * a + 3 * u ** 2 * t * b + 3 * u * t ** 2 * c + t ** 3 * d
}
function routePosition(start, end, character, t, index) {
  const [sx, sy] = start, [ex, ey] = end
  let c1x, c1y, c2x, c2y
  if (character === "diagonals") {
    c1x = mix(sx, ex, 0.33); c1y = mix(sy, ey, 0.33)
    c2x = mix(sx, ex, 0.67); c2y = mix(sy, ey, 0.67)
  } else if (character === "hooks") {
    const sign = index % 2 ? 1 : -1
    c1x = sx + (ey - sy) * 0.34 * sign; c1y = sy - (ex - sx) * 0.34 * sign
    c2x = ex - (ey - sy) * 0.18 * sign; c2y = ey + (ex - sx) * 0.18 * sign
  } else {
    const bend = (index % 2 ? 1 : -1) * 0.18
    c1x = mix(sx, ex, 0.28) - (ey - sy) * bend; c1y = mix(sy, ey, 0.28) + (ex - sx) * bend
    c2x = mix(sx, ex, 0.72) - (ey - sy) * bend * 0.65; c2y = mix(sy, ey, 0.72) + (ex - sx) * bend * 0.65
  }
  const eased = smootherstep(t)
  return [cubic(sx, c1x, c2x, ex, eased), cubic(sy, c1y, c2y, ey, eased)]
}
function phaseEnvelope(phase) {
  if (phase < 0.22) return { name: "assigned-arrivals", route: smootherstep(phase / 0.22), circulation: 0, finale: 0, exit: 0 }
  if (phase < 0.72) return { name: "field-exchange", route: 1, circulation: (phase - 0.22) / 0.50, finale: 0, exit: 0 }
  if (phase < 0.86) return { name: "field-finale", route: 1, circulation: 1, finale: smootherstep((phase - 0.72) / 0.14), exit: 0 }
  return { name: "owned-return", route: 1 - smootherstep((phase - 0.86) / 0.14), circulation: 0, finale: 1, exit: smootherstep((phase - 0.86) / 0.14) }
}

export function evaluateScene({ items, controls = defaultControls(), timeline, timeMs, width, height, reducedMotion = false, debug = false, selectedIndex = 0 }) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 24) throw new Error("Lively Prints accepts 1–24 ordered sources in this atelier candidate.")
  const temporalState = temporal(timeline, timeMs)
  const phase = temporalState.phase
  const envelope = phaseEnvelope(phase)
  const cohortCount = Math.ceil(items.length / 12)
  const activeCohort = reducedMotion ? mod(Math.floor(mod(selectedIndex, items.length) / 12), cohortCount) : temporalState.cycleIndex
  const cohortStart = activeCohort * 12
  const activeItems = items.slice(cohortStart, cohortStart + 12)
  const minDimension = Math.min(width, height)
  const baseHeight = minDimension * (items.length === 1 ? 0.59 : items.length === 2 ? 0.43 : activeItems.length <= 9 ? 0.24 : 0.205)
  const energy = reducedMotion ? 0 : clamp(controls.energy / 100, 0.2, 1)
  const focusProgress = envelope.name === "field-exchange" ? envelope.circulation * activeItems.length : activeItems.length - 1
  const activeLocal = reducedMotion ? mod(Math.round(selectedIndex) - cohortStart, Math.max(1, activeItems.length)) : Math.min(activeItems.length - 1, Math.floor(clamp(focusProgress, 0, activeItems.length - 1e-9)))
  const focusWave = reducedMotion ? 0.4 : envelope.name === "field-exchange" ? Math.sin(Math.PI * fract(focusProgress)) : envelope.name === "field-finale" ? envelope.finale : envelope.name === "owned-return" ? 1 - envelope.exit : 0
  const exclusion = NEGATIVE_SPACE[controls.negativeSpace] ?? NEGATIVE_SPACE["right-quiet"]
  const cards = items.map((item, index) => {
    const cohort = Math.floor(index / 12)
    const slot = index % 12
    const isActiveCohort = cohort === activeCohort
    const [fieldX, fieldY] = fieldPoint(slot, activeItems.length, controls)
    const [edgeX, edgeY, edge] = edgePoint(slot)
    const route = routePosition([edgeX, edgeY], [fieldX, fieldY], controls.routeCharacter, reducedMotion ? 1 : envelope.route, slot)
    const angle = TAU * envelope.circulation
    const orbitAmount = minDimension * 0.026 * energy * (envelope.name === "field-exchange" ? 1 : envelope.name === "field-finale" ? 1 - envelope.finale : 0)
    const dx = (orbitAmount / width) * (0.62 * Math.sin(angle * (1 + slot % 2) + hash01(index, 3) * TAU) + 0.38 * Math.cos(angle * 3 + slot))
    const dy = (orbitAmount / height) * (0.65 * Math.cos(angle * (2 + slot % 2) + hash01(index, 4) * TAU) + 0.35 * Math.sin(angle * 3 - slot))
    const focused = isActiveCohort && slot === activeLocal && focusWave > 0.001
    const lift = focused ? minDimension * 0.05 * clamp(controls.focusLift / 100, 0, 0.7) * focusWave : 0
    const visible = isActiveCohort && (reducedMotion || (phase > 0.006 && phase < 0.994))
    const cardHeight = baseHeight * (0.9 + hash01(index, 1) * 0.18)
    const cardWidth = Math.min(width * 0.43, cardHeight * clamp(item.ratio, 0.56, 2.4))
    return {
      ...item,
      cohort, routeSlot: slot, routeId: `cohort-${cohort}-slot-${slot}-${edge}`,
      edge,
      startX: edgeX * width, startY: edgeY * height,
      fieldX: fieldX * width, fieldY: fieldY * height,
      x: (route[0] + dx) * width,
      y: (route[1] + dy) * height,
      width: cardWidth, height: cardHeight,
      rotation: (hash01(index, 5) - 0.5) * 0.22 + energy * 0.025 * Math.sin(angle + slot),
      focusPlane: focused,
      lift,
      baseZ: index,
      z: focused ? 1000 + index : index,
      visible,
      artworkOpacity: 1, artworkFilter: "none", blendMode: "normal",
      sourceVideoTimeSeconds: item.type === "video" ? sourceVideoTimeSeconds(timeMs, item.videoDurationSeconds, true) : null
    }
  }).sort((a, b) => a.z - b.z)
  return {
    sceneId: sceneMeta.id,
    width, height, phase, phaseName: envelope.name,
    selectedIndex: cohortStart + activeLocal,
    activeCohort, cohortCount,
    negativeSpace: { ...exclusion, x: exclusion.x * width, y: exclusion.y * height, rx: exclusion.rx * width, ry: exclusion.ry * height },
    temporal: temporalState, timeline, controls: { ...controls }, cards, debug
  }
}

export function summarizeState(state) {
  const visible = state.cards.filter((card) => card.visible)
  return {
    phase: round(state.phase), phaseName: state.phaseName, segmentId: state.temporal.segmentId,
    activeCohort: state.activeCohort, cohortCount: state.cohortCount, selectedIndex: state.selectedIndex,
    totalIdentityCount: state.cards.length, visibleCount: visible.length,
    identityOrder: state.cards.map((card) => card.id), visibleIdentityOrder: visible.map((card) => card.id),
    routeOwnership: state.cards.slice(0, 4).map((card) => ({ id: card.id, routeId: card.routeId, edge: card.edge })),
    negativeSpace: { x: round(state.negativeSpace.x, 3), y: round(state.negativeSpace.y, 3), rx: round(state.negativeSpace.rx, 3), ry: round(state.negativeSpace.ry, 3) },
    maxLiftPx: round(Math.max(0, ...visible.map((card) => card.lift))),
    firstVisible: visible.slice(0, 3).map((card) => ({ id: card.id, x: round(card.x, 3), y: round(card.y, 3), rotation: round(card.rotation, 6), routeId: card.routeId, focusPlane: card.focusPlane })),
    sourceTreatment: { artworkOpacity: 1, artworkFilter: "none", blendMode: "normal" }
  }
}

export const testVectorCases = canonicalTimes.slice(0, 12).map((normalizedTime, index) => ({
  id: `lively-prints-canonical-${String(index).padStart(2, "0")}`,
  fixture: index % 5 === 0 ? "one" : index % 5 === 1 ? "two" : index % 5 === 2 ? "recommended" : index % 5 === 3 ? "bounded-many" : "mixed-failed",
  canvas: index % 4 === 0 ? [1920, 1080] : index % 4 === 1 ? [1080, 1920] : index % 4 === 2 ? [1080, 1080] : [1080, 1350],
  normalizedTime,
  mode: index % 3 === 0 ? "automatic" : index % 3 === 1 ? "fixed-duration" : "directed",
  reducedMotion: index === 10,
  selectedIndex: 15
})).concat([
  { id: "lively-prints-seam-start", fixture: "bounded-many", canvas: [1920, 1080], normalizedTime: 0 },
  { id: "lively-prints-seam-end", fixture: "bounded-many", canvas: [1920, 1080], normalizedTime: 1 },
  { id: "lively-prints-route-arcs", fixture: "recommended", canvas: [1920, 1080], normalizedTime: 0.12, controls: { routeCharacter: "arcs" } },
  { id: "lively-prints-route-hooks", fixture: "recommended", canvas: [1920, 1080], normalizedTime: 0.12, controls: { routeCharacter: "hooks" } }
])
