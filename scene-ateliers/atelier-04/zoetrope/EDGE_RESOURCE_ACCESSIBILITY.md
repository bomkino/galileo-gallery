# Edge, resource, and accessibility policy — Zoetrope

## Counts and bounded behaviour

| Media | Behaviour | Evaluated identities | Maximum observed source nodes |
| ---: | --- | ---: | ---: |
| 0 | Product empty state; no fake Project media | 0 | 0 |
| 1 | Still front gate; finite assembly allowed | 1 | 1 |
| 2 | Half-turn handoff; rear card may be culled | 2 | 2 |
| 6 | Recommended apparatus | 6 | 6, normally 5 after rear cull |
| 20 | Dense ordered machine | 20 | 19 landscape / 15 portrait |
| 127 | Full deterministic identity state; geometric virtualization | 127 | 19 landscape / 15 portrait |

No render slot becomes a second Project media identity. The evaluator returns one state per ordered source and a separate bounded `renderSlots` view.

## DOM, GPU, and media budgets

- Candidate renderer: DOM/CSS 3D. No WebGL dependency or context required.
- Constant Scene geometry: stage plus optional non-output diagnostic marker.
- Source DOM: ≤19 landscape, ≤15 portrait.
- Images: decode visible/guard band only under Product cache policy.
- Video: at most one active gate video and one prewarmed successor. Rear/culled videos pause and relinquish decode surfaces; audio remains governed centrally.
- No per-frame node creation. Reconcile stable nodes by source ID.
- No unbounded box-shadow, filter, canvas, texture, or generated bitmap allocation.

## Failed and delayed media

A failed source preserves ID, index, ratio intent, caption, Spotlight/finale eligibility, and card pose. It renders a clear placeholder at opacity `1`, filter `none`, normal blend. Failure does not collapse angular spacing or move later sources.

Delayed image/video readiness must not block geometry evaluation. The renderer may hold a source-neutral placeholder until decode, then replace pixels without changing card pose.

## Lifecycle

- Mount derives complete state from serialized config, ordered media, and story time.
- Pause stops transport only; evaluator state remains recoverable.
- Remount at the same story time is exact.
- Source removal disposes image/video resources and closes focus participation.
- Resize recomputes projection from canvas; it does not preserve stale pixel coordinates.
- Export snapshot freezes config/media/timeline/canvas before sampling.
- No renderer context exists to lose. If a future GPU path is introduced, it must prove value and deterministic DOM fallback first.

## Offscreen, remount, and disposal

- Offscreen/rear-culled slots are rebuilt from evaluated geometry before entering the guard band; they never retain semantic focus or hidden phase.
- Remount at identical config/media/story time reproduces the same slot set and pose.
- Disposal cancels transport, disconnects observers/listeners, pauses/releases off-budget media, and drops all ephemeral render slots.

## Reduced motion

System reduced-motion preference changes presentation only:

- automatic transport settles on the current gate-aligned source;
- no idle breath, spin, or flourish is substituted;
- authoring inspection can step one source at a time;
- exported Project truth remains the authored motion unless the Project itself serializes a reduced-motion variant.

## Keyboard and focus

- Left/right: inspect previous/next ordered source at the front gate.
- Home/end: first/final source.
- Space: preview transport only when the stage transport owns focus.
- Focus order: source order, never depth or virtual DOM order.
- Virtualized offstage cards are excluded from tab order.
- Announce current source name/caption and position `n of N` outside artwork.
- Enter may activate Product media inspection; it cannot create hidden primary/Spotlight state.

## Honest unsupported capabilities

- vertical-axis apparatus;
- pointer throw as serialized motion;
- free inertial scrubbing that changes export truth;
- source-lighting, speed blur, or depth dimming;
- arbitrary 3D camera orbit;
- WebGL-only rendering;
- simultaneous decoding of all 127 videos.

## Fallback

CSS 3D absence or a transform bug falls back to a static front-gate inspection strip with one current source and previous/next controls. It must not silently substitute Quiet Carousel or Calm Ring. The fallback remains source-faithful and clearly reports motion unavailability.
