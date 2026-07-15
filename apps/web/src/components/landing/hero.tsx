'use client'

import Image from 'next/image'
import { Button } from '@nemu/ui/components/button'
import { GitHubIcon } from './github-icon'
import { DriftOrb, RevealOnMount, TwinkleStar } from './motion'

function NightSky() {
    return (
        <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden"
        >
            <div className="landing-grid-bg absolute inset-0 opacity-60" />
            <div className="landing-hero-glow absolute inset-0" />
            <DriftOrb className="absolute top-[5%] right-[10%] size-[min(42vw,480px)] rounded-full bg-primary/12 blur-[100px]" />

            <TwinkleStar
                className="top-[18%] right-[42%] size-1 bg-primary/80"
                delay={0}
            />
            <TwinkleStar
                className="top-[28%] right-[18%] size-0.5 bg-foreground/50"
                delay={0.8}
            />
            <TwinkleStar
                className="top-[42%] right-[32%] size-1 bg-primary/60"
                delay={1.6}
            />
            <TwinkleStar
                className="top-[14%] left-[48%] size-0.5 bg-foreground/30"
                delay={0}
            />
            <TwinkleStar
                className="right-[12%] bottom-[22%] size-0.5 bg-foreground/25"
                delay={0.8}
            />
            <TwinkleStar
                className="top-[55%] left-[8%] size-1 bg-primary/50"
                delay={1.6}
            />
        </div>
    )
}

export function Hero() {
    return (
        <section className="relative isolate min-h-svh overflow-hidden bg-background">
            <NightSky />

            <div className="relative mx-auto grid min-h-svh max-w-6xl items-center gap-10 px-5 pt-28 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6 lg:pb-24">
                <RevealOnMount className="z-10 max-w-xl" delay={0.05}>
                    <h2 className="max-w-lg font-semibold text-foreground text-xl leading-snug tracking-tight sm:text-2xl">
                        Control everything.
                        <span className="landing-glow-text text-primary">
                            {' '}
                            Share nothing.
                        </span>
                    </h2>
                    <div className="mb-6 flex items-center gap-3">
                        <h1 className="font-extrabold font-heading text-6xl text-foreground tracking-tight sm:text-7xl md:text-9xl">
                            Nemu
                        </h1>
                    </div>
                    <p className="mt-5 max-w-md text-base text-muted-foreground leading-relaxed sm:text-lg">
                        An open-source, privacy-focused smart home controller
                        that keeps your devices and your data on your network.
                    </p>
                    <div className="mt-9 flex flex-wrap items-center gap-3">
                        <Button asChild size="xl">
                            <a href="#waitlist">Join the waitlist</a>
                        </Button>
                        <Button asChild size="xl" variant="outline">
                            <a
                                href={
                                    'https://github.com/Zed-Softworks-Official/nemu'
                                }
                                rel="noopener noreferrer"
                                target="_blank"
                            >
                                <GitHubIcon
                                    className="size-4"
                                    data-icon="inline-start"
                                />
                                View on GitHub
                            </a>
                        </Button>
                    </div>
                </RevealOnMount>

                <RevealOnMount
                    className="relative mx-auto w-full max-w-lg lg:max-w-none lg:justify-self-end"
                    delay={0.2}
                >
                    <Image
                        alt="Nemu, a cozy sleepy penguin mascot waving hello"
                        className="relative z-1 mx-auto h-auto w-[min(100%,28rem)] drop-shadow-[0_24px_48px_oklch(0_0_0_/50%)] lg:w-full lg:max-w-xl"
                        height={720}
                        priority
                        src="/portrait.png"
                        width={720}
                    />
                </RevealOnMount>
            </div>
        </section>
    )
}
