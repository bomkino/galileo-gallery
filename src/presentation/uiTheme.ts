export type UiTheme = "light" | "dark"
export type UiThemeSource = "stored" | "system" | "export-neutral"

export const UI_THEME_KEY = "galileo-gallery:ui-theme:v1"
export const UI_THEME_EVENT = "galileo-gallery:ui-theme-change"

let installed = false

function storedUiTheme(): UiTheme | null {
    try {
        const value = localStorage.getItem(UI_THEME_KEY)
        return value === "light" || value === "dark" ? value : null
    } catch {
        return null
    }
}

function systemUiTheme(): UiTheme {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function resolvedUiTheme(): { theme: UiTheme; source: UiThemeSource } {
    if (new URLSearchParams(window.location.search).has("export")) {
        return { theme: "light", source: "export-neutral" }
    }
    const stored = storedUiTheme()
    return stored ? { theme: stored, source: "stored" } : { theme: systemUiTheme(), source: "system" }
}

export function currentUiTheme(): UiTheme {
    const applied = document.documentElement.dataset.uiTheme
    return applied === "light" || applied === "dark" ? applied : resolvedUiTheme().theme
}

export function applyUiTheme(theme: UiTheme, source: UiThemeSource = "stored") {
    const root = document.documentElement
    root.dataset.uiTheme = theme
    root.dataset.uiThemeSource = source
    root.style.colorScheme = theme
    if (source === "export-neutral") root.dataset.uiThemeScope = "export-neutral"
    else delete root.dataset.uiThemeScope
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) meta.content = theme === "dark" ? "#111210" : "#f3f0e9"
    window.dispatchEvent(new CustomEvent<UiTheme>(UI_THEME_EVENT, { detail: theme }))
    return theme
}

export function setUiTheme(theme: UiTheme) {
    try {
        localStorage.setItem(UI_THEME_KEY, theme)
    } catch {
        // The explicit theme still applies when storage is unavailable.
    }
    applyUiTheme(theme, "stored")
}

export function installUiTheme() {
    if (installed) return
    installed = true

    const sync = () => {
        const resolved = resolvedUiTheme()
        applyUiTheme(resolved.theme, resolved.source)
    }
    sync()
    requestAnimationFrame(() => { document.documentElement.dataset.uiThemeReady = "true" })

    if (document.documentElement.dataset.uiThemeScope === "export-neutral") return

    const media = window.matchMedia?.("(prefers-color-scheme: dark)")
    const onSystemTheme = () => {
        if (!storedUiTheme()) sync()
    }
    const onStorage = (event: StorageEvent) => {
        if (event.key === UI_THEME_KEY) sync()
    }
    media?.addEventListener?.("change", onSystemTheme)
    window.addEventListener("storage", onStorage)
}
