'use client'

import Link from 'next/link'
import { motion } from 'motion/react'
import { Check, X } from 'lucide-react'

import { type ButtonProps } from '~/components/ui/button'
import { Button } from '~/components/ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import { useAnimations } from '~/hooks/use-animation'
import { useRef } from 'react'

export default function PricingCards() {
    return (
        <div className="mx-auto grid w-full max-w-4xl gap-8 md:grid-cols-2">
            <PricingCard
                title="Supporter"
                description="Monthly Tier"
                period="month"
                price={6}
                features={[
                    { name: '0% Platform Fee As Artist', included: true },
                    { name: 'Priority Support', included: true },
                    { name: 'Access to Supporter-only features later', included: true },
                    { name: 'Help Nemu keep the lights on', included: true }
                ]}
                buttonVariant="outline"
                buttonText="Become a Supporter"
                highlighted={false}
                buttonUrl="/supporter/subscribe?period=monthly"
            />
            <PricingCard
                title="Supporter"
                description="Annual Tier"
                period="year"
                price={60}
                features={[
                    { name: '0% Platform Fee As Artist', included: true },
                    { name: 'Priority Support', included: true },
                    { name: 'Access to Supporter-only features later', included: true },
                    { name: 'Help Nemu keep the lights on', included: true }
                ]}
                buttonVariant="default"
                buttonText="Become a Supporter"
                highlighted={true}
                buttonUrl="/supporter/subscribe?period=annual"
            />
        </div>
    )
}

export function PricingCard(props: {
    title: string
    description: string
    period?: string
    price: number | string
    features: { name: string; included: boolean }[]
    buttonText?: string
    buttonVariant?: ButtonProps['variant']
    buttonUrl?: string
    highlighted: boolean
}) {
    const ref = useRef<HTMLDivElement>(null)
    const { controls, containerVariants } = useAnimations({ ref })

    return (
        <motion.div
            ref={ref}
            initial={'hidden'}
            animate={controls}
            variants={containerVariants}
        >
            <Card
                className={`flex flex-1 flex-col ${props.highlighted ? 'border-primary border-2 shadow-lg' : ''}`}
            >
                <CardHeader>
                    <CardTitle className="text-2xl">{props.title}</CardTitle>
                    <CardDescription>{props.description}</CardDescription>
                </CardHeader>
                <CardContent className="grow">
                    <div className="mb-4 text-4xl font-bold">
                        {props.price}
                        {props.period && (
                            <span className="text-muted-foreground text-xl font-normal">
                                /{props.period}
                            </span>
                        )}
                    </div>
                    <ul className="space-y-2">
                        {props.features.map((feature, index) => (
                            <li key={index} className="flex items-center">
                                {feature.included ? (
                                    <Check className="text-primary mr-2 h-5 w-5" />
                                ) : (
                                    <X className="text-muted-foreground mr-2 h-5 w-5" />
                                )}
                                <span
                                    className={
                                        feature.included ? '' : 'text-muted-foreground'
                                    }
                                >
                                    {feature.name}
                                </span>
                            </li>
                        ))}
                    </ul>
                </CardContent>
                {props.buttonText && props.buttonVariant && props.buttonUrl && (
                    <CardFooter>
                        <Button className="w-full" variant={props.buttonVariant} asChild>
                            <Link href={props.buttonUrl}>{props.buttonText}</Link>
                        </Button>
                    </CardFooter>
                )}
            </Card>
        </motion.div>
    )
}
