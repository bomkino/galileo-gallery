# S0 charter candidate — Contact Table: Focus Strip

- Scene ID: `deck-contact-strip`
- Candidate version: atelier S0, non-runtime
- Verdict: pending
- Production integration: no
- Human acceptance: no

## One sentence

An ordered inspection strip moves beneath one stable focus station; the selected frame arrives without reorder, teleport, or disorienting perspective.

## Anti-motion sentence

Focus Strip is not Quiet Carousel, a draggable gallery, a filmstrip river, a coverflow, or a dim-the-neighbours card scroller. It never changes source order, duplicates a hidden loop deck, snaps the selected item into place, tilts cards for spectacle, or uses source brightness/filtering as selection.

## Emotional and material metaphor

This is a working editorial apparatus: equal documentary frames pass through one measurable inspection station, pause, and continue. The viewer should feel a sequence being checked, not a portfolio floating through a cinematic focus well. Registration corners, a station axis, indices, captions, and deliberate scan stops provide identity. The strip remains planar and legible; perspective is deliberately absent.

The station and documentary frame are legitimate Scene geometry. Table colour, paper texture, grain, vignette, lighting, and source treatment remain Look or Project concerns. Transparent output is therefore honest in the clean candidate: the apparatus can composite over any approved ground without inventing table light.

## Spatial grammar

### Coordinate system and station

The evaluator compiles one axis from canvas orientation:

- 16:9, 1:1, and 4:5 use a horizontal inspection strip;
- 9:16 uses a genuine vertical inspection column;
- the station remains fixed at a bounded percentage of the active axis;
- every source keeps one immutable ID, source index, caption/index role, and circular-track position.

Cards use equal outer documentary frames so a sequence can be scanned without ratio-driven rhythm changes. Imported source ratios still determine the inner source box under each item’s declared contain/cover intent. The frame apparatus does not crop by accident merely to make outer cards equal.

The station is a fixed aperture made from registration corners plus one cross-axis rule. It does not move with the selected frame. A card entering the station receives a small physical lift perpendicular to the strip plane. Non-selected frames do not dim, blur, tilt, or change source opacity.

### Track and recycling

The candidate uses one finite circular logical track whose length is at least large enough to keep the wrap crossing fully offstage. Each identity exists once. Its position wraps only through that guaranteed offstage half; there is no duplicate front/back deck and no source reindexing. The evaluator returns all ordered identities, while a later renderer may mount only cards intersecting the stage plus one bounded offstage margin.

For one source, the track is disabled and the frame rests at station. For two, both advance in one direction around a sufficiently long offstage route; they do not mechanically oscillate between two visible positions.

## Time grammar

Each source owns an inspection hold followed by one ordered travel to the next source. Travel uses a zero-velocity smootherstep arrival so a scan stop reads as deliberate registration rather than frictionless carousel motion.

The ordinary eight-source automatic phrase is compiled from:

1. **Inspection hold.** One frame is exactly registered under the station.
2. **Ordered travel.** The whole strip advances by one source interval without reordering.
3. **Next inspection hold.** The next source arrives at the same station geometry.
4. **Final return travel.** The last frame advances offstage and source one returns through the same circular topology.

No separate unrelated finale is added. The last eligible source receives the final inspection hold; the phrase then returns to the first station state through the normal track. The exact loop seam is source one registered at station, with identical card positions, station geometry, order, labels, and source treatment at normalized 0 and 1.

### Automatic, fixed, and directed mapping

- **Automatic:** each source receives a 650 ms inspection hold and 550 ms travel in the atelier fixture. One source becomes one 8,000 ms still hold.
- **Fixed duration:** the complete phrase is retimed proportionally to exactly 14,000 ms without changing stop order or topology.
- **Directed:** the source-level pattern is quick, quick, regular, quick, repeated over the ordered set. Quick uses 420 ms hold plus 360 ms travel; regular uses 760 ms hold plus 620 ms travel. This reads as two quick inspections, one regular inspection, one quick inspection—not a ticker velocity change.
- **Reverse:** exact story-time retrace. Reverse evaluates the forward phrase at reflected story time and negates velocity; it does not invent a second routing policy.
- **Terminal state:** if a future Product once-mode is approved, terminate on the final eligible inspection hold. The isolated repeating prototype does not claim that integration.

## Controls

Five Scene-only controls survive the causality gate:

1. **Frame size** — changes equal documentary-frame dimensions and visible-card count.
2. **Frame gap** — changes source-to-source track spacing without changing order.
3. **Station position** — moves the fixed station along the active axis and recompiles the offstage-safe track.
4. **Focus lift** — changes only physical separation of the frame registered at station.
5. **Labels** — chooses both, indices, captions, or none; it never changes order or card geometry.

