const fs = require("node:fs")
const path = require("node:path")

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
const index = read("index.html")
const main = read("src/main.tsx")
const app = read("src/App.tsx")
const gallery = read("src/StyleGallery.tsx")
const scale = read("src/presentation/InterfaceScaleSurface.tsx")
const themeState = read("src/presentation/theme.ts")
const themeControl = read("src/presentation/ThemeControl.tsx")
const icon = read("src/ui/PhosphorIcon.tsx")
const theme = read("src/pitchdogTheme.css")
const themeModes = read("src/themeModes.css")
const preflight = read("public/theme-preflight.js")
const selectCaret = read("src/assets/icons/caret-down.svg")
const darkSelectCaret = read("src/assets/icons/caret-down-dark.svg")
const notices = read("THIRD_PARTY_NOTICES.md")
const designNotes = read("docs/design-system.md")
const releaseNotes = read("docs/releases/v1.2.0.md")
const fontSource = JSON.parse(read("src/assets/fonts/SOURCE.json"))

assert(packageJson.version === "1.2.0", "package version must be 1.2.0")
assert(packageJson.dependencies?.["@phosphor-icons/react"] === "2.1.10", "Phosphor React must be pinned to 2.1.10")
assert(lock.packages?.[""]?.dependencies?.["@phosphor-icons/react"] === "2.1.10", "package lock must pin Phosphor React")
assert(lock.packages?.[""]?.version === "1.2.0", "package lock root version must be 1.2.0")
assert(packageJson.scripts?.["verify:design-system"] === "node scripts/verify-design-system.cjs", "verify:design-system script is missing")
assert(packageJson.scripts?.test?.includes("npm run verify:design-system"), "npm test does not run the design-system verifier")

const polishImport = main.indexOf('import "./interfacePolish.css"')
const typeImport = main.indexOf('import "./pitchdogTheme.css"')
const modesImport = main.indexOf('import "./themeModes.css"')
assert(polishImport >= 0 && typeImport > polishImport && modesImport > typeImport, "interface styles must load base, type, then colour modes")
assert(main.includes('import { initializeInterfaceTheme } from "./presentation/theme"'), "main must import interface-theme initialization")
assert(main.indexOf("initializeInterfaceTheme()") < main.indexOf("createRoot("), "theme must initialize before React mounts")
assert(index.includes('<script type="module" src="/theme-preflight.js"></script>'), "index must run external theme preflight before the application module")
assert(index.indexOf("theme-preflight.js") < index.indexOf('/src/main.tsx'), "theme preflight must run before the application module")
assert(preflight.includes("galileo-gallery-interface-theme-v1"), "theme preflight uses the wrong preference key")
assert(preflight.includes('has("export")'), "theme preflight does not neutralize hidden export windows")
assert(preflight.includes("prefers-color-scheme: dark"), "theme preflight does not follow the operating system")

assert(app.includes('import Icon from "./ui/PhosphorIcon"'), "App must import the shared Phosphor icon boundary")
assert(!app.includes("function Icon({"), "the hand-drawn App icon implementation still exists")
assert(!app.includes("<svg"), "App contains an inline SVG outside the Phosphor boundary")
assert(scale.includes('import Icon from "../ui/PhosphorIcon"'), "Interface Scale must use the shared Phosphor icon boundary")
assert(scale.includes('<Icon name="minus"'), "Interface Scale minus icon is not Phosphor")
assert(scale.includes('<Icon name="plus"'), "Interface Scale plus icon is not Phosphor")
assert(!scale.includes('<span aria-hidden="true">−</span>'), "legacy text minus control remains")
assert(!scale.includes('<span aria-hidden="true">+</span>'), "legacy text plus control remains")

for (const name of ["caret-down", "check", "close", "film", "folder", "grip", "minus", "moon", "mute", "play", "plus", "skip", "spark", "sun", "trash"]) {
    const key = name.includes("-") ? `"${name}":` : `${name}:`
    assert(icon.includes(key), `Phosphor icon map is missing ${name}`)
}
assert(icon.includes("data-phosphor-icon={name}"), "Phosphor icons need a runtime provenance marker")
assert(icon.includes("@phosphor-icons/react/dist/csr/"), "icons must use direct tree-shakeable Phosphor imports")

