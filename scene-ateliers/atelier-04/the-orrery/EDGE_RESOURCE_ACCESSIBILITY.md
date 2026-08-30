# Edge, resource, and accessibility policy — The Orrery

Status: **G10B preflight candidate; implementation blocked by G10A**

## Count and role matrix

| Case | Behaviour |
| --- | --- |
| `0` | Product empty state. No implicit primary or decorative placeholder system. |
| `1` | One serialized primary at centre. Zero ring guides. Reduced motion and loop are identical settled hierarchy. |
| `2` | One primary + one satellite on one ring. Directed role exchange remains continuous and meaningful. |
| `5` | Auto resolves to two rings. Signed `[2,-1]` reconciliation. |
| `9` | Recommended default. Auto resolves to three rings. |
| `21` | Three rings; complete state; bounded observed DOM/GPU sources. |
| `127` | Complete identity/membership state; at most 24 landscape or 18 portrait satellites observed, plus two protected role nodes. |

Missing/absent serialized primary is unsupported and rejects. Fixed first item is not a fallback.

## Media edges

- Mixed natural ratios remain natural; portrait wide-card reduction only changes plane height, not source crop.
- Failed media produce a deterministic placeholder at the same ID/role/membership.
- Source video uses Project story time, pauses/releases when outside warmth policy, and seeks before reappearance.
- During role exchange, both old and new primary may remain warm; no more than one additional near guard video should remain warm.
- Media decode failure cannot reorder satellites or choose a new primary.

## DOM/CSS 3D production candidate

Advantages:

- source elements remain ordinary image/video planes;
- native accessibility and focus semantics are straightforward;
- deterministic z-order and transform evidence already exists;
- no new rendering engine or texture upload path;
- clean fallback can use the same evaluator.

Costs/limits:

- many transformed layers may stress compositor memory;
- nested occlusion may be less precise than a depth buffer;
- browser-specific transform flattening and perspective need target tests;
- source-video layer count must remain tightly bounded.

Candidate budget:

- complete evaluator records: `N` identities;
- observed satellites: `24` landscape / `18` portrait;
- protected role nodes: at most `2` during exchange;
- guide nodes: `0` by default, at most `3` diagnostic;
- warm videos: primary + incoming/near guard, normally `<=2`.

## WebGL decision criteria

WebGL is not implemented here. It may be earned only if target evidence shows DOM/CSS 3D cannot meet a defined requirement such as stable nested-plane performance or occlusion at accepted counts.

A production WebGL path must prove:

- exact pure-evaluator parity;
- source-faithful texture sampling and colour/alpha;
- bounded texture uploads and eviction;
- deterministic z/depth ordering;
- context-loss recovery from config/media/story time;
- accessible semantic mirror without duplicate Project authority;
- static/DOM fallback using the same primary/membership roles;
- no mandatory lighting/post-processing.

It may not add a rendering engine solely for metaphor or visual novelty.

## Fallback and context loss

Honest fallback:

1. settled DOM/static primary + satellites at canonical pose;
2. preserved serialized primary and membership;
3. no fake animation, glow, or simplified generic orbit marketed as equivalent.

On WebGL context loss, compositor reset, remount, or resize:

- stop observations and media warmth;
- release textures/listeners/observers;
- rebuild from immutable config + ordered media + story time;
- restore the same role/membership state;
- never continue from an untracked phase accumulator.

## Offscreen, remount, and disposal

- Offscreen/unobserved satellites keep evaluator membership but no stage focus, warm decoder, or renderer-local authority.
- Remount at identical config/media/story time restores primary, ring/slot membership, exchange state, and depth order exactly.
- Disposal cancels transport, removes observers/listeners/guides, releases DOM media or WebGL resources if a later path is earned, and discards all ephemeral render state.

## Reduced motion

- System preference settles the preview at canonical master cycle while preserving hierarchy.
- It does not change portable Project/export truth.
- Explicit authoring may create a settled or discrete-exchange variant.
- No pulse, fade, parallax, glow, or hidden autoplay substitutes for orbit motion.

## Keyboard, focus, and semantics

- Focus order follows ordered media, not depth-sorted render order.
- Primary announces `Primary, item X of N`.
- Satellites announce stable item position and optional ring/slot only in authoring diagnostics.
- Previous/next inspects ordered media. A “set primary” or exchange command must serialize intent before export authority changes.
- Offstage/unobserved satellites remain represented in authoring lists but are not stage-focusable.
- Orbit guides are `aria-hidden`.
- Play, pause, scrub, controls, Reset, and exact readback remain keyboard operable in the laboratory.

## Lifecycle checks

- one ResizeObserver maximum per mounted stage;
- one transport requestAnimationFrame maximum, cancelled on pause/unmount;
- no interval/timer in evaluator;
- remove keyboard/pointer/listener bindings on disposal;
- pause/release off-budget video decoders;
- discard diagnostic guide nodes on reset;
- same-input/time after remount must match pre-remount state.

## Honest unsupported capabilities

- Product renderer integration;
- WebGL production implementation;
- final renderer choice;
- G10B activation/approval/closure;
- G10A contract incorporation;
- external-user-media pixel equivalence;
- target Garuda/Apple-Silicon performance;
- screen-reader human testing;
- human motion/taste acceptance.
