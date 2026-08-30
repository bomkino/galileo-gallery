import fs from "node:fs";
import { DEFAULT_PARAMETERS, DEFAULT_STAGE, makeFixture, compileTimeline, evaluateScene, canonicalFrame } from "./evaluator.mjs";
const output = process.argv[2];
if (!output) throw new Error("Usage: node export-clip-frames.mjs <output.json>");
const items = makeFixture("ordinary-eight");
const timeline = compileTimeline({ items, parameters: DEFAULT_PARAMETERS, mode: "automatic" });
const fps = 12;
const frameCount = Math.max(2, Math.round((timeline.durationMs / 1000) * fps));
const frames = Array.from({ length: frameCount }, (_, index) => {
  const storyTimeMs = timeline.durationMs * index / (frameCount - 1);
  return canonicalFrame(evaluateScene({ items, parameters: DEFAULT_PARAMETERS, timeline, storyTimeMs, stage: DEFAULT_STAGE }));
});
fs.writeFileSync(output, JSON.stringify({ fps, durationMs: timeline.durationMs, width: 480, height: 270, frames }));
console.log(`${frames.length} frames -> ${output}`);
