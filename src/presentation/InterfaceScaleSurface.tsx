import * as React from "react"
import { createBrowserPresentationAdapter } from "./browserPresentationAdapter"
import {
    coerceInterfaceScale,
    DEFAULT_INTERFACE_SCALE,
    INTERFACE_SCALE_STEP,
    MAX_INTERFACE_SCALE,
    MIN_INTERFACE_SCALE,
    type InterfaceScale,
} from "./interfaceScale"

type InterfaceScaleContextValue = Readonly<{
    interfaceScale: InterfaceScale
    setInterfaceScale(value: InterfaceScale): void
    resetInterfaceScale(): void
}>

const InterfaceScaleContext = React.createContext<InterfaceScaleContextValue | null>(null)

export function InterfaceScaleSurface({ children }: React.PropsWithChildren) {
    const adapter = React.useMemo(() => createBrowserPresentationAdapter(), [])
    const snapshot = React.useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot)
    const ratio = snapshot.interfaceScale / 100

    React.useEffect(() => {
        document.documentElement.style.setProperty("--interface-scale-ratio", String(ratio))
        return () => {
            document.documentElement.style.removeProperty("--interface-scale-ratio")
        }
    }, [ratio])

    React.useEffect(() => () => adapter.dispose(), [adapter])

    React.useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.altKey) return
            if (!["+", "=", "-", "_", "0"].includes(event.key)) return
            event.preventDefault()
            if (event.key === "0") {
                adapter.resetInterfaceScale()
                return
            }
            const direction = event.key === "+" || event.key === "=" ? 1 : -1
            adapter.setInterfaceScale(coerceInterfaceScale(snapshot.interfaceScale + direction * INTERFACE_SCALE_STEP))
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [adapter, snapshot.interfaceScale])

    const value = React.useMemo<InterfaceScaleContextValue>(() => ({
        interfaceScale: snapshot.interfaceScale,
        setInterfaceScale: adapter.setInterfaceScale,
        resetInterfaceScale: adapter.resetInterfaceScale,
    }), [adapter, snapshot.interfaceScale])

    return (
        <InterfaceScaleContext.Provider value={value}>
            <div
                className="interface-scale-viewport"
                data-interface-scale={snapshot.interfaceScale}
                style={{
                    "--interface-scale-ratio": ratio,
                    "--interface-scale-extent": `${100 / ratio}%`,
                } as React.CSSProperties}
            >
                <div className="interface-scale-surface">{children}</div>
            </div>
        </InterfaceScaleContext.Provider>
    )
}

function useInterfaceScale() {
    const value = React.useContext(InterfaceScaleContext)
    if (!value) throw new Error("Interface Scale control must be rendered inside InterfaceScaleSurface.")
    return value
}

export function InterfaceScaleControl() {
    const { interfaceScale, setInterfaceScale, resetInterfaceScale } = useInterfaceScale()
    const decrease = () => setInterfaceScale(coerceInterfaceScale(interfaceScale - INTERFACE_SCALE_STEP))
    const increase = () => setInterfaceScale(coerceInterfaceScale(interfaceScale + INTERFACE_SCALE_STEP))

    return (
        <div className="interface-scale-control" role="group" aria-label="Interface Scale">
            <button
                type="button"
                aria-label="Decrease Interface Scale"
                title="Decrease Interface Scale"
                disabled={interfaceScale === MIN_INTERFACE_SCALE}
                onClick={decrease}
            >
                <span aria-hidden="true">−</span>
            </button>
            <button
                className="interface-scale-value"
                type="button"
                aria-label={`Interface Scale ${interfaceScale} percent. Reset to ${DEFAULT_INTERFACE_SCALE} percent.`}
                title="Reset Interface Scale"
                disabled={interfaceScale === DEFAULT_INTERFACE_SCALE}
                onClick={resetInterfaceScale}
            >
                {interfaceScale}%
            </button>
            <button
                type="button"
                aria-label="Increase Interface Scale"
                title="Increase Interface Scale"
                disabled={interfaceScale === MAX_INTERFACE_SCALE}
                onClick={increase}
            >
                <span aria-hidden="true">+</span>
            </button>
        </div>
    )
}
