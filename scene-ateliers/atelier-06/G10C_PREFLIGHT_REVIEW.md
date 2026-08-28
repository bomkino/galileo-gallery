# G10C preflight review — The Build

## Recommendation

Do **not** promote The Build into Product source until an authored-stage contract exists. The current flat-source preflight is useful for testing rhythm, stage lanes, finale, controls, duration policy, source fidelity, and the review journey. It is not a substitute for authored construction data.

## Blocker: `AT06-CONTRACT-AUTHORED-STAGES`

A versioned stage record must define:

- stable stage ID and human label;
- explicit order and optional dependency graph;
- source/provenance identity;
- bounds, transform, alpha, fit, and crop/focal intent;
- arrival, settle, hold, and exit intent;
- relationship to the final composition;
- missing/failed-stage consequence;
- preview, scrub, fixed-step export, and reverse semantics;
- portable Project round-trip and version migration policy;
- stage-count, decoded-media, DOM/GPU, and cache bounds;
- authoring/import/editing journey.

Without this contract, code can only animate constants around a flattened source. That would fail the Scene identity and misrepresent authorship.

## Preflight findings

1. **11.6 seconds** is a defensible canonical phrase for five preflight stages: world, matte, Project apparatus, source, finale.
2. **7.9 seconds** is the canonical readable floor. The floor must recompute from present stages; missing apparatus contracts both duration and floor.
3. The finale needs a substantial uninterrupted hold. Review-only apparatus must clear or stay outside source bounds.
4. Directed fast ×2 / fast ×2 / regular ×1 / fast ×1 is mechanically viable only when each phrase remains complete and stage IDs stay stable.
5. Reverse can demonstrate exact inverse paths but must not imply that authors historically designed in reverse.
6. Reduced motion should show final source + static stage ledger, not a compressed reveal.
7. Cursor, stamp, palette, wireframe, typography trials, and approval language are forbidden unless explicitly authored as stages.
8. The Scene must retain a visible `preflight—not authored process` status until G10C closes.

## Deletion test

Remove authored-stage identity/order/provenance from a hypothetical implementation. What remains is generic assembly theatre. Therefore those records are not optional metadata; they are the core of The Build.

## Integration sequence

1. Human review of preflight identity and timing.
2. Decide `AT06-CONTRACT-AUTHORED-STAGES`.
3. G10C owns Product implementation and contract changes serially.
4. G10D freezes shared Look treatment.
5. Only then may G11 catalogue integration and human acceptance proceed.

No production completion is claimed here.
