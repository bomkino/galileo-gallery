# Timeline and evaluator — Slide Anatomy

## One path, two directions

The evaluator returns one scalar `separationProgress`, one bounded stage perspective, and Project-known plane poses. Outward and return motion call the same `poseAt(progress)` function; return owns no second choreography table.

```text
compileTimeline(intent, controls) -> segments + issues
evaluate(compiled, t, sources, options) -> stage, planes, source state
poseAt(progress, source, controls) -> one shared geometric truth
```

## Default phrase

| Range | Segment | Exact duration |
| --- | --- | ---: |
| 0.00–0.10 | `resolved-entry` | 700 ms |
| 0.10–0.35 | `separate` | 1,750 ms |
| 0.35–0.65 | `inspection-hold` | 2,100 ms |
| 0.65–0.90 | `return` | 1,750 ms |
| 0.90–1.00 | `resolved-finale` | 700 ms |

Travel uses minimum-jerk interpolation. Velocity is zero at every hold boundary. Normalized `0` and terminal `1` resolve to the same visual pose.

## Plane vectors

Each Project-known plane owns one local vector and depth coefficient. Controls scale vectors, stage perspective, or dwell—not identities. Caption plane is omitted when Project caption data is absent; no remaining plane is renamed to fill the gap.

The intact source remains one whole source-owned plane. At progress zero, every apparatus plane returns to zero local transform and the source renders opacity `1`, filter `none`, normal blend.

## Duration compiler

Automatic baseline is `7,000 ms` with the default `2,100 ms` inspection hold.

The readable floor is dynamic:

```text
3,000 ms + inspectionHoldMs
```

Therefore:

- default hold `2,100 ms` → floor `5,100 ms`;
- maximum hold `5,000 ms` → floor `8,000 ms`.

Fixed and directed requests below the current floor compile at the floor and emit an explicit issue. Directed mode requests faster outward/return travel but never shortens either below `1,000 ms`; resolved entry/finale retain at least `500 ms`; the inspection hold remains exactly authored.

## Reverse and exact-pose test

For matched outward/return progress samples, plane IDs, labels, z-order, and source ownership are structurally equal and numeric transforms match within `1e-12`. The captured maximum delta is recorded in `evidence/DIAGNOSTICS.json`; exact source pixels are checked separately.

## Reduced motion

Reduced motion uses discrete resolved and fully separated inspection states. It removes continuous perspective/translation while preserving the ordered accessible description.

## Fixed-step capture

Capture samples `n / fps`; source-video selection remains Product story-time authority. Product integration is not claimed.
