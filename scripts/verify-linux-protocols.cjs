const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {
    CONTENT_SECURITY_POLICY,
    createAppProtocolHandler,
    developmentOrigin,
    installSessionSecurity,
    installWindowSecurity,
    isAllowedNavigation,
    isAllowedRequest,
    parseTrustedAppURL,
    resolveAppResource,
} = require("../electron/linux-protocols.cjs")

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "galileo-g03-protocols-"))
try {
    const dist = path.join(temporary, "dist")
    fs.mkdirSync(path.join(dist, "assets"), { recursive: true })
    fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>Gallery</title>")
    fs.writeFileSync(path.join(dist, "assets", "app.js"), "export default true")
    fs.writeFileSync(path.join(temporary, "secret.txt"), "secret")
    fs.symlinkSync(path.join(temporary, "secret.txt"), path.join(dist, "assets", "escape.txt"))

    assert.equal(parseTrustedAppURL("gallery-app://app/index.html").hostname, "app")
    for (const hostile of [
        "https://app/index.html",
        "gallery-app://attacker/index.html",
        "gallery-app://user@app/index.html",
        "gallery-app://app:44/index.html",
    ]) assert.equal(parseTrustedAppURL(hostile), null)

    assert.equal(resolveAppResource(dist, "gallery-app://app/"), fs.realpathSync(path.join(dist, "index.html")))
    assert.equal(resolveAppResource(dist, "gallery-app://app/assets/app.js?cache=1"), fs.realpathSync(path.join(dist, "assets", "app.js")))
    for (const hostile of [
        "gallery-app://app/../secret.txt",
        "gallery-app://app/%2e%2e/secret.txt",
        "gallery-app://app/%252e%252e/secret.txt",
        "gallery-app://app/%2fetc/passwd",
        "gallery-app://app/%5c%5cserver/share",
        "gallery-app://app/assets/escape.txt",
        "gallery-app://attacker/index.html",
    ]) assert.equal(resolveAppResource(dist, hostile), null)

    assert.equal(isAllowedNavigation("gallery-app://app/index.html"), true)
    assert.equal(isAllowedNavigation("https://attacker.example/"), false)
    assert.equal(isAllowedNavigation("http://127.0.0.1:5173/src/main.tsx", { developmentOrigin: "http://127.0.0.1:5173" }), true)
    assert.equal(isAllowedNavigation("http://127.0.0.1:5174/", { developmentOrigin: "http://127.0.0.1:5173" }), false)
    assert.equal(developmentOrigin("http://127.0.0.1:5173"), "http://127.0.0.1:5173")
    assert.equal(developmentOrigin("http://localhost:5173"), undefined)
    assert.equal(developmentOrigin("https://127.0.0.1:5173"), undefined)
    assert.equal(isAllowedRequest("reel-media://grant/" + "a".repeat(64)), true)
    assert.equal(isAllowedRequest("reel-media://file/" + "a".repeat(64)), false)
    assert.equal(isAllowedRequest("reel-media://grant/" + "a".repeat(63)), false)
    assert.equal(isAllowedRequest("data:image/png;base64,AA=="), true)
    assert.equal(isAllowedRequest("file:///etc/passwd"), false)
    assert.equal(isAllowedRequest("https://attacker.example/tracker"), false)

    const listeners = {}
    const webContents = {
        setWindowOpenHandler(handler) { this.openHandler = handler },
        on(name, handler) { listeners[name] = handler },
    }
    const decisions = []
    installWindowSecurity({ webContents }, { onDecision: (decision) => decisions.push(decision) })
    assert.deepEqual(webContents.openHandler({ url: "https://attacker.example" }), { action: "deny" })
    for (const [name, target] of [["will-navigate", "https://attacker.example"], ["will-redirect", undefined], ["will-attach-webview", undefined]]) {
        let prevented = false
        listeners[name]({ preventDefault: () => { prevented = true } }, target)
        assert.equal(prevented, true)
    }
    let mainFramePrevented = false
    listeners["will-frame-navigate"]({ preventDefault: () => { mainFramePrevented = true } }, "https://attacker.example", false, true)
    assert.equal(mainFramePrevented, true)
    assert(decisions.includes("navigation-denied"))
    let childFramePrevented = false
    listeners["will-frame-navigate"]({ preventDefault: () => { childFramePrevented = true } }, "gallery-app://app/index.html", false, false)
    assert.equal(childFramePrevented, true)
    assert(decisions.includes("frame-navigation-denied"))
    let trustedPrevented = false
    listeners["will-navigate"]({ preventDefault: () => { trustedPrevented = true } }, "gallery-app://app/index.html")
    assert.equal(trustedPrevented, false)
    let trustedMainFramePrevented = false
    listeners["will-frame-navigate"]({ preventDefault: () => { trustedMainFramePrevented = true } }, "gallery-app://app/index.html", false, true)
    assert.equal(trustedMainFramePrevented, false)

    const sessionListeners = {}
    const session = {
        setPermissionCheckHandler(handler) { this.permissionCheck = handler },
        setPermissionRequestHandler(handler) { this.permissionRequest = handler },
        on(name, handler) { sessionListeners[name] = handler },
        webRequest: { onBeforeRequest(handler) { session.request = handler } },
    }
    installSessionSecurity(session)
    assert.equal(session.permissionCheck(), false)
    let permission = true
    session.permissionRequest(null, "camera", (allowed) => { permission = allowed })
    assert.equal(permission, false)
    let downloadPrevented = false
    sessionListeners["will-download"]({ preventDefault: () => { downloadPrevented = true } })
    assert.equal(downloadPrevented, true)
    for (const [url, cancelled] of [["gallery-app://app/index.html", false], ["https://attacker.example", true]]) {
        let result
        session.request({ url }, (value) => { result = value })
        assert.deepEqual(result, { cancel: cancelled })
    }

    const handler = createAppProtocolHandler(dist)
    Promise.all([
        handler({ method: "GET", url: "gallery-app://app/index.html" }),
        handler({ method: "HEAD", url: "gallery-app://app/index.html" }),
        handler({ method: "POST", url: "gallery-app://app/index.html" }),
        handler({ method: "GET", url: "gallery-app://app/missing.js" }),
    ]).then(async ([valid, head, wrongMethod, missing]) => {
        assert.equal(valid.status, 200)
        assert.equal(valid.headers.get("content-security-policy"), CONTENT_SECURITY_POLICY)
        assert.equal(valid.headers.get("content-type"), "text/html; charset=utf-8")
        assert.match(await valid.text(), /Gallery/)
        assert.equal(head.status, 200)
        assert.equal(await head.text(), "")
        assert.equal(wrongMethod.status, 405)
        assert.equal(missing.status, 404)
        console.log("Verified: G03 packaged origin containment, CSP, MIME, navigation, popup, permission, download, and network denial.")
    }).catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
} finally {
    process.on("exit", () => fs.rmSync(temporary, { recursive: true, force: true }))
}
