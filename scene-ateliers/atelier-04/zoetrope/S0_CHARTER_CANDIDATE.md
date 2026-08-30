# S0 charter candidate — Zoetrope

Status: **candidate; verdict pending**
Stable ID candidate: `zoetrope`
Version candidate: `1`
Catalogue promise under study: fast cylindrical rhythm reads as deliberate apparatus, not aliasing, random flicker, or a generic orbit.

## Identity decision

**Motion sentence:** A disciplined cylinder advances one upright frame at a time through a fixed front gate, using a percussive ratchet with a readable dwell and an exact mechanical return.

**Anti-motion sentence:** It never drifts like Calm Ring, washes into speed blur, jitters between sampled angles, accepts random impulse, or treats faster generic-orbit constants as authorship.

**Emotional and material metaphor:** A compact optical instrument: brisk, legible, a little industrial, and visibly governed. The work should feel mounted to a machine rather than suspended in ambience. The machine serves the source; it does not tint, distress, flash, or smear it.

The decisive default is **authored eased stepping**, not continuous motion. The live profile already calls the Scene a “Fast cylindrical reel” and carries a 430 ms pace. A 32% gate dwell within each 430 ms slot gives roughly 138 ms of stable reading. That yields more than three dwell samples even at 24 fps while retaining a sharp, percussive transition. The optional `flywheel` cadence remains continuous in velocity but still phase-locked and deterministic; it is a secondary character, not the default.

## Composition and physical logic

- Coordinate space is normalized to the evaluated canvas, then resolved to pixels only at render time.
- The cylinder axis is vertical. Cards occupy one shallow horizontal ring around that axis.
- Ordered source index `i` receives angular position `θᵢ = 2π(i/N − phase)`. No random phase, hidden local order, or source duplication participates.
- Projection uses `x = cx + R sin θ`; depth uses `z = cos θ`; restrained ring tilt contributes only to projected `y` and card `rotateZ`.
- Cards remain upright. `rotateY = θ` supplies stable tangency: front gate is square to camera, side cards turn edge-on, rear cards face away.
- The front gate is a fixed angular zone centred at `θ = 0`. Gate width derives from item count and a minimum readable bound; it is not a control.
- The rear core is a geometric occluder, not an opacity wash. Cards beyond the rear threshold are culled. Visible artwork remains opacity `1`, filter `none`, blend `normal`.
- No apparatus line, light, backdrop, blur, tint, or border is required. A development gate marker may appear on an opaque prototype stage; it disappears in transparent output and is not part of Scene truth.
- Natural source ratio remains intact. Card size is height-led, with a bounded landscape reduction on portrait canvas so the cylinder remains legible.

A silhouette-only still must show a shallow wheel of tangent, upright rectangles with one dominant frontal plane. If it reads as a broad ellipse or calm carousel, the Scene has failed.

## Time grammar

### Automatic loop

One complete cycle advances every source through the front gate exactly once. Story phase wraps at `1`. Start and end are numerically identical. There is no entry or exit inside the repeating loop; host composition owns whether the loop itself is preceded or followed by a finite phrase.

Per source slot:

1. **Travel, 68%:** smootherstep interpolation advances exactly one angular slot.
2. **Gate dwell, 32%:** phase holds exactly on the next slot.

This is not a frame-stepped animation. The evaluator is continuous in story time during travel and constant during dwell. Preview at 24, 30, or 60 fps samples the same function.

### Finite phrase

- `0.00–0.10` — assemble/spin-up: the existing cylinder opens from 82% radius to full radius while velocity ramps from zero. Cards do not stagger or spawn.
- `0.10–0.72` — authored ratchet cycle.
- `0.72–0.84` — Spotlight: selected serialized source is placed at the front gate and held.
- `0.84–0.94` — Finale: serialized finale source settles at the gate. No generic zoom; a future integration may permit a small source-neutral presentation-scale increase only if chartered centrally.
- `0.94–1.00` — exit: cylinder radius contracts along the exact assembly path. No opacity flicker.

Finite reverse maps `t → 1 − t`, swaps entry/exit semantics, and reverses angular sign. The same source identity follows the inverse path. No independent reverse choreography exists.

## Timeline compilation

- **Automatic:** one complete source cycle; duration derives from media count and Timeline pace, bounded by Product policy.
- **Fixed duration:** one exact cycle is time-scaled to the authored duration. Geometry and gate fractions remain unchanged.
- **Directed:** cycle and hold segments compile literally. The Product casino phrase—fast ×2, regular ×1, fast ×1—is honest here because mechanical cadence survives pace changes. Holds land only at gate-aligned phases.
- Timeline owns pace, duration, hold duration, Spotlight selection, finale selection, repeat/once, and transport direction.
- Scene owns cadence shape, geometry, and how a Timeline hold becomes a front-gate station.

Source-video time is a pure function of story seconds and source duration: looped sources use positive modulo; non-looped sources clamp. Pointer momentum, requestAnimationFrame time, hover, and wall-clock flourish never alter Project or export truth.

## Essential Scene-only controls

Maximum five. All are serialized, causal, bounded, resettable, and represented in `CAPABILITY_AND_CONTROLS.json`.

1. `cylinder-radius` — horizontal apparatus spread.
2. `card-size` — source presentation height.
3. `ring-tilt` — bounded physical horizon.
4. `cadence-character` — `ratchet` or `flywheel`; default `ratchet`.
5. `direction` — forward or reverse angular order.

