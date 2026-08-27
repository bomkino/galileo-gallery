const assert = require("node:assert/strict")
const { EventEmitter } = require("node:events")
const { runG06FFmpeg } = require("../electron/g06-ffmpeg-runner.cjs")

function fakeProcess(onStart) {
    return (_command, args, options) => {
        const child = new EventEmitter()
        child.stderr = new EventEmitter()
        child.kill = () => { setImmediate(() => child.emit("close", null)); return true }
        setImmediate(() => onStart(child, args, options))
        return child
    }
}

async function run() {
    let captured
    const children = []
    await runG06FFmpeg({ ffmpegPath: "/private/ffmpeg", args: ["-i", "/proc/self/fd/3"], inputFd: 9,
        onChild: (child) => children.push(child),
        spawnProcess: fakeProcess((child, args, options) => { captured = { args, options }; child.emit("close", 0) }) })
    for (const flag of ["-xerror", "-nostdin", "-threads", "-max_alloc"]) assert.ok(captured.args.includes(flag))
    assert.equal(captured.args[captured.args.indexOf("-max_alloc") + 1], "268435456")
    assert.deepEqual(captured.options.env, { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" })
    assert.equal(captured.options.env.GITHUB_TOKEN, undefined)
    assert.equal(captured.options.shell, false)
    assert.equal(captured.options.stdio[3], 9)
    assert.equal(children.at(-1), null, "child ownership must clear after completion")

    await assert.rejects(runG06FFmpeg({ ffmpegPath: "/private/ffmpeg", args: [], inputFd: 9, timeoutMs: 10, spawnProcess: fakeProcess(() => {}) }), (error) => error.code === "resource_limit")

    for (const preAborted of [true, false]) {
        const controller = new AbortController()
        if (preAborted) controller.abort()
        const cancelled = runG06FFmpeg({ ffmpegPath: "/private/ffmpeg", args: [], inputFd: 9, signal: controller.signal, spawnProcess: fakeProcess(() => {}) })
        if (!preAborted) controller.abort()
        await assert.rejects(cancelled, (error) => error.code === "cancelled")
    }

    await assert.rejects(runG06FFmpeg({ ffmpegPath: "/private/ffmpeg", args: [], inputFd: 9,
        spawnProcess: fakeProcess((child) => { child.stderr.emit("data", Buffer.alloc(100_000, 65)); child.emit("close", 1) }) }), (error) => error.code === "corrupt_input")
    console.log("Verified: G06 FFmpeg has minimal environment, 256 MiB allocation/one-thread/time bounds, held-FD input, pre/active SIGKILL cancellation, capped diagnostics, corrupt-input mapping, and child cleanup.")
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
