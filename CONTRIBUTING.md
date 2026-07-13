# Contributing to Galileo Gallery

Thank you for helping make motion tools more expressive and accessible.

## Before opening a pull request

1. Open an issue for substantial behavior or interface changes so the motion intent can be discussed first.
2. Keep changes focused. Galileo's scenes share infrastructure, but each scene owns its physical behavior and defaults.
3. Run `npm test`.
4. Exercise the affected scene in the app, including timeline scrubbing, Once, Loop, and export when relevant.
5. Include a short screen recording for motion or interface changes.

## Development

```bash
npm install
npm run dev
```

The project downloads a platform-specific FFmpeg build during install. Packaging copies that binary into the desktop app with `npm run prepare:ffmpeg`.

## Motion principles

- Prefer continuity over cuts or unexplained pop-ins.
- Keep depth ordering physically legible.
- A seamless loop should return naturally to its first pose.
- Spotlight and Finale are authored states, not generic scale effects.
- Respect `prefers-reduced-motion` in the studio interface.

By contributing, you agree that your contribution is licensed under GPL-3.0-or-later.
