# Edge cases, resources, and accessibility — The Hang

## Counts

| Count | Behaviour |
| ---: | --- |
| 0 | reject/capability copy |
| 1 | centred, long, restrained, mostly still piece |
| 2 | balanced pair with ordered shared impulse |
| 3–8 | primary one-rail or portrait two-rail hang |
| 9–10 | two upper rails with spacing-bounded frames |
| >10 | explicit rejection |

## Canvas and collision

Portrait composition uses two upper rails when count exceeds four. Nine/ten sources use two rails on every canvas. Frame width respects local anchor spacing; swing travel is safety-clamped. S1 must include captions/frame apparatus in final collision geometry and test between canonical timestamps, not only at them.

## Reduced motion

All frames appear fully hung with angle zero. Selection may statically shorten one wire and add an external outline. No descent, swing, retraction, or opacity substitute.

## Accessibility

DOM focus order follows source order, not rail row, x position, or focus z. Announce source index/name/caption, failed state, selected state, and suspended-frame role. Wires, pivots, rails, and debug arcs are decorative. Motion never moves focus.

## Resource bounds

One pure state per source; maximum ten. No iterative solver, retained velocity, timers, cloned cards, random generator, network media, or prior-frame history. The browser shell owns one transport callback. S1 must cancel transport, release media/proxies/textures, disconnect observers, and survive context loss with a static fully hung fallback.

No heap, GPU, decoded-video stress, real remount, or Product export performance claim is made.
