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
        href: '/dashboard',
    },
    {
        label: 'Devices',
        icon: ComputerIcon,
        href: '/dashboard/devices',
    },
    {
        label: 'Settings',
        icon: SettingsIcon,
        href: '/dashboard/settings',
    },
]
