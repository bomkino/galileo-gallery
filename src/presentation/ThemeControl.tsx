import * as React from "react"
import Icon from "../ui/PhosphorIcon"
import { currentUiTheme, setUiTheme, UI_THEME_EVENT, UI_THEME_KEY, type UiTheme } from "./uiTheme"

export default function ThemeControl() {
    const [theme, setThemeState] = React.useState<UiTheme>(() => currentUiTheme())

    React.useEffect(() => {
        const sync = () => setThemeState(currentUiTheme())
        const onStorage = (event: StorageEvent) => {
            if (event.key === UI_THEME_KEY) sync()
        }
        const media = window.matchMedia?.("(prefers-color-scheme: dark)")
        window.addEventListener(UI_THEME_EVENT, sync)
        window.addEventListener("storage", onStorage)
        media?.addEventListener?.("change", sync)
        return () => {
            window.removeEventListener(UI_THEME_EVENT, sync)
            window.removeEventListener("storage", onStorage)
            media?.removeEventListener?.("change", sync)
        }
    }, [])

    const next: UiTheme = theme === "dark" ? "light" : "dark"
    const action = "Switch to " + next + " mode"
    return (
        <button
            className="icon-button theme-toggle"
            type="button"
            aria-label={action}
            aria-pressed={theme === "dark"}
            title={action}
            data-ui-theme-toggle
            data-ui-theme-current={theme}
            onClick={() => {
                setUiTheme(next)
                setThemeState(next)
            }}
        >
            <span className="theme-toggle-icons" aria-hidden="true">
                <span className="theme-toggle-moon"><Icon name="moon" size={21} /></span>
                <span className="theme-toggle-sun"><Icon name="sun" size={21} /></span>
            </span>
        </button>
    )
}
