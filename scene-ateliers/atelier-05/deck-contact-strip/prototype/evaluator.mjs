const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor
const mix = (a, b, t) => a + (b - a) * t
const smootherstep = (value) => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10) }
const round = (value, digits = 6) => Number(value.toFixed(digits))

export const sceneMeta = {
  id: "deck-contact-strip",
  name: "Contact Table — Focus Strip",
  motionSentence: "An ordered inspection strip moves beneath one stable focus station; the selected frame arrives without reorder, teleport, or disorienting perspective.",
  defaultFixture: "recommended",
  evidenceFixtures: ["one", "two", "recommended", "bounded-many", "mixed-failed"],
  representativeTime: 0.44,
  debugTime: 0.37,
  alphaSupported: true,
  alphaConsequence: "Not applicable: transparent output is supported when the fixed station and frame apparatus composite cleanly.",
  resourceObservation: {
    maximumAcceptedSources: 24,
    evaluatedStatesPerFrame: "all ordered identities",
    visibleMountPolicy: "only cards intersecting the stage plus one offstage margin; no duplicate loop deck",
    recyclingPolicy: "single identity wraps only across the guaranteed offstage half of a circular track",
    evaluatorAllocationPolicy: "bounded fresh state; no scroll listeners, drag state, timers, random tilt, media elements, or retained history"
  },
  seamDelta(start, end, before) {
    const endById = new Map(end.cards.map((card) => [card.id, card]))
    let position = 0, station = 0, visibleMismatch = 0
    for (const card of start.cards) {
      const other = endById.get(card.id)
      position = Math.max(position, Math.hypot(card.x - other.x, card.y - other.y))
      if (card.visible !== other.visible) visibleMismatch += 1
    }
    station = Math.hypot(start.station.x - end.station.x, start.station.y - end.station.y)
    return { startEndMaxPositionPx: round(position, 9), stationDeltaPx: round(station, 9), visibleMismatch, beforeEndTrackProgress: round(before.trackProgress, 6) }
  }
}

