# Edge, resource, and accessibility contract — Before / After

## Input states

- **0 sources:** empty guidance.
- **1 source:** insufficient-input message; never duplicate.
- **2 assigned roles:** valid comparison.
- **3+ sources without role assignment:** ambiguous-input message; preserve all Project identities.
- **Failed Before or After:** role-specific placeholder remains clipped and labelled.
- **Mixed ratios:** contain inside one stable plane; no inferred crop.
- **Video on either side:** deterministic story-time seek; native playback is paused.

## Canvas recomposition

The comparison plane stays centred and readable across 16:9, 9:16, 1:1, and 4:5. On narrow portrait canvases, backed labels move outside the artwork rather than cover a large percentage of it. Divider orientation remains user-owned and is not silently changed by canvas ratio.

## Resource bound

Exactly two media elements, one divider, up to two labels, one backed status region, one animation handle, one resize observer, and one keyboard listener. No duplicate offscreen media tree is permitted. Disposal pauses both media elements, clears seeks, removes listeners, disconnects observers, cancels animation, and revokes generated URLs.

## Keyboard

- Space: play/pause.
- Left/Down: reduce reveal.
- Right/Up: increase reveal.
- Home: 0%.
- End: 100%.
- `0`: 50/50.
- Shift + arrow: larger manual step.

The stage exposes a slider-like accessible value only for manual comparison; autoplay state remains separate. Controls and handle targets are at least 44 px even when the visible divider is 1–2 px.

## Announcements

Announce explicit mode changes, play/pause, manual percentage changes after a short debounce, and endpoint arrival once. Never announce each animation frame.

## Reduced motion

Autoplay motion stops. The default state is 50/50 with both role labels visible. Manual keyboard and pointer adjustment changes the split immediately.

## Fallback

If clipping or transforms are unavailable, show Before and After side by side with stable labels and contain fit. Do not replace the Scene with a crossfade.
