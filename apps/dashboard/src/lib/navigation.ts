import {
    ComputerIcon,
    DoorOpenIcon,
    HomeIcon,
    type LucideIcon,
    ZapIcon,
} from 'lucide-react'

type NavigationItem = {
    label: string
    icon: LucideIcon
    href: string
}

export const navigation: NavigationItem[] = [
    {
        label: 'Home',
        icon: HomeIcon,
        href: '/',
    },
    {
        label: 'Devices',
        icon: ComputerIcon,
        href: '/devices',
    },
    {
        label: 'Rooms',
        icon: DoorOpenIcon,
        href: '/rooms',
    },
    {
        label: 'Energy',
        icon: ZapIcon,
        href: '/energy',
    },
]
