import type { Icon as PhosphorComponent, IconWeight } from "@phosphor-icons/react"
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown"
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check"
import { CircleIcon } from "@phosphor-icons/react/dist/csr/Circle"
import { DotsSixVerticalIcon } from "@phosphor-icons/react/dist/csr/DotsSixVertical"
import { FilmStripIcon } from "@phosphor-icons/react/dist/csr/FilmStrip"
import { FolderOpenIcon } from "@phosphor-icons/react/dist/csr/FolderOpen"
import { MinusIcon } from "@phosphor-icons/react/dist/csr/Minus"
import { MoonIcon } from "@phosphor-icons/react/dist/csr/Moon"
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play"
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus"
import { SkipForwardIcon } from "@phosphor-icons/react/dist/csr/SkipForward"
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle"
import { SunIcon } from "@phosphor-icons/react/dist/csr/Sun"
import { SpeakerSlashIcon } from "@phosphor-icons/react/dist/csr/SpeakerSlash"
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash"
import { XIcon } from "@phosphor-icons/react/dist/csr/X"

const ICONS = {
    "caret-down": CaretDownIcon,
    check: CheckIcon,
    close: XIcon,
    film: FilmStripIcon,
    folder: FolderOpenIcon,
    grip: DotsSixVerticalIcon,
    minus: MinusIcon,
    moon: MoonIcon,
    mute: SpeakerSlashIcon,
    play: PlayIcon,
    plus: PlusIcon,
    skip: SkipForwardIcon,
    spark: SparkleIcon,
    sun: SunIcon,
    trash: TrashIcon,
} satisfies Record<string, PhosphorComponent>

type Props = {
    name: string
    size?: number
    weight?: IconWeight
}

export default function Icon({ name, size = 16, weight = "regular" }: Props) {
    const Component = ICONS[name as keyof typeof ICONS] ?? CircleIcon
    return (
        <Component
            size={size}
            weight={weight}
            aria-hidden="true"
            focusable="false"
            data-phosphor-icon={name}
        />
    )
}
