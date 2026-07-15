'use client'

import { Show, SignInButton, UserButton } from '@clerk/nextjs'
import { Menu } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@nemu/ui/components/button'
import {
    NavigationMenu,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    navigationMenuTriggerStyle,
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
import { cn } from '@nemu/ui/lib/utils'
import { Logo } from '../logo'
import { useSectionScroll } from './motion'

const navLinks = [
    { href: '#why', label: 'Why' },
    { href: '#how-it-works', label: 'How it works' },
    { href: '#features', label: 'Features' },
    { href: '#waitlist', label: 'Waitlist' },
    {
        href: 'https://github.com/Zed-Softworks-Official/nemu',
        label: 'GitHub',
        external: true,
    },
] as const

export function SiteHeader() {
    const [open, setOpen] = useState(false)
    const { onSectionClick, scrollTo } = useSectionScroll()

    return (
        <header className="fixed inset-x-0 top-0 z-50 border-border border-b bg-background/90 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
                <Link
                    className="flex items-center gap-2.5 font-extrabold font-heading text-foreground text-xl tracking-tight"
                    href="/"
                >
                    <Logo />
                </Link>

                <NavigationMenu className="hidden md:flex" viewport={false}>
                    <NavigationMenuList className="gap-1">
                        {navLinks.map((link) => (
                            <NavigationMenuItem key={link.href}>
                                <NavigationMenuLink
                                    className={cn(
                                        navigationMenuTriggerStyle(),
                                        'bg-transparent'
                                    )}
                                    href={link.href}
                                    onClick={onSectionClick(link.href)}
                                    {...('external' in link && link.external
                                        ? {
                                              rel: 'noopener noreferrer',
                                              target: '_blank',
                                          }
                                        : {})}
                                >
                                    {link.label}
                                </NavigationMenuLink>
                            </NavigationMenuItem>
                        ))}
                    </NavigationMenuList>
                </NavigationMenu>

                <div className="hidden items-center gap-2 md:flex">
                    <Show when="signed-out">
                        <SignInButton mode="modal">
                            <Button size="sm" variant="ghost">
                                Sign in
                            </Button>
                        </SignInButton>
                    </Show>
                    <Show when="signed-in">
                        <UserButton />
                    </Show>
                    <Button onClick={() => scrollTo('#waitlist')} size="sm">
                        Join waitlist
                    </Button>
                </div>

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
                            <SheetTitle className="flex items-center gap-2 font-extrabold font-heading text-xl">
                                <Image
                                    alt=""
                                    className="size-8"
                                    height={64}
                                    src="/icon.png"
                                    width={64}
                                />
                                Nemu
                            </SheetTitle>
                            <SheetDescription>
                                Privacy-focused smart home control.
                            </SheetDescription>
                        </SheetHeader>
                        <Separator />
                        <nav className="flex flex-col gap-1 px-2 py-2">
                            {navLinks.map((link) => (
                                <Button
                                    asChild
                                    className="justify-start"
                                    key={link.href}
                                    variant="ghost"
                                >
                                    <Link
                                        href={link.href}
                                        onClick={onSectionClick(link.href, () =>
                                            setOpen(false)
                                        )}
                                        {...('external' in link && link.external
                                            ? {
                                                  rel: 'noopener noreferrer',
                                                  target: '_blank',
                                              }
                                            : {})}
                                    >
                                        {link.label}
                                    </Link>
                                </Button>
                            ))}
                        </nav>
                        <Separator />
                        <SheetFooter>
                            <Show when="signed-out">
                                <SignInButton mode="modal">
                                    <Button
                                        className="w-full"
                                        onClick={() => setOpen(false)}
                                        variant="outline"
                                    >
                                        Sign in
                                    </Button>
                                </SignInButton>
                            </Show>
                            <Show when="signed-in">
                                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                                    <span className="text-muted-foreground text-sm">
                                        Account
                                    </span>
                                    <UserButton />
                                </div>
                            </Show>
                            <Button
                                className="w-full"
                                onClick={() =>
                                    scrollTo('#waitlist', () => setOpen(false))
                                }
                            >
                                Join waitlist
                            </Button>
                        </SheetFooter>
                    </SheetContent>
                </Sheet>
            </div>
        </header>
    )
}
