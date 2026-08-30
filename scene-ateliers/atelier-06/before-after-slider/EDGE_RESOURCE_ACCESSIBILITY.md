# Edge, resource, and accessibility policy — Before / After

## Source-count and failure matrix

| Condition | Behaviour |
| --- | --- |
| 0 sources | application fails before mutation |
| 1 source | explicit missing-pair panel; the comparison frame stays hidden; source identity remains preserved and is never duplicated |
| 2 sources | normal Scene |
| >2 sources | first two consumed in order; extras preserved and reported |
| before failed | before placeholder clipped by divider; after never inherits before label |
| after failed | after placeholder remains base pane; before stays clipped above |
| both failed | both side identities and labels remain |
| mixed pixel dimensions | same frame and fit rule; no registration drift |
| mixed aspect ratios | same content rectangle; honest contain/cover consequence |
| source video | both sample the same Product story timestamp |

## Slider accessibility

- Native range input or equivalent ARIA slider.
- Accessible name includes both side labels.
- `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and value text identify before-visible percentage.
- Arrow Left/Right changes 1 percentage point.
- PageDown/PageUp changes 10 points.
- Home/End reaches exact authored extrema.
- Focus ring surrounds the handle and remains visible at both ends.
- Labels are not the sole carrier of side identity; accessible names remain when chrome is clean.

## Reduced motion

Automatic sweep stops at `initial-split`. Manual input remains immediate, with no animation. Static split, labels, and side ownership retain full comparison meaning.

## Resource budget

- one stage and one shared content rectangle;
- exactly two pane roots when a pair exists;
- at most two source canvases/video elements;
- one range input, divider, and handle;
- no interval and no CSS transition on clip or handle;
- one request-animation-frame callback only while prototype playback runs;
- O(1) evaluator state regardless of extra preserved media;
- zero network requests.

## Lifecycle

`dispose()` cancels playback, clears the ephemeral manual split, removes both pane contents, and releases compiled/source state. `mount()` reconstructs the exact split and side identities from sources, controls, and story time. Static control-shell listeners remain bound for the prototype document lifetime; no listener is added per remount. Failed decode state never leaks the opposite source.

## Failure copy

- Zero: `Before / After needs exactly two sources.`
- One: `Add a second source. Gallery will not duplicate the first.`
- Extras: `Before / After uses the first two sources. Remaining Project media stay preserved.`
- Alpha: `Before / After currently requires an opaque comparison background. Transparent export is unavailable until alpha-comparison semantics are defined.`
