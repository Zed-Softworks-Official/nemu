import {
    ComputerIcon,
    HomeIcon,
    type LucideIcon,
    SettingsIcon,
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
        label: 'Settings',
        icon: SettingsIcon,
        href: '/settings',
    },
]
