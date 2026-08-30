# Edge cases, resources, and accessibility — Focus Strip

## Source-count policy

| Count | Candidate behaviour |
| ---: | --- |
| 0 | Product capability copy; prototype rejects. No fake placeholder sequence in final Scene. |
| 1 | One still documentary frame exactly at station. |
| 2 | Same-direction circular scan with long offstage return; no visible oscillation. |
| 3–5 | Sparse editorial strip retaining adjacent sequence context. |
| 6–12 | Primary inspection range. |
| 13–24 | Bounded long sequence; all IDs evaluated, visible mount set bounded. |
| >24 | Explicit rejection; never silent truncation, reorder, or duplicated identities. |

## Mixed and failed media

Equal outer frames provide inspection rhythm. Inner source boxes honour each source ratio and contain/cover intent. Landscape, portrait, square, cinematic, and vertical sources coexist without changing slot spacing.

A failed item keeps:

- ID and source index;
- stable caption/index;
- track slot and traversal order;
- station focus eligibility;
- explicit crossed placeholder.

## Canvas orientation

The evidence packet covers 1920×1080, 1080×1920, 1080×1080, and 1080×1350. Height/width above 1.2 triggers vertical inspection. S1 must account for real caption metrics and safe-area/UI overlays without shrinking portrait into a token horizontal row.

## Keyboard and focus

- DOM/accessibility order is source order, never visual wrap order.
- Horizontal: Left/Right changes requested index.
- Vertical: Up/Down changes requested index.
- Home/End select first/last source.
- Space controls prototype transport only.
- Animation never moves DOM focus.
- Accessible name includes one-based index, name/caption, failed state, and registered-at-station state.
- Registration marks, station rule, and debug geometry are decorative and hidden from accessibility APIs.

## Reduced motion

The strip stops. Explicit selection places one source at station, with all other sources in stable ordered positions. The apparatus remains complete; no generic list, source dimming, or card zoom replaces it.

## Resource bounds

- maximum accepted identities: 24;
- evaluator card states: exactly accepted count;
- duplicate loop identities: 0;
- retained prior frames: 0;
- evaluator timers/listeners: 0;
- network requests: 0;
- generated fixture media only;
- later mount policy: stage-intersecting cards plus one offstage margin;
- fixed-step observation: deterministic output with no collection growth.

The browser prototype owns one `requestAnimationFrame` transport callback and removes it on page disposal. A Product renderer must release decoded images/video/proxies, cancel transport, disconnect observers, and preserve source order across remount.

## Context loss and fallback

A 2D/CSS fallback preserves full identity: planar ordered frames, fixed station, registration marks, scan stops, and labels. WebGL is unnecessary. On context loss, prefer a static selected source at station over restarting at a different index or hiding failed media.

## Keyboard focus versus animated focus

Animated station focus is story state. Keyboard focus is user state. They may coincide, but animation must not steal keyboard focus. Reduced motion uses keyboard selection as static station target; normal playback can expose both states accessibly without conflating them.

## Performance claims not made

No browser heap profiler, long-run decoded-video test, real font layout benchmark, remount automation, GPU context-loss harness, or Product export performance run occurred. The packet proves bounded deterministic mechanics only.
