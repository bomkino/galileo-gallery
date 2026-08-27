# G08 evidence receipt — isolated Interface Scale core

Date: 27 August 2026

State: **bounded core checkpoint; G08 UI/HostPort integration is not complete**

## Identity

- Local task branch: `codex/g08-interface-scale-core`
- Reviewed local implementation commit: `ba16d3b`
- Local implementation tree: `b44abceb3fb2f086cfba49ecb57b67f0e599f8f1`
- Remote CI commit: `e9aafa1f22ea32abff4cf32efbc296dfbe462bce`
- Remote CI tree: `c95096371121d206d18ac689356937fa29c98ab2`
- CI run: `33056796943`

The local and remote histories intentionally differ because the connector commit overlays this
bounded slice on the latest published G05 evidence tree. The five implementation files are
byte-identical.

## Proven boundary

- Exact semantic scale values from 75% through 200% in steps of 5%, default and Reset at 100%.
- Local-only, bounded, strictly validated presentation manifest with no Project, media, path,
  credential, or automation data.
- Browser adapter persistence with monotonic revision plus bounded writer identity ordering.
- Cross-window convergence for simultaneous equal-revision writes, stale delivery, clear events,
  failed storage writes, and storage repair.
- Explicit Reset uses the same causal revision, persistence, observer, and convergence path.
- Reentrant observer set→reset and reset→set preserve one matching returned, live, persisted,
  and peer-visible winner.
- Safe listener exception isolation, idempotent unsubscribe/dispose, and disposed mutation rejection.

## Checks

- `npm run verify:interface-scale`: pass.
- `npm test`: pass.
- `npm run verify:source`: pass.
- `npm audit --omit=dev`: zero known vulnerabilities.
- `git diff --check`: pass.
- CI run `33056796943`: macOS, Ubuntu, and Windows source suites passed.

One Spec/Standards fixed-point review found and closed two high-value defects before push: equal-
revision split-brain and synchronous observer reentrancy that could diverge live and persisted
scale. Final rereview reported no blocker, high, or medium findings in this bounded core.

## Not claimed

This checkpoint does not yet wire Interface Scale into the visible Gallery UI, HostPort, menus,
keyboard/focus behaviour, responsive layout matrix, or packaged applications. It does not yet
prove that Project, evaluator, audio, and export truth are invariant at every scale. Those are the
serial G08 integration and experiential evidence gates after G06.
