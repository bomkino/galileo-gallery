const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor
const mix = (a, b, t) => a + (b - a) * t
const smootherstep = (value) => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10) }
const round = (value, digits = 6) => Number(value.toFixed(digits))

export const sceneMeta = {
  id: "contact-sheet",
  name: "Contact Table — Sheet",
  motionSentence: "An ordered whole-set grid stays compositionally stable while authored registration marks move attention from cell to cell; focus never becomes a generic card zoom.",
  defaultFixture: "recommended",
  evidenceFixtures: ["one", "two", "recommended", "bounded-many", "mixed-failed"],
  representativeTime: 0.43,
  debugTime: 0.37,
  alphaSupported: false,
  alphaConsequence: "Contact Sheet requires one opaque paper/contact surface to preserve whole-sheet identity. Transparent export is unavailable; capability copy must disable alpha export rather than faking transparency. This alpha limitation does not change Project audio intent or create an audio side effect.",
  resourceObservation: {
    maximumAcceptedSources: 24,
    evaluatedStatesPerFrame: "all ordered identities; whole-set reading requires all accepted cells",
    visibleMountPolicy: "all accepted cells remain visible and mounted; hard maximum 24 prevents unbounded whole-set work",
    paginationPolicy: "none in this candidate; more than 24 is rejected rather than paginated or silently dropped",
    evaluatorAllocationPolicy: "bounded fresh state; no timers, masonry observer, hover theatre, lightbox, random tilt, media elements, or retained history"
  },
  seamDelta(start, end, before) {
    const endById = new Map(end.cards.map((card) => [card.id, card]))
    let position = 0, size = 0
    for (const card of start.cards) {
      const other = endById.get(card.id)
      position = Math.max(position, Math.hypot(card.x - other.x, card.y - other.y))
      size = Math.max(size, Math.abs(card.width - other.width), Math.abs(card.height - other.height))
    }
    const focusPosition = Math.hypot(start.focus.x - end.focus.x, start.focus.y - end.focus.y)
    const focusSize = Math.max(Math.abs(start.focus.width - end.focus.width), Math.abs(start.focus.height - end.focus.height))
    return { startEndMaxCellPositionPx: round(position, 9), startEndMaxCellSizePx: round(size, 9), focusPositionDeltaPx: round(focusPosition, 9), focusSizeDeltaPx: round(focusSize, 9), beforeEndFocusKind: before.focus.kind }
  }
}

