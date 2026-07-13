import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
    plugins: [react()],
    base: "./",
    resolve: {
        alias: {
            framer: path.resolve(__dirname, "src/framer-shim.ts"),
        },
        dedupe: ["react", "react-dom"],
    },
    server: {
        strictPort: true,
        fs: {
            allow: [path.resolve(__dirname, "../..")],
        },
    },
    build: {
        target: "chrome142",
        outDir: "dist",
    },
})
