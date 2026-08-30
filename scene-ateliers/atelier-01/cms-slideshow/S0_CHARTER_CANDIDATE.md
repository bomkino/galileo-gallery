# S0 charter candidate — Quiet Carousel

- Catalogue legacy ID under review: `cms-slideshow`
- Canonical engineered candidate: `quiet-carousel`
- Candidate charter version: `2`
- Verdict: **pending**
- Work state: candidate charter + isolated prototype only

## Decision

Do not build a second carousel. Retire `cms-slideshow` as a persisted authoring identity and use
**Quiet Carousel** as the one stable catalogue identity.

- Existing `quiet-carousel@1` Projects keep exact v1 rendering and parameters.
- New catalogue selection should resolve to `quiet-carousel`, never persist `cms-slideshow`.
- Existing Projects that contain `cms-slideshow` require a later explicit, versioned Product upgrade
  path. No silent rewrite in this atelier.
- A future `quiet-carousel@2` may move background ownership to Look and pace ownership to Timeline.
  It must not reinterpret v1 Projects in place.

## Motion sentence

Source frames travel continuously through a calm, central focus well, retaining one-item breathing,
modest geometric depth, generous negative space, and an invisible loop seam.

## Anti-motion sentence

Never snap, fan, orbit, wave, stack, tilt into coverflow, pulse for attention, dim neighbouring
artwork, or turn the focus well into a spotlight effect.

## Emotional and material metaphor

A quiet architectural opening: one measured aperture, with frames passing through it like prints on
an unseen belt. The mechanism disappears. The work remains legible.

## Coordinate system, topology, and source roles

- Normalized stage coordinates with a horizontal or vertical major axis.
- The cross-axis determines frame scale and design-pixel gap, preserving proportional composition
  across preview and output sizes.
- Closed one-dimensional track. Each source keeps one stable identity and ordered phase offset.
- Focus depth comes only from geometric scale and z-order relative to the central aperture.
- Artwork opacity remains `1`; artwork filter remains `none`.
- Offstage clipping happens at the canvas boundary. No edge fade touches source pixels.
- One item uses a small sinusoidal translation inside the focus well. It does not clone itself.

## Time grammar

| Phrase | Behaviour |
| --- | --- |
| Entry | Begins on the same closed track; no special fly-in or source fade. |
| Cycle | Constant signed travel through the focus well. |
| Hold | Timeline freezes the exact evaluated pose. Source-video time continues from global story time. |
| Finale | Optional Timeline landmark parks the selected frame in the well; no generic enlargement. |
| Exit | Continues causally offstage or ends on the held pose. |
| Seam | `pose(t = duration) == pose(t = 0)` for position, scale, z-order, source identity, and velocity. |

### Timeline modes

- **Automatic:** one complete source-order cycle at Timeline pace.
- **Fixed duration:** integer cycle count compiled into the requested duration. Spatial evaluator is
  unchanged.
- **Directed:** Product segments own pace, direction, cycle count, and holds. The existing
  fast ×2 / regular ×1 / fast ×1 rhythm remains a valid default compilation, not Scene logic.
- **Reverse:** negates track velocity while preserving source order, seam, and focus geometry.

## Candidate defaults

- Axis: horizontal, owned by Timeline/canvas composition.
- Direction: forward, owned by Timeline.
- Pace: `800 ms` per source step, owned by Timeline.
- Frame scale: `52%` of cross-axis.
- Minimum gap: `42` design pixels at a `1080` cross-axis; sparse layouts may distribute additional negative space.
- Focus depth: `12%`, bounded to remain modest.
- Media fit intent: `contain` by default; this is not a Scene control.
- Look: clean solid or transparent Project Look; no Scene background parameter in v2.

## Essential Scene-only controls

1. **Frame scale** — card cross-axis size.
2. **Minimum gap** — lower bound for physical anchor clearance; sparse layouts may distribute extra negative space to preserve one instance per source and an offstage seam.
3. **Focus depth** — bounded geometric scale falloff around the aperture.

Fit is source/media intent. Axis, direction, pace, cycle count, holds, finale, and background are not Scene-only controls.

## Media-count policy

- **0:** empty stage state owned by Product; no fabricated cards.
- **1:** one frame breathes within 2.5% of the major axis; no loop jump or duplicate.
- **2:** opposing half-cycle positions. Both identities remain visible when geometry permits.
- **3–12:** preferred range. One frame owns the aperture while neighbours retain breathing room.
- **13–256:** bounded evaluator; renderer mounts only visible instances plus a small overscan margin.

## Mixed ratios and canvas recomposition

- Every source keeps its declared ratio.
- Horizontal travel sizes frames from stage height; vertical travel sizes frames from stage width.
- `16:9`, `9:16`, `1:1`, and `4:5` canvases recompose rather than rotate a hidden horizontal world.
- Vertical canvas defaults to vertical travel. Square canvas retains the authored axis choice.
- Wide and portrait sources may produce different major-axis extents; anchors remain ordered and the
  seam remains phase-based.

## Source, video, failure, Look, alpha, and audio boundaries

- Source pixels receive no tint, brightness, blur, grain, vignette, border, shadow, opacity falloff,
  or lighting treatment by default.
- `contain` is the clean default. `cover` is an explicit crop decision.
- Video visual time is derived from global story time; Scene never free-runs or remaps it.
- Failed media keeps its source identity, ratio slot, and order through a Product placeholder.
- Look renders behind or around artwork. Transparent Look produces genuinely transparent pixels.
- Legacy v1 background stays valid inside v1. A future explicit v1→v2 upgrade may map it to Look
  only when Product rules prove the result unambiguous.
- Scene never owns mute, gain, solo, ducking, soundtrack, presenter, or source-video audio policy.

## Reduced motion

- Real-time travel stops.
- Story time selects the nearest source-order focus landmark with an instantaneous pose change.
- Scrubbing remains deterministic.
- One-item breathing is disabled.
- No crossfade, zoom, parallax, or source opacity animation is introduced as a substitute.

## Keyboard, focus, and accessibility

- Exported artwork is not made interactive by the Scene.
- Studio controls remain in normal document focus order with visible focus indication.
- Arrow-key frame selection may be a Product feature; it must not mutate Timeline time silently.
- Status text exposes current source index, total count, mode, direction, and story time.
- Failed-media placeholders carry a readable source name without replacing source order.

## Lifecycle and resources

- Evaluator is pure and allocation-bounded for a fixed source list.
- Renderer mounts visible frames plus overscan, never an unbounded sequence of clones.
- Resize observers and real-time callbacks are disposed on unmount.
- Videos outside the mounted window are paused by Product media services.
- Context loss falls back to the same 2D evaluator output; no identity change.

## Risks

- Too much depth becomes coverflow.
- Too little gap turns calm travel into a ticker.
- `cover` can silently damage deck edges if promoted as default.
- Moving v1 background ownership without an explicit Project migration would break saved work.
- A generic Spotlight/Finale layer can reintroduce dimming and hero scaling.

## Later human decisions

1. Does the v1 `52 / 42 / 12` composition feel calm enough at real speed?
2. Should axis remain Timeline-owned, or become a chartered topology control?
3. Is one-item breathing desirable, or should one item remain absolutely still?
4. Should `quiet-carousel@2` exist, or should ownership cleanup wait for a broader Project version?
5. Is `cms-slideshow` shown as a temporary search alias, or removed from catalogue copy immediately?

No formal charter approval, catalogue edit, Project migration, production implementation, release,
or human acceptance is claimed.
