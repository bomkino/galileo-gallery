# Quiet Carousel isolated prototype

Dependency-free browser study. Generated fixtures only. Never imported by Product.

Run:

```text
open index.html
node check.cjs
```

The page exposes `window.atelierPrototype` for deterministic capture:

- `setTimeMs(number)`
- `setCount(number)`
- `setCanvas("16:9" | "9:16" | "1:1" | "4:5")`
- `setDirection("forward" | "reverse")`
- `setReducedMotion(boolean)`
- `setComposite("checker" | "black" | "white" | "red" | "blue")`
- `getState()`
