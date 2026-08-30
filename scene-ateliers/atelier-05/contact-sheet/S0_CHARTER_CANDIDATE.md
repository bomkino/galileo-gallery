# S0 charter candidate — Contact Table: Sheet

- Scene ID: `contact-sheet`
- Candidate version: atelier S0, non-runtime
- Verdict: pending
- Production integration: no
- Human acceptance: no

## One sentence

An ordered whole-set grid stays compositionally stable while authored registration marks move attention from cell to cell; focus never becomes a generic card zoom.

## Anti-motion sentence

Contact Sheet is not masonry, a card swarm, a lightbox launcher, an illuminated Light Table, a periodically rebuilt grid, or Focus Strip folded into rows. It never reorders sources to fill visual gaps, shifts cells during attention, zooms the selected card, brightens/dims artwork, or hides the whole-set context.

## Emotional and material metaphor

A full editorial proof sheet lies on one opaque contact surface. The whole sequence can be read before any individual frame is selected. A restrained registration mark travels the authored reading order like an editor’s proofing notation; the sheet itself remains still. The mood is forensic, composed, and materially ordinary—not theatrical review-room glow.

The paper/contact surface is identity-critical. This Scene therefore does not pretend to support transparency. It must report alpha as unavailable with exact capability copy and export consequence. Opaque paper is not a generic Look backdrop here: without one continuous sheet, the composition becomes an arbitrary grid of cards. Paper colour still needs an approved material token rather than a free palette control.

## Spatial grammar

### Whole-set topology

The evaluator compiles one ordered, non-overlapping grid containing every accepted source. Source order is always the Project order, row by row in the base topology. Empty cells are not filled by masonry reorder. The last partial row is centred as a row while retaining source order. One and two sources become deliberate sparse sheets:

- one: one large proof cell centred on the sheet;
- two: a balanced two-column sheet;
- eight to twenty-four: a bounded whole-set survey with all frames visible.

Every cell owns immutable source ID, index, row, column, x/y, width/height, source box, label role, and failed state for the life of a compiled layout. Attention changes none of these values.

### Cell and source geometry

Cells use equal outer geometry so reading order remains measurable. Inside each cell, the source box respects declared ratio and contain/cover intent. A label band sits outside source pixels. Mixed landscape, portrait, square, cinematic, and vertical frames coexist without masonry privilege for landscape art.

The clean candidate uses strict zero cell rotation. A future human-approved material imperfection may be studied later, but default tilt is deliberately absent: order, proof-sheet legibility, and distinction from Light Table matter more than simulated looseness.

### Focus apparatus

Four restrained registration brackets move from one cell aperture to the next. During holds they align exactly to the selected cell. During travel the mark interpolates between apertures; cells do not move, scale, lift, fade, or change z. After the last cell, the brackets expand to the whole grid perimeter for a whole-set finale, then return to the first cell before the seam.

Focus traversal can be row-major, serpentine, or column-major. These are attention paths only. They never recompile source order or cell placement.

## Time grammar

The grid and source pixels remain present at opacity 1 for the entire phrase. There is no repeated entry rebuild. In a later once-mode entry, the sheet should already be established; only the first static registration mark needs to appear. The repeating candidate phrase is:

1. **Cell inspection hold.** Brackets register one source while the whole set remains visible.
2. **Attention travel.** Brackets move to the next cell along the chosen traversal; topology remains unchanged.
3. **Repeated cell inspections.** The mark visits every accepted source once.
4. **Whole-set gather.** Brackets expand from the final cell to the grid perimeter.
5. **Whole-set finale.** The entire ordered survey is framed as one object; no card zoom, filter, glow, or camera move.
6. **Return to first.** Brackets contract to source one. At normalized 1.0 the evaluator equals 0.0 exactly.

### Automatic, fixed, and directed mapping

- **Automatic:** each cell gets a 600 ms hold and each between-cell move 420 ms; whole-set gather is 620 ms, finale hold 1,000 ms, return 680 ms.
- **Fixed duration:** the complete phrase, including finale and return, is scaled proportionally to exactly 16,000 ms.
- **Directed:** cell inspections repeat quick, quick, regular, quick. Quick uses 340 ms hold plus 280 ms travel; regular uses 700 ms hold plus 500 ms travel. Whole-set finale durations remain structurally present and scale with fixed mode only.
- **Reverse:** exact story-time retrace through the same mark path and whole-set finale. It does not reverse source order or build a second grid.
- **Terminal state:** a future once-mode may terminate on the whole-set finale, not on an enlarged final card. The isolated loop does not claim Product integration.

## Controls

Five Scene-only controls survive the causality gate:

1. **Columns** — automatic or discrete 2–6; recompiles rows, cell size, and label/source boxes.
2. **Gutter** — changes physical separation between stable cells.
3. **Sheet margin** — changes grid bounds inside the continuous paper surface.
4. **Focus traversal** — row-major, serpentine, or column-major attention order; grid topology is unchanged.
5. **Labels** — both, indices, captions, or none; source pixels and layout remain unchanged.

