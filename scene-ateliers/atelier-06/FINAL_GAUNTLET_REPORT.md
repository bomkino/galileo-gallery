# Atelier 06 final gauntlet report

Date: 28 August 2026

Scope: `light-table`, `before-after-slider`, `slide-anatomy-object`, and `the-build` inside the isolated Atelier 06 write boundary.

## Material defects found and corrected

1. Removed an evidence assertion that could never fail. The replacement checks observable evaluator output and is mutation-sensitive.
2. Replaced mode labels masquerading as behaviour. Automatic, exact fixed-duration, and directed modes now compile to measurably different timing while sharing one pure evaluator.
3. Rejected `NaN`, infinities, negative dimensions, invalid ratios, invalid counts, and out-of-range controls before evaluation.
4. Made fixed-duration output exact rather than approximately scaled.
5. Removed reduced-motion seam jumps. Reduced motion now presents a stable, meaningful authored state rather than a frozen arbitrary frame.
6. Removed caption-only dead phases when no caption exists.
7. Preserved failed-media identity and order instead of collapsing the layout.
8. Added bounded dense-layout behaviour for twenty-four Light Table items and collision checks for ordinary fixtures.
9. Removed per-frame DOM replacement in the browser studies. Stable keyed nodes now receive transform and style updates.
10. Synced video fixtures to deterministic story time. Browser autoplay and wall-clock time no longer define Scene state.
11. Added visible duration and mode feedback, causal reset behaviour, 44 px minimum controls, keyboard play/scrub/Home/End controls, and a restrained live region.
12. Added disposal/remount checks for animation frames, listeners, observers, media state, and generated object URLs.
13. Added sensitivity tests that deliberately inject source tinting, fake directed timing, broken reversal, dead caption phases, return-path corruption, invalid finite values, unstable node identity, and reduced-motion discontinuity. Every injected regression is detected.

## Scene-specific corrections

### Light Table

The Scene remains a review surface, not a draggable mood board. One item becomes a centred inspection plate; two remain a comparison pair; six is the default working set; twenty-four is the visible bound. Loupe movement follows a deterministic review path. Illumination remains behind the media and never changes source pixels.

### Before / After

The Scene requires exactly two semantic sides. One source does not impersonate two; extras remain preserved outside the evaluator contract. The divider reverses continuously, never hard-resets, and exposes source labels only when present. Directed mode uses two fast sweeps, one regular sweep, and one final fast sweep.

### Slide Anatomy

The clean-room default is `flat-source`: only presentation apparatus known to the Project separates. The study does not infer semantic layers from pixels. Assembly and return share one physical path. Empty captions no longer allocate a dead beat.

### The Build

This remains a G10C preflight study, not production implementation. The evaluator presents Project-known apparatus around a flat source and does not fabricate palettes, typography trials, approval marks, or process authorship. The diagnostic phrase retains an 11.6 s default and rejects durations below the 7.9 s readable floor.

## Gate outcome

The final packet is required to pass deterministic core vectors, browser interaction checks, mutation sensitivity checks, JSON validation, provenance scans, source-fidelity assertions, resource bounds, reduced-motion checks, exact loop seams, and `git diff --check`. Automated results prove mechanics, not taste. Human verdicts remain pending.
