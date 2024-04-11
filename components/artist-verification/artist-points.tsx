'use client'

import React from 'react'

import { AnimatePresence, motion } from 'framer-motion'
import { CanvasRevealEffect } from '@/components/ui/canvas-reveal-effect'
import { HandCoinsIcon, LayersIcon, MailIcon } from 'lucide-react'

export default function ArtistPoints() {
    return (
        <>
            <div className="py-20 flex flex-col lg:flex-row items-center justify-center bg-base-300 w-full gap-4 mx-auto px-8">
                <Card
                    title="0-5% platform fee"
                    icon={<HandCoinsIcon className="w-20 h-20" />}
                >
                    <CanvasRevealEffect
                        animationSpeed={5.1}
                        containerClassName="bg-emerald-900"
                    />
                </Card>
                <Card
                    title="Streamlined Workflow"
                    icon={<LayersIcon className="w-20 h-20" />}
                >
                    <CanvasRevealEffect
                        animationSpeed={3}
                        containerClassName="bg-black"
                        colors={[
                            [236, 72, 153],
                            [232, 121, 249]
                        ]}
                        dotSize={2}
                    />
                    {/* Radial gradient for the cute fade */}
                    <div className="absolute inset-0 [mask-image:radial-gradient(400px_at_center,white,transparent)]" />
                </Card>
                <Card
                    title="In Built Messages"
                    icon={<MailIcon className="w-20 h-20" />}
                >
                    <CanvasRevealEffect
                        animationSpeed={3}
                        containerClassName="bg-sky-600"
                        colors={[[125, 211, 252]]}
                    />
                </Card>
            </div>
        </>
    )
}

const Card = ({
    title,
    icon,
    children
}: {
    title: string
    icon: React.ReactNode
    children?: React.ReactNode
}) => {
    const [hovered, setHovered] = React.useState(false)
    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="group/canvas-card bg-base-200 overflow-hidden rounded-xl flex items-center justify-center max-w-sm w-full mx-auto p-4 relative h-[30rem]"
        >
            <AnimatePresence>
                {hovered && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="h-full w-full absolute inset-0"
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="relative z-20">
                <div className="text-center group-hover/canvas-card:-translate-y-4 group-hover/canvas-card:opacity-0 transition duration-200 w-full  mx-auto flex items-center justify-center">
                    {icon}
                </div>
                <h2 className=" text-xl opacity-0 group-hover/canvas-card:opacity-100 relative z-10 text-base-content mt-4  font-bold group-hover/canvas-card:text-white group-hover/canvas-card:-translate-y-2 transition duration-200">
                    {title}
                </h2>
            </div>
        </div>
    )
}

export const Icon = ({ className, ...rest }: any) => {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            className={className}
            {...rest}
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
        </svg>
    )
}
