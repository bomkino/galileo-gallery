# S0 charter candidate — Deck River / Continuous

- Catalogue ID: `deck-river`
- Candidate charter version: `1`
- Verdict: **pending**
- Work state: candidate charter + isolated prototype only

## Motion sentence

Frames approach, pass the viewer, and recede through one fixed-camera depth corridor whose offstage
return closes beyond the visible frustum.

## Anti-motion sentence

Never fake depth with brightness, opacity, blur, random sway, per-card bob, independent z scaling, or
a teleport from near plane back to the distance.

## Emotional and material metaphor

A camera held still inside a long exhibition passage. Prints travel through the architecture in a
single circulation loop: distant approach, shoulder pass, receding lane, invisible far return.

## Authored camera-world

- Fixed camera at the origin, looking into positive world depth.
- Fixed horizon at `46%` stage height in landscape; `43%` in portrait.
- Perspective field equivalent: approximately `42°` vertical field of view.
- One closed racetrack centreline in the horizontal/depth plane.
- Four continuous regions: approach lane, near passage, receding lane, far return.
- The far return sits beyond the declared visible-depth plane. Recycling therefore occurs offstage,
  not through opacity disappearance.
- Cards stay substantially camera-facing. Limited yaw may communicate lane geometry; typography
  must remain readable.
- Near passage stays outside a protected central comfort zone. No card crosses the camera origin.

## Topology

```text
far return (outside frustum)
     ┌──────────────────────┐
     ↓                      ↑
approach → near passage → recede
              camera
```

This is a closed world path, not a translateZ carousel. Source identities occupy equal arc-length
intervals and keep their order through every region.

## Time grammar

| Phrase | Behaviour |
| --- | --- |
| Entry | Already inside the coherent corridor; first visible frame emerges from far depth. |
| Cycle | Constant arc-length travel around the closed centreline. |
| Near pass | Geometric acceleration in screen space caused by perspective, not a Timeline speed pulse. |
| Hold | Timeline freezes the complete world state. |
| Finale | Optional target parks at the near-passage landmark without growing into a chapter arrival. |
| Exit | Continues onto the receding lane and beyond visible depth. |
| Seam | Far-return position and tangent close continuously outside the frustum. |

## Timeline modes

- **Automatic:** one complete circulation at a calm base pace.
- **Fixed duration:** integer circulation count fitted to exact duration.
- **Directed:** Product segments own speed and holds; Scene only evaluates centreline position.
- **Reverse:** traverses the same racetrack backwards. Approach/recede roles swap causally; nothing
  teleports or mirrors source artwork.

## Candidate defaults

- Frame scale: `0.27` of stage short axis at near passage.
- Depth spacing: `1.00` world scale.
- Lane spread: `3.10` world units.
- Near passage: `1.90` world units from camera centre.
- Visible depth: `14.50` world units.
- Pace: `1050 ms` per source interval, Timeline-owned.
- Direction: forward, Timeline-owned.
- Fit: `contain`, source/media intent.

## Essential Scene-only controls

1. **Frame scale** — near-passage card size.
2. **Depth spacing** — corridor length and source separation in world depth.
3. **Lane spread** — lateral distance between far approach/recede lanes.
4. **Near passage** — protected lateral distance at closest pass.
5. **Visible depth** — geometric far clipping plane; never artwork haze.

No sway seed, light, dimming, brightness, blur, tilt table, lane count, camera animation, or random
character control.

## Media-count policy

- **0:** Product empty state; no generated corridor occupants.
- **1:** one frame completes the full world path with an intentionally long offstage interval.
- **2:** half-cycle separation; one approaches while one recedes.
- **3–12:** preferred corridor density.
- **13–64:** retain equal arc spacing; renderer culls beyond visible depth and canvas bounds.
- **65–256:** evaluator remains bounded; human approval required before catalogue recommendation for
  dense decks because near-passage collision risk rises.

## Collision, clipping, and nausea bounds

- No card centre may enter the camera comfort radius.
- At default controls, adjacent projected bounds may not overlap by more than `6%` at near passage.
- Near card scale must stay below `1.08` of authored frame scale.
- Yaw remains below `10°`; roll remains `0°`.
- No camera movement, speed blur, depth-of-field blur, oscillation, or random lateral motion.
- Cards clip only at canvas bounds, near plane, or visible-depth plane.

## Canvas recomposition

- Landscape: approach and recede lanes spread horizontally around a fixed central corridor.
- Portrait: lane spread contracts, horizon rises, near passage moves lower, and frames scale from
  width. The camera-world is recomposed; the landscape output is not rotated.
- Square/4:5: preserve two visible depth lanes while keeping a central comfort zone.
- Mixed ratios preserve full source shape under `contain`.

## Source, Look, alpha, video, failure, and audio boundaries

- Depth comes from projection geometry only.
- Source opacity is `1`; filter is `none`; no distance luminance treatment.
- Look may draw a room or transparent field behind the corridor but cannot relight artwork.
- Transparent and soft-alpha sources remain transparent through projection.
- Video time follows global story time through approach, pass, recede, and holds.
- Failed media occupies its original arc slot with a neutral Product placeholder.
- Audio remains Product-owned. The Scene has no Doppler, pan, proximity gain, or mute behaviour.

## Reduced motion

- Stop circulation.
- Quantize story time to discrete authored corridor landmarks: far approach, middle approach, near
  passage, middle recede, far recede.
- Keep perspective composition but remove screen-space traversal between landmarks.
- Do not replace travel with camera zoom, source fade, or blur.

## Keyboard, focus, and lifecycle

The visual Scene creates no interactive cards. Studio scrub, Play, direction, count, canvas, and
reduced-motion controls remain keyboard reachable. Evaluator is pure. Renderer subscribes once to
Product time, culls offstage instances, pauses off-window video, and releases observers/media on
unmount. Context loss falls back to the same 2D projected poses.

## Risks

- A shallow corridor becomes Quiet Carousel with perspective dressing.
- An open non-looping path becomes Chapter Reveal.
- Brightness/haze would violate source fidelity.
- Excessive lane spread reads as two independent streams.
- Excessive near scale or camera motion causes nausea.
- Equal parameter spacing instead of arc spacing causes near-region bunching.

## Later human decisions

1. Is the default near passage thrilling without feeling aggressive?
2. Does the corridor remain legible in portrait?
3. Is the far return sufficiently invisible without artwork fade?
4. Should a finale hold be supported at all, or remain Chapter Reveal territory?
5. What maximum dense-deck count still reads as authored rather than traffic?

No formal charter approval, production Scene implementation, registry edit, catalogue integration,
release, or human acceptance is claimed.
