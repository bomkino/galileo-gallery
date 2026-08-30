# Edge, resource, and accessibility contract — Open Fan

## Count behaviour

| Count | Behaviour |
| ---: | --- |
| 0 | Product empty-state; evaluator returns no cards. |
| 1 | Upright single card on common hinge; no spread. |
| 2 | Shallow symmetric pair; no centre card invented. |
| 3–12 | All sources mounted in stable order. |
| 13–127 | Ordered window, maximum 12 mounted; all sources remain addressable and retain identity. |
| >127 | Validation failure before Scene evaluation. |

Window selection is explicit state derived from authored focus or keyboard inspection, never hover. Changing the window may occur only at a stable overview checkpoint or through a documented cross-window transition; sources may not pop mid-lift.

## DOM/GPU/media budgets

- Evaluated identities: maximum 127 lightweight pose records.
- Mounted cards: maximum 12 landscape/square, derived maximum 9 on narrow portrait when collision bounds require it.
- Mounted video elements: maximum 3; remaining visible video sources use Product-prepared still/proxy frames until entering the near-readable subset.
- Scene-owned overlay nodes: maximum 2.
- Scene-owned WebGL contexts: 0 in the prototype and recommended DOM renderer.
- Scene-owned textures/framebuffers: 0; shared renderer may provide decoded planes under Product budgets.
- Per-evaluation allocation must be bounded by source count and released after call.

## Failed media and loading

- Failure never removes an index.
- Unknown ratio uses a validated fallback ratio until metadata resolves, then recomposes only at a stable checkpoint.
- Loading state uses the same slot and bounds as the eventual source.
- A failed selected card remains keyboard-focusable and announces failure.

## Video

Video decode and cache ownership stays outside the Scene. Off-window videos release renderer demand. Remount at the same story time must request the same deterministic source frame. Autoplay policy in the authoring UI cannot change export truth.

## Offscreen, remount, resize, and disposal

- Offscreen preview stops its scheduler; evaluator has nothing to dispose.
- Remount reconstructs from config + ordered media + story time with no animation catch-up.
- Resize recomputes derived spread/card size from stage/canvas, preserving source order and normalized story phase.
- Any observers/listeners created by the renderer are disconnected on unmount.
- Context loss is not applicable to the DOM prototype; a future GPU renderer must restore from pure state or fall back to DOM/2D without changing motion meaning.

## Reduced motion

Resolve to fully opened stable overview. Disable entry, close, breath, lift travel, and finale travel. Selection uses focus outline and optional static offset. Loop duration may remain for source-video/audio story truth, but card geometry stays fixed.

## Keyboard and focus

- Tab enters the Scene once, then arrow keys inspect ordered sources.
- Left/right traverse source order; in right-to-left UI the Product may remap key semantics but source order remains explicit.
- Home/End select first/last source.
- PageUp/PageDown move one ordered window for large sets.
- Enter requests spotlight preview; Escape returns to overview.
- Focus DOM order follows source order. Visual z-order never changes focus order.
- Focus is restored by source ID after window remount.

## Screen-reader semantics

The Scene exposes one labelled collection with total item count and active window range. Each card announces source name, position, media type, failed state, and whether it is spotlight/finale-authored. Decorative hinge/Look elements are hidden.

## Fallback

If transforms or compositing are unavailable, render a static, source-ordered grid or horizontal strip using shared Frame settings. Do not imitate the fan with inaccessible overlapping buttons. Mark the Scene motion unavailable; preserve Project and source order.

## Honestly unsupported

- Spatial direction control.
- Pointer-proximity or hover as serialized/output authority.
- More than 127 sources.
- Simultaneous legible overview of more than the bounded active window.
- Product export, registry, packaging, or native lifecycle integration in this atelier prototype.

## Final gauntlet lifecycle and authoring corrections

- Maximum mounted cards for the 127-source fixture: 12; every canonical checkpoint records a positive bounded count.
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
