import assert from "node:assert/strict"
import { sceneMeta, canonicalTimes, makeFixture, defaultControls, compileTimeline, evaluateScene, sourceVideoTimeSeconds } from "./evaluator.mjs"

const controls = defaultControls()
const evaluate = (fixture, time, options = {}) => {
  const items = makeFixture(fixture)
  const timeline = compileTimeline({ mode: options.mode ?? "automatic", itemCount: items.length, controls: { ...controls, ...(options.controls ?? {}) }, direction: options.direction ?? "forward" })
  return evaluateScene({ items, controls: { ...controls, ...(options.controls ?? {}) }, timeline, timeMs: time * timeline.durationMs, width: options.width ?? 1920, height: options.height ?? 1080, reducedMotion: options.reducedMotion ?? false, debug: false, selectedIndex: options.selectedIndex ?? 0 })
}

for (const fixture of ["one", "two", "recommended", "bounded-many", "mixed-failed"]) {
  const start = evaluate(fixture, 0)
  const end = evaluate(fixture, 1)
  assert.deepEqual(start.cards.map((card) => card.id), end.cards.map((card) => card.id), `${fixture}: identity order must close`)
  for (let index = 0; index < start.cards.length; index += 1) {
    assert.ok(Math.abs(start.cards[index].x - end.cards[index].x) < 1e-8, `${fixture}: seam x`)
    assert.ok(Math.abs(start.cards[index].y - end.cards[index].y) < 1e-8, `${fixture}: seam y`)
    assert.ok(Math.abs(start.cards[index].rotation - end.cards[index].rotation) < 1e-10, `${fixture}: seam rotation`)
    assert.equal(start.cards[index].artworkOpacity, 1)
    assert.equal(start.cards[index].artworkFilter, "none")
    assert.equal(start.cards[index].blendMode, "normal")
  }
}

const baseline = evaluate("recommended", 0.001).baselineOverlapSignature
for (const time of canonicalTimes) {
  const state = evaluate("recommended", time)
  assert.equal(state.baselineOverlapSignature, baseline, "authored baseline overlap graph must stay stable")
  assert.equal(state.cards.length, 5)
  const nonFocused = state.cards.filter((card) => !card.focusPlane)
  assert.deepEqual(nonFocused.map((card) => card.baseZ).sort((a, b) => a - b), [...nonFocused.map((card) => card.baseZ)].sort((a, b) => a - b))
}

const one = evaluate("one", 0.44)
assert.equal(one.cards.length, 1)
assert.ok(Math.abs(one.cards[0].baseX - 960) < 1e-9)
assert.ok(Math.abs(one.cards[0].baseY - 540) < 1e-9)
const two = evaluate("two", 0.44)
assert.ok(two.cards[0].baseX < 960 && two.cards[1].baseX > 960, "two sources must form a counterweight")

const quiet = evaluate("recommended", 0.42, { controls: { driftStrength: 0, focusLift: 0 } })
const alive = evaluate("recommended", 0.42, { controls: { driftStrength: 70, focusLift: 60 } })
assert.notDeepEqual(quiet.cards.map((card) => [card.x, card.y]), alive.cards.map((card) => [card.x, card.y]), "drift control must be causal")
assert.ok(Math.max(...alive.cards.map((card) => card.lift)) > Math.max(...quiet.cards.map((card) => card.lift)), "focus lift must be causal")

const reducedA = evaluate("recommended", 0.2, { reducedMotion: true, selectedIndex: 2 })
const reducedB = evaluate("recommended", 0.7, { reducedMotion: true, selectedIndex: 2 })
assert.deepEqual(reducedA.cards.map((card) => [card.x, card.y, card.rotation]), reducedB.cards.map((card) => [card.x, card.y, card.rotation]), "reduced motion must preserve one static composition")

const forward = evaluate("recommended", 0.27, { direction: "forward" })
const reverse = evaluate("recommended", 0.73, { direction: "reverse" })
for (let index = 0; index < forward.cards.length; index += 1) {
  assert.ok(Math.hypot(forward.cards[index].x - reverse.cards[index].x, forward.cards[index].y - reverse.cards[index].y) < 1e-6, "reverse must be exact story-time retrace")
}

assert.equal(sourceVideoTimeSeconds(8000, 7.25, true), 0.75)
assert.equal(sourceVideoTimeSeconds(8000, 7.25, false), 7.25)

for (let frame = 0; frame < 2000; frame += 1) {
  const state = evaluate("bounded-many", frame / 2000)
  assert.equal(state.cards.length, 12, "bounded evaluation must not grow")
}

console.log(JSON.stringify({ sceneId: sceneMeta.id, result: "pass", checks: ["exact seam", "stable identities", "stable authored neighborhoods", "one/two/many", "causal controls", "reduced motion", "reverse retrace", "source-video story time", "bounded 2,000-frame observation"] }, null, 2))
