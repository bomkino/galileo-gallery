# S0 charter candidate — The Build

Status: **candidate only; G10C preflight; verdict pending**
Scene ID: `the-build`
Proposed version: `1`
Formal gate: blocked behind G10A Swipe Stack and G10B Orrery.

## Motion sentence

A source presentation accumulates through explicit, readable apparatus beats, clears its scaffolding, and resolves into the untouched finished frame without claiming how the imported artwork was designed.

## Anti-motion sentence

Never infer hidden layers, design decisions, palette trials, typography trials, approval history, authorship, or process knowledge from flattened pixels; never hide unreadable beats inside ornamental speed.

## Emotional and material metaphor

A careful paste-up bench: frame first, guides next, one intact source placed deliberately, then every temporary aid removed. The pleasure comes from legible construction, not spectacle or fake creative archaeology.

## Candidate source model

### Ordinary v1 candidate: flat-source presentation build

One ordered Project media item is consumed as one intact source. Gallery may animate only Project-known presentation apparatus around it:

1. stage anchor;
2. neutral frame and crop window;
3. safe-area and placement guides;
4. intact source reveal into the window;
5. real Project caption, when present;
6. guide cleanup;
7. source-faithful resolved hold;
8. honest deconstruction back to the seam.

This model does **not** claim that the apparatus reproduces the source's real design process. It demonstrates how Gallery presents the source.

### Optional future model: explicit authored stages

Multiple ordered stage images may become user-authored stages only after a separately approved serializable source-role/schema contract. Arbitrary extra Project media are not stages. Proposed dependency: `AT06-CONTRACT-AUTHORED-STAGES`. Until that contract exists, extra media remain preserved and unconsumed.

### Block condition

If human review or formal G10C concludes that apparatus-only construction does not earn the catalogue promise, block or consolidate this Scene. Do not preserve it for catalogue count.

## Coordinate, depth, topology, and source roles

- Coordinate system: normalized stage space; one stable camera; no free orbit.
- Depth: five bounded planes: stage anchor, frame backing, guide layer, source window, optional Project caption.
- Topology: additive apparatus sequence, then subtractive cleanup, then exact resolved source.
- Source role: one intact primary source; zero inferred internal layers.
- Extras: preserved by stable media identity; not consumed by the evaluator.
- Canvas recomposition: stage anchor and frame scale recompute for 16:9, 9:16, 1:1, and 4:5 while the source fit remains independent.

## Time grammar

Default captioned diagnostic phrase: `11,600 ms`; no-caption diagnostic phrase: `10,700 ms`. Neither is accepted taste.

| Beat | Default span | Meaning |
| --- | ---: | --- |
| `empty-stage-hold` | 600 ms | orientation before action |
| `frame-apparatus` | 1,100 ms | neutral frame enters |
| `frame-hold` | 500 ms | frame becomes readable |
| `placement-guides` | 1,100 ms | Project-known placement geometry appears |
| `guides-hold` | 600 ms | guide purpose becomes readable |
| `source-window` | 1,700 ms | intact source enters through one crop/reveal window |
| `source-hold` | 800 ms | source placement reads |
| `caption-if-known` | 900 ms | present only when a real Project caption exists; omitted entirely otherwise |
| `cleanup` | 1,000 ms | guides and cursor leave before finale |
| `resolved-hold` | 2,000 ms | exact finished frame |
| `deconstruct` | 1,300 ms | honest reverse of presentation apparatus to exact seam |

No beat teleports. Holds have zero velocity. A source without a caption does not pay for an invisible caption beat: cleanup starts 900 ms earlier and the readable floor drops from 7,900 to 7,300 ms. The source resolves at opacity `1`, filter `none`, normal blend. The evaluator owns every value.

## Timeline modes

- **Automatic:** one complete finite phrase using authored beat minima.
- **Fixed duration:** compile only when each readable beat and finale retain minimum duration. Requests below the readable floor return an explicit compromise issue and compile at the floor; they never silently crush the story.
- **Directed:** preserve fast ×2, regular ×1, fast ×1 intent by accelerating apparatus entry and final cleanup/deconstruction, while the source-placement middle stays regular and every beat retains its minimum readable duration.
- **Reverse:** available as honest deconstruction of Gallery's presentation apparatus. It does not claim to undo the artwork's design.
- **Terminal state:** source resolved, scaffolding absent, media clean.
- **Loop seam:** exact empty-stage state at normalized `0` and `1`.

## Candidate controls

No more than five Scene-only controls:

1. **Build detail** — `concise | regular | detailed`; chooses declared apparatus beats, never semantic artwork layers.
2. **Guide density** — `minimal | standard | technical`; changes only Project-known guide geometry.
3. **Cursor visibility** — `off | causal`; default `off`; causal cursor exists only during a declared Project-known placement operation.
4. **Per-beat hold** — bounded hold duration applied to intermediate readable holds.
5. **Finale hold** — bounded resolved-source hold.

All controls are causal, resettable, atelier-local, and round-trip candidates. Control schemas are not runtime Product contracts.

## Media counts and edge policy

- `0`: fail before apply with `minimum-items`.
- `1`: ordinary flat-source fallback.
- `2+`: consume first only; preserve and report extras. Never reinterpret extras as stages.
- Explicit-stage proposal: block with `source-role-contract-required` until `AT06-CONTRACT-AUTHORED-STAGES` exists.
- Failed primary source: retain source identity and show a stable unavailable placeholder through the same beats; never substitute another item.
- Video primary source: source frame samples Product story time; Scene does not create a second clock.
- Mixed ratios: source uses current honest fit/alignment capability; no focal-point field is invented.

## Source, Look, alpha, and audio boundaries

- Imported artwork: opacity `1`, filter `none`, normal blend, unchanged pixel buffer.
- Guides, frame, caption, and cursor are presentation layers outside source pixels.
- Transparent canvas: supported; fully empty pixels retain RGB `0`; no grain or tint leaks into alpha zero.
- Look: not authored here; no bloom, particles, rays, ripple, warp, caustics, confetti, texture, or lighting flourish.
- Audio: untouched Project service. Scene never changes source-video, presenter, soundtrack, master, mute, solo, gain, or ducking truth.

## Reduced motion and accessibility

Reduced motion uses discrete readable states: empty apparatus, guides, source placed, resolved. No continuous 3D or wipe animation. An ordered accessible description names only Project-known operations. Cursor is decorative and hidden from accessibility APIs. Controls retain keyboard focus and visible focus rings.

## Lifecycle and resources

- Pure evaluator accepts compiled Timeline, story time, source table, and controls.
- Preview, scrub, reduced-motion preview, and fixed-step capture call the same evaluator.
- One primary source decode; bounded DOM planes; no per-frame node creation.
- Remount/disposal releases source/video elements and observers.
- No network media, timers as story truth, CSS transitions as story truth, or shared phase framework.

## Risks

1. Apparatus-only construction may feel too procedural to earn a distinct catalogue Scene.
2. The current Product has no explicit authored-stage source-role contract.
3. Fixed-duration requests can conflict with minimum readable beats.
4. A visible cursor can quickly become fake process theatre.
5. The historical/live renderer encourages fabricated process decoration; production work must remove it rather than refine it.

## Later human and formal decisions

- Does apparatus-only construction earn The Build, or should the Scene remain blocked until explicit authored stages exist?
- Are the named beats readable at real speed?
- Are the five controls sufficient and causal?
- Is honest deconstruction an acceptable loop ending?
- Does the resolved hold feel exact and respectful?
- Formal S0 approval, G10C pressure verdict, shared-contract decision, production S1, and human taste acceptance remain pending.
