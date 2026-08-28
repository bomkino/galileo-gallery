# Timeline and evaluator — The Build

## Status

This is a G10C preflight evaluator. It cannot be registered as production The Build and cannot claim authored-stage capability.

## Pure input

`evaluateBuildPreflight({ item, apparatus, parameters, timeline, timeMs, stageWidth, stageHeight, reducedMotion })`

The evaluator receives one stable intact source plus explicit Project-known apparatus. It never reads source pixels to infer stages. No wall clock, browser autoplay, pointer history, React timing, or GPU state is authority.

## Stage compilation

Compile only present stages:

1. `world` when background is not transparent;
2. `matte` when Project matte/frame intent exists;
3. `guides-caption` when Project guides or a non-empty caption exists;
4. `source` always;
5. `finale` always.

Absent apparatus removes the stage and its timing allowance. Every stage has ID, label, arrival, settle, hold, start/end time, start/end progress, and declared output effect.

## Duration

Canonical preflight with all stages: 11,600 ms.

Canonical readable floor: 7,900 ms. The compiler derives the actual floor from present stage count, minimum arrival/settle/read allowances, and finale hold. Fixed duration below that floor throws `duration-below-readable-floor` instead of compressing the story into visual noise.

## Modes

- **Automatic:** one complete preflight phrase at canonical stage timings.
- **Fixed duration:** proportionally retimes adjustable stage legs to the exact requested duration while preserving minimum stage and finale allowances.
- **Directed:** complete phrases at actual pace scales 2, 2, 1, and 2. The regular phrase retains full reading allowance; directed mode must differ numerically and visually from automatic at canonical timestamps.

## Evaluation

At each story time:

1. resolve active phrase and stage;
2. evaluate monotonic arrival/settle progress;
3. derive stable apparatus and intact source poses;
4. keep prior established stages settled rather than recreating DOM nodes;
5. emit current stage label, stage index/count, total duration, finale state, and source treatment invariant;
6. for reverse, sample the exact inverse progress and velocity while retaining stage identity metadata.

No stage may cross another path or leave residue above the finale source. The seam equals the start state exactly.

## Reduced motion

Show the intact final source at full readability plus a static textual stage ledger. Do not rapidly reveal apparatus, pulse the finale, or play through all stages. Manual stage selection changes the ledger immediately without animating source geometry.

## Video

A video source remains one intact plane and is sampled from deterministic story time. The Scene never changes Project audio policy.

## Future authored stages

`AT06-CONTRACT-AUTHORED-STAGES` must define stage identity, order, dependencies, source provenance, transforms, alpha, timing, reversibility, and final-state relationship before production G10C work. This preflight must not be silently upgraded by adding constants.
