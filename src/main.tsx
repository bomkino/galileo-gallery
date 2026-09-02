import * as React from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { installUiTheme } from "./presentation/uiTheme"
import QuietCarouselTracer from "./QuietCarouselTracer"
import { ensureReelAPI } from "./runtime"
import "./styles.css"
import "./interfacePolish.css"
import "./pitchdogTheme.css"

installUiTheme()
ensureReelAPI()

const Root = new URLSearchParams(window.location.search).get("tracer") === "quiet-carousel"
    ? QuietCarouselTracer
    : App

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <Root />
    </React.StrictMode>
)
