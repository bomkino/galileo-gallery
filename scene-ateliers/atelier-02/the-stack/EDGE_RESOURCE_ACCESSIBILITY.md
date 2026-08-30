# Edge, resource, and accessibility policy — Calm Stack

## Fixture matrix

| Fixture | Required behaviour |
| --- | --- |
| 0 | unavailable with causal reason; no fabricated media |
| 1 | Stable living proof: one closed breath, no reorder or fake depth exchange. |
| 2 | Small A/B transfer with explicit front/back slots and full-overlap handoff. |
| recommended 6 | ordinary authored silhouette |
| awkward 7 / ordinary 8 | stable order, complete Timeline, mixed ratios |
| bounded 24 | At 24, evaluate all identities and mount the top plus at most seven subordinate slots. |
| 16:9 / 9:16 / 1:1 / 4:5 / 2576:1080 | deterministic recomposition; Reduce frame scale, move the drift corridor upward slightly, retain grounded baseline and horizontal handling. |
| transparent soft edge | no Scene contamination; zero RGB under alpha zero |
| opaque | opacity 1/filter none/normal blend |
| failed media | same stable ID/order/ratio; explicit placeholder |
| video + non-zero offset | exact shared story time |
| reverse | Supported: reverse order, opposite side corridor, inverse covered handoff, identical calm displacement limits. |
| extreme valid parameters | finite geometry, bounded mount count, no collisions beyond declared occlusion |

## Resource contract

At most pileDepth + 1 mounted cards; stable hashes computed from IDs; no interval, random source, or cumulative transform state.

- 24 is the candidate maximum, not a promise to decode 24 videos simultaneously.
- Scene evaluator returns one bounded pose per ID; renderer mounts only the declared visible set.
- Product media decode/cache ownership remains outside Scene.
- No duplicate infinite strip/deck, setInterval, unbounded queued animation, mutation observer, network request, or hidden analytics.
- Hidden window pauses application presentation only. Story truth is sampled from explicit Product time on resume.

## Lifecycle

Prototype exposes Restart, Remount, and Dispose. Dispose cancels its single presentation animation frame and removes listeners. Remount reconstructs UI from immutable inputs; stable-ID offsets and output digests remain equal. The pure evaluator itself has no lifecycle.

## Keyboard and focus

Next/Previous author one measured advance. Space play/pause; Home reset. No focus transfer to moving cards.

- All controls have native labels and focus rings.
- Offstage/hidden cards are not tabbable.
- Autoplay/playback never moves focus.
- Pointer audition never becomes the only authoring path.

## Status and announcement policy

Announce only settled top-card changes and play state.

Use one polite status region. No per-frame, pointer-coordinate, animation-progress, or source-video-time announcement spam.

## Reduced motion

Application may present settled boundary poses with manual Next/Previous. Saved/exported breath and advances remain unchanged.

Reduced motion changes application presentation only. It never mutates saved Scene parameters, Timeline intent, exported motion, direction, media order, or source-video time.

## Fallback

Pure 2D transforms; deterministic ID hashing; integer z slots.

Fallback must preserve identity, order, front/rear ownership, and exact terminal pose. If a capability cannot preserve those, report truthful unavailability instead of substituting another Scene.
