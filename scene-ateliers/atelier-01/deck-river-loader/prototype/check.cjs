"use strict";

const assert = require("node:assert/strict");
const Evaluator = require("./evaluator.js");

const items = Evaluator.fixtureItems(8);
const timeline = Evaluator.compile({ items, mode: "automatic", direction: "forward" });
const base = { items, parameters: Evaluator.defaults, timeline, stageWidth: 960, stageHeight: 540, reducedMotion: false };
const duration = timeline.durationMs;
const sample = Evaluator.evaluate({ ...base, timeMs: duration * 0.60 });
assert.deepEqual(sample, Evaluator.evaluate({ ...base, timeMs: duration * 0.60 }), "equal finite inputs must be deterministic");
const start = Evaluator.evaluate({ ...base, timeMs: 0 });
const end = Evaluator.evaluate({ ...base, timeMs: duration });
assert.notDeepEqual(start.frames, end.frames, "finite Chapter Reveal must not masquerade as a loop");
assert.equal(end.stage, "composed-takeover");
assert.equal(sample.storyTimeMs, duration * 0.60);
assert.ok(sample.frames.every((frame) => frame.opacity === 1 && frame.filter === "none"));
assert.equal(timeline.targetSourceIndex, 7);
assert.equal(timeline.visualSkipLandmarkMs, Math.round(duration * timeline.landmarks.corridorEnd));
assert.throws(() => Evaluator.compile({ items, mode: "fixed-duration", durationMs: Evaluator.minimumDurationMs - 1 }), /duration/);
assert.throws(() => Evaluator.compile({ items, mode: "directed", segmentDurationsMs: { entry: 100 } }), /duration/);

const directedSegments = { entry: 600, corridor: 2400, acquire: 700, arrival: 1000, hold: 800, takeover: 500 };
const directed = Evaluator.compile({ items, mode: "directed", direction: "reverse", targetSourceIndex: 3, segmentDurationsMs: directedSegments });
assert.equal(directed.durationMs, 6000);
assert.equal(directed.targetSourceIndex, 3);
assert.deepEqual(directed.segmentDurationsMs, directedSegments);
const orderedLandmarks = [directed.landmarks.entryEnd, directed.landmarks.corridorEnd, directed.landmarks.acquireEnd, directed.landmarks.arrivalEnd, directed.landmarks.holdEnd, directed.landmarks.exitEnd];
assert.ok(orderedLandmarks.every((value, index) => index === 0 || value > orderedLandmarks[index - 1]));
assert.equal(orderedLandmarks.at(-1), 1);

const acquireTime = duration * timeline.landmarks.acquireEnd;
function targetAt(offsetMs) {
  return Evaluator.evaluate({ ...base, timeMs: acquireTime + offsetMs }).frames[timeline.targetSourceIndex];
}
const beforeTwo = targetAt(-2);
const beforeOne = targetAt(-1);
const afterOne = targetAt(1);
const afterTwo = targetAt(2);
for (const property of ["x", "y", "width", "height"]) {
  const velocityBefore = beforeOne[property] - beforeTwo[property];
  const velocityAfter = afterTwo[property] - afterOne[property];
  const scale = Math.max(0.001, Math.abs(velocityBefore), Math.abs(velocityAfter));
  assert.ok(Math.abs(velocityBefore - velocityAfter) / scale < 0.08, `${property} momentum must survive target acquire`);
}

const targetFirstTimeline = Evaluator.compile({ items, mode: "fixed-duration", durationMs: 12000, targetSourceIndex: 0 });
const targetFirstBase = { ...base, timeline: targetFirstTimeline };
const acquire = targetFirstTimeline.landmarks.acquireEnd;
const justBeforeAcquire = Evaluator.evaluate({ ...targetFirstBase, timeMs: targetFirstTimeline.durationMs * (acquire - 1e-6) });
const justAfterAcquire = Evaluator.evaluate({ ...targetFirstBase, timeMs: targetFirstTimeline.durationMs * (acquire + 1e-6) });
assert.deepEqual(
  justAfterAcquire.frames.filter((frame) => frame.visible).map((frame) => frame.sourceIndex),
  justBeforeAcquire.frames.filter((frame) => frame.visible).map((frame) => frame.sourceIndex),
  "supporting frames must not be deleted at acquire",
);
const atArrival = Evaluator.evaluate({ ...targetFirstBase, timeMs: targetFirstTimeline.durationMs * targetFirstTimeline.landmarks.arrivalEnd });
assert.deepEqual(atArrival.frames.filter((frame) => frame.visible).map((frame) => frame.sourceIndex), [0], "supporting frames must clear physically before the arrival hold");
assert.ok(atArrival.frames.slice(1).every((frame) => frame.role === "cleared-corridor"));

for (const boundary of [timeline.landmarks.acquireEnd, timeline.landmarks.arrivalEnd, timeline.landmarks.holdEnd]) {
  const before = Evaluator.evaluate({ ...base, timeMs: duration * (boundary - 1e-6) }).frames[timeline.targetSourceIndex];
  const after = Evaluator.evaluate({ ...base, timeMs: duration * (boundary + 1e-6) }).frames[timeline.targetSourceIndex];
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 0.5, "target position must remain continuous at every phrase boundary");
  assert.ok(Math.abs(after.width - before.width) < 0.5 && Math.abs(after.height - before.height) < 0.5, "target size must remain continuous at every phrase boundary");
}

