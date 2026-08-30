# S0 charter candidate — Dealer's Pick

## Candidate identity

- stable Scene ID candidate: `dealers-fan`
- candidate version: `1`
- catalogue label: **Fan — Dealer's Pick**
- status: candidate charter; `verdict: pending`
- implementation status: isolated clean-room prototype only

**Motion sentence:** An ordered hand turns around one pivot below the stage; a continuous fractional focus brings each card to a straight, lifted crown, lets it be read, then yields through the exact inverse path.

**Anti-motion sentence:** Never display a symmetric overview, drive output from scroll or hover, teleport the active card, randomize a flourish, or fake selection by changing only z-index.

## Emotional and material metaphor

A practiced dealer presents one card without theatrics. The hand is confident, economical, and reversible. The cards remain one physical set: none materializes at the crown, and none escapes the order to become a generic hero image.

## Decisive distinction from Open Fan

Dealer's Pick is a **temporal selection system**. At any readable moment one card owns the crown and neighbouring cards explain where it came from and where it will go. Open Fan is a simultaneous overview with fixed slots. This Scene therefore owns a fractional focus coordinate, a below-stage pivot, offstage ingress/egress, and crown handoff. It does not share Open Fan's evaluator or treat the difference as constants.

## World and coordinate model

- Stage coordinates are normalized against the evaluated Project canvas, then resolved to pixels.
- One pivot sits on the horizontal centre line and below the visible stage.
- Each card's bottom-centre lies on a radial arm from that pivot.
- Ordered distance from the fractional focus becomes angular displacement around the pivot.
- The crown is the path's topmost readable gate, not the screen centre by decree.
- Mixed ratios share bottom-centre/pivot logic; card width is Scene-controlled while height follows source ratio and Frame intent.
- Geometry supplies depth order. The card nearest the crown owns the highest temporary depth; ties retain source order and direction-aware continuity.
- Artwork remains a camera-readable plane. The card body may rotate in stage plane; source artwork does not tumble or receive faux lighting.

## Time grammar

### Entry

A short deterministic riffle may reveal the active window from the common below-stage pivot. It is part of story time, not a CSS mount animation. At the entry boundary every card has a defined offstage pose and zero container opacity.

### Selection journey

A continuous focus value travels through ordered source indices. Each card approaches the crown, straightens, rises toward camera, reaches a readable hold, and yields. Fractional focus is never rounded for geometry. Rounding is allowed only for caption/accessibility announcement after a stable hysteresis threshold.

### Spotlight

An authored spotlight compiles to a crown hold at that source identity. Travel arrives at the same crown pose used during ordinary traversal, velocity becomes zero for the hold, then departure resumes without a pose discontinuity.

### Finale

The final unmuted source receives one confident crown presentation. The hand remains visible enough to preserve identity. The terminal state either holds that physical pose or collapses back toward the below-stage pivot; it never becomes a centre zoom.

### Exit and seam

Finite play collapses the hand to the same hidden pivot pose used by entry. Repeat/loop therefore has an exact invisible seam. Reverse evaluates the forward phrase at `D - t`; it does not approximate a separately authored route.

## Timeline compilation

- **Automatic:** derive travel allocation from ordered count and Product pace, then enforce minimum 600 ms crown readability for authored spotlight and 800 ms finale hold. Default five-card study: 9,500 ms.
- **Fixed duration:** preserve entry, hold, finale, and exit minimums; scale only travel intervals. Reject impossible targets below 3,600 ms when spotlight and finale are active.
- **Directed:** compile Product cycle/hold segments into monotonic focus travel. The casino phrase may be honest as fast traversal across two cards, regular traversal across one, then a fast final traversal; explicit crown holds remain holds, not zero-speed “cycles.”
- **Forward/reverse:** supported as exact temporal inversion.
- **Spatial axis:** unsupported. This Scene is a fan around a below-stage pivot, not a generic axis component.

## Candidate defaults and essential controls

| Scene-only control | Default | Serialized meaning |
| --- | ---: | --- |
| `fan-step` | 11° | Angular separation per one source-index distance from fractional focus. |
| `pivot-depth` | 42% | Pivot distance below the stage bottom, measured against stage height. |
| `visible-window` | 7 | Maximum mounted cards nearest fractional focus; odd integer. |
| `presentation-lift` | 17% | Maximum crown lift measured against canvas short axis. |
| `card-size` | 35% | Card width measured against canvas short axis before ratio resolution. |

