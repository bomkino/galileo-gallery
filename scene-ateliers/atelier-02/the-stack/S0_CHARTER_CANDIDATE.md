# S0 charter candidate — Calm Stack

Status: **candidate; human charter review pending**
Proposed identity: `the-stack` v1
Minimum/recommended/maximum media: 1 / 6 / 24

## Motion sentence

A weighted proof pile breathes without drift, then advances through one short side drift-and-return before settling into a new quiet order.

## Anti-motion sentence

Never become Swipe Stack slowed down, a random messy pile, a throw demo, or a generic breathing loop.

## Material and emotional metaphor

**Metaphor:** Printed proofs handled carefully at a worktable.
**Observable geometry/time:** The baseline, centre of mass, and perspective stay grounded. Stable item IDs produce tiny resting offsets. Breath is sub-millimetric in normalized units. Advancement uses no arc, no overshoot, and no rotation above two degrees.

No emotional claim relies on tint, texture, lighting, shadow, grain, blur, reflection, border, or artwork treatment.

## Coordinate system and composition

- **Fixed relationship:** Normalized stage origin at pile centre. The bottom slot and deck baseline never move during breath or advancement.
- **Depth topology:** Shallow ordered stack with deterministic 2D offsets. One side corridor permits the top proof to drift just far enough for a covered depth handoff.
- **Frame hierarchy:** Top proof is readable; subordinate cards establish thickness but remain eventual equals. No permanent hero.
- **Negative space:** Pile occupies no more than 58% stage width and 70% stage height. At least 18% clear space remains on the drift side.
- **Occlusion:** Depth handoff occurs under the top three projected bounds. The returning card is behind before it re-enters the pile silhouette.
- **View/camera:** one deterministic projected view; Interface Scale cannot change geometry or Project truth.
- **Frame fit:** source-faithful contain default. Canvas ratio and per-frame fit/crop/focal intent remain separate.

## Stable media roles and identities

Every item keeps a stable Project media ID. Failed/missing media retains its ID, ratio box, order, and phase participation. Source video uses the same stable ID and shared Product story clock.

No role is inferred from array mutation, artwork content, audio state, pointer state, or DOM order.

## Story grammar

- **Entry:** Cards assemble from depth in small sequential offsets, then become still.
- **Cycles:** Rest/breath → lift → short side drift → covered handoff → quiet return → settle.
- **Holds:** Most of each cycle is readable rest. Breath reaches zero displacement and zero velocity at hold boundaries.
- **Finale:** After the last authored advance, the pile holds with the selected top proof and no extra flourish.
- **Exit:** The complete pile lowers as one rigid object. No independent card movement.
- **Loop/seam:** A breath loop is mathematically closed in pose and first derivative. Story cycles remain finite unless Timeline authors a loop.
- **Terminal frame:** explicit Timeline terminal sample; never an accidental modulo of the first frame.
- **Reverse:** Supported: reverse order, opposite side corridor, inverse covered handoff, identical calm displacement limits.

### Deterministic phases

| Phase | Observable motion | Purpose |
| --- | --- | --- |
| rest/breath | closed cosine displacement | weight and attention |
| lift | ≤1.2% stage height | prepare proof |
| side-drift | ≤14% stage width | make room without throw |
| covered-handoff | full overlap | change depth safely |
| return | same corridor behind | new bottom placement |
| settle | critically damped, no overshoot | restore stillness |

## Timeline compilation

- **Automatic:** Advance each included item once, with long rests and one final settled hold.
- **Fixed duration:** Protect a minimum 55% rest share and all covered handoff minima. Reject targets that turn careful handling into a throw.
- **Directed:** Use fast ×2, fast ×2, regular ×1, fast ×1 as rest compression, not displacement amplification. Advance path geometry is unchanged.
- **Casino rhythm:** documented above; holds remain readable and source-video time never pauses.
- **Exact boundaries:** Rest/breath function is closed at both ends. Reorder owns the cycle-end sample only; z changes under explicit coveredHandoff=true.

## Ordinary default and essential controls

Default uses 6 items, 16:9 canvas, contain fit, forward direction, clean Scene output, and no Scene-owned Look.

