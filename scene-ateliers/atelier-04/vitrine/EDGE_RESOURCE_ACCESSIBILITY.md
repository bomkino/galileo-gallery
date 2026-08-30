# Edge, resource, and accessibility policy — Vitrine

## Count matrix

| Count | Behaviour |
| --- | --- |
| `0` | Empty Product state. No invented frame, light, or placard. |
| `1` | Still object at centre; no fake loop motion. |
| `2` | One hold plus one bounded handoff pair. |
| `3` | Sequential chapters; only current/incoming observed. |
| `8` | Recommended pacing/ratio fixture. |
| `127` | Complete ordered identity state; maximum two stage nodes. |

## Ratio and canvas edges

- Natural ratio always retained.
- 16:9: broad horizontal negative space.
- 1:1 / 4:5: source remains above optical centre; placard below.
- 9:16: fewer/larger works is inherent because only one work is readable; wide sources become shorter.
- Extreme ratios are clamped to safe numeric bounds and width-limited, never force-cropped.
- Transition offstage distance includes each source’s own half-width plus margin, so both endpoints are honestly outside.

## Media edges

- Failed source: deterministic placeholder with same ID, caption, chapter, dimensions, and transition role.
- Source video: story-time sampling independent of visibility; seek before incoming becomes readable.
- Warm budget: current + incoming guard (`<=2`).
- Decode failure does not skip source or mutate sequence.
- Transparent source: no forced matte, paper, border, reflection, or glow.

## DOM/GPU/media resource budget

- complete evaluator records: `N`;
- stage source nodes: `0`, `1`, or `2`;
- placard nodes: `0` or `1`;
- ResizeObserver: at most one in Product integration;
- transport requestAnimationFrame: at most one while playing, cancelled when paused/unmounted;
- warm video decoders: normally `<=2`;
- WebGL contexts/textures: `0` required;
- network requests: `0` in prototype.

DOM/CSS transforms are sufficient. Adding WebGL would increase source-colour, alpha, context-loss, memory, and accessibility risk without a demonstrated Scene need.

## Remount, disposal, and fallback

On remount/resize:

- Offscreen outgoing/incoming planes are not focusable, decoder-warm, or semantic current-source authority.
- evaluate from config + ordered media + story time;
- reconstruct active source IDs and exact poses;
- seek active video to evaluated source time;
- preserve placard semantics;
- never resume from hidden local phase.

On disposal:

- cancel transport frame;
- disconnect observers;
- remove event listeners;
- pause/release video guards;
- release object URLs under Product media policy;
- discard environmental Look layers.

Honest fallback: one source-faithful static object with external caption, or discrete previous/next inspection. Do not substitute a crossfade slideshow and call it equivalent.

## Reduced motion

- Settles one deterministic source at centre.
- Removes exchange, yaw, depth, and entry/exit motion.
- Does not pulse, fade, auto-advance, or sweep light.
- System preference changes preview presentation only; exported truth changes only through explicit authored intent.

## Keyboard and focus

- Previous/next inspect source order.
- Current readable source announces name/caption and `item X of N`.
- During exchange, semantic focus stays with outgoing until incoming reaches the declared handoff threshold, then transfers once; no focus oscillation by z-order.
- Inactive sources remain available in the authoring list but are not stage-focusable.
- Placard is associated with current source via accessible description; it is not separately focusable unless it contains an explicit action.
- Play, pause, scrub, all controls, Reset, and readback are keyboard operable.

## Honest unsupported capabilities

- Product renderer integration;
- external-user-media pixel equality;
- target-platform compositor/performance evidence;
- Product source-video decoder lifecycle;
- encoded transparent export evidence;
- screen-reader human testing;
- human motion/taste/source-respect verdict;
- reflection/sheen capability.
