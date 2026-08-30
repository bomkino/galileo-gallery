# S0 charter candidate — Calm Ring

## Candidate identity

- stable Scene ID candidate: `orbit-ring`
- candidate version: `1`
- catalogue label: **Orbit — Calm Ring**
- status: candidate charter; `verdict: pending`
- implementation status: isolated clean-room prototype only

**Motion sentence:** Evenly ordered cards travel one quiet circular plane, passing a single front gate with coherent position, depth, scale, opacity, occlusion, and exact reverse.

**Anti-motion sentence:** Never add nonlinear proximity swell, a cinematic wide ellipse, cylinder walls, nested rings, satellites, permanent orbit decoration, card tumbling, or source-lighting tricks.

## Emotional and material metaphor

A museum carousel tray turning slowly enough that one print can be read while the rest establish continuity. The mechanism is calm, legible, and finite in ambition. It does not perform “space”; it simply makes one coherent orbital plane visible.

## Coordinate and physical model

- One circle exists in an abstract horizontal tray plane.
- The tray is projected through one bounded plane tilt; this creates vertical displacement and depth from the same coordinate, not separate decorative curves.
- Ordered source identity maps to stable angular spacing.
- One front gate is the positive-depth maximum. Front-card position, scale, opacity, and z-order all agree there.
- Cards remain camera-facing planes with at most restrained perspective compensation. They do not rotate around their own vertical axes to imitate a cylinder.
- Occlusion order comes only from evaluated camera depth, with stable source-index tie-break.
- Rear recession uses geometry, scale, and container alpha. It never changes front artwork colour.

## Time grammar

### Entry

The ring assembles from its centre into the declared tray over a short deterministic interval. Angular identity already exists while collapsed; no card pops into a slot.

### Cycle

Angular phase advances monotonically through the ordered set. One complete cycle returns every source to the exact same pose. Default movement is calm enough for a front passage to remain readable.

### Spotlight

The compiler eases the authored source to the front gate, reaches zero angular velocity, holds, then resumes from the same phase. Selection comes from Timeline identity, not drag, hover, or hidden component state.

### Finale

The final unmuted source resolves at the front gate while the full ring remains spatially legible. Finale may hold or disassemble the ring; it may not flatten every card or zoom the final source generically.

### Exit and seam

Finite play disassembles to the same centre pose as entry. Repeat/loop normalizes the seam exactly. Reverse samples forward story time backward.

## Timeline ownership and compilation

- **Automatic:** derive cycle duration from source count and Product pace while enforcing front readability and authored hold minimums. Candidate six-card default: 11,000 ms for the entry/spotlight/finale study.
- **Fixed duration:** retain entry, spotlight, finale, and exit minimums; scale only angular travel. Reject unreadable requests rather than dropping holds.
- **Directed:** cycles map to signed angular travel; hold segments pin a source at the front gate. Fast ×2 / regular ×1 / fast ×1 is permitted only when the regular passage remains readable.
- **Forward/reverse:** exact temporal inverse; Product direction labels should read Counterclockwise/Clockwise only after visual orientation is fixed.
- **Authoring drag/keyboard:** ephemeral inspection may map to a preview phase, but cannot mutate serialized/export story truth without an explicit Timeline edit.

## Essential Scene-only controls

| Control | Default | Serialized meaning |
| --- | ---: | --- |
| `ring-radius` | 38% | Circular tray radius against canvas short axis before projection. |
| `plane-tilt` | 12° | Pitch of the one orbital plane toward camera. |
| `card-size` | 24% | Card width against canvas short axis before ratio/collision adaptation. |

Timeline owns pace, direction, mode, and holds. Frame owns fit, ratio, padding, crop, and focal intent. Look owns background/world treatment. Depth falloff is derived from geometry; no falloff control is earned. Three controls are sufficient.

## Count and bounded-many policy

- **1:** one card occupies the front gate; a subtle entry/hold/exit replaces meaningless orbiting.
- **2:** diametric pair with radius/card-size adaptation; no same-depth z-order ambiguity.
- **3–24:** every source occupies one stable angular slot.
- **25–127:** evaluate ordered front progression across all sources; render an 18-source cyclic window around the front identity, mapped around the tray with rear guard entry/exit. Every identity reaches the front in source order. Windowing is disclosed and deterministic.
- **0:** explicit empty-stage state.

## Mixed ratios and canvas recomposition

Card width follows Scene size; height follows resolved source ratio. Collision uses outer bounds at front/shoulder checkpoints. Adapt by reducing effective card size, then radius within safe limits; never force a common ratio.

- **Landscape:** broad circular projection with restrained vertical tilt.
- **Portrait:** narrower tray from short-axis radius, slightly stronger depth expression, and a higher centre so front cards retain safe margin.
- **Square/4:5:** direct aspect-aware projection, not cropped landscape.

## Media, source, Look, alpha, and audio boundaries

- Front readable passage: container opacity `1`, artwork opacity `1`, filter `none`, blend `normal`.
- Rear container alpha may fall to a bounded floor; artwork properties remain unchanged inside the container.
- Images/videos share geometry. Product story time determines video frame.
- Failed media keeps ID, ratio fallback, angular order, depth, and front passage.
- G10D Look may style world/background only; no front tint, glow, shadow requirement, or rear colour shift.
- Transparent staging has no mandatory ring line, star field, glow, matte, or shadow. Zero-alpha RGB must be zero.
- Audio remains wholly Product-owned.

## Reduced motion and accessibility

Reduced motion resolves to a static ring with the selected source at front and no assembly, cycle, spotlight travel, or disassembly. Left/right changes ephemeral inspection identity; Home/End chooses first/last; Enter requests detail. The group announces front identity after phase settles. Focus order follows source order, not depth order.

## Lifecycle and resource boundary

The evaluator is stateless and pure. It owns no requestAnimationFrame, pointer capture, momentum, observer, timer, decoder, network request, texture cache, or persistent state. Renderer mounts bounded cards and disposes all renderer resources on teardown. Product owns preview scheduling, media decoding, offscreen suspension, context loss, and export sampling.

## Risks and mitigations

1. **Looks like generic orbit.** Preserve one calm tray, one gate, stable equal spacing, and no extra apparatus.
2. **Front/rear cues disagree.** Derive y, depth, scale, alpha, and z-order from one projected coordinate.
3. **Two-card z tie.** Use exact depth plus stable source tie-break and an epsilon phase at ambiguous authoring stops.
4. **Rear dim contaminates artwork.** Use container alpha only; front source stays untouched.
5. **Large sets become confetti.** Use an explicit 18-source cyclic window while retaining full source-order progression.
6. **Drag becomes hidden authority.** Treat drag/keys as ephemeral preview time only.

## Later human decision

Recommendation: keep only the three controls above, retain a visible rear-alpha floor, and reject any decorative ring line by default. Human review must set final radius/tilt/card-size and judge whether 18-source virtualization still reads as one calm ring. `verdict: pending`.
