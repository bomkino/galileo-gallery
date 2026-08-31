import * as React from "react"
import Icon from "../ui/PhosphorIcon"
import {
    getInterfaceTheme,
    setInterfaceTheme,
    subscribeInterfaceTheme,
} from "./theme"

export default function ThemeControl() {
    const theme = React.useSyncExternalStore(
        subscribeInterfaceTheme,
        getInterfaceTheme,
        getInterfaceTheme
    )
    const next = theme === "dark" ? "light" : "dark"
    const label = `Switch to ${next} mode`

    return (
        <button
            className="icon-button theme-control"
            type="button"
            data-interface-theme-control
            data-interface-theme={theme}
            aria-label={label}
            aria-pressed={theme === "dark"}
            title={label}
            onClick={() => setInterfaceTheme(next)}
        >
            <Icon name={next === "dark" ? "moon" : "sun"} size={21} weight="bold" />
        </button>
    )
}
