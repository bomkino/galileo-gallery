# S0 charter candidate — Contact Table / Light Table

- Scene ID: `light-table`
- Candidate version: atelier-local `0.1`
- Status: candidate only
- Formal charter verdict: pending
- Product integration: no

## Motion and anti-motion

**Motion sentence:** Prints rest on an illuminated review surface; attention moves by measured under-light, small physical nudges, and a source-safe loupe route while every artwork pixel remains untouched.

**Anti-motion sentence:** Never become a flying scatter field, shuffled carousel, automatic collage generator, or glow effect painted through the artwork.

The emotional register is a quiet edit room after everyone else has left: practical, tactile, attentive, and slightly forensic. The material metaphor is an opaque photographic light table with loose transparencies, not a magical luminous void.

## Source contract and count decision

Current live sources conflict: the registry declares six as the minimum while the profile recommends five. This packet resolves the concepts instead of choosing one silently:

- **Minimum apply count:** `1`.
- **Ordinary count:** `6`.
- **Preview/default fixture:** `6`.
- **Bounded many:** `24` visible items. More remain preserved in Project order but require paging or another Scene.
- **Serial correction required later:** change the registry minimum from `6` to `1`; change the profile recommendation from `5` to `6`. This atelier does not edit either file.

Why: minimum is an application-validity rule. One source can become one generously spaced inspected transparency without faking a pile. Recommendation is the authored ordinary composition. Six produces a stable two-band review field and stronger distinction from a simple five-print scatter. Five remains valid and deliberately airier.

Count behaviour:

| Count | Behaviour |
| --- | --- |
| 0 | Applying fails before mutation: “Light Table needs at least one source.” |
| 1 | One inspected transparency, centred, large, generous surface, static loupe route. |
| 2 | Bilateral comparison layout; no fake duplicates. |
| 5 | Valid compact table; one open inspection bay remains visible. |
| 6 | Ordinary composition and default evidence fixture. |
| 7–24 | Deterministic ratio-aware review grid with centred partial rows, bounded micro-jitter/rotation, measured overlap, and a serial focus route. |
| >24 | Sources remain preserved and ordered; v1 application reports the visible limit instead of silently dropping them. |

## Coordinate, topology, and depth model

- Stage coordinates are normalized to the Project canvas, then recomposed per canvas ratio.
- Every source owns one stable topology slot derived from source order, count, and canvas ratio. No runtime randomness.
- The one-, two-, five-, and six-source cases use explicit composition policies. Seven through twenty-four use a deterministic ratio-aware bounded review grid. Independent rectangle geometry enforces on-canvas placement and the declared occlusion cap.
- `table-spread` controls the occupied normalized rectangle.
- `overlap` controls the permitted intersection band. Default overlap remains low enough to preserve scanability.
- Depth order is stable by source identity. The currently inspected item rises above neighbours; it never changes Project order.
- Under-light is a separate expanded rounded rectangle behind each frame. It cannot be a descendant, filter, blend, mask, or pseudo-element over media pixels.
- The loupe is a source-neutral outline and scale transform around the complete frame. It never samples, magnifies, recolours, or clips only part of the media in v1.

## Story grammar

One automatic phrase uses pure normalized story time:

1. **Entry / wake, 0.00–0.10:** the surface reaches working luminance; cards complete a tiny deterministic settle from their own neutral slots.
2. **Review route, 0.10–0.78:** attention visits each item in source order. Every visit contains a restrained move and a readable hold.
3. **Final inspection, 0.78–0.92:** the final unfailed source receives the strongest loupe and under-light, still without source treatment.
4. **Exit / reset, 0.92–1.00:** focus and nudge return continuously to the exact neutral seam pose.
5. **Loop seam:** normalized `0` and `1` are numerically identical for all topology, drift, focus, light, and depth values.

Ambient drift is a very small periodic transform with integer-frequency harmonics. It is not wall-clock physics. Pointer dragging, throwing, momentum, and interval-driven “tidying” are excluded from v1 because they would create a second preview-only truth. A later interaction may exist only if authored positions round-trip through an approved serializable Project contract.

Reverse samples the same evaluator at `1 - t`. It reads as review retracing, not as physical undo. Reduced motion keeps the complete arrangement and uses a static outline plus under-light step on the authored focus item; drift and transit are zero.

## Timeline modes

- **Automatic:** ordinary six-source phrase defaults to 10,000 ms; count-adjusted within 8,000–18,000 ms.
- **Fixed duration:** compiler accepts the count-aware floor `max(6,000, 1,200 + 680 × count)` through 60,000 ms. Requests below the current floor report `duration-below-readable-minimum` and preserve readability.
- **Directed:** opening/return motion requests 2× pace while review/final inspection remain regular. Every segment keeps a declared minimum and records achieved pace; impossible totals report a compromise.
- **Preview, scrub, and fixed-step capture:** one compiler and one evaluator.
- **Terminal state:** exact neutral table or authored final inspection, selected explicitly by future Timeline intent. No hidden terminal mutation.

## Essential Scene-only controls

Exactly five controls are proposed:

1. `table-spread`
2. `overlap`
3. `underlight-strength`
4. `focus-behaviour`
5. `nudge-restraint`

Canvas ratio, source fit, Look, audio, Timeline mode, and export settings remain shared Product concerns.

## Media, fit, and failure policy

- Source order and identity remain unchanged.
- Imported art renders at opacity `1`, filter `none`, normal blend, with current declared `contain`/`cover` intent. Clean default is `contain`.
- Mixed source ratios retain independent frames. Canvas recomposition changes topology scale, not source crop intent.
- Failed media retain their slot, ID, order, and a neutral frame-level failure card. Under-light may illuminate the frame boundary, never substitute another source.
- Source-video frames use Product story time. Scene does not autoplay from a wall clock or alter audio truth.

## Opaque capability decision

An opaque illuminated table is identity-critical. Candidate v1 does **not** support transparent output.

Capability copy:

> Light Table needs an opaque illuminated surface. Transparent export is unavailable for this Scene. Choose another Scene to preserve alpha.

Export consequence: applying transparent Look/export intent must fail or require an explicit Scene change before export. Gallery must never fake alpha by flattening to black, white, or a hidden colour.

## Look and audio boundary

Look may style the opaque table outside source rectangles. Stable luminance is measured over the table excluding artwork. No bloom, exposure shift, glow filter, brightness filter, colour spill, tint, grain, texture, or light mask may touch source pixels. Scene does not alter Project audio, source-video audio, presenter, soundtrack, mute, solo, gain, or ducking.

## Accessibility and lifecycle

- Focus order follows source order, not visual z-order.
- Keyboard access: Tab enters frames; arrow keys move focus by source order; Home/End reach first/last; Enter toggles the static loupe inspection state; Escape clears it.
- Focus ring is outside the media rectangle and remains visible over the table.
- Reduced motion preserves spatial meaning.
- Renderer owns one bounded stage node, one frame node and one media canvas per visible source, one under-light node per frame, and no unbounded timers.
- Resize/remount recomputes from source identity and controls; no stale physics state survives disposal.

## Risks and later human decisions

1. Does six feel like a true ordinary review table, or should five remain the default despite the stronger empty bay?
2. Does the loupe read as inspection without becoming Vitrine?
3. Is overlap sufficient for tactile identity while still preserving editorial scanability?
4. Does an opaque-only policy make the Scene honest enough, or too restrictive?
5. Does the automatic focus route feel authored rather than like a slideshow?

Human verdict remains pending. No registry correction, production renderer, catalogue integration, package, release, or acceptance is claimed.
