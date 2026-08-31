# Galileo Gallery design system

This document names the active interface sources. Historical Atelier and gate evidence lives under `docs/programme/`; it does not override the shipped UI.

## Typography

Galileo Gallery vendors the public [`bomkino/pitchdog-type-system`](https://github.com/bomkino/pitchdog-type-system) at commit:

`786b4a2b671182319320f922b8de8f927ea3a002`

The packaged desktop app carries local WOFF2 files, so the interface does not depend on a network request.

| Role | Family | Use |
| --- | --- | --- |
| Display | `PD Head` | Gallery title, panel titles, section titles, empty states |
| Display alternate | `PD Head Alt` | Reserved for intentionally playful authored surfaces |
| Interface/body | `PD Body` | Buttons, controls, labels, menus, compact product copy |
| Reading/body alternate | `PD Body Alt` | Explanatory text and longer guidance |
| Metadata | `PD Eyebrow` | Eyebrows, dimensions, time, status, counts, numeric summaries |

`src/pitchdogTheme.css` owns the runtime `@font-face` declarations and role assignments. It loads after the legacy base and presentation layers, making the pitch.dog families the final default without altering Scene rendering.

Font provenance and the upstream font notice are mirrored under `docs/third-party/pitchdog-type-system/`. The machine-readable copy manifest is `src/assets/fonts/SOURCE.json`.

## Spacing

The studio uses a 4 px spacing scale:

`4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 40 · 48 · 56 · 64 · 80 · 96 px`

Tokens are named `--pd-space-1` through `--pd-space-16`, with intentional gaps in numbering where the scale skips a step. Primary surfaces, controls, panels, cards, menus, empty states, forms, the Scene browser, and responsive layouts consume those tokens rather than inventing isolated values.

The minimum interactive target remains 44 px at every Interface Scale. Larger controls use `--pd-control-compact`, `--pd-control-default`, and `--pd-control-prominent`.

## Icons

Interface icons come from `@phosphor-icons/react@2.1.10`, under the MIT License. `src/ui/PhosphorIcon.tsx` is the only product icon boundary. It uses direct per-icon imports and stamps `data-phosphor-icon` on rendered SVGs for runtime verification.

Scene artwork, rendered media, and app identity artwork are not interface icons and remain outside this rule.

## Geometry and motion

The titlebar is a three-column grid: flexible brand, optional status, fixed actions. Autosave is part of layout rather than an absolutely centred overlay, so it cannot collide with Interface Scale or action controls.

Select controls suppress the platform arrow and use the Phosphor Caret Down geometry at a consistent 16 px size with 16 px right inset. The Project control uses the live Phosphor component and rotates it as disclosure state changes.

Project is a controlled, absolutely positioned popover. Opening and closing animate opacity and transform without changing panel, stage, or titlebar geometry. Inspector workflow panels use a short entrance transition. Every motion rule becomes instantaneous under `prefers-reduced-motion: reduce`.

## Verification

`npm test` includes `npm run verify:design-system`. That gate checks:

- exact font source and WOFF2 signatures;
- package and lockfile pins;
- final stylesheet import order;
- removal of hand-authored product-control SVGs;
- Phosphor coverage for the shared icon vocabulary;
- spacing tokens and primary-surface contracts;
- documentation and third-party notices.

`npm run verify:g08-renderer` then exercises the actual Electron interface across viewport sizes and Interface Scales. It checks minimum targets, reachability, overflow, canvas geometry, titlebar sibling collisions, wrapped-action balance, select-caret geometry, Project disclosure motion and layout stability, persistence, keyboard navigation, pitch.dog font resolution, and Phosphor runtime markers, and writes screenshot evidence to `artifacts/g08/`.

## Updating

Update fonts by pinning a reviewed type-system commit, replacing all seven WOFF2 files together, refreshing `SOURCE.json`, and rerunning the full test suite. Do not hotlink font files from GitHub.

Update Phosphor as one exact dependency change. Keep product controls behind `PhosphorIcon.tsx`; do not reintroduce one-off SVG path code.
