# Use Galileo Gallery

## Media and composition

Add media from the toolbar or drop files into the window. The sidebar supports selection, reordering, duplication, inclusion/exclusion and removal. The Media inspector controls source framing, fit, crop, focal point, caption and replacement. Managed originals live with the document; moving the source file after import does not break a saved native project.

Choose **Scene** to audition families and their variants using your media. Cancel leaves the project unchanged. Apply commits one undoable composition change. The Scene inspector adjusts canvas, timing and the controls used by the selected variant.

## Centre spotlights

Select one or more slides in Media and enable **Bring to centre**. Each slide stores its own spotlight, including its hold length and centre size. The motion pauses at that slide's authored cue, brings it forward, holds, returns it, and resumes the route. Excluded slides receive no spotlight. Reordering the media changes the presentation order.

Hold accepts **0.25–60 seconds**, and centre Size accepts **25–95%**. The default is a 3-second hold at 85%. Each spotlight adds its hold plus entry/return transitions to the original motion duration. The runtime and export count include these additions. Spotlights are saved with the project and support undo/redo, duplication and media replacement.

A centre hold freezes the scene's travel, not the source-video clock. **Play source** and **Loop source** allow a short clip to repeat inside a longer hold. Disable Play source to show its selected starting image instead. Rate and In/Out affect the source, independently of the gallery sequence.

## Transport

Play/Pause, the timeline and frame field inspect the actual frame schedule. Space toggles playback when the canvas has focus; Left/Right step frames. Once plays a single cycle; Repeat uses the chosen count; Loop previews indefinitely and exports one complete cycle. The output frame rate is saved in the document.

Preview may display fewer frames on a busy Mac; output is rendered from its explicit frame schedule, not recorded from real-time playback.

## Documents

Use native Save, Save As and Revert. Autosave is managed through the Mac document system. Undo returns content edits, not the mouse pointer or selection. A slider drag is grouped as one undo action. Failed saves preserve the unsaved state and the previous file.

Legacy ZIP-based `.galileo` files open as separate native copies. Original manifests and media are preserved for traceability. Review and save the native copy under a different name; native motion is not an identical reconstruction of the old renderer. Unknown schemas fail without rewriting the source.

## Export

H.264 MP4 and ProRes 422 are opaque. ProRes 4444 and PNG support transparency. PNG still exports the selected frame; PNG sequences use a new folder and a `sequence.json` frame-rate manifest. Movie timestamps and frame count are checked by decoding the result before publication to the chosen destination.

Movies are **silent**. Video picture looping works; source audio and legacy soundtrack data are not played or exported. No WebM export is included. Rec.709 is used for movie output and sRGB for PNG. HDR mastering is not claimed.

The Exports window remains separate from document windows. Cancel stops work before output publication. If a destination changes during rendering, the exporter refuses to replace it. There is no automatic poster sidecar.

## Boundaries

The conservative limits are 512 media items, 512 MB per source, 4 GB managed media per document, a 33-megapixel canvas and 216,000 frames for video/sequence export. They are resource guards, not a performance promise. Actual decoding depends on the formats supported by macOS. [Engineering notes](ENGINEERING.md).
