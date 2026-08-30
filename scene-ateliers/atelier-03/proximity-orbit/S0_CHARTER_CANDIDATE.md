# S0 charter candidate — Proximity Orbit

## Candidate identity

- stable Scene ID candidate: `proximity-orbit`
- candidate version: `1`
- catalogue label: **Orbit — Proximity**
- status: candidate charter; `verdict: pending`
- implementation status: clean-room isolated prototype only

**Motion sentence:** Ordered cards travel one depth-emphatic path; camera distance produces a bounded nonlinear near swell, a quiet far recession, and a deliberately slower readable near passage.

**Anti-motion sentence:** Never let pointer/hover alter output motion, mimic Calm Ring's uniform tray, use lighting as fake depth, become a broad cinematic ellipse, or enlarge near cards with one arbitrary scale constant.

## Emotional and material metaphor

A print passes close enough to feel intimate, then recedes into quiet distance. Nearness is bodily but controlled: no jump-scare, no lens flare, no sudden brightness, no collision. The path itself explains intimacy.

## Physical model

- One cyclic 3D path exists around a deliberate camera-distance function.
- Ordered source identity maps to stable cyclic distance.
- Horizontal position, vertical projection, camera depth, perspective scale, container alpha, and z-order derive from the same path sample.
- A nonlinear near kernel adds bounded emphasis only after geometric perspective is known.
- Near traversal allocates more story time to the final approach/first departure angles, making the speed curve visibly unlike Calm Ring's uniform calm rotation.
- Cards remain camera-facing. They do not self-spin, tumble, or receive moving light.
- Collision caps derive from actual card bounds/canvas; the near card may swell less when a tall ratio would breach safe bounds.

## Time grammar

### Entry

Cards emerge from a quiet far/centre state into the full path. Entry is deterministic story time, not an observer or mount animation.

### Near/far cycle

Far passage is smaller, quieter, and faster. The final approach to near is slower and nonlinear; the readable near zone is held long enough to inspect. Departure is the exact inverse shape in reverse playback.

### Spotlight

An authored source approaches the near gate through the normal path, reaches the same collision-safe near pose, holds at full source fidelity, and departs without flattening the orbit.

### Finale

The final unmuted source resolves near while shoulder/far cards remain spatially explanatory. Finale may hold or return to the quiet seam; it is not a centre zoom.

### Exit and seam

The path collapses to the same hidden state as entry. Repeat is exact; reverse evaluates the same phrase backward.

## Timeline compilation

- **Automatic:** derive travel from count/Product pace, preserving local near-zone dwell and minimum 700 ms spotlight / 900 ms finale holds. Candidate seven-card study: 9,000 ms.
- **Fixed duration:** holds and near-zone readability remain literal; scale far travel first, then approach travel. Reject targets below 3,600 ms with both holds.
- **Directed:** cycle segments advance continuous path phase; hold segments pin a source at near gate. Casino rhythm may accelerate far arcs but cannot compress the regular near passage below readability.
- **Forward/reverse:** exact temporal inversion.
- **Spatial direction:** unsupported; the path has authored camera-distance logic, not a generic axis.
- **Hover:** may preview source selection only. It cannot speed, slow, pause, or serialize output motion.

## Essential controls

| Control | Default | Serialized meaning |
| --- | ---: | --- |
| `orbit-radius` | 36% | Horizontal path radius against canvas short axis. |
| `proximity-strength` | 68% | Coherent strength of nonlinear near swell and local near-time allocation. |
| `path-projection` | 56% | Balance of vertical projection and camera-depth amplitude. |
| `card-size` | 22% | Base card width before ratio and collision-safe near cap. |

Timeline owns global pace/direction/mode/holds. Frame owns fit/ratio/padding/crop/focal intent. Look owns world treatment. Four controls are sufficient; lighting, alpha floor, and scale cap remain derived.

## Count and bounded-many policy

- **1:** static near presentation with entry/hold/exit; no fake orbit.
- **2:** opposite near/far pair with explicit depth order.
- **3–20:** all sources occupy stable path phases.
- **21–127:** evaluate full ordered front progression; mount a 16-source cyclic window around near identity. Guard sources enter/exit in far recession at low alpha. Every source reaches near in order.
- **0:** empty-stage fallback.

## Mixed ratios and collision

Base width is shared; height follows resolved ratio. Each card receives a deterministic near-scale cap from its actual width/height and canvas safe bounds. A tall card therefore remains on path but may swell less than a wide card. This is collision safety, not source discrimination: camera depth, alpha, z-order, and near hold remain identical.

## Canvas recomposition

- **Landscape:** strong horizontal orbit with lower near gate and restrained vertical path.
- **Portrait:** horizontal radius remains short-axis bounded; vertical/depth projection increases, near gate shifts to a safe lower-middle region, card size reduces.
- **Square/4:5:** interpolate from aspect; do not crop a landscape orbit.

## Source, Look, alpha, video, failed media, audio

- At near readable passage: container opacity `1`, artwork opacity `1`, filter `none`, blend `normal`.
- Far recession uses geometry and container alpha only. No tint/brightness/lighting shift.
- Product/Frame owns source fit, crop, focal point, padding, and ratio.
- Video frame comes from Product story time; nearness does not seek, pause, or change playback speed.
- Failed media retains identity, ratio fallback, path, near turn, and accessible name.
- Transparent mode requires no line, glow, shadow, star field, or matte; zero-alpha RGB must be zero.
- Audio remains Product-owned.

## Reduced motion and interaction

Reduced motion resolves to a static near source with fixed far/shoulder context. Disable entry, cycle, swell interpolation, spotlight travel, and exit. Keyboard Left/Right changes ephemeral inspection identity; Home/End first/last; Enter detail. Hover may identify a card but cannot alter phase, pace, scale law, or Project data.

## Lifecycle/resources

The evaluator is pure and stateless. It owns no rAF, clock, pointer state, hover state, observer, timer, flourish, network request, decoder, worker, texture, or persistent store. Renderer mounts bounded cards; Product owns scheduling, media cache, offscreen behavior, remount, context loss, and disposal.

## Risks and mitigations

1. **Near swell becomes gimmick.** Bound geometric+nonlinear scale and slow the near zone instead of adding light.
2. **Looks like Calm Ring enlarged.** Use stronger depth/vertical projection, nonlinear scale law, and non-uniform local speed.
3. **Tall cards collide.** Per-ratio safe scale cap, portrait size reduction, and no source-ratio coercion.
4. **Far cards disappear unpredictably.** Derived alpha floor and deterministic cyclic guard window.
5. **Hover leaks into export.** Explicitly exclude interaction state from evaluator/config.
6. **Scale and z disagree.** Both derive from camera depth before bounded near emphasis.

## Later human decision

Recommendation: approve four-control ownership, default near scale cap at 1.70, and no lighting treatment. Human review must judge whether 68% proximity feels intimate rather than aggressive, whether near dwell is long enough, and whether ratio-specific caps remain fair. `verdict: pending`.
