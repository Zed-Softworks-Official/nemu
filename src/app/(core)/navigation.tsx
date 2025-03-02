'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
    Layers3,
    Store,
    Menu,
    Brush,
    Crown,
    Lightbulb,
    ChartNoAxesGantt,
    ReceiptText,
    ShieldCheck
} from 'lucide-react'

import { Button } from '~/components/ui/button'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger
} from '~/components/ui/sheet'
import NemuImage from '~/components/nemu-image'

export function NavigationSheet() {
    const [open, setOpen] = useState(false)

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button
                    variant={'ghost'}
                    size={'icon'}
                    className="aspect-square rounded-full"
                >
                    <span className="sr-only">Menu</span>
                    <Menu className="size-4" />
                </Button>
            </SheetTrigger>
            <SheetContent className="flex h-full w-full flex-1 flex-col">
                <SheetHeader>
                    <SheetTitle className="sr-only">Menu</SheetTitle>
                </SheetHeader>
                <nav className="flex h-full w-full flex-col items-start justify-start gap-2">
                    <SheetDescription>Where to go</SheetDescription>
                    <Button
                        asChild
                        variant={'ghost'}
                        className="w-full justify-start"
                        onClick={() => setOpen(false)}
                    >
                        <Link href={'/'} prefetch={true}>
                            <Layers3 className="text-foreground size-4" />
                            Commissions
                        </Link>
                    </Button>
                    <Button
                        asChild
                        variant={'ghost'}
                        className="w-full justify-start"
                        onClick={() => setOpen(false)}
                    >
                        <Link href={'/artist-corner'} prefetch={true}>
                            <Store className="text-foreground size-4" />
                            Artist Corner
                        </Link>
                    </Button>
                    <Button
                        asChild
                        variant={'ghost'}
                        className="w-full justify-start"
                        onClick={() => setOpen(false)}
                    >
                        <Link href={'/artists'} prefetch={true}>
                            <Brush className="text-foreground size-4" />
                            Become an Artist
                        </Link>
                    </Button>
                    <Button
                        asChild
                        variant={'ghost'}
                        className="w-full justify-start"
                        onClick={() => setOpen(false)}
                    >
                        <Link href={'/supporter'} prefetch={true}>
                            <Crown className="text-foreground size-4" />
                            Become a Supporter
                        </Link>
                    </Button>
                    <Button
                        asChild
                        variant={'ghost'}
                        className="w-full justify-start"
                        onClick={() => setOpen(false)}
                    >
                        <Link
                            data-featurebase-link
                            href={'https://feedback.nemu.art'}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Lightbulb className="text-foreground size-4" />
                            Feature Requests
                        </Link>
                    </Button>
                    <Button
                        asChild
                        variant={'ghost'}
                        className="w-full justify-start"
                        onClick={() => setOpen(false)}
                    >
                        <Link
                            data-featurebase-link
                            href={'https://feedback.nemu.art/roadmap'}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <ChartNoAxesGantt className="text-foreground size-4" />
                            Roadmap
                        </Link>
                    </Button>
                    <SheetDescription>Boring Stuff</SheetDescription>
                    <Button
                        asChild
                        variant={'ghost'}
                        className="w-full justify-start"
                        onClick={() => setOpen(false)}
                    >
                        <Link href={'/terms'} prefetch={true}>
                            <ReceiptText className="text-foreground size-4" />
                            Terms of Service
                        </Link>
                    </Button>
                    <Button
                        asChild
                        variant={'ghost'}
                        className="w-full justify-start"
                        onClick={() => setOpen(false)}
                    >
                        <Link href={'/privacy'} prefetch={true}>
                            <ShieldCheck className="text-foreground size-4" />
                            Privacy Policy
                        </Link>
                    </Button>
                </nav>
                <SheetFooter className="flex flex-col justify-end">
                    <div className="flex flex-col justify-end gap-2">
                        <NemuImage
                            src={'/zed-logo.svg'}
                            alt="Zed Softworks Logo"
                            width={20}
                            height={20}
                        />
                        <p className="text-muted-foreground text-sm">
                            Copyright &copy; {new Date().getFullYear()}{' '}
                            <Link
                                href={'https://zedsoftworks.dev'}
                                target="_blank"
                                className="hover:underline"
                            >
                                Zed Softworks LLC
                            </Link>
                            . All rights reserved.
                        </p>
                    </div>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    )
}
