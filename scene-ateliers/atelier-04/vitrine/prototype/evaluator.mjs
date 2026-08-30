export const SCENE_ID = "vitrine"
export const EVALUATOR_VERSION = 1
export const TAU = Math.PI * 2

export const DEFAULTS = Object.freeze({
  presentationScale: 0.62,
  objectTurnAmplitude: 5,
  transitionDepth: 0.18,
  transitionDirection: "left",
  placardVisibility: true,
})

export const CONTROL_BOUNDS = Object.freeze({
  presentationScale: [0.42, 0.78],
  objectTurnAmplitude: [0, 9],
  transitionDepth: [0.08, 0.30],
  transitionDirection: ["left", "right"],
  placardVisibility: [false, true],
})

export const CANVASES = Object.freeze({
  "16:9": { width: 960, height: 540 },
  "9:16": { width: 405, height: 720 },
  "1:1": { width: 640, height: 640 },
  "4:5": { width: 576, height: 720 },
})

const RATIOS = [16 / 9, 4 / 5, 1, 3 / 2, 9 / 16, 2.1, 5 / 4]

export function clamp(value, min = 0, max = 1) { return Math.min(max, Math.max(min, value)) }
export function mod(value, divisor = 1) { return ((value % divisor) + divisor) % divisor }
export function smootherstep(value) { const x = clamp(value); return x * x * x * (x * (x * 6 - 15) + 10) }
export function mix(a, b, amount) { return a + (b - a) * amount }

export function makeItems(count, kind = "ordinary") {
  return Array.from({ length: count }, (_, index) => ({
    id: `${kind}-${String(index + 1).padStart(3, "0")}`,
    label: `WORK ${String(index + 1).padStart(2, "0")}`,
    caption: index % 2 ? `Edition ${index + 1}` : `Object ${index + 1}`,
    ratio: kind === "mixed" ? RATIOS[index % RATIOS.length] : index % 3 === 1 ? 4 / 5 : index % 3 === 2 ? 1 : 16 / 9,
    kind: kind === "media-edge" && index === 2 ? "video" : kind === "media-edge" && index === 5 ? "failed" : "image",
    videoDurationSeconds: kind === "media-edge" && index === 2 ? 4.8 : undefined,
  }))
}

export const FIXTURES = Object.freeze({
  one: makeItems(1, "one"),
  two: makeItems(2, "two"),
  three: makeItems(3, "three"),
  ordinary8: makeItems(8, "ordinary"),
  mixed21: makeItems(21, "mixed"),
  many127: makeItems(127, "many"),
  mediaEdge: makeItems(8, "media-edge"),
})

