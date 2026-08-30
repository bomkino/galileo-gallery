# S0 charter candidate — The Shelf

Status: **candidate; verdict pending**
Stable ID candidate: `the-shelf`
Version candidate: `1`

## Identity decision

**Motion sentence:** Natural-ratio prints rest on one physical horizontal baseline, carry restrained identity-derived lean, and travel together at walking pace while every recycling seam stays fully offstage.

**Anti-motion sentence:** No centre focus well, uniform forced ratio, floating cards, random lean, unstable baseline, generic horizontal carousel, vertical shelf, or Quiet Carousel with a line beneath it may pass as this Scene.

**Emotional and material metaphor:** A collected row of editions leaning on one gallery ledge. The row feels placed, not laid out by a UI component. Movement resembles walking past a shelf: measured, continuous, and materially anchored.

A silhouette-only still must show multiple differently wide rectangles sharing one bottom baseline with small, stable lean. A five-second crop must show the entire row translating as one physical collection, with no centre magnet or duplicate identity. If it reads as a standard carousel, reject it.

## Geometry and source roles

- All ordinary cards rest on one baseline.
- Natural ratio determines width. Canonical card height is shared, but very wide sources may proportionally reduce height to remain within the canvas width bound; their bottom still meets the same baseline.
- Lean is a stable function of source identity and `lean-amount`. It does not change with time and never comes from randomness, array position alone, pointer velocity, or current visibility.
- Cards rotate around bottom centre so lean reads as physical placement on the ledge.
- Source order remains the Project order along the track.
- The whole track translates. Individual cards do not independently drift, bob, or stagger.
- A minimal horizontal baseline is intrinsic Scene geometry because the “resting collection” identity fails without contact. Wall/ledge material, thickness, grain, shadow, and colour belong Look.
- Transparent mode retains only one alpha-safe baseline plus source planes. No wall, tint, blur, backdrop, material shadow, or hidden RGB survives.

## Track construction

For each ordered source, calculate natural-ratio width from card height. The natural track is:

```text
sum(card widths) + N × gap
```

For looping counts greater than one, enforce:

```text
trackLength >= stageWidth + 2 × maximumCardWidth + 96 px
```

Any required slack is distributed evenly into the effective gap. This guarantees that when one render copy exits, the next copy of the same source remains beyond the opposite edge. Duplicate render slots are temporary seam machinery only. Project media remains one ordered identity per source, and the same source may never be visible twice.

One-item mode disables seam duplication and centres the edition as a still shelf.

## Motion grammar

### Automatic loop

- Track phase advances uniformly from Timeline story time.
- Direction changes the sign of phase only.
- At `t=1`, modular phase equals `t=0`; all visible slot poses, source order, lean, baseline, and treatment reconcile.
- Walking pace belongs Timeline duration. There is no Scene speed control.
- Two-item input uses the same long-track/offstage policy; it is an honest handoff, not a centre snap.

### Finite / directed phrase

- `0.00–0.10` — whole row enters as one collection from the travel side. No random stagger.
- `0.10–0.46` — track eases toward the serialized Spotlight edition.
- `0.46–0.72` — track holds exactly. Spotlight print straightens and lifts by the authored amount while neighbours remain on the baseline.
- `0.72–0.86` — track eases toward the serialized Finale edition. Focus transfers causally through shared track motion.
- `0.86–0.96` — Finale edition is settled, straight, and lifted; the row remains visibly shared.
- `0.96–1.00` — whole collection exits as one row.

Spotlight does not zoom, enlarge, dim neighbours, create a centre focus well, or detach the selected source into another Scene. Finale stays a shelf composition.

### Exact reverse

Loop reverse samples the forward phase at `1−t`. Finite reverse samples the same forward phrase at `1−t`; no reverse-only choreography exists. Entry becomes exit, Finale becomes the starting settled state, and every track/focus pose is traversed backwards.

## Essential Scene-only controls

No more than five:

1. `card-height` — shared nominal edition height before safe width reduction.
2. `gap` — minimum physical spacing; loop safety may add deterministic distributed slack.
3. `lean-amount` — maximum identity-derived bottom-pivot lean.
4. `direction` — forward or reverse track traversal; production integration must map portable Timeline direction without duplicate truth.
5. `spotlight-lift` — selected edition lift above the baseline.

Rejected controls: pace, centre bump, neighbour dim, per-card lean, random seed, caption density, ledge material, wall colour, shadow, vertical axis, and local Spotlight identity. Timeline owns pace/roles; Look owns material; source identity derives lean.

## Source-count policy

