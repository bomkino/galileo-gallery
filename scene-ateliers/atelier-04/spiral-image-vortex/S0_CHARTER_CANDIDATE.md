# S0 charter candidate — Spiral Image Vortex

Status: **candidate; verdict pending**
Stable ID candidate: `spiral-image-vortex`
Version candidate: `1`

## Identity decision

**Motion sentence:** Ordered frames travel one continuous three-dimensional helix, crossing naturally from quiet rear passage to a readable near passage while the only wrap occurs behind and outside the visible stage.

**Anti-motion sentence:** Nothing radiates from a centre, follows a flat Archimedean spiral, behaves like a particle swarm, randomly rotates, duplicates visibly, fades through a seam, or teleports between endpoints.

**Emotional and material metaphor:** A threaded spatial procession: energetic, coherent, and slightly vertiginous, but governed. The work inhabits one line in space. It is not sucked into a vortex texture and is not decoration around a singularity.

## Geometry and source roles

- Each ordered source receives one scalar path coordinate `u ∈ [0,1)`.
- The path is a true helix: angular progress makes two to five turns while vertical progress advances monotonically from an offstage rear entrance to an offstage rear exit.
- The helix’s angular offset places both mathematical endpoints at maximum rear depth. Vertical span places the visible seam neighbourhood beyond the top/bottom stage with card margin.
- `x` comes from radial cosine; `y` comes from linear pitch; depth comes from angular sine. This separation is essential. A flat screen-space spiral fails.
- Cards keep a restrained camera-facing orientation derived from path tangent. They do not spin randomly around their own normals.
- Source order is stable along increasing `u`. Reverse changes traversal sign, never item order.
- Front/rear crossings sort by evaluated depth. No opacity fade mediates crossing. Every rendered source stays opacity `1`, filter `none`, normal blend.
- The helix has no visible duplicated source. Offstage wrapping changes path coordinate only after the source is fully outside the stage and in the seam tunnel.

A silhouette-only still must show one elongated spatial thread with alternating near/behind crossings. If the still reads as a concentric orbit, radial flower, scatter, or flat spiral, reject it.

## Time grammar

### Automatic loop

One normalized cycle translates every ordered source through the full path once. At `t=1`, each source returns to its exact evaluated pose at `t=0`; the wrap is hidden because the endpoint neighbourhood is offstage and rearward.

Motion is continuous and uniform at the path level. Apparent speed changes arise from projection, not random easing. A later Timeline-directed hold may arrest a source at a declared near station.

### Finite phrase

- `0.00–0.10` — entry reveals an already existing thread from its middle outward. Cards do not spawn, stagger, or fly from arbitrary origins.
- `0.10–0.72` — one coherent helical traversal.
- `0.72–0.84` — Spotlight: the serialized source is held at the nearest readable station (`u=0.5` for the default integer-turn geometry).
- `0.84–0.94` — Finale: selected finale source occupies that same station; the rest of the thread remains structurally legible.
- `0.94–1.00` — exit closes the reveal aperture along the exact inverse of entry.

Spotlight is a slowed or held near passage, not a generic zoom. Finale resolves from helix grammar; it does not flatten the path or dissolve everything else.

## Timeline compilation

- **Automatic:** one full path cycle over the Scene’s Timeline-owned base duration.
- **Fixed duration:** one exact cycle time-scaled to the authored duration.
- **Directed:** cycle/hold segments compile literally. Casino rhythm is acceptable only when enough sources remain visible to preserve the thread at faster passages. Holds must land on serialized source stations.
- Timeline owns pace, duration, direction, Spotlight/finale identity, holds, repeat/once, and source-video story time.
- Scene owns helix geometry, endpoint seam policy, crossing order, and how a hold maps to a near station.

Preview transport may use requestAnimationFrame to advance an explicit story-time value. The evaluator never reads wall time or renderer delta. Scrub and fixed-step export sample the same pure function.

## Essential Scene-only controls

No more than five:

1. `turns` — integer helix turns, `2–5`, default `3`.
2. `radial-spread` — projected radius.
3. `depth-pitch` — longitudinal separation/vertical span per turn.
4. `card-size` — natural-ratio source height.
5. `direction` — forward/reverse traversal.

Rejected controls: opacity/fade windows, random rotation, central pull, glow, streak, vortex texture, per-card phase, arbitrary seam position, and local pace. Fade windows are not needed; occlusion and offstage geometry hide the seam.

## Source-count policy

