import * as React from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import QuietCarouselTracer from "./QuietCarouselTracer"
import { ensureReelAPI } from "./runtime"
import { initializeInterfaceTheme } from "./presentation/theme"
import "./styles.css"
import "./interfacePolish.css"
import "./pitchdogTheme.css"
import "./themeModes.css"

initializeInterfaceTheme()
ensureReelAPI()

const Root = new URLSearchParams(window.location.search).get("tracer") === "quiet-carousel"
    ? QuietCarouselTracer
    : App

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <Root />
    </React.StrictMode>
)
