'use client'

import { Blocks, Lock, Radio, Server, ShieldCheck, Zap } from 'lucide-react'
import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
} from '~/components/ui/card'
import { cn } from '~/lib/utils'
import { LandingSection } from './landing-section'
import { Reveal } from './motion'
import { SectionHeader } from './section-header'

const features: Array<{
    icon: typeof ShieldCheck
    title: string
    body: string
    className: string
    featured?: boolean
}> = [
    {
        icon: ShieldCheck,
        title: 'Privacy by default',
        body: 'No telemetry-as-a-feature. Your automations and device state stay on your network.',
        className: 'sm:col-span-2 lg:col-span-2',
        featured: true,
    },
    {
        icon: Zap,
        title: 'LAN-speed control',
        body: 'WebSocket and HTTP on your local network: sub-second response when you flip a switch.',
        className: 'sm:col-span-1',
    },
    {
        icon: Radio,
        title: 'Real-time updates',
        body: 'Reactive subscriptions keep every client in sync without polling the cloud.',
        className: 'sm:col-span-1',
    },
    {
        icon: Blocks,
        title: 'Unified device API',
        body: 'One protocol for REST, WebSocket, and relay envelopes: build once, connect anywhere.',
        className: 'sm:col-span-1',
    },
    {
        icon: Server,
        title: 'Self-hosted controller',
        body: 'Run on your own hardware. No mandatory SaaS middleman between you and your home.',
        className: 'sm:col-span-1',
    },
    {
        icon: Lock,
        title: 'Optional remote relay',
        body: 'Reach your controller away from home only when you explicitly enable it.',
        className: 'sm:col-span-2 lg:col-span-2',
        featured: true,
    },
]

export function FeaturesGrid() {
    return (
        <LandingSection glow id="features">
            <Reveal>
                <SectionHeader
                    badge="Features"
                    description="Everything you need to run a modern smart home without handing the keys to a platform."
                    title="Built for control, not surveillance"
                />
            </Reveal>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {features.map((feature, index) => (
                    <Reveal
                        className={feature.className}
                        delay={index * 0.06}
                        key={feature.title}
                    >
                        <Card
                            className={cn(
                                'h-full border-border/80 bg-card/40 shadow-none transition-colors hover:border-primary/20',
                                feature.featured &&
                                    'border-primary/20 bg-card/60 ring-1 ring-primary/10'
                            )}
                        >
                            <CardHeader>
                                <div
                                    className={cn(
                                        'mb-2 flex size-9 items-center justify-center rounded-md border text-primary',
                                        feature.featured
                                            ? 'border-primary/25 bg-primary/10'
                                            : 'border-border bg-background'
                                    )}
                                >
                                    <feature.icon className="size-4" />
                                </div>
                                <CardTitle className="font-heading font-semibold text-base">
                                    {feature.title}
                                </CardTitle>
                                <CardDescription className="text-sm leading-relaxed">
                                    {feature.body}
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    </Reveal>
                ))}
            </div>
        </LandingSection>
    )
}
