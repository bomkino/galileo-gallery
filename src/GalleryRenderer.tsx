import * as React from "react"
import type { MediaItem, ReelConfig } from "./types"
import { galleryStyle } from "./styleRegistry"
import { styleCycleDuration, styleProfile } from "./styleProfiles"
import { sceneClock, sceneFinaleIndex } from "./storyTiming"

type Props = {
    config: ReelConfig
    timeMs: number
    durationMs: number
    exportFrames?: Record<number, string>
    terminal?: boolean
}

type Pose = {
    x: number
    y: number
    z: number
    width: number
    opacity: number
    scale: number
    rotateX: number
    rotateY: number
    rotateZ: number
    depth: number
    origin?: string
    filter?: string
    clipPath?: string
}

const TAU = Math.PI * 2

function clamp(value: number, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value))
}

function fract(value: number) {
    return value - Math.floor(value)
}

function mod(value: number, count: number) {
    return ((value % count) + count) % count
}

function wrap(value: number, count: number) {
    let next = value
    while (next > count / 2) next -= count
    while (next < -count / 2) next += count
    return next
}

function mix(from: number, to: number, amount: number) {
    return from + (to - from) * amount
}

function smoothstep(from: number, to: number, value: number) {
    const amount = clamp((value - from) / Math.max(0.0001, to - from))
    return amount * amount * (3 - 2 * amount)
}

function smootherstep(value: number) {
    const amount = clamp(value)
    return amount * amount * amount * (amount * (amount * 6 - 15) + 10)
}

function seeded(index: number, salt: number) {
    return fract(Math.sin((index + 1) * 91.17 + salt * 37.71) * 43758.5453)
}

function pose(patch: Partial<Pose> = {}): Pose {
    return { x: 50, y: 50, z: 0, width: 38, opacity: 1, scale: 1, rotateX: 0, rotateY: 0, rotateZ: 0, depth: 0, ...patch }
}

function mixPose(from: Pose, to: Pose, amount: number): Pose {
    return {
        x: mix(from.x, to.x, amount),
        y: mix(from.y, to.y, amount),
        z: mix(from.z, to.z, amount),
        width: mix(from.width, to.width, amount),
        opacity: mix(from.opacity, to.opacity, amount),
        scale: mix(from.scale, to.scale, amount),
        rotateX: mix(from.rotateX, to.rotateX, amount),
        rotateY: mix(from.rotateY, to.rotateY, amount),
        rotateZ: mix(from.rotateZ, to.rotateZ, amount),
        depth: mix(from.depth, to.depth, amount),
        origin: amount < 0.5 ? from.origin : to.origin,
        filter: amount < 0.5 ? from.filter : to.filter,
        clipPath: amount < 0.5 ? from.clipPath : to.clipPath,
    }
}

function focusWeight(index: number, active: number, count: number) {
    const distance = Math.abs(wrap(index - active, count))
    return distance >= 1 ? 0 : 0.5 + Math.cos(distance * Math.PI) * 0.5
}

function edgeFade(offset: number, count: number) {
    const edge = Math.max(1.5, count / 2 - 0.25)
    return 1 - smoothstep(edge - 0.75, edge, Math.abs(offset))
}

