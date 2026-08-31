(() => {
    const key = "galileo-gallery-interface-theme-v1"
    const root = document.documentElement
    const exportView = new URLSearchParams(window.location.search).has("export")
    let theme = "light"
    let source = "export-neutral"

    if (!exportView) {
        let stored = null
        try {
            const candidate = window.localStorage.getItem(key)
            if (candidate === "light" || candidate === "dark") stored = candidate
        } catch {
            stored = null
        }
        theme = stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        source = stored ? "user" : "system"
    }

    root.dataset.theme = theme
    root.dataset.themeSource = source
    root.style.colorScheme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#151613" : "#f3f0e9")
})()
