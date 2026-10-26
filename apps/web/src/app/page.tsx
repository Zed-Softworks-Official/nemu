import dizzy from '@nemu/assets/emotes/dizzy.png'
import notLikeThis from '@nemu/assets/emotes/not-like-this.png'
import noteTake from '@nemu/assets/emotes/note-take.png'
import portrait from '@nemu/assets/emotes/portrait.png'
import sparkle from '@nemu/assets/emotes/sparkle.png'
import star from '@nemu/assets/emotes/star.png'
import thisIsFine from '@nemu/assets/emotes/this-is-fine.png'
import icon from '@nemu/assets/icons/icon.png'
import logoType from '@nemu/assets/logos/logo-type.svg'
import { Button } from '@nemu/ui/components/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@nemu/ui/components/card'
import { Logo } from '@nemu/ui/components/logo'
import {
    Blocks,
    Home,
    Lock,
    Radio,
    Router,
    Server,
    ShieldCheck,
    Smartphone,
    Zap,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { GitHubIcon } from '~/components/landing/github-icon'
import { LandingSection } from '~/components/landing/landing-section'
import { Reveal, RevealOnMount } from '~/components/landing/motion'
import { Navbar } from '~/components/navbar'
import { WaitlistForm } from '~/components/waitlist-form'

const githubHref = 'https://github.com/Zed-Softworks-Official/nemu'

export default function HomePage() {
    return (
        <section className="typeset">
            <Navbar />
            <main>
                <Hero />
                <Pillars />
                <HowItWorks />
                <Features />
                <Comparison />
                <OpenSource />
                <Waitlist />
            </main>
            <Footer />
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
                                href={githubHref}
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

const steps = [
    {
        id: 'controller',
        number: '01',
        title: 'Run the controller at home',
        body: 'Install Nemu on a home server or a Raspberry Pi. Each Home has one Controller, and you own the hardware.',
        icon: Home,
    },
    {
        id: 'devices',
        number: '02',
        title: 'Keep devices on your network',
        body: 'Matter and Zigbee connect locally. Lights, locks, and sensors answer on your LAN.',
        icon: Router,
    },
    {
        id: 'apps',
        number: '03',
        title: 'Connect from your apps',
        body: 'A phone or browser pairs on the network. Away from home, it falls back to an end-to-end encrypted relay.',
        icon: Smartphone,
    },
] as const

function HowItWorks() {
    return (
        <LandingSection id="how-it-works">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                <Reveal>
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
                        How it works
                    </p>
                    <h2 className="mt-4 max-w-md font-semibold text-4xl text-foreground leading-tight tracking-tight sm:text-5xl">
                        Your home. Your rules.{' '}
                        <span className="text-primary">Your network.</span>
                    </h2>
                    <p className="mt-4 max-w-md text-muted-foreground leading-relaxed">
                        A controller on hardware you own. Devices stay on your
                        LAN, and the cloud only coordinates who can reach them.
                    </p>
                </Reveal>

                <Reveal delay={0.12}>
                    <Card>
                        <CardContent className="flex flex-col gap-8">
                            {steps.map((step) => (
                                <div className="flex gap-4" key={step.id}>
                                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-primary">
                                        <step.icon className="size-4" />
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-foreground">
                                            <span className="mr-2 text-muted-foreground">
                                                {step.number}
                                            </span>
                                            {step.title}
                                        </h3>
                                        <p className="mt-3 text-muted-foreground leading-relaxed">
                                            {step.body}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </Reveal>
            </div>
        </LandingSection>
    )
}

const features = [
    {
        id: 'lan',
        title: 'LAN-speed control',
        body: 'On your network, apps talk to the Controller directly. A switch flips without a round trip through a vendor cloud.',
        icon: Zap,
    },
    {
        id: 'live',
        title: 'Real-time updates',
        body: 'While you are on the LAN, device state arrives as it changes. Connected apps stay in sync with the Home.',
        icon: Radio,
    },
    {
        id: 'protocols',
        title: 'Matter and Zigbee',
        body: 'Lights, locks, sensors, and plugs join the Controller. Capabilities describe what you can read and change.',
        icon: Blocks,
    },
    {
        id: 'hosted',
        title: 'Self-hosted controller',
        body: 'One Controller per Home, on hardware you run. It keeps devices, rooms, state, automations, and history.',
        icon: Server,
    },
    {
        id: 'privacy',
        title: 'Privacy by default',
        body: 'The cloud can coordinate who reaches the Controller. It never holds a readable copy of your home.',
        icon: ShieldCheck,
    },
    {
        id: 'relay',
        title: 'Relay when you leave',
        body: 'Away from the LAN, a paired app falls back to an end-to-end encrypted relay, then returns as soon as it can.',
        icon: Lock,
    },
] as const

function Features() {
    return (
        <LandingSection id="features">
            <Reveal>
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
                    Everyday control
                </p>
                <h2 className="mt-4 max-w-2xl font-semibold text-4xl text-foreground leading-tight tracking-tight sm:text-5xl">
                    Everything you need.{' '}
                    <span className="text-primary">Nothing watching.</span>
                </h2>
            </Reveal>

            <div className="grid gap-x-12 gap-y-10 pt-16 sm:grid-cols-2 lg:grid-cols-3">
                {features.map((feature, index) => (
                    <Reveal delay={index * 0.06} key={feature.id}>
                        <div className="mb-3 flex size-9 items-center justify-center rounded-md border border-border text-primary">
                            <feature.icon className="size-4" />
                        </div>
                        <h3 className="mt-0 font-medium text-foreground text-sm">
                            {feature.title}
                        </h3>
                        <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                            {feature.body}
                        </p>
                    </Reveal>
                ))}
            </div>
        </LandingSection>
    )
}

const cloudPoints = [
    'Device data routed through vendor servers',
    "Control tied to a company's terms and availability",
    'A home profile that lives outside your home',
] as const

const nemuPoints = [
    'Control runs on hardware you own',
    'LAN first, with an encrypted relay when you leave',
    'Open code you can inspect, fork, and self-host',
] as const

function Comparison() {
    return (
        <LandingSection id="compare">
            <Reveal>
                <h2 className="max-w-xl font-semibold text-4xl text-foreground leading-tight tracking-tight sm:text-5xl">
                    A home.{' '}
                    <span className="text-primary">Not a data source.</span>
                </h2>
            </Reveal>

            <div className="grid gap-4 pt-12 lg:grid-cols-2">
                <Reveal delay={0.05}>
                    <Card className="h-full">
                        <CardHeader>
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
                                        Typical cloud hub
                                    </p>
                                    <CardTitle className="pt-2 font-semibold text-3xl text-foreground tracking-tight">
                                        Someone else's server.
                                    </CardTitle>
                                </div>
                                <Image
                                    alt="Nemu unimpressed by a house that lives on someone else's server"
                                    className="h-auto w-16 shrink-0 sm:w-20"
                                    height={96}
                                    src={notLikeThis}
                                    width={96}
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            {cloudPoints.map((point) => (
                                <p
                                    className="text-muted-foreground leading-relaxed"
                                    key={point}
                                >
                                    {point}
                                </p>
                            ))}
                        </CardContent>
                    </Card>
                </Reveal>

                <Reveal delay={0.12}>
                    <Card className="h-full">
                        <CardHeader>
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="font-medium text-primary text-xs uppercase tracking-widest">
                                        With Nemu
                                    </p>
                                    <CardTitle className="pt-2 font-semibold text-3xl text-foreground tracking-tight sm:text-4xl">
                                        Your network. Your controller.
                                    </CardTitle>
                                </div>
                                <Image
                                    alt="Nemu waving, happy the controller stays at home"
                                    className="h-auto w-16 shrink-0 sm:w-20"
                                    height={96}
                                    src={star}
                                    width={96}
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            {nemuPoints.map((point) => (
                                <p
                                    className="text-muted-foreground leading-relaxed"
                                    key={point}
                                >
                                    {point}
                                </p>
                            ))}
                        </CardContent>
                    </Card>
                </Reveal>
            </div>
        </LandingSection>
    )
}

const projectFacts = [
    { label: 'License', value: 'Apache-2.0' },
    { label: 'Built with', value: 'Rust + TypeScript' },
    { label: 'Made by', value: 'Zed Softworks' },
] as const

function OpenSource() {
    return (
        <LandingSection id="open-source">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                <Reveal>
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
                        Open by design
                    </p>
                    <h2 className="mt-4 max-w-md font-semibold text-4xl text-foreground leading-tight tracking-tight sm:text-5xl">
                        Trust what runs inside your home.
                    </h2>
                    <p className="mt-4 max-w-md text-muted-foreground leading-relaxed">
                        Nemu is Apache-2.0. Read the code, contribute, or run
                        the Controller yourself.
                    </p>
                    <div className="not-typeset mt-8">
                        <Button asChild variant="secondary">
                            <Link
                                href={githubHref}
                                rel="noopener noreferrer"
                                target="_blank"
                            >
                                <GitHubIcon
                                    className="size-4"
                                    data-icon="inline-start"
                                />
                                Explore on GitHub
                            </Link>
                        </Button>
                    </div>
                </Reveal>

                <Reveal delay={0.12}>
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <Image
                                    alt=""
                                    className="size-10"
                                    height={40}
                                    src={icon}
                                    width={40}
                                />
                                <p className="text-muted-foreground text-sm">
                                    Zed-Softworks-Official / nemu
                                </p>
                            </div>
                            <CardDescription className="pt-2 text-base text-foreground">
                                A local-first controller for a home that stays
                                yours.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <dl className="grid gap-4">
                                {projectFacts.map((fact) => (
                                    <div
                                        className="grid grid-cols-[7rem_1fr] items-baseline gap-4"
                                        key={fact.label}
                                    >
                                        <dt className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
                                            {fact.label}
                                        </dt>
                                        <dd className="text-foreground text-sm">
                                            {fact.value}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </CardContent>
                    </Card>
                </Reveal>
            </div>
        </LandingSection>
    )
}

function Waitlist() {
    return (
        <LandingSection id="waitlist">
            <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:justify-center lg:gap-16">
                <Reveal className="relative shrink-0">
                    <Image
                        alt="Nemu sparkling with excitement"
                        className="mx-auto h-auto w-48 drop-shadow-md sm:w-56 lg:w-64"
                        height={320}
                        src={sparkle}
                        width={320}
                    />
                </Reveal>
                <Reveal
                    className="w-full max-w-md text-center lg:text-left"
                    delay={0.12}
                >
                    <h2 className="font-semibold text-4xl text-foreground leading-tight tracking-tight">
                        Get <span className="text-primary">early access.</span>
                    </h2>
                    <p className="mt-4 text-base text-muted-foreground leading-relaxed">
                        Nemu is in private alpha. Join the waitlist and be first
                        in line when a spot opens.
                    </p>
                    <div className="not-typeset mt-8 flex justify-center lg:justify-start">
                        <WaitlistForm />
                    </div>
                </Reveal>
            </div>
        </LandingSection>
    )
}

function Footer() {
    return (
        <footer className="border-border border-t">
            <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                    <p className="text-muted-foreground text-sm">
                        &copy; {new Date().getFullYear()}{' '}
                        <Link
                            href="https://zedsoftworks.dev"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            Zed Softworks
                        </Link>
                        {'. '}
                        Open source under Apache-2.0.
                    </p>
                </div>
                <div className="not-typeset flex flex-wrap items-center gap-1">
                    <Button asChild size="sm" variant="ghost">
                        <Link
                            href={githubHref}
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            <GitHubIcon
                                className="size-4"
                                data-icon="inline-start"
                            />
                            GitHub
                        </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                        <Link href="#waitlist">Waitlist</Link>
                    </Button>
                </div>
            </div>
        </footer>
    )
}
