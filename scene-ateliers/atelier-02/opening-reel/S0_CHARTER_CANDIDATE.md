# S0 charter candidate — Opening Reel

Status: **candidate; human charter review pending**
Proposed identity: `opening-reel` v1
Minimum/recommended/maximum media: 1 / 8 / 24

## Motion sentence

A finite reel crosses one fixed proscenium, grants selected frames readable ceremony, resolves one climax, then leaves a deliberate terminal frame.

## Anti-motion sentence

Never become an endless ticker, equal-beat slideshow, collection browser, stack, or Look-driven spectacle.

## Material and emotional metaphor

**Metaphor:** A title sequence screened once with intent.
**Observable geometry/time:** The stage centre never moves. A strip advances behind it; selected frames grow only at the centre; neighbours yield geometrically; the finale clears competing cards by moving them offstage, not by dimming or filtering them.

No emotional claim relies on tint, texture, lighting, shadow, grain, blur, reflection, border, or artwork treatment.

## Coordinate system and composition

- **Fixed relationship:** A normalized stage with origin at centre. The proscenium focus line is x=0; stage camera and safe area remain fixed while the reel coordinate advances.
- **Depth topology:** One planar travel lane with deterministic shallow y/rotation lanes. Spotlight temporarily becomes the front plane. Finale becomes the only onstage plane.
- **Frame hierarchy:** Ordinary travel frames < current Spotlight < finale. Hierarchy uses position, scale, z-order, and time only.
- **Negative space:** Default frame height leaves at least 18% canvas height above and below the lane. Spotlight keeps a minimum 7% stage-width gap after neighbour displacement.
- **Occlusion:** Travel cards may overlap only at offstage entrances. Spotlight neighbours are displaced, never covered. Finale competitors cross the safe-area edge before becoming non-rendered.
- **View/camera:** one deterministic projected view; Interface Scale cannot change geometry or Project truth.
- **Frame fit:** source-faithful contain default. Canvas ratio and per-frame fit/crop/focal intent remain separate.

## Stable media roles and identities

Every item keeps a stable Project media ID. Failed/missing media retains its ID, ratio box, order, and phase participation. Source video uses the same stable ID and shared Product story clock.

Candidate visual roles are `ordinary`, `spotlight`, `finale`, and `skip`. They require a future explicit portable field; current audio mute must never infer them.

## Story grammar

- **Entry:** Lead-in stillness, then the first edge arrives with enough neighbouring context to reveal direction.
- **Cycles:** Travel leg → optional Spotlight grow → readable hold → return → next travel. Ordinary cards cross without stamped pauses.
- **Holds:** Spotlight and finale holds freeze geometry while shared source-video time continues.
- **Finale:** The last included story item reaches centre, expands, and sends all competitors beyond the safe area. No artwork opacity/filter change.
- **Exit:** The finale leaves on a single vertical continuation; terminal output is a clean empty stage or an explicitly retained terminal frame, selected by Timeline intent.
- **Loop/seam:** Default is finite and has no loop. Optional loop inserts an explicit empty-stage seam before the first lead-in; no crossfade.
- **Terminal frame:** explicit Timeline terminal sample; never an accidental modulo of the first frame.
- **Reverse:** Reverse reverses included media order, travel direction, Spotlight order, and finale selection. Beat roles stay attached to stable media IDs.

### Deterministic phases

| Phase | Observable motion | Purpose |
| --- | --- | --- |
| lead-in | 0 movement | establish proscenium |
| travel | trapezoidal velocity | bring next authored beat to centre |
| spotlight-grow | monotonic scale + neighbour yield | transfer attention |
| spotlight-hold | geometry fixed | read |
| spotlight-return | inverse geometry | restore lane |
| finale-grow | single authority expansion | climax |
| finale-hold | geometry fixed | resolve |
| exit | vertical continuation | end screening |

## Timeline compilation

- **Automatic:** Compile one complete screening over every included beat with minimum readable holds and a single finale.
- **Fixed duration:** Preserve minimum travel, Spotlight, and finale holds. Reject targets below the computed honest minimum; stretch travel slack and non-final holds proportionally above it.
- **Directed:** Apply fast ×2, fast ×2, regular ×1, fast ×1 only to the first four travel legs. Additional legs run regular. Spotlight/finale holds remain authored and unscaled.
- **Casino rhythm:** documented above; holds remain readable and source-video time never pauses.
- **Exact boundaries:** Events own [start,end). At end, the next event owns the sample. Terminal time equals the explicit terminal frame and is never modulo-wrapped unless loop is authored.

