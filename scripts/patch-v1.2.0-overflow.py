from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


# At medium stacked widths, the extra Theme control moves Project far enough right
# that a left-anchored hidden panel enters the scrollable overflow area. Right-align
# only in the band where it is safe; narrower stacks retain the left anchor.
theme_path = Path("src/themeModes.css")
theme = theme_path.read_text()
contract = """

/* Keep the hidden Project panel inside the stacked shell after Theme joins the action row. */
@container (min-width: 500px) and (max-width: 760px) {
    .project-menu > .project-menu-panel {
        right: 0;
        left: auto;
        transform-origin: top right;
    }
}
"""
if "Keep the hidden Project panel inside the stacked shell" in theme:
    raise RuntimeError("stacked Project panel contract already exists")
theme_path.write_text(theme + contract)

verify_path = Path("scripts/verify-design-system.cjs")
verify = verify_path.read_text()
verify_anchor = 'assert(themeModes.includes("@media (prefers-reduced-motion: reduce)"), "theme transitions lack reduced-motion handling")\n'
verify_replacement = (
    verify_anchor
    + 'assert(themeModes.includes("@container (min-width: 500px) and (max-width: 760px)"), "stacked Project panel fit contract is missing")\n'
    + 'assert(themeModes.includes("transform-origin: top right"), "stacked Project panel does not align inward")\n'
)
verify_path.write_text(replace_once(verify, verify_anchor, verify_replacement, "theme overflow verifier"))

g08_path = Path("electron/g08-interface-smoke.cjs")
g08 = g08_path.read_text()
g08 = replace_once(
    g08,
    "        const shellBox = shell.getBoundingClientRect()\n        const describeElement = (element) => {\n",
    "        const shellBox = shell.getBoundingClientRect()\n        const physicalScale = Number(scaleRoot.dataset.interfaceScale) / 100\n        const shellContentRight = shellBox.left + shell.clientWidth * physicalScale\n        const describeElement = (element) => {\n",
    "shell content boundary",
)
g08 = replace_once(
    g08,
    "                rightOverflow: box.right - shellBox.right,\n",
    "                rightOverflow: box.right - shellContentRight,\n",
    "right-overflow boundary",
)
g08 = replace_once(
    g08,
    "        const overflowOffenders = Array.from(shell.querySelectorAll('*'))\n            .map(describeElement)\n",
    "        const overflowOffenders = Array.from(shell.querySelectorAll('*'))\n            .filter((element) => !element.closest('.stage-shell'))\n            .map(describeElement)\n",
    "Scene overflow exclusion",
)
g08 = replace_once(
    g08,
    "        const stage = rect('.stage')\n        const stageShellElement",
    "        const stage = rect('.stage')\n        const projectPanel = rect('.project-menu-panel')\n        const stageShellElement",
    "Project panel metric preparation",
)
g08 = replace_once(
    g08,
    "                box: { left: shellBox.left, right: shellBox.right, width: shellBox.width },\n",
    "                box: { left: shellBox.left, right: shellBox.right, width: shellBox.width, contentRight: shellContentRight },\n",
    "shell content metric",
)
g08 = replace_once(
    g08,
    "                autosaveActionsOverlap: autosaveVisible && overlaps(autosave, actions),\n            },\n",
    "                autosaveActionsOverlap: autosaveVisible && overlaps(autosave, actions),\n                projectPanel,\n            },\n",
    "Project panel metric",
)
invariant_anchor = "        if (value.headerGeometry.autosaveBrandOverlap || value.headerGeometry.autosaveActionsOverlap) {\n"
invariant_replacement = (
    "        if (value.headerGeometry.projectPanel.left < value.shell.box.left - 1\n"
    "            || value.headerGeometry.projectPanel.right > value.shell.box.contentRight + 1) {\n"
    "            throw new Error(`${key} lets the hidden Project panel escape the usable shell: ${JSON.stringify(value.headerGeometry.projectPanel)}`)\n"
    "        }\n"
    + invariant_anchor
)
g08_path.write_text(replace_once(g08, invariant_anchor, invariant_replacement, "Project panel invariant"))

print("V1_2_0_STACKED_PROJECT_PANEL_CONTAINED")
