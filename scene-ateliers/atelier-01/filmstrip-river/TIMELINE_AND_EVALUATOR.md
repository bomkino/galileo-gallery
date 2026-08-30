# Timeline and evaluator — Ribbon / Two-lane Filmstrip

## Pure evaluator

Inputs: ordered media, four Scene parameters, Product-compiled time/direction/hold target, canvas and reduced-motion intent. Outputs: axis, shared metric extent, exact lane centres and directions, equal real pixel speeds, bounded render instances, source identity and clean render state.

No wall clock, DOM timing, random seed, storage, decode state or GPU feedback enters evaluation.

## Shared metric extent

Odd/even parity streams first resolve their own mixed-ratio dimensions and minimum gaps. Sparse streams repeat render instances only until they cover the stage guard band. The two patterns are then normalized to one shared extent; extra slack is distributed into each lane’s gaps.

This fixes the earlier mixed-ratio failure where the lanes shared normalized phase but moved at different real pixel speeds.

```text
lane 0 speed = -direction × sharedExtent × cycles / duration
lane 1 speed = +direction × sharedExtent × cycles / duration
```

The evaluator reports those same signs and magnitudes. Forward is `← / →`; reverse is `→ / ←`. A hold solves the phase that centres the selected source on its assigned lane gate, then sets both lane speeds to zero.

## Timeline mapping

Automatic and fixed-duration compilation are exercised locally. Directed Product segments remain a shared Timeline responsibility; the Scene consumes compiled phase/hold intent and preserves equal absolute speed through every segment. Source-video time remains global during holds.

## Edge topology

- Lane count is exactly two.
- One source creates two render instances but one media identity.
- Two sources assign one identity to each lane.
- Three to 256 preserve parity order.
- Landscape/square use horizontal rows; portrait/4:5 use vertical columns.
- Recycling occurs only outside the guard band.

## Mechanical proof

The Scene check compares actual frame displacement against declared lane speed, verifies equal magnitude and correct signs, exact seam, hold alignment, all four controls, one/two/many behavior, portrait recomposition, bounded virtual instances, clean source treatment and reduced motion. Randomized and browser UI gauntlets run separately.

Product renderer/export parity and human ocular comfort remain pending.
