'use client'

import { useEffect, type RefObject } from 'react'
import { useAnimation, useInView, type Variant } from 'motion/react'

export function useAnimations(props: { ref: RefObject<Element | null> }) {
    const controls = useAnimation()
    const isInView = useInView(props.ref, { once: true })

    useEffect(() => {
        if (isInView) {
            void controls.start('visible')
        }
    }, [isInView, controls])

    const containerVariants: Record<string, Variant> = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                delayChildren: 0.3,
                staggerChildren: 0.2
            }
        }
    }

    const itemVariants: Record<string, Variant> = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1
        }
    }

    return { controls, containerVariants, itemVariants }
}
