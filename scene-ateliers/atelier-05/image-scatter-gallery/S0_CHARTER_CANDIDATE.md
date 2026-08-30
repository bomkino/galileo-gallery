# S0 charter candidate — Scatter: Lively Prints

- Scene ID: `image-scatter-gallery`
- Candidate version: atelier S0, non-runtime
- Verdict: pending
- Production integration: no
- Human acceptance: no

## One sentence

Prints travel from assigned perimeter routes into a repeatable field, exchange attention through short physical lifts, and return along owned routes; group energy never destroys individual readability.

## Anti-motion sentence

Lively Prints is not Quiet Drift with more amplitude, a random packing system, a card swarm, a screensaver, or a shuffle. Sources do not wake up already scattered and bob in place. Every identity owns a perimeter approach, a field zone, a focus interval, and a return path.

## Emotional and material metaphor

A group of fresh prints arrives on a large working surface as an edited burst, not a pile. The field has choreography, pressure, and negative space. It should feel confident and energetic without becoming frantic, ornamental, or illegible. The visual pleasure comes from distinct routes resolving into a strong field, then releasing—not from generic randomness.

The Scene owns print geometry, route topology, and focus lift. It does not own lighting, grain, tint, source brightness, paper colour palette, vignette, or background texture. Transparent output remains first-class.

## Structural distinction from Quiet Drift

| Axis | Quiet Drift | Lively Prints |
| --- | --- | --- |
| topology | stable neighbourhood cluster | assigned perimeter routes into a field |
| ordinary count | 4–7 | 7–12 |
| many policy | hard maximum 12, all present | maximum 24, contiguous cohorts of 12 |
| entry | motion engages in place | each source arrives from an owned edge |
| cycle | tiny local closed currents | circulation and attention inside a negative-space field |
| focus | quiet separate plane | short assertive physical lift during route cadence |
| finale | composition damps into stillness | energetic field resolves, then each source returns on route |
| emotional use | intimate interlude | lively editorial burst |

If those differences are weakened, consolidate rather than protect two names.

## Spatial grammar

### Stable route ownership

Compilation assigns every ordered source:

- immutable source ID/index;
- contiguous cohort and slot;
- one perimeter edge and edge start;
- one field zone;
- one route ID;
- one base z role;
- one source ratio/fit/focal-intent record.

Route ownership never changes with story time. There is no periodic remapping, random packing, or slot rotation. A failed item keeps the same route and zone.

### Field topology and negative space

The ordinary field uses twelve maximum simultaneous zones. A combined negative-space control selects one authored exclusion geometry: right-quiet, left-quiet, centre-clear, or upper-clear. Field centres are pushed outside that exclusion during compilation and remain there for the whole phrase. Negative space is therefore structural, not a lucky screenshot.

The field must preserve mixed ratios and source readability. Landscape art does not receive preferential zones. Card height is canvas-aware; width follows source ratio within a bounded maximum.

### One, two, and many

- One source: one confident poster arrival into centre, a short hold, and owned return.
- Two sources: intentional left/right opposition with distinct edge approaches; no mechanical ping-pong.
- Seven to twelve: one complete simultaneous field.
- Thirteen to twenty-four: deterministic contiguous source-order cohorts of at most twelve. Every identity appears during the compiled phrase. Inactive cohorts remain represented in evaluator state but are not mounted/rendered as duplicate cards.
- Above twenty-four: explicit rejection, never silent truncation.

## Route grammar

The candidate offers three causal route characters:

- **Arcs:** broad curved approaches with alternating bend direction.
- **Diagonals:** direct, graphic approaches.
- **Hooks:** approach arcs turn near the field before settling.

These are topology variants inside one Scene, not randomised motion presets. The chosen character changes control points while retaining the same start, end, identity, and route ownership.

## Time grammar

One cohort phrase is 9,000 ms by default:

1. **Assigned arrivals, 0.00–0.22.** Every active source travels from its perimeter point to its stable field zone along its owned route.
2. **Field exchange, 0.22–0.72.** The field holds. Each print follows a small deterministic local circulation and receives one short focus lift in source order.
3. **Field finale, 0.72–0.86.** Circulation damps while the final eligible print receives attention. No global zoom, source dimming, or glow.
4. **Owned return, 0.86–1.00.** Prints leave along their own route in reverse geometry. At the seam all active cards are outside the canvas and the next cohort may begin without teleport.

