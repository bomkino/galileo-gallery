export type ShelfPosterRecord = {
    key: string
    url: string
    touched: number
}

export function shelfPosterKey(item: { id: string; url: string }) {
    return `${item.id}\u0000${item.url}`
}

export function reconcileShelfPosterRecords(
    records: ReadonlyMap<string, ShelfPosterRecord>,
    validKeys: ReadonlySet<string>,
    observedKeys: readonly string[],
    limit: number,
) {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Shelf poster limit is invalid.")
    const rank = new Map(observedKeys.map((key, index) => [key, index]))
    const candidates = [...records.values()]
        .filter((record) => validKeys.has(record.key))
        .sort((left, right) => {
            const leftRank = rank.get(left.key) ?? Number.POSITIVE_INFINITY
            const rightRank = rank.get(right.key) ?? Number.POSITIVE_INFINITY
            return leftRank - rightRank || right.touched - left.touched || left.key.localeCompare(right.key)
        })
    const keep = new Map(candidates.slice(0, limit).map((record) => [record.key, record]))
    const revoke = [...records.values()].filter((record) => !keep.has(record.key)).map((record) => record.url)
    return { keep, revoke }
}
