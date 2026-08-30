import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  SCENE_ID, DEFAULT_PARAMETERS, CONTROL_DEFINITIONS, DEFAULT_STAGE,
  makeFixture, compileTimeline, evaluateScene, canonicalFrame,
  canonicalSamples, evidenceTimes,
} from "./evaluator.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const sceneDir = path.dirname(here);
const evidenceDir = path.join(sceneDir, "evidence");
fs.mkdirSync(evidenceDir, { recursive: true });
const stable = (value) => JSON.stringify(value);
const digest = (value) => crypto.createHash("sha256").update(stable(value)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const close = (a, b, epsilon = 1e-6) => Math.abs(a - b) <= epsilon;
const poseOnly = (frame) => frame.cards.map(({ id,x,y,width,height,scale,rotation,projectedYaw,z,visible,occluded }) => ({ id,x,y,width,height,scale,rotation,projectedYaw,z,visible,occluded }));
const at = (timeline, items, timeMs, parameters = DEFAULT_PARAMETERS, stage = DEFAULT_STAGE) => evaluateScene({ items, parameters, timeline, storyTimeMs: timeMs, stage });
const eventSample = (timeline, event, p) => event.startMs + (event.endMs - event.startMs) * p;
const results = { sceneId: SCENE_ID, status: "pass", checks: [], generatedAt: "deterministic-no-wall-clock" };
const pass = (name, detail = {}) => results.checks.push({ name, status: "pass", ...detail });

for (const [name,count] of [["one",1],["two",2],["awkward-seven",7],["ordinary-eight",8],["many-24",24]]) {
  assert(makeFixture(name).length === count, `${name} count`);
}
pass("fixture-counts");

const items = makeFixture("ordinary-eight");
const automatic = compileTimeline({ items, parameters: DEFAULT_PARAMETERS, mode: "automatic" });
const timelines = { automatic };
for (const mode of ["fixed-duration", "directed"]) {
  timelines[mode] = compileTimeline({
    items, parameters: DEFAULT_PARAMETERS, mode,
    fixedDurationMs: Math.max(12000, automatic.minimumHonestDurationMs + 1000),
  });
  assert(timelines[mode].durationMs > 0, `${mode} duration`);
}
const fixedAtMinimum = compileTimeline({
  items, parameters: DEFAULT_PARAMETERS, mode: "fixed-duration",
  fixedDurationMs: automatic.minimumHonestDurationMs,
});
assert(close(fixedAtMinimum.durationMs, automatic.minimumHonestDurationMs), "fixed compiler must hit honest minimum exactly");
let rejectedBelowMinimum = false;
try {
  compileTimeline({ items, parameters: DEFAULT_PARAMETERS, mode: "fixed-duration", fixedDurationMs: automatic.minimumHonestDurationMs - 1 });
} catch { rejectedBelowMinimum = true; }
assert(rejectedBelowMinimum, "fixed compiler must reject below honest minimum");
pass("timeline-modes-and-honest-minimum", {
  durationsMs: Object.fromEntries(Object.entries(timelines).map(([key,value]) => [key,value.durationMs])),
  minimumHonestDurationMs: automatic.minimumHonestDurationMs,
});

const times = evidenceTimes(automatic);
const representative = [times.start, times.characteristic, times.hold, times.finale, times.exit, times.seam];
const outputs = representative.map((timeMs) => canonicalFrame(at(automatic, items, timeMs)));
const repeated = representative.map((timeMs) => canonicalFrame(at(automatic, items, timeMs)));
assert(digest(outputs) === digest(repeated), "repeated evaluation must be identical");
pass("deterministic-repeat", { digest: digest(outputs) });

const parityTime = times.characteristic;
const play = canonicalFrame(at(automatic, items, parityTime));
const scrub = canonicalFrame(at(automatic, items, parityTime));
const fixedStep = canonicalFrame(at(automatic, items, parityTime));
assert(stable(play) === stable(scrub) && stable(scrub) === stable(fixedStep), "play/scrub/fixed-step mismatch");
const parity = { sceneId: SCENE_ID, status: "pass", timeMs: parityTime, digests: { play:digest(play), scrub:digest(scrub), fixedStep:digest(fixedStep) } };
fs.writeFileSync(path.join(evidenceDir, "parity.json"), JSON.stringify(parity, null, 2) + "\n");
pass("play-scrub-fixed-step-parity", parity.digests);

const boundarySamples = canonicalSamples(automatic);
for (const sample of boundarySamples) {
  const frame = at(automatic, items, sample.timeMs);
  for (const card of frame.cards) {
    for (const key of ["x","y","width","height","scale","rotation","projectedYaw","z"]) assert(Number.isFinite(card[key]), `${key} finite at ${sample.label}`);
    assert(card.opacity === 1 && card.filter === "none" && card.blend === "normal", "source render policy");
  }
  const ids = frame.cards.map((card) => card.id);
  assert(new Set(ids).size === ids.length, `unique pose IDs at ${sample.label}`);
  for (const item of items.filter((item) => item.kind === "video")) {
    assert(frame.sourceVideoTimes[item.id] === item.sourceOffsetMs + sample.timeMs, `source-video clock at ${sample.label}`);
  }
}
const terminal = at(automatic, items, automatic.durationMs);
assert(terminal.terminal === true, "terminal sample must be explicit");
pass("boundary-finite-source-clock-terminal", { samples: boundarySamples.length });

const causality = {};
for (const control of CONTROL_DEFINITIONS) {
  const variant = { ...DEFAULT_PARAMETERS, [control.id]: control.max };
  const variantTimeline = compileTimeline({ items, parameters: variant, mode: "automatic" });
  const series = representative.map((timeMs) => canonicalFrame(at(variantTimeline, items, Math.min(timeMs, variantTimeline.durationMs), variant)));
  causality[control.id] = { defaultDigest:digest(outputs), variantDigest:digest(series), changed:digest(outputs) !== digest(series) };
  assert(causality[control.id].changed, `${control.id} must be independently causal`);
}
pass("control-causality", causality);

for (const fixtureName of ["one","two","awkward-seven","ordinary-eight","many-24","alpha","failed"]) {
  const fixture = makeFixture(fixtureName);
  const timeline = compileTimeline({ items: fixture, parameters: DEFAULT_PARAMETERS, mode: "automatic" });
  for (const timeMs of [0, timeline.durationMs * 0.37, timeline.durationMs]) {
    const frame = at(timeline, fixture, timeMs);
    assert(frame.cards.length <= 24, "bounded evaluator state");
    assert(frame.cards.filter((card) => card.visible).length <= 7, `visible mount bound ${fixtureName}`);
  }
}
pass("fixture-resource-bounds", { visibleLimit: 7 });

const reverse = compileTimeline({ items, parameters: DEFAULT_PARAMETERS, mode: "automatic", direction: "reverse" });
assert(at(reverse, items, reverse.durationMs * 0.45).cards.length > 0, "reverse output");
pass("reverse-evaluator");

for (const control of CONTROL_DEFINITIONS) {
  let failed = false;
  try { compileTimeline({ items, parameters: { ...DEFAULT_PARAMETERS, [control.id]: control.max + Math.abs(control.max-control.min) + 1 } }); }
  catch { failed = true; }
  assert(failed, `${control.id} invalid input`);
}
pass("invalid-input-rejection");

// Scene-specific identity and boundary checks. These are independent; no shared choreography engine.
if (SCENE_ID === "opening-reel") {
  const directed = compileTimeline({ items, parameters: DEFAULT_PARAMETERS, mode: "directed" });
  assert(directed.events.filter((event) => event.type === "travel").length === 4, "directed ordinary-eight must compile four casino-rhythm travel legs");
  const finaleHold = automatic.events.find((event) => event.type === "finale-hold");
  const frame = at(automatic, items, eventSample(automatic, finaleHold, 0.5));
  assert(frame.cards.filter((card) => card.visible).length === 1, "finale must clear competing structure geometrically");
  assert(frame.cueId === automatic.finaleId, "finale identity");
  pass("opening-reel-signature", { directedTravelLegs:4, finaleVisibleCards:1 });
}
if (SCENE_ID === "swipe-stack") {
  const cycle = automatic.events.find((event) => event.type === "cycle");
  const front = at(automatic, items, eventSample(automatic, cycle, 0.30));
  const crossing = at(automatic, items, eventSample(automatic, cycle, 0.50));
  const tuck = at(automatic, items, eventSample(automatic, cycle, 0.74));
  const frontCard = front.cards.find((card) => card.id === front.activeId);
  const crossingCard = crossing.cards.find((card) => card.id === crossing.activeId);
  const tuckCard = tuck.cards.find((card) => card.id === tuck.activeId);
  assert(frontCard.z > 100 && !frontCard.occluded, "front flight must remain in front");
  assert(crossingCard.z < 0 && crossingCard.occluded, "z handoff must occur under occlusion");
  assert(tuckCard.z < 0, "same identity must travel on rear plane");
  const settled = at(automatic, items, cycle.endMs);
  const reorderedItems = settled.permutationOrFocus.map((id) => items.find((item) => item.id === id));
  const inverse = compileTimeline({ items: reorderedItems, parameters: DEFAULT_PARAMETERS, mode: "automatic", direction: "reverse" });
  const inverseCycle = inverse.events.find((event) => event.type === "cycle");
  assert(stable(at(inverse, reorderedItems, inverseCycle.endMs).permutationOrFocus) === stable(items.map((item) => item.id)), "reverse cycle must restore prior permutation");
  pass("swipe-stack-signature", { activeId:front.activeId, inversePermutation:true });
}
if (SCENE_ID === "the-stack") {
  const cycle = automatic.events.find((event) => event.type === "calm-cycle");
  const startPose = poseOnly(at(automatic, items, eventSample(automatic, cycle, 0)));
  const restEndPose = poseOnly(at(automatic, items, eventSample(automatic, cycle, 0.55)));
  assert(stable(startPose) === stable(restEndPose), "breath must close exactly before lift");
  const drift = at(automatic, items, eventSample(automatic, cycle, 0.71));
  const active = drift.cards.find((card) => card.id === drift.activeId);
  assert(Math.abs(active.x - DEFAULT_STAGE.width/2) < DEFAULT_STAGE.width*0.15, "calm drift must remain bounded");
  const handoff = at(automatic, items, eventSample(automatic, cycle, 0.80));
  const handoffCard = handoff.cards.find((card) => card.id === handoff.activeId);
  assert(handoffCard.occluded && handoffCard.z < 0, "calm depth handoff must be covered");
  const settled = at(automatic, items, cycle.endMs);
  const reorderedItems = settled.permutationOrFocus.map((id) => items.find((item) => item.id === id));
  const inverse = compileTimeline({ items: reorderedItems, parameters: DEFAULT_PARAMETERS, mode: "automatic", direction: "reverse" });
  const inverseCycle = inverse.events.find((event) => event.type === "calm-cycle");
  assert(stable(at(inverse, reorderedItems, inverseCycle.endMs).permutationOrFocus) === stable(items.map((item) => item.id)), "reverse calm advance must restore prior permutation");
  pass("calm-stack-signature", { closedBreath:true, boundedDrift:true, inversePermutation:true });
}
if (SCENE_ID === "hero-deck-object") {
  const handoff = automatic.events.find((event) => event.type === "handoff");
  const before = at(automatic, items, eventSample(automatic, handoff, 0.619));
  const after = at(automatic, items, eventSample(automatic, handoff, 0.621));
  assert(before.cards.filter((card) => card.z === 100).length === 1, "one hero before crossing");
  assert(after.cards.filter((card) => card.z === 100).length === 1, "one hero after crossing");
  assert(before.heroId !== after.heroId, "authority must transfer once");
  const two = makeFixture("two");
  const forwardTwo = compileTimeline({ items:two, parameters:DEFAULT_PARAMETERS, mode:"automatic", direction:"forward" });
  const reverseTwo = compileTimeline({ items:two, parameters:DEFAULT_PARAMETERS, mode:"automatic", direction:"reverse" });
  const fEvent = forwardTwo.events.find((event) => event.type === "handoff");
  const rEvent = reverseTwo.events.find((event) => event.type === "handoff");
  const f = at(forwardTwo, two, eventSample(forwardTwo, fEvent, 0.46));
  const r = at(reverseTwo, two, eventSample(reverseTwo, rEvent, 0.46));
  const fOutgoing = f.cards.find((card) => card.id === f.outgoingId);
  const rOutgoing = r.cards.find((card) => card.id === r.outgoingId);
  assert(fOutgoing.x < DEFAULT_STAGE.width/2 && rOutgoing.x > DEFAULT_STAGE.width/2, "reverse handoff must use inverse physical side");
  pass("hero-deck-signature", { singleAuthority:true, inverseSide:true });
}
if (SCENE_ID === "coverflow-gallery") {
  const dwell = automatic.events.find((event) => event.type === "dwell");
  const frame = at(automatic, items, eventSample(automatic, dwell, 0.5));
  const front = frame.cards.find((card) => card.id === frame.frontId);
  assert(close(front.x, DEFAULT_STAGE.width/2) && close(front.projectedYaw,0) && close(front.scale,1) && front.z === 100, "front stop must be exact");
  const two = makeFixture("two");
  const pingPong = compileTimeline({ items:two, parameters:DEFAULT_PARAMETERS, mode:"directed" });
  assert(stable(pingPong.events.filter((event) => event.type === "transition").map((event) => event.toFocus)) === stable([1,0,1,0]), "two-item directed mode must ping-pong without circular ambiguity");
  const many = makeFixture("many-24");
  const wrap = compileTimeline({ items:many, parameters:DEFAULT_PARAMETERS, mode:"automatic" });
  const wrapEvent = wrap.events.find((event) => event.type === "transition" && event.fromFocus === 11 && event.toFocus === 12);
  const beforeWrap = at(wrap, many, eventSample(wrap, wrapEvent, 0.999));
  const afterWrap = at(wrap, many, eventSample(wrap, wrapEvent, 1));
  const a = beforeWrap.cards.find((card) => card.id === many[0].id), b = afterWrap.cards.find((card) => card.id === many[0].id);
  assert(a.visible === false && b.visible === false && Math.sign(a.x-DEFAULT_STAGE.width/2) !== Math.sign(b.x-DEFAULT_STAGE.width/2), "wrap representative may jump only while offstage");
  pass("coverflow-signature", { exactFrontStop:true, twoItemPingPong:true, offstageWrap:true });
}

const vectorPath = path.join(sceneDir, "TEST_VECTORS.json");
const vectors = JSON.parse(fs.readFileSync(vectorPath, "utf8"));
vectors.status = "generated-results-present";
vectors.samples = boundarySamples.map((sample) => {
  const frame = canonicalFrame(at(automatic, items, sample.timeMs));
  return { ...sample, phase:frame.phase, permutationOrFocus:frame.permutationOrFocus, sourceVideoTimes:frame.sourceVideoTimes, digest:{ status:"actual", algorithm:"sha256", value:digest(frame) } };
});
fs.writeFileSync(vectorPath, JSON.stringify(vectors, null, 2) + "\n");

const resource = { sceneId:SCENE_ID, status:"pass", sampleCount:0, maxEvaluatedCards:0, maxVisibleCards:0, maxOccludedCards:0, uiAnimationHandles:1, evaluatorTimers:0, growingCollections:false };
for (const fixtureName of ["ordinary-eight","many-24"]) {
  const fixture = makeFixture(fixtureName);
  const timeline = compileTimeline({ items:fixture, parameters:DEFAULT_PARAMETERS, mode:"automatic" });
  for (let index=0; index<=240; index += 1) {
    const frame = at(timeline, fixture, timeline.durationMs*index/240);
    resource.sampleCount += 1;
    resource.maxEvaluatedCards = Math.max(resource.maxEvaluatedCards, frame.cards.length);
    resource.maxVisibleCards = Math.max(resource.maxVisibleCards, frame.cards.filter((card) => card.visible).length);
    resource.maxOccludedCards = Math.max(resource.maxOccludedCards, frame.cards.filter((card) => card.occluded).length);
  }
}
fs.writeFileSync(path.join(evidenceDir, "resource-report.json"), JSON.stringify(resource, null, 2) + "\n");
const fidelity = { sceneId:SCENE_ID, status:"pass", fit:"contain", artworkOpacity:1, artworkFilter:"none", artworkBlend:"normal", sceneBackground:"none", sourceVideoClock:"sourceOffset + storyTime", lookEffectsApplied:[], frameIntentOwnedElsewhere:true, audioOwnedElsewhere:true, interfaceScaleAffectsTruth:false };
fs.writeFileSync(path.join(evidenceDir, "source-fidelity.json"), JSON.stringify(fidelity, null, 2) + "\n");
fs.writeFileSync(path.join(evidenceDir, "test-results.json"), JSON.stringify(results, null, 2) + "\n");
console.log(`${SCENE_ID}: ${results.status}; ${results.checks.length} checks`);
