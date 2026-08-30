# Timeline and pure evaluator — Calm Ring

## Authority

`evaluate(config, orderedMedia, compiledTimeline, canvas, storyTime)` is pure. Preview scheduling, drag, keyboard, and scrub may choose story time; they never become evaluator state or export authority.

## Canonical checkpoints

Candidate automatic study duration: `D = 11,000 ms` for six sources.

| Checkpoint | `p` | Ring state |
| --- | ---: | --- |
| entry centre | 0.000 | collapsed, container alpha 0 |
| assembled | 0.100 | full tray, card 0 at front |
| early rotation | 0.230 | coherent travel toward spotlight |
| spotlight front | 0.380 | authored card at front gate |
| spotlight hold end | 0.500 | identical front pose, velocity resumes |
| later rotation | 0.660 | ordered tray travel |
| finale front | 0.860 | final unmuted card at front |
| exit | 0.960 | tray collapses toward centre |
| seam | 1.000 | exact canonical equality with 0.000 |

## Phase compiler

For source count `n`, spotlight `s`, and finale `f`:

```text
frontTurn(i) = smallest non-decreasing turn >= priorTurn
               such that (i / n + turn) mod 1 == 0
0.00–0.10: turn = 0, assembly 0→1
0.10–0.38: turn = smooth(0 → frontTurn(s))
0.38–0.50: hold turn at spotlight
0.50–0.84: turn = smooth(spotlightTurn → next frontTurn(f))
0.84–0.92: hold turn at finale
0.92–1.00: hold final turn, assembly 1→0
```

When spotlight is absent, compile one monotonic travel span. Multiple spotlight holds are inserted in source order. The evaluator receives already compiled scalar turn/assembly intent.

## Projection equations

Let ring radius `R`, plane pitch `β`, local cyclic distance `d`, slot count `m`, and front gate at `φ = π/2`.

```text
φ_i = TAU * d_i / m + π/2
trayX = R * cos(φ_i)
trayZ = R * sin(φ_i)
x_i = centreX + trayX * assembly
y_i = centreY + trayZ * sin(β) * assembly
depth_i = trayZ * cos(β) * assembly
perspective_i = clamp(F / (F - depth_i), 0.76, 1.14)
frontness_i = (depth_i / maxDepth + 1) / 2
containerAlpha_i = assembly * (0.38 + 0.62 * frontness_i^1.4)
z_i = stableSort(depth_i, sourceIndex)
```

All cues share `trayZ`. There is no independent brightness or scale animation.

## Source-to-slot mapping

- `n ≤ 24`: all sources use stable slots; `m = n`.
- `n > 24`: compute continuous front identity from compiled turn; select 18 cyclicly adjacent source identities; map their continuous cyclic distance around `m = 18` slots. Sources enter/exit at the rear guard with container alpha near the floor. Full ordered identity remains in the focus calculation.
- Cyclic order is source order modulo `n`; wrap is not reordering.

## Timeline modes

### Automatic

Product pace determines travel duration by angular distance and count. Minimums: entry 500 ms, spotlight hold 700 ms, finale hold 900 ms, exit 500 ms. Calm default must keep front passage readable.

### Fixed duration

Hold minimums remain literal. Scale angular travel intervals by one factor. Reject targets that cannot preserve readable front passage.

### Directed

Cycle segments become signed turn distances; hold segments pin a source at the front gate. Casino rhythm is allowed only with an honest regular passage and no hidden acceleration at the front.

## Direction, loop, finite, reverse

- Direction changes temporal traversal of the same phase function.
- Reverse is `forward(D - t)` after positive modulo; source order and z rules are unchanged.
- Loop evaluates modulo `D`; collapsed start/seam states are exactly equal.
- Finite terminal hold can stop at finale front before disassembly when Product requests it.

## Spotlight and finale

At a front hold, selected source satisfies `trayX = 0`, `depth = +R cos β`, highest z-order, container alpha `1`, artwork alpha `1`, filter `none`, normal blend. Finale retains the rest of the ring; no generic scale takeover.

## One/two/many behavior

- One: static front gate with entry/hold/exit, no meaningless angular spin.
- Two: diametric slots, stable tie-break at shoulders, adapted card size/radius.
- Many: full ring through 24; 18-slot cyclic window through 127.

