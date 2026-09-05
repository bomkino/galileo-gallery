# Use Galileo Gallery 2.1

## Add media

Use **Add** or drop images, videos or a PDF into the window. For PDFs, choose pages (`1, 3-6` or blank for all), rendering resolution and paper/transparent background. Pages become ordinary image slides; the original PDF is retained once inside the document. PDF pages are rasterized, not editable vector/text layers.

The media list supports search, multi-selection, reordering, duplication, inclusion/exclusion and removal. Clear search before reordering. Each source is copied into owned storage; moving the original afterward does not break a saved native project. The document accepts at most 512 items, 512 MiB per file and 4 GiB of unique managed media, including preserved originals. A batch that cannot fit is not adopted into the document.

## Frame and caption

Select media and choose **Edit framing…**. Drag the crop rectangle or its corner handles, optionally locking a ratio. Numeric crop fields remain available. In Fill mode, the position marker and position values set the part of the source that the frame favours. Apply is one undoable edit; Cancel leaves the document unchanged.

**Fit** preserves the complete crop inside the frame. **Fill** fills a chosen frame ratio, cropping the overflow. Position controls appear only when they affect a Fill composition. Multiple selections show **Mixed** when values differ; entering a value applies it to that selection, not to whatever is selected later.

Captions wrap across multiple lines and render once for an assembled source, not once per fragment. Caption background adds contrast. Long text is limited to a small caption block and visibly truncated; this is not a full text-layout editor.

## Scenes and presets

Choose **Scene** to audition families and their variants with your own media. Changing your mind retains the draft settings for variants already visited. Cancel leaves the document unchanged; Apply is one undoable change. The Scene inspector shows the controls used by the selected variant.

The star saves a scene to **Favourites**. **File → Save Scene Preset…** saves settings and timing, not media, and adds the saved preset to the local library. Applying a named preset also applies its timing; media and per-item spotlights remain in the document. A preset is not a replacement for saving the complete project.

## Centre spotlights and closing

Select a slide and enable **Bring to centre**. Set **Hold**, **Size** and **Transition**. Default: a three-second hold at 85%, with 0.45-second entry and return. Hold supports 0.25–60 seconds; Size 25–95%; Transition 0.1–5 seconds.

Each cue adds its presentation time to the base motion. Holds are not silently shortened to fit a requested runtime. The timeline and exporter use the same complete frame schedule. **Preview spotlight** auditions that cue; previous/next spotlight buttons jump to its hold. Timeline marks show holds in the current cycle.

**Use as closing** moves that included slide to the end and adds its centre hold without a return. This applies to Once and Repeat; Loop retains the ordered loop and saves the closing choice for finite playback. Excluded slides do not receive cues. Reorder media to change presentation order.

A spotlight holds scene travel, not video time. Enable **Play source** and **Loop source** to repeat a short clip during a long hold. Rate and In/Out control the source independently. Replacing a video preserves those settings where the new clip supports them; a shorter clip produces an adjustment notice. Undo restores the original.

## Inspect and save

Space toggles playback when the canvas has focus; Left/Right step individual frames. The frame field uses zero-based frame numbers. **Fit** shows the entire canvas. **100%** displays one output pixel per screen pixel; scroll/trackpad pan when zoomed. The saved panel state and document playhead belong to the workspace, not the exported film.

Use native Save, Save As and Revert. Autosave is managed through the Mac document system. Content edits are undoable; pointer position and selection are not content. A slider gesture forms one undo step. Failed saves preserve changes and the previous file.

If required media is missing or damaged, choose **Open Recovery Copy**. Use **Locate original…** for a fingerprint-matching file or **Replace…** for different artwork. Order, framing and spotlight intent stay attached to the slide. Save the repaired copy separately. An unresolved included source blocks export; excluding it is an explicit choice, not a silent omission. Malformed manifests and unsafe paths remain rejected.

2.0 native documents (schemas 3/4) are upgraded in memory to schema 5. Save a copy before opening it in 2.1 when rollback matters. Legacy ZIP projects open separately and keep their original manifest and visual assets for traceability. Read the conversion notes: translated spotlights, opening/closing and unsupported settings are not pixel-identical reconstruction. Standalone soundtrack files are not imported; the original archive is untouched.

## Export

Choose **Export**, then format and range. Export the whole sequence, one selected spotlight, a custom time interval or a PNG still at the current position. Custom interval end is exclusive. The chosen range is rebased to zero in the movie; source video still uses the corresponding document time. Changing frame rate preserves the current still's time.

H.264 MP4 and ProRes 422 are opaque. ProRes 4444 and PNG support transparency. PNG sequences require a new folder and include `sequence.json`. Movies use Rec.709; PNG uses sRGB. Composition preparation is currently 8-bit; selecting ProRes is not an HDR or high-bit-depth mastering guarantee.

**Every movie is silent by design.** Source-video audio and soundtracks are not part of Galileo. Original video files remain unchanged inside the project. There is no WebM export or automatic poster sidecar.

The Exports window holds one running job and up to four waiting jobs. Each keeps an immutable snapshot of its project. Edit or close a document while its queued film continues. Remove a queued job, cancel the current job, or cancel all. Final output publication cannot be interrupted halfway. The exporter refuses to replace a destination that changed after you chose it. Successful movie output is decoded to verify frame count and timing before publication.

For technical boundaries and validation, see [Engineering](ENGINEERING.md).
