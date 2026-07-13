export const ControlType = new Proxy(
    {},
    { get: (_target, property) => String(property) }
) as Record<string, string>

export function addPropertyControls(_component?: unknown, _controls?: unknown): void {
    // Property controls belong to Framer. Standalone app owns its own inspector.
}

export const RenderTarget = {
    canvas: "canvas",
    preview: "preview",
    current: () => "preview",
}

export function useIsStaticRenderer(): boolean {
    return (
        new URLSearchParams(window.location.search).has("export") ||
        document.documentElement.dataset.reelStatic === "true"
    )
}
