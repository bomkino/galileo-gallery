# Zoetrope — edge, resource, and accessibility policy

## Edge cases

- **0 items:** empty-state copy; no phantom frames.
- **1 item:** stationary gate; no fake cycling.
- **2 items:** opposite gates; shortest signed half-turn is stable under forward and reverse.
- **Many:** hard bound 64 in the prototype; render only the front and neighbouring geometric window while evaluator retains all identities.
- **Mixed ratios:** natural source ratio within a consistent gate envelope; no orientation normalisation.
- **Failed media:** stable placeholder and order.

## Resources

DOM nodes are bounded to the visible window plus a small overscan. ResizeObserver, animation frame, media listeners, and keyboard listeners are disconnected on disposal. No timer or animation survives remount. Video elements outside the active window pause and release decoded pressure under Product policy.

## Accessibility

The canvas does not own global playback or free camera movement. Keyboard review uses Timeline and Scene controls. Reduced motion preserves ordered gate changes and real holds. Focus never follows a continuously moving frame. The selected media identity is announced outside the animated stage. Controls use readable names, visible focus, 44 px minimum targets, and do not rely on colour alone.

## Fallback

Without CSS 3D, render a stable ordered front-gate strip using the same evaluator phase and source policy. Fallback is not a different Scene.
