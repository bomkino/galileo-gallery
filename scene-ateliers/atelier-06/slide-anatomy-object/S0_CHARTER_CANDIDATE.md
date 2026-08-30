# S0 charter candidate — Assembly / Slide Anatomy

- Scene ID: `slide-anatomy-object`
- Candidate version: atelier-local `0.1`
- Status: candidate only
- Formal charter verdict: pending
- Product integration: no

## Honesty decision

**Chosen source model: flat-source mode.**

A flattened imported image contains no recoverable semantic design layers. Gallery must never claim it inferred typography, texture, image, annotation, brand, or polish from pixels. Candidate v1 keeps the imported source intact as the primary plane and separates only Project-known presentation apparatus around it:

1. backing/mat;
2. intact source frame;
3. frame edge;
4. Project canvas safe-area guide;
5. caption strip only when the media item actually has a caption.

Labels name only those structures. No generic historical labels are applied to arbitrary art.

An ordered-layer mode is not available under current Project v2. Multiple user-supplied ordered media could become authored layers only after a separately approved source-role/schema contract. Required future ticket: `AT06-CONTRACT-SOURCE-ROLES`. This atelier does not edit shared schema.

If human review finds presentation-apparatus anatomy too weak to earn the catalogue promise, block or consolidate the Scene. Do not strengthen it with fabricated semantics.

## Motion and anti-motion

**Motion sentence:** One intact frame separates into legible Project-known presentation planes, holds for inspection, and returns along the exact same spatial path before the untouched source resolves.

**Anti-motion sentence:** Never reverse-engineer design layers, invent semantic labels, stage a 3D spectacle, or tell an additive construction story.

The emotional register is analytical calm. The material metaphor is a conservator opening a framed work to inspect its mount, not software “discovering” how the artwork was made.

## Coordinate and depth model

- fixed orthographic camera with bounded perspective, no camera flight;
- source-aligned local coordinate system inside the Project canvas;
- five possible presentation planes, each with a stable source-derived ID;
- source plane remains one complete rectangle and never fragments;
- separation uses lateral offset plus depth, chosen for legibility rather than drama;
- occlusion at full inspection keeps every active plane edge visible;
- final resolved pose places all apparatus exactly at zero offset and preserves source fit/crop intent.

Count policy:

| Count | Behaviour |
| --- | --- |
| 0 | apply fails before mutation |
| 1 | ordinary flat-source anatomy |
| 2+ | first selected source may be analysed; all others preserved and explicitly unused in v1 |
| explicit-many proposal | blocked preview card explaining required source-role contract; never treated as real layers |

## Story grammar

| Range | Phase | Separation progress |
| --- | --- | --- |
| 0.00–0.10 | `resolved-entry` | `0` |
| 0.10–0.35 | `separate` | minimum-jerk `0 → 1` |
| 0.35–0.65 | `inspection-hold` | exact `1` |
| 0.65–0.90 | `return` | exact reverse path `1 → 0` |
| 0.90–1.00 | `resolved-finale` | exact `0` |

Normalized `0` and `1` are identical. Return is numerically the outward path sampled in reverse. Reverse playback remains honest because it swaps separation and return without relabelling structure.

Automatic baseline is 7,000 ms as diagnostic starting evidence. The readable floor is dynamic: `3,000 ms + inspection-hold`. With the default 2,100 ms hold the floor is 5,100 ms; with the maximum 5,000 ms hold it is 8,000 ms. Fixed/directed requests below the active floor report an explicit issue and compile at the floor. Directed motion may accelerate separation/return but never shortens either below 1,000 ms or changes the authored inspection hold. Preview, scrub, and fixed-step capture share one evaluator.

## Essential Scene-only controls

Exactly five:

1. `separation-depth`
2. `lateral-spread`
3. `perspective`
4. `inspection-hold`
5. `label-visibility`

Source fit/crop, Project canvas, Look, audio, and export remain shared concerns.

## Source, Look, alpha, and audio

- source opacity `1`, filter `none`, normal blend, colour transform identity;
- source plane contains the whole media item throughout;
- frame and labels live outside source pixels;
- transparent output is supported: apparatus composites cleanly and empty pixels remain RGBA `0,0,0,0`;
- reduced motion uses one discrete static separated pose plus accessible ordered description;
- source video samples Product story time; Scene creates no media clock;
- Scene does not change audio intent.

## Accessibility

- stage has an accessible description of active Project-known planes in back-to-front order;
- labels are optional visually but structure remains in accessibility text;
- Tab reaches the inspection description and source target;
- Space/Enter toggles resolved/separated manual inspection in preview;
- Escape returns to resolved;
- reduced motion avoids continuous 3D travel.

## Risks and human decisions

1. Does flat-source apparatus still earn “Slide Anatomy,” or should the Scene be blocked?
2. Are backing, frame, safe area, and caption sufficiently meaningful without invented content layers?
3. Does depth aid inspection without becoming spectacle?
4. Should labels be visible by default?
5. Is one source the only supported v1 contract, with extras preserved?

Human verdict remains pending. No formal S0, production Scene, source-role schema, catalogue integration, package, release, or acceptance is claimed.
