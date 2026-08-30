# Timeline and evaluator — The Orrery

Status: **G10B preflight candidate; implementation blocked by G10A**

## Pure laboratory contract

```text
evaluate(config, orderedMedia, serializedIntent, compiledTimeline,
         storyTime, canvas, runKind, reducedMotion)
  -> complete identity/role/membership state + bounded render slots
```

No wall clock, requestAnimationFrame delta, pointer momentum, random generator, DOM history, GPU state, current click selection, or previous frame enters evaluation.

## Primary validation

```text
require serializedIntent.primaryId
require orderedMedia contains primaryId
```

Failure is explicit. No index-zero fallback exists. Source order remains the authoritative ordered table; removing the primary for satellite assignment does not reorder the remaining identities.

## Ring membership

Let `S` be ordered media excluding `primaryId`, and `R` the effective ring count.

```text
R(auto, |S|) = 0 when |S| = 0
              = 1 when |S| = 1
              = 2 when 2 <= |S| <= 6
              = 3 when |S| >= 7

ringIndex(sOrdinal) = sOrdinal mod R
slotIndex           = floor(sOrdinal / R)
```

Each ring’s slot phase is `slotIndex / ringMemberCount`. Membership is independent of time, canvas, renderer visibility, and depth.

## Exact revolution reconciliation

Signed integer revolution counts per one master cycle:

```text
R=1: [ 1 ]
R=2: [ 2, -1 ]
R=3: [ 3, -2, 1 ]
```

For ring `r`, member phase `φ`, phase offset `oᵣ`, and master cycle `m`:

```text
angle = 2π × (revolutions[R][r] × m + φ + oᵣ)
```

At `m=1`, each angle differs from `m=0` by an integer multiple of `2π`; x/y/depth/orientation/z-order reconcile exactly. Reverse changes only the sign of `m`.

## Projected orbital pose

```text
baseRadius = min(W × landscapeFactor, H × 0.52)
             × orbitSize / 0.48
radiusᵣ    = baseRadius × (0.62 + 0.19r) × assembly

x = cx + cos(angle) × radiusᵣ
y = cy + sin(angle) × radiusᵣ × verticalSquash
         + cos(angle) × sin(planeTiltᵣ) × radiusᵣ × 0.16

depth = sin(angle) × cos(planeTiltᵣ)
        + cos(angle) × sin(planeTiltᵣ) × 0.34

zOrder = round(10000 + 3600 × depth - 15r)
```

Canonical projected plane tilts are `[18°, -13°, 27°]`; phase offsets are `[0.08, 0.31, 0.57]`.

Satellite scale derives from `satelliteScale`, ring index, and projected depth. The primary has a separate stable centre plane. Source ratio remains natural.

## Primary role exchange

Base primary centre pose `C`. Target satellite’s live orbit pose `O`. Exchange progress `q∈[0,1]` uses smootherstep from the directed phrase.

```text
incomingTarget(q) = mixPose(O, C, q, +arc)
outgoingPrimary(q)= mixPose(C, O, q, -arc)
```

`arc = sin(πq)` adds complementary bounded y/depth separation. At `q=0`, poses equal their original roles. At `q=1`, target is exactly at centre; old primary is exactly at target’s orbit pose and inherits target membership. Every other satellite remains on its normal evaluated orbit.

Identity table:

| Progress | Old primary | Target satellite | Other satellites |
| --- | --- | --- | --- |
| `q=0` | primary at centre | target at owned ring/slot | unchanged |
| `0<q<1` | outgoing-primary | incoming-primary | unchanged |
| `q=1` | satellite at target’s vacated ring/slot | primary at centre | unchanged |

No opacity crossfade, identity replacement, or teleport occurs.

## Timeline compilation

Canonical laboratory master cycle: `12 / orbitPace` seconds.

- **Automatic:** one reconciled master cycle, stable primary.
- **Fixed duration:** one reconciled master cycle over the exact authored duration.
- **Directed:** explicit cycle/hold segments. Default lab phrase is orbit cycle → hierarchy hold → orbit cycle.
- **Casino rhythm:** not default. If human review later approves fast ×2 / regular ×1 / fast ×1, each cycle segment still evaluates the same integer relationship; holds set velocity zero.

