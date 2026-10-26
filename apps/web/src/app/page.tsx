import portrait from '@nemu/assets/emotes/portrait.png'
import logoType from '@nemu/assets/logos/logo-type.svg'
import { Button } from '@nemu/ui/components/button'
import Image from 'next/image'
import Link from 'next/link'
import { GitHubIcon } from '~/components/landing/github-icon'
import { RevealOnMount } from '~/components/landing/motion'
import { Navbar } from '~/components/navbar'

export default function HomePage() {
    return (
        <section className="typeset">
            <Navbar />
            <main>
                <Hero />
                {/* 
                <Hero />
                <Pillars />
                <HowItWorks />
                <ComparisonSection />
                <FeaturesGrid />
                <OpenSourceSection />
                <CtaBand />
                <WaitlistSection />
                */}
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
