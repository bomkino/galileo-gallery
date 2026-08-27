# Galileo Gallery Scene Ateliers

This branch prepares six independent GPT-5.6 Sol Pro contexts to give every named Gallery Scene a
deep design and engineering pass without creating six writers against the Product shell.

## What the six chats do now

Each atelier owns one isolated directory and four or five named Scenes. It produces, for every
Scene, a candidate S0 charter, clean-room visual/motion study, deterministic evaluator prototype,
capability and control model, edge/resource policy, test vectors, and a human-review packet. These
are implementation inputs, not integrated Product Scenes and not automatic acceptance.

Production S1 implementation stays blocked until the shared sequence closes:

`G06 + G08 integration -> G09 -> G10A Swipe Stack -> G10B Orrery -> G10C The Build -> G10D Look freeze -> G11`

Pressure-scene atelier work for `swipe-stack`, `the-orrery`, and `the-build` remains a charter and
laboratory study until their serial G10 tickets activate.

## Why this shape

- Six chats can explore voice, composition, motion, controls, fixtures, and edge policy in parallel.
- No chat edits `src/`, Electron, package files, workflows, registry, catalogue, or shared contracts.
- No generic renderer can impersonate 29 authored Scenes.
- Later S1 implementation can run at most three disjoint Scene modules at once, followed by one
  serial catalogue owner.
- Human review remains responsible for identity, defaults, real-speed motion, and visual taste.

## Lanes

| Atelier | Branch | Assigned Scenes |
| --- | --- | --- |
| 01 | `codex/g11-atelier-01-linear-worlds` | `cms-slideshow`, `deck-river`, `filmstrip-river`, `wave-ticker`, `deck-river-loader` |
| 02 | `codex/g11-atelier-02-decks-stacks` | `opening-reel`, `swipe-stack`, `the-stack`, `hero-deck-object`, `coverflow-gallery` |
| 03 | `codex/g11-atelier-03-fans-orbits` | `slide-fan`, `dealers-fan`, `orbit-ring`, `proximity-orbit`, `spin-image-orbit` |
| 04 | `codex/g11-atelier-04-spatial-objects` | `zoetrope`, `spiral-image-vortex`, `the-orrery`, `vitrine`, `the-shelf` |
| 05 | `codex/g11-atelier-05-prints-tables` | `drift-deck`, `image-scatter-gallery`, `the-hang`, `deck-contact-strip`, `contact-sheet` |
| 06 | `codex/g11-atelier-06-editorial-builds` | `light-table`, `before-after-slider`, `slide-anatomy-object`, `the-build` |

Quiet Carousel already exists as the separately engineered replacement candidate for the
`cms-slideshow` catalogue slot. Atelier 01 must compare the two identities and recommend one stable
catalogue identity; it must not build a duplicate carousel under another name.

## Output ownership

Each chat writes only:

```text
scene-ateliers/atelier-0N/
  ATELIER_RECEIPT.md
  <scene-id>/
    S0_CHARTER_CANDIDATE.md
    SCENE_DNA.md
    CAPABILITY_AND_CONTROLS.json
    TIMELINE_AND_EVALUATOR.md
    SOURCE_FIDELITY_ALPHA_AND_LOOK.md
    EDGE_RESOURCE_ACCESSIBILITY.md
    PROVENANCE.md
    TEST_VECTORS.json
    prototype/
    evidence/
    HUMAN_REVIEW_PACKET.md
```

Prototype contents must stay self-contained inside the Scene directory. They may use existing
repository dependencies, but may not edit dependency manifests or introduce network-loaded code.

## Handoff back to the integration thread

Return branch, start/end commit and tree, exact files, checks, captures, provenance status,
unresolved charter decisions, and one recommended next Scene. Do not open a PR or merge. The main
Gallery thread will compare the six packets, obtain human charter decisions, and promote no more
than three disjoint S1 implementations at once.

Read `COMMON_CONTRACT.md` and the exact prompt under `prompts/` before starting an atelier.
