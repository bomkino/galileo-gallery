# S0 charter candidate — Scatter: Quiet Drift

- Scene ID: `drift-deck`
- Candidate version: atelier S0, non-runtime
- Verdict: pending
- Production integration: no
- Human acceptance: no

## One sentence

Prints occupy remembered places on one quiet table, following separate loop-closed micro-currents; focus lifts one print and returns it without collision, jump, or z-order surprise.

## Anti-motion sentence

Quiet Drift is not a carousel, shuffled stack, screensaver, loose particle field, or a lower-amplitude copy of Lively Prints. It never remaps an identity to another slot, changes source order, invents a route from wall-clock randomness, or makes source brightness carry attention.

## Emotional and material metaphor

A small set of physical proofs has been left on a working table after a careful edit. Nothing is performing for an audience. Air, paper memory, and minor material tension keep the arrangement alive. The Scene should feel intimate, calm, observant, and slightly imperfect—never sleepy in the generic “floating cards” sense.

The table is a coordinate metaphor, not a compulsory rendered surface. A transparent canvas remains a first-class output. Paper edges and an optional physical lift belong to the Scene; table colour, grain, lamp falloff, vignette, and decorative shadow belong to Look or later approved treatment. The clean prototype therefore draws only generated artwork, restrained paper margins, and a focus registration outline.

## Spatial grammar

### Coordinate system

The evaluator works in Project-canvas pixels after a ratio-aware normalized composition is compiled. Each source receives one stable authored neighbourhood:

- one source: one centred, weighty proof;
- two sources: a deliberate left/right counterweight with unequal but balanced orientation;
- three to seven: a low-relief clustered table with intentional overlaps;
- eight to twelve: the same authored logic at smaller scale, not duplicated slots or a hidden carousel.

Every card has immutable `baseX`, `baseY`, `baseRotation`, `baseZ`, width, height, source index, and ID for the life of the compiled Scene. Composition spread scales neighbourhood centres around the canvas centre. Overlap/depth changes card scale and authored proximity without changing order.

### Depth and focus

Base z-order is stable source order. Periodic attention uses a separate focus plane. A focused card may enter that plane and gain physical lift; it does not rewrite the base stack. When focus returns, the card resumes its original base z exactly. Non-focused cards never change z as collateral damage.

The prototype renders focus as a source-safe registration outline and small physical separation. A later Product renderer may use a paper-edge shadow only if a Look/source-fidelity review proves it does not wash artwork or become undeclared lighting.

### Micro-current topology

Each print follows its own closed deterministic field built from integer harmonics of one normalized cycle. Harmonic counts and phase offsets derive from stable source index, not runtime random state. All trajectories close exactly at the loop seam. The field is decorrelated enough to avoid marching in unison but remains small enough to preserve the authored overlap graph and each print’s neighbourhood.

## Time grammar

The default phrase is 10.5 seconds and has four continuous states:

1. **Entry / breath engages, 0.00–0.08.** Prints are already in remembered places. Motion gain rises from zero; no card appears, fades, or travels from offstage.
2. **Micro-currents and attention, 0.08–0.78.** Separate closed trajectories run. Focus visits one source at a time through a smooth lift envelope.
3. **Finale through stillness, 0.78–0.90.** Drift damps to zero while the final eligible print receives attention. No glow, tint, enlargement wash, or camera zoom.
4. **Return, 0.90–1.00.** Focus lowers into the stable base plane. Every card reaches its remembered position, rotation, lift, and order before the seam.

At normalized 1.0, the evaluator returns exactly the 0.0 vector. The near-seam velocity approaches zero because both sides are the same still composition.

### Automatic, fixed, and directed mapping

- **Automatic:** one authored phrase at the selected cycle pace.
- **Fixed duration:** one phrase retimed to exactly 14,000 ms in the prototype. A Product compiler would receive Project duration rather than this atelier fixture value.
- **Directed:** fast ×2, regular ×1, fast ×1 compiles to four complete phrases with explicit segment durations and one evaluator. Directed speed changes cadence only; it does not change source order, neighbourhoods, or field identity.
- **Reverse:** exact story-time retrace. Reverse is not a second simulation and introduces no new state. Evaluating forward at `t` equals reverse at `1 − t` within numeric tolerance.

## Controls

Five Scene-only controls survive the causality gate:

1. **Composition spread** — moves stable neighbourhood centres radially while preserving order and source identity.
2. **Overlap / depth** — changes print scale and authored overlap pressure; it never changes source pixels.
3. **Drift strength** — scales only closed trajectory amplitude and rotational breath.
4. **Focus lift** — scales only physical separation on the focus plane.
5. **Cycle pace** — changes compiled duration and temporal velocity, not geometry.

