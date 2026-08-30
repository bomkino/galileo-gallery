# Source fidelity, alpha, and Look boundary — Open Fan

## Clean source contract

At every declared readable hold, including base overview, spotlight hold, and finale hold:

```text
artwork opacity = 1
artwork filter = none
artwork blend mode = normal
artwork colour transform = identity
```

Container depth, transform, clip, and optional shared Frame shadow may change. Source pixels do not.

## Geometry versus Frame

Open Fan owns only:

- common hinge position;
- ordered angular slot;
- opening amount;
- radial spotlight/finale lift;
- deterministic card depth order;
- mounted source window.

Shared Frame owns:

- contain / cover;
- crop rectangle and focal point;
- ratio override;
- padding and caption reserve;
- corners, border, and frame material;
- image/video decode plane.

A Scene control must not duplicate those shared choices.

## Ratio and crop ownership

The evaluator receives the resolved frame ratio and projected bounds. `contain` may expose neutral Frame-owned letterbox. `cover` may crop only according to the shared Frame crop/focal contract. Fan geometry must not silently crop a portrait card because it collides; it must derive a safer spread or card size.

## Failed media

A failed source retains the original ordered ID, ratio, slot angle, hinge, and accessibility position. The renderer substitutes a neutral failure plane inside the existing Frame. It does not remove the card or close the angular gap.

## Look boundary

G10D Look may render behind or around the card plane: background colour, authored grid/map/contour/wave/cutting-mat fields, deterministic world grain, vignette, and stage light. Look may not wash across source pixels by default. Open Fan does not prebuild or serialize Look.

## Transparency

For transparent Project output:

- Stage and Scene-owned empty space emit `(0,0,0,0)`.
- Card and source alpha composite normally.
- Fully transparent pixels must have RGB exactly zero after every Scene/Look pass.
- Grain and shadow must be premultiplied correctly and absent where alpha is zero.
- Evidence composites are checked over black, white, red, blue, and checkerboard.

The prototype's generated fixtures include soft alpha edges solely to test compositing; they are not Product assets.

## Video

The visual source plane samples Product-provided deterministic video frames at story time. Open Fan never speeds, pauses, loops, or seeks video based on angle, lift, hover, or z-order. During a hold the card may be stationary while source video continues according to Project intent.

## Audio

No Scene parameter reads or changes source-video audio, presenter lane, soundtrack lane, gain, solo, mute, ducking, master, sample rate, or mux policy. Audio remains a deterministic Product service.
