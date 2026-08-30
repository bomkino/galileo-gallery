export const REVIEW_STATE_VERSION = 1
export const REVIEW_FPS = 30

const clone = (value) => JSON.parse(JSON.stringify(value))
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const finite = (value, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))
export const positiveModulo = (value, divisor) => divisor > 0 ? ((value % divisor) + divisor) % divisor : 0

export function createAuthoringSnapshot({ fixture, canvas, controls, reducedMotionOverride = null }) {
  return clone({ fixture, canvas, controls, reducedMotionOverride })
}

export class ReviewHistory {
  constructor(initialSnapshot, limit = 100) {
    this.limit = Math.max(1, Math.floor(finite(limit, 100)))
    this.present = clone(initialSnapshot)
    this.past = []
    this.future = []
  }

  commitFrom(beforeSnapshot, nextSnapshot, label = "Edit") {
    const before = clone(beforeSnapshot)
    const next = clone(nextSnapshot)
    if (equal(before, next)) {
      this.present = next
      return false
    }
    this.past.push({ snapshot: before, label })
    if (this.past.length > this.limit) this.past.shift()
    this.present = next
    this.future = []
    return true
  }

  undo(currentSnapshot = this.present) {
    const entry = this.past.pop()
    if (!entry) return null
    this.future.push({ snapshot: clone(currentSnapshot), label: entry.label })
    this.present = clone(entry.snapshot)
    return { snapshot: clone(entry.snapshot), label: entry.label }
  }

  redo(currentSnapshot = this.present) {
    const entry = this.future.pop()
    if (!entry) return null
    this.past.push({ snapshot: clone(currentSnapshot), label: entry.label })
    this.present = clone(entry.snapshot)
    return { snapshot: clone(entry.snapshot), label: entry.label }
  }

  get canUndo() { return this.past.length > 0 }
  get canRedo() { return this.future.length > 0 }
  get depth() { return { undo: this.past.length, redo: this.future.length } }
}

function validControlValue(id, raw, defaults, bounds) {
  const fallback = defaults[id]
  if (typeof fallback === "number") {
    const number = Number(raw)
    if (!Number.isFinite(number)) return fallback
    const range = bounds[id]
    return range ? clamp(number, range[0], range[1]) : number
  }
  if (typeof fallback === "boolean") return raw === true || raw === "1" || raw === "true"
  return typeof raw === "string" ? raw : fallback
}

export function decodeReviewState(search, spec) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search || "").replace(/^\?/, ""))
  const warnings = []
  const fixture = spec.fixtureIds.includes(params.get("fixture")) ? params.get("fixture") : spec.defaultFixture
  const canvas = spec.canvasIds.includes(params.get("canvas")) ? params.get("canvas") : spec.defaultCanvas
  const controls = clone(spec.defaults)

  const mode = params.get("mode")
  if (mode && ["automatic", "fixed-duration", "directed"].includes(mode)) controls.mode = mode
  const direction = params.get("direction")
  if (direction && ["forward", "reverse"].includes(direction)) controls.direction = direction

  for (const id of spec.controlIds) {
    const raw = params.get(`c.${id}`) ?? (id === spec.featuredKey ? params.get("featured") : null)
    if (raw === null) continue
    const value = validControlValue(id, raw, spec.defaults, spec.controlBounds)
    if (String(value) !== String(raw) && Number(raw) !== value) warnings.push(`Ignored or bounded ${id}`)
    controls[id] = value
  }

  const fixedRaw = params.get("fixed")
  if (fixedRaw !== null) controls.fixedDurationMs = validControlValue("fixedDurationMs", fixedRaw, spec.defaults, spec.controlBounds)

  let reducedMotionOverride = null
  const reduced = params.get("reduced")
  if (reduced === "1") reducedMotionOverride = true
  else if (reduced === "0") reducedMotionOverride = false
  else if (reduced !== null && reduced !== "auto") warnings.push("Ignored reduced-motion override")

  const timeMs = Math.max(0, finite(params.get("time"), spec.defaultTime))
  return {
    state: { fixture, canvas, controls, timeMs, reducedMotionOverride },
    warnings,
  }
}

export function encodeReviewState(state, spec) {
  const params = new URLSearchParams()
  params.set("review", String(REVIEW_STATE_VERSION))
  params.set("fixture", state.fixture)
  params.set("canvas", state.canvas)
  params.set("mode", state.controls.mode)
  params.set("direction", state.controls.direction)
  params.set("fixed", String(Math.round(state.controls.fixedDurationMs)))
  params.set("time", String(Math.round(state.timeMs)))
  params.set("reduced", state.reducedMotionOverride === null ? "auto" : state.reducedMotionOverride ? "1" : "0")
  for (const id of spec.controlIds) params.set(`c.${id}`, String(state.controls[id]))
  return params.toString()
}

