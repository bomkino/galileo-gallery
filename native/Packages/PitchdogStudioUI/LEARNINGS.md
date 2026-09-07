# Verified implementation lessons

## Native menu paint and accessible naming

Galileo's hosted 362aa117 light/dark captures showed that macOS flattens a Menu label to a native title/image, dropping the custom well drawn inside that label. The corrected component paints the well, border and chevron outside the real Menu, while retaining its native Picker and selection behavior.

Drift pilot 120a4bd6, run34147374954, independently exposed a label/trigger accessibility collision. The captured hierarchy contained both a StaticText and PopUpButton identified as drift.world. The existing UI driver clicked the first matching node, which was the noninteractive label. Field editing, real sidebar dragging and Undo/Redo had already progressed. The fix removes the redundant visible label from the accessibility tree: the native trigger already exposes the full label and selected value. The driver and its required World-selection assertion are not weakened.

These are evidence-based component changes, not a claim of full VoiceOver or human visual acceptance. The next exact-source pilot must still pass.