function stackPose(id: string, index: number, count: number, active: number, direction: number): Pose {
    const step = Math.floor(active)
    const amount = smootherstep(fract(active))
    const role = mod(index - step, count)
    const nextRole = mod(role - 1, count)
    const visible = Math.min(5, Math.max(2, count - 1))
    const hero = id === "hero-deck-object"
    const calm = id === "the-stack"

    const rolePose = (value: number) => {
        if (value >= visible) return pose({ x: 50, y: 56, z: -260, width: hero ? 48 : calm ? 50 : 46, opacity: 0, scale: 0.78, depth: -260 })
        const spacing = hero ? 1.2 : calm ? 1.05 : 1.55
        const turn = hero ? 2.2 : calm ? 1.7 : -3.4
        return pose({
            x: 50 + value * spacing,
            y: 50 + value * spacing * 0.82,
            z: -value * (hero ? 52 : 38),
            width: hero ? 48 : calm ? 50 : 46,
            opacity: 1 - value * 0.11,
            scale: 1 - value * (hero ? 0.046 : 0.035),
            rotateZ: (value - 1.6) * turn,
            depth: 100 - value * 24,
        })
    }

    if (role === 0 && nextRole === count - 1) {
        const exit = smootherstep(amount)
        const arc = Math.sin(amount * Math.PI)
        const distance = calm ? 42 : hero ? 50 : 66
        return pose({
            ...rolePose(0),
            x: 50 + direction * distance * exit,
            y: 50 - arc * (calm ? 8 : 13) + exit * exit * 17,
            z: 80 + arc * 90,
            opacity: 1 - smoothstep(0.62, 0.98, amount),
            scale: 1 - exit * 0.04,
            rotateY: direction * exit * (hero ? 12 : 7),
            rotateZ: rolePose(0).rotateZ + direction * exit * (calm ? 13 : 24),
            depth: 140 - exit * 360,
        })
    }

    return mixPose(rolePose(role), rolePose(nextRole), amount)
}

function linearPose(id: string, index: number, count: number, phase: number, gap: number, axis: "horizontal" | "vertical"): Pose {
    if (id === "filmstrip-river") {
        const lane = index % 2
        const laneCount = Math.ceil(count / 2)
        const laneIndex = Math.floor(index / 2)
        const offset = wrap(laneIndex - phase * laneCount * (lane ? -1 : 1), laneCount)
        return pose({ x: 50 + offset * (40 + gap * 0.055), y: lane ? 69 : 31, width: 29, opacity: edgeFade(offset, laneCount), rotateZ: lane ? 1.5 : -1.5, depth: 10 })
    }

    const active = phase * count
    const offset = wrap(index - active, count)
    const fade = edgeFade(offset, count)
    const focus = focusWeight(index, active, count)

    if (id === "wave-ticker") {
        const wave = (index / count + phase) * TAU
        return pose({ x: 50 + offset * (30 + gap * 0.045), y: 50 + Math.sin(wave) * 13, width: 23, opacity: fade, scale: 0.96 + focus * 0.04, rotateZ: Math.cos(wave) * 8, depth: Math.sin(wave) * 18 })
    }
    if (id === "the-shelf") {
        return pose({ x: 50 + offset * (31 + gap * 0.05), y: 61 - focus * 4, z: -Math.abs(offset) * 34, width: 26, opacity: fade, scale: 0.94 + focus * 0.06, rotateY: offset * -8, rotateZ: offset * 1.2, depth: 70 - Math.abs(offset) * 18, origin: "50% 100%" })
    }
    if (id === "deck-contact-strip") {
        return pose({ x: 50 + offset * (29 + gap * 0.05), y: 52 - focus * 4, z: focus * 34, width: 24, opacity: fade * (0.64 + focus * 0.36), scale: 0.94 + focus * 0.06, depth: focus * 60, filter: `brightness(${0.78 + focus * 0.22})` })
    }

    const vertical = id === "cms-slideshow" && axis === "vertical"
    return pose({
        x: vertical ? 50 : 50 + offset * (39 + gap * 0.05),
        y: vertical ? 50 + offset * (34 + gap * 0.04) : 50,
        z: focus * 46 - Math.abs(offset) * 20,
        width: vertical ? 40 : 34,
        opacity: fade * (0.58 + focus * 0.42),
        scale: 0.9 + focus * 0.1,
        depth: focus * 70 - Math.abs(offset) * 10,
        filter: `brightness(${0.7 + focus * 0.3})`,
    })
}

