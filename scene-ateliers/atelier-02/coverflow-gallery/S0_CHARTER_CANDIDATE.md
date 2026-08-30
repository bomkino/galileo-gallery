# S0 charter candidate — Coverflow Gallery

Status: **candidate; human charter review pending**
Proposed identity: `coverflow-gallery` v1
Minimum/recommended/maximum media: 1 / 7 / 24

## Motion sentence

Focus traverses measured discrete stops on one restrained horizontal depth rail; exactly one frame is front-facing at every dwell.

## Anti-motion sentence

Never become continuous carousel travel, a hero object, stack reorder, reflective jukebox, title-overlay gallery, or glossy nostalgia effect.

## Material and emotional metaphor

**Metaphor:** A legible browsing rail with trustworthy previews.
**Observable geometry/time:** The camera, horizon, and front stop remain fixed. A virtual unwrapped focus coordinate moves one step, neighbours approach with restrained yaw/depth, and the selected work settles exactly front-facing.

No emotional claim relies on tint, texture, lighting, shadow, grain, blur, reflection, border, or artwork treatment.

## Coordinate system and composition

- **Fixed relationship:** Normalized stage with fixed camera, horizon, and front stop at centre. Rail moves; camera never orbits.
- **Depth topology:** One front plane, symmetric side rail, bounded visible range, monotonic depth falloff. Circular wrap changes representatives only while items are offstage.
- **Frame hierarchy:** Front item is exactly yaw 0, scale 1, z=100. Side works retain opacity 1/filter none and differ only by geometry.
- **Negative space:** Front frame retains 10% stage edge clearance. Side previews never overlap more than 32% of projected width.
- **Occlusion:** Nearer side frames cover farther frames by explicit integer z; no equal-plane overlap.
- **View/camera:** one deterministic projected view; Interface Scale cannot change geometry or Project truth.
- **Frame fit:** source-faithful contain default. Canvas ratio and per-frame fit/crop/focal intent remain separate.

## Stable media roles and identities

Every item keeps a stable Project media ID. Failed/missing media retains its ID, ratio box, order, and phase participation. Source video uses the same stable ID and shared Product story clock.

No role is inferred from array mutation, artwork content, audio state, pointer state, or DOM order.

## Story grammar

- **Entry:** Rail assembles to the first front stop and dwells before traversal.
- **Cycles:** Departure → approach → exact front settle → dwell. Circular boundary uses virtual indices; no visible teleport.
- **Holds:** Dwell fixes geometry at an integer focus coordinate. Source-video time continues.
- **Finale:** Selected final work holds front-facing while side previews stay restrained and truthful.
- **Exit:** Rail departs horizontally as one coherent coordinate system; focus identity remains unchanged.
- **Loop/seam:** For 3+ items, wrap representative changes occur beyond visible range. Two items use a bounded ping-pong sequence to avoid direction ambiguity.
- **Terminal frame:** explicit Timeline terminal sample; never an accidental modulo of the first frame.
- **Reverse:** Supported by signed virtual focus progression and inverse shortest-path intent.

### Deterministic phases

| Phase | Observable motion | Purpose |
| --- | --- | --- |
| entry | rail assembles to integer stop | establish browser |
| departure | front item leaves centre | release focus |
| approach | next item reaches fixed stop | traverse |
| settle | zero velocity at integer focus | confirm focus |
| dwell | geometry fixed | inspect |
| wrap-offstage | representative changes outside visible range | preserve continuity |
| finale/exit | final dwell then coherent rail departure | resolve |

## Timeline compilation

- **Automatic:** Visit each item once through discrete stops, then hold the final focus.
- **Fixed duration:** Protect settle and dwell minima. Compress only between-stop travel; reject targets that erase front stops.
- **Directed:** Fast ×2, fast ×2, regular ×1, fast ×1 applies to traversal durations; every front dwell keeps its minimum.
- **Casino rhythm:** documented above; holds remain readable and source-video time never pauses.
- **Exact boundaries:** At transition end, virtual focus is exactly an integer and the dwell event owns the sample. Representative wrap changes only when abs(offset) > visibleRange + 1.

## Ordinary default and essential controls

Default uses 7 items, 16:9 canvas, contain fit, forward direction, clean Scene output, and no Scene-owned Look.