export const controlDescriptors = [
  { id: "columns", parameter: "columns", label: "Columns", type: "choice", default: "auto", options: ["auto", "2", "3", "4", "5", "6"] },
  { id: "gutter", parameter: "gutter", label: "Gutter", type: "range", default: 30, min: 10, max: 72, step: 1, unit: "dp" },
  { id: "sheet-margin", parameter: "sheetMargin", label: "Sheet margin", type: "range", default: 8, min: 4, max: 16, step: 1, unit: "%" },
  { id: "traversal", parameter: "traversal", label: "Focus traversal", type: "choice", default: "row-major", options: ["row-major", "serpentine", "column-major"] },
  { id: "labels", parameter: "labels", label: "Labels", type: "choice", default: "both", options: ["both", "indices", "captions", "none"] }
]
export const defaultControls = () => Object.fromEntries(controlDescriptors.map((descriptor) => [descriptor.parameter, descriptor.default]))
export const canonicalTimes = [0, 0.041667, 0.083333, 0.166667, 0.25, 0.333333, 0.416667, 0.5, 0.583333, 0.666667, 0.75, 0.833333, 0.916667, 0.999999, 1]
export const fixtureNames = ["one", "two", "recommended", "bounded-many", "mixed-failed"]
const RATIOS = [16 / 9, 3 / 4, 1, 2.39, 4 / 5, 9 / 16, 3 / 2, 5 / 4, 1.91, 2 / 3, 4 / 3, 1.2]
function fixture(count, failedIndex = -1) {
  return Array.from({ length: count }, (_, index) => ({
    id: `sheet-frame-${String(index + 1).padStart(2, "0")}`,
    sourceIndex: index,
    ratio: RATIOS[index % RATIOS.length],
    fit: index % 4 === 0 ? "cover" : "contain",
    focalPoint: [0.5, 0.5],
    caption: `Frame ${String(index + 1).padStart(2, "0")}`,
    failed: index === failedIndex,
    type: index === 3 ? "video" : "image",
    videoDurationSeconds: index === 3 ? 11.2 : null
  }))
}
export function makeFixture(name) {
  if (name === "one") return fixture(1)
  if (name === "two") return fixture(2)
  if (name === "bounded-many") return fixture(24, 17)
  if (name === "mixed-failed") return fixture(16, 6)
  return fixture(12)
}
export function sourceVideoTimeSeconds(timeMs, durationSeconds, loop = true) {
  if (!Number.isFinite(timeMs) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const seconds = Math.max(0, timeMs / 1000)
  return loop ? mod(seconds, durationSeconds) : Math.min(seconds, durationSeconds)
}

function cadence(mode, ordinal) {
  if (mode !== "directed") return { pace: "regular", holdMs: 600, travelMs: 420 }
  const pattern = ["quick", "quick", "regular", "quick"]
  const pace = pattern[ordinal % pattern.length]
  return pace === "regular" ? { pace, holdMs: 700, travelMs: 500 } : { pace, holdMs: 340, travelMs: 280 }
}
function rawSegments(mode, count) {
  const source = []
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const rhythm = cadence(mode, ordinal)
    source.push({ id: `inspect-${ordinal}`, kind: "hold", fromOrdinal: ordinal, toOrdinal: ordinal, pace: rhythm.pace, durationMs: rhythm.holdMs })
    if (ordinal < count - 1) source.push({ id: `mark-${ordinal}-to-${ordinal + 1}`, kind: "travel", fromOrdinal: ordinal, toOrdinal: ordinal + 1, pace: rhythm.pace, durationMs: rhythm.travelMs })
  }
  source.push({ id: "finale-expand", kind: "finale-expand", fromOrdinal: count - 1, toOrdinal: count - 1, pace: "regular", durationMs: 620 })
  source.push({ id: "whole-set-finale", kind: "finale-hold", fromOrdinal: count - 1, toOrdinal: count - 1, pace: "still", durationMs: 1000 })
  source.push({ id: "return-to-first", kind: "return", fromOrdinal: count - 1, toOrdinal: 0, pace: "regular", durationMs: 680 })
  return source
}
export function compileTimeline({ mode = "automatic", itemCount = 1, controls = defaultControls(), direction = "forward" } = {}) {
  const count = Math.max(1, Math.min(24, Math.round(itemCount)))
  const sourceMode = mode === "directed" ? "directed" : "automatic"
  const source = rawSegments(sourceMode, count)
  const rawDuration = source.reduce((sum, segment) => sum + segment.durationMs, 0)
  const targetDuration = mode === "fixed-duration" ? 16000 : rawDuration
  const scale = targetDuration / rawDuration
  let elapsed = 0
  const segments = source.map((segment) => {
    const durationMs = segment.durationMs * scale
    const output = { ...segment, startMs: elapsed, endMs: elapsed + durationMs, durationMs }
    elapsed += durationMs
    return output
  })
  return { mode, direction, durationMs: elapsed, itemCount: count, segments, directedPattern: mode === "directed" ? ["quick", "quick", "regular", "quick"] : null }
}
function temporal(timeline, timeMs) {
  const sampled = mod(timeMs, timeline.durationMs)
  const local = timeline.direction === "reverse" ? mod(timeline.durationMs - sampled, timeline.durationMs) : sampled
  const segment = timeline.segments.find((candidate) => local < candidate.endMs) ?? timeline.segments.at(-1)
  const segmentProgress = clamp((local - segment.startMs) / Math.max(1, segment.durationMs))
  const eased = smootherstep(segmentProgress)
  let ordinalProgress = segment.fromOrdinal
  let velocity = 0
  if (["travel", "return"].includes(segment.kind)) {
    ordinalProgress = mix(segment.fromOrdinal, segment.toOrdinal, eased)
    const derivative = 30 * segmentProgress ** 2 * (segmentProgress - 1) ** 2
    velocity = (segment.toOrdinal - segment.fromOrdinal) * derivative / Math.max(1, segment.durationMs)
  }
  if (timeline.direction === "reverse") velocity *= -1
  return { localTimeMs: local, phase: local / timeline.durationMs, segment, segmentProgress, eased, ordinalProgress, velocity }
}

