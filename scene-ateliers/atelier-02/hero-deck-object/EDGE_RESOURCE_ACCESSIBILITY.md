# Edge, resource, and accessibility policy — Hero Deck Object

## Fixture matrix

| Fixture | Required behaviour |
| --- | --- |
| 0 | unavailable with causal reason; no fabricated media |
| 1 | One living-but-stable hero with a closed micro-breath. No fake supports. |
| 2 | Clear two-plane transfer; outgoing becomes support exactly as incoming becomes hero. |
| recommended 5 | ordinary authored silhouette |
| awkward 7 / ordinary 8 | stable order, complete Timeline, mixed ratios |
| bounded 24 | At 24, mount hero, two immediate supports, and four deep slots. Remaining identities stay in order off-rig. |
| 16:9 / 9:16 / 1:1 / 4:5 / 2576:1080 | deterministic recomposition; Use smaller hero scale and tighter lateral support spread; supports may shift vertically but hero plane remains central. |
| transparent soft edge | no Scene contamination; zero RGB under alpha zero |
| opaque | opacity 1/filter none/normal blend |
| failed media | same stable ID/order/ratio; explicit placeholder |
| video + non-zero offset | exact shared story time |
| reverse | Supported as exact inverse authority transfer and support ordering. |
| extreme valid parameters | finite geometry, bounded mount count, no collisions beyond declared occlusion |

## Resource contract

At most seven mounted cards; pure slot assignment; no hidden duplicated deck, live GPU state, or interval.

- 24 is the candidate maximum, not a promise to decode 24 videos simultaneously.
- Scene evaluator returns one bounded pose per ID; renderer mounts only the declared visible set.
- Product media decode/cache ownership remains outside Scene.
- No duplicate infinite strip/deck, setInterval, unbounded queued animation, mutation observer, network request, or hidden analytics.
- Hidden window pauses application presentation only. Story truth is sampled from explicit Product time on resume.

## Lifecycle

Prototype exposes Restart, Remount, and Dispose. Dispose cancels its single presentation animation frame and removes listeners. Remount reconstructs UI from immutable inputs; stable-ID offsets and output digests remain equal. The pure evaluator itself has no lifecycle.

## Keyboard and focus

Left/Right choose previous/next hero through the same applied focus intent. Enter applies audition. Autoplay never steals focus.

- All controls have native labels and focus rings.
- Offstage/hidden cards are not tabbable.
- Autoplay/playback never moves focus.
- Pointer audition never becomes the only authoring path.

## Status and announcement policy

Announce hero identity after settle, not during every support movement.

Use one polite status region. No per-frame, pointer-coordinate, animation-progress, or source-video-time announcement spam.

## Reduced motion

Application may use direct settled hero changes. Saved/exported handoffs remain intact.

Reduced motion changes application presentation only. It never mutates saved Scene parameters, Timeline intent, exported motion, direction, media order, or source-video time.

## Fallback

2D projected rig with explicit integer z and scale. CSS preserve-3d/WebGL may enhance later but cannot change evaluator truth.

Fallback must preserve identity, order, front/rear ownership, and exact terminal pose. If a capability cannot preserve those, report truthful unavailability instead of substituting another Scene.
