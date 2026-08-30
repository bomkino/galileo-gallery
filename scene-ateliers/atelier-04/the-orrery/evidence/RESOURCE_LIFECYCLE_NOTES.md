# Resource and lifecycle notes — The Orrery

Status: **G10B preflight candidate; implementation blocked by G10A**

## Observed laboratory bounds

- complete evaluator state: one record per source identity;
- landscape observed satellites: at most 24;
- portrait observed satellites: at most 18;
- protected primary/exchange nodes: at most 2;
- diagnostic guides: 0 default, at most 3;
- one requestAnimationFrame transport while playing; none while paused;
- no evaluator timer, random source, network request, video decoder, WebGL context, or shared Product import.

## Disposal expectations

A production renderer must cancel transport, disconnect resize observation, remove controls/listeners, pause and release video resources, dispose any earned GPU textures/context resources, and rebuild exact state from config/media/story time after remount or context loss.

## Capture environment

The laboratory evidence used generated SVG data, Playwright Python, system Chromium, Pillow alpha analysis, and deterministic normalized timestamps. Browser screenshots and generated frame sequences do not prove heap stability, target Garuda/Apple-Silicon performance, external source fidelity, Product export parity, or human acceptance.
