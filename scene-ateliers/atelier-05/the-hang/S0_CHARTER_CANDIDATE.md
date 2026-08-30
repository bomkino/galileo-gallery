# S0 charter candidate — The Hang

- Scene ID: `the-hang`
- Candidate version: atelier S0, non-runtime
- Verdict: pending
- Production integration: no
- Human acceptance: no

## One sentence

Frames descend from fixed upper anchors, share one gentle impulse, and settle with believable damping; every frame’s pivot, length, arc, identity, and return remain continuous.

## Anti-motion sentence

The Hang is not a bottom pile arranged onto a wall, a scatter layout with wires, a contact wall, or a collection of independent random wobblers. Pivots are fixed and legible. Motion comes from one explicit suspended system, not per-card toy loops.

## Emotional and material metaphor

A temporary exhibition has been hung from a rail. The frames possess weight, string length, and shared air. One mild disturbance travels through the set, then material friction wins. The Scene should feel poised, slightly vulnerable, and physically coherent—not whimsical, chaotic, or endlessly kinetic.

## Spatial grammar

### Fixed anchors

Compilation assigns every ordered source one immutable upper pivot, row, column, wire length, period scale, frame size, and source-safe frame state. Anchors do not travel. Debug evidence renders pivots and possible arc envelopes; production output renders only approved rail/wire/frame apparatus.

Landscape and square canvases normally use one upper rail. Portrait canvases with more than four sources, and ten-source canvases, use two upper rails. This is a genuine vertical recomposition: it creates staggered vertical bands and usable frame sizes rather than shrinking a landscape row into tiny cards.

### Length and negative space

Length variance changes deterministic wire lengths around a bounded baseline. Two-rail layouts assign shorter front-band lengths and longer second-band lengths, preserving vertical separation. The composition uses empty vertical space as part of the hang, not as a background effect.

### Collision policy

Frame width is bounded by neighbouring anchor spacing. Swing travel is also bounded by spacing-derived headroom. The evaluator reports structural collision pairs. Generated tests require none across one, two, recommended, and bounded-many fixtures; all canonical timestamps; and all four canonical canvases.

This does not prove arbitrary Product fonts, captions, or future frame treatments. S1 must rerun collision checks after final apparatus dimensions are known.

## Physical model

The candidate is a closed-form damped pendulum study, not an iterative simulation:

- pivot: fixed;
- length: deterministic per source;
- period: derived from square root of normalized length;
- impulse: shared start with small ordered propagation delay;
- amplitude: one Scene control, additionally clamped by collision headroom;
- damping: exponential envelope;
- focus: restrains the selected frame and shortens its wire slightly, never relights the source;
- finale: multiplies remaining swing toward zero;
- reverse: exact story-time retrace.

Because state derives directly from story time, preview, scrub, save/reopen, reverse, and fixed-step capture can agree without integrating prior frames.

## Time grammar

Default phrase: 12,500 ms.

1. **Descent, 0.00–0.14.** Frames extend from their fixed pivots along zero-angle wires. Length uses smootherstep; no swing exists yet.
2. **Shared impulse, 0.14–0.24.** One gentle impulse begins at the first anchor and reaches later anchors through a bounded source-order phase delay.
3. **Damped settle, 0.24–0.78.** Each frame follows its explicit pendulum period and damping. Attention may restrain one frame and shorten its hang slightly.
4. **Finale restraint, 0.78–0.90.** Remaining angles are damped continuously to zero. The final eligible frame receives restrained physical attention.
5. **Retraction, 0.90–1.00.** Wires shorten along the same vertical geometry. Swing remains zero. Phase 1 equals phase 0 exactly.

Retraction is a designed Scene exit, not a claim about an unpowered real gallery. In a terminal one-shot Product mode, S1 may instead stop on the fully settled composition if the Project’s terminal policy requests it. Loop mode needs the exact retract seam.

## Automatic, fixed, directed, reverse

- Automatic: one 12.5 s phrase.
- Fixed: one phrase retimed to exactly 15,000 ms in the atelier fixture; Product duration remains external.
- Directed: fast ×2, regular ×1, fast ×1 across complete phrases. Segment cadence does not alter pivots, lengths, or physics.
- Reverse: exact evaluator retrace. This is honest deterministic reverse evaluation, not a claim of forward-time physical plausibility.

## Controls

Five controls survive:

1. **Hang spread** — changes horizontal anchor distribution and derived collision headroom.
2. **Length variance** — changes deterministic wire-length spread.
3. **Impulse strength** — changes angular amplitude before the safety clamp.
4. **Damping** — changes exponential loss rate.
5. **Focus lift** — shortens/restrains only the selected frame.

No independent phase/randomness, perpetual sway, frame colour, source brightness, rail colour, glow, or Look control belongs here.

## Source counts

- Minimum: 1.
- Recommended: 6; ordinary useful range: 4–8.
- Candidate maximum: 10.
- One: one still, weighty piece; impulse amplitude is deliberately reduced.
- Two: balanced fixed pair with one travelling impulse, not mirrored perpetual oscillation.
- Nine/ten: two-rail bounded composition.
- Above ten: reject explicitly.

Failed media keep pivot, wire, length, index, and focus order. Mixed ratios remain source-faithful inside independently sized frames.

## Source, Look, alpha, video, audio

- Artwork opacity 1; filter `none`; blend `normal`.
- Spotlight never brightens, dims, tints, or filters source pixels.
- Wire, pivot, rail, and frame are legitimate opaque Scene pixels.
- Empty pixels remain RGBA zero when transparent output is selected.
- Background, global light, grain, vignette, and paper tint belong to Look.
- Video source time derives from deterministic story time only.
- Audio remains external; The Hang owns no playback, mute, ducking, or sound effect.

## Reduced motion

Reduced motion preserves the fully hung composition, fixed pivots, full wire lengths, and zero angles. A selected frame may use one static restrained shortening/outline. No descent, swing, damping, retraction, opacity animation, or source treatment remains.

## Keyboard and accessibility

Source-order focus is independent of visual z. Arrow keys move selection. The frame’s accessible label should include source name/caption, one-based index, failed state, selected state, and “suspended frame” role. Wires, pivots, rail, arc overlays, and debug geometry remain decorative. Animation must never move DOM focus.

## Lifecycle and resources

The evaluator returns exactly one state per accepted source and retains no simulation history. It creates no spring objects, timers, intervals, listeners, media elements, textures, or random state. A 2,000-frame test keeps the bounded ten-frame collection constant.

S1 must cancel its transport callback, release media/proxies/textures, remove observers/listeners, and restore deterministic anchors after remount or context loss. A static 2D fallback preserves identity.

## Risks

- Excess impulse becomes toy wobble.
- Excess damping makes the impulse unreadable.
- Too much length variance can weaken group composition.
- A wire/rail Look can become visually heavier than artwork.
- Two-rail portrait recomposition may feel like rows unless wire lengths and negative space remain irregular.
- Exact reverse retrace is deterministic but not forward-time physics; UI copy must be honest.

## Later human decisions

1. Does six feel like the strongest ordinary fixture?
2. Are the fixed pivots immediately legible without debug overlays?
3. Does the travelling impulse read as shared rather than chaotic?
4. Are default impulse 32% and damping 68% appropriately restrained?
5. Does focus restraint feel physical without becoming a generic lift?
6. Is loop retraction acceptable, or should loop mode use another invisible seam?
7. Does two-rail portrait composition feel genuinely vertical?
8. Keep maximum ten?

Verdict remains pending.
