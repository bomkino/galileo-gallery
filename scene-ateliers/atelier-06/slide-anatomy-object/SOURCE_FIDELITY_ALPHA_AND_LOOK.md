# Source fidelity, alpha, and Look — Slide Anatomy

## Indivisible source rule

A flattened image or video remains one indivisible source plane. The Scene may move that plane in world space but may not segment, mask, recolour, blur, sharpen, relight, extrude, texture, or infer internal semantic layers.

Source render invariant:

- opacity 1;
- filter `none`;
- blend `normal`;
- contain fit by default;
- no border, shadow, glow, grain, vignette, sweep, or material over source pixels;
- no brightness change between closed and open states.

## Apparatus separation

Matte, guides, caption, labels, leaders, and world backing are separate Project/UI planes. They may not be baked into the source texture. Leaders terminate outside source bounds. Guide lines remain recognisable as guides and are absent from export unless the Project explicitly authors them into output.

## Alpha

The source plane preserves straight alpha. In transparent-output studies, fully transparent pixels must retain zero RGB and no world grain, guide colour, label colour, or backing colour may leak into them. Plane transforms may not force a flattening background.

The candidate’s alpha evidence is structural and generated-fixture based. Product export alpha, codec alpha, and arbitrary user-media RGB equivalence remain downstream gates.

## Failed source

A failed source remains one stable source plane with a causal placeholder. Apparatus may still open to explain the missing plane’s role, but the Scene may not substitute a generated mock slide.

## Look boundary

The future shared Look may style the world behind the anatomy and the non-source apparatus. It may not apply a common lighting pass over the assembled object if that pass changes artwork. Stable luminance, deterministic subtle world phase, decorrelated grain, and transparent-output sanitation belong to G10D.

## Authored-layer boundary

If a future Project supplies explicit authored layers, each layer requires identity, order, bounds, transform, alpha, source provenance, and round-trip semantics. This packet does not invent or prebuild that contract.
