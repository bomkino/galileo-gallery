# S0 charter candidate — Ribbon: Two-lane Filmstrip

Status: candidate. Verdict: pending. Production implementation: no.

## Motion and anti-motion sentence

**Motion:** Two equal material lanes carry ordered frames in opposite directions, recycling only beyond the canvas while every source remains upright and legible.

**Anti-motion:** Never a single ticker duplicated for density, a configurable lane generator, a fake celluloid prop, or a field of independently bobbing cards.

## Emotional and material metaphor

A clean editing-room pair of moving ribbons: measured, physical, useful. The material claim is the continuous spacing and counter-flow—not dirt, sprockets, scratches, grain, tint, captions, or nostalgia pasted over the source.

## Coordinate, topology, camera, and source roles

- Two lanes exactly. This is the identity, not a default.
- Orthographic stage. No camera depth hierarchy between lanes.
- Landscape and near-square canvases use two horizontal rows. Portrait and 4:5 canvases recompose into two vertical columns.
- Lane 0 and lane 1 have equal scale and equal absolute speed. Lane 1 runs in the opposite direction with an authored half-cycle phase.
- Odd/even assignment is stable by source order. One source creates two render instances, one in each lane. Two sources assign one to each lane. Three or more preserve parity order.
- Repeated render instances may fill a sparse lane; Project media identity is never duplicated or reordered.

## Time phrase

1. **Entry:** Product may begin at any deterministic phase; no fade-in is required by the Scene.
2. **Cycle:** both lanes travel continuously at equal speed and opposite signs.
3. **Hold:** Product freezes the shared phase. A spotlight target aligns to the centre gate of its assigned lane; the other lane keeps its authored phase relation.
4. **Finale:** selected source aligns to its lane gate and holds. No leap, grow, glow, dim, or lane swap.
5. **Exit:** repeat mode crosses the exact seam; once mode may stop at a declared gate or let both lanes clear the canvas.
6. **Seam:** variable source widths compile into one closed metric track per lane. Recycling occurs outside the viewport.

## Timeline mapping

- **Automatic:** one complete pattern cycle at Product pace.
- **Fixed duration:** Product time-warps an integer number of cycles to the exact duration.
- **Directed:** Product owns cycle/hold segments and casino rhythm. The Scene consumes phase, velocity, direction, and target landmarks.
- Reverse flips both lanes together; their relative opposition remains intact.
- Source-video story time remains global and exact through movement and holds.

## Defaults and essential Scene-only controls

- Frame scale: `0.28` of cross axis.
- Gap: `30` design pixels at a 1080-pixel cross axis.
- Lane separation: `0.38` of cross axis.
- Lane phase: `0.50` cycle.

No lane-count control. Pace and direction belong to Timeline. Fit belongs to source/frame intent. Dirt, grain, borders, captions, and backdrop treatment belong nowhere in the clean Scene.

## Media counts and ratios

- **0:** empty transparent stage; no invented cards.
- **1:** same source in both lanes as two render instances. Both retain one source identity.
- **2:** one source per lane; repeated instances fill sparse tracks.
- **3–256:** stable odd/even assignment; bounded virtual instances fill only the stage guard band.
- Mixed landscape, portrait, square, and soft-alpha sources retain ratio and order. Frame height/width adapts; lane baseline does not wobble.

## Canvas and media failures

- 16:9 and 1:1: horizontal rows.
- 9:16 and 4:5: vertical columns, not a rotated DOM afterthought.
- Failed media remains in sequence as a source-sized neutral placeholder.
- Video remains upright, unfiltered, and synchronized to global story time.

## Source, Look, alpha, and audio boundary

Artwork renders at opacity 1, filter none, normal blend. Scene supplies only geometry and clipping. Look stays behind/around artwork. Transparent pixels remain untouched. Scene never reads, mutes, ducks, seeks, or mixes audio.

## Reduced motion and accessibility

Reduced motion freezes at deterministic lane landmarks; scrubbing remains exact. Controls need textual values, reset, keyboard reachability, and visible focus. Moving artwork is not focusable; source selection remains in Product UI.

## Lifecycle and resources

Evaluator is pure. Renderer mounts only visible instances plus one guard interval, caps virtual instances, reuses decoded media, disconnects observers, cancels animation frames, and releases video/GPU resources on disposal or context loss.

## Risks

- Too little lane separation makes one thick band.
- Excessive scale or gap breaks ribbon continuity.
- Sparse counts can look like cloning unless render-instance identity is explicit.
- Counter-flow can become noisy at high Product pace; speed limits belong to Timeline acceptance.

## Later human decisions

Approve or reject: exactly two lanes; half-cycle phase; portrait column recomposition; one-source duplication as render instances; default density and real-speed pace. Formal charter approval remains pending.
