const MAX_VISIBLE = 24
const DAY_MS = 24 * 60 * 60 * 1000

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor
const smoother = (value) => {
  const x = clamp(value, 0, 1)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

function finite(value, label, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label}:finite-number-required`)
  }
  return value
}

function validateItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 256) throw new RangeError("items:count-out-of-range")
  const ids = new Set()
  return items.map((item, index) => {
    if (!item || typeof item.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || ids.has(item.id)) {
      throw new TypeError("items:stable-unique-id-required")
    }
    ids.add(item.id)
    const ratio = finite(Number(item.ratio), `items[${index}].ratio`, 0.05, 20)
    return { id: item.id, ratio, failed: Boolean(item.failed), caption: typeof item.caption === "string" ? item.caption : "", kind: item.kind === "video" ? "video" : "image", durationMs: item.durationMs }
  })
}

function validateParameters(input = {}) {
  const travelMs = finite(Number(input.travelMs ?? 700), "travelMs", 100, 4000)
  const holdMs = finite(Number(input.holdMs ?? 900), "holdMs", 0, 5000)
  const inspectionScale = finite(Number(input.inspectionScale ?? 1.08), "inspectionScale", 1, 1.14)
  const direction = input.direction ?? "forward"
  if (!["forward", "reverse"].includes(direction)) throw new TypeError("direction:unsupported")
  const fit = input.fit ?? "contain"
  if (!["contain", "cover"].includes(fit)) throw new TypeError("fit:unsupported")
  const captions = input.captions ?? "active-only"
  if (!["off", "active-only", "all"].includes(captions)) throw new TypeError("captions:unsupported")
  return { travelMs, holdMs, inspectionScale, direction, fit, captions }
}

export function compileLightTableTimeline({ mode = "automatic", itemCount, parameters = {}, fixedDurationMs = 0 }) {
  if (!Number.isInteger(itemCount) || itemCount < 1 || itemCount > 256) throw new RangeError("itemCount:count-out-of-range")
  const p = validateParameters(parameters)
  const basePassMs = itemCount * (p.travelMs + p.holdMs)
  const phrases = mode === "directed"
    ? [["fast-scan-1", 2], ["fast-scan-2", 2], ["regular-read", 1], ["fast-close", 2]]
    : [[mode === "fixed-duration" ? "fixed-pass" : "automatic-pass", 1]]
  if (!["automatic", "fixed-duration", "directed"].includes(mode)) throw new TypeError("mode:unsupported")

  let elapsed = 0
  let visits = 0
  let segments
  if (mode === "fixed-duration") {
    const duration = finite(Number(fixedDurationMs), "fixedDurationMs", Math.max(1000, itemCount * 250), DAY_MS)
    segments = [{ id: "fixed-pass", startMs: 0, endMs: duration, startVisit: 0, endVisit: itemCount, paceScale: basePassMs / duration }]
    elapsed = duration
    visits = itemCount
  } else {
    segments = phrases.map(([id, paceScale]) => {
      const duration = basePassMs / paceScale
      const value = { id, startMs: elapsed, endMs: elapsed + duration, startVisit: visits, endVisit: visits + itemCount, paceScale }
      elapsed += duration
      visits += itemCount
      return value
    })
  }
  return Object.freeze({ mode, durationMs: elapsed, itemCount, parameters: Object.freeze(p), segments: Object.freeze(segments.map(Object.freeze)) })
}

function gridFor(count, width, height) {
  const visible = Math.min(count, MAX_VISIBLE)
  const portrait = height > width * 1.05
  let columns
  if (visible === 1) columns = 1
  else if (visible === 2) columns = portrait ? 1 : 2
  else if (portrait) columns = Math.min(3, Math.ceil(Math.sqrt(visible * width / height)))
  else columns = Math.min(6, Math.ceil(Math.sqrt(visible * width / height)))
  columns = Math.max(1, columns)
  const rows = Math.ceil(visible / columns)
  const marginX = width * 0.08
  const marginY = height * 0.1
  const gap = Math.max(12, Math.min(width, height) * 0.025)
  const cellWidth = (width - marginX * 2 - gap * (columns - 1)) / columns
  const cellHeight = (height - marginY * 2 - gap * (rows - 1)) / rows
  return { visible, columns, rows, marginX, marginY, gap, cellWidth, cellHeight }
}

export function evaluateLightTable({ items, timeline, timeMs, stageWidth, stageHeight, reducedMotion = false }) {
  const source = validateItems(items)
  finite(Number(stageWidth), "stageWidth", 1, 16384)
  finite(Number(stageHeight), "stageHeight", 1, 16384)
  finite(Number(timeMs), "timeMs", -DAY_MS, DAY_MS * 2)
  if (!timeline || timeline.itemCount !== source.length) throw new TypeError("timeline:item-count-mismatch")
  const p = timeline.parameters
  const grid = gridFor(source.length, stageWidth, stageHeight)
  const cells = source.slice(0, grid.visible).map((item, index) => {
    const column = index % grid.columns
    const row = Math.floor(index / grid.columns)
    const x = grid.marginX + column * (grid.cellWidth + grid.gap)
    const y = grid.marginY + row * (grid.cellHeight + grid.gap)
    const availableRatio = grid.cellWidth / grid.cellHeight
    const width = item.ratio >= availableRatio ? grid.cellWidth : grid.cellHeight * item.ratio
    const height = item.ratio >= availableRatio ? grid.cellWidth / item.ratio : grid.cellHeight
    return { id: item.id, sourceIndex: index, x: x + (grid.cellWidth - width) / 2, y: y + (grid.cellHeight - height) / 2, width, height, failed: item.failed }
  })

  const settledIndex = Math.floor((source.length - 1) / 2)
  if (reducedMotion) {
    return { phase: 0.5, segmentId: "reduced-motion", activeIndex: settledIndex, loupe: { ...cells[Math.min(settledIndex, cells.length - 1)], progress: 1 }, cells, overflow: Math.max(0, source.length - MAX_VISIBLE), render: { artworkOpacity: 1, artworkFilter: "none", blendMode: "normal", fit: p.fit } }
  }

  const local = mod(timeMs, timeline.durationMs)
  const segment = timeline.segments.find((candidate) => local < candidate.endMs) ?? timeline.segments.at(-1)
  const segmentProgress = (local - segment.startMs) / Math.max(1, segment.endMs - segment.startMs)
  const visit = segment.startVisit + (segment.endVisit - segment.startVisit) * segmentProgress
  const step = Math.floor(visit)
  const stepProgress = mod(visit, 1)
  const directionIndex = (value) => p.direction === "reverse" ? source.length - 1 - mod(value, source.length) : mod(value, source.length)
  const currentIndex = directionIndex(step)
  const nextIndex = directionIndex(step + 1)
  const travelRatio = p.travelMs / Math.max(1, p.travelMs + p.holdMs)
  const travelProgress = smoother(stepProgress / Math.max(0.0001, travelRatio))
  const currentCell = cells[Math.min(currentIndex, cells.length - 1)]
  const nextCell = cells[Math.min(nextIndex, cells.length - 1)]
  const mix = (from, to) => from + (to - from) * travelProgress
  const loupe = currentCell && nextCell ? {
    id: currentCell.id,
    x: mix(currentCell.x, nextCell.x), y: mix(currentCell.y, nextCell.y),
    width: mix(currentCell.width, nextCell.width) * p.inspectionScale,
    height: mix(currentCell.height, nextCell.height) * p.inspectionScale,
    progress: travelProgress,
  } : null

  return {
    phase: local / timeline.durationMs,
    segmentId: segment.id,
    activeIndex: travelProgress < 1 ? currentIndex : nextIndex,
    velocity: (p.direction === "reverse" ? -1 : 1) * (segment.endVisit - segment.startVisit) / Math.max(1, segment.endMs - segment.startMs),
    loupe, cells, overflow: Math.max(0, source.length - MAX_VISIBLE),
    render: { artworkOpacity: 1, artworkFilter: "none", blendMode: "normal", fit: p.fit },
  }
}

export function videoStoryTimeMs(timeMs, durationMs, loop = true) {
  finite(Number(timeMs), "timeMs", -DAY_MS, DAY_MS * 2)
  finite(Number(durationMs), "durationMs", 1, DAY_MS)
  return loop ? mod(timeMs, durationMs) : clamp(timeMs, 0, durationMs)
}

export function rectanglesOverlap(a, b, tolerance = 0) {
  return a.x + a.width > b.x + tolerance && b.x + b.width > a.x + tolerance && a.y + a.height > b.y + tolerance && b.y + b.height > a.y + tolerance
}
