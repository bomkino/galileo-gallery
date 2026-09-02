const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const root = path.resolve(__dirname, "..")
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")
const fail = (message) => {
    throw new Error(`Design-system verification failed: ${message}`)
}
const assert = (condition, message) => {
    if (!condition) fail(message)
}

const packageJson = JSON.parse(read("package.json"))
const lock = JSON.parse(read("package-lock.json"))
const main = read("src/main.tsx")
const app = read("src/App.tsx")
const scale = read("src/presentation/InterfaceScaleSurface.tsx")
const icon = read("src/ui/PhosphorIcon.tsx")
const theme = read("src/pitchdogTheme.css")
const baseStyles = read("src/styles.css")
const interfacePolish = read("src/interfacePolish.css")
const atelierRenderer = read("src/scenes/AtelierSceneRenderer.tsx")
const vitrineRenderer = read("src/scenes/VitrineRenderer.tsx")
const galleryRenderer = read("src/GalleryRenderer.tsx")
const g08 = read("electron/g08-interface-smoke.cjs")
const releaseWorkflow = read(".github/workflows/release.yml")
const implementationStatus = read("docs/programme/IMPLEMENTATION_STATUS.md")
const selectCaret = read("src/assets/icons/caret-down.svg")
const selectCaretLight = read("src/assets/icons/caret-down-light.svg")
const themeBoot = read("public/theme-boot.js")
const themeRuntime = read("src/presentation/uiTheme.ts")
const themeControl = read("src/presentation/ThemeControl.tsx")
const styleGallery = read("src/StyleGallery.tsx")
const indexHtml = read("index.html")
const protocols = read("electron/linux-protocols.cjs")
const notices = read("THIRD_PARTY_NOTICES.md")
const designNotes = read("docs/design-system.md")
const fontSource = JSON.parse(read("src/assets/fonts/SOURCE.json"))

assert(packageJson.version === "1.1.1", "package version must be 1.1.1")
assert(packageJson.dependencies?.["@phosphor-icons/react"] === "2.1.10", "Phosphor React must be pinned to 2.1.10")
assert(lock.packages?.[""]?.dependencies?.["@phosphor-icons/react"] === "2.1.10", "package lock must pin Phosphor React")
assert(lock.packages?.[""]?.version === "1.1.1", "package lock root version must be 1.1.1")
assert(packageJson.scripts?.["verify:design-system"] === "node scripts/verify-design-system.cjs", "verify:design-system script is missing")
assert(packageJson.scripts?.test?.includes("npm run verify:design-system"), "npm test does not run the design-system verifier")

const polishImport = main.indexOf('import "./interfacePolish.css"')
const themeImport = main.indexOf('import "./pitchdogTheme.css"')
assert(polishImport >= 0 && themeImport > polishImport, "pitchdogTheme.css must load after interfacePolish.css")

assert(app.includes('import Icon from "./ui/PhosphorIcon"'), "App must import the shared Phosphor icon boundary")
assert(!app.includes("function Icon({"), "the hand-drawn App icon implementation still exists")
assert(!app.includes("<svg"), "App contains an inline SVG outside the Phosphor boundary")
assert(scale.includes('import Icon from "../ui/PhosphorIcon"'), "Interface Scale must use the shared Phosphor icon boundary")
assert(scale.includes('<Icon name="minus"'), "Interface Scale minus icon is not Phosphor")
assert(scale.includes('<Icon name="plus"'), "Interface Scale plus icon is not Phosphor")
assert(!scale.includes("<span aria-hidden=\"true\">−</span>"), "legacy text minus control remains")
assert(!scale.includes("<span aria-hidden=\"true\">+</span>"), "legacy text plus control remains")

