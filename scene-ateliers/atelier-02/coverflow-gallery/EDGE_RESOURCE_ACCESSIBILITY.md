# Edge, resource, and accessibility policy — Coverflow Gallery

## Fixture matrix

| Fixture | Required behaviour |
| --- | --- |
| 0 | unavailable with causal reason; no fabricated media |
| 1 | Stable exact front plane with a closed micro-breath disabled by default. |
| 2 | Ping-pong A↔B with explicit direction; no circular shortest-path tie. |
| recommended 7 | ordinary authored silhouette |
| awkward 7 / ordinary 8 | stable order, complete Timeline, mixed ratios |
| bounded 24 | At 24, evaluate all identities; mount front plus at most four on each side, bounded by visibleRange. |
| 16:9 / 9:16 / 1:1 / 4:5 / 2576:1080 | deterministic recomposition; Retain horizontal rail. Reduce frame scale, gap, and effective visible range; do not invent a vertical coverflow. |
| transparent soft edge | no Scene contamination; zero RGB under alpha zero |
| opaque | opacity 1/filter none/normal blend |
| failed media | same stable ID/order/ratio; explicit placeholder |
| video + non-zero offset | exact shared story time |
| reverse | Supported by signed virtual focus progression and inverse shortest-path intent. |
| extreme valid parameters | finite geometry, bounded mount count, no collisions beyond declared occlusion |

## Resource contract

Mount at most 2×visibleRange+1 cards; no duplicated infinite strip, interval, reflection surface, or GPU depth state.

- 24 is the candidate maximum, not a promise to decode 24 videos simultaneously.
- Scene evaluator returns one bounded pose per ID; renderer mounts only the declared visible set.
- Product media decode/cache ownership remains outside Scene.
- No duplicate infinite strip/deck, setInterval, unbounded queued animation, mutation observer, network request, or hidden analytics.
- Hidden window pauses application presentation only. Story truth is sampled from explicit Product time on resume.

## Lifecycle

Prototype exposes Restart, Remount, and Dispose. Dispose cancels its single presentation animation frame and removes listeners. Remount reconstructs UI from immutable inputs; stable-ID offsets and output digests remain equal. The pure evaluator itself has no lifecycle.

## Keyboard and focus

Left/Right author previous/next focus. Home/End choose bounded endpoints where non-looping. Hidden cards are not focusable; focus remains on controls.

- All controls have native labels and focus rings.
- Offstage/hidden cards are not tabbable.
- Autoplay/playback never moves focus.
- Pointer audition never becomes the only authoring path.

## Status and announcement policy

Announce settled front identity and position “n of N”. Autoplay never steals focus.

Use one polite status region. No per-frame, pointer-coordinate, animation-progress, or source-video-time announcement spam.

## Reduced motion

Application may jump between exact front stops. Saved/exported traversal remains unchanged.

Reduced motion changes application presentation only. It never mutates saved Scene parameters, Timeline intent, exported motion, direction, media order, or source-video time.

## Fallback

Pure projected 2D x/scale/yaw-width geometry with integer z. No reflection or preserve-3d requirement.

Fallback must preserve identity, order, front/rear ownership, and exact terminal pose. If a capability cannot preserve those, report truthful unavailability instead of substituting another Scene.
