import type { ParitySceneContract } from "./paritySupport/types.ts"

type SceneModule = { scene?: ParitySceneContract }

const modules = import.meta.glob<SceneModule>("./parity/*.ts", { eager: true })
const contracts = Object.values(modules).flatMap((module) => module.scene ? [module.scene] : [])
const byId = new Map(contracts.map((contract) => [contract.id, contract]))

if (byId.size !== contracts.length) throw new Error("Duplicate Galileo parity Scene identity")

export function paritySceneContract(id: string | undefined) {
    return id ? byId.get(id) ?? null : null
}

export function paritySceneContracts() {
    return [...contracts]
}
