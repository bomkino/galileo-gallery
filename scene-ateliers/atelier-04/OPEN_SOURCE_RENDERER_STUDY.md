# Open-source renderer study

Updated: 28 August 2026

## Decision

Do not turn Galileo Gallery into Toolcraft, Three.js, React Three Fiber, Theatre.js, Motion Canvas, deck.gl, regl, or OGL. Adopt narrow principles only where they strengthen the authored Scene contract.

- Toolcraft: one operation has one primary interaction owner; live gestures remain transient and commit once; every visible control proves a product observable.
- Three.js: context loss and restoration are first-class states; renderer resources and listeners are explicitly disposed.
- React Three Fiber: demand rendering and resource reuse are useful principles; its runtime is not required here.
- deck.gl: stable identity, narrow invalidation, and explicit initialise/update/finalise phases.
- regl/OGL: a small explicit WebGL lifecycle is the right comparison baseline for textured spatial cards.
- Theatre.js/Motion Canvas: inspectable sequence position and named phases; neither becomes Gallery story-time truth.

## Scene call

| Scene | Canonical candidate | Comparison | Decision |
| --- | --- | --- | --- |
| Zoetrope | DOM / CSS 3D | None | Keep semantic gate rhythm, readable focus, and reduced-motion stepping in DOM. |
| Spiral Image Vortex | DOM / CSS 3D | Raw WebGL2 instanced atlas | Compare under many-item spatial pressure. Do not promote without human and export-parity evidence. |
| The Orrery | DOM / CSS 3D | Raw WebGL2 instanced atlas | G10B preflight only; implementation remains blocked by G10A. |
| Vitrine | DOM | None | Still holds and two-object exchange gain nothing from texture rasterisation. |
| The Shelf | DOM / CSS 3D | None | Natural widths, captions, focus, and keyboard semantics outweigh WebGL. |

The WebGL probes use generated media, a fixed authored camera, one atlas texture, instanced quads, demand rendering while paused, explicit context restoration, and explicit disposal. They are laboratory evidence only.
