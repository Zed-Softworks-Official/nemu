'use client'

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
import { Separator } from '@nemu/ui/components/separator'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@nemu/ui/components/sheet'
import { Menu } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

type NavLink = {
    title: string
    href: string
    description: string
}

const navSubMenu: NavLink[] = [
    {
        title: 'Why Nemu?',
        href: '#why',
        description: 'Privacy, local control, and open source.',
    },
    {
        title: 'How it works',
        href: '#how-it-works',
        description: 'A controller at home, and a relay when you leave.',
    },
    {
        title: 'Features',
        href: '#features',
        description: 'Matter, Zigbee, rooms, and the people you invite.',
    },
    {
        title: 'Waitlist',
        href: '#waitlist',
        description: 'Join the waitlist for early access.',
    },
]

const githubHref = 'https://github.com/Zed-Softworks-Official/nemu'

export function Navbar() {
    const [open, setOpen] = useState(false)

    return (
        <header className="not-typeset fixed inset-x-0 top-0 z-50 bg-background backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
                <Link className="flex items-center gap-2.5" href="/">
                    <Logo className="h-10" />
                </Link>

                <NavigationMenu className="hidden md:flex">
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
                                <Link href={githubHref}>GitHub</Link>
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

                <Sheet onOpenChange={setOpen} open={open}>
                    <SheetTrigger asChild>
                        <Button
                            aria-label="Open menu"
                            className="md:hidden"
                            size="icon-sm"
                            variant="ghost"
                        >
                            <Menu />
                        </Button>
                    </SheetTrigger>
                    <SheetContent className="gap-0" side="right">
                        <SheetHeader>
                            <SheetTitle>Menu</SheetTitle>
                            <SheetDescription className="sr-only">
                                Site navigation
                            </SheetDescription>
                        </SheetHeader>
                        <Separator />
                        <nav className="flex flex-col gap-1 px-2 py-2">
                            {navSubMenu.map((link) => (
                                <Button
                                    asChild
                                    className="h-auto justify-start py-2"
                                    key={link.href}
                                    variant="ghost"
                                >
                                    <Link
                                        href={link.href}
                                        onClick={() => setOpen(false)}
                                    >
                                        <span className="flex flex-col items-start gap-1 whitespace-normal text-left">
                                            <span className="leading-none">
                                                {link.title}
                                            </span>
                                            <span className="font-normal text-muted-foreground">
                                                {link.description}
                                            </span>
                                        </span>
                                    </Link>
                                </Button>
                            ))}
                            <Button
                                asChild
                                className="justify-start"
                                variant="ghost"
                            >
                                <Link
                                    href={githubHref}
                                    onClick={() => setOpen(false)}
                                    rel="noopener noreferrer"
                                    target="_blank"
                                >
                                    GitHub
                                </Link>
                            </Button>
                        </nav>
                        <Separator />
                        <SheetFooter>
                            <Show when={'signed-out'}>
                                <Button
                                    asChild
                                    className="w-full"
                                    variant="secondary"
                                >
                                    <Link
                                        href="#waitlist"
                                        onClick={() => setOpen(false)}
                                    >
                                        Join Waitlist
                                    </Link>
                                </Button>
                            </Show>
                            <Show when={'signed-in'}>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground text-sm">
                                        Account
                                    </span>
                                    <UserButton />
                                </div>
                            </Show>
                        </SheetFooter>
                    </SheetContent>
                </Sheet>
            </div>
        </header>
    )
}

function ListItem({ title, href, description }: NavLink) {
    return (
        <li>
            <NavigationMenuLink
                asChild
                className="h-auto flex-col items-start gap-1 whitespace-normal"
            >
                <Link href={href}>
                    <span className="font-medium text-foreground leading-none">
                        {title}
                    </span>
                    <span className="leading-snug">{description}</span>
                </Link>
            </NavigationMenuLink>
        </li>
    )
}