for (const name of ["caret-down", "check", "close", "film", "folder", "grip", "minus", "moon", "mute", "play", "plus", "skip", "spark", "sun", "trash"]) {
    const key = name.includes("-") ? `"${name}":` : `${name}:`
    assert(icon.includes(key), `Phosphor icon map is missing ${name}`)
}
assert(icon.includes("data-phosphor-icon={name}"), "Phosphor icons need a runtime provenance marker")
assert(icon.includes('@phosphor-icons/react/dist/csr/'), "icons must use direct tree-shakeable Phosphor imports")
assert(app.includes("function ProjectMenu("), "controlled Project menu component is missing")
assert(app.includes('className="button quiet project-trigger"'), "Project menu trigger contract is missing")
assert(app.includes('className="menu-caret"'), "Project menu caret is missing")
assert(!app.includes('<details className="project-menu">'), "native Project details disclosure remains")
assert(theme.includes("--pd-select-caret:"), "custom Phosphor-derived select caret is missing")
assert(theme.includes('url("./assets/icons/caret-down.svg")'), "select caret does not reference the packaged Phosphor asset")
assert(theme.includes("background-image: var(--pd-select-caret) !important"), "select caret cannot survive authored background shorthands")
assert(selectCaret.includes('viewBox="0 0 256 256"') && selectCaret.includes("M213.66,101.66"), "packaged select caret is not the Phosphor Caret Down geometry")
assert(selectCaretLight.includes('viewBox="0 0 256 256"') && selectCaretLight.includes("M213.66,101.66"), "dark-theme select caret is not the Phosphor Caret Down geometry")
assert(theme.includes("appearance: none"), "native select caret was not disabled")
assert(theme.includes(".project-menu.is-open > .project-menu-panel"), "bidirectional Project menu motion contract is missing")
assert(theme.includes("@keyframes pd-inspector-enter"), "inspector panel reveal motion is missing")
assert(theme.includes("grid-template-columns: minmax(0, 1fr) auto auto"), "stable titlebar geometry contract is missing")
assert(indexHtml.includes('<script src="./theme-boot.js"></script>'), "external first-paint theme bootstrap is missing")
assert(!indexHtml.includes("<script>"), "inline script would violate the packaged CSP")
assert(protocols.includes(`"script-src 'self'"`), "packaged CSP no longer permits only self-hosted scripts")
assert(themeBoot.includes('galileo-gallery:ui-theme:v1'), "first-paint theme bootstrap has the wrong key")
assert(themeBoot.includes('has("export")'), "first-paint bootstrap does not isolate export rendering")

