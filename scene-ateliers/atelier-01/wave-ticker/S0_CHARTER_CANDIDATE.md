# S0 charter candidate — Ribbon: Wave

Status: candidate. Verdict: pending. Production implementation: no.

## Motion and anti-motion sentence

**Motion:** Ordered frames travel continuously along one fixed, smooth periodic path, cresting and descending with restrained tangent follow and an exact invisible seam.

**Anti-motion:** Never a straight ticker with per-card sine bob, a screensaver wobble, an independently moving wave substrate, or random card jitter.

## Emotional and material metaphor

A flexible strip guided through one authored curve: lively but controlled. The motion should feel like a physical ribbon passing through rollers, not cards floating on water.

## Coordinate, topology, camera, and source roles

- One closed metric path. No lanes and no depth camera.
- Landscape and near-square canvases use a horizontal wave. Portrait and 4:5 use a vertical wave.
- Variable source dimensions and minimum gap compile into the path's metric positions.
- The loop extent is an integer multiple of requested wavelength. Position and first derivative therefore meet at the seam.
- Cards partially follow the tangent. Default influence is deliberately low; typography stays readable. Rotation is capped at 10 degrees.
- The path owns position and orientation only. Source owns ratio, fit, alpha, and video pixels.

## Time phrase

1. **Entry:** deterministic path phase; no mandatory fade.
2. **Cycle:** cards travel; the path remains fixed.
3. **Crest focus:** the centre gate is a crest with zero tangent angle.
4. **Hold:** Product aligns a selected source to the centre crest and sets velocity to zero.
5. **Finale:** selected source arrives at the crest and holds without scale, glow, or source dimming.
6. **Exit:** repeat crosses the exact seam; once mode may clear the path or stop at a declared landmark.
7. **Seam:** loop extent equals an integer number of wavelengths, so position and derivative remain continuous.

## Timeline mapping

Automatic performs one Product-paced cycle. Fixed duration time-warps an integer cycle count. Directed mode supplies cycle/hold segments and may use casino rhythm. Timeline owns pace and direction. Reverse changes travel sign, not path shape. Exact source-video story time continues through rotation, holds, and finale.

## Defaults and essential Scene-only controls

- Frame scale `0.23` cross axis.
- Minimum gap `38` design pixels at 1080 cross axis.
- Amplitude `0.15` cross axis.
- Wavelength `0.52` major axis.
- Tangent influence `0.22`.

Five controls maximum. No random phase, per-card bob, independent wave speed, brightness, opacity, blur, or tint.

## Media counts and canvas recomposition

- 0: empty stage.
- 1: repeated render instances fill one closed path; source identity remains singular.
- 2: stable half-order cadence on the same path.
- 3–256: ordered metric spacing; bounded visible window.
- Mixed ratios keep equal cross size and source ratio. Excessive portrait height may increase compiled path gap rather than crop.
- Landscape: horizontal wave. Portrait: vertical wave with tangent rotation sign recomposed, not a CSS-rotated landscape scene.

## Video, alpha, and failed media

Video remains at global story time; rotation does not alter playback or audio. Soft alpha rotates without RGB contamination. Failed media retains its metric slot and evaluated rectangle.

## Source, Look, and audio boundary

Source opacity 1, filter none, normal blend. Look stays behind or around the ribbon. Scene never tints artwork or draws exported checkerboard. Audio remains wholly Product-owned.

## Reduced motion, accessibility, lifecycle

Reduced motion freezes to deterministic eighth-cycle landmarks or the requested crest hold. Scrub remains exact. Controls are labelled, resettable, keyboard reachable, and expose numeric readback. Renderer mounts a bounded visible window, reuses decodes, cancels animation frames, disposes contexts/textures/listeners, and falls back to one static crest composition.

## Risks

High amplitude plus short wavelength can over-rotate or overlap cards. Excessive tangent follow hurts typography. Sparse sources can expose repeated instances. Fast Product pace can create nausea. Bounds and human acceptance own these failures.

## Later human decisions

Approve or reject: one fixed path; centre crest; low partial tangent follow; wavelength closure method; portrait vertical recomposition; defaults; real-speed legibility. Formal charter approval remains pending.
