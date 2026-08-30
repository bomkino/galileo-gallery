# Edge, resource, and accessibility policy — Opening Reel

## Fixture matrix

| Fixture | Required behaviour |
| --- | --- |
| 0 | unavailable with causal reason; no fabricated media |
| 1 | One item becomes a concise lead-in, finale grow, hold, and exit. No counterfeit reel travel. |
| 2 | One contextual arrival and one finale. The first card remains legible without pretending a long strip exists. |
| recommended 8 | ordinary authored silhouette |
| awkward 7 / ordinary 8 | stable order, complete Timeline, mixed ratios |
| bounded 24 | At 24, only a bounded window around the proscenium renders; all 24 identities remain in evaluator order. |
| 16:9 / 9:16 / 1:1 / 4:5 / 2576:1080 | deterministic recomposition; Keep the horizontal reel identity. Reduce frame scale and visible neighbour count; do not invent a vertical rail. |
| transparent soft edge | no Scene contamination; zero RGB under alpha zero |
| opaque | opacity 1/filter none/normal blend |
| failed media | same stable ID/order/ratio; explicit placeholder |
| video + non-zero offset | exact shared story time |
| reverse | Reverse reverses included media order, travel direction, Spotlight order, and finale selection. Beat roles stay attached to stable media IDs. |
| extreme valid parameters | finite geometry, bounded mount count, no collisions beyond declared occlusion |

## Resource contract

At most 9 mounted cards around the proscenium; 24 evaluated identities; zero timers/rAF in evaluator; one UI animation handle disposed on remount.

- 24 is the candidate maximum, not a promise to decode 24 videos simultaneously.
- Scene evaluator returns one bounded pose per ID; renderer mounts only the declared visible set.
- Product media decode/cache ownership remains outside Scene.
- No duplicate infinite strip/deck, setInterval, unbounded queued animation, mutation observer, network request, or hidden analytics.
- Hidden window pauses application presentation only. Story truth is sampled from explicit Product time on resume.

## Lifecycle

Prototype exposes Restart, Remount, and Dispose. Dispose cancels its single presentation animation frame and removes listeners. Remount reconstructs UI from immutable inputs; stable-ID offsets and output digests remain equal. The pure evaluator itself has no lifecycle.

## Keyboard and focus

Space play/pause; Home restart; Left/Right scrub one frame; Shift+Left/Right previous/next cue. No key mutates story roles without an explicit apply action.

- All controls have native labels and focus rings.
- Offstage/hidden cards are not tabbable.
- Autoplay/playback never moves focus.
- Pointer audition never becomes the only authoring path.

## Status and announcement policy

Announce play/pause, cue identity, and terminal state only. Do not announce every travel frame.

Use one polite status region. No per-frame, pointer-coordinate, animation-progress, or source-video-time announcement spam.

## Reduced motion

Application presentation may show the authored finale still and provide Restart. Saved/exported Timeline remains unchanged.

Reduced motion changes application presentation only. It never mutates saved Scene parameters, Timeline intent, exported motion, direction, media order, or source-video time.

## Fallback

Pure 2D transforms and explicit integer z-order. No preserve-3d/WebGL dependency.

Fallback must preserve identity, order, front/rear ownership, and exact terminal pose. If a capability cannot preserve those, report truthful unavailability instead of substituting another Scene.
