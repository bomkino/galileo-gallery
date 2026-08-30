import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import { sceneMeta, canonicalTimes, phaseBoundaries, fixtureNames, makeFixture, defaultControls, compileTimeline, evaluateScene, summarizeState, testVectorCases } from "./evaluator.mjs"
import { renderState, renderSilhouette } from "./raster.mjs"
import { writePng, compositeOver, checkerboard, compositeOverSurface, alphaDiagnostics, hashTree } from "./raster-core.mjs"

const prototypeDir = path.dirname(fileURLToPath(import.meta.url))
const sceneDir = path.dirname(prototypeDir)
const evidenceDir = path.join(sceneDir, "evidence")
fs.rmSync(evidenceDir, { recursive: true, force: true })
for (const directory of ["stills", "ratios", "fixtures", "alpha", "motion", "silhouette", "debug"]) fs.mkdirSync(path.join(evidenceDir, directory), { recursive: true })

const controls = defaultControls()
const render = ({ fixture = sceneMeta.defaultFixture, width = 1920, height = 1080, normalizedTime = 0, reducedMotion = false, debug = false, mode = "automatic", selectedIndex = 0 }) => {
  const items = makeFixture(fixture)
  const timeline = compileTimeline({ mode, itemCount: items.length, controls })
  const state = evaluateScene({ items, controls, timeline, timeMs: normalizedTime * timeline.durationMs, width, height, reducedMotion, debug, selectedIndex })
  return { items, timeline, state, surface: renderState(state, { width, height, debug }) }
}

const stillTimes = [...new Set([...canonicalTimes, ...phaseBoundaries])].sort((a, b) => a - b)
for (const time of stillTimes) {
  const { surface } = render({ normalizedTime: time })
  writePng(path.join(evidenceDir, "stills", `t-${String(Math.round(time * 1000000)).padStart(7, "0")}.png`), surface)
}

const ratios = [
  ["1920x1080", 1920, 1080], ["1080x1920", 1080, 1920], ["1080x1080", 1080, 1080], ["1080x1350", 1080, 1350]
]
for (const [name, width, height] of ratios) {
  const { surface } = render({ width, height, normalizedTime: sceneMeta.representativeTime })
  writePng(path.join(evidenceDir, "ratios", `${name}.png`), surface)
}

for (const fixture of sceneMeta.evidenceFixtures) {
  const { surface } = render({ fixture, normalizedTime: sceneMeta.representativeTime })
  writePng(path.join(evidenceDir, "fixtures", `${fixture}.png`), surface)
}

const alphaResult = render({ width: 960, height: 540, normalizedTime: sceneMeta.representativeTime })
let alpha = { supported: sceneMeta.alphaSupported, diagnostics: alphaDiagnostics(alphaResult.surface), composites: [] }
if (sceneMeta.alphaSupported) {
  const backgrounds = { black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], blue: [0, 0, 255] }
  for (const [name, color] of Object.entries(backgrounds)) {
    const composite = compositeOver(alphaResult.surface, color)
    const filename = path.join(evidenceDir, "alpha", `${name}.png`)
    writePng(filename, composite)
    alpha.composites.push(name)
  }
  const checker = compositeOverSurface(alphaResult.surface, checkerboard(960, 540, 32))
  writePng(path.join(evidenceDir, "alpha", "checkerboard.png"), checker)
  alpha.composites.push("checkerboard")
} else {
  fs.writeFileSync(path.join(evidenceDir, "alpha", "UNAVAILABLE.md"), `# Transparent output unavailable\n\n${sceneMeta.alphaConsequence}\n`)
}

const debugFrame = render({ normalizedTime: sceneMeta.debugTime, debug: true })
writePng(path.join(evidenceDir, "debug", "geometry.png"), debugFrame.surface)

const silhouetteStill = render({ width: 960, height: 540, normalizedTime: sceneMeta.representativeTime })
writePng(path.join(evidenceDir, "silhouette", "still.png"), renderSilhouette(silhouetteStill.state, { width: 960, height: 540 }))
const silhouetteFrames = 24
for (let frame = 0; frame < silhouetteFrames; frame += 1) {
  const normalizedTime = frame / silhouetteFrames
  const result = render({ width: 480, height: 270, normalizedTime })
  writePng(path.join(evidenceDir, "silhouette", `frame-${String(frame).padStart(3, "0")}.png`), renderSilhouette(result.state, { width: 480, height: 270 }))
}

