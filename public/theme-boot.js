(() => {
    "use strict"

    const key = "galileo-gallery:ui-theme:v1"
    const root = document.documentElement
    const exportNeutral = new URLSearchParams(window.location.search).has("export")
    let theme = "light"
    let source = exportNeutral ? "export-neutral" : "system"

    if (!exportNeutral) {
        try {
            const stored = localStorage.getItem(key)
            if (stored === "light" || stored === "dark") {
                theme = stored
                source = "stored"
            } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
                theme = "dark"
            }
        } catch {
            if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) theme = "dark"
        }
    }

    root.dataset.uiTheme = theme
    root.dataset.uiThemeSource = source
    if (exportNeutral) root.dataset.uiThemeScope = "export-neutral"
    root.style.colorScheme = theme

    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute("content", theme === "dark" ? "#111210" : "#f3f0e9")
})()
