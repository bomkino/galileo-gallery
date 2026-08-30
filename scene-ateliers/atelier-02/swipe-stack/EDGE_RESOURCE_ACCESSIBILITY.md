# Edge, resource, and accessibility policy — Swipe Stack

## Fixture matrix

| Fixture | Required behaviour |
| --- | --- |
| 0 | unavailable with causal reason; no fabricated media |
| 1 | No reorder. A bounded press, lift, and return acknowledges input without inventing a second depth slot. |
| 2 | Exact A/B exchange. One card is always front or rear; z changes only under full overlap; no coplanar tie. |
| recommended 5 | ordinary authored silhouette |
| awkward 7 / ordinary 8 | stable order, complete Timeline, mixed ratios |
| bounded 24 | At 24, render top, rear-moving card, and at most six depth slots. Deeper identities stay evaluated but not mounted. |
| 16:9 / 9:16 / 1:1 / 4:5 / 2576:1080 | deterministic recomposition; Keep horizontal throw but shorten arc and increase upper/lower clearance. Do not rotate the physical grammar. |
| transparent soft edge | no Scene contamination; zero RGB under alpha zero |
| opaque | opacity 1/filter none/normal blend |
| failed media | same stable ID/order/ratio; explicit placeholder |
| video + non-zero offset | exact shared story time |
| reverse | Supported as the mathematical/physical inverse: inverse permutation, opposite throw, rear-to-front emergence, inverse deck retreat, and exact start pose. |
| extreme valid parameters | finite geometry, bounded mount count, no collisions beyond declared occlusion |

## Resource contract

At most visibleDepth + 1 mounted cards; no cloned deck; no queued animation; evaluator allocates one pose per media ID and no time-growing collections.

- 24 is the candidate maximum, not a promise to decode 24 videos simultaneously.
- Scene evaluator returns one bounded pose per ID; renderer mounts only the declared visible set.
- Product media decode/cache ownership remains outside Scene.
- No duplicate infinite strip/deck, setInterval, unbounded queued animation, mutation observer, network request, or hidden analytics.
- Hidden window pauses application presentation only. Story truth is sampled from explicit Product time on resume.

## Lifecycle

Prototype exposes Restart, Remount, and Dispose. Dispose cancels its single presentation animation frame and removes listeners. Remount reconstructs UI from immutable inputs; stable-ID offsets and output digests remain equal. The pure evaluator itself has no lifecycle.

## Keyboard and focus

Next/Previous author the same bounded action intent as Apply Throw. Escape cancels audition only. Focus stays on controls; no draggable card becomes the sole input path.

- All controls have native labels and focus rings.
- Offstage/hidden cards are not tabbable.
- Autoplay/playback never moves focus.
- Pointer audition never becomes the only authoring path.

## Status and announcement policy

Announce “Card X moved to back; Y now on top” after settle, never pointer coordinates or every phase.

Use one polite status region. No per-frame, pointer-coordinate, animation-progress, or source-video-time announcement spam.

## Reduced motion

Application may replace live audition with explicit Next/Previous and show settled boundary poses. Export truth retains authored physical motion.

Reduced motion changes application presentation only. It never mutates saved Scene parameters, Timeline intent, exported motion, direction, media order, or source-video time.

## Fallback

2D projected geometry with integer z bands and an explicit occlusion boolean; no GPU depth test.

Fallback must preserve identity, order, front/rear ownership, and exact terminal pose. If a capability cannot preserve those, report truthful unavailability instead of substituting another Scene.
