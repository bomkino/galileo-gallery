# Source fidelity, alpha, and Look — Before / After

## Comparison validity

The Scene is useful only when it leaves both sources materially untouched. Each side renders with opacity 1, filter `none`, normal blend, and no Scene-authored grade, tint, sharpening, blur, grain, vignette, light sweep, border, shadow, glow, or texture.

The divider clips geometry; it never changes source pixels. Labels and the divider are separate UI siblings above the comparison box and may not use blend modes that recolour artwork.

## Fit and registration

Contain is the Clean default. If source ratios differ, the mismatch remains visible. Cover is allowed only as explicit user intent and carries a comparison-validity warning. The Scene does not infer crop boxes, focal points, perspective correction, warping, alignment landmarks, or semantic registration.

A future registration service must be separately chartered, persisted, inspectable, reversible, and shared by preview/export. It is not hidden inside this Scene.

## Failure and order

Before and After identities persist even when one source fails. The failed side displays a causal placeholder in the same role. One-side success must not expand to impersonate both roles. Extra Project items remain outside the evaluation but are never deleted or reordered.

## Alpha

Candidate output is intentionally opaque. Straight-alpha comparison is unresolved because two transparent sources can expose background, overlap, fringe colour, and premultiplication differences that a simple clip does not settle. `transparentReady: false` is an honest capability, not a missing checkbox.

## Look boundary

The shared Look may style only the world outside the comparison box and the backed labels/divider. It may not colour-wash either source. Stable luminance and decorrelated world grain remain future G10D responsibilities. Audio remains Project-owned.
