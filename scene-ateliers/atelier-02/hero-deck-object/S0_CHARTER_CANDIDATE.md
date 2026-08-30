# S0 charter candidate — Hero Deck Object

Status: **candidate; human charter review pending**
Proposed identity: `hero-deck-object` v1
Minimum/recommended/maximum media: 1 / 5 / 24

## Motion sentence

A stable physical rig holds one commanding hero while support planes yield and a deliberate handoff transfers authority to the next frame.

## Anti-motion sentence

Never become a loose pile, coverflow rail, hover toy, glossy mockup, or generic active-index zoom.

## Material and emotional metaphor

**Metaphor:** A composed display object presenting one proof with supporting choices held in reserve.
**Observable geometry/time:** Rig centre and horizon stay fixed. The outgoing hero recedes along one support path while the incoming support frame promotes into the exact hero plane. Other supports yield minimally, then settle.

No emotional claim relies on tint, texture, lighting, shadow, grain, blur, reflection, border, or artwork treatment.

## Coordinate system and composition

- **Fixed relationship:** Normalized stage with a fixed rig centre and front plane. Camera does not orbit; projected perspective is deterministic 2D geometry.
- **Depth topology:** Hero plane at z=100, two immediate support planes, then bounded deep deck slots. No GPU depth ambiguity.
- **Frame hierarchy:** Exactly one hero at rest. Supports establish volume and future choices. Hierarchy uses geometry/time only.
- **Negative space:** Hero keeps at least 12% safe space on every canvas edge. Support spread cannot enter the central 70% hero reading zone.
- **Occlusion:** Supports may sit behind hero edges. During handoff, outgoing and incoming paths separate laterally before z ownership transfers.
- **View/camera:** one deterministic projected view; Interface Scale cannot change geometry or Project truth.
- **Frame fit:** source-faithful contain default. Canvas ratio and per-frame fit/crop/focal intent remain separate.

## Stable media roles and identities

Every item keeps a stable Project media ID. Failed/missing media retains its ID, ratio box, order, and phase participation. Source video uses the same stable ID and shared Product story clock.

No role is inferred from array mutation, artwork content, audio state, pointer state, or DOM order.

## Story grammar

- **Entry:** Support planes assemble first; hero arrives last and claims centre.
- **Cycles:** Hero rest → anticipation → outgoing recede → incoming promotion → authority crossing → subordinate settle → dwell.
- **Holds:** Hero dwell is the principal reading interval. Source-video time continues exactly.
- **Finale:** The final hero holds while supports tighten slightly, preserving hierarchy without light, blur, or opacity.
- **Exit:** Hero and support deck disassemble along their entry vectors; no generic zoom-to-black.
- **Loop/seam:** Finite by default. Optional loop completes full disassembly before assembly; no hidden active-index reset.
- **Terminal frame:** explicit Timeline terminal sample; never an accidental modulo of the first frame.
- **Reverse:** Supported as exact inverse authority transfer and support ordering.

### Deterministic phases

| Phase | Observable motion | Purpose |
| --- | --- | --- |
| assembly | supports then hero | establish object |
| hero-rest | fixed primary plane | read |
| anticipation | supports yield slightly | prepare authority change |
| outgoing-recede | hero leaves front plane | release authority |
| incoming-promotion | support reaches hero plane | acquire authority |
| authority-crossing | explicit z ownership transfer | avoid active-index pop |
| subordinate-settle | outgoing joins support volume | restore composition |
| finale/exit | final hero hold then disassembly | resolve |

## Timeline compilation

- **Automatic:** Transfer authority through every included item once, then hold the final hero.
- **Fixed duration:** Protect hero dwell and non-overlapping authority crossing. Scale support dwell first; reject dishonest targets.
- **Directed:** Fast ×2, fast ×2, regular ×1, fast ×1 applies to transfer durations; every hero dwell retains the chartered minimum.
- **Casino rhythm:** documented above; holds remain readable and source-video time never pauses.
- **Exact boundaries:** Hero ownership transfers once at the documented crossing sample. Before it, outgoing owns z=100; at and after it, incoming owns z=100. No equal z.

## Ordinary default and essential controls

Default uses 5 items, 16:9 canvas, contain fit, forward direction, clean Scene output, and no Scene-owned Look.

