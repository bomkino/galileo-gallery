# S0 charter candidate — Wide Ellipse

## Candidate identity

- stable Scene ID candidate: `spin-image-orbit`
- candidate version: `1`
- catalogue label: **Orbit — Wide Ellipse**
- status: candidate charter; `verdict: pending`
- implementation status: clean-room isolated prototype only

**Motion sentence:** Ordered frames make a broad, tilted panoramic pass through readable shoulders and one coherent front gate, with depth and occlusion derived from a single spatial ellipse.

**Anti-motion sentence:** Never turn the pass into a circular calm tray, nonlinear proximity swell, fast cylinder, nested orbits, individual card tumble, mandatory orbit decoration, or a generic orbit evaluator selected by preset constants.

## Emotional and material metaphor

A wide camera move around a suspended strip of prints: lateral, cinematic, and assured. The Scene should feel like moving past a curved gallery wall, not watching planets, a carousel toy, or cards flying at the viewer.

## Physical model

- One planar ellipse exists in local 3D space with independently meaningful major and minor dimensions.
- The plane receives authored yaw and pitch. Both rotations change projected path, camera depth, z-order, and shoulder locations through one matrix.
- Each source owns one stable angular identity. Ordered sources remain evenly spaced in source order.
- Cards remain broadly camera-facing. The path moves; individual frames do not tumble, corkscrew, or self-spin.
- Perspective scale, container alpha, and occlusion derive from rotated plane depth. There is no extra proximity kernel.
- The front gate is the analytical maximum of camera depth, not an arbitrary screen-centre trigger.
- Two shoulder zones sit on either side of the front gate. They remain large and opaque enough to read while strong lateral travel stays visible.
- Source-safe rear behavior uses bounded geometric recession and container alpha only.

## Time grammar

### Entry

A coherent partial arc expands into the full ellipse. Existing angular order is already present; no source pops into a final slot.

### Panoramic cycle

Frames travel continuously through rear arc, approach shoulder, front gate, departure shoulder, and rear. Lateral movement dominates silhouette. Global pace belongs to Timeline.

### Spotlight

An authored source travels through the normal approach shoulder, reaches the analytical front gate, and holds. The whole ellipse remains visible enough to explain its position.

### Finale

The final unmuted source completes one controlled shoulder-to-front passage and holds while the remaining frames preserve the panoramic arc. Finale uses ellipse geometry, never a generic centre zoom.

### Exit and seam

The full ellipse contracts back into the same hidden partial-arc state. At the loop seam, end equals start exactly. Reverse samples the same states in opposite temporal order.

## Timeline compilation

- **Automatic:** derive duration from count and Product pace while preserving a minimum 620 ms shoulder approach, 760 ms spotlight hold, and 900 ms finale hold. Candidate six-frame study: 9,600 ms.
- **Fixed duration:** keep holds literal; scale rear and shoulder travel proportionally. Reject targets below 3,800 ms when both holds are enabled.
- **Directed:** cycle segments advance spatial turn; hold segments pin a source at the front gate. Casino fast ×2 / regular ×1 / fast ×1 may accelerate rear travel, but the regular front/shoulder passage remains readable.
- **Forward/reverse:** exact temporal inversion.
- **Direction ownership:** Timeline owns clockwise/counterclockwise traversal. It is not a sixth Scene control.
- **Authoring inspection:** drag/keyboard may set ephemeral inspection time/identity only. It never changes serialized/output motion.

## Essential controls

| Control | Default | Serialized meaning |
| --- | ---: | --- |
| `ellipse-width` | 88% | Full projected major-axis span before plane rotation. |
| `ellipse-height` | 34% | Full local minor-axis span before plane rotation. |
| `plane-yaw` | 26° | Rotation of the ellipse plane around its vertical axis. |
| `plane-pitch` | 14° | Rotation of the ellipse plane around its horizontal axis. |
| `card-size` | 21% | Base card width against canvas short axis before ratio and safety cap. |

Timeline owns pace, direction, mode, holds, and finite/loop policy. Frame owns fit, ratio, padding, crop, and focal intent. Look owns world treatment. No depth, alpha, glow, line, or “cinematic” control is earned.

