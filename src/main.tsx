import * as React from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { ensureReelAPI } from "./runtime"
import "./styles.css"

ensureReelAPI()

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)
