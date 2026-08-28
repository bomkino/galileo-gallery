# Atelier 04 receipt — spatial objects

Updated: 28 August 2026

Repository: `bomkino/galileo-gallery`

Branch: `codex/g11-atelier-04-spatial-objects`

Owned surface: `scene-ateliers/atelier-04/**`

| Scene | Chartered | Prototyped | Mechanically tested | Human reviewed | Integrated | Packaged | Released |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `zoetrope` | yes | yes | yes | pending | no | no | no |
| `spiral-image-vortex` | yes | yes | yes | pending | no | no | no |
| `the-orrery` | yes | yes | yes | pending | no | no | no |
| `vitrine` | yes | yes | yes | pending | no | no | no |
| `the-shelf` | yes | yes | yes | pending | no | no | no |

`the-orrery` remains a **G10B preflight candidate; implementation blocked by G10A**.

## Creative and engineering call

- Keep Zoetrope, Vitrine, and The Shelf in DOM/CSS because semantics, accessibility, crisp source media, and editorial control outweigh GPU novelty.
- Keep DOM/CSS candidates for Vortex and Orrery, but compare them against raw WebGL2 probes under genuine spatial pressure.
- Do not import Toolcraft or a rendering framework. Adopt interaction ownership, transient gesture commits, demand rendering, stable identity, narrow invalidation, context recovery, and explicit disposal as principles.
- The review index is an offline human-review surface, not Product integration.

Automated checks do not claim visual taste, motion taste, source-pixel equivalence against user media, production preview/export integration, exact Garuda behaviour, packaging, release, or human acceptance.

## Next recommendation

Human-review **Spiral Image Vortex** first in canonical/comparison split view. Orrery follows only after G10A unlocks G10B.
