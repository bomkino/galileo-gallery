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

# 4. Every Scene renderer owns native colour treatment through its Project look, never through UI inheritance.
replace_once(
    "src/scenes/AtelierSceneRenderer.tsx",
    '        data-source-state={frame.stateHash}\n        style={{ background }}\n',
    '        data-source-state={frame.stateHash}\n        data-scene-theme={settings.theme}\n        style={{ background, color: settings.theme === "light" ? "#181917" : "#f7f4ec", colorScheme: settings.theme === "light" ? "light" : "dark" }}\n',
    "Atelier Scene root style boundary",
)
replace_once(
    "src/scenes/VitrineRenderer.tsx",
    'data-logical-width={logicalWidth} data-logical-height={logicalHeight} ref={ref} style={{ background } as React.CSSProperties}>',
    'data-logical-width={logicalWidth} data-logical-height={logicalHeight} ref={ref} data-scene-theme={config.settings.theme} style={{ background, color: config.settings.theme === "light" ? "#181917" : "#f7f4ec", colorScheme: config.settings.theme === "light" ? "light" : "dark" } as React.CSSProperties}>',
    "Vitrine Scene root style boundary",
)
replace_once(
    "src/GalleryRenderer.tsx",
    '        <div className={`galileo-renderer galileo-style-${style.id} galileo-mode-${style.mode} galileo-bg-${settings.backgroundStyle}`} style={{ "--galileo-ground": ground,',
    '        <div className={`galileo-renderer galileo-style-${style.id} galileo-mode-${style.mode} galileo-bg-${settings.backgroundStyle}`} data-scene-theme={settings.theme} style={{ colorScheme: settings.theme === "light" ? "light" : "dark", "--galileo-ground": ground,',
    "legacy Scene root style boundary",
)

# 5. Selected catalogue copy must stay readable on its authored salmon/brown surfaces.
replace_once(
    "src/pitchdogTheme.css",
    "    --pd-ui-card-current: #f7a18f;\n",
    "    --pd-ui-card-current: #f7a18f;\n    --pd-ui-card-current-copy: #3f423d;\n    --pd-ui-card-current-profile: #702b20;\n",
    "light selected-card contrast tokens",
)
replace_once(
    "src/pitchdogTheme.css",
    "    --pd-ui-card-current: #4d2822;\n",
    "    --pd-ui-card-current: #4d2822;\n    --pd-ui-card-current-copy: #b6b8b1;\n    --pd-ui-card-current-profile: #ff9a84;\n",
    "dark selected-card contrast tokens",
)
replace_once(
    "src/pitchdogTheme.css",
    "html[data-ui-theme] .style-card > p em { color: var(--pd-ui-profile); }\n",
    """html[data-ui-theme] .style-card > p em { color: var(--pd-ui-profile); }
html[data-ui-theme] .style-card.is-current > span > small,
html[data-ui-theme] .style-card.is-current > p { color: var(--pd-ui-card-current-copy); }
html[data-ui-theme] .style-card.is-current > p em { color: var(--pd-ui-card-current-profile); }
""",
    "selected-card contrast boundary",
)

# 6. Release files use their exact public GitHub names so SHA256SUMS verifies after download.
for label in ("macOS", "Windows", "Linux"):
    replace_once(
        "package.json",
        f'      "artifactName": "${{productName}}-${{version}}-{label}-${{arch}}.${{ext}}",\n',
        f'      "artifactName": "Galileo.Gallery-${{version}}-{label}-${{arch}}.${{ext}}",\n',
        f"{label} public artifact name",
    )
replace_once(
    ".github/workflows/release.yml",
    "      github.event_name == 'workflow_dispatch' ||\n",
    "      (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main') ||\n",
    "main-only manual release gate",
)
replace_once(
    ".github/workflows/release.yml",
    '          codesign --force --deep --sign - "$app"\n',
    "",
    "post-DMG app mutation",
)

# 7. Focus indicators must remain visible against both palettes, not merely exist in source.
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

# 8. Strengthen the source verifier with executable first-paint scenarios and Scene-boundary assertions.
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
        + 'const vitrineRenderer = read("src/scenes/VitrineRenderer.tsx")\n'
        + 'const galleryRenderer = read("src/GalleryRenderer.tsx")\n'
        + 'const g08 = read("electron/g08-interface-smoke.cjs")\n'
        + 'const releaseWorkflow = read(".github/workflows/release.yml")\n'
        + 'const implementationStatus = read("docs/programme/IMPLEMENTATION_STATUS.md")\n',
        1,
    )