| Count | Decision |
| --- | --- |
| `0` | Product empty state. Baseline alone is not shown as fake content. |
| `1` | One centred still edition resting on the baseline. No duplicate slot or artificial motion. |
| `2` | Long-track handoff with both identities kept physically separate and seams offstage. |
| `4` | Small collected row; natural widths and lean become legible. |
| `8` | Recommended ordinary fixture. |
| `21` | Dense mixed-ratio collection; bounded observed slots. |
| `127` | Complete Project identity/layout state; renderer observes at most 18 landscape or 12 portrait slots. All 127 recycling seams are analytically located offstage. |

## Canvas policy

- Horizontal-only. A vertical shelf would betray the ledge/editions metaphor and is honestly unsupported.
- 16:9: longest visible row, several works at ordinary scale.
- Square/4:5: fewer works but same horizontal baseline and walking direction.
- 9:16: fewer, larger editions; source widths remain natural. The row does not rotate into a vertical strip.
- Baseline sits at approximately `0.80H` landscape and `0.78H` portrait to preserve wall space and legibility.

## Source fidelity, Look, alpha, and audio

- Every source: opacity `1`, filter `none`, normal blend.
- Lean, lift, and offstage culling do not grade source pixels.
- Minimal baseline is Scene geometry. Wall, ledge thickness/material, edge, grain, environmental light, and shadow belong future Look.
- Captions/index remain optional, accessible, external to artwork, and are not required for Scene identity.
- Source-video time derives from Project story time. Visibility affects resource warmth only.
- Scene changes no audio lane, gain, mute, solo, ducking, or master truth.

## Reduced motion and authoring access

- Reduced motion settles the row with serialized Spotlight edition centred, straight, and lifted.
- System preference affects preview only; exported Project truth changes only through explicit authored intent.
- Previous/next can inspect ordered editions at the Spotlight station without rewriting track state.
- Focus order follows Project order, not temporary wrapped-copy DOM order.
- Duplicate seam slots are `aria-hidden` machinery; only one semantic source identity exists.

## Lifecycle and resources

- Complete state: one geometry record per Project media identity.
- Observed nodes: max 18 landscape / 12 portrait.
- Visible duplicate Project media: forbidden and tested.
- Warm videos: current/near/Spotlight guard only, normally no more than two.
- Track and copies rebuild from config + ordered media + story time after resize/remount.
- No WebGL, physics engine, pointer momentum, wall clock, hidden phase accumulator, or requestAnimationFrame authority is needed.

## Risks and resolved recommendations

1. **Generic carousel collapse:** shared baseline, natural widths, identity-derived lean, whole-row movement, and no centre focus well are mandatory.
2. **Visible recycling:** minimum loop length and per-source seam proof keep both copies offstage around handoff.
3. **Duplicate media:** Project table remains unique; renderer asserts one visible slot per identity.
4. **Unstable baseline:** bottom contact is derived once from canvas; only selected lift changes it causally.
5. **Random placement:** deterministic stable hash controls lean.
6. **Portrait betrayal:** retain horizontal identity and show fewer/larger works.
7. **Look contamination:** only minimal alpha-safe baseline is intrinsic; material belongs Look.

## Contract closure

- **Coordinate/path/depth/occlusion roles:** normalized stage coordinates define one baseline and horizontal track; source centres derive from cumulative natural widths/gaps; depth is deliberately flat except bounded Spotlight lift/lean perspective; stage clipping owns offstage occlusion; stable IDs own edition/lean roles.
- **Entry/cycles/holds/finale/exit/seam:** entry/exit translate the collection as one body; automatic/fixed-duration cycles move one exact loop length; Spotlight/Finale hold a serialized edition; every recycling seam is outside the visible stage.
- **Forward/reverse:** reverse samples the exact inverse track phase and finite phrase. Source order, natural widths, baseline, and identity-derived lean remain unchanged.
- **Video/failed media:** source-video time derives from story time; failed media keeps ID, natural ratio, width, order, baseline contact, lean, caption, seam, and Spotlight role.
- **Keyboard/focus:** keyboard previous/next inspects Project order at the Spotlight station; wrapped render copies are `aria-hidden` and never become semantic focus authority.

## Later human decisions

The candidate recommends `cardHeight=0.42H`, `gap=34 px`, `leanAmount=2.5°`, forward travel, `spotlightLift=0.08H`, horizontal-only support, and a minimal baseline in clean transparency. Human review must decide whether walking pace is measured enough; whether lean feels placed rather than jaunty; whether Spotlight lift is restrained; whether the baseline alone is sufficient in alpha; and whether captions should appear by default in any authored mode.

**Verdict: pending.** No formal charter approval, production Scene implementation, catalogue integration, G11 completion, package, release, or human acceptance is claimed.