Columns is a discrete layout recompilation. Gutter and margin are continuous layout recompilations. Traversal and labels do not recompile cell geometry. No source brightness, scale, lift, random tilt, page-turn, paper colour, glow, table light, density, hover, or lightbox control belongs here.

## Source counts and page policy

- Minimum: 1.
- Recommended: 12; ordinary useful range: 8–24.
- Candidate maximum: 24.
- More than 24: reject with explicit capability copy. This candidate has no pagination, virtual page, hidden overflow, or silent source omission.
- Rationale: whole-set reading is the Scene’s primary promise. Pagination would replace one whole set with multiple partial sets and needs a separate charter rather than an unreviewed fallback.
- Failed media retain ID, source index, row/column, label, traversal position, and a visible crossed placeholder.

## Canvas recomposition

The grid recompiles independently for 1920×1080, 1080×1920, 1080×1080, and 1080×1350. Automatic columns are chosen by bounded layout scoring using available grid dimensions, cell aspect, empty-slot cost, and row count. Current recommended twelve-source results are:

- 16:9: five columns × three rows, with the final two centred;
- 9:16: three columns × four rows;
- 1:1: three columns × four rows;
- 4:5: three columns × four rows.

These are candidate results, not frozen Product defaults. Human review may prefer four columns on 16:9. Any change must preserve non-overlap, source order, one/two dignity, and whole-set legibility.

## Source, Look, alpha, and background boundaries

- Imported artwork: opacity 1, filter `none`, blend mode `normal`, scale 1.
- Focus never alters source brightness, saturation, blur, crop, tint, opacity, or z.
- Per-source ratio/fit/focal intent remains Project truth.
- Opaque paper/contact surface: required Scene material.
- Transparent output: unavailable; export UI must disable alpha with exact capability copy rather than render a fake transparent grid.
- Paper colour: approved material token later; not a Scene palette control.
- Light-table glow, illumination, vignette, texture, grain, decorative shadow: absent.
- Audio: unchanged external Product truth. Alpha unavailability has no audio side effect.

## Video and audio

Source-video visual time is a pure function of reflected Project story time and source duration, so preview, scrub, fixed-step capture, and reverse retrace remain deterministic. Contact Sheet does not pause video during mark holds or implement audio decoding, seeking, mixing, muting, ducking, or export.

## Reduced motion

Reduced motion keeps the entire grid and opaque paper unchanged. A static registration mark sits on the explicit keyboard-selected source. No brackets travel, expand, pulse, or cross-dissolve. The whole-set remains fully readable. Reduced motion does not replace the Scene with a list or remove labels.

## Keyboard and focus

DOM and accessibility order remains Project source order, independent of visual traversal. Arrow navigation follows the chosen traversal for inspection while assistive names preserve original one-based index. Home selects source one; End selects the final source. Animation never steals DOM focus.

A source should expose name/caption, one-based index, row/column, failed state, and whether the registration mark is currently aligned. The opaque paper, keylines, and debug reading-order path are decorative.

## Lifecycle and resources

The evaluator accepts at most 24 sources and returns exactly 24 or fewer stable cell states. Whole-set identity requires every accepted cell to remain visible; bounded maximum replaces virtualisation tricks that would violate the promise. The evaluator owns no timers, hover state, masonry observer, lightbox, random generator, media element, previous-frame history, or network request. The browser shell owns one animation-frame transport and cancels it on disposal.

S1 must release decoded media/proxies and typography resources on unmount, preserve layout/traversal after save/reopen, and fall back to a static full grid after context loss. A 2D/CSS implementation is sufficient; WebGL is not required.

## Risks

- Twelve-source 16:9 auto layout may prefer five columns mechanically but four columns aesthetically. Human review decides.
- At 24 sources, labels may become too small on some canvases. The correct response may be a lower maximum or label capability warning—not source zoom or pagination by stealth.
- Moving brackets across diagonal row transitions could feel generic. Serpentine traversal exists to test a more continuous reading route.
- The opaque material token could drift into a decorative Look palette. Keep one narrow paper contract.
- A central renderer may reintroduce focus glow/brightness or random tilt. Either is a blocker.
- Contact Sheet and Light Table could collapse if illumination or loose overlap enters this Scene.
- Contact Sheet and Focus Strip could collapse if cells begin moving or only a local subset remains visible.

## Later human decisions

1. Does the default twelve-source sheet read whole-set first, selection second?
2. Is the opaque paper/contact surface materially necessary and visually restrained?
3. Are five columns on 16:9 acceptable, or should automatic default prefer four?
4. Which traversal should default: row-major or serpentine?
5. Is the whole-set finale legible and useful without feeling like a decorative border flourish?
6. Are one and two sources deliberate enough?
7. Keep maximum at 24 with possible label warnings, or lower it?
8. Keep no pagination as a hard capability boundary?
9. Are default gutter 30 design pixels and sheet margin 8% balanced across all canvases?
10. Does the Scene remain clearly distinct from Focus Strip and Light Table in silhouette and real speed?

Automated mechanics, generated captures, and atelier review do not decide these questions. `verdict: pending`.