export function frameDurationMs(fps = REVIEW_FPS) {
  const resolved = finite(fps, REVIEW_FPS)
  if (resolved <= 0) throw new RangeError("Review FPS must be positive")
  return 1000 / resolved
}

export function reviewFrameCount(durationMs, fps = REVIEW_FPS) {
  const duration = finite(durationMs, 0)
  if (duration <= 0) return 1
  return Math.max(1, Math.ceil(duration / frameDurationMs(fps)))
}

export function reviewFrameIndex(timeMs, durationMs, fps = REVIEW_FPS) {
  const count = reviewFrameCount(durationMs, fps)
  const frame = Math.round(positiveModulo(finite(timeMs, 0), durationMs) / frameDurationMs(fps))
  return positiveModulo(frame, count)
}

export function reviewFrameTime(frameIndex, durationMs, fps = REVIEW_FPS) {
  const count = reviewFrameCount(durationMs, fps)
  const index = positiveModulo(Math.round(finite(frameIndex, 0)), count)
  return Math.min(index * frameDurationMs(fps), Math.max(0, durationMs - 1e-6))
}

export function stepReviewFrame(timeMs, durationMs, delta, fps = REVIEW_FPS) {
  const current = reviewFrameIndex(timeMs, durationMs, fps)
  return reviewFrameTime(current + Math.trunc(finite(delta, 0)), durationMs, fps)
}

export function dragTime(startTimeMs, deltaX, interactionWidth, durationMs) {
  const width = finite(interactionWidth, 0)
  if (width <= 0) return positiveModulo(startTimeMs, durationMs)
  return positiveModulo(finite(startTimeMs, 0) + finite(deltaX, 0) / width * durationMs, durationMs)
}

export function formatReviewTime(timeMs, durationMs, fps = REVIEW_FPS) {
  const index = reviewFrameIndex(timeMs, durationMs, fps)
  const count = reviewFrameCount(durationMs, fps)
  return `${Math.round(timeMs)} ms · f${String(index + 1).padStart(3, "0")}/${String(count).padStart(3, "0")} · ${Math.round(durationMs)} ms`
}

export function clampSourceIndex(index, itemCount) {
  return clamp(Math.round(finite(index, 0)), 0, Math.max(0, itemCount - 1))
}

export function readabilityScore(card) {
  if (!card) return Number.NEGATIVE_INFINITY
  const opacity = finite(card.containerOpacity, 0)
  const scale = finite(card.scale, 1)
  const frontness = finite(card.frontness, 0.5)
  const depth = finite(card.depth, 0)
  const distance = Math.abs(finite(card.distance ?? card.slotDistance ?? card.cyclicDistance, 0))
  const zone = card.zone === "front" ? 1.1 : card.zone === "shoulder" ? 0.45 : 0
  return opacity * 8 + scale * 2 + frontness * 3 + Math.tanh(depth / 500) + zone - distance * 0.025
}

export function findReadableTime({ durationMs, sourceIndex, evaluateAt, samples = 384 }) {
  if (typeof evaluateAt !== "function") throw new TypeError("evaluateAt must be a function")
  const duration = finite(durationMs, 0)
  if (duration <= 0) return { sourceIndex, timeMs: 0, score: Number.NEGATIVE_INFINITY, mounted: false }
  const count = Math.max(24, Math.floor(finite(samples, 384)))
  let best = { sourceIndex, timeMs: 0, score: Number.NEGATIVE_INFINITY, mounted: false }
  const inspect = (timeMs) => {
    const output = evaluateAt(timeMs)
    const card = output.cards.find((candidate) => candidate.sourceIndex === sourceIndex)
    const score = readabilityScore(card)
    if (score > best.score || (score === best.score && timeMs < best.timeMs)) {
      best = { sourceIndex, timeMs, score, mounted: Boolean(card), phraseRole: output.phraseRole }
    }
  }
  for (let index = 0; index < count; index += 1) inspect(index / count * duration)
  let radius = duration / count
  for (let pass = 0; pass < 3; pass += 1) {
    const centre = best.timeMs
    for (let step = -8; step <= 8; step += 1) inspect(positiveModulo(centre + step / 8 * radius, duration))
    radius /= 8
  }
  return { ...best, timeMs: positiveModulo(best.timeMs, duration) }
}

export function isTextEntryTarget(target) {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false
  return Boolean(target.closest("input, select, textarea, button, [contenteditable='true']"))
}
