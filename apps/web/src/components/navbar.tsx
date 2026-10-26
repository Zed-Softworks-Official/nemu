import { Show, UserButton } from '@clerk/nextjs'
import { Button } from '@nemu/ui/components/button'
import { Logo } from '@nemu/ui/components/logo'
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
} from '@nemu/ui/components/navigation-menu'
import Link from 'next/link'
import type { ComponentPropsWithoutRef } from 'react'

type NavLink = {
    title: string
    href: string
    description: string
}

const navSubMenu: NavLink[] = [
    {
        title: 'Why Nemu?',
        href: '#why',
        description: 'Learn why Nemu is the best way to control your home.',
    },
    {
        title: 'How it works',
        href: '#how-it-works',
        description: 'Learn how Nemu works.',
    },
    {
        title: 'Features',
        href: '#features',
        description: 'Learn about the features of Nemu.',
    },
    {
        title: 'Waitlist',
        href: '#waitlist',
        description: 'Join the waitlist for Nemu.',
    },
]

export function Navbar() {
    return (
        <header className="fixed inset-x-0 top-0 z-50 bg-background backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
                <Link className="flex items-center gap-2.5" href="/">
                    <Logo />
                </Link>

                <NavigationMenu>
                    <NavigationMenuList>
                        <NavigationMenuItem>
                            <NavigationMenuTrigger>
                                Getting Started
                            </NavigationMenuTrigger>
                            <NavigationMenuContent>
                                <ul className="w-96">
                                    {navSubMenu.map((link) => (
                                        <ListItem key={link.href} {...link} />
                                    ))}
                                </ul>
                            </NavigationMenuContent>
                        </NavigationMenuItem>
                        <NavigationMenuItem>
                            <NavigationMenuLink asChild>
                                <Link href="https://github.com/Zed-Softworks-Official/nemu">
                                    GitHub
                                </Link>
                            </NavigationMenuLink>
                        </NavigationMenuItem>
                        <NavigationMenuItem>
                            <Show when={'signed-out'}>
                                <Button asChild variant={'secondary'}>
                                    <NavigationMenuLink asChild>
                                        <Link href="#waitlist">
                                            Join Waitlist
                                        </Link>
                                    </NavigationMenuLink>
                                </Button>
                            </Show>
                            <Show when={'signed-in'}>
                                <UserButton />
                            </Show>
                        </NavigationMenuItem>
                    </NavigationMenuList>
                </NavigationMenu>
            </div>
        </header>
    )
}

function ListItem({
    title,
    href,
    ...props
}: ComponentPropsWithoutRef<'li'> & { href: string }) {
    return (
        <li {...props}>
            <NavigationMenuLink asChild>
                <Link href={href}>
                    <div className="flex flex-col gap-1 text-sm">
                        <div className="font-medium leading-none">{title}</div>
                    </div>
                </Link>
            </NavigationMenuLink>
        </li>
    )
}
