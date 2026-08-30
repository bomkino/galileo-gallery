# Timeline and evaluator — Deck River / Chapter Reveal

## Pure finite boundary

```text
compile({items, mode, durationMs, direction, targetSourceIndex,
         segmentDurationsMs}) -> finiteTimeline
evaluate({items, parameters, finiteTimeline, timeMs, canvas,
          reducedMotion}) -> state
```

Visual normalized time clamps at `[0,1]`; it never modulo-wraps. Global `storyTimeMs` remains unwrapped so source video and Product audio truth continue through arrival, hold and after the visual phrase.

## Six named stages

1. distant entry
2. accelerating corridor
3. target acquire
4. straighten / grow / arrival
5. arrival hold
6. composed takeover

Automatic duration is bounded by media count. Fixed duration must meet the six-stage minimum. Directed mode accepts explicit durations for all six stages and rejects any segment below its readability floor; named stage order cannot collapse into a generic cycle.

## Momentum inheritance

At acquire, the evaluator samples the target’s projected x, y, width and height plus their derivatives with respect to normalized story time. Cubic Hermite curves carry all four derivatives into the centred arrival and resolve them to zero. This corrects the earlier implementation, which under-scaled position momentum and stopped size momentum abruptly.

Supporting frames are not deleted at acquire. A derivative-matched clearing progression keeps them travelling through the corridor until geometric near-plane/canvas clipping removes them. All supporting frames clear physically before arrival hold.

Hold preserves target geometry exactly. Takeover continues through geometric scale and slight direction-aware drift. Artwork opacity remains `1`; alpha holes remain real.

## Direction, target and skip

Reverse mirrors corridor side and takeover drift only. It does not reverse phrase order, source bytes, source-video playback or audio. Automatic target is the last unmuted identity; a valid Product-directed target is preserved. `visualSkipLandmarkMs` seeks only to target acquire and has no mute/seek/mix authority over audio.

## Reduced motion

Present the selected source immediately at a static arrival pose. No corridor travel, growth, hold animation or takeover substitute. Scrub remains deterministic.

## Mechanical proof

The Node check rejects unreadable fixed/directed durations; verifies exact directed sums; numerically compares x/y/width/height derivatives at acquire; proves supporting frames persist then clear physically; proves hold geometry stays fixed while story time advances; checks finite clamping, reverse mirror, all five controls, target/count/canvas matrices, source treatment and reduced motion. Randomized and browser UI gauntlets run separately.

Product integration, actual audio behaviour, encoded alpha handoff and human comfort remain pending.