export function sourceVideoTimeSeconds(storySeconds, durationSeconds, loop = true) {
  if (!Number.isFinite(storySeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const seconds = Math.max(0, storySeconds)
  return loop ? mod(seconds, durationSeconds) : Math.min(seconds, durationSeconds)
}

export function validateConfig(input = {}) {
  const value = { ...DEFAULTS, ...input }
  for (const key of ["presentationScale", "objectTurnAmplitude", "transitionDepth"]) {
    const [minimum, maximum] = CONTROL_BOUNDS[key]
    if (!Number.isFinite(value[key]) || value[key] < minimum || value[key] > maximum) throw new Error(`${key} out of bounds`)
  }
  if (!CONTROL_BOUNDS.transitionDirection.includes(value.transitionDirection)) throw new Error("transitionDirection invalid")
  if (typeof value.placardVisibility !== "boolean") throw new Error("placardVisibility invalid")
  return value
}

export function compileTimeline({ mode = "automatic", mediaCount = 1, fixedDurationSeconds = 8, segments = [], fps = 30 } = {}) {
  const count = Math.max(1, Math.round(mediaCount || 1))
  const canonicalDuration = Math.max(5.5, count * 5.5)
  const boundedFps = clamp(Number(fps) || 30, 1, 120)
  let durationSeconds = canonicalDuration
  let compiledSegments
  if (mode === "fixed-duration") {
    durationSeconds = clamp(Number(fixedDurationSeconds) || canonicalDuration, 1, 24 * 60 * 60)
    compiledSegments = [{ id: "fixed-vitrine-cycle", kind: "cycle", start: 0, end: 1, cycles: 1 }]
  } else if (mode === "directed") {
    const source = segments.length ? segments : [
      { id: "ceremonial-hold", kind: "hold", durationSeconds: 3.6 },
      { id: "composed-exchange", kind: "cycle", cycles: 1, paceScale: 1 },
      { id: "finale-hold", kind: "hold", durationSeconds: 2.2 },
    ]
    const weighted = source.map((segment) => ({
      ...segment,
      weight: segment.kind === "hold"
        ? Math.max(0.25, Number(segment.durationSeconds) || 1)
        : Math.max(0.05, Number(segment.cycles) || 1) / clamp(Number(segment.paceScale) || 1, 0.05, 20),
    }))
    const total = weighted.reduce((sum, segment) => sum + segment.weight, 0)
    let cursor = 0
    compiledSegments = weighted.map((segment) => {
      const start = cursor / total
      cursor += segment.weight
      return { id: segment.id, kind: segment.kind, start, end: cursor / total, cycles: segment.kind === "hold" ? 0 : Math.max(1, Math.round(segment.cycles || 1)) }
    })
    durationSeconds = Math.max(1, total * 2.2)
  } else {
    compiledSegments = [{ id: "automatic-vitrine-cycle", kind: "cycle", start: 0, end: 1, cycles: 1 }]
  }
  return { mode, durationSeconds, frameCount: Math.max(1, Math.ceil(durationSeconds * boundedFps)), segments: compiledSegments }
}

function cardDimensions(item, canvas, parameters) {
  const ratio = clamp(Number(item.ratio) || 16 / 9, 0.2, 4)
  const maxHeight = canvas.height * parameters.presentationScale
  const maxWidth = canvas.width * (canvas.height > canvas.width ? 0.82 : 0.72)
  const height = Math.min(maxHeight, maxWidth / ratio)
  return { width: height * ratio, height }
}

function centrePose(canvas) {
  return { x: canvas.width * 0.5, y: canvas.height * 0.47, depth: 0, scale: 1, rotateYDeg: 0, rotateXDeg: 0, zOrder: 20000 }
}

function entryPose(canvas, parameters, progress) {
  const q = smootherstep(progress)
  const sign = parameters.transitionDirection === "left" ? -1 : 1
  return {
    x: canvas.width * 0.5,
    y: canvas.height * 0.47 + (1 - q) * canvas.height * 0.10,
    depth: -(1 - q) * parameters.transitionDepth,
    scale: 1 - (1 - q) * parameters.transitionDepth * 0.34,
    rotateYDeg: -sign * parameters.objectTurnAmplitude * (1 - q),
    rotateXDeg: (1 - q) * 1.8,
    zOrder: 20000,
  }
}

function exchangePoses(canvas, dimensions, parameters, progress) {
  const q = clamp(progress)
  const outgoingProgress = smootherstep(q)
  const incomingProgress = outgoingProgress
  const sign = parameters.transitionDirection === "left" ? -1 : 1
  const outgoingDistance = canvas.width * 0.5 + dimensions.outgoing.width * 0.5 + 24
  const incomingDistance = canvas.width * 0.5 + dimensions.incoming.width * 0.5 + 24
  const outgoingDepth = -parameters.transitionDepth * Math.sin(Math.PI * outgoingProgress)
  const incomingDepth = -parameters.transitionDepth * Math.sin(Math.PI * incomingProgress)
  return {
    outgoing: {
      x: canvas.width * 0.5 + sign * outgoingDistance * outgoingProgress,
      y: canvas.height * 0.47 + Math.abs(outgoingDepth) * canvas.height * 0.09,
      depth: outgoingDepth,
      scale: 1 + outgoingDepth * 0.30,
      rotateYDeg: -sign * parameters.objectTurnAmplitude * outgoingProgress,
      rotateXDeg: Math.abs(outgoingDepth) * 8,
      zOrder: 19000,
    },
    incoming: {
      x: canvas.width * 0.5 - sign * incomingDistance * (1 - incomingProgress),
      y: canvas.height * 0.47 + Math.abs(incomingDepth) * canvas.height * 0.09,
      depth: incomingDepth,
      scale: 1 + incomingDepth * 0.30,
      rotateYDeg: sign * parameters.objectTurnAmplitude * (1 - incomingProgress),
      rotateXDeg: Math.abs(incomingDepth) * 8,
      zOrder: 20000,
    },
    outgoingProgress,
    incomingProgress,
  }
}

function makeCard(item, sourceIndex, role, pose, dimensions, timelineSeconds) {
  return {
    id: item.id,
    sourceIndex,
    sourceKind: item.kind,
    role,
    active: role !== "offstage",
    x: pose?.x ?? null,
    y: pose?.y ?? null,
    width: dimensions.width,
    height: dimensions.height,
    depth: pose?.depth ?? null,
    scale: pose?.scale ?? 1,
    rotateYDeg: pose?.rotateYDeg ?? 0,
    rotateXDeg: pose?.rotateXDeg ?? 0,
    zOrder: pose?.zOrder ?? 0,
    artworkOpacity: 1,
    artworkFilter: "none",
    artworkBlend: "normal",
    sourceVideoTimeSeconds: item.kind === "video" ? sourceVideoTimeSeconds(timelineSeconds, item.videoDurationSeconds || 1, true) : null,
    failed: item.kind === "failed",
    caption: item.caption || "",
  }
}

function resolveFiniteIds(items, intent = {}) {
  const first = items[0]?.id ?? null
  const spotlightId = items.some((item) => item.id === intent.spotlightId) ? intent.spotlightId : first
  const fallbackFinale = items.find((item) => item.id !== spotlightId)?.id ?? spotlightId
  const finaleId = items.some((item) => item.id === intent.finaleId) ? intent.finaleId : fallbackFinale
  return { spotlightId, finaleId }
}

function finiteState(time, exchangeAvailable) {
  const t = clamp(time)
  if (t < 0.12) return { phrase: "entry", kind: "single", progress: t / 0.12, identity: "spotlight" }
  if (t < 0.68 || !exchangeAvailable) return { phrase: "readable-hold", kind: "single", progress: 1, identity: "spotlight" }
  if (t < 0.86) return { phrase: "exchange", kind: "exchange", progress: (t - 0.68) / 0.18 }
  if (t < 0.96) return { phrase: "finale-hold", kind: "single", progress: 1, identity: "finale" }
  return { phrase: "exit", kind: "exit", progress: (t - 0.96) / 0.04, identity: "finale" }
}

export function evaluateVitrine({
  items,
  config = DEFAULTS,
  intent = {},
  normalizedTime = 0,
  canvas = CANVASES["16:9"],
  runKind = "loop",
  reducedMotion = false,
  timelineMode = "automatic",
  timelineSegments = [],
  fixedDurationSeconds = 0,
} = {}) {
  const safeItems = Array.isArray(items) ? items : []
  const parameters = validateConfig(config)
  const width = Math.max(1, canvas.width)
  const height = Math.max(1, canvas.height)
  const safeCanvas = { width, height }
  const timeline = compileTimeline({ mode: timelineMode, mediaCount: safeItems.length, fixedDurationSeconds, segments: timelineSegments })
  const timelineDirection = intent.direction === "reverse" ? "reverse" : "forward"
  const rawTime = runKind === "finite" ? clamp(normalizedTime) : mod(normalizedTime, 1)
  const temporalTime = timelineDirection === "reverse" ? (runKind === "finite" ? 1 - rawTime : mod(-rawTime, 1)) : rawTime
  const sourceStates = safeItems.map((item, sourceIndex) => makeCard(item, sourceIndex, "offstage", null, cardDimensions(item, safeCanvas, parameters), temporalTime * timeline.durationSeconds))

  if (safeItems.length === 0) {
    return {
      sceneId: SCENE_ID,
      evaluatorVersion: EVALUATOR_VERSION,
      normalizedTime: rawTime,
      temporalTime,
      timelineDirection,
      runKind,
      phrase: "empty",
      count: 0,
      canvas: safeCanvas,
      currentId: null,
      incomingId: null,
      renderNodeCount: 0,
      maxObservedNodes: 2,
      compiledDurationSeconds: timeline.durationSeconds,
      placardVisible: false,
      artworkContract: { opacity: 1, filter: "none", blend: "normal" },
      sourceStates,
      renderSlots: [],
    }
  }

  const assignCard = (id, role, pose) => {
    const sourceIndex = safeItems.findIndex((item) => item.id === id)
    const item = safeItems[sourceIndex]
    const card = makeCard(item, sourceIndex, role, pose, cardDimensions(item, safeCanvas, parameters), temporalTime * timeline.durationSeconds)
    sourceStates[sourceIndex] = card
    return card
  }

  let phrase = "readable-hold"
  let currentId = safeItems[0].id
  let incomingId = null
  let transitionProgress = 0
  const renderSlots = []

  if (reducedMotion || safeItems.length === 1) {
    if (runKind === "finite") currentId = resolveFiniteIds(safeItems, intent).spotlightId
    else {
      const settledIndex = Math.floor(mod(temporalTime, 1) * safeItems.length) % safeItems.length
      currentId = safeItems[settledIndex].id
    }
    renderSlots.push(assignCard(currentId, "readable", centrePose(safeCanvas)))
    phrase = reducedMotion ? "reduced-motion-settled" : "single-still"
  } else if (runKind === "finite") {
    const { spotlightId, finaleId } = resolveFiniteIds(safeItems, intent)
    const finite = finiteState(temporalTime, spotlightId !== finaleId)
    phrase = finite.phrase
    if (finite.kind === "exchange") {
      currentId = spotlightId
      incomingId = finaleId
      transitionProgress = smootherstep(finite.progress)
      const outgoingDimensions = cardDimensions(safeItems.find((item) => item.id === spotlightId), safeCanvas, parameters)
      const incomingDimensions = cardDimensions(safeItems.find((item) => item.id === finaleId), safeCanvas, parameters)
      const poses = exchangePoses(safeCanvas, { outgoing: outgoingDimensions, incoming: incomingDimensions }, parameters, transitionProgress)
      renderSlots.push(assignCard(spotlightId, "outgoing", poses.outgoing))
      renderSlots.push(assignCard(finaleId, "incoming", poses.incoming))
    } else {
      currentId = finite.identity === "finale" ? finaleId : spotlightId
      const basePose = finite.kind === "exit"
        ? entryPose(safeCanvas, parameters, 1 - finite.progress)
        : entryPose(safeCanvas, parameters, finite.progress)
      renderSlots.push(assignCard(currentId, finite.phrase.includes("hold") ? "readable" : finite.phrase, basePose))
    }
  } else {
    const cycle = temporalTime * safeItems.length
    const logicalIndex = Math.min(safeItems.length - 1, Math.floor(cycle))
    const local = cycle - Math.floor(cycle)
    const currentIndex = logicalIndex
    const nextIndex = (currentIndex + 1) % safeItems.length
    currentId = safeItems[currentIndex].id
    const holdEnd = 0.68
    if (local < holdEnd) {
      phrase = "readable-hold"
      renderSlots.push(assignCard(currentId, "readable", centrePose(safeCanvas)))
    } else {
      phrase = "exchange"
      incomingId = safeItems[nextIndex].id
      transitionProgress = smootherstep((local - holdEnd) / (1 - holdEnd))
      const outgoingDimensions = cardDimensions(safeItems[currentIndex], safeCanvas, parameters)
      const incomingDimensions = cardDimensions(safeItems[nextIndex], safeCanvas, parameters)
      const poses = exchangePoses(safeCanvas, { outgoing: outgoingDimensions, incoming: incomingDimensions }, parameters, transitionProgress)
      renderSlots.push(assignCard(currentId, "outgoing", poses.outgoing))
      renderSlots.push(assignCard(incomingId, "incoming", poses.incoming))
    }
  }

  renderSlots.sort((a, b) => a.zOrder - b.zOrder || a.sourceIndex - b.sourceIndex)
  const placardCard = [...renderSlots].reverse().find((card) => ["readable", "incoming", "finale-hold"].includes(card.role)) ?? renderSlots.at(-1)

  return {
    sceneId: SCENE_ID,
    evaluatorVersion: EVALUATOR_VERSION,
    normalizedTime: rawTime,
    temporalTime,
    timelineDirection,
    runKind,
    phrase,
    count: safeItems.length,
    canvas: safeCanvas,
    currentId,
    incomingId,
    transitionProgress,
    renderNodeCount: renderSlots.length,
    maxObservedNodes: 2,
    compiledDurationSeconds: timeline.durationSeconds,
    placardVisible: parameters.placardVisibility && Boolean(placardCard),
    placard: parameters.placardVisibility && placardCard ? { mediaId: placardCard.id, caption: placardCard.caption } : null,
    artworkContract: { opacity: 1, filter: "none", blend: "normal" },
    sourceStates,
    renderSlots,
  }
}

export function summarize(state) {
  return {
    sceneId: state.sceneId,
    evaluatorVersion: state.evaluatorVersion,
    normalizedTime: Number(state.normalizedTime.toFixed(6)),
    temporalTime: Number(state.temporalTime.toFixed(6)),
    timelineDirection: state.timelineDirection,
    runKind: state.runKind,
    phrase: state.phrase,
    count: state.count,
    canvas: state.canvas,
    currentId: state.currentId,
    incomingId: state.incomingId,
    transitionProgress: Number(state.transitionProgress.toFixed(6)),
    renderNodeCount: state.renderNodeCount,
    maxObservedNodes: state.maxObservedNodes,
    compiledDurationSeconds: Number(state.compiledDurationSeconds.toFixed(6)),
    placardVisible: state.placardVisible,
    placard: state.placard,
    activeRoles: state.renderSlots.map((card) => ({
      id: card.id,
      role: card.role,
      x: Number(card.x.toFixed(3)),
      y: Number(card.y.toFixed(3)),
      depth: Number(card.depth.toFixed(6)),
      rotateYDeg: Number(card.rotateYDeg.toFixed(6)),
      width: Number(card.width.toFixed(3)),
      height: Number(card.height.toFixed(3)),
    })),
    artworkContract: state.artworkContract,
  }
}
