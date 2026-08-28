# S0 charter candidate — Light Table

Status: candidate; human verdict pending.

## Memorable outcome

A calm illuminated review surface where a small set of frames can be scanned, compared, and inspected without the Scene pretending to edit or rearrange the underlying Project.

## Emotional register

Attentive, tactile, editorial, quiet. More archive desk than glowing dashboard.

## Motion sentence

A restrained loupe travels across stable frame positions, pauses long enough to read one image, then eases onward while the table itself remains physically settled.

## Anti-goals

- Not a generic contact sheet.
- Not a draggable mood board.
- Not a shuffled collage.
- Not a brightbox effect painted across source artwork.
- Not a selection UI that mutates Project order.
- Not a family-engine constant variant of Contact Sheet or Deck Contact Strip.

## Composition

The table is a fixed 2D plane with measured margins and a bounded matrix. The media cells preserve Project order and stable identity. Orientation changes recompute the matrix rather than rotate the whole world. Negative space belongs around the review field; the active frame may lift slightly but never occludes an unrelated frame.

- One item: centred inspection plate, no fake empty grid.
- Two items: balanced comparison pair.
- Three to six: editorial matrix with one active loupe.
- Seven to twenty-four: denser bounded matrix with reduced caption exposure.
- More than twenty-four: preserve order but expose only a documented window; Product integration must provide paging rather than silently allocating unbounded DOM/GPU resources.

Canvas support: 16:9, 9:16, 1:1, and 4:5. Cell ratio remains source-owned; contain is the Clean default. Cover requires explicit user intent.

## Time

Automatic mode makes one complete review pass. Fixed-duration mode retimes the same path exactly. Directed mode compiles fast ×2, regular ×1, fast ×1 review phrases while preserving every stable identity. Reverse follows the same path in reverse. The seam returns to the identical state.

Reduced motion selects a stable representative inspection state and removes travelling transitions; it does not freeze a random sample or flash between endpoints.

## Controls

Only causal, bounded, resettable controls:

- table density;
- inspection scale;
- inspection hold;
- path direction;
- source fit;
- background kind;
- caption visibility.

No free drag, random scatter, per-item rotation, fake film grain, or glow-strength control.

## Source fidelity

Artwork opacity remains 1 with filter `none`, normal blend, and no Scene-authored tint, border, grain, crop, shadow, glow, sweep, or material overlay. Illumination and table texture remain behind or around the source frame. Failed media keep their stable cell and order.

## Accessibility and lifecycle

Keyboard: Space play/pause; Left/Right or Up/Down scrub by one review step; Home/End move to start/finale. Minimum control target 44 px. One restrained live-region update on explicit state changes, never per animation frame. All animation handles, observers, listeners, media bindings, and generated URLs are released on remount/disposal.

## Acceptance boundary

This packet may prove evaluator mechanics, source policy, bounds, and browser interaction. It does not prove Product integration, packaged parity, exact Garuda/macOS behaviour, final Look, or human taste acceptance.
