# Timeline and evaluator — Vitrine

## Pure contract

```text
evaluate(config, orderedMedia, serializedIntent, compiledTimeline,
         storyTime, canvas, runKind, reducedMotion)
  -> complete identity state + one/two active source planes
```

No wall clock, frame delta, random value, pointer state, DOM history, light animation, decoder position, or previous pose enters evaluation.

## Plane dimensions

For source ratio `r`, canvas `W×H`, and presentation scale `s`:

```text
maxHeight = H × s
maxWidth  = W × (portrait ? 0.82 : 0.72)
height    = min(maxHeight, maxWidth / r)
width     = height × r
centre    = (0.5W, 0.47H)
```

This preserves natural ratio and negative space. Very wide sources become shorter on portrait canvases rather than cropped.

## Automatic chapter mapping

For `N>1` and direction-adjusted normalized time `p`:

```text
cycle       = p × N
current     = floor(cycle) mod N
local       = fractionalPart(cycle)
next        = (current + 1) mod N
hold        = local < 0.68
exchangeQ   = smootherstep((local - 0.68) / 0.32)
```

For `N=1`, the only source remains at centre for all time. At global `t=1`, modular `p=0`, so the full state equals `t=0`.

## Exchange equation

Let `q=smootherstep(exchangeQ)`, outgoing-side sign `d∈{-1,+1}`, source-specific offstage distances `Dₒ,Dᵢ`, and depth amplitude `z`:

```text
outgoing.x = cx + d × Dₒ × q
incoming.x = cx - d × Dᵢ × (1-q)

outgoing.depth = -z × sin(πq)
incoming.depth = -z × sin(πq)

outgoing.y = cy + abs(depth) × 0.09H
incoming.y = cy + abs(depth) × 0.09H

outgoing.yaw = -d × turnAmplitude × q
incoming.yaw =  d × turnAmplitude × (1-q)

scale = 1 + 0.30 × depth
```

`Dₒ = W/2 + outgoingWidth/2 + 24`; `Dᵢ` is equivalent for incoming. Thus outgoing is fully offstage at `q=1`, incoming fully offstage at `q=0`, and both occupy composed opposite regions at `q=0.5`.

Both source planes remain opacity `1`, filter `none`, normal blend. No opacity term appears in the equation.

## Exact inverse

Timeline reverse maps:

```text
loop:   pReverse(t) = positiveModulo(-t, 1)
finite: pReverse(t) = 1 - clamp(t, 0, 1)
```

The evaluator then uses the same chapter/pose equations. Test evidence compares reverse `t` against forward `1-t` and finds identical identity/pose digests. There is no alternate reverse transition.

## Finite phrase

| Normalized interval | Phrase | Active sources | Pose |
| --- | --- | ---: | --- |
| `0.00–0.12` | entry | 1 | lower/depth pose → centre |
| `0.12–0.68` | readable hold | 1 | exact centre, zero yaw/depth |
| `0.68–0.86` | exchange | 2 | shared reversible equation |
| `0.86–0.96` | finale hold | 1 | exact centre, zero yaw/depth |
| `0.96–1.00` | exit | 1 | exact inverse entry |

The test compares entry at `t=0.03` with exit at `t=0.99`; x, y, depth, and yaw match.

## Timeline compilation

Laboratory automatic duration is `max(5.5 s, N × 5.5 s)`. This is a test fixture, not a Scene pace control.

- **Automatic:** equal source chapters.
- **Fixed duration:** one exact complete source cycle stretched to authored duration.
- **Directed:** literal hold/cycle segments. Spotlight/finale IDs remain serialized intent.
- **Casino rhythm:** not default. If authored, fast passages must not erase the minimum readable hold needed for typography.

Timeline owns dwell, duration, pace, direction, source roles, repeat/once, and story time. Scene owns only presentation geometry.

## Canonical checkpoints

| Checkpoint | Loop | Finite | Expected state |
| --- | ---: | ---: | --- |
| start | `0.000` | `0.000` | first source readable / Spotlight at entry start |
| entry complete | n/a | `0.120` | Spotlight exact centre |
| early hold | local `0.180` | `0.300` | one plane, still, faithful |
| hold end | local `0.680` | `0.680` | outgoing at centre; incoming offstage |
| exchange middle | local `0.840` | `0.770` | two planes in opposite regions; full opacity |
| next hold | next local `0.000` | `0.860` | incoming/finale exact centre |
| finale | directed | `0.920` | one plane, still, faithful |
| exit | n/a | `0.980` | inverse entry |
| seam | `1.000 ≡ 0.000` | n/a | source IDs, poses, treatment, placard state equal |

## Pose and source-state tables

### Ordinary eight, 16:9

| Phase | Current | Incoming | Nodes | Source state |
| --- | --- | --- | ---: | --- |
| readable hold | chapter source | none | 1 | opacity 1 / none / normal |
| exchange start | chapter source | next source offstage | 2 | faithful both |
| exchange middle | outgoing | incoming | 2 | faithful both |
| exchange end | outgoing offstage | next at centre | 2 then 1 | faithful both |

### Mixed ratios / portrait

| Fixture | Canvas | Policy | Nodes |
| --- | --- | --- | ---: |
| 21 mixed | 16:9 | natural widths; equal centre station | 1/2 |
| 21 mixed | 4:5 | width bound reduces wide-source height | 1/2 |
| 127 | 9:16 | complete identity table; current/incoming observation only | <=2 |
| 2 | any | explicit handoff | 1/2 |
| 1 | any | permanent still | 1 |

Inactive sources retain ordered identity records but no stage node. No duplicate seam slot exists.

## Every treatment interval

The verifier samples `101` timestamps for loop and `101` for finite mode over a media-edge fixture. Observed differences from source fidelity contract: `0`.

| Interval | opacity | filter | blend |
| --- | ---: | --- | --- |
| entry | 1 | none | normal |
| readable hold | 1 | none | normal |
| exchange outgoing | 1 | none | normal |
| exchange incoming | 1 | none | normal |
| finale hold | 1 | none | normal |
| exit | 1 | none | normal |
| reduced motion | 1 | none | normal |

## Source-video time

```text
looped = positiveModulo(storySeconds, sourceDuration)
finite = clamp(storySeconds, 0, sourceDuration)
```

Visibility and node observation do not alter source time. Product media services own decoder warmth and audio.

## Preview/scrub/fixed-step parity

- Play transport advances explicit story time only.
- Scrub writes normalized time directly.
- Fixed-step export samples `n/fps` from one immutable snapshot.
- Same input/time equality is exact JSON equality.
- Dropped display frames do not change later state.
- Maximum sampled active source nodes: `2`.