The seam closes exactly. Start/end route positions, rotations, visibility state, identity order, and route IDs are equal.

### Automatic, fixed, directed, reverse

- **Automatic:** one phrase per cohort. A 24-source fixture therefore compiles two complete phrases and gives every identity one field appearance.
- **Fixed:** all cohorts are retimed to exactly 16,000 ms in the atelier fixture. Product S1 must accept Project fixed duration.
- **Directed:** fast ×2, regular ×1, fast ×1 multiplies complete cohort phrases. Cadence changes; route ownership and field composition do not.
- **Reverse:** exact story-time retrace across the compiled cohort sequence. A reverse pass does not invent alternate routes.

## Controls

Five controls survive:

1. **Field spread** — changes stable field-zone distance from centre.
2. **Energy** — changes only local circulation amplitude and small rotational response.
3. **Negative space** — changes the authored exclusion anchor/amount as one discrete structural choice.
4. **Route character** — changes path control geometry, not endpoints or ownership.
5. **Focus lift** — changes physical separation for the active print only.

No density control: source count and cohort policy determine density. No pace control in this candidate: Timeline owns cadence. No Look colour, source fit, frame radius, shadow, or glow control belongs here.

## Canvas recomposition

16:9, 9:16, 1:1, and 4:5 compile independent field geometry from normalized zones and canvas dimensions. 9:16 is not a clipped landscape field: the exclusion ellipse, route starts, zone positions, and card size all resolve against the portrait canvas.

The edge grammar remains legible in every orientation. Top/bottom approaches gain visual importance in portrait; left/right still exist but do not become the sole composition logic.

## Source, video, alpha, Look, audio

- Source opacity: 1.
- Filter: `none`.
- Blend: `normal`.
- Fit/crop/focal point: Project-owned and preserved.
- Failed media: explicit placeholder on owned route.
- Video: source time is derived only from deterministic story time; no wall-clock autoplay contract.
- Alpha: supported; RGBA must be zero where alpha is zero.
- Look: supplies background/material tokens later; Scene does not tint artwork.
- Audio: untouched. No scene-owned playback, mute, ducking, or no-audio fiction.

## Reduced motion

Reduced motion preserves one complete composed field for the selected cohort. Entry, circulation, and return stop. Keyboard selection may place a restrained static registration mark; source pixels remain unchanged. No opacity shuffle substitutes for route motion.

## Keyboard and focus

The stage accepts keyboard focus. Arrow keys move the explicit selected source in order; selection can move between cohorts. Product S1 must announce source index, caption/name, failed state, cohort, and selection state. Animation never steals DOM focus. Visual z does not reorder accessibility traversal.

## Lifecycle and resources

The evaluator returns all accepted ordered identities but marks at most twelve visible. It does not clone loop copies. It allocates no timers, random state, media elements, DOM nodes, GPU resources, or retained history. A 2,000-frame test confirms 24 total states and ≤12 visible states throughout.

S1 must mount only the active bounded cohort plus necessary offstage route margin, release media/proxy resources at cohort change, cancel one transport callback on unmount, and rebuild route ownership deterministically after remount.

## Risks

- Too much energy turns circulation into screensaver bobbing.
- Too little route visibility makes the Scene read as a static scatter.
- A weak exclusion zone makes “negative space” decorative rather than structural.
- Cohort transitions could feel like pagination unless the all-offstage seam remains clean.
- Mixed ratios can still collide at extreme field spread; human review must inspect real source sets.
- Generic focus scale or brightness would collapse the source-safe identity.

## Later human decisions

1. Do arcs, diagonals, and hooks all belong, or should one be the sole chartered topology?
2. Is right-quiet the strongest default negative-space choice?
3. Does recommended count nine feel lively but readable?
4. Is twenty-four an honest maximum, or should the Scene cap at twelve and reject cohorts?
5. Does the two-cohort seam feel intentional at real speed?
6. Are energy 58% and focus lift 34% strong enough without becoming theatrical?
7. Does 9:16 feel authored rather than compressed?

Verdict remains pending.
