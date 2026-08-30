# S0 charter candidate — Swipe Stack

Status: **candidate; human charter review pending**
Proposed identity: `swipe-stack` v1
Minimum/recommended/maximum media: 1 / 5 / 24

## Motion sentence

The top card receives a decisive impulse, leaves in front, crosses behind under full occlusion, every remaining card advances, and the same identity settles at the bottom.

## Anti-motion sentence

Never disguise an array rotation with a crossfade, CSS transition, offscreen teleport, or generic index swap.

## Material and emotional metaphor

**Metaphor:** A decisive hand-dealt cycle.
**Observable geometry/time:** The deck centre of mass remains anchored. The active card follows a bounded front arc, disappears only while covered by the pile, then becomes visible on a rear tuck. The remaining cards advance as one physical consequence.

No emotional claim relies on tint, texture, lighting, shadow, grain, blur, reflection, border, or artwork treatment.

## Coordinate system and composition

- **Fixed relationship:** Normalized stage origin at deck centre. Resting deck baseline and centre of mass remain fixed; throw direction is a signed horizontal axis.
- **Depth topology:** Front flight plane, occlusion gate, rear return plane, and ordered resting depth slots. Z changes only during verified pile coverage.
- **Frame hierarchy:** Active top proof > advancing deck > returning rear proof. Identity, not array position, owns the moving card.
- **Negative space:** At least 30% stage width remains clear on authored throw side; pile itself stays inside a 42% × 62% central envelope.
- **Occlusion:** The active card may switch from front to rear z only when its projected bounds are at least 92% covered by the pile mask. The evaluator emits occlusion explicitly.
- **View/camera:** one deterministic projected view; Interface Scale cannot change geometry or Project truth.
- **Frame fit:** source-faithful contain default. Canvas ratio and per-frame fit/crop/focal intent remain separate.

## Stable media roles and identities

Every item keeps a stable Project media ID. Failed/missing media retains its ID, ratio box, order, and phase participation. Source video uses the same stable ID and shared Product story clock.

No role is inferred from array mutation, artwork content, audio state, pointer state, or DOM order.

## Story grammar

- **Entry:** Deck settles into a readable resting silhouette before any throw.
- **Cycles:** Rest → anticipation → release → front flight → occlusion crossing + deck advance → rear tuck → settle.
- **Holds:** A bounded rest separates authored cycles. Holds do not pause source-video story time.
- **Finale:** Final cycle settles and holds the resulting permutation as proof of continuity.
- **Exit:** Whole settled deck moves as one rigid object beyond the lower safe edge; no card order changes during exit.
- **Loop/seam:** Finite by default. Loop returns only from fully offstage exit to fully offstage entry with identical permutation policy.
- **Terminal frame:** explicit Timeline terminal sample; never an accidental modulo of the first frame.
- **Reverse:** Supported as the mathematical/physical inverse: inverse permutation, opposite throw, rear-to-front emergence, inverse deck retreat, and exact start pose.

### Deterministic phases

| Phase | Observable motion | Purpose |
| --- | --- | --- |
| rest | rigid settled deck | legibility |
| anticipation | small opposite preload | causal hand |
| release | top proof separates | commit impulse |
| front-flight | front z + bounded arc | decisive exit |
| occlusion-crossing | pile coverage gate | safe z handoff |
| deck-advance | remaining slots move forward | physical consequence |
| rear-tuck | same ID returns behind | continuity |
| settle | bounded damping | new permutation |

## Timeline compilation

- **Automatic:** Compile one cycle per media item up to the bounded 24-item maximum, followed by finale hold and exit.
- **Fixed duration:** Reject targets that cannot retain occlusion, rear-tuck, and settle minima. Scale rests first, then flight within bounded character limits; never collapse phases.
- **Directed:** Compile exactly four authored cycles when media allows: fast ×2, fast ×2, regular ×1, fast ×1. With fewer items, repeat identities through explicit permutations; with one item use press-return only.
- **Casino rhythm:** documented above; holds remain readable and source-video time never pauses.
- **Exact boundaries:** Permutation changes only at cycle end. The active card’s z-band changes inside occlusion crossing only when the evaluator also emits occluded=true. [start,end) ownership prevents double identities.

## Ordinary default and essential controls

Default uses 5 items, 16:9 canvas, contain fit, forward direction, clean Scene output, and no Scene-owned Look.

