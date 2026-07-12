'use client'

import Image from 'next/image'
import { Button } from '~/components/ui/button'
import { Reveal } from './motion'

export function CtaBand() {
    return (
        <section className="relative overflow-hidden border-border border-t bg-background">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.78_0.14_220_/14%),transparent_65%)]"
            />

            <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-8 px-5 py-20 text-center sm:px-8 lg:flex-row lg:justify-between lg:text-left">
                <Reveal className="flex max-w-xl flex-col items-center gap-5 lg:items-start">
                    <Image
                        alt=""
                        className="size-16 drop-shadow-[0_0_24px_oklch(0.78_0.14_220_/25%)] lg:hidden"
                        height={128}
                        src="/icon.png"
                        width={128}
                    />
                    <h2 className="font-extrabold font-heading text-3xl text-foreground tracking-tight sm:text-4xl">
                        Ready to take your home back?
                    </h2>
                    <p className="text-base text-muted-foreground leading-relaxed sm:text-lg">
                        Join the waitlist for early access, or explore the
                        source today.
                    </p>
                </Reveal>

                <Reveal
                    className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row lg:shrink-0"
                    delay={0.1}
                >
                    <Button asChild className="w-full sm:w-auto" size="xl">
                        <a href="#waitlist">Join the waitlist</a>
                    </Button>
                    <Button
                        asChild
                        className="w-full sm:w-auto"
                        size="xl"
                        variant="outline"
                    >
                        <a href="#features">See features</a>
                    </Button>
                </Reveal>
            </div>
        </section>
    )
}
