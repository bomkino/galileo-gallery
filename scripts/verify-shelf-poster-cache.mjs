import assert from "node:assert/strict"
import { reconcileShelfPosterRecords, shelfPosterKey } from "../src/scenes/shelfPosterCache.ts"

const oldKey = shelfPosterKey({ id: "edition-1", url: "reel-media://grant/old" })
const newKey = shelfPosterKey({ id: "edition-1", url: "reel-media://grant/new" })
assert.notEqual(oldKey, newKey, "same-ID source replacement must receive a new poster identity")

const records = new Map([
    [oldKey, { key: oldKey, url: "blob:old", touched: 10 }],
    [newKey, { key: newKey, url: "blob:new", touched: 1 }],
    ["edition-2\u0000source", { key: "edition-2\u0000source", url: "blob:two", touched: 20 }],
])
const valid = new Set([newKey, "edition-2\u0000source"])
const bounded = reconcileShelfPosterRecords(records, valid, [newKey], 1)
assert.deepEqual([...bounded.keep.keys()], [newKey], "an observed source must outrank an unobserved newer cache entry")
assert.deepEqual(new Set(bounded.revoke), new Set(["blob:old", "blob:two"]), "invalid and over-budget poster URLs must retire exactly")

const stable = reconcileShelfPosterRecords(bounded.keep, valid, [newKey], 1)
assert.deepEqual([...stable.keep], [...bounded.keep])
assert.deepEqual(stable.revoke, [])
assert.throws(() => reconcileShelfPosterRecords(new Map(), new Set(), [], -1), /limit/)

console.log("Verified Shelf poster cache: source-keyed replacement, observation priority, deterministic bound, and exact URL retirement.")