function orbitPose(id: string, index: number, count: number, phase: number): Pose {
    if (id === "the-orrery" && index === 0) {
        return pose({ width: 34, z: 35, scale: 1 + Math.sin(phase * TAU) * 0.008, rotateZ: Math.sin(phase * TAU) * 0.8, depth: 125, filter: "brightness(1.04) drop-shadow(0 0 28px rgba(255,157,92,.18))" })
    }

    if (id === "the-orrery") {
        const ring = 1 + ((index - 1) % 3)
        const signed = ring % 2 ? 1 : -0.68
        const meanAngle = (index / Math.max(1, count - 1) + phase * signed + ring * 0.07) * TAU
        const angle = meanAngle + Math.sin(meanAngle) * (0.1 + ring * 0.025)
        const front = Math.sin(angle)
        const radiusX = 17 + ring * 9
        const radiusY = 4.5 + ring * 2.7
        const gravity = 1 - Math.pow(Math.abs(Math.cos(angle)), 0.72)
        return pose({
            x: 50 + Math.cos(angle) * radiusX,
            y: 50 + front * radiusY + Math.cos(angle) * (ring - 2) * 2.2,
            z: front * 210 - ring * 14,
            width: 10 + ring * 1.8,
            opacity: 0.48 + (front + 1) * 0.25,
            scale: 0.7 + (front + 1) * 0.13 + gravity * 0.035,
            rotateX: Math.cos(angle) * (4 + ring * 1.5),
            rotateY: Math.cos(angle) * -10,
            rotateZ: Math.cos(angle) * (5 + ring),
            depth: front * 235 - ring * 8,
            filter: `brightness(${0.62 + (front + 1) * 0.23})`,
        })
    }

    if (id === "spiral-image-vortex") {
        const t = count <= 1 ? 0.5 : index / (count - 1)
        const angle = (t * 2.25 + phase) * TAU
        const radius = 8 + t * 35
        const depth = Math.sin(angle)
        return pose({ x: 50 + Math.cos(angle) * radius, y: 50 + depth * radius * 0.58, z: depth * 170 + t * 30, width: 14 + t * 6, opacity: 0.48 + (depth + 1) * 0.24, scale: 0.74 + t * 0.2 + (depth + 1) * 0.05, rotateZ: angle * 180 / Math.PI + 90, depth: depth * 120 + t * 12 })
    }

    const angle = (index / count + phase) * TAU
    const front = Math.sin(angle)
    const zoetrope = id === "zoetrope"
    const proximity = id === "proximity-orbit"
    const spin = id === "spin-image-orbit"
    const radiusX = zoetrope ? 39 : spin ? 38 : proximity ? 34 : 35
    const radiusY = zoetrope ? 3 : spin ? 17 : proximity ? 25 : 21
    const swell = proximity ? 0.2 : 0.13
    return pose({
        x: 50 + Math.cos(angle) * radiusX,
        y: 50 + front * radiusY,
        z: front * (zoetrope ? 220 : 170),
        width: zoetrope ? 20 : spin ? 17 : proximity ? 19 : 20,
        opacity: 0.44 + (front + 1) * 0.28,
        scale: 0.76 + (front + 1) * swell,
        rotateY: zoetrope ? angle * 180 / Math.PI : Math.cos(angle) * -18,
        rotateZ: zoetrope ? -4 : spin ? Math.cos(angle) * -18 : 0,
        depth: front * 150,
        filter: `brightness(${0.58 + (front + 1) * 0.24})`,
    })
}

function gridPose(id: string, index: number, count: number, phase: number): Pose {
    const active = phase * count
    const focus = focusWeight(index, active, count)
    const columns = 3
    const rows = Math.ceil(count / columns)
    const column = index % columns
    const row = Math.floor(index / columns)
    const light = id === "light-table"
    return pose({
        x: 22 + column * 28,
        y: 18 + (row + 0.5) * (64 / rows) - focus * 2.5,
        z: focus * 45,
        width: light ? 22 : 21,
        opacity: (light ? 0.78 : 0.68) + focus * 0.22,
        scale: 0.96 + focus * 0.04,
        rotateZ: (seeded(index, 4) - 0.5) * (light ? 5 : 2.5) + Math.sin(phase * TAU + index) * (light ? 0.5 : 0.25),
        depth: focus * 70 + seeded(index, 2) * 5,
        filter: light ? `brightness(${0.9 + focus * 0.14}) drop-shadow(0 0 ${7 + focus * 10}px rgba(255,214,124,.2))` : `brightness(${0.8 + focus * 0.2})`,
    })
}

