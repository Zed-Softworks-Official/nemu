import dizzy from '@nemu/assets/emotes/dizzy.png'
import noteTake from '@nemu/assets/emotes/note-take.png'
import portrait from '@nemu/assets/emotes/portrait.png'
import thisIsFine from '@nemu/assets/emotes/this-is-fine.png'
import logoType from '@nemu/assets/logos/logo-type.svg'
import { Button } from '@nemu/ui/components/button'
import Image from 'next/image'
import Link from 'next/link'
import { GitHubIcon } from '~/components/landing/github-icon'
import { LandingSection } from '~/components/landing/landing-section'
import { Reveal, RevealOnMount } from '~/components/landing/motion'
import { Navbar } from '~/components/navbar'

export default function HomePage() {
    return (
        <section className="typeset">
            <Navbar />
            <main>
                <Hero />
                <Pillars />
            </main>
        </section>
    )
}

function Hero() {
    return (
        <section className="mx-auto grid min-h-svh max-w-6xl items-center gap-10 px-5 pt-28 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6 lg:pb-24">
            <RevealOnMount className="z-10 max-w-xl" delay={0.05}>
                <div>
                    <h2 className="max-w-lg font-semibold text-foreground text-xl leading-snug tracking-tight sm:text-2xl">
                        Control everything.
                        <span className="text-primary"> Share nothing.</span>
                    </h2>
                    <div className="mb-6 flex items-center gap-3">
                        <Image
                            alt="Nemu, a cozy sleepy chicken mascot waving hello"
                            height={300}
                            src={logoType}
                            width={300}
                        />
                    </div>
                    <p className="text-muted-foreground">
                        A quieter kind of smart home. Open-source control that
                        keeps your devices, your data, and your everyday life on
                        your network.
                    </p>
                    <div className="mt-9 flex flex-wrap items-center gap-3">
                        <Button asChild size={'xl'}>
                            <Link href="#waitlist">Join the waitlist</Link>
                        </Button>
                        <Button asChild size={'xl'} variant={'secondary'}>
                            <Link
                                href="https://github.com/Zed-Softworks-Official/nemu"
                                rel="noopener noreferrer"
                                target="_blank"
                            >
                                <GitHubIcon
                                    className="size-4"
                                    data-icon="inline-start"
                                />
                                View on GitHub
                            </Link>
                        </Button>
                    </div>
                </div>
            </RevealOnMount>

            <RevealOnMount
                className="relative mx-auto w-full max-w-lg lg:max-w-none lg:justify-self-end"
                delay={0.2}
            >
                <Image
                    alt="Nemu, a cozy sleepy chicken mascot waving hello"
                    className="relative z-1 mx-auto h-auto w-[min(100%,28rem)] drop-shadow-[0_24px_48px_oklch(0_0_0_/50%)] lg:w-full lg:max-w-xl"
                    height={720}
                    priority
                    src={portrait}
                    width={720}
                />
            </RevealOnMount>
        </section>
    )
}

const pillars = [
    {
        id: 'privacy',
        title: 'Privacy by design',
        body: 'Your controller keeps devices, state, automations, and history. The cloud can coordinate who reaches it, but it never holds a readable copy of your home.',
        sticker: thisIsFine,
        stickerAlt: 'Nemu looking calm while your home stays on the controller',
    },
    {
        id: 'local',
        title: 'Local-first, cloud when needed',
        body: 'On your network, control stays local and keeps working if the internet drops. If that path is down, a paired app falls back to an end-to-end encrypted relay, then returns to the LAN as soon as it can.',
        sticker: dizzy,
        stickerAlt: 'Nemu spinning happily on your own network',
    },
    {
        id: 'open',
        title: 'Open source, inspectable',
        body: 'Read the code, fork it, and run the controller yourself. Nemu is Apache-2.0, so you can see what runs inside your home.',
        sticker: noteTake,
        stickerAlt: 'Nemu taking notes on the open-source code',
    },
] as const

function Pillars() {
    return (
        <LandingSection id="why">
            <Reveal>
                <h2 className="font-semibold text-4xl text-foreground leading-tight tracking-tight">
                    Smart home.{' '}
                    <span className="text-primary">Private Life.</span>
                </h2>
            </Reveal>

            <div className="flex flex-col gap-12 pt-24 lg:flex-row lg:items-stretch lg:gap-0">
                {pillars.map((pillar, index) => (
                    <Reveal
                        className="flex flex-1 flex-col lg:px-8 last:lg:pr-0 first:lg:pl-0"
                        delay={index * 0.1}
                        key={pillar.id}
                    >
                        <Image
                            alt={pillar.stickerAlt}
                            className="mb-5 h-auto w-28 drop-shadow-md sm:w-32"
                            height={160}
                            src={pillar.sticker}
                            width={160}
                        />
                        <p className="font-medium text-primary text-xs uppercase tracking-widest">
                            {String(index + 1).padStart(2, '0')}
                        </p>
                        <h3
                            className="mt-2 font-bold font-heading text-2xl text-foreground tracking-tight"
                            id={pillar.id}
                        >
                            {pillar.title}
                        </h3>
                        <p className="mt-4 max-w-sm text-base text-muted-foreground leading-relaxed">
                            {pillar.body}
                        </p>
                    </Reveal>
                ))}
            </div>
        </LandingSection>
    )
}
