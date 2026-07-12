'use client'

import { Globe, Home, Router, Smartphone } from 'lucide-react'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '~/components/ui/card'
import { LandingSection } from './landing-section'
import { Reveal } from './motion'
import { SectionHeader } from './section-header'

const steps = [
    {
        icon: Home,
        title: 'Run the controller at home',
        body: 'Install Nemu on hardware you control: a mini PC, NAS, or home server on your LAN.',
    },
    {
        icon: Router,
        title: 'Devices stay on your network',
        body: 'Lights, locks, and sensors connect locally first. Fast responses, no round trip to the cloud.',
    },
    {
        icon: Smartphone,
        title: 'Control from your apps',
        body: 'Use a unified API over LAN. Your phone talks to your home not a distant data center.',
    },
    {
        icon: Globe,
        title: 'Remote only when you want',
        body: 'Need access away from home? Opt into relay access on your terms. Off by default.',
    },
] as const

export function HowItWorks() {
    return (
        <LandingSection glow grid id="how-it-works">
            <Reveal>
                <SectionHeader
                    badge="How it works"
                    description="A smart home stack that starts at your router and stays under your roof."
                    title="Your home. Your rules. Your network."
                />
            </Reveal>

            <div className="grid gap-4 sm:grid-cols-2">
                {steps.map((step, index) => (
                    <Reveal delay={index * 0.08} key={step.title}>
                        <Card className="h-full border-border/80 bg-card/50 shadow-none ring-primary/10 transition-colors hover:border-primary/25 hover:ring-primary/20">
                            <CardHeader>
                                <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                                    <step.icon className="size-5" />
                                </div>
                                <CardTitle className="font-heading font-semibold text-lg">
                                    {step.title}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription className="text-base leading-relaxed">
                                    {step.body}
                                </CardDescription>
                            </CardContent>
                        </Card>
                    </Reveal>
                ))}
            </div>
        </LandingSection>
    )
}
