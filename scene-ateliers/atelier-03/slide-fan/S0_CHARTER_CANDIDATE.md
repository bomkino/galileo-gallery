# S0 charter candidate — Fan / Open Fan

- stable Scene ID candidate: `slide-fan`
- Scene version candidate: `1`
- catalogue name: **Fan**
- preset name: **Open Fan**
- status: candidate only
- human verdict: pending

## Motion sentence

Cards begin as one lightly gathered hand, open on a common bottom-centre hinge, settle into a balanced overview, and close through the exact inverse geometry.

## Anti-motion sentence

The Scene must never become a continuously advancing selection system, an orbit, a random paper swarm, a hover-led z-order fight, or a static pile whose only authored event is generic scale-up.

## Emotional and material metaphor

A careful editor has laid a hand of proofs on the table and opened it just enough for the whole argument to become readable. The movement should feel like paper under one palm: generous, composed, slightly resistant, and never cute for its own sake.

## Identity decision

Open Fan is a **simultaneous collection view**. Every card in the active ordered window owns a stable angular slot. Story time changes how fully the hand is opened and whether one card is lifted from its existing slot; story time does not advance a focus cursor through the collection. That single decision keeps this Scene separate from Dealer's Pick.

## Coordinate and physical model

- World space is a 2D stage with a single hinge point `H = (hx, hy)`.
- Each mounted card is bottom-centre anchored to `H`; mixed ratios change card height above the hinge, not the hinge itself.
- Slot angle is derived from ordered source index inside the visible window. No hand-authored jitter changes order or hinge.
- Opening multiplies the stable slot angle by a staggered, monotonic opening envelope.
- Spotlight adds a radial translation along the card's own slot vector. It never changes slot, source index, or neighbours.
- Depth order is stable and centre-weighted. A lifted card receives a temporary, deterministic depth promotion and returns to its exact prior order.
- Artwork remains a flat source plane. Scene geometry may move the containing card; it does not light, tint, blur, grain, or relabel source pixels.

## Story grammar

### Entry

The hand begins lightly gathered rather than perfectly coincident. Cards open with a short centre-out stagger so the hinge remains visible as the common cause. Entry ends in a static, balanced fan.

### Stable overview

The default state is a legible overview. Ambient motion is absent at `paper-breath = 0`; the recommended default uses a sub-pixel deterministic breath that returns to zero at every seam and is suppressed during lift, finale, reduced motion, and paused scrub.

### Spotlight hold

A chosen card rises radially from its own slot, holds at full source fidelity, and returns along the same scalar path. Neighbours do not shuffle aside. The selected card does not become a modal or a new layout.

### Finale

The fan tightens slightly around the finale card's existing angular slot while that card receives a stronger radial lift. The result still reads as one fan. No centre zoom or full-stage takeover is permitted.

### Exit and seam

Finite playback closes in reverse centre-out order. Loop playback uses the same gathered pose at exact start and exact end; `evaluate(0)` equals `evaluate(duration)` after canonical rounding.

## Timeline compilation

- **Automatic:** use the canonical finite phrase: open, settle, optional authored lift, settle, fan-derived finale, close.
- **Fixed duration:** scale all non-hold travel intervals proportionally; preserve authored hold minimums of 600 ms. Reject a duration that cannot preserve those minimums.
- **Directed:** compile explicit entry, hold, spotlight, finale, and exit segments. The Product's fast ×2 / regular ×1 / fast ×1 casino rhythm maps to a fast open, one regular reading phrase, and a fast finale/close only when those segments are present; it is not faked as four rotations.
- **Spatial direction:** unsupported. The Scene has no left/right or clockwise/counterclockwise travel identity.
- **Temporal reverse:** supported for inspection and export parity by evaluating the forward phrase at `duration - t`. This is not exposed as a Scene spatial-direction control.

## Essential Scene controls

| ID | Default | Decision |
| --- | ---: | --- |
| `spread-angle` | 135° | Total angular span of the active fan. |
| `hinge-height` | 79% | Vertical location of the common hinge in stage coordinates. |
| `card-size` | 36% | Card width as a percentage of the stage short axis before ratio resolution. |
| `featured-lift` | 14% | Radial lift as a percentage of the stage short axis. |
| `paper-breath` | 0.35% | Maximum deterministic settled translation; zero is fully still. |