## Count and bounded-many policy

- **0:** honest empty-stage fallback.
- **1:** one camera-facing frame follows entry/hold/exit at the front gate; no fake orbit.
- **2:** opposing path positions preserve explicit front/rear order and meaningful shoulder travel.
- **3–24:** all ordered sources occupy the ellipse.
- **25–127:** evaluate all source identities and mount an 18-source cyclic window around the front gate. Guard sources enter/leave only through the rear arc at low alpha. Every source reaches both shoulders/front in order across story time.
- **Recommended:** 6 sources.

## Mixed ratios and collision

Card width is shared; height follows resolved source ratio. A deterministic per-card scale cap uses actual projected bounds and canvas safe areas. Tall cards may receive less perspective enlargement, but they retain the same centre path, depth, alpha law, front gate, and hold duration. No source is stretched or coerced into a common ratio.

## Canvas recomposition

- **Wide landscape:** broad major axis, shallow but visible height, positive yaw, restrained pitch; strong left/right travel.
- **Portrait:** narrow major span to remain inside stage, increase effective minor axis, soften yaw, add pitch, reduce card size. The result is a deliberate tall panoramic loop, not a clipped landscape ellipse.
- **Square / 4:5:** interpolate the same plane model; preserve shoulder readability and major-axis dominance where space permits.

## Source, Look, alpha, video, failed media, audio

- At every declared shoulder/front hold: container opacity `1` at front and at least `0.72` in readable shoulders; artwork opacity `1`, filter `none`, blend `normal`.
- No source brightness, tint, light sweep, blur, grain, border, or color correction belongs to Scene geometry.
- Frame/Product owns contain/cover/crop/focal intent, ratio, and padding.
- Video samples Product story time. Ellipse travel never seeks, pauses, speeds, or loops source video independently.
- Failed media retains ordered identity, resolved fallback ratio, path slot, z-order, and accessible name.
- Transparent mode needs no line, glow, shadow, star field, or matte. Fully transparent output pixels carry zero RGB.
- Audio remains Product-owned and unchanged.

## Reduced motion and interaction

Reduced motion resolves to a stable front frame with two readable shoulders and a quiet rear context. Entry, continuous turn, spotlight travel, finale travel, and exit interpolation are disabled. Left/Right steps ephemeral inspection identity; Home/End selects first/last; Enter opens detail. Focus order follows source order, not depth order. Hover may identify a source but cannot alter story time, direction, scale, alpha, or z-order.

## Lifecycle/resources

The evaluator is pure and stateless. It owns no wall clock, rAF, pointer, scroll, hover state, observer, timer, network request, decoder, worker, texture, or persistent store. The removable prototype uses rAF only to advance explicit preview time. Renderer mounts bounded cards; Product owns media cache, video decode, offscreen policy, remount, context loss, and disposal.

## Risks and mitigations

1. **Ellipse becomes Calm Ring stretched.** Plane yaw/pitch must materially shift front gate, shoulders, depth, and occlusion; lateral travel remains dominant.
2. **Looks like Proximity with a different radius.** Use geometric perspective only—no nonlinear near kernel or local near-time swell.
3. **Cards tumble.** Keep source planes camera-facing; allow no per-card yaw/pitch/roll control.
4. **Shoulders become unreadable.** Derive alpha/scale from depth with declared shoulder floors and test both sides.
5. **Portrait clips.** Recompose effective width/height/yaw/pitch/card size from canvas aspect and apply ratio-aware caps.
6. **Dense sets pop.** Use a stable rear-window boundary and preserve source identity across turn.
7. **Decoration impersonates geometry.** Do not require orbit line, glow, shadow, or world apparatus.

## Later human decision

Recommendation: approve five-control ownership, 88/34/26/14/21 defaults, analytical front gate, camera-facing cards, and no nonlinear proximity response. Human review must judge cinematic breadth, shoulder readability, pace, portrait recomposition, and whether the front gate is composed rather than lopsided. `verdict: pending`.
