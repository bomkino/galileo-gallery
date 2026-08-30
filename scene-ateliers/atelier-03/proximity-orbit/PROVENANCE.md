# Provenance — Proximity Orbit

## Record

- packet: `R03-proximity-orbit`
- provenance class: historical reference; rights unknown; principle-only
- annex pin: Galileo Gallery `2762043bb733aa28a6c63fe26564504b9f257564`
- mapped file: `ProximityOrbit.tsx`
- expected SHA-256: `951b2228eef2a5526146593826ec034b02731e2aae12ebd249f60a220e77cf79`
- observed SHA-256: `951b2228eef2a5526146593826ec034b02731e2aae12ebd249f60a220e77cf79`
- observed bytes: `17598`
- observed lines: `331`
- manifest verification: pass
- reference README read before mapped file

## Sanitized source identity

Historical Framer/React source describes a circular orbit with wall-clock rAF phase, direction/speed controls, hover speed-up/slow-down/pause, observer entry, optional timer/cycle flourish, front-dependent scale/opacity, image padding/ratio, and external default image URLs.

## Principles retained

Near/far path should change scale/alpha coherently; ordered spacing matters; reduced motion and image ratios require policy; a path can use frontness to create intimacy.

## Rejected behavior

Hover-dependent output velocity, wall-clock phase, observer/timer/interval flourish, external default URLs/assets, linear front scale as the entire identity, direct React frame state, source lighting/accent, historical controls/constants/names/CSS/strings/component structure.

## Dependencies/assets

Historical source references React, Framer, DOM media queries/observers/timers/rAF, images, CSS, and external URLs. Nothing was copied. Prototype uses generated local fixtures, dependency-free HTML/JS, and its own removable SVG renderer.

## Current live behavior at start

At exact branch SHA `c90a7982a981b1a1b2624f5eb0db81e6c2da62b5`, `proximity-orbit` is registered but shares the generic central `orbitPose` branch with Calm Ring, Wide Ellipse, and Zoetrope. That current behavior does not prove distinct modern Scene identity.

## Zero-code-reuse

No source code, comments, CSS, constants, identifiers, strings, assets, URLs, component structure, or choreography table was copied/adapted. The nonlinear camera-distance law, local speed allocation, controls, prototype, and evidence are clean-room.

## Deletion

Delete `scene-ateliers/atelier-03/proximity-orbit/`; no Product import, registry edit, dependency/workflow/package change, or shared engine remains.


## Later public open-source principle study

A separate clean-room pass studied public, pinned Toolcraft, Theatre.js, tldraw, and three.js
materials for interaction ownership, history transactions, sequence transport, renderer selection,
and resource lifecycle. No source, CSS, constants, identifiers, assets, component structure, or
choreography was copied. Exact pins and applied/rejected principles are recorded in
`../TOOLCRAFT_AND_OPEN_SOURCE_STUDY.md`.