| ID | Type | Bounds | Default | Reset | Independent consequence | Invalid |
| --- | --- | --- | --- | --- | --- | --- |
| `frameScale` | number | 0.34–0.7 / step 0.01 | `0.52` | `0.52` | proof dimensions and negative space | reject |
| `pileDepth` | integer | 2–8 / step 1 | `6` | `6` | visible subordinate slots | reject |
| `restingLooseness` | number | 0–1 / step 0.05 | `0.34` | `0.34` | ID-seeded static x/y/rotation offsets | reject |
| `breathAmount` | number | 0–1 / step 0.05 | `0.28` | `0.28` | closed-loop sub-pixel lift/compression | reject |
| `advanceCharacter` | number | 0–1 / step 0.05 | `0.32` | `0.32` | side corridor distance and acceleration curve within calm limits | reject |

Timing duration, direction, repeat, fit/crop/focal intent, Look, audio, and Interface Scale are not Scene controls.

## Capability and edge decisions

- **0 items:** truthful unavailable result with no fabricated card.
- **1 item:** Stable living proof: one closed breath, no reorder or fake depth exchange.
- **2 items:** Small A/B transfer with explicit front/back slots and full-overlap handoff.
- **Recommended:** 6 items produce the authored ordinary silhouette.
- **Awkward seven / ordinary eight:** both retain stable order and complete finite Timeline.
- **Bounded 24:** At 24, evaluate all identities and mount the top plus at most seven subordinate slots.
- **Mixed ratios:** stable ratio boxes; contain default; no stage-geometry jump from decoded media timing.
- **Canvases:** 16:9, 9:16, 1:1, 4:5, and 2576:1080. Reduce frame scale, move the drift corridor upward slightly, retain grounded baseline and horizontal handling.
- **Alpha:** no Scene background or post-process; alpha-zero RGB must remain zero.
- **Failed media:** explicit generated placeholder, same identity/order/ratio.
- **Video:** `sourceOffset + storyTime`; holds and pose changes do not pause, restart, stretch, or rewind it.
- **Fallback:** Pure 2D transforms; deterministic ID hashing; integer z slots.

## Ownership boundaries

- **Scene owns:** geometry, z/occlusion, deterministic story pose, finite Scene phase semantics, and only the five controls above.
- **Timeline owns:** mode, durations, direction, repeat, authored holds/cycles, terminal/loop policy.
- **Frame intent owns:** contain/cover/crop/focal treatment per media.
- **Look owns:** background, material, light, grid, texture, grain, vignette, shadow, radius, and world animation behind/around artwork.
- **Audio owns:** source-video, presenter, soundtrack, master, gain/mute/solo/duck.
- **Interface Scale owns:** application presentation only.
- **Export owns:** fps, fixed-step sampling, codec/container, alpha capability, destination, and job lifecycle.

## Accessibility and lifecycle

- **Reduced motion:** Application may present settled boundary poses with manual Next/Previous. Saved/exported breath and advances remain unchanged.
- **Keyboard:** Next/Previous author one measured advance. Space play/pause; Home reset. No focus transfer to moving cards.
- **Status:** Announce only settled top-card changes and play state.
- **Focus:** no autoplay focus theft; hidden/offstage cards cannot be focusable.
- **Resource limit:** At most pileDepth + 1 mounted cards; stable hashes computed from IDs; no interval, random source, or cumulative transform state.
- **Remount/disposal:** evaluator is pure and disposable. UI removes its single play handle/listeners and media mounts on remount, hidden window, and disposal.

## Provenance, risks, and reserved decisions

Provenance class: historical reference, rights unresolved, principle-only, code reused: none.

**Risks**

- calm can collapse into generic slowness if rests are shortened
- resting looseness could look random without stable-ID proof
- two-card handoff can resemble Swipe if corridor grows too far
- breath may disappear at small preview scale

**Reserved for human/serial review**

- human threshold for “breath” visibility
- whether one-item living pose is valuable enough
- minimum rest share
- catalogue name Calm Stack vs The Stack

No formal charter approval, production implementation, catalogue integration, package, release, or human acceptance is claimed.