const motionFrames = 48
const motionFps = 24
for (let frame = 0; frame < motionFrames; frame += 1) {
  const normalizedTime = frame / motionFrames
  const { surface } = render({ width: 480, height: 270, normalizedTime })
  writePng(path.join(evidenceDir, "motion", `frame-${String(frame).padStart(3, "0")}.png`), surface)
}

const seamStart = render({ normalizedTime: 0 }).state
const seamEnd = render({ normalizedTime: 1 }).state
const seamBefore = render({ normalizedTime: 1 - 1e-6 }).state
const seamDelta = sceneMeta.seamDelta(seamStart, seamEnd, seamBefore)

const vectors = testVectorCases.map((testCase) => {
  const localControls = { ...controls, ...(testCase.controls ?? {}) }
  const items = makeFixture(testCase.fixture)
  const timeline = compileTimeline({ mode: testCase.mode ?? "automatic", itemCount: items.length, controls: localControls })
  const state = evaluateScene({ items, controls: localControls, timeline, timeMs: testCase.normalizedTime * timeline.durationMs, width: testCase.canvas[0], height: testCase.canvas[1], reducedMotion: testCase.reducedMotion ?? false, debug: false, selectedIndex: testCase.selectedIndex ?? 0 })
  return { ...testCase, expected: summarizeState(state) }
})
const testVectors = {
  schema: "galileo-atelier-test-vectors-v1",
  schemaStatus: "atelier-local-non-runtime",
  sceneId: sceneMeta.id,
  canonicalNormalizedTimes: canonicalTimes,
  phaseBoundaries,
  vectors
}
fs.writeFileSync(path.join(sceneDir, "TEST_VECTORS.json"), `${JSON.stringify(testVectors, null, 2)}\n`)

const diagnostics = {
  sceneId: sceneMeta.id,
  generatedAt: new Date(0).toISOString(),
  captureMethod: "Dependency-free Node fixed-step rasteriser calling the same pure evaluator used by the browser prototype.",
  stillCount: stillTimes.length,
  canonicalCanvases: ratios.map(([name, width, height]) => ({ name, width, height })),
  fixtureNames,
  evidenceFixtures: sceneMeta.evidenceFixtures,
  realSpeedSequence: { frames: motionFrames, fps: motionFps, durationSeconds: motionFrames / motionFps, resolution: [480, 270], claim: "verified fixed-step frame sequence; not a recorded browser video" },
  silhouetteSequence: { frames: silhouetteFrames, fps: 12, durationSeconds: silhouetteFrames / 12, resolution: [480, 270], claim: "silhouette-only fixed-step playback evidence" },
  alpha,
  seam: { start: summarizeState(seamStart), end: summarizeState(seamEnd), before: summarizeState(seamBefore), delta: seamDelta },
  sourceTreatment: { artworkOpacity: 1, artworkFilter: "none", blendMode: "normal", generatedFixturesOnly: true },
  resources: sceneMeta.resourceObservation,
  limitations: ["No browser video recording was available in this isolated runner.", "No human visual or motion verdict is inferred from generated captures.", "Prototype evidence does not prove Product integration or export packaging."]
}
fs.writeFileSync(path.join(evidenceDir, "diagnostics.json"), `${JSON.stringify(diagnostics, null, 2)}\n`)

const command = "node prototype/capture.mjs"
const receipt = {
  sceneId: sceneMeta.id,
  command,
  result: "pass",
  evaluator: "prototype/evaluator.mjs",
  fixedStepAndPreviewShareEvaluator: true,
  generatedFixturesOnly: true,
  evidenceFilesBeforeReceipt: hashTree(evidenceDir).length,
  note: "Hashes below are recomputed after all generated evidence and this receipt are present."
}
fs.writeFileSync(path.join(evidenceDir, "CAPTURE_RECEIPT.json"), `${JSON.stringify(receipt, null, 2)}\n`)

const hashes = hashTree(evidenceDir).filter((entry) => entry.path !== "SHA256SUMS")
fs.writeFileSync(path.join(evidenceDir, "SHA256SUMS"), `${hashes.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n")}\n`)
console.log(JSON.stringify({ sceneId: sceneMeta.id, stills: stillTimes.length, motionFrames, evidenceFiles: hashes.length + 1, alpha: alpha.diagnostics, seamDelta }, null, 2))
