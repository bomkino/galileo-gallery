# Timeline and evaluator — Quiet Drift

## Status

Atelier-local deterministic study. The schema, compiler, and evaluator are not Product runtime contracts.

## Evaluator boundary

```text
evaluateScene({
  items,
  controls,
  timeline,
  timeMs,
  width,
  height,
  reducedMotion,
  debug,
  selectedIndex
}) -> frame state
```

The function reads only explicit inputs. It does not read wall clock, DOM geometry, React timing, browser random state, pointer position, network state, media decode state, or prior frames. The same function drives browser preview, scrub, test vectors, and fixed-step evidence capture.

## Compilation

Compilation clamps accepted source count to the declared 1–12 capability, validates five controls, and emits explicit duration and segment records.

### Automatic

One phrase. Duration equals `cyclePace × 1000`. Default: 10,500 ms.

### Fixed

One phrase retimed to exactly 14,000 ms in the atelier fixture. This value demonstrates exact-duration compilation only. Product S1 must consume Project fixed-duration intent rather than importing the fixture constant.

### Directed

| Segment | Logical phrases | Pace scale | Default duration |
| --- | ---: | ---: | ---: |
| fast-opening | 2 | 2× | 10,500 ms total |
| regular-middle | 1 | 1× | 10,500 ms |
| fast-finale | 1 | 2× | 5,250 ms |

Total: 26,250 ms and four closed phrases. Segment selection, phase, and velocity derive from exact elapsed ranges. The segment grammar changes cadence only. It does not choose different layouts or mutate IDs.

## Normalized phase map

| Range | Name | Motion gain | Focus behaviour |
| --- | --- | --- | --- |
| 0.00–0.08 | entry | smootherstep 0→1 | none |
| 0.08–0.78 | micro-currents | 1 | one smooth lift per source traversal |
| 0.78–0.90 | finale-stillness | smootherstep 1→0 | final eligible source gathers attention |
| 0.90–1.00 | return | 0 | focus lowers to zero |

At phase 0 and 1, all cards equal their compiled baseline: zero drift, zero rotational breath, zero lift, base z-order.

## Stable composition compiler

The compiler assigns one stable record per ordered source:

```text
{id, sourceIndex, baseX, baseY, baseRotation, baseZ, width, height}
```

One and two items use explicit sparse compositions. Three to twelve use a bounded authored neighbourhood set scaled around canvas centre. The prototype’s numeric placements are clean-room study values, not a proposed production table to copy blindly.

Composition spread scales centre offsets. Overlap/depth changes card size and authored pressure. Neither control reassigns a source to another neighbourhood.

## Closed current field

For each source, x, y, and rotational offsets combine integer-frequency sine/cosine terms. Stable index-derived phase offsets decorrelate cards. Integer harmonics guarantee:

```text
field(i, phase = 0) == field(i, phase = 1)
```

The entry/finale envelopes additionally force field amplitude to zero at both seam endpoints. This makes the exact seam robust even if a later field formulation changes.

## Focus plane

The current attention index comes from source-order traversal during the micro-current phase. The lift envelope is sinusoidal within each source interval. Finale selects the last eligible source. Focus changes only:

- `focusPlane` boolean;
- `z = 1000 + baseZ` while active;
- physical `lift` amount;
- source-safe registration outline in the prototype renderer.

It never changes base z, source index, opacity, filter, blend, fit, or crop.

## Reverse

Reverse maps story phase through `1 − phase`. It is exact evaluator retrace, not a separately integrated simulation. Evidence compares forward `t = 0.27` with reverse `t = 0.73` and requires positional equality within floating-point tolerance.

## Seam vectors

The capture packet records start, end, and `1 − 10⁻⁶` summaries. Start/end maximum position, rotation, and lift deltas are zero in generated evidence. The last near-seam frame is already the still baseline, so frame-to-seam displacement is also zero at the current phase map.

## Source-video story time

For video items:

```text
looped = positiveModulo(timeMs / 1000, sourceDurationSeconds)
clamped = min(timeMs / 1000, sourceDurationSeconds)
```

The evaluator exposes the requested source time only. It does not create, seek, decode, play, or mute a media element. Product preview/export parity remains a later integration gate.

## Numeric and structural tests

`TEST_VECTORS.json` records canonical normalized timestamps with expected numeric state summaries. `verify.mjs` additionally checks:

- exact start/end x, y, rotation, lift, and ID order for every fixture;
- stable authored baseline overlap signature;
- one-source centring and two-source counterweight;
- causal drift and focus-lift controls;
- reduced-motion time invariance;
- forward/reverse retrace;
- looped/clamped source-video time;
- 2,000-frame bounded-many observation with exactly twelve states.

These tests prove mechanics. They do not prove taste, final physical plausibility, or Product integration.