Timeline owns direction, duration, fixed/automatic/directed mode, holds, primary/exchange target intent, Spotlight/finale identity, repeat intent, and story time.

## Canonical checkpoints

| Checkpoint | Loop time | Finite time | Expected state |
| --- | ---: | ---: | --- |
| start | `0.000` | `0.000` | exact reconciled loop pose / assembly collapsed at centre geometry |
| entry complete | n/a | `0.100` | full rings at canonical radii |
| early | `0.187` | `0.280` | multiple signed-plane passages visible |
| front/near | `0.310` | `0.500` | satellites cross primary plane by depth |
| exchange start | directed | `0.580` | target and old primary at exact owned poses |
| exchange middle | directed | `0.670` | complementary continuous arcs, both identities present |
| exchange end | directed | `0.760` | target centre; old primary at vacated ring/slot |
| later | `0.750` | `0.860` | settled hierarchy; no membership drift |
| finale | directed hold | `0.930` | chosen primary held clearly |
| exit | n/a | `0.980` | deterministic de-assembly |
| seam | `1.000 ≡ 0.000` | n/a | all reconciled angles, roles, memberships, and source states equal |

## Pose/depth/order tables

### Ordinary nine, 16:9

| Role | Membership | Pose/depth | Source state |
| --- | --- | --- | --- |
| primary | none | stable centre, readable plane | opacity 1 / filter none / normal blend |
| ring 0 satellites | round-robin ordinals `0,3,6...` | 3 forward revolutions | faithful |
| ring 1 satellites | ordinals `1,4,7...` | 2 reverse revolutions | faithful |
| ring 2 satellites | ordinals `2,5,8...` | 1 forward revolution | faithful |

### Mixed ratios and portrait canvas

| Fixture | Canvas | Policy | Render bound |
| --- | --- | --- | ---: |
| 9 ordinary | 16:9 | full three-plane default | 11 protected maximum; normally 9 |
| 21 mixed | 4:5 | compressed radius, natural ratios, wide-card height bound | 20 |
| 127 | 9:16 | full identity state; nearest/most relevant satellite observation | 20 (18 + up to 2 protected roles) |
| 2 | any | one primary + one ring-one satellite | 2 |
| 1 | any | centre primary only | 1 |

Render culling chooses onstage geometric relevance after complete state evaluation. It never changes source order, membership, primary, or exchange authority.

## Front/behind ordering

Each satellite’s `frontOfPrimary` is `depth > 0`. Back-to-front render order sorts by evaluated z-order, then stable source index. Crossing does not alter source opacity or source identity. Primary remains in the same depth system, allowing satellites to pass behind and in front without a permanent “hero always top” cheat.

## Exact reverse

```text
masterCycleReverse(t) = -masterCycleForward(t)
```

Ring membership, signed revolution table, phase offsets, and source order stay unchanged. Finite phrase reverse evaluates the same paired paths in reverse order when integrated. No alternate reverse choreography table exists.

## Reduced motion

Reduced motion fixes `masterCycle=0` and retains current serialized role hierarchy. It does not dim, pulse, dissolve, or replace the Scene. A production authored reduced-motion export would be explicit Project truth; system preference affects preview presentation only.

## Source-video time

```text
looped = positiveModulo(storySeconds, sourceDuration)
finite = clamp(storySeconds, 0, sourceDuration)
```

Decoder warmth does not change evaluated time. Reactivation seeks to story time before display. Scene owns no audio policy.

## Preview/scrub/fixed-step parity

- Play transport advances an explicit normalized story-time value only.
- Scrub writes that value directly.
- Fixed-step export samples `n/fps` against one immutable snapshot.
- Same input/time returns identical JSON state.
- Dropped preview frames do not affect later poses.
- Laboratory test vectors prove exact start/end loop, reverse, membership, exchange endpoints/midpoint continuity, control causality, and 127-source bounds.

## G10A dependency

Before production implementation, G10B must consume completed G10A findings on independent Scene architecture, lifecycle, source-role serialization, Timeline authority, depth/occlusion, fallback, and renderer boundaries. This evaluator is evidence for those questions, not permission to bypass that sequence.
