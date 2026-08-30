# Edge cases, resources, and accessibility — Wide Ellipse

## Count policy

| Count | Behavior |
| ---: | --- |
| 0 | Empty-stage fallback; no placeholder orbit fabricated. |
| 1 | One front-gate frame; deterministic entry/hold/exit; no fake orbit. |
| 2 | Opposed path identities with explicit front/rear order and readable turn. |
| 3–24 | Evaluate/mount every ordered source. |
| 25–127 | Evaluate ordered identity progression; mount 18-source cyclic window around front gate. |
| >127 | Unsupported in candidate v1; Product validation rejects or asks author to split. |

Large-set guard sources mount/unmount only in rear recession below the readable zone. The 18-source window is stable for identical source order/time; no source pops at shoulder/front.

## Mixed ratios and bounds

- Resolve source ratio before projected bounds.
- Apply a shared base width and per-ratio height.
- Apply geometric perspective, then deterministic stage cap.
- Preserve centre path and source order when cap activates.
- Portrait recomposes effective axes, yaw, pitch, and size before cap.
- No source stretching or hidden crop.

## Resource budget

Candidate renderer contract:

| Resource | Budget |
| --- | ---: |
| Pure identity evaluations | max 127/source sample |
| Mounted card nodes | max 18 for bounded-many; all up to 24 |
| Active video decoders requested | max 2; Product may reduce |
| GPU textures | bounded to mounted decoded media; Product-owned |
| Scene rAF/timers/observers | 0 |
| Scene workers/network/storage | 0 |
| Per-frame allocation growth | forbidden |

The prototype reports evaluated and mounted counts at canonical times. It uses generated SVG fixture media only.

## Video

- Product story clock selects source-video time.
- Offscreen/rear videos may use Product poster/proxy frames.
- At most two visible shoulder/front videos request active decode.
- Remount restores the frame for current story time, not previous playback state.
- Scene never owns autoplay, loop, mute, audio, or decoder disposal.

## Failed media

Failed/missing media keeps ID, order, angle, ratio fallback, z-order, keyboard position, spotlight/finale eligibility, and accessible label. The failure surface fits inside the same source frame. No array splice or path collapse.

## Offscreen, remount, disposal

- Pure evaluator reconstructs the same snapshot from config/media/time after remount.
- Renderer releases DOM nodes, image references, video requests, and any Product handles on unmount.
- No Scene-owned cache survives Project replacement.
- On GPU/context loss, fall back to ordered 2D transforms from the same evaluated x/y/scale/depth/alpha state.
- Offscreen pause may suspend preview scheduling only; it must not mutate Project phase or output truth.

## Reduced motion

Static composition:

- selected/first source at front gate;
- two nearest ordered sources at readable shoulders where count permits;
- remaining mounted context in quiet rear positions;
- no entry, turn, spotlight travel, finale travel, exit, or per-card motion;
- source pixels unchanged.

Reduced motion is deterministic and exportable as a still/hold. It is not “same orbit, slower.”

## Keyboard and focus

- Left/Right: previous/next source in ordered identity, independent of visual depth sorting.
- Home/End: first/last source.
- Enter/Space: open or inspect selected source through Product action.
- Escape: return focus to Scene/Stage owner.
- Focus ring belongs to UI overlay and is not rendered into output.
- Screen-reader label announces source name, ordered position, and failure/video status; decorative path is absent from the accessibility tree.
- Drag/hover inspection is optional and ephemeral; it never changes serialized time, direction, source order, or output.

## Fallback and unsupported capabilities

Fallback: source-faithful 2D projected ellipse with stable depth sorting and no CSS 3D requirement. Unsupported in candidate v1: spatial axis, nested rings, source lighting, card tumble, pointer-driven output, per-card physics, arbitrary count above 127, and guaranteed hardware-accelerated 3D.

## Honest acceptance boundary

Automated evidence can prove bounded nodes, deterministic snapshots, source order, alpha hygiene, and keyboard semantics in specification. Browser accessibility-tree behavior, long-running heap, exact Garuda/Apple-Silicon performance, decoded external video behavior, and human motion comfort remain unproved.

## Final gauntlet lifecycle and authoring corrections

- Maximum mounted cards for the 127-source fixture: 18; every canonical checkpoint records a positive bounded count.
- Mounted DOM nodes are keyed by source ID and reused across frames. Only sources leaving the bounded window are removed. Visual z-order never changes DOM/focus order.
- The preview owns one `requestAnimationFrame` chain, cancels it on pause/reset/edit, and pauses when the document is hidden. Repeated Play → Pause → Play cannot multiply schedulers.
- Fixed duration, reduced motion, and featured-source inspection are visible controls. System reduced-motion preference initializes the checkbox unless explicitly overridden.
- Human-facing source numbers are one-based; serialized evaluator indices remain zero-based.
- Stage help is associated through `aria-describedby`; status updates are polite and atomic; generated cards form a labelled group; static HTML control bounds match evaluator bounds.
- Final raster evidence zeroes matte RGB under alpha zero before hashing and records the exact sanitized count/reason. This is evidence-pipeline truth, not a Product-export claim.
- A Chromium headless attempt did not establish a functional page session in this runner. Browser focus traversal, accessibility-tree capture, heap/remount, and Product-renderer lifecycle remain unclaimed.


## Applied authoring interaction and history boundary

- The visible story source field is serialized Scene intent.
- Arrow/Page/Home/End inspection uses a separate ephemeral source index.
- Escape clears inspection or cancels an active card scrub.
- Unmodified primary-pointer card drag scrubs review time through one coalesced animation frame.
- Continuous control edits commit one undo record; scrub, play, inspection, pointer capture, DOM,
  and diagnostics never enter history.
- A deterministic review URL round-trips bounded prototype controls and time but is explicitly not
  a Galileo Project.
- Runtime diagnostics disclose card creates/removals/reuses, scheduler frames, maximum mounted
  nodes, history depth, and inspection state without becoming evaluator input.
