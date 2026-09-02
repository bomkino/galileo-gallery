#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

parser = argparse.ArgumentParser(description="Finish Galileo Gallery v1.1.1 dual-theme hardening after the generated theme migration.")
parser.add_argument("--root", type=Path, default=Path.cwd())
args = parser.parse_args()
ROOT = args.root.resolve()


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, text: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)


def replace_once(path: str, old: str, new: str, label: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one {label}; found {count}")
    write(path, text.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, expected: int, label: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} {label}; found {count}")
    write(path, text.replace(old, new))


# 1. Catalogue chrome must not style nested authored Scene markup.
selector_receipt: dict[str, dict[str, int]] = {}
for path, counts in {
    "src/styles.css": {"title": 1, "meta": 1, "copy": 2},
    "src/interfacePolish.css": {"title": 1, "meta": 1, "copy": 2},
    "src/pitchdogTheme.css": {"title": 1, "meta": 1, "copy": 5},
}.items():
    replace_all(path, ".style-card strong", ".style-card > span > strong", counts["title"], "broad catalogue-title selectors")
    replace_all(path, ".style-card small", ".style-card > span > small", counts["meta"], "broad catalogue-metadata selectors")
    replace_all(path, ".style-card p", ".style-card > p", counts["copy"], "broad catalogue-copy selectors")
    selector_receipt[path] = counts

# 2. Theme control names the action it performs.
replace_once(
    "src/presentation/ThemeControl.tsx",
    '            aria-label="Dark mode"\n',
    '            aria-label={action}\n',
    "fixed theme-toggle accessible name",
)

# 3. Theme changes use one runtime event boundary, including operating-system and storage changes.
replace_once(
    "src/presentation/uiTheme.ts",
    """    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) meta.content = theme === "dark" ? "#111210" : "#f3f0e9"
    return theme
""",
    """    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) meta.content = theme === "dark" ? "#111210" : "#f3f0e9"
    window.dispatchEvent(new CustomEvent<UiTheme>(UI_THEME_EVENT, { detail: theme }))
    return theme
""",
    "central theme-change event boundary",
)
replace_once(
    "src/presentation/uiTheme.ts",
    """    applyUiTheme(theme, "stored")
    window.dispatchEvent(new CustomEvent<UiTheme>(UI_THEME_EVENT, { detail: theme }))
""",
    """    applyUiTheme(theme, "stored")
""",
    "duplicate explicit-theme event dispatch",
)

# 4. Atelier Scenes own foreground colour through their Project look, never through UI inheritance.
replace_once(
    "src/scenes/AtelierSceneRenderer.tsx",
    '        data-source-state={frame.stateHash}\n        style={{ background }}\n',
    '        data-source-state={frame.stateHash}\n        data-scene-theme={settings.theme}\n        style={{ background, color: settings.theme === "light" ? "#181917" : "#f7f4ec" }}\n',
    "Atelier Scene root style boundary",
)

# 5. Focus indicators must remain visible against both palettes, not merely exist in source.
replace_once(
    "src/pitchdogTheme.css",
    "    --pd-ui-success: #3f9b69;\n",
    "    --pd-ui-success: #3f9b69;\n    --pd-ui-focus: #9b2f22;\n",
    "light-theme focus token",
)
replace_once(
    "src/pitchdogTheme.css",
    "    --pd-ui-success: #75d49b;\n",
    "    --pd-ui-success: #75d49b;\n    --pd-ui-focus: #ff947f;\n",
    "dark-theme focus token",
)
replace_once(
    "src/pitchdogTheme.css",
    "html[data-ui-theme] body,\n",
    """html[data-ui-theme] button:focus-visible,
html[data-ui-theme] input:focus-visible,
html[data-ui-theme] select:focus-visible,
html[data-ui-theme] textarea:focus-visible,
html[data-ui-theme] summary:focus-visible {
    outline-color: var(--pd-ui-focus);
}

html[data-ui-theme] body,
""",
    "theme-specific focus indicator",
)

# 6. Strengthen the source verifier with executable first-paint scenarios and Scene-boundary assertions.
verify_path = "scripts/verify-design-system.cjs"
verify = read(verify_path)
if 'const vm = require("node:vm")\n' not in verify:
    verify = verify.replace('const path = require("node:path")\n', 'const path = require("node:path")\nconst vm = require("node:vm")\n', 1)
read_anchor = 'const theme = read("src/pitchdogTheme.css")\n'
if 'const baseStyles = read("src/styles.css")\n' not in verify:
    if verify.count(read_anchor) != 1:
        raise SystemExit("verify-design-system.cjs: theme read anchor mismatch")
    verify = verify.replace(
        read_anchor,
        read_anchor
        + 'const baseStyles = read("src/styles.css")\n'
        + 'const interfacePolish = read("src/interfacePolish.css")\n'
        + 'const atelierRenderer = read("src/scenes/AtelierSceneRenderer.tsx")\n'
        + 'const g08 = read("electron/g08-interface-smoke.cjs")\n'
        + 'const implementationStatus = read("docs/programme/IMPLEMENTATION_STATUS.md")\n',
        1,
    )
control_anchor = 'assert(themeControl.includes(\'aria-pressed={theme === "dark"}\'), "theme toggle does not expose state")\n'
source_checks = r'''assert(themeControl.includes("aria-label={action}"), "theme toggle does not name its next action")
assert(themeRuntime.includes("window.dispatchEvent(new CustomEvent<UiTheme>(UI_THEME_EVENT, { detail: theme }))"), "theme runtime does not publish system, storage, and explicit changes through one event boundary")
assert((themeRuntime.match(/window\.dispatchEvent\(new CustomEvent<UiTheme>\(UI_THEME_EVENT/g) ?? []).length === 1, "theme runtime contains duplicate change-event dispatch paths")
for (const [label, sheet] of [["base styles", baseStyles], ["interface polish", interfacePolish], ["pitch.dog theme", theme]]) {
    assert(!sheet.includes(".style-card strong"), `${label} lets catalogue typography leak into Scene strong elements`)
    assert(!sheet.includes(".style-card small"), `${label} lets catalogue typography leak into Scene small elements`)
    assert(!sheet.includes(".style-card p"), `${label} lets catalogue copy rules leak into Scene paragraphs`)
    assert(sheet.includes(".style-card > span > strong"), `${label} lacks a direct catalogue-title boundary`)
    assert(sheet.includes(".style-card > span > small"), `${label} lacks a direct catalogue-metadata boundary`)
    assert(sheet.includes(".style-card > p"), `${label} lacks a direct catalogue-copy boundary`)
}
assert(atelierRenderer.includes('data-scene-theme={settings.theme}'), "Atelier Scene theme provenance is missing")
assert(atelierRenderer.includes('color: settings.theme === "light" ? "#181917" : "#f7f4ec"'), "Atelier Scene foreground still inherits UI theme")
assert((theme.match(/--pd-ui-focus:/g) ?? []).length === 2, "both themes need an explicit focus colour")
assert(theme.includes("outline-color: var(--pd-ui-focus)"), "theme focus token is not applied to interactive controls")
assert(g08.includes("captureCatalogueSceneHashes"), "G08 does not compare every catalogue Scene across themes")
assert(g08.includes("expected 29 Scene miniatures"), "G08 does not pin the complete 29-Scene catalogue")
assert(g08.includes("focusIndicator.ratio < 3"), "G08 does not enforce non-text focus contrast")
assert(!implementationStatus.includes("Current frontier: **stable v1.0.1"), "implementation status carries a stale release frontier")
assert(!implementationStatus.includes("must be triaged before a release frontier"), "implementation status contradicts the production audit boundary")
'''
if source_checks not in verify:
    if verify.count(control_anchor) != 1:
        raise SystemExit("verify-design-system.cjs: theme-control assertion anchor mismatch")
    verify = verify.replace(control_anchor, control_anchor + source_checks, 1)

boot_anchor = 'assert(themeBoot.includes(\'has("export")\'), "first-paint bootstrap does not isolate export rendering")\n'
boot_matrix = r'''function executeThemeBoot({ stored = null, systemDark = false, search = "", storageThrows = false }) {
    const dataset = {}
    const style = {}
    const meta = {
        content: "#f3f0e9",
        setAttribute(name, value) {
            if (name === "content") this.content = value
        },
    }
    const context = {
        URLSearchParams,
        document: {
            documentElement: { dataset, style },
            querySelector(selector) {
                return selector === 'meta[name="theme-color"]' ? meta : null
            },
        },
        localStorage: {
            getItem(key) {
                if (storageThrows) throw new Error("storage unavailable")
                return key === "galileo-gallery:ui-theme:v1" ? stored : null
            },
        },
        window: {
            location: { search },
            matchMedia(query) {
                return { matches: query === "(prefers-color-scheme: dark)" && systemDark }
            },
        },
    }
    vm.runInNewContext(themeBoot, context, { filename: "public/theme-boot.js" })
    return { dataset, style, meta: meta.content }
}

for (const scenario of [
    { name: "system light", input: {}, theme: "light", source: "system", meta: "#f3f0e9" },
    { name: "system dark", input: { systemDark: true }, theme: "dark", source: "system", meta: "#111210" },
    { name: "stored light wins", input: { stored: "light", systemDark: true }, theme: "light", source: "stored", meta: "#f3f0e9" },
    { name: "stored dark wins", input: { stored: "dark" }, theme: "dark", source: "stored", meta: "#111210" },
    { name: "invalid storage falls back", input: { stored: "sepia", systemDark: true }, theme: "dark", source: "system", meta: "#111210" },
    { name: "blocked storage falls back", input: { storageThrows: true, systemDark: true }, theme: "dark", source: "system", meta: "#111210" },
    { name: "export is neutral", input: { stored: "dark", systemDark: true, search: "?export=1" }, theme: "light", source: "export-neutral", meta: "#f3f0e9", scope: "export-neutral" },
]) {
    const result = executeThemeBoot(scenario.input)
    assert(result.dataset.uiTheme === scenario.theme, `${scenario.name} resolved the wrong first-paint theme`)
    assert(result.dataset.uiThemeSource === scenario.source, `${scenario.name} resolved the wrong first-paint source`)
    assert(result.style.colorScheme === scenario.theme, `${scenario.name} resolved the wrong native colour scheme`)
    assert(result.meta === scenario.meta, `${scenario.name} resolved stale theme-colour metadata`)
    assert((result.dataset.uiThemeScope ?? null) === (scenario.scope ?? null), `${scenario.name} resolved the wrong theme scope`)
}
'''
if boot_matrix not in verify:
    if verify.count(boot_anchor) != 1:
        raise SystemExit("verify-design-system.cjs: theme boot assertion anchor mismatch")
    verify = verify.replace(boot_anchor, boot_anchor + "\n" + boot_matrix + "\n", 1)
write(verify_path, verify)

# 6. Strengthen real Electron proof: clean screenshots, broader contrast, card fit, action naming, and all 29 Scene hashes.
g08_path = "electron/g08-interface-smoke.cjs"
g08 = read(g08_path)

capture_anchor = '''async function capture(window, outputDirectory, name) {
    await settleRenderer(window)
'''
capture_replacement = '''async function capture(window, outputDirectory, name) {
    await window.webContents.executeJavaScript(`document.activeElement instanceof HTMLElement && document.activeElement.blur()`)
    await settleRenderer(window)
'''
if g08.count(capture_anchor) != 1:
    raise SystemExit("G08: screenshot capture anchor mismatch")
g08 = g08.replace(capture_anchor, capture_replacement, 1)

catalogue_metrics_anchor = '''        const scaleRoot = document.querySelector('[data-interface-scale]')
        const shell = document.querySelector('.style-gallery-shell')
        return {
'''
catalogue_metrics_replacement = '''        const scaleRoot = document.querySelector('[data-interface-scale]')
        const shell = document.querySelector('.style-gallery-shell')
        const cardFit = Array.from(document.querySelectorAll('.style-card')).map((card) => {
            const cardBox = card.getBoundingClientRect()
            const miniature = card.querySelector(':scope > .style-miniature')?.getBoundingClientRect()
            const heading = card.querySelector(':scope > span')?.getBoundingClientRect()
            const copy = card.querySelector(':scope > p')?.getBoundingClientRect()
            const inside = (box) => Boolean(box
                && box.left >= cardBox.left - 1
                && box.right <= cardBox.right + 1
                && box.top >= cardBox.top - 1
                && box.bottom <= cardBox.bottom + 1)
            return {
                id: card.dataset.styleId,
                horizontalOverflow: Math.max(0, card.scrollWidth - card.clientWidth),
                miniatureInside: inside(miniature),
                headingInside: inside(heading),
                copyInside: inside(copy),
            }
        }).filter((card) => card.horizontalOverflow > 1 || !card.miniatureInside || !card.headingInside || !card.copyInside)
        return {
'''
if g08.count(catalogue_metrics_anchor) != 1:
    raise SystemExit("G08: catalogue metrics anchor mismatch")
g08 = g08.replace(catalogue_metrics_anchor, catalogue_metrics_replacement, 1)

catalogue_return_anchor = '''            targets: {
                scaleButton: rect('.interface-scale-control button'),
                category: rect('.style-category-pills button'),
                search: rect('.style-search input'),
                scene: rect('.style-card'),
            },
'''
catalogue_return_replacement = catalogue_return_anchor + '''            cardFit,
'''
if g08.count(catalogue_return_anchor) != 1:
    raise SystemExit("G08: catalogue return anchor mismatch")
g08 = g08.replace(catalogue_return_anchor, catalogue_return_replacement, 1)

old_samples = '''        const samples = surface === 'catalogue'
            ? [
                sample('catalogue heading', '.style-gallery-header h1'),
                sample('catalogue card title', '.style-card strong'),
                sample('catalogue search', '.style-search input'),
                sample('catalogue active filter', '.style-category-pills button.is-active'),
                sample('catalogue theme control', '[data-ui-theme-toggle]'),
            ]
            : [
                sample('studio brand', '.brand-lockup strong'),
                sample('studio panel heading', '.panel-heading h2'),
                sample('studio quiet button', '.title-actions .button.quiet'),
                sample('studio primary button', '.title-actions .button.primary'),
                sample('studio select', '.inspector select'),
                sample('studio theme control', '[data-ui-theme-toggle]'),
            ]
        const toggle = document.querySelector('[data-ui-theme-toggle]').getBoundingClientRect()
'''
new_samples = '''        const samples = surface === 'catalogue'
            ? [
                sample('catalogue heading', '.style-gallery-header h1'),
                sample('catalogue introduction', '.style-gallery-header p'),
                sample('catalogue card title', '.style-card > span > strong'),
                sample('catalogue card metadata', '.style-card > span > small'),
                sample('catalogue card description', '.style-card > p'),
                sample('catalogue card profile', '.style-card > p em'),
                sample('catalogue search', '.style-search input'),
                sample('catalogue active filter', '.style-category-pills button.is-active'),
                sample('catalogue inactive filter', '.style-category-pills button:not(.is-active)'),
                sample('catalogue footer', '.style-gallery-footer'),
                sample('catalogue theme control', '[data-ui-theme-toggle]'),
            ]
            : [
                sample('studio brand', '.brand-lockup strong'),
                sample('studio subtitle', '.brand-lockup span'),
                sample('studio autosave status', '.autosave-status'),
                sample('studio panel heading', '.panel-heading h2'),
                sample('studio eyebrow', '.eyebrow'),
                sample('studio quiet button', '.title-actions .button.quiet'),
                sample('studio primary button', '.title-actions .button.primary'),
                sample('studio active workflow tab', '.inspector-top .segment button.is-active'),
                sample('studio inactive workflow tab', '.inspector-top .segment button:not(.is-active)'),
                sample('studio select', '.inspector select'),
                sample('studio export introduction', '.export-intro p'),
                sample('studio export summary label', '.export-summary span'),
                sample('studio export summary value', '.export-summary strong'),
                sample('studio theme control', '[data-ui-theme-toggle]'),
            ]
        const toggleElement = document.querySelector('[data-ui-theme-toggle]')
        toggleElement.focus({ preventScroll: true })
        const toggle = toggleElement.getBoundingClientRect()
        const toggleStyle = getComputedStyle(toggleElement)
        const focusBackground = backgroundFor(toggleElement.parentElement ?? toggleElement)
        const focusForeground = over(parse(toggleStyle.outlineColor), focusBackground)
        const focusIndicator = {
            style: toggleStyle.outlineStyle,
            width: Number.parseFloat(toggleStyle.outlineWidth) || 0,
            ratio: contrast(focusForeground, focusBackground),
            color: toggleStyle.outlineColor,
            background: focusBackground.join(','),
        }
'''
if g08.count(old_samples) != 1:
    raise SystemExit("G08: appearance sample anchor mismatch")
g08 = g08.replace(old_samples, new_samples, 1)

appearance_return_anchor = '''            togglePressed: document.querySelector('[data-ui-theme-toggle]').getAttribute('aria-pressed'),
            toggle: { left: toggle.left, top: toggle.top, right: toggle.right, bottom: toggle.bottom, width: toggle.width, height: toggle.height },
'''
appearance_return_replacement = '''            togglePressed: toggleElement.getAttribute('aria-pressed'),
            toggleLabel: toggleElement.getAttribute('aria-label'),
            toggle: { left: toggle.left, top: toggle.top, right: toggle.right, bottom: toggle.bottom, width: toggle.width, height: toggle.height },
            focusIndicator,
'''
if g08.count(appearance_return_anchor) != 1:
    raise SystemExit("G08: appearance return anchor mismatch")
g08 = g08.replace(appearance_return_anchor, appearance_return_replacement, 1)

appearance_assert_anchor = '''    if (appearance.colorScheme !== expectedTheme || appearance.togglePressed !== String(expectedTheme === 'dark')) {
        throw new Error(`${key} exposes the wrong native colour scheme or toggle state.`)
    }
'''
appearance_assert_replacement = appearance_assert_anchor + '''    const expectedAction = expectedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
    if (appearance.toggleLabel !== expectedAction) throw new Error(`${key} exposes the wrong theme-toggle action name.`)
    if (appearance.focusIndicator.style === 'none' || appearance.focusIndicator.width < 2 || appearance.focusIndicator.ratio < 3) {
        throw new Error(`${key} has an invisible or sub-3:1 focus indicator: ${JSON.stringify(appearance.focusIndicator)}`)
    }
'''
if g08.count(appearance_assert_anchor) != 1:
    raise SystemExit("G08: appearance assertion anchor mismatch")
g08 = g08.replace(appearance_assert_anchor, appearance_assert_replacement, 1)

hash_function_anchor = '''async function captureRegionHash(window, selector, inset = 0) {
    await settleRenderer(window)
    const bounds = await window.webContents.executeJavaScript(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)})
        if (!element) throw new Error('Missing capture region: ' + ${JSON.stringify(selector)})
        const box = element.getBoundingClientRect()
        const inset = ${Number(inset)}
        const left = Math.max(0, Math.floor(box.left + inset))
        const top = Math.max(0, Math.floor(box.top + inset))
        const right = Math.min(innerWidth, Math.ceil(box.right - inset))
        const bottom = Math.min(innerHeight, Math.ceil(box.bottom - inset))
        return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
    })()`)
    const image = await window.webContents.capturePage(bounds)
    const png = image.toPNG()
    return { selector, inset, bounds, bytes: png.length, sha256: sha256(png) }
}
'''
# Build the function separately to avoid nested interpolation mistakes.
all_hash_functions = hash_function_anchor + r'''
async function captureCatalogueSceneHashes(window) {
    const ids = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.style-card[data-style-id]')).map((card) => card.dataset.styleId)`)
    if (ids.length !== 29 || new Set(ids).size !== 29) throw new Error(`G08 expected 29 Scene miniatures, found ${ids.length}.`)
    const hashes = {}
    for (const id of ids) {
        const cardSelector = `.style-card[data-style-id=${JSON.stringify(id)}]`
        const visibility = await window.webContents.executeJavaScript(`(async () => {
            const card = document.querySelector(${JSON.stringify(cardSelector)})
            if (!card) throw new Error('Missing catalogue Scene card: ' + ${JSON.stringify(id)})
            card.scrollIntoView({ block: 'center', inline: 'nearest' })
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            const scene = card.querySelector('.style-miniature > :not(b)')
            if (!scene) throw new Error('Missing catalogue Scene renderer: ' + ${JSON.stringify(id)})
            const box = scene.getBoundingClientRect()
            return {
                left: box.left,
                top: box.top,
                right: box.right,
                bottom: box.bottom,
                width: box.width,
                height: box.height,
                fullyVisible: box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
            }
        })()`)
        if (!visibility.fullyVisible || visibility.width < 40 || visibility.height < 40) {
            throw new Error(`Catalogue Scene ${id} is not fully capturable: ${JSON.stringify(visibility)}`)
        }
        await settleRenderer(window)
        hashes[id] = await captureRegionHash(window, `${cardSelector} .style-miniature > :not(b)`, 1)
    }
    await resetCatalogueScroll(window)
    return hashes
}

function compareCatalogueSceneHashes(light, dark) {
    const lightIds = Object.keys(light).sort()
    const darkIds = Object.keys(dark).sort()
    if (lightIds.join(',') !== darkIds.join(',')) throw new Error('Theme Scene-isolation sets do not match.')
    return lightIds.filter((id) => light[id].sha256 !== dark[id].sha256)
}
'''
if g08.count(hash_function_anchor) != 1:
    raise SystemExit("G08: region hash function anchor mismatch")
g08 = g08.replace(hash_function_anchor, all_hash_functions, 1)

catalogue_hash_anchor = '''    const catalogueMiniatureLight = await captureRegionHash(window, '.style-miniature > :not(b)', 1)
    themeSwitches.push(await setTheme(window, 'dark'))
    captures.catalogueDark100 = await capture(window, outputDirectory, 'gallery-catalogue-dark-100')
    const catalogueMiniatureDark = await captureRegionHash(window, '.style-miniature > :not(b)', 1)
    if (captures.catalogueLight100.sha256 === captures.catalogueDark100.sha256) throw new Error('Catalogue light and dark modes are visually identical.')
    if (catalogueMiniatureLight.sha256 !== catalogueMiniatureDark.sha256) throw new Error('UI theme leaked into Scene catalogue rendering.')
'''
catalogue_hash_replacement = '''    const catalogueMiniaturesLight = await captureCatalogueSceneHashes(window)
    themeSwitches.push(await setTheme(window, 'dark'))
    captures.catalogueDark100 = await capture(window, outputDirectory, 'gallery-catalogue-dark-100')
    const catalogueMiniaturesDark = await captureCatalogueSceneHashes(window)
    const catalogueThemeLeaks = compareCatalogueSceneHashes(catalogueMiniaturesLight, catalogueMiniaturesDark)
    if (captures.catalogueLight100.sha256 === captures.catalogueDark100.sha256) throw new Error('Catalogue light and dark modes are visually identical.')
    if (catalogueThemeLeaks.length) throw new Error('UI theme leaked into Scene catalogue rendering: ' + catalogueThemeLeaks.join(', '))
'''
if g08.count(catalogue_hash_anchor) != 1:
    raise SystemExit("G08: single catalogue hash anchor mismatch")
g08 = g08.replace(catalogue_hash_anchor, catalogue_hash_replacement, 1)

fit_assert_anchor = '''            if (value.shell.scrollWidth > value.shell.clientWidth + 1) throw new Error(`${key} has horizontally clipped catalogue content.`)
            if (Object.values(value.targets).some((target) => target.height + .2 < physicalTargetFloor)) {
'''
fit_assert_replacement = '''            if (value.shell.scrollWidth > value.shell.clientWidth + 1) throw new Error(`${key} has horizontally clipped catalogue content.`)
            if (value.cardFit.length) throw new Error(`${key} has Scene-card content outside its container: ${JSON.stringify(value.cardFit)}`)
            if (Object.values(value.targets).some((target) => target.height + .2 < physicalTargetFloor)) {
'''
if g08.count(fit_assert_anchor) != 1:
    raise SystemExit("G08: catalogue fit assertion anchor mismatch")
g08 = g08.replace(fit_assert_anchor, fit_assert_replacement, 1)

receipt_anchor = '''        visualIsolation: {
            catalogue: { light: catalogueMiniatureLight, dark: catalogueMiniatureDark },
            studio: { light: stageLight, dark: stageDark },
        },
'''
receipt_replacement = '''        visualIsolation: {
            catalogue: { light: catalogueMiniaturesLight, dark: catalogueMiniaturesDark, mismatches: catalogueThemeLeaks },
            studio: { light: stageLight, dark: stageDark },
        },
'''
if g08.count(receipt_anchor) != 1:
    raise SystemExit("G08: visual isolation receipt anchor mismatch")
g08 = g08.replace(receipt_anchor, receipt_replacement, 1)
write(g08_path, g08.rstrip() + "\n")

# 7. Documentation must describe the actual all-Scene proof, not a one-card proxy.
doc_replacements = {
    "docs/releases/v1.1.1.md": [
        (
            "- Cropped Scene catalogue and studio preview pixels match exactly between Light and Dark modes, proving that interface appearance cannot alter authored Scene output.",
            "- All 29 catalogue Scene previews and the studio preview match pixel-for-pixel between Light and Dark modes, proving that interface appearance cannot alter authored Scene output.",
        ),
        (
            "- Runtime contrast, clipping, overflow, sibling overlap, popover bounds, focus, touch-target size, reload persistence, StorageEvent convergence, reduced-motion contracts, and final-action reachability verified.",
            "- Runtime text and focus-indicator contrast, clipping, overflow, sibling overlap, popover bounds, focus retention, touch-target size, reload persistence, StorageEvent convergence, reduced-motion contracts, and final-action reachability verified.",
        ),
    ],
    "docs/design-system.md": [
        (
            "The theme boundary stops at product chrome. Scene previews, catalogue miniatures, Project data, Timeline state, and export output remain theme-neutral.",
            "The theme boundary stops at product chrome. Scene previews, all 29 catalogue miniatures, Project data, Timeline state, and export output remain theme-neutral.",
        ),
        (
            "Scene-pixel isolation, keyboard navigation",
            "all-Scene pixel isolation, keyboard navigation",
        ),
        (
            "Both palettes use semantic surface, text, border, state, scrollbar, tooltip, error, and caret tokens. G08 computes runtime text contrast, proves matching geometry between modes, and compares cropped Scene pixels across Light and Dark renders.",
            "Both palettes use semantic surface, text, border, state, scrollbar, tooltip, error, caret, and focus tokens. G08 computes runtime text and focus-indicator contrast, proves matching geometry between modes, and compares every catalogue Scene plus the studio preview across Light and Dark renders.",
        ),
        (
            "minimum targets, runtime contrast, theme persistence",
            "minimum targets, runtime text and focus-indicator contrast, theme persistence",
        ),
    ],
    "CHANGELOG.md": [
        (
            "Theme-specific select carets, metadata colours, contrast verification, reload/storage convergence, and Scene-pixel isolation proof.",
            "Theme-specific select carets, metadata colours, executable first-paint scenarios, reload/storage convergence, and pixel-isolation proof across all 29 catalogue Scenes.",
        ),
        (
            "Strengthened G08 with dual-theme contrast, persistence, sibling-overlap, disclosure stability, stacked-header, clipping, reachability, and pixel-isolation assertions",
            "Strengthened G08 with dual-theme text and focus-indicator contrast, persistence, sibling-overlap, disclosure stability, stacked-header, clipping, reachability, and pixel-isolation assertions",
        ),
    ],
    "docs/programme/IMPLEMENTATION_STATUS.md": [
        (
            "The full development-tool dependency audit still reports nine high-severity advisories in pre-existing build/test transitive dependencies. They are outside the packaged production dependency graph and remain unremediated in G01A; they must be triaged before a release frontier.",
            "The full development-tool dependency audit still reports nine high-severity advisories in pre-existing build/test transitive dependencies. They are outside the packaged production dependency graph, remain recorded as tooling debt, and must be reviewed independently rather than force-upgraded through a release.",
        ),
        (
            "Current frontier: **stable v1.0.1 publication and exact published-artifact smoke**. The catalogue promotion\ncheckpoint is complete only when its immutable RC SHA passes Ubuntu, macOS, Windows, renderer, native\npackage, and release audit gates. G04 remains deferred until an exact Garuda runner is available.",
            "Release discipline: every candidate must pass Ubuntu, macOS, Windows, renderer, native-package, production-dependency, checksum, and published-artifact gates before promotion. G04 remains deferred until an exact Garuda runner is available.",
        ),
    ],
}
for path, replacements in doc_replacements.items():
    text = read(path)
    for old, new in replacements:
        if text.count(old) != 1:
            raise SystemExit(f"{path}: documentation anchor mismatch for {old!r}")
        text = text.replace(old, new, 1)
    write(path, text)

print({
    "status": "FINAL_THEME_HARDENING_APPLIED",
    "catalogueSelectorBoundaries": selector_receipt,
    "themeBootScenarios": 7,
    "catalogueSceneHashes": 29,
    "atelierForeground": "Project look owned",
})
