const { spawn } = require("node:child_process")
const { HostPortError } = require("./linux-host-port.cjs")

function runG06FFmpeg({ ffmpegPath, args, inputFd, signal, timeoutMs = 120_000, spawnProcess = spawn, onChild }) {
    return new Promise((resolve, reject) => {
        let settled = false
        let timedOut = false
        let stderr = ""
        const child = spawnProcess(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-xerror", "-nostdin", "-threads", "1", "-max_alloc", "268435456", ...args], {
            shell: false,
            windowsHide: true,
            env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
            stdio: ["ignore", "ignore", "pipe", inputFd],
        })
        onChild?.(child)
        const finish = (error) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            signal?.removeEventListener("abort", abort)
            onChild?.(null)
            if (error) reject(error)
            else resolve()
        }
        const abort = () => child.kill("SIGKILL")
        const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL") }, timeoutMs)
        signal?.addEventListener("abort", abort, { once: true })
        if (signal?.aborted) abort()
        child.stderr?.on("data", (chunk) => { if (stderr.length < 65_536) stderr += chunk.toString().slice(0, 65_536 - stderr.length) })
        child.once("error", () => finish(new HostPortError("host_unavailable")))
        child.once("close", (code) => {
            if (signal?.aborted) finish(new HostPortError("cancelled"))
            else if (timedOut) finish(new HostPortError("resource_limit"))
            else if (code === 0) finish()
            else finish(new HostPortError(stderr ? "corrupt_input" : "verification_failed"))
        })
    })
}

module.exports = { runG06FFmpeg }