Rejected controls: rear opacity, front-gate width, light, blur, speed blur, tint, random impulse, pointer momentum, idle dim, and local pace. Rear treatment derives from geometry. Gate width derives from count and readability. Pace belongs to Timeline.

## Source-count policy

| Count | Decision |
| --- | --- |
| `0` | Empty state belongs to Product shell. Evaluator returns no cards and no invented placeholder media. |
| `1` | A still single-frame apparatus. Optional finite entry/exit remains; loop has no breathing drift. |
| `2` | Honest half-turn handoff. One frame reaches the gate while the other occupies the rear; rear culling may leave one rendered node at some phases. |
| `6` | Recommended default. Clear apparatus, distinct sides, reliable gate cadence. |
| `20` | Dense machine. Geometry remains ordered; render observation is bounded. |
| `127` | Evaluator retains 127 stable identities but renders at most 19 landscape or 15 portrait nodes selected by geometric relevance. No Project media duplication. |

The renderer may virtualize cards that are rear-occluded or safely offstage. It must preserve source order and reconstitute a card before it becomes visible. Virtualization decisions derive only from evaluated geometry.

## Ratios and canvas recomposition

- Source aspect ratio is natural and defaults to contain. Cover/crop/focal intent, if available from Product, remains per-frame source intent and is never inferred by this Scene.
- Square and landscape canvases use the normal shallow cylinder.
- `4:5` compresses radius and reduces wide-card height modestly.
- `9:16` uses a narrower, taller front gate and shows fewer simultaneous side cards. It remains a horizontal cylinder, not a vertical carousel.
- Unsupported: a vertical-axis zoetrope. Changing the axis would change the apparatus identity.

## Source, Look, alpha, and audio boundaries

- During every readable gate hold, artwork is opacity `1`, filter `none`, normal blend, source-faithful fit.
- Geometry may occlude or cull the whole source plane; it may not dim pixels to simulate depth.
- Look may provide a wall, floor, paper surround, shadow, or deterministic room treatment behind/around the apparatus. Look may not alter imported pixels.
- Transparent mode removes all Scene environment. Fully transparent pixels must have zero RGB. Minimal card planes remain only where the source itself is opaque or partially transparent.
- Scene does not alter source-video, presenter, soundtrack, master, mute, solo, gain, or ducking policy.

## Accessibility and interaction

- Reduced motion settles the ordered apparatus at a gate-aligned phase. Scrub and keyboard inspection may move one deterministic slot at a time; system preference does not mutate exported Project truth.
- Left/right moves previous/next gate station in authoring inspection. Enter may announce/select the current media through Product semantics, never create hidden Scene authority.
- Focus order follows source order, not z-order or virtual DOM order. Offscreen virtual slots are not focusable.
- The motion is decorative to screen readers unless Product exposes media navigation; each source keeps its name/caption outside the artwork.

## Lifecycle and resource decision

- Pure evaluation returns all identity states plus a bounded render-slot list.
- Landscape budget: at most 19 source nodes plus constant Scene geometry. Portrait budget: at most 15.
- At most one warm video near the front gate and one prewarmed successor; all others pause and release decode surfaces under Product media policy.
- Remount, pause, export sampling, and context loss do not alter phase. State is rebuilt from serialized config, ordered media, and story time.
- No WebGL value is established. DOM/CSS 3D is sufficient for this apparatus; introducing GPU scene management would add lifecycle cost without solving the principal risk.

## Principal risks and decisions

1. **Aliasing at speed.** Fixed by story-time easing, a 32% dwell, Timeline pace bounds, and measured 24/30/60 fps sampling—not by blur.
2. **Generic-orbit collapse.** Fixed by tangent upright cards, shallow cylinder, fixed gate, ratchet cadence, and no calm continuous default.
3. **Unreadable side typography.** Accepted as geometric foreshortening; only the gate is a declared readable station.
4. **Dense counts.** Fixed through deterministic geometric virtualization, not source duplication.
5. **Source corruption.** Rear depth uses occlusion/culling rather than opacity/filter changes.

## Contract closure

- **Path/depth/occlusion roles:** normalized canvas coordinates drive one angular path; `cos θ` owns depth, rear geometry owns occlusion, and stable media IDs own source roles.
- **Entry/cycle/hold/finale/exit/seam:** finite assembly and exit are inverse radius paths; loop cycles use gate-aligned travel/dwell; Spotlight/Finale are serialized gate holds; `t=1` is exactly the `t=0` loop seam.
- **Forward/reverse:** reverse applies the inverse story-time phase and no alternate choreography.
- **Video/failed media:** source-video time derives from story time; a failed source keeps ID, ratio, order, angular slot, gate eligibility, and a source-neutral placeholder.
- **Keyboard/focus:** keyboard previous/next inspects serialized source order at the gate; focus never follows transient z-order or offscreen virtualization.

## Later human decisions

The charter recommends, rather than defers, ratchet cadence, 32% dwell, a six-item default, and a shallow horizontal cylinder. Human review must still decide whether the real-speed rhythm feels intentional rather than frantic; whether the default radius/card-size pair reads as an apparatus; whether the side-card density is materially useful; and whether `flywheel` earns retention. Those are taste decisions, not open implementation ambiguity.

**Verdict: pending.** This document is a pre-G11 S0 candidate. It is not a formal charter approval, production implementation, catalogue integration, package, release, or human acceptance.
