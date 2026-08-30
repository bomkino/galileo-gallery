# S0 charter candidate — Vitrine

Status: **candidate; verdict pending**
Stable ID candidate: `vitrine`
Version candidate: `1`

## Identity decision

**Motion sentence:** One fully readable source occupies a composed field of negative space, holds without ornamental motion, then exchanges with one incoming source through a restrained, reversible depth-and-yaw passage.

**Anti-motion sentence:** No glow slideshow, artwork light sweep, crossfade-only handoff, constant sway, reflection pool, pseudo-luxury filter, zoom carousel, or “premium” post-processing may carry the identity.

**Emotional and material metaphor:** A quiet museum vitrine or viewing room. Attention is concentrated by space, scale, and ceremony—not by grading the work. The source is the precious object; the environment remains subordinate.

A silhouette-only still must show one isolated, deliberately scaled object with meaningful negative space. A five-second crop must show long readable stillness and, when an exchange occurs, no more than one outgoing and one incoming object. If it reads as a generic slideshow with a fancy background, reject it.

## Composition and source roles

- Exactly one source is the readable subject during holds.
- At most two source planes exist during exchange: outgoing and incoming.
- The readable plane sits slightly above optical centre (`y≈0.47H`) to leave room for an optional external placard.
- Plane size preserves natural ratio and is constrained by a presentation-scale height plus a safe canvas-width bound.
- Source pixels remain opacity `1`, filter `none`, normal blend at all times.
- Paper surround, edge, plinth, environmental light, and shadow are around-source treatment. They belong to future Look unless the Scene needs an alpha-safe minimal mounting edge for legibility.
- Transparent mode removes environment, ground-dependent shadow, and mandatory surround. It never leaves hidden RGB.
- Placard/caption is optional, external to artwork, and semantically linked to the current readable/incoming source. It cannot overlay source pixels.

## Stillness decision

Readable holds are genuinely still. No continuous sinusoidal sway, breathing scale, light sweep, or parallax runs merely to prove the Scene is animated. The `object-turn-amplitude` control affects entry/exit/exchange pose only. Stillness is a capability, not a missing feature.

## Exchange grammar

Let outgoing object begin at centre and incoming object begin fully offstage on the opposite side.

- Both stay opacity `1`; no crossfade occurs.
- Both follow the same eased progress.
- Outgoing travels to the selected side while incoming travels from the opposite side to centre.
- Each uses a bounded depth recession and yaw derived from one progress value.
- At midpoint, both are visible with a composed central interval; neither covers the other by default.
- At completion, outgoing is fully offstage and incoming is exactly centred.
- Reverse evaluates the same poses in reverse story-time order. There is no separate reverse choreography.

The Scene may briefly show two objects, but never a deck, ring, focus well, or row.

## Time grammar

### Automatic loop

Each source owns one equal Timeline-compiled chapter:

- `0.00–0.68` local chapter: readable hold.
- `0.68–1.00` local chapter: composed exchange to the next ordered source.

At the global seam, the last-to-first exchange reconciles exactly because the cycle is modular. One-item input remains a still object at all times.

### Finite ceremonial phrase

- `0.00–0.12` — deterministic entry from a shallow lower/depth pose.
- `0.12–0.68` — readable Spotlight hold.
- `0.68–0.86` — optional exchange from serialized Spotlight source to serialized Finale source.
- `0.86–0.96` — Finale hold.
- `0.96–1.00` — exact inverse of entry.

Spotlight and Finale clarify attention through stillness and role selection, not zoom, source lighting, or background spectacle.

### Timeline ownership

- Timeline owns dwell duration, chapter duration, direction, automatic/fixed/directed mode, Spotlight/finale identities, repeat/once, and story time.
- Scene owns plane composition, pair-bound exchange geometry, and source-safe presentation.
- Casino rhythm is inappropriate as the default. A fast ×2 / regular ×1 / fast ×1 phrase may only be authored if the readable holds remain materially long enough to inspect typography. The Scene must not force it.

## Essential Scene-only controls

No more than five:

1. `presentation-scale` — source plane size within safe canvas bounds.
2. `object-turn-amplitude` — bounded yaw during entry/exit/exchange only.
3. `transition-depth` — bounded recession during transition.
4. `transition-direction` — outgoing left or right.
5. `placard-visibility` — optional external caption/label.

Rejected controls: dwell, pace, opacity, crossfade, reflection, sheen, light sweep, source tint, shadow strength, glow, continuous sway, and local Spotlight identity. Dwell/identity belong Timeline; environment belongs Look; source effects are forbidden.

## Source-count policy

