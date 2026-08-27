# ADR 0003: earn the first Scene seam through Quiet Carousel

Status: accepted for G02 source tracer

Date: 27 August 2026

## Context

The existing application renders many centrally registered visual presets through
large shared components. That source remains useful comparison material, but
registering another mode there would not prove the independent Scene,
deterministic Timeline, clean Project, or stage-first product seams required by
the rebuild.

G02 needs one complete, reversible tracer. This runner cannot launch any browser
renderer: its kernel denies local socket creation, including Xvfb and Chromium's
headless Ozone path. Source and deterministic diagnostic work can continue, but
runtime visual and motion acceptance cannot be inferred.

## Decision

Add `quiet-carousel` v1 as one independent Scene module with:

- canonical defaults and bounded causal control descriptors;
- one pure finite Timeline compiler for automatic, fixed-duration, and directed
  fast x2 / regular x1 / fast x1 intent;
- one pure evaluator used by preview, scrub, and diagnostic checks;
- horizontal and vertical coordinate policies;
- source-faithful contain default, no artwork filter/opacity treatment, and an
  explicit transparent background result;
- bounded one-to-one evaluated frame state and visible-frame rendering;
- one browser-development Project adapter with strict local fixture validation;
- exact G01B portable Project round trip for Timeline mode and segments.

Expose the stage-first tracer only at `?tracer=quiet-carousel`. Keep the existing
application as the default route until the tracer receives real renderer,
source-RGB/alpha, motion, accessibility, and human visual evidence.

Frame gap is stored in design pixels at a 1080-pixel cross-axis and scaled by
the evaluated stage. Preview and diagnostic/export-sized evaluations therefore
retain proportional composition.

## Consequences

- G02 has a narrow source-ready seam without scaffolding the other 28 Scenes.
- Existing application and packaging paths remain intact and reversible.
- Browser storage is development evidence only. It accepts bounded generated
  SVG fixture media and never claims native file authority.
- G03/G04/G05 remain blocked until G02's real renderer packet passes. Automated
  evaluation does not claim taste, source RGB equivalence, clean encoded alpha,
  real-speed motion, or human acceptance.