No lane count, perspective, source dimming, glow, paper colour, table colour, density, random tilt, or Look control belongs here. Source count already determines density. Axis is automatic canvas recomposition, not a decorative user toggle in this candidate.

## Source counts and ratios

- Minimum: 1.
- Recommended: 8; ordinary useful range: 6–12.
- Candidate maximum: 24.
- More than 24: reject with explicit capability copy rather than silently truncating or repeating identities.
- One source: rests at station with no fake travel.
- Two sources: ordered same-direction scan around a long offstage route; no back-and-forth oscillation.
- Mixed landscape, portrait, square, cinematic, and vertical artwork retain each item’s declared fit and ratio inside equal outer documentary frames.
- Failed media retain ID, source index, caption/index, exact track slot, station traversal, and a visible failed placeholder.

## Canvas recomposition

The Scene recompiles for 1920×1080, 1080×1920, 1080×1080, and 1080×1350. Portrait is not a shrunken horizontal strip: it becomes a vertical inspection column, with the fixed station and registration aperture rebuilt around the vertical axis. Frame size and design-pixel gap scale from the canvas cross-axis so preview and fixed-step evidence retain proportional composition.

## Captions, indices, and keyboard meaning

Stable one-based indices and captions are part of the editorial apparatus, not optional source decoration. The browser prototype displays them below or beside the documentary frame according to axis. The dependency-free evidence raster encodes frame order and station registration structurally but does not rasterise fonts; generated `TEST_VECTORS.json` records exact label mode, source order, selected index, and failed-slot identity.

Keyboard focus remains source order:

- Left/Right on horizontal canvases and Up/Down on portrait canvases move the requested inspection index.
- Home selects source one; End selects the last source.
- In reduced motion, selection places the chosen source statically at station.
- Animation never steals DOM focus. A source announces one-based index, name/caption, failed state, and whether it is registered at station.

## Video and audio

Source-video visual time is a pure function of Project story time and source duration. The prototype verifies looped and clamped timestamps; scan holds do not pause, restart, or desynchronise source video unless a later Product contract explicitly asks for that behaviour. Focus Strip does not decode, seek, mix, mute, duck, or reimplement Project audio truth.

## Source, Look, alpha, and background boundaries

- Imported artwork: opacity 1, filter `none`, blend mode `normal`.
- Non-selected artwork remains fully source-faithful; selection never uses dimming, brightness, saturation, blur, tint, or glow.
- Per-source fit/crop/focal intent remains Project truth.
- Transparent output: supported. Empty pixels remain zero RGBA.
- Documentary frame and registration station: legitimate Scene geometry.
- Table colour, paper texture, lighting, vignette, grain, and decorative shadow: absent from the clean candidate and owned elsewhere.
- Audio: external Product service only.

## Reduced motion

Reduced motion freezes strip travel and places the explicit keyboard-selected source at the station. All sources remain in stable order on the same logical track. The station, documentary frames, indices/captions, failed slot, and source fidelity remain. No fades, cross-dissolves, source dimming, or generic selected-card zoom replace the identity.

## Lifecycle and resources

The pure evaluator accepts 1–24 sources and returns exactly one state per accepted identity. It owns no timers, drag listeners, scroll state, animation frame, media element, random state, or retained frame history. The browser shell owns one transport callback and cancels it on unmount. A later renderer should mount only stage-intersecting cards plus one offstage margin, release media/proxies on disposal, and preserve the static station fallback after context loss.

## Risks

- If stops are too short, the Scene reads as a ticker; if too long, it feels like a slideshow. Real-speed human review must set defaults.
- If frame size is too large, only one card remains visible and the apparatus loses sequence context.
- If registration marks become decorative or oversized, they compete with artwork.
- Font/caption metrics could alter station balance; S1 needs measured caption bounds without changing card order.
- A central renderer may try to reintroduce brightness/dimming focus. That is a blocker, not harmless polish.
- Continuous circular recycling must remain wholly offstage; a Product renderer must not expose wrap or clone identities for convenience.

## Later human decisions

1. Does the fixed station read immediately as an editorial inspection apparatus?
2. Is the distinction from Quiet Carousel obvious in silhouette and real-speed playback?
3. Are default frame size 64%, gap 28 design pixels, station 50%, and focus lift 24% balanced?
4. Does the quick/quick/regular/quick rhythm feel intentional rather than busy?
5. Is the portrait vertical column a genuine recomposition?
6. Are indices and captions sufficiently present without becoming UI chrome?
7. Keep transparent output as a supported default capability?
8. Keep the maximum at 24, or lower it for readability?

Automated mechanics, generated captures, and atelier review do not decide these questions. `verdict: pending`.
