const fs = require("node:fs")
const path = require("node:path")

const APP_ORIGIN = "gallery-app://app"
const CONTENT_SECURITY_POLICY = [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' reel-media: data: blob:",
    "media-src 'self' reel-media: blob:",
    "font-src 'self' data:",
    "connect-src 'self' reel-media:",
    "frame-src 'none'",
].join("; ")

const MIME_TYPES = Object.freeze({
    ".avif": "image/avif",
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
})

function parseTrustedAppURL(value) {
    if (typeof value !== "string") return null
    const rawPath = value.replace(/^gallery-app:\/\/app/i, "").split(/[?#]/, 1)[0]
    try {
        const decodedRawPath = decodeURIComponent(rawPath)
        if (decodedRawPath.includes("%")) return null
        if (decodedRawPath.split("/").some((segment) => segment === "." || segment === "..")) return null
    } catch {
        return null
    }
    let url
    try {
        url = new URL(value)
    } catch {
        return null
    }
    if (url.protocol !== "gallery-app:" || url.hostname !== "app" || url.username || url.password || url.port) return null
    return url
}

function resolveAppResource(root, requestURL) {
    if (typeof root !== "string" || !path.isAbsolute(root)) return null
    const url = parseTrustedAppURL(requestURL)
    if (!url) return null
    let pathname
    try {
        if (/%2f|%5c|%00/i.test(url.pathname)) return null
        pathname = decodeURIComponent(url.pathname)
    } catch {
        return null
    }
    if (pathname.includes("\0") || pathname.includes("\\")) return null
    const relative = pathname.replace(/^\/+/, "") || "index.html"
    const normalized = path.posix.normalize(relative)
    if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) return null
    let resolvedRoot
    try {
        resolvedRoot = fs.realpathSync(root)
    } catch {
        return null
    }
    const candidate = path.resolve(resolvedRoot, ...normalized.split("/"))
    if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${path.sep}`)) return null
    let current = resolvedRoot
    for (const segment of normalized.split("/")) {
        current = path.join(current, segment)
        try {
            if (fs.lstatSync(current).isSymbolicLink()) return null
        } catch {
            break
        }
    }
    return candidate
}

function responseHeaders(filePath) {
    return Object.freeze({
        "content-type": MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "content-security-policy": CONTENT_SECURITY_POLICY,
        "cross-origin-opener-policy": "same-origin",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
    })
}

function createAppProtocolHandler(root) {
    return (request) => {
        if (!request || !["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 })
        const filePath = resolveAppResource(root, request.url)
        if (!filePath) return new Response("Not found", { status: 404 })
        try {
            const stats = fs.statSync(filePath)
            if (!stats.isFile()) return new Response("Not found", { status: 404 })
            return new Response(request.method === "HEAD" ? null : fs.readFileSync(filePath), { status: 200, headers: responseHeaders(filePath) })
        } catch {
            return new Response("Not found", { status: 404 })
        }
    }
}

function developmentOrigin(value) {
    if (typeof value !== "string" || !/^http:\/\/127\.0\.0\.1:\d{1,5}\/?$/.test(value)) return undefined
    const url = new URL(value)
    const port = Number(url.port)
    return port >= 1 && port <= 65535 ? url.origin : undefined
}

function isAllowedNavigation(targetURL, options = {}) {
    if (parseTrustedAppURL(targetURL)) return true
    const allowedDevelopmentOrigin = developmentOrigin(options.developmentOrigin)
    if (!allowedDevelopmentOrigin) return false
    try {
        const target = new URL(targetURL)
        return target.origin === allowedDevelopmentOrigin && ["http:", "ws:"].includes(target.protocol)
    } catch {
        return false
    }
}

function isAllowedRequest(targetURL, options = {}) {
    let url
    try {
        url = new URL(targetURL)
    } catch {
        return false
    }
    if (parseTrustedAppURL(targetURL)) return true
    if (url.protocol === "reel-media:") {
        if (options.allowLegacyMedia && url.hostname === "file" && /^\/[A-Za-z0-9_-]+$/.test(url.pathname)) return true
        return url.hostname === "grant" && /^\/[a-f0-9]{64}$/.test(url.pathname) && !url.search && !url.hash
    }
    if (["data:", "blob:"].includes(url.protocol)) return true
    return isAllowedNavigation(targetURL, options)
}

function installWindowSecurity(window, options = {}) {
    window.webContents.setWindowOpenHandler(() => {
        options.onDecision?.("popup-denied")
        return { action: "deny" }
    })
    window.webContents.on("will-navigate", (event, targetURL) => {
        if (!isAllowedNavigation(targetURL, options)) {
            options.onDecision?.("navigation-denied")
            event.preventDefault()
        }
    })
    window.webContents.on("will-frame-navigate", (event, targetURL, _isInPlace, isMainFrame) => {
        if (isMainFrame) {
            if (!isAllowedNavigation(targetURL, options)) {
                options.onDecision?.("navigation-denied")
                event.preventDefault()
            }
            return
        }
        options.onDecision?.("frame-navigation-denied")
        event.preventDefault()
    })
    window.webContents.on("will-redirect", (event) => { options.onDecision?.("redirect-denied"); event.preventDefault() })
    window.webContents.on("will-attach-webview", (event) => { options.onDecision?.("webview-denied"); event.preventDefault() })
}

function installSessionSecurity(session, options = {}) {
    session.setPermissionCheckHandler(() => { options.onDecision?.("permission-denied"); return false })
    session.setPermissionRequestHandler((_webContents, _permission, callback) => { options.onDecision?.("permission-denied"); callback(false) })
    session.on("will-download", (event) => { options.onDecision?.("download-denied"); event.preventDefault() })
    session.webRequest.onBeforeRequest((details, callback) => {
        const cancel = !isAllowedRequest(details.url, options)
        if (cancel) options.onDecision?.("request-denied")
        callback({ cancel })
    })
}

module.exports = {
    APP_ORIGIN,
    CONTENT_SECURITY_POLICY,
    createAppProtocolHandler,
    developmentOrigin,
    installSessionSecurity,
    installWindowSecurity,
    isAllowedNavigation,
    isAllowedRequest,
    parseTrustedAppURL,
    resolveAppResource,
    responseHeaders,
}