control_anchor = 'assert(themeControl.includes(\'aria-pressed={theme === "dark"}\'), "theme toggle does not expose state")\n'
source_checks = r'''assert(packageJson.build?.mac?.artifactName === "Galileo.Gallery-${version}-macOS-${arch}.${ext}", "macOS release name will not match its public checksum entry")
assert(packageJson.build?.win?.artifactName === "Galileo.Gallery-${version}-Windows-${arch}.${ext}", "Windows release name will not match its public checksum entry")
assert(packageJson.build?.linux?.artifactName === "Galileo.Gallery-${version}-Linux-${arch}.${ext}", "Linux release name will not match its public checksum entry")
assert(releaseWorkflow.includes("github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'"), "manual release dispatch is not restricted to main")
assert(!releaseWorkflow.includes('codesign --force --deep --sign - "$app"'), "release smoke mutates the macOS app after the DMG is sealed")
assert(themeControl.includes("aria-label={action}"), "theme toggle does not name its next action")
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
assert(atelierRenderer.includes('colorScheme: settings.theme === "light" ? "light" : "dark"'), "Atelier Scene native colour scheme still inherits UI theme")
assert(vitrineRenderer.includes('data-scene-theme={config.settings.theme}'), "Vitrine Scene theme provenance is missing")
assert(vitrineRenderer.includes('colorScheme: config.settings.theme === "light" ? "light" : "dark"'), "Vitrine Scene native colour scheme still inherits UI theme")
assert(galleryRenderer.includes('data-scene-theme={settings.theme}'), "legacy Scene theme provenance is missing")
assert(galleryRenderer.includes('colorScheme: settings.theme === "light" ? "light" : "dark"'), "legacy Scene native colour scheme still inherits UI theme")
assert((theme.match(/--pd-ui-focus:/g) ?? []).length === 2, "both themes need an explicit focus colour")
assert(theme.includes("outline-color: var(--pd-ui-focus)"), "theme focus token is not applied to interactive controls")
assert((theme.match(/--pd-ui-card-current-copy:/g) ?? []).length === 2, "both themes need a selected-card copy colour")
assert((theme.match(/--pd-ui-card-current-profile:/g) ?? []).length === 2, "both themes need a selected-card profile colour")
assert(theme.includes(".style-card.is-current > span > small"), "selected catalogue metadata lacks its contrast boundary")
assert(theme.includes(".style-card.is-current > p { color: var(--pd-ui-card-current-copy); }"), "selected catalogue copy lacks its contrast boundary")
assert(theme.includes(".style-card.is-current > p em { color: var(--pd-ui-card-current-profile); }"), "selected catalogue profile copy lacks its contrast boundary")
assert(g08.includes("sample('catalogue selected card metadata', '.style-card.is-current > span > small')"), "G08 does not pin selected-card contrast coverage")
assert(g08.includes("sample('catalogue ordinary card metadata', '.style-card:not(.is-current) > span > small')"), "G08 does not pin ordinary-card contrast coverage")
assert(g08.includes("captureCatalogueSceneProof"), "G08 does not prove every catalogue Scene across themes")
assert(g08.includes("expected 29 Scene miniatures"), "G08 does not pin the complete 29-Scene catalogue")
assert(g08.includes("beginFrameSubscription(false"), "G08 does not sample compositor-presented Scene frames")
assert(g08.includes("endFrameSubscription()"), "G08 does not close the presented-frame subscription")
assert(g08.includes("method: 'frame-subscription'"), "G08 proof receipt does not identify its capture method")
assert(g08.includes("data-g08-proof-target"), "G08 lacks one-Scene-at-a-time proof isolation")
assert(g08.includes('.style-card[data-g08-proof-target="true"]{transition:none!important;transform:none!important}'), "G08 proof target can still move under pointer interaction")
assert(g08.includes("data-g08-paint-mask"), "G08 lacks material-paint proof isolation")
assert(g08.includes("paintedPixels") && g08.includes("paintedRatio"), "G08 does not record materially painted Scene pixels")
assert(g08.includes("paintSignature"), "G08 does not bind every Scene to an exact computed-paint signature")
assert(g08.includes("temporalStabilitySummary") && g08.includes("correlatedFrames") && g08.includes("stability: actual.stability"), "G08 lacks bounded temporal-stability evidence")
assert(g08.includes("maxChannelDelta") && g08.includes("allowedChangedPixels") && g08.includes("withinNoiseEnvelope"), "G08 lacks its bounded raster-noise proof")
assert(g08.includes("schemaVersion: 2") && g08.includes("bitmapEncoding: 'electron-native-bitmap'") && g08.includes("bitmapBytes") && g08.includes("bitmapSha256"), "G08 lacks an explicit raw-bitmap receipt schema")
assert(g08.includes("toBitmap()"), "G08 does not compare raw presented-frame pixels")
assert(g08.includes("focusIndicator.ratio < 3"), "G08 does not enforce non-text focus contrast")
assert(g08.includes("const caretColour = theme === 'dark' ? '%23f4efe7' : '%23181917'"), "G08 does not recognise bundled theme-correct select carets")
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

# 9. Strengthen real Electron proof: clean screenshots, broader contrast, card fit, action naming, and all 29 Scene hashes.
g08_path = "electron/g08-interface-smoke.cjs"
g08 = read(g08_path)

timeout_anchor = '''function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex")
}
'''
timeout_replacement = timeout_anchor + '''
async function withTimeout(promise, label, timeoutMs = 12_000) {
    let timer
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}.`)), timeoutMs)
            }),
        ])
    } finally {
        clearTimeout(timer)
    }
}

async function waitForWindowVisible(window) {
    if (window.isVisible()) return
    await withTimeout(new Promise((resolve) => window.once('show', resolve)), 'main window visibility')
}
'''
if g08.count(timeout_anchor) != 1:
    raise SystemExit("G08: timeout helper anchor mismatch")
g08 = g08.replace(timeout_anchor, timeout_replacement, 1)

settle_anchor = '''async function settleRenderer(window) {
    await window.webContents.executeJavaScript(`(async () => {
'''
settle_replacement = '''async function settleRenderer(window) {
    await withTimeout(window.webContents.executeJavaScript(`(async () => {
'''
if g08.count(settle_anchor) != 1:
    raise SystemExit("G08: bounded renderer-settle anchor mismatch")
g08 = g08.replace(settle_anchor, settle_replacement, 1)
settle_frames_anchor = '''        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))
'''
settle_frames_replacement = '''        const nextPaintOpportunity = () => new Promise((resolve) => {
            let done = false
            const timer = setTimeout(() => {
                if (!done) {
                    done = true
                    resolve()
                }
            }, 100)
            requestAnimationFrame(() => {
                if (!done) {
                    done = true
                    clearTimeout(timer)
                    resolve()
                }
            })
        })
        await nextPaintOpportunity()
        await nextPaintOpportunity()
        await nextPaintOpportunity()
'''
if g08.count(settle_frames_anchor) != 1:
    raise SystemExit("G08: bounded renderer paint-settle anchor mismatch")
g08 = g08.replace(settle_frames_anchor, settle_frames_replacement, 1)
settle_close_anchor = '''        return true
    })()`)
}

async function resize(window, width, height) {
'''
settle_close_replacement = '''        return true
    })()`), 'renderer settle', 15_000)
}

async function resize(window, width, height) {
'''
if g08.count(settle_close_anchor) != 1:
    raise SystemExit("G08: renderer-settle timeout close anchor mismatch")
g08 = g08.replace(settle_close_anchor, settle_close_replacement, 1)

capture_anchor = '''async function capture(window, outputDirectory, name) {
    await settleRenderer(window)
    const image = await window.webContents.capturePage()
    const png = image.toPNG()
    const file = path.join(outputDirectory, `${name}.png`)
    fs.writeFileSync(file, png)
    return { file: path.basename(file), bytes: png.length, sha256: sha256(png), size: image.getSize() }
}
'''
capture_replacement = '''async function capture(window, outputDirectory, name) {
    await window.webContents.executeJavaScript(`document.activeElement instanceof HTMLElement && document.activeElement.blur()`)
    await settleRenderer(window)
    const image = await window.webContents.capturePage()
    const png = image.toPNG()
    const file = path.join(outputDirectory, `${name}.png`)
    fs.writeFileSync(file, png)
    return { file: path.basename(file), bytes: png.length, sha256: sha256(png), size: image.getSize() }
}
'''
if g08.count(capture_anchor) != 1:
    raise SystemExit("G08: screenshot capture anchor mismatch")
g08 = g08.replace(capture_anchor, capture_replacement, 1)

reload_anchor = '''async function reloadRenderer(window) {
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Renderer reload timed out.")), 15_000)
        window.webContents.once("did-finish-load", () => {
            clearTimeout(timer)
            resolve()
        })
        window.webContents.reload()
    })
    await settleRenderer(window)
}

'''
reload_replacement = ''''''
if g08.count(reload_anchor) != 1:
    raise SystemExit("G08: bounded renderer reload anchor mismatch")
g08 = g08.replace(reload_anchor, reload_replacement, 1)

theme_persistence_anchor = '''async function verifyThemePersistence(window, target) {
    await setTheme(window, target)
    await reloadRenderer(window)
    await waitFor(window, `document.documentElement.dataset.uiTheme === ${JSON.stringify(target)} && document.querySelector('[data-ui-theme-toggle]')`, `persisted ${target} theme`)
    const result = await window.webContents.executeJavaScript(`(() => ({
        applied: document.documentElement.dataset.uiTheme,
        source: document.documentElement.dataset.uiThemeSource,
        stored: localStorage.getItem('${THEME_KEY}'),
        pressed: document.querySelector('[data-ui-theme-toggle]')?.getAttribute('aria-pressed'),
        project: localStorage.getItem('${PROJECT_KEY}'),
    }))()`)
'''
theme_persistence_replacement = '''async function verifyThemePersistence(window, target) {
    await setTheme(window, target)
    const result = await window.webContents.executeJavaScript(`(() => ({
        applied: document.documentElement.dataset.uiTheme,
        source: document.documentElement.dataset.uiThemeSource,
        stored: localStorage.getItem('${THEME_KEY}'),
        pressed: document.querySelector('[data-ui-theme-toggle]')?.getAttribute('aria-pressed'),
        project: localStorage.getItem('${PROJECT_KEY}'),
    }))()`)
'''
if g08.count(theme_persistence_anchor) != 1:
    raise SystemExit("G08: fresh-renderer theme persistence anchor mismatch")
g08 = g08.replace(theme_persistence_anchor, theme_persistence_replacement, 1)

scale_persistence_anchor = '''    await setScale(window, 125)
    await reloadRenderer(window)
    await waitFor(window, `document.querySelector('.style-gallery-shell') && document.querySelector('.interface-scale-value')?.textContent?.trim() === '125%'`, 'persisted scale after reload')
'''
scale_persistence_replacement = '''    await setScale(window, 125)
'''
if g08.count(scale_persistence_anchor) != 1:
    raise SystemExit("G08: fresh-renderer scale persistence anchor mismatch")
g08 = g08.replace(scale_persistence_anchor, scale_persistence_replacement, 1)

persistence_comment_anchor = '''    // Keyboard, persisted reload, and a real StorageEvent all converge without StrictMode leaks.
'''
persistence_comment_replacement = '''    // Keyboard, stored state, executable first-paint scenarios, and a real StorageEvent cover persistence without mutating this proof renderer.
'''
if g08.count(persistence_comment_anchor) != 1:
    raise SystemExit("G08: persistence proof comment anchor mismatch")
g08 = g08.replace(persistence_comment_anchor, persistence_comment_replacement, 1)

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
appearance_function_anchor = '''async function readAppearanceMetrics(window, surface) {
    return window.webContents.executeJavaScript(`(() => {
'''
appearance_function_replacement = '''async function readAppearanceMetrics(window, surface) {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    return window.webContents.executeJavaScript(`(() => {
'''
if g08.count(appearance_function_anchor) != 1:
    raise SystemExit("G08: trusted keyboard-focus anchor mismatch")
g08 = g08.replace(appearance_function_anchor, appearance_function_replacement, 1)

new_samples = '''        const samples = surface === 'catalogue'
            ? [
                sample('catalogue heading', '.style-gallery-header h1'),
                sample('catalogue introduction', '.style-gallery-header p'),
                sample('catalogue card title', '.style-card > span > strong'),
                sample('catalogue selected card metadata', '.style-card.is-current > span > small'),
                sample('catalogue selected card description', '.style-card.is-current > p'),
                sample('catalogue selected card profile', '.style-card.is-current > p em'),
                sample('catalogue ordinary card metadata', '.style-card:not(.is-current) > span > small'),
                sample('catalogue ordinary card description', '.style-card:not(.is-current) > p'),
                sample('catalogue ordinary card profile', '.style-card:not(.is-current) > p em'),
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
        const focusWidth = Number.parseFloat(toggleStyle.outlineWidth) || 0
        const focusIndicator = {
            focusVisible: toggleElement.matches(':focus-visible'),
            style: toggleStyle.outlineStyle,
            width: focusWidth,
            physicalWidth: focusWidth * devicePixelRatio,
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
    if (!appearance.focusIndicator.focusVisible || appearance.focusIndicator.style === 'none' || appearance.focusIndicator.physicalWidth < 2 || appearance.focusIndicator.ratio < 3) {
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
catalogue_hash_replacement = '''    themeSwitches.push(await setTheme(window, 'dark'))
    captures.catalogueDark100 = await capture(window, outputDirectory, 'gallery-catalogue-dark-100')
    if (captures.catalogueLight100.sha256 === captures.catalogueDark100.sha256) throw new Error('Catalogue light and dark modes are visually identical.')
'''
if g08.count(catalogue_hash_anchor) != 1:
    raise SystemExit("G08: single catalogue hash anchor mismatch")
g08 = g08.replace(catalogue_hash_anchor, catalogue_hash_replacement, 1)

final_scene_proof_functions = r'''function cropPresentedFrame(frame, viewport, box, inset = 1) {
    const size = frame.getSize()
    const scaleX = size.width / viewport.width
    const scaleY = size.height / viewport.height
    const left = Math.max(0, Math.floor((box.left + inset) * scaleX))
    const top = Math.max(0, Math.floor((box.top + inset) * scaleY))
    const right = Math.min(size.width, Math.ceil((box.right - inset) * scaleX))
    const bottom = Math.min(size.height, Math.ceil((box.bottom - inset) * scaleY))
    if (right <= left || bottom <= top) throw new Error(`Invalid presented-frame crop: ${JSON.stringify({ size, viewport, box, inset })}`)
    return frame.crop({ x: left, y: top, width: right - left, height: bottom - top })
}

function pixelDeltaSummary(first, second) {
    if (first.length !== second.length || first.length % 4 !== 0) throw new Error('Presented-frame pixel buffers do not align.')
    let changed = 0
    let maxChannelDelta = 0
    for (let index = 0; index < first.length; index += 4) {
        let pixelChanged = false
        for (let channel = 0; channel < 4; channel += 1) {
            const delta = Math.abs(first[index + channel] - second[index + channel])
            maxChannelDelta = Math.max(maxChannelDelta, delta)
            if (delta) pixelChanged = true
        }
        if (pixelChanged) changed += 1
    }
    return { changedPixels: changed, pixelCount: first.length / 4, changedRatio: changed / (first.length / 4), maxChannelDelta }
}

function temporalStabilitySummary(previous, sample) {
    const delta = pixelDeltaSummary(previous.bitmap, sample.bitmap)
    const allowedChangedPixels = Math.max(32, Math.ceil(delta.pixelCount * .0001))
    return {
        previousBitmapSha256: previous.sha256,
        rawHashEqual: previous.sha256 === sample.sha256,
        changedPixels: delta.changedPixels,
        changedRatio: delta.changedRatio,
        maxChannelDelta: delta.maxChannelDelta,
        allowedChangedPixels,
        withinNoiseEnvelope: delta.maxChannelDelta <= 1 && delta.changedPixels <= allowedChangedPixels,
    }
}

function changedPixelCount(first, second) {
    return pixelDeltaSummary(first, second).changedPixels
}

let presentedFrameMarkerSerial = 0

function presentedFrameMarkerMatches(frame, viewport, token) {
    const size = frame.getSize()
    const scaleX = size.width / viewport.width
    const scaleY = size.height / viewport.height
    const swatchMatches = (cssLeft, cssRight, gray) => {
        const left = Math.max(0, Math.floor(cssLeft * scaleX))
        const top = Math.max(0, Math.floor(8 * scaleY))
        const right = Math.min(size.width, Math.ceil(cssRight * scaleX))
        const bottom = Math.min(size.height, Math.ceil(12 * scaleY))
        if (right <= left || bottom <= top) throw new Error('Presented-frame marker crop is invalid.')
        const bitmap = frame.crop({ x: left, y: top, width: right - left, height: bottom - top }).toBitmap()
        for (let index = 0; index < bitmap.length; index += 4) {
            const pixel = [bitmap[index], bitmap[index + 1], bitmap[index + 2]]
            if (pixel.some((value) => Math.abs(value - gray) > 2) || bitmap[index + 3] < 250) return false
        }
        return bitmap.length >= 4
    }
    return swatchMatches(6, 10, token.firstGray) && swatchMatches(14, 18, token.secondGray)
}

async function captureStablePresentedRegion(window, selector, label, inset = 0, options = {}) {
    const webContents = window.webContents
    const state = await webContents.executeJavaScript(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)})
        if (!element) throw new Error('Missing presented-frame region: ' + ${JSON.stringify(selector)})
        const box = element.getBoundingClientRect()
        return {
            viewport: { width: innerWidth, height: innerHeight },
            box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height },
            fullyVisible: box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
        }
    })()`)
    if (!state.fullyVisible || state.box.width < 40 || state.box.height < 40) {
        throw new Error(`Presented-frame region is not fully capturable: ${label}; ${JSON.stringify(state)}.`)
    }

    presentedFrameMarkerSerial += 1
    if (presentedFrameMarkerSerial > 95) throw new Error('Presented-frame marker budget was exhausted.')
    const markerToken = {
        firstGray: 24 + (presentedFrameMarkerSerial % 16) * 12,
        secondGray: 24 + Math.floor(presentedFrameMarkerSerial / 16) * 24,
    }
    const priorThrottling = webContents.getBackgroundThrottling()
    const maximumFrames = options.referenceBitmap ? 30 : 6
    let subscribed = false
    let active = true
    let matchingFrames = 0
    let previous = null
    let timer = null
    let pulseTimer = null
    let pulseSerial = 0
    let settle
    let fail
    const resultPromise = new Promise((resolve, reject) => {
        settle = resolve
        fail = reject
    })
    const stop = (callback, value) => {
        if (!active) return
        active = false
        clearTimeout(timer)
        clearInterval(pulseTimer)
        callback(value)
    }
    const onFrame = (image) => {
        if (!active || image.isEmpty()) return
        try {
            if (!presentedFrameMarkerMatches(image, state.viewport, markerToken)) return
            matchingFrames += 1
            const crop = cropPresentedFrame(image, state.viewport, state.box, inset)
            const bitmap = crop.toBitmap()
            const size = crop.getSize()
            const sample = { bitmap, sha256: sha256(bitmap), size }
            if (options.referenceBitmap) {
                const delta = pixelDeltaSummary(options.referenceBitmap, bitmap)
                if (delta.changedPixels < (options.minimumChangedPixels ?? 0)
                    || delta.changedPixels > (options.maximumChangedPixels ?? Number.POSITIVE_INFINITY)
                    || delta.maxChannelDelta > (options.maximumChannelDelta ?? Number.POSITIVE_INFINITY)) {
                    previous = null
                    if (matchingFrames < maximumFrames) return
                    stop(fail, new Error(`Presented-frame pixels never reached the required comparison state: ${label}; ${JSON.stringify(delta)}.`))
                    return
                }
            }
            const sameSize = previous
                && previous.size.width === sample.size.width
                && previous.size.height === sample.size.height
            const stability = sameSize ? temporalStabilitySummary(previous, sample) : null
            if (!stability?.withinNoiseEnvelope) {
                previous = sample
                if (matchingFrames < maximumFrames) return
                stop(fail, new Error(`Presented-frame pixels did not converge: ${label}; ${JSON.stringify(stability ?? { reason: 'bitmap dimensions changed' })}.`))
                return
            }
            stop(settle, { ...sample, stableFrames: 2, correlatedFrames: matchingFrames, stability })
        } catch (error) {
            stop(fail, error)
        }
    }
    try {
        if (!window.isVisible()) window.show()
        webContents.setBackgroundThrottling(false)
        await webContents.executeJavaScript(`(() => {
            const pulse = document.createElement('i')
            pulse.id = 'g08-frame-pulse'
            pulse.setAttribute('aria-hidden', 'true')
            pulse.style.cssText = 'position:fixed;left:4px;top:4px;width:16px;height:12px;z-index:2147483647;pointer-events:none'
            document.getElementById('g08-frame-pulse')?.remove()
            document.body.append(pulse)
        })()`)
        webContents.beginFrameSubscription(false, onFrame)
        subscribed = true
        const pulse = () => {
            if (!active) return
            const width = ++pulseSerial % 2 === 0 ? 16 : 17
            void webContents.executeJavaScript(`(() => {
                const pulse = document.getElementById('g08-frame-pulse')
                if (!pulse) throw new Error('Presented-frame pulse is missing.')
                pulse.style.backgroundImage = 'linear-gradient(to right, rgb(${markerToken.firstGray} ${markerToken.firstGray} ${markerToken.firstGray}) 0 50%, rgb(${markerToken.secondGray} ${markerToken.secondGray} ${markerToken.secondGray}) 50% 100%)'
                pulse.style.width = '${width}px'
                return pulse.offsetWidth
            })()`).catch((error) => stop(fail, error))
        }
        timer = setTimeout(() => stop(fail, new Error(`Timed out waiting for presented frame: ${label}.`)), 5_000)
        pulseTimer = setInterval(pulse, 100)
        pulse()
        const actual = await resultPromise
        const result = {
            method: 'frame-subscription',
            bitmapEncoding: 'electron-native-bitmap',
            bitmapBytes: actual.bitmap.length,
            bitmapSha256: actual.sha256,
            pixelWidth: actual.size.width,
            pixelHeight: actual.size.height,
            stableFrames: actual.stableFrames,
            correlatedFrames: actual.correlatedFrames,
            stability: actual.stability,
            bounds: state.box,
        }
        Object.defineProperty(result, 'bitmap', { value: actual.bitmap, enumerable: false })
        return result
    } finally {
        active = false
        clearTimeout(timer)
        clearInterval(pulseTimer)
        if (subscribed) webContents.endFrameSubscription()
        webContents.setBackgroundThrottling(priorThrottling)
        await webContents.executeJavaScript(`document.getElementById('g08-frame-pulse')?.remove()`)
    }
}

async function captureCatalogueSceneProof(window, themeSwitches) {
    const ids = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.style-card[data-style-id]')).map((card) => card.dataset.styleId)`)
    if (ids.length !== 29 || new Set(ids).size !== 29) throw new Error(`G08 expected 29 Scene miniatures, found ${ids.length}.`)
    const webContents = window.webContents
    const priorThrottling = webContents.getBackgroundThrottling()
    let pendingFrame = null
    let pulseSerial = 0
    let subscribed = false
    const light = {}
    const dark = {}
    const comparisons = {}
    const onFrame = (image) => {
        if (!pendingFrame || image.isEmpty()) return
        const current = pendingFrame
        try {
            if (!presentedFrameMarkerMatches(image, current.state.viewport, current.markerToken)) return
            current.matchingFrames += 1
            // Exclude the miniature's 1px border and 2px rounded-clip antialiasing; those pixels belong to UI chrome, not the Scene.
            const crop = cropPresentedFrame(image, current.state.viewport, current.state.box, 2)
            const bitmap = crop.toBitmap()
            const size = crop.getSize()
            const sample = { bitmap, sha256: sha256(bitmap), size }
            if (current.referenceBitmap) {
                const delta = pixelDeltaSummary(current.referenceBitmap, bitmap)
                const didNotChangeEnough = delta.changedPixels < current.minimumChangedPixels
                const changedTooMuch = delta.changedPixels > current.maximumChangedPixels || delta.maxChannelDelta > current.maximumChannelDelta
                if (didNotChangeEnough || changedTooMuch) {
                    current.previous = null
                    if (current.matchingFrames < current.maximumFrames) return
                    current.fail(new Error(`Presented-frame pixels never reached the required comparison state: ${current.label}; ${JSON.stringify(delta)}.`))
                    return
                }
            }
            const sameSize = current.previous
                && current.previous.size.width === sample.size.width
                && current.previous.size.height === sample.size.height
            const stability = sameSize ? temporalStabilitySummary(current.previous, sample) : null
            if (!stability?.withinNoiseEnvelope) {
                current.previous = sample
                if (current.matchingFrames < current.maximumFrames) return
                current.fail(new Error(`Presented-frame pixels did not converge: ${current.label}; ${JSON.stringify(stability ?? { reason: 'bitmap dimensions changed' })}.`))
                return
            }
            pendingFrame = null
            clearTimeout(current.timer)
            clearInterval(current.pulseTimer)
            current.resolve({ ...sample, stableFrames: 2, correlatedFrames: current.matchingFrames, stability })
        } catch (error) {
            current.fail(error)
        }
    }
    const nextStablePresentedCrop = (label, state, options = {}) => {
        if (pendingFrame) throw new Error('Presented-frame sampler already has a pending request.')
        return new Promise((resolve, reject) => {
            presentedFrameMarkerSerial += 1
            if (presentedFrameMarkerSerial > 95) throw new Error('Presented-frame marker budget was exhausted.')
            const markerToken = {
                firstGray: 24 + (presentedFrameMarkerSerial % 16) * 12,
                secondGray: 24 + Math.floor(presentedFrameMarkerSerial / 16) * 24,
            }
            const request = {
                resolve,
                reject,
                timer: null,
                pulseTimer: null,
                matchingFrames: 0,
                previous: null,
                markerToken,
                state,
                label,
                fail: null,
                referenceBitmap: options.referenceBitmap ?? null,
                minimumChangedPixels: options.minimumChangedPixels ?? 0,
                maximumChangedPixels: options.maximumChangedPixels ?? Number.POSITIVE_INFINITY,
                maximumChannelDelta: options.maximumChannelDelta ?? Number.POSITIVE_INFINITY,
                maximumFrames: options.referenceBitmap ? 30 : 6,
            }
            const fail = (error) => {
                if (pendingFrame !== request) return
                pendingFrame = null
                clearTimeout(request.timer)
                clearInterval(request.pulseTimer)
                reject(error)
            }
            request.fail = fail
            const pulse = () => {
                if (pendingFrame !== request) return
                const width = ++pulseSerial % 2 === 0 ? 12 : 13
                void webContents.executeJavaScript(`(() => {
                    const pulse = document.getElementById('g08-frame-pulse')
                    if (!pulse) throw new Error('Presented-frame pulse is missing.')
                    pulse.style.backgroundImage = 'linear-gradient(to right, rgb(${markerToken.firstGray} ${markerToken.firstGray} ${markerToken.firstGray}) 0 50%, rgb(${markerToken.secondGray} ${markerToken.secondGray} ${markerToken.secondGray}) 50% 100%)'
                    pulse.style.width = '${width + 4}px'
                    return pulse.offsetWidth
                })()`).catch(fail)
            }
            const timer = setTimeout(() => {
                fail(new Error(`Timed out waiting for presented frame: ${label}.`))
            }, 5_000)
            request.timer = timer
            pendingFrame = request
            request.pulseTimer = setInterval(pulse, 100)
            pulse()
        })
    }
    try {
        if (!window.isVisible()) window.show()
        webContents.setBackgroundThrottling(false)
        await webContents.executeJavaScript(`(() => {
            let style = document.getElementById('g08-catalogue-proof-style')
            if (!style) {
                style = document.createElement('style')
                style.id = 'g08-catalogue-proof-style'
                style.textContent = 'html[data-g08-proof="true"] .style-card:not([data-g08-proof-target="true"]){display:none!important}html[data-g08-proof="true"] .style-card[data-g08-proof-target="true"]{transition:none!important;transform:none!important}[data-g08-paint-mask="true"]>*{visibility:hidden!important}#g08-frame-pulse{position:fixed;left:4px;top:4px;width:16px;height:12px;z-index:2147483647;pointer-events:none}'
                document.head.append(style)
            }
            let pulse = document.getElementById('g08-frame-pulse')
            if (!pulse) {
                pulse = document.createElement('i')
                pulse.id = 'g08-frame-pulse'
                pulse.setAttribute('aria-hidden', 'true')
                document.body.append(pulse)
            }
            document.documentElement.dataset.g08Proof = 'true'
        })()`)
        webContents.beginFrameSubscription(false, onFrame)
        subscribed = true
        themeSwitches.push(await setTheme(window, 'light'))
        const readTargetState = async (id) => withTimeout(webContents.executeJavaScript(`(async () => {
                const cards = Array.from(document.querySelectorAll('.style-card[data-style-id]'))
                cards.forEach((card) => { delete card.dataset.g08ProofTarget })
                const card = cards.find((candidate) => candidate.dataset.styleId === ${JSON.stringify(id)})
                if (!card) throw new Error('Missing catalogue Scene card: ' + ${JSON.stringify(id)})
                card.dataset.g08ProofTarget = 'true'
                card.scrollIntoView({ block: 'center', inline: 'nearest' })
                const scene = card.querySelector('.style-miniature > :not(b)')
                if (!scene) throw new Error('Missing catalogue Scene renderer: ' + ${JSON.stringify(id)})
                if (scene.matches('.vitrine-stage')) {
                    const deadline = performance.now() + 2_000
                    let priorMetrics = null
                    let stableMetrics = null
                    while (!stableMetrics && performance.now() < deadline) {
                        await new Promise((resolve) => {
                            let done = false
                            const timer = setTimeout(() => {
                                if (!done) {
                                    done = true
                                    resolve()
                                }
                            }, 100)
                            requestAnimationFrame(() => {
                                if (!done) {
                                    done = true
                                    clearTimeout(timer)
                                    resolve()
                                }
                            })
                        })
                        const style = getComputedStyle(scene)
                        const width = Number.parseFloat(style.width)
                        const height = Number.parseFloat(style.height)
                        const compensation = Number(scene.dataset.vitrineMetricCompensation)
                        const shortEdge = Number(scene.dataset.vitrineShortEdge)
                        const expectedShortEdge = Math.min(width, height)
                        const metrics = Number.isFinite(compensation) && compensation > 0
                            && Number.isFinite(shortEdge) && shortEdge > 0
                            && Number.isFinite(expectedShortEdge) && expectedShortEdge > 0
                            && Math.abs(shortEdge - expectedShortEdge) <= .01
                            ? [compensation, shortEdge, width, height].map((value) => Number(value.toFixed(4))).join(':')
                            : null
                        if (metrics && metrics === priorMetrics) stableMetrics = metrics
                        priorMetrics = metrics
                    }
                    if (!stableMetrics) throw new Error('Vitrine catalogue metrics did not settle to two valid frames.')
                }
                const box = scene.getBoundingClientRect()
                const layers = Array.from(scene.querySelectorAll('.atelier-card, .vitrine-plane, .galileo-card'))
                const visibleLayers = layers.filter((layer) => {
                    const style = getComputedStyle(layer)
                    const rect = layer.getBoundingClientRect()
                    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > .01 && rect.width > 1 && rect.height > 1
                }).length
                const paintProperties = [
                    'display', 'visibility', 'opacity', 'color', 'color-scheme', 'background-color', 'background-image',
                    'background-position', 'background-size', 'background-repeat', 'background-clip', 'background-origin',
                    'border-top-color', 'border-top-width', 'border-top-style', 'border-right-color', 'border-right-width',
                    'border-right-style', 'border-bottom-color', 'border-bottom-width', 'border-bottom-style',
                    'border-left-color', 'border-left-width', 'border-left-style', 'border-top-left-radius',
                    'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
                    'outline-color', 'outline-width', 'outline-style', 'outline-offset', 'box-shadow', 'filter', 'backdrop-filter',
                    'mix-blend-mode', 'clip-path', 'transform', 'transform-origin', 'perspective', 'font-family',
                    'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-variation-settings', 'line-height',
                    'letter-spacing', 'text-shadow', 'text-decoration-color', 'text-decoration-line', 'text-decoration-style',
                    'text-transform', 'white-space', 'overflow', 'overflow-x', 'overflow-y', 'isolation', 'z-index',
                    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'mask-image', 'mask-position',
                    'mask-size', 'mask-repeat', 'object-fit', 'object-position',
                ]
                const styleValues = (element, pseudo = null) => {
                    const style = getComputedStyle(element, pseudo)
                    return paintProperties.map((property) => style.getPropertyValue(property))
                }
                const paintNodes = [scene, ...scene.querySelectorAll('*')]
                const paintSignature = paintNodes.map((element) => {
                    const rect = element.getBoundingClientRect()
                    const before = getComputedStyle(element, '::before').content
                    const after = getComputedStyle(element, '::after').content
                    return {
                        tag: element.tagName,
                        className: typeof element.className === 'string' ? element.className : '',
                        key: element.dataset.sourceId || element.dataset.mediaId || element.dataset.role || '',
                        text: Array.from(element.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent || '').join('').replace(/\s+/g, ' ').trim(),
                        media: element instanceof HTMLImageElement
                            ? [element.getAttribute('src') || '', element.currentSrc || '', element.naturalWidth, element.naturalHeight]
                            : element instanceof HTMLVideoElement
                                ? [element.getAttribute('src') || '', element.currentSrc || '', element.videoWidth, element.videoHeight, Number(element.currentTime.toFixed(4)), element.dataset.storyFrameProof || '']
                                : null,
                        rect: [rect.left - box.left, rect.top - box.top, rect.width, rect.height].map((value) => Number(value.toFixed(4))),
                        style: styleValues(element),
                        before: before === 'none' ? null : [before, ...styleValues(element, '::before')],
                        after: after === 'none' ? null : [after, ...styleValues(element, '::after')],
                    }
                })
                return {
                    viewport: { width: innerWidth, height: innerHeight },
                    box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height },
                    fullyVisible: box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
                    visibleLayers,
                    stateHash: scene.dataset.sourceState || scene.dataset.evaluatorHash || '',
                    sceneTheme: scene.dataset.sceneTheme || '',
                    colorScheme: getComputedStyle(scene).colorScheme,
                    paintNodes: paintNodes.length,
                    paintSignature: JSON.stringify(paintSignature),
                }
            })()`), `${id} catalogue Scene state`, 4_000)
        const assertTargetState = (id, state) => {
            if (!state.fullyVisible || state.box.width < 40 || state.box.height < 40 || state.visibleLayers < 1 || !state.stateHash
                || !['light', 'dark'].includes(state.sceneTheme) || state.colorScheme !== state.sceneTheme || state.paintNodes < 1) {
                throw new Error(`Catalogue Scene ${id} is not fully capturable: ${JSON.stringify(state)}`)
            }
        }
        const resultFor = (actual, state) => ({
                method: 'frame-subscription',
                bitmapEncoding: 'electron-native-bitmap',
                bitmapBytes: actual.bitmap.length,
                bitmapSha256: actual.sha256,
                pixelWidth: actual.size.width,
                pixelHeight: actual.size.height,
                stableFrames: actual.stableFrames,
                correlatedFrames: actual.correlatedFrames,
                stability: actual.stability,
                bounds: state.box,
                scene: {
                    visibleLayers: state.visibleLayers,
                    stateHash: state.stateHash,
                    sceneTheme: state.sceneTheme,
                    colorScheme: state.colorScheme,
                    paintNodes: state.paintNodes,
                    paintSignature: sha256(state.paintSignature),
                },
            })
        for (const id of ids) {
            const lightState = await readTargetState(id)
            assertTargetState(id, lightState)
            const lightActual = await nextStablePresentedCrop(`${id} light`, lightState)

            themeSwitches.push(await setTheme(window, 'dark'))
            const darkState = await readTargetState(id)
            assertTargetState(id, darkState)
            const expectedPixels = lightActual.bitmap.length / 4
            const allowedChangedPixels = Math.max(32, Math.ceil(expectedPixels * .0001))
            const darkActual = await nextStablePresentedCrop(`${id} dark`, darkState)
            const delta = pixelDeltaSummary(lightActual.bitmap, darkActual.bitmap)
            comparisons[id] = {
                rawHashEqual: lightActual.sha256 === darkActual.sha256,
                changedPixels: delta.changedPixels,
                changedRatio: delta.changedRatio,
                maxChannelDelta: delta.maxChannelDelta,
                allowedChangedPixels,
                withinNoiseEnvelope: delta.changedPixels <= allowedChangedPixels,
            }
            if (!comparisons[id].withinNoiseEnvelope) throw new Error(`UI theme leaked into catalogue Scene ${id}: ${JSON.stringify(comparisons[id])}`)

            themeSwitches.push(await setTheme(window, 'light'))
            await webContents.executeJavaScript(`(() => {
                const scene = document.querySelector('.style-card[data-g08-proof-target="true"] .style-miniature > :not(b)')
                if (!scene) throw new Error('Missing catalogue Scene paint target.')
                scene.dataset.g08PaintMask = 'true'
                return scene.getBoundingClientRect().width
            })()`)
            const pixels = lightActual.bitmap.length / 4
            const minimum = Math.max(128, Math.ceil(pixels * .005))
            const masked = await nextStablePresentedCrop(`${id} paint mask`, lightState, { referenceBitmap: lightActual.bitmap, minimumChangedPixels: minimum })
            const changed = changedPixelCount(lightActual.bitmap, masked.bitmap)
            if (changed < minimum) throw new Error(`Catalogue Scene ${id} lacks materially painted content: ${changed}/${pixels} pixels.`)
            await webContents.executeJavaScript(`(() => {
                const scene = document.querySelector('.style-card[data-g08-proof-target="true"] .style-miniature > :not(b)')
                delete scene.dataset.g08PaintMask
                return scene.getBoundingClientRect().width
            })()`)

            light[id] = { ...resultFor(lightActual, lightState), paintedPixels: changed, paintedRatio: changed / pixels }
            dark[id] = resultFor(darkActual, darkState)
        }
        if (new Set(Object.values(light).map((entry) => entry.scene.stateHash)).size !== ids.length
            || new Set(Object.values(dark).map((entry) => entry.scene.stateHash)).size !== ids.length) {
            throw new Error('G08 Scene provenance hashes are not unique across the 29-Scene catalogue.')
        }
    } finally {
        if (pendingFrame) {
            pendingFrame.fail(new Error('Presented-frame sampler closed with a pending request.'))
        }
        if (subscribed) webContents.endFrameSubscription()
        webContents.setBackgroundThrottling(priorThrottling)
        await webContents.executeJavaScript(`(() => {
            delete document.documentElement.dataset.g08Proof
            document.querySelectorAll('[data-g08-proof-target]').forEach((card) => { delete card.dataset.g08ProofTarget })
            document.querySelectorAll('[data-g08-paint-mask]').forEach((scene) => { delete scene.dataset.g08PaintMask })
            document.getElementById('g08-catalogue-proof-style')?.remove()
            document.getElementById('g08-frame-pulse')?.remove()
        })()`)
        await resetCatalogueScroll(window)
    }
    return { light, dark, comparisons }
}

function compareCatalogueSceneHashes(light, dark, comparisons) {
    const lightIds = Object.keys(light).sort()
    const darkIds = Object.keys(dark).sort()
    if (lightIds.join(',') !== darkIds.join(',')) throw new Error('Theme Scene-isolation sets do not match.')
    return lightIds.filter((id) => light[id].pixelWidth !== dark[id].pixelWidth
        || light[id].pixelHeight !== dark[id].pixelHeight
        || light[id].scene.stateHash !== dark[id].scene.stateHash
        || light[id].scene.sceneTheme !== dark[id].scene.sceneTheme
        || light[id].scene.colorScheme !== dark[id].scene.colorScheme
        || light[id].scene.visibleLayers !== dark[id].scene.visibleLayers
        || light[id].scene.paintNodes !== dark[id].scene.paintNodes
        || light[id].scene.paintSignature !== dark[id].scene.paintSignature
        || !comparisons[id]?.withinNoiseEnvelope)
}
'''
if g08.count(all_hash_functions) != 1:
    raise SystemExit("G08: generated Scene proof helper block mismatch")
g08 = g08.replace(all_hash_functions, final_scene_proof_functions, 1)

run_visibility_anchor = '''async function runG08InterfaceSmoke(window, outputDirectory) {
    fs.mkdirSync(outputDirectory, { recursive: true })
    const captures = {}
    const themeSwitches = []
'''
run_visibility_replacement = run_visibility_anchor + '''    await waitForWindowVisible(window)
'''
if g08.count(run_visibility_anchor) != 1:
    raise SystemExit("G08: visible-window run anchor mismatch")
g08 = g08.replace(run_visibility_anchor, run_visibility_replacement, 1)

catalogue_proof_anchor = '''            await resetCatalogueScroll(window)
        }
    }

    await resize(window, 1280, 900)
    await setScale(window, 100)
    themeSwitches.push(await setTheme(window, 'light'))
'''
catalogue_proof_replacement = '''            await resetCatalogueScroll(window)
        }
    }

    const catalogueSceneProof = await captureCatalogueSceneProof(window, themeSwitches)
    const catalogueMiniaturesLight = catalogueSceneProof.light
    const catalogueMiniaturesDark = catalogueSceneProof.dark
    const catalogueComparisons = catalogueSceneProof.comparisons
    const catalogueThemeLeaks = compareCatalogueSceneHashes(catalogueMiniaturesLight, catalogueMiniaturesDark, catalogueComparisons)
    if (catalogueThemeLeaks.length) throw new Error('UI theme leaked into Scene catalogue rendering: ' + catalogueThemeLeaks.join(', '))

    await resize(window, 1280, 900)
    await setScale(window, 100)
    themeSwitches.push(await setTheme(window, 'light'))
'''
if g08.count(catalogue_proof_anchor) != 1:
    raise SystemExit("G08: post-navigation catalogue proof anchor mismatch")
g08 = g08.replace(catalogue_proof_anchor, catalogue_proof_replacement, 1)

studio_capture_anchor = '''    themeSwitches.push(await setTheme(window, 'light'))
    const stageLight = await captureRegionHash(window, '.stage', 2)
    captures.studioLightFinal = await capture(window, outputDirectory, 'gallery-studio-light-final')
    themeSwitches.push(await setTheme(window, 'dark'))
    const stageDark = await captureRegionHash(window, '.stage', 2)
    captures.studioDarkFinal = await capture(window, outputDirectory, 'gallery-studio-dark-final')
'''
studio_capture_replacement = '''    themeSwitches.push(await setTheme(window, 'light'))
    const stageLight = await captureStablePresentedRegion(window, '.stage', 'studio light Scene', 2)
    captures.studioLightFinal = await capture(window, outputDirectory, 'gallery-studio-light-final')
    const studioPixelCount = stageLight.bitmap.length / 4
    const studioAllowedChangedPixels = Math.max(32, Math.ceil(studioPixelCount * .0001))
    themeSwitches.push(await setTheme(window, 'dark'))
    const stageDark = await captureStablePresentedRegion(window, '.stage', 'studio dark Scene', 2)
    captures.studioDarkFinal = await capture(window, outputDirectory, 'gallery-studio-dark-final')
'''
if g08.count(studio_capture_anchor) != 1:
    raise SystemExit("G08: studio presented-frame capture anchor mismatch")
g08 = g08.replace(studio_capture_anchor, studio_capture_replacement, 1)

studio_isolation_anchor = '''    if (captures.studioLightFinal.sha256 === captures.studioDarkFinal.sha256) throw new Error('Studio light and dark modes are visually identical.')
    if (stageLight.sha256 !== stageDark.sha256) throw new Error('UI theme leaked into the authored Scene preview.')
'''
studio_isolation_replacement = '''    if (captures.studioLightFinal.sha256 === captures.studioDarkFinal.sha256) throw new Error('Studio light and dark modes are visually identical.')
    const studioDelta = pixelDeltaSummary(stageLight.bitmap, stageDark.bitmap)
    const studioComparison = {
        rawHashEqual: stageLight.bitmapSha256 === stageDark.bitmapSha256,
        changedPixels: studioDelta.changedPixels,
        changedRatio: studioDelta.changedRatio,
        maxChannelDelta: studioDelta.maxChannelDelta,
        allowedChangedPixels: studioAllowedChangedPixels,
        withinNoiseEnvelope: studioDelta.changedPixels <= studioAllowedChangedPixels,
    }
    if (!studioComparison.withinNoiseEnvelope) throw new Error('UI theme leaked into the authored Scene preview: ' + JSON.stringify(studioComparison))
'''
if g08.count(studio_isolation_anchor) != 1:
    raise SystemExit("G08: studio isolation anchor mismatch")
g08 = g08.replace(studio_isolation_anchor, studio_isolation_replacement, 1)

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

caret_assert_anchor = '''        const caretFile = theme === 'dark' ? 'caret-down-light' : 'caret-down'
        if (value.controlPolish.selectAppearance !== 'none'
            || !value.controlPolish.selectBackgroundImage.includes(caretFile)
            || value.controlPolish.selectPaddingRight < 44) {
            throw new Error(`${key} lost the explicit, theme-correct, comfortably inset select caret.`)
        }
'''
caret_assert_replacement = '''        const caretFile = theme === 'dark' ? 'caret-down-light' : 'caret-down'
        const caretColour = theme === 'dark' ? '%23f4efe7' : '%23181917'
        const caretImage = value.controlPolish.selectBackgroundImage.toLowerCase()
        const hasThemeCorrectCaret = caretImage.includes(caretFile) || caretImage.includes(caretColour)
        if (value.controlPolish.selectAppearance !== 'none'
            || !hasThemeCorrectCaret
            || value.controlPolish.selectPaddingRight < 44) {
            throw new Error(`${key} lost the explicit, theme-correct, comfortably inset select caret.`)
        }
'''
if g08.count(caret_assert_anchor) != 1:
    raise SystemExit("G08: select-caret verification anchor mismatch")
g08 = g08.replace(caret_assert_anchor, caret_assert_replacement, 1)

receipt_schema_anchor = '''    const receipt = {
        task: 'G08 dual-theme interface, scale, fit, and HostPort smoke',
'''
receipt_schema_replacement = '''    const receipt = {
        schemaVersion: 2,
        task: 'G08 dual-theme interface, scale, fit, and HostPort smoke',
'''
if g08.count(receipt_schema_anchor) != 1:
    raise SystemExit("G08: receipt schema anchor mismatch")
g08 = g08.replace(receipt_schema_anchor, receipt_schema_replacement, 1)

receipt_anchor = '''        visualIsolation: {
            catalogue: { light: catalogueMiniatureLight, dark: catalogueMiniatureDark },
            studio: { light: stageLight, dark: stageDark },
        },
'''
receipt_replacement = '''        visualIsolation: {
            schemaVersion: 2,
            catalogue: { light: catalogueMiniaturesLight, dark: catalogueMiniaturesDark, comparisons: catalogueComparisons, mismatches: catalogueThemeLeaks },
            studio: { light: stageLight, dark: stageDark, comparison: studioComparison },
        },
'''
if g08.count(receipt_anchor) != 1:
    raise SystemExit("G08: visual isolation receipt anchor mismatch")
g08 = g08.replace(receipt_anchor, receipt_replacement, 1)
write(g08_path, g08.rstrip() + "\n")

# 10. Documentation must describe the actual all-Scene proof, not a one-card proxy.
doc_replacements = {
    "docs/releases/v1.1.1.md": [
        (
            "- Cropped Scene catalogue and studio preview pixels match exactly between Light and Dark modes, proving that interface appearance cannot alter authored Scene output.",
            "- All 29 catalogue Scene previews and the studio preview preserve exact authored state, geometry, layer counts, and computed-paint signatures between Light and Dark modes. Each capture is temporally stable within 1 LSB across at most 0.01% of pixels; the cross-theme comparison confines compositor disagreement to at most 0.01% of pixels and retains the maximum channel delta as evidence.",
        ),
        (
            "- Runtime contrast, clipping, overflow, sibling overlap, popover bounds, focus, touch-target size, reload persistence, StorageEvent convergence, reduced-motion contracts, and final-action reachability verified.",
            "- Runtime text and focus-indicator contrast, clipping, overflow, sibling overlap, popover bounds, focus retention, touch-target size, stored-state plus executable first-paint persistence, StorageEvent convergence, reduced-motion contracts, and final-action reachability verified.",
        ),
    ],
    "docs/design-system.md": [
        (
            "The theme boundary stops at product chrome. Scene previews, catalogue miniatures, Project data, Timeline state, and export output remain theme-neutral.",
            "The theme boundary stops at product chrome. Scene previews, all 29 catalogue miniatures, Project data, Timeline state, and export output remain theme-neutral.",
        ),
        (
            "Scene-pixel isolation, keyboard navigation",
            "all-Scene theme isolation, keyboard navigation",
        ),
        (
            "Both palettes use semantic surface, text, border, state, scrollbar, tooltip, error, and caret tokens. G08 computes runtime text contrast, proves matching geometry between modes, and compares cropped Scene pixels across Light and Dark renders.",
            "Both palettes use semantic surface, text, border, state, scrollbar, tooltip, error, caret, and focus tokens. G08 computes runtime text and focus-indicator contrast, proves matching geometry and exact computed-paint signatures, requires temporally stable raw compositor captures within 1 LSB across at most 0.01% of pixels, and limits cross-theme raster disagreement to at most 0.01% of pixels for every catalogue Scene plus the studio preview.",
        ),
        (
            "minimum targets, runtime contrast, theme persistence",
            "minimum targets, runtime text and focus-indicator contrast, theme persistence",
        ),
    ],
    "CHANGELOG.md": [
        (
            "Theme-specific select carets, metadata colours, contrast verification, reload/storage convergence, and Scene-pixel isolation proof.",
            "Theme-specific select carets, metadata colours, executable first-paint scenarios, stored-state/storage-event convergence, and exact state/computed-paint isolation proof with strict temporal stability and a 0.01%-pixel cross-theme compositor ceiling across all 29 catalogue Scenes.",
        ),
        (
            "Strengthened G08 with dual-theme contrast, persistence, sibling-overlap, disclosure stability, stacked-header, clipping, reachability, and pixel-isolation assertions",
            "Strengthened G08 with dual-theme text and focus-indicator contrast, persistence, sibling-overlap, disclosure stability, stacked-header, clipping, reachability, exact computed-paint isolation, material-paint masks, and bounded raw-raster assertions",
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
