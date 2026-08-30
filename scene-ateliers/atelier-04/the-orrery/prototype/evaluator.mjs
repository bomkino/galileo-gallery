export const SCENE_ID = "the-orrery"
export const EVALUATOR_VERSION = 1
export const STATUS_LABEL = "G10B preflight candidate; implementation blocked by G10A"
export const TAU = Math.PI * 2

export const DEFAULTS = Object.freeze({
  ringCount: "auto",
  orbitSize: 0.38,
  verticalSquash: 0.34,
  satelliteScale: 0.19,
  orbitPace: 1,
})

export const CONTROL_BOUNDS = Object.freeze({
  ringCount: ["auto", "2", "3"],
  orbitSize: [0.25, 0.48],
  verticalSquash: [0.18, 0.55],
  satelliteScale: [0.12, 0.28],
  orbitPace: [0.6, 1.4],
})

export const CANVASES = Object.freeze({
  "16:9": { width: 960, height: 540 },
  "9:16": { width: 405, height: 720 },
  "1:1": { width: 640, height: 640 },
  "4:5": { width: 576, height: 720 },
})

const RATIOS = [16 / 9, 4 / 5, 1, 3 / 2, 9 / 16, 2.1, 5 / 4]
const REVOLUTIONS = Object.freeze({ 1: [1], 2: [2, -1], 3: [3, -2, 1] })
const PHASE_OFFSETS = [0.08, 0.31, 0.57]
const PLANE_TILTS = [18, -13, 27]

export function clamp(value, min = 0, max = 1) { return Math.min(max, Math.max(min, value)) }
export function mod(value, divisor = 1) { return ((value % divisor) + divisor) % divisor }
export function smootherstep(value) { const x = clamp(value); return x * x * x * (x * (x * 6 - 15) + 10) }
export function stableHash(text) { let hash = 2166136261; for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619) } return hash >>> 0 }
export function mix(a, b, t) { return a + (b - a) * t }

export function makeItems(count, kind = "ordinary") {
  return Array.from({ length: count }, (_, index) => ({
    id: `${kind}-${String(index + 1).padStart(3, "0")}`,
    label: `BODY ${String(index + 1).padStart(2, "0")}`,
    ratio: kind === "mixed" ? RATIOS[index % RATIOS.length] : index % 3 === 1 ? 4 / 5 : index % 3 === 2 ? 1 : 16 / 9,
    kind: kind === "media-edge" && index === 2 ? "video" : kind === "media-edge" && index === 6 ? "failed" : "image",
    videoDurationSeconds: kind === "media-edge" && index === 2 ? 5 : undefined,
  }))
}

export const FIXTURES = Object.freeze({
  one: makeItems(1, "one"),
  two: makeItems(2, "two"),
  five: makeItems(5, "five"),
  ordinary9: makeItems(9, "ordinary"),
  mixed21: makeItems(21, "mixed"),
  many127: makeItems(127, "many"),
  mediaEdge: makeItems(9, "media-edge"),
})

