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
const timeline = Evaluator.compile({ mediaCount: 8, paceMs: 1050, direction: "forward", durationMs: 8400 });
const base = { items, parameters: Evaluator.defaults, timeline, stageWidth: 960, stageHeight: 540, reducedMotion: false };
const sample = Evaluator.evaluate({ ...base, timeMs: 2140 });
assert.deepEqual(sample, Evaluator.evaluate({ ...base, timeMs: 2140 }), "equal inputs must be deterministic");
assert.deepEqual(poseOnly(Evaluator.evaluate({ ...base, timeMs: 0 })), poseOnly(Evaluator.evaluate({ ...base, timeMs: timeline.durationMs })), "closed visual seam must be exact");
assert.equal(sample.camera.fixed, true);
assert.equal(sample.path.closed, true);
assert.equal(sample.path.continuous, true);
assert.ok(sample.path.arcLength > 0);
assert.ok(sample.frames.every((frame) => frame.yaw === 0), "camera-facing artwork must not inherit corridor yaw");
assert.ok(sample.frames.every((frame) => frame.opacity === 1 && frame.filter === "none"));
assert.ok(sample.frames.every((frame) => [frame.worldX, frame.worldZ, frame.x, frame.y, frame.width, frame.height].every(Number.isFinite)));

const seamEpsilonMs = 0.5;
const before = Evaluator.evaluate({ ...base, timeMs: timeline.durationMs - seamEpsilonMs }).frames[0];
const at = Evaluator.evaluate({ ...base, timeMs: 0 }).frames[0];
const after = Evaluator.evaluate({ ...base, timeMs: seamEpsilonMs }).frames[0];
const beforeSpeed = Math.hypot(at.worldX - before.worldX, at.worldZ - before.worldZ) / seamEpsilonMs;
const afterSpeed = Math.hypot(after.worldX - at.worldX, after.worldZ - at.worldZ) / seamEpsilonMs;
assert.ok(Math.hypot(after.worldX - before.worldX, after.worldZ - before.worldZ) < sample.path.worldSpeed * seamEpsilonMs * 2.2, "hidden far return must not teleport at the seam");
assert.ok(Math.abs(beforeSpeed - afterSpeed) / Math.max(beforeSpeed, afterSpeed) < 0.05, "seam speed must remain continuous");

const canonical = Evaluator.evaluate({ ...base, timeMs: 0 });
const pathFractions = canonical.frames.map((frame) => frame.pathDistance).sort((a, b) => a - b);
const arcSteps = pathFractions.map((value, index) => pathFractions[(index + 1) % pathFractions.length] + (index === pathFractions.length - 1 ? 1 : 0) - value);
assert.ok(arcSteps.every((step) => Math.abs(step - 1 / items.length) < 1e-12), "ordered sources must be equally spaced by world arc length");
const visible = canonical.frames.filter((frame) => frame.visible);
assert.ok(visible.some((frame) => frame.region === "approach"));
assert.ok(visible.some((frame) => frame.region === "recede"));
assert.ok(visible.every((frame) => frame.worldZ > canonical.camera.nearPlane && frame.worldZ <= canonical.camera.visibleDepth));
assert.ok(visible.filter((frame) => frame.worldZ < 3.2).every((frame) => Math.abs(frame.x - 480) > 260), "near passage must clear the camera centre");

const sourceZeroSamples = [];
for (let index = 0; index <= 400; index += 1) {
  const state = Evaluator.evaluate({ ...base, timeMs: timeline.durationMs * index / 400 });
  const frame = state.frames[0];
  sourceZeroSamples.push([frame.worldX, frame.worldZ]);
}
const steps = sourceZeroSamples.slice(1).map((point, index) => Math.hypot(point[0] - sourceZeroSamples[index][0], point[1] - sourceZeroSamples[index][1]));
const meanStep = steps.reduce((sum, value) => sum + value, 0) / steps.length;
assert.ok(Math.max(...steps) < meanStep * 1.15, "no hidden path join may create an arc-length outlier");
assert.ok(Math.min(...steps) > meanStep * 0.85, "arc-length travel must not stall at authored joins");

for (const count of [0, 1, 2, 8, 24, 64, 127, 256]) {
  const source = Evaluator.fixtureItems(count);
  const compiled = Evaluator.compile({ mediaCount: Math.max(1, count), direction: "reverse" });
  const state = Evaluator.evaluate({ items: source, parameters: Evaluator.defaults, timeline: compiled, timeMs: compiled.durationMs * 0.37, stageWidth: 540, stageHeight: 960, reducedMotion: false });
  assert.equal(state.frames.length, count);
  assert.ok(state.frames.every((frame) => [frame.x, frame.y, frame.worldX, frame.worldZ].every(Number.isFinite)));
}

const changed = {
  frameScale: Evaluator.evaluate({ ...base, timeMs: 0, parameters: { ...Evaluator.defaults, frameScale: 0.21 } }),
  depthSpacing: Evaluator.evaluate({ ...base, timeMs: 0, parameters: { ...Evaluator.defaults, depthSpacing: 1.35 } }),
  laneSpread: Evaluator.evaluate({ ...base, timeMs: 0, parameters: { ...Evaluator.defaults, laneSpread: 3.8 } }),
  nearPass: Evaluator.evaluate({ ...base, timeMs: 0, parameters: { ...Evaluator.defaults, nearPass: 1.2 } }),
  visibleDepth: Evaluator.evaluate({ ...base, timeMs: 0, parameters: { ...Evaluator.defaults, visibleDepth: 7 } }),
};
assert.notDeepEqual(changed.frameScale.frames.map((frame) => frame.width), canonical.frames.map((frame) => frame.width));
assert.notEqual(changed.depthSpacing.path.arcLength, canonical.path.arcLength);
assert.notDeepEqual(changed.laneSpread.frames.map((frame) => frame.worldX), canonical.frames.map((frame) => frame.worldX));
assert.notDeepEqual(changed.nearPass.frames.map((frame) => frame.worldX), canonical.frames.map((frame) => frame.worldX));
assert.notEqual(changed.visibleDepth.frames.filter((frame) => frame.visible).length, canonical.frames.filter((frame) => frame.visible).length);

const reduced = Evaluator.evaluate({ ...base, timeMs: 3210, reducedMotion: true });
assert.equal(reduced.velocity, 0);
const forward = Evaluator.evaluate({ ...base, timeMs: 1937 });
const reverse = Evaluator.evaluate({ ...base, timeMs: timeline.durationMs - 1937, timeline: { ...timeline, direction: "reverse" } });
assert.deepEqual(rounded(forward.frames), rounded(reverse.frames), "reverse must traverse the same fixed world in the opposite temporal direction");

console.log(JSON.stringify({
  scene: "deck-river",
  pass: true,
  seam: "continuous-arc-length",
  camera: "fixed",
  hiddenTeleports: 0,
  yaw: 0,
}));