function freePose(id: string, index: number, count: number, phase: number): Pose {
    const active = phase * count
    const focus = focusWeight(index, active, count)
    if (id === "the-hang") {
        const spread = count <= 1 ? 0 : (index / (count - 1) - 0.5) * 72
        const pivot = 21 + Math.pow(spread / 44, 2) * 12
        return pose({ x: 50 + spread, y: pivot + 27, z: focus * 35, width: 20, opacity: 0.82 + focus * 0.18, scale: 0.97 + focus * 0.03, rotateZ: spread * 0.1 + Math.sin(phase * TAU + index * 0.72) * 2.2, depth: focus * 60 + 10, origin: "50% -55%" })
    }
    const lively = id === "image-scatter-gallery"
    const livelySlots = [[-34, -19], [-10, -24], [17, -20], [35, -4], [-29, 14], [-3, 16], [25, 17]]
    const driftSlots = [[-27, -12], [1, -18], [27, -4], [-14, 16], [18, 17]]
    const slot = (lively ? livelySlots : driftSlots)[index % (lively ? livelySlots.length : driftSlots.length)]
    const x = slot[0]
    const y = slot[1]
    const breath = lively ? 3.2 : 1.8
    return pose({ x: 50 + x + Math.sin(phase * TAU + index) * breath, y: 50 + y + Math.cos(phase * TAU + index * 0.73) * breath - focus * 2.5, z: focus * 40 + seeded(index, 6) * 12, width: lively ? 18 : 26, opacity: 0.78 + focus * 0.22, scale: 0.9 + seeded(index, 5) * 0.08 + focus * 0.04, rotateZ: (seeded(index, 3) - 0.5) * (lively ? 18 : 11) + Math.sin(phase * TAU + index) * 1.2, depth: seeded(index, 6) * 30 + focus * 50 })
}