function chooseAutoColumns(count, gridWidth, gridHeight, gutterPx) {
  if (count === 1) return 1
  if (count === 2) return 2
  const targetRatio = gridWidth / gridHeight > 1.25 ? 1.2 : gridWidth / gridHeight < 0.8 ? 0.96 : 1.08
  let best = { columns: 2, score: Infinity }
  for (let columns = 2; columns <= Math.min(6, count); columns += 1) {
    const rows = Math.ceil(count / columns)
    const cellWidth = (gridWidth - gutterPx * (columns - 1)) / columns
    const cellHeight = (gridHeight - gutterPx * (rows - 1)) / rows
    if (cellWidth <= 24 || cellHeight <= 24) continue
    const ratio = cellWidth / cellHeight
    const empty = columns * rows - count
    const score = Math.abs(Math.log(ratio / targetRatio)) + empty / Math.max(1, count) * 0.3 + (rows > 7 ? 0.4 : 0)
    if (score < best.score) best = { columns, score }
  }
  return best.columns
}
function layoutGeometry(width, height, controls, count) {
  const short = Math.min(width, height)
  const sheetMarginPx = short * clamp(controls.sheetMargin / 100, 0.04, 0.16)
  const gutterPx = controls.gutter * short / 1080
  const borderInset = Math.max(6, sheetMarginPx * 0.32)
  const gridBounds = {
    x: sheetMarginPx,
    y: sheetMarginPx,
    width: Math.max(1, width - sheetMarginPx * 2),
    height: Math.max(1, height - sheetMarginPx * 2)
  }
  const requested = controls.columns === "auto" ? null : Number(controls.columns)
  const columns = count === 1 ? 1 : requested ? Math.max(1, Math.min(count, Math.round(requested))) : chooseAutoColumns(count, gridBounds.width, gridBounds.height, gutterPx)
  const rows = Math.ceil(count / columns)
  const cellWidth = (gridBounds.width - gutterPx * (columns - 1)) / columns
  const cellHeight = (gridBounds.height - gutterPx * (rows - 1)) / rows
  return { width, height, short, sheetMarginPx, gutterPx, borderInset, gridBounds, columns, rows, cellWidth, cellHeight }
}
function cellPosition(index, count, geo) {
  const row = Math.floor(index / geo.columns)
  const columnInRow = index % geo.columns
  const rowStart = row * geo.columns
  const rowCount = Math.min(geo.columns, count - rowStart)
  const rowWidth = rowCount * geo.cellWidth + (rowCount - 1) * geo.gutterPx
  const rowOffset = (geo.gridBounds.width - rowWidth) / 2
  const x = geo.gridBounds.x + rowOffset + columnInRow * (geo.cellWidth + geo.gutterPx)
  const y = geo.gridBounds.y + row * (geo.cellHeight + geo.gutterPx)
  return { row, column: columnInRow, x, y, width: geo.cellWidth, height: geo.cellHeight }
}
function sourceBox(cell, item, labels) {
  const keyline = Math.max(1, Math.min(cell.width, cell.height) * 0.012)
  const inset = Math.max(keyline * 2.2, Math.min(cell.width, cell.height) * 0.055)
  const labelHeight = labels === "none" ? 0 : Math.min(cell.height * 0.18, 34 * Math.min(cell.width, cell.height) / 180)
  const availableW = Math.max(1, cell.width - inset * 2)
  const availableH = Math.max(1, cell.height - inset * 2 - labelHeight)
  let artworkWidth, artworkHeight
  if (item.fit === "cover") {
    if (availableW / availableH > item.ratio) { artworkWidth = availableW; artworkHeight = availableW / item.ratio }
    else { artworkHeight = availableH; artworkWidth = availableH * item.ratio }
  } else {
    if (availableW / availableH > item.ratio) { artworkHeight = availableH; artworkWidth = availableH * item.ratio }
    else { artworkWidth = availableW; artworkHeight = availableW / item.ratio }
  }
  const artworkCenterY = cell.y + inset + availableH / 2
  return { keyline, inset, labelHeight, availableW, availableH, artworkWidth, artworkHeight, artworkCenterY }
}
function traversalOrder(count, columns, traversal) {
  if (traversal === "column-major") {
    const output = []
    const rows = Math.ceil(count / columns)
    for (let column = 0; column < columns; column += 1) for (let row = 0; row < rows; row += 1) {
      const index = row * columns + column
      if (index < count) output.push(index)
    }
    return output
  }
  if (traversal === "serpentine") {
    const output = []
    const rows = Math.ceil(count / columns)
    for (let row = 0; row < rows; row += 1) {
      const indices = []
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column
        if (index < count) indices.push(index)
      }
      if (row % 2 === 1) indices.reverse()
      output.push(...indices)
    }
    return output
  }
  return Array.from({ length: count }, (_, index) => index)
}
function apertureForCard(card) {
  const pad = Math.min(card.width, card.height) * 0.035
  return { x: card.x, y: card.y, width: card.width + pad * 2, height: card.height + pad * 2 }
}
function interpolateRect(from, to, amount) {
  return { x: mix(from.x, to.x, amount), y: mix(from.y, to.y, amount), width: mix(from.width, to.width, amount), height: mix(from.height, to.height, amount) }
}

