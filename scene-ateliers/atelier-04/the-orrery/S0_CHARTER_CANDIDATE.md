# S0 charter candidate — The Orrery

Status: **G10B preflight candidate; implementation blocked by G10A**
Verdict: **pending**
Stable ID candidate: `the-orrery`
Version candidate: `1`

## Scope boundary

This packet is a laboratory and charter preflight. It is not active G10B work, not an approved charter, and not a Product Scene implementation. Production work must wait for completed G10A and then explicitly incorporate G10A contract findings before code enters `src/`.

## Identity decision

**Motion sentence:** One source-faithful primary anchors the composition while ordered satellites travel on two or three visibly distinct orbital planes whose integer revolution relationships return the entire hierarchy to one exact loop state.

**Anti-motion sentence:** Nothing becomes a generic single ring, decorative solar-system graphic, random constellation, quasi-periodic drift, click-owned state, fixed first-item hero, permanent glow, or nested constants inside the central renderer.

**Emotional and material metaphor:** A precision tabletop orrery built from media planes: measured, hierarchical, and legible. The primary is not merely the largest card. It is a serialized role around which other identities keep continuous, accountable paths.

A silhouette-only still must show a dominant centre plane plus multiple projected orbital planes. A five-second crop must show opposite directions, distinct revolution rates, and correct front/behind passage around the primary. If it reads as Calm Ring plus one large card, reject it.

## Serialized authority

- `primaryId` must come from serialized Scene/Timeline intent and must resolve to an ordered media identity.
- Missing or absent `primaryId` is a hard validation failure. Index `0` is never an implicit fallback.
- `direction` comes from serialized Timeline intent.
- A directed exchange names `exchangeTargetId`. Local click state may preview that intent but cannot become Project/export authority.
- Automatic mode keeps one stable primary. Sparse automatic primary changes are rejected for v1 because they make hierarchy ambiguous and complicate exact looping.
- Directed mode may perform one or more explicitly serialized role exchanges. Each exchange preserves identity and ring membership continuously.

## Geometry and hierarchy

- The primary occupies one stable source plane at canvas centre, source-faithful and front-readable.
- Remaining ordered media are assigned round-robin to `Auto`, `2`, or `3` rings after removing the serialized primary.
- Auto policy: zero rings for no satellites; one ring for one satellite; two rings for two to six satellites; three rings for seven or more.
- Ring membership is stable by ordered satellite ordinal, not source hash, random seed, click order, or current depth.
- Canonical revolution counts per master cycle:
  - one ring: `[1]`
  - two rings: `[2, -1]`
  - three rings: `[3, -2, 1]`
- Integer signed counts guarantee exact loop reconciliation. Alternating signs make direction differences visible without irrational drift.
- Canonical phase offsets `[0.08, 0.31, 0.57]` and projected plane tilts `[18°, -13°, 27°]` separate the rings. These are charter candidate geometry, not permission to bury constants in a shared renderer.
- Every satellite receives a stable slot within its ring. Scale and depth hierarchy derive from ring index and evaluated projection.
- Front/behind passage comes from signed projected depth and z-order. Source opacity remains `1`.
- Orbit guides are diagnostic or optional authoring aids, off by default. They are not required for identity and do not touch artwork.

## Primary role exchange

For an authored exchange from primary `A` to satellite `B`:

1. Evaluate `B` at its current ring/slot pose.
2. Move `B` continuously from that exact pose to centre.
3. Move `A` continuously from centre to the exact pose vacated by `B`.
4. Use complementary reversible arcs so identities do not collide or teleport.
5. At exchange completion, `B` becomes primary with no ring membership.
6. `A` inherits `B`’s prior ring/slot membership.
7. Every other satellite retains membership and continuous motion.

The exchange is reversible from the same equations. It cannot be triggered by hidden click state. A Spotlight or Finale may clarify hierarchy by holding or completing this role exchange; it must not become a generic camera zoom.

## Time grammar

### Automatic loop

One master cycle. Stable primary throughout. Signed integer ring revolution counts return all satellite angles, depths, z-order relationships, and source roles exactly at the seam.

### Fixed duration

One exact reconciled master cycle stretched to the authored duration. Duration changes speed, never revolution relationships.

### Directed phrase

- `0.00–0.10` — deterministic assembly from centre-scaled orbital geometry. No random scatter.
- `0.10–0.58` — stable hierarchy orbit.
- `0.58–0.76` — optional serialized primary role exchange.
- `0.76–0.90` — settled new hierarchy.
- `0.90–0.96` — Finale hold clarifies the chosen primary.
- `0.96–1.00` — deterministic de-assembly. If later human review prefers continuous finite exit, it must remain the exact inverse of entry.

Casino rhythm is not the default. Fast ×2 / regular ×1 / fast ×1 may compile only after human review confirms nested planes and typography remain readable. Timeline owns duration, direction, holds, Spotlight/finale selection, repeats, and story time.

## Essential Scene-only controls

No more than five:

1. `ring-count` — `Auto`, `2`, or `3`.
2. `orbit-size` — projected radial extent.
3. `vertical-squash` — projected plane compression.
4. `satellite-scale` — source-faithful satellite plane height.
5. `orbit-pace` — Scene cadence multiplier used by Timeline compilation.

`primaryId` is not a local panel control; it is serialized source/Timeline intent. Direction remains Timeline authority. Rejected controls: random phase, individual ring speeds, glow, source lighting, guide opacity, local primary click state, per-card scale, and arbitrary depth fade.

