# S0 charter candidate — Slide Anatomy

Status: candidate; human verdict pending.

## Memorable outcome

One slide briefly opens into a legible stack of Project-known presentation parts, holds long enough to understand their relationship, then closes along the same physical path without pretending to know how the artwork itself was authored.

## Emotional register

Explanatory, precise, tactile, intelligent. More museum cutaway than software explode effect.

## Motion sentence

The frame, backing, guides, and optional caption apparatus separate along shallow depth, settle into a readable anatomy, then retrace the identical path into the untouched source slide.

## Truth boundary

The Clean default is `flat-source`. The Scene may separate only layers the Project actually owns:

- world backing or matte;
- source frame as one indivisible plane;
- optional Project caption apparatus;
- optional Project-safe guides or crop/focal markers;
- frame surround that is outside source pixels.

It may not infer semantic image layers, text boxes, logos, masks, typography hierarchy, subjects, colours, or construction history from a flattened bitmap or video.

A future `authored-layers` capability requires an explicit versioned Project contract. Until then, every source image remains one plane.

## Anti-goals

- No fake Photoshop layer stack.
- No segmentation presented as authorship truth.
- No decorative parallax inside source pixels.
- No arbitrary fragments, shards, or 3D extrusion.
- No colour wash, glow, grain, or shadow over artwork.
- No assembly hold when there is nothing additional to explain.
- No generic “build” identity; this Scene explains stable structure and returns.

## Composition

One source owns the centre. Apparatus separates into a restrained oblique stack with enough negative space for labels. Depth order remains stable. No plane crosses or collides. On portrait canvases, separation favours vertical room; on wide canvases, it favours shallow lateral and depth offsets.

## Time

Automatic mode performs one open–hold–close phrase. Fixed-duration mode retimes the same phrase exactly. Directed mode compiles fast ×2, fast ×2, regular ×1, fast ×1 phrases. Reverse starts anatomised and closes first, then reopens along the same path; it does not scramble layer order.

Empty caption and absent guide apparatus remove those semantic phases entirely. The evaluator never reserves invisible time for a layer that does not exist.

Reduced motion presents the settled anatomy as a static labelled cutaway. Manual focus may select a plane instantly.

## Controls

Only Project-grounded controls: separation depth, viewing angle, hold, label visibility, guide visibility when guides exist, fit, direction, and background. No layer count, random spread, inferred semantics, per-plane colour, source shadow, or material controls.

## Accessibility and lifecycle

The state is exposed as `closed`, `opening`, `open`, or `closing`; each present apparatus plane has a readable name and stable focus order. Keyboard toggles closed/open, scrubs phrase, and selects apparatus. Minimum 44 px controls. Disposal releases animation, observers, media seeks, listeners, and generated URLs.

## Acceptance boundary

This packet proves only a flat-source presentation-anatomy candidate. It does not prove semantic extraction, authored-layer ingestion, Product integration, final Look, packaging, or human approval.
