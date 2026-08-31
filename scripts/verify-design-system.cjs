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
const main = read("src/main.tsx")
const app = read("src/App.tsx")
const scale = read("src/presentation/InterfaceScaleSurface.tsx")
const icon = read("src/ui/PhosphorIcon.tsx")
const theme = read("src/pitchdogTheme.css")
const selectCaret = read("src/assets/icons/caret-down.svg")
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

for (const name of ["caret-down", "check", "close", "film", "folder", "grip", "minus", "mute", "play", "plus", "skip", "spark", "trash"]) {
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
assert(theme.includes("appearance: none"), "native select caret was not disabled")
assert(theme.includes(".project-menu.is-open > .project-menu-panel"), "bidirectional Project menu motion contract is missing")
assert(theme.includes("@keyframes pd-inspector-enter"), "inspector panel reveal motion is missing")
assert(theme.includes("grid-template-columns: minmax(0, 1fr) auto auto"), "stable titlebar geometry contract is missing")

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
    interfacePolish: "stable-header + Phosphor-carets + disclosure-motion",
}, null, 2))
