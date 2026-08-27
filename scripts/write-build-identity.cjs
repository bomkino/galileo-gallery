const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")

function git(...args) {
    return execFileSync("git", args, { encoding: "utf8" }).trim()
}

const identity = Object.freeze({
    productId: "galileo-gallery",
    sourceSha: process.env.GALLERY_SOURCE_SHA || git("rev-parse", "HEAD"),
    sourceTree: process.env.GALLERY_SOURCE_TREE || git("rev-parse", "HEAD^{tree}"),
    buildId: process.env.GALLERY_BUILD_ID || `g03-${Date.now().toString(36)}`,
})
const target = path.resolve("dist/build-identity.json")
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, `${JSON.stringify(identity, null, 2)}\n`, { flag: "wx", mode: 0o644 })
console.log(JSON.stringify(identity))
