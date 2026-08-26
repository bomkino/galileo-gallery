import type { ProjectOpenResult, ReelConfig } from "./types"

export function projectConfigAfterOpen(current: ReelConfig, result: ProjectOpenResult): ReelConfig {
    return "config" in result ? result.config : current
}

export function projectOpenNotice(result: ProjectOpenResult): string | null {
    if ("failure" in result) return result.failure.message
    if ("cancelled" in result) return "Project opening cancelled"
    return "Project opened"
}