function authoredPose(id: string, index: number, count: number, phase: number, gap: number, axis: "horizontal" | "vertical", direction: number): Pose {
    const active = phase * count
    if (["swipe-stack", "the-stack", "hero-deck-object"].includes(id)) return stackPose(id, index, count, active, direction)
    if (["filmstrip-river", "wave-ticker", "the-shelf", "deck-contact-strip", "cms-slideshow"].includes(id)) return linearPose(id, index, count, phase, gap, axis)
    if (["orbit-ring", "proximity-orbit", "spin-image-orbit", "zoetrope", "the-orrery", "spiral-image-vortex"].includes(id)) return orbitPose(id, index, count, phase)
    if (["contact-sheet", "light-table"].includes(id)) return gridPose(id, index, count, phase)
    if (["drift-deck", "image-scatter-gallery", "the-hang"].includes(id)) return freePose(id, index, count, phase)

    if (id === "vitrine") {
        const distance = Math.abs(wrap(index - active, count))
        const weight = distance >= 1 ? 0 : 0.5 + Math.cos(distance * Math.PI) * 0.5
        return pose({ x: 50 + wrap(index - active, count) * 5, y: 50 - weight * 1.5, z: weight * 55, width: 52, opacity: weight, scale: 0.96 + weight * 0.04, rotateY: Math.sin(phase * TAU) * 5, depth: weight * 100, filter: `brightness(${0.76 + weight * 0.24}) drop-shadow(0 18px 28px rgba(0,0,0,.3))` })
    }
    if (id === "before-after-slider") return pose({ width: 66, depth: 20 })
    if (id === "slide-fan" || id === "dealers-fan") {
        const spread = count <= 1 ? 0 : index / (count - 1) - 0.5
        const focus = focusWeight(index, active, count)
        const dealer = id === "dealers-fan"
        return pose({ x: 50 + spread * (dealer ? 42 : 32), y: (dealer ? 69 : 65) - Math.abs(spread) * 10 - focus * 6, z: focus * 55, width: dealer ? 32 : 30, opacity: 0.88 + focus * 0.12, scale: 0.94 + focus * 0.06, rotateZ: spread * (dealer ? 48 : 42), depth: index + focus * 60, origin: `50% ${dealer ? 138 : 118}%` })
    }
    if (id === "coverflow-gallery") {
        const offset = wrap(index - active, count)
        const distance = Math.abs(offset)
        const focus = focusWeight(index, active, count)
        return pose({ x: 50 + offset * (38 + gap * 0.05), z: -distance * 180 + focus * 45, width: 34, opacity: edgeFade(offset, count) * (0.58 + focus * 0.42), scale: 0.86 + focus * 0.14, rotateY: clamp(offset, -1, 1) * -46, depth: focus * 110 - distance * 25, filter: `brightness(${0.68 + focus * 0.32})` })
    }
    if (id === "deck-river" || id === "deck-river-loader") {
        const progress = fract(index / count - phase)
        const travel = progress * 2 - 1
        const near = 1 - Math.abs(travel)
        const edge = smoothstep(0, 0.16, progress) * (1 - smoothstep(0.84, 1, progress))
        const reveal = id === "deck-river-loader" ? 0.85 + near * 0.15 : 1
        return pose({ x: 50 + Math.sin(index * 1.7 + phase * TAU) * 12 * (1 - near * 0.55), y: 50 + travel * 73, z: -230 + near * 360, width: 42, opacity: edge * clamp(near * 1.7) * reveal, scale: 0.58 + near * 0.44, rotateZ: Math.sin(index * 1.3) * 4 * (1 - near), depth: near * 160 - Math.abs(travel) * 40, filter: `brightness(${0.6 + near * 0.4})` })
    }
    if (id === "slide-anatomy-object") {
        const activeIndex = Math.min(count - 1, Math.floor(phase * count))
        const localPhase = fract(phase * count)
        if (index !== activeIndex) return pose({ width: 58, opacity: 0, scale: 0.9, depth: -200 })
        const assembly = 0.5 - Math.cos(localPhase * TAU) * 0.5
        const settle = smootherstep(assembly)
        return pose({ x: 50, y: 50 + (1 - settle) * 7, z: settle * 55, width: 58, opacity: 0.82 + settle * 0.18, scale: 0.9 + settle * 0.1, rotateX: (1 - settle) * 8, rotateZ: (1 - settle) * 2, depth: 80 + settle * 30, filter: `brightness(${0.82 + settle * 0.18})` })
    }
    if (id === "the-build") {
        const activeIndex = Math.min(count - 1, Math.floor(phase * count))
        const localPhase = fract(phase * count)
        if (index !== activeIndex) return pose({ width: 60, opacity: 0, scale: 0.94, depth: -200 })
        const settle = smootherstep(clamp(localPhase / 0.72))
        const entrance = smoothstep(0, 0.055, localPhase)
        const exit = 1 - smoothstep(0.9, 1, localPhase)
        return pose({ x: 50, y: 50 + (1 - settle) * 5, z: settle * 50, width: 60, opacity: entrance * exit, scale: 0.94 + settle * 0.06, rotateX: (1 - settle) * 6, rotateZ: (1 - settle) * -2, depth: 90 + settle * 35, filter: `brightness(${0.86 + settle * 0.14})` })
    }
    return linearPose("cms-slideshow", index, count, phase, gap, axis)
}