| Count | Decision |
| --- | --- |
| `0` | Product empty state; evaluator returns no invented media. |
| `1` | One card rests at the canonical near station. Automatic loop does not make it vanish into a seam. |
| `2` | Two cards occupy safe interior path stations and exchange near/rear roles. They are not placed directly at endpoints. |
| `8` | Recommended ordinary fixture; enough samples to reveal three turns and crossings. |
| `21` | Dense but readable thread with natural-ratio pressure. |
| `127` | Complete identity state; renderer observes at most 23 landscape or 17 portrait source nodes. |

Sparse placement uses interior safe stations `(i+1)/(N+1)` for fewer than four sources. Ordinary/many placement uses ordered `i/N` and the seam tunnel. This distinction is deterministic and explicit, not random padding.

## Ratio and canvas policy

- Source plane uses natural ratio and clean contain by default.
- Landscape canvas shows broader radial spread and multiple simultaneous crossings.
- Square/4:5 preserve three-dimensional thread while reducing card size if required.
- 9:16 compresses radius and uses the canvas’s height for a longer visible thread. It does not rotate the helix into a horizontal spiral.
- Mixed-ratio collision control comes from bounded card size, path pitch, and render culling. The Scene never forces uniform ratios.
- Unsupported: a flat 2D spiral fallback presented as equivalent. The honest fallback is a static ordered depth-thread still or simple near-station inspection.

## Source, Look, alpha, and audio

- During every near/readable station: opacity `1`, filter `none`, normal blend.
- Cards may be hidden only by offstage bounds, rear seam tunnel, or geometric occlusion.
- Clean transparent mode contains no vortex glow, streak, fog, texture, mandatory line, or background.
- Future Look may provide an around-artwork environment behind the thread; it may not tint the source or become the thing that makes the helix readable.
- Source-video time is derived from story time. Scene does not change any audio lane, gain, mute, solo, master, or ducking truth.

## Accessibility and interaction

- Reduced motion presents a settled thread with the current serialized source at the near station. It does not replace motion with pulsing, fading, or random drift.
- Up/down or previous/next may inspect ordered sources at the near station in authoring mode.
- Focus order is source order. Z-order and virtualized DOM order never redefine semantics.
- Offstage and rear-cull slots are not focusable. Current source announces name/caption and position.
- System preference affects preview presentation, not exported Project truth unless a reduced-motion variant is explicitly authored.

## Lifecycle and resources

- DOM/CSS 3D is sufficient for the candidate. No particle engine or WebGL dependency is justified.
- Complete evaluator state remains one record per media identity. Render observation is bounded to 23 landscape / 17 portrait.
- At most one near video and one approaching guard video remain warm. Others pause/release under Product policy.
- Remount, resize, pause, and context/fallback rebuild from config + media + story time; no hidden phase accumulator exists.
- No visible source duplication is allowed as seam machinery.

## Risks and resolved recommendations

1. **Flat spiral collapse:** prevented by separate longitudinal pitch and angular depth equations.
2. **Visible wrap:** prevented by endpoint angle at rear, offstage vertical span, and a fixed seam tunnel; no opacity seam.
3. **Particle-swarm reading:** prevented by ordered `u`, stable orientation, one path, and no random transforms.
4. **Crossing pop:** prevented by depth-based z-order; opacity stays faithful.
5. **Portrait collision:** addressed by radius/card recomposition and lower node budget.
6. **Over-energetic camera effect:** no camera orbit, no central singularity, no texture vortex.

## Contract closure

- **Path/depth/occlusion roles:** normalized `u` owns the single helix path, angular sine owns depth, geometric bounds/rear tunnel own occlusion, and ordered media IDs own source roles.
- **Entry/cycle/hold/finale/exit/seam:** entry reveals an existing thread, cycles translate it continuously, Spotlight/Finale hold declared near stations, exit inverses entry, and the only loop seam occurs rearward and fully offstage.
- **Forward/reverse:** forward and reverse traverse the same ordered path with opposite phase sign; media order never changes.
- **Video/failed media:** source-video time derives from story time; failed media keeps ID, natural ratio, order, `u`, z-order participation, and a source-neutral placeholder.
- **Keyboard/focus:** keyboard previous/next or up/down inspects Project order at the near station; focus ignores depth-sorted DOM order and offscreen virtualization.

## Later human decisions

The candidate decisively recommends three turns, continuous path motion, near station at `u=0.5`, no fade seam, and a vertical longitudinal thread. Human review must decide whether the default pitch feels coherent rather than scattered; whether near/rear crossings read without extra around-artwork depth cues; whether 8 is the right recommended count; and whether the motion remains readable at real speed.

**Verdict: pending.** No formal charter approval, Product implementation, catalogue integration, G11 completion, package, release, or human acceptance is claimed.
