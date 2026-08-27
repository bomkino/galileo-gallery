# G02 evidence receipt — Quiet Carousel browser tracer

Ticket: G02 — Quiet Carousel browser tracer

## Identity and state

- Repository: `bomkino/galileo-gallery`
- Branch: `codex/g02-quiet-carousel-tracer`
- Starting local SHA: `44c46e32f2b9e4edc43f61dce494a68991c347d9`
- Tree-equivalent starting remote SHA: `6fb8defe4e35a9520c36ab24fba295742cd3bcf9`
- Implementation commit: `f5b4a032e96e2f4f8587f477db95fa62b638589a`
- Review-fix commit: `4ed383e1b5ebbdaff60a70c0f0615cabe443dde2`
- Runtime: Ubuntu 24.04 x86-64; Node `v24.19.0`; npm `11.9.0`; Electron `43.1.0`
- Highest state: **edited, causally tested, Vite-built, and real Electron-renderer CI tested**. No package, app install, release, Garuda claim, recorded motion clip, or human acceptance claim.

Local and remote histories use different tree-equivalent commits from earlier
GitHub connector writes. Starting local and remote trees were both
`ffacfc3cc2238efd330874a5446168cb5e0b592d`; no source reset, stash, cleanup, or
user-work overwrite occurred.

## Destination and public seam

Reversible development route: `?tracer=quiet-carousel`.

Public seams:

- `quietCarouselScene` v1 definition/defaults/parameters/control descriptors;
- `compileQuietTimeline()` and `evaluateQuietTimeline()`;
- `evaluateQuietCarousel()` shared by preview and scrub;
- strict browser-development Project serialize/parse;
- G01B `portableProjectFromConfig()` / `configFromPortableProject()` round trip.

The existing application remains the default route. No other Scene was
registered or claimed complete.

## Literal diagnostic ledger

| Mode | Intent | Duration | Cycles | Frames at 30 fps |
| --- | --- | ---: | ---: | ---: |
| Automatic | 8 frames at 800 ms pace | 6,400 ms | 1 | 192 |
| Fixed | exact 12,000 ms | 12,000 ms | 2 | 360 |
| Directed | fast x2 / regular x1 / fast x1 | 16,000 ms | 4 | 480 |

The complete machine-readable record is `G02_DIAGNOSTIC_LEDGER.json`.

## Causal checks

- 1, 2, 7, 8, and 127-frame exact end state equals start state.
- 0.1 ms boundary probes remain under 1 px position delta with equal Timeline velocity.
- Horizontal/vertical and representative project dimensions change the evaluated coordinate policy, not a rotated hidden world.
- Frame size, gap, pace, depth, fit, and background each change declared deterministic output; control Reset values come from Scene defaults.
- 800 x 450 and 1,600 x 900 evaluations retain proportional coordinates, including gap.
- Default render state is contain, artwork opacity 1, filter `none`, and clean solid ground; transparent state returns no background treatment.
- Generated SVG byte geometry agrees with each frame's declared mixed ratio.
- Browser save/reload preserves exact config; invalid duplicate IDs, unsafe remote media URL, invalid pace, and malformed Timeline fail.
- Portable v2 Project excludes data URLs while preserving ordered IDs, `quiet-carousel`, directed mode, and exact segments.
- A 256-frame fixture at four story times emits one bounded state per source and no more than 80 visible frames; no time-dependent collection growth occurs in the evaluator.

## Commands and results

- `npm run verify:quiet-carousel`: pass.
- `npm test`: pass, including build, G01A, G01B, application replacement, and G02 public-seam checks.
- `npm run build`: pass; TypeScript and Vite production build.
- `npm run verify:electron-project`: pass after Timeline schema extension; Electron main-process save/open/reopen still preserves ordered hashes, canvas, Scene, Timeline, hydration, and cleanup.
- `npm audit --omit=dev --json`: zero known production vulnerabilities.
- Full `npm audit --json`: nine high-severity development-tool findings remain (`brace-expansion`, `concurrently`/`shell-quote`, `fast-uri`, `js-yaml`, `nanoid`, `postcss`, `tar`, and `undici`).
- `git diff --check`: pass.

## Renderer infrastructure receipt

User approved installing the required renderer test dependencies.

- `electron@43.1.0`: installed earlier and G01B main-process smoke passes.
- Ubuntu `xvfb` `2:21.1.12-1ubuntu1.6` and `xauth` `1:1.1.2-1build1`: installed for this attempt.
- Xvfb: fails before display creation with `Cannot establish any listening sockets` because this managed runner denies local socket syscalls.
- Chromium headless Ozone with sandbox/GPU/network/audio reductions: still terminates after socket/DBus/netlink denial; no renderer window exists.

