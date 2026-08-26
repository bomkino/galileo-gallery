# Galileo Gallery product decisions

Galileo Gallery is a local stage-first motion studio. It keeps one portable creative Project, deterministic visual/audio story, Scene catalogue, creator journey, automation path, and capability model across Apple-Silicon AppKit/WKWebView and pinned Garuda Linux/KDE Electron targets.

## Project boundary

- Gallery starts with a clean versioned Project schema. Experimental v1 `.galileo` files are never rendered or migrated; they remain byte-identical and fail with clear copy.
- G01 is split deliberately:
  - **G01A:** hostile-archive containment, explicit quotas, app-owned staging, cancellation, cleanup, and prior-project preservation.
  - **G01B:** clean schema manifest, ordered media identities and hashes, Scene identity/version/parameters, visual Timeline intent, and audio identity.
- No current Project mutation occurs before the complete G01B archive/schema/media/hash validation succeeds.
- Portable Projects never contain absolute paths, host grants, Interface Scale, local automation state, jobs, caches, secrets, or machine identity.

## Source-fidelity requirements

Future Scene/Look work must retain these binding requirements:

- authored classical-light, grid, map, contour, wave, and cutting-mat backgrounds;
- subtle deterministic animation;
- decorrelated grain;
- stable luminance;
- clean transparency;
- no lighting treatment that washes out artwork.

These are product requirements, not proof that any current renderer satisfies them. Visual acceptance remains human-owned.

## Final walkthrough deliverables

Final acceptance still requires the exact annotated walkthrough artifact
`GALILEO_GALLERY_WALKTHROUGH_FOR_MANALI_AND_JENAI.pdf`.

Automated tests, screenshots, or an engineering receipt do not replace that PDF.