Frame fit, source ratio, card padding, corners, canvas, Timeline pace, Timeline direction, background, and Look remain shared Product ownership.

## Count policy

- **0:** explicit empty-state instruction outside the Scene evaluator; no invented cards.
- **1:** one upright card on the hinge. No fan spread. Spotlight/finale use radial lift only.
- **2:** a shallow, symmetric two-card hand. Each remains readable and shares the hinge.
- **Recommended 5:** full default spread and centre-weighted overlap.
- **3–12:** all cards remain mounted and visible; spread and card size adapt monotonically to avoid stage clipping.
- **13–127:** a deterministic 12-card ordered window. Every source retains stable identity and can become the active window through authored selection or keyboard inspection. The Scene must disclose the window and total count; it must not imply all 127 are simultaneously legible.

## Mixed ratios and canvas recomposition

- Card width follows `card-size`; height follows the source or shared Frame ratio.
- All bottoms meet the same hinge. Portrait sources therefore rise higher; landscapes remain lower and wider.
- Collision budgeting uses each card's projected bounding box, not a single assumed ratio.
- Landscape canvases use the serialized spread directly.
- Square and 4:5 canvases derive a narrower effective spread and smaller card width.
- 9:16 canvases preserve the common hinge, move it slightly lower, and cap effective spread before clipping. The evaluator recomposes; it does not rotate a landscape world.

## Media policy

- Images and generated still frames use the same geometry.
- Source video time is Product story time, clamped or looped by the media's own intent; card motion never changes source-video rate.
- Failed media keep ID, ratio, angular slot, and depth order. The renderer shows a neutral card-owned failure plane with the source name supplied by Product accessibility copy.
- Muted media remain visually present unless Product explicitly removes them from the ordered Scene source.

## Source, Look, alpha, and audio boundaries

- During every readable hold: artwork opacity `1`, filter `none`, blend mode `normal`.
- Scene may generate card transform, clipping boundary, depth order, and neutral failure plane only.
- Shared Frame owns contain/cover/crop/focal intent, padding, radius, and border.
- G10D Look owns background, paper material, lighting, grain, vignette, and world treatment. It must remain behind or around artwork.
- Transparent output must produce zero RGB where alpha is zero.
- Scene does not inspect, mix, duck, mute, loop, or otherwise alter Project audio.

## Reduced motion and accessibility

Reduced motion resolves immediately to the fully opened stable fan, disables entry, breath, spotlight travel, and finale travel, and changes selection through a clear focus outline plus an optional static 2% offset. Keyboard order follows source order, not z-order. Left/right moves through the active window; Home/End move to first/last source; Enter requests Product spotlight inspection without mutating serialized story truth.

## Lifecycle and resource contract

The pure evaluator allocates no timers, observers, DOM nodes, textures, or media elements. The renderer mounts at most 12 card surfaces plus one failure/selection overlay. Preview play may use `requestAnimationFrame` only to advance an explicit story-time number; evaluation remains pure. Offscreen pause stops preview scheduling. Remount, canvas resize, context loss, and source-window change must not alter pose for the same inputs.

## Principal risks and mitigations

1. **The hinge reads as fake because rotation occurs around each card centre.** Mitigation: renderer transform origin is always bottom-centre and all bottom-centres resolve to the same stage point before lift.
2. **Portrait cards collide above the hinge.** Mitigation: ratio-aware projected bounds derive effective spread/card size; never clip silently.
3. **Lift becomes a generic zoom.** Mitigation: lift is radial translation from the existing slot, with only a small bounded scale accent.
4. **Large collections lie about simultaneity.** Mitigation: explicit ordered-window policy and count disclosure.
5. **Ambient motion turns handmade into random.** Mitigation: default sub-pixel deterministic breath; zero under reduced motion and exact zero at seams.

## Later human decisions

Human review must decide whether the default 135° spread feels generous rather than crowded, whether 0.35% breath should remain non-zero, whether a 12-card window is acceptable for large sets, and whether the finale tightening still reads as Open Fan rather than Dealer's Pick. Recommendation: approve the physical model; test the breath at `0` and `0.35%` before choosing the shipping default.
