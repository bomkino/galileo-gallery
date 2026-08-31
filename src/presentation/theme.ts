export const INTERFACE_THEME_KEY = "galileo-gallery-interface-theme-v1"
export const INTERFACE_THEME_EVENT = "galileo-gallery:interface-theme-change"

export type InterfaceTheme = "light" | "dark"
export type InterfaceThemeSource = "system" | "user" | "export-neutral"

const THEME_COLOURS: Record<InterfaceTheme, string> = {
    light: "#f3f0e9",
    dark: "#151613",
}

function isInterfaceTheme(value: unknown): value is InterfaceTheme {
    return value === "light" || value === "dark"
}

function systemInterfaceTheme(): InterfaceTheme {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function readStoredInterfaceTheme(): InterfaceTheme | null {
    try {
        const stored = window.localStorage.getItem(INTERFACE_THEME_KEY)
        return isInterfaceTheme(stored) ? stored : null
    } catch {
        return null
    }
}

function updateThemeColour(theme: InterfaceTheme) {
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOURS[theme])
}

function applyInterfaceTheme(theme: InterfaceTheme, source: InterfaceThemeSource) {
    const root = document.documentElement
    const changed = root.dataset.theme !== theme || root.dataset.themeSource !== source
    root.dataset.theme = theme
    root.dataset.themeSource = source
    root.style.colorScheme = theme
    updateThemeColour(theme)
    if (changed) {
        window.dispatchEvent(new CustomEvent(INTERFACE_THEME_EVENT, {
            detail: { theme, source },
        }))
    }
    return theme
}

export function getInterfaceTheme(): InterfaceTheme {
    const current = document.documentElement.dataset.theme
    return isInterfaceTheme(current) ? current : systemInterfaceTheme()
}

export function setInterfaceTheme(theme: InterfaceTheme) {
    try {
        window.localStorage.setItem(INTERFACE_THEME_KEY, theme)
    } catch {
        // The visible preference still applies for this window.
    }
    return applyInterfaceTheme(theme, "user")
}

export function toggleInterfaceTheme() {
    return setInterfaceTheme(getInterfaceTheme() === "dark" ? "light" : "dark")
}

export function subscribeInterfaceTheme(listener: () => void) {
    window.addEventListener(INTERFACE_THEME_EVENT, listener)
    return () => window.removeEventListener(INTERFACE_THEME_EVENT, listener)
}

export function initializeInterfaceTheme() {
    const root = document.documentElement
    if (root.dataset.themeInitialized === "true") return () => {}

    const exportView = new URLSearchParams(window.location.search).has("export")
    if (exportView) {
        applyInterfaceTheme("light", "export-neutral")
        root.dataset.themeInitialized = "true"
        return () => {}
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const stored = readStoredInterfaceTheme()
    applyInterfaceTheme(stored ?? (media.matches ? "dark" : "light"), stored ? "user" : "system")
    root.dataset.themeInitialized = "true"

    const onSystemChange = () => {
        if (readStoredInterfaceTheme()) return
        applyInterfaceTheme(media.matches ? "dark" : "light", "system")
    }
    const onStorage = (event: StorageEvent) => {
        if (event.key !== INTERFACE_THEME_KEY) return
        const next = isInterfaceTheme(event.newValue) ? event.newValue : null
        applyInterfaceTheme(next ?? (media.matches ? "dark" : "light"), next ? "user" : "system")
    }

    media.addEventListener("change", onSystemChange)
    window.addEventListener("storage", onStorage)
    return () => {
        media.removeEventListener("change", onSystemChange)
        window.removeEventListener("storage", onStorage)
    }
}
