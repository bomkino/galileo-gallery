import type { ProjectOpenResult, ReelConfig } from "./types"

export type ProjectMutationLane = {
    run<T>(work: () => Promise<T>): Promise<T>
}

export function createProjectMutationLane(): ProjectMutationLane {
    let tail: Promise<void> = Promise.resolve()
    return {
        run<T>(work: () => Promise<T>) {
            const result = tail.then(work, work)
            tail = result.then(() => undefined, () => undefined)
            return result
        },
    }
}

type DecoderAdmissionGate = {
    unmount(): void
    paint(): Promise<void>
    remount(): void
}

export async function withDecoderAdmissionGate<T>(gate: DecoderAdmissionGate, work: () => Promise<T>): Promise<T> {
    gate.unmount()
    try {
        await gate.paint()
        await gate.paint()
        return await work()
    } finally {
        gate.remount()
    }
}

type ShelfAdmissionItem = {
    id: string
    name: string
    type: "image" | "video"
    url: string
    ratio: number
}

type ShelfAdmissionProof = {
    id: string
    url: string
    width: number
    height: number
}

export async function admitShelfMediaItems<T extends ShelfAdmissionItem>(
    items: readonly T[],
    admit: (sources: readonly T[]) => Promise<readonly ShelfAdmissionProof[]>
): Promise<T[]> {
    const proofs = await admit(items)
    const byIdentity = new Map(proofs.map((proof) => [`${proof.id}\0${proof.url}`, proof]))
    return items.map((item) => {
        if (item.type !== "video") return item
        const proof = byIdentity.get(`${item.id}\0${item.url}`)
        if (!proof || !Number.isFinite(proof.width) || proof.width <= 0 || !Number.isFinite(proof.height) || proof.height <= 0) {
            throw new Error(`Could not admit ${item.name}: decoded-frame proof is missing.`)
        }
        return { ...item, ratio: proof.width / proof.height }
    })
}

export type ProjectOpenApplication =
    | { state: "cancelled"; result: Extract<ProjectOpenResult, { cancelled: true }> }
    | { state: "failure"; result: Extract<ProjectOpenResult, { failure: unknown }> }
    | { state: "stale" }
    | { state: "applied"; config: ReelConfig }

type ProjectOpenTransaction = {
    current(): { config: ReelConfig; epoch: number }
    open(): Promise<ProjectOpenResult>
    normalize(config: ReelConfig): ReelConfig
    cancelled?(): boolean
    stillCurrent(config: ReelConfig, epoch: number): boolean
    accept(operationId: string): Promise<unknown>
    discard(operationId: string): Promise<unknown>
    commit(config: ReelConfig): boolean
}

export async function applyProjectOpenTransaction(transaction: ProjectOpenTransaction): Promise<ProjectOpenApplication> {
    const baseline = transaction.current()
    const result = await transaction.open()
    if ("cancelled" in result) return { state: "cancelled", result }
    if ("failure" in result) return { state: "failure", result }

    let accepted = false
    let retired = false
    const discard = async () => {
        if (retired) return
        retired = true
        await transaction.discard(result.operationId)
    }

    try {
        const next = transaction.normalize(result.config)
        if (transaction.cancelled?.()) {
            await discard().catch(() => undefined)
            return { state: "cancelled", result: { cancelled: true } }
        }
        if (!transaction.stillCurrent(baseline.config, baseline.epoch)) {
            await discard()
            return { state: "stale" }
        }
        await transaction.accept(result.operationId)
        accepted = true
        // No await belongs between host acceptance and renderer-state replacement.
        if (!transaction.commit(next)) throw new Error("Accepted Project could not be applied.")
        return { state: "applied", config: next }
    } catch (error) {
        if (!accepted && !retired) await discard().catch(() => undefined)
        throw error
    }
}

export function projectConfigAfterOpen(current: ReelConfig, result: ProjectOpenResult): ReelConfig {
    return "config" in result ? result.config : current
}

export function projectOpenNotice(result: ProjectOpenResult): string | null {
    if ("failure" in result) return result.failure.message
    if ("cancelled" in result) return "Project opening cancelled"
    return "Project opened"
}
