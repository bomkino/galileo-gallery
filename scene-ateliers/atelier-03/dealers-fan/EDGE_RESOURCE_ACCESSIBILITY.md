# Edge, resource, and accessibility contract — Dealer's Pick

## Count and window behavior

| Count | Required behavior |
| ---: | --- |
| 0 | Empty-stage state; no synthetic cards. |
| 1 | Single radial present/hold/return; no fake neighbours. |
| 2 | Compact exchange with both paths visible. |
| 3–11 | Mount nearest odd window up to configured limit. |
| 12–127 | Evaluate ordered focus across all identities; mount bounded nearest window only. |

Window membership derives from fractional focus and stable source order. A card enters in a zero-opacity guard pose before becoming visible and exits after yielding. No pop, duplicate, or renumber is allowed.

## 127-source bound

- Evaluated identities: at most 127 by Product contract.
- Mounted card elements: at most `visible-window` (default 7, maximum 11).
- Decoded full-resolution media demand: crown plus nearest two neighbours, maximum 3; others may use Product thumbnails/placeholders.
- Video decoders: maximum 2 active candidates in preview; output may serially sample as Product export requires.
- GPU textures: bounded to mounted window plus Product cache policy; Scene owns no permanent texture cache.
- DOM duplicates: zero.

## Mixed ratios and collision

Collision pressure is assessed using actual outer bounds at canonical checkpoints. Adapt in this order: reduce effective step, reduce effective card size within floor, deepen pivot in portrait, then disclose clipping risk. Never change source ratio, reorder, hide a crown card, or invent a second row.

## Failed and delayed media

Failed media remains an ordered card with neutral placeholder, visible ID/name, and stable ratio fallback. Late metadata may recompose at a stable checkpoint only. Decode failure cannot advance focus early or shorten a hold.

## Video policy

Off-crown video may suspend decode in preview while preserving evaluator pose and Product story-time target. Returning to crown seeks deterministically through Product media service. Autoplay, loop, mute, and audio are not Scene-owned.

## Offscreen, remount, and disposal

- Offscreen: Product may stop scheduling preview; story time remains authoritative.
- Remount: first frame evaluates current explicit story time; no entry animation unless Timeline is at entry.
- Disposal: remove authoring listeners/schedulers and release renderer-owned nodes; Scene evaluator retains no state.
- Context loss: fallback to DOM/SVG/card planes with the same evaluator, or show a path-free failure; never change choreography silently.
- No network, worker, observer, interval, or persistent storage is required by the prototype.

## Reduced motion

Resolve to one static crown card and fixed neighbours. Disable entry riffle, focus travel, lift interpolation, and exit. Keyboard inspection may swap the static crown with a direct cut or brief opacity transition owned by accessibility presentation, not serialized Timeline motion. Source video may continue only under Product reduced-motion/media policy.

## Keyboard and focus semantics

- Stage has one descriptive group label, not one tab stop per overlapping card by default.
- Left/Right: move ephemeral inspection identity in source order.
- Home/End: first/last source.
- Enter/Space: request focus detail or spotlight preview when available.
- Escape: leave detail and restore the invoking control.
- Screen-reader announcement: “Card n of total, title, at crown” after focus hysteresis settles.
- Visual focus indicator belongs outside source artwork and remains visible over transparent backgrounds.

Authoring inspection never mutates Project story time without an explicit edit action.

## Fallback ladder

1. full card planes with depth sorting;
2. 2D radial transforms using the same bottom-centre poses;
3. reduced-motion static crown hand;
4. ordered textual/media list if transforms fail.

## Honest unsupported capabilities

- spatial axis switching;
- pointer/hover/scroll-driven export;
- random riffle;
- independent card tumbling;
- source lighting control;
- automatic captions/layout outside Product services;
- Scene-owned audio behavior.

## Final gauntlet lifecycle and authoring corrections

- Maximum mounted cards for the 127-source fixture: 7; every canonical checkpoint records a positive bounded count.
- Mounted DOM nodes are keyed by source ID and reused across frames. Only sources leaving the bounded window are removed. Visual z-order never changes DOM/focus order.
- The preview owns one `requestAnimationFrame` chain, cancels it on pause/reset/edit, and pauses when the document is hidden. Repeated Play → Pause → Play cannot multiply schedulers.
- Fixed duration, reduced motion, and spotlight-source inspection are visible controls. System reduced-motion preference initializes the checkbox unless explicitly overridden.
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