export function evaluateScene({ items, controls = defaultControls(), timeline, timeMs, width, height, reducedMotion = false, debug = false, selectedIndex = 0 }) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 24) throw new Error("Contact Sheet accepts 1–24 ordered sources in this atelier candidate.")
  const count = items.length
  const geo = layoutGeometry(width, height, controls, count)
  const order = traversalOrder(count, geo.columns, controls.traversal)
  const temporalState = temporal(timeline, timeMs)
  const cards = items.map((item, index) => {
    const cell = cellPosition(index, count, geo)
    const box = sourceBox(cell, item, controls.labels)
    return {
      ...item,
      x: cell.x + cell.width / 2,
      y: cell.y + cell.height / 2,
      cellX: cell.x, cellY: cell.y,
      width: cell.width, height: cell.height,
      row: cell.row, column: cell.column,
      artworkWidth: box.artworkWidth, artworkHeight: box.artworkHeight,
      artworkCenterY: box.artworkCenterY,
      artworkClip: { x: cell.x + box.inset, y: cell.y + box.inset, width: box.availableW, height: box.availableH },
      artworkPad: box.inset, keyline: box.keyline, labelHeight: box.labelHeight,
      rotation: 0, scale: 1, visible: true, labelMode: controls.labels,
      artworkOpacity: 1, artworkFilter: "none", blendMode: "normal",
      sourceVideoTimeSeconds: item.type === "video" ? sourceVideoTimeSeconds(temporalState.localTimeMs, item.videoDurationSeconds, true) : null
    }
  })
  const cardForOrdinal = (ordinal) => cards[order[Math.max(0, Math.min(count - 1, Math.round(ordinal)))]]
  const firstRect = apertureForCard(cardForOrdinal(0))
  const lastRect = apertureForCard(cardForOrdinal(count - 1))
  const wholeRect = {
    x: geo.gridBounds.x + geo.gridBounds.width / 2,
    y: geo.gridBounds.y + geo.gridBounds.height / 2,
    width: geo.gridBounds.width + geo.borderInset * 0.55,
    height: geo.gridBounds.height + geo.borderInset * 0.55
  }
  let focus
  let selectedSourceIndex
  if (reducedMotion) {
    selectedSourceIndex = mod(Math.round(selectedIndex), count)
    focus = { ...apertureForCard(cards[selectedSourceIndex]), kind: "cell", sourceIndex: selectedSourceIndex, ordinal: order.indexOf(selectedSourceIndex), progress: 1 }
  } else {
    const segment = temporalState.segment
    if (segment.kind === "hold") {
      const ordinal = segment.fromOrdinal
      selectedSourceIndex = order[ordinal]
      focus = { ...apertureForCard(cards[selectedSourceIndex]), kind: "cell", sourceIndex: selectedSourceIndex, ordinal, progress: 1 }
    } else if (segment.kind === "travel") {
      const fromSource = order[segment.fromOrdinal]
      const toSource = order[segment.toOrdinal]
      selectedSourceIndex = temporalState.segmentProgress < 0.5 ? fromSource : toSource
      focus = { ...interpolateRect(apertureForCard(cards[fromSource]), apertureForCard(cards[toSource]), temporalState.eased), kind: "travelling-mark", sourceIndex: selectedSourceIndex, ordinal: temporalState.ordinalProgress, progress: temporalState.segmentProgress }
    } else if (segment.kind === "finale-expand") {
      selectedSourceIndex = order[count - 1]
      focus = { ...interpolateRect(lastRect, wholeRect, temporalState.eased), kind: "whole-set-transition", sourceIndex: selectedSourceIndex, ordinal: count - 1, progress: temporalState.segmentProgress }
    } else if (segment.kind === "finale-hold") {
      selectedSourceIndex = order[count - 1]
      focus = { ...wholeRect, kind: "whole-set", sourceIndex: selectedSourceIndex, ordinal: count - 1, progress: 1 }
    } else {
      selectedSourceIndex = temporalState.segmentProgress < 0.5 ? order[count - 1] : order[0]
      focus = { ...interpolateRect(wholeRect, firstRect, temporalState.eased), kind: "return-to-first", sourceIndex: selectedSourceIndex, ordinal: mix(count - 1, 0, temporalState.eased), progress: temporalState.segmentProgress }
    }
  }
  const phaseName = focus.kind === "cell" ? "cell-inspection" : focus.kind === "whole-set" ? "whole-set-finale" : focus.kind === "whole-set-transition" ? "whole-set-gather" : focus.kind === "return-to-first" ? "return-to-first" : "attention-travel"
  return {
    sceneId: sceneMeta.id, width, height,
    phase: temporalState.phase, phaseName,
    selectedIndex: selectedSourceIndex,
    timeline, temporal: temporalState, controls: { ...controls },
    paper: { opaque: true, color: "paper-token", borderInset: geo.borderInset },
    layout: { columns: geo.columns, rows: geo.rows, gutterPx: geo.gutterPx, sheetMarginPx: geo.sheetMarginPx, gridBounds: geo.gridBounds, traversal: controls.traversal, traversalOrder: order },
    cards, focus, reducedMotion, debug
  }
}

