import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const typeSource = path.join(root, ".type-system-source")
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")
const write = (file, content) => {
    const target = path.join(root, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
}
const assert = (condition, message) => {
    if (!condition) throw new Error(`Bootstrap failed: ${message}`)
}

assert(fs.existsSync(typeSource), "pinned pitch.dog type-system checkout is missing")

const packagePath = "package.json"
const packageJson = JSON.parse(read(packagePath))
packageJson.version = "1.1.0"
packageJson.dependencies = Object.fromEntries(Object.entries({
    ...packageJson.dependencies,
    "@phosphor-icons/react": "2.1.10",
}).sort(([a], [b]) => a.localeCompare(b)))
packageJson.scripts["verify:design-system"] = "node scripts/verify-design-system.cjs"
if (!packageJson.scripts.test.includes("npm run verify:design-system")) {
    packageJson.scripts.test += " && npm run verify:design-system"
}
write(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)

let main = read("src/main.tsx")
if (!main.includes('import "./pitchdogTheme.css"')) {
    const anchor = 'import "./interfacePolish.css"\n'
    assert(main.includes(anchor), "main stylesheet import anchor is missing")
    main = main.replace(anchor, `${anchor}import "./pitchdogTheme.css"\n`)
}
write("src/main.tsx", main)

let app = read("src/App.tsx")
if (!app.includes('import Icon from "./ui/PhosphorIcon"')) {
    const anchor = 'import { createPortal } from "react-dom"\n'
    assert(app.includes(anchor), "App import anchor is missing")
    app = app.replace(anchor, `${anchor}import Icon from "./ui/PhosphorIcon"\n`)
}
const iconStart = app.indexOf("function Icon({ name, size = 16 }")
if (iconStart >= 0) {
    const iconEnd = app.indexOf("\n\nfunction idForMedia", iconStart)
    assert(iconEnd > iconStart, "could not bound the legacy App icon function")
    app = app.slice(0, iconStart) + app.slice(iconEnd + 2)
}
assert(!app.includes("function Icon({"), "legacy App icon function remains")
write("src/App.tsx", app)

let scale = read("src/presentation/InterfaceScaleSurface.tsx")
if (!scale.includes('import Icon from "../ui/PhosphorIcon"')) {
    const anchor = 'import * as React from "react"\n'
    assert(scale.includes(anchor), "Interface Scale import anchor is missing")
    scale = scale.replace(anchor, `${anchor}import Icon from "../ui/PhosphorIcon"\n`)
}
scale = scale.replace('<span aria-hidden="true">−</span>', '<Icon name="minus" size={18} />')
scale = scale.replace('<span aria-hidden="true">+</span>', '<Icon name="plus" size={18} />')
assert(scale.includes('<Icon name="minus"'), "Interface Scale minus icon was not migrated")
assert(scale.includes('<Icon name="plus"'), "Interface Scale plus icon was not migrated")
write("src/presentation/InterfaceScaleSurface.tsx", scale)

let g08 = read("electron/g08-interface-smoke.cjs")
if (!g08.includes("            designSystem: {")) {
    const anchor = "            manifest: {\n"
    assert(g08.includes(anchor), "G08 metrics anchor is missing")
    const block = [
        "            designSystem: {",
        "                bodyFont: getComputedStyle(document.body).fontFamily,",
        "                headingFont: getComputedStyle(document.querySelector('.panel-heading h2')).fontFamily,",
        "                eyebrowFont: getComputedStyle(document.querySelector('.eyebrow')).fontFamily,",
        "                fontReady: ['PD Head', 'PD Body', 'PD Body Alt', 'PD Eyebrow'].every((family) => document.fonts.check('12px \\\"' + family + '\\\"')),",
        "                phosphorIcons: document.querySelectorAll('[data-phosphor-icon]').length,",
        "                rogueControlSvgs: Array.from(document.querySelectorAll('.titlebar button svg, .library button svg, .inspector button svg, .transport button svg')).filter((svg) => !svg.hasAttribute('data-phosphor-icon')).length,",
        "                spacingTokens: ['--pd-space-1', '--pd-space-2', '--pd-space-3', '--pd-space-4', '--pd-space-6', '--pd-space-8', '--pd-space-10'].map((token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim()),",
        "            },",
        "",
    ].join("\n")
    g08 = g08.replace(anchor, `${block}${anchor}`)
}
if (!g08.includes("did not resolve PD Body")) {
    const anchor = "    for (const [key, value] of Object.entries(metrics)) {\n"
    assert(g08.includes(anchor), "G08 invariant loop anchor is missing")
    const checks = [
        anchor.trimEnd(),
        "        if (!value.designSystem.bodyFont.includes('PD Body')) throw new Error(`${key} did not resolve PD Body.`)",
        "        if (!value.designSystem.headingFont.includes('PD Head')) throw new Error(`${key} did not resolve PD Head.`)",
        "        if (!value.designSystem.eyebrowFont.includes('PD Eyebrow')) throw new Error(`${key} did not resolve PD Eyebrow.`)",
        "        if (!value.designSystem.fontReady) throw new Error(`${key} did not load every pitch.dog font role.`)",
        "        if (value.designSystem.phosphorIcons < 4) throw new Error(`${key} rendered too few Phosphor interface icons.`)",
        "        if (value.designSystem.rogueControlSvgs !== 0) throw new Error(`${key} rendered a non-Phosphor control SVG.`)",
        "        if (value.designSystem.spacingTokens.some((token) => !token)) throw new Error(`${key} lost a pitch.dog spacing token.`)",
        "",
    ].join("\n")
    g08 = g08.replace(anchor, checks)
}
write("electron/g08-interface-smoke.cjs", g08)

const fontNames = [
    "pd-head.woff2",
    "pd-head-alt.woff2",
    "pd-body-roman.woff2",
    "pd-body-italic.woff2",
    "pd-body-alt-roman.woff2",
    "pd-body-alt-italic.woff2",
    "pd-eyebrow-site.woff2",
]
const fontTarget = path.join(root, "src/assets/fonts")
fs.mkdirSync(fontTarget, { recursive: true })
const files = fontNames.map((name) => {
    const source = path.join(typeSource, "assets/fonts", name)
    const target = path.join(fontTarget, name)
    assert(fs.existsSync(source), `font source is missing ${name}`)
    fs.copyFileSync(source, target)
    const bytes = fs.readFileSync(target)
    assert(bytes.subarray(0, 4).toString("ascii") === "wOF2", `${name} is not WOFF2`)
    return {
        path: `src/assets/fonts/${name}`,
        bytes: bytes.length,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    }
})
write("src/assets/fonts/SOURCE.json", `${JSON.stringify({
    repository: "bomkino/pitchdog-type-system",
    commit: "786b4a2b671182319320f922b8de8f927ea3a002",
    integrated: "2026-08-31",
    files,
}, null, 2)}\n`)

const noticeTarget = path.join(root, "docs/third-party/pitchdog-type-system")
fs.mkdirSync(noticeTarget, { recursive: true })
for (const name of ["FONT-LICENSE.md", "FONT-PROVENANCE.json", "LICENSE.md"]) {
    const source = path.join(typeSource, name)
    assert(fs.existsSync(source), `type-system notice is missing ${name}`)
    fs.copyFileSync(source, path.join(noticeTarget, name))
}

let status = read("docs/programme/IMPLEMENTATION_STATUS.md")
const gateMarker = "## G01A — safe archive import boundary"
const gateIndex = status.indexOf(gateMarker)
assert(gateIndex >= 0, "implementation-status gate marker is missing")
status = `# Implementation status

Updated: 31 August 2026

Current stable release: **v1.1.0**

## Released product boundary

State: **29/29 independently authored Scenes released; deterministic export and Project safety boundaries retained; pitch.dog typography, Phosphor iconography, and spacing-system verification released in v1.1.0**

Version 1.0.1 released the independently rebuilt 29-Scene catalogue after source, renderer, cross-platform, and batched human-review gates. Version 1.1.0 changes the product interface around those Scenes: local pitch.dog fonts, a shared Phosphor icon boundary, tokenised spacing, stronger G08 layout checks, and an exact-version release workflow. Scene timing, Project schemas, media semantics, and export contracts are intentionally unchanged.

The sections below preserve gate-by-gate evidence and point-in-time caveats. They are an audit archive, not a competing list of current user-facing work. Active documentation begins at \`docs/README.md\`.

${status.slice(gateIndex)}`
write("docs/programme/IMPLEMENTATION_STATUS.md", status)

console.log(JSON.stringify({
    status: "BOOTSTRAP_APPLIED",
    version: packageJson.version,
    fonts: files.length,
    icons: "Phosphor 2.1.10",
    fontSource: "786b4a2b671182319320f922b8de8f927ea3a002",
}, null, 2))