## Source-count policy

| Count | Decision |
| --- | --- |
| `0` | Product empty state; no invented primary. |
| `1` | Serialized source is a settled primary; zero rings. |
| `2` | One primary + one satellite on one plane; exchange remains meaningful. |
| `5` | One primary + four satellites; Auto resolves to two planes. |
| `9` | Recommended ordinary fixture; Auto resolves to three distinct planes. |
| `21` | Three planes, stable round-robin membership, bounded visible observation. |
| `127` | Complete identity state; renderer observes at most 24 satellites landscape or 18 portrait, plus protected exchange roles. |

Render culling never mutates membership, source order, role authority, or evaluator state.

## Ratio and canvas policy

- Source planes keep natural ratio and clean contain default.
- Landscape allows wider orbit radii and stronger plane separation.
- Square and 4:5 compress orbit size but retain centre-primary hierarchy.
- 9:16 uses compressed rings, fewer/larger visible satellites, and the same horizontal/elliptical orbital identity. It does not rotate the metaphor into a vertical carousel.
- Very wide satellites receive a bounded portrait-canvas height reduction; natural ratio remains intact.
- Mixed ratios may overlap in projection, but cannot alter ring membership or source treatment.

## Rendering decision criteria

The laboratory uses DOM/CSS 3D because it proves hierarchy, occlusion, exact evaluation, fallback, and source fidelity without adding an engine. Production must decide after G10A findings:

- Prefer DOM/CSS 3D if bounded source planes, deterministic z-order, accessibility, and 24/18 satellite node budgets hold at target performance.
- Consider WebGL only if tested requirements demand materially better nested-plane occlusion, large-count composition, or stable performance that DOM cannot meet.
- WebGL must not be adopted because “orrery” sounds three-dimensional. It must preserve exact source pixels, alpha, primary semantics, fallback, context recovery, and Project parity.

## Source, Look, alpha, and audio

- Every readable source: opacity `1`, filter `none`, normal blend.
- Lighting and orbit guides stay behind/around artwork and off by default.
- Clean transparent mode emits only source planes; no glow, star field, line, fog, tint, or hidden RGB residue.
- Future Look may create environment outside source planes. It cannot make orbital hierarchy legible by washing the artwork.
- Source-video time derives from Project story time. Scene does not alter audio truth.

## Reduced motion and accessibility

- Reduced motion freezes the master cycle at the serialized canonical pose. It retains primary/satellite hierarchy and all source identities.
- An explicitly authored directed exchange may instead expose discrete before/after inspection; system preference cannot rewrite exported Project truth.
- Authoring keyboard order follows ordered media, not z-order. Previous/next may select a source for inspection or author a serialized primary/exchange intent.
- Offscreen/culling state is not focusable. Primary and current inspected source announce role and position.

## Lifecycle and resources

- Complete evaluator state remains one record per ordered media identity.
- Render observation is bounded: 24 satellites landscape or 18 portrait, plus at most two protected primary/exchange roles.
- Keep primary video and at most one incoming/near satellite warm. Product media services own decode, pause, seek, eviction, and release.
- Remount, resize, fallback, and context recovery rebuild from serialized config + ordered media + story time. No hidden phase accumulator exists.
- Orbit guides create no media resources and default off.

## Risks and resolved recommendations

1. **Generic ring collapse:** distinct projected planes, alternating signed integer revolution counts, and primary hierarchy are mandatory.
2. **Non-looping drift:** irrational/quasi-periodic speeds are forbidden; integer revolution counts reconcile exactly.
3. **Fixed-first hero:** missing serialized primary fails rather than choosing index zero.
4. **Role teleport:** exchange follows target pose ↔ centre with vacated membership inheritance.
5. **Decorative WebGL:** DOM first; engine only after measured need.
6. **Source corruption:** no artwork lighting, opacity fade, or blend change.
7. **G10 sequence violation:** this remains preflight and blocked by G10A.

## Contract closure

- **Coordinate/path/depth/occlusion roles:** normalized canvas coordinates define projected orbital planes; each ring's signed angular path and plane projection determine x/y/depth; depth sort owns front/behind passage; serialized `primaryId`, membership, and exchange intent own source roles.
- **Entry/cycles/holds/finale/exit/seam:** finite assembly/de-assembly are inverse plane-radius paths; cycles preserve integer revolution relationships; holds preserve roles; Finale clarifies the serialized primary; the master cycle reconciles every ring and membership exactly at the seam.
- **Forward/reverse:** Timeline direction reverses the same signed master-cycle evaluation. No ring is renumbered, no source order changes, and no reverse-only exchange exists.
- **Video/failed media:** source-video time derives from story time; failed media retains ID, primary/satellite role, ring/slot membership, ratio, and deterministic placeholder.
- **Keyboard/focus:** keyboard inspection follows Project order. A keyboard-authored primary/exchange becomes authority only after serialization; transient focus or click state never changes export truth.

## Later human decisions

The candidate recommends stable automatic primary, three-ring Auto at seven satellites, `[3,-2,1]` revolution counts, optional guides off, DOM-first production criteria, and directed serialized role exchange only. Human review must decide default scale/squash, whether three planes read clearly at real speed, whether exchange arcs feel mechanical rather than theatrical, and whether a tested WebGL path earns its complexity after G10A.

**G10B preflight candidate; implementation blocked by G10A. Verdict: pending.** No formal charter approval, production implementation, catalogue integration, G10B activation/closure, G11 completion, package, release, or human acceptance is claimed.