## Ordinary default and essential controls

Default uses 8 items, 16:9 canvas, contain fit, forward direction, clean Scene output, and no Scene-owned Look.

| ID | Type | Bounds | Default | Reset | Independent consequence | Invalid |
| --- | --- | --- | --- | --- | --- | --- |
| `frameScale` | number | 0.28–0.72 / step 0.01 | `0.46` | `0.46` | card width/height and visible context | reject |
| `gap` | number | 0.02–0.18 / step 0.005 | `0.08` | `0.08` | lane stride and Spotlight neighbour clearance | reject |
| `travelCharacter` | number | 0–1 / step 0.05 | `0.45` | `0.45` | launch/cruise/brake easing shape; never duration | reject |
| `spotlightScale` | number | 1.1–1.65 / step 0.01 | `1.38` | `1.38` | Spotlight frame scale and neighbour displacement | reject |
| `finaleScale` | number | 1.15–1.85 / step 0.01 | `1.62` | `1.62` | finale frame scale and clearance trajectory | reject |

Timing duration, direction, repeat, fit/crop/focal intent, Look, audio, and Interface Scale are not Scene controls.

## Capability and edge decisions

- **0 items:** truthful unavailable result with no fabricated card.
- **1 item:** One item becomes a concise lead-in, finale grow, hold, and exit. No counterfeit reel travel.
- **2 items:** One contextual arrival and one finale. The first card remains legible without pretending a long strip exists.
- **Recommended:** 8 items produce the authored ordinary silhouette.
- **Awkward seven / ordinary eight:** both retain stable order and complete finite Timeline.
- **Bounded 24:** At 24, only a bounded window around the proscenium renders; all 24 identities remain in evaluator order.
- **Mixed ratios:** stable ratio boxes; contain default; no stage-geometry jump from decoded media timing.
- **Canvases:** 16:9, 9:16, 1:1, 4:5, and 2576:1080. Keep the horizontal reel identity. Reduce frame scale and visible neighbour count; do not invent a vertical rail.
- **Alpha:** no Scene background or post-process; alpha-zero RGB must remain zero.
- **Failed media:** explicit generated placeholder, same identity/order/ratio.
- **Video:** `sourceOffset + storyTime`; holds and pose changes do not pause, restart, stretch, or rewind it.
- **Fallback:** Pure 2D transforms and explicit integer z-order. No preserve-3d/WebGL dependency.

## Ownership boundaries

- **Scene owns:** geometry, z/occlusion, deterministic story pose, finite Scene phase semantics, and only the five controls above.
- **Timeline owns:** mode, durations, direction, repeat, authored holds/cycles, terminal/loop policy.
- **Frame intent owns:** contain/cover/crop/focal treatment per media.
- **Look owns:** background, material, light, grid, texture, grain, vignette, shadow, radius, and world animation behind/around artwork.
- **Audio owns:** source-video, presenter, soundtrack, master, gain/mute/solo/duck.
- **Interface Scale owns:** application presentation only.
- **Export owns:** fps, fixed-step sampling, codec/container, alpha capability, destination, and job lifecycle.

## Accessibility and lifecycle

- **Reduced motion:** Application presentation may show the authored finale still and provide Restart. Saved/exported Timeline remains unchanged.
- **Keyboard:** Space play/pause; Home restart; Left/Right scrub one frame; Shift+Left/Right previous/next cue. No key mutates story roles without an explicit apply action.
- **Status:** Announce play/pause, cue identity, and terminal state only. Do not announce every travel frame.
- **Focus:** no autoplay focus theft; hidden/offstage cards cannot be focusable.
- **Resource limit:** At most 9 mounted cards around the proscenium; 24 evaluated identities; zero timers/rAF in evaluator; one UI animation handle disposed on remount.
- **Remount/disposal:** evaluator is pure and disposable. UI removes its single play handle/listeners and media mounts on remount, hidden window, and disposal.

## Provenance, risks, and reserved decisions

Provenance class: historical reference, rights unresolved, principle-only, code reused: none.

**Risks**

- visual story-role field does not yet exist in portable Project
- fixed-duration rejection needs Product-facing copy
- finale terminal-frame policy needs human decision
- very wide art can starve Spotlight neighbour context

**Reserved for human/serial review**

- portable visual role name: storyRole vs includeInStory/skipBeat
- terminal empty stage vs held finale
- exact minimum readable hold
- whether a one-item reel deserves catalogue availability

No formal charter approval, production implementation, catalogue integration, package, release, or human acceptance is claimed.
