# Scene DNA — Quiet Carousel

## Fingerprint

**Silhouette:** one large central frame, one or two neighbours crossing the stage edge, generous
negative space, no tilted planes.

**Real-speed read:** calm continuous travel. The viewer notices the work before the mechanism.

**Material:** prints passing through an architectural aperture, not cards on a wheel.

## Non-negotiable grammar

- One linear closed track.
- One central focus well.
- Modest scale depth only.
- Source opacity `1`; source filter `none`.
- Exact source order and invisible seam.
- Horizontal and vertical are true recompositions.
- One-item breathing remains restrained and seam-safe.

## Forbidden drift

- Perspective yaw or stacked side cards: becomes Coverflow.
- Multiple lanes: becomes Filmstrip.
- Curved baseline: becomes Wave.
- Deep approach/recede corridor: becomes Deck River.
- Stops, crossfades, or snap navigation: becomes slideshow/vitrine behaviour.
- Spotlight dimming, glow, vignette, title overlays, captions, arrows, or indicators inside Scene.

## Source roles

| Role | Rule |
| --- | --- |
| Primary frame | Source nearest the central aperture. No visual treatment. |
| Neighbour | Same source fidelity; smaller only through bounded geometric depth. |
| Failed media | Stable placeholder in the same ordered slot. |
| Video | Exact global source-video time. No autonomous playback clock. |
| Transparent source | Alpha preserved; Look remains visible behind it. |

## Key poses

| Pose | Silhouette test |
| --- | --- |
| `0.00` | Seam reference. Ordered frames distributed across the closed track. |
| `0.25` | One frame entering aperture; predecessor leaving with equal velocity. |
| `0.50` | Opposite phase. Same negative-space rhythm. |
| `0.75` | Reverse counterpart without mirrored artwork. |
| `1.00` | Exact `0.00` state and velocity. |

## Distinctness threshold

Pass only when a black-card silhouette still identifies a calm aperture and real-speed playback does
not read as ticker, coverflow, river, or wave. If depth must exceed the modest bound to feel
interesting, the identity has failed rather than the control needing a wider range.
