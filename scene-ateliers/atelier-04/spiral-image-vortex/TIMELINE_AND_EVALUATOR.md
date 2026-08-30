# Timeline and evaluator — Spiral Image Vortex

## Pure contract

```text
evaluate(config, orderedMedia, compiledTimeline, storyTime, canvas, runKind, reducedMotion)
  -> complete path state + bounded render slots
```

No wall clock, frame delta, random generator, pointer state, DOM measurement, GPU state, or prior pose enters evaluation.

## Path equation

For ordered source index `i`, count `N`, phase `p`, and safe base coordinate `bᵢ`:

```text
bᵢ = N < 4 ? (i + 1) / (N + 1) : i / N
uᵢ = positiveModulo(bᵢ − p, 1)
angleᵢ = 2π × turns × uᵢ − π/2
depthᵢ = sin(angleᵢ)
xᵢ = cx + radius × cos(angleᵢ)
yᵢ = cy + (uᵢ − 0.5) × verticalSpan
```

The `−π/2` offset puts `u=0` and `u=1` at depth `−1`, the deepest rear point. Integer turn count guarantees both endpoints share angular pose.

```text
verticalSpan = H × (0.90 + 0.90 × depthPitch × turns)
```

At default `3` turns / `0.28` pitch, span is `1.656H`. The endpoint neighbourhood therefore lies outside the stage with card margin.

Orientation:

```text
rotateY = −20° × cos(angle)
rotateZ =  3.5° × sin(angle)
scale   = 0.68 + 0.16(depth + 1)
```

These are restrained, deterministic path-derived orientations. They do not spin source planes around the helix tangent.

## Seam and visibility proof

Fixed seam tunnel:

```text
seamZone = u < 0.065 || u > 0.935
outsideWithMargin = card bounds lie wholly above or below stage
visible = revealed && !seamZone && !outsideWithMargin
```

No opacity fade exists. Wrap occurs only while the card is fully outside the visible stage; the exact endpoint is also at rear depth.

Observed source-0 seam samples in the canonical 16:9 fixture:

| Story time | `u` | `y` px | depth | visible | geometric cover |
| ---: | ---: | ---: | ---: | --- | --- |
| `0.95` | `0.05` | `−132.408` | `−0.5878` | no | offstage + seam tunnel |
| `0.97` | `0.03` | `−150.293` | `−0.8443` | no | offstage + seam tunnel |
| `0.99` | `0.01` | `−168.178` | `−0.9823` | no | offstage + seam tunnel |
| `0.00` | `0.00` | `−177.120` | `−1.0000` | no | rear endpoint + offstage |
| `0.01` | `0.99` | `708.178` | `−0.9823` | no | rear endpoint + offstage |
| `0.03` | `0.97` | `690.293` | `−0.8443` | no | offstage + seam tunnel |
| `0.05` | `0.95` | `672.408` | `−0.5878` | no | offstage + seam tunnel |

The test also samples immediately outside the formal seam zone (`u≈0.07`/`0.93`); cards remain fully offstage. Thus no visible pop occurs at the culling boundary.

## Front/rear crossings and z-order

```text
zOrder = round(10000 + 4000 × depth − 50 × abs(u − 0.5))
```

Render slots sort back-to-front by depth, then path coordinate, then source index. Source opacity stays `1` at all crossings. The canonical 81-sample probe observed `56` ordered-list changes, proving repeated front/rear passage rather than a fixed 2D stack.

A crossing is valid when:

1. both identities retain continuous `u`, x, y, and depth;
2. z-order changes only because evaluated depths cross;
3. neither source changes opacity/filter/blend;
4. no identity disappears unless offstage/seam policy says so.

## Timeline modes

Base laboratory cycle: `9 s`, matching current profile evidence.

- **Automatic:** one path cycle.
- **Fixed duration:** exact authored duration, one cycle.
- **Directed:** weighted cycle/hold segments. Fast ×2 / regular ×1 / fast ×1 may compile when human review confirms the thread remains legible.

A hold sets path velocity to zero and aligns a serialized source to `u=0.5`. The evaluator does not ease individual cards independently.

## Normalized checkpoints

| Checkpoint | Loop | Finite | Expected state |
| --- | ---: | ---: | --- |
| start | `0.000` | `0.000` | Loop exact path state; finite reveal aperture closed around existing centre thread. |
| entry complete | n/a | `0.100` | Full thread visible within stage bounds. |
| early near crossing | `0.184` | `0.230` | One source approaches front; z-order changes continuously. |
| middle | `0.500` | `0.500` | Ordered thread halfway through cycle. |
| later | `0.750` | `0.680` | No cumulative drift; endpoints remain offstage. |
| Spotlight | directed hold | `0.780` | selected source at `u=0.5`, depth determined by integer turns (near at default 3). |
| Finale | terminal hold | `0.890` | finale source at same near station; thread remains coherent. |
| exit | n/a | `0.970` | reveal aperture closes inversely. |
| seam | `1.000 ≡ 0.000` | n/a | byte-equal phase/pose/visibility. |

## Exact reverse

`phaseReverse(t) = positiveModulo(−phaseForward(t),1)`. Every source uses the same `bᵢ`, path, and seam. Finite reverse evaluates the forward phrase at `1−t` and swaps entry/exit semantics. No reverse-specific teleport or z-order table exists.

## Source-video time

```text
looped source time = positiveModulo(storySeconds, sourceDuration)
nonlooped          = clamp(storySeconds, 0, sourceDuration)
```

Visibility may control decoder warmth but never source time. Reactivation seeks to the evaluated time before presentation. Scene does not own audio.

## Pose/depth/order tables

### Ordinary eight, 16:9

| Path region | `u` | depth character | visibility | source state |
| --- | --- | --- | --- | --- |
| upper endpoint tunnel | `<0.065` | begins/ends at rear | culled offstage | preserved identity |
| upper visible thread | `0.065–0.35` | alternates rear/near by turn | visible when bounds intersect | opacity 1 / none / normal |
| canonical station | `0.5` | near for 3-turn default | readable | faithful |
| lower visible thread | `0.65–0.935` | alternates | visible when bounds intersect | faithful |
| lower endpoint tunnel | `>0.935` | returns toward rear | culled offstage | preserved identity |

### Mixed ratios and portrait

| Fixture | Canvas | Policy | Node bound |
| --- | --- | --- | ---: |
| 21 mixed | 16:9 | natural widths, default height, pitch carries separation | 23 |
| 21 mixed | 4:5 | reduced radius; wide cards get bounded height reduction | 17 |
| 127 | 9:16 | long visible thread; nearest/central geometrically relevant slots selected | 17 |
| 2 | any | safe interior `u=1/3,2/3` placement | 2 |
| 1 | any | fixed `u=0.5` near station | 1 |

## Preview/scrub/export parity

- UI play is transport only; it advances explicit normalized time.
- Scrub writes normalized time directly.
- Fixed-step export samples `n/fps` from one immutable snapshot.
- Same input/time produces byte-identical evaluator JSON; verified.
- Dropped preview frames do not alter later state because evaluation is not integrated from deltas.
