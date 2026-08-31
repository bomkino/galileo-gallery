import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")
const write = (file, content) => {
    const target = path.join(root, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
}
const assert = (condition, message) => {
    if (!condition) throw new Error(`Bootstrap v1.1.1 failed: ${message}`)
}
const replaceOnce = (text, search, replacement, label) => {
    const first = text.indexOf(search)
    assert(first >= 0, `missing ${label}`)
    assert(text.indexOf(search, first + search.length) < 0, `duplicate ${label}`)
    return text.slice(0, first) + replacement + text.slice(first + search.length)
}

// Exact patch release.
const packageJson = JSON.parse(read("package.json"))
assert(packageJson.version === "1.1.0", "expected package version 1.1.0")
packageJson.version = "1.1.1"
write("package.json", `${JSON.stringify(packageJson, null, 2)}\n`)

// Add the one missing UI glyph to the shared Phosphor boundary.
let icon = read("src/ui/PhosphorIcon.tsx")
icon = replaceOnce(
    icon,
    'import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check"\n',
    'import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown"\nimport { CheckIcon } from "@phosphor-icons/react/dist/csr/Check"\n',
    "Phosphor Check import"
)
icon = replaceOnce(
    icon,
    "const ICONS = {\n    check: CheckIcon,\n",
    'const ICONS = {\n    "caret-down": CaretDownIcon,\n    check: CheckIcon,\n',
    "Phosphor icon map"
)
write("src/ui/PhosphorIcon.tsx", icon)

// Replace the native details disclosure with a controlled, stable, bidirectionally animated popover.
let app = read("src/App.tsx")
const projectMenuComponent = `type ProjectMenuProps = {
    projectOpening: boolean
    isExporting: boolean
    onOpenProject: () => void | Promise<void>
    onSaveProject: () => void | Promise<void>
    onOpenTemplate: () => void | Promise<void>
    onSaveTemplate: () => void | Promise<void>
}

function ProjectMenu({
    projectOpening,
    isExporting,
    onOpenProject,
    onSaveProject,
    onOpenTemplate,
    onSaveTemplate,
}: ProjectMenuProps) {
    const [open, setOpen] = React.useState(false)
    const rootRef = React.useRef<HTMLDivElement | null>(null)
    const triggerRef = React.useRef<HTMLButtonElement | null>(null)

    const close = React.useCallback((restoreFocus = false) => {
        setOpen(false)
        if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
    }, [])

    React.useEffect(() => {
        if (!open) return
        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) close()
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return
            event.preventDefault()
            close(true)
        }
        window.addEventListener("pointerdown", onPointerDown)
        window.addEventListener("keydown", onKeyDown)
        return () => {
            window.removeEventListener("pointerdown", onPointerDown)
            window.removeEventListener("keydown", onKeyDown)
        }
    }, [close, open])

    const run = (action: () => void | Promise<void>) => {
        close()
        void action()
    }

    return (
        <div className={\`project-menu \${open ? "is-open" : ""}\`} ref={rootRef}>
            <button
                className="button quiet project-trigger"
                type="button"
                ref={triggerRef}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls="project-menu-panel"
                onClick={() => setOpen((current) => !current)}
            >
                <Icon name="folder" />
                <span>Project</span>
                <span className="menu-caret"><Icon name="caret-down" size={14} /></span>
            </button>
            <div
                className="project-menu-panel"
                id="project-menu-panel"
                role="menu"
                aria-hidden={!open}
            >
                <button role="menuitem" type="button" disabled={projectOpening || isExporting} onClick={() => run(onOpenProject)}>Open project</button>
                <button role="menuitem" type="button" onClick={() => run(onSaveProject)}><span>Save project</span><small>media + progress</small></button>
                <span className="project-menu-divider" aria-hidden="true" />
                <button role="menuitem" type="button" onClick={() => run(onOpenTemplate)}>Apply template</button>
                <button role="menuitem" type="button" onClick={() => run(onSaveTemplate)}><span>Save template</span><small>settings only</small></button>
            </div>
        </div>
    )
}

`
app = replaceOnce(
    app,
    "function mediaRatio(media: SelectedMedia): Promise<number> {\n",
    `${projectMenuComponent}function mediaRatio(media: SelectedMedia): Promise<number> {\n`,
    "mediaRatio anchor"
)
const detailsPattern = /                    <details className="project-menu">[\s\S]*?                    <\/details>\n/
const detailsMatches = app.match(new RegExp(detailsPattern.source, "g")) ?? []
assert(detailsMatches.length === 1, `expected one Project details disclosure, found ${detailsMatches.length}`)
app = app.replace(detailsPattern, `                    <ProjectMenu
                        projectOpening={projectOpening}
                        isExporting={Boolean(isExporting)}
                        onOpenProject={openProject}
                        onSaveProject={saveProject}
                        onOpenTemplate={openTemplate}
                        onSaveTemplate={saveTemplate}
                    />
`)
write("src/App.tsx", app)

// Final override layer: geometry, control alignment, select carets, and non-janky motion.
let theme = read("src/pitchdogTheme.css")
assert(!theme.includes("v1.1.1 geometry and motion polish"), "v1.1.1 theme block already exists")
theme += `

/* v1.1.1 geometry and motion polish */
:root {
    --pd-motion-fast: 160ms;
    --pd-motion-default: 220ms;
    --pd-motion-ease: cubic-bezier(.22, 1, .36, 1);
    --pd-select-caret-size: 16px;
    --pd-select-caret-inset: 16px;
    --pd-select-caret: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cpath fill='%23181917' d='M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z'/%3E%3C/svg%3E");
}

.titlebar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    justify-content: normal;
    column-gap: var(--pd-space-4);
    min-width: 0;
}

.brand-lockup,
.brand-lockup > div,
.title-actions { min-width: 0; }

.brand-lockup,
.brand-lockup > div { overflow: hidden; }

.autosave-status {
    position: static;
    left: auto;
    top: auto;
    justify-self: end;
    min-width: 0;
    max-width: 180px;
    overflow: hidden;
    transform: none;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.title-actions {
    justify-content: flex-end;
    flex-wrap: nowrap;
}

.button,
.icon-button,
.add-media,
.transport-play,
.export-button,
.segment button,
.project-menu-panel button {
    line-height: 1.15;
}

.button > svg,
.icon-button > svg,
.add-media > svg,
.transport-play > svg,
.export-button > svg,
.project-menu-panel button > svg {
    align-self: center;
}

.project-menu {
    position: relative;
    min-width: 0;
}

.project-trigger {
    white-space: nowrap;
}

.menu-caret {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    margin-left: var(--pd-space-1);
    transform-origin: center;
    transition: transform var(--pd-motion-default) var(--pd-motion-ease);
}

.project-menu.is-open .menu-caret { transform: rotate(180deg); }

.project-menu > .project-menu-panel {
    top: calc(100% + var(--pd-space-2));
    right: 0;
    width: min(272px, calc(100vw - var(--pd-space-8)));
    max-height: min(420px, calc(100vh - 112px));
    overflow-x: hidden;
    overflow-y: auto;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateY(-6px) scale(.985);
    transform-origin: top right;
    transition:
        opacity var(--pd-motion-fast) var(--pd-motion-ease),
        transform var(--pd-motion-default) var(--pd-motion-ease),
        visibility 0s linear var(--pd-motion-default);
    will-change: opacity, transform;
}

.project-menu.is-open > .project-menu-panel {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: translateY(0) scale(1);
    transition-delay: 0s;
}

.project-menu-panel button {
    gap: var(--pd-space-4);
    width: 100%;
}

.project-menu-panel button > span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.project-menu-panel button small {
    flex: 0 0 auto;
    margin-left: auto;
}

.project-menu-divider {
    display: block;
    height: 1px;
    margin: var(--pd-space-2) var(--pd-space-1);
    background: var(--hairline);
}

select {
    appearance: none;
    -webkit-appearance: none;
    padding-right: calc(var(--pd-select-caret-inset) * 2 + var(--pd-select-caret-size)) !important;
    background-image: var(--pd-select-caret);
    background-repeat: no-repeat;
    background-position: right var(--pd-select-caret-inset) center;
    background-size: var(--pd-select-caret-size) var(--pd-select-caret-size);
    cursor: pointer;
}

select:disabled { cursor: not-allowed; }

.inspector > .inspector-scroll {
    animation: pd-inspector-enter var(--pd-motion-default) var(--pd-motion-ease) both;
    transform-origin: top center;
}

@keyframes pd-inspector-enter {
    from {
        opacity: .76;
        transform: translateY(6px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@container (max-height: 620px) and (min-width: 761px) {
    .panel-heading { padding-block: var(--pd-space-5) var(--pd-space-4); }
    .empty-library {
        min-height: 248px;
        gap: var(--pd-space-3);
        padding: var(--pd-space-7) var(--pd-space-5);
    }
    .empty-orbit {
        width: 64px;
        height: 64px;
        margin-bottom: 0;
    }
    .empty-library > span:last-child { line-height: 1.4; }
    .control-section { padding-block: var(--pd-space-6) var(--pd-space-7); }
}

@container (max-width: 760px) {
    .titlebar {
        grid-template-columns: minmax(0, 1fr);
        column-gap: 0;
    }
    .title-actions {
        justify-content: flex-start;
        flex-wrap: wrap;
    }
    .title-actions > .button.primary { flex: 1 1 100%; }
    .project-menu > .project-menu-panel {
        right: auto;
        left: 0;
        transform-origin: top left;
    }
}

@container (max-width: 620px) {
    .title-actions > .project-menu > .project-trigger { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
    .menu-caret,
    .project-menu > .project-menu-panel {
        transition-duration: 0ms;
        transition-delay: 0ms;
    }
    .inspector > .inspector-scroll { animation: none; }
}
`
write("src/pitchdogTheme.css", theme)

// Strengthen the source gate so the polish cannot regress into native carets or unstable disclosure markup.
let verify = read("scripts/verify-design-system.cjs")
verify = verify.replaceAll('1.1.0', '1.1.1')
verify = replaceOnce(
    verify,
    'for (const name of ["check", "close", "film", "folder", "grip", "minus", "mute", "play", "plus", "skip", "spark", "trash"]) {\n',
    'for (const name of ["caret-down", "check", "close", "film", "folder", "grip", "minus", "mute", "play", "plus", "skip", "spark", "trash"]) {\n',
    "icon vocabulary"
)
verify = replaceOnce(
    verify,
    'assert(icon.includes(\'@phosphor-icons/react/dist/csr/\'), "icons must use direct tree-shakeable Phosphor imports")\n',
    `assert(icon.includes('@phosphor-icons/react/dist/csr/'), "icons must use direct tree-shakeable Phosphor imports")
assert(app.includes("function ProjectMenu("), "controlled Project menu component is missing")
assert(app.includes('className="button quiet project-trigger"'), "Project menu trigger contract is missing")
assert(app.includes('className="menu-caret"'), "Project menu caret is missing")
assert(!app.includes('<details className="project-menu">'), "native Project details disclosure remains")
assert(theme.includes("--pd-select-caret:"), "custom Phosphor-derived select caret is missing")
assert(theme.includes("appearance: none"), "native select caret was not disabled")
assert(theme.includes(".project-menu.is-open > .project-menu-panel"), "bidirectional Project menu motion contract is missing")
assert(theme.includes("@keyframes pd-inspector-enter"), "inspector panel reveal motion is missing")
assert(theme.includes("grid-template-columns: minmax(0, 1fr) auto auto"), "stable titlebar geometry contract is missing")
`,
    "icon import assertion"
)
verify = replaceOnce(
    verify,
    'assert(lock.packages?.[""]?.dependencies?.["@phosphor-icons/react"] === "2.1.10", "package lock must pin Phosphor React")\n',
    `assert(lock.packages?.[""]?.dependencies?.["@phosphor-icons/react"] === "2.1.10", "package lock must pin Phosphor React")
assert(lock.packages?.[""]?.version === "1.1.1", "package lock root version must be 1.1.1")
`,
    "lock dependency assertion"
)
verify = replaceOnce(
    verify,
    '    minimumTarget: "44px",\n',
    '    minimumTarget: "44px",\n    interfacePolish: "stable-header + Phosphor-carets + disclosure-motion",\n',
    "verification receipt"
)
write("scripts/verify-design-system.cjs", verify)

// Extend the real Electron proof with sibling-overlap, select-caret, disclosure-motion, and stacked-header checks.
let g08 = read("electron/g08-interface-smoke.cjs")
const metricsAnchor = `        const focusStyle = getComputedStyle(focusTarget)
        const manifest = JSON.parse(localStorage.getItem('${PRESENTATION_KEY}'))
        return {
`
const metricsPrep = `        const focusStyle = getComputedStyle(focusTarget)
        const manifest = JSON.parse(localStorage.getItem('${PRESENTATION_KEY}'))
        const brand = rect('.brand-lockup')
        const actions = rect('.title-actions')
        const primary = rect('.title-actions .button.primary')
        const autosaveElement = document.querySelector('.autosave-status')
        const autosaveStyle = autosaveElement ? getComputedStyle(autosaveElement) : null
        const autosaveRect = autosaveElement?.getBoundingClientRect()
        const autosaveVisible = Boolean(autosaveElement && autosaveStyle.display !== 'none' && autosaveStyle.visibility !== 'hidden' && autosaveRect.width > 0 && autosaveRect.height > 0)
        const autosave = autosaveRect ? { left: autosaveRect.left, top: autosaveRect.top, right: autosaveRect.right, bottom: autosaveRect.bottom, width: autosaveRect.width, height: autosaveRect.height } : null
        const overlaps = (a, b) => Boolean(a && b && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5)
        const selectElement = document.querySelector('.inspector select')
        if (!selectElement) throw new Error('Inspector select control is missing.')
        const selectStyle = getComputedStyle(selectElement)
        const inspectorPanelStyle = getComputedStyle(document.querySelector('.inspector > .inspector-scroll'))
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
        return {
`
g08 = replaceOnce(g08, metricsAnchor, metricsPrep, "G08 metrics preparation")
const shellAnchor = `            shell: {
                clientWidth: shell.clientWidth,
                scrollWidth: shell.scrollWidth,
                clientHeight: shell.clientHeight,
                scrollHeight: shell.scrollHeight,
            },
`
const shellReplacement = `            shell: {
                display: getComputedStyle(shell).display,
                clientWidth: shell.clientWidth,
                scrollWidth: shell.scrollWidth,
                clientHeight: shell.clientHeight,
                scrollHeight: shell.scrollHeight,
            },
            headerGeometry: {
                brand,
                actions,
                primary,
                autosave,
                autosaveVisible,
                autosaveBrandOverlap: autosaveVisible && overlaps(autosave, brand),
                autosaveActionsOverlap: autosaveVisible && overlaps(autosave, actions),
            },
            controlPolish: {
                selectAppearance: selectStyle.appearance || selectStyle.webkitAppearance,
                selectBackgroundImage: selectStyle.backgroundImage,
                selectBackgroundPosition: selectStyle.backgroundPosition,
                selectBackgroundSize: selectStyle.backgroundSize,
                selectPaddingRight: parseFloat(selectStyle.paddingRight),
                inspectorAnimationName: inspectorPanelStyle.animationName,
                inspectorAnimationDuration: parseFloat(inspectorPanelStyle.animationDuration) || 0,
                reducedMotion,
            },
`
g08 = replaceOnce(g08, shellAnchor, shellReplacement, "G08 shell metrics")
const disclosureFunctionAnchor = `async function verifyWorkflowNavigation(window) {
`
const disclosureFunction = `async function verifyDisclosureMotion(window) {
    const result = await window.webContents.executeJavaScript(\`(async () => {
        const projectBefore = localStorage.getItem('${PROJECT_KEY}')
        const trigger = document.querySelector('.project-trigger')
        const menu = document.querySelector('.project-menu-panel')
        const caret = document.querySelector('.menu-caret')
        if (!trigger || !menu || !caret) throw new Error('Project disclosure controls are missing.')
        const readRect = (element) => {
            const box = element.getBoundingClientRect()
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
        }
        const stableElements = ['.titlebar', '.library', '.studio', '.inspector'].map((selector) => document.querySelector(selector))
        const before = stableElements.map(readRect)
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
        trigger.click()
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const configuredStyle = getComputedStyle(menu)
        const configured = {
            duration: configuredStyle.transitionDuration,
            property: configuredStyle.transitionProperty,
        }
        await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 20 : 260))
        const openStyle = getComputedStyle(menu)
        const openRect = readRect(menu)
        const open = {
            expanded: trigger.getAttribute('aria-expanded'),
            hidden: menu.getAttribute('aria-hidden'),
            opacity: Number(openStyle.opacity),
            visibility: openStyle.visibility,
            transform: openStyle.transform,
            caretTransform: getComputedStyle(caret).transform,
            rect: openRect,
            insideViewport: openRect.left >= -1 && openRect.right <= innerWidth + 1 && openRect.top >= -1 && openRect.bottom <= innerHeight + 1,
        }
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 20 : 260))
        const closedStyle = getComputedStyle(menu)
        const after = stableElements.map(readRect)
        const maximumLayoutShift = Math.max(...before.flatMap((box, index) => {
            const next = after[index]
            return ['left', 'top', 'right', 'bottom', 'width', 'height'].map((key) => Math.abs(box[key] - next[key]))
        }))
        return {
            configured,
            reducedMotion,
            open,
            closed: {
                expanded: trigger.getAttribute('aria-expanded'),
                hidden: menu.getAttribute('aria-hidden'),
                opacity: Number(closedStyle.opacity),
                visibility: closedStyle.visibility,
                transform: closedStyle.transform,
                focusRestored: document.activeElement === trigger,
            },
            maximumLayoutShift,
            projectInvariant: projectBefore === localStorage.getItem('${PROJECT_KEY}'),
        }
    })()\`)
    if (result.open.expanded !== 'true' || result.open.hidden !== 'false' || result.open.opacity < 0.99 || result.open.visibility !== 'visible' || !result.open.insideViewport) {
        throw new Error('Project menu did not open visibly inside the viewport.')
    }
    if (!result.reducedMotion && (!result.configured.duration || result.configured.duration.split(',').every((value) => parseFloat(value) < 0.15))) {
        throw new Error('Project menu has no premium disclosure transition.')
    }
    if (!result.reducedMotion && result.open.caretTransform === 'none') throw new Error('Project menu caret did not rotate.')
    if (result.closed.expanded !== 'false' || result.closed.hidden !== 'true' || result.closed.opacity > 0.01 || result.closed.visibility !== 'hidden' || !result.closed.focusRestored) {
        throw new Error('Project menu did not close cleanly and restore trigger focus.')
    }
    if (result.maximumLayoutShift > 0.75) throw new Error('Opening or closing Project menu shifted the application layout.')
    if (!result.projectInvariant) throw new Error('Project menu disclosure changed Project state.')
    await settleRenderer(window)
    return result
}

async function verifyWorkflowNavigation(window) {
`
g08 = replaceOnce(g08, disclosureFunctionAnchor, disclosureFunction, "G08 disclosure function")
const invariantAnchor = `        if (value.shell.scrollWidth > value.shell.clientWidth + 1) throw new Error(\`\${key} has horizontally clipped studio content.\`)
`
const invariantReplacement = `        if (value.shell.scrollWidth > value.shell.clientWidth + 1) throw new Error(\`\${key} has horizontally clipped studio content.\`)
        if (value.headerGeometry.autosaveBrandOverlap || value.headerGeometry.autosaveActionsOverlap) {
            throw new Error(\`\${key} lets autosave status collide with a titlebar neighbour.\`)
        }
        if (value.controlPolish.selectAppearance !== 'none' || value.controlPolish.selectBackgroundImage === 'none' || value.controlPolish.selectPaddingRight < 44) {
            throw new Error(\`\${key} lost the explicit, comfortably inset select caret.\`)
        }
        if (!value.controlPolish.reducedMotion && (value.controlPolish.inspectorAnimationName === 'none' || value.controlPolish.inspectorAnimationDuration < 0.15)) {
            throw new Error(\`\${key} lost inspector panel reveal motion.\`)
        }
        if (value.shell.display === 'flex' && value.headerGeometry.primary.width + 2 < value.headerGeometry.actions.width) {
            throw new Error(\`\${key} leaves the primary Export action stranded in a short wrapped row.\`)
        }
`
g08 = replaceOnce(g08, invariantAnchor, invariantReplacement, "G08 polish invariants")
const disclosureCallAnchor = `    const workflow = await verifyWorkflowNavigation(window)
`
const disclosureCallReplacement = `    const disclosure = await verifyDisclosureMotion(window)
    await window.webContents.executeJavaScript(\`document.querySelector('.project-trigger')?.click()\`)
    await waitFor(window, \`document.querySelector('.project-menu')?.classList.contains('is-open')\`, "open Project menu for screenshot")
    await new Promise((resolve) => setTimeout(resolve, disclosure.reducedMotion ? 20 : 260))
    captures.projectMenu100 = await capture(window, outputDirectory, "gallery-project-menu-100")
    await window.webContents.executeJavaScript(\`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))\`)
    await new Promise((resolve) => setTimeout(resolve, disclosure.reducedMotion ? 20 : 260))
    const workflow = await verifyWorkflowNavigation(window)
`
g08 = replaceOnce(g08, disclosureCallAnchor, disclosureCallReplacement, "G08 disclosure call")
const progressAnchor = `                captures,
                catalogueMetrics,
`
const progressReplacement = `                captures,
                disclosure,
                catalogueMetrics,
`
g08 = replaceOnce(g08, progressAnchor, progressReplacement, "G08 progress disclosure")
const receiptAnchor = `        host,
        workflow,
        captures,
`
const receiptReplacement = `        host,
        workflow,
        disclosure,
        captures,
`
g08 = replaceOnce(g08, receiptAnchor, receiptReplacement, "G08 receipt disclosure")
write("electron/g08-interface-smoke.cjs", g08)

// Active documentation and release notes.
let readme = read("README.md")
readme = replaceOnce(readme, "**Latest stable: 1.1.0**", "**Latest stable: 1.1.1**", "README stable version")
readme = readme.replaceAll("Galileo.Gallery-1.1.0-Linux-x86_64.AppImage", "Galileo.Gallery-1.1.1-Linux-x86_64.AppImage")
readme = replaceOnce(
    readme,
    "Version 1.1.0 adopts the public pitch.dog type system as the packaged default and uses Phosphor for product-control icons. Padding, gaps, and control sizing follow a shared 4 px scale with a 44 px minimum target at every Interface Scale.",
    "Version 1.1.1 keeps the packaged pitch.dog type system and Phosphor control language, then closes the remaining geometry defects: collision-free titlebar placement, explicit well-inset carets, stable disclosure menus, balanced wrapped actions, and reduced-motion-safe panel transitions. Padding, gaps, and control sizing continue to follow a shared 4 px scale with a 44 px minimum target at every Interface Scale.",
    "README interface-system paragraph"
)
write("README.md", readme)

let changelog = read("CHANGELOG.md")
const changelogAnchor = "## [1.1.0] — 2026-08-31\n"
const changelogEntry = `## [1.1.1] — 2026-08-31

### Fixed

- Removed the titlebar collision between autosave status and Interface Scale.
- Rebalanced wrapped header actions at high Interface Scale so Export receives a full, deliberate row.
- Reduced short-height empty-state clipping without shrinking interactive targets.
- Replaced cramped native select arrows with explicit, consistently inset Phosphor-derived carets.

### Changed

- Rebuilt Project as a controlled popover with outside-click dismissal, Escape focus restoration, caret rotation, and bidirectional motion that never shifts the application grid.
- Added a restrained inspector-panel reveal and a complete reduced-motion fallback.
- Strengthened G08 with sibling-overlap, disclosure stability, select-caret, stacked-header, clipping, and screenshot assertions.

`
changelog = replaceOnce(changelog, changelogAnchor, changelogEntry + changelogAnchor, "changelog v1.1.0 anchor")
write("CHANGELOG.md", changelog)

let design = read("docs/design-system.md")
const verificationHeading = "## Verification\n"
const geometrySection = `## Geometry and motion

The titlebar is a three-column grid: flexible brand, optional status, fixed actions. Autosave is part of layout rather than an absolutely centred overlay, so it cannot collide with Interface Scale or action controls.

Select controls suppress the platform arrow and use the Phosphor Caret Down geometry at a consistent 16 px size with 16 px right inset. The Project control uses the live Phosphor component and rotates it as disclosure state changes.

Project is a controlled, absolutely positioned popover. Opening and closing animate opacity and transform without changing panel, stage, or titlebar geometry. Inspector workflow panels use a short entrance transition. Every motion rule becomes instantaneous under \`prefers-reduced-motion: reduce\`.

`
design = replaceOnce(design, verificationHeading, geometrySection + verificationHeading, "design-system Verification heading")
design = replaceOnce(
    design,
    "It checks minimum targets, reachability, overflow, canvas geometry, persistence, keyboard navigation, pitch.dog font resolution, and Phosphor runtime markers, and writes screenshot evidence to `artifacts/g08/`.",
    "It checks minimum targets, reachability, overflow, canvas geometry, titlebar sibling collisions, wrapped-action balance, select-caret geometry, Project disclosure motion and layout stability, persistence, keyboard navigation, pitch.dog font resolution, and Phosphor runtime markers, and writes screenshot evidence to `artifacts/g08/`.",
    "design-system G08 sentence"
)
write("docs/design-system.md", design)

let status = read("docs/programme/IMPLEMENTATION_STATUS.md")
status = replaceOnce(status, "Current stable release: **v1.1.0**", "Current stable release: **v1.1.1**", "implementation stable version")
status = replaceOnce(
    status,
    "State: **29/29 independently authored Scenes released; deterministic export and Project safety boundaries retained; pitch.dog typography, Phosphor iconography, and spacing-system verification released in v1.1.0**",
    "State: **29/29 independently authored Scenes released; deterministic export and Project safety boundaries retained; pitch.dog typography, Phosphor iconography, spacing, geometry, caret, and disclosure-motion verification released through v1.1.1**",
    "implementation release state"
)
status = replaceOnce(
    status,
    "Version 1.0.1 released the independently rebuilt 29-Scene catalogue after source, renderer, cross-platform, and batched human-review gates. Version 1.1.0 changes the product interface around those Scenes: local pitch.dog fonts, a shared Phosphor icon boundary, tokenised spacing, stronger G08 layout checks, and an exact-version release workflow. Scene timing, Project schemas, media semantics, and export contracts are intentionally unchanged.",
    "Version 1.0.1 released the independently rebuilt 29-Scene catalogue after source, renderer, cross-platform, and batched human-review gates. Version 1.1.0 changed the product interface around those Scenes: local pitch.dog fonts, a shared Phosphor icon boundary, tokenised spacing, stronger G08 layout checks, and an exact-version release workflow. Version 1.1.1 removes the remaining titlebar collision, standardises caret geometry, stabilises Project disclosure, balances wrapped actions, and verifies reduced-motion-safe panel transitions. Scene timing, Project schemas, media semantics, and export contracts are intentionally unchanged.",
    "implementation release history"
)
write("docs/programme/IMPLEMENTATION_STATUS.md", status)

write("docs/releases/v1.1.1.md", `# Galileo Gallery 1.1.1

A geometry and interaction-quality patch. Scene engines, Project data, media semantics, and deterministic export remain unchanged.

## Fixed

- Autosave status no longer collides with Interface Scale or titlebar actions.
- High Interface Scale gives Export a balanced full-width row rather than a stranded short button.
- Short-height empty states retain their content without sacrificing 44 px minimum targets.
- Select carets now use one explicit Phosphor-derived shape, size, and right inset.

## Changed

- Project now opens as a controlled popover with outside-click dismissal, Escape focus restoration, caret rotation, and premium bidirectional motion.
- Inspector workflow changes receive a restrained reveal; reduced-motion users receive an immediate transition.
- G08 now proves sibling non-overlap, menu layout stability, caret treatment, stacked-header balance, clipping, reachability, and the existing canvas/export invariants.

## Source anchors

- pitch.dog type system: \`bomkino/pitchdog-type-system@786b4a2b671182319320f922b8de8f927ea3a002\`
- Phosphor React: \`@phosphor-icons/react@2.1.10\`
`)

console.log(JSON.stringify({
    status: "V1_1_1_POLISH_APPLIED",
    version: packageJson.version,
    fixes: [
        "titlebar sibling collision",
        "Phosphor select and disclosure carets",
        "stable Project popover",
        "stacked action balance",
        "short-height empty state",
        "reduced-motion-safe panel reveal",
        "runtime geometry assertions",
    ],
}, null, 2))
