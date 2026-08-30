# Source fidelity, alpha, and Look — Deck River / Continuous

## Clean source contract

- Opacity `1` for every geometrically visible frame.
- Filter `none` at every depth.
- No brightness haze, fog, desaturation, depth blur, glow, tint, grain, vignette, or shadow on source.
- `contain` default. `cover` only through explicit media/frame intent.
- Perspective and clipping are the only depth-related changes to source presentation.

## Why no haze

The current generic renderer uses brightness to suggest depth. That is not physical depth; it
changes authored luminance and can flatten dark or light artwork differently. Visibility must come
from projection size, overlap, geometric clipping, and a Look-rendered world behind the cards.

## Alpha

Transparent source pixels remain transparent at all depths. Soft-alpha video edges are transformed
without matte. Near-plane clipping must not introduce a coloured fringe. Transparent Look leaves the
corridor floating over alpha.

## Look boundary

Look may define architecture, ground, atmospheric world fields, or clean transparency. Those fields
must sit behind/around source. Any world fog must not multiply source RGB or alpha. This packet does
not implement Look.

## Failed media

Product placeholder retains source ID, declared ratio, and arc slot. It travels through the complete
corridor and is never skipped to improve composition.

## Audio

No depth pan, volume, Doppler, room effect, proximity mute, or reverb is Scene-owned. Visual culling
does not stop Product audio. Visual skip/scrub uses Product global time.