No density control exists: source count already determines density. No Look colour, grain, lighting, crop, fit, frame radius, or shadow control belongs here. Those remain Project frame/Look concerns.

## Source counts and ratios

- Minimum: 1.
- Recommended: 5; ordinary useful range: 4–7.
- Candidate maximum: 12.
- More than 12: reject with explicit capability copy in S1 rather than silently dropping identities.
- One source: centred still proof with minute optional breath; no fake crowd behaviour.
- Two sources: stable counterweight; neither mechanically swaps with the other.
- Mixed landscape, portrait, square, and cinematic ratios retain declared per-item contain/cover/focal intent. The Scene computes outer paper geometry; Product frame intent still owns source fitting.
- Failed media retain their ordered ID, neighbourhood, size, and focus eligibility. The generated prototype uses an explicit crossed placeholder without closing the gap or reindexing later media.

## Canvas recomposition

The composition is genuinely recomputed for 16:9, 9:16, 1:1, and 4:5 canvases. It is not a landscape table scaled into a narrow viewport. Normalized neighbourhoods remain recognisable, while card size derives from the shorter canvas dimension and widths respect each source ratio. Portrait canvases become a taller cluster with preserved visual centre and usable margins.

## Video and audio

Source-video visual time is a pure function of Project story time and source duration. Preview, scrub, and fixed-step capture can request the same timestamp; the prototype includes looped and clamped examples. Quiet Drift does not autoplay, seek, decode, mix, mute, duck, or otherwise redefine audio. Product audio remains an external deterministic service.

## Source, Look, alpha, and background boundaries

- Imported artwork: opacity 1, filter `none`, blend mode `normal`.
- No source dimming, brightness, tint, blur, texture, grain, vignette, or light sweep.
- Per-source fit/crop/focal intent remains upstream Project truth.
- Transparent output: supported. Fully transparent pixels must be RGBA zero.
- Opaque background: supplied by Look, not hard-coded by the Scene.
- Paper edge: legitimate Scene geometry; paper colour still needs a later Look contract rather than a free Scene-owned palette.
- Decorative shadow or table lighting: absent from the clean candidate.

## Reduced motion

Reduced motion freezes all micro-currents and rotational breath. It keeps the authored table composition and may place one static selected card on the focus plane at restrained strength. Story-time changes do not move the cards. Nothing fades, zooms, reshuffles, or disappears.

## Keyboard and focus

The isolated prototype stage is keyboard focusable:

- Space toggles transport.
- Home and End expose the exact seam endpoints.
- Arrow keys change the explicit selected index used by reduced-motion/static focus evidence.

In S1, keyboard focus must follow source order, not z-order. A focused control announces source index, caption/name, failed state, and whether it is the Scene’s current attention target. Scene animation must never steal DOM focus.

## Lifecycle and resources

The pure evaluator accepts at most twelve sources and returns exactly one bounded state per source. It creates no timers, event listeners, media elements, retained trajectory history, random generator, canvas, GPU resource, or external request. The browser shell owns one animation-frame callback. Unmounting the shell removes the only live transport loop; evaluator state itself is disposable data.

S1 must preserve this shape: one source identity, one Scene object, bounded visible work, explicit media release, no cloned loop decks, no perpetual intervals, and no state growth across remounts.

## Risks

- Too much overlap can make the Scene read as a stack. The current maximum scale/pressure remains a human-review question.
- Too much drift makes the Scene read as a screensaver or Lively Prints. The 34% default is deliberately restrained.
- A decorative table, lamp, shadow, or grain could accidentally become a source treatment. Keep the clean source-safe baseline as the acceptance reference.
- A focus plane implemented through generic brightness or scale would collapse identity and violate source fidelity.
- Sparse portrait canvases may need scene-specific neighbourhood tuning after human review; generic auto-fit is not enough.

## Later human decisions

1. Does the five-print default read as a remembered table rather than a stack?
2. Is 34% drift clearly alive at real speed without becoming ambient bobbing?
3. Is the separate focus plane legible without generic card zoom or light treatment?
4. Should the candidate maximum remain 12, or should S1 reject above 9 for stronger intimacy?
5. Does the 9:16 recomposition feel authored, not merely narrower?
6. Is the paper edge identity-critical, or should the clean baseline permit frameless source planes?

No answer is inferred by automated evidence. Verdict remains pending.
