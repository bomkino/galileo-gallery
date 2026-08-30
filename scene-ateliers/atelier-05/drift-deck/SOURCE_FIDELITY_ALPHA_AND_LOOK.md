# Source fidelity, alpha, and Look — Quiet Drift

## Clean source contract

Every evaluated source declares:

- `artworkOpacity: 1`;
- `artworkFilter: none`;
- `blendMode: normal`;
- stable ordered identity;
- upstream per-frame contain/cover/focal intent untouched.

The Scene may move the physical print object and draw a restrained paper edge. It may not dim, tint, brighten, blur, grain, vignette, crop, relight, or colour-grade the imported image. Attention is spatial and structural, never photometric.

## Paper versus artwork

The generated fixture renderer distinguishes artwork from Scene apparatus:

- colour field and white lines simulate generated source pixels;
- pale edge simulates paper/print geometry;
- dark hairline describes the physical edge;
- focus registration outline sits outside the print.

These are evidence fixtures, not historical assets and not a final Look. Product S1 should source paper/ink values from an approved Look or a narrow Scene material token contract. It should not expose an independent palette in Scene controls.

## Transparent output

Transparent output is supported. The isolated rasteriser starts from RGBA zero and blends only actual Scene pixels. Evidence at 960 × 540 reports:

- 352,208 fully transparent pixels;
- 0 transparent pixels with non-zero RGB contamination;
- 0 partial-alpha pixels in the deliberately hard-edged fixture raster;
- 166,192 opaque pixels.

Composites are generated over black, white, red, blue, and checkerboard. These prove that the current generated raster keeps empty pixels colourless. They do not prove a future browser/GPU/Product renderer or encoded export until S1 integration repeats the test.

## Opaque output

An opaque Project may place the Scene over any approved Look. Quiet Drift does not own a table colour. The current transparent evidence may look black in image viewers that default transparent pixels to black; the PNG remains transparent.

## Forbidden default treatments

- table lamp or directional light;
- ambient occlusion wash over artwork;
- source brightness reduction outside focus;
- glow around active print;
- grain or paper texture composited through transparent pixels;
- generic vignette;
- scene-owned background colour;
- blend modes other than normal;
- inherited central-renderer brightness filters.

## Crop and ratios

Canvas ratio and source fit remain separate. The Scene sizes outer print geometry from source ratio and canvas composition. Product frame intent decides contain/cover/custom ratio/focal point. A failed source preserves the same geometry and index as the valid source it replaces.

## Diagnostics and limitations

The packet uses generated local fixture pixels, not external user media. It samples known opaque interior colours and structural metadata, but it does not claim decoded pixel-for-pixel equality against arbitrary PNG/JPEG/video sources. That remains an S1 renderer and export test.
