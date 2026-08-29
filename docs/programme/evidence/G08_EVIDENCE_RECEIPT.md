# G08 evidence receipt — Interface Scale and editorial editor UI

Date: 29 August 2026

State: **engineering-complete in source and real Electron renderer CI; not packaged, installed, released, or human-accepted**

## Identity

- Branch: `codex/g08-interface-scale-ui`
- Starting local commit/tree: `19ba3fc1a527f52bf364c11d4a799b4412617a8d` / `c5dbef2042cba126e6b231660fd6ae864bcb6da1`
- Reviewed local commit/tree: `e089dfdc4788a9322b4732a9a297054b3026a7b5` / `99fc1f3ddf623ede05651e314dc49847f7f74e97`
- Exact remote commit/tree: `43df4b73f40532fe9617168b9deb494f79260b93` / `99fc1f3ddf623ede05651e314dc49847f7f74e97`
- Successful final CI run/job: `33281906705` / `99178364642`

The shell checkout has no GitHub push credential. The connected GitHub writer created remote commits
with the exact reviewed local trees. No PR, merge, tag, release, deployment, app publication, signing,
notarization, or installation occurred.

## Public seam and behaviour

- Interface Scale is a local presentation preference from 75% through 200% in 5% steps. It is not
  Project, Scene, Timeline, Look, audio, export, MCP, grant, or job state.
- A versioned local manifest has explicit Product identity, schema, revision, writer identity, and
  deterministic total-order conflict resolution. Browser construction is render-pure; storage and
  keyboard listeners attach only while subscribed and detach at the final unsubscribe/dispose.
- The visible control, `Cmd/Ctrl` plus/minus, and `Cmd/Ctrl+0` converge through the same bounded seam.
  Scale persists across reload and a real `StorageEvent`; the reset target stays keyboard-focusable.
- Only the interactive application view scales. Export rendering remains Project/evaluator truth and
  is not presentation-scaled.
- The editor and Scene catalogue use the authored powder-blue/coral/ink identity: editorial grid
  paper, dark artwork stage, large type, strong borders, generous spacing, and larger icons/targets.
  The supplied app icon remains legible at 1024, 64, 32, and 16 pixels.
- At high scale the studio becomes one scrollable column. Oversized sticky chrome is removed, and
  catalogue, preview, inspector, and export regions remain reachable without horizontal clipping.
- Interactive controls compensate at 75% to retain a 44px physical floor. Format, timeline, numeric,
  colour, expert, Project-menu, export-progress, reveal, and scale controls are included.
- G08 uses the current Linux HostPort. Opening Reel honestly disables H.264/AAC with `Quiet Carousel
  only · use PNG Frames`; the same CI run executes the real Quiet Carousel renderer/export journey.

## Source, review, and security evidence

- `npm test`: pass after the final UI/evidence repair.
- `npm run build`: pass.
- `npm run verify:interface-scale`: pass.
- JavaScript syntax checks and `git diff --check`: pass.
- Production dependency audit: zero known vulnerabilities.
- Full development audit: nine high-severity findings remain in build/test tooling.
- Fresh Spec fixed point: clean.
- Fresh Standards fixed point: clean.

Review and CI failures were treated as evidence. Repairs covered initial manifest persistence, the
registered-Scene export boundary, actual canvas-plane measurement, 75% target compensation, a fresh
per-run Electron profile, strict image decoding, exact canvas geometry, catalogue endpoint coverage,
and occlusion-aware reachability. No failed run was described as green.

## Electron renderer and visual evidence

Final CI run `33281906705` passed source tests on Ubuntu, macOS, and Windows, the real G02 Quiet
Carousel renderer journey, and G08 under Electron `43.1.0` / Chromium `150.0.7871.47` on Xvfb.
Package jobs were skipped.

Artifact `g08-interface-renderer-evidence`, ID `9723232099`, is 1,957,971 bytes with archive digest
`sha256:aa7989d4f278aadb157216f7e183483a80fc180248a6a07097fa51209edd9ddc`.

- 21 PNG captures cover the 100% catalogue; minimum-viewport 75% and 200% catalogue top/bottom;
  studio 75/100/150/200 at 1280x900 and 1080x700; and an unobscured preview at all eight states.
- Every recorded export action, final Scene card, and preview is reachable and unobscured.
- The smallest recorded target is 43.9921875 physical pixels, compositor-equivalent to the 44px
  floor. The smoke allows 0.2px for fractional compositor rounding.
- Declared, shell, and artwork-plane ratios agree at every state. Maximum recorded plane error from
  16:9 is `0.00012972109963582668`.
- Project JSON, Timeline maximum/value/time label, export summary, format truth, audio-facing truth,
  and canvas metadata each have one invariant value across all eight states.
- The evidence resets to 100% and uses a fresh unpredictable runtime profile on every run.

The screenshots were visually inspected. The 100% studio reads as spacious editorial-brutalist UI;
150% and 200% preview captures show the complete artwork plane without sticky-chrome occlusion; the
200% catalogue bottom shows the final Scene card and footer unobscured. This is engineering visual
evidence, not human taste acceptance.

## Residuals and frontier

- Exact Garuda/KDE and Apple-Silicon candidates, app installation, human interaction/taste review,
  release, signing, and notarization remain unrun and unclaimed.
- Interface Scale has not been human-reviewed with assistive technology on the target machines.
- The repaired Scene atelier handoff is validated evidence input, not application completion. Its
  own frozen status reports 29 Scene candidates, 139 controls, zero Product integrations, and 43
  pending human decisions.
- Quiet Carousel remains the only individually authored and end-to-end verified Product Scene.
  A serial catalogue owner must reconcile finished atelier branches, with at most three disjoint
  Scene implementations in flight and one human review packet per Scene.