export function sourceVideoTimeSeconds(storySeconds, durationSeconds, loop = true) {
  if (!Number.isFinite(storySeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const seconds = Math.max(0, storySeconds)
  return loop ? mod(seconds, durationSeconds) : Math.min(seconds, durationSeconds)
}

export function validateConfig(input = {}) {
  const value = { ...DEFAULTS, ...input }
  if (!CONTROL_BOUNDS.ringCount.includes(String(value.ringCount))) throw new Error("ringCount invalid")
  value.ringCount = String(value.ringCount)
  for (const key of ["orbitSize", "verticalSquash", "satelliteScale", "orbitPace"]) {
    const [min, max] = CONTROL_BOUNDS[key]
    if (!Number.isFinite(value[key]) || value[key] < min || value[key] > max) throw new Error(`${key} out of bounds`)
  }
  return value
}

export function resolveRingCount(ringCount, satelliteCount) {
  if (satelliteCount <= 0) return 0
  const requested = ringCount === "auto" ? (satelliteCount >= 7 ? 3 : satelliteCount >= 2 ? 2 : 1) : Number(ringCount)
  return Math.max(1, Math.min(3, requested, satelliteCount))
}

export function compileTimeline({ mode = "automatic", orbitPace = 1, fixedDurationSeconds = 12, segments = [], fps = 30 } = {}) {
  const pace = clamp(Number(orbitPace) || 1, 0.6, 1.4)
  const baseDurationSeconds = 12 / pace
  const boundedFps = clamp(Number(fps) || 30, 1, 120)
  let durationSeconds = baseDurationSeconds
  let compiledSegments
  if (mode === "fixed-duration") {
    durationSeconds = clamp(Number(fixedDurationSeconds) || baseDurationSeconds, 1, 24 * 60 * 60)
    compiledSegments = [{ id: "fixed-master-loop", kind: "cycle", start: 0, end: 1, cycles: 1 }]
  } else if (mode === "directed") {
    const source = segments.length ? segments : [
      { id: "orbit-opening", kind: "cycle", cycles: 1, paceScale: 1 },
      { id: "hierarchy-hold", kind: "hold", durationSeconds: 1.2 },
      { id: "orbit-finale", kind: "cycle", cycles: 1, paceScale: 1 },
    ]
    const weighted = source.map((segment) => ({ ...segment, weight: segment.kind === "hold" ? Math.max(0.2, segment.durationSeconds || 1.2) : Math.max(0.05, segment.cycles || 1) / clamp(segment.paceScale || 1, 0.05, 20) }))
    const total = weighted.reduce((sum, segment) => sum + segment.weight, 0)
    let cursor = 0
    compiledSegments = weighted.map((segment) => { const start = cursor / total; cursor += segment.weight; return { id: segment.id, kind: segment.kind, start, end: cursor / total, cycles: segment.kind === "hold" ? 0 : Math.max(1, Math.round(segment.cycles || 1)) } })
    durationSeconds = baseDurationSeconds * total
  } else compiledSegments = [{ id: "automatic-master-loop", kind: "cycle", start: 0, end: 1, cycles: 1 }]
  return { mode, durationSeconds, frameCount: Math.max(1, Math.ceil(durationSeconds * boundedFps)), segments: compiledSegments }
}

export function evaluateTimeline(compiled, normalizedTime) {
  const t = mod(normalizedTime, 1)
  const segment = compiled.segments.find((entry) => t < entry.end) || compiled.segments.at(-1)
  const span = Math.max(1e-9, segment.end - segment.start)
  const local = clamp((t - segment.start) / span)
  let before = 0
  for (const entry of compiled.segments) { if (entry === segment) break; before += entry.cycles }
  return { masterCycle: before + segment.cycles * local, velocity: segment.kind === "hold" ? 0 : segment.cycles / (compiled.durationSeconds * span), segmentId: segment.id }
}

function finiteEnvelope(t, exchangeEnabled) {
  const x = clamp(t)
  if (x < 0.10) return { phrase: "entry", assembly: smootherstep(x / 0.10), exchange: 0 }
  if (x < 0.58) return { phrase: "orbit", assembly: 1, exchange: 0 }
  if (x < 0.76 && exchangeEnabled) return { phrase: "primary-exchange", assembly: 1, exchange: smootherstep((x - 0.58) / 0.18) }
  if (x < 0.90) return { phrase: "settled-hierarchy", assembly: 1, exchange: exchangeEnabled ? 1 : 0 }
  if (x < 0.96) return { phrase: "finale", assembly: 1, exchange: exchangeEnabled ? 1 : 0 }
  return { phrase: "exit", assembly: 1 - smootherstep((x - 0.96) / 0.04), exchange: exchangeEnabled ? 1 : 0 }
}

export function buildBaseMembership(items, primaryId, effectiveRingCount) {
  const satellites = items.filter((item) => item.id !== primaryId)
  const membersByRing = Array.from({ length: effectiveRingCount }, () => [])
  satellites.forEach((item, ordinal) => membersByRing[ordinal % Math.max(1, effectiveRingCount)].push({ item, ordinal }))
  const membership = new Map()
  membersByRing.forEach((members, ringIndex) => members.forEach((entry, slotIndex) => membership.set(entry.item.id, { ringIndex, slotIndex, ringMemberCount: members.length, satelliteOrdinal: entry.ordinal })))
  return { satellites, membersByRing, membership }
}

function orbitPose({ membership, masterCycle, parameters, width, height, assembly }) {
  const ringIndex = membership.ringIndex
  const rev = REVOLUTIONS[Math.max(1, membership.effectiveRingCount)][ringIndex]
  const phase = membership.ringMemberCount <= 1 ? 0 : membership.slotIndex / membership.ringMemberCount
  const angle = TAU * (rev * masterCycle + phase + PHASE_OFFSETS[ringIndex])
  const planeTilt = PLANE_TILTS[ringIndex] * Math.PI / 180
  const portrait = height > width
  const baseRadius = Math.min(width * (portrait ? 0.42 : 0.46), height * 0.52) * parameters.orbitSize / 0.48
  const radius = baseRadius * (0.62 + ringIndex * 0.19) * assembly
  const planarY = Math.sin(angle) * radius * parameters.verticalSquash
  const planarZ = Math.sin(angle) * Math.cos(planeTilt) + Math.cos(angle) * Math.sin(planeTilt) * 0.34
  const x = width * 0.5 + Math.cos(angle) * radius
  const y = height * 0.5 + planarY + Math.cos(angle) * Math.sin(planeTilt) * radius * 0.16
  const scale = parameters.satelliteScale * (0.94 - ringIndex * 0.08) * (0.82 + (planarZ + 1) * 0.09)
  return { x, y, depth: planarZ, angle, scale, ringIndex, slotIndex: membership.slotIndex, revolutionCount: rev, zOrder: Math.round(10000 + planarZ * 3600 - ringIndex * 15), rotateYDeg: -Math.cos(angle) * 13, rotateZDeg: Math.sin(planeTilt) * 4 }
}

function centerPose(width, height, primaryScale) {
  return { x: width * 0.5, y: height * 0.5, depth: 0, angle: 0, scale: primaryScale, ringIndex: null, slotIndex: null, revolutionCount: 0, zOrder: 10000, rotateYDeg: 0, rotateZDeg: 0 }
}

function mixPose(from, to, amount, arcSign) {
  const arc = Math.sin(Math.PI * amount)
  return {
    x: mix(from.x, to.x, amount),
    y: mix(from.y, to.y, amount) + arc * arcSign * 34,
    depth: mix(from.depth, to.depth, amount) + arc * arcSign * 0.22,
    angle: mix(from.angle, to.angle, amount),
    scale: mix(from.scale, to.scale, amount),
    ringIndex: amount < 0.5 ? from.ringIndex : to.ringIndex,
    slotIndex: amount < 0.5 ? from.slotIndex : to.slotIndex,
    revolutionCount: amount < 0.5 ? from.revolutionCount : to.revolutionCount,
    zOrder: Math.round(10000 + (mix(from.depth, to.depth, amount) + arc * arcSign * 0.22) * 3600),
    rotateYDeg: mix(from.rotateYDeg, to.rotateYDeg, amount),
    rotateZDeg: mix(from.rotateZDeg, to.rotateZDeg, amount),
  }
}

export function evaluateOrrery({
  items,
  config = DEFAULTS,
  intent,
  normalizedTime = 0,
  canvas = CANVASES["16:9"],
  runKind = "loop",
  reducedMotion = false,
  timelineMode = "automatic",
  timelineSegments = [],
} = {}) {
  const safeItems = Array.isArray(items) ? items : []
  const parameters = validateConfig(config)
  if (!intent || typeof intent.primaryId !== "string") throw new Error("serialized primaryId is required")
  if (!safeItems.some((item) => item.id === intent.primaryId)) throw new Error("serialized primaryId is absent from ordered media")
  const exchangeTargetId = typeof intent.exchangeTargetId === "string" && safeItems.some((item) => item.id === intent.exchangeTargetId) && intent.exchangeTargetId !== intent.primaryId ? intent.exchangeTargetId : null
  const exchangeEnabled = runKind === "finite" && Boolean(exchangeTargetId) && intent.exchangeEnabled === true
  const t = runKind === "finite" ? clamp(normalizedTime) : mod(normalizedTime, 1)
  const envelope = runKind === "finite" ? finiteEnvelope(t, exchangeEnabled) : { phrase: "orbit", assembly: 1, exchange: 0 }
  const timeline = compileTimeline({ mode: timelineMode, orbitPace: parameters.orbitPace, segments: timelineSegments })
  const temporal = evaluateTimeline(timeline, t)
  const timelineDirection = intent.direction === "reverse" ? "reverse" : "forward"
  const directionSign = timelineDirection === "reverse" ? -1 : 1
  const masterCycle = directionSign * (reducedMotion ? 0 : (runKind === "finite" ? clamp((t - 0.10) / 0.80) : temporal.masterCycle))
  const satelliteCount = Math.max(0, safeItems.length - 1)
  const effectiveRingCount = resolveRingCount(parameters.ringCount, satelliteCount)
  const base = buildBaseMembership(safeItems, intent.primaryId, effectiveRingCount)
  const width = Math.max(1, canvas.width), height = Math.max(1, canvas.height)
  const primaryScale = Math.min(height, width) * (height > width ? 0.34 : 0.28)
  const center = centerPose(width, height, primaryScale)

  const baseOrbitPoses = new Map()
  for (const [id, member] of base.membership) baseOrbitPoses.set(id, orbitPose({ membership: { ...member, effectiveRingCount }, masterCycle, parameters, width, height, assembly: envelope.assembly }))
  const targetOrbit = exchangeTargetId ? baseOrbitPoses.get(exchangeTargetId) : null
  const q = envelope.exchange
  const effectivePrimaryId = exchangeEnabled && q >= 1 ? exchangeTargetId : intent.primaryId

  const cards = safeItems.map((item, sourceIndex) => {
    let role = "satellite"
    let pose
    let membership = base.membership.get(item.id) || null
    if (item.id === intent.primaryId) {
      role = exchangeEnabled && q > 0 ? "outgoing-primary" : "primary"
      pose = exchangeEnabled && targetOrbit ? mixPose(center, targetOrbit, q, -1) : center
      if (exchangeEnabled && q >= 1) { role = "satellite"; membership = base.membership.get(exchangeTargetId); pose = targetOrbit }
    } else if (item.id === exchangeTargetId && exchangeEnabled) {
      role = q >= 1 ? "primary" : q > 0 ? "incoming-primary" : "satellite"
      pose = targetOrbit ? mixPose(targetOrbit, center, q, 1) : center
      if (q >= 1) { pose = center; membership = null }
    } else {
      pose = baseOrbitPoses.get(item.id) || center
    }
    if (item.id === effectivePrimaryId && q >= 1) role = "primary"
    const ratio = clamp(Number(item.ratio) || 16 / 9, 0.2, 4)
    const isPrimaryRole = role === "primary" || role === "incoming-primary" || role === "outgoing-primary"
    const cardHeight = isPrimaryRole ? primaryScale : Math.min(height, width) * pose.scale
    const adjustedHeight = height > width && ratio > 1.5 ? cardHeight * 0.82 : cardHeight
    const cardWidth = adjustedHeight * ratio
    const projectedOnStage = pose.x + cardWidth * 0.6 > 0 && pose.x - cardWidth * 0.6 < width && pose.y + adjustedHeight * 0.6 > 0 && pose.y - adjustedHeight * 0.6 < height
    return {
      id: item.id, sourceIndex, sourceKind: item.kind, role,
      primary: role === "primary", membership,
      x: pose.x, y: pose.y, width: cardWidth, height: adjustedHeight,
      depth: pose.depth, angle: pose.angle, scale: 1,
      rotateYDeg: pose.rotateYDeg, rotateZDeg: pose.rotateZDeg,
      zOrder: pose.zOrder, visible: projectedOnStage,
      frontOfPrimary: pose.depth > 0,
      artworkOpacity: 1, artworkFilter: "none", artworkBlend: "normal",
      sourceVideoTimeSeconds: item.kind === "video" ? sourceVideoTimeSeconds(t * timeline.durationSeconds, item.videoDurationSeconds || 1, true) : null,
      failed: item.kind === "failed",
    }
  })

  const visibleSatellites = cards.filter((card) => card.visible && !["primary", "incoming-primary", "outgoing-primary"].includes(card.role))
  const protectedRoles = cards.filter((card) => card.visible && ["primary", "incoming-primary", "outgoing-primary"].includes(card.role))
  const maxSatelliteNodes = height > width ? 18 : 24
  let chosenSatellites = visibleSatellites
  if (visibleSatellites.length > maxSatelliteNodes) {
    chosenSatellites = [...visibleSatellites].sort((a, b) => {
      const aScore = Math.hypot((a.x - width / 2) / width, (a.y - height / 2) / height) - a.depth * 0.08
      const bScore = Math.hypot((b.x - width / 2) / width, (b.y - height / 2) / height) - b.depth * 0.08
      return aScore - bScore || a.sourceIndex - b.sourceIndex
    }).slice(0, maxSatelliteNodes)
  }
  const keep = new Set([...protectedRoles, ...chosenSatellites].map((card) => card.id))
  const renderSlots = cards.filter((card) => keep.has(card.id)).sort((a, b) => a.zOrder - b.zOrder || a.sourceIndex - b.sourceIndex)

  return {
    sceneId: SCENE_ID, evaluatorVersion: EVALUATOR_VERSION, statusLabel: STATUS_LABEL,
    normalizedTime: t, runKind, phrase: envelope.phrase, masterCycle, timelineDirection, exchangeProgress: q,
    basePrimaryId: intent.primaryId, effectivePrimaryId, exchangeTargetId,
    ringCountControl: parameters.ringCount, effectiveRingCount,
    revolutionCounts: effectiveRingCount ? REVOLUTIONS[effectiveRingCount] : [],
    compiledDurationSeconds: timeline.durationSeconds,
    count: safeItems.length, canvas: { width, height },
    stateCount: cards.length, renderNodeCount: renderSlots.length,
    maxObservedNodes: maxSatelliteNodes + 2,
    artworkContract: { opacity: 1, filter: "none", blend: "normal" },
    cards, renderSlots,
  }
}

export function summarize(state) {
  const memberships = state.cards.filter((card) => card.membership).map((card) => ({ id: card.id, ringIndex: card.membership.ringIndex, slotIndex: card.membership.slotIndex })).sort((a, b) => a.id.localeCompare(b.id))
  return {
    sceneId: state.sceneId, evaluatorVersion: state.evaluatorVersion, statusLabel: state.statusLabel,
    normalizedTime: Number(state.normalizedTime.toFixed(6)), runKind: state.runKind, phrase: state.phrase,
    masterCycle: Number(state.masterCycle.toFixed(6)), timelineDirection: state.timelineDirection, exchangeProgress: Number(state.exchangeProgress.toFixed(6)),
    basePrimaryId: state.basePrimaryId, effectivePrimaryId: state.effectivePrimaryId, exchangeTargetId: state.exchangeTargetId,
    ringCountControl: state.ringCountControl, effectiveRingCount: state.effectiveRingCount,
    revolutionCounts: state.revolutionCounts, compiledDurationSeconds: Number(state.compiledDurationSeconds.toFixed(6)),
    count: state.count, canvas: state.canvas, renderNodeCount: state.renderNodeCount, stateCount: state.stateCount,
    membershipDigest: memberships, artworkContract: state.artworkContract,
  }
}
