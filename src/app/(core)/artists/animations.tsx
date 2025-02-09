'use client'

import {
    ArrowDown,
    Code,
    FileText,
    Handshake,
    Kanban,
    type LucideIcon,
    MessageSquare,
    Package,
    Rocket,
    Sparkle
} from 'lucide-react'
import { motion } from 'motion/react'
import Link from 'next/link'
import { useRef } from 'react'

import NemuImage from '~/components/nemu-image'
import { Button } from '~/components/ui/button'
import { PricingCard } from '~/components/pricing-cards'

import { useAnimations } from '~/hooks/use-animation'

export function AnimatedHero() {
    const ref = useRef<HTMLDivElement>(null)
    const { controls, containerVariants, itemVariants } = useAnimations({ ref })

    return (
        <motion.div
            ref={ref}
            animate={controls}
            variants={containerVariants}
            initial={'hidden'}
            className="relative flex h-[80vh] flex-col items-center justify-center gap-4 p-4 text-center"
        >
            <motion.div variants={itemVariants} className="mb-10">
                <NemuImage
                    src={'/nemu/artists-wanted.png'}
                    alt="Artists Wanted"
                    width={200}
                    height={200}
                />
            </motion.div>
            <motion.h2 className="text-4xl font-bold" variants={itemVariants}>
                Become an Artist!
            </motion.h2>
            <motion.p className="mb-8 text-xl" variants={itemVariants}>
                Join our open-source, community-first platform and turn your passion into
                profit
            </motion.p>
            <motion.div variants={itemVariants}>
                <Button asChild size={'lg'}>
                    <Link href={'/artists/apply'}>Apply Now</Link>
                </Button>
            </motion.div>
            <motion.div variants={itemVariants} className="absolute bottom-0">
                <ArrowDown className="size-6 animate-bounce" />
            </motion.div>
        </motion.div>
    )
}

interface Feature {
    icon: LucideIcon
    title: string
    description: string
}

const features: Feature[] = [
    {
        icon: Kanban,
        title: 'Kanban Board',
        description: 'Organize your commissions efficiently'
    },
    {
        icon: MessageSquare,
        title: 'Client Messaging',
        description: 'Communicate seamlessly with clients'
    },
    {
        icon: FileText,
        title: 'Invoice Creation',
        description: 'Generate professional invoices easily'
    },
    {
        icon: Package,
        title: 'Commission Delivery',
        description: 'Deliver your work securely'
    }
]

export function AnimatedFeatures() {
    const ref = useRef<HTMLDivElement>(null)
    const { controls, containerVariants, itemVariants } = useAnimations({ ref })

    return (
        <motion.div
            ref={ref}
            animate={controls}
            variants={containerVariants}
            initial={'hidden'}
            className="relative mt-[20vh] flex w-full flex-col gap-4 p-4 px-4 pb-20"
        >
            <div className="mx-auto max-w-7xl">
                <motion.h2
                    variants={itemVariants}
                    className="mb-12 text-center text-4xl font-bold"
                >
                    Powerful Features for Artists
                </motion.h2>
                <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
                    {features.map((feature) => (
                        <motion.div
                            variants={itemVariants}
                            key={feature.title}
                            className="text-center"
                        >
                            <feature.icon className="mx-auto mb-4 size-12 text-primary" />
                            <h3 className="text-xl font-semibold">{feature.title}</h3>
                            <p className="text-muted-foreground">{feature.description}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </motion.div>
    )
}

export function AnimatedPricing() {
    const ref = useRef<HTMLDivElement>(null)
    const { controls, containerVariants, itemVariants } = useAnimations({ ref })

    return (
        <motion.div
            ref={ref}
            animate={controls}
            variants={containerVariants}
            initial={'hidden'}
            className="bg-background-secondary px-4 py-20"
        >
            <motion.h2
                variants={itemVariants}
                className="mb-12 text-center text-4xl font-bold"
            >
                Transparent Pricing
            </motion.h2>
            <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
                <motion.div variants={itemVariants}>
                    <PricingCard
                        title="Standard"
                        description="5% + Stripe Fees"
                        price={0}
                        features={[
                            { name: 'All Platform Features', included: true },
                            { name: 'Unlimited Commissions', included: true },
                            { name: 'No Platform Fee', included: false }
                        ]}
                        highlighted={false}
                    />
                </motion.div>

                <motion.div variants={itemVariants}>
                    <PricingCard
                        title="Supporter"
                        description="0% Platform Fee"
                        price={6}
                        period="month"
                        features={[
                            { name: 'Everything in Standard', included: true },
                            { name: 'Priority Support', included: true },
                            { name: 'No Platform Fee', included: true }
                        ]}
                        highlighted={true}
                    />
                </motion.div>
            </div>
        </motion.div>
    )
}

export function AnimatedCommunity() {
    const ref = useRef<HTMLDivElement>(null)
    const { controls, containerVariants, itemVariants } = useAnimations({ ref })

    return (
        <motion.div
            ref={ref}
            animate={controls}
            variants={containerVariants}
            initial={'hidden'}
            className="flex flex-col gap-2 px-4 py-20"
        >
            <motion.h2 variants={itemVariants} className="text-center text-4xl font-bold">
                Community First
            </motion.h2>
            <div className="mx-auto max-w-4xl text-center">
                <motion.p
                    variants={itemVariants}
                    className="mb-8 text-xl text-muted-foreground"
                >
                    As an open-source platform, we prioritize community feedback and
                    collaboration. We put our community at the heart of everything we do.
                    Your voice matters in shaping the future of our platform.
                </motion.p>
                <motion.ul
                    variants={itemVariants}
                    className="mb-8 inline-block space-y-5 text-left [&>li]:flex [&>li]:items-center [&>li]:gap-2 [&>li]:text-lg"
                >
                    <li>
                        <Sparkle className="size-6 text-primary" />
                        Suggest New Features
                    </li>
                    <li>
                        <Code className="size-6 text-primary" />
                        Contribute to our codebase
                    </li>
                    <li>
                        <Handshake className="size-6 text-primary" />
                        Connect with other artists
                    </li>
                    <li>
                        <Rocket className="size-6 text-primary" />
                        Help us grow and improve
                    </li>
                </motion.ul>
            </div>
        </motion.div>
    )
}

export function AnimatedCTA() {
    const ref = useRef<HTMLDivElement>(null)
    const { controls, containerVariants, itemVariants } = useAnimations({ ref })

    return (
        <motion.div
            ref={ref}
            animate={controls}
            variants={containerVariants}
            initial={'hidden'}
            className="flex flex-col items-center justify-center gap-4 bg-primary px-4 py-20"
        >
            <motion.h2 variants={itemVariants} className="text-center text-4xl font-bold">
                Become an artist on Nemu
            </motion.h2>
            <motion.p variants={itemVariants} className="text-center text-xl">
                Apply to be an artist today!
            </motion.p>
            <motion.div variants={itemVariants} className="pt-10">
                <Button asChild size={'lg'} variant={'outline'}>
                    <Link href={'/artists/apply'}>Apply Now</Link>
                </Button>
            </motion.div>
        </motion.div>
    )
}
