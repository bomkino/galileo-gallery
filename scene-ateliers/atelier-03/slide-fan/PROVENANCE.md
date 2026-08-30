# Provenance — `slide-fan`

## Packet identity

- packet: `R03-slide-fan`
- provenance class: **unknown-rights historical reference; principle-only clean-room study**
- implementation source: catalogue promise, observable current live behaviour, and independently derived geometry
- code reuse from historical reference: **zero**
- asset reuse from historical reference: **zero**

## Integrity record

- reference file: `SlideFan.tsx`
- expected SHA-256: `7eb31bfb9d4d4088f7be1e810855198633b508a10af36bdf243d54cfc7ec089b`
- observed SHA-256: `7eb31bfb9d4d4088f7be1e810855198633b508a10af36bdf243d54cfc7ec089b`
- observed bytes: `36035`
- source manifest: verified; all 29 listed files passed
- sanitized source identity: supplied Framer/React fan component from the attached historical reference annex
- rights/publication status: unknown

Checksum equality proves annex integrity only. It does not establish ownership, licence, production fitness, or publication rights.

## Current live behaviour at branch start

Repository: `bomkino/galileo-gallery`

Branch start commit: `c90a7982a981b1a1b2624f5eb0db81e6c2da62b5`

Current central renderer groups `slide-fan` and `dealers-fan` in one conditional pose branch. It gives each source a static spread-derived x/y/rotation, then uses the shared phase focus weight to lift one card. The two catalogue entries differ mainly by constants such as spread, vertical placement, width, and transform origin. This does not satisfy independent modern Scene identity and is treated only as observable live behaviour, not an implementation seam.

## Observable historical principles retained at idea level

- a fan benefits from angle-derived curved placement rather than a straight row;
- mixed source ratios and contain/cover need explicit ownership;
- stable pointer/focus handling matters when cards overlap;
- an entry can reveal the fan progressively;
- offscreen preview work should pause;
- keyboard focus and restoration matter for overlapping cards.

## Historical behaviour explicitly rejected

- timer/CSS-animation state as export authority;
- pointer tilt, hover lift, click modal, or requestAnimationFrame state as serialized Scene truth;
- handcrafted per-card jitter or sway tables;
- hover-based z-order promotion as the main selection system;
- full-screen lightbox as Scene finale;
- copying constants, class names, identifiers, strings, CSS, component structure, or choreography.

## Dependencies and assets observed

The reference depends on React, Framer property controls/static-renderer signalling, browser observers/events, DOM portal/focus management, and externally supplied image sources. None is copied into the prototype. The prototype uses dependency-free local HTML/JS and generated SVG fixtures.

## Clean-room statement

The candidate evaluator and prototype were written from the motion promise and independently specified bottom-centre hinge equations after documenting only observable principles. No historical code, CSS, constant, identifier, string, asset, external URL, component structure, or choreography table was reused.

## Deletion path

Delete `scene-ateliers/atelier-03/slide-fan/**`. No Product source, registry, schema, dependency, build, test, package, or workflow file depends on this docs/prototype packet.


## Later public open-source principle study

A separate clean-room pass studied public, pinned Toolcraft, Theatre.js, tldraw, and three.js
materials for interaction ownership, history transactions, sequence transport, renderer selection,
and resource lifecycle. No source, CSS, constants, identifiers, assets, component structure, or
choreography was copied. Exact pins and applied/rejected principles are recorded in
`../TOOLCRAFT_AND_OPEN_SOURCE_STUDY.md`.