const holdOne = Evaluator.evaluate({ ...base, timeMs: duration * (timeline.landmarks.arrivalEnd + 0.01) });
const holdTwo = Evaluator.evaluate({ ...base, timeMs: duration * (timeline.landmarks.holdEnd - 0.01) });
const heldTargetOne = holdOne.frames[timeline.targetSourceIndex];
const heldTargetTwo = holdTwo.frames[timeline.targetSourceIndex];
assert.deepEqual(
  [heldTargetOne.x, heldTargetOne.y, heldTargetOne.width, heldTargetOne.height],
  [heldTargetTwo.x, heldTargetTwo.y, heldTargetTwo.width, heldTargetTwo.height],
  "visual hold must freeze geometry",
);
assert.notEqual(holdOne.storyTimeMs, holdTwo.storyTimeMs, "global source-video story time must continue through the visual hold");
assert.equal(holdOne.velocity, 0);

const corridor = Evaluator.evaluate({ ...base, timeMs: duration * 0.54 });
const controlVariants = {
  frameScale: Evaluator.evaluate({ ...base, timeMs: duration * 0.54, parameters: { ...Evaluator.defaults, frameScale: 0.18 } }),
  depthSpacing: Evaluator.evaluate({ ...base, timeMs: duration * 0.54, parameters: { ...Evaluator.defaults, depthSpacing: 1.35 } }),
  laneSpread: Evaluator.evaluate({ ...base, timeMs: duration * 0.54, parameters: { ...Evaluator.defaults, laneSpread: 4 } }),
  nearPass: Evaluator.evaluate({ ...base, timeMs: duration * 0.70, parameters: { ...Evaluator.defaults, nearPass: 1.1 } }),
  arrivalScale: Evaluator.evaluate({ ...base, timeMs: duration * 0.90, parameters: { ...Evaluator.defaults, arrivalScale: 0.50 } }),
};
assert.notDeepEqual(controlVariants.frameScale.frames.map((frame) => frame.width), corridor.frames.map((frame) => frame.width));
assert.notDeepEqual(controlVariants.depthSpacing.frames.map((frame) => frame.worldZ), corridor.frames.map((frame) => frame.worldZ));
assert.notDeepEqual(controlVariants.laneSpread.frames.map((frame) => frame.worldX), corridor.frames.map((frame) => frame.worldX));
assert.notEqual(controlVariants.nearPass.frames[timeline.targetSourceIndex].x, Evaluator.evaluate({ ...base, timeMs: duration * 0.70 }).frames[timeline.targetSourceIndex].x);
assert.notEqual(controlVariants.arrivalScale.frames[timeline.targetSourceIndex].width, Evaluator.evaluate({ ...base, timeMs: duration * 0.90 }).frames[timeline.targetSourceIndex].width);

for (const count of [0, 1, 2, 8, 32, 127, 256]) {
  const source = Evaluator.fixtureItems(count);
  const compiled = Evaluator.compile({ items: source, mode: "fixed-duration", durationMs: 12000, direction: "reverse", targetSourceIndex: count ? 0 : undefined });
  const state = Evaluator.evaluate({ items: source, parameters: Evaluator.defaults, timeline: compiled, timeMs: 7440, stageWidth: 540, stageHeight: 960, reducedMotion: false });
  assert.equal(state.frames.length, count);
  assert.equal(compiled.durationMs, 12000);
  if (count) assert.equal(state.targetSourceIndex, 0);
}

const reverseTimeline = Evaluator.compile({ items, mode: "automatic", direction: "reverse" });
const reverse = Evaluator.evaluate({ ...base, timeline: reverseTimeline, timeMs: duration * 0.62 });
const forward = Evaluator.evaluate({ ...base, timeMs: duration * 0.62 });
assert.equal(Math.sign(reverse.frames[7].x - 480), -Math.sign(forward.frames[7].x - 480), "reverse mirrors corridor side without reversing phrase order");
const reduced = Evaluator.evaluate({ ...base, timeMs: duration * 0.20, reducedMotion: true });
assert.equal(reduced.stage, "reduced-arrival");
assert.equal(reduced.velocity, 0);
assert.equal(reduced.frames.filter((frame) => frame.visible).length, 1);
const beyondEnd = Evaluator.evaluate({ ...base, timeMs: duration + 5000 });
assert.equal(beyondEnd.normalizedTime, 1);
assert.equal(beyondEnd.storyTimeMs, duration + 5000);
assert.deepEqual(beyondEnd.frames, end.frames, "finite visual pose clamps while global story time remains truthful");

console.log(JSON.stringify({
  scene: "deck-river-loader",
  pass: true,
  finite: true,
  momentum: "position-and-size-matched",
  supportingFrames: "physically-cleared",
  directedSegments: "validated",
}));