function executeThemeBoot({ stored = null, systemDark = false, search = "", storageThrows = false }) {
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

assert(main.includes('import { installUiTheme } from "./presentation/uiTheme"'), "main does not import the early theme installer")
assert(main.indexOf("installUiTheme()") < main.indexOf("ensureReelAPI()"), "theme must resolve before runtime and React mount")
assert(themeRuntime.includes('UI_THEME_KEY = "galileo-gallery:ui-theme:v1"'), "theme persistence key is missing")
assert(themeRuntime.includes('source: "export-neutral"'), "export renderer is not theme-neutral")
assert(themeRuntime.includes('prefers-color-scheme: dark'), "system theme preference is not supported")
assert(themeControl.includes('data-ui-theme-toggle'), "theme toggle provenance marker is missing")
assert(themeControl.includes('aria-pressed={theme === "dark"}'), "theme toggle does not expose state")
assert(packageJson.build?.mac?.artifactName === "Galileo.Gallery-${version}-macOS-${arch}.${ext}", "macOS release name will not match its public checksum entry")
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
assert(theme.includes("html[data-ui-theme] .autosave-status { color: var(--muted); }"), "autosave status is not legible in both themes")
assert(theme.includes("html[data-ui-theme] .button.primary { background: var(--accent); }"), "primary action lost its semantic accent fill")
assert(!theme.includes("right: auto;\n        left: 0;\n        transform-origin: top left;"), "high-scale Project menu still creates hidden horizontal overflow")
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
assert(g08.includes("const channelScale = text.startsWith('color(srgb ') ? 255 : 1"), "G08 misreads normalized CSS colour channels")
assert(!implementationStatus.includes("Current frontier: **stable v1.0.1"), "implementation status carries a stale release frontier")
assert(!implementationStatus.includes("must be triaged before a release frontier"), "implementation status contradicts the production audit boundary")
assert(app.includes('import ThemeControl from "./presentation/ThemeControl"') && app.includes("<ThemeControl />"), "studio theme control is missing")
assert(styleGallery.includes('import ThemeControl from "./presentation/ThemeControl"') && styleGallery.includes("<ThemeControl />"), "catalogue theme control is missing")
assert(theme.includes(':root[data-ui-theme="light"]'), "light theme palette is missing")
assert(theme.includes(':root[data-ui-theme="dark"]'), "dark theme palette is missing")
assert(theme.includes('--pd-ui-select-caret: url("./assets/icons/caret-down-light.svg")'), "dark select caret asset is missing")
assert(theme.includes('html[data-ui-theme-ready="true"]'), "theme transition readiness boundary is missing")
assert(theme.includes(".project-menu > .project-menu-panel") && theme.includes("background-color var(--pd-motion-default)"), "theme transition broke Project disclosure motion")

for (const family of ["PD Head", "PD Head Alt", "PD Body", "PD Body Alt", "PD Eyebrow"]) {
    assert(theme.includes(`font-family: "${family}"`), `missing @font-face for ${family}`)
}
for (const token of ["--pd-space-1", "--pd-space-2", "--pd-space-3", "--pd-space-4", "--pd-space-5", "--pd-space-6", "--pd-space-8", "--pd-space-10", "--pd-target-min"]) {
    assert(theme.includes(`${token}:`), `missing spacing or target token ${token}`)
}
for (const surface of [".titlebar", ".panel-heading", ".library-scroll", ".media-row", ".studio", ".inspector-scroll", ".control-section", ".style-gallery-header", ".style-gallery-grid", ".style-card"]) {
    assert(theme.includes(surface), `spacing contract is missing ${surface}`)
}
assert(theme.includes("svg[data-phosphor-icon]"), "Phosphor sizing rule is missing")
assert(theme.includes("--pd-target-min: max(44px"), "minimum touch target must remain at least 44px")

const fontFiles = [
    "pd-head.woff2",
    "pd-head-alt.woff2",
    "pd-body-roman.woff2",
    "pd-body-italic.woff2",
    "pd-body-alt-roman.woff2",
    "pd-body-alt-italic.woff2",
    "pd-eyebrow-site.woff2",
]
for (const name of fontFiles) {
    const file = path.join(root, "src/assets/fonts", name)
    assert(fs.existsSync(file), `font file is missing: ${name}`)
    const bytes = fs.readFileSync(file)
    assert(bytes.length > 10_000, `font file is implausibly small: ${name}`)
    assert(bytes.subarray(0, 4).toString("ascii") === "wOF2", `font file is not WOFF2: ${name}`)
}
assert(fontSource.repository === "bomkino/pitchdog-type-system", "font source repository is wrong")
assert(fontSource.commit === "786b4a2b671182319320f922b8de8f927ea3a002", "font source commit is not pinned")
assert(fontSource.files.length === fontFiles.length, "font source manifest is incomplete")

assert(notices.includes("@phosphor-icons/react"), "third-party notices omit Phosphor")
assert(notices.includes("pitchdog-type-system"), "third-party notices omit the pitch.dog type system")
assert(designNotes.includes("786b4a2b671182319320f922b8de8f927ea3a002"), "design-system documentation omits the pinned font source")
assert(designNotes.includes("2.1.10"), "design-system documentation omits the pinned Phosphor version")

console.log(JSON.stringify({
    status: "DESIGN_SYSTEM_VERIFIED",
    packageVersion: packageJson.version,
    phosphorVersion: packageJson.dependencies["@phosphor-icons/react"],
    fontSource: fontSource.commit,
    fonts: fontFiles.length,
    spacingScale: "4px",
    minimumTarget: "44px",
    interfacePolish: "stable-header + Phosphor-carets + disclosure-motion + verified light-dark themes",
    themes: ["light", "dark"],
}, null, 2))
