# Provenance — Spiral Image Vortex

Packet ID: `R03-spiral-image-vortex`
Class: **historical evidence; rights unknown; principle-only; zero code reuse**

## Archive verification

- Mega kit SHA-256: `50827e294fece59abdd864c15615fe7885213af47db3fe221be44f0794a6a29b`
- Reference manifest SHA-256: `c8935628219292a3da00ab13e5b3dcaddd7e02b90a223b2ec6863b38553dd956`
- Manifest verification: `29/29` mapped entries matched.

## Mapped file

- Sanitized identity: `gallery-original-components/SpiralImageVortex.tsx`
- Expected SHA-256: `49eeb8ba921dc0e349b24950dd35f4ba34984c3dd78e2e4d04f43d47deebe60a`
- Observed SHA-256: `49eeb8ba921dc0e349b24950dd35f4ba34984c3dd78e2e4d04f43d47deebe60a`
- Byte size: `17,330`
- Integrity: match.
- Rights: unknown; checksum grants no reuse/publication right.

Reference README and only this mapped source were inspected. Missing source was not fetched elsewhere.

## Principle observations retained

- ordered media associated with a spiral-like path;
- clear front/rear depth ambition;
- continuous progression rather than discrete slideshow cuts;
- a near passage as likely focus station.

## Historical behaviour rejected

The historical component is materially a flat Archimedean screen-space spiral. It duplicates sources modulo slot count, fades at path endpoints, advances through requestAnimationFrame time, uses external demo image URLs, and adds independent flourish translation/rotation. All of that is rejected:

- no flat radius-to-centre spiral;
- no visible modulo duplication;
- no opacity seam;
- no wall-clock evaluator;
- no arbitrary flourish;
- no external media;
- no random/component-local card rotation.

## Live behaviour at selected SHA

At `bomkino/galileo-gallery@c90a7982a981b1a1b2624f5eb0db81e6c2da62b5`, the central renderer calculates a spiral from static source index `t`, radius increasing with `t`, and one phase angle; it also varies opacity with depth. This is useful negative evidence but does not satisfy continuous path identity, endpoint recycling, or source-fidelity requirements.

## Dependencies/assets

Historical evidence references React/Framer-style application code and external demo media. Candidate prototype imports none of it. It uses platform DOM/CSS, generated local SVG data, pure JavaScript/Node checks, system Chromium/Playwright captures, and Pillow composites. No Product import, manifest edit, network media, external URL, copied asset, or historical choreography table is present.

## Zero-code-reuse statement

No historical code, CSS, constants, identifiers, strings, assets, component structure, external URLs, or choreography table was copied. Geometry, seam, controls, tests, and prototype were independently authored from the catalogue promise and live contract.

## Deletion path

Delete `scene-ateliers/atelier-04/spiral-image-vortex/`. No Product source, registry, package, workflow, schema, or shared contract references it.