function itemRatio(item: MediaItem, config: ReelConfig) {
    const settings = config.settings
    if (item.aspectMode === "custom") return `${Math.max(1, item.ratioW ?? 16)} / ${Math.max(1, item.ratioH ?? 9)}`
    if (item.aspectMode === "global" && settings.ratioMode === "fixed") {
        if (settings.fixedRatio === "wide2576") return "2576 / 1080"
        if (settings.fixedRatio === "custom") return `${Math.max(1, settings.customRatioWidth)} / ${Math.max(1, settings.customRatioHeight)}`
        return "16 / 9"
    }
    return `${item.ratio || 16 / 9} / 1`
}

function Placeholder({ index }: { index: number }) {
    return <div className="galileo-placeholder"><span>FRAME</span><strong>{String(index + 1).padStart(2, "0")}</strong></div>
}

function SyncedVideo({ item, timeMs, autoplay, loop, fit }: { item: MediaItem; timeMs: number; autoplay: boolean; loop: boolean; fit: "contain" | "cover" }) {
    const ref = React.useRef<HTMLVideoElement | null>(null)
    React.useEffect(() => {
        const video = ref.current
        if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return
        const target = loop ? (timeMs / 1000) % video.duration : Math.min(timeMs / 1000, video.duration)
        if (Math.abs(video.currentTime - target) > 0.12) video.currentTime = target
    }, [loop, timeMs])
    return <video ref={ref} className="galileo-media" src={item.previewUrl ?? item.url} muted autoPlay={autoplay} loop={loop} playsInline preload="metadata" style={{ objectFit: fit }} />
}

function Media({ item, index, frame, fit, autoplay, loop, timeMs }: { item: MediaItem; index: number; frame?: string; fit: "contain" | "cover"; autoplay: boolean; loop: boolean; timeMs: number }) {
    if (frame) return <img className="galileo-media orl-export-frame" src={frame} alt="" draggable={false} style={{ objectFit: fit }} />
    if (!item.url) return <Placeholder index={index} />
    if (item.type === "video") return <SyncedVideo item={item} timeMs={timeMs} autoplay={autoplay} loop={loop} fit={fit} />
    return <img className="galileo-media" src={item.url} alt={item.name} draggable={false} style={{ objectFit: fit }} />
}

function transformFor(value: Pose, extraScale: number, lift: number) {
    return `translate3d(-50%,-50%,0) translate3d(0,${-lift}%,${value.z}px) rotateX(${value.rotateX}deg) rotateY(${value.rotateY}deg) rotateZ(${value.rotateZ}deg) scale(${value.scale * extraScale})`
}