These failures do not invalidate pure evaluator evidence. They do prohibit UI,
screenshot, real-speed, source-decode, alpha-artifact, accessibility, and human
visual claims.

The managed local runner remains unable to create display sockets. A display-capable GitHub Actions runner was therefore added as the real renderer evidence seam.

### Passed CI renderer packet

- Remote source commit: `a032c302fd98f9014d7ee0de4aa0f7eece1c2b36`.
- Exact source tree: `deb16c06faa810b5d83b04c98dfc97386475f448`.
- Workflow run: `33042521610`.
- Renderer job: `98419097898` — pass in 27 seconds.
- Source test matrix: macOS, Ubuntu, and Windows — all pass; Linux/macOS/Windows packaging jobs were skipped on the task-branch push.
- Platform: Ubuntu 24.04 x86-64; Electron `43.1.0`; Chromium `150.0.7871.47`.
- Chromium sandbox: enabled through the correctly owned/mode `4755` Electron sandbox helper; no `--no-sandbox` flag.
- Artifact: `g02-quiet-carousel-renderer-evidence`, ID `9634400798`.
- Artifact archive digest: `sha256:87e11dffe8ed4fdb90c23d671eac01b184a7bec50133193e77e256d08cd9aa20`.
- Durable machine receipt: `G02_RENDERER_CI_RECEIPT.json`.

The packet proves:

- eight decoded SVG sources in exact order and at their eight declared ratios;
- 4:5, vertical, reverse, cover, transparent state after explicit save, Reset, and Reload;
- frame-size, gap, pace, and depth causally changing geometry or compiled duration;
- automatic 8,000 ms, fixed 14,500 ms, and directed 20,000 ms modes after the deliberate 1,000 ms pace change;
- exact 7,400 ms scrub state and 768 ms of real-time movement on the same source frame;
- keyboard focus progression through Project actions and ordered Frames;
- failed-media placeholder with all eight ordered identities retained;
- interface, alpha, and failed-media PNG captures with verified SHA-256 hashes;
- 978,796 alpha-zero pixels with zero non-zero RGB contamination, 1,233 partial-alpha pixels, and 163,011 opaque pixels.

## Fixed-point review

### Spec axis

The committed tracer stays inside one Scene, one generated fixture, one
development route, one visual Timeline compiler, and G01B's existing Project
boundary. It does not scaffold 28 Scenes, audio, HostPort, export, Interface
Scale, MCP, native targets, or release work. Existing application/package paths
remain intact.

Deferred criteria: recorded real-time clip, pixel-for-pixel decoded comparison against external user media, long-running renderer heap observation, exact Garuda behaviour, and human visual verdict. These stay explicit downstream gates without expanding G02's bounded engineering boundary.

### Standards axis

Review found and fixed five concrete defects:

1. Gap used raw preview pixels and would drift at output dimensions. It now uses
   1080-cross-axis design pixels and scales with the evaluated stage.
2. Synthetic SVG bytes always used 3:2 while frame metadata declared mixed
   ratios. Fixture byte geometry now matches each declared ratio.
3. Browser Project parsing was shallow. It now bounds identity, media count,
   URL scheme/size, ratios, settings, Timeline combinations, segment IDs/counts,
   duration, and duplicate identities.
4. Control ranges/defaults were duplicated in UI. Scene-owned descriptors now
   drive labels, ranges, units, and reset checks.
5. Browser storage failure could escape a React effect; high-count stage media
   could all remain mounted. Storage failure now preserves the open Project with
   causal status, thumbnails load lazily, and Stage mounts visible/selected frames.

Transparent Stage CSS now has no checkerboard fill inside the Scene surface.
Functional alpha output remains unclaimed until a real renderer capture runs.

## Frontier

G02 engineering is closed. Human taste/real-time clip, exact Garuda, and longer resource observation remain unclaimed gates.

G03 Linux HostPort is active next. It owns opaque grants, strict packaged origin, bounded request schemas, sender/origin/generation/state validation, and a sandboxed packaged-directory save/relaunch/open journey. G05 audio is dependency-ready after the shared G03 boundary stabilizes. G04 should reuse that boundary and remains Mac-runner-gated.

No package, merge, release, publication, app installation, signing, notarization, Garuda acceptance, or human acceptance occurred.