export function summarizeState(state) {
  return {
    phase: round(state.phase), phaseName: state.phaseName,
    segmentId: state.temporal.segment.id, segmentKind: state.temporal.segment.kind, pace: state.temporal.segment.pace,
    selectedIndex: state.selectedIndex,
    layout: { columns: state.layout.columns, rows: state.layout.rows, gutterPx: round(state.layout.gutterPx, 3), sheetMarginPx: round(state.layout.sheetMarginPx, 3), traversal: state.layout.traversal },
    gridBounds: { x: round(state.layout.gridBounds.x, 3), y: round(state.layout.gridBounds.y, 3), width: round(state.layout.gridBounds.width, 3), height: round(state.layout.gridBounds.height, 3) },
    totalIdentityCount: state.cards.length, visibleCount: state.cards.length,
    identityOrder: state.cards.map((card) => card.id),
    traversalOrder: state.layout.traversalOrder,
    focus: { kind: state.focus.kind, sourceIndex: state.focus.sourceIndex, x: round(state.focus.x, 3), y: round(state.focus.y, 3), width: round(state.focus.width, 3), height: round(state.focus.height, 3) },
    firstCells: state.cards.slice(0, 4).map((card) => ({ id: card.id, sourceIndex: card.sourceIndex, row: card.row, column: card.column, x: round(card.x, 3), y: round(card.y, 3), width: round(card.width, 3), height: round(card.height, 3), failed: card.failed })),
    labels: state.controls.labels,
    opaqueSurface: state.paper.opaque,
    sourceTreatment: { artworkOpacity: 1, artworkFilter: "none", blendMode: "normal" }
  }
}

const recommendedTimeline = compileTimeline({ mode: "automatic", itemCount: 12, controls: defaultControls() })
export const phaseBoundaries = [...new Set(recommendedTimeline.segments.flatMap((segment) => [segment.startMs / recommendedTimeline.durationMs, segment.endMs / recommendedTimeline.durationMs]).map((value) => round(value, 6)))].sort((a, b) => a - b)

export const testVectorCases = canonicalTimes.slice(0, 12).map((normalizedTime, index) => ({
  id: `contact-sheet-canonical-${String(index).padStart(2, "0")}`,
  fixture: index % 5 === 0 ? "one" : index % 5 === 1 ? "two" : index % 5 === 2 ? "recommended" : index % 5 === 3 ? "bounded-many" : "mixed-failed",
  canvas: index % 4 === 0 ? [1920,1080] : index % 4 === 1 ? [1080,1920] : index % 4 === 2 ? [1080,1080] : [1080,1350],
  normalizedTime,
  mode: index % 3 === 0 ? "automatic" : index % 3 === 1 ? "fixed-duration" : "directed",
  reducedMotion: index === 10,
  selectedIndex: index === 10 ? 7 : 0
})).concat([
  { id: "contact-sheet-seam-start", fixture: "bounded-many", canvas: [1920,1080], normalizedTime: 0 },
  { id: "contact-sheet-seam-end", fixture: "bounded-many", canvas: [1920,1080], normalizedTime: 1 },
  { id: "contact-sheet-whole-set-finale", fixture: "recommended", canvas: [1920,1080], normalizedTime: 0.9 },
  { id: "contact-sheet-serpentine", fixture: "mixed-failed", canvas: [1080,1350], normalizedTime: 0.37, controls: { traversal: "serpentine" } },
  { id: "contact-sheet-column-major", fixture: "recommended", canvas: [1080,1920], normalizedTime: 0.31, controls: { traversal: "column-major", columns: "3" } }
])
