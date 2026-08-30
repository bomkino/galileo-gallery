# Edge, resource, and accessibility policy — The Shelf

## Count matrix

| Count | Behaviour |
| --- | --- |
| `0` | Empty Product state; no baseline-only counterfeit content. |
| `1` | One centred still edition, one semantic/source node, no duplicate seam slots. |
| `2` | Expanded safe track, stable handoff, all seams offstage. |
| `4` | Small collected row with clear natural widths/lean. |
| `8` | Recommended default. |
| `21` | Dense mixed ratios, complete state, bounded observation. |
| `127` | Complete source/layout state; <=18 landscape / <=12 portrait observed nodes; 127/127 seams proven offstage. |

## Horizontal-only support

Supported axis: horizontal.

Unsupported: vertical shelf, vertical ticker, rotated ledge, stacked bookcase, or responsive axis swap. Portrait canvas still contains a horizontal shelf showing fewer/larger works. This is an honest limitation, not a missing toggle.

## Media edges

- Natural ratios from `0.2–4` remain ratio-faithful; very wide sources reduce height.
- Failed media preserve ID, dimensions, order, lean, baseline, seam, caption, and focus role.
- Source video uses story-time sampling, not DOM visibility time.
- Warm decoder policy: focused/near current and one approaching guard, normally `<=2`.
- Recycling copy change does not duplicate decoders; both slots refer to one media service identity, and only one may be visible/warm.
- Decode failure never removes spacing or shifts Project order.

## Resource budgets

- complete source/layout records: `N`;
- candidate observed DOM/GPU source slots: max 18 landscape / 12 portrait;
- visible duplicates per Project source: `0`;
- ledge/baseline nodes: one;
- optional focus caption marker: at most one, absent in transparency;
- ResizeObserver: at most one in Product integration;
- requestAnimationFrame: at most one preview transport, cancelled on pause/unmount;
- WebGL contexts/physics engines: zero required;
- network media in prototype: zero.

## Seam machinery lifecycle

- Copy indices are ephemeral render-slot IDs only.
- Project media, captions, focus, video/audio, and selection remain keyed by unique source ID.
- On each pure evaluation, candidate `k=-1,0,1` copies are recomputed and bounded.
- Offstage slots are not focusable and should not keep warm decoders.
- Disposal removes slots/listeners/observers and releases media through Product services.
- Remount reconstructs exact visible copy indices/poses from story time; no accumulated scroll offset exists.

## Offscreen, remount, and disposal

- Offscreen recycling copies are `aria-hidden`, non-focusable, decoder-cold, and remain render machinery rather than media identities.
- Remount at identical config/media/story time reconstructs the same baseline, natural-width centres, copy indices, Spotlight pose, and source-video seek.
- Disposal cancels transport, disconnects observers/listeners, releases off-budget media, and removes all wrapped-copy slots.

## Reduced motion

- Settles the row at serialized Spotlight alignment.
- Selected edition remains straight/lifted; neighbours remain grounded.
- No autoplay, pulsing, fade, parallax, or centre zoom substitutes for walking motion.
- System preference changes preview only; explicit authored reduced-motion Project truth is separate.

## Keyboard and focus semantics

- Previous/next follows Project order, never wrapped-copy DOM order.
- Current edition announces name/caption and `item X of N`.
- A duplicate seam slot is `aria-hidden`; semantic source exists once.
- During Spotlight, selected source remains in normal Project order and announces focused state.
- Offstage/unobserved sources remain available in the authoring list but are not stage-focusable.
- Captions are outside artwork and do not become duplicate focus targets.
- Play, pause, scrub, controls, Reset, and exact readback are keyboard operable.

## Fallback

Honest fallback: static horizontal row on one baseline, or manual previous/next strip inspection with natural widths. Do not fall back to a centre-focused generic carousel, forced-ratio grid, or vertical list and call it equivalent.

## Lifecycle/disposal

On resize, remount, media update, or direction change:

- recompute dimensions, safety track, centres, baseline, and seam slots;
- preserve Project order and stable identity lean;
- re-seek active video to evaluated story time;
- release off-budget decoder/object resources;
- never mutate stored media because a render copy enters/exits.

## Honest unsupported capabilities

- vertical orientation;
- Product renderer/registry integration;
- encoded alpha export evidence;
- external source RGB equivalence;
- target-platform performance/heap evidence;
- real decoder/object URL disposal evidence;
- screen-reader human testing;
- human motion/taste/source-respect verdict.
