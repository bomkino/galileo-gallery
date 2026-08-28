# Edge, resource, and accessibility contract — Slide Anatomy

## Input states

- **Zero sources:** empty guidance.
- **One source:** valid.
- **More than one source:** preserve all identities; require explicit source selection.
- **No matte/guides/caption:** source-only anatomy; duration contracts to avoid dead phases.
- **Empty caption:** no caption plane, label, DOM node, or timing allowance.
- **Failed source:** stable source-plane placeholder.
- **Video source:** paused native playback, deterministic story-time seek.
- **Transparent source:** alpha preserved; apparatus remains separate.

## Geometry safety

Open poses are derived from one ordered apparatus table. Minimum gap between planes is 8 design px at 1080. Planes may not cross at any sample. Labels and leaders remain inside the stage safe area and outside source bounds. Portrait canvases bias offsets vertically and reduce viewing angle before reducing source readability.

## Resource bound

At most five apparatus planes, five backed labels, five leaders, one source media element, one animation handle, one resize observer, and one keyboard listener. No duplicate hidden source. Disposal cancels animation, disconnects observers, removes listeners, pauses media, clears seeks, and revokes generated URLs. Three remounts must produce one response per key and identical first frames.

## Keyboard

- Space: play/pause.
- Enter: toggle closed/open in manual review.
- Left/Right: scrub phrase.
- Home: closed.
- End: open.
- Up/Down: move focus through present apparatus planes.

Each plane exposes its actual Project role. Focus never enters absent planes. Control targets are at least 44 px with visible focus.

## State communication

Expose phrase state, duration, current apparatus focus, and flat-source limitation as readable text. Live announcements occur on explicit open/close, mode changes, and plane selection—not each animation frame.

## Reduced motion

Render a stable fully open anatomy. Remove automatic travel, floating, pulse, and parallax. Manual plane focus changes emphasis immediately while geometry remains fixed.

## Fallback

If 3D transforms are unavailable, render a 2D stepped cutaway with the same ordered apparatus and labels. If even that is unavailable, show the intact source with a textual list of present Project apparatus. Never substitute inferred semantic layers.