assert(app.includes("function ProjectMenu("), "controlled Project menu component is missing")
assert(app.includes('className="button quiet project-trigger"'), "Project menu trigger contract is missing")
assert(app.includes('className="menu-caret"'), "Project menu caret is missing")
assert(!app.includes('<details className="project-menu">'), "native Project details disclosure remains")
assert(theme.includes("--pd-select-caret:"), "custom Phosphor-derived select caret is missing")
assert(theme.includes('url("./assets/icons/caret-down.svg")'), "base select caret does not reference the packaged Phosphor asset")
assert(theme.includes("background-image: var(--pd-select-caret) !important"), "select caret cannot survive authored background shorthands")
assert(selectCaret.includes('viewBox="0 0 256 256"') && selectCaret.includes("M213.66,101.66"), "packaged light select caret is not Phosphor Caret Down geometry")
assert(darkSelectCaret.includes('viewBox="0 0 256 256"') && darkSelectCaret.includes("M213.66,101.66"), "packaged dark select caret is not Phosphor Caret Down geometry")
assert(theme.includes("appearance: none"), "native select caret was not disabled")
assert(theme.includes(".project-menu.is-open > .project-menu-panel"), "bidirectional Project menu motion contract is missing")
assert(theme.includes("@keyframes pd-inspector-enter"), "inspector panel reveal motion is missing")
assert(theme.includes("grid-template-columns: minmax(0, 1fr) auto auto"), "stable titlebar geometry contract is missing")

assert(themeState.includes('export const INTERFACE_THEME_KEY = "galileo-gallery-interface-theme-v1"'), "theme preference key is missing")
assert(themeState.includes('type InterfaceTheme = "light" | "dark"'), "theme domain is not bounded to light and dark")
assert(themeState.includes('has("export")'), "hidden export windows are not neutralized")
assert(themeState.includes('applyInterfaceTheme("light", "export-neutral")'), "hidden export windows do not use the neutral boundary")
assert(themeState.includes('matchMedia("(prefers-color-scheme: dark)")'), "theme state does not follow the operating system")
assert(themeState.includes('localStorage.setItem(INTERFACE_THEME_KEY, theme)'), "theme preference is not persisted locally")
assert(themeState.includes('window.addEventListener("storage", onStorage)'), "theme state does not synchronize storage changes")
assert(themeControl.includes("React.useSyncExternalStore"), "theme control is not subscribed to the theme store")
assert(themeControl.includes("data-interface-theme-control"), "theme control lacks a runtime verification hook")
assert(themeControl.includes('aria-pressed={theme === "dark"}'), "theme control does not expose pressed state")
assert(themeControl.includes('next === "dark" ? "moon" : "sun"'), "theme control does not use truthful Phosphor mode icons")
assert(app.includes('import ThemeControl from "./presentation/ThemeControl"') && app.includes("<ThemeControl />"), "studio titlebar lacks the theme control")
assert(gallery.includes('import ThemeControl from "./presentation/ThemeControl"') && gallery.includes("<ThemeControl />"), "Scene catalogue lacks the theme control")

assert(themeModes.includes(':root[data-theme="light"]'), "light palette is missing")
assert(themeModes.includes(':root[data-theme="dark"]'), "dark palette is missing")
assert(themeModes.includes("color-scheme: light"), "light color-scheme is missing")
assert(themeModes.includes("color-scheme: dark"), "dark color-scheme is missing")
assert(themeModes.includes('url("./assets/icons/caret-down.svg")'), "light caret palette is missing")
assert(themeModes.includes('url("./assets/icons/caret-down-dark.svg")'), "dark caret palette is missing")
assert(themeModes.includes("@media (prefers-reduced-motion: reduce)"), "theme transitions lack reduced-motion handling")
assert(themeModes.includes("@container (min-width: 500px) and (max-width: 760px)"), "stacked Project panel fit contract is missing")
assert(themeModes.includes("transform-origin: top right"), "stacked Project panel does not align inward")
assert(themeModes.includes("@media (prefers-reduced-transparency: reduce)"), "themes lack reduced-transparency handling")
assert(themeModes.includes("@media (prefers-contrast: more)"), "themes lack increased-contrast handling")
assert(themeModes.includes("@media (forced-colors: active)"), "themes lack forced-colour handling")
for (const forbidden of [".export-canvas", ".quiet-carousel", ".vitrine-", "[data-scene", ".product-scene"]) {
    assert(!themeModes.includes(forbidden), "theme layer must not target rendered Scene or export content: " + forbidden)
}

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
assert(designNotes.includes("Light and dark"), "design-system documentation omits interface modes")
assert(releaseNotes.includes("Galileo Gallery 1.2.0"), "v1.2.0 release notes are missing")

console.log(JSON.stringify({
    status: "DESIGN_SYSTEM_VERIFIED",
    packageVersion: packageJson.version,
    phosphorVersion: packageJson.dependencies["@phosphor-icons/react"],
    fontSource: fontSource.commit,
    fonts: fontFiles.length,
    spacingScale: "4px",
    minimumTarget: "44px",
    interfacePolish: "stable-header + Phosphor-carets + disclosure-motion",
    interfaceThemes: "system-aware light + warm dark + local persistence + export-neutral boundary",
}, null, 2))