Timeline owns pace and direction. Frame owns padding, corner treatment, fit, source ratio, and focal intent. Canvas owns dimensions and safe area. Look owns world treatment. No sixth Scene control is recommended.

## Count policy

- **1 card:** one restrained present/hold/return phrase around the same pivot. No fake fan neighbours.
- **2 cards:** a compact two-card exchange. Both paths remain visible enough to explain handoff.
- **Recommended 5 cards:** full identity; three to seven is the useful range.
- **8–12 cards:** bounded active window with deterministic guard-card ingress/egress.
- **13–127 cards:** evaluate ordered focus against all identities; mount only the `visible-window` nearest cards. Window boundaries derive from focus and never from hover. Counter/accessibility copy may disclose `n of total`.
- **0 cards:** explicit empty-stage fallback; no invented media.

## Mixed ratios and canvas recomposition

All cards share width, bottom-centre, and pivot; source ratio determines height. A tall card may extend higher at the crown but may not shift the pivot or reorder depth. Collision pressure is solved by reducing effective card size and fan step within declared floors, never by changing source ratios.

- **Landscape:** broad hand, shallower angular step, crown above centre.
- **Portrait:** tighter horizontal spread, steeper effective arc, smaller cards, and a deeper pivot so the crown remains readable.
- **Square / 4:5:** interpolate from canvas aspect; do not crop the hand as if it were landscape.

## Media, fidelity, Look, alpha, and audio

- Images and videos use the same geometry.
- Source-video time comes from Product story time and source trim/loop policy; card focus never changes media time.
- Failed media retains identity, dimensions, order, crown eligibility, and a neutral generated placeholder.
- Every readable crown hold requires artwork opacity `1`, filter `none`, blend mode `normal`, and no Scene tint or light sweep.
- Scene geometry may occlude a card body; it may not lower crown artwork opacity or brightness.
- G10D Look remains behind/around artwork and may not modify source pixels through this Scene.
- Transparent staging emits no mandatory line, halo, shadow, or hidden matte; fully transparent output must have zero RGB.
- Audio remains a Product service. The Scene neither ducks, seeks, loops, nor remixes audio.

## Reduced motion and authoring inspection

Reduced motion resolves to a static crown presentation with neighbouring cards at fixed, legible offsets. It removes entry riffle, continuous focus travel, lift interpolation, and exit travel. Keyboard left/right changes an authoring inspection identity; Home/End choose first/last; Enter requests spotlight inspection. Inspection state is ephemeral and cannot silently become serialized/export story time. Focus order follows source order.

## Lifecycle and resource boundary

The pure evaluator accepts config, ordered media, canvas, and story time. It owns no timer, requestAnimationFrame, scroll listener, pointer listener, observer, network request, decoder, or GPU context. The renderer mounts at most `visible-window` cards plus no hidden duplicate hand. Product owns image/video decode pools, offscreen suspension, context loss, remount, and disposal.

## Primary risks and mitigations

1. **Looks like Open Fan with motion.** Mitigation: crown-first silhouette, below-stage pivot, fractional focus, bounded ingress/egress, and one readable card at a time.
2. **Cards pop at the window boundary.** Mitigation: mount nearest ordered window with a zero-opacity angular guard zone before visible entry.
3. **Rounding causes crown snapping.** Mitigation: all geometry uses fractional focus; index rounding is announcement-only with hysteresis.
4. **Reverse steals z-order.** Mitigation: depth derives from absolute crown distance plus deterministic direction-aware tie-break.
5. **Tall cards collide.** Mitigation: bottom-centre anchoring, aspect-aware size floor, and portrait/deep-pivot recomposition.
6. **Historical scroll behavior leaks into export.** Mitigation: scroll/hover may only map to ephemeral authoring time; serialized and export truth remains Timeline story time.

## Later human decisions

Human review must judge the 11° step, 42% pivot depth, seven-card window, crown hold length, and whether the entry riffle adds useful material rhythm. Recommendation: retain the riffle only if real-speed review reads as one hand arriving, not decorative card noise. `verdict: pending`.