export const controlDescriptors = [
  { id: "frame-size", parameter: "frameSize", label: "Frame size", type: "range", default: 64, min: 35, max: 90, step: 1, unit: "%" },
  { id: "gap", parameter: "gap", label: "Frame gap", type: "range", default: 28, min: 8, max: 80, step: 1, unit: "dp" },
  { id: "station-position", parameter: "stationPosition", label: "Station position", type: "range", default: 50, min: 25, max: 75, step: 1, unit: "%" },
  { id: "focus-lift", parameter: "focusLift", label: "Focus lift", type: "range", default: 24, min: 0, max: 50, step: 1, unit: "%" },
  { id: "labels", parameter: "labels", label: "Labels", type: "choice", default: "both", options: ["both", "indices", "captions", "none"] }
]
export const defaultControls = () => Object.fromEntries(controlDescriptors.map((descriptor) => [descriptor.parameter, descriptor.default]))
export const canonicalTimes = [0, 0.041667, 0.083333, 0.166667, 0.25, 0.333333, 0.416667, 0.5, 0.583333, 0.666667, 0.75, 0.833333, 0.916667, 0.999999, 1]
export const phaseBoundaries = [0, 0.125, 0.25, 0.5, 0.75, 0.875, 1]
export const fixtureNames = ["one", "two", "recommended", "bounded-many", "mixed-failed"]
const RATIOS = [16 / 9, 3 / 4, 1, 2.39, 4 / 5, 9 / 16, 3 / 2, 5 / 4, 1.91, 2 / 3, 4 / 3, 1.2]
function fixture(count, failedIndex = -1) {
  return Array.from({ length: count }, (_, index) => ({
    id: `strip-frame-${String(index + 1).padStart(2, "0")}`,
    sourceIndex: index,
    ratio: RATIOS[index % RATIOS.length],
    fit: index % 4 === 0 ? "cover" : "contain",
    focalPoint: [0.5, 0.5],
    caption: `Frame ${String(index + 1).padStart(2, "0")}`,
    failed: index === failedIndex,
    type: index === 3 ? "video" : "image",
    videoDurationSeconds: index === 3 ? 9.6 : null
  }))
}
export function makeFixture(name) {
  if (name === "one") return fixture(1)
  if (name === "two") return fixture(2)
  if (name === "bounded-many") return fixture(24, 17)
  if (name === "mixed-failed") return fixture(12, 5)
  return fixture(8)
}
export function sourceVideoTimeSeconds(timeMs, durationSeconds, loop = true) {
  if (!Number.isFinite(timeMs) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const seconds = Math.max(0, timeMs / 1000)
  return loop ? mod(seconds, durationSeconds) : Math.min(seconds, durationSeconds)
}

function segmentPattern(mode, index) {
  if (mode !== "directed") return { pace: "regular", holdMs: 650, travelMs: 550 }
  const pattern = ["quick", "quick", "regular", "quick"]
  const pace = pattern[index % pattern.length]
  return pace === "regular" ? { pace, holdMs: 760, travelMs: 620 } : { pace, holdMs: 420, travelMs: 360 }
}
function rawSegments(mode, count) {
  if (count === 1) return [{ id: "single-inspection-hold", kind: "hold", index: 0, nextIndex: 0, pace: "still", durationMs: 8000 }]
  const segments = []
  for (let index = 0; index < count; index += 1) {
    const rhythm = segmentPattern(mode, index)
    segments.push({ id: `hold-${index}`, kind: "hold", index, nextIndex: index, pace: rhythm.pace, durationMs: rhythm.holdMs })
    segments.push({ id: `travel-${index}-to-${(index + 1) % count}`, kind: "travel", index, nextIndex: (index + 1) % count, pace: rhythm.pace, durationMs: rhythm.travelMs })
  }
  return segments
}
export function compileTimeline({ mode = "automatic", itemCount = 1, controls = defaultControls(), direction = "forward" } = {}) {
  const count = Math.max(1, Math.min(24, Math.round(itemCount)))
  const requestedMode = mode === "directed" ? "directed" : "automatic"
  let source = rawSegments(requestedMode, count)
  const rawDuration = source.reduce((sum, segment) => sum + segment.durationMs, 0)
  const targetDuration = mode === "fixed-duration" ? 14000 : rawDuration
  const scale = targetDuration / rawDuration
  let elapsed = 0
  const segments = source.map((segment) => {
    const duration = segment.durationMs * scale
    const out = { ...segment, startMs: elapsed, endMs: elapsed + duration, durationMs: duration }
    elapsed += duration
    return out
  })
  return { mode, direction, durationMs: elapsed, itemCount: count, segments, directedPattern: mode === "directed" ? ["quick", "quick", "regular", "quick"] : null }
}
function temporal(timeline, timeMs) {
  const sampled = mod(timeMs, timeline.durationMs)
  const local = timeline.direction === "reverse"
    ? mod(timeline.durationMs - sampled, timeline.durationMs)
    : sampled
  const segment = timeline.segments.find((candidate) => local < candidate.endMs) ?? timeline.segments.at(-1)
  const localProgress = clamp((local - segment.startMs) / Math.max(1, segment.durationMs))
  let progress = segment.index
  let velocity = 0
  if (segment.kind === "travel") {
    const eased = smootherstep(localProgress)
    progress = segment.index + eased
    const derivative = 30 * localProgress ** 2 * (localProgress - 1) ** 2
    velocity = derivative / Math.max(1, segment.durationMs)
  }
  if (timeline.direction === "reverse") velocity *= -1
  return { localTimeMs: local, progress, phase: local / timeline.durationMs, segmentId: segment.id, segmentKind: segment.kind, pace: segment.pace, segmentProgress: localProgress, velocity }
}
function geometry(width, height, controls) {
  const vertical = height / width > 1.2
  const axisLength = vertical ? height : width
  const crossLength = vertical ? width : height
  const size = clamp(controls.frameSize / 100, 0.35, 0.9)
  const outerCross = crossLength * (0.34 + size * 0.34)
  const outerAlong = outerCross * (vertical ? 0.72 : 1.34)
  const gapPx = controls.gap * crossLength / 1080
  const stationAlong = axisLength * clamp(controls.stationPosition / 100, 0.25, 0.75)
  const stationCross = crossLength * 0.5
  return { vertical, axisLength, crossLength, outerAlong, outerCross, gapPx, stationAlong, stationCross }
}
function sourceBox(card, item) {
  const pad = Math.min(card.outerWidth, card.outerHeight) * 0.085
  const availableW = card.outerWidth - pad * 2
  const availableH = card.outerHeight - pad * 2
  let width, height
  if (item.fit === "cover") {
    if (availableW / availableH > item.ratio) { width = availableW; height = availableW / item.ratio }
    else { height = availableH; width = availableH * item.ratio }
  } else {
    if (availableW / availableH > item.ratio) { height = availableH; width = availableH * item.ratio }
    else { width = availableW; height = availableW / item.ratio }
  }
  return { width, height, pad }
}

export function evaluateScene({ items, controls = defaultControls(), timeline, timeMs, width, height, reducedMotion = false, debug = false, selectedIndex = 0 }) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 24) throw new Error("Focus Strip accepts 1–24 ordered sources in this atelier candidate.")
  const geo = geometry(width, height, controls)
  const temporalState = temporal(timeline, timeMs)
  const count = items.length
  const baseProgress = count === 1 ? 0 : temporalState.progress
  const trackProgress = reducedMotion ? mod(Math.round(selectedIndex), count) : mod(baseProgress + mod(Math.round(selectedIndex), count), count)
  const station = geo.vertical ? { x: geo.stationCross, y: geo.stationAlong } : { x: geo.stationAlong, y: geo.stationCross }
  const minimumTrack = 2 * Math.max(geo.stationAlong, geo.axisLength - geo.stationAlong) + geo.outerAlong * 2.4
  const naturalStep = geo.outerAlong + geo.gapPx
  const trackLength = Math.max(naturalStep * count, minimumTrack)
  const slotStep = count === 1 ? 0 : trackLength / count
  const lift = Math.min(width, height) * 0.042 * clamp(controls.focusLift / 100, 0, 0.5)
  const cards = items.map((item, index) => {
    let along = geo.stationAlong
    if (count > 1) along += mod((index - trackProgress) * slotStep + trackLength / 2, trackLength) - trackLength / 2
    const distance = along - geo.stationAlong
    const stationEnvelope = count === 1 ? 1 : Math.max(0, 1 - Math.abs(distance) / Math.max(1, slotStep * 0.42))
    const focused = stationEnvelope > 0.72
    const perpendicularLift = focused ? lift * smootherstep((stationEnvelope - 0.72) / 0.28) : 0
    const outerWidth = geo.vertical ? geo.outerCross : geo.outerAlong
    const outerHeight = geo.vertical ? geo.outerAlong : geo.outerCross
    const baseX = geo.vertical ? geo.stationCross : along
    const baseY = geo.vertical ? along : geo.stationCross
    const x = geo.vertical ? baseX + perpendicularLift : baseX
    const y = geo.vertical ? baseY : baseY - perpendicularLift
    const visible = count === 1 || (along + geo.outerAlong / 2 > -geo.outerAlong && along - geo.outerAlong / 2 < geo.axisLength + geo.outerAlong)
    const box = sourceBox({ outerWidth, outerHeight }, item)
    return {
      ...item,
      x, y, baseX, baseY, along,
      width: outerWidth, height: outerHeight,
      outerWidth, outerHeight,
      artworkWidth: box.width, artworkHeight: box.height, artworkPad: box.pad,
      rotation: 0,
      focused, focusPlane: focused,
      stationDistance: distance,
      baseZ: index, z: focused ? 1000 + index : index,
      visible,
      labelMode: controls.labels,
      artworkOpacity: 1, artworkFilter: "none", blendMode: "normal",
      sourceVideoTimeSeconds: item.type === "video" ? sourceVideoTimeSeconds(timeMs, item.videoDurationSeconds, true) : null
    }
  }).sort((a, b) => a.z - b.z)
  const focusedCard = cards.find((card) => card.focused) ?? cards.reduce((best, card) => Math.abs(card.stationDistance) < Math.abs(best.stationDistance) ? card : best, cards[0])
  return {
    sceneId: sceneMeta.id, width, height,
    phase: temporalState.phase, phaseName: temporalState.segmentKind === "hold" ? "inspection-hold" : "ordered-travel",
    selectedIndex: focusedCard?.sourceIndex ?? 0,
    trackProgress, trackLength, slotStep,
    station: { ...station, vertical: geo.vertical, along: geo.stationAlong, cross: geo.stationCross, apertureWidth: outerStationWidth(geo), apertureHeight: outerStationHeight(geo) },
    temporal: temporalState, timeline, controls: { ...controls }, cards, debug
  }
}
function outerStationWidth(geo) { return geo.vertical ? geo.outerCross * 1.09 : geo.outerAlong * 1.09 }
function outerStationHeight(geo) { return geo.vertical ? geo.outerAlong * 1.09 : geo.outerCross * 1.09 }

