"use strict";

const assert = require("node:assert/strict");
const Evaluator = require("./evaluator.js");

function poseOnly(state) {
  const { storyTimeMs, ...pose } = state;
  return pose;
}

function rounded(value) {
  if (Array.isArray(value)) return value.map(rounded);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rounded(item)]));
  return typeof value === "number" ? Math.round(value * 1e9) / 1e9 : value;
}

const items = Evaluator.fixtureItems(8);
const timeline = Evaluator.compile({ mediaCount: 8, paceMs: 950, direction: "forward", durationMs: 8000 });
const base = { items, parameters: Evaluator.defaults, timeline, stageWidth: 960, stageHeight: 540, reducedMotion: false };
const sample = Evaluator.evaluate({ ...base, timeMs: 1040 });
assert.deepEqual(sample, Evaluator.evaluate({ ...base, timeMs: 1040 }));
assert.deepEqual(poseOnly(Evaluator.evaluate({ ...base, timeMs: 0 })), poseOnly(Evaluator.evaluate({ ...base, timeMs: timeline.durationMs })), "closed wave pose must be exact at the seam");
assert.equal(sample.path.closed, true);
assert.equal(sample.path.derivativeContinuous, true);
assert.ok(Number.isInteger(sample.path.waveCount) && sample.path.waveCount >= 1);
assert.ok(Math.abs(sample.path.extent / sample.path.wavelength - sample.path.waveCount) < 1e-10, "track extent must contain an integer wavelength count");
assert.ok(sample.path.resolvedGapPx >= sample.path.requestedGapPx);
assert.ok(sample.frames.every((frame) => frame.opacity === 1 && frame.filter === "none" && Math.abs(frame.rotation) <= 10));

const epsilonMs = 0.5;
const before = Evaluator.evaluate({ ...base, timeMs: timeline.durationMs - epsilonMs }).frames[0];
const at = Evaluator.evaluate({ ...base, timeMs: 0 }).frames[0];
const after = Evaluator.evaluate({ ...base, timeMs: epsilonMs }).frames[0];
const beforeVelocity = { x: (at.x - before.x) / epsilonMs, y: (at.y - before.y) / epsilonMs, rotation: (at.rotation - before.rotation) / epsilonMs };
const afterVelocity = { x: (after.x - at.x) / epsilonMs, y: (after.y - at.y) / epsilonMs, rotation: (after.rotation - at.rotation) / epsilonMs };
assert.ok(Math.abs(beforeVelocity.x - afterVelocity.x) < 0.01, "wave x velocity must be continuous at the seam");
assert.ok(Math.abs(beforeVelocity.y - afterVelocity.y) < 0.01, "wave path derivative must be continuous at the seam");
assert.ok(Math.abs(beforeVelocity.rotation - afterVelocity.rotation) < 0.01, "tangent-follow rotation must not snap at the seam");

for (const count of [0, 1, 2, 8, 32, 127, 256]) {
  const source = Evaluator.fixtureItems(count);
  const compiled = Evaluator.compile({ mediaCount: Math.max(1, count), direction: "reverse" });
  const state = Evaluator.evaluate({ items: source, parameters: Evaluator.defaults, timeline: compiled, timeMs: compiled.durationMs * 0.37, stageWidth: 540, stageHeight: 960, reducedMotion: false });
  assert.equal(state.axis, "vertical");
  if (!count) assert.equal(state.frames.length, 0);
  else {
    assert.ok(state.frames.length >= count && state.frames.length <= count * 48);
    assert.ok(state.frames.some((frame) => frame.visible));
  }
}

const changed = {
  frameScale: Evaluator.evaluate({ ...base, timeMs: 1040, parameters: { ...Evaluator.defaults, frameScale: 0.18 } }),
  gap: Evaluator.evaluate({ ...base, timeMs: 1040, parameters: { ...Evaluator.defaults, gap: 140 } }),
  amplitude: Evaluator.evaluate({ ...base, timeMs: 1040, parameters: { ...Evaluator.defaults, amplitude: 0.08 } }),
  wavelength: Evaluator.evaluate({ ...base, timeMs: 1040, parameters: { ...Evaluator.defaults, wavelength: 0.70 } }),
  tangent: Evaluator.evaluate({ ...base, timeMs: 1040, parameters: { ...Evaluator.defaults, tangentInfluence: 0.40 } }),
};
assert.notDeepEqual(changed.frameScale.frames.map((frame) => frame.width), sample.frames.map((frame) => frame.width));
assert.notEqual(changed.gap.path.resolvedGapPx, sample.path.resolvedGapPx);
assert.notEqual(changed.amplitude.path.amplitude, sample.path.amplitude);
assert.notEqual(changed.wavelength.path.wavelength, sample.path.wavelength);
assert.notDeepEqual(changed.tangent.frames.map((frame) => frame.rotation), sample.frames.map((frame) => frame.rotation));

const held = Evaluator.evaluate({ ...base, timeMs: 3210, holdSourceIndex: 3 });
assert.equal(held.velocity, 0);
assert.ok(held.frames.filter((frame) => frame.sourceIndex === 3).some((frame) => Math.abs(frame.position) < 1e-8));
const reduced = Evaluator.evaluate({ ...base, timeMs: 3210, reducedMotion: true });
assert.equal(reduced.velocity, 0);
const forward = Evaluator.evaluate({ ...base, timeMs: 1937 });
const reverse = Evaluator.evaluate({ ...base, timeMs: timeline.durationMs - 1937, timeline: { ...timeline, direction: "reverse" } });
assert.deepEqual(rounded(forward.frames), rounded(reverse.frames));
assert.equal(Evaluator.evaluate({ ...base, timeMs: timeline.durationMs + 77 }).storyTimeMs, timeline.durationMs + 77);

console.log(JSON.stringify({
  scene: "wave-ticker",
  pass: true,
  seam: "C1-position-and-tangent",
  path: "integer-wavelength-closure",
  randomBob: false,
}));