| Count | Decision |
| --- | --- |
| `0` | Product empty state; no fabricated object. |
| `1` | Permanent readable still; no fake transition or sway. |
| `2` | Clear handoff between two identities; pair bound remains two. |
| `3` | Sequential ceremonial viewing; one hold, one pair exchange. |
| `8` | Recommended ordinary fixture for pacing and ratio variety. |
| many / `127` | Complete ordered identity state; only current/incoming sources observed, maximum two nodes. |

No source duplication is used for the seam. Last-to-first exchange references the same two Project identities directly.

## Ratio and canvas policy

- Natural source ratio is preserved.
- Clean default is contain. Per-frame cover/crop/focal intent belongs the source contract.
- 16:9 gives broad negative space and generous horizontal exchange.
- 1:1 and 4:5 retain optical-centre placement and external placard zone.
- 9:16 shows one larger source with strong vertical negative space. Wide sources reduce height rather than crop.
- Mixed ratios change plane dimensions, never the viewing-room centre, treatment, or chapter order.

## Video and failed media

- Source-video time derives from Project story time, including when offstage. Re-entry seeks before visibility.
- Normally keep current video and incoming guard video warm; release all others under Product media policy.
- Failed media retain ID, order, chapter, caption, and geometry. Failure does not skip to another source.
- Scene owns no audio behavior.

## Source fidelity, Look, and alpha

- During every declared readable hold and every transition interval: opacity `1`, filter `none`, normal blend.
- No interval uses source dimming, tint, blur, grade, or light sweep.
- Future Look may affect field, surround, edge, plinth, or shadow around the source.
- Reflection and sheen are rejected for v1. Any later proposal must be separate, default-off, alpha-safe, and prove it does not transform source pixels.
- Transparent output contains source pixels and optional external semantic placard only when explicitly authored. Default transparent capture uses no surround or ground shadow.

## Reduced motion and accessibility

- Reduced motion settles one deterministic source at centre. It removes exchange motion without replacing it with fading or pulsing.
- System preference affects preview presentation, not exported Project truth unless an explicit reduced-motion variant is authored.
- Authoring previous/next inspection follows source order and may land directly on readable holds.
- Focus order follows ordered media controls/list, not the temporary pair’s z-order.
- Placard is associated with current source and never blocks artwork.

## Lifecycle and resources

- Complete evaluator state: one record per media identity.
- Observed source nodes: one on hold, two during exchange, zero in empty state.
- Warm decoded video budget: current plus incoming guard, normally `<=2`.
- Remount, resize, scrub, reverse, and export rebuild from config + ordered media + story time.
- No hidden selection, phase accumulator, persistent reflection texture, light animation, or WebGL context exists.
- DOM/CSS transforms are sufficient; no rendering engine is justified.

## Risks and resolved recommendations

1. **Generic slideshow:** rejected by genuine stillness, spatial pair exchange, source-safe object presence, and no crossfade.
2. **Pseudo-luxury corruption:** reflection, sheen, glow, and source lighting are rejected.
3. **Seasick object:** no motion during readable holds.
4. **Pair collision:** opposite offstage endpoints and shared reversible progress leave a composed midpoint.
5. **Portrait crowding:** one-object composition; wide source height is bounded.
6. **Alpha residue:** transparent mode removes environmental layers; zero-RGB-below-zero-alpha evidence required.
7. **Control clutter:** only five causal controls; Timeline/Look concerns stay out.

## Contract closure

- **Coordinate/path/depth/occlusion roles:** normalized stage coordinates define one centre station and opposite offstage exchange endpoints; bounded recession owns depth; pair ordering owns occlusion; serialized current/incoming/finale IDs own source roles.
- **Entry/cycle/hold/finale/exit/seam:** finite entry and exit are inverse object paths; automatic chapters contain a readable hold then one pair exchange; Finale is a still serialized hold; loop start/end return to the same source and pose without opacity seam.
- **Forward/reverse:** reverse evaluates the same phrase at `1−t`, preserving both source identities and inverse paths.
- **Video/failed media:** source-video time derives from story time; failed media keeps ID, ratio, chapter order, active-plane role, placard semantics, and a source-neutral placeholder.
- **Keyboard/focus:** keyboard previous/next inspects Project order at the centre station; focus remains on the semantic current source and never transfers to a departing offstage plane.

## Later human decisions

The candidate decisively recommends a 68% hold / 32% exchange chapter shape, still holds, no crossfade, no reflection/sheen, `presentationScale=0.62`, `objectTurnAmplitude=5°`, and optional placard on in opaque viewing mode. Human review must decide whether those defaults feel ceremonial rather than inert; whether the exchange midpoint has enough continuity; whether the placard belongs in the default; and whether surrounding object presence stays subordinate to imported work.

**Verdict: pending.** No formal charter approval, production Scene implementation, catalogue integration, G11 completion, package, release, or human acceptance is claimed.