export function summarizeState(state) {
  const visible = state.cards.filter((card) => card.visible)
  return {
    phase: round(state.phase), phaseName: state.phaseName,
    segmentId: state.temporal.segmentId, segmentKind: state.temporal.segmentKind, pace: state.temporal.pace,
    selectedIndex: state.selectedIndex, trackProgress: round(state.trackProgress, 7),
    vertical: state.station.vertical,
    station: { x: round(state.station.x, 3), y: round(state.station.y, 3) },
    totalIdentityCount: state.cards.length, visibleCount: visible.length,
    identityOrder: [...state.cards].sort((a, b) => a.sourceIndex - b.sourceIndex).map((card) => card.id),
    focusedIds: state.cards.filter((card) => card.focused).map((card) => card.id),
    firstVisible: visible.slice(0, 3).map((card) => ({ id: card.id, sourceIndex: card.sourceIndex, x: round(card.x, 3), y: round(card.y, 3), stationDistance: round(card.stationDistance, 3), focused: card.focused, failed: card.failed })),
    sourceTreatment: { artworkOpacity: 1, artworkFilter: "none", blendMode: "normal" }
  }
}
export const testVectorCases = canonicalTimes.slice(0, 12).map((normalizedTime, index) => ({
  id: `focus-strip-canonical-${String(index).padStart(2, "0")}`,
  fixture: index % 5 === 0 ? "one" : index % 5 === 1 ? "two" : index % 5 === 2 ? "recommended" : index % 5 === 3 ? "bounded-many" : "mixed-failed",
  canvas: index % 4 === 0 ? [1920,1080] : index % 4 === 1 ? [1080,1920] : index % 4 === 2 ? [1080,1080] : [1080,1350],
  normalizedTime, mode: index % 3 === 0 ? "automatic" : index % 3 === 1 ? "fixed-duration" : "directed", reducedMotion: index === 10, selectedIndex: index === 10 ? 5 : 0
})).concat([
  { id: "focus-strip-seam-start", fixture: "bounded-many", canvas: [1920,1080], normalizedTime: 0 },
  { id: "focus-strip-seam-end", fixture: "bounded-many", canvas: [1920,1080], normalizedTime: 1 },
  { id: "focus-strip-portrait-station", fixture: "recommended", canvas: [1080,1920], normalizedTime: 0.33 },
  { id: "focus-strip-directed-rhythm", fixture: "recommended", canvas: [1920,1080], normalizedTime: 0.41, mode: "directed" }
])
