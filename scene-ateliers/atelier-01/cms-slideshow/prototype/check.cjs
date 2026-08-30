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
const timeline = Evaluator.compile({ mediaCount: items.length, paceMs: 1000, direction: "forward", durationMs: 8000 });
const base = {
  items,
  parameters: Evaluator.defaults,
  timeline,
  stageWidth: 960,
  stageHeight: 540,
  axis: "horizontal",
  reducedMotion: false,
  fitIntent: "contain",
};

const sample = Evaluator.evaluate({ ...base, timeMs: 2960 });
assert.deepEqual(sample, Evaluator.evaluate({ ...base, timeMs: 2960 }), "equal inputs must be deterministic");
assert.deepEqual(
  poseOnly(Evaluator.evaluate({ ...base, timeMs: 0 })),
  poseOnly(Evaluator.evaluate({ ...base, timeMs: timeline.durationMs })),
  "the closed pose must be exact at the seam while global story time remains truthful",
);
assert.equal(Evaluator.evaluate({ ...base, timeMs: timeline.durationMs + 123 }).storyTimeMs, timeline.durationMs + 123);
assert.deepEqual(
  poseOnly(Evaluator.evaluate({ ...base, timeMs: 123 })),
  poseOnly(Evaluator.evaluate({ ...base, timeMs: timeline.durationMs + 123 })),
  "visual loop time may wrap; source-video story time may not",
);
assert.equal(sample.render.artworkOpacity, 1);
assert.equal(sample.render.artworkFilter, "none");
assert.equal(sample.render.artworkBlendMode, "normal");
assert.equal(sample.render.fit, "contain");
assert.ok(sample.frames.every((frame) => frame.opacity === 1 && frame.filter === "none"));
assert.ok(sample.frames.every((frame) => [frame.x, frame.y, frame.width, frame.height, frame.scale].every(Number.isFinite)));

for (const count of [0, 1, 2, 8, 32, 127, 256]) {
  const source = Evaluator.fixtureItems(count);
  const compiled = Evaluator.compile({ mediaCount: Math.max(1, count), paceMs: 800, direction: "reverse" });
  const state = Evaluator.evaluate({
    items: source,
    parameters: Evaluator.defaults,
    timeline: compiled,
    timeMs: compiled.durationMs * 0.37,
    stageWidth: 640,
    stageHeight: 800,
    axis: "vertical",
    reducedMotion: false,
    fitIntent: "contain",
  });
  assert.equal(state.frames.length, count);
  assert.equal(state.axis, "vertical");
  assert.ok(state.frames.every((frame) => frame.sourceIndex >= 0 && frame.sourceIndex < count));
}

const smallerFrames = Evaluator.evaluate({ ...base, timeMs: 2960, parameters: { ...Evaluator.defaults, frameScale: 0.44 } });
assert.notDeepEqual(smallerFrames.frames.map((frame) => frame.height), sample.frames.map((frame) => frame.height), "frame scale must alter geometry");
const widerGap = Evaluator.evaluate({ ...base, timeMs: 2960, parameters: { ...Evaluator.defaults, gap: 122 } });
assert.notEqual(widerGap.geometry.loopExtent, sample.geometry.loopExtent, "minimum gap must alter the compiled track");
assert.ok(widerGap.geometry.resolvedGapPx >= widerGap.geometry.requestedGapPx, "sparse-track slack must never violate the requested minimum gap");
const deeperFocus = Evaluator.evaluate({ ...base, timeMs: 2960, parameters: { ...Evaluator.defaults, focusDepth: 0.20 } });
assert.notDeepEqual(deeperFocus.frames.map((frame) => frame.scale), sample.frames.map((frame) => frame.scale), "focus depth must alter geometric scale only");

const mediaCover = Evaluator.evaluate({ ...base, timeMs: 2960, fitIntent: "cover" });
assert.equal(mediaCover.render.fit, "cover", "deliberate media fit remains possible");
assert.deepEqual(mediaCover.frames, sample.frames, "media fit is not a Scene-geometry control in the v2 candidate");

const reduced = Evaluator.evaluate({ ...base, timeMs: 3210, reducedMotion: true });
assert.equal(reduced.velocity, 0);
assert.equal(reduced.phase * items.length, Math.round(reduced.phase * items.length), "reduced motion must use source landmarks");
const forward = Evaluator.evaluate({ ...base, timeMs: 1937 });
const reverse = Evaluator.evaluate({ ...base, timeMs: timeline.durationMs - 1937, timeline: { ...timeline, direction: "reverse" } });
assert.deepEqual(rounded(forward.frames), rounded(reverse.frames), "reverse at complementary story time must preserve the same physical track pose");

console.log(JSON.stringify({
  scene: "quiet-carousel",
  pass: true,
  controlsTested: 3,
  fitOwner: "media-intent",
  seam: "exact-visual",
  storyTime: "unwrapped",
}));
