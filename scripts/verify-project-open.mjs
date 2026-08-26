import assert from "node:assert/strict"
import { projectConfigAfterOpen, projectOpenNotice } from "../src/projectOpen.ts"

const priorProject = Object.freeze({
    schemaVersion: 2,
    styleId: "opening-reel",
    items: Object.freeze([]),
    settings: Object.freeze({ marker: "prior-state" }),
})

for (const result of [
    { cancelled: true },
    { failure: { code: "legacy_project_unsupported", message: "Legacy project rejected safely." } },
    { failure: { code: "unsafe_entry_name", message: "Unsafe archive rejected safely." } },
]) {
    assert.strictEqual(projectConfigAfterOpen(priorProject, result), priorProject)
}

const replacement = { ...priorProject, styleId: "quiet-carousel" }
assert.strictEqual(projectConfigAfterOpen(priorProject, { config: replacement }), replacement)
assert.equal(projectOpenNotice({ cancelled: true }), "Project opening cancelled")
assert.equal(
    projectOpenNotice({ failure: { code: "legacy_project_unsupported", message: "Legacy project rejected safely." } }),
    "Legacy project rejected safely."
)

console.log("Verified: project-open application boundary preserves prior state on cancellation and every typed failure, replacing it only on validated success.")