| ID | Type | Bounds | Default | Reset | Independent consequence | Invalid |
| --- | --- | --- | --- | --- | --- | --- |
| `heroScale` | number | 0.42–0.78 / step 0.01 | `0.62` | `0.62` | hero plane dimensions | reject |
| `supportSpread` | number | 0.08–0.28 / step 0.01 | `0.16` | `0.16` | support x/y offsets | reject |
| `depth` | number | 0.04–0.22 / step 0.01 | `0.12` | `0.12` | support/deep scale and z spacing | reject |
| `restingYaw` | number | 0–10 / step 0.5 | `4` | `4` | support projected width and rotation sign | reject |
| `handoffCharacter` | number | 0–1 / step 0.05 | `0.48` | `0.48` | authority-crossing path curvature and settle damping | reject |

Timing duration, direction, repeat, fit/crop/focal intent, Look, audio, and Interface Scale are not Scene controls.

## Capability and edge decisions

- **0 items:** truthful unavailable result with no fabricated card.
- **1 item:** One living-but-stable hero with a closed micro-breath. No fake supports.
- **2 items:** Clear two-plane transfer; outgoing becomes support exactly as incoming becomes hero.
- **Recommended:** 5 items produce the authored ordinary silhouette.
- **Awkward seven / ordinary eight:** both retain stable order and complete finite Timeline.
- **Bounded 24:** At 24, mount hero, two immediate supports, and four deep slots. Remaining identities stay in order off-rig.
- **Mixed ratios:** stable ratio boxes; contain default; no stage-geometry jump from decoded media timing.
- **Canvases:** 16:9, 9:16, 1:1, 4:5, and 2576:1080. Use smaller hero scale and tighter lateral support spread; supports may shift vertically but hero plane remains central.
- **Alpha:** no Scene background or post-process; alpha-zero RGB must remain zero.
- **Failed media:** explicit generated placeholder, same identity/order/ratio.
- **Video:** `sourceOffset + storyTime`; holds and pose changes do not pause, restart, stretch, or rewind it.
- **Fallback:** 2D projected rig with explicit integer z and scale. CSS preserve-3d/WebGL may enhance later but cannot change evaluator truth.

## Ownership boundaries

- **Scene owns:** geometry, z/occlusion, deterministic story pose, finite Scene phase semantics, and only the five controls above.
- **Timeline owns:** mode, durations, direction, repeat, authored holds/cycles, terminal/loop policy.
- **Frame intent owns:** contain/cover/crop/focal treatment per media.
- **Look owns:** background, material, light, grid, texture, grain, vignette, shadow, radius, and world animation behind/around artwork.
- **Audio owns:** source-video, presenter, soundtrack, master, gain/mute/solo/duck.
- **Interface Scale owns:** application presentation only.
- **Export owns:** fps, fixed-step sampling, codec/container, alpha capability, destination, and job lifecycle.

## Accessibility and lifecycle

- **Reduced motion:** Application may use direct settled hero changes. Saved/exported handoffs remain intact.
- **Keyboard:** Left/Right choose previous/next hero through the same applied focus intent. Enter applies audition. Autoplay never steals focus.
- **Status:** Announce hero identity after settle, not during every support movement.
- **Focus:** no autoplay focus theft; hidden/offstage cards cannot be focusable.
- **Resource limit:** At most seven mounted cards; pure slot assignment; no hidden duplicated deck, live GPU state, or interval.
- **Remount/disposal:** evaluator is pure and disposable. UI removes its single play handle/listeners and media mounts on remount, hidden window, and disposal.

## Provenance, risks, and reserved decisions

Provenance class: historical reference, rights unresolved, principle-only, code reused: none.

**Risks**

- authority crossing can read as coverflow if support rail becomes too regular
- mixed portrait/landscape ratios can make hero plane appear to jump
- deep deck can imply material shadow not owned by Scene
- hover audition could be mistaken for export intent

**Reserved for human/serial review**

- whether support yaw is essential after human review
- metadata placement outside stage UI
- hero-plane ratio policy for extremely wide 2576:1080 artwork
- first production fallback target: CSS 2D only vs optional 3D enhancement

No formal charter approval, production implementation, catalogue integration, package, release, or human acceptance is claimed.