| ID | Type | Bounds | Default | Reset | Independent consequence | Invalid |
| --- | --- | --- | --- | --- | --- | --- |
| `frameScale` | number | 0.34–0.72 / step 0.01 | `0.56` | `0.56` | front-plane dimensions | reject |
| `gap` | number | 0.08–0.34 / step 0.01 | `0.2` | `0.2` | rail stop spacing | reject |
| `sideDepth` | number | 0.04–0.3 / step 0.01 | `0.16` | `0.16` | side scale and projected z | reject |
| `sideYaw` | number | 0–22 / step 1 | `10` | `10` | side projected width only | reject |
| `visibleRange` | integer | 1–4 / step 1 | `3` | `3` | mounted side previews and edge disappearance | reject |

Timing duration, direction, repeat, fit/crop/focal intent, Look, audio, and Interface Scale are not Scene controls.

## Capability and edge decisions

- **0 items:** truthful unavailable result with no fabricated card.
- **1 item:** Stable exact front plane with a closed micro-breath disabled by default.
- **2 items:** Ping-pong A↔B with explicit direction; no circular shortest-path tie.
- **Recommended:** 7 items produce the authored ordinary silhouette.
- **Awkward seven / ordinary eight:** both retain stable order and complete finite Timeline.
- **Bounded 24:** At 24, evaluate all identities; mount front plus at most four on each side, bounded by visibleRange.
- **Mixed ratios:** stable ratio boxes; contain default; no stage-geometry jump from decoded media timing.
- **Canvases:** 16:9, 9:16, 1:1, 4:5, and 2576:1080. Retain horizontal rail. Reduce frame scale, gap, and effective visible range; do not invent a vertical coverflow.
- **Alpha:** no Scene background or post-process; alpha-zero RGB must remain zero.
- **Failed media:** explicit generated placeholder, same identity/order/ratio.
- **Video:** `sourceOffset + storyTime`; holds and pose changes do not pause, restart, stretch, or rewind it.
- **Fallback:** Pure projected 2D x/scale/yaw-width geometry with integer z. No reflection or preserve-3d requirement.

## Ownership boundaries

- **Scene owns:** geometry, z/occlusion, deterministic story pose, finite Scene phase semantics, and only the five controls above.
- **Timeline owns:** mode, durations, direction, repeat, authored holds/cycles, terminal/loop policy.
- **Frame intent owns:** contain/cover/crop/focal treatment per media.
- **Look owns:** background, material, light, grid, texture, grain, vignette, shadow, radius, and world animation behind/around artwork.
- **Audio owns:** source-video, presenter, soundtrack, master, gain/mute/solo/duck.
- **Interface Scale owns:** application presentation only.
- **Export owns:** fps, fixed-step sampling, codec/container, alpha capability, destination, and job lifecycle.

## Accessibility and lifecycle

- **Reduced motion:** Application may jump between exact front stops. Saved/exported traversal remains unchanged.
- **Keyboard:** Left/Right author previous/next focus. Home/End choose bounded endpoints where non-looping. Hidden cards are not focusable; focus remains on controls.
- **Status:** Announce settled front identity and position “n of N”. Autoplay never steals focus.
- **Focus:** no autoplay focus theft; hidden/offstage cards cannot be focusable.
- **Resource limit:** Mount at most 2×visibleRange+1 cards; no duplicated infinite strip, interval, reflection surface, or GPU depth state.
- **Remount/disposal:** evaluator is pure and disposable. UI removes its single play handle/listeners and media mounts on remount, hidden window, and disposal.

## Provenance, risks, and reserved decisions

Provenance class: historical reference, rights unresolved, principle-only, code reused: none.

**Risks**

- wrap teleport can reappear if visibleRange exceeds safe half-count
- two-item direction can become ambiguous without ping-pong policy
- high yaw can evoke nostalgic gimmick
- mixed ratios can look like front-plane jitter without fixed fit box

**Reserved for human/serial review**

- whether visibleRange survives human control-causality review
- default recommendation 5 vs 7 items
- user selection persistence semantics
- whether one-item mode should be available or route to Hero

No formal charter approval, production implementation, catalogue integration, package, release, or human acceptance is claimed.
