# G08 evidence receipt — Interface Scale integration and presentation polish

Date: 28 August 2026

State: **source-tested candidate; real Electron renderer evidence is pending branch CI; not packaged, released, or human-accepted**

## Identity

- Repository: `bomkino/galileo-gallery`
- Task branch: `codex/g08-interface-polish`
- Start commit: `a2e36b538d267dd86e769dcb0a7016ba30faff8a`
- Implementation commit: `7f8586f029eadb332f64047502dfda16ec7b2139`
- Implementation tree: `c70332fee40282338ca05e73a7bf5c1210dc75f8`
- Base: published `codex/g08-interface-scale-core`

## Delivered boundary

- Visible 75%–200% Interface Scale in exact 5% steps, with persistent local-only state,
  Reset, and `Ctrl/Cmd` + `+`, `-`, or `0` shortcuts.
- A scale transform boundary around the presentation surface only. Project schema, canvas identity,
  evaluator inputs, Timeline values, media, audio, and export rendering remain outside the
  presentation manifest.
- Spacious editorial-brutalist studio chrome: flat paper panels, hard near-black rules, coral state,
  a dark artwork-first stage, larger type, stronger hierarchy, and 44px-or-larger primary targets.
- Reworked scene catalogue with an oversized headline, three-column browsing rhythm, larger previews,
  clearer filtering, and truthful `17 scene studies / 29 registered motion worlds` language.
- A new pitch.dog-family Gallery identity: imperfect black picture frame plus one coral hanging cord
  that passes through the frame and becomes an orbit, on cool powder-blue paper.
- Browser favicon, renderer icon, Linux PNG, Windows multi-size ICO, macOS ICNS, and complete iconset
  share the same generated source identity.
- A real Electron G08 smoke path and CI job that capture catalogue, 100% studio, and 150% studio PNGs;
  measure rendered targets and focus; exercise keyboard scaling; prove preview metadata, Timeline max,
  and canvas ratio invariance; verify local persistence; and Reset to 100%.

## Emil design review

| Before | After | Why |
|---|---|---|
| Dense dark three-panel SaaS shell | Flat paper sidebars around a hard-edged dark stage | Gives artwork focus while making the editor modern, legible, and inviting. |
| 7–13px labels and 25–36px actions | Larger hierarchy and 44px+ primary targets | Improves touch, motor accessibility, and scan speed. |
| Soft glass, gradients, glow, and many rounded pills | Near-black rules, squared controls, flat colour, restrained block shadows | Establishes the requested spacious editorial brutalism without decorative noise. |
| Four compressed catalogue columns | Three roomy columns, 230px previews, 48–88px heading | Gives every scene enough visual and textual breathing room. |
| Interface Scale existed only as a domain model | Visible persistent control plus keyboard shortcuts and scaled surface | Makes the Figma-like feature causal and usable without changing Project truth. |
| Glossy orbital planet icon | Imperfect picture frame with one impossible coral orbit | Expresses gallery + motion in one legible pitch.dog visual relationship. |

Shadcn was evaluated and intentionally not added. The repository has no Tailwind or Radix layer,
and its semantic native controls were not the limiting factor. Adding a second styling architecture
would increase migration and dependency surface without improving this bespoke editor shell.

## Icon provenance and QA

The icon was generated during this task with the pitch.dog illustration constraints: cool pastel
field, sparse near-black imperfect ink, one coral accent, one familiar object, one impossible physical
behavior, no typography, no 3D, no cinematic light, no gloss, and no mascot. The selected concept was
inspected at full size, 64px, and actual 16px favicon size before deriving the shipping set.

- `public/icon.png`: `sha256:02e233b30dd176ca9c09a0bdb6ab38651f89e6cb62233b45b5980e7f5638f855`
- `build/icon.png`: `sha256:bb698191e8635451556114cee379774e42223e5f14de7cc31f4a5716b71225aa`
- `build/icon.ico`: `sha256:ff3f73400fa8972aef7ab6ada2b524083661a9cc0ff2c1f60841b4cc6ecca7b0`
- `build/icon.icns`: `sha256:2785598515ed7b0823454cb7ef8745549bd8a28b9f370ee5e3a2fbc7b0a5ba2a`

ICNS container lengths and its seven embedded PNG chunks were parsed and validated locally. ICO
contains 256, 128, 64, 48, 32, and 16px representations.

## Checks

- `npm test --offline`: pass.
- `npm run build --offline`: pass.
- `npm run verify:interface-scale`: pass through the full test command.
- `git diff --check`: pass.
- `node --check electron/g08-interface-smoke.cjs`: pass.
- `node --check electron/main.cjs`: pass.
- cached `npm audit --omit=dev --offline`: zero known vulnerabilities in the available audit cache.
- no `transition: all` in `src/`.

One Spec/Standards fixed-point review found and closed three material defects before the
implementation commit: the smoke selected a scene ID absent from this base, the default 100% choice
had not yet been made persistent before comparison, and several compact controls remained below the
44px target. The final source rereview found no blocker, high, or medium defect in this bounded slice.

## Visual evidence state

- Generated icon concept: inspected at full size and actual 64px/16px reductions.
- Production renderer build: pass.
- Local native Electron capture: unrun because this managed container denies Chromium's required
  process socket before a window is created.
- Branch CI renderer capture: pending push/run; workflow emits three PNGs and a source-bound JSON
  receipt in artifact `g08-interface-renderer-evidence`.

No automated check is treated as a taste verdict. Native macOS/Garuda screenshots, real pointer and
keyboard interaction, 75%/100%/150%/200% human review, and final visual acceptance remain unclaimed.

## Integration boundary

This branch integrates the main Gallery studio and scene catalogue on the published G08 core. It does
not reconcile the separate G06 tracer/HostPort write surface. That reconciliation remains serial after
the G06 branch lands; this receipt does not impersonate full G08 completion or a release candidate.
