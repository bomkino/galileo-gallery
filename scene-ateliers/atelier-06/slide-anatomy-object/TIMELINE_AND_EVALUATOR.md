# Timeline and evaluator — Slide Anatomy

## Pure input

`evaluateSlideAnatomy({ item, apparatus, parameters, timeline, timeMs, stageWidth, stageHeight, reducedMotion })`

The evaluator consumes one stable source identity plus an explicit apparatus record. It never reads source pixels to infer semantic layers. It does not use wall-clock time, native media playback, browser layout after compilation, or GPU state.

All numeric values must be finite and bounded. Apparatus identifiers are versioned and unique. Unsupported apparatus fails instead of falling through to a generic plane.

## Present-plane compilation

Compile only planes that exist:

- source: always;
- matte: when Project frame/matte intent exists;
- guides: when Project guides exist and `showGuides` is true;
- caption: when a non-empty Project caption exists;
- world backing: when the shared background is not transparent.

The plane table determines both geometry and phrase duration. Empty caption and absent guides remove their nodes and their reading allowance. No invisible phase remains.

## Canonical phrase

1. closed settle;
2. opening travel;
3. open hold;
4. closing travel;
5. exact closed seam.

Opening and closing use the same scalar progress in opposite directions. Every plane pose is a pure interpolation between its closed and open pose; therefore return cannot drift unless the invariant is broken.

## Modes

- **Automatic:** one complete phrase at declared open/hold/close durations.
- **Fixed duration:** semantic legs retimed proportionally to the exact requested duration, with a readable floor derived from present plane count.
- **Directed:** full phrases at pace scales 2, 2, 1, and 2. Segment duration and output differ from automatic mode.

Reverse begins in the open state, closes, holds, and reopens. Plane identity and depth order remain unchanged.

## Output

- phrase state: `closed`, `opening`, `open`, `closing`;
- scalar openness `0…1` and velocity;
- stable ordered plane poses;
- source treatment invariant;
- optional labels and leaders outside source pixels;
- deterministic video story-time sample for the source plane;
- exact duration and active segment ID.

## Reduced motion

Emit the fully open, labelled anatomy as one stable state. No floating, pulse, parallax, or automatic toggling. Keyboard plane selection changes emphasis immediately without animating geometry.

## Parity

Preview, scrub, test vectors, and future fixed-step export must sample this evaluator directly. The prototype does not claim Product export integration.
