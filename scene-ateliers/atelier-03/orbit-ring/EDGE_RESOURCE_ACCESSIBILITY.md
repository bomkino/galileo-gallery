# Edge, resource, and accessibility contract — Calm Ring

## Counts

| Sources | Policy |
| ---: | --- |
| 0 | empty stage |
| 1 | front hold, no fake orbit |
| 2 | diametric pair with collision adaptation |
| 3–24 | all sources mounted in stable equal slots |
| 25–127 | 18-source cyclic window around continuous front identity |

Window entry/exit occurs at the rear guard. Identity order is cyclic source order; no shuffle or duplicate.

## Budgets

- Evaluated source identities: maximum 127.
- Mounted card planes: maximum 24; maximum 18 for large-set mode.
- Full-resolution preview media: front plus two shoulders, maximum 3.
- Active preview video decoders: maximum 2.
- Hidden duplicate cards: 0.
- Scene-owned canvases/workers/observers/timers/network/persistent stores: 0 in prototype.
- GPU textures/contexts: renderer/Product bounded and disposed; evaluator owns none.

## Collision and mixed ratios

Check actual outer bounds at front and shoulder checkpoints. Reduce card size, then radius, then adjust portrait centre. Never alter ratio, hide front source, create a second ring, or switch to a cylinder.

## Failed media and video

Failed source retains slot and front turn. Unknown ratio uses bounded fallback until stable recomposition. Video frame follows Product story time; rear suspension cannot change pose or source order.

## Offscreen, remount, disposal, context loss

Offscreen preview may stop scheduling. Remount evaluates current explicit time; no mount animation. Disposal releases renderer nodes/media/context and authoring listeners. Context-loss fallback uses the same projected 2D card centres and z-order; otherwise shows explicit failure.

## Reduced motion

Static ring with selected source at front. No assembly, orbit, spotlight travel, or exit. Ephemeral keyboard inspection may direct-cut front identity without serializing time.

## Keyboard/focus

- One stage group in tab order.
- Left/Right selects previous/next source for authoring inspection.
- Home/End first/last.
- Enter/Space detail; Escape restores invoking control.
- Announce “Front card n of total: title” after phase settles.
- Focus indicator sits outside artwork and remains visible over transparent backgrounds.
- Depth order never changes logical focus order.

## Fallback ladder

1. projected card planes with depth sort;
2. SVG/DOM 2D projection from same evaluator;
3. reduced-motion static ring;
4. ordered media list.

## Unsupported

Nested rings, satellites, spatial axis, nonlinear proximity, card tumble, pointer-driven output, source lighting, Scene audio, and permanent orbit decoration.

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