## Source-video time

Video time is a Product function of story time, trim, duration, and loop. Orbit phase does not seek/pause video. Fixed-step export samples source and pose at the same rational time.

## Preview, scrub, and fixed-step

- Preview rAF may advance explicit story time.
- Scrub calls evaluator directly.
- Fixed-step uses `t_n = n/fps`; no prior pose or momentum is required.
- Same inputs produce byte-identical canonical JSON.

## Representative tables

### Six-source wide front/shoulder/rear

| Role | Position | Depth | Scale | Container alpha | z | Artwork |
| --- | --- | ---: | ---: | ---: | --- | --- |
| front gate | centre/front | maximum | maximum bounded | 1 | highest | normal / 1 / none |
| shoulders | left/right | near zero | middle | derived | middle | unchanged |
| rear | centre/rear | minimum | minimum bounded | ≥0.38 | lowest | unchanged inside container |

### Mixed ratios

| Ratio | Centre path | Width | Height | Depth rule |
| --- | --- | --- | --- | --- |
| 2.39:1 | identical orbital centre | Scene width | derived short | identical |
| 1:1 | identical | Scene width | equal | identical |
| 9:16 | identical | Scene width | derived tall | identical |

### Portrait recomposition

| Property | Wide | Portrait |
| --- | --- | --- |
| radius basis | short axis | short axis |
| centreY | near centre | slightly higher |
| effective card size | default/count adjusted | reduced |
| depth expression | default | modestly strengthened |
| clipping response | size then radius | size then centre/radius |

## Mechanical invariants

1. Same input/time equality.
2. Start equals seam.
3. Reverse exactness at all canonical checkpoints.
4. Equal ordered spacing for bounded slot set.
5. Front gate aligns position, depth, scale, alpha, and z.
6. Source order survives 127-source windowing.
7. Each control has observable causality and exact Reset.
8. Front artwork remains source-faithful.

## Final gauntlet implementation truth

The equations and phase diagrams above remain the candidate charter model. Exact current prototype authority is the pure evaluator plus `evidence/canonical-readback.json`; rounded tables are explanatory, not an alternate implementation.

| Compilation | Duration | Hold policy |
| --- | ---: | --- |
| automatic | 11,000 ms | Scene-authored literal holds |
| fixed validation fixture | 12,347 ms exactly | holds stay literal; travel absorbs the requested duration |
| directed | 10,010 ms | fast entry/exit around the regular readable phrase |

Literal hold total: 2,200 ms. Impossible fixed targets fail validation rather than compressing readable holds. Reverse evaluates the same quantized oriented story time at `D - t`; seams are exact in all three modes.

Radius, card size, ratio, plane tilt, and canvas safe bounds compile into one effective plane. Every visible card remains in-stage. Quantized depth plus source identity produces a unique deterministic z-order without altering focus order.

The 18-source large-set window is distributed across the whole ring rather than bunched at the front. Sources enter/leave through the rear opacity guard while all 127 identities retain global cyclic order.

All numeric controls, stage dimensions, ratios, source IDs, source count, mode, direction, and story time are validated before pose work. Duplicate IDs, more than 127 sources, unsupported enums, non-finite values, and out-of-range controls fail explicitly. Z-order is unique and deterministic for every mounted source.

Preview, scrub, vectors, fixed-sample evidence, and later export design invoke the same evaluator. The HTML preview owns one cancellable animation-frame scheduler, stops it when paused/edited/reset/hidden, and reuses source-ID-keyed card nodes. Scheduler state never enters serialized/evaluator authority.


## Applied authoring transport boundary

The removable prototype now exposes explicit 30 fps previous/next-frame review controls. This does
not quantize the evaluator: scrub, play, vectors, evidence, and later export still supply explicit
story milliseconds to the same pure function. Seeking pauses preview first. Card drag owns review
time only and is excluded from Scene config, Project truth, history, and export.

Keyboard/card source inspection computes a deterministic readable review time while preserving the
serialized story featured/spotlight control exactly. Canonical readback remains authored truth;
inspection overlays and temporary review windows remain separate.