export default function GalleryRenderer({ config, timeMs, durationMs, exportFrames = {}, terminal = false }: Props) {
    const style = galleryStyle(config.styleId)
    const profile = styleProfile(config.styleId)
    const settings = config.settings
    const placeholders = Array.from({ length: profile.recommendedItems }, (_, index) => ({ id: `placeholder-${index}`, name: `Frame ${index + 1}`, type: "image" as const, url: "", ratio: 16 / 9, caption: "", spotlight: false, muted: false }))
    const source = config.items.length ? config.items : placeholders
    const clockConfig = config.items.length ? config : { ...config, items: source }
    const slotCount = profile.renderSlots ?? source.length
    const items = Array.from({ length: slotCount }, (_, index) => ({ item: source[index % source.length], sourceIndex: index % source.length, slotIndex: index }))
    const baseDuration = styleCycleDuration(style.id, source.length, settings)
    const clock = sceneClock(clockConfig, timeMs, baseDuration, terminal)
    const rawPhase = clock.rawPhase
    const direction = settings.direction === "reverse" ? -1 : 1
    const phase = direction < 0 ? fract(1 - rawPhase) : rawPhase
    const sourceActive = phase * source.length
    const focusAt = (index: number) => clock.heldIndex === index ? 1 : focusWeight(index, sourceActive, source.length)
    const finaleIndex = sceneFinaleIndex(source)
    const roomFocus = source.reduce((value, item, index) => Math.max(value, ((settings.spotlightsEnabled && item.spotlight) || (settings.finaleEnabled && index === finaleIndex)) && !item.muted ? focusAt(index) : 0), 0)
    const ground = settings.ground || (settings.theme === "light" ? "#ece9df" : "#11110f")
    const paper = settings.paper || (settings.theme === "light" ? "#fffdf7" : "#292722")
    const paddingScale = settings.paddingUnit === "percent" ? 1.6 : 0.16
    const padding = Math.max(settings.paddingTop, settings.paddingRight, settings.paddingBottom, settings.paddingLeft) * paddingScale
    const frameScale = clamp(settings.slideHeight / Number(profile.settings.slideHeight ?? 44), 0.45, 1.65)
    const cornerShape = settings.cornerStyle === "squircle" ? `superellipse(${1 + clamp(settings.cornerSmoothing, 0, 100) / 60})` : "round"
    const compareSweep = 46 + Math.sin(rawPhase * TAU) * 12
    const authoredObjectPhase = fract(rawPhase * source.length)
    const assembly = style.id === "the-build" ? smootherstep(clamp(authoredObjectPhase / 0.72)) : style.id === "slide-anatomy-object" ? 0.5 - Math.cos(authoredObjectPhase * TAU) * 0.5 : 0
    const compareBefore = source[0]
    const compareAfter = source[1] ?? source[0]
    const compareRatio = itemRatio(compareAfter, config)
    const compareFinale = settings.finaleEnabled && clock.heldKind === "finale"

    return (
        <div className={`galileo-renderer galileo-style-${style.id} galileo-mode-${style.mode} galileo-bg-${settings.backgroundStyle}`} style={{ "--galileo-ground": ground, "--galileo-paper": paper, "--galileo-accent": style.accent, "--galileo-second": settings.backgroundColor2, "--galileo-angle": `${settings.backgroundAngle}deg`, "--galileo-grid": `${settings.gridSize}px`, "--galileo-grid-alpha": settings.gridStrength / 100, "--galileo-shadow-alpha": (settings.shadow / 100) * 0.72, "--galileo-corner": cornerShape, "--galileo-assembly": assembly, "--galileo-layer-opacity": (1 - assembly) * 0.52, "--galileo-layer-x1": `${mix(-13, 0, assembly)}%`, "--galileo-layer-y1": `${mix(-17, 0, assembly)}%`, "--galileo-layer-x2": `${mix(15, 0, assembly)}%`, "--galileo-layer-y2": `${mix(2, 0, assembly)}%`, "--galileo-layer-x3": `${mix(-5, 0, assembly)}%`, "--galileo-layer-y3": `${mix(18, 0, assembly)}%` } as React.CSSProperties}>
            <div className="galileo-grid" />
            <div className="galileo-orbit-mark" aria-hidden="true"><span /><i /></div>
            {style.id === "before-after-slider" ? (
                <div className={`galileo-compare-card ${compareFinale ? "is-finale" : ""}`} style={{ width: `${66 * frameScale}%`, aspectRatio: compareRatio, padding: `${padding}px`, borderRadius: `${settings.radius}px`, transform: `translate(-50%,-50%) scale(${compareFinale ? 1 + clock.flourish * 0.04 : 1})` }}>
                    <div className="galileo-compare-pane is-after"><Media item={compareAfter} index={1} frame={exportFrames[1]} fit={settings.imageFit} autoplay={settings.autoplayVideos} loop={settings.loopVideos} timeMs={timeMs} /></div>
                    <div className="galileo-compare-pane is-before" style={{ clipPath: `inset(0 ${100 - compareSweep}% 0 0)` }}><Media item={compareBefore} index={0} frame={exportFrames[0]} fit={settings.imageFit} autoplay={settings.autoplayVideos} loop={settings.loopVideos} timeMs={timeMs} /></div>
                    <span className="galileo-compare-label is-before">{compareBefore.caption || "Before"}</span>
                    <span className="galileo-compare-label is-after">{compareAfter.caption || "After"}</span>
                    <div className="galileo-compare-handle" style={{ left: `${compareSweep}%` }}><span /></div>
                </div>
            ) : null}
            {items.map(({ item, sourceIndex, slotIndex }, index) => {
                if (style.id === "before-after-slider") return null
                const value = authoredPose(style.id, index, items.length, phase, settings.gap, settings.axis, direction)
                const spotlight = profile.supportsSpotlight && settings.spotlightsEnabled && item.spotlight && !item.muted
                const finale = profile.supportsFinale && settings.finaleEnabled && sourceIndex === finaleIndex && slotIndex === sourceIndex && !item.muted
                const storyStrength = spotlight || finale ? focusAt(sourceIndex) : 0
                const focusScale = 1 + storyStrength * clamp(settings.centerBump / 100 + 0.04, 0.04, 0.12)
                const focusLift = ["lift", "glow", "reveal"].includes(profile.focusBehavior) ? storyStrength * 4 : 0
                const roomOpacity = storyStrength > 0 ? 1 : 1 - Math.min(0.35, settings.spotlightDim / 100) * roomFocus
                const compareClip = style.id === "before-after-slider" && index === 0 ? `inset(0 ${100 - compareSweep}% 0 0)` : value.clipPath
                const focusedFilter = storyStrength > 0 && profile.focusBehavior === "glow" ? `${value.filter ?? ""} brightness(${1 + storyStrength * 0.12}) drop-shadow(0 0 ${10 + storyStrength * 14}px rgba(255,184,126,.24))` : value.filter
                return (
                    <div className={`galileo-card ${style.id === "the-orrery" && sourceIndex === 0 ? "is-orrery-star" : ""} ${focusAt(sourceIndex) > 0.5 ? "is-active" : ""} ${storyStrength > 0 ? "is-story-focus" : ""}`} key={`${item.id}-${slotIndex}`} style={{ left: `${value.x}%`, top: `${value.y}%`, width: `${value.width * frameScale}%`, opacity: value.opacity * roomOpacity, zIndex: Math.round(500 + value.depth + storyStrength * 80), transform: transformFor(value, focusScale, focusLift), transformOrigin: value.origin, clipPath: compareClip, filter: focusedFilter, aspectRatio: itemRatio(item, config), padding: `${padding}px`, borderRadius: `${settings.radius}px` }}>
                        {(style.id === "slide-anatomy-object" || style.id === "the-build") ? <div className="galileo-assembly-layers" aria-hidden="true"><i /><i /><i /></div> : null}
                        <Media item={item} index={index} frame={exportFrames[sourceIndex]} fit={settings.imageFit} autoplay={settings.autoplayVideos} loop={settings.loopVideos} timeMs={timeMs} />
                        {item.caption ? <span className="galileo-caption" style={{ top: `calc(100% + ${settings.captionGap}px)` }}>{item.caption}</span> : null}
                        {style.id === "slide-anatomy-object" || style.id === "the-build" ? <div className="galileo-guides"><span /><span /><span /></div> : null}
                        {style.id === "the-build" ? <><div className="galileo-build-wireframe" aria-hidden="true"><i /><i /><i /></div><div className="galileo-build-palette" aria-hidden="true"><i /><i /><i /></div><div className="galileo-build-stamp" aria-hidden="true">READY</div></> : null}
                    </div>
                )
            })}
            {style.id === "the-build" ? <div className="galileo-build-cursor" style={{ left: `${mix(10, 78, assembly)}%`, top: `${mix(20, 38, assembly) + Math.sin(assembly * Math.PI * 4) * 12}%`, opacity: 1 - smoothstep(0.62, 0.72, authoredObjectPhase) }} aria-hidden="true"><i /></div> : null}
            <div className="galileo-vignette" style={{ opacity: settings.vignette / 45 }} />
        </div>
    )
}
