"use strict";

const assert = require("node:assert/strict");
const Evaluator = require("./evaluator.js");

function poseOnly(state) {
  const { storyTimeMs, ...pose } = state;
  return pose;
}

const items = Evaluator.fixtureItems(8);
const timeline = Evaluator.compile({ mediaCount: 8, paceMs: 900, direction: "forward", durationMs: 8000 });
const base = { items, parameters: Evaluator.defaults, timeline, stageWidth: 960, stageHeight: 540, reducedMotion: false };
const sample = Evaluator.evaluate({ ...base, timeMs: 2000 });
assert.deepEqual(sample, Evaluator.evaluate({ ...base, timeMs: 2000 }));
assert.deepEqual(poseOnly(Evaluator.evaluate({ ...base, timeMs: 0 })), poseOnly(Evaluator.evaluate({ ...base, timeMs: timeline.durationMs })), "two material tracks must meet an exact visual seam");
assert.equal(sample.axis, "horizontal");
assert.deepEqual(sample.laneDirection, [-1, 1], "declared directions must match screen-space motion");
assert.equal(Math.abs(sample.laneSpeedPxPerMs[0]), Math.abs(sample.laneSpeedPxPerMs[1]), "lane speed magnitudes must be identical");
assert.equal(sample.trackExtent > 0, true);
assert.ok(sample.resolvedGapPx.every((gap) => gap >= sample.requestedGapPx - 1e-9));
assert.ok(sample.frames.every((frame) => frame.opacity === 1 && frame.filter === "none"));
assert.deepEqual([...new Set(sample.frames.map((frame) => frame.lane))], [0, 1]);

const oneMillisecondLater = Evaluator.evaluate({ ...base, timeMs: 2001 });
for (const lane of [0, 1]) {
  const before = sample.frames.find((frame) => frame.visible && frame.lane === lane);
  const after = oneMillisecondLater.frames.find((frame) => frame.id === before.id);
  const actualVelocity = after.x - before.x;
  assert.ok(Math.abs(actualVelocity - sample.laneSpeedPxPerMs[lane]) < 1e-6, `lane ${lane} output speed must match actual motion`);
}

for (const target of [0, 1, 3, 6]) {
  const held = Evaluator.evaluate({ ...base, timeMs: 3210, holdSourceIndex: target });
  assert.equal(held.velocity, 0);
  const targetInstances = held.frames.filter((frame) => frame.sourceIndex === target && frame.lane === (items.length === 1 ? 0 : target % 2));
  assert.ok(targetInstances.some((frame) => Math.abs(frame.position) < 1e-8), `target ${target} must align with its lane gate`);
}

for (const count of [0, 1, 2, 3, 8, 32, 127, 256]) {
  const source = Evaluator.fixtureItems(count);
  const compiled = Evaluator.compile({ mediaCount: Math.max(1, count), direction: "reverse" });
  const state = Evaluator.evaluate({ items: source, parameters: Evaluator.defaults, timeline: compiled, timeMs: compiled.durationMs * 0.37, stageWidth: 540, stageHeight: 960, reducedMotion: false });
  assert.equal(state.axis, "vertical");
  assert.ok(state.frames.length <= Math.max(0, count) * 96, "virtual instances must remain bounded");
  if (count) {
    assert.ok(state.frames.some((frame) => frame.visible));
    assert.deepEqual(state.laneDirection, [1, -1]);
    assert.equal(Math.abs(state.laneSpeedPxPerMs[0]), Math.abs(state.laneSpeedPxPerMs[1]));
  }
}

const one = Evaluator.evaluate({ items: Evaluator.fixtureItems(1), parameters: Evaluator.defaults, timeline: Evaluator.compile({ mediaCount: 1, durationMs: 8000 }), timeMs: 1000, stageWidth: 960, stageHeight: 540, reducedMotion: false });
assert.deepEqual([...new Set(one.frames.map((frame) => frame.lane))], [0, 1]);
assert.deepEqual([...new Set(one.frames.map((frame) => frame.sourceId))], ["strip-01"], "one source may create two render instances without inventing media identity");
const two = Evaluator.evaluate({ items: Evaluator.fixtureItems(2), parameters: Evaluator.defaults, timeline: Evaluator.compile({ mediaCount: 2, durationMs: 8000 }), timeMs: 1000, stageWidth: 960, stageHeight: 540, reducedMotion: false });
assert.ok(two.frames.filter((frame) => frame.lane === 0).every((frame) => frame.sourceIndex === 0));
assert.ok(two.frames.filter((frame) => frame.lane === 1).every((frame) => frame.sourceIndex === 1));

const changed = {
  frameScale: Evaluator.evaluate({ ...base, timeMs: 2000, parameters: { ...Evaluator.defaults, frameScale: 0.20 } }),
  gap: Evaluator.evaluate({ ...base, timeMs: 2000, parameters: { ...Evaluator.defaults, gap: 120 } }),
  laneSeparation: Evaluator.evaluate({ ...base, timeMs: 2000, parameters: { ...Evaluator.defaults, laneSeparation: 0.55 } }),
  lanePhase: Evaluator.evaluate({ ...base, timeMs: 2000, parameters: { ...Evaluator.defaults, lanePhase: 0.20 } }),
};
assert.notDeepEqual(changed.frameScale.frames.map((frame) => frame.width), sample.frames.map((frame) => frame.width));
assert.notEqual(changed.gap.trackExtent, sample.trackExtent);
assert.notDeepEqual(changed.laneSeparation.laneCenters, sample.laneCenters);
assert.notDeepEqual(changed.lanePhase.frames.filter((frame) => frame.lane === 1).map((frame) => frame.position), sample.frames.filter((frame) => frame.lane === 1).map((frame) => frame.position));
const reduced = Evaluator.evaluate({ ...base, timeMs: 3210, reducedMotion: true });
assert.equal(reduced.velocity, 0);
assert.ok(reduced.laneSpeedPxPerMs.every((value) => Math.abs(value) === 0));
assert.equal(Evaluator.evaluate({ ...base, timeMs: timeline.durationMs + 77 }).storyTimeMs, timeline.durationMs + 77);

console.log(JSON.stringify({
  scene: "filmstrip-river",
  pass: true,
  lanes: 2,
  counterFlow: true,
  equalRealSpeed: true,
  directionMetadata: "verified",
}));
