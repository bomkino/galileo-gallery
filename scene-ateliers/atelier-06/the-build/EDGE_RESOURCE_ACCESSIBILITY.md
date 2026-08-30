# Edge, resource, and accessibility policy — The Build

## Apply policy

| Input | Result |
| --- | --- |
| zero sources | fail before apply: `minimum-items` |
| one source | ordinary flat-source presentation build |
| two or more ordinary sources | consume first; preserve/report extras |
| explicit authored-stage proposal | block: `AT06-CONTRACT-AUTHORED-STAGES` required |
| failed primary | stable unavailable source with same ID; extras remain extras |
| source video | one Product story-time sample; no local autonomous clock |

## Ratio and canvas recomposition

- 16:9: landscape frame with moderate negative space.
- 9:16: taller anchor; source frame width contracts before content becomes illegible.
- 1:1: balanced centre; guide geometry stays inside frame.
- 4:5: portrait editorial balance.
- Source fit remains current Product `contain`/`cover` truth; this atelier defaults to source-respecting contain.
- No per-source focal control is claimed.

## Fixed-duration failure copy

Caption present:

> The Build needs at least 7.9 seconds for this readable beat set. Gallery preserved those beats and compiled a longer result instead of hiding the middle decisions.

No caption present:

> The Build needs at least 7.3 seconds for this readable beat set. Gallery removed the unavailable caption beat, preserved the remaining decisions, and compiled a longer result instead of hiding them.

## Explicit-stage capability copy

> These files are not marked as authored build stages. Gallery preserved them, but The Build cannot treat arbitrary media as process steps without an explicit stage-role Project contract.

## Failed-source copy

> The primary source is unavailable. Its place and identity remain reserved; Gallery did not substitute another file.

## Reduced motion

- Four discrete states only: empty, guides, source placed, resolved.
- No moving cursor.
- No animated 3D, wipe, or continuous reveal.
- State changes remain available through scrub and keyboard controls.

## Keyboard and focus

Prototype transport:

- Space: play/pause when the stage owns focus.
- Left/Right: fine scrub.
- PageUp/PageDown: coarse scrub.
- Home/End: exact beginning/end.
- Reset: explicit button.
- Controls use native inputs and visible focus rings.
- Status region announces phase name, not decorative motion.

The source presentation itself is not a draggable editor. Cursor visibility is a Scene control, not pointer capture.

## Accessible description

Ordered description uses only known structure:

1. empty presentation frame;
2. frame apparatus placed;
3. canvas guides visible;
4. source placed intact;
5. Project caption placed, only when present;
6. guides removed;
7. finished source held;
8. presentation deconstructed for loop.

## Resource bounds

- one decoded primary media element;
- at most one source canvas/image/video node;
- bounded frame, guide, caption, cursor, and status nodes;
- no per-frame DOM allocation;
- no network requests;
- no GPU context required;
- one animation loop, cancelled on pause/dispose;
- static stage/control listeners remain bound for the prototype document lifetime; no listener is added per remount;
- remount restores deterministic source, controls, and story-time state.

## Fallback

Canvas/DOM 2D fallback is sufficient. If clip paths are unavailable, use a source window with bounded overflow hidden. If transparency export is unavailable, state the capability consequence; never flatten silently.