| ID | Type | Bounds | Default | Reset | Independent consequence | Invalid |
| --- | --- | --- | --- | --- | --- | --- |
| `frameScale` | number | 0.32–0.68 / step 0.01 | `0.5` | `0.5` | card dimensions and throw clearance | reject |
| `pileSpread` | number | 0.004–0.035 / step 0.001 | `0.016` | `0.016` | resting x/y slot offsets | reject |
| `visibleDepth` | integer | 2–8 / step 1 | `5` | `5` | mounted resting slots and silhouette thickness | reject |
| `throwArc` | number | 0.28–0.72 / step 0.01 | `0.5` | `0.5` | front-flight apex, rotation, and crossing path | reject |
| `settleCharacter` | number | 0–1 / step 0.05 | `0.42` | `0.42` | bounded overshoot/damping during settle only | reject |

Timing duration, direction, repeat, fit/crop/focal intent, Look, audio, and Interface Scale are not Scene controls.

## Capability and edge decisions

- **0 items:** truthful unavailable result with no fabricated card.
- **1 item:** No reorder. A bounded press, lift, and return acknowledges input without inventing a second depth slot.
- **2 items:** Exact A/B exchange. One card is always front or rear; z changes only under full overlap; no coplanar tie.
- **Recommended:** 5 items produce the authored ordinary silhouette.
- **Awkward seven / ordinary eight:** both retain stable order and complete finite Timeline.
- **Bounded 24:** At 24, render top, rear-moving card, and at most six depth slots. Deeper identities stay evaluated but not mounted.
- **Mixed ratios:** stable ratio boxes; contain default; no stage-geometry jump from decoded media timing.
- **Canvases:** 16:9, 9:16, 1:1, 4:5, and 2576:1080. Keep horizontal throw but shorten arc and increase upper/lower clearance. Do not rotate the physical grammar.
- **Alpha:** no Scene background or post-process; alpha-zero RGB must remain zero.
- **Failed media:** explicit generated placeholder, same identity/order/ratio.
- **Video:** `sourceOffset + storyTime`; holds and pose changes do not pause, restart, stretch, or rewind it.
- **Fallback:** 2D projected geometry with integer z bands and an explicit occlusion boolean; no GPU depth test.

## Ownership boundaries

- **Scene owns:** geometry, z/occlusion, deterministic story pose, finite Scene phase semantics, and only the five controls above.
- **Timeline owns:** mode, durations, direction, repeat, authored holds/cycles, terminal/loop policy.
- **Frame intent owns:** contain/cover/crop/focal treatment per media.
- **Look owns:** background, material, light, grid, texture, grain, vignette, shadow, radius, and world animation behind/around artwork.
- **Audio owns:** source-video, presenter, soundtrack, master, gain/mute/solo/duck.
- **Interface Scale owns:** application presentation only.
- **Export owns:** fps, fixed-step sampling, codec/container, alpha capability, destination, and job lifecycle.

## Accessibility and lifecycle

- **Reduced motion:** Application may replace live audition with explicit Next/Previous and show settled boundary poses. Export truth retains authored physical motion.
- **Keyboard:** Next/Previous author the same bounded action intent as Apply Throw. Escape cancels audition only. Focus stays on controls; no draggable card becomes the sole input path.
- **Status:** Announce “Card X moved to back; Y now on top” after settle, never pointer coordinates or every phase.
- **Focus:** no autoplay focus theft; hidden/offstage cards cannot be focusable.
- **Resource limit:** At most visibleDepth + 1 mounted cards; no cloned deck; no queued animation; evaluator allocates one pose per media ID and no time-growing collections.
- **Remount/disposal:** evaluator is pure and disposable. UI removes its single play handle/listeners and media mounts on remount, hidden window, and disposal.

## Provenance, risks, and reserved decisions

Provenance class: historical reference, rights unresolved, principle-only, code reused: none.

**Risks**

- portable Project has no authored discrete action/permutation event
- mid-flight save semantics are unresolved
- occlusion threshold must be proved across mixed ratios
- gesture apply UI could accidentally privilege pointer over keyboard

**Reserved for human/serial review**

- whether in-flight authored state is portable or only boundary events are
- cancel-to-start vs cancel-to-nearest-safe-boundary
- reverse availability in first production ticket
- shared permutation primitive shape after deletion tests

No formal charter approval, production implementation, catalogue integration, package, release, or human acceptance is claimed.
